// TinyJS supplies the URL values used to find an item in the shared catalog.
import type { PageProps } from 'tinyjs/routing';
import { examples } from '../../catalog';
export default function Item({ params, query }: PageProps) {
  const item = examples.find(entry => entry.id === params.id);
  return <section class="page-heading"><p class="eyebrow">Dynamic route</p><h1>{item?.name ?? 'Unknown example'}</h1><p>{item?.capability ?? 'Choose an example from the web lab.'}</p><pre>{JSON.stringify({ params, query }, null, 2)}</pre><p>These values are supplied by the TinyJS router from the current URL.</p><a class="button" href="/lab">Back to the lab</a></section>;
}
