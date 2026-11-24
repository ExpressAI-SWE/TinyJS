import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

const sensitive = /authorization|cookie|pass(?:word|wd)?|secret|token|(?:api|access|private)[-_ ]?key|credential|session|signature/i;
const safeHeaderNames = new Set([
  'accept', 'accept-encoding', 'accept-language', 'cache-control', 'content-encoding',
  'content-length', 'content-type', 'expires', 'pragma', 'server-timing', 'vary',
]);

export function loopback(host = '') {
  const address = host.toLowerCase();
  const ipv4 = address.replace(/^::ffff:/, '');
  return address === 'localhost' || address === '::1' || address === '::ffff:7f00:1' ||
    isIP(ipv4) === 4 && ipv4.startsWith('127.');
}

export function isLocalRequest(request: IncomingMessage, requireOrigin = false) {
  const { headers, socket } = request;
  if (!loopback(socket.remoteAddress) || !headers.host ||
    headers.forwarded || headers['x-forwarded-for'] || headers['x-forwarded-host'] ||
    headers['x-forwarded-proto'] || headers['x-real-ip']) return false;
  const protocol = 'encrypted' in socket && socket.encrypted ? 'https:' : 'http:';
  try {
    const host = new URL(protocol + '//' + headers.host);
    if (!loopback(host.hostname.replace(/^\[|\]$/g, '')) ||
      host.username || host.password || host.pathname !== '/' || host.search || host.hash) return false;
    if (!headers.origin) return !requireOrigin;
    return headers.origin === host.origin;
  } catch { return false; }
}

// Drop search and fragment entirely. Hide credential-shaped path segments as a second layer.
export function safeUrl(input: string) {
  try {
    const url = new URL(input, 'http://tinyjs.local');
    return url.pathname.split('/').map((segment) =>
      /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[a-f0-9]{24,}|[A-Za-z0-9_-]{32,}(?:\.[A-Za-z0-9_-]{8,}){0,2})$/i.test(segment) ?
        '[redacted]' : segment,
    ).join('/').slice(0, 512);
  } catch { return '[invalid URL]'; }
}

export function safeHeaders(headers: Headers | IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const entries = headers instanceof Headers ? headers.entries() : Object.entries(headers);
  for (const [name, value] of entries) {
    const key = name.toLowerCase();
    if (sensitive.test(key)) result[key] = '[redacted]';
    else if (typeof value === 'string' && safeHeaderNames.has(key)) result[key] = value.slice(0, 256);
  }
  return result;
}

// Reuse a compiled value matcher across events. Short values from sensitive env keys are
// included when a word-delimited match can avoid corrupting unrelated messages.
export function createRedactor(env: NodeJS.ProcessEnv) {
  const values = [...new Set(Object.entries(env).flatMap(([key, value]) =>
    value && (sensitive.test(key) || value.length >= 8) && value.length <= 4_000 ? [value] : [],
  ))].sort((a, b) => b.length - a.length);
  const alternatives = values.map((value) => {
    const escaped = value.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
    if (value.length < 4) return '\\b' + escaped + '\\b';
    return escaped;
  });
  const envPattern = alternatives.length ? new RegExp(alternatives.join('|'), 'g') : undefined;
  function text(value: string, limit = 1_500) {
    let result = value.slice(0, limit + 4_000).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    if (envPattern) result = result.replace(envPattern, '[redacted]');
    return result
      .replace(/https?:\/\/[^\s)]+/gi, (url) => {
        try {
          const parsed = new URL(url);
          return parsed.origin + safeUrl(url);
        } catch { return '[redacted URL]'; }
      })
      .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._~-]+/gi, '[redacted]')
      .replace(/((?:authorization|cookie|password|passwd|secret|token|api[_ -]?key|credential)[\w-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\]]+)/gi, '$1[redacted]')
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .slice(0, limit);
  }

  function clean(input: unknown, key: string, depth: number, budget: { characters: number; nodes: number }): unknown {
    if (budget.nodes-- <= 0 || budget.characters <= 0) return;
    if (sensitive.test(key) && input !== undefined) return '[redacted]';
    if (typeof input === 'string') {
      const limit = Math.min(budget.characters, key === 'stack' ? 4_000 : 600);
      const value = key === 'path' || key === 'url' ? text(safeUrl(input), limit) : text(input, limit);
      budget.characters -= value.length;
      return value;
    }
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (typeof input === 'boolean' || input === null) return input;
    if (depth >= 3) return '[omitted]';
    if (Array.isArray(input)) return input.slice(0, 24).map((value) => clean(value, '', depth + 1, budget));
    if (!input || typeof input !== 'object') return;
    const record = input as Record<string, unknown>;
    const result: Record<string, unknown> = Object.create(null);
    let keys = 0;
    for (const name in record) {
      if (!Object.hasOwn(record, name)) continue;
      if (++keys > 30 || budget.nodes <= 0 || budget.characters <= 0) break;
      const label = text(name, Math.min(budget.characters, 100));
      budget.characters -= label.length;
      result[label] = clean(record[name], name, depth + 1, budget);
    }
    return result;
  }

  return {
    text,
    data(input: Record<string, unknown>) {
      return clean(input, '', 0, { characters: 6_000, nodes: 96 }) as Record<string, unknown>;
    },
  };
}



// Prefer an application frame from Vite's source-mapped stack. Browsers can report either
// a /@fs/ module URL or a root-relative module path.
export function sourceLocation(input: Record<string, unknown>, workspace: string | undefined, appDir: string) {
  const root = workspace?.replace(/\\/g, '/').replace(/\/$/, '');
  const prefix = '/' + appDir + '/';
  function sourceFile(input: string) {
    let file = input.replace(/\\/g, '/');
    try {
      if (/^https?:\/\//.test(file)) file = new URL(file).pathname;
      else if (file.startsWith('file://')) file = new URL(file).pathname;
      file = decodeURIComponent(file).replace(/^\/@fs\//, '/').replace(/^\/([A-Za-z]:\/)/, '$1');
    } catch { return; }
    if (root && (process.platform === 'win32' ? file.toLowerCase().startsWith(root.toLowerCase() + '/') : file.startsWith(root + '/'))) {
      file = file.slice(root.length);
    }
    if (file.startsWith(appDir + '/')) file = '/' + file;
    if (file.startsWith(prefix) && !file.split('/').includes('..') && /\.[cm]?[jt]sx?$/i.test(file)) {
      return file;
    }
  }

  if (typeof input.stack === 'string') for (const frame of input.stack.slice(0, 12_000).split('\n', 32)) {
    const match = frame.match(/(?:^|[\s(@])((?:https?:\/\/|file:\/\/|\/|[a-z]:[\\/])[^()\r\n]+?):(\d+):(\d+)\)?\s*$/i);
    if (!match) continue;
    const file = sourceFile(match[1]);
    if (file) return { sourceFile: file, line: Number(match[2]), column: Number(match[3]) };
  }
  const file = typeof input.file === 'string' ? sourceFile(input.file) : undefined;
  if (file) return {
    sourceFile: file,
    line: typeof input.line === 'number' ? input.line : undefined,
    column: typeof input.column === 'number' ? input.column : undefined,
  };
}
