import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from '../packages/tinyjs/dist/vite.js';

test('production build can mount file-based APIs at the root', async () => {
  const root = await mkdtemp(join(import.meta.dir, '../.tinyjs-root-api-'));
  try {
    const route = join(root, 'app/api/posts/[id]');
    await mkdir(route, { recursive: true });
    await writeFile(join(route, 'route.ts'),
      'export const GET = (_, { params }) => Response.json(params);');
    await writeFile(join(root, 'tinyjs.config.json'), '{"rootApiRoutes":true}');
    const stale = join(root, '.tinyjs/client/assets/old.js');
    await mkdir(join(root, '.tinyjs/client/assets'), { recursive: true });
    await writeFile(stale, 'old browser build');
    await build(root);
    await expect(readFile(stale)).rejects.toThrow();
    expect(JSON.parse(await readFile(join(root, '.tinyjs/build.json'), 'utf8'))).toEqual({ entry: null, styles: [] });
    const stats = JSON.parse(await readFile(join(root, '.tinyjs/stats.json'), 'utf8'));
    expect(stats.sharedGzip).toBe(0);
    expect(stats.assets).toEqual([]);
    const { createApplication } = await import(join(root, '.tinyjs/server/server.mjs'));
    const handle = createApplication({ scripts: [] });
    expect(await (await handle(new Request('http://localhost/posts/42'))).json()).toEqual({ id: '42' });
    expect((await handle(new Request('http://localhost/api/posts/42'))).status).toBe(404);

    // A custom 404 can be interactive even when there are no ordinary pages.
    await writeFile(join(root, 'app/not-found.tsx'), "export default () => 'Not found';");
    await build(root);
    const assets = JSON.parse(await readFile(join(root, '.tinyjs/build.json'), 'utf8'));
    expect(typeof assets.entry).toBe('string');
    expect((await readFile(join(root, '.tinyjs/client', assets.entry))).byteLength).toBeGreaterThan(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
