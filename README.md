# TinyJS

TinyJS is a small full-stack TypeScript framework using Preact for SSR and hydration, and Vite 8 with Rolldown and Oxc for builds and development. Stage 2 adds dynamic routing, client navigation, optional AI and Three.js modules, resource loading, and production diagnostics.

## Scaffold a web application

See the [interactive project initializer](docs/scaffolding.md) for local setup, starter templates, customization flags, and unified validation. TinyJS currently scaffolds Web applications only. Desktop and Mobile support are planned but not implemented.

## Run the example

Use Bun 1.4.4 and a Vite 8-compatible Node.js version (20.19+ in the Node 20 line, or 22.12+).

```sh
bun install --frozen-lockfile
bun run compile
bun run browser:install
bun run test
bun run dev
```

Visit [http://127.0.0.1:3000](http://127.0.0.1:3000). The home page has a hydrated counter, `/about` uses a nested layout, and `/api/hello` returns JSON. If Chromium is already installed, set `TINYJS_CHROMIUM_PATH` to its executable and skip `bun run browser:install`.

Stop development with Ctrl+C, then run the production example.

```sh
bun run build
bun run start
```

`bun run test` compiles the framework CLI and type-checks the examples before running unit and Chromium integration tests. Both servers accept `--host` and `--port`, and bind to `127.0.0.1:3000` by default.

## Application conventions

| File | Behavior |
| --- | --- |
| `app/page.tsx` | Default-exported Preact page at `/` |
| `app/about/page.tsx` | Default-exported Preact page at `/about` |
| `app/users/[id]/page.tsx` | Dynamic route with `params.id` |
| `app/docs/[...slug]/page.tsx` | Terminal catch-all with `params.slug` array |
| `app/layout.tsx`, `app/about/layout.tsx` | Optional default-exported wrappers receiving `children` |
| `app/error.tsx`, `app/about/error.tsx` | Rendering-error fallbacks |
| `app/loading.tsx` | Client-navigation loading fallback |
| `app/not-found.tsx` | Custom root 404 page |
| `app/api/hello/route.ts` | Server-only handlers at `/api/hello` |

Pages receive `{ params, query }` and can export `metadata` with `title` and `description`. API handlers export HTTP method names, accept a Web `Request` and optional parameter context, and return a Web `Response` or promise. `HEAD` falls back to `GET`. Pages and layouts render synchronously and hydrate in the browser. Keep private code in `app/api/` or `.server.*` modules. CSS is emitted as a shared stylesheet in production.

Ordinary internal anchors use client navigation. Add `data-reload` for full document navigation or `data-prefetch` for a hover hint.

`tinyjs dev`, `tinyjs build`, `tinyjs serve`, and `tinyjs test` are the complete native CLI and run from the project directory. An npm installation uses the same CLI on Node without Bun. `tinyjs build` writes the browser assets and server module to `.tinyjs/client` and `.tinyjs/server`. `tinyjs serve` serves that output without loading Vite and reserves `/_tinyjs/` for generated assets. Run one build at a time per app and stop the production server before rebuilding in its directory.

`tinyjs test` discovers JavaScript and TypeScript tests, reports passed/failed/skipped counts, and exits nonzero on failures or missing prerequisites. See [testing conventions and runtime prerequisites](docs/testing.md). Native `tinyjs start` is replaced by `tinyjs serve`; example `start` scripts build and then serve.

The build emits hashed assets, lazy route chunks, a manifest, raw/gzip statistics, and configurable budget warnings. The shared-client 3,000-byte gzip target excludes lazy route and optional feature chunks and remains unmet. Production omits support code for absent loading/error files and uses gzip level 9 for statistics and optional compressed assets. See [measured sizes](docs/performance.md) and `.tinyjs/stats.json` for actual output. No comparative speed claim is made.

## Optional modules and examples

| Import | Purpose | Example |
| --- | --- | --- |
| `tinyjs/ai`, `tinyjs/ai/client` | Server provider and browser streaming consumer | [AI chatbot](examples/ai-chatbot) |
| `tinyjs/three`, `tinyjs/terrain` | Game lifecycle and bounded terrain | [Scene](examples/three-scene), [terrain bus](examples/infinite-terrain) |
| `tinyjs/loading` | Deduplicated, cancellable resource loading | [Lazy loading](examples/lazy-loading) |
| `tinyjs/client` | SSR-safe `ClientOnly` and `lazyBrowser` | [SSR guide](docs/ssr.md) |
| `tinyjs/routing` | Page prop types | [Dynamic routing](examples/dynamic-routing) |
| `tinyjs/config` | Configuration validation and types | [Configuration](docs/configuration.md) |
| `tinyjs/edge` | Experimental Web adapter | [Deployment](docs/deployment.md) |

Three.js is an optional peer dependency and is not loaded by apps that do not import it. AI has no provider SDK dependency; credentials stay server-side. Public AI endpoints need application authentication, rate limits, and quotas.

## Guides

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Routing](docs/routing.md)
- [SSR and hydration](docs/ssr.md)
- [Build optimization](docs/build.md)
- [AI chatbot](docs/ai.md)
- [Three.js and terrain](docs/three.md)
- [Loading strategies](docs/loading.md)
- [Deployment](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Migration from Stage 1](docs/migration.md)

The Web adapter is experimental and has not been verified in a deployed Edge runtime. See deployment requirements and limitations in its guide.

See the [Stage 2 verification report](docs/stage2-status.md) and [recorded performance measurements](docs/performance.md) for actual results and remaining acceptance work.

Set `rootApiRoutes: true` in `tinyjs.config.json` to mount API handlers without the `/api` prefix. Keep handler files in `app/api`.
