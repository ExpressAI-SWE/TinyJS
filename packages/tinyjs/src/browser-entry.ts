import { hydrate } from 'preact';
import type { ComponentType } from 'preact';
import { layoutAncestry, pageTree } from './route-tree.js';
import type { Layout } from './route-tree.js';

const pages = import.meta.glob<ComponentType>(['/app/**/page.tsx', '!/app/api/**'], { import: 'default' });
const layouts = import.meta.glob<Layout>(['/app/**/layout.tsx', '!/app/api/**'], { import: 'default' });

const root = document.getElementById('tinyjs-root');
const file = root?.dataset.page;
if (root && file && pages[file]) {
  const [Page, ...parents] = await Promise.all([
    pages[file](),
    ...layoutAncestry(file).filter((key) => key in layouts).map((key) => layouts[key]()),
  ]);
  hydrate(pageTree(Page, parents), root);
}
