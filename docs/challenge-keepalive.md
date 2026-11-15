# Challenge connection retention and API build optimization

Measured on 11 November 2026 against TinyJS baseline `923326d` and the application from [challenge PR #382](https://github.com/arjaythedev/twelve-dollar-server-challenge/pull/382), commit `a70aa8a`. Its pinned `tinyjs-fullstack@0.1.1` production HTTP adapter is identical to this baseline's compiled adapter. Tests use Bun 1.4.4; Node production compatibility was checked on Windows with Node 24.20.0.

## Findings and changes

Both runtimes reported a default `keepAliveTimeout` of 5,000 ms and closed idle production connections before the next request after an 11-second gap. Setting `server.keepAliveTimeout = 120_000` before `listen()` retained the same sockets across three such gaps on Node and Bun, including Bun on Ubuntu under WSL2. Bun honors this Node HTTP setting; no native server replacement or POST retry is needed. Both installations report `timeout: 0`, `requestTimeout: 300000`, and `headersTimeout: 60000`; these settings are unchanged. The native Bun server's ten-second default is not the configuration used by TinyJS's Node HTTP adapter.

This confirms premature connection retirement, not the exact race causing the official write-only EOFs. The deterministic test uses a Node HTTP agent that discards closed sockets; baseline requests consequently reconnect successfully. Only an official rerun can establish that the maintainer's EOF failure is eliminated.

Route precedence is now prepared once per application handler, avoiding route-table allocation and sorting on each request. Matching and fresh per-request parameters retain their existing behavior. API-only applications skip the browser build, remove stale browser assets, and use `entry: null` in build metadata. Custom not-found pages and symlinked app entries retain browser builds. Server modules are minified using the existing Vite toolchain. TinyJS remains the framework; no dependency was added.

## Connection regression

Run `bun run compile`, then `node --test tests/keepalive.test.mjs` or `bun test tests/keepalive.test.mjs`. Both `node` and `bun` must be on PATH. The actual CLI builds an API fixture and starts production servers, sequentially, with eight persistent clients. Four rounds each issue GET/POST/POST; the three gaps are 11 seconds. Every response must be complete, all 64 writes must apply exactly once, and no connection may be replaced. Explicit close and cancellation of a server-observed partial upload are also checked. The test takes about 70 seconds. The 96 timed requests exclude health/resource/disconnect probes.

For a baseline comparison only, set `TINYJS_KEEPALIVE_DIAGNOSTIC=1`; it reports reconnects without asserting zero. This does not relax request or write-count assertions.

| Runtime / OS | Requests before / after | Failed before / after | Socket replacements before / after |
| --- | ---: | ---: | ---: |
| Node 24.20.0 / Windows | 96 / 96 | 0 / 0 | 24 / 0 |
| Bun 1.4.4 / Windows | 96 / 96 | 0 / 0 | 24 / 0 |
| Bun 1.4.4 / Ubuntu WSL2 | 96 / 96 | 0 / 0 | 24 / 0 |

The fixture reports p95, p99, request rate, process CPU time and peak RSS. Its approximately 2.9 requests/s is deliberately limited by think time; it is not a throughput ceiling. Latencies on this shared development machine are variable.

## Local challenge load

Used the unchanged `bench/load.js`, a fresh copy of the checksum-verified seed for each probe, Bun 1.4.4 and k6 2.3.0 on the same Ubuntu WSL2 host. The k6 release archive was checksum-verified, usage reporting was disabled, and probes ran sequentially. Each used a 10-second ramp, 60-second hold and the script's 30-second ramp-down. The load generator was limited to one Go worker with a 384-MiB soft Go memory limit. This is a shortened local test, not the official five-minute benchmark.

| Build / peak users | Successful requests | Failed | Error | p95 ms | p99 ms | Requests/s | Server CPU % | Peak server RSS KiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline / 128 | 1190 | 0 | 0% | 1.67 | 4.47 | 11.51 | 1.650 | 60724 |
| Optimized / 128 | 1203 | 0 | 0% | 2.05 | 4.99 | 11.97 | 1.883 | 58080 |
| Optimized / 512 | 4759 | 0 | 0% | 107.32 | 402.36 | 46.58 | 15.004 | 63004 |
| Optimized / 2000 | 18538 | 0 | 0% | 15.70 | 115.34 | 184.14 | 7.197 | 84712 |

CPU is server process CPU time divided by elapsed wall time, as a percentage of one logical CPU; peak RSS is `/proc/PID/status`'s `VmHWM`. The load generator is excluded. These stochastic single runs share the development host; small differences are not evidence of a throughput or CPU improvement. The baseline's zero errors mean the official EOF race was not reproduced in this local workload.

The challenge application emitted 5,642 shared gzip JavaScript bytes before and zero afterward. The server module fell from approximately 37.35 kB raw / 12.98 kB gzip to 25.32 kB raw / 10.64 kB gzip in Vite's build output. Browser bundles for page-based applications are retained; the zero-byte result applies to API-only applications.

A subsequent guarded scaling attempt requested 5,000 users with a 20-second ramp and planned 60-second hold, intending to proceed to 10,000 / 20,000 / 40,000 only after successful completion. It was **aborted during the ramp**, at a reported maximum of 2,116 active users, when sampled combined server/generator RSS crossed the local 768-MiB guard. k6 peak sampled RSS was 737,344 KiB; server peak RSS was 64,580 KiB. The partial run recorded 2,141 successful requests / 0 failures, p95 61.38 ms, p99 103.93 ms, 223.30 requests/s and 10.251% average server CPU. k6 exited 105 after the intentional termination. Those partial metrics do not establish a passing 5,000-user result. Higher levels were not run. The highest completed local probe is 2,000 users; the development load generator's memory limit prevents establishing a server maximum or a 40,000-user result here.

## Validation scope

The exact challenge `test/test.sh` passed **42/42** on a fresh deterministic seed database; the seed's content checksum matched. The submission's production smoke passed authentication, malformed JSON, concurrent duplicate likes, restart persistence and degraded health using the fixed local TinyJS CLI. Challenge dependency pins and PR #382 were not changed.

`bun run test` compiled the workspace, typechecked all six examples, and reported 62 passed / 1 failed. The failure is `tests/stage2-browser.test.ts:69`, which loses browser state after navigating to a symlinked route. The unchanged baseline independently fails the same assertion. Subsequent focused production integration tests passed with minified server bundles; routing, API-only output, stale-asset removal, custom-not-found output, and the strengthened connection/disconnect tests also passed. An independent code review found no production defect and prompted the upload-start handshake in the disconnect test.

## Changed files

- `packages/tinyjs/src/production.ts`: keep-alive timeout and nullable client-entry support.
- `packages/tinyjs/src/routing.ts`, `packages/tinyjs/src/handler.ts`: reusable prepared route matching.
- `packages/tinyjs/src/vite.ts`, `packages/tinyjs/src/output.ts`: skip unused client output, nullable metadata, minified server builds.
- `tests/keepalive.test.mjs`, `tests/root-api.test.ts`, `tests/stage2-routing.test.ts`: connection and optimization regressions.
- `docs/build.md`, this report, and `.wolf/cerebrum.md`: behavior, validation and verified project notes.

## Release and official rerun

The registry's latest `tinyjs-fullstack` version was `0.1.1` when checked on 11 November 2026. `0.1.2` is the next patch candidate; recheck availability before release. The workspace manifest is intentionally named `tinyjs@0.1.0`, so publishing it directly would target the wrong package. No package has been published by this work.

After merging and obtaining publication authorization, prepare a release directory without changing workspace imports:

```sh
bun run compile
release_dir="$(mktemp -d)"
cp -R packages/tinyjs/bin packages/tinyjs/dist "$release_dir/"
cp LICENSE "$release_dir/"
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const pkg = JSON.parse(readFileSync("packages/tinyjs/package.json", "utf8"));
  pkg.name = "tinyjs-fullstack";
  pkg.version = "0.1.2";
  writeFileSync(process.argv[1] + "/package.json", JSON.stringify(pkg, null, 2));
' "$release_dir"
npm pack "$release_dir" --dry-run
npm pack "$release_dir"
# Inspect and smoke-test the archive before the separately authorized publication:
npm publish "$release_dir" --access public
```

Then, in the challenge checkout:

```sh
cd submissions/typescript-tinyjs-animuni-express
bun add --exact tinyjs-fullstack@0.1.2
bun install --frozen-lockfile
cd ../..
bash test/run.sh submissions/typescript-tinyjs-animuni-express
```

Update the submission README to the tested version, commit its manifest, `bun.lock` and README, and push to PR #382 only after the published-package correctness run passes. Ask the maintainer to rerun progressively toward 40,000 users on the dedicated 1-vCPU / 2-GB server with the official hold and thresholds. Stop at a failed level; the highest passing level is the score. Local WSL results do not establish that capacity.

Longer idle retention can increase open-socket memory and file-descriptor use under large populations. Measure these on the challenge host; no OS limits or security settings were changed here. Deploy the generated server and metadata with the matching updated TinyJS CLI because API-only builds now allow a null client entry.
