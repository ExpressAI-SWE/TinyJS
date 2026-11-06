import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build as viteBuild, createServer, isRunnableDevEnvironment, normalizePath } from 'vite';
import type { InlineConfig } from 'vite';
import type { Handler, PageAssets } from './handler.js';
import { httpListener, printAddress } from './http.js';
import { assetBase, outputPaths } from './output.js';
import type { BuildAssets } from './output.js';

const clientId = '/@tinyjs/client';
const serverId = '/@tinyjs/server';
const clientEntry = normalizePath(fileURLToPath(new URL('./browser-entry.js', import.meta.url)));
const serverEntry = normalizePath(fileURLToPath(new URL('./server-entry.js', import.meta.url)));

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
        if (this.environment.config.consumer === 'client' && (isBuiltin(id) || id === 'bun' || id.startsWith('bun:'))) {
          this.error(`Server module ${id} cannot be imported by a TinyJS page or layout.`);
        }
        if (id === clientId) return clientEntry;
        if (id === serverId && this.environment.config.consumer === 'server') return serverEntry;
      },
      transform(_code, id) {
        const file = id.split('?')[0];
        if (this.environment.config.consumer === 'client' && (file.startsWith(apiDir) || file === serverEntry)) {
          this.error(`Server module ${file} cannot be imported by a TinyJS page or layout.`);
        }
      },
    }],
  };
}

export async function dev(root: string, host: string, port: number) {
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
}

export async function build(root: string) {
  const output = outputPaths(root);
  await mkdir(output.dir, { recursive: true });
  await rm(output.metadata, { force: true });
  const options = config(root);
  const client = await viteBuild({
    ...options,
    base: assetBase,
    build: {
      outDir: output.client,
      emptyOutDir: true,
      cssCodeSplit: false,
      modulePreload: false,
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
  const pending = `${output.metadata}.tmp`;
  await writeFile(pending, JSON.stringify(assets));
  await rename(pending, output.metadata);

  const files = new Set([entry.fileName]);
  let bytes = 0;
  for (const name of files) {
    const chunk = client.output.find((file) => file.fileName === name);
    if (chunk?.type !== 'chunk') continue;
    bytes += gzipSync(chunk.code).byteLength;
    for (const dependency of chunk.imports) files.add(dependency);
  }
  console.log(`Shared client JS: ${bytes} bytes gzip (goal: 3000 bytes)`);
}
