import type { ComponentChildren } from 'preact';
import './styles.css';

export default function Layout({ children }: { children: ComponentChildren }) {
  return <>
    <header>
      <nav aria-label="Example routes">
        <a href="/">Home</a>
        <a href="/products/field-notes">Product</a>
        <a href="/broken">SSR failure</a>
      </nav>
    </header>
    <main>{children}</main>
  </>;
}
