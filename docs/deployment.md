# Deployment

Build from the application directory with `tinyjs build`, then run `tinyjs serve`.
The production server reads `.tinyjs/build.json`, serves hashed browser files in
`.tinyjs/client`, and imports `.tinyjs/server/server.mjs`. Deploy all three
together. Build one application at a time and stop its server before rebuilding
in the same directory. Bind to the intended interface with `--host` and use a
reverse proxy for HTTPS where needed.

## Node and Bun

Use the declared package engine range for Node (20.19+ in the Node 20 line, or
22.12+) and the workspace's pinned Bun version. The CLI uses Node-compatible
HTTP and filesystem APIs, which Bun also supports. Applications can use Web
`Request`, `Response`, streams, and cancellation signals in their API handlers.
Do not assume a Node/Bun-specific API used by application routes is portable.

## Experimental Web adapter

`tinyjs/edge` exports `createEdgeHandler({ application, assets, onError? })`.
The adapter itself has no runtime Node imports and uses standard Web APIs. It
delegates `/_tinyjs/assets/*` to an injected asset binding and delegates other
requests to an application handler. Asset requests accept GET and HEAD, reject
other methods, and successful hashed assets receive immutable caching headers.
Unexpected failures return a generic 500; `onError` can log sanitized diagnostics.

```ts
import { createEdgeHandler } from 'tinyjs/edge';
// Import from your generated server output when bundling this worker:
import { createApplication } from './.tinyjs/server/server.mjs';
import build from './.tinyjs/build.json' with { type: 'json' };

export default {
  fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    return createEdgeHandler({
      application: createApplication({
        scripts: ['/_tinyjs/' + build.entry],
        styles: build.styles.map((file: string) => '/_tinyjs/' + file),
      }),
      assets: env.ASSETS,
    })(request);
  },
};
```

Configure the platform's asset binding to map the `/_tinyjs/` URL prefix to
`.tinyjs/client/`; providers differ, so this mapping is a deployment requirement.
Bundle the generated application and its dependencies using the target platform's
tooling. Node filesystem access, the `tinyjs serve` listener, Node-only application
API imports, and Bun-specific APIs are unsupported in this adapter.

The adapter is covered by Web Request/Response tests under Bun. It has **not**
been verified in an actual Edge runtime; it is not a claim that the default
server bundle or arbitrary applications are Edge-compatible. A platform runtime
smoke test and a compatible asset binding are required before production use.
