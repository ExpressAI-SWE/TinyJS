import { parseArgs } from 'node:util';

const help = 'Usage: tinyjs <dev | build | serve | test> [--host <host>] [--port <port>]';

// Parse the command once, then load only the implementation needed for that command.
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
  if (positionals.length !== 1 || !['dev', 'build', 'serve', 'test'].includes(command)) throw new Error(help);

  const root = process.cwd();
  if (command === 'test') {
    if (values.host !== undefined || values.port !== undefined) throw new Error('Host and port apply to dev and serve.');
    const { runTests } = await import('./testing.js');
    process.exitCode = await runTests(root);
    return;
  }
  process.env.NODE_ENV = command === 'dev' ? 'development' : 'production';
  if (command === 'build') {
    if (values.host !== undefined || values.port !== undefined) throw new Error('Host and port apply to dev and serve.');
    const { build } = await import('./vite.js');
    await build(root);
    return;
  }

  // Development and production servers share the same host and port validation.
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
