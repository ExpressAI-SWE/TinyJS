import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from './config.js';
import type { TinyConfig } from './config.js';
import { routePath, validateRoutes } from './routing.js';
import { layoutAncestry } from './route-tree.js';
import { isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as viteBuild, createServer, isRunnableDevEnvironment, normalizePath } from 'vite';
import type { InlineConfig } from 'vite';
import type { Plugin } from 'vite';
import type { Handler, PageAssets } from './handler.js';
import { httpListener, printAddress } from './http.js';
import { assetBase, outputPaths } from './output.js';
import type { BuildAssets } from './output.js';
import type { DevRoute } from './devtools/protocol.js';

// Explicit extensions keep Vite's reload URLs identical to the resolved entry IDs.
const clientId = '/@tinyjs/client.js';
const serverId = '/@tinyjs/server.js';
const clientEntry = normalizePath(fileURLToPath(new URL('./browser-entry.js', import.meta.url)));
const serverEntry = normalizePath(fileURLToPath(new URL('./server-entry.js', import.meta.url)));
const aiEntry = normalizePath(fileURLToPath(new URL('./ai.js', import.meta.url)));

// Configure Vite for Preact and keep server-only modules out of browser bundles.
function config(root: string, settings: TinyConfig): InlineConfig {
  const appDir = settings.appDir ?? 'app';
  const apiDir = `${normalizePath(root)}/${appDir}/api/`;
  const jsx = { runtime: 'automatic', importSource: 'preact' } as const;
  return {
    root,
    configFile: false,
    define: { __TINYJS_ROOT_API_ROUTES__: JSON.stringify(settings.rootApiRoutes ?? false), TINYJS_DEVTOOLS: 'false' },
    appType: 'custom',
    publicDir: false,
    oxc: { jsx },
    resolve: {
      dedupe: ['preact'],
      alias: settings.importAlias ? {
        [settings.importAlias.slice(0, -2)]: normalizePath(join(root, appDir, '..')),
      } : undefined,
    },
    optimizeDeps: {
      entries: [`${appDir}/**/*.{tsx,jsx}`, `!${appDir}/api/**`],
      include: ['preact'],
      rolldownOptions: { transform: { jsx } },
    },
    plugins: [{
      name: 'tinyjs-entries',
      enforce: 'pre',
      resolveId(id) {
        if (this.environment.config.consumer === 'client' && (id === 'tinyjs/ai' || id === 'tinyjs-fullstack/ai')) this.error('Server module tinyjs/ai cannot be imported by a TinyJS page or layout.');
        if (this.environment.config.consumer === 'client' && (isBuiltin(id) || id === 'bun' || id.startsWith('bun:'))) {
          this.error(`Server module ${id} cannot be imported by a TinyJS page or layout.`);
        }
        if (id === clientId) return clientEntry;
        if (id === serverId && this.environment.config.consumer === 'server') return serverEntry;
      },
      transform(code, id) {
        const file = id.split('?')[0];
        if (this.environment.config.consumer === 'client' && (file.startsWith(apiDir) || file === serverEntry || file === aiEntry || file === aiEntry.replace(/\.js$/, '.ts') || /\.server\.[cm]?[jt]sx?$/.test(file))) {
          this.error(`Server module ${file} cannot be imported by a TinyJS page or layout.`);
        }
        // Vite needs literal glob paths, so substitute the selected root before it expands them.
        if (file === clientEntry || file === serverEntry) return code.replaceAll('/__tinyjs_app__/', `/${appDir}/`);
      },
    }],
  };
}

// Start the development server and recheck routes when app files are added or removed.
export async function dev(root: string, host: string, port: number, enableDevTools = true) {
  const settings = await loadConfig(root);
  const appDir = settings.appDir ?? 'app';
  const useDevTools = enableDevTools && settings.devtools?.enabled !== false
    && ['localhost', '127.0.0.1', '::1'].includes(host);
  let discovered = await diagnoseRoutes(root, appDir, settings.rootApiRoutes, useDevTools);
  const instrumentation = useDevTools
    ? await Promise.all([import('./devtools/plugin.js'), import('./devtools/request.js')])
    : undefined;
  const devtools = instrumentation?.[0].createDevTools(root, settings, discovered.registry);
  const options = config(root, settings);
  const vite = await createServer({
    ...options,
    define: { ...options.define, TINYJS_DEVTOOLS: String(Boolean(devtools)) },
    optimizeDeps: devtools ? {
      ...options.optimizeDeps,
      include: ['preact', 'preact/hooks', 'preact/jsx-runtime'],
    } : options.optimizeDeps,
    server: {
      host, port, strictPort: true,
      fs: { deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/.tinyjs/**', '**/app/api/**',
      ] },
    },
    plugins: [...(options.plugins ?? []), devtools?.plugin, {
      name: 'tinyjs-dev',
      configureServer(server) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let reportedApplication: ((assets: PageAssets) => Handler) | undefined;
        const changed = (file: string) => {
          if (!normalizePath(file).startsWith(`${normalizePath(root)}/${appDir}/`)) return;
          clearTimeout(timer);
          // Vite reloads changed route globs. Sending a second reload can interrupt navigation.
          timer = setTimeout(() => {
            void diagnoseRoutes(root, appDir, settings.rootApiRoutes, useDevTools).then(next => {
              discovered = next;
              reportedApplication = undefined;
              devtools?.collector.setRoutes(next.registry);
            }, (error: unknown) => {
              server.config.logger.error(String(error));
              devtools?.collector.record('error', { type: 'Routing', message: String(error), stack: error instanceof Error ? error.stack : undefined });
            });
          }, 50);
        };
        server.watcher.on('add', changed).on('unlink', changed);
        server.httpServer?.once('close', () => { clearTimeout(timer); server.watcher.off('add', changed).off('unlink', changed); });
        const ssr = server.environments.ssr;
        if (!isRunnableDevEnvironment(ssr)) throw new Error('TinyJS needs Vite’s runnable SSR environment.');
        const runner = ssr.runner;
        async function dispatch(request: Request, inject = false, loaded?: () => void) {
          const { createApplication } = await runner.import(serverId) as {
            createApplication: (assets: PageAssets) => Handler;
          };
          loaded?.();
          const scripts = ['/@vite/client', clientId];
          if (inject && devtools) scripts.push(devtools.script);
          const assets: PageAssets = { scripts };
          if (inject && devtools && reportedApplication !== createApplication) {
            reportedApplication = createApplication;
            assets.reportRoutes = (pages, apis, layouts) => {
              devtools.collector.setRoutes(routeRegistry(pages, apis, layouts, discovered.sources, appDir, settings.rootApiRoutes));
            };
          }
          return createApplication(assets)(request);
        }
        const listener = devtools && instrumentation
          ? instrumentation[1].instrumentRequests(server, devtools, dispatch, (file, mode) => {
            const key = mode === 'api' && settings.rootApiRoutes ? file.replace('/app/', '/app/api/') : file;
            return discovered.sources.get(key) ?? `/${appDir}${key.slice(4)}`;
          })
          : httpListener(dispatch);
        return () => server.middlewares.use(listener);
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
  const close = () => { void vite.close(); };
  const signals = ['SIGINT', 'SIGTERM'] as const;
  for (const signal of signals) process.once(signal, close);
  vite.httpServer?.once('close', () => {
    for (const signal of signals) process.off(signal, close);
  });
}

// Missing configuration uses defaults; malformed configuration remains an error.
async function loadConfig(root: string): Promise<TinyConfig> {
  try { return defineConfig(JSON.parse(await readFile(join(root, 'tinyjs.config.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}

// Discover and validate page and API routes before serving or building the app.
async function diagnoseRoutes(root: string, appDir: NonNullable<TinyConfig['appDir']>, rootApiRoutes = false, inspect = false) {
  const pages: string[] = [], apis: string[] = [];
  const sources = new Map<string, string>();
  let loading = false, errors = false, browser = false;
  async function visit(directory: string, relative: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(directory, entry.name), path);
      else if (/^page\.[jt]sx$/.test(entry.name) && !path.startsWith('/app/api/')) pages.push(path.replace(/\.jsx$/, '.tsx'));
      else if (/^route\.[jt]s$/.test(entry.name) && path.startsWith('/app/api/')) apis.push(path.replace(/\.js$/, '.ts'));
      if (inspect && /^(page|layout)\.[jt]sx$|^route\.[jt]s$/.test(entry.name)) {
        sources.set(path.replace(/\.jsx$/, '.tsx').replace(/\.js$/, '.ts'), `/${appDir}${path.slice(4)}`);
      }
      if (!path.startsWith('/app/api/')) {
        browser ||= /^not-found\.[jt]sx$/.test(entry.name) || entry.isSymbolicLink();
        // Vite follows symlinks; retain support when this scan cannot inspect their targets.
        loading ||= /^loading\.[jt]sx$/.test(entry.name) || entry.isSymbolicLink();
        errors ||= /^error\.[jt]sx$/.test(entry.name) || entry.isSymbolicLink();
      }
    }
  }
  try { await visit(join(root, appDir), '/app'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`TinyJS needs a ${appDir} directory containing page.tsx or page.jsx.`); throw error; }
  validateRoutes(pages, '/page.tsx'); validateRoutes(rootApiRoutes ? apis.map(file => file.replace('/app/api/', '/app/')) : apis, '/route.ts');
  console.log(`TinyJS routes: ${pages.length} pages, ${apis.length} API handlers`);
  const registry = inspect ? routeRegistry(pages, apis, [...sources.keys()], sources, appDir, rootApiRoutes) : [];
  return { loading, errors, browser: browser || pages.length > 0, sources, registry };
}

function routeRegistry(pages: string[], apis: string[], layouts: string[], sources: Map<string, string>, appDir: string, rootApiRoutes = false): DevRoute[] {
  const registeredLayouts = new Set(layouts);
  const source = (file: string) => sources.get(file) ?? `/${appDir}${file.slice(4)}`;
  return [
    ...pages.map(file => ({
      pattern: routePath(file, '/page.tsx').replace(/%5B/g, '[').replace(/%5D/g, ']'),
      file: source(file), kind: 'page' as const,
      layouts: layoutAncestry(file).filter(layout => registeredLayouts.has(layout)).map(source),
    })),
    ...apis.map(file => ({
      pattern: routePath(rootApiRoutes ? file.replace('/app/api/', '/app/') : file, '/route.ts').replace(/%5B/g, '[').replace(/%5D/g, ']'),
      file: source(file), kind: 'api' as const, layouts: [],
    })),
  ];
}

function productionSourceMaps(directory: string): Plugin {
  function removeRuntimeSource(map: { sources: string[]; sourcesContent?: (string | null)[] }, file: string) {
    if (!map.sourcesContent) return false;
    const index = map.sources.findIndex(source => normalizePath(resolve(directory, dirname(file), source)) === clientEntry);
    if (index < 0) return false;
    // Keep location mappings without embedding the original dev-only branches.
    map.sourcesContent[index] = null;
    return true;
  }
  return {
    name: 'tinyjs-production-sourcemaps',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.map) removeRuntimeSource(file.map, file.fileName);
        if (file.type === 'asset' && file.fileName.endsWith('.js.map')) {
          const source = Buffer.from(file.source).toString();
          const map: Parameters<typeof removeRuntimeSource>[0] = JSON.parse(source);
          if (removeRuntimeSource(map, file.fileName)) file.source = JSON.stringify(map);
        }
      }
    },
  };
}

// Build browser and server bundles, then publish metadata only after both builds succeed.
export async function build(root: string, analyze = false) {
  const started = performance.now();
  const output = outputPaths(root);
  await mkdir(output.dir, { recursive: true });
  await rm(output.metadata, { force: true });
  const settings = await loadConfig(root);
  const routes = await diagnoseRoutes(root, settings.appDir ?? 'app', settings.rootApiRoutes);
  const options = config(root, settings);
  const client = routes.browser ? await viteBuild({
    ...options,
    plugins: [...(options.plugins ?? []), settings.sourcemap && productionSourceMaps(output.client)],
    define: {
      ...options.define,
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
  }) : undefined;
  if (client && (Array.isArray(client) || !('output' in client))) throw new Error('Expected one TinyJS browser build.');
  const clientOutput = client?.output ?? [];
  const entry = clientOutput.find((file) => file.type === 'chunk' && file.isEntry);
  if (routes.browser && (!entry || entry.type !== 'chunk')) throw new Error('TinyJS browser entry was not emitted.');
  if (!routes.browser) await rm(output.client, { recursive: true, force: true });

  await viteBuild({
    ...options,
    ssr: { noExternal: true },
    build: {
      ssr: true,
      minify: true,
      outDir: output.server,
      emptyOutDir: true,
      rolldownOptions: { input: serverId, output: { entryFileNames: 'server.mjs' } },
    },
  });

  const assets: BuildAssets = {
    entry: entry?.fileName ?? null,
    styles: clientOutput.filter((file) => file.type === 'asset' && file.fileName.endsWith('.css')).map((file) => file.fileName),
  };
  // Measure generated assets and optionally write gzip copies for the production server.
  const statistics = clientOutput.filter((file) => file.type === 'chunk' || /\.(css|svg|json)$/.test(file.fileName)).map((file) => {
    const source = file.type === 'chunk' ? file.code : file.source;
    const raw = Buffer.from(source);
    const gzip = gzipSync(raw, { level: 9 });
    return { file: file.fileName, raw: raw.byteLength, gzip: gzip.byteLength, compressed: gzip };
  });
  if (settings.compress) for (const item of statistics) {
    if (item.gzip < item.raw) await writeFile(join(output.client, item.file + '.gz'), item.compressed);
  }
  const pending = `${output.metadata}.tmp`;

  // Follow shared entry imports to measure the JavaScript needed at startup.
  const files = new Set(entry ? [entry.fileName] : []);
  let bytes = 0;
  for (const name of files) {
    const chunk = clientOutput.find((file) => file.fileName === name);
    if (chunk?.type !== 'chunk') continue;
    bytes += statistics.find((item) => item.file === name)!.gzip;
    for (const dependency of chunk.imports) files.add(dependency);
  }
  console.log(`Shared client JS: ${bytes} bytes gzip (goal: 3000 bytes)`);
  const exceeded = statistics.filter((item) => item.file.endsWith('.js') && item.gzip > (settings.budgets?.chunkGzip ?? 150_000));
  const warnings = exceeded.map(item => `Large chunk: ${item.file} (${item.gzip} bytes gzip)`);
  if (bytes > (settings.budgets?.sharedGzip ?? 3000)) warnings.unshift(`Shared client exceeds ${settings.budgets?.sharedGzip ?? 3000} byte gzip budget.`);
  for (const warning of warnings) console.warn(warning);
  await writeFile(join(output.dir, 'stats.json'), JSON.stringify({ durationMs: Math.round(performance.now() - started), sharedGzip: bytes, warnings, assets: statistics.map(({ compressed, ...item }) => item) }, null, 2));
  if (analyze) {
    const { buildAnalysis } = await import('./devtools/build.js');
    const measured = new Map(statistics.map(({ file, raw, gzip }) => [file, { file, raw, gzip }]));
    for (const asset of clientOutput) {
      if (asset.type !== 'asset' || measured.has(asset.fileName)) continue;
      const contents = Buffer.from(asset.source);
      measured.set(asset.fileName, { file: asset.fileName, raw: contents.byteLength, gzip: gzipSync(contents, { level: 9 }).byteLength });
    }
    const chunks = clientOutput.flatMap(file => file.type === 'chunk' ? [file] : []);
    const report = buildAnalysis(root, chunks, [...measured.values()], warnings);
    await writeFile(join(output.dir, 'devtools-build.json'), JSON.stringify(report, null, 2));
  } else {
    await rm(join(output.dir, 'devtools-build.json'), { force: true });
  }
  if (settings.budgets?.fail && (exceeded.length || bytes > (settings.budgets.sharedGzip ?? 3000))) throw new Error('TinyJS performance budget exceeded. See .tinyjs/stats.json.');
  await writeFile(pending, JSON.stringify(assets));
  await rename(pending, output.metadata);
}
