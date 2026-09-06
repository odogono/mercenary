import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

const CAPTURE_POSES = [
  { name: 'level', pitch: 0, roll: 0 },
  { name: 'banked', pitch: 0, roll: Math.PI / 4 },
  { name: 'inverted', pitch: Math.PI, roll: 0 },
  { name: 'upward', pitch: 0.7, roll: 0 }
] as const;

test('Enhanced twilight follows the world horizon in the WebGL renderer', async ({
  page
}) => {
  await page.goto('/e2e/wireframe-fixture.html');
  const result = await page.evaluate(async () => {
    const { defaultSettings } = await import('../src/settings/index.ts');
    const { ScenePalette } = await import('../src/scene/index.ts');
    const { Renderer } = await import('../src/shell/frame.ts');
    const { buildSkyFrame } = await import('../src/sky/frame.ts');
    const { createTargOrrery, skyStateAt } =
      await import('../src/sky/index.ts');

    const large = { height: 800, width: 1280 };
    const settings = defaultSettings();
    const orrery = createTargOrrery(settings.presentation.sky);
    const state = skyStateAt(orrery, 540);
    const canvas = document.createElement('canvas');
    canvas.width = large.width;
    canvas.height = large.height;
    const renderer = new Renderer(canvas, orrery);
    const gl = canvas.getContext('webgl2')!;
    const shaderChecks: Array<{ actual: number[]; expected: number[] }> = [];

    for (const view of [
      { mirrored: false, pitch: 0, roll: 0, size: large },
      { mirrored: false, pitch: 0, roll: Math.PI / 4, size: large },
      { mirrored: false, pitch: Math.PI, roll: 0, size: large },
      { mirrored: false, pitch: 2 * Math.PI + 0.7, roll: 0, size: large },
      { mirrored: true, pitch: 0.7, roll: 0, size: large },
      { mirrored: false, pitch: 0, roll: 0, size: { height: 400, width: 640 } }
    ]) {
      const sky = buildSkyFrame(
        state,
        {
          heading: 0,
          mirrored: view.mirrored,
          pitch: view.pitch,
          roll: view.roll
        },
        view.size
      );
      canvas.width = view.size.width;
      canvas.height = view.size.height;
      renderer.render({
        batches: [],
        clear: sky.clear,
        lines: 0,
        overlays: [],
        points: 0,
        size: view.size,
        sky
      });
      const samples: readonly (readonly [number, number])[] = [
        [view.size.width / 2, 0],
        [view.size.width / 4, view.size.height / 4],
        [(view.size.width * 3) / 4, view.size.height / 2],
        [view.size.width / 2, (view.size.height * 3) / 4]
      ];
      for (const [x, y] of samples) {
        const actual = new Uint8Array(4);
        gl.readPixels(
          Math.floor(x),
          view.size.height - 1 - Math.floor(y),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          actual
        );
        const gradient = sky.gradient!;
        const direction = [
          (x + 0.5 - gradient.centre.x) / gradient.focal.x,
          (gradient.centre.y - (y + 0.5)) / gradient.focal.y,
          1
        ];
        const length = Math.hypot(...direction);
        const elevation = Math.asin(
          Math.max(
            -1,
            Math.min(
              1,
              (direction[0]! * gradient.upInView.x +
                direction[1]! * gradient.upInView.y +
                direction[2]! * gradient.upInView.z) /
                length
            )
          )
        );
        const progress = Math.max(0, Math.min(1, elevation / (Math.PI / 6)));
        const amount = progress * progress * (3 - 2 * progress);
        shaderChecks.push({
          actual: [...actual],
          expected: [
            Math.round(
              gradient.horizon.red +
                (gradient.zenith.red - gradient.horizon.red) * amount
            ),
            Math.round(
              gradient.horizon.green +
                (gradient.zenith.green - gradient.horizon.green) * amount
            ),
            Math.round(
              gradient.horizon.blue +
                (gradient.zenith.blue - gradient.horizon.blue) * amount
            ),
            255
          ]
        });
      }
    }

    const level = buildSkyFrame(
      state,
      { heading: 0, mirrored: false, pitch: 0, roll: 0 },
      large
    );
    canvas.width = large.width;
    canvas.height = large.height;
    renderer.render({
      batches: [
        {
          colour: ScenePalette.ground,
          mode: 'triangles',
          pointSize: 1,
          vertices: new Float32Array([
            0,
            large.height / 2,
            large.width,
            large.height / 2,
            large.width,
            large.height,
            0,
            large.height / 2,
            large.width,
            large.height,
            0,
            large.height
          ])
        }
      ],
      clear: level.clear,
      lines: 0,
      overlays: [],
      points: 0,
      size: large,
      sky: level
    });
    const bottom = new Uint8Array(4);
    gl.readPixels(large.width / 2, 20, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bottom);

    return {
      bottom: [...bottom],
      error: gl.getError(),
      ground: [
        ScenePalette.ground.red,
        ScenePalette.ground.green,
        ScenePalette.ground.blue,
        255
      ],
      shaderChecks
    };
  });

  expect(result.error).toBe(0);
  expect(result.bottom).toEqual(result.ground);
  for (const check of result.shaderChecks) {
    for (const [index, value] of check.actual.entries()) {
      expect(Math.abs(value - check.expected[index]!)).toBeLessThanOrEqual(1);
    }
  }
});

test('regenerates the Enhanced twilight review frames', async ({ page }) => {
  test.skip(process.env['UPDATE_REFERENCE_FRAMES'] !== '1');
  await page.goto('/e2e/wireframe-fixture.html');
  const names = await page.evaluate(async capturePoses => {
    const { fetchReader, load } = await import('../src/payload/load.ts');
    const { GameplaySession, openingPlayer, sessionContent } =
      await import('../src/session/index.ts');
    const { defaultSettings } = await import('../src/settings/index.ts');
    const { planFrame, Renderer } = await import('../src/shell/frame.ts');
    const { createTargOrrery } = await import('../src/sky/index.ts');
    const { World } = await import('../src/world/index.ts');

    const size = { height: 800, width: 1280 };
    const settings = defaultSettings();
    const orrery = createTargOrrery(settings.presentation.sky);
    const bundle = await load(fetchReader(location.origin + '/payload/'));
    const world = new World(bundle);
    const session = new GameplaySession(
      sessionContent(world, bundle, undefined),
      openingPlayer()
    );
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const renderer = new Renderer(canvas, orrery);

    for (const pose of capturePoses) {
      const snapshot = {
        ...session.snapshot,
        elapsed: 540,
        player: {
          ...session.snapshot.player,
          pitch: pose.pitch,
          roll: pose.roll
        }
      };
      renderer.render(
        planFrame(world, snapshot, size, orrery, settings.presentation)
      );
      const image = new Image();
      image.id = `twilight-${pose.name}`;
      image.src = canvas.toDataURL();
      image.style.display = 'block';
      document.body.append(image);
    }
    return capturePoses.map(pose => pose.name);
  }, CAPTURE_POSES);

  for (const name of names) {
    await page.locator(`#twilight-${name}`).screenshot({
      path: resolve(`../docs/frames/issue-116-twilight-${name}.png`)
    });
  }
});
