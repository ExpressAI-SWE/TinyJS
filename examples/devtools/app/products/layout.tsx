import type { ComponentChildren } from 'preact';

export default function ProductsLayout({ children }: { children: ComponentChildren }) {
  return <section aria-label="Product catalog">{children}</section>;
}
