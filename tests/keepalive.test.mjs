import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { Agent, request } from 'node:http';
import { connect } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'packages/tinyjs/bin/tinyjs.js');
const diagnostic = process.env.TINYJS_KEEPALIVE_DIAGNOSTIC === '1';
let cwd;

before(async () => {
  cwd = await mkdtemp(join(root, '.tinyjs-test-keepalive-'));
  await mkdir(join(cwd, 'app/api/echo'), { recursive: true });
  await writeFile(join(cwd, 'package.json'), '{"type":"module"}');
  await writeFile(join(cwd, 'app/api/echo/route.ts'), `
    let writes = 0, active = 0;
    export function GET() { return Response.json({ writes, active, usage: process.resourceUsage() }); }
    export async function POST(request: Request) {
      active++;
      try {
        const body = await request.text();
        return Response.json({ body, write: ++writes }, { status: 201 });
      } finally { active--; }
    }
  `);
  await promisify(execFile)('bun', [cli, 'build'], { cwd, timeout: 30_000 });
});
after(async () => { if (cwd) await rm(cwd, { recursive: true, force: true }); });

function send(url, agent, method = 'GET', body = '') {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const req = request(url + '/api/echo', {
      agent, method, headers: method === 'POST' ? { 'Content-Length': Buffer.byteLength(body) } : {},
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try {
          assert.ok(res.complete, 'incomplete HTTP response');
          assert.equal(res.statusCode, method === 'POST' ? 201 : 200);
          const data = JSON.parse(text);
          if (method === 'POST') assert.equal(data.body, body);
          resolve({ socket: req.socket, data, ms: performance.now() - started });
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end(method === 'POST' ? body : undefined);
  });
}

for (const runtime of ['node', 'bun']) test(`${runtime}: production keep-alive, concurrent POSTs and disconnects`, { timeout: 75_000 }, async () => {
  const child = spawn(runtime, [cli, 'serve', '--port', '0'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const agents = Array.from({ length: 8 }, () => new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 }));
  let logs = '', timer;
  try {
    const url = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`server startup timed out: ${logs}`)), 15_000);
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`server exited ${code}: ${logs}`)));
      child.stderr.on('data', chunk => { logs += chunk; });
      child.stdout.on('data', chunk => {
        logs += chunk;
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(logs);
        if (match) resolve(match[0]);
      });
    });
    clearTimeout(timer);
    const initial = await send(url, agents[0]);
    const usageBefore = initial.data.usage;
    const sockets = new Map();
    const latencies = [];
    let failed = 0, reconnected = 0;
    const started = performance.now();
    // Three idle gaps exceed both Node's default and Bun's suspected ten-second timeout.
    for (let round = 0; round < 4; round++) {
      if (round) await delay(11_000);
      await Promise.all(agents.map(async (agent, index) => {
        for (const method of ['GET', 'POST', 'POST']) {
          try {
            const result = await send(url, agent, method, `${round}:${index}:` + 'x'.repeat(4096));
            if (sockets.has(agent) && sockets.get(agent) !== result.socket) reconnected++;
            sockets.set(agent, result.socket);
            latencies.push(result.ms);
          } catch (error) { failed++; console.error(error); }
        }
      }));
    }
    const final = await send(url, agents[0]);
    assert.equal(final.data.writes, 64, 'every POST must be applied exactly once');
    const seconds = (performance.now() - started) / 1000;
    latencies.sort((a, b) => a - b);
    const usage = final.data.usage;
    console.log(JSON.stringify({ runtime, requests: latencies.length, failed, reconnected,
      errorPercent: failed / (latencies.length + failed) * 100,
      p95ms: latencies[Math.ceil(latencies.length * .95) - 1],
      p99ms: latencies[Math.ceil(latencies.length * .99) - 1], rps: latencies.length / seconds,
      cpuPercent: (usage.userCPUTime + usage.systemCPUTime - usageBefore.userCPUTime - usageBefore.systemCPUTime) / (seconds * 10_000),
      peakRssKiB: usage.maxRSS }));
    assert.equal(failed, 0);
    if (!diagnostic) assert.equal(reconnected, 0, 'server closed idle sockets before 11 seconds');

    // Explicit client closure still works, and an incomplete upload must not poison other clients.
    const closed = await send(url, false);
    const socket = closed.socket;
    if (!socket.destroyed) await once(socket, 'close');
    const address = new URL(url);
    const disconnected = connect(Number(address.port), address.hostname);
    disconnected.on('error', () => {});
    await once(disconnected, 'connect');
    disconnected.write('POST /api/echo HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100000\r\n\r\npartial');
    async function waitForActive(expected) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await send(url, agents[0])).data.active === expected) return;
        await delay(10);
      }
      assert.fail(`expected ${expected} active uploads`);
    }
    try { await waitForActive(1); } finally { disconnected.destroy(); }
    await waitForActive(0);
    assert.equal((await send(url, agents[0])).data.writes, 64);
    assert.equal((await send(url, agents[0], 'POST', 'after disconnect')).data.write, 65);
  } finally {
    clearTimeout(timer);
    for (const agent of agents) agent.destroy();
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'close');
      child.kill();
      await stopped;
    }
  }
});
