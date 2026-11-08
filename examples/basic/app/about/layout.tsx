// TinyJS wraps the about page in this route-specific section.
import type { ComponentChildren } from 'preact';

export default function AboutLayout({ children }: { children: ComponentChildren }) {
  return <section aria-label="About TinyJS">{children}</section>;
}
