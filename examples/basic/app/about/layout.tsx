import type { ComponentChildren } from 'preact';

export default function AboutLayout({ children }: { children: ComponentChildren }) {
  return <section aria-label="About TinyJS">{children}</section>;
}
