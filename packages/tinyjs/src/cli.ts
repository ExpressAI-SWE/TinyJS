import { parseArgs } from 'node:util';

const help = 'Usage: tinyjs <dev | build | start> [--host <host>] [--port <port>]';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' }, host: { type: 'string' }, port: { type: 'string' } },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const [command] = positionals;
  if (positionals.length !== 1 || !['dev', 'build', 'start'].includes(command)) throw new Error(help);

  const root = process.cwd();
  process.env.NODE_ENV = command === 'dev' ? 'development' : 'production';
  if (command === 'build') {
    if (values.host !== undefined || values.port !== undefined) throw new Error('Host and port apply to dev and start.');
    const { build } = await import('./vite.js');
    await build(root);
    return;
  }

  const host = values.host ?? '127.0.0.1';
  const port = values.port ?? '3000';
  if (!host || !/^\d+$/.test(port) || Number(port) > 65535) throw new Error('Specify a host and a port between 0 and 65535.');
  if (command === 'dev') {
    const { dev } = await import('./vite.js');
    await dev(root, host, Number(port));
  } else {
    const { start } = await import('./production.js');
    await start(root, host, Number(port));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
