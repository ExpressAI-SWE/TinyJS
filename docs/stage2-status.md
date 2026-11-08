# Stage 2 verification and continuation

Verified on 7 November 2026, based on Stage 1 commit `a2f2930`, on branch `feat/stage-2`.
Remote `main` is the default; both `main` and `master` pointed to that same Stage 1 commit. The requested `master` is the PR base.

## Implemented

- Build: Vite/Rolldown route splitting and shared chunks, existing minification/tree shaking/hashing, manifest, raw/gzip statistics, configurable client source maps, optional gzip files and serving, immutable asset caching, budget warnings/failures, stale output cleanup and completed-build marker.
- Routing: static/dynamic/catch-all routes, parameter and repeated-query props, nested layouts, custom 404, ancestor rendering fallbacks, client error boundaries, destination loading UI, lazy navigation, cancellation/race protection, browser history, explicit prefetch hints, title/description metadata, SSR-safe browser components.
- Optional Three.js: browser-only initialization, native scene/camera/renderer access, resize/input/animation/delta/visibility lifecycle, asset preloading, scene transitions, diagnostics and GPU cleanup.
- Terrain: seeded matching chunk boundaries, camera-centered bounded chunk window, unload/dispose, procedural bus, controls/follow camera, lighting/shadows/fog, restart/loading/FPS UI.
- AI: provider interface, configurable OpenAI-compatible server adapter, UTF-8 streaming, cancellation/timeouts, bounded retryable HTTP backoff, validation/limits/usage, browser consumer and reusable chatbot.
- Resource loading: eager/lazy/explicit predictive loads, deduplication, subscriber cancellation, concurrency/priority, bounded cache/disposal, progress, hover/viewport hints and reduced-data handling.
- Tooling/deployment: typed package subpaths/declarations, configuration validation, route diagnostics, working Vite reloads and route discovery, process shutdown, Node/Bun production server and experimental Web adapter.
- Six examples and guides linked from the README.

## Actual checks

| Check | Result |
| --- | --- |
| Untouched Stage 1 snapshot `bun run test` | 6 passed, 0 failed; Node/Bun dev and standalone production with Chrome |
| `bun install --frozen-lockfile` | Passed; lockfile unchanged by final install |
| `bun run compile` | Passed |
| `bun run typecheck` | Passed for all six examples |
| `bun run test` | 38 passed, 0 failed; 471 assertions across 11 files; Bun reported 66.80 s |
| `bun run build` | Passed for basic website |
| Each other example's `build` script | Passed: AI chatbot, scene, terrain, dynamic routing, lazy loading |
| Production browser regression | Passed navigation, refresh, repeated query/params, 404, ancestor/client errors, destination loading, cancellation races, browser-only imports, metadata, gzip/cache, manifest, byte-identical repeated builds and stale-file cleanup |
| WebGL browser regression | Passed mounting, resizing, failed-setup cancellation, scene switching, travel with 25 chunks, disposal |
| Security regression | Passed API/provider/`.server` browser import rejection and server-only marker isolation |
| Development browser regression | Passed source updates and newly discovered routes on Node and Bun |
| `git diff --check` | Passed |

Chrome was supplied through `TINYJS_CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`. Initial browser download failed DNS resolution; installed Chrome supplied equivalent browser coverage. Local servers/browser tests required execution outside the desktop filesystem/network sandbox. No provider keys or paid inference were used.

Independent reviews identified and corrected ancestor SSR/hydration fallback differences, client error handling, destination loading selection, failed-scene cancellation, and light-shadow disposal. Expanded regression tests also exposed and fixed Vite's extensionless SSR-entry reload issue.

## Remaining acceptance work

1. **Actual Edge runtime verification:** `tinyjs/edge` has Bun Web API tests only. No target platform runtime or asset binding is configured here. Bundle a Web-compatible application for a chosen runtime, configure its assets binding, and verify SSR, API streams, static caching, HEAD, cancellation and errors there. Do not treat the default Node server as an Edge bundle.
2. **Payload target:** basic shared client is 7,155 bytes gzip, exceeding the 3,000-byte optimization target. Stage 1 was already 5,573 bytes. Optional Three.js remains a large lazy chunk. Further runtime reduction is future optimization work; no target-compliance claim is made.
3. Node 24.20.0 and Bun 1.4.4 were tested; the declared minimum Node versions were not separately installed/tested. No live NIM/provider compatibility or production deployment was attempted.
4. Real integrated-GPU frame rate and long-duration GPU memory profiling remain unmeasured. Chrome used SwiftShader for deterministic WebGL coverage. The example has simple vehicle movement without a physics simulation.

The PR remains a draft because actual Edge verification is incomplete. See [performance measurements](performance.md) for conditions and limits. No release or deployment is included.
