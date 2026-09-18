import { describe, expect, test } from 'bun:test';

import {
  BLANK_DAMOCLES_ROW,
  advanceDisplay,
  displayCells,
  startDisplay
} from '../src/damocles/display.ts';

describe('the persistent Damocles Display', () => {
  test('scrolls a 48-cell record in by eight pixels for 36 frames', () => {
    const text = 'MESSAGE'.padEnd(48);
    let display = startDisplay('script2-inline-1', BLANK_DAMOCLES_ROW);
    expect(displayCells(display, text)).toEqual({
      cells: BLANK_DAMOCLES_ROW,
      scrollPixels: 0
    });
    display = advanceDisplay(display, text);
    expect(displayCells(display, text)).toEqual({
      cells: `${' '.repeat(47)}M`,
      scrollPixels: 8
    });
    for (let frame = 2; frame <= 35; frame += 1) {
      display = advanceDisplay(display, text);
    }
    expect(display).toMatchObject({
      kind: 'scrolling',
      reveal: { pixels: 280 }
    });
    display = advanceDisplay(display, text);
    expect(display).toEqual({ cells: text, kind: 'held' });
    expect(displayCells(display, text)).toEqual({
      cells: text,
      scrollPixels: 0
    });
  });
});
