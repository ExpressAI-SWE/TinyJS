import type { Handler } from './handler.js';

export interface EdgeOptions {
  /** The generated createApplication handler; bundle it for the target runtime. */
  application: Handler;
  /** A platform binding serving .tinyjs/client files under /_tinyjs/. */
  assets: { fetch(request: Request): Response | Promise<Response> };
  onError?: (error: unknown) => void;
}

/** Web-only adapter: filesystem access and Node server startup stay outside it. */
export function createEdgeHandler(options: EdgeOptions): Handler {
  return async (request) => {
    try {
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/_tinyjs/')) return await options.application(request);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      if (!/^\/_tinyjs\/assets\/[\w.-]+$/.test(path) || /\/\.{1,2}$/.test(path)) {
        return new Response('Not Found', { status: 404 });
      }
      const response = await options.assets.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      if (response.ok) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (request.method === 'HEAD') await response.body?.cancel();
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status, statusText: response.statusText, headers,
      });
    } catch (error) {
      options.onError?.(error);
      return new Response('Internal Server Error', { status: 500 });
    }
  };
}
