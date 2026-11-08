export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
export interface ChatRequest { messages: ChatMessage[]; signal?: AbortSignal; onUsage?: (usage: ChatUsage) => void }
export interface AIProvider {
  chat(request: ChatRequest): Promise<{ text: string; usage?: ChatUsage }>;
  stream(request: ChatRequest): Promise<ReadableStream<Uint8Array>>;
}
export interface AIOptions {
  provider: 'openai-compatible';
  baseURL: string | undefined;
  apiKey?: string;
  model: string | undefined;
  systemPrompt?: string;
  timeoutMs?: number;
  retries?: number;
  maxRequestBytes?: number;
  maxOutputBytes?: number;
  maxTokens?: number;
  fetch?: typeof globalThis.fetch;
}
export class AIError extends Error {
  constructor(public readonly code: 'configuration' | 'validation' | 'upstream' | 'malformed' | 'limit' | 'timeout' | 'cancelled', message: string, public readonly status?: number) {
    super(message); this.name = 'AIError';
  }
}
const encoder = new TextEncoder();
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
function positive(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new AIError('configuration', `${name} must be a positive integer.`);
  return value;
}
export function validateMessages(value: unknown): asserts value is ChatMessage[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(message =>
    !object(message) || !['system', 'user', 'assistant'].includes(String(message.role)) || typeof message.content !== 'string')) {
    throw new AIError('validation', 'Provide between 1 and 100 text messages with valid roles.');
  }
}
function usage(value: unknown): ChatUsage | undefined {
  if (!object(value)) return;
  const result: ChatUsage = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const) {
    if (typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && value[key] >= 0) result[key] = value[key];
  }
  return result;
}
export function createAI(options: AIOptions): AIProvider {
  if (typeof window !== 'undefined') throw new AIError('configuration', 'AI providers must run on the server.');
  if (options.provider !== 'openai-compatible' || !options.baseURL || !options.model) throw new AIError('configuration', 'Set provider, AI_BASE_URL and AI_MODEL.');
  const endpoint = new URL(options.baseURL.replace(/\/$/, '') + '/chat/completions');
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new AIError('configuration', 'Use an HTTP(S) provider URL without credentials.');
  const timeout = positive(options.timeoutMs ?? 30_000, 'timeoutMs');
  const requestLimit = positive(options.maxRequestBytes ?? 64_000, 'maxRequestBytes');
  const outputLimit = positive(options.maxOutputBytes ?? 256_000, 'maxOutputBytes');
  const maxTokens = positive(options.maxTokens ?? 2048, 'maxTokens');
  const retries = options.retries ?? 2;
  if (!Number.isSafeInteger(retries) || retries < 0 || retries > 5) throw new AIError('configuration', 'retries must be between 0 and 5.');

  async function request(input: ChatRequest, streaming: boolean) {
    validateMessages(input.messages);
    const messages = options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }, ...input.messages] : input.messages;
    const body = JSON.stringify({ model: options.model, messages, stream: streaming, max_tokens: maxTokens, ...(streaming ? { stream_options: { include_usage: true } } : {}) });
    if (encoder.encode(body).byteLength > requestLimit) throw new AIError('limit', 'Chat request is too large.');
    const controller = new AbortController();
    const cancel = () => controller.abort(new AIError('cancelled', 'Chat request cancelled.'));
    input.signal?.addEventListener('abort', cancel, { once: true });
    if (input.signal?.aborted) cancel();
    const timer = setTimeout(() => controller.abort(new AIError('timeout', 'Chat request timed out.')), timeout);
    const cleanup = () => { clearTimeout(timer); input.signal?.removeEventListener('abort', cancel); };
    try {
      for (let attempt = 0; ; attempt++) {
        controller.signal.throwIfAborted();
        let response: Response;
        try {
          response = await (options.fetch ?? globalThis.fetch)(endpoint, {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}) }, body,
          });
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          throw new AIError('upstream', 'Could not reach the AI provider.');
        }
        if (response.ok) {
          if (!response.body) throw new AIError('malformed', 'AI provider returned no body.');
          return { response, controller, cleanup };
        }
        await response.body?.cancel();
        if (attempt >= retries || ![408, 429, 500, 502, 503, 504].includes(response.status)) throw new AIError('upstream', `AI provider returned HTTP ${response.status}.`, response.status);
        await new Promise<void>((resolve, reject) => {
          const aborted = () => { clearTimeout(wait); reject(controller.signal.reason); };
          const wait = setTimeout(() => { controller.signal.removeEventListener('abort', aborted); resolve(); }, Math.min(250 * 2 ** attempt, 4000));
          controller.signal.addEventListener('abort', aborted, { once: true });
          if (controller.signal.aborted) aborted();
        });
      }
    } catch (error) { cleanup(); throw error; }
  }
  async function* bounded(response: Response, signal: AbortSignal, limit: number) {
    const reader = response.body!.getReader();
    const aborted = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', aborted, { once: true });
    let bytes = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) return;
        bytes += value.byteLength;
        if (bytes > limit) throw new AIError('limit', 'AI provider response is too large.');
        yield value;
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw error;
    } finally {
      signal.removeEventListener('abort', aborted);
      // Cancellation may reject when the transport has already failed.
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  return {
    async chat(input) {
      const { response, controller, cleanup } = await request(input, false);
      try {
        let text = ''; const decoder = new TextDecoder();
        for await (const chunk of bounded(response, controller.signal, outputLimit)) text += decoder.decode(chunk, { stream: true });
        let data: unknown;
        try { data = JSON.parse(text + decoder.decode()); } catch { throw new AIError('malformed', 'Invalid AI provider JSON.'); }
        const first = object(data) && Array.isArray(data.choices) ? data.choices[0] : undefined;
        if (!object(first) || !object(first.message) || typeof first.message.content !== 'string') throw new AIError('malformed', 'AI provider returned no text completion.');
        const tokens = object(data) ? usage(data.usage) : undefined;
        if (tokens) input.onUsage?.(tokens);
        return { text: first.message.content, usage: tokens };
      } finally { cleanup(); }
    },
    async stream(input) {
      const { response, controller, cleanup } = await request(input, true);
      async function* chunks() {
        const decoder = new TextDecoder(); let pending = ''; let bytes = 0;
        try {
          for await (const chunk of bounded(response, controller.signal, outputLimit * 8)) {
            pending = (pending + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
            let boundary: number;
            while ((boundary = pending.indexOf('\n\n')) >= 0) {
              const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
              const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (!data) continue;
              if (data === '[DONE]') return;
              let parsed: unknown;
              try { parsed = JSON.parse(data); } catch { throw new AIError('malformed', 'Invalid AI streaming event.'); }
              if (!object(parsed) || !Array.isArray(parsed.choices) || parsed.error) throw new AIError('malformed', 'Invalid AI streaming response.');
              const tokens = usage(parsed.usage); if (tokens) input.onUsage?.(tokens);
              const first = parsed.choices[0];
              const content = object(first) && object(first.delta) ? first.delta.content : undefined;
              if (content != null && typeof content !== 'string') throw new AIError('malformed', 'Invalid AI text delta.');
              if (typeof content === 'string' && content) {
                const encoded = encoder.encode(content); bytes += encoded.byteLength;
                if (bytes > outputLimit) throw new AIError('limit', 'AI output is too large.');
                yield encoded;
              }
            }
          }
          throw new AIError('malformed', 'AI stream ended before its completion marker.');
        } finally { controller.abort(); cleanup(); }
      }
      const iterator = chunks();
      return new ReadableStream<Uint8Array>({
        async pull(destination) {
          try { const next = await iterator.next(); if (next.done) destination.close(); else destination.enqueue(next.value); }
          catch (error) { destination.error(error); }
        },
        async cancel() { controller.abort(new AIError('cancelled', 'Chat stream cancelled.')); cleanup(); await iterator.return(undefined); },
      });
    },
  };
}
