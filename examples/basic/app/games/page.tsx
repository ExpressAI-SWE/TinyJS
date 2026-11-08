// The arcade selects a scene and gives that choice to the Player component.
import { useState } from 'preact/hooks';
import Player from './player';

export default function Arcade() {
  const [mode, setMode] = useState<'crystals' | 'terrain'>('crystals');
  return <><section class="page-heading"><p class="eyebrow">The browser arcade</p><h1>Go on. Press play.</h1><p>Two worlds powered by Three.js and the TinyJS game lifecycle. Loaded on demand, rendered in your browser.</p></section><label for="scene">Choose a game </label><select id="scene" value={mode} onChange={event => setMode(event.currentTarget.value as typeof mode)}><option value="crystals">Crystal collector</option><option value="terrain">Infinite terrain bus</option></select><Player key={mode} mode={mode} /><a class="back-link" href="/docs/games">Read how scenes and cleanup work</a></>;
}
