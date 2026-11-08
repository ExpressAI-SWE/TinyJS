// The lab combines the API request and searchable catalog demonstrations.
import ApiInspector from './api-inspector';
import Catalog from './catalog-view';
export default function Lab() {
  return <><section class="page-heading"><p class="eyebrow">The web lab</p><h1>Small experiments. Real behavior.</h1><p>Server handlers, browser state, and URL-driven pages, connected end to end.</p></section><div class="lab-grid"><ApiInspector /><Catalog /></div></>;
}
