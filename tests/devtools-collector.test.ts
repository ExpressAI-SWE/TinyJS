import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DevCollector, RingBuffer } from '../packages/tinyjs/src/devtools/collector.ts';
import { createDevTools } from '../packages/tinyjs/src/devtools/plugin.ts';
import type { DevBatch } from '../packages/tinyjs/src/devtools/protocol.ts';
import { batchChannel, commandChannel, parseCommand } from '../packages/tinyjs/src/devtools/protocol.ts';
import { createRedactor, isLocalRequest, safeHeaders, safeUrl, sourceLocation } from '../packages/tinyjs/src/devtools/security.ts';

test('the ring retains and reads only the most recent capacity', () => {
  expect(() => new RingBuffer(0)).toThrow();
  const buffer = new RingBuffer<number>(3);
  for (const value of [1, 2, 3, 4, 5]) buffer.push(value);
  expect(buffer.first()).toBe(3);
  expect(buffer.read()).toEqual([3, 4, 5]);
  expect(buffer.read(1, 1)).toEqual([4]);
  buffer.clear();
  expect(buffer.read()).toEqual([]);
  buffer.push(6);
  expect(buffer.first()).toBe(6);
});

test('collector keeps process counters and bounded sequential events', () => {
  const collector = new DevCollector({ devtools: { maxEvents: 2 } }, [], 'fixture');
  collector.requestStarted();
  expect(collector.snapshot().server.activeRequests).toBe(1);
  collector.requestFinished({ route: '/example', rendering: 'ssr', duration: 12 });
  collector.record('error', { type: 'SSR', message: 'test failure' });
  collector.record('error', { type: 'SSR', message: 'test failure' });
  const snapshot = collector.snapshot();
  expect(snapshot.overview).toMatchObject({ requests: 1, errors: 2, rendering: 'ssr' });
  expect(snapshot.server).toMatchObject({ activeRequests: 0, latency: 12 });
  expect(collector.oldestId).toBe(2);
  expect(collector.read(2, 2).map(({ id, data }) => [id, data.occurrences])).toEqual([[2, 1], [3, 2]]);
  collector.clear();
  expect(collector.read(1, 10)).toEqual([]);
  expect(collector.snapshot().overview.requests).toBe(1);
});

test('validates protocol versions, browser values and command limits', () => {
  expect(parseCommand({ version: 2, type: 'subscribe' })).toBeUndefined();
  expect(parseCommand({ version: 1, type: 'profile', enabled: 'true' })).toBeUndefined();
  expect(parseCommand({ version: 1, type: 'source', file: 'app/page.tsx', line: -1 })).toBeUndefined();
  expect(parseCommand({ version: 1, type: 'client', events: new Array(21).fill({ kind: 'timing', data: {} }) })).toBeUndefined();
  expect(parseCommand({ version: 1, type: 'client', events: [{ kind: 'request', data: {} }] })).toBeUndefined();
  expect(parseCommand({ version: 1, type: 'client', events: [{ kind: 'timing', data: { name: 'Asset loading', duration: 3, payload: 'discarded' } }] }))
    .toEqual({ version: 1, type: 'client', events: [{ kind: 'timing', data: { name: 'Asset loading', duration: 3 } }] });
});

test('redacts credential fields, arbitrary headers, environment values and URL search', () => {
  const redact = createRedactor({ EXAMPLE: 'local-valuable-value', API_TOKEN: 'foo' });
  expect(redact.text('api_key=my-secret local-valuable-value foo https://user:pass@example.test/path?token=query'))
    .toBe('api_key=[redacted] [redacted] [redacted] https://example.test/path');
  expect(redact.data({ props: { token: 'private', setting: true, value: 'local-valuable-value' } }))
    .toEqual({ props: { token: '[redacted]', setting: true, value: '[redacted]' } });
  expect({ ...safeHeaders({ authorization: 'secret', 'x-private': 'secret', accept: 'text/html', cookie: 'secret' }) })
    .toEqual({ authorization: '[redacted]', accept: 'text/html', cookie: '[redacted]' });
  expect(safeUrl('/files/c15bfd34-02e9-4aef-aa3f-c4b23831059d?token=secret')).toBe('/files/[redacted]');
});

test('extracts app-relative source locations from mapped server and browser frames', () => {
  const location = sourceLocation({
    stack: 'Error: fixture\n    at Component (C:/Repos/with spaces/src/app/nested/component.tsx:14:9)',
    file: '/src/app/nested/page.tsx',
  }, 'C:/Repos/with spaces', 'src/app');
  expect(location).toEqual({ sourceFile: '/src/app/nested/component.tsx', line: 14, column: 9 });
  expect(sourceLocation({ file: 'http://localhost:3000/app/page.tsx?t=1', line: 5 }, undefined, 'app'))
    .toMatchObject({ sourceFile: '/app/page.tsx', line: 5 });
  expect(sourceLocation({ file: '/app/../private.ts' }, undefined, 'app')).toBeUndefined();
});

test('requires actual loopback and exact same-origin headers for WebSocket clients', () => {
  function incoming(remoteAddress: string, headers: Record<string, string>) {
    return { socket: { remoteAddress }, headers } as IncomingMessage;
  }
  expect(isLocalRequest(incoming('127.0.0.1', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }), true)).toBe(true);
  expect(isLocalRequest(incoming('::1', { host: '[::1]:3000', origin: 'http://[::1]:3000' }), true)).toBe(true);
  expect(isLocalRequest(incoming('127.0.0.1', { host: 'localhost:3000', origin: 'http://localhost:3001' }), true)).toBe(false);
  expect(isLocalRequest(incoming('127.0.0.1', { host: 'alternate.test', origin: 'http://alternate.test' }), true)).toBe(false);
  expect(isLocalRequest(incoming('192.0.2.5', { host: 'localhost:3000', origin: 'http://localhost:3000' }), true)).toBe(false);
  expect(isLocalRequest(incoming('127.0.0.1', { host: 'localhost:3000', origin: 'http://localhost:3000', forwarded: 'for=192.0.2.5' }), true)).toBe(false);
  expect(isLocalRequest(incoming('127.0.0.1', { host: 'localhost:3000' }), true)).toBe(false);
  expect(isLocalRequest(incoming('127.0.0.1', { host: 'localhost:3000' }))).toBe(true);
});

test('WebSocket transport subscribes locally, rejects other origins, and replays after reconnect', async () => {
  const require = createRequire(new URL('../packages/tinyjs/package.json', import.meta.url));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href) as typeof import('vite');
  const root = await mkdtemp(join(tmpdir(), 'tinyjs-collector-'));
  await mkdir(join(root, 'app'));
  await writeFile(join(root, 'app', 'page.tsx'), 'export const token = "hidden credential";\n');
  await writeFile(join(root, 'private.ts'), 'outside permitted application files\n');
  const { plugin, collector } = createDevTools(root, {}, []);
  const vite = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    plugins: [plugin],
    server: { host: '127.0.0.1', port: 0 },
  });
  const sockets = new Set<WebSocket>();
  try {
    collector.record('fixture', { message: 'collected for replay' });
    vite.ws.on('tinyjs:test:ping', (_, client) => client.send('tinyjs:test:pong', {}));
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Expected HTTP listening address');
    const localOrigin = 'http://127.0.0.1:' + address.port;
    const token = (vite.config as typeof vite.config & { webSocketToken: string }).webSocketToken;
    const endpoint = 'ws://127.0.0.1:' + address.port + '/?token=' + token;
    async function subscribe(origin: string, source?: string) {
      const socket = new WebSocket(endpoint, { protocols: ['vite-hmr'], headers: { Origin: origin } });
      sockets.add(socket);
      const messages = await new Promise<Array<{ event: string; data?: DevBatch }>>((resolve, reject) => {
        const received: Array<{ event: string; data?: DevBatch }> = [];
        socket.addEventListener('error', () => reject(new Error('WebSocket error')), { once: true });
        socket.addEventListener('open', () => {
          socket.send(JSON.stringify({ type: 'custom', event: commandChannel, data: { version: 1, type: 'subscribe' } }));
          if (source) socket.send(JSON.stringify({ type: 'custom', event: commandChannel, data: { version: 1, type: 'source', file: source, line: 1 } }));
          else socket.send(JSON.stringify({ type: 'custom', event: 'tinyjs:test:ping' }));
        }, { once: true });
        socket.addEventListener('message', (message) => {
          const payload = JSON.parse(String(message.data));
          received.push(payload);
          if (payload.event === 'tinyjs:test:pong' || (payload.event === batchChannel && payload.data?.source)) resolve(received);
        });
      });
      socket.close();
      sockets.delete(socket);
      return messages.find((message) => message.event === batchChannel && (!source || message.data?.source));
    }
    expect((await subscribe(localOrigin))?.data?.events?.some(({ kind }) => kind === 'fixture')).toBe(true);
    expect(await subscribe('http://localhost:' + address.port)).toBeUndefined();
    expect((await subscribe(localOrigin))?.data?.events?.some(({ kind }) => kind === 'fixture')).toBe(true);
    expect((await subscribe(localOrigin, '/app/page.tsx'))?.data?.source?.lines[0].text).toBe('export const token = [redacted];');
    expect((await subscribe(localOrigin, '/app/../private.ts'))?.data?.source?.lines).toEqual([]);
  } finally {
    for (const socket of sockets) socket.close();
    await vite.close();
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
