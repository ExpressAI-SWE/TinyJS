import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Inspectors } from './inspectors.js';
import { dashboardStyles } from './dashboard-styles.js';
import { element, sections } from './view.js';
import type { Dashboard, DashboardActions, DashboardModel } from './view.js';

export function mountDashboard(parent: HTMLElement, actions: DashboardActions): Dashboard {
  const sheet = element('style', '', dashboardStyles);
  const content = element('div');
  parent.append(sheet, content);
  let current: DashboardModel | undefined;
  let fullscreen = false;
  function refresh() {
    if (current) render(<Panel model={current} actions={actions} fullscreen={fullscreen} toggleFullscreen={toggleFullscreen} />, content);
  }
  function toggleFullscreen() {
    fullscreen = !fullscreen;
    refresh();
  }
  return {
    open(model, forceFullscreen) {
      current = model;
      if (forceFullscreen) fullscreen = true;
      refresh();
    },
    update(model) {
      current = model;
      refresh();
    },
    close() {
      current = undefined;
      fullscreen = false;
      render(null, content);
    },
    toggleFullscreen,
  };
}

interface PanelProps {
  model: DashboardModel;
  actions: DashboardActions;
  fullscreen: boolean;
  toggleFullscreen(): void;
}

function Panel({ model, actions, fullscreen, toggleFullscreen }: PanelProps) {
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const drag = useRef<{ x: number; y: number; width: number; height: number }>();
  const [size, setSize] = useState({
    width: typeof model.preferences.width === 'number' ? model.preferences.width : 850,
    height: typeof model.preferences.height === 'number' ? model.preferences.height : 540,
  });
  const collapsed = model.preferences.collapsed === true;
  useEffect(() => { heading.current?.focus(); }, []);

  function resize(width: number, height: number) {
    const next = {
      width: Math.min(1800, Math.max(300, Math.round(width))),
      height: Math.min(1200, Math.max(235, Math.round(height))),
    };
    setSize(next);
    return next;
  }

  function saveSize(next: typeof size) {
    actions.save('width', next.width);
    actions.save('height', next.height);
  }

  function begin(event: JSX.TargetedPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !panel.current) return;
    const { width, height } = panel.current.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, width, height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragSize(event: JSX.TargetedPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const { x, y, width, height } = drag.current;
    const directionX = model.position.endsWith('left') ? -1 : 1;
    const directionY = model.position.startsWith('top') ? 1 : -1;
    return resize(width + directionX * (event.clientX - x), height + directionY * (event.clientY - y));
  }

  function end(event: JSX.TargetedPointerEvent<HTMLDivElement>) {
    const next = dragSize(event);
    drag.current = undefined;
    if (next) saveSize(next);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeByKey(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const increment = event.shiftKey ? 50 : 15;
    const width = size.width + (event.key === 'ArrowLeft' ? -increment : event.key === 'ArrowRight' ? increment : 0);
    const height = size.height + (event.key === 'ArrowUp' ? -increment : event.key === 'ArrowDown' ? increment : 0);
    saveSize(resize(width, height));
  }

  return <section class="dt-panel" aria-label="TinyJS DevTools" ref={panel}
      data-fullscreen={String(fullscreen)} data-position={model.position}
      style={{ '--dt-width': size.width + 'px', '--dt-height': size.height + 'px' }}>
    <header class="dt-toolbar">
      <button type="button" class="dt-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => actions.save('collapsed', !collapsed)}>▥</button>
      <span class="dt-title">TinyJS DevTools</span>
      <span class="dt-live" data-connected={String(model.connected)}>{model.connected ? '● Connected' : '○ Connecting'}</span>
      <span class="dt-spacer" />
      <button type="button" class="dt-button" onClick={toggleFullscreen} aria-pressed={fullscreen} title="Alt+Shift+F">
        {fullscreen ? 'Exit full screen' : 'Full screen'}
      </button>
      <button type="button" class="dt-button" onClick={actions.close} aria-label="Close dashboard" title="Escape">×</button>
    </header>
    <div class="dt-body" data-collapsed={String(collapsed)}>
      <nav class="dt-sidebar" aria-label="DevTools sections">
        {sections.map(([name, glyph]) => <button class="dt-button" type="button" key={name} aria-label={name} title={name}
            aria-current={name === model.section ? 'page' : undefined} onClick={() => actions.select(name)}>
          <span class="dt-sidebar-icon" aria-hidden="true">{glyph}</span><span class="dt-sidebar-label">{name}</span>
        </button>)}
      </nav>
      <article class="dt-content">
        <h2 ref={heading} tabIndex={-1}>{model.section}</h2>
        <Inspectors model={model} actions={actions} key={model.section} />
      </article>
    </div>
    {!fullscreen && <div tabIndex={0} class="dt-resize" role="separator"
      title="Drag to resize. Use arrow keys when focused." aria-label="Resize DevTools"
      aria-orientation="horizontal" aria-valuenow={size.width} aria-valuemin={300} aria-valuemax={1800}
      onPointerDown={begin} onPointerMove={dragSize} onPointerUp={end}
      onPointerCancel={() => { drag.current = undefined; }} onKeyDown={resizeByKey} />}
  </section>;
}
