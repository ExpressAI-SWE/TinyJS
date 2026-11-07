# TinyJS

TinyJS is a small full-stack JavaScript framework. It uses Preact for server rendering and browser hydration and Vite 8 with Rolldown and Oxc for development and production builds.

## Run the example

Use Bun 1.4.4 and a Vite 8-compatible Node.js version (20.19+ in the Node 20 line, or 22.12+).

```sh
bun install --frozen-lockfile
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

`bun run test` compiles the framework CLI and type-checks the example before running unit and Chromium integration tests. To compile the CLI by itself, run `bun run compile`. Both servers accept `--host` and `--port`, and bind to `127.0.0.1:3000` by default.

## Application conventions

| File | Behavior |
| --- | --- |
| `app/page.tsx` | Default-exported Preact page at `/` |
| `app/about/page.tsx` | Default-exported Preact page at `/about` |
| `app/layout.tsx`, `app/about/layout.tsx` | Optional default-exported wrappers receiving `children` |
| `app/api/hello/route.ts` | Server-only handlers at `/api/hello` |

Routes use literal directory names. API handlers export HTTP method names such as `GET` or `POST`, accept a Web `Request`, and return a Web `Response` or a promise of one. `HEAD` falls back to `GET` where available. Pages and layouts render synchronously and run in the browser during hydration. Keep Node, Bun, and private server code under `app/api/`. CSS imported by the page tree is emitted as a shared stylesheet in production.

`tinyjs dev`, `tinyjs build`, and `tinyjs start` run from the app directory. An npm installation uses the same CLI on Node without Bun. `tinyjs build` writes the browser assets and server module to `.tinyjs/client` and `.tinyjs/server`. `tinyjs start` serves that output without loading Vite and reserves `/_tinyjs/` for generated assets. Run one build at a time per app and stop the production server before rebuilding in its directory.

The build prints the gzip size of the shared client entry and its static imports, excluding lazy page and layout chunks. The 3,000-byte budget is a goal. The foundation uses static routes, full-page hydration, and TinyJS-managed Vite configuration.
