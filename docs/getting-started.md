# Getting started

Use Bun 1.4.4 and Node 20.19+ in the Node 20 line, or Node 22.12+. From the cloned repository root:

```sh
bun install --frozen-lockfile
bun run compile
bun run dev
```

Visit `http://127.0.0.1:3000`. Root scripts run `examples/basic`; edit its `app/page.tsx` or add a directory containing `page.tsx`. Vite handles development updates; updates can reload the document when a module cannot be hot updated.

```tsx
// app/welcome/page.tsx
export const metadata = { title: 'Welcome', description: 'A TinyJS page' };
export default function Welcome() { return <h1>Hello from TinyJS</h1>; }
```

Use Preact hooks for interactive components. Server handlers live under `app/api`:

```ts
// app/api/time/route.ts
export function GET() { return Response.json({ time: new Date().toISOString() }); }
```

Run another example with `bun run --cwd examples/dynamic-routing dev`; substitute `ai-chatbot`, `three-scene`, `infinite-terrain`, or `lazy-loading`. Each has `dev`, `build`, and `start` scripts. AI needs [server environment configuration](ai.md). Three.js is installed in this workspace for its examples, but remains optional for framework consumers.

Stop dev before `bun run start` (build and serve), or run `bun run build` then `bun run serve`. CLI commands run from the application root. `--host` and `--port` apply to `dev` and `serve`; `--help` describes usage. Use `tinyjs test` for all project tests; see [testing](testing.md) for discovery and prerequisites.

Run `bun run compile`, `bun run typecheck`, and `bun run test` for checks. The test script includes compile, example type checks, unit tests, and browser integration tests. Install Chromium with `bun run browser:install` or set `TINYJS_CHROMIUM_PATH` to an existing executable. These commands describe prerequisites, not a claim that checks pass on every machine.
