import type { ComponentChildren } from 'preact';

export default function Layout({ children }: { children: ComponentChildren }) {
  return (
    <>
      <nav aria-label="Main navigation">
        <a href="/">Home</a>{' · '}<a href="/about">About</a>
      </nav>
      <main>{children}</main>
    </>
  );
}
