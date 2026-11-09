import { expect, test } from 'bun:test';
import { PassThrough, Writable } from 'node:stream';
import { tmpdir } from 'node:os';
import { defaults, readArgs } from '../src/config.ts';
import { promptProject } from '../src/prompts.ts';

function terminal(steps: [string, string][]) {
  const input = new PassThrough();
  let transcript = '';
  const output = Object.assign(new Writable({
    write(chunk, _encoding, callback) {
      transcript += chunk;
      if (steps[0] && String(chunk).includes(steps[0][0])) {
        const [, keypresses] = steps.shift()!;
        setImmediate(() => input.write(keypresses));
      }
      callback();
    },
  }), { isTTY: true, columns: 100 });
  return { input, output, transcript: () => transcript };
}

test('recommended prompt accepts the default name with Enter', async () => {
  const io = terminal([
    ['How would you like to configure', '\r'],
    ['What is your project named', '\r'],
  ]);
  expect(await promptProject({ ...defaults }, {}, tmpdir(), io)).toEqual(defaults);
  expect(io.transcript()).toContain('Welcome to TinyJS!');
});

test('arrow and Space keys customize extras, and Ctrl+C cancels the wizard', async () => {
  const { config, overrides } = readArgs([
    'test-app', '--template', 'minimal', '--no-typescript', '--src', '--alias', '@app/*',
    '--styling', 'css', '--no-api', '--linter', 'none', '--formatter', 'none',
    '--unit', 'tinyjs', '--no-git', '--package-manager', 'bun', '--no-install',
  ]);
  const customize = terminal([
    ['How would you like to configure', '\u001b[B\r'],
    ['Which extras would you like', ' \r'],
  ]);
  expect(await promptProject(config, overrides, tmpdir(), customize)).toMatchObject({
    e2e: true, exampleTests: true, ci: false,
  });
  expect(customize.transcript()).toContain('Desktop and Mobile are coming soon.');

  const cancellation = terminal([['How would you like to configure', '\u0003']]);
  expect(await promptProject({ ...defaults }, {}, tmpdir(), cancellation)).toBeUndefined();
  expect(cancellation.transcript()).toContain('Setup cancelled.');
});
