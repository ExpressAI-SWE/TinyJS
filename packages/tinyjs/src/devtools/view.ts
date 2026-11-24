import type { DevEvent, DevSnapshot, DevSource } from './protocol.js';

export const sections = [
  ['Overview', '◈'], ['Routes', '⑂'], ['Components', '▦'], ['Network', '⇄'],
  ['Performance', '⌁'], ['Build', '▤'], ['Errors', '!'], ['Server', '▥'],
  ['Configuration', '≡'], ['Settings', '⚙'],
] as const;

export type Section = typeof sections[number][0];
export type Position = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface DashboardModel {
  connected: boolean;
  snapshot?: DevSnapshot;
  events: DevEvent[];
  section: Section;
  position: Position;
  preferences: Record<string, unknown>;
  source?: DevSource;
}

export interface DashboardActions {
  select(section: Section): void;
  close(): void;
  highlight(): void;
  hide(): void;
  save(key: string, value: unknown): void;
  profile(enabled: boolean): void;
  clear(): void;
  openEditor(file: string, line?: number): void;
  loadSource(file: string, line: number): void;
}

export interface Dashboard {
  open(model: DashboardModel, fullscreen: boolean): void;
  update(model: DashboardModel): void;
  close(): void;
  toggleFullscreen(): void;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', value?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
