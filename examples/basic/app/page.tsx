// The home route introduces the playground and embeds the interactive counter.
import Counter from './counter';

export default function Home() {
  return (
    <>
      <section class="hero"><div><p class="eyebrow">The TinyJS playground</p><h1>Small by design.<br />Big on possibility.</h1><p class="lede">Read it. Run it. Play it. Explore server-rendered pages, interactive MDX, and real-time 3D in one little framework.</p><div class="actions"><a class="button" href="/games">Enter the arcade</a><a class="button secondary" href="/docs">Read the docs</a></div><p>Preact + Vite + your imagination.</p></div><div class="hero-art" aria-label="TinyJS illustrated planet"><div class="orbit" /><div class="planet">t.</div><span class="satellite">&lt;/&gt;</span><small>A whole world, a tiny starting point.</small></div></section>
      <section class="intro"><h2>Less setup. More exploring.</h2><p>Every destination has something you can actually try.</p></section>
      <div class="showcase"><a class="feature" href="/docs"><span class="feature-icon">Aa</span><small>Learn</small><h2>Docs that come alive.</h2><p>Markdown, code examples, and hydrated Preact components, together in MDX.</p><strong>Open the field guide ↗</strong></a><a class="feature" href="/games"><span class="feature-icon">◇</span><small>Play</small><h2>A little browser arcade.</h2><p>Collect crystals in a neon arena or drive a bus across endless terrain.</p><strong>Choose your game ↗</strong></a><a class="feature" href="/lab"><span class="feature-icon">{'{}'}</span><small>Experiment</small><h2>See the web at work.</h2><p>Call a real API, filter a collection, and explore dynamic route parameters.</p><strong>Step into the lab ↗</strong></a></div>
      <section class="split"><div><h2>HTML first.<br />Interaction when you need it.</h2><p>The page arrives from the server. Preact hydrates it in your browser. Go ahead, press the button.</p><Counter /></div><pre><code>{`import { useState } from 'preact/hooks';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>
    Count: {count}
  </button>;
}`}</code></pre></section>
    </>
  );
}
