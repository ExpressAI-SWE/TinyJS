// These tests check the playground game scenes and their interactions with the framework.
import { expect, test } from 'bun:test';
import * as three from 'three';
import type { GameContext } from '../packages/tinyjs/src/three';
import { disposeScene } from '../packages/tinyjs/src/three';
import crystals from '../examples/basic/app/games/crystals';
import terrain from '../examples/basic/app/games/terrain';

function context(): GameContext {
  return { three, scene: new three.Scene(), camera: new three.PerspectiveCamera(), input: { keys: new Set(), pointer: { x: 0, y: 0, down: false } }, signal: new AbortController().signal, renderer: {} as GameContext['renderer'] };
}

test('crystals use actual input, collect once, and retain resources for disposal', async () => {
  const scores: number[] = [];
  const definition = crystals(score => scores.push(score));
  const ctx = context();
  await definition.setup!(ctx);
  const meshes = ctx.scene.children.filter((child): child is three.Mesh => child instanceof three.Mesh);
  const player = meshes[0];
  const gem = meshes[1];
  ctx.input.pointer.down = true;
  ctx.input.pointer.x = gem.position.x / 9;
  ctx.input.pointer.y = -gem.position.z / 9;
  for (let i = 0; i < 20; i++) definition.update!(0.1, ctx);
  expect(scores).toEqual([0, 1]);
  expect(gem.visible).toBe(false);
  expect(ctx.scene.children).toContain(gem);
  expect(player.position.distanceTo(gem.position)).toBeLessThan(0.3);
  const resources = new Set<three.BufferGeometry | three.Material>();
  ctx.scene.traverse(object => {
    const mesh = object as three.Mesh;
    if (mesh.geometry) resources.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
  });
  let disposed = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
  disposeScene(ctx.scene);
  expect(disposed).toBe(resources.size);
  expect(ctx.scene.children).toHaveLength(0);
});

test('terrain streams a bounded window and disposes chunks and shared material', async () => {
  const ctx = context();
  const definition = terrain();
  const cleanup = await definition.setup!(ctx);
  const chunks = ctx.scene.children.filter((child): child is three.Mesh => child instanceof three.Mesh);
  expect(chunks).toHaveLength(25);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  for (const mesh of chunks) mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  (chunks[0].material as three.Material).addEventListener('dispose', () => materialDisposals++);
  (ctx.input.keys as Set<string>).add('KeyW');
  for (let i = 0; i < 200; i++) definition.update!(0.1, ctx);
  expect(ctx.camera.position.z).toBeGreaterThan(100);
  expect(ctx.scene.children.filter(child => child instanceof three.Mesh)).toHaveLength(25);
  cleanup!();
  disposeScene(ctx.scene);
  expect(geometryDisposals).toBe(25);
  expect(materialDisposals).toBe(1);
  expect(ctx.scene.children).toHaveLength(0);
});
