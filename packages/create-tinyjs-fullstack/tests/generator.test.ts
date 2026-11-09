import { deepEqual, equal, rejects } from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaults } from '../src/config.js';
import { generateProject } from '../src/generator.js';

test('generates the recommended Web app and unified validation configuration', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'tinyjs generator '));
  try {
    const root = await generateProject(defaults, parent);
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    deepEqual(manifest.scripts, { dev: 'tinyjs dev', build: 'tinyjs build', test: 'tinyjs test' });
    equal(manifest.dependencies['tinyjs-fullstack'], '0.1.0');
    equal(await readFile(join(root, 'src/app/theme.css'), 'utf8'), "@import 'tailwindcss';\n");
    deepEqual(JSON.parse(await readFile(join(root, 'tinyjs.test.json'), 'utf8')), {
      unit: 'tinyjs', types: 'tsc', lint: 'oxlint', format: 'oxfmt',
    });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('generates a root JavaScript full-stack app with one Biome installation', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'tinyjs generator '));
  try {
    const root = await generateProject({
      ...defaults, template: 'fullstack', typescript: false, strict: false, src: false, alias: '~app/*',
      styling: 'modules', api: true, linter: 'biome', formatter: 'biome', unit: 'vitest', e2e: true,
      exampleTests: false, packageManager: 'npm', hooks: true, ci: true,
    }, parent, 'file:C:/tinyjs tests/framework.tgz');
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    equal(manifest.dependencies['tinyjs-fullstack'], 'file:C:/tinyjs tests/framework.tgz');
    deepEqual(Object.keys(manifest.devDependencies).sort(), ['@biomejs/biome', '@playwright/test', 'vitest']);
    equal((await readFile(join(root, 'app/page.jsx'), 'utf8')).includes("'~app/app/site'"), true);
    equal((await readFile(join(root, 'app/api/hello/route.js'), 'utf8')).includes('Response.json'), true);
    equal((await readFile(join(root, 'playwright.config.js'), 'utf8')).includes('npm run dev -- --port 4173'), true);
    equal((await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).includes('npm run test'), true);
    await rejects(readFile(join(root, 'tests/site.test.js')), { code: 'ENOENT' });
    const tailwind = await generateProject({ ...defaults, name: 'biome-tailwind', formatter: 'biome' }, parent);
    equal(await readFile(join(tailwind, 'src/app/theme.css'), 'utf8'), '@import "tailwindcss";\n');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('rejects unsafe names and preserves existing projects', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'tinyjs generator '));
  try {
    const root = join(parent, defaults.name);
    await mkdir(root);
    await writeFile(join(root, 'package.json'), 'existing file');
    await rejects(generateProject(defaults, parent), /Destination already exists/);
    await rejects(generateProject({ ...defaults, name: '../escaped' }, parent), /lowercase/);
    equal(await readFile(join(root, 'package.json'), 'utf8'), 'existing file');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
