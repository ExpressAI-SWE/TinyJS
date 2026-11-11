# Production builds and budgets

Run `tinyjs build` in an application root. Vite/Rolldown handles dependency analysis, tree shaking, JavaScript/CSS minification, dynamic-import chunks, and asset hashing. TinyJS preserves lazy page/layout imports; use `import()` or `lazyBrowser` for expensive optional features.

| Path | Purpose |
| --- | --- |
| `.tinyjs/client/assets/` | Hashed browser chunks, stylesheet, and imported assets |
| `.tinyjs/client/.vite/manifest.json` | Production manifest |
| `.tinyjs/server/server.mjs` | Server application module |
| `.tinyjs/build.json` | Completed-build entry and stylesheet metadata |
| `.tinyjs/stats.json` | Duration and per-asset raw/gzip bytes |

CSS is emitted as a shared stylesheet. Keep expensive dependencies inside lazy modules to avoid increasing initial JavaScript. AI and 3D are separate package entry points.

API-only apps without pages or a custom not-found page skip the browser build, remove stale client output, and record `entry: null` with zero shared JavaScript bytes. Symlinked app entries conservatively retain a browser build. Server application bundles are minified.

The printed shared gzip size includes the entry and static imports, excluding lazy route chunks. Production builds omit loading and error-boundary code only when the app has no corresponding files; apps using those files retain their support. The 3,000-byte target is an optimization goal, not an achieved size. See [measured production sizes](performance.md) for shared and complete JavaScript output. Configure thresholds and opt-in failures in [configuration](configuration.md).

Client source maps are off by default. Sizes and gzip siblings use gzip level 9, computed once per asset. `compress: true` writes smaller gzip siblings for supported assets. Production negotiates gzip with `Vary: Accept-Encoding`; hashed assets receive immutable one-year caching. Without compression enabled, gzip statistics describe potential compressed sizes rather than served bytes. HTML does not receive that asset policy. Deploy server, client, and metadata from one build.

Vite empties output directories. TinyJS removes completion metadata before building and publishes it only after successful client/server builds and budget checks. Resolve failures and rebuild before startup. Run one build at a time and stop the app's server before rebuilding into its directory.

Read actual sizes and duration from `stats.json`. Duration depends on machine, runtime, cache, and application; it is not a comparative benchmark. To check reproducibility, use unchanged inputs/lockfile and compare asset names/content across two builds, excluding recorded duration. Also smoke-test production startup, asset paths, and hydration on each intended runtime.

The production HTTP server retains idle keep-alive connections for 120 seconds on Node and Bun. Request/header timeouts retain the runtime defaults; clients may explicitly close their connections. POST requests are never automatically retried by TinyJS.
