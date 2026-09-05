import { expect, test } from '@playwright/test';

test('the shared renderer draws surface, distant and indoor wireframes with independent styles', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/wireframe-fixture.html');
  await expect(page.locator('#result')).toHaveAttribute('data-state', 'ready');
  for (const scene of ['structure', 'distant', 'indoor'] as const) {
    const result = await page.evaluate(async scene => {
      const { fetchReader, load } = await import('../src/payload/load.ts');
      const { World } = await import('../src/world/index.ts');
      const { GameplaySession, openingPlayer, sessionContent } =
        await import('../src/session/index.ts');
      const { planFrame, Renderer } = await import('../src/shell/frame.ts');
      const bundle = await load(fetchReader(location.origin + '/payload/'));
      const world = new World(bundle);
      const session = new GameplaySession(
        sessionContent(world, bundle, undefined),
        openingPlayer()
      );
      if (scene === 'indoor') {
        session.teleport({ id: 3, kind: 'room' });
      }
      const snapshot =
        scene === 'indoor'
          ? session.snapshot
          : {
              ...session.snapshot,
              player: {
                ...session.snapshot.player,
                heading: 0,
                pitch: -0.3,
                position:
                  scene === 'structure'
                    ? { x: 229_760, y: 1400, z: 751_200 }
                    : { x: 0, y: 5000, z: 0 },
                roll: 0
              }
            };
      const canvas = document.createElement('canvas');
      canvas.id = 'frame';
      canvas.width = 1280;
      canvas.height = 800;
      document.querySelector('#frame')!.replaceWith(canvas);
      const renderer = new Renderer(canvas);
      const plan = planFrame(
        world,
        snapshot,
        { height: 800, width: 1280 },
        undefined,
        {
          preset: 'enhanced',
          structureReach: scene === 'distant' ? 'all' : 'cell'
        }
      );
      renderer.render(plan, { glow: 0.7, thickness: 3 });
      const gl = canvas.getContext('webgl2')!;
      // Preserve the frame across the screenshot task: the ordinary render loop does this every frame.
      const image = new Image();
      image.id = 'scene';
      image.src = canvas.toDataURL();
      document.querySelector('#scene')?.remove();
      canvas.hidden = true;
      canvas.after(image);
      await image.decode();
      return {
        error: gl.getError(),
        lines: plan.lines,
        roads: plan.batches.filter(batch => batch.style === 'roads').length
      };
    }, scene);
    expect(result.error).toBe(0);
    expect(result.lines).toBeGreaterThan(0);
    if (scene === 'indoor') {
      expect(result.roads).toBe(0);
    }
    if (scene === 'distant') {
      expect(result.roads).toBeGreaterThan(0);
    }
    await page
      .locator('#scene')
      .screenshot({ path: testInfo.outputPath(`${scene}.png`) });
  }
});
