import { expect, test } from 'bun:test';
import { createTerrainChunks, terrainVertices } from '../packages/tinyjs/src/terrain.js';

test('terrain is seeded and neighboring chunks share their boundary', () => {
  const a = terrainVertices(0, 0, { seed: 42, segments: 4 });
  expect(a).toEqual(terrainVertices(0, 0, { seed: 42, segments: 4 }));
  expect(a).not.toEqual(terrainVertices(0, 0, { seed: 43, segments: 4 }));
  const b = terrainVertices(1, 0, { seed: 42, segments: 4 });
  for (let row = 0; row <= 4; row++) expect(a.slice((row * 5 + 4) * 3, (row * 5 + 5) * 3)).toEqual(b.slice(row * 15, row * 15 + 3));
});

test('terrain unloads chunks and remains bounded over long trips', () => {
  let created = 0, disposed = 0;
  const terrain = createTerrainChunks(() => ++created, () => { disposed++; }, { radius: 2 });
  for (let i = -100; i < 100; i++) { terrain.update(i * 40, i * -25); expect(terrain.chunks.size).toBe(25); }
  expect(created - disposed).toBe(25);
  terrain.dispose(); terrain.dispose();
  expect(created).toBe(disposed);
  expect(terrain.chunks.size).toBe(0);
  expect(() => terrain.update(NaN, 0)).toThrow();
});
