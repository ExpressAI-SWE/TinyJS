#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { destinationError, help, readArgs, validateConfig } from './config.js';
import { generateProject } from './generator.js';
import { promptProject } from './prompts.js';

class Interrupted extends Error {}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  // npm and pnpm use .cmd shims on Windows. Commands and arguments here are fixed.
  const useCmd = process.platform === 'win32' && (command === 'npm' || command === 'pnpm');
  const child = spawn(useCmd ? process.env.ComSpec ?? 'cmd.exe' : command, useCmd
    ? ['/d', '/c', [command, ...args].join(' ')]
    : args, {
    cwd,
    stdio: 'inherit',
  });
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    child.kill('SIGINT');
  };
  process.once('SIGINT', interrupt);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', (error: NodeJS.ErrnoException) => {
        reject(error.code === 'ENOENT'
          ? new Error(`Could not find ${command} on PATH.`)
          : error);
      });
      child.once('exit', (code, signal) => {
        if (interrupted || signal === 'SIGINT') reject(new Interrupted());
        else if (code === 0) resolve();
        else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`));
      });
    });
  } finally {
    process.off('SIGINT', interrupt);
  }
}

async function main(): Promise<void> {
  const parsed = readArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(help);
    return;
  }

  const cwd = process.cwd();
  let frameworkSpec: string | undefined;
  if (parsed.framework !== undefined) {
    const archive = resolve(cwd, parsed.framework);
    if (!archive.endsWith('.tgz') || !statSync(archive, { throwIfNoEntry: false })?.isFile()) {
      throw new Error('--framework requires an existing TinyJS .tgz archive.');
    }
    frameworkSpec = `file:${archive.split(sep).join('/')}`;
  }
  validateConfig(parsed.config);
  if ('name' in parsed.overrides) {
    const conflict = destinationError(parsed.config.name, cwd);
    if (conflict) throw new Error(conflict);
  }
  if (!parsed.yes && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error('An interactive terminal is required. Pass --yes to create a project without prompts.');
  }
  const config = parsed.yes ? parsed.config : await promptProject(parsed.config, parsed.overrides, cwd);
  if (!config) {
    process.exitCode = 130;
    return;
  }
  validateConfig(config);
  if (frameworkSpec && config.ci) throw new Error('--ci requires a registry framework dependency.');

  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.once('SIGINT', interrupt);
  let root: string;
  try {
    root = await generateProject(config, cwd, frameworkSpec);
  } finally {
    process.off('SIGINT', interrupt);
  }
  console.log(`Created ${root}`);
  if (interrupted) throw new Interrupted();
  const manager = config.packageManager;
  const install = manager === 'pnpm' ? ['install', '--ignore-workspace'] : ['install'];
  try {
    if (config.git) await run('git', ['init'], root);
    if (config.hooks) await run('git', ['config', '--local', 'core.hooksPath', '.githooks'], root);
    if (config.install) await run(manager, install, root);
  } catch (error) {
    if (error instanceof Interrupted) throw error;
    throw new Error(`${error instanceof Error ? error.message : String(error)} Project files are available at ${root}. To install dependencies, run ${manager} ${install.join(' ')} there.`);
  }

  if (config.start) {
    await run(manager, ['run', 'dev'], root);
  } else {
    console.log(`\n  cd ${config.name}`);
    if (!config.install) console.log(`  ${manager} ${install.join(' ')}`);
    console.log(`  ${manager} run dev\n  ${manager} run test`);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof Interrupted) {
    console.error('Setup cancelled.');
    process.exitCode = 130;
  } else {
    console.error(`TinyJS: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
