import { useState } from 'preact/hooks';
import { Detail, Metrics, Search, SelectRow, clock, elapsed, matches, ms, name, number, path } from './inspector-view.js';
import type { InspectorProps } from './inspector-view.js';
import type { DevEvent } from './protocol.js';

function Timeline({ events, detailed = false }: { events: DevEvent[]; detailed?: boolean }) {
  const [selected, select] = useState<number>();
  const rows = events.slice(-60);
  const current = rows.find((event) => event.id === selected);
  const began = (event: DevEvent) => number(event.data.startTime) ?? event.time - (elapsed(event) ?? 0);
  const end = Math.max(...rows.map((event) => began(event) + (elapsed(event) ?? 0)));
  const start = Math.min(...rows.map(began));
  const duration = Math.max(end - start, 1);
  if (!rows.length) return <p class="dt-muted">No timing samples in this recording.</p>;
  return <>
    <div class="dt-chart" aria-label="Operation timeline">{rows.map((event) => {
      const value = elapsed(event) ?? 0;
      return <div class="dt-bar-row" key={event.id}>
        <SelectRow label={name(event)} active={event.id === selected} select={() => select(event.id)} />
        <span class="dt-bar-track" aria-hidden="true">
          <span class={'dt-bar-fill' + (value >= 100 ? ' slow' : '')}
            style={{ left: (began(event) - start) / duration * 100 + '%', width: value / duration * 100 + '%' }} />
        </span><span>{ms(value)}</span>
      </div>;
    })}</div>
    {current && detailed && <Detail value={current.data} />}
  </>;
}

function RequestFlameGraph({ events }: { events: DevEvent[] }) {
  const [selection, select] = useState<number>();
  const groups = new Map<number, DevEvent[]>();
  for (const event of events) {
    const request = number(event.data.requestStartMs);
    if (event.kind !== 'timing' || request === undefined || number(event.data.startMs) === undefined) continue;
    const children = groups.get(request) ?? [];
    children.push(event);
    groups.set(request, children);
  }
  const requests = events.filter((event) => event.kind === 'request' && groups.has(number(event.data.requestStartMs)!))
    .slice(-20).reverse();
  const request = requests.find((event) => event.id === selection) ?? requests[0];
  if (!request) return null;
  const start = number(request.data.requestStartMs)!;
  const total = Math.max(elapsed(request) ?? 0, 0.01);
  const spans = groups.get(start)!.map((event) => ({
    event,
    from: number(event.data.startMs)! - start,
    duration: elapsed(event) ?? 0,
    depth: 1,
  })).sort((a, b) => a.from - b.from || b.duration - a.duration);
  const stack: typeof spans = [];
  for (const span of spans) {
    while (stack.length && span.from + span.duration > stack.at(-1)!.from + stack.at(-1)!.duration) stack.pop();
    span.depth = stack.length + 1;
    stack.push(span);
  }
  return <>
    <h3>Request flame graph</h3>
    <div class="dt-filters"><select aria-label="Request in flame graph" value={request.id}
      onChange={(event) => select(Number(event.currentTarget.value))}>
      {requests.map((item) => <option key={item.id} value={item.id}>{path(item)} · {clock(item.time)} · {ms(elapsed(item))}</option>)}
    </select></div>
    <div class="dt-chart" aria-label="Nested operation spans">
      {[{ event: request, from: 0, duration: total, depth: 0 }, ...spans].map((span) =>
        <div class="dt-bar-row" key={span.event.id}>
          <span title={name(span.event)} style={{ paddingInlineStart: Math.min(5, span.depth) * 6 + 'px' }}>{name(span.event)}</span>
          <span class="dt-bar-track" aria-hidden="true">
            <span class={'dt-bar-fill' + (span.duration >= 100 ? ' slow' : '')}
              style={{ left: Math.max(0, span.from / total * 100) + '%', width: Math.min(100, span.duration / total * 100) + '%' }} />
          </span><span>{ms(span.duration)}</span>
        </div>)}
    </div>
  </>;
}

export function PerformanceInspector({ model, actions }: InspectorProps) {
  const [query, setQuery] = useState('');
  const recording = model.snapshot?.profiling ?? false;
  const events = model.events.filter((event) => ['timing', 'navigation', 'request', 'build', 'component'].includes(event.kind) && elapsed(event) !== undefined);
  const filtered = events.filter((event) => matches(query, name(event), path(event)));
  const durations = filtered.map((event) => elapsed(event)!);
  const slow = durations.filter((duration) => duration >= 100).length;
  return <>
    <div class="dt-filters">
      <button type="button" class="dt-button primary" aria-pressed={recording} disabled={!model.connected}
        onClick={() => actions.profile(!recording)}>{recording ? 'Stop recording' : 'Start recording'}</button>
      <Search label="Search operations" value={query} setValue={setQuery} />
    </div>
    <Metrics entries={[
      ['Operations', durations.length], ['Slow (≥100 ms)', slow],
      ['Mean', ms(durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : undefined)],
      ['Longest', ms(durations.length ? Math.max(...durations) : undefined)],
    ]} />
    <h3>Operation timeline</h3>
    <Timeline events={filtered} detailed />
    <RequestFlameGraph events={events} />
  </>;
}
