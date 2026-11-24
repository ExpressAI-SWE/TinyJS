import { useState } from 'preact/hooks';
import { isRecord } from './view.js';
import type { DevEvent, DevSnapshot } from './protocol.js';
import { Build } from './build-inspector.js';
import { PerformanceInspector } from './performance-inspector.js';
import { Detail, Metrics, Search, SelectRow, Source, Table, bytes, clock, display, elapsed, matches, ms, name, number, path, sameFile, seconds, string } from './inspector-view.js';
import type { InspectorProps, Row } from './inspector-view.js';

type Route = DevSnapshot['routes'][number];
const statusText: Record<number, string> = { 2: 'Success', 3: 'Redirect', 4: 'Client error', 5: 'Server error' };

function Overview({ model }: InspectorProps) {
  const currentRoute = location.pathname;
  const overview = model.snapshot?.overview ?? {};
  const events = model.events.slice(-18).reverse().map((event): Row => ({
    key: event.id, cells: [clock(event.time), name(event), path(event), ms(elapsed(event))],
  }));
  return <>
    <Metrics entries={[
      ['TinyJS', overview.version], ['Bun', overview.bun], ['Uptime', seconds(overview.uptime)],
      ['Current route', currentRoute], ['Rendering', document.getElementById('tinyjs-root')?.dataset.page ? 'SSR and hydration' : overview.rendering], ['Build', overview.buildStatus],
      ['Requests', overview.requests], ['Errors', overview.errors], ['Warnings', overview.warnings],
      ['Client runtime', overview.runtimeSizeKind ? bytes(overview.runtimeSize) + ' · ' + display(overview.runtimeSizeKind) : bytes(overview.runtimeSize)],
      ['Server memory', bytes(overview.memory)],
    ]} />
    <h3>Recent framework events</h3>
    <Table columns={['Time', 'Event', 'Route', 'Duration']} rows={events} />
  </>;
}

interface Branch { name: string; children: Map<string, Branch>; routes: Route[] }

function routeTree(routes: Route[]) {
  const root: Branch = { name: '/', children: new Map(), routes: [] };
  for (const route of routes) {
    let parent = root;
    for (const part of route.pattern.split('/').filter(Boolean)) {
      let branch = parent.children.get(part);
      if (!branch) {
        branch = { name: part, children: new Map(), routes: [] };
        parent.children.set(part, branch);
      }
      parent = branch;
    }
    parent.routes.push(route);
  }
  return root;
}

function Tree({ branch, select, depth = 0 }: { branch: Branch; select(file: string): void; depth?: number }) {
  return <ul class="dt-tree">
    {branch.routes.map((route) => <li key={route.file}><button class="dt-link" type="button" onClick={() => select(route.file)}>{route.pattern}</button>
      <span class="dt-kind">{route.kind}</span></li>)}
    {[...branch.children.values()].map((child) => <li key={child.name}><details open={depth === 0}>
      <summary>{child.name}</summary>
      <Tree branch={child} select={select} depth={depth + 1} />
    </details></li>)}
  </ul>;
}

function Routes({ model, actions }: InspectorProps) {
  const [query, setQuery] = useState('');
  const [selected, select] = useState('');
  const routes = model.snapshot?.routes ?? [];
  const filtered = routes.filter((route) => matches(query, route.pattern, route.file, route.kind));
  const route = routes.find((item) => item.file === selected);
  const details = model.events.filter((event) => sameFile(event.data.file, route?.file));
  const navigations = model.events.filter((event) => event.kind === 'navigation' && (!route || sameFile(event.data.file, route.file)));
  const rows = filtered.map((item): Row => ({
    key: item.file, cells: [
      <SelectRow label={item.pattern} active={selected === item.file} select={() => select(item.file)} />,
      item.kind, item.file,
    ],
  }));
  return <>
    <div class="dt-filters"><Search label="Search routes" value={query} setValue={setQuery} /></div>
    <details class="dt-route-tree"><summary>Route tree ({filtered.length})</summary><Tree branch={routeTree(filtered)} select={select} /></details>
    <Table columns={['Pattern', 'Type', 'Source']} rows={rows} selected={selected} />
    {route && <div class="dt-detail">
      <h3>{route.pattern}</h3>
      <Metrics entries={[
        ['Source', route.file],
        ['Rendering', route.kind === 'page' ? 'Server rendering and hydration' : 'API handler'],
        ['Parameters', route.pattern.match(/\[[^\]]+\]|:[\w-]+|\*[\w-]*/g)?.join(', ')],
        ['Layouts', route.layouts.join(' › ')],
      ]} />
      <Source file={route.file} open={actions.openEditor} />
      <h3>Matching requests and errors</h3>
      <Table columns={['Time', 'Event', 'Path', 'Duration', 'Status']} rows={details.slice(-40).reverse().map((event) => ({
        key: event.id, cells: [clock(event.time), name(event), path(event), ms(elapsed(event)), display(event.data.status)],
      }))} />
    </div>}
    <h3>Navigation history</h3>
    <Table columns={['Time', 'Destination', 'Duration', 'Result']} rows={navigations.slice(-40).reverse().map((event) => ({
      key: event.id, cells: [clock(event.time), path(event), ms(elapsed(event)), display(event.data.outcome ?? event.data.status)],
    }))} />
  </>;
}

function Components({ model, actions }: InspectorProps) {
  const [selected, select] = useState('');
  const page = document.getElementById('tinyjs-root')?.dataset.page;
  const route = (model.snapshot?.routes ?? []).find((item) => sameFile(item.file, page));
  const sourcePage = route?.file ?? page;
  const files = [...(route?.layouts ?? []), ...(sourcePage ? [sourcePage] : [])];
  const active = files.includes(selected) ? selected : sourcePage;
  const pageEvents = model.events.filter((event) => event.kind === 'component' && sameFile(event.data.file, active));
  const record = pageEvents.at(-1)?.data;
  return <>
    {files.length ? <ol class="dt-tree">{files.map((file, index) => <li key={file} style={{ marginInlineStart: index * 10 + 'px' }}>
      <SelectRow label={file} active={active === file} select={() => select(file)} />
      <span class="dt-kind">{file === sourcePage ? 'Page' : 'Layout'}</span>
    </li>)}</ol> : <p class="dt-muted">There is no TinyJS application root on this page.</p>}
    {active && <div class="dt-detail">
      <h3>{active}</h3>
      <div class="dt-filters">
        {active === sourcePage && <button class="dt-button" type="button" onClick={actions.highlight}>Highlight application root</button>}
        <Source file={active} open={actions.openEditor} />
      </div>
      {record ? <>
        <Metrics entries={[[ 'Recorded renders', pageEvents.length ], [ 'Latest duration', ms(record.duration ?? record.durationMs) ]]} />
        <Detail value={record} />
      </> : <p class="dt-muted">No render telemetry for this component yet.</p>}
      <p class="dt-muted">This view inspects the framework page and layout boundary. Private Preact component state is unavailable.</p>
    </div>}
  </>;
}

function Network({ model, actions }: InspectorProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, select] = useState<number>();
  const events = model.events.filter((event) => event.kind === 'request' || (event.kind === 'timing' && name(event) === 'Asset loading'));
  const current = events.find((event) => event.id === selected);
  const filtered = events.filter((event) => {
    const category = Math.trunc((number(event.data.status) ?? 0) / 100);
    return (!status || String(category) === status) && matches(query, path(event), event.data.method, event.data.status);
  });
  return <>
    <div class="dt-filters">
      <Search label="Search requests" value={query} setValue={setQuery} />
      <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
        <option value="">Any status</option>
        {Object.entries(statusText).map(([code, label]) => <option key={code} value={code}>{code}xx {label}</option>)}
      </select>
      <button class="dt-button" type="button" onClick={actions.clear}>Clear history</button>
    </div>
    <Table columns={['Request', 'Method', 'Status', 'Duration', 'Size', 'Time']} selected={selected}
      rows={filtered.slice(-150).reverse().map((event) => ({
        key: event.id, cells: [
          <SelectRow label={path(event)} active={selected === event.id} select={() => select(event.id)} />,
          string(event.data.method, event.kind === 'timing' ? 'Resource' : '—'), display(event.data.status),
          ms(elapsed(event)), bytes(event.data.responseSize ?? event.data.size), clock(event.time),
        ],
      }))} />
    {current && <div class="dt-detail">
      <h3>{string(current.data.method)} {path(current)}</h3>
      <Detail value={current.data} />
    </div>}
  </>;
}

function Errors({ model, actions }: InspectorProps) {
  const [query, setQuery] = useState('');
  const [selected, select] = useState<number>();
  const errors = model.events.filter((event) => event.kind === 'error' || event.kind === 'warning');
  const groups = new Map<string, { event: DevEvent; occurrences: number }>();
  for (const event of errors) {
    const signature = [name(event), path(event), event.data.message, event.data.file, event.data.line].join('|');
    const previous = groups.get(signature);
    groups.set(signature, { event, occurrences: Math.max((previous?.occurrences ?? 0) + 1, number(event.data.occurrences) ?? 1) });
  }
  const current = errors.find((event) => event.id === selected);
  const data = current?.data;
  const file = string(data?.sourceFile ?? data?.file);
  const line = number(data?.line);
  const request = data?.requestStartMs === undefined ? undefined : model.events.find((event) =>
    event.kind === 'request' && event.data.requestStartMs === data.requestStartMs);
  const excerpt = model.source;
  const rows = [...groups.values()].filter(({ event }) => matches(query, event.data.message, path(event), name(event)))
    .sort((a, b) => b.event.id - a.event.id).map(({ event, occurrences }) => ({
      key: event.id, cells: [
        <SelectRow label={string(event.data.message, name(event))} active={selected === event.id} select={() => select(event.id)} />,
        name(event), path(event), occurrences, clock(event.time),
      ],
    }));
  return <>
    <div class="dt-filters"><Search label="Search errors and warnings" value={query} setValue={setQuery} /></div>
    <Table columns={['Message', 'Type', 'Route', 'Count', 'Last seen']} rows={rows} selected={selected} />
    {data && <div class="dt-detail">
      <h3>{string(data.message, 'Error details')}</h3>
      <div class="dt-filters">
        <Source file={file} line={line} open={actions.openEditor} />
        {file && line && <button class="dt-button" type="button" onClick={() => actions.loadSource(file, line)}>Load source excerpt</button>}
      </div>
      {typeof data.stack === 'string' && <pre class="dt-code">{data.stack}</pre>}
      {excerpt?.file === file && excerpt?.line === line && <pre class="dt-code">{excerpt!.lines.map((item) => item.line + ' │ ' + item.text).join('\n') || 'Source excerpt unavailable.'}</pre>}
      <Detail value={data} exclude={['message', 'stack']} />
      {request && <>
        <h3>Related request</h3>
        <Metrics entries={[
          ['Request', string(request.data.method) + ' ' + path(request)],
          ['Status', request.data.status],
          ['Duration', ms(elapsed(request))],
        ]} />
      </>}
    </div>}
  </>;
}

function Server({ model }: InspectorProps) {
  const [query, setQuery] = useState('');
  const server = model.snapshot?.server ?? {};
  const events = model.events.filter((event) => ['log', 'build', 'error', 'warning', 'server', 'route'].includes(event.kind)
    && matches(query, path(event), name(event), event.data.message));
  const cpu = number(server.cpuPercent);
  const rate = number(server.requestsPerSecond);
  return <>
    <Metrics entries={[
      ['Process uptime', seconds(server.uptime)], ['Resident memory', bytes(server.memory)],
      ['Heap used / total', server.heapUsed === undefined ? undefined : bytes(server.heapUsed) + ' / ' + bytes(server.heapTotal)],
      ['CPU', cpu === undefined ? undefined : cpu.toFixed(1) + '%'],
      ['Active requests', server.activeRequests], ['Requests/s', rate?.toFixed(2)],
      ['Response latency', isRecord(server.latency) ? ms(server.latency.average ?? server.latency.p50) : ms(server.latency)],
    ]} />
    <h3>Framework logs and events</h3>
    <div class="dt-filters"><Search label="Search server events" value={query} setValue={setQuery} /></div>
    <Table columns={['Time', 'Event', 'Message', 'Route']} rows={events.slice(-100).reverse().map((event) => ({
      key: event.id, cells: [clock(event.time), name(event), display(event.data.message), path(event)],
    }))} />
  </>;
}

function Configuration({ model }: InspectorProps) {
  return model.snapshot
    ? <Detail value={model.snapshot.configuration} />
    : <p class="dt-muted">Waiting for the resolved development configuration.</p>;
}

function Settings({ model, actions }: InspectorProps) {
  return <div class="dt-settings">
    <label>Indicator position <select value={model.position} onChange={(event) => actions.save('position', event.currentTarget.value)}>
      <option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option>
      <option value="top-left">Top left</option><option value="top-right">Top right</option>
    </select></label>
    <label><input type="checkbox" checked={model.preferences.overlay !== false}
      onChange={(event) => actions.save('overlay', event.currentTarget.checked)} /> Show error overlay</label>
    <button class="dt-button" type="button" onClick={actions.hide}>Hide indicator for 5 minutes</button>
    <h3>Keyboard shortcuts</h3>
    <span><kbd>Alt+Shift+D</kbd> Toggle indicator menu or close dashboard</span>
    <span><kbd>Alt+Shift+F</kbd> Toggle full screen</span>
    <span><kbd>Escape</kbd> Dismiss active overlay, menu, or dashboard</span>
  </div>;
}

const inspectors = { Overview, Routes, Components, Network, Performance: PerformanceInspector, Build, Errors, Server, Configuration, Settings };

export function Inspectors({ model, actions }: InspectorProps) {
  const Inspector = inspectors[model.section];
  return <Inspector model={model} actions={actions} />;
}
