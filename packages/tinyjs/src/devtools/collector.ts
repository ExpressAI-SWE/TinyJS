import type { TinyConfig } from '../config.js';
import type { DevEvent, DevRoute, DevSnapshot } from './protocol.js';
import { protocolVersion } from './protocol.js';
import { createRedactor, sourceLocation } from './security.js';

export class RingBuffer<T> {
  readonly #items: Array<T | undefined>;
  #start = 0;
  #length = 0;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('Ring capacity must be a positive integer.');
    this.#items = new Array<T | undefined>(capacity);
  }

  push(value: T) {
    const capacity = this.#items.length;
    this.#items[(this.#start + this.#length) % capacity] = value;
    if (this.#length === capacity) this.#start = (this.#start + 1) % capacity;
    else this.#length++;
  }

  clear() {
    this.#items.fill(undefined);
    this.#start = this.#length = 0;
  }

  read(from = 0, limit = this.#length): T[] {
    const result: T[] = [];
    for (let index = from; index < Math.min(this.#length, from + limit); index++) {
      result.push(this.#items[(this.#start + index) % this.#items.length]!);
    }
    return result;
  }

  first(): T | undefined { return this.#items[this.#start]; }
}

interface RequestBucket {
  second: number;
  count: number;
  elapsed: number;
}

export class DevCollector {
  readonly #events: RingBuffer<DevEvent>;
  readonly #redactor = createRedactor(process.env);
  readonly #envNames = Object.keys(process.env).sort();
  readonly #started = performance.now();
  readonly #requestBuckets: Array<RequestBucket | undefined> = new Array(10);
  readonly #errors = new Map<string, number>();
  #nextId = 1;
  #requestCount = 0;
  #errorCount = 0;
  #warningCount = 0;
  #activeRequests = 0;
  #route: string | null = null;
  #rendering: string | null = null;
  #routes: DevRoute[];
  routeRevision = 0;
  onChange?: () => void;
  #build: Record<string, unknown> | null = null;
  #buildStatus = 'No build yet';
  #runtimeBytes: number | null = null;
  #previousCpu = process.cpuUsage();
  #previousCpuAt = performance.now();
  #cpuPercent = 0;
  #memory = process.memoryUsage();
  #plugins: string[] = [];
  profiling: boolean;

  constructor(readonly settings: TinyConfig, routes: DevRoute[], readonly frameworkVersion: string, readonly workspace?: string) {
    this.#events = new RingBuffer(settings.devtools?.maxEvents ?? 1000);
    this.#routes = routes;
    this.profiling = settings.devtools?.profiling ?? false;
  }

  setRoutes(routes: DevRoute[]) {
    this.#routes = routes;
    this.routeRevision++;
    this.onChange?.();
  }
  setPlugins(names: string[]) { this.#plugins = names; }
  setRuntimeSize(bytes: number) { this.#runtimeBytes = bytes; }
  setBuild(build: Record<string, unknown> | null, status: string) {
    this.#build = build;
    this.#buildStatus = status;
    this.onChange?.();
  }
  get nextId() { return this.#nextId; }
  get oldestId() { return this.#events.first()?.id ?? this.#nextId; }
  read(fromId: number, limit: number) {
    return this.#events.read(Math.max(0, fromId - this.oldestId), limit);
  }
  clear() {
    this.#events.clear();
    this.#errors.clear();
  }
  text(value: string, limit?: number) { return this.#redactor.text(value, limit); }

  record(kind: string, input: Record<string, unknown>) {
    const data = this.#redactor.data(input);
    if (kind === 'error') {
      this.#errorCount++;
      const source = sourceLocation(input, this.workspace, this.settings.appDir ?? 'app');
      if (source) Object.assign(data, source);
      const signature = [data.phase, data.name ?? data.type, data.sourceFile ?? data.file, data.line, data.message].join('|');
      if (!this.#errors.has(signature) && this.#errors.size >= 500) {
        const oldest = this.#errors.keys().next().value;
        if (oldest !== undefined) this.#errors.delete(oldest);
      }
      const count = (this.#errors.get(signature) ?? 0) + 1;
      this.#errors.set(signature, count);
      data.occurrences = count;
    }
    if (kind === 'warning' || data.level === 'warn') this.#warningCount++;
    this.#events.push({ id: this.#nextId++, time: Date.now(), kind, data });
    this.onChange?.();
  }

  requestStarted() { this.#activeRequests++; }

  requestFinished(data: Record<string, unknown>) {
    this.#activeRequests = Math.max(0, this.#activeRequests - 1);
    this.#requestCount++;
    if (typeof data.route === 'string') this.#route = this.text(data.route, 512);
    if (typeof data.rendering === 'string') this.#rendering = this.text(data.rendering, 80);
    const second = Math.floor(Date.now() / 1_000);
    const index = second % this.#requestBuckets.length;
    let bucket = this.#requestBuckets[index];
    if (!bucket || bucket.second !== second) {
      bucket = { second, count: 0, elapsed: 0 };
      this.#requestBuckets[index] = bucket;
    }
    bucket.count++;
    const duration = data.duration ?? data.durationMs;
    if (typeof duration === 'number' && Number.isFinite(duration)) bucket.elapsed += duration;
    this.record('request', data);
  }

  snapshot(): DevSnapshot {
    const now = performance.now();
    const elapsed = now - this.#previousCpuAt;
    if (elapsed >= 1_000) {
      const usage = process.cpuUsage();
      const micros = usage.user + usage.system - this.#previousCpu.user - this.#previousCpu.system;
      this.#cpuPercent = Math.max(0, Math.round(micros / elapsed / 10));
      this.#previousCpu = usage;
      this.#previousCpuAt = now;
      this.#memory = process.memoryUsage();
    }
    const second = Math.floor(Date.now() / 1_000);
    let requests = 0;
    let latencyTotal = 0;
    for (const bucket of this.#requestBuckets) {
      if (!bucket || second - bucket.second >= this.#requestBuckets.length) continue;
      requests += bucket.count;
      latencyTotal += bucket.elapsed;
    }
    const uptime = Math.round((now - this.#started) / 1_000);
    const bun = (process.versions as Record<string, string | undefined>).bun ?? null;
    return {
      version: protocolVersion,
      overview: {
        version: this.frameworkVersion,
        bun,
        uptime,
        route: this.#route,
        rendering: this.#rendering,
        buildStatus: this.#buildStatus,
        requests: this.#requestCount,
        errors: this.#errorCount,
        warnings: this.#warningCount,
        runtimeSize: this.#runtimeBytes ?? this.#build?.sharedGzip ?? null,
        runtimeSizeKind: this.#runtimeBytes !== null ? 'Transformed development entry (raw)' :
          this.#build ? 'Last production build (gzip startup JavaScript)' : null,
        memory: this.#memory.rss,
      },
      routes: this.#routes,
      build: this.#build,
      server: {
        uptime: Math.round(process.uptime()),
        memory: this.#memory.rss,
        heapUsed: this.#memory.heapUsed,
        heapTotal: this.#memory.heapTotal,
        cpuPercent: this.#cpuPercent,
        activeRequests: this.#activeRequests,
        requestsPerSecond: Math.round(requests / this.#requestBuckets.length * 100) / 100,
        latency: requests ? Math.round(latencyTotal / requests * 100) / 100 : null,
        windowSeconds: this.#requestBuckets.length,
      },
      configuration: {
        config: {
          appDir: this.settings.appDir ?? 'app',
          importAlias: this.settings.importAlias ?? null,
          sourcemap: this.settings.sourcemap ?? false,
          compress: this.settings.compress ?? false,
          budgets: { sharedGzip: 3000, chunkGzip: 150_000, fail: false, ...this.settings.budgets },
          devtools: {
            enabled: this.settings.devtools?.enabled ?? true,
            position: this.settings.devtools?.position ?? 'bottom-left',
            profiling: this.settings.devtools?.profiling ?? false,
            maxEvents: this.settings.devtools?.maxEvents ?? 1000,
          },
        },
        build: { tool: 'Vite', clientManifest: true, cssCodeSplit: false, modulePreload: false },
        plugins: this.#plugins,
        middleware: [],
        features: ['Server-side rendering', 'File-based routing', 'Client hydration', 'Client navigation', 'DevTools'],
        environment: this.#envNames,
      },
      profiling: this.profiling,
      position: this.settings.devtools?.position ?? 'bottom-left',
    };
  }
}
