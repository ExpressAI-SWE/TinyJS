import type { ComponentChildren } from 'preact';
import { isRecord } from './view.js';
import type { DashboardActions, DashboardModel } from './view.js';
import type { DevEvent } from './protocol.js';

export interface InspectorProps { model: DashboardModel; actions: DashboardActions }
export type Data = Record<string, unknown>;
type Cell = string | number | ComponentChildren;
export type Row = { key: number | string; cells: Cell[] };

export function string(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function display(value: unknown) {
  return value === undefined || value === null || value === '' ? '—' :
    typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function ms(value: unknown) {
  const duration = number(value);
  return duration === undefined ? '—' : duration.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ms';
}

export function bytes(value: unknown) {
  const size = number(value);
  if (size === undefined) return '—';
  if (Math.abs(size) >= 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + ' MiB';
  if (Math.abs(size) >= 1024) return (size / 1024).toFixed(2) + ' KiB';
  return size + ' B';
}

export function seconds(value: unknown) {
  const uptime = number(value);
  if (uptime === undefined) return '—';
  const whole = Math.floor(uptime);
  if (whole < 60) return whole + ' s';
  if (whole < 3600) return Math.floor(whole / 60) + ' min ' + whole % 60 + ' s';
  return Math.floor(whole / 3600) + ' h ' + Math.floor(whole / 60) % 60 + ' min';
}

export function clock(time: number) {
  return new Date(time).toLocaleTimeString();
}

export function name(event: DevEvent) {
  return string(event.data.name ?? event.data.type ?? event.data.phase, event.kind);
}

export function path(event: DevEvent) {
  return string(event.data.path ?? event.data.url ?? event.data.route, '—');
}

export function elapsed(event: DevEvent) {
  return number(event.data.duration ?? event.data.durationMs);
}

export function sameFile(first: unknown, second: unknown) {
  const normalize = (file: string) => file.replace(/^\/src\/app\//, '/app/')
    .replace(/\.jsx$/, '.tsx').replace(/\.js$/, '.ts');
  return typeof first === 'string' && typeof second === 'string' &&
    normalize(first) === normalize(second);
}

export function list(value: unknown): Data[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function matches(keyword: string, ...values: unknown[]) {
  const query = keyword.trim().toLowerCase();
  return !query || values.some((value) => display(value).toLowerCase().includes(query));
}

export function Table({ columns, rows, selected }: { columns: string[]; rows: Row[]; selected?: Row['key'] }) {
  if (!rows.length) return <p class="dt-muted">No matching entries.</p>;
  return <div class="dt-table-wrap" tabIndex={0}><table class="dt-table">
    <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.key} data-selected={row.key === selected ? 'true' : undefined}>
      {row.cells.map((cell, index) => <td key={index} title={typeof cell === 'string' ? cell : undefined}>{cell ?? '—'}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

export function Search({ label, value, setValue }: { label: string; value: string; setValue(value: string): void }) {
  return <input type="search" aria-label={label} placeholder={label} value={value} onInput={(event) => setValue(event.currentTarget.value)} />;
}

export function Metrics({ entries }: { entries: [string, unknown][] }) {
  return <dl class="dt-metrics">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}</dl>;
}

export function Detail({ value, exclude = [] }: { value: Data; exclude?: string[] }) {
  const entries = Object.entries(value).filter(([key]) => !exclude.includes(key));
  return <div class="dt-detail">{entries.map(([key, item]) =>
    typeof item === 'object' && item !== null
      ? <details key={key}><summary>{key}</summary><pre class="dt-code">{JSON.stringify(item, null, 2)}</pre></details>
      : <p key={key}><span class="dt-muted">{key}</span> {display(item)}</p>)}
  </div>;
}

export function SelectRow({ label, select, active }: { label: string; select(): void; active: boolean }) {
  return <button class="dt-link" type="button" onClick={select} aria-pressed={active} title={label}>{label}</button>;
}

export function Source({ file, line, open }: { file: string; line?: number; open(file: string, line?: number): void }) {
  return file ? <button class="dt-button" type="button" onClick={() => open(file, line)}>Open source in editor</button> : null;
}
