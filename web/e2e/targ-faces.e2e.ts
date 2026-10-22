/* eslint-disable unicorn/consistent-function-scoping -- page.evaluate serializes its callback; browser helpers must be declared inside it. */
import { expect, test } from '@playwright/test';

test('Targ draws coloured concave faces with depth and clipping through both presets', async ({
  page
}) => {
  await page.goto('/e2e/wireframe-fixture.html');
  await expect(page.locator('#result')).toHaveAttribute('data-state', 'ready');
  const result = await page.evaluate(async () => {
    const { Camera } = await import('../src/projection/index.ts');
    const { faceBatch } = await import('../src/shell/faces.ts');
    const { facePolygon } = await import('../src/world/index.ts');
    const { Renderer } = await import('../src/shell/frame.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 800;
    const size = { height: 800, width: 1280 };
    const renderer = new Renderer(canvas);
    const gl = canvas.getContext('webgl2')!;
    const camera = new Camera({
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 }
    });
    const face = (
      points: readonly (readonly [number, number, number])[],
      colour: string
    ) =>
      facePolygon(
        { colour: { colour, kind: 'palette', source: 0 }, doubleSided: true },
        points.map(([x, y, z]) => ({ x, y, z }))
      );
    const red = face(
      [
        [-200, -200, -1000],
        [200, -200, -1000],
        [200, 200, -1000],
        [-200, 200, -1000]
      ],
      '#ff0000'
    );
    const blue = face(
      [
        [-600, -600, -2000],
        [600, -600, -2000],
        [600, 600, -2000],
        [-600, 600, -2000]
      ],
      '#0000ff'
    );
    const draw = (faces: readonly (typeof red)[], enhanced = false) => {
      renderer.render(
        {
          batches: [],
          clear: { blue: 0, green: 0, red: 0 },
          faces: { batch: faceBatch(faces, camera, size)!, before: 0 },
          lines: 0,
          overlays: [],
          points: 0,
          size
        },
        enhanced ? { glow: 0.7, thickness: 3 } : { glow: 0, thickness: 1 }
      );
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
      return pixels;
    };
    const at = (
      pixels: Uint8Array,
      point: { x: number; y: number; z: number }
    ) => {
      const p = camera.projectPoint(point, size)!;
      const offset =
        ((canvas.height - 1 - Math.floor(p.y)) * canvas.width +
          Math.floor(p.x)) *
        4;
      return Array.from(pixels.subarray(offset, offset + 3));
    };
    const authentic = draw([red, blue]);
    const enhanced = draw([red, blue], true);
    const reordered = draw([blue, red]);
    // A second frame must clear the previous depth buffer; blue now fills the centre.
    const nextFrame = draw([blue]);
    const concave = face(
      [
        [-200, -200, -1000],
        [200, -200, -1000],
        [200, 0, -1000],
        [0, 0, -1000],
        [0, 200, -1000],
        [-200, 200, -1000]
      ],
      '#c04080'
    );
    const outline = draw([concave]);
    const crossing = draw([
      face(
        [
          [-100, -100, -500],
          [100, -100, -500],
          [0, 100, 10]
        ],
        '#00ff00'
      )
    ]);
    const behind = draw([
      face(
        [
          [-100, -100, 500],
          [100, -100, 500],
          [0, 100, 500]
        ],
        '#00ff00'
      )
    ]);
    const difference = (a: Uint8Array, b: Uint8Array) =>
      a.some((v, i) => v !== b[i]);
    const countGreen = (pixels: Uint8Array) =>
      pixels.filter((v, i) => i % 4 === 1 && v === 255).length;
    return {
      behindPixels: countGreen(behind),
      border: at(authentic, { x: 500, y: 0, z: -2000 }),
      centre: at(authentic, { x: 0, y: 0, z: -1000 }),
      crossingPixels: countGreen(crossing),
      error: gl.getError(),
      fill: at(outline, { x: -100, y: 100, z: -1000 }),
      nextCentre: at(nextFrame, { x: 0, y: 0, z: -1000 }),
      notch: at(outline, { x: 100, y: 100, z: -1000 }),
      orderDifference: difference(authentic, reordered),
      presetDifference: difference(authentic, enhanced)
    };
  });
  expect(result).toMatchObject({
    behindPixels: 0,
    border: [0, 0, 255],
    centre: [255, 0, 0],
    error: 0,
    fill: [192, 64, 128],
    nextCentre: [0, 0, 255],
    notch: [0, 0, 0],
    orderDifference: false,
    presetDifference: false
  });
  expect(result.crossingPixels).toBeGreaterThan(0);
});
