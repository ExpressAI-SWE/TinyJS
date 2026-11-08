# Troubleshooting

| Symptom | Check |
| --- | --- |
| CLI cannot find generated modules | Run `bun run compile` at the repository root |
| Unsupported Node version | Use Node 20.19+ in the Node 20 line or 22.12+ |
| Chromium cannot launch | Run `bun run browser:install` or set `TINYJS_CHROMIUM_PATH` |
| No completed build | Resolve build failures and rerun the app's `build` script before `start` |
| Performance budget fails | Read `.tinyjs/stats.json`; lazy-load costly code or deliberately adjust the threshold |
| Unknown config option | Follow [configuration](configuration.md); only JSON is auto-loaded |
| Server module imported by a page | Move private logic to `app/api` and call it through HTTP |
| `window` or WebGL unavailable in SSR | Use `lazyBrowser`; avoid top-level browser initialization |
| Hydration differs from initial HTML | Use stable initial values and identical props |
| Link requires a full browser request | Add `data-reload` |
| AI request fails | Check server `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, and structured error code |
| Canvas cannot initialize | Check WebGL and the error UI; dispose old games before remounting |

Use development errors and stack traces to locate application failures. Production HTTP responses keep unexpected details private. `error.tsx` handles rendering failures; APIs need their own validated responses.

For an occupied port, use `tinyjs dev --port 3001`; do not terminate unrelated processes. Stop servers with Ctrl+C. For mismatched deployed assets, deploy complete output from one build and verify `/_tinyjs/` forwarding. Do not rebuild into an active server's directory.

The Edge adapter is experimental. Node-only API imports and platform asset-prefix mappings need separate attention; Bun unit tests do not establish Edge compatibility.
