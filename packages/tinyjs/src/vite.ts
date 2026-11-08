import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from './config.js';
import type { TinyConfig } from './config.js';
import { validateRoutes } from './routing.js';
import { isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as viteBuild, createServer, isRunnableDevEnvironment, normalizePath } from 'vite';
import type { InlineConfig } from 'vite';
import type { Handler, PageAssets } from './handler.js';
import { httpListener, printAddress } from './http.js';
import { assetBase, outputPaths } from './output.js';
import type { BuildAssets } from './output.js';

// Explicit extensions keep Vite's reload URLs identical to the resolved entry IDs.
const clientId = '/@tinyjs/client.js';
const serverId = '/@tinyjs/server.js';
const clientEntry = normalizePath(fileURLToPath(new URL('./browser-entry.js', import.meta.url)));
const serverEntry = normalizePath(fileURLToPath(new URL('./server-entry.js', import.meta.url)));
const aiEntry = normalizePath(fileURLToPath(new URL('./ai.js', import.meta.url)));

function config(root: string): InlineConfig {
  const apiDir = `${normalizePath(root)}/app/api/`;
  const jsx = { runtime: 'automatic', importSource: 'preact' } as const;
  return {
    root,
    configFile: false,
    appType: 'custom',
    publicDir: false,
    oxc: { jsx },
    resolve: { dedupe: ['preact'] },
    optimizeDeps: {
      entries: ['app/**/*.tsx', '!app/api/**'],
      include: ['preact'],
      rolldownOptions: { transform: { jsx } },
    },
    plugins: [{
      name: 'tinyjs-entries',
      enforce: 'pre',
      resolveId(id) {
        if (this.environment.config.consumer === 'client' && id === 'tinyjs/ai') this.error('Server module tinyjs/ai cannot be imported by a TinyJS page or layout.');
        if (this.environment.config.consumer === 'client' && (isBuiltin(id) || id === 'bun' || id.startsWith('bun:'))) {
          this.error(`Server module ${id} cannot be imported by a TinyJS page or layout.`);
        }
        if (id === clientId) return clientEntry;
        if (id === serverId && this.environment.config.consumer === 'server') return serverEntry;
      },
      transform(_code, id) {
        const file = id.split('?')[0];
        if (this.environment.config.consumer === 'client' && (file.startsWith(apiDir) || file === serverEntry || file === aiEntry || file === aiEntry.replace(/\.js$/, '.ts') || /\.server\.[cm]?[jt]sx?$/.test(file))) {
          this.error(`Server module ${file} cannot be imported by a TinyJS page or layout.`);
        }
      },
    }],
  };
}

export async function dev(root: string, host: string, port: number) {
  await loadConfig(root);
  await diagnoseRoutes(root);
  const options = config(root);
  const vite = await createServer({
    ...options,
    server: {
      host, port, strictPort: true,
      fs: { deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/.tinyjs/**', '**/app/api/**',
      ] },
    },
    plugins: [...(options.plugins ?? []), {
      name: 'tinyjs-dev',
      configureServer(server) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const changed = (file: string) => {
          if (!normalizePath(file).startsWith(`${normalizePath(root)}/app/`)) return;
          clearTimeout(timer);
          timer = setTimeout(() => { void diagnoseRoutes(root).then(() => server.ws.send({ type: 'full-reload' }), error => server.config.logger.error(String(error))); }, 50);
        };
        server.watcher.on('add', changed).on('unlink', changed);
        server.httpServer?.once('close', () => { clearTimeout(timer); server.watcher.off('add', changed).off('unlink', changed); });
        const ssr = server.environments.ssr;
        if (!isRunnableDevEnvironment(ssr)) throw new Error('TinyJS needs Vite’s runnable SSR environment.');
        return () => server.middlewares.use(httpListener(async (request) => {
          const { createApplication } = await ssr.runner.import(serverId) as {
            createApplication: (assets: PageAssets) => Handler;
          };
          return createApplication({ scripts: ['/@vite/client', clientId] })(request);
        }));
      },
    }],
  });
  try {
    await vite.listen();
  } catch (error) {
    await vite.close();
    throw error;
  }
  if (vite.httpServer) printAddress(vite.httpServer);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void vite.close(); });
}

async function loadConfig(root: string): Promise<TinyConfig> {
  try { return defineConfig(JSON.parse(await readFile(join(root, 'tinyjs.config.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}

async function diagnoseRoutes(root: string) {
  const pages: string[] = [], apis: string[] = [];
  let loading = false, errors = false;
  async function visit(directory: string, relative: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(directory, entry.name), path);
      else if (entry.name === 'page.tsx' && !path.startsWith('/app/api/')) pages.push(path);
      else if (entry.name === 'route.ts' && path.startsWith('/app/api/')) apis.push(path);
      if (!path.startsWith('/app/api/')) {
        // Vite follows symlinks; retain support when this scan cannot inspect their targets.
        loading ||= entry.name === 'loading.tsx' || entry.isSymbolicLink();
        errors ||= entry.name === 'error.tsx' || entry.isSymbolicLink();
      }
    }
  }
  try { await visit(join(root, 'app'), '/app'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('TinyJS needs an app directory containing page.tsx.'); throw error; }
  validateRoutes(pages, '/page.tsx'); validateRoutes(apis, '/route.ts');
  console.log(`TinyJS routes: ${pages.length} pages, ${apis.length} API handlers`);
  return { loading, errors };
}

export async function build(root: string) {
  const started = performance.now();
  const output = outputPaths(root);
  await mkdir(output.dir, { recursive: true });
  await rm(output.metadata, { force: true });
  const settings = await loadConfig(root);
  const routes = await diagnoseRoutes(root);
  const options = config(root);
  const client = await viteBuild({
    ...options,
    define: {
      'import.meta.env.TINYJS_LOADING': String(routes.loading),
      'import.meta.env.TINYJS_ERRORS': String(routes.errors),
    },
    base: assetBase,
    build: {
      outDir: output.client,
      emptyOutDir: true,
      cssCodeSplit: false,
      modulePreload: false,
      manifest: true,
      sourcemap: settings.sourcemap ?? false,
      rolldownOptions: { input: { client: clientId } },
    },
  });
  if (Array.isArray(client) || !('output' in client)) throw new Error('Expected one TinyJS browser build.');
  const entry = client.output.find((file) => file.type === 'chunk' && file.isEntry);
  if (!entry || entry.type !== 'chunk') throw new Error('TinyJS browser entry was not emitted.');

  await viteBuild({
    ...options,
    ssr: { noExternal: true },
    build: {
      ssr: true,
      outDir: output.server,
      emptyOutDir: true,
      rolldownOptions: { input: serverId, output: { entryFileNames: 'server.mjs' } },
    },
  });

  const assets: BuildAssets = {
    entry: entry.fileName,
    styles: client.output.filter((file) => file.type === 'asset' && file.fileName.endsWith('.css')).map((file) => file.fileName),
  };
  const statistics = client.output.filter((file) => file.type === 'chunk' || /\.(css|svg|json)$/.test(file.fileName)).map((file) => {
    const source = file.type === 'chunk' ? file.code : file.source;
    const raw = Buffer.from(source);
    const gzip = gzipSync(raw, { level: 9 });
    return { file: file.fileName, raw: raw.byteLength, gzip: gzip.byteLength, compressed: gzip };
  });
  if (settings.compress) for (const item of statistics) {
    if (item.gzip < item.raw) await writeFile(join(output.client, item.file + '.gz'), item.compressed);
  }
  const pending = `${output.metadata}.tmp`;

  const files = new Set([entry.fileName]);
  let bytes = 0;
  for (const name of files) {
    const chunk = client.output.find((file) => file.fileName === name);
    if (chunk?.type !== 'chunk') continue;
    bytes += statistics.find((item) => item.file === name)!.gzip;
    for (const dependency of chunk.imports) files.add(dependency);
  }
  console.log(`Shared client JS: ${bytes} bytes gzip (goal: 3000 bytes)`);
  const exceeded = statistics.filter((item) => item.file.endsWith('.js') && item.gzip > (settings.budgets?.chunkGzip ?? 150_000));
  if (bytes > (settings.budgets?.sharedGzip ?? 3000)) console.warn(`Shared client exceeds ${settings.budgets?.sharedGzip ?? 3000} byte gzip budget.`);
  for (const item of exceeded) console.warn(`Large chunk: ${item.file} (${item.gzip} bytes gzip)`);
  await writeFile(join(output.dir, 'stats.json'), JSON.stringify({ durationMs: Math.round(performance.now() - started), sharedGzip: bytes, assets: statistics.map(({ compressed, ...item }) => item) }, null, 2));
  if (settings.budgets?.fail && (exceeded.length || bytes > (settings.budgets.sharedGzip ?? 3000))) throw new Error('TinyJS performance budget exceeded. See .tinyjs/stats.json.');
  await writeFile(pending, JSON.stringify(assets));
  await rename(pending, output.metadata);
}
