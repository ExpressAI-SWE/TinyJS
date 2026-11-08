// This component filters the shared catalog and links to each dynamic detail page.
import { useState } from 'preact/hooks';
import { examples } from './catalog';
export default function Catalog() {
  const [search, setSearch] = useState('');
  const matches = examples.filter(item => `${item.name} ${item.capability}`.toLowerCase().includes(search.toLowerCase()));
  return <section class="demo-box"><h2>Hydrated filtering</h2><p>Filter this local example index using Preact state, then open a dynamic detail route.</p><label for="filter">Find an example</label><input id="filter" value={search} onInput={event => setSearch(event.currentTarget.value)} placeholder="Try terrain" /><p role="status">{matches.length} examples</p><ul class="results">{matches.map(item => <li key={item.id}><a href={`/lab/items/${item.id}?from=lab`}>{item.name}</a><span>{item.capability}</span></li>)}</ul>{!matches.length && <p>No examples match. Try another search.</p>}</section>;
}
