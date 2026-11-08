# Migrating from Stage 1

Existing static pages, nested layouts, Web API routes, and client/server output paths remain valid. Replace native `tinyjs start` with `tinyjs serve`. The complete native CLI is `dev`, `build`, `serve`, and `test`; see [testing](testing.md). Recompile TinyJS and rebuild apps after updating; deploy all output from the same build.

- Pages may receive `{ params, query }`; components ignoring props need no change. `[name]` and terminal `[...name]` now denote route patterns rather than literal bracketed paths. Static routes take precedence.
- Internal anchors now navigate on the client. Add `data-reload` where a document reload is needed. Modified clicks, downloads, external links, and explicit targets retain browser behavior.
- Add root `not-found.tsx` and directory `error.tsx` / `loading.tsx` as needed. Loading files describe client transitions, not async SSR pages.
- Page metadata exports support title and description. Arbitrary head tags and async page-data loading are not provided.
- Keep private code in API routes or `.server.*` modules. Client imports of these modules, Node/Bun built-ins, and `tinyjs/ai` are rejected. Use `lazyBrowser` for modules needing browser globals at import time.
- Three.js is optional for consumers; AI requires server environment configuration and no provider SDK.
- `tinyjs.config.json` adds source maps, optional gzip output, and budgets. Shared navigation functionality can exceed the existing 3,000-byte gzip target. Warnings fail builds only with `budgets.fail`.
- Hashed assets receive immutable caching headers. Keep HTML/server/client deployments consistent and avoid overwriting an active build directory.

Run compile, example type checks, unit/browser tests, and a production build. Verify direct URLs, refreshes, client navigation, and hydration in your app. [Deployment](deployment.md) distinguishes the Node/Bun server from the experimental Web adapter; Edge compatibility is not automatic.
