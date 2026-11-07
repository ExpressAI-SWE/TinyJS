import { h } from 'preact';
import type { ComponentType } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { layoutAncestry, pageTree } from './route-tree.js';
import type { Layout } from './route-tree.js';
import { requestPath, routePath } from './routing.js';

export interface PageAssets {
  scripts: string[];
  styles?: string[];
}

export type Handler = (request: Request) => Response | Promise<Response>;
type ApiModule = Record<string, unknown>;
const apiMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function textResponse(body: string, status: number, headers?: Record<string, string>) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

function methodNotAllowed(methods: string[]) {
  return textResponse('Method Not Allowed', 405, { Allow: methods.join(', ') });
}

export function createHandler(
  pages: Record<string, ComponentType>,
  layouts: Record<string, Layout>,
  apis: Record<string, ApiModule>,
  assets: PageAssets,
): Handler {
  const pageRoutes = new Map(Object.keys(pages).map((file) => [routePath(file, '/page.tsx'), file]));
  const apiRoutes = new Map(Object.entries(apis).map(([file, api]) => [routePath(file, '/route.ts'), api]));

  async function dispatch(request: Request) {
    let path: string;
    try {
      path = requestPath(new URL(request.url).pathname);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return textResponse('Bad Request', 400);
    }

    const api = apiRoutes.get(path);
    if (api) {
      const allowed = apiMethods.filter((method) =>
        typeof api[method] === 'function' || (method === 'HEAD' && typeof api.GET === 'function'),
      );
      if (!allowed.includes(request.method)) return methodNotAllowed(allowed);
      const handle = request.method === 'HEAD' && typeof api.HEAD !== 'function' ? api.GET : api[request.method];
      if (typeof handle !== 'function') throw new TypeError(`Invalid handler for ${request.method} ${path}`);
      const response: unknown = await handle(request);
      if (!(response instanceof Response)) throw new TypeError(`Expected a Response from ${request.method} ${path}`);
      return response;
    }

    const file = pageRoutes.get(path);
    if (!file) return textResponse('Not Found', 404);
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(['GET', 'HEAD']);

    const tree = pageTree(pages[file], layoutAncestry(file).filter((key) => key in layouts).map((key) => layouts[key]));
    const document = h('html', { lang: 'en' },
      h('head', null,
        h('meta', { charset: 'utf-8' }),
        h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        h('title', null, 'TinyJS'),
        assets.styles?.map((href) => h('link', { rel: 'stylesheet', href })),
      ),
      h('body', null,
        h('div', { id: 'tinyjs-root', 'data-page': file }, tree),
        assets.scripts.map((src) => h('script', { type: 'module', src })),
      ),
    );
    return new Response(`<!doctype html>${renderToString(document)}`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return async (request) => {
    const response = await dispatch(request);
    if (request.method !== 'HEAD' || !response.body) return response;
    await response.body.cancel();
    return new Response(null, response);
  };
}
