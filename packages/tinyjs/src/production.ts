import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Handler, PageAssets } from './handler.js';
import { httpListener, printAddress } from './http.js';
import { assetBase, outputPaths } from './output.js';
import type { BuildAssets } from './output.js';

const assetTypes = new Map([
  ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'],
  ['.avif', 'image/avif'], ['.ico', 'image/x-icon'], ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'], ['.wasm', 'application/wasm'],
]);

const plainText = { 'Content-Type': 'text/plain; charset=utf-8' };

// Load the completed build and connect its application handler to a Node server.
export async function start(root: string, host: string, port: number) {
  const output = outputPaths(root);
  const metadata = await readFile(output.metadata, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('No completed TinyJS build. Run tinyjs build first.');
  });
  const assets = JSON.parse(metadata) as BuildAssets;
  const { createApplication } = await import(pathToFileURL(join(output.server, 'server.mjs')).href) as {
    createApplication: (assets: PageAssets) => Handler;
  };
  const handle = createApplication({
    scripts: assets.entry ? [assetBase + assets.entry] : [],
    styles: assets.styles.map((file) => assetBase + file),
  });

  const server = createServer(httpListener(async (request) => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(assetBase)) return handle(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { ...plainText, Allow: 'GET, HEAD' } });
    }
    // Only serve generated asset names from the client output directory.
    const file = path.slice(assetBase.length);
    if (!/^assets\/[\w.-]+$/.test(file) || file === 'assets/.' || file === 'assets/..') {
      return new Response('Not Found', { status: 404, headers: plainText });
    }
    try {
      let compressed = false;
      let content: Buffer;
      // Prefer a precompressed asset when the browser accepts gzip, otherwise serve the original.
      const acceptsGzip = (request.headers.get('accept-encoding') ?? '').split(',').some((entry) => {
        const [encoding, ...parameters] = entry.trim().split(';');
        return encoding === 'gzip' && !parameters.some((parameter) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(parameter));
      });
      try {
        if (!acceptsGzip) throw Object.assign(new Error('No gzip requested'), { code: 'ENOENT' });
        content = await readFile(join(output.client, file + '.gz'));
        compressed = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        content = await readFile(join(output.client, file));
      }
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(content), {
        headers: {
          'Content-Type': assetTypes.get(extname(file)) ?? 'application/octet-stream',
          'Content-Length': String(content.byteLength),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=31536000, immutable',
          Vary: 'Accept-Encoding',
          ...(compressed ? { 'Content-Encoding': 'gzip' } : {}),
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return new Response('Not Found', { status: 404, headers: plainText });
    }
  }));
  // Keep connections open across idle clients' next write; never retry a POST.
  server.keepAliveTimeout = 120_000;
  server.listen(port, host);
  await once(server, 'listening');
  printAddress(server);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
}
