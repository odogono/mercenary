import { expect, test } from 'bun:test';

import { openingFrameState, planDionFrame } from '../src/dion/frame.ts';
import {
  renderAuthentic,
  rgbaFromIndexed
} from '../src/rendering/authentic.ts';
import {
  DESCRIPTION_STRIDE,
  descriptionPalette,
  descriptionVertices
} from '../src/rendering/gpuDescription.ts';
import { dionContent } from './dion-documents.ts';
import { dionRenderCheckpoints } from './dion-render-checkpoints.ts';
import { renderingDescription as description } from './rendering-description.ts';

test('the shared Authentic mode preserves interleaved painter order and row palettes at a different projection size', () => {
  const frame = renderAuthentic(description);
  expect(frame.pixels.length).toBe(48);
  expect(frame.pixels[3 * 8 + 4]).toBe(1);
  expect(frame.pixels[3 * 8 + 3]).toBe(2);
  const rgba = new Uint8ClampedArray(8 * 6 * 4);
  rgbaFromIndexed(description, frame, rgba);
  expect(Array.from(rgba.slice((2 * 8 + 4) * 4, (2 * 8 + 4) * 4 + 4))).toEqual([
    255, 0, 0, 255
  ]);
  expect(Array.from(rgba.slice((3 * 8 + 4) * 4, (3 * 8 + 4) * 4 + 4))).toEqual([
    0, 0, 255, 255
  ]);
});

test('Dion emits a camera-first description with stable source/order and its exact Authentic geometry', async () => {
  const { world } = await dionContent();
  const planned = planDionFrame(world, openingFrameState(world));
  expect(planned.description.projection).toEqual({
    centre: [160, 68],
    focal: 256,
    height: 136,
    near: 0.001,
    width: 320
  });
  expect(renderAuthentic(planned.description).pixels).toEqual(
    planned.frame.pixels
  );
  expect(
    planned.description.primitives.filter(p => p.kind === 'polygon').length
  ).toBe(planned.stats.polygons);
  expect(
    planned.description.primitives.every(
      (p, order) => p.order === order && p.source.length > 0
    )
  ).toBe(true);
  expect(
    planned.description.primitives.some(
      p => p.kind === 'polygon' && p.camera.length >= 3
    )
  ).toBe(true);
});

test('the GPU stream uses primary camera geometry, preserves order, and has finite vertices at all eighteen checkpoints', async () => {
  const a = descriptionVertices(description);
  const b = descriptionVertices({
    ...description,
    primitives: description.primitives.map(p => {
      if (p.kind === 'point') {
        return p;
      }
      if (p.kind === 'polygon') {
        return {
          ...p,
          screen: [
            [100, 100],
            [101, 100],
            [100, 101]
          ]
        };
      }
      return {
        ...p,
        screen: [
          [100, 100],
          [101, 101]
        ]
      };
    })
  });
  expect(a).toEqual(b);
  expect(a.length % (3 * DESCRIPTION_STRIDE)).toBe(0);
  for await (const { planned } of dionRenderCheckpoints()) {
    const vertices = descriptionVertices(planned.description);
    expect(vertices.every(Number.isFinite)).toBe(true);
    expect(vertices.length).toBeGreaterThan(0);
  }
});

test('the GPU palette texture preserves index colours independently at every reference row', () => {
  const texture = descriptionPalette(description);
  expect(texture.width).toBe(3);
  expect(
    Array.from(texture.pixels.slice((2 * 3 + 1) * 4, (2 * 3 + 1) * 4 + 4))
  ).toEqual([255, 0, 0, 255]);
  expect(
    Array.from(texture.pixels.slice((3 * 3 + 1) * 4, (3 * 3 + 1) * 4 + 4))
  ).toEqual([0, 0, 255, 255]);
});

test('Dion allocates only visible star colours, first claims the descending free slot and falls back to zero when full', async () => {
  const { world } = await dionContent();
  const controlled = {
    ...world,
    cells: [],
    drawList: { ...world.drawList, fixed: [] },
    framePalette: {
      ...world.framePalette,
      fixed: new Map<number, number>(),
      road: 0x3_33,
      skyNight: 0x2_22,
      template: Array.from({ length: 16 }, (_v, index) =>
        index === 0 ? 0x7_77 : 0x80_00
      )
    },
    sky: {
      ...world.sky,
      colours: [0x7_77, 0x7_77, 0x6_66],
      stars: [
        [10, 10],
        [20, 1024 + 10],
        [500, 2048 + 10]
      ] as const
    }
  };
  const state = {
    ...openingFrameState(world),
    day: false,
    heading: 0,
    pitch: 0x1_28
  };
  const free = planDionFrame(controlled, state);
  expect(free.description.primitives.map(p => p.colour)).toEqual([
    { index: 15 },
    { index: 15 }
  ]);
  expect(free.palette[15]).toBe(0x7_77);
  expect(free.palette).not.toContain(0x6_66);
  const full = planDionFrame(
    {
      ...controlled,
      framePalette: {
        ...controlled.framePalette,
        template: Array.from({ length: 16 }, () => 0x1_11)
      }
    },
    state
  );
  expect(full.description.primitives.map(p => p.colour)).toEqual([
    { index: 0 },
    { index: 0 }
  ]);
  expect(full.palette).not.toContain(0x7_77);
});
