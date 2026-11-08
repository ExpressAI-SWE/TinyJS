import { expect, test } from 'bun:test';
import { createEdgeHandler } from '../packages/tinyjs/src/edge.js';

test('Web adapter routes application requests and caches static assets', async () => {
  const handle = createEdgeHandler({
    application: () => Response.json({ page: true }),
    assets: { fetch: () => new Response('export {}', { headers: { 'Content-Type': 'text/javascript' } }) },
  });
  expect(await (await handle(new Request('https://example.com/page'))).json()).toEqual({ page: true });
  const asset = await handle(new Request('https://example.com/_tinyjs/assets/client-abc.js'));
  expect(asset.headers.get('cache-control')).toContain('immutable');
  expect(asset.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await asset.text()).toBe('export {}');
  const head = await handle(new Request('https://example.com/_tinyjs/assets/client-abc.js', { method: 'HEAD' }));
  expect(head.body).toBeNull();
  expect((await handle(new Request('https://example.com/_tinyjs/assets/x.js', { method: 'POST' }))).status).toBe(405);
  expect((await handle(new Request('https://example.com/_tinyjs/build.json'))).status).toBe(404);
});

test('adapter keeps upstream failures private and does not cache missing assets', async () => {
  const errors: unknown[] = [];
  const handle = createEdgeHandler({
    application: () => { throw new Error('private stack'); },
    assets: { fetch: () => new Response('missing', { status: 404 }) },
    onError: (error) => errors.push(error),
  });
  const response = await handle(new Request('https://example.com/'));
  expect(response.status).toBe(500);
  expect(await response.text()).toBe('Internal Server Error');
  expect(errors).toHaveLength(1);
  expect((await handle(new Request('https://example.com/_tinyjs/assets/x.js'))).headers.has('cache-control')).toBe(false);
});
