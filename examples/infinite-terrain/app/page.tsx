// This page starts the shared terrain scene in the browser and disposes it when the page leaves.
import { useEffect, useRef, useState } from 'preact/hooks';

export default function TerrainGame() {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading terrain…');
  const [attempt, setAttempt] = useState(0);
  // Restart creates a fresh game; cleanup stops the previous one.
  useEffect(() => {
    let cancelled = false;
    let game: { dispose(): void } | undefined;
    setStatus('Loading terrain…');
    void (async () => {
      const { createGame } = await import('tinyjs/three');
      if (cancelled || !container.current) return;
      const instance = await createGame(container.current, {
        shadows: true, pixelRatio: 1.5,
        onFrame: (fps) => setStatus(`${Math.round(fps)} FPS · WASD or arrow keys`),
        onError: () => setStatus('Rendering failed. Try restarting the scene.'),
      });
      game = instance;
      if (cancelled) { instance.dispose(); return; }
      await instance.loadScene(async () => (await import('./game')).default());
      if (!cancelled) instance.start();
    })().catch(() => { if (!cancelled) setStatus('Could not initialize WebGL. Enable hardware acceleration and retry.'); game?.dispose(); });
    return () => { cancelled = true; game?.dispose(); };
  }, [attempt]);
  return <main>
    <h1>Infinite terrain bus</h1>
    <p>Click the scene to drive. Terrain stays bounded at 25 chunks.</p>
    <p role="status">{status}</p>
    <button onClick={() => setAttempt((value) => value + 1)}>Restart scene</button>
    <div ref={container} tabIndex={0} aria-label="Terrain driving game, use WASD or arrow keys" style={{ height: '70vh', minHeight: '300px', outlineOffset: '3px' }} />
  </main>;
}
