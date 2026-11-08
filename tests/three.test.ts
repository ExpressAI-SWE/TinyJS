// These tests check the Three.js integration and its game lifecycle helpers.
import { expect, test } from 'bun:test';
import { BoxGeometry, DirectionalLight, Mesh, MeshBasicMaterial, Scene, Texture } from 'three';
import { createGame, disposeScene, preloadAssets } from '../packages/tinyjs/src/three.js';

test('game creation rejects SSR before constructing a renderer', async () => {
  await expect(createGame({} as HTMLElement)).rejects.toThrow('browser effect');
});

test('scene disposal releases shared geometry, material and texture once', () => {
  const scene = new Scene(), geometry = new BoxGeometry(), texture = new Texture(), material = new MeshBasicMaterial({ map: texture });
  let released = 0;
  for (const resource of [geometry, texture, material]) resource.addEventListener('dispose', () => { released++; });
  scene.background = texture; scene.environment = texture;
  const light = new DirectionalLight();
  light.shadow.dispose = () => { released++; };
  scene.add(light);
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  disposeScene(scene); disposeScene(scene);
  expect(released).toBe(4); expect(scene.children.length).toBe(0);
});

test('asset preload deduplicates and reports progress', async () => {
  const progress: number[] = [];
  const assets = await preloadAssets(['data:text/plain,hello', 'data:text/plain,hello'], { onProgress: (loaded) => progress.push(loaded) });
  expect(assets.size).toBe(1); expect(progress).toEqual([1]);
  expect(new TextDecoder().decode(assets.values().next().value)).toBe('hello');
  await expect(preloadAssets([], { concurrency: 0 })).rejects.toThrow();
  const controller = new AbortController(); controller.abort();
  await expect(preloadAssets(['data:text/plain,hello'], { signal: controller.signal })).rejects.toThrow();
});
