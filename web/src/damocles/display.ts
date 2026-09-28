export const DAMOCLES_ROW_CELLS = 48;
export const DAMOCLES_CELL_PIXELS = 6;
export const DAMOCLES_ROW_PIXELS = DAMOCLES_ROW_CELLS * DAMOCLES_CELL_PIXELS;
export const DAMOCLES_SCROLL_PIXELS_PER_FRAME = 8;
export const BLANK_DAMOCLES_ROW = ' '.repeat(DAMOCLES_ROW_CELLS);

/// The inline records the landing scripts `$20`-`$3B` present, named for the trigger in decimal
/// (docs/research/damocles-landing-messages.md). `script56` is TOLOSA's.
export const LANDING_MESSAGE_IDS = [
  'script32-inline-1',
  'script32-inline-2',
  'script33-inline-1',
  'script33-inline-2',
  'script33-inline-3',
  'script34-inline-1',
  'script34-inline-2',
  'script35-inline-1',
  'script35-inline-2',
  'script35-inline-3',
  'script36-inline-1',
  'script36-inline-2',
  'script37-inline-1',
  'script37-inline-2',
  'script38-inline-1',
  'script38-inline-2',
  'script38-inline-3',
  'script39-inline-1',
  'script39-inline-2',
  'script39-inline-3',
  'script40-inline-1',
  'script40-inline-2',
  'script41-inline-1',
  'script41-inline-2',
  'script41-inline-3',
  'script43-inline-1',
  'script43-inline-2',
  'script44-inline-1',
  'script44-inline-2',
  'script45-inline-1',
  'script45-inline-2',
  'script46-inline-1',
  'script46-inline-2',
  'script47-inline-1',
  'script47-inline-2',
  'script48-inline-1',
  'script49-inline-1',
  'script50-inline-1',
  'script51-inline-1',
  'script51-inline-2',
  'script52-inline-1',
  'script52-inline-2',
  'script53-inline-1',
  'script54-inline-1',
  'script54-inline-2',
  'script55-inline-1',
  'script55-inline-2',
  'script56-inline-1',
  'script56-inline-2',
  'script56-inline-3',
  'script57-inline-1',
  'script57-inline-2',
  'script58-inline-1',
  'script58-inline-2',
  'script59-inline-1'
] as const;

export type DamoclesMessageId =
  | (typeof LANDING_MESSAGE_IDS)[number]
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
  | 'system-string-0'
  | 'system-string-1'
  | 'system-string-2'
  | 'system-string-21'
  | 'system-string-22'
  | 'system-string-3'
  | 'system-string-33'
  | 'system-string-48'
  | 'system-string-49'
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
