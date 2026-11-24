import { element, isRecord, sections } from './view.js';
import type { Dashboard, Position, Section } from './view.js';
import type { DevEvent, DevSnapshot, DevSource } from './protocol.js';
import { indicatorStyles } from './styles.js';

const hot = import.meta.hot;
const storageKey = 'tinyjs:devtools:preferences';
const positions = ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const;
const limits = { batch: 20, buffer: 96, history: 1000, delay: 150 };

function preferences() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function localPath(value: string) {
  try {
    const url = new URL(value, location.href);
    return url.origin === location.origin ? url.pathname : undefined;
  } catch {
    return undefined;
  }
}

type ClientEvent = { kind: 'navigation' | 'timing' | 'error' | 'component'; data: Record<string, unknown> };

if (hot) mount(hot);

function mount(channel: NonNullable<typeof hot>) {
  const host = element('div');
  host.dataset.tinyjsDevtools = '';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = element('style', '', indicatorStyles);
  const shell = element('div', 'shell');
  const indicator = element('button', 'launcher');
  indicator.type = 'button';
  indicator.setAttribute('aria-expanded', 'false');
  indicator.setAttribute('aria-controls', 'devtools-menu');
  indicator.setAttribute('aria-label', 'TinyJS DevTools');
  const mark = element('span', 'mark', 't. TinyJS');
  const status = element('span', 'status');
  const badge = element('span', 'badge');
  const warnings = element('span', 'warning-badge');
  indicator.append(mark, status, badge, warnings);
  const menu = element('nav', 'menu');
  menu.id = 'devtools-menu';
  menu.setAttribute('aria-label', 'TinyJS DevTools views');
  menu.hidden = true;
  const panel = element('div');
  const appHighlight = element('div', 'app-highlight');
  appHighlight.hidden = true;
  const overlay = element('section', 'error-overlay');
  overlay.setAttribute('role', 'alert');
  overlay.hidden = true;
  shell.append(indicator, menu);
  shadow.append(style, shell, panel, appHighlight, overlay);
  document.body.append(host);

  let settings = preferences();
  let dashboard: Dashboard | undefined;
  let openSection: Section | undefined;
  let connected = false;
  let disposed = false;
  let snapshot: DevSnapshot | undefined;
  let source: DevSource | undefined;
  let latestError: DevEvent | undefined;
  let dismissedError: number | undefined;
  let events = new Map<number, DevEvent>();
  let pending: ClientEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let observer: PerformanceObserver | undefined;
  const controller = new AbortController();
  const { signal } = controller;

  const send = (type: string, data: Record<string, unknown> = {}) =>
    channel.send('tinyjs:devtools:command', { version: 1, type, ...data });

  function save(key: string, value: unknown) {
    settings = { ...settings, [key]: value };
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Storage can be disabled. */ }
  }

  function flush() {
    flushTimer = undefined;
    if (!connected || !pending.length) return;
    send('client', { events: pending.splice(0, limits.batch) });
    if (pending.length) flushTimer = setTimeout(flush, limits.delay);
  }

  function record(event: ClientEvent) {
    if (pending.length >= limits.buffer) pending.shift();
    pending.push(event);
    flushTimer ??= setTimeout(flush, limits.delay);
  }

  function captureResources(enabled: boolean) {
    if (!enabled) {
      observer?.disconnect();
      observer = undefined;
      return;
    }
    if (observer || !window.PerformanceObserver?.supportedEntryTypes.includes('resource')) return;
    observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries().slice(-limits.batch)) {
        const resource = entry as PerformanceResourceTiming;
        const path = localPath(resource.name);
        if (!path || path.startsWith('/@tinyjs/devtools') || path.includes('/devtools/')) continue;
        record({ kind: 'timing', data: {
          name: 'Asset loading',
          path,
          duration: resource.duration,
          startTime: resource.startTime + performance.timeOrigin,
          size: resource.transferSize,
          initiatorType: resource.initiatorType,
        } });
      }
    });
    observer.observe({ type: 'resource' });
  }

  function update() {
    const configured = snapshot?.position ?? 'bottom-left';
    const preferred = (settings.position ?? configured) as Position;
    shell.dataset.position = positions.includes(preferred) ? preferred : 'bottom-left';
    const errors = Number(snapshot?.overview.errors ?? 0);
    const warningCount = Number(snapshot?.overview.warnings ?? 0);
    const build = snapshot?.overview.buildStatus;
    badge.textContent = errors > 99 ? '99+' : String(errors);
    badge.hidden = !(errors > 0);
    warnings.textContent = warningCount > 99 ? '99+' : String(warningCount);
    warnings.hidden = !(warningCount > 0);
    warnings.title = warningCount + ' warnings';
    status.dataset.state = !connected ? 'offline' :
      build === 'Incomplete' ? 'error' : build === 'Ready' ? 'ready' : 'idle';
    indicator.title = [
      'TinyJS DevTools (Alt+Shift+D)',
      connected ? 'Connected' : 'Connecting',
      typeof build === 'string' ? 'Build ' + build : '',
      errors ? errors + ' errors' : '',
      warningCount ? warningCount + ' warnings' : '',
    ].filter(Boolean).join(' · ');
    if (openSection) dashboard?.update(model());
  }

  function model() {
    return {
      connected,
      snapshot,
      events: [...events.values()],
      section: openSection ?? 'Overview',
      position: shell.dataset.position as Position,
      preferences: settings,
      source,
    };
  }

  function toggleMenu(show: boolean) {
    menu.hidden = !show;
    indicator.setAttribute('aria-expanded', String(show));
    if (show) menu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function close() {
    openSection = undefined;
    dashboard?.close();
    if (!shell.hidden) indicator.focus();
  }

  function highlight() {
    const root = document.getElementById('tinyjs-root');
    if (!root) return;
    const { top, left, width, height } = root.getBoundingClientRect();
    appHighlight.style.top = Math.max(0, top) + 'px';
    appHighlight.style.left = Math.max(0, left) + 'px';
    appHighlight.style.width = Math.max(0, Math.min(window.innerWidth, left + width) - Math.max(0, left)) + 'px';
    appHighlight.style.height = Math.max(0, Math.min(window.innerHeight, top + height) - Math.max(0, top)) + 'px';
    appHighlight.hidden = false;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => { appHighlight.hidden = true; }, 1500);
  }

  function hide() {
    toggleMenu(false);
    shell.hidden = true;
    close();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { shell.hidden = false; }, 300_000);
  }

  function showError(event: DevEvent) {
    if (latestError?.id === event.id) return;
    const path = event.data.path;
    if (event.data.type === 'Routing' || event.data.type === 'HTTP request') return;
    if (path !== location.pathname || Date.now() - event.time > 8000) return;
    latestError = event;
    renderError();
  }

  function renderError() {
    const error = latestError;
    if (!error || dismissedError === error.id || settings.overlay === false) {
      overlay.hidden = true;
      return;
    }
    const title = element('strong', '', 'TinyJS development error');
    const dismiss = element('button', 'icon-button', 'Dismiss');
    dismiss.addEventListener('click', () => { dismissedError = error.id; renderError(); });
    const inspect = element('button', 'icon-button', 'Inspect');
    inspect.addEventListener('click', () => {
      dismissedError = error.id;
      renderError();
      void open('Errors');
    });
    const header = element('header');
    header.append(title, inspect, dismiss);
    const message = element('p', '', typeof error.data.message === 'string' ? error.data.message : 'The application reported an error.');
    const stack = element('pre', '', typeof error.data.stack === 'string' ? error.data.stack : '');
    if (!stack.textContent) stack.hidden = true;
    overlay.replaceChildren(header, message, stack);
    const file = error.data.sourceFile;
    const line = error.data.line;
    if (typeof file === 'string' && typeof line === 'number' && line > 0) {
      const location = element('p', '', file + ':' + line);
      const view = element('button', 'icon-button', 'Show source excerpt');
      view.addEventListener('click', () => send('source', { file, line }));
      location.append(' ', view);
      overlay.append(location);
      if (source?.file === file && source.line === line) {
        const excerpt = source.lines.map(item => item.line + ' │ ' + item.text).join('\n');
        overlay.append(element('pre', '', excerpt || 'Source excerpt unavailable.'));
      }
    }
    overlay.hidden = false;
  }

  function select(section: Section) {
    openSection = section;
    update();
  }

  async function open(section: Section, fullscreen = false) {
    toggleMenu(false);
    openSection = section;
    try {
      const { mountDashboard } = await import('./dashboard.js');
      if (disposed || !openSection) return;
      dashboard ??= mountDashboard(panel, {
        close,
        select,
        highlight,
        hide,
        save(key, value) {
          save(key, value);
          update();
          if (key === 'overlay') renderError();
        },
        profile(enabled) { send('profile', { enabled }); },
        clear() { events.clear(); send('clear'); update(); },
        openEditor(file, line) { send('open', { file, line }); },
        loadSource(file, line) { send('source', { file, line }); },
      });
      dashboard.open(model(), fullscreen);
      send('snapshot');
    } catch {
      openSection = undefined;
      const message = element('p', 'load-error', 'The dashboard could not load. Reopen it to retry.');
      menu.append(message);
      toggleMenu(true);
    }
  }

  for (const [name, glyph] of sections) {
    const button = element('button', 'menu-item');
    button.type = 'button';
    const icon = element('span', 'menu-icon', glyph);
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, element('span', '', name));
    button.addEventListener('click', () => { void open(name); });
    menu.append(button);
  }
  const full = element('button', 'menu-action', 'Open full screen');
  full.addEventListener('click', () => { void open('Overview', true); });
  const pause = element('button', 'menu-action', 'Hide for 5 minutes');
  pause.addEventListener('click', hide);
  menu.append(full, pause);
  indicator.addEventListener('click', () => toggleMenu(menu.hidden));
  menu.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...menu.querySelectorAll('button')];
    const current = buttons.indexOf(shadow.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      (current + buttons.length + (event.key === 'ArrowDown' ? 1 : -1)) % buttons.length;
    buttons[next]?.focus();
    event.preventDefault();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.composedPath().includes(host)) toggleMenu(false);
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyD') {
      clearTimeout(hideTimer);
      shell.hidden = false;
      if (openSection) close(); else toggleMenu(menu.hidden);
      event.preventDefault();
    } else if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyF') {
      if (openSection && dashboard) dashboard.toggleFullscreen(); else void open('Overview', true);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      if (!overlay.hidden && latestError) { dismissedError = latestError.id; renderError(); }
      else if (!menu.hidden) { toggleMenu(false); indicator.focus(); }
      else if (openSection) close();
    }
  }, { signal });
  window.addEventListener('error', (event) => {
    if (!event.message) return;
    record({ kind: 'error', data: {
      name: 'Client error',
      path: location.pathname,
      message: event.message.slice(0, 1000),
      stack: typeof event.error?.stack === 'string' ? event.error.stack.slice(0, 4000) : undefined,
      file: localPath(event.filename),
      line: event.lineno,
    } });
  }, { signal });
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    record({ kind: 'error', data: {
      name: 'Unhandled rejection',
      path: location.pathname,
      message: error instanceof Error ? error.message.slice(0, 1000) :
        typeof error === 'string' ? error.slice(0, 1000) : 'Unhandled promise rejection',
      stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
    } });
  }, { signal });
  window.addEventListener('tinyjs:devtools', (event) => {
    const detail: unknown = (event as CustomEvent).detail;
    if (!isRecord(detail) || !isRecord(detail.data)) return;
    const kind = detail.kind;
    if (kind !== 'navigation' && kind !== 'timing' && kind !== 'error' && kind !== 'component') return;
    const operation = detail.data.name ?? detail.data.type;
    if (kind === 'timing' && !snapshot?.profiling && operation !== 'Hydration') return;
    const { durationMs, type, ...data } = detail.data;
    record({ kind, data: { ...data, name: data.name ?? type, duration: data.duration ?? durationMs } });
    if (kind === 'navigation' && latestError && latestError.data.path !== location.pathname) {
      latestError = undefined;
      renderError();
    }
    update();
  }, { signal });

  function receive(payload: unknown) {
    if (!isRecord(payload) || payload.version !== 1 || payload.type !== 'batch' || !Array.isArray(payload.events)) return;
    connected = true;
    if (payload.reset === true) events.clear();
    if (isRecord(payload.snapshot) && payload.snapshot.version === 1 && isRecord(payload.snapshot.overview)) {
      snapshot = payload.snapshot as unknown as DevSnapshot;
    }
    if (snapshot && isRecord(payload.metrics) && isRecord(payload.metrics.overview) && isRecord(payload.metrics.server)) {
      snapshot = { ...snapshot, overview: payload.metrics.overview, server: payload.metrics.server, profiling: payload.metrics.profiling === true };
    }
    if (isRecord(payload.source) && typeof payload.source.file === 'string' && typeof payload.source.line === 'number' &&
        Array.isArray(payload.source.lines)) {
      source = payload.source as unknown as DevSource;
      renderError();
    }
    captureResources(snapshot?.profiling === true);
    for (const item of payload.events) {
      if (!isRecord(item) || typeof item.id !== 'number' || typeof item.time !== 'number' ||
          typeof item.kind !== 'string' || !isRecord(item.data)) continue;
      const event = item as unknown as DevEvent;
      if (events.has(event.id)) continue;
      events.set(event.id, event);
      if (event.kind === 'error') showError(event);
    }
    if (events.size > limits.history) events = new Map([...events].slice(-limits.history));
    update();
    if (pending.length) flushTimer ??= setTimeout(flush, limits.delay);
  }

  function connect() {
    connected = true;
    send('subscribe');
    update();
  }

  function disconnect() {
    connected = false;
    captureResources(false);
    update();
  }

  channel.on('tinyjs:devtools:batch', receive);
  channel.on('vite:ws:connect', connect);
  channel.on('vite:ws:disconnect', disconnect);
  channel.dispose(() => {
    disposed = true;
    if (connected) send('unsubscribe');
    channel.off('tinyjs:devtools:batch', receive);
    channel.off('vite:ws:connect', connect);
    channel.off('vite:ws:disconnect', disconnect);
    controller.abort();
    observer?.disconnect();
    clearTimeout(flushTimer);
    clearTimeout(hideTimer);
    clearTimeout(highlightTimer);
    dashboard?.close();
    host.remove();
  });
  send('subscribe');
  update();
  window.dispatchEvent(new Event('tinyjs:devtools-ready'));
}
