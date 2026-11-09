import { expect, test } from 'bun:test';
import { defaults, nameError, readArgs, validateConfig } from '../src/config.ts';

test('recommended defaults and dependent options resolve correctly', () => {
  expect(readArgs(['--yes']).config).toEqual(defaults);
  const { config } = readArgs([
    'my-app', '-y', '--template', 'fullstack', '--no-typescript', '--no-src',
    '--package-manager', 'pnpm', '--alias', '@app/*', '--no-install',
  ]);
  validateConfig(config);
  expect(config).toMatchObject({
    name: 'my-app', template: 'fullstack', api: true, typescript: false, strict: false,
    src: false, packageManager: 'pnpm', alias: '@app/*', install: false,
  });
});

test('unsafe names and invalid or incompatible flags are rejected', () => {
  for (const name of ['..', 'nested/app', 'nested\\app', 'C:\\app', 'CON', 'com1.txt', 'nul', 'dot.', 'node_modules']) {
    expect(nameError(name)).toBeDefined();
  }
  expect(nameError('my-app.v2')).toBeUndefined();
  expect(() => readArgs(['--unsupported'])).toThrow('Unknown option');
  expect(() => readArgs(['--src', '--no-src'])).toThrow('Choose either');
  for (const args of [
    ['--platform', 'desktop'], ['--template', 'unknown'], ['--alias', '../*'],
    ['--strict', '--no-typescript'], ['--start', '--no-install'], ['--hooks', '--no-git'],
  ]) {
    expect(() => validateConfig(readArgs(args).config)).toThrow();
  }
});
