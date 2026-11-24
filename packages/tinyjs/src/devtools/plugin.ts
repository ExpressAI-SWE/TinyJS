import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, normalizePath } from 'vite';
import type { Plugin, WebSocket, WebSocketClient } from 'vite';
import type { TinyConfig } from '../config.js';
import { outputPaths } from '../output.js';
import { DevCollector } from './collector.js';
import type { DevBatch, DevRoute } from './protocol.js';
import { batchChannel, commandChannel, parseCommand, protocolVersion } from './protocol.js';
import { isLocalRequest } from './security.js';
export { isLocalRequest, loopback, safeHeaders, safeUrl } from './security.js';

const script = '/@tinyjs/devtools.js';
const clientScript = '/@tinyjs/client.js';
const browserEntry = normalizePath(fileURLToPath(new URL('./browser.js', import.meta.url)));
const versionFile = new URL('../../package.json', import.meta.url);
const flushInterval = 200;
const metricsInterval = 3_000;
const batchSize = 50;
const maximumSubscribers = 16;
const maximumBufferedBytes = 128 * 1024;
const maximumBuildFileBytes = 512 * 1024;

async function readLimited(file: string, maximum: number) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum) return;
    const buffer = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    return buffer.subarray(0, offset).toString();
  } finally {
    await handle.close();
  }
}

async function readObject(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readLimited(file, maximumBuildFileBytes);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
}

async function modified(file: string) {
  try { return (await stat(file)).mtimeMs; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return 0; }
}

function inside(directory: string, file: string) {
  const path = relative(directory, file);
  return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

async function appSource(root: string, appDir: string, file: string) {
  try {
    const workspace = await realpath(root);
    const configuredApp = resolve(root, appDir);
    const app = await realpath(configuredApp);
    if (!inside(workspace, app)) return;
    const path = /^https?:/.test(file) ? decodeURIComponent(new URL(file).pathname) : file;
    const normalized = path.replace(/\\/g, '/');
    const appPath = normalized.startsWith('/' + appDir + '/') ? normalized.slice(1) : normalized;
    const candidate = normalized.startsWith('file:') ? fileURLToPath(normalized) :
      appPath.startsWith('/@fs/') ? appPath.slice(process.platform === 'win32' ? 5 : 4) :
      resolve(root, appPath);
    if (!/\.[cm]?[jt]sx?$/i.test(candidate) || (!inside(configuredApp, candidate) && !inside(app, candidate))) return;
    const resolved = await realpath(candidate);
    if (!inside(app, resolved) || !inside(workspace, resolved)) return;
    const info = await stat(resolved);
    if (info.isFile()) return resolved;
  } catch { /* Missing, malformed, or inaccessible files cannot be opened. */ }
}

function openEditor(file: string, line: number, report: (message: string) => void) {
  const name = process.env.TINYJS_EDITOR ?? process.env.VISUAL ?? process.env.EDITOR ?? 'code';
  if (!['code', 'code-insiders', 'cursor'].includes(name)) {
    report('Set TINYJS_EDITOR to code, code-insiders, or cursor to open source files.');
    return;
  }
  let command = name;
  if (process.platform === 'win32') {
    const executable = name === 'code-insiders' ? 'Code - Insiders.exe' :
      name === 'cursor' ? 'Cursor.exe' : 'Code.exe';
    const folder = name === 'code-insiders' ? 'Microsoft VS Code Insiders' :
      name === 'cursor' ? 'Cursor' : 'Microsoft VS Code';
    const locations = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles];
    const found = locations.filter((location): location is string => !!location)
      .map((location) => join(location, folder, executable))
      .find(existsSync);
    command = found ?? executable;
  }
  const child = spawn(command, ['--goto', file + ':' + line], { stdio: 'ignore', windowsHide: true });
  child.once('error', () => report('The configured editor could not be started.'));
  child.unref();
}

function buildArray(
  value: unknown,
  text: (value: string, limit?: number) => string,
  fields: Record<string, 'text' | 'number' | 'list'>,
) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 1_000).flatMap((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    const source = row as Record<string, unknown>;
    const item: Record<string, unknown> = {};
    for (const [key, type] of Object.entries(fields)) {
      const entry = source[key];
      if (type === 'text' && typeof entry === 'string') item[key] = text(entry, 240);
      if (type === 'number' && typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) item[key] = entry;
      if (type === 'list' && Array.isArray(entry)) item[key] = entry.slice(0, 30).filter((x): x is string => typeof x === 'string').map(x => text(x, 240));
    }
    return [item];
  });
}

interface Subscriber {
  cursor: number;
  reset: boolean;
  revision: number;
  metricsAt: number;
  sourcePending: boolean;
  editorAvailableAt: number;
}

export function createDevTools(root: string, settings: TinyConfig, routes: DevRoute[]) {
  const frameworkVersion = (JSON.parse(readFileSync(versionFile, 'utf8')) as { version: string }).version;
  const collector = new DevCollector(settings, routes, frameworkVersion, root);
  const output = outputPaths(root);
  const statistics = join(output.dir, 'stats.json');
  const analysis = join(output.dir, 'devtools-build.json');
  let lastFiles = '';
  let checking = false;
  let buildRevision = 0;

  async function refreshBuild() {
    if (checking) return;
    checking = true;
    try {
      const timestamps = await Promise.all([statistics, output.metadata, analysis].map(modified));
      const fingerprint = timestamps.join('/');
      if (lastFiles === fingerprint) return;
      lastFiles = fingerprint;
      const [stats, metadata, detailed] = await Promise.all([
        readObject(statistics), readObject(output.metadata),
        timestamps[2] && timestamps[2] >= timestamps[0] ? readObject(analysis) : undefined,
      ]);
      const report = collector.text.bind(collector);
      const status = metadata ? 'Ready' : stats ? 'Incomplete' : 'No build yet';
      const warnings = detailed?.warnings ?? stats?.warnings;
      const build: Record<string, unknown> | null = stats ? {
        status,
        durationMs: typeof stats.durationMs === 'number' ? stats.durationMs : null,
        sharedGzip: typeof stats.sharedGzip === 'number' ? stats.sharedGzip : null,
        entry: typeof metadata?.entry === 'string' ? report(metadata.entry, 240) : null,
        styles: Array.isArray(metadata?.styles) ? metadata.styles.slice(0, 30).filter((x): x is string => typeof x === 'string').map(x => report(x, 240)) : [],
        assets: buildArray(detailed?.assets ?? stats.assets, report, { file: 'text', raw: 'number', gzip: 'number' }),
        moduleSizeUnit: typeof detailed?.moduleSizeUnit === 'string' ? report(detailed.moduleSizeUnit) : undefined,
        modules: buildArray(detailed?.modules, report, { file: 'text', raw: 'number', chunks: 'list', dependency: 'text' }),
        dependencies: buildArray(detailed?.dependencies, report, { name: 'text', raw: 'number', modules: 'number' }),
        chunks: buildArray(detailed?.chunks, report, { file: 'text', raw: 'number', gzip: 'number', imports: 'list', dynamicImports: 'list', facade: 'text' }),
        duplicates: buildArray(detailed?.duplicates, report, { file: 'text', chunks: 'list' }),
        warnings: Array.isArray(warnings) ? warnings.slice(0, 100).filter((x): x is string => typeof x === 'string').map(x => report(x, 600)) : [],
      } : null;
      collector.setBuild(build, status);
      buildRevision++;
      if (build) {
        collector.record('build', { status, duration: build.durationMs, sharedGzip: build.sharedGzip, assets: Array.isArray(build.assets) ? build.assets.length : 0 });
        if (Array.isArray(build.warnings)) for (const message of build.warnings) collector.record('warning', { phase: 'Build', message });
      }
    } catch (error) {
      collector.record('warning', { phase: 'Build', message: error instanceof Error ? error.message : String(error) });
    } finally {
      checking = false;
    }
  }

  const plugin: Plugin = {
    name: 'tinyjs-devtools',
    apply: 'serve',
    enforce: 'pre',
    resolveId(id) {
      if (id === script && this.environment.config.consumer === 'client') return browserEntry;
    },
    config() {
      const logger = createLogger();
      for (const level of ['info', 'warn', 'error'] as const) {
        const original = logger[level].bind(logger);
        logger[level] = (message, options) => {
          original(message, options);
          collector.record(level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'log', {
            phase: 'Vite',
            level,
            message,
            stack: options && 'error' in options && options.error instanceof Error ? options.error.stack : undefined,
          });
        };
      }
      return { customLogger: logger };
    },
    configureServer(server) {
      const trusted = new WeakSet<WebSocket>();
      const limits = new WeakMap<WebSocket, { second: number; count: number }>();
      const subscribers = new Map<WebSocketClient, Subscriber>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let scheduledAt = 0;
      let nextBuildCheck = 0;
      let closed = false;

      collector.setPlugins(server.config.plugins.map(plugin => plugin.name));
      void refreshBuild();
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?', 1)[0];
        if (url === script && !isLocalRequest(request)) {
          response.writeHead(403).end();
          return;
        }
        if (url === clientScript && isLocalRequest(request)) response.once('finish', () => {
          if (response.statusCode !== 200 || closed) return;
          void server.environments.client.moduleGraph.getModuleByUrl(clientScript).then((module) => {
            if (!closed && module?.transformResult) collector.setRuntimeSize(Buffer.byteLength(module.transformResult.code));
          }, () => { /* This entry may have been invalidated by another edit. */ });
        });
        next();
      });

      const connect = (socket: WebSocket, request: IncomingMessage) => {
        if (isLocalRequest(request, true)) trusted.add(socket);
      };
      function disconnect(client: WebSocketClient) {
        subscribers.delete(client);
        if (!subscribers.size) {
          clearTimeout(timer);
          timer = undefined;
          collector.profiling = settings.devtools?.profiling ?? false;
        }
      }
      const clientClosed = (_: unknown, client: WebSocketClient) => disconnect(client);

      function send(client: WebSocketClient, body: Omit<DevBatch, 'version' | 'type'>) {
        if (client.socket.readyState !== 1 || client.socket.bufferedAmount > maximumBufferedBytes) return false;
        client.send(batchChannel, { version: protocolVersion, type: 'batch', ...body });
        return true;
      }

      function flush(client: WebSocketClient, state: Subscriber, now: number) {
        const revision = buildRevision + collector.routeRevision;
        const full = state.revision !== revision;
        const snapshot = full || now >= state.metricsAt ? collector.snapshot() : undefined;
        const cursor = Math.max(state.cursor, collector.oldestId);
        const events = collector.read(cursor, batchSize);
        if (!events.length && !snapshot && !state.reset) return;
        const metrics = !full && snapshot ? {
          overview: snapshot.overview, server: snapshot.server, profiling: snapshot.profiling,
        } : undefined;
        if (!send(client, { events, snapshot: full ? snapshot : undefined, metrics, reset: state.reset || undefined })) return;
        state.cursor = cursor + events.length;
        state.reset = false;
        state.revision = revision;
        if (snapshot) state.metricsAt = now + metricsInterval;
      }

      function tick() {
        timer = undefined;
        const now = Date.now();
        if (now >= nextBuildCheck) {
          nextBuildCheck = now + metricsInterval;
          void refreshBuild();
        }
        for (const [client, state] of subscribers) flush(client, state, now);
        const backlog = [...subscribers.values()].some((state) => state.cursor < collector.nextId);
        schedule(backlog ? flushInterval : metricsInterval);
      }
      function schedule(delay = flushInterval) {
        const target = Date.now() + delay;
        if (!subscribers.size || closed || (timer && scheduledAt <= target)) return;
        clearTimeout(timer);
        scheduledAt = target;
        timer = setTimeout(tick, delay);
        timer.unref();
      }
      collector.onChange = schedule;

      const onCommand = (input: unknown, client: WebSocketClient) => {
        if (!trusted.has(client.socket) || closed) return;
        const second = Math.floor(Date.now() / 1_000);
        let limit = limits.get(client.socket);
        if (!limit || limit.second !== second) {
          limit = { second, count: 0 };
          limits.set(client.socket, limit);
        }
        if (++limit.count > 30) return;
        const command = parseCommand(input);
        if (!command) return;
        const state = subscribers.get(client);
        if (command.type === 'subscribe') {
          if (state || subscribers.size >= maximumSubscribers) return;
          const subscription: Subscriber = { cursor: collector.oldestId, reset: true, revision: -1, metricsAt: 0, sourcePending: false, editorAvailableAt: 0 };
          subscribers.set(client, subscription);
          flush(client, subscription, Date.now());
          schedule();
          return;
        }
        if (!state) return;
        switch (command.type) {
          case 'unsubscribe':
            disconnect(client);
            return;
          case 'clear':
            state.cursor = collector.nextId;
            state.reset = true;
            state.metricsAt = 0;
            break;
          case 'snapshot':
            state.revision = -1;
            break;
          case 'profile':
            collector.profiling = command.enabled;
            for (const subscription of subscribers.values()) subscription.metricsAt = 0;
            break;
          case 'client':
            for (const event of command.events) {
              if (event.kind === 'timing' && !collector.profiling) continue;
              collector.record(event.kind, { ...event.data, origin: 'Browser' });
            }
            return;
          case 'open':
          case 'source': {
            if (state.sourcePending) return;
            if (command.type === 'open') {
              const now = Date.now();
              if (now < state.editorAvailableAt) return;
              state.editorAvailableAt = now + 1_000;
            }
            state.sourcePending = true;
            const filename = command.file;
            const line = command.line ?? 1;
            void (async () => {
              try {
                const file = await appSource(root, settings.appDir ?? 'app', filename);
                if (closed || subscribers.get(client) !== state) return;
                if (command.type === 'open') {
                  if (file) openEditor(file, line, message => collector.record('warning', { phase: 'Editor', message }));
                  return;
                }
                const content = file ? await readLimited(file, 384 * 1024) : undefined;
                if (subscribers.get(client) !== state) return;
                const lines = content?.split(/\r?\n/) ?? [];
                const start = Math.max(0, line - 4);
                const excerpt = lines.slice(start, line + 3).map((text, index) => ({
                  line: start + index + 1, text: collector.text(text, 260),
                }));
                // Send the trusted relative path instead of disclosing the local absolute path.
                send(client, { events: [], source: { file: collector.text(filename, 512), line, lines: excerpt } });
              } catch (error) {
                collector.record('warning', { phase: 'Source', message: error instanceof Error ? error.message : String(error) });
              } finally {
                state.sourcePending = false;
              }
            })();
            return;
          }
        }
        flush(client, state, Date.now());
      };

      server.ws.on('connection', connect);
      server.ws.on('vite:client:disconnect', clientClosed);
      server.ws.on(commandChannel, onCommand);
      server.httpServer?.once('close', () => {
        closed = true;
        collector.onChange = undefined;
        clearTimeout(timer);
        subscribers.clear();
        server.ws.off('connection', connect);
        server.ws.off('vite:client:disconnect', clientClosed);
        server.ws.off(commandChannel, onCommand);
      });
    },
  };

  return { plugin, script, collector };
}
