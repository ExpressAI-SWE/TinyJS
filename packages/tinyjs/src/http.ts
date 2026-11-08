import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Handler } from './handler.js';

// Adapt Node HTTP requests and responses to the web Request/Response handler.
export function httpListener(handle: Handler) {
  return async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const controller = new AbortController();
    outgoing.once('close', () => {
      if (!outgoing.writableFinished) controller.abort();
    });

    const method = incoming.method ?? 'GET';
    if (method === 'TRACE' || method === 'TRACK') {
      outgoing.writeHead(501, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Implemented');
      return;
    }
    // Validate the request target and copy headers and any body into a web Request.
    let request: Request;
    try {
      const target = incoming.url ?? '/';
      const origin = new URL(`http://${incoming.headers.host ?? 'localhost'}`);
      if (!target.startsWith('/') || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
        throw new TypeError('Invalid request URL');
      }
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      }
      const hasBody = method !== 'GET' && method !== 'HEAD' && (headers.has('content-length') || headers.has('transfer-encoding'));
      // Node and DOM typings describe the same runtime stream with incompatible signatures.
      const body = hasBody ? Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array> : null;
      const init = { method, headers, signal: controller.signal, duplex: 'half', body } as const;
      request = new Request(`${origin.origin}${target}`, init);
    } catch {
      outgoing.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad Request');
      return;
    }

    // Stream the handler response back to Node, preserving separate cookies.
    try {
      const response = await handle(request);
      outgoing.statusCode = response.status;
      if (response.statusText) outgoing.statusMessage = response.statusText;
      for (const [name, value] of response.headers) {
        if (name !== 'set-cookie') outgoing.setHeader(name, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
      if (method === 'HEAD' || !response.body) {
        await response.body?.cancel();
        outgoing.end();
        return;
      }
      await pipeline(response.body, outgoing);
    } catch (error) {
      // Once headers have been sent, close the connection instead of sending a second response.
      if (controller.signal.aborted) return;
      console.error(error);
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      for (const name of outgoing.getHeaderNames()) outgoing.removeHeader(name);
      outgoing.statusMessage = 'Internal Server Error';
      outgoing.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Internal Server Error');
    }
  };
}

export function printAddress(server: Pick<Server, 'address'>) {
  const address = server.address();
  if (address && typeof address !== 'string') {
    const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;
    console.log(`TinyJS listening on http://${host}:${address.port}`);
  }
}
