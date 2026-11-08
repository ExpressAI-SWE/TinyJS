// These tests check dynamic routes and how matching paths reach pages and API handlers.
import { expect, test } from 'bun:test';
import { h } from 'preact';
import { createHandler } from '../packages/tinyjs/src/handler.js';
import { matchRoute } from '../packages/tinyjs/src/routing.js';
import { defineConfig } from '../packages/tinyjs/src/config.js';

test('dynamic routes have deterministic precedence and decoded catch-all parameters', () => {
 const files = ['/app/users/[id]/page.tsx','/app/users/new/page.tsx','/app/docs/[...slug]/page.tsx'];
 expect(matchRoute(files,'/users/new','/page.tsx')?.params).toEqual({});
 expect(matchRoute(files,'/users/a%2Fb','/page.tsx')?.params).toEqual({id:'a/b'});
 expect(matchRoute(files,'/docs/a/caf%C3%A9','/page.tsx')?.params).toEqual({slug:['a','café']});
 expect(matchRoute(files,'/docs','/page.tsx')).toBeUndefined();
 expect(matchRoute(files,'/users/a/b','/page.tsx')).toBeUndefined();
});

test('SSR passes params and repeated query values, metadata, custom errors and 404', async () => {
 const handle = createHandler({
  '/app/users/[id]/page.tsx': props => h('p',null,JSON.stringify(props)),
  '/app/fail/page.tsx': () => { throw Error('private failure'); },
 }, {}, {'/app/api/users/[id]/route.ts':{GET: (_: Request, ctx: unknown) => Response.json(ctx)}}, {scripts:[]}, {
  notFound: () => h('h1',null,'Custom missing'),
  errors: {'/app/error.tsx':() => h('h1',null,'Try again')},
  metadata: {'/app/users/[id]/page.tsx':{title:'Users <safe>',description:'User details'}},
 });
 const page = await handle(new Request('http://localhost/users/42?q=a&q=b'));
 const text = await page.text();
 expect(text).toContain('42'); expect(text).toContain('&quot;q&quot;:[&quot;a&quot;,&quot;b&quot;]');
 expect(text).toContain('<title>Users &lt;safe'); expect(text).toContain('name="description"');
 expect(await (await handle(new Request('http://localhost/api/users/7'))).json()).toEqual({params:{id:'7'}});
 const missing = await handle(new Request('http://localhost/missing')); expect(missing.status).toBe(404); expect(await missing.text()).toContain('Custom missing');
 const failure = await handle(new Request('http://localhost/fail')); expect(failure.status).toBe(500); const body=await failure.text(); expect(body).toContain('Try again'); expect(body).not.toContain('private failure');
});

test('configuration rejects misspellings and invalid budgets', () => {
 expect(defineConfig({sourcemap:'hidden',compress:true,budgets:{sharedGzip:5000}}).compress).toBe(true);
 expect(() => defineConfig({budgets:{chunkGzip:0}})).toThrow();
 expect(() => defineConfig({compress:'yes'} as never)).toThrow();
 expect(() => defineConfig({unknown:true} as never)).toThrow();
});
