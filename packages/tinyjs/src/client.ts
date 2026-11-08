import { h } from 'preact';
import type { ComponentChildren, ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/** Identical fallback on the server and first client render. */
export function ClientOnly({ children, fallback = null }: { children: ComponentChildren; fallback?: ComponentChildren }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted ? children : fallback;
}

/** Import browser-only code after hydration, with an explicit failure state. */
export function lazyBrowser<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, fallback: ComponentChildren = null) {
  return function BrowserComponent(props: P) {
    const [Component, setComponent] = useState<ComponentType<P> | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      let active = true;
      void load().then(module => { if (active) setComponent(() => module.default); }, () => { if (active) setFailed(true); });
      return () => { active = false; };
    }, []);
    return failed ? h('p', { role: 'alert' }, 'Unable to load component.') : Component ? h(Component, props) : fallback;
  };
}
