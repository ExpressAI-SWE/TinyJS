import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { discover, excluded, runCheck, runTests } from './testing.js';

const choices = {
  unit: ['tinyjs', 'vitest', 'bun'],
  e2e: ['playwright'],
  lint: ['oxlint', 'eslint', 'biome'],
  types: ['tsc'],
  format: ['oxfmt', 'prettier', 'biome'],
} as const;
type Check = keyof typeof choices;
type Configuration = { [K in Check]?: (typeof choices)[K][number] };
const checks = Object.keys(choices) as Check[];

async function readConfiguration(root: string): Promise<Configuration | undefined> {
  const file = await readFile(join(root, 'tinyjs.test.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (file === undefined) return;
  let data: unknown;
  try {
    data = JSON.parse(file);
  } catch {
    throw new Error('tinyjs.test.json must contain valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('tinyjs.test.json must be an object.');
  for (const [key, tool] of Object.entries(data)) {
    if (!checks.includes(key as Check)) throw new Error(`Unknown validation check "${key}" in tinyjs.test.json.`);
    const supported: readonly string[] = choices[key as Check];
    if (!supported.includes(tool)) {
      throw new Error(`Invalid ${key} check in tinyjs.test.json. Use ${supported.join(', ')} or omit the key to disable it.`);
    }
  }
  return data;
}

const packageNames: Record<string, string> = {
  biome: '@biomejs/biome',
  playwright: '@playwright/test',
  tsc: 'typescript',
};

async function runTool(root: string, tool: string, args: string[]): Promise<number> {
  const packageName = packageNames[tool] ?? tool;
  const require = createRequire(join(resolve(root), 'package.json'));
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${packageName}/package.json`);
  } catch {
    throw new Error(`Missing ${packageName}. Install it as a project devDependency to run ${tool}.`);
  }
  const { bin } = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entry = typeof bin === 'string' ? bin : bin?.[tool];
  if (typeof entry !== 'string') throw new Error(`${packageName} does not provide the ${tool} executable.`);
  return runCheck(root, process.execPath, [resolve(dirname(manifestPath), entry), ...args]);
}

async function execute(
  root: string, check: Check, tool: string, watch: boolean, fix: boolean, configured: boolean,
): Promise<number | undefined> {
  if (tool === 'tinyjs' || tool === 'bun') {
    const files = await discover(root);
    if (!files.length && configured) return;
    if (tool === 'tinyjs') return runTests(root, files, watch, configured);
    const executable = process.versions.bun ? process.execPath : 'bun';
    return runCheck(root, executable, ['test', ...(watch ? ['--watch'] : []), ...files]).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw new Error('Bun Test requires Bun on PATH.');
      throw error;
    });
  }
  if (tool === 'vitest') {
    return runTool(root, tool, [
      watch ? 'watch' : 'run', '--passWithNoTests', '--no-cache',
      ...[...excluded].flatMap((directory) => ['--exclude', `**/${directory}/**`]),
    ]);
  }
  if (tool === 'playwright') {
    const output = await mkdtemp(join(tmpdir(), 'tinyjs-e2e-'));
    try {
      return await runTool(root, tool, ['test', '--pass-with-no-tests', '--reporter=line', '--output', output]);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  }
  if (tool === 'tsc') return runTool(root, tool, ['--noEmit', '--incremental', 'false']);
  if (tool === 'biome') return runTool(root, tool, [check, ...(fix ? ['--write'] : []), '.']);
  if (check === 'lint') return runTool(root, tool, [...(fix ? ['--fix'] : []), '.']);
  return runTool(root, tool, [fix ? '--write' : '--check', '.']);
}

export async function validateProject(root: string, selected: Check[], watch = false, fix = false): Promise<number> {
  if (process.env.TINYJS_VALIDATING_ROOT === root) throw new Error('A validation check cannot run tinyjs test recursively.');
  if (watch && (fix || selected.some((check) => check !== 'unit'))) {
    throw new Error('--watch runs unit tests only and cannot be combined with --fix.');
  }
  const configuration = await readConfiguration(root);
  if (!configuration && !selected.length && !watch && !fix) {
    return runTests(root, await discover(root), false, false);
  }
  const configured = configuration ?? { unit: 'tinyjs' };
  const requested = watch ? ['unit'] : selected.length ? selected : checks;
  const order = fix ? (['lint', 'format', 'unit', 'e2e', 'types'] as const) : checks;
  const results = { passed: 0, failed: 0, skipped: 0 };
  for (const check of order) {
    const tool = configured[check];
    if (!requested.includes(check) || !tool) {
      console.log(`${check}: skipped (${tool ? 'not selected' : 'disabled'})`);
      results.skipped++;
      continue;
    }
    console.log(`Running ${check} (${tool})`);
    try {
      const code = await execute(root, check, tool, watch, fix, Boolean(configuration));
      if (code === undefined) {
        console.log(`${check}: skipped (no test files)`);
        results.skipped++;
      } else if (code === 0) {
        console.log(`${check}: passed`);
        results.passed++;
      } else {
        console.error(`${check}: failed (exit ${code})`);
        results.failed++;
      }
    } catch (error) {
      console.error(`${check}: failed. ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }
  }
  console.log(`Validation: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped.`);
  return results.failed > 0 ? 1 : 0;
}
