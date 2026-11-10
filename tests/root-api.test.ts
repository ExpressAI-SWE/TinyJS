import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    await build(root);
    const { createApplication } = await import(join(root, '.tinyjs/server/server.mjs'));
    const handle = createApplication({ scripts: [] });
    expect(await (await handle(new Request('http://localhost/posts/42'))).json()).toEqual({ id: '42' });
    expect((await handle(new Request('http://localhost/api/posts/42'))).status).toBe(404);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
