/// Proven pixel operations shared by the independently recovered ST panel writers.
/// Titles own the artwork, source words, field geometry and palette composition.
export const PANEL_TOP = 136;
export const PANEL_ROWS = 64;
export const PANEL_WIDTH = 320;

export interface PanelFont {
  readonly glyphs: ReadonlyMap<string, readonly string[]>;
  readonly height: number;
  readonly width: number;
}

export interface PanelTextField {
  readonly box: readonly (readonly [number, number])[];
  readonly cells: readonly number[];
  readonly font: string;
  readonly plane: number;
  readonly rows: number;
  readonly y: number;
}

export interface PanelImage {
  readonly palette: {
    readonly lower: readonly number[];
    readonly upper: readonly number[];
  };
  readonly pixels: Uint8Array;
}

export class PanelPlanes {
  constructor(readonly pixels: Uint8Array) {}

  set(x: number, y: number, plane: number, on: boolean): void {
    const at = (y - PANEL_TOP) * PANEL_WIDTH + x;
    const value = this.pixels[at]!;
    this.pixels[at] = on ? value | (1 << plane) : value & ~(1 << plane);
  }
}

/// Damocles `$4E7C2` and MIII `$4ED8E`: set the field plane, clear it under ink.
export const writePanelField = (
  planes: PanelPlanes,
  fonts: ReadonlyMap<string, PanelFont>,
  field: PanelTextField,
  characters: readonly string[],
  y = field.y
): void => {
  const font = fonts.get(field.font);
  if (font === undefined) {
    return;
  }
  for (let row = 0; row < field.rows; row += 1) {
    for (const [from, to] of field.box) {
      for (let x = from; x <= to; x += 1) {
        planes.set(x, y + row, field.plane, true);
      }
    }
  }
  characters.forEach((character, index) => {
    const glyph = font.glyphs.get(character);
    const cell = field.cells[index];
    if (glyph === undefined || cell === undefined) {
      return;
    }
    for (let row = 0; row < field.rows; row += 1) {
      [...glyph[row]!].forEach((bit, column) => {
        if (bit === '1') {
          planes.set(cell + column, y + row, field.plane, false);
        }
      });
    }
  });
};

/// MIII's sliding strip converted to a frame. Damocles's native frames equal this
/// for every heading (including the forced margins); #741 guards all 64 positions.
export const slidingCompassFrame = (
  strip: readonly string[],
  heading: number,
  inside: readonly [number, number]
): string[] => {
  const step = (-(heading + 0x70) & 0x3_f0) >> 4;
  return strip.map(row =>
    Array.from({ length: 40 }, (_, column) => {
      const x = 80 + column;
      return x >= inside[0] && x <= inside[1]
        ? row[step + 1 + column] === '1'
          ? '1'
          : '0'
        : '1';
    }).join('')
  );
};

export const writePanelCompass = (
  planes: PanelPlanes,
  frame: readonly string[],
  x: number,
  y: number
): void => {
  frame.forEach((row, dy) => {
    [...row].forEach((bit, dx) => planes.set(x + dx, y + dy, 3, bit === '1'));
  });
};

/// Both titles copy twenty rows of the same strip into planes 1 and 3.
export const writePanelPitch = (
  planes: PanelPlanes,
  strip: readonly (readonly [string, string])[],
  pitch: number,
  x: number,
  y: number
): void => {
  const start = (pitch & 0x3_f0) >> 4;
  for (let row = 0; row < 20; row += 1) {
    const words = strip[start + row];
    if (words === undefined) {
      continue;
    }
    for (let column = 0; column < 16; column += 1) {
      planes.set(x + column, y + row, 1, words[0][column] === '1');
      planes.set(x + column, y + row, 3, words[1][column] === '1');
    }
  }
};

const gun = (word: number, shift: number): number =>
  Math.round((((word >> shift) & 7) * 255) / 7);

/// ST colour expansion, with the independently attested row-152 palette split.
export const panelRgba = (
  image: PanelImage,
  target: Uint8ClampedArray
): void => {
  for (let row = 0; row < PANEL_ROWS; row += 1) {
    const palette =
      PANEL_TOP + row < 152 ? image.palette.upper : image.palette.lower;
    for (let x = 0; x < PANEL_WIDTH; x += 1) {
      const colour = palette[image.pixels[row * PANEL_WIDTH + x]!] ?? 0;
      const at = (row * PANEL_WIDTH + x) * 4;
      target[at] = gun(colour, 8);
      target[at + 1] = gun(colour, 4);
      target[at + 2] = gun(colour, 0);
      target[at + 3] = 255;
    }
  }
};
