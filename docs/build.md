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

The printed shared gzip size includes the entry and static imports, excluding lazy route chunks. The 3,000-byte target is an optimization goal. Navigation/error handling can exceed it; optional feature chunks are measured separately. Configure thresholds and opt-in failures in [configuration](configuration.md).

Client source maps are off by default. `compress: true` writes smaller gzip siblings for supported assets. Production negotiates gzip with `Vary: Accept-Encoding`; hashed assets receive immutable one-year caching. HTML does not receive that asset policy. Deploy server, client, and metadata from one build.

Vite empties output directories. TinyJS removes completion metadata before building and publishes it only after successful client/server builds and budget checks. Resolve failures and rebuild before startup. Run one build at a time and stop the app's server before rebuilding into its directory.

Read actual sizes and duration from `stats.json`. Duration depends on machine, runtime, cache, and application; it is not a comparative benchmark. To check reproducibility, use unchanged inputs/lockfile and compare asset names/content across two builds, excluding recorded duration. Also smoke-test production startup, asset paths, and hydration on each intended runtime.
