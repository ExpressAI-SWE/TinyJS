# Loading resources

`tinyjs/loading` has no 3D or server dependency. Use one loader for resources with
the same lifetime and value type. The first factory supplied for a key wins while
that key is pending or cached; give different resources different keys.

```ts
import { createLoader, bindPrefetchHints } from 'tinyjs/loading';

const modules = createLoader<typeof import('./editor.js')>({ concurrency: 2 });
const editor = modules.resource('editor', () => import('./editor.js'), 'predictive');
const stopHints = bindPrefetchHints(document.querySelector('#open-editor')!, editor.prefetch, {
  hover: true,
  viewport: true,
  onError: console.error,
});
// In the click handler:
const module = await editor.load();
// On unmount:
stopHints();
modules.dispose();
```

Strategies:

- `eager`: starts on resource creation; await `resource.ready` to observe errors.
- `lazy` (default): starts only when `resource.load()` is called.
- `predictive`: also permits explicit `resource.prefetch()` hints. Hints respect
  `navigator.connection.saveData`, slow/2G connections, and the reduced-data media
  query when available. No polling or automatic speculative downloading occurs.

`load(key, factory, options)` deduplicates concurrent requests and reuses the LRU
cache. Options accept `signal`, numeric `priority` (larger runs first), and
`onProgress`. The factory receives `{ signal, progress }`; report a fraction from
0 to 1. Forward the signal to `fetch` or another cancellable operation. JavaScript
module imports cannot be aborted; their late result is ignored after cancellation.
One consumer cancelling does not cancel another consumer of the same resource.
When the last consumer cancels, queued work is removed and active work is aborted.
Failures are not cached and a subsequent call can retry.

The defaults are four concurrent factories and 32 cached entries. `clear(key)`
invalidates one resource; `clear()` invalidates all resources. Both cancel pending
work. `dispose()` additionally prevents new loads. Factories that ignore abort
still occupy a concurrency slot until they settle, preserving the configured
limit. For disposable resources, supply `dispose(value)` in loader options; it
runs on eviction, clearing, and late results after cancellation. The loader owns
these values: clear them only after their users have stopped, or use a cache large
enough for the active set. Dispose and progress callbacks should not throw.

`bindPrefetchHints` adds pointer/focus listeners and optionally an
`IntersectionObserver`. Its returned cleanup removes both. A failed hint can be
retried on the next interaction; pass `onError` to make hint failures visible.
Server rendering does not require DOM APIs unless this browser helper is called.
