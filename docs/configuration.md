# Configuration

Place `tinyjs.config.json` in the application root:

```json
{
  "sourcemap": false,
  "compress": true,
  "budgets": { "sharedGzip": 3000, "chunkGzip": 150000, "fail": false }
}
```

| Option | Default | Behavior |
| --- | --- | --- |
| `sourcemap` | `false` | Client source maps: `true`, `false`, or `"hidden"` |
| `compress` | `false` | Writes gzip siblings for supported assets when smaller |
| `budgets.sharedGzip` | `3000` | Shared entry and static-import gzip budget, bytes |
| `budgets.chunkGzip` | `150000` | Per-JavaScript-chunk gzip threshold, bytes |
| `budgets.fail` | `false` | Fails builds exceeding either budget |

Sizes must be positive safe integers. Unknown keys and invalid types are rejected. The shared budget is a target; optional features and lazy route chunks are measured separately. Both dev and build validate the JSON; build options affect production output.

TinyJS owns its Vite configuration. It does not load application `vite.config.*` or `tinyjs.config.ts` files. `tinyjs/config` exports `TinyConfig` and `defineConfig(value)` for typed tooling validation; exporting a value from a TypeScript file does not auto-load it.

Hidden maps omit the source-map comment but do not make map files private; exclude them from public hosting when needed. Set server environment variables through the runtime or deployment platform. Never put credentials in client `VITE_` variables or this JSON file.
