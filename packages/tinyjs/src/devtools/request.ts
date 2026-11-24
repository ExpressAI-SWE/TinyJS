import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import { httpListener } from '../http.js';
import type { Handler } from '../handler.js';
import { isLocalRequest, safeHeaders, safeUrl } from './plugin.js';
import type { createDevTools } from './plugin.js';

export interface RequestTelemetry {
  profiling: boolean;
  match(file: string, params: Record<string, string | string[]>, rendering: 'api' | 'ssr', started?: number): void;
  timing(type: string, started: number): void;
  error(error: unknown, type: string): void;
}

function cacheStatus(headers: Headers) {
  const value = headers.get('cf-cache-status') ?? headers.get('x-cache');
  return value?.match(/^(hit|miss|bypass|dynamic|stale|expired|revalidated|updating)(?:$|\s)/i)?.[1].toUpperCase();
}

export function instrumentRequests(
  server: ViteDevServer,
  { collector, script }: ReturnType<typeof createDevTools>,
  dispatch: (request: Request, inject: boolean, loaded: () => void) => ReturnType<Handler>,
  sourceFile: (file: string, rendering: 'api' | 'ssr') => string,
) {
  const unobserved = httpListener(request => dispatch(request, false, () => {}));
  return (incoming: IncomingMessage, outgoing: ServerResponse) => {
    if (!isLocalRequest(incoming)) return unobserved(incoming, outgoing);

    const started = performance.now();
    const url = safeUrl(incoming.url ?? '/');
    const profiling = collector.profiling;
    let file: string | undefined;
    let rendering: 'api' | 'ssr' | undefined;
    let params: string[] = [];
    let loaded = false;
    let responseHeaders: Record<string, string> | undefined;
    let responseSize: number | undefined;
    let cache: string | undefined;
    let processed: number | undefined;
    let recordedError: unknown;
    let handled = false;
    const observe: RequestTelemetry = {
      profiling,
      match(routeFile, values, mode, resolutionStart) {
        file = sourceFile(routeFile, mode);
        rendering = mode;
        params = Object.keys(values);
        if (resolutionStart !== undefined) observe.timing('Route resolution', resolutionStart);
      },
      timing(type, start) {
        collector.record('timing', {
          type, file, path: url, durationMs: performance.now() - start,
          startTime: performance.timeOrigin + start, startMs: start, requestStartMs: started,
        });
      },
      error(error, type) {
        recordedError = error;
        if (error instanceof Error) server.ssrFixStacktrace(error);
        collector.record('error', {
          type, file, path: url, message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined, requestStartMs: started,
        });
      },
    };
    function finish() {
      outgoing.off('finish', finish);
      outgoing.off('close', finish);
      const durationMs = performance.now() - started;
      if (!handled && outgoing.statusCode >= 400) {
        collector.record('error', { type: 'HTTP request', path: url, message: `HTTP ${outgoing.statusCode}`, requestStartMs: started });
      }
      collector.requestFinished({
        method: incoming.method ?? 'GET', url, path: url, status: outgoing.headersSent ? outgoing.statusCode : 0,
        duration: durationMs, durationMs, serverMs: processed, file, route: file, rendering, params,
        requestHeaders: safeHeaders(incoming.headers), responseHeaders, size: responseSize,
        cache,
        cancelled: !outgoing.writableFinished, requestStartMs: started,
      });
    }
    collector.requestStarted();
    outgoing.once('finish', finish);
    outgoing.once('close', finish);

    return httpListener(async (request) => {
      handled = true;
      Object.defineProperty(request, 'tinyjsDevTelemetry', { value: observe, configurable: true });
      try {
        const response = await dispatch(request, true, () => { loaded = true; });
        processed = performance.now() - started;
        responseHeaders = safeHeaders(response.headers);
        cache = cacheStatus(response.headers);
        const length = response.headers.get('content-length');
        if (!response.body) responseSize = 0;
        else if (length !== null && /^\d+$/.test(length) && Number.isSafeInteger(Number(length))) responseSize = Number(length);
        if (response.status === 400 || response.status === 404 && url !== '/favicon.ico' || response.status === 405) {
          collector.record('error', { type: 'Routing', file, path: url, message: `HTTP ${response.status}`, requestStartMs: started });
        } else if (response.status >= 500 && recordedError === undefined) {
          collector.record('error', { type: rendering === 'api' ? 'API' : 'Response', file, path: url, message: `HTTP ${response.status}`, requestStartMs: started });
        }
        if (profiling) observe.timing('Request handling', started);
        if (response.body && responseSize === undefined) {
          responseSize = 0;
          // Observe the existing HTTP pipeline without cloning or buffering its body.
          const write = outgoing.write;
          outgoing.write = (chunk: unknown, ...args: unknown[]) => {
            if (chunk instanceof Uint8Array) responseSize! += chunk.byteLength;
            else if (typeof chunk === 'string') responseSize! += Buffer.byteLength(chunk);
            return Reflect.apply(write, outgoing, [chunk, ...args]);
          };
        }
        return response;
      } catch (error) {
        if (error !== recordedError || error === undefined) observe.error(error, !loaded ? 'Compilation' : rendering === 'api' ? 'API' : 'Runtime');
        if (profiling) observe.timing('Request handling', started);
        if (rendering !== 'api' && request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
          console.error(error);
          return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>TinyJS development error</title><h1>TinyJS development error</h1><p>Open DevTools to inspect the error.</p><script type="module" src="/@vite/client"></script><script type="module" src="${script}"></script></html>`, {
            status: 500, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
          });
        }
        throw error;
      }
    })(incoming, outgoing);
  };
}
