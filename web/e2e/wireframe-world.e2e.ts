import { expect, test } from '@playwright/test';

/// Enhanced Targ draws its world through the shared planner (ADR 0087): the surface by day and
/// by night, at twilight under its sky gradient, at altitude, at the whole-surface Structure Reach, and in a lit Room.
test('Enhanced Targ draws the surface and Rooms through the shared planner', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/wireframe-fixture.html');
  await expect(page.locator('#result')).toHaveAttribute('data-state', 'ready');
  for (const scene of [
    'structure',
    'night',
    'twilight',
    'altitude',
    'distant',
    'indoor'
  ] as const) {
    const result = await page.evaluate(async scene => {
      const { fetchReader, load } = await import('../src/payload/load.ts');
      const { World } = await import('../src/world/index.ts');
      const { GameplaySession, openingPlayer, sessionContent } =
        await import('../src/session/index.ts');
      const { Renderer } = await import('../src/shell/frame.ts');
      const { drawTargFrame, planTargFrame } =
        await import('../src/shell/enhancedFrame.ts');
      const { FrameRenderer } = await import('../src/rendering/renderer.ts');
      const { fetchTargSystem } = await import('../src/sky/system.ts');
      const { createTargOrrery, skyGradientAt, skyStateAt } =
        await import('../src/sky/index.ts');
      const { defaultSettings } = await import('../src/settings/index.ts');
      const bundle = await load(fetchReader(location.origin + '/payload/'));
      const system = await fetchTargSystem();
      const orrery = createTargOrrery(
        system,
        defaultSettings().presentation.sky
      );
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
                // These views look into the city along increasing world Z.
                heading: Math.PI,
                pitch:
                  scene === 'altitude'
                    ? -0.6
                    : scene === 'twilight'
                      ? 0.2
                      : -0.3,
                position:
                  scene === 'distant'
                    ? { x: 0, y: 5000, z: 0 }
                    : scene === 'altitude'
                      ? { x: 300_000, y: 200_000, z: 200_000 }
                      : { x: 229_760, y: 1400, z: 751_200 },
                roll: 0
              }
            };
      // The darkest moment of the day, for the night view.
      let elapsed = 0;
      if (scene === 'night') {
        let darkest = Infinity;
        for (let seconds = 0; seconds < 86_400; seconds += 600) {
          const { blue, green, red } = skyStateAt(orrery, seconds).clear;
          if (red + green + blue < darkest) {
            darkest = red + green + blue;
            elapsed = seconds;
          }
        }
      }
      // The first moment of the day under the twilight gradient.
      if (scene === 'twilight') {
        for (let seconds = 0; seconds < 86_400; seconds += 300) {
          const state = skyStateAt(orrery, seconds);
          if (skyGradientAt(state.solarAltitudeDegrees) !== undefined) {
            elapsed = seconds;
            break;
          }
        }
      }
      const canvas = document.createElement('canvas');
      canvas.id = 'frame';
      canvas.width = 1280;
      canvas.height = 800;
      document.querySelector('#frame')!.replaceWith(canvas);
      const renderer = new Renderer(canvas, orrery);
      const shared = new FrameRenderer(
        canvas,
        { cullBackFaces: true, fixedSize: true },
        () => {
          throw new Error('context lost');
        }
      );
      const frame = planTargFrame(
        world,
        snapshot,
        { height: 800, width: 1280 },
        orrery,
        {
          orreryElapsed: elapsed,
          preset: 'enhanced',
          structureReach:
            scene === 'distant' || scene === 'altitude' ? 'all' : 'cell'
        },
        {
          atmosphere:
            system.bodies.find(body => body.id === 'targ')?.atmosphere ?? null,
          outputHeight: 800,
          strokes: {
            lines: { glow: 0.7, weight: 3 },
            roads: { glow: 0.35, weight: 2 }
          }
        }
      );
      drawTargFrame(frame, renderer, () => shared);
      const gl = canvas.getContext('webgl2')!;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      const colours = new Set<number>();
      for (let index = 0; index < pixels.length; index += 4 * 97) {
        colours.add(
          (pixels[index]! << 16) |
            (pixels[index + 1]! << 8) |
            pixels[index + 2]!
        );
      }
      // Preserve the frame across the screenshot task: the ordinary render loop does this every frame.
      const image = new Image();
      image.id = 'scene';
      image.src = canvas.toDataURL();
      document.querySelector('#scene')?.remove();
      canvas.hidden = true;
      canvas.after(image);
      await image.decode();
      return {
        colours: colours.size,
        error: gl.getError(),
        haze: frame.kind === 'shared' ? frame.plan.haze : undefined,
        kind: frame.kind,
        lines: frame.kind === 'shared' ? frame.lines : 0,
        roads: frame.kind === 'shared' ? frame.plan.roadVertices.length : 0,
        sky: frame.kind === 'shared' ? frame.plan.skyVertices.length : 0
      };
    }, scene);
    await page
      .locator('#scene')
      .screenshot({ path: testInfo.outputPath(`${scene}.png`) });
    expect(result.error).toBe(0);
    expect(result.kind).toBe('shared');
    expect(result.lines).toBeGreaterThan(0);
    expect(result.colours).toBeGreaterThan(1);
    if (scene === 'indoor') {
      expect(result.roads).toBe(0);
      expect(result.haze).toBeNull();
      expect(result.sky).toBe(0);
    } else {
      if (scene === 'distant' || scene === 'altitude') {
        expect(result.roads).toBeGreaterThan(0);
      }
      expect(result.haze).not.toBeNull();
      // Targ's sky is the plan's sky pass (#956).
      expect(result.sky).toBeGreaterThan(0);
    }
  }
});
