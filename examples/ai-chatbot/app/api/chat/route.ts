// TinyJS calls POST for /api/chat; this server route keeps provider settings out of the browser.
import { AIError, createAI, validateMessages } from 'tinyjs/ai';

export async function POST(request: Request) {
  try {
    // Bound incoming bytes before parsing; Content-Length is not trusted.
    if (!request.body) return new Response('Request body required.', { status: 400 });
    const reader = request.body.getReader();
    let body = ''; let bytes = 0; const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 64_000) return new Response('Request too large.', { status: 413 });
        body += decoder.decode(value, { stream: true });
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    // Validate messages before sending them to the configured provider.
    const data: unknown = JSON.parse(body + decoder.decode());
    const messages: unknown = data && typeof data === 'object' && 'messages' in data ? data.messages : undefined;
    validateMessages(messages);
    const ai = createAI({ provider: 'openai-compatible', baseURL: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL });
    return new Response(await ai.stream({ messages, signal: request.signal }), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    const status = error instanceof SyntaxError || (error instanceof AIError && error.code === 'validation') ? 400
      : error instanceof AIError && error.code === 'limit' ? 413 : 502;
    return new Response(status === 400 ? 'Invalid chat request.' : 'Chat is currently unavailable.', { status });
  }
}
