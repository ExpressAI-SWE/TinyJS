// These browser tests build and visit the basic example to check the playground as a user sees it.
import { beforeAll, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const root = join(import.meta.dir, '..');
const cwd = join(root, 'examples/basic');
const bin = join(root, 'packages/tinyjs/bin/tinyjs.js');

beforeAll(async () => {
  const build = Bun.spawn([process.execPath, 'run', 'build'], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([build.exited, new Response(build.stdout).text(), new Response(build.stderr).text()]);
  if (code !== 0) throw new Error(`Playground build failed:\n${stdout}\n${stderr}`);
}, 30_000);

test.each(['dev', 'serve'] as const)('playground works in %s with real routes and game cleanup', async command => {
  const child = spawn('node', [bin, command, '--port', '0'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Server timeout: ${logs}`)), 15_000);
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited ${code}: ${logs}`)));
      child.stderr.on('data', data => { logs += data; });
      child.stdout.on('data', data => {
        logs += data;
        const match = logs.match(/TinyJS listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) resolve(match[1]);
      });
    });
    clearTimeout(timer);
    for (const path of ['/', '/docs', '/docs/routing', '/docs/games', '/games', '/lab', '/lab/items/routing?from=test']) {
      const response = await fetch(url + path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<main>');
    }
    expect(await (await fetch(url + '/api/hello')).json()).toEqual({ message: 'Hello from TinyJS' });
    browser = await chromium.launch({ executablePath: process.env.TINYJS_CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(url);
    await page.getByRole('button', { name: 'Count: 0' }).click();
    await page.getByRole('button', { name: 'Count: 1' }).waitFor();
    await page.getByRole('link', { name: 'Docs', exact: true }).click();
    await page.getByRole('heading', { name: 'A tiny starting point' }).waitFor();
    await page.getByRole('button', { name: 'Count: 0' }).click();
    await page.getByRole('button', { name: 'Count: 1' }).waitFor();
    expect(requests.some(url => /three\.module|\/three\/build\//.test(url))).toBe(false);
    await page.getByRole('link', { name: 'Web lab', exact: true }).click();
    await page.getByRole('button', { name: 'Fetch /api/hello' }).click();
    await page.getByText('HTTP 200', { exact: false }).waitFor();
    await page.getByLabel('Find an example').fill('terrain');
    expect(await page.locator('.results li').count()).toBe(1);
    await page.getByRole('link', { name: 'Infinite terrain', exact: true }).click();
    await page.getByRole('heading', { name: 'Infinite terrain' }).waitFor();
    expect(await page.locator('pre').textContent()).toContain('"id": "terrain"');
    await page.getByRole('link', { name: 'Arcade', exact: true }).click();
    expect(await page.locator('canvas').count()).toBe(0);
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('button')?.disabled === false && document.querySelector('[role=status]')?.textContent?.includes('Scene running.'));
    expect(await page.locator('canvas').count()).toBe(1);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    expect(box.width).toBeGreaterThan(0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + box.height / 3);
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('Crystals: 1 / 8'));
    await page.mouse.up();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    const previousCanvas = await page.locator('canvas').elementHandle();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await previousCanvas!.waitForElementState('hidden');
    await page.locator('canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('Scene running.'));
    expect(await page.locator('canvas').count()).toBe(1);
    await page.getByLabel('Choose a game').selectOption('terrain');
    expect(await page.locator('canvas').count()).toBe(0);
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('Scene running.'));
    expect(await page.locator('canvas').count()).toBe(1);
    await page.getByRole('link', { name: 'Web lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Small experiments. Real behavior.' }).waitFor();
    expect(await page.locator('canvas').count()).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    clearTimeout(timer);
    await browser?.close();
    if (child.exitCode === null) { const closed = once(child, 'exit'); child.kill(); await closed; }
  }
}, 60_000);
