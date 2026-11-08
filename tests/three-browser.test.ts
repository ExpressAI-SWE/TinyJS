// These browser tests check that the Three.js renderer and example game work together through their lifecycle.
import { expect, test } from 'bun:test';
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import type { GameContext } from '../packages/tinyjs/src/three.js';

test('browser renderer mounts, resizes, switches scenes and disposes', async () => {
  const build = await Bun.build({ entrypoints: [join(import.meta.dir, '../packages/tinyjs/src/three.ts'), join(import.meta.dir, '../examples/infinite-terrain/app/game.ts')], target: 'browser' });
  expect(build.success).toBe(true);
  const server = Bun.serve({ port: 0, fetch(request) {
    const asset = build.outputs.find((file) => new URL(request.url).pathname === '/' + file.path.split(/[\\/]/).pop());
    return asset
      ? new Response(asset, { headers: { 'Content-Type': 'text/javascript' } })
      : new Response('<!doctype html><div id="game" tabindex="0" style="width:320px;height:200px"></div>', { headers: { 'Content-Type': 'text/html' } });
  } });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath: process.env.TINYJS_CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.port}`);
    const result = await page.evaluate(async () => {
      const { createGame } = await import('/three.js');
      const container = document.getElementById('game')!;
      let cleanup = 0;
      const game = await createGame(container, { pixelRatio: 1 });
      await game.loadScene({ setup({ three: T, scene }: GameContext) {
        scene.add(new T.Mesh(new T.BoxGeometry(), new T.MeshNormalMaterial()));
        return () => { cleanup++; };
      } });
      game.start();
      container.style.width = '400px';
      await new Promise<void>((resolve) => {
        const observer = new ResizeObserver(() => {
          if (game.renderer.domElement.width === 400) { observer.disconnect(); resolve(); }
        });
        observer.observe(container);
      });
      const width = game.renderer.domElement.width;
      let failedSetupAborted = false;
      try {
        await game.loadScene({ setup({ signal }: GameContext) {
          signal.addEventListener('abort', () => { failedSetupAborted = true; });
          throw new Error('expected setup failure');
        } });
      } catch { /* The previous scene must survive failed setup. */ }
      const busScene = (await import('/game.js')).default;
      const definition = busScene();
      let context: GameContext;
      await game.loadScene({
        async setup(value: GameContext) { context = value; return definition.setup(value); },
      });
      (context!.input.keys as Set<string>).add('KeyW');
      for (let index = 0; index < 500; index++) definition.update(0.1, context!);
      const terrainChunks = context!.scene.children.filter((child) => child.type === 'Mesh').length;
      const traveled = context!.camera.position.z;
      game.renderer.render(context!.scene, game.camera);
      game.pause(); game.resume(); game.dispose(); game.dispose();
      return { cleanup, width, terrainChunks, traveled, failedSetupAborted, canvases: container.querySelectorAll('canvas').length };
    });
    expect(result).toMatchObject({ cleanup: 1, width: 400, terrainChunks: 25, failedSetupAborted: true, canvases: 0 });
    expect(result.traveled).toBeGreaterThan(500);
  } finally { await browser?.close(); await server.stop(true); }
}, 30_000);
