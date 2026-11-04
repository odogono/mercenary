/* eslint-disable unicorn/consistent-function-scoping -- page.evaluate serializes its callback; browser helpers must be declared inside it. */
import { expect, test } from '@playwright/test';

test('Authentic Targ draws coloured concave faces with depth and clipping', async ({
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
    const draw = (faces: readonly (typeof red)[]) => {
      renderer.render({
        batches: [],
        clear: { blue: 0, green: 0, red: 0 },
        faces: {
          batch: faceBatch(faces, camera, size, {
            blue: 255,
            green: 255,
            red: 255
          })!,
          before: 0
        },
        lines: 0,
        overlays: [],
        points: 0,
        size
      });
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
      orderDifference: difference(authentic, reordered)
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
    orderDifference: false
  });
  expect(result.crossingPixels).toBeGreaterThan(0);
});

test('Enhanced Targ draws the same faces through the shared planner, depth-tested and culled', async ({
  page
}) => {
  await page.goto('/e2e/wireframe-fixture.html');
  await expect(page.locator('#result')).toHaveAttribute('data-state', 'ready');
  const result = await page.evaluate(async () => {
    const { Camera } = await import('../src/projection/index.ts');
    const { facePolygon } = await import('../src/world/index.ts');
    const { FrameRenderer } = await import('../src/rendering/renderer.ts');
    const { planTargEnhancedFrame, targMesh, targPose } =
      await import('../src/shell/enhancedScene.ts');
    const canvas = document.createElement('canvas');
    canvas.style.width = '1280px';
    canvas.style.height = '800px';
    document.body.append(canvas);
    const size = { height: 800, width: 1280 };
    const renderer = new FrameRenderer(canvas, { cullBackFaces: true }, () => {
      throw new Error('context lost');
    });
    const gl = canvas.getContext('webgl2')!;
    const player = {
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 },
      roll: 0
    };
    const camera = new Camera(player);
    const face = (
      points: readonly (readonly [number, number, number])[],
      colour: string,
      doubleSided = true
    ) =>
      facePolygon(
        {
          colour: { colour, kind: 'palette', source: 0 },
          ...(doubleSided ? { doubleSided: true as const } : {})
        },
        points.map(([x, y, z]) => ({ x, y, z }))
      );
    const square = (z: number, half: number, colour: string, double = true) =>
      face(
        [
          [-half, -half, z],
          [half, -half, z],
          [half, half, z],
          [-half, half, z]
        ],
        colour,
        double
      );
    const draw = (faces: readonly ReturnType<typeof face>[]) => {
      const origin = { x: 0, y: 0, z: 0 };
      const snapshot = { player, worldFlipped: false } as Parameters<
        typeof targPose
      >[0];
      const plan = planTargEnhancedFrame(
        {
          placements: [
            {
              faceCount: faces.length,
              heading: 0,
              id: 'faces',
              keyBase: null,
              kind: 'structure',
              mesh: targMesh(origin, [], faces, {
                blue: 255,
                green: 255,
                red: 255
              }),
              modelId: 'faces',
              name: 'faces',
              position: origin,
              status: 'decoded'
            }
          ],
          pose: targPose(snapshot),
          surface: {
            baseColour: null,
            floorLabelGlyphs: {},
            grid: {
              cellsPerAxis: 16,
              cellUnits: 0x1_00_00,
              origin: { x: 0, z: 0 }
            },
            islands: [],
            placements: [],
            sky: null
          }
        },
        snapshot,
        size,
        800
      );
      renderer.render(plan);
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
      const x = Math.floor((p.x * canvas.width) / size.width);
      const y = Math.floor((p.y * canvas.height) / size.height);
      const offset = ((canvas.height - 1 - y) * canvas.width + x) * 4;
      return Array.from(pixels.subarray(offset, offset + 3));
    };
    const nearFar = draw([
      square(-1000, 200, '#ff0000'),
      square(-2000, 600, '#0000ff')
    ]);
    const farNear = draw([
      square(-2000, 600, '#0000ff'),
      square(-1000, 200, '#ff0000')
    ]);
    const concave = draw([
      face(
        [
          [-200, -200, -1000],
          [200, -200, -1000],
          [200, 0, -1000],
          [0, 0, -1000],
          [0, 200, -1000],
          [-200, 200, -1000]
        ],
        '#c04080'
      )
    ]);
    // A one-sided face draws only from the side Targ's Authentic faces show it from.
    const facing = draw([square(-1000, 200, '#00ff00', false)]);
    const reversed = draw([
      face(
        [
          [-200, 200, -1000],
          [200, 200, -1000],
          [200, -200, -1000],
          [-200, -200, -1000]
        ],
        '#00ff00',
        false
      )
    ]);
    const centre = { x: 0, y: 0, z: -1000 };
    return {
      border: at(nearFar, { x: 500, y: 0, z: -2000 }),
      centre: at(nearFar, centre),
      error: gl.getError(),
      facing: at(facing, centre),
      fill: at(concave, { x: -100, y: 100, z: -1000 }),
      notch: at(concave, { x: 100, y: 100, z: -1000 }),
      reordered: at(farNear, centre),
      reversed: at(reversed, centre)
    };
  });
  expect(result).toMatchObject({
    border: [0, 0, 255],
    centre: [255, 0, 0],
    error: 0,
    fill: [192, 64, 128],
    notch: [0, 0, 0],
    reordered: [255, 0, 0]
  });
  // Exactly one winding of a one-sided face is drawn, as Authentic culls it.
  const authentic = await page.evaluate(async () => {
    const { Camera } = await import('../src/projection/index.ts');
    const { faceBatch } = await import('../src/shell/faces.ts');
    const { facePolygon } = await import('../src/world/index.ts');
    const camera = new Camera({
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 }
    });
    const drawn = (points: readonly (readonly [number, number, number])[]) =>
      faceBatch(
        [
          facePolygon(
            {},
            points.map(([x, y, z]) => ({ x, y, z }))
          )
        ],
        camera,
        { height: 800, width: 1280 },
        { blue: 255, green: 255, red: 255 }
      ) !== undefined;
    return {
      facing: drawn([
        [-200, -200, -1000],
        [200, -200, -1000],
        [200, 200, -1000],
        [-200, 200, -1000]
      ]),
      reversed: drawn([
        [-200, 200, -1000],
        [200, 200, -1000],
        [200, -200, -1000],
        [-200, -200, -1000]
      ])
    };
  });
  expect(result.facing).toEqual(authentic.facing ? [0, 255, 0] : [0, 0, 0]);
  expect(result.reversed).toEqual(authentic.reversed ? [0, 255, 0] : [0, 0, 0]);
  expect(authentic.facing).not.toBe(authentic.reversed);
});
