// This scene builds the bus and streams terrain chunks around it for the arcade Player.
import { createScene } from 'tinyjs/three';
import { createTerrainChunks, terrainHeight, terrainVertices } from 'tinyjs/terrain';
import type { Group, Mesh } from 'three';

export default function busScene() {
  let bus: Group;
  let terrain: ReturnType<typeof createTerrainChunks<Mesh>>;
  let heading = 0;
  const seed = 42, size = 32, segments = 16;
  return createScene({
    setup({ three: T, scene }) {
      scene.background = new T.Color('#a8d9ed');
      // Fog ends before the nearest edge of the camera-centered chunk window.
      scene.fog = new T.Fog('#a8d9ed', 35, 60);
      scene.add(new T.HemisphereLight(0xcceeff, 0x52672d, 2));
      const sun = new T.DirectionalLight(0xffffff, 2);
      sun.position.set(10, 30, 15); sun.castShadow = true;
      sun.shadow.mapSize.set(512, 512); scene.add(sun);
      const ground = new T.MeshStandardMaterial({ color: '#6a9b4b', roughness: 1, side: T.DoubleSide });
      // Build a mesh for each nearby chunk; remove its geometry when it leaves the window.
      terrain = createTerrainChunks((x, z) => {
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position', new T.BufferAttribute(terrainVertices(x, z, { seed, size, segments }), 3));
        const indices: number[] = [];
        for (let row = 0; row < segments; row++) for (let col = 0; col < segments; col++) {
          const a = row * (segments + 1) + col, b = a + segments + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
        geometry.setIndex(indices); geometry.computeVertexNormals();
        const mesh = new T.Mesh(geometry, ground); mesh.receiveShadow = true; scene.add(mesh); return mesh;
      }, (mesh) => { scene.remove(mesh); mesh.geometry.dispose(); }, { size, radius: 2 });
      // Group the body, windows, and wheels so they move together.
      bus = new T.Group();
      const body = new T.Mesh(new T.BoxGeometry(2, 1.8, 4), new T.MeshStandardMaterial({ color: '#ffd34b' }));
      body.position.y = 1.4; body.castShadow = true; bus.add(body);
      const glass = new T.Mesh(new T.BoxGeometry(2.02, 0.65, 2.8), new T.MeshStandardMaterial({ color: '#29485b' }));
      glass.position.set(0, 1.85, 0.3); bus.add(glass);
      const wheelGeometry = new T.CylinderGeometry(0.45, 0.45, 0.25, 10);
      const wheelMaterial = new T.MeshStandardMaterial({ color: '#25292b' });
      for (const x of [-1, 1]) for (const z of [-1.25, 1.25]) {
        const wheel = new T.Mesh(wheelGeometry, wheelMaterial); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.5, z); bus.add(wheel);
      }
      scene.add(bus); terrain.update(0, 0);
      return () => { terrain.dispose(); ground.dispose(); };
    },
    // Each frame moves the bus, follows the ground, and updates the visible chunks.
    update(delta, { camera, input }) {
      const steer = Number(input.keys.has('ArrowLeft') || input.keys.has('KeyA')) - Number(input.keys.has('ArrowRight') || input.keys.has('KeyD'));
      const drive = Number(input.keys.has('ArrowUp') || input.keys.has('KeyW')) - Number(input.keys.has('ArrowDown') || input.keys.has('KeyS'));
      heading += steer * delta * 1.5;
      bus.rotation.y = heading;
      bus.position.x += Math.sin(heading) * drive * delta * 12;
      bus.position.z += Math.cos(heading) * drive * delta * 12;
      bus.position.y = terrainHeight(bus.position.x, bus.position.z, seed);
      camera.position.set(bus.position.x - Math.sin(heading) * 11, bus.position.y + 7, bus.position.z - Math.cos(heading) * 11);
      camera.lookAt(bus.position.x, bus.position.y + 1, bus.position.z);
      terrain.update(camera.position.x, camera.position.z);
    },
  });
}
