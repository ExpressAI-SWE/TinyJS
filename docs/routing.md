# Routing

TinyJS discovers `app/**/page.tsx` and server-only `app/api/**/route.ts`. Pages default-export synchronous Preact components. Static names map to URL segments, `[id]` matches one segment, and terminal `[...slug]` matches one or more. Precedence is static, dynamic, then catch-all. Avoid duplicate patterns with different parameter names.

```tsx
// app/users/[id]/page.tsx
import type { PageProps } from 'tinyjs/routing';

export const metadata = { title: 'User', description: 'User details' };
export default function User({ params, query }: PageProps) {
  return <p>User {params.id}; tab {query.tab ?? 'profile'}</p>;
}
```

Parameters are decoded strings; catch-alls are arrays. Query values are strings, or arrays when a key repeats. These props are serialized for matching server/browser renders. Trailing slashes are normalized; malformed percent encoding receives 400.

Layouts receive `children` and nest from `app/layout.tsx` to the page's directory. They do not automatically receive page props. Add `app/not-found.tsx` for a custom root-layout 404; otherwise missing routes return plain text.

Directory `error.tsx` files provide rendering-error fallbacks. Failing nested fallbacks escalate to ancestors. Error components receive page props, not an exception or retry callback. Unrecovered server errors become generic 500 responses. These files do not handle API failures or arbitrary event-handler exceptions.

Directory `loading.tsx` files show client-navigation transition UI for the destination subtree. This is not streaming SSR or async page rendering. Keep loading components independent of required route props and layout context.

Ordinary same-origin links use lazy module imports, client navigation, history updates, cancellation, and stale-result protection. Direct URLs and refreshes use SSR. Downloads, external links, modified clicks, and explicit targets retain browser behavior.

```tsx
<a href="/users/42" data-prefetch>User 42</a>
<a href="/login" data-reload>Open as a document</a>
```

`data-reload` opts out of client navigation. `data-prefetch` requests a browser prefetch hint on hover, skipping reported `saveData`; browsers decide whether to honor it. Use [resource loading](loading.md) for viewport hints, priorities, and fuller reduced-data handling. Navigation updates page title and description; arbitrary head elements are not managed.

```ts
// app/api/users/[id]/route.ts
export function GET(request: Request, context: { params: Record<string, string | string[]> }) {
  return Response.json({ id: context.params.id, query: new URL(request.url).search });
}
```

API handlers export HTTP methods and return Web `Response` values or promises. `HEAD` falls back to `GET` with the body removed. Unsupported methods return 405 with `Allow`. Validate input and enforce authentication/authorization inside handlers.
