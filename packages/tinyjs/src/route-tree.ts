import { h } from 'preact';
import type { ComponentChild, ComponentChildren, ComponentType } from 'preact';

export type Layout = ComponentType<{ children: ComponentChildren }>;

export interface PageProps {
  params: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
}

// Convert URL query values into page props, keeping repeated values as arrays.
export function queryProps(search: URLSearchParams): PageProps['query'] {
  const result: PageProps['query'] = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    Object.defineProperty(result, key, { value: values.length === 1 ? values[0] : values, enumerable: true, configurable: true });
  }
  return result;
}

// Find the layouts between the app root and a page, from outermost to innermost.
export function layoutAncestry(page: string) {
  const directories = page.split('/').slice(1, -1);
  return directories.map((_, index) => `/${directories.slice(0, index + 1).join('/')}/layout.tsx`);
}

// Wrap a page in its layouts so both server rendering and browser rendering use the same tree.
export function pageTree(Page: ComponentType<PageProps>, layouts: Layout[], props: PageProps = { params: {}, query: {} }) {
  return layouts.reduceRight<ComponentChild>((child, Layout) => h(Layout, { children: child }), h(Page, props));
}
