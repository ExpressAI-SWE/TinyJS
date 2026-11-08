// These tests run the TinyJS test command against temporary projects and check its output and exit status.
import { expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = join(import.meta.dir, '..');
const bin = join(root, 'packages/tinyjs/bin/tinyjs.js');
async function fixture(check: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join(root, '.tinyjs-test-cli-'));
  try {
    await writeFile(join(cwd, 'package.json'), '{"type":"module"}');
    await check(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

for (const runtime of ['node', process.execPath]) {
  test(`${runtime}: test discovers JS and TS, reports skips and propagates failures`, () => fixture(async cwd => {
    await mkdir(join(cwd, 'src'));
    await writeFile(join(cwd, 'src', 'math.spec.ts'), `import {test} from 'node:test'; import assert from 'node:assert/strict'; const answer: number = 42; test('typed',()=>assert.equal(answer,42));`);
    await writeFile(join(cwd, 'plain_test.js'), `import {test} from 'node:test'; test('plain',()=>{}); test.skip('explicit skip',()=>{});`);
    for (const directory of ['node_modules', 'dist', 'build', 'coverage', '.hidden']) {
      await mkdir(join(cwd, directory));
      await writeFile(join(cwd, directory, 'ignored.test.js'), `throw Error('excluded directory');`);
    }
    const result = await exec(runtime, [bin, 'test'], { cwd });
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/(?:pass(?:ed)?\s*[: ]\s*2|2 passed)/);
    expect(output).toMatch(/(?:skip(?:ped)?\s*[: ]\s*1|1 skipped)/);
    await writeFile(join(cwd, 'failure.test.js'), `import {test} from 'node:test'; test('failure',()=>{throw Error('regression marker')});`);
    try {
      await exec(runtime, [bin, 'test'], { cwd });
      throw Error('Expected a failing exit status');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stdout + error.stderr).toContain('regression marker');
    }
    await writeFile(join(cwd, 'failure.test.js'), `import 'tinyjs-missing-test-dependency';`);
    await expect(exec(runtime, [bin, 'test'], { cwd })).rejects.toMatchObject({ code: 1 });
    await writeFile(join(cwd, 'failure.test.js'), `import {test} from 'node:test'; import {chromium} from 'playwright-core'; test('browser prerequisite',async()=>{await chromium.launch({executablePath:'tinyjs-nonexistent-browser'});});`);
    await expect(exec(runtime, [bin, 'test'], { cwd })).rejects.toMatchObject({ code: 1 });
  }), 30000);
}

test('CLI exposes exactly four native commands and rejects server options for tests', async () => {
  const result = await exec('node', [bin, '--help']);
  expect(result.stdout).toContain('<dev | build | serve | test>');
  for (const command of ['start', 'test:unit', 'test:e2e', 'test:watch']) {
    await expect(exec('node', [bin, command])).rejects.toMatchObject({ code: 1 });
  }
  await expect(exec('node', [bin, 'test', '--port', '1234'])).rejects.toMatchObject({ code: 1 });
});

test('empty projects fail visibly', () => fixture(async cwd => {
  try {
    await exec('node', [bin, 'test'], { cwd });
    throw Error('Expected no-tests failure');
  } catch (error: any) {
    expect(error.code).toBe(1);
    expect(error.stderr).toContain('No tests found');
  }
}));

test('Node runs JavaScript without a loader and reports missing TypeScript prerequisites', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tinyjs-cli-'));
  try {
    await writeFile(join(cwd, 'plain.test.cjs'), `const {test}=require('node:test'); test('plain',()=>{});`);
    const result = await exec('node', [bin, 'test'], { cwd });
    expect(result.stdout).toMatch(/pass\s+1/);
    await writeFile(join(cwd, 'typed.test.ts'), `import {test} from 'node:test'; test('typed',()=>{});`);
    try {
      await exec('node', [bin, 'test'], { cwd });
      throw Error('Expected missing loader failure');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('TypeScript tests on Node require tsx');
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
