// These tests use fake providers to check AI requests, streaming, limits, and errors without making network calls.
import { expect, test } from 'bun:test';
import { createAI, AIError } from '../packages/tinyjs/src/ai.js';
import { streamChat } from '../packages/tinyjs/src/ai-client.js';

const setup = (fetch: typeof globalThis.fetch, overrides = {}) => createAI({ provider: 'openai-compatible', baseURL: 'https://provider.invalid/v1', model: 'test', fetch, retries: 0, ...overrides });
const mock = (body: string, status = 200) => (async () => new Response(body, { status })) as typeof fetch;

test('AI validates configuration and message limits', async () => {
  expect(() => createAI({ provider: 'openai-compatible', baseURL: undefined, model: 'x' })).toThrow(AIError);
  const ai = setup(mock('{}'));
  await expect(ai.chat({ messages: [] })).rejects.toMatchObject({ code: 'validation' });
  await expect(ai.chat({ messages: [{ role: 'user', content: 'a'.repeat(64_000) }] })).rejects.toMatchObject({ code: 'limit' });
});
test('AI completion preserves history, system prompt, credentials and usage', async () => {
  const ai = setup((async (url, init) => {
    expect(String(url)).toBe('https://provider.invalid/v1/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private');
    expect(JSON.parse(String(init?.body)).messages).toEqual([{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Hi' }]);
    return Response.json({ choices: [{ message: { content: 'Hello' } }], usage: { total_tokens: 3 } });
  }) as typeof fetch, { apiKey: 'private', systemPrompt: 'Be brief' });
  expect(await ai.chat({ messages: [{ role: 'user', content: 'Hi' }] })).toEqual({ text: 'Hello', usage: { total_tokens: 3 } });
});
test('AI streams split SSE frames and reports usage', async () => {
  const source = 'data: {"choices":[{"delta":{"content":"Hello 🌍"}}]}\r\n\r\ndata: {"choices":[],"usage":{"total_tokens":4}}\r\n\r\ndata: [DONE]\r\n\r\n';
  let usage: unknown;
  const ai = setup((async () => new Response(new ReadableStream({ start(c) { for (const byte of new TextEncoder().encode(source)) c.enqueue(new Uint8Array([byte])); c.close(); } }))) as typeof fetch);
  const output = await ai.stream({ messages: [{ role: 'user', content: 'Hi' }], onUsage: value => { usage = value; } });
  expect(await new Response(output).text()).toBe('Hello 🌍');
  expect(usage).toEqual({ total_tokens: 4 });
});
test('AI rejects malformed responses, upstream errors and truncated streams', async () => {
  for (const body of ['not JSON', '{}']) await expect(setup(mock(body)).chat({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toMatchObject({ code: 'malformed' });
  await expect(setup(mock('secret upstream detail', 401)).chat({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toMatchObject({ code: 'upstream', status: 401 });
  const stream = await setup(mock('data: {"choices":[]}\n\n')).stream({ messages: [{ role: 'user', content: 'Hi' }] });
  await expect(new Response(stream).text()).rejects.toMatchObject({ code: 'malformed' });
});
test('AI cancellation and timeout cover pending upstream responses', async () => {
  const pending = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  })) as typeof fetch;
  await expect(setup(pending, { timeoutMs: 5 }).chat({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toMatchObject({ code: 'timeout' });
  const controller = new AbortController(); controller.abort();
  await expect(setup(pending).chat({ messages: [{ role: 'user', content: 'Hi' }], signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
});
test('AI retries bounded retryable status and limits output', async () => {
  let calls = 0;
  const ai = setup((async () => ++calls === 1 ? new Response(null, { status: 503 }) : Response.json({ choices: [{ message: { content: 'ok' } }] })) as typeof fetch, { retries: 1 });
  expect((await ai.chat({ messages: [{ role: 'user', content: 'Hi' }] })).text).toBe('ok');
  expect(calls).toBe(2);
  await expect(setup(mock('x'.repeat(20)), { maxOutputBytes: 10 }).chat({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toMatchObject({ code: 'limit' });
});
test('browser consumer decodes streaming text and rejects HTTP errors', async () => {
  let text = ''; for await (const delta of streamChat(new Response('hello'))) text += delta;
  expect(text).toBe('hello');
  await expect(streamChat(new Response(null, { status: 500 })).next()).rejects.toThrow('500');
});

test('AI streaming times out during body reads and cancels upstream on consumer cancellation', async () => {
  let cancelled = false;
  const hanging = (async () => new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }))) as typeof fetch;
  const stream = await setup(hanging, { timeoutMs: 5 }).stream({ messages: [{ role: 'user', content: 'Hi' }] });
  await expect(new Response(stream).text()).rejects.toMatchObject({ code: 'timeout' });
  expect(cancelled).toBe(true);
  cancelled = false;
  const second = await setup(hanging).stream({ messages: [{ role: 'user', content: 'Hi' }] });
  await second.cancel();
  expect(cancelled).toBe(true);
});
