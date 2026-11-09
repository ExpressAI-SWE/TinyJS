import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const entry = join(import.meta.dir, '../src/cli.ts');

function run(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [entry, ...args], { cwd, encoding: 'utf8' });
}

test('headless CLI generates a project, initializes Git and rejects existing paths', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tinyjs scaffold '));
  try {
    const help = run(cwd, '--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--yes');
    expect(run(cwd, 'headless').stderr).toContain('Pass --yes');

    const generated = run(cwd, 'demo', '--yes', '--no-install', '--hooks');
    expect(generated.status).toBe(0);
    const root = join(cwd, 'demo');
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(manifest.scripts).toMatchObject({ dev: 'tinyjs dev', build: 'tinyjs build', test: 'tinyjs test' });
    const git = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' });
    expect(git.status).toBe(0);
    expect(git.stdout.trim()).toBe('.githooks');

    const original = 'preserve my work';
    await mkdir(join(cwd, 'occupied'));
    await writeFile(join(cwd, 'occupied', 'notes.txt'), original);
    const conflict = run(cwd, 'occupied', '--yes', '--no-install');
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toContain('already exists');
    expect(await readFile(join(cwd, 'occupied', 'notes.txt'), 'utf8')).toBe(original);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}, 30_000);

test.each([0, 23])('installation exit %d controls whether the CLI starts dev', async (status) => {
  const cwd = await mkdtemp(join(tmpdir(), 'tinyjs setup '));
  try {
    const windows = process.platform === 'win32';
    await writeFile(join(cwd, windows ? 'pnpm.cmd' : 'pnpm'), windows
      ? `@echo off\r\necho pnpm %*\r\nexit /b ${status}\r\n`
      : `#!/bin/sh\necho "pnpm $*"\nexit ${status}\n`, { mode: 0o755 });
    const result = spawnSync(process.execPath, [
      entry, 'demo', '--yes', '--no-git', '--package-manager', 'pnpm', '--start',
    ], {
      cwd,
      env: { ...process.env, PATH: `${cwd}${delimiter}${process.env.PATH}` },
      encoding: 'utf8',
    });
    expect(result.stdout).toContain('pnpm install --ignore-workspace');
    if (status === 0) {
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/pnpm install --ignore-workspace\r?\npnpm run dev/);
    } else {
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain('pnpm run dev');
      expect(result.stderr).toContain('pnpm install --ignore-workspace failed (23)');
      expect(result.stderr).toContain('Project files are available');
    }
    expect(await readFile(join(cwd, 'demo', 'package.json'), 'utf8')).toContain('"name": "demo"');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}, 30_000);
