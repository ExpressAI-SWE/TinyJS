import type { ComponentType } from 'preact';
import { createHandler } from './handler.js';
import type { PageAssets } from './handler.js';
import type { Layout } from './route-tree.js';
import type { PageProps } from './route-tree.js';

// Vite finds app files at build time so the shared handler can resolve pages, layouts and APIs.
const modules = import.meta.glob<{ default: ComponentType<PageProps>; metadata?: { title?: string; description?: string } }>(['/app/**/page.tsx', '!/app/api/**'], { eager: true });
const pages = Object.fromEntries(Object.entries(modules).map(([file, module]) => [file, module.default]));
const notFound = import.meta.glob<ComponentType<PageProps>>('/app/not-found.tsx', { eager: true, import: 'default' });
const errors = import.meta.glob<ComponentType<PageProps>>(['/app/**/error.tsx', '!/app/api/**'], { eager: true, import: 'default' });
const layouts = import.meta.glob<Layout>(['/app/**/layout.tsx', '!/app/api/**'], { eager: true, import: 'default' });
const apis = import.meta.glob<Record<string, unknown>>('/app/api/**/route.ts', { eager: true });

// Give the request handler the discovered app files and the current build assets.
export function createApplication(assets: PageAssets) {
  return createHandler(pages, layouts, apis, assets, { notFound: notFound['/app/not-found.tsx'], errors, metadata: Object.fromEntries(Object.entries(modules).map(([file, module]) => [file, module.metadata ?? {}])) });
}
