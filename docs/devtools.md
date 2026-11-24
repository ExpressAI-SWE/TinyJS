# TinyJS DevTools

Run `tinyjs dev` from your application directory and open the local address printed by the CLI. The TinyJS indicator appears at the bottom left. Select an inspector from its menu to load the dashboard. The dashboard shares the app's page and can be resized or expanded to fill the browser viewport.

Try the example from the repository root using Bun:

```sh
bun install --frozen-lockfile
bun run compile
bun run --cwd examples/devtools dev
```

Use a product link to generate client navigation and see a dynamic route nested under a layout. The home page can make normal and slow API requests, trigger a demonstration API error, raise a browser error, and reject a browser promise. The failing page exercises server rendering and its route error fallback. A stateful counter demonstrates hydration.

## Configuration

Use `tinyjs dev --no-devtools` for an individual session. For a project-wide setting, set `devtools.enabled` to `false` in `tinyjs.config.json`.

```json
{
  "devtools": {
    "enabled": true,
    "position": "bottom-left",
    "profiling": false,
    "maxEvents": 1000
  }
}
```

| Option | Default | Behavior |
| --- | --- | --- |
| `enabled` | `true` | Enables DevTools for loopback development servers |
| `position` | `"bottom-left"` | Initial indicator corner. Also accepts `"bottom-right"`, `"top-left"`, and `"top-right"` |
| `profiling` | `false` | Starts the server with detailed timing collection enabled |
| `maxEvents` | `1000` | Number of recent telemetry events retained in memory, from 1 to 5,000 |

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+D` | Toggle the menu or close the dashboard. This also restores a temporarily hidden indicator. |
| `Alt+Shift+F` | Open or toggle the full-screen dashboard |
| `Escape` | Dismiss the active overlay, menu, or panel |
| Arrow keys, `Home`, `End` | Navigate the indicator menu |

Drag the panel separator or focus it and use arrow keys to resize. Settings persist in the browser for the application origin. The temporary hide control restores the indicator after five minutes.

## Inspectors

| Inspector | What to inspect |
| --- | --- |
| Overview | Framework/runtime versions, current route, uptime, request/error counts, memory, build status, and framework events |
| Routes | Registered page and API patterns, source paths, layout ancestry, and matched route activity |
| Components | Framework-owned page and layout boundaries, including the rendered application root |
| Network | Framework-observed requests, status, duration, sanitized headers and sizes where available |
| Performance | Server spans and browser timings collected during a recording |
| Build | Measured output sizes, budget warnings, and optional module analysis from the latest local build |
| Errors | Framework and browser errors, stack traces, source excerpts, and workspace file links where available |
| Server | Process and request metrics, Vite logs, and framework events |
| Configuration | Resolved framework settings and environment variable names |
| Settings | Dashboard preferences, positioning, and visibility controls |

### Record performance

Open Performance and start a recording. Trigger app navigation, API calls, or asset loads, then stop recording and inspect the captured durations. Repeat the same interaction for a meaningful comparison. The browser's first hydration occurs at document load, so enable profiling in config before startup when you need an initial-load recording. Browser resource timing depends on the browser and on origin restrictions.

Run `bun run --cwd examples/devtools build` before opening the example again in development to populate the Build inspector. Pass `--analyze` to `tinyjs build` for module contributions, duplicate modules, and the treemap. For the example, run `bun run --cwd examples/devtools build --analyze`. Gzip sizes measure the files' compressed size. Actual network compression follows the production server configuration. Rolldown reports module contributions in rendered characters. Chunk sizes use bytes measured from the generated files.

## Architecture and security

DevTools uses a development-only Vite plugin and the existing same-origin Vite WebSocket connection. The server stores recent events in bounded memory. The client receives versioned batches and loads the larger dashboard module after interaction. TinyJS production builds and `tinyjs serve` omit DevTools instrumentation, assets, and endpoints.

Use a loopback bind such as `127.0.0.1`. TinyJS disables DevTools on non-loopback binds. The transport verifies local connection and origin information. No telemetry is sent to external services. Sensitive header values and query/body data are omitted or redacted before being sent to the dashboard. Environment values are excluded. Editor links resolve only to permitted application source files. Set `TINYJS_EDITOR` to `code`, `code-insiders`, or `cursor`. TinyJS also checks `VISUAL` and `EDITOR` and defaults to `code`.

Telemetry is for local development. Avoid putting secrets in route segments or exception messages. Free-form application messages cannot reliably identify every custom credential format.

## Known limitations

- The Network inspector captures requests handled by TinyJS. Assets served by Vite can appear under browser Resource Timing during a recording.
- Response sizes use declared lengths or count the bytes passed through the response stream. A canceled response can report a partial size. Request and response body contents are excluded.
- TinyJS exposes route, layout, and application-root boundaries. Arbitrary Preact component state and hook internals are outside those boundaries.
- Middleware execution timings require a middleware registration API. This TinyJS version handles requests through the application router and Vite.
- Build information appears after an explicit build. The development server serves Vite's development modules.
- The Server inspector captures framework and Vite logs. Application output written directly to stdout or stderr stays in the terminal.

## Troubleshooting

- If the indicator is missing, check the bind address, `--no-devtools`, and the project configuration. Reload the page after restarting the server.
- If the dashboard is disconnected, confirm that the page was opened at the printed loopback address and that WebSocket connections are allowed.
- If no request rows appear, connect to DevTools, then make an application request. Static assets served by Vite can appear under browser Performance entries.
- If a source link cannot open, confirm that the path is within the application and that your local editor is installed and configured.

## Benchmark the development server

From the repository root, run `bun run compile`, then `bun scripts/benchmark-devtools.ts`. The benchmark starts a new server for each sample, warms up the route, and compares sequential and concurrent requests with DevTools on and off. It prints raw per-run results and medians with runtime and machine details. Browser sessions remain disconnected during this request-path measurement.
