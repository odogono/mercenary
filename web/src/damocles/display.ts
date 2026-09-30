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

/// The body of one document item, which a Read queues (#598): the object slot, then the item's
/// position in its document.
export type DocumentMessageId = `document-${number}-${number}`;

export type DamoclesMessageId =
  | (typeof LANDING_MESSAGE_IDS)[number]
  | `script15-inline-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
  | `script1-inline-${1 | 2 | 3}`
  | 'script11-inline-1'
  | 'script11-inline-2'
  | `script14-inline-${1 | 2 | 3 | 4}`
  | `script16-inline-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`
  | 'script17-inline-1'
  | 'script17-inline-2'
  | `script19-inline-${1 | 2 | 3 | 4}`
  | 'script2-inline-1'
  | 'script2-inline-2'
  | 'script2-inline-3'
  | 'script20-inline-1'
  | 'script21-inline-1'
  | 'script23-inline-1'
  | 'script23-inline-2'
  | 'script23-inline-3'
  | 'script24-inline-1'
  | 'script25-inline-1'
  | `script26-inline-${1 | 2 | 3 | 4 | 5 | 6 | 7}`
  | `script27-inline-${1 | 2 | 3 | 4}`
  | 'script3-inline-1'
  | 'script3-inline-2'
  | 'script3-inline-3'
  | 'script3-inline-4'
  | 'script3-inline-5'
  | 'script3-inline-6'
  | 'script42-inline-1'
  | 'script42-inline-2'
  | 'script4-inline-1'
  | 'script4-inline-2'
  | 'script4-inline-3'
  | 'script4-inline-4'
  | 'script4-inline-5'
  | 'script4-inline-6'
  | 'script4-inline-7'
  | 'script4-inline-8'
  | 'script4-inline-9'
  | 'script4-inline-10'
  | 'script4-inline-11'
  | 'script4-inline-12'
  | 'script4-inline-13'
  | 'script4-inline-14'
  | 'script4-inline-15'
  | 'script4-inline-16'
  | 'script4-inline-17'
  | 'script4-inline-18'
  | 'script4-inline-19'
  | 'script4-inline-20'
  | 'script5-inline-1'
  | 'script5-inline-2'
  | 'script5-inline-3'
  | 'script6-inline-1'
  | 'script6-inline-2'
  | `script60-inline-${1 | 2 | 3 | 4 | 5}`
  | 'script62-inline-1'
  | 'script62-inline-2'
  | 'script62-inline-3'
  | 'system-string-0'
  | 'system-string-1'
  | 'system-string-13'
  | 'system-string-2'
  | 'system-string-21'
  | 'system-string-22'
  | 'system-string-3'
  | 'system-string-33'
  | 'system-string-34'
  | 'system-string-35'
  | 'system-string-48'
  | 'system-string-49'
  | 'system-string-50'
  | 'system-string-9'
  | DocumentMessageId;

export const documentMessageId = (
  slot: number,
  item: number
): DocumentMessageId => `document-${slot}-${item}`;

export const isDocumentMessage = (id: string): id is DocumentMessageId =>
  /^document-\d+-\d+$/.test(id);

/// `$7BA2` as the bitplane a message's glyphs go to: 0 draws them in the row's colour 1, the
/// ordinary green, and 1 in colour 2, the panel's light blue. Only the deferred path a Read
/// queues (`$0547CE`) selects plane 1, and the row keeps each glyph's plane as it scrolls.
export type RowPlane = 0 | 1;

/// The plane a message draws in, which only a document body's Read changes.
export const messagePlane = (id: DamoclesMessageId): RowPlane =>
  isDocumentMessage(id) ? 1 : 0;

export interface Reveal {
  readonly beneath: string;
  /// The plane the row beneath was drawn in. A reveal is a whole row wide, so a row that has
  /// finished arriving is one message's, in one plane.
  readonly beneathPlane: RowPlane;
  /// Where in the record this block starts. A record longer than the row is shown in 48-cell
  /// blocks, each scrolling the one before it off (`$0523BE`).
  readonly offset: number;
  readonly pixels: number;
}

export type DamoclesDisplay =
  | {
      readonly cells: string;
      readonly kind: 'held';
      readonly plane: RowPlane;
    }
  | {
      readonly id: DamoclesMessageId;
      readonly kind: 'scrolling';
      readonly reveal: Reveal;
    };

/// The row a message scrolls over: a held row, or the row a message still arriving was
/// scrolling over.
export interface Beneath {
  readonly cells: string;
  readonly plane: RowPlane;
}

export interface DisplayCells {
  readonly cells: string;
  /// Each cell's plane, in row order.
  readonly planes: readonly RowPlane[];
  readonly scrollPixels: number;
}

export const BLANK_DAMOCLES_DISPLAY: DamoclesDisplay = {
  cells: BLANK_DAMOCLES_ROW,
  kind: 'held',
  plane: 0
};

/// The 48 cells of one block of a record, from `offset`. At the terminator the fetch returns
/// spaces (`$052398`), so a short block comes to rest left-aligned over a blank remainder.
export const effectiveMessageRow = (text: string, offset = 0): string =>
  text.slice(offset, offset + DAMOCLES_ROW_CELLS).padEnd(DAMOCLES_ROW_CELLS);

export const beneathOf = (display: DamoclesDisplay): Beneath =>
  display.kind === 'held'
    ? { cells: display.cells, plane: display.plane }
    : { cells: display.reveal.beneath, plane: display.reveal.beneathPlane };

export const startDisplay = (
  id: DamoclesMessageId,
  beneath: Beneath,
  offset = 0
): DamoclesDisplay => ({
  id,
  kind: 'scrolling',
  reveal: {
    beneath: beneath.cells,
    beneathPlane: beneath.plane,
    offset,
    pixels: 0
  }
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
    ? {
        cells: effectiveMessageRow(text, display.reveal.offset),
        kind: 'held',
        plane: messagePlane(display.id)
      }
    : { ...display, reveal: { ...display.reveal, pixels } };
};

export const displayCells = (
  display: DamoclesDisplay,
  text: string
): DisplayCells => {
  if (display.kind === 'held') {
    return {
      cells: display.cells,
      planes: Array.from({ length: DAMOCLES_ROW_CELLS }, () => display.plane),
      scrollPixels: 0
    };
  }
  const cellsPassed = Math.floor(display.reveal.pixels / DAMOCLES_CELL_PIXELS);
  const stream =
    display.reveal.beneath + effectiveMessageRow(text, display.reveal.offset);
  const plane = messagePlane(display.id);
  return {
    cells: stream
      .slice(cellsPassed, cellsPassed + DAMOCLES_ROW_CELLS)
      .padEnd(DAMOCLES_ROW_CELLS),
    planes: Array.from({ length: DAMOCLES_ROW_CELLS }, (_, cell) =>
      cell + cellsPassed < DAMOCLES_ROW_CELLS
        ? display.reveal.beneathPlane
        : plane
    ),
    scrollPixels: display.reveal.pixels
  };
};
