export const DAMOCLES_ROW_CELLS = 48;
export const DAMOCLES_CELL_PIXELS = 6;
export const DAMOCLES_ROW_PIXELS = DAMOCLES_ROW_CELLS * DAMOCLES_CELL_PIXELS;
export const DAMOCLES_SCROLL_PIXELS_PER_FRAME = 8;
export const BLANK_DAMOCLES_ROW = ' '.repeat(DAMOCLES_ROW_CELLS);

export type DamoclesMessageId =
  | 'script11-inline-1'
  | 'script11-inline-2'
  | 'script2-inline-1'
  | 'script2-inline-2'
  | 'script2-inline-3'
  | 'script20-inline-1'
  | 'script5-inline-1'
  | 'script5-inline-2'
  | 'script5-inline-3'
  | 'script6-inline-1'
  | 'script6-inline-2'
  | 'script62-inline-1'
  | 'script62-inline-2'
  | 'script62-inline-3'
  | 'system-string-1'
  | 'system-string-2'
  | 'system-string-50'
  | 'system-string-9';

export interface Reveal {
  readonly beneath: string;
  readonly offset: number;
  readonly pixels: number;
}

export type DamoclesDisplay =
  | { readonly cells: string; readonly kind: 'held' }
  | {
      readonly id: DamoclesMessageId;
      readonly kind: 'scrolling';
      readonly reveal: Reveal;
    };

export interface DisplayCells {
  readonly cells: string;
  readonly scrollPixels: number;
}

export const effectiveMessageRow = (text: string): string =>
  text.slice(0, DAMOCLES_ROW_CELLS).padEnd(DAMOCLES_ROW_CELLS);

export const startDisplay = (
  id: DamoclesMessageId,
  beneath: string
): DamoclesDisplay => ({
  id,
  kind: 'scrolling',
  reveal: { beneath, offset: 0, pixels: 0 }
});

export const advanceDisplay = (
  display: DamoclesDisplay,
  text: string
): DamoclesDisplay => {
  if (display.kind === 'held') {
    return display;
  }
  const pixels = display.reveal.pixels + DAMOCLES_SCROLL_PIXELS_PER_FRAME;
  return pixels >= DAMOCLES_ROW_PIXELS
    ? { cells: effectiveMessageRow(text), kind: 'held' }
    : { ...display, reveal: { ...display.reveal, pixels } };
};

export const displayCells = (
  display: DamoclesDisplay,
  text: string
): DisplayCells =>
  display.kind === 'held'
    ? { cells: display.cells, scrollPixels: 0 }
    : (() => {
        const cellsPassed = Math.floor(
          display.reveal.pixels / DAMOCLES_CELL_PIXELS
        );
        const stream = display.reveal.beneath + effectiveMessageRow(text);
        return {
          cells: stream
            .slice(cellsPassed, cellsPassed + DAMOCLES_ROW_CELLS)
            .padEnd(DAMOCLES_ROW_CELLS),
          scrollPixels: display.reveal.pixels
        };
      })();
