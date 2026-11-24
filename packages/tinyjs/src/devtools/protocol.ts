export const protocolVersion = 1;
export const commandChannel = 'tinyjs:devtools:command';
export const batchChannel = 'tinyjs:devtools:batch';

export interface DevEvent {
  id: number;
  time: number;
  kind: string;
  data: Record<string, unknown>;
}

export interface DevRoute {
  pattern: string;
  file: string;
  kind: 'page' | 'api';
  layouts: string[];
}

export interface DevSnapshot {
  version: 1;
  overview: Record<string, unknown>;
  routes: DevRoute[];
  build: Record<string, unknown> | null;
  server: Record<string, unknown>;
  configuration: Record<string, unknown>;
  profiling: boolean;
  position: string;
}

export interface DevSource {
  file: string;
  line: number;
  lines: Array<{ line: number; text: string }>;
}

export interface DevBatch {
  version: 1;
  type: 'batch';
  events: DevEvent[];
  snapshot?: DevSnapshot;
  metrics?: Pick<DevSnapshot, 'overview' | 'server' | 'profiling'>;
  reset?: boolean;
  source?: DevSource;
}

interface BrowserEvent {
  kind: 'navigation' | 'timing' | 'error' | 'component';
  data: Record<string, unknown>;
}

export type DevCommand =
  | { version: 1; type: 'subscribe' | 'unsubscribe' | 'clear' | 'snapshot' }
  | { version: 1; type: 'profile'; enabled: boolean }
  | { version: 1; type: 'client'; events: BrowserEvent[] }
  | { version: 1; type: 'open' | 'source'; file: string; line?: number };

const browserKinds = new Set(['navigation', 'timing', 'error', 'component']);
const browserKeys = new Set([
  'name', 'url', 'path', 'route', 'file', 'message', 'stack', 'line', 'column', 'duration',
  'startTime', 'status', 'rendering', 'initiatorType', 'size', 'count', 'props', 'state',
  'parent', 'phase', 'outcome', 'depth', 'label', 'id', 'parentId',
]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

// Keep data from browser clients bounded and drop unsupported fields at the transport boundary.
function browserEvents(input: unknown): BrowserEvent[] | undefined {
  if (!Array.isArray(input) || input.length > 20) return;
  const events: BrowserEvent[] = [];
  for (const entry of input) {
    if (!isRecord(entry) || typeof entry.kind !== 'string' || !browserKinds.has(entry.kind) || !isRecord(entry.data)) return;
    const data: Record<string, unknown> = {};
    for (const key of browserKeys) {
      const value = entry.data[key];
      if (typeof value === 'string' && value.length <= 4_000 ||
        typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' ||
        value === null || (key === 'props' || key === 'state') && isRecord(value)) data[key] = value;
    }
    events.push({ kind: entry.kind as BrowserEvent['kind'], data });
  }
  return events;
}

export function parseCommand(input: unknown): DevCommand | undefined {
  if (!isRecord(input) || input.version !== protocolVersion) return;
  switch (input.type) {
    case 'subscribe':
    case 'unsubscribe':
    case 'clear':
    case 'snapshot':
      return { version: protocolVersion, type: input.type };
    case 'profile':
      if (typeof input.enabled === 'boolean') return { version: protocolVersion, type: input.type, enabled: input.enabled };
      return;
    case 'client': {
      const events = browserEvents(input.events);
      if (events) return { version: protocolVersion, type: input.type, events };
      return;
    }
    case 'open':
    case 'source':
      if (typeof input.file !== 'string' || !input.file || input.file.length > 512) return;
      if (input.line !== undefined && (typeof input.line !== 'number' || !Number.isSafeInteger(input.line) || input.line < 1 || input.line > 100_000)) return;
      return { version: protocolVersion, type: input.type, file: input.file, line: input.line };
  }
}
