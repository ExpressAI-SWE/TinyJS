// These tests build and run example applications to check how TinyJS works across its server, build, and browser parts.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';

const run = promisify(execFile);
const root = join(import.meta.dir, '..');
const bin = join(root, 'packages/tinyjs/bin/tinyjs.js');
const marker = 'SERVER_ONLY_TEST_MARKER';
let browser: Browser;
let temporary: string;

beforeAll(async () => {
  temporary = await mkdtemp(join(root, '.tinyjs-test-'));
  browser = await chromium.launch({ executablePath: process.env.TINYJS_CHROMIUM_PATH });
}, 20_000);

afterAll(async () => {
  await browser?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

async function fixture(name: string) {
  const cwd = join(temporary, name);
  // Keep the shared-client budget independent of the growing playground.
  await mkdir(join(cwd, 'app'), { recursive: true });
  for (const path of ['about', 'api', 'counter.tsx']) {
    await cp(join(root, 'examples/basic/app', path), join(cwd, 'app', path), { recursive: true });
  }
  await writeFile(join(cwd, 'app/page.tsx'), `import Counter from './counter';
    export default function Home() { return <><h1>TinyJS</h1><Counter /></>; }`);
  await writeFile(join(cwd, 'package.json'), '{"type":"module"}');
  await mkdir(join(cwd, 'node_modules'));
  await symlink(join(root, 'packages/tinyjs'), join(cwd, 'node_modules/tinyjs'), 'junction');
  await mkdir(join(cwd, 'app/api/echo'));
  await writeFile(join(cwd, 'app/api/echo/route.ts'), `
    import { createHash } from 'node:crypto';
    export async function POST(request: Request) {
      const text = await request.text();
      const hash = createHash('sha256').update(text).digest('hex');
      return Response.json({ hash, marker: '${marker}' }, {
        status: 201,
        headers: [['Set-Cookie', 'first=1'], ['Set-Cookie', 'second=2']],
      });
    }
  `);
  await mkdir(join(cwd, 'app/api/fail'));
  await writeFile(join(cwd, 'app/api/fail/route.ts'), `export function GET() { throw new Error('${marker}'); }`);
  await writeFile(join(cwd, 'app/theme.css'), 'main { padding-left: 13px; }');
  const layout = join(cwd, 'app/layout.tsx');
  await writeFile(layout, `import './theme.css'; import type { ComponentChildren } from 'preact';
    export default function Layout({ children }: { children: ComponentChildren }) {
      return <><nav aria-label="Main navigation"><a href="/">Home</a>{' · '}<a href="/about">About</a></nav><main>{children}</main></>;
    }`);
  return cwd;
}

async function withServer(runtime: string, command: 'dev' | 'serve', cwd: string, check: (url: string) => Promise<void>) {
  const child = spawn(runtime, [bin, command, '--port', '0'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`TinyJS ${command} timed out:\n${logs}`)), 15_000);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`TinyJS ${command} exited with ${code}:\n${logs}`)));
      child.stderr.setEncoding('utf8').on('data', (chunk) => { logs += chunk; });
      child.stdout.setEncoding('utf8').on('data', (chunk) => {
        logs += chunk;
        const address = /TinyJS listening on (http:\/\/127\.0\.0\.1:\d+)\r?\n/.exec(logs);
        if (address) resolve(address[1]);
      });
    });
    clearTimeout(timer);
    await check(url);
    expect(logs).not.toContain('Failed to run dependency scan');
  } catch (error) {
    throw new Error(`TinyJS ${command} checks failed:\n${logs}`, { cause: error });
  } finally {
    clearTimeout(timer);
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
  }
}

async function checkApplication(url: string, command: 'dev' | 'serve', cwd: string) {
  const home = await fetch(url);
  expect(home.status).toBe(200);
  expect(await home.text()).toContain('<button type="button">Count: 0</button>');
  const about = await fetch(`${url}/about/?from=home`);
  expect(about.status).toBe(200);
  expect(await about.text()).toContain('<main><section aria-label="About TinyJS"><h1>About TinyJS</h1></section></main>');
  expect(await (await fetch(`${url}/api/hello`)).json()).toEqual({ message: 'Hello from TinyJS' });
  const head = await fetch(`${url}/api/hello`, { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  const post = await fetch(`${url}/api/echo`, { method: 'POST', body: 'hello' });
  expect(post.status).toBe(201);
  expect(post.headers.getSetCookie()).toEqual(['first=1', 'second=2']);
  expect(await post.json()).toEqual({ hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', marker });
  const notAllowed = await fetch(`${url}/about`, { method: 'POST' });
  expect(notAllowed.status).toBe(405);
  expect(notAllowed.headers.get('allow')).toBe('GET, HEAD');
  expect((await fetch(`${url}/missing`)).status).toBe(404);
  const failed = await fetch(`${url}/api/fail`);
  expect(failed.status).toBe(500);
  expect(await failed.text()).toBe('Internal Server Error');
  for (const path of ['/app/api/echo/route.ts', '/.tinyjs/server/server.mjs']) {
    const response = await fetch(url + path);
    expect(response.ok).toBe(false);
    expect(await response.text()).not.toContain(marker);
  }

  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(url);
    const source = await page.evaluate(async () => {
      const entry = Array.from(document.scripts).find((script) => script.type === 'module' && !script.src.endsWith('/@vite/client'))!;
      await import(entry.src);
      return entry.src;
    });
    expect(source).toContain(command === 'dev' ? '/@tinyjs/client' : '/_tinyjs/assets/client-');
    expect(await page.locator('main').evaluate((element) => getComputedStyle(element).paddingLeft)).toBe('13px');
    await page.getByRole('button', { name: 'Count: 0' }).click();
    await page.getByRole('button', { name: 'Count: 1' }).click();
    await page.getByRole('button', { name: 'Count: 2' }).waitFor();
    await page.getByRole('link', { name: 'About' }).click();
    await page.getByRole('heading', { name: 'About TinyJS' }).waitFor();
    if (command === 'dev') {
      await page.goto(url);
      await page.getByRole('button', { name: 'Count: 0' }).waitFor();
      const source = join(cwd, 'app/page.tsx');
      await writeFile(source, (await readFile(source, 'utf8')).replace('<h1>TinyJS</h1>', '<h1>Updated TinyJS</h1>'));
      await page.getByRole('heading', { name: 'Updated TinyJS' }).waitFor();
      await mkdir(join(cwd, 'app/added'));
      const discovered = page.waitForEvent('load');
      await writeFile(join(cwd, 'app/added/page.tsx'), 'export default function Page() { return <h1>Discovered route</h1>; }');
      await discovered;
      await page.goto(url + '/added');
      await page.getByRole('heading', { name: 'Discovered route' }).waitFor();
    }
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}

test.each([['Node', 'node'], ['Bun', process.execPath]])('%s serves dev and independent production bundles', async (name, runtime) => {
  const cwd = await fixture(name);
  const { stdout } = await run(runtime, [bin, 'build'], { cwd, timeout: 20_000 });
  expect(stdout).toMatch(/Shared client JS: [1-9]\d* bytes gzip \(goal: 3000 bytes\)/);
  const client = join(cwd, '.tinyjs/client/assets');
  const stats = JSON.parse(await readFile(join(cwd, '.tinyjs/stats.json'), 'utf8'));
  expect(stats.sharedGzip).toBeLessThan(6700);
  for (const asset of stats.assets) {
    const content = await readFile(join(cwd, '.tinyjs/client', asset.file));
    expect(asset.raw).toBe(content.byteLength);
  }
  const scripts = (await readdir(client)).filter((file) => file.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(1);
  for (const file of scripts) {
    expect(await readFile(join(client, file), 'utf8')).not.toMatch(/SERVER_ONLY_TEST_MARKER|node:crypto|\/@vite\/client/);
  }
  expect(await readFile(join(cwd, '.tinyjs/server/server.mjs'), 'utf8')).toContain(marker);
  await withServer(runtime, 'dev', cwd, (url) => checkApplication(url, 'dev', cwd));
  const standalone = join(temporary, `${name}-production`);
  await cp(join(cwd, '.tinyjs'), join(standalone, '.tinyjs'), { recursive: true });
  await withServer(runtime, 'serve', standalone, (url) => checkApplication(url, 'serve', standalone));
}, 60_000);

test('rejects API modules in the browser graph and leaves no runnable build', async () => {
  const cwd = await fixture('invalid-client');
  const home = join(cwd, 'app/page.tsx');
  await writeFile(home, `import './api/echo/route';\n${await readFile(home, 'utf8')}`);
  await expect(run('node', [bin, 'build'], { cwd, timeout: 15_000 })).rejects.toThrow(/Server module .* cannot be imported/);
  await expect(run('node', [bin, 'serve'], { cwd, timeout: 10_000 })).rejects.toThrow(/No completed TinyJS build/);
}, 30_000);

test.each(['tinyjs/ai', './private.server'])('rejects server-only import %s', async (module) => {
  const cwd = await fixture(module === 'tinyjs/ai' ? 'invalid-ai' : 'invalid-server');
  await writeFile(join(cwd, 'app/private.server.ts'), 'export const secret = "SERVER_ONLY_TEST_MARKER";');
  await writeFile(join(cwd, 'app/page.tsx'), `import '${module}'; export default function Page() { return <h1>Unsafe</h1>; }`);
  await expect(run('node', [bin, 'build'], { cwd, timeout: 20_000 })).rejects.toThrow(/Server module .* cannot be imported/);
}, 30_000);

test('enforces configured gzip budgets without publishing a completed build', async () => {
  const cwd = await fixture('budget');
  await writeFile(join(cwd, 'tinyjs.config.json'), JSON.stringify({ budgets: { sharedGzip: 1, fail: true } }));
  await expect(run('node', [bin, 'build'], { cwd, timeout: 20_000 })).rejects.toThrow(/performance budget exceeded/);
  await expect(readFile(join(cwd, '.tinyjs/build.json'))).rejects.toThrow();
  expect(JSON.parse(await readFile(join(cwd, '.tinyjs/stats.json'), 'utf8')).sharedGzip).toBeGreaterThan(1);
}, 30_000);

test('src JavaScript routes build with aliases and hydrate without exposing API source', async () => {
  const cwd = join(temporary, 'src JavaScript');
  await mkdir(join(cwd, 'src/app/api/hello'), { recursive: true });
  await writeFile(join(cwd, 'package.json'), '{"type":"module"}');
  await writeFile(join(cwd, 'tinyjs.config.json'), '{"appDir":"src/app","importAlias":"@site/*"}');
  await writeFile(join(cwd, 'src/title.js'), 'export const title = "JavaScript starter";');
  await writeFile(join(cwd, 'src/app/page.jsx'), `
    import { useState } from 'preact/hooks';
    import { title } from '@site/title';
    export default function Home() {
      const [count, setCount] = useState(0);
      return <><h1>{title}</h1><button onClick={() => setCount(count + 1)}>Count: {count}</button></>;
    }
  `);
  await writeFile(join(cwd, 'src/app/api/hello/route.js'), 'export const GET = () => Response.json({ ok: true });');
  await run('node', [bin, 'build'], { cwd });

  for (const command of ['dev', 'serve'] as const) {
    await withServer('node', command, cwd, async (url) => {
      expect(await (await fetch(url)).text()).toContain('<h1>JavaScript starter</h1>');
      expect(await (await fetch(url + '/api/hello')).json()).toEqual({ ok: true });
      expect((await fetch(url + '/src/app/api/hello/route.js')).ok).toBe(false);
      const page = await browser.newPage();
      try {
        await page.goto(url);
        await page.evaluate(async () => {
          const entry = [...document.scripts].find((script) => script.type === 'module' && !script.src.endsWith('/@vite/client'))!;
          await import(entry.src);
        });
        await page.getByRole('button', { name: 'Count: 0' }).click();
        await page.getByRole('button', { name: 'Count: 1' }).waitFor();
      } finally {
        await page.close();
      }
    });
  }
}, 30_000);
