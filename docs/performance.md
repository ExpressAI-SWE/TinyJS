# Recorded performance measurements

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
