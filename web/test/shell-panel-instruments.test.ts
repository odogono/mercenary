import { describe, expect, test } from 'bun:test';

import { drawElevation } from '../src/shell/panelView.ts';

interface Fill {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/// A canvas that records what was painted, so the instruments can be reasoned about without a
/// browser. Only the calls the gauges make are answered.
const recorder = (width: number, height: number) => {
  const fills: Fill[] = [];
  const styles: string[] = [];
  const context = {
    fillRect: (x: number, y: number, w: number, h: number) => {
      fills.push({ height: h, width: w, x, y });
      styles.push(String(context.fillStyle));
    },
    fillStyle: '',
    fillText: () => {},
    font: '',
    imageSmoothingEnabled: true,
    textAlign: '',
    textBaseline: ''
  };
  const canvas = {
    getContext: () => context,
    height,
    width
  } as unknown as HTMLCanvasElement;
  const root = {} as HTMLElement;
  return {
    canvas,
    /// The band painted in a given token colour, if any.
    bandOf: (token: string): Fill | undefined => {
      const at = styles.indexOf(token);
      return at === -1 ? undefined : fills[at];
    },
    root
  };
};

// The gauges read their colours from the token layer, which a stub root answers by name.
const originalGetComputedStyle = globalThis.getComputedStyle;
globalThis.getComputedStyle = (() => ({
  getPropertyValue: (name: string) => name
})) as unknown as typeof originalGetComputedStyle;

describe('the elevation gauge', () => {
  test('splits sky over ground at the middle when level', () => {
    const { bandOf, canvas, root } = recorder(62, 116);

    drawElevation(canvas, root, 0);

    expect(bandOf('--gauge-sky')).toEqual({
      height: 58,
      width: 62,
      x: 0,
      y: 0
    });
    expect(bandOf('--gauge-ground')).toEqual({
      height: 58,
      width: 62,
      x: 0,
      y: 58
    });
  });

  test('drops the horizon as the nose rises, rather than moving a needle', () => {
    const { bandOf, canvas, root } = recorder(62, 116);

    drawElevation(canvas, root, 10);

    const sky = bandOf('--gauge-sky')!;
    // Nose up means more sky in view: the boundary itself is the reading.
    expect(sky.height).toBeGreaterThan(58);
    expect(bandOf('--gauge-ground')!.y).toBe(sky.height);
  });

  test('raises the horizon as the nose falls', () => {
    const { bandOf, canvas, root } = recorder(62, 116);

    drawElevation(canvas, root, -10);

    expect(bandOf('--gauge-sky')!.height).toBeLessThan(58);
  });

  test('never paints past its own frame, however steep the climb', () => {
    for (const pitch of [-90, -60, 60, 90]) {
      const { bandOf, canvas, root } = recorder(62, 116);

      drawElevation(canvas, root, pitch);

      const sky = bandOf('--gauge-sky')!;
      const ground = bandOf('--gauge-ground')!;
      expect(sky.height).toBeGreaterThanOrEqual(0);
      expect(sky.height).toBeLessThanOrEqual(116);
      expect(ground.y + ground.height).toBe(116);
    }
  });
});
