import type { PerspectiveCamera, Scene, WebGLRenderer, Object3D, Material, Texture } from 'three';

// A scene receives these shared objects and input state during setup and updates.
export interface GameContext {
  three: typeof import('three');
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  input: { keys: ReadonlySet<string>; pointer: { x: number; y: number; down: boolean } };
  signal: AbortSignal;
}
// Setup can return cleanup; update runs once per rendered frame.
export interface GameScene {
  setup?: (context: GameContext) => void | (() => void) | Promise<void | (() => void)>;
  update?: (delta: number, context: GameContext) => void;
}
export const createScene = (scene: GameScene): GameScene => scene;

/** Resources added to a scene are owned by that scene; do not share them across games. */
export function disposeScene(scene: Object3D) {
  const resources = new Set<{ dispose(): void }>();
  const environment = scene as Object3D & { background?: Texture | null; environment?: Texture | null };
  for (const texture of [environment.background, environment.environment]) if (texture?.isTexture) resources.add(texture);
  scene.traverse((object) => {
    const mesh = object as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[]; shadow?: { dispose(): void } };
    if (mesh.shadow) resources.add(mesh.shadow);
    if (mesh.geometry) resources.add(mesh.geometry);
    for (const material of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : []) {
      resources.add(material);
      for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
  if (environment.background?.isTexture) environment.background = null;
  if (environment.environment?.isTexture) environment.environment = null;
  scene.clear();
}

// Create the browser renderer and manage scenes, input, and their lifetime.
export async function createGame(container: HTMLElement, options: {
  pixelRatio?: number;
  shadows?: boolean;
  onFrame?: (fps: number) => void;
  onError?: (error: unknown) => void;
} = {}) {
  if (typeof window === 'undefined') throw new Error('createGame must run in a browser effect.');
  if (options.pixelRatio !== undefined && (!Number.isFinite(options.pixelRatio) || options.pixelRatio <= 0)) {
    throw new RangeError('pixelRatio must be positive.');
  }
  const three = await import('three');
  const renderer = new three.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(options.pixelRatio ?? Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = options.shadows ?? false;
  const camera = new three.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 3, 8);
  const keys = new Set<string>();
  const pointer = { x: 0, y: 0, down: false };
  const lifetime = new AbortController();
  let current: { context: GameContext; definition: GameScene; controller: AbortController; cleanup?: () => void } | undefined;
  let pending: AbortController | undefined;
  let disposed = false;
  let running = false;
  let last = 0;
  let frames = 0;
  let elapsed = 0;
  // Keep the drawing surface and camera matched to the container.
  const resize = () => {
    const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  container.append(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  observer.observe(container);
  resize();
  // All input listeners share a lifetime, so disposal removes them together.
  const listen = (target: EventTarget, name: string, fn: EventListener) => target.addEventListener(name, fn, { signal: lifetime.signal });
  listen(window, 'keydown', (event) => {
    if (!container.contains(document.activeElement)) return;
    const code = (event as KeyboardEvent).code;
    keys.add(code);
    if (code.startsWith('Arrow')) event.preventDefault();
  });
  listen(window, 'keyup', (event) => { keys.delete((event as KeyboardEvent).code); });
  listen(window, 'blur', () => { keys.clear(); pointer.down = false; });
  // Convert pointer position to the -1 to 1 coordinates used by Three.js.
  listen(renderer.domElement, 'pointermove', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event as PointerEvent).clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1;
    pointer.y = -((event as PointerEvent).clientY - rect.top) / Math.max(rect.height, 1) * 2 + 1;
  });
  listen(renderer.domElement, 'pointerdown', () => { container.focus(); pointer.down = true; });
  listen(window, 'pointerup', () => { pointer.down = false; });
  // The frame loop updates the active scene before rendering and reporting FPS.
  function pause() { running = false; last = 0; renderer.setAnimationLoop(null); }
  function resume() {
    if (disposed) throw new Error('Game is disposed.');
    running = true;
    if (document.hidden) return;
    renderer.setAnimationLoop((time) => {
      const delta = last ? Math.min((time - last) / 1000, 0.1) : 0;
      last = time;
      try {
        if (current) {
          current.definition.update?.(delta, current.context);
          renderer.render(current.context.scene, camera);
        }
        frames++; elapsed += delta;
        if (elapsed >= 0.5) { options.onFrame?.(frames / elapsed); elapsed = 0; frames = 0; }
      } catch (error) { pause(); options.onError?.(error); }
    });
  }
  // Pause rendering in a hidden tab and reset timing before it becomes visible.
  listen(document, 'visibilitychange', () => {
    keys.clear(); last = 0;
    if (document.hidden) renderer.setAnimationLoop(null);
    else if (running) resume();
  });
  // Scene cleanup runs before its graphics resources are released.
  const unload = () => {
    if (!current) return;
    current.controller.abort();
    try { current.cleanup?.(); } finally { disposeScene(current.context.scene); current = undefined; }
  };
  return {
    camera, renderer,
    get scene() { return current?.context.scene; },
    start: resume, pause, resume,
    // Prepare the next scene before replacing the current one; cancel older loads.
    async loadScene(load: GameScene | (() => Promise<GameScene>)) {
      if (disposed) throw new Error('Game is disposed.');
      pending?.abort();
      const controller = pending = new AbortController();
      const scene = new three.Scene();
      let cleanup: void | (() => void) = undefined;
      try {
        const definition = typeof load === 'function' ? await load() : load;
        controller.signal.throwIfAborted();
        const context = { three, scene, camera, renderer, input: { keys, pointer }, signal: controller.signal };
        cleanup = await definition.setup?.(context);
        controller.signal.throwIfAborted();
        unload();
        current = { context, definition, controller, cleanup: cleanup || undefined };
        pending = undefined;
      } catch (error) {
        const cancelled = controller.signal.aborted;
        controller.abort();
        try { cleanup?.(); } finally { disposeScene(scene); }
        if (!cancelled) options.onError?.(error);
        throw error;
      }
    },
    // Stop work and release browser and graphics resources when the game ends.
    dispose() {
      if (disposed) return;
      disposed = true; pause(); pending?.abort(); lifetime.abort(); observer.disconnect();
      try { unload(); } finally { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); keys.clear(); }
    },
  };
}

/** Fetch binary assets with bounded concurrency; consumers own decoding and GPU resources. */
export async function preloadAssets(urls: string[], options: {
  signal?: AbortSignal; concurrency?: number; onProgress?: (loaded: number, total: number) => void;
} = {}) {
  const concurrency = options.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new RangeError('concurrency must be 1–32.');
  // Fetch each URL once, with workers sharing the next item to load.
  const unique = [...new Set(urls)], results = new Map<string, ArrayBuffer>();
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  signal.throwIfAborted();
  let next = 0;
  try { await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (next < unique.length) {
      signal.throwIfAborted();
      const url = unique[next++];
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${url}`);
      results.set(url, await response.arrayBuffer());
      signal.throwIfAborted();
      options.onProgress?.(results.size, unique.length);
    }
  })); } catch (error) { controller.abort(); throw error; }
  return results;
}
