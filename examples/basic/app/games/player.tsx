// Player loads the selected scene, controls the game, and releases its resources on cleanup.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { createGame } from 'tinyjs/three';

export default function Player({ mode }: { mode: 'crystals' | 'terrain' }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Awaited<ReturnType<typeof createGame>>>();
  const [started, setStarted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Ready when you are.');
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [fps, setFps] = useState(0);
  // Load only after starting; cancel and dispose if the mode changes or the page closes.
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let instance: Awaited<ReturnType<typeof createGame>> | undefined;
    setReady(false); setPaused(false); setScore(0); setFps(0); setStatus('Loading scene…');
    void (async () => {
      const { createGame } = await import('tinyjs/three');
      if (cancelled || !host.current) return;
      instance = await createGame(host.current, { pixelRatio: 1.5, shadows: mode === 'terrain', onFrame: value => { if (!cancelled) setFps(Math.round(value)); }, onError: () => { if (!cancelled) { setStatus('Rendering failed. Restart to retry.'); setReady(false); } } });
      if (cancelled) { instance.dispose(); return; }
      game.current = instance;
      const scene = mode === 'terrain' ? (await import('./terrain')).default() : (await import('./crystals')).default(value => { if (!cancelled) setScore(value); });
      if (cancelled) return;
      await instance.loadScene(scene);
      if (cancelled) return;
      instance.start(); setReady(true); setStatus('Scene running.');
      host.current?.focus();
    })().catch(() => {
      instance?.dispose();
      if (!cancelled) { setReady(false); setStatus('Could not initialize WebGL. Check hardware acceleration, then restart.'); }
    });
    return () => { cancelled = true; instance?.dispose(); game.current = undefined; };
  }, [started, attempt, mode]);
  // Keep the toolbar state in step with the game loop.
  function togglePause() {
    if (!game.current || !ready) return;
    if (paused) game.current.resume(); else game.current.pause();
    setPaused(!paused); setStatus(paused ? 'Scene running.' : 'Paused.');
  }
  return <><div class="game-toolbar"><p role="status">{status} {ready && !paused ? `${fps} FPS` : ''}</p>{!started ? <button onClick={() => setStarted(true)}>Start game</button> : <><button disabled={!ready} onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button><button onClick={() => setAttempt(value => value + 1)}>Restart</button></>}</div>{mode === 'crystals' && <p aria-live="polite">Crystals: {score} / 8 {score === 8 ? '— All collected! Restart to play again.' : ''}</p>}<div class="game-viewport" ref={host} tabIndex={0} role="region" aria-label={`${mode === 'terrain' ? 'Terrain driving' : 'Crystal collection'} game. Use WASD or arrow keys.`} /><p class="status">Click or focus the scene, then use WASD or arrow keys. {mode === 'crystals' ? 'You can also hold and drag inside the scene to move. Collect all eight crystals.' : 'Drive forward and steer through procedural terrain. This demo has no collision physics.'}</p></>;
}
