# Recorded performance measurements

## Production size optimization — 8 November 2026

Built all six checked-in examples with Node 24.20.0, Bun 1.4.4's frozen lockfile, Vite 8.3.6, and Preact 10.29.8. Sizes below come from actual `.tinyjs/stats.json` output using the Node CLI. JavaScript remains minified by Vite/Oxc. The change removes loading-route matching and error-boundary scaffolding only from applications without the corresponding files, and uses gzip level 9 for statistics and optional compressed files. Development retains both code paths.

| App | Shared JS, gzip bytes | All emitted JS, raw bytes | All emitted JS, gzip bytes |
| --- | ---: | ---: | ---: |
| Basic | 6,524 | 18,981 | 8,524 |
| Dynamic routing | 6,533 | 16,661 | 7,564 |
| AI chatbot | 6,457 | 19,613 | 8,573 |
| Lazy loading | 7,577 | 20,792 | 9,101 |
| Three.js scene | 6,724 | 764,822 | 195,405 |
| Infinite terrain | 6,721 | 768,352 | 197,146 |
| Arithmetic mean | 6,756 | 268,203.5 | 71,052.17 |

The shared static-import closure excludes lazy routes and optional dependencies. All emitted JS includes every route and optional chunk, counting each file once; neither column includes HTML, styles, images, manifests, source maps, or server bundles. The six-example mean is a reproducible sample, not a prediction for arbitrary websites. Gzip sizes sum separately compressed files, not a concatenated archive. Enable `compress: true` to serve gzip siblings; the default still serves raw files. Node and Bun can produce different valid gzip encodings and byte counts.

Before these changes, a fresh Node build of the same six examples averaged **7,398.17 bytes gzip** for shared JS, using the original default gzip level. The optimized mean is **6,756 bytes**, an **8.68% reduction**. Basic improved from **7,155 to 6,524 bytes**. The smallest shared output in this sample is the AI chatbot's **6,457 bytes**; the smallest complete JS output is dynamic routing's **7,564 bytes gzip / 16,661 bytes raw**.

**The requested size below 3,072 bytes is not achieved.** In the basic app alone, the minified Preact core is **10,400 bytes raw / 4,385 bytes gzip at level 9**, before TinyJS navigation, hydration setup, page code, or hooks. The existing Preact runtime and required behavior are retained. These are the smallest outputs obtained in this optimization, not a proof of a theoretical minimum across all possible implementations. Replacing the runtime, dropping behavior, externalizing dependencies, or counting only the entry chunk would not establish the requested result for the existing application.

Verification: framework compilation, all six example type checks, all six production builds, and `bun test --timeout 30000` (**38 passed, 0 failed**). Tests cover Node/Bun serving, hydration, navigation, loading/error fallbacks, symlinked routes, gzip round trips and sizes, and reproducible builds. The longer timeout accommodates Windows cleanup; no test timeout configuration was changed.

## Earlier measurements

Single-run observations on 7 November 2026, Windows x64, Intel Core i5-1155G7 at 2.50 GHz, 7.79 GiB physical RAM reported by Node, Node 24.20.0, Bun 1.4.4, Vite 8.3.6, TypeScript 5.9.3. These are local samples, not comparative benchmarks or guarantees. Background load and filesystem caches were not controlled.

The Stage 1 snapshot at `a2f2930` used its frozen lockfile and was built separately with its original CLI. Vite reported 633 ms client and 411 ms SSR build phases; its shared static client closure measured **5,573 bytes gzip**. That snapshot's six tests passed. The temporary snapshot was removed after verification.

Stage 2 adds client navigation, route matching, loading and error handling. Its final basic build reported **1.03 s client / 136 ms SSR**, and **7,155 bytes gzip** for the shared static client closure. The 3,000-byte target is unmet for both snapshots. Differences in single-run build time do not establish a performance improvement or regression.

Other Stage 2 samples, measured with `.tinyjs/stats.json` during sequential Bun CLI builds:

| App | Build work measured by TinyJS (ms) | Shared static JS (gzip bytes) |
| --- | ---: | ---: |
| AI chatbot | 654 | 7,094 |
| Three.js scene | 1,742 | 7,378 |
| Infinite terrain | 1,688 | 7,377 |
| Dynamic routing | 725 | 7,162 |
| Lazy loading | 561 | 8,224 |

TinyJS's build timer begins inside `build()` and covers configuration, route diagnostics, client/server bundling, and size computation until writing statistics. It excludes process startup and the final metadata write. Vite phase timings use Vite's own measurement scope. None is an isolated startup or end-user navigation measurement.

Sizes use Node `gzipSync` independently per emitted JavaScript file, summing the entry's static-import closure and excluding lazy imports. Rolldown may place shared Preact or loader code in a shared chunk (including a preload helper), which is included. Vite's displayed gzip values can differ because its compression settings differ. Manifest and per-asset raw/gzip sizes are available in each generated output.

The optional Three.js module measured **742,801 bytes raw / 186,119 bytes gzip** with this build's settings. It is lazily imported only by the 3D examples; ordinary basic/client outputs contain no Three.js engine. Oversize chunk warnings are expected. No AI SDK dependency was added.

The terrain browser regression simulates 500 updates of 0.1 seconds while driving, travels over 500 world units, and verifies exactly **25 terrain meshes** before final disposal. This establishes the bounded chunk count, not a complete GPU-memory benchmark. A visual production smoke test used a 1280×800 Chrome viewport and SwiftShader, reported approximately 12–15 FPS in its short sample, and produced no page errors. Software-renderer FPS is not evidence of integrated-GPU performance. Hardware-GPU profiling, sustained memory measurements, and controlled startup/navigation benchmarks remain future work.
