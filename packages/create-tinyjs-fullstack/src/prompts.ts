import { cancel, confirm, intro, isCancel, log, multiselect, select, text } from '@clack/prompts';
import type { CommonOptions } from '@clack/prompts';
import { aliasError, choices, defaults, destinationError } from './config.js';
import type { ProjectConfig } from './config.js';

class Cancelled extends Error {}

function answer<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) throw new Cancelled();
  return value as Exclude<T, symbol>;
}

export async function promptProject(
  config: ProjectConfig,
  overrides: Record<string, string | boolean>,
  cwd: string,
  terminal?: Pick<CommonOptions, 'input' | 'output'>,
): Promise<ProjectConfig | undefined> {
  const choose = async <Key extends keyof typeof choices>(key: Key, message: string) => {
    if (key in overrides) return;
    const options = Object.entries(choices[key]).map(([value, label]) => ({
      value,
      label,
      hint: value === defaults[key] ? 'recommended' : undefined,
    }));
    config[key] = answer(await select({ ...terminal, message, options, initialValue: config[key] })) as ProjectConfig[Key];
  };
  const ask = async (
    key: 'typescript' | 'src' | 'strict' | 'api' | 'git' | 'hooks' | 'install' | 'start',
    message: string,
  ) => {
    if (!(key in overrides)) {
      config[key] = answer(await confirm({ ...terminal, message, initialValue: config[key] }));
    }
  };

  try {
    intro('Welcome to TinyJS!', terminal);
    const mode = answer(await select({
      ...terminal,
      message: 'How would you like to configure your project?',
      options: [
        { value: 'defaults', label: 'Use recommended defaults' },
        { value: 'custom', label: 'Customize settings' },
      ],
    }));
    if (!('name' in overrides)) {
      config.name = answer(await text({
        ...terminal,
        message: 'What is your project named?',
        placeholder: config.name,
        defaultValue: config.name,
        validate: (value) => destinationError(value || config.name, cwd),
      }));
    }
    if (mode === 'defaults') return config;

    log.info('Web is available with file-based routing, SSR and hydration. Desktop and Mobile are coming soon.', terminal);
    await choose('template', 'Which starter template would you like?');
    await ask('typescript', 'Would you like to use TypeScript?');
    await ask('src', 'Would you like your application code inside src/?');
    if (!('alias' in overrides)) {
      config.alias = answer(await text({
        ...terminal,
        message: 'Which import alias would you like to use?',
        placeholder: config.alias,
        defaultValue: config.alias,
        validate: (value) => aliasError(value || config.alias),
      }));
    }
    await choose('styling', 'Which styling system would you like?');
    if (!('api' in overrides)) config.api = config.template === 'fullstack';
    await ask('api', 'Include an example API route?');
    await choose('linter', 'Which linter would you like?');
    if (config.linter === 'biome' && !('formatter' in overrides)) config.formatter = 'biome';
    await choose('formatter', 'Which formatter would you like?');
    if (config.typescript) await ask('strict', 'Enable strict TypeScript checking?');
    else if (!('strict' in overrides)) config.strict = false;
    await choose('unit', 'Which unit testing engine would you like?');

    const extras = [
      { value: 'e2e', label: 'Playwright end-to-end testing' },
      { value: 'exampleTests', label: 'Example tests' },
      { value: 'ci', label: 'GitHub Actions CI workflow' },
    ] as const;
    const options = extras.filter(({ value }) => !(value in overrides));
    if (options.length) {
      const selected = answer(await multiselect({
        ...terminal,
        message: 'Which extras would you like? Press Space to toggle and Enter to confirm.',
        options: [...options],
        initialValues: options.filter(({ value }) => config[value]).map(({ value }) => value),
        required: false,
      }));
      for (const { value } of options) config[value] = selected.includes(value);
    }

    await choose('packageManager', 'Which package manager would you like?');
    await ask('git', 'Initialize a Git repository?');
    if (config.git) await ask('hooks', 'Configure a Git pre-commit hook?');
    await ask('install', 'Install dependencies automatically?');
    if (config.install) await ask('start', 'Start the development server after setup?');
    return config;
  } catch (error) {
    if (!(error instanceof Cancelled)) throw error;
    cancel('Setup cancelled.', terminal);
  }
}
