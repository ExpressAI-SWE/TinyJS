export type LoadingStrategy = 'eager' | 'lazy' | 'predictive';
export interface LoadContext {
  signal: AbortSignal;
  progress: (fraction: number) => void;
}
export interface LoadOptions {
  signal?: AbortSignal;
  priority?: number;
  onProgress?: (fraction: number) => void;
}
export interface LoaderOptions<T> {
  concurrency?: number;
  maxEntries?: number;
  dispose?: (value: T) => void;
}

/** A loader owns its cached resources; clear/dispose must follow their last use. */
export function createLoader<T>(options: LoaderOptions<T> = {}) {
  const concurrency = options.concurrency ?? 4;
  const maxEntries = options.maxEntries ?? 32;
  if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('Loader concurrency and maxEntries must be positive integers.');
  }
  type Entry = {
    key: string;
    controller: AbortController;
    priority: number;
    run: () => Promise<T>;
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
    consumers: Set<(fraction: number) => void>;
  };
  const cache = new Map<string, T>();
  const pending = new Map<string, Entry>();
  const queue: Entry[] = [];
  let active = 0;
  let disposed = false;
  const abortError = () => new DOMException('Resource load cancelled', 'AbortError');

  function pump() {
    queue.sort((a, b) => b.priority - a.priority);
    while (!disposed && active < concurrency && queue.length) {
      const entry = queue.shift()!;
      if (entry.controller.signal.aborted) continue;
      active++;
      void entry.run().then((value) => {
        if (entry.controller.signal.aborted || disposed) {
          options.dispose?.(value);
          throw entry.controller.signal.reason ?? abortError();
        }
        cache.set(entry.key, value);
        while (cache.size > maxEntries) {
          const key = cache.keys().next().value!;
          const evicted = cache.get(key)!;
          cache.delete(key);
          options.dispose?.(evicted);
        }
        if (pending.get(entry.key) === entry) pending.delete(entry.key);
        entry.resolve(value);
      }).catch((error: unknown) => {
        if (pending.get(entry.key) === entry) pending.delete(entry.key);
        entry.reject(error);
      }).finally(() => {
        if (pending.get(entry.key) === entry) pending.delete(entry.key);
        active--;
        pump();
      });
    }
  }

  function cancel(entry: Entry) {
    entry.controller.abort(abortError());
    if (pending.get(entry.key) === entry) pending.delete(entry.key);
    entry.reject(entry.controller.signal.reason);
    const index = queue.indexOf(entry);
    if (index !== -1) queue.splice(index, 1);
  }

  function load(key: string, factory: (context: LoadContext) => T | Promise<T>, settings: LoadOptions = {}): Promise<T> {
    if (disposed) return Promise.reject(new Error('Loader has been disposed.'));
    if (!key) return Promise.reject(new TypeError('A non-empty resource key is required.'));
    if (settings.signal?.aborted) return Promise.reject(settings.signal.reason ?? abortError());
    if (cache.has(key)) {
      const value = cache.get(key)!;
      cache.delete(key);
      cache.set(key, value);
      settings.onProgress?.(1);
      return Promise.resolve(value);
    }
    let entry = pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
      const consumers = new Set<(fraction: number) => void>();
      entry = {
        key, controller, resolve, reject, promise, consumers, priority: settings.priority ?? 0,
        run: async () => factory({ signal: controller.signal, progress: (fraction) => {
          if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError('Progress must be between 0 and 1.');
          for (const consumer of consumers) consumer(fraction);
        } }),
      };
      pending.set(key, entry);
      queue.push(entry);
    } else {
      entry.priority = Math.max(entry.priority, settings.priority ?? 0);
    }
    const current = entry;
    const result = new Promise<T>((resolve, reject) => {
      let done = false;
      const progress = (fraction: number) => settings.onProgress?.(fraction);
      current.consumers.add(progress);
      const finish = () => {
        done = true;
        current.consumers.delete(progress);
        settings.signal?.removeEventListener('abort', abort);
      };
      const abort = () => {
        if (done) return;
        finish();
        reject(settings.signal?.reason ?? abortError());
        if (!current.consumers.size) cancel(current);
      };
      settings.signal?.addEventListener('abort', abort, { once: true });
      void current.promise.then((value) => {
        if (done) return;
        finish();
        resolve(value);
      }, (error: unknown) => {
        if (done) return;
        finish();
        reject(error);
      });
    });
    pump();
    return result;
  }

  function clear(key?: string) {
    for (const entry of [...pending.values()]) if (key === undefined || entry.key === key) cancel(entry);
    for (const [name, value] of cache) {
      if (key !== undefined && name !== key) continue;
      cache.delete(name);
      options.dispose?.(value);
    }
    pump();
  }

  return {
    load,
    resource(key: string, factory: (context: LoadContext) => T | Promise<T>, strategy: LoadingStrategy = 'lazy') {
      if (!['eager', 'lazy', 'predictive'].includes(strategy)) throw new TypeError('Unknown loading strategy.');
      const request = (settings?: LoadOptions) => load(key, factory, settings);
      return { load: request, ready: strategy === 'eager' ? request() : undefined,
        prefetch: () => strategy === 'predictive' && !prefersReducedData() ? request({ priority: -1 }) : Promise.resolve(undefined) };
    },
    clear,
    dispose() { disposed = true; clear(); },
    get size() { return cache.size; },
    get pending() { return pending.size; },
  };
}

export function prefersReducedData() {
  const connection = typeof navigator === 'undefined' ? undefined :
    (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType ?? '') ||
    (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-data: reduce)').matches));
}

/** Explicit hints only; call the returned cleanup when the element unmounts. */
export function bindPrefetchHints(element: Element, prefetch: () => Promise<unknown>, options: {
  hover?: boolean; viewport?: boolean; onError?: (error: unknown) => void;
} = {}) {
  let loading = false;
  const trigger = () => {
    if (loading || prefersReducedData()) return;
    loading = true;
    void Promise.resolve().then(prefetch).catch((error: unknown) => { loading = false; options.onError?.(error); });
  };
  if (options.hover !== false) {
    element.addEventListener('pointerenter', trigger);
    element.addEventListener('focusin', trigger);
  }
  const observer = options.viewport && typeof IntersectionObserver !== 'undefined' ?
    new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) trigger(); }) : undefined;
  observer?.observe(element);
  return () => {
    element.removeEventListener('pointerenter', trigger);
    element.removeEventListener('focusin', trigger);
    observer?.disconnect();
  };
}
