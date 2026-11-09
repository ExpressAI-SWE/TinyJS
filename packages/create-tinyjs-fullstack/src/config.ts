import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';

export const choices = {
  platform: { web: 'Web' },
  template: { minimal: 'Minimal', fullstack: 'Full-stack' },
  styling: { tailwind: 'Tailwind CSS', modules: 'CSS Modules', css: 'Plain CSS' },
  linter: { oxlint: 'Oxlint', eslint: 'ESLint', biome: 'Biome', none: 'None' },
  formatter: { oxfmt: 'Oxfmt', prettier: 'Prettier', biome: 'Biome', none: 'None' },
  unit: { tinyjs: 'TinyJS', vitest: 'Vitest', bun: 'Bun Test' },
  packageManager: { bun: 'Bun', npm: 'npm', pnpm: 'pnpm' },
} as const;

export type ProjectConfig = {
  -readonly [Key in keyof typeof choices]: keyof (typeof choices)[Key];
} & {
  name: string;
  typescript: boolean;
  src: boolean;
  alias: string;
  api: boolean;
  strict: boolean;
  e2e: boolean;
  exampleTests: boolean;
  git: boolean;
  hooks: boolean;
  ci: boolean;
  install: boolean;
  start: boolean;
};

export const defaults: ProjectConfig = {
  name: 'my-tinyjs-app',
  platform: 'web',
  template: 'minimal',
  typescript: true,
  src: true,
  alias: '@/*',
  styling: 'tailwind',
  api: false,
  linter: 'oxlint',
  formatter: 'oxfmt',
  strict: true,
  unit: 'tinyjs',
  e2e: false,
  exampleTests: true,
  packageManager: 'bun',
  git: true,
  hooks: false,
  ci: false,
  install: true,
  start: false,
};

const booleanFlags = {
  typescript: 'typescript',
  src: 'src',
  api: 'api',
  strict: 'strict',
  e2e: 'e2e',
  exampleTests: 'example-tests',
  git: 'git',
  hooks: 'hooks',
  ci: 'ci',
  install: 'install',
  start: 'start',
} as const;

const choiceFlags = {
  platform: 'platform',
  template: 'template',
  styling: 'styling',
  linter: 'linter',
  formatter: 'formatter',
  unit: 'unit',
  packageManager: 'package-manager',
} as const;

export function nameError(name: string): string | undefined {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,213}$/.test(name) || name.endsWith('.')) {
    return 'Use 1–214 lowercase letters, digits, dots, underscores or hyphens. Start with a letter or digit and end without a dot.';
  }
  if (/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(name) ||
      ['node_modules', 'favicon.ico', 'tinyjs', 'tinyjs-fullstack', 'preact', 'typescript', 'vite'].includes(name)) {
    return `"${name}" is reserved. Choose a different project name.`;
  }
}

export function destinationError(name: string, cwd: string): string | undefined {
  const invalidName = nameError(name);
  if (invalidName) return invalidName;
  if (lstatSync(resolve(cwd, name), { throwIfNoEntry: false })) {
    return `"${name}" already exists. Choose a new directory name.`;
  }
}

export function aliasError(alias: string): string | undefined {
  if (typeof alias !== 'string' || !/^[@~][a-zA-Z0-9_-]*\/\*$/.test(alias)) {
    return 'Use a bare import prefix followed by /*, for example @/* or @app/*.';
  }
}

export function validateConfig(config: ProjectConfig): void {
  const error = nameError(config.name) ?? aliasError(config.alias);
  if (error) throw new Error(error);
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    if (!Object.hasOwn(choices[key], config[key])) {
      throw new Error(`Invalid --${choiceFlags[key]} value "${config[key]}". Choose ${Object.keys(choices[key]).join(', ')}.`);
    }
  }
  for (const key of Object.keys(booleanFlags) as (keyof typeof booleanFlags)[]) {
    if (typeof config[key] !== 'boolean') throw new Error(`--${booleanFlags[key]} must be a boolean.`);
  }
  if (config.strict && !config.typescript) throw new Error('--strict requires TypeScript.');
  if (config.start && !config.install) throw new Error('--start requires dependency installation.');
  if (config.hooks && !config.git) throw new Error('--hooks requires initializing a Git repository for this project.');
}

export const help = [
  'Usage: create-tinyjs-fullstack [project-name] [options]',
  '',
  '  --yes, -y           Run without prompts using defaults and supplied overrides',
  '  --help, -h          Show this help',
  '  --alias <prefix>    Import alias (default @/*)',
  '  --framework <tgz>   Use a local TinyJS framework tarball',
  ...Object.entries(choiceFlags).map(([key, flag]) =>
    `  --${flag} <${Object.keys(choices[key as keyof typeof choices]).join('|')}> (default ${defaults[key as keyof typeof choices]})`),
  '',
  'Boolean options accept --flag and --no-flag.',
  ...Object.entries(booleanFlags).map(([key, flag]) =>
    `  --${flag} (default ${defaults[key as keyof typeof booleanFlags] ? 'on' : 'off'})`),
].join('\n');

export function readArgs(args: string[]) {
  const options: ParseArgsConfig['options'] = {
    yes: { type: 'boolean', short: 'y' },
    help: { type: 'boolean', short: 'h' },
    alias: { type: 'string' },
    framework: { type: 'string' },
    ...Object.fromEntries(Object.values(choiceFlags).map((flag) => [flag, { type: 'string' }])),
    ...Object.fromEntries(Object.values(booleanFlags).flatMap((flag) => [
      [flag, { type: 'boolean' }],
      [`no-${flag}`, { type: 'boolean' }],
    ])),
  };
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true });
  if (positionals.length > 1) throw new Error('Supply only one project name.');

  const overrides: Record<string, string | boolean> = {};
  for (const [key, flag] of Object.entries(choiceFlags)) {
    const value = values[flag];
    if (typeof value === 'string') overrides[key] = value;
  }
  for (const [key, flag] of Object.entries(booleanFlags)) {
    if (values[flag] && values[`no-${flag}`]) throw new Error(`Choose either --${flag} or --no-${flag}.`);
    if (values[flag] || values[`no-${flag}`]) overrides[key] = Boolean(values[flag]);
  }
  if (positionals[0] !== undefined) overrides.name = positionals[0];
  if (typeof values.alias === 'string') overrides.alias = values.alias;

  const config = { ...defaults, ...overrides };
  if (!('strict' in overrides)) config.strict = config.typescript;
  if (!('api' in overrides)) config.api = config.template === 'fullstack';
  const framework = typeof values.framework === 'string' ? values.framework : undefined;
  return { config, overrides, framework, yes: values.yes === true, help: values.help === true };
}
