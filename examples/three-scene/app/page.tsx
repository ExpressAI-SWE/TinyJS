import { useEffect, useRef, useState } from 'preact/hooks';

export default function ThreeScene() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading scene…');
  useEffect(() => {
    let cancelled = false;
    let game: { dispose(): void } | undefined;
    void (async () => {
      const { createGame } = await import('tinyjs/three');
      if (cancelled || !host.current) return;
      const instance = await createGame(host.current, { onError: () => setStatus('Rendering failed.') });
      game = instance;
      if (cancelled) { instance.dispose(); return; }
      await instance.loadScene({
        setup({ three: T, scene }) {
          scene.add(new T.Mesh(new T.BoxGeometry(), new T.MeshNormalMaterial()));
        },
        update(delta, { scene }) { scene.rotation.y += delta; },
      });
      if (!cancelled) { instance.start(); setStatus('Rotating cube'); }
    })().catch(() => { game?.dispose(); if (!cancelled) setStatus('WebGL is unavailable.'); });
    return () => { cancelled = true; game?.dispose(); };
  }, []);
  return <main><h1>Three.js scene</h1><p role="status">{status}</p><div ref={host} style={{ height: '60vh' }} /></main>;
}
