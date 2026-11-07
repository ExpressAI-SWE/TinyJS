import type { ComponentType } from 'preact';
import { createHandler } from './handler.js';
import type { PageAssets } from './handler.js';
import type { Layout } from './route-tree.js';

const pages = import.meta.glob<ComponentType>(['/app/**/page.tsx', '!/app/api/**'], { eager: true, import: 'default' });
const layouts = import.meta.glob<Layout>(['/app/**/layout.tsx', '!/app/api/**'], { eager: true, import: 'default' });
const apis = import.meta.glob<Record<string, unknown>>('/app/api/**/route.ts', { eager: true });

export function createApplication(assets: PageAssets) {
  return createHandler(pages, layouts, apis, assets);
}
