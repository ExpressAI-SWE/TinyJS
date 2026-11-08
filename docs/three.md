# Three.js and games

Install `three` in applications that use `tinyjs/three`, and install `@types/three` as a development dependency for TypeScript applications. Ordinary TinyJS pages never import Three.js. Call `createGame` in a browser effect and dispose it when the component unmounts. The async factory imports Three.js only after confirming that a browser exists. SSR renders your normal page, metadata and loading text; it never constructs WebGL.

```ts
import { createGame, createScene } from 'tinyjs/three';

const game = await createGame(container, { pixelRatio: 1.5, shadows: true });
await game.loadScene(createScene({
  setup({ three: T, scene }) {
    scene.add(new T.Mesh(new T.BoxGeometry(), new T.MeshNormalMaterial()));
  },
  update(delta, { scene }) { scene.rotation.y += delta; },
}));
game.start();
// On unmount:
game.dispose();
```

`loadScene` also accepts an async factory for lazy scene imports. `setup` may be async and may return a synchronous cleanup function; it receives an AbortSignal. A superseded scene setup must cooperate with cancellation and must not keep mutating resources after it resolves. Failed scene setup is disposed and the previously active scene stays active. Call `pause` and `resume` manually when needed. Visibility changes pause rendering automatically. Delta seconds are capped at 0.1 after stalls.

The context exposes native `three`, `scene`, perspective `camera`, `renderer`, keyboard codes and normalized pointer coordinates. Keyboard input is active while focus is inside the container: give the container `tabIndex={0}` and an accessible label. Native APIs remain available for lights, shadows, custom cameras and loaders. ResizeObserver updates the renderer and camera aspect. `onFrame(fps)` reports a half-second average; `onError(error)` reports setup/render failures. A render error pauses the game; fix or reload the scene and resume. Destroy and recreate a game after a lost WebGL context if native restoration cannot recover.

Scene geometry, materials, directly attached material textures, scene background/environment textures and light shadows are automatically disposed, once per resource, when unloaded. Scenes own those resources: do not share them between active scenes. Dispose custom render targets, skeletons, external event listeners and addon controls in the setup cleanup callback. The renderer and canvas are released by `game.dispose()`.

`preloadAssets(urls, { signal, concurrency, onProgress })` fetches unique binary assets with concurrency 4 by default (1–32 supported), returning `Map<string, ArrayBuffer>`. Progress counts completed assets. Decode or load textures with native Three.js loaders; the caller owns decoded resources. Failed requests reject, and an AbortSignal cancels outstanding fetches.

Run `bun run --cwd examples/three-scene dev` for a cube. Run `bun run --cwd examples/infinite-terrain dev` for the bus game. Click the canvas and use WASD or arrow keys. Both examples show stable SSR loading shells and initialize in effects. Restart terrain with its button to recover from an initialization error.

The terrain example separates rendering, input-driven vehicle updates, and framework terrain utilities. Terrain is a seeded analytic height field with matching chunk edges. `createTerrainChunks` unloads before allocating replacements and holds at most `(2 * radius + 1)^2` chunks (25 in the example). Each chunk uses a 16×16 grid; all chunks share one material. GPU geometry is disposed as chunks leave the radius. This is a driving demonstration with a geometry-built bus, not a physics engine: there are no collisions, suspension or slope dynamics. Shadows use a small fixed directional-light map. A pixel ratio of 1.5 and fog limit rendering cost; performance depends on the GPU and viewport.
