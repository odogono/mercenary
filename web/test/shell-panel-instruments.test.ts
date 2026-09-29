import { describe, expect, test } from 'bun:test';

import {
  drawCompass,
  drawDamoclesMessage,
  drawElevation
} from '../src/shell/panelView.ts';

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
  const texts: { readonly text: string; readonly y: number }[] = [];
  const columns: { readonly text: string; readonly x: number }[] = [];
  const context = {
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => {
      fills.push({ height: h, width: w, x, y });
      styles.push(String(context.fillStyle));
    },
    fillStyle: '',
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, y });
      columns.push({ text, x });
    },
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
    columns,
    /// The band painted in a given token colour, if any.
    bandOf: (token: string): Fill | undefined => {
      const at = styles.indexOf(token);
      return at === -1 ? undefined : fills[at];
    },
    root,
    texts
  };
};

// The gauges read their colours from the token layer, which a stub root answers by name.
const originalGetComputedStyle = globalThis.getComputedStyle;
globalThis.getComputedStyle = (() => ({
  getPropertyValue: (name: string) => name
})) as unknown as typeof originalGetComputedStyle;

interface Painted {
  readonly columns?: { readonly text: string; readonly x: number }[];
  readonly texts: { readonly text: string; readonly y: number }[];
}

/// Where a graduation was printed, if it was in view at all.
const rowOf = (shot: Painted, label: string): number | undefined =>
  shot.texts.find(at => at.text === label)?.y;

/// Which column a graduation was printed in, for the tape that scrolls sideways.
const columnOf = (shot: Painted, label: string): number | undefined =>
  shot.columns?.find(at => at.text === label)?.x;

const labels = (shot: Painted): string[] => shot.texts.map(at => at.text);

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

  test('scrolls its graduations with the reading, like the compass', () => {
    const level = recorder(62, 116);
    drawElevation(level.canvas, level.root, 0);
    const climbing = recorder(62, 116);
    drawElevation(climbing.canvas, climbing.root, 10);

    // The nought is on the tape, so it travels down the window as the nose rises.
    expect(rowOf(level, '00')).toBeDefined();
    expect(rowOf(climbing, '00')!).toBeGreaterThan(rowOf(level, '00')!);
    // The reading itself sits at the centre, whatever it is.
    expect(rowOf(climbing, '10')).toBeCloseTo(58, 0);
    expect(rowOf(level, '00')).toBeCloseTo(58, 0);
  });

  test('brings further graduations into view as the tape scrolls', () => {
    const level = recorder(62, 116);
    drawElevation(level.canvas, level.root, 0);
    const steep = recorder(62, 116);
    drawElevation(steep.canvas, steep.root, 30);

    expect(labels(level)).toContain('00');
    // A circular scale, so ten below nought reads three hundred and fifty.
    expect(labels(level)).toContain('350');
    expect(labels(level)).not.toContain('-10');
    expect(labels(steep)).toContain('30');
    // A tape shows its neighbourhood, not the whole scale at once.
    expect(labels(steep)).not.toContain('00');
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

describe('the compass tape', () => {
  test('reads the heading at the centre, in two digits least', () => {
    const shot = recorder(118, 50);

    drawCompass(shot.canvas, shot.root, 0);

    expect(rowOf(shot, '00')).toBeDefined();
    expect(labels(shot)).toContain('350');
    expect(labels(shot)).not.toContain('-10');
  });

  test('falls to the right, so ten sits left of the heading and 350 right of it', () => {
    const shot = recorder(118, 50);

    drawCompass(shot.canvas, shot.root, 0);

    expect(columnOf(shot, '10')!).toBeLessThan(columnOf(shot, '00')!);
    expect(columnOf(shot, '350')!).toBeGreaterThan(columnOf(shot, '00')!);
  });

  test('scrolls with the heading rather than standing still', () => {
    const ahead = recorder(118, 50);
    drawCompass(ahead.canvas, ahead.root, 0);
    const turned = recorder(118, 50);
    drawCompass(turned.canvas, turned.root, 10);

    // Turning towards ten brings it to the centre the nought used to hold.
    expect(columnOf(turned, '10')).toBeCloseTo(columnOf(ahead, '00')!, 0);
  });
});

describe('the Damocles message line', () => {
  // The face sits each five-row glyph on the row above a bottom baseline, so a glyph set at
  // the canvas's own height fills it exactly; one row lower loses the glyphs' feet.
  test('sets every glyph so its bottom row is the last row of the canvas', () => {
    const { canvas, root, texts } = recorder(288, 5);

    drawDamoclesMessage(canvas, root, {
      cells: 'ENT',
      scrollPixels: 0
    });

    expect(texts.map(at => at.y)).toEqual([5, 5, 5]);
  });
});
