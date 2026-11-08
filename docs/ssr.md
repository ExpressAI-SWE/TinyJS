# SSR and hydration

TinyJS renders pages and ancestor layouts into HTML, serializes route/query props, and hydrates the same tree with Preact. Browser page/layout imports are lazy. Pages render synchronously; there is no async page-data-loader contract or streaming HTML renderer.

Make the first browser render match the server. Avoid initial random values, timestamps, viewport measurements, and browser storage. Use `useEffect` for browser work and stable initial markup. Call server APIs for private operations; page modules also execute in the browser and must not contain credentials.

```tsx
import { ClientOnly } from 'tinyjs/client';

function Viewport() { return <p>Width: {window.innerWidth}</p>; }
export default function Page() {
  return <ClientOnly fallback={<p>Measuring viewport…</p>}><Viewport /></ClientOnly>;
}
```

`ClientOnly` renders the fallback on the server and first browser render, then mounts children after hydration. It does not prevent top-level code in imported modules from running on the server. Use `lazyBrowser` when the module itself needs a browser:

```tsx
import { lazyBrowser } from 'tinyjs/client';

const Game = lazyBrowser(() => import('./game'), <p role="status">Loading game…</p>);
export default function Page() { return <Game />; }
```

The module default-exports a component. Loading starts after mount; unmounted components ignore late results. Failed imports show an alert. The helper does not cancel JavaScript imports or automatically retry them.

Export `metadata = { title, description }` from a page for escaped document head content. Keep useful HTML and metadata outside browser-only games. [Three.js](three.md) initializes after mounting and manages its own resources.

Route `error.tsx` files provide server rendering fallbacks and browser component error boundaries. New page/props reset navigation boundaries. These do not catch arbitrary event-handler exceptions or replace API error handling; see [routing](routing.md).
