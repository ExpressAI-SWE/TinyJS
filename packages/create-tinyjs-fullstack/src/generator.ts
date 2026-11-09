import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { validateConfig, type ProjectConfig } from './config.js';

const generated = ['.tinyjs', 'node_modules', 'dist', 'build', 'coverage', 'test-results', 'playwright-report'];
const ignored = [...generated.map((name) => `${name}/`), 'bun.lock', 'package-lock.json', 'pnpm-lock.yaml'];
const managerVersions = { bun: '1.4.4', npm: '11.6.2', pnpm: '10.20.0' };
const css = `.page {
  margin: 4rem auto;
  max-width: 36rem;
  padding: 0 1rem;
}
`;

function json(value: object): string {
  // Inline short string arrays to match the starter's formatters.
  return JSON.stringify(value, null, 2).replace(
    /\[\n(\s+"[^"\n]+"[,]?\n)+\s*\]/g,
    (array, _item, offset: number, source: string) => {
      const inline = array.replace(/\s*\n\s*/g, ' ').replace('[ ', '[').replace(' ]', ']');
      return offset - source.lastIndexOf('\n', offset) + inline.length <= 100 ? inline : array;
    },
  ) + '\n';
}

function projectFiles(config: ProjectConfig, frameworkSpec: string): Record<string, string> {
  const app = config.src ? 'src/app' : 'app';
  const base = config.src ? './src' : '.';
  const alias = config.alias.slice(0, -1);
  const script = config.typescript ? 'ts' : 'js';
  const jsx = config.typescript ? 'tsx' : 'jsx';
  const manager = config.packageManager;
  const run = `${manager} run`;
  const install = manager === 'pnpm' ? 'pnpm install --ignore-workspace' : `${manager} install`;
  const browserInstall = manager === 'bun' ? 'bunx playwright install' : manager === 'pnpm' ? 'pnpm exec playwright install' : 'npx --no-install playwright install';
  const files: Record<string, string> = {};
  const dependencies = { preact: '^10.28.0', 'tinyjs-fullstack': frameworkSpec };
  const devDependencies: Record<string, string> = {};
  const checks: Record<string, string> = { unit: config.unit };

  files['.gitignore'] = [...generated.map((name) => `${name}/`), '.env', '.env.*', '!.env.example', ''].join('\n');
  files['tinyjs.config.json'] = json({ appDir: app, importAlias: config.alias });
  const types = config.unit === 'bun' ? ['node', 'bun'] : ['node'];
  files['tsconfig.json'] = json({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      jsxImportSource: 'preact',
      strict: config.typescript && config.strict,
      ...(!config.typescript && { allowJs: true }),
      noEmit: true,
      skipLibCheck: true,
      types: config.typescript ? types : [],
      paths: { [config.alias]: [`${base}/*`] },
    },
    include: [app, 'tests'],
  });

  if (config.typescript) {
    Object.assign(devDependencies, { '@types/node': '^22.0.0', typescript: '~5.9.3' });
    if (config.unit === 'bun') devDependencies['@types/bun'] = '^1.3.0';
    checks.types = 'tsc';
  }
  const modules = config.styling === 'modules';
  const tailwind = config.styling === 'tailwind';
  const styleFile = modules ? 'theme.module.css' : 'theme.css';
  const tailwindImport = config.formatter === 'biome' ? '@import "tailwindcss";' : "@import 'tailwindcss';";
  files[`${app}/${styleFile}`] = tailwind ? tailwindImport + '\n' : css;
  if (modules && config.typescript) {
    files[`${app}/styles.d.ts`] = "declare module '*.module.css' {\n  const classes: Record<string, string>;\n  export default classes;\n}\n";
  }
  if (tailwind) {
    Object.assign(devDependencies, { '@tailwindcss/postcss': '^4.1.0', tailwindcss: '^4.1.0' });
    files['.postcssrc.json'] = json({ plugins: { '@tailwindcss/postcss': {} } });
  }
  const className = tailwind ? '"mx-auto my-16 max-w-xl px-4"' : modules ? '{styles.page}' : '"page"';
  files[`${app}/site.${script}`] = `export const projectName = '${config.name}';\n`;
  files[`${app}/page.${jsx}`] = [
    "import { useState } from 'preact/hooks';",
    `import { projectName } from '${alias}app/site';`,
    `import ${modules ? 'styles from ' : ''}'./${styleFile}';`,
    '',
    'export default function Home() {',
    '  const [count, setCount] = useState(0);',
    '',
    '  return (',
    `    <main className=${className}>`,
    '      <h1>TinyJS</h1>',
    '      <p>Welcome to {projectName}.</p>',
    '      <button type="button" onClick={() => setCount(count + 1)}>',
    '        Count: {count}',
    '      </button>',
    ...(config.template === 'fullstack' ? ['      <p>', '        <a href="/about">About this starter</a>', '      </p>'] : []),
    ...(config.api ? ['      <p>', '        <a href="/api/hello">Example API response</a>', '      </p>'] : []),
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n');
  if (config.template === 'fullstack') {
    files[`${app}/about/page.${jsx}`] = `export default function About() {
  return (
    <main>
      <h1>About this starter</h1>
      <p>TinyJS renders this route on the server.</p>
      <a href="/">Home</a>
    </main>
  );
}
`;
  }
  if (config.api) {
    files[`${app}/api/hello/route.${script}`] = `export function GET() {
  return Response.json({ message: 'Hello from TinyJS' });
}
`;
  }

  if (config.unit === 'tinyjs') devDependencies.tsx = '^4.23.15';
  if (config.unit === 'vitest') {
    devDependencies.vitest = '^4.1.0';
    files['vitest.config.mjs'] = `import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = fileURLToPath(new URL('${base}', import.meta.url));

export default defineConfig({
  resolve: { alias: { '${alias.slice(0, -1)}': source } },
});
`;
  }
  if (config.exampleTests) {
    const runner = { tinyjs: 'node:test', vitest: 'vitest', bun: 'bun:test' }[config.unit];
    files[`tests/site.test.${script}`] = `import { strictEqual } from 'node:assert';
import { test } from '${runner}';
import { projectName } from '${alias}app/site';

test('the starter exports the project name', () => {
  strictEqual(projectName, '${config.name}');
});
`;
  }
  if (config.e2e) {
    devDependencies['@playwright/test'] = '^1.58.0';
    checks.e2e = 'playwright';
    files[`playwright.config.${script}`] = `import { defineConfig } from '@playwright/test';

const url = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.${script}',
  use: { baseURL: url },
  webServer: {
    command: '${run} dev${manager === 'npm' ? ' --' : ''} --port 4173',
    url,
  },
});
`;
    if (config.exampleTests) {
      files[`tests/home.e2e.${script}`] = `import { expect, test } from '@playwright/test';

test('the home page renders and hydrates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TinyJS' })).toBeVisible();
  const counter = page.getByRole('button');
  await expect(async () => {
    await counter.click();
    await expect(counter).not.toHaveText('Count: 0', { timeout: 500 });
  }).toPass();
});
`;
    }
  }

  if (config.linter !== 'none') checks.lint = config.linter;
  if (config.formatter !== 'none') checks.format = config.formatter;
  if (config.linter === 'oxlint') {
    devDependencies.oxlint = '^1.0.0';
    files['.oxlintrc.json'] = json({ ignorePatterns: generated.map((name) => `**/${name}/**`) });
  }
  if (config.linter === 'eslint') {
    Object.assign(devDependencies, { '@eslint/js': '^9.39.0', eslint: '^9.39.0' });
    if (config.typescript) devDependencies['typescript-eslint'] = '^8.48.0';
    files['eslint.config.mjs'] = `import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
${config.typescript ? "import tseslint from 'typescript-eslint';\n" : ''}
export default defineConfig([
  globalIgnores([
${generated.map((name) => `    '**/${name}/',`).join('\n')}
  ]),
  js.configs.recommended,
${config.typescript ? '  tseslint.configs.recommended,\n' : ''}  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  { files: ['**/api/**/route.js'], languageOptions: { globals: { Response: 'readonly' } } },
]);
`;
  }
  if (config.linter === 'biome' || config.formatter === 'biome') {
    devDependencies['@biomejs/biome'] = '^2.3.0';
    files['biome.json'] = json({
      files: { includes: ['**', ...ignored.map((name) => `!!**/${name.replace(/\/$/, '')}`)] },
      linter: { enabled: config.linter === 'biome' },
      formatter: { enabled: config.formatter === 'biome', indentStyle: 'space', lineWidth: 100 },
      javascript: { formatter: { quoteStyle: 'single' } },
      css: { parser: { tailwindDirectives: tailwind } },
    });
  }
  if (config.formatter === 'oxfmt') {
    devDependencies.oxfmt = '^0.77.0';
    files['.oxfmtrc.json'] = json({ singleQuote: true, sortPackageJson: false, ignorePatterns: ignored });
  }
  if (config.formatter === 'prettier') {
    devDependencies.prettier = '^3.6.0';
    files['.prettierrc.json'] = json({ singleQuote: true, printWidth: 100 });
    files['.prettierignore'] = ignored.join('\n') + '\n';
  }

  files['tinyjs.test.json'] = json(checks);
  files['package.json'] = json({
    name: config.name,
    private: true,
    type: 'module',
    packageManager: `${manager}@${managerVersions[manager]}`,
    engines: { node: '^20.19.0 || >=22.12.0' },
    scripts: { dev: 'tinyjs dev', build: 'tinyjs build', test: 'tinyjs test' },
    dependencies,
    devDependencies,
  });
  if (config.hooks) files['.githooks/pre-commit'] = `#!/bin/sh
cd "$(git rev-parse --show-toplevel)" || exit 1
exec ${run} test
`;
  if (config.ci) {
    files['.github/workflows/ci.yml'] = `name: CI

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
${manager === 'bun' || config.unit === 'bun' ? `      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${managerVersions.bun}
` : ''}${manager === 'pnpm' ? '      - uses: pnpm/action-setup@v4\n' : ''}      - run: ${install}${manager === 'pnpm' ? ' --no-frozen-lockfile' : ''}
${config.e2e ? `      - run: ${browserInstall} --with-deps chromium\n` : ''}      - run: ${run} test
`;
  }
  files['README.md'] = `# ${config.name}

This TinyJS Web app uses file-based routing, server rendering, and browser hydration.
Application routes are in \`${app}/\`.

\`\`\`sh
${install}
${run} dev
\`\`\`

Open http://127.0.0.1:3000. Run \`${run} build\` to create a production build.

${config.unit === 'bun' && manager !== 'bun' ? 'Install Bun to run the configured unit tests.\n\n' : ''}${config.e2e ? `Install the Chromium browser before validating the project:

\`\`\`sh
${browserInstall} chromium
\`\`\`

` : ''}Run \`${run} test\` to run all configured checks through TinyJS.
`;
  return files;
}

export async function generateProject(config: ProjectConfig, cwd = process.cwd(), frameworkSpec = '0.1.0'): Promise<string> {
  validateConfig(config);
  const root = resolve(cwd, config.name);
  const files = projectFiles(config, frameworkSpec);
  try {
    // Reserve the destination atomically. An existing empty directory is also protected.
    await mkdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Destination already exists: ${root}. Choose a different project name.`, { cause: error });
    }
    throw error;
  }
  try {
    for (const [name, contents] of Object.entries(files)) {
      const file = join(root, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, contents, { flag: 'wx', mode: name === '.githooks/pre-commit' ? 0o755 : 0o644 });
    }
  } catch (error) {
    throw new Error(`Could not finish writing ${root}. Generated files were left in place: ${String(error)}`, { cause: error });
  }
  return root;
}
