import { Component, h, hydrate, render } from 'preact';
import type { ComponentChild, ComponentType } from 'preact';
import { layoutAncestry, pageTree } from './route-tree.js';
import type { Layout, PageProps } from './route-tree.js';
import { matchRoute, requestPath } from './routing.js';
import { prefersReducedData } from './loading.js';

const pages = import.meta.glob<ComponentType<PageProps>>(['/app/**/page.tsx', '/app/**/error.tsx', '/app/not-found.tsx', '!/app/api/**'], { import: 'default' });
const layouts = import.meta.glob<Layout>(['/app/**/layout.tsx', '!/app/api/**'], { import: 'default' });
const loading = import.meta.glob<ComponentType<PageProps>>('/app/**/loading.tsx', { import: 'default' });
const root = document.getElementById('tinyjs-root');
let generation = 0;
let pending: AbortController | undefined;

class RouteBoundary extends Component<{ children: ComponentChild; fallback: ComponentChild }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

async function tree(element: HTMLElement) {
  const file = element.dataset.page!;
  if (!pages[file]) throw new Error(`Unknown TinyJS page: ${file}`);
  const [Page, ...parents] = await Promise.all([pages[file](), ...layoutAncestry(file).filter((key) => key in layouts).map((key) => layouts[key]())]);
  const props = JSON.parse(element.dataset.props ?? '{"params":{},"query":{}}') as PageProps;
  let content = pageTree(Page, parents, props);
  if (import.meta.env.TINYJS_ERRORS !== false) for (const errorFile of layoutAncestry(file).map(key => key.replace('layout.tsx', 'error.tsx')).reverse().filter(key => pages[key] && key !== file)) {
    const [ErrorPage, ...errorParents] = await Promise.all([pages[errorFile](), ...layoutAncestry(errorFile).filter(key => layouts[key]).map(key => layouts[key]())]);
    content = h(RouteBoundary, { key: errorFile + file + element.dataset.props, children: content, fallback: pageTree(ErrorPage, errorParents, props) });
  }
  return content;
}

if (root?.dataset.page) hydrate(await tree(root), root);

async function navigate(url: URL, push: boolean) {
  if (!root) return;
  const id = ++generation;
  pending?.abort();
  pending = new AbortController();
  try {
    if (import.meta.env.TINYJS_LOADING !== false) {
      const destination = matchRoute(Object.keys(pages).filter(key => key.endsWith('/page.tsx')), requestPath(url.pathname), '/page.tsx');
      const fallback = layoutAncestry(destination?.file ?? '/app/not-found.tsx').map((key) => key.replace('layout.tsx', 'loading.tsx')).reverse().find((key) => loading[key]);
      if (fallback) {
        const Loading = await loading[fallback]();
        if (id !== generation) return;
        render(pageTree(Loading, []), root);
      }
    }
    const response = await fetch(url, { signal: pending.signal, headers: { Accept: 'text/html' } });
    if (!response.headers.get('content-type')?.includes('text/html') || new URL(response.url).origin !== location.origin) throw new Error('Document navigation required');
    const document = new DOMParser().parseFromString(await response.text(), 'text/html');
    const next = document.getElementById('tinyjs-root');
    if (!next) throw new Error('Missing TinyJS root');
    const content = await tree(next);
    // Load new styles before rendering, preserving already-loaded styles and scripts.
    await Promise.all(Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) => {
      if (Array.from(window.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).some((current) => current.href === link.href)) return;
      return new Promise<void>((resolve, reject) => {
        const copy = link.cloneNode() as HTMLLinkElement;
        copy.onload = () => resolve(); copy.onerror = () => reject(new Error('Stylesheet failed'));
        window.document.head.append(copy);
      });
    }));
    if (id !== generation) return;
    if (push) history.pushState(null, '', response.url + url.hash);
    root.dataset.page = next.dataset.page;
    root.dataset.props = next.dataset.props;
    render(content, root);
    window.document.title = document.title;
    window.document.querySelector('meta[name="description"]')?.remove();
    const description = document.querySelector('meta[name="description"]');
    if (description) window.document.head.append(description.cloneNode(true));
    if (url.hash) window.document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
    else window.scrollTo(0, 0);
  } catch {
    if (id === generation) location.assign(url);
  }
}

document.addEventListener('click', (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || link.target || link.dataset.reload !== undefined) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || (url.pathname === location.pathname && url.search === location.search)) return;
  event.preventDefault();
  void navigate(url, true);
});
window.addEventListener('popstate', () => { void navigate(new URL(location.href), false); });

// Explicit hints only; do not fetch documents or dependencies speculatively.
const prefetched = new Set<string>();
document.addEventListener('pointerover', (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-prefetch][href]');
  if (!link || prefersReducedData() || prefetched.has(link.href) || prefetched.size >= 64) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin) return;
  prefetched.add(link.href);
  const hint = document.createElement('link');
  hint.rel = 'prefetch'; hint.href = url.href; document.head.append(hint);
});
