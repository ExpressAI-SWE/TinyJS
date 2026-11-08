# AI chat

`tinyjs/ai` is server-only and has no SDK dependency. `tinyjs/ai/client` consumes plain-text Web Streams in the browser. The core runtime imports neither module.

Configure `AI_BASE_URL` (the API base including `/v1` if required), `AI_MODEL`, and `AI_API_KEY` in the server environment. Never use a `VITE_` prefix for secrets. Bun can load local `.env` files; on supported Node use `node --env-file=.env ...` or your deployment's environment settings. Keep local secret files ignored. The provider URL is trusted server configuration and must never come from a chat request.

```ts
import { createAI } from 'tinyjs/ai';

const ai = createAI({
  provider: 'openai-compatible',
  baseURL: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL,
  systemPrompt: 'Answer briefly.',
});
const reply = await ai.chat({ messages: [{ role: 'user', content: 'Hello' }] });
console.log(reply.text, reply.usage);
```

`chat()` returns text and usage metadata when provided. `stream()` returns `ReadableStream<Uint8Array>` containing UTF-8 text, suitable for `new Response(await ai.stream(...))`. Both accept `signal` and `onUsage`. Streaming follows the [OpenAI chat-completions SSE format](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events). Compatible NVIDIA NIM deployments can use the same adapter with their own base URL and model; no live provider compatibility is claimed. Services must support `max_tokens`, streaming and `stream_options.include_usage` for streaming requests.

The exported `AIProvider` interface defines `chat` and `stream`; applications can implement it for other protocols without changing chatbot code. Conversation history is supplied explicitly as `messages`. Nothing is persisted automatically.

Defaults: 100 messages, 64,000 request bytes, 256,000 response bytes (stream framing is separately bounded at eight times that), 2,048 output tokens, 30-second total timeout and two retries. Configure `maxRequestBytes`, `maxOutputBytes`, `maxTokens`, `timeoutMs` and `retries` (0–5). Only HTTP 408, 429, 500, 502, 503 and 504 retry with bounded exponential backoff; completed streams are never replayed. Network errors are surfaced without retries because delivery may already have occurred. `AIError` provides a stable code and optional upstream status without exposing upstream bodies or credentials.

The example in `examples/ai-chatbot` includes a reusable Preact `Chatbot`, history, Stop control and a bounded server route. Run its `dev`, `build` and `start` scripts after exporting the environment variables. Streaming failures after headers are sent terminate the stream; clients should show their retry/error state. Stop cancels the browser request and propagates through the server adapter to the provider.

Before exposing the example publicly, implement application authentication, authorization, rate limits and per-user usage quotas on `/api/chat`. Configure request timeouts/body limits on your hosting proxy too. AI output is displayed as escaped text and is never evaluated or executed. This example deliberately does not render arbitrary model-generated HTML.
