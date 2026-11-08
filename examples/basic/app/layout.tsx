// TinyJS wraps pages in this shared navigation, main area, and footer.
import type { ComponentChildren } from 'preact';
import './theme.css';

export default function Layout({ children }: { children: ComponentChildren }) {
  return (
    <>
      <header><a class="brand" href="/">t. <span>TinyJS</span> <small>Playground</small></a><nav aria-label="Main navigation"><a href="/">Explore</a><a href="/docs">Docs</a><a href="/games">Arcade</a><a href="/lab">Web lab</a><a href="/about">About</a></nav></header>
      <main>{children}</main>
      <footer>TinyJS / Small framework. Room to play. <a href="/docs">Build something with it</a></footer>
    </>
  );
}
