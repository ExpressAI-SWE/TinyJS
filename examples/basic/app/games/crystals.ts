// This scene creates the crystal collection game used by the arcade Player.
import { createScene } from 'tinyjs/three';
import type { Mesh } from 'three';

export default function crystals(onScore: (score: number) => void) {
  let player: Mesh;
  const gems: Mesh[] = [];
  let score = 0;
  return createScene({
    // Setup runs once when Player loads the scene.
    setup({ three: T, scene, camera }) {
      scene.background = new T.Color('#101c38');
      scene.add(new T.HemisphereLight(0xbddfff, 0x553777, 3));
      const grid = new T.GridHelper(20, 20, 0x3c6fd4, 0x253b65);
      scene.add(grid);
      player = new T.Mesh(new T.IcosahedronGeometry(0.45, 1), new T.MeshStandardMaterial({ color: '#75e8d1', metalness: 0.3, roughness: 0.3 }));
      player.position.y = 0.5; scene.add(player);
      for (let i = 0; i < 8; i++) {
        const gem = new T.Mesh(new T.OctahedronGeometry(0.38), new T.MeshStandardMaterial({ color: '#f4b8ff', emissive: '#572467' }));
        const angle = i / 8 * Math.PI * 2;
        gem.position.set(Math.sin(angle) * 6, 0.7, Math.cos(angle) * 6);
        gems.push(gem); scene.add(gem);
      }
      camera.position.set(0, 17, 10); camera.lookAt(0, 0, 0);
      onScore(0);
    },
    // Every frame moves the player and reports newly collected gems to Player.
    update(delta, { input }) {
      const x = Number(input.keys.has('ArrowRight') || input.keys.has('KeyD')) - Number(input.keys.has('ArrowLeft') || input.keys.has('KeyA'));
      const z = Number(input.keys.has('ArrowDown') || input.keys.has('KeyS')) - Number(input.keys.has('ArrowUp') || input.keys.has('KeyW'));
      const length = Math.hypot(x, z) || 1;
      player.position.x = Math.max(-9, Math.min(9, player.position.x + x / length * delta * 6));
      player.position.z = Math.max(-9, Math.min(9, player.position.z + z / length * delta * 6));
      if (input.pointer.down) {
        player.position.x += (input.pointer.x * 9 - player.position.x) * Math.min(1, delta * 8);
        player.position.z += (-input.pointer.y * 9 - player.position.z) * Math.min(1, delta * 8);
      }
      player.rotation.y += delta;
      for (const gem of gems) {
        gem.rotation.y += delta * 1.5;
        if (gem.visible && Math.hypot(gem.position.x - player.position.x, gem.position.z - player.position.z) < 0.85) {
          // Keep collected meshes attached so scene disposal owns their GPU resources.
          gem.visible = false; onScore(++score);
        }
      }
    },
  });
}
