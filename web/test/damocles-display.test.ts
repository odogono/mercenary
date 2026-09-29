import { describe, expect, test } from 'bun:test';

import {
  BLANK_DAMOCLES_DISPLAY,
  BLANK_DAMOCLES_ROW,
  advanceDisplay,
  beneathOf,
  displayCells,
  documentMessageId,
  effectiveMessageRow,
  messagePlane,
  startDisplay,
  type RowPlane
} from '../src/damocles/display.ts';

const planes = (plane: RowPlane): RowPlane[] => Array(48).fill(plane);

describe('the persistent Damocles Display', () => {
  test('scrolls a 48-cell record in by eight pixels for 36 frames', () => {
    const text = 'MESSAGE'.padEnd(48);
    let display = startDisplay(
      'script2-inline-1',
      beneathOf(BLANK_DAMOCLES_DISPLAY)
    );
    expect(displayCells(display, text)).toEqual({
      cells: BLANK_DAMOCLES_ROW,
      planes: planes(0),
      scrollPixels: 0
    });
    display = advanceDisplay(display, text);
    expect(displayCells(display, text)).toEqual({
      cells: `${' '.repeat(47)}M`,
      planes: planes(0),
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
    expect(display).toEqual({ cells: text, kind: 'held', plane: 0 });
    expect(displayCells(display, text)).toEqual({
      cells: text,
      planes: planes(0),
      scrollPixels: 0
    });
  });

  // A Read's deferred path sets `$7BA2` to 2, so a body's glyphs go to plane 1 (#598).
  test('draws a document body in plane 1 over the green row it scrolls across', () => {
    const id = documentMessageId(151, 1);
    expect(messagePlane(id)).toBe(1);
    expect(messagePlane('script6-inline-1')).toBe(0);
    const beneath = { cells: 'THE FILE IS HERE'.padEnd(48), plane: 0 as const };
    const body = 'A PARLIAMENTARY COMMITTEE HAS BEEN SITTING FOR THE LAST';
    let display = startDisplay(id, beneath);
    for (let frame = 1; frame <= 18; frame += 1) {
      display = advanceDisplay(display, body);
    }
    // 144 pixels in: 24 cells of the row beneath, then 24 of the body.
    const cells = displayCells(display, body);
    expect(cells.planes).toEqual([
      ...planes(0).slice(0, 24),
      ...planes(1).slice(24)
    ]);
    for (let frame = 19; frame <= 36; frame += 1) {
      display = advanceDisplay(display, body);
    }
    expect(display).toEqual({
      cells: body.slice(0, 48),
      kind: 'held',
      plane: 1
    });
  });

  test('shows a record longer than the row from a block offset, blank past its end', () => {
    const body = 'X'.repeat(48) + 'LAST THIRTY YEARS';
    expect(effectiveMessageRow(body, 48)).toBe('LAST THIRTY YEARS'.padEnd(48));
    let display = startDisplay(
      documentMessageId(151, 1),
      { cells: body.slice(0, 48), plane: 1 },
      48
    );
    for (let frame = 1; frame <= 36; frame += 1) {
      display = advanceDisplay(display, body);
    }
    expect(display).toEqual({
      cells: 'LAST THIRTY YEARS'.padEnd(48),
      kind: 'held',
      plane: 1
    });
  });
});
