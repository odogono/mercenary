import { expect, test } from '@playwright/test';

for (const slot of [65, 66]) {
  test(`authored building ${slot} draws on foot and from the air in both presets`, async ({
    page
  }, testInfo) => {
    await page.goto('/e2e/wireframe-fixture.html');
    await expect(page.locator('#result')).toHaveAttribute(
      'data-state',
      'ready'
    );
    for (const aerial of [false, true]) {
      for (const preset of ['authentic', 'enhanced'] as const) {
        const result = await page.evaluate(
          async ({ aerial, preset, slot }) => {
            const { fetchAssets, fetchReader, load } =
              await import('../src/payload/load.ts');
            const { World } = await import('../src/world/index.ts');
            const { GameplaySession, openingPlayer, sessionContent } =
              await import('../src/session/index.ts');
            const { REFERENCE_WALKING_EYE_ALTITUDE } =
              await import('../src/gameCore/index.ts');
            const { planFrame, Renderer } =
              await import('../src/shell/frame.ts');
            const bundle = await load(
              fetchReader(location.origin + '/payload/'),
              fetchAssets('/assets/targ.json')
            );
            const world = new World(bundle);
            const building = world.objects.find(
              object => object.slot === slot
            )!;
            const session = new GameplaySession(
              sessionContent(world, bundle, undefined),
              openingPlayer()
            );
            const dx = slot === 65 ? 3000 : 4200;
            const dz = slot === 65 ? 7500 : 8000;
            const y = aerial ? 6000 : REFERENCE_WALKING_EYE_ALTITUDE;
            const snapshot = {
              ...session.snapshot,
              player: {
                ...session.snapshot.player,
                heading: Math.PI - Math.atan2(dx, dz),
                pitch: Math.atan2(1300 - y, Math.hypot(dx, dz)),
                position: {
                  x: building.origin.x + dx,
                  y,
                  z: building.origin.z - dz
                },
                roll: 0
              }
            };
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 800;
            const renderer = new Renderer(canvas);
            const plan = planFrame(
              world,
              snapshot,
              { height: 800, width: 1280 },
              undefined,
              { preset, structureReach: 'cell' }
            );
            renderer.render(plan, { glow: 0, thickness: 1 });
            const gl = canvas.getContext('webgl2')!;
            const image = new Image();
            image.id = 'building';
            image.src = canvas.toDataURL();
            document.querySelector('#building')?.remove();
            document.body.append(image);
            await image.decode();
            const amber = plan.batches.filter(
              batch =>
                batch.colour.red === 214 &&
                batch.colour.green === 168 &&
                batch.colour.blue === 75
            );
            const white = plan.batches.filter(
              batch =>
                batch.colour.red === 255 &&
                batch.colour.green === 255 &&
                batch.colour.blue === 255
            );
            const error = gl.getError();
            gl.getExtension('WEBGL_lose_context')?.loseContext();
            return {
              amberLines: amber.reduce(
                (sum, batch) => sum + batch.vertices.length / 4,
                0
              ),
              error,
              whiteLines: white.reduce(
                (sum, batch) => sum + batch.vertices.length / 4,
                0
              )
            };
          },
          { aerial, preset, slot }
        );
        expect(result.error).toBe(0);
        expect(result.amberLines).toBeGreaterThan(0);
        expect(result.whiteLines).toBeGreaterThan(20);
        await page.locator('#building').screenshot({
          path: testInfo.outputPath(`${aerial ? 'air' : 'foot'}-${preset}.png`)
        });
      }
    }
  });
}
