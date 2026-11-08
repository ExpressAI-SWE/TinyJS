import { Fragment, h } from 'preact';
import type { ComponentType } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { layoutAncestry, pageTree, queryProps } from './route-tree.js';
import type { PageProps } from './route-tree.js';
import type { Layout } from './route-tree.js';
import { requestPath, matchRoute } from './routing.js';

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

// Build a request handler from the app files discovered by server-entry.ts.
export function createHandler(
  pages: Record<string, ComponentType<PageProps>>,
  layouts: Record<string, Layout>,
  apis: Record<string, ApiModule>,
  assets: PageAssets,
  special: { notFound?: ComponentType<PageProps>; errors?: Record<string, ComponentType<PageProps>>; metadata?: Record<string, { title?: string; description?: string }> } = {},
): Handler {

  async function dispatch(request: Request) {
    let path: string;
    try {
      path = requestPath(new URL(request.url).pathname);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return textResponse('Bad Request', 400);
    }

    // API routes run first and receive the dynamic parameters from the matching URL.
    const apiMatch = matchRoute(Object.keys(apis), path, '/route.ts');
    const api = apiMatch && apis[apiMatch.file];
    if (api) {
      const allowed = apiMethods.filter((method) =>
        typeof api[method] === 'function' || (method === 'HEAD' && typeof api.GET === 'function'),
      );
      if (!allowed.includes(request.method)) return methodNotAllowed(allowed);
      const handle = request.method === 'HEAD' && typeof api.HEAD !== 'function' ? api.GET : api[request.method];
      if (typeof handle !== 'function') throw new TypeError(`Invalid handler for ${request.method} ${path}`);
      const response: unknown = await handle(request, { params: apiMatch?.params ?? {} });
      if (!(response instanceof Response)) throw new TypeError(`Expected a Response from ${request.method} ${path}`);
      return response;
    }

    // Otherwise render a page inside its parent layouts, or use the not-found page.
    const match = matchRoute(Object.keys(pages), path, '/page.tsx');
    const file = match?.file ?? '/app/not-found.tsx';
    const Page = match ? pages[file] : special.notFound;
    if (!Page) return textResponse('Not Found', 404);
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(['GET', 'HEAD']);

    const props: PageProps = { params: match?.params ?? {}, query: queryProps(new URL(request.url).searchParams) };
    const parents = layoutAncestry(file).filter((key) => key in layouts).map((key) => layouts[key]);
    let tree = pageTree(Page, parents, props);
    let status = match ? 200 : 404;
    let rendered: string;
    let errorFile: string | undefined;
    // If rendering fails, try the nearest error page first and then its ancestors.
    try { rendered = renderToString(h(Fragment, null, tree)); } catch (error) {
      let recovered = false;
      for (const candidate of layoutAncestry(file).map((key) => key.replace('layout.tsx', 'error.tsx')).reverse()) {
        if (!special.errors?.[candidate]) continue;
        try {
          tree = pageTree(special.errors[candidate], layoutAncestry(candidate).filter((key) => key in layouts).map((key) => layouts[key]), props);
          rendered = renderToString(h(Fragment, null, tree));
          errorFile = candidate;
          recovered = true;
          break;
        } catch { /* Escalate a failing layout or fallback to its ancestor. */ }
      }
      if (!recovered) throw error;
      status = 500;
    }
    // Send the rendered page and props together so browser-entry.ts can hydrate the same tree.
    const metadata = special.metadata?.[file];
    const document = h('html', { lang: 'en' },
      h('head', null,
        h('meta', { charset: 'utf-8' }),
        h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        h('title', null, metadata?.title ?? 'TinyJS'),
        metadata?.description && h('meta', { name: 'description', content: metadata.description }),
        assets.styles?.map((href) => h('link', { rel: 'stylesheet', href })),
      ),
      h('body', null,
        h('div', { id: 'tinyjs-root', 'data-page': errorFile ?? file, 'data-props': JSON.stringify(props), dangerouslySetInnerHTML: { __html: rendered! } }),
        assets.scripts.map((src) => h('script', { type: 'module', src })),
      ),
    );
    return new Response(`<!doctype html>${renderToString(document)}`, {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // HEAD has the same status and headers as GET, but must not return a body.
  return async (request) => {
    const response = await dispatch(request);
    if (request.method !== 'HEAD' || !response.body) return response;
    await response.body.cancel();
    return new Response(null, response);
  };
}
