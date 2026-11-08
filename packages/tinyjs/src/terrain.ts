export interface TerrainOptions { seed?: number; size?: number; segments?: number; radius?: number }

export function terrainHeight(x: number, z: number, seed = 1) {
  return Math.sin(x * 0.025 + seed) * 3 + Math.cos(z * 0.03 - seed) * 3 + Math.sin((x + z) * 0.012 + seed * 2) * 5;
}

export function terrainVertices(chunkX: number, chunkZ: number, options: TerrainOptions = {}) {
  const size = options.size ?? 32, segments = options.segments ?? 16, seed = options.seed ?? 1;
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(segments) || segments < 1 || segments > 256 || !Number.isFinite(seed)) {
    throw new RangeError('Terrain requires a positive size, 1–256 segments, and finite seed.');
  }
  const vertices = new Float32Array((segments + 1) ** 2 * 3);
  for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
    const index = (z * (segments + 1) + x) * 3;
    const worldX = (chunkX + x / segments) * size, worldZ = (chunkZ + z / segments) * size;
    vertices[index] = worldX;
    vertices[index + 1] = terrainHeight(worldX, worldZ, seed);
    vertices[index + 2] = worldZ;
  }
  return vertices;
}

/** Keeps at most (2 * radius + 1)^2 chunks alive, including when crossing negative coordinates. */
export function createTerrainChunks<T>(create: (x: number, z: number) => T, dispose: (chunk: T) => void, options: TerrainOptions = {}) {
  const size = options.size ?? 32, radius = options.radius ?? 2;
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(radius) || radius < 0 || radius > 8) throw new RangeError('Invalid terrain size or radius (0–8).');
  const chunks = new Map<string, T>();
  return {
    chunks: chunks as ReadonlyMap<string, T>,
    update(x: number, z: number) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Terrain coordinates must be finite.');
      const cx = Math.floor(x / size), cz = Math.floor(z / size), needed = new Set<string>();
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) needed.add(`${cx + dx},${cz + dz}`);
      for (const [key, chunk] of chunks) if (!needed.has(key)) { chunks.delete(key); dispose(chunk); }
      for (const key of needed) if (!chunks.has(key)) { const [a, b] = key.split(',').map(Number); chunks.set(key, create(a, b)); }
    },
    dispose() { for (const chunk of chunks.values()) dispose(chunk); chunks.clear(); },
  };
}
