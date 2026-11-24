import { expect, test } from 'bun:test';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const run = promisify(execFile);
const root = join(import.meta.dir, '..');
const cli = join(root, 'packages/tinyjs/bin/tinyjs.js');
const bootstrap = '/@tinyjs/devtools.js';

async function fixture<T>(check: (app: string) => Promise<T>) {
  const app = await mkdtemp(join(root, '.tinyjs-test-devtools-'));
  try {
    await cp(join(root, 'examples/devtools/app'), join(app, 'app'), { recursive: true });
    await writeFile(join(app, 'package.json'), '{"type":"module"}');
    return await check(app);
  } finally {
    await rm(app, { recursive: true, force: true });
  }
}

async function withServer(
  cwd: string,
  command: 'dev' | 'serve',
  flags: string[],
  check: (url: string) => Promise<void>,
) {
  const child = spawn(process.execPath, [cli, command, '--port', '0', ...flags], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  let logs = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Server startup timed out')), 15_000);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited with ${code}`)));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { logs = (logs + chunk).slice(-8192); });
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        logs = (logs + chunk).slice(-8192);
        const address = /TinyJS listening on http:\/\/(?:127\.0\.0\.1|0\.0\.0\.0):(\d+)\r?\n/.exec(logs);
        if (address) resolve(`http://127.0.0.1:${address[1]}`);
      });
    });
    clearTimeout(timer);
    await check(url);
  } catch (error) {
    throw new Error(`TinyJS ${command} check failed:\n${logs}`, { cause: error });
  } finally {
    clearTimeout(timer);
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
    await closed.catch(() => {});
  }
}

type Frame = {
  type: string;
  event?: string;
  data?: {
    version: number;
    events: { kind: string; data: Record<string, unknown> }[];
    snapshot?: { routes: { kind: string; file: string; pattern: string }[] };
  };
};

function captureFrames(page: Page) {
  const frames: Frame[] = [];
  const callbacks = new Set<() => void>();
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    try {
      const parsed = JSON.parse(payload.toString()) as Frame;
      if (parsed.event !== 'tinyjs:devtools:batch') return;
      frames.push(parsed);
      for (const callback of callbacks) callback();
    } catch { /* Vite can send frames outside the DevTools protocol. */ }
  }));
  async function waitFor(predicate: (frame: Frame) => boolean) {
    const existing = frames.find(predicate);
    if (existing) return existing;
    return new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => {
        callbacks.delete(check);
        reject(new Error('Timed out waiting for TinyJS DevTools telemetry'));
      }, 10_000);
      function check() {
        const found = frames.find(predicate);
        if (!found) return;
        clearTimeout(timer);
        callbacks.delete(check);
        resolve(found);
      }
      callbacks.add(check);
    });
  }
  return { frames, waitFor };
}

test('development dashboard receives real route, request and error telemetry through Vite', async () => {
  await fixture(async app => withServer(app, 'dev', [], async url => {
    const browser = await chromium.launch({ executablePath: process.env.TINYJS_CHROMIUM_PATH });
    try {
      const page = await browser.newPage();
      const { frames, waitFor } = captureFrames(page);
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Counter: 0' }).click();
      await page.getByRole('button', { name: 'Counter: 1' }).waitFor();
      await page.getByRole('button', { name: 'TinyJS DevTools', exact: true }).click();
      await page.getByRole('navigation', { name: 'TinyJS DevTools views' }).getByRole('button', { name: 'Routes', exact: true }).click();
      await page.getByRole('region', { name: 'TinyJS DevTools' }).waitFor({ timeout: 10_000 });
      await page.getByRole('heading', { name: 'Routes', exact: true }).waitFor();
      await page.keyboard.press('Alt+Shift+F');
      await page.getByRole('button', { name: 'Exit full screen', exact: true }).waitFor();

      const snapshot = await waitFor(frame => Boolean(frame.data?.snapshot?.routes.some(
        route => route.kind === 'api' && route.pattern === '/api/products/[slug]',
      )));
      expect(snapshot.data?.version).toBe(1);
      expect(snapshot.data?.snapshot?.routes.some(route => route.file.endsWith('/products/[slug]/page.tsx'))).toBe(true);
      await waitFor(frame => frame.data?.events.some(item =>
        item.kind === 'component' && item.data.name === 'Hydration',
      ) === true);

      const markers = {
        query: 'tinyjs-test-secret-query',
        authorization: 'tinyjs-test-secret-auth',
        cookie: 'tinyjs-test-secret-cookie',
      };
      const responseStatus = await page.evaluate(async ({ query, authorization, cookie }) => {
        document.cookie = `tinyjs-test-session=${cookie}; SameSite=Strict`;
        const response = await fetch(`/api/products/field-notes?token=${query}`, {
          headers: { Authorization: `Bearer ${authorization}` },
        });
        await response.text();
        return response.status;
      }, markers);
      expect(responseStatus).toBe(200);
      await waitFor(frame => frame.data?.events.some(item =>
        item.kind === 'request' && item.data.status === 200
        && typeof item.data.size === 'number' && item.data.size > 0
        && JSON.stringify(item.data).includes('/api/products/field-notes'),
      ) === true);

      expect(await page.evaluate(async () => (await fetch('/api/products/failure')).status)).toBe(500);
      await waitFor(frame => frame.data?.events.some(item =>
        item.kind === 'error' && JSON.stringify(item.data).includes('Example API error'),
      ) === true);

      const wire = JSON.stringify(frames);
      for (const marker of Object.values(markers)) expect(wire).not.toContain(marker);
    } finally {
      await browser.close();
    }
  }));
}, 40_000);

test('CLI and configuration can completely disable DevTools', async () => {
  await fixture(async app => {
    async function assertDisabled(url: string) {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain(bootstrap);
      expect((await fetch(url + bootstrap)).ok).toBe(false);
    }

    await withServer(app, 'dev', ['--no-devtools'], assertDisabled);
    await withServer(app, 'dev', ['--host', '0.0.0.0'], assertDisabled);
    await writeFile(join(app, 'tinyjs.config.json'), JSON.stringify({ devtools: { enabled: false } }));
    await withServer(app, 'dev', [], assertDisabled);
  });
}, 40_000);

async function buildHashes(cwd: string) {
  const output = join(cwd, '.tinyjs');
  const files: string[] = ['build.json'];
  for (const directory of ['client', 'server']) {
    for (const entry of await readdir(join(output, directory), { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
    }
  }
  return Promise.all(files.sort().map(async file => {
    const data = await readFile(file === 'build.json' ? join(output, file) : file);
    expect(data.toString()).not.toMatch(/\/@tinyjs\/devtools|tinyjs:devtools|TINYJS_DEVTOOLS/);
    return createHash('sha256').update(data).digest('hex');
  }));
}

test('DevTools preserves and reports configured root API mounts', async () => {
  await fixture(async app => {
    await writeFile(join(app, 'tinyjs.config.json'), JSON.stringify({ rootApiRoutes: true }));
    await withServer(app, 'dev', [], async url => {
      const browser = await chromium.launch({ executablePath: process.env.TINYJS_CHROMIUM_PATH });
      try {
        const page = await browser.newPage();
        const { waitFor } = captureFrames(page);
        await page.goto(url);
        await waitFor(frame => frame.data?.snapshot?.routes.some(route =>
          route.kind === 'api' && route.pattern === '/products/[slug]' &&
          route.file === '/app/api/products/[slug]/route.ts',
        ) === true);
        const response = await fetch(url + '/products/field-notes');
        expect(response.headers.get('content-type')).toContain('application/json');
        const frame = await waitFor(frame => frame.data?.events.some(event =>
          event.kind === 'request' && event.data.file === '/app/api/products/[slug]/route.ts' && event.data.status === 200,
        ) === true);
        expect(frame.data?.version).toBe(1);
      } finally {
        await browser.close();
      }
    });
  });
}, 40_000);

test('production builds and endpoints exclude DevTools for either setting', async () => {
  await fixture(async app => {
    await run(process.execPath, [cli, 'build'], { cwd: app, timeout: 30_000 });
    const defaults = await buildHashes(app);
    await writeFile(join(app, 'tinyjs.config.json'), JSON.stringify({ devtools: { enabled: false } }));
    await run(process.execPath, [cli, 'build'], { cwd: app, timeout: 30_000 });
    expect(await buildHashes(app)).toEqual(defaults);
    await run(process.execPath, [cli, 'build', '--analyze'], { cwd: app, timeout: 30_000 });
    expect(await buildHashes(app)).toEqual(defaults);
    const analysis = JSON.parse(await readFile(join(app, '.tinyjs/devtools-build.json'), 'utf8'));
    expect(analysis.moduleSizeUnit).toContain('Rolldown');
    expect(analysis.modules.length).toBeGreaterThan(0);
    expect(analysis.chunks.every((chunk: { raw: number; gzip: number }) => chunk.raw > 0 && chunk.gzip > 0)).toBe(true);
    await withServer(app, 'serve', [], async url => {
      expect(await (await fetch(url)).text()).not.toContain(bootstrap);
      for (const path of [bootstrap, '/@vite/client', '/_tinyjs/devtools']) {
        expect((await fetch(url + path)).status).toBe(404);
      }
    });
    await writeFile(join(app, 'tinyjs.config.json'), JSON.stringify({ sourcemap: 'hidden' }));
    await run(process.execPath, [cli, 'build'], { cwd: app, timeout: 30_000 });
    const maps = await readdir(join(app, '.tinyjs/client/assets'));
    expect(maps.some(file => file.endsWith('.js.map'))).toBe(true);
    await buildHashes(app);
  });
}, 60_000);
