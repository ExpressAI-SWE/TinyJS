import { h } from 'preact';
import type { ComponentChild, ComponentChildren, ComponentType } from 'preact';

export type Layout = ComponentType<{ children: ComponentChildren }>;

export function layoutAncestry(page: string) {
  const directories = page.split('/').slice(1, -1);
  return directories.map((_, index) => `/${directories.slice(0, index + 1).join('/')}/layout.tsx`);
}

export function pageTree(Page: ComponentType, layouts: Layout[]) {
  return layouts.reduceRight<ComponentChild>((child, Layout) => h(Layout, { children: child }), h(Page, {}));
}
