// This nested layout adds documentation navigation around each docs page.
import type { ComponentChildren } from 'preact';
export default function DocsLayout({ children }: { children: ComponentChildren }) {
  return <div class="docs-layout"><aside class="docs-nav" aria-label="Documentation"><strong>The field guide</strong><a href="/docs">Getting started</a><a href="/docs/routing">Routing &amp; APIs</a><a href="/docs/games">Three.js &amp; games</a></aside><article class="prose">{children}</article></div>;
}
