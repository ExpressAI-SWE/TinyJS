import { normalizeAppFiles } from './route-tree.js';
import type { ComponentType } from 'preact';
import { createHandler } from './handler.js';
import type { PageAssets } from './handler.js';
import type { Layout } from './route-tree.js';
import type { PageProps } from './route-tree.js';

// Vite finds app files at build time so the shared handler can resolve pages, layouts and APIs.
const modules = normalizeAppFiles(import.meta.glob<{ default: ComponentType<PageProps>; metadata?: { title?: string; description?: string } }>(['/__tinyjs_app__/**/page.{tsx,jsx}', '!/__tinyjs_app__/api/**'], { eager: true }));
const pages = Object.fromEntries(Object.entries(modules).map(([file, module]) => [file, module.default]));
const notFound = normalizeAppFiles(import.meta.glob<ComponentType<PageProps>>('/__tinyjs_app__/not-found.{tsx,jsx}', { eager: true, import: 'default' }));
const errors = normalizeAppFiles(import.meta.glob<ComponentType<PageProps>>(['/__tinyjs_app__/**/error.{tsx,jsx}', '!/__tinyjs_app__/api/**'], { eager: true, import: 'default' }));
const layouts = normalizeAppFiles(import.meta.glob<Layout>(['/__tinyjs_app__/**/layout.{tsx,jsx}', '!/__tinyjs_app__/api/**'], { eager: true, import: 'default' }));
const apis = normalizeAppFiles(import.meta.glob<Record<string, unknown>>('/__tinyjs_app__/api/**/route.{ts,js}', { eager: true }));

declare const __TINYJS_ROOT_API_ROUTES__: boolean;
const mountedApis = __TINYJS_ROOT_API_ROUTES__
  ? Object.fromEntries(Object.entries(apis).map(([file, api]) => [file.replace('/app/api/', '/app/'), api]))
  : apis;

// Give the request handler the discovered app files and the current build assets.
export function createApplication(assets: PageAssets) {
  return createHandler(pages, layouts, mountedApis, assets, { notFound: notFound['/app/not-found.tsx'], errors, metadata: Object.fromEntries(Object.entries(modules).map(([file, module]) => [file, module.metadata ?? {}])) });
}
