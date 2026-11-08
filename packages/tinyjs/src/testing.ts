import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Find supported test files while skipping generated and dependency directories.
const testFile = /(?:\.test|_test|\.spec|_spec)\.(?:[cm]?[jt]s|[jt]sx)$/;
const excluded = new Set(['node_modules', 'dist', 'build', 'coverage']);

async function discover(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await discover(path));
    else if (entry.isFile() && testFile.test(entry.name)) files.push(path);
  }
  return files.sort();
}

// Run discovered tests with Bun or Node and return an exit code to the CLI.
export async function runTests(root: string): Promise<number> {
  const files = await discover(root);
  if (!files.length) throw new Error('No tests found. Add a *.test.ts or *.test.js file (see docs/testing.md).');
  const bun = Boolean(process.versions.bun);
  const args = bun ? ['test', ...files] : ['--test', '--test-reporter=spec'];
  // Node needs the project-local tsx loader to run TypeScript and JSX tests.
  if (!bun && files.some(file => /\.(?:[cm]?ts|[jt]sx)$/.test(file))) {
    try {
      const require = createRequire(join(resolve(root), 'package.json'));
      args.push('--import', pathToFileURL(require.resolve('tsx')).href);
    } catch {
      throw new Error('TypeScript tests on Node require tsx. Install it as a project devDependency: npm install --save-dev tsx. Or run the TinyJS CLI with Bun.');
    }
  }
  if (!bun) args.push(...files);
  const reportDirectory = bun ? await mkdtemp(join(tmpdir(), 'tinyjs-test-')) : undefined;
  const report = reportDirectory && join(reportDirectory, 'results.xml');
  if (report) args.push('--reporter=junit', `--reporter-outfile=${report}`);
  try {
    const code = await new Promise<number>((resolveExit, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' },
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (signal) console.error(`Test runner terminated by ${signal}.`);
        resolveExit(code ?? 1);
      });
    });
    // Bun writes a JUnit report; use its totals to print a concise summary.
    if (report) {
      const xml = await readFile(report, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (code !== 0 && error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (xml === undefined) {
        console.error('Test runner failed before writing its complete summary. See test diagnostics above.');
        return code;
      }
      const totals = /<testsuites\s[^>]*>/.exec(xml)?.[0] ?? '';
      const count = (name: string) => {
        const value = new RegExp(`\\b${name}="(\\d+)"`).exec(totals);
        if (!value) throw new Error('Test runner did not produce a valid summary.');
        return Number(value[1]);
      };
      const failed = count('failures');
      const skipped = count('skipped');
      console.log(`Tests: ${count('tests') - failed - skipped} passed, ${failed} failed, ${skipped} skipped.`);
      return code || (failed > 0 ? 1 : 0);
    }
    return code;
  } finally {
    // Remove the temporary report even if the runner or summary fails.
    if (reportDirectory) await rm(reportDirectory, { recursive: true, force: true });
  }
}
