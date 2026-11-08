import { expect, test } from 'bun:test';
import { bindPrefetchHints, createLoader, prefersReducedData } from '../packages/tinyjs/src/loading.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

test('deduplicates concurrent loads, reports progress and reuses cached values', async () => {
  const loader = createLoader<number>();
  const gate = deferred<number>();
  const progress: number[] = [];
  let calls = 0;
  const factory = async (context: { progress: (value: number) => void }) => {
    calls++;
    context.progress(0.5);
    return gate.promise;
  };
  const first = loader.load('a', factory, { onProgress: (fraction) => progress.push(fraction) });
  const second = loader.load('a', factory);
  gate.resolve(7);
  expect(await first).toBe(7);
  expect(await second).toBe(7);
  expect(await loader.load('a', factory)).toBe(7);
  expect(calls).toBe(1);
  expect(progress).toEqual([0.5]);
  expect(loader.size).toBe(1);
});

test('limits concurrency and starts higher priority queued work first', async () => {
  const loader = createLoader<string>({ concurrency: 1 });
  const gate = deferred<string>();
  const order: string[] = [];
  const first = loader.load('first', () => gate.promise);
  const low = loader.load('low', () => { order.push('low'); return 'low'; });
  const high = loader.load('high', () => { order.push('high'); return 'high'; }, { priority: 10 });
  expect(loader.pending).toBe(3);
  gate.resolve('first');
  await Promise.all([first, low, high]);
  expect(order).toEqual(['high', 'low']);
});

test('one cancelled subscriber does not cancel a shared request', async () => {
  const loader = createLoader<number>();
  const gate = deferred<number>();
  const abort = new AbortController();
  let underlying!: AbortSignal;
  const first = loader.load('a', ({ signal }) => { underlying = signal; return gate.promise; }, { signal: abort.signal });
  const second = loader.load('a', () => 99);
  abort.abort();
  await expect(first).rejects.toHaveProperty('name', 'AbortError');
  expect(underlying.aborted).toBe(false);
  gate.resolve(4);
  expect(await second).toBe(4);
});

test('cancels queued requests and disposes late results of cancelled work', async () => {
  const disposed: number[] = [];
  const loader = createLoader<number>({ concurrency: 1, dispose: (value) => disposed.push(value) });
  const gate = deferred<number>();
  const abort = new AbortController();
  let underlying!: AbortSignal;
  const first = loader.load('a', ({ signal }) => { underlying = signal; return gate.promise; }, { signal: abort.signal });
  let queuedRan = false;
  const queued = loader.load('b', () => { queuedRan = true; return 2; });
  const queuedRejected = queued.catch((error: unknown) => error);
  loader.clear('b');
  expect(await queuedRejected).toHaveProperty('name', 'AbortError');
  abort.abort();
  await expect(first).rejects.toHaveProperty('name', 'AbortError');
  expect(underlying.aborted).toBe(true);
  gate.resolve(1);
  await gate.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(disposed).toEqual([1]);
  expect(queuedRan).toBe(false);
  expect(loader.size).toBe(0);
});

test('failed loads can retry; cache eviction and disposal clean resources', async () => {
  const disposed: number[] = [];
  const loader = createLoader<number>({ maxEntries: 1, dispose: (value) => disposed.push(value) });
  await expect(loader.load('a', () => { throw new Error('retry me'); })).rejects.toThrow('retry me');
  expect(await loader.load('a', () => 1)).toBe(1);
  expect(await loader.load('b', () => 2)).toBe(2);
  expect(disposed).toEqual([1]);
  loader.dispose();
  expect(disposed).toEqual([1, 2]);
  await expect(loader.load('c', () => 3)).rejects.toThrow('disposed');
});

test('lazy resources wait, eager resources start, predictive resources require a hint', async () => {
  const loader = createLoader<number>();
  let calls = 0;
  const lazy = loader.resource('lazy', () => ++calls);
  const predictive = loader.resource('predictive', () => ++calls, 'predictive');
  expect(calls).toBe(0);
  expect(await lazy.prefetch()).toBeUndefined();
  expect(await lazy.load()).toBe(1);
  expect(await predictive.prefetch()).toBe(2);
  const eager = loader.resource('eager', () => ++calls, 'eager');
  expect(await eager.ready).toBe(3);
  expect(prefersReducedData()).toBe(false);
  expect(() => createLoader({ concurrency: 0 })).toThrow(RangeError);
});

test('hint listeners trigger once and cleanup removes them', async () => {
  const element = new EventTarget();
  let calls = 0;
  const cleanup = bindPrefetchHints(element as Element, async () => { calls++; });
  element.dispatchEvent(new Event('pointerenter'));
  element.dispatchEvent(new Event('focusin'));
  await Promise.resolve();
  expect(calls).toBe(1);
  cleanup();
  element.dispatchEvent(new Event('pointerenter'));
  await Promise.resolve();
  expect(calls).toBe(1);
});

test('reduced-data preference blocks predictive downloads', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { connection: { saveData: true } } });
  try {
    const loader = createLoader<number>();
    let calls = 0;
    const resource = loader.resource('a', () => ++calls, 'predictive');
    expect(prefersReducedData()).toBe(true);
    expect(await resource.prefetch()).toBeUndefined();
    expect(calls).toBe(0);
    expect(await resource.load()).toBe(1);
    loader.dispose();
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
