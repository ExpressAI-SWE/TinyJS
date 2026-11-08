# TinyJS playground

From the workspace root, run `bun install`, `bun run compile`, then `bun run dev`.
Build with `bun run build`; serve that production output with `bun run --cwd examples/basic serve`.

- `/`: server-rendered showcase with a hydrated counter.
- `/docs`, `/docs/routing`, `/docs/games`: MDX guides with code and live Preact content.
- `/games`: lazy Three.js crystal collection and seeded terrain driving, with pause, resume, restart, and disposal on navigation.
- `/lab`: a real `/api/hello` fetch, local Preact filtering, and links to dynamic pages.
- `/lab/items/:id?from=lab`: actual TinyJS route parameters and query props.

Docs source lives in `content/*.mdx`. The demo's `docs:build` script uses the official `@mdx-js/mdx` compiler with `jsxImportSource: 'preact'`. Dev and build compile it before TinyJS starts; after editing MDX during development, run `bun run --cwd examples/basic docs:build` again. The resulting JSX modules are intentionally included with this example so it also works when the app directory is copied as a standalone test fixture. Do not edit generated modules directly. MDX is trusted source code, not user input. This example demonstrates precompilation, not native `.mdx` route discovery.

Game lifecycle is isolated in `app/games/player.tsx`; each scene owns its GPU resources. The terrain scene removes streamed chunks in its cleanup callback; TinyJS disposes the remaining scene resources and renderer. Games start only after pressing Start, including for reduced-motion users. Crystal collection supports keyboard and pointer/touch movement; terrain driving requires a keyboard. WebGL errors are visible and restartable. The terrain demo uses procedural movement, not collision physics.

Run `bun test tests/playground.test.ts` after compiling the framework. It rebuilds docs and the demo, checks dev and production routes and interactions, renders both games, and verifies canvas cleanup. Set `TINYJS_CHROMIUM_PATH` to an existing Chromium executable if Playwright's browser is not installed. The build currently reports the framework's shared-JS budget warning and a large lazy Three.js chunk; Three.js is not downloaded until a game starts.
