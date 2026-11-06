import { expect, test } from 'bun:test';
import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { createHandler } from '../packages/tinyjs/src/handler.js';
import { layoutAncestry } from '../packages/tinyjs/src/route-tree.js';
import { requestPath, routePath } from '../packages/tinyjs/src/routing.js';

test('maps static files to encoded routes and finds layouts from root to leaf', () => {
  expect(routePath('/app/page.tsx', '/page.tsx')).toBe('/');
  expect(routePath('/app/api/route.ts', '/route.ts')).toBe('/api');
  expect(routePath('/app/about/café & tea/page.tsx', '/page.tsx')).toBe('/about/caf%C3%A9%20%26%20tea');
  expect(requestPath('/about/caf%c3%a9%20%26%20tea/')).toBe('/about/caf%C3%A9%20%26%20tea');
  expect(requestPath('/about%2Fteam')).toBe('/about%2Fteam');
  expect(layoutAncestry('/app/about/team/page.tsx')).toEqual([
    '/app/layout.tsx', '/app/about/layout.tsx', '/app/about/team/layout.tsx',
  ]);
});

test('renders nested layouts and escapes page content and asset attributes', async () => {
  const untrusted = '<script>alert("hi")</script>&';
  const handle = createHandler({ '/app/about/team/page.tsx': () => h('h1', { title: untrusted }, untrusted) }, {
    '/app/layout.tsx': ({ children }: { children: ComponentChildren }) => h('main', null, children),
    '/app/about/layout.tsx': ({ children }: { children: ComponentChildren }) => h('section', null, children),
  }, {}, { scripts: ['/client.js?x=1&y=2'] });
  const response = await handle(new Request('http://localhost/about/team/?q=ignored'));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  const html = await response.text();
  expect(html).toStartWith('<!doctype html>');
  expect(html).toMatch(/<main><section><h1 title="&lt;script(?:>|&gt;)alert\(&quot;hi&quot;\)&lt;\/script(?:>|&gt;)&amp;">/);
  expect(html).toMatch(/&lt;script(?:>|&gt;)/);
  expect(html).not.toContain('<script>alert');
  expect(html).toContain('/client.js?x=1&amp;y=2');
  expect((await handle(new Request('http://localhost/about'))).status).toBe(404);
  expect((await handle(new Request('http://localhost/%FF'))).status).toBe(400);
});

test('dispatches Request and Response, honors explicit HEAD and reports supported methods', async () => {
  const handle = createHandler({}, {}, {
    '/app/api/route.ts': {
      GET: () => Response.json({ ok: true }),
      HEAD: () => new Response(null, { status: 202, headers: { 'X-Head': 'custom' } }),
      POST: async (request: Request) => Response.json(await request.json(), { status: 201 }),
    },
    '/app/api/get-only/route.ts': { GET: () => new Response('body', { headers: { 'X-Head': 'fallback' } }) },
  }, { scripts: [] });
  const post = await handle(new Request('http://localhost/api', { method: 'POST', body: '{"value":7}' }));
  expect(post.status).toBe(201);
  expect(await post.json()).toEqual({ value: 7 });
  const head = await handle(new Request('http://localhost/api', { method: 'HEAD' }));
  expect(head.status).toBe(202);
  expect(head.headers.get('X-Head')).toBe('custom');
  const fallback = await handle(new Request('http://localhost/api/get-only', { method: 'HEAD' }));
  expect(fallback.body).toBeNull();
  expect(fallback.headers.get('X-Head')).toBe('fallback');
  const rejected = await handle(new Request('http://localhost/api', { method: 'PATCH' }));
  expect(rejected.status).toBe(405);
  expect(rejected.headers.get('Allow')).toBe('GET, HEAD, POST');
});
