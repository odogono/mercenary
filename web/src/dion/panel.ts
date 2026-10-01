import type { DionPanelDocument, DionPanelTextField } from './panelDocument.ts';

/// The Mercenary III panel, drawn as its writers draw it (rows 136..199).
///
/// The panel is not a hand-made rendition: it is the recovered artwork with each
/// readout written into it by the recovered bit-plane rules, then shown in the panel
/// palette the raster interrupt loads at row 136 (and the card colour it changes at
/// row 152). Only the values come from the session.

export const PANEL_TOP = 136;
export const PANEL_ROWS = 64;
const WIDTH = 320;

export type DionCentreView =
  | { readonly kind: 'logo' }
  | {
      readonly kind: 'card';
      readonly lines: readonly [string, string];
      readonly reveal?: number;
    };

export interface DionPanelView {
  readonly cash: string;
  readonly centre: DionCentreView;
  readonly clockSeconds: number;
  readonly eyeY: number;
  readonly gauges: {
    readonly inventory: number;
    readonly p: number;
    readonly t: number;
  };
  /// The eye in workspace cells, `$70C2`/`$70CA` high words.
  readonly grid: readonly [number, number];
  readonly heading: number;
  readonly inventory: string;
  readonly location: string;
  readonly message?: readonly number[];
  readonly pitch: number;
  /// `$70B4`/`$70B8`, each shown as `(v × $FA00) >> 16`.
  readonly position: readonly [number, number];
}

export interface DionPanelImage {
  readonly palette: {
    readonly lower: readonly number[];
    readonly upper: readonly number[];
  };
  readonly pixels: Uint8Array;
}

class Planes {
  constructor(readonly pixels: Uint8Array) {}

  set(x: number, y: number, plane: number, on: boolean): void {
    const at = (y - PANEL_TOP) * WIDTH + x;
    const value = this.pixels[at]!;
    this.pixels[at] = on ? value | (1 << plane) : value & ~(1 << plane);
  }
}

/// `$4ED8E`/`$4ED96`: set the field's plane across its box, then clear it under ink.
const writeField = (
  planes: Planes,
  doc: DionPanelDocument,
  field: DionPanelTextField,
  characters: readonly string[],
  y = field.y
): void => {
  const font = doc.fonts.get(field.font);
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

const digits = (value: number, count: number): string[] =>
  String(value).padStart(count, '0').slice(-count).split('');

export const drawDionPanel = (
  doc: DionPanelDocument,
  view: DionPanelView
): DionPanelImage => {
  const pixels = new Uint8Array(WIDTH * PANEL_ROWS);
  doc.art.forEach((row, index) => pixels.set(row, index * WIDTH));
  const planes = new Planes(pixels);
  const { fields } = doc;

  // The centre box: the inactive logo, or a card's art with its text (`$4DF34`).
  const { box } = doc.centre;
  const art =
    view.centre.kind === 'card' && (view.centre.reveal ?? 0) <= 32
      ? doc.centre.taxicard.pixels
      : doc.centre.logo.pixels;
  art.forEach((row, index) =>
    pixels.set(row, (box.y + index - PANEL_TOP) * WIDTH + box.x)
  );
  if (view.centre.kind === 'card' && (view.centre.reveal ?? 0) === 0) {
    const [first, second] = view.centre.lines;
    writeField(
      planes,
      doc,
      fields.cardText,
      [...first],
      fields.cardText.lines[0]
    );
    writeField(
      planes,
      doc,
      fields.cardText,
      [...second],
      fields.cardText.lines[1]
    );
  }

  if (view.centre.kind === 'card' && (view.centre.reveal ?? 0) > 0) {
    const remaining = view.centre.reveal!;
    const passed = 64 - remaining;
    const old = doc.centre.logo.pixels;
    const fresh = doc.centre.taxicard.pixels;
    for (let row = 0; row < box.height; row += 1) {
      const source =
        passed < 32 ? old[row + passed] : fresh[row - (64 - passed)];
      pixels.set(
        source ?? new Uint8Array(box.width),
        (box.y + row - PANEL_TOP) * WIDTH + box.x
      );
    }
  }
  if (view.message !== undefined) {
    for (let row = 0; row < 6; row += 1) {
      for (let x = 0; x < 288; x += 1) {
        const value = view.message[row * 288 + x]!;
        planes.set(16 + x, fields.messageBar.y + row, 0, value !== 0);
        planes.set(16 + x, fields.messageBar.y + row, 1, false);
      }
    }
  }

  writeField(
    planes,
    doc,
    fields.location,
    view.location.padEnd(8).slice(0, 8).split('')
  );

  // `$4E8BE` frames the position readout, then `$4E95C` writes its two numbers.
  for (let y = 172; y <= 176; y += 1) {
    for (let x = 32; x <= 63; x += 1) {
      for (const plane of [0, 1, 2]) {
        planes.set(x, y, plane, false);
      }
      planes.set(x, y, 3, !(y === 174 && x >= 46 && x <= 49));
    }
  }
  writeField(
    planes,
    doc,
    fields.position,
    view.position.flatMap(v => digits(Math.floor((v * 0xfa_00) / 0x1_00_00), 3))
  );

  // `$4E812`: each grid number shows ink by clearing plane 3, or setting plane 0 below 0.
  const digitFont = doc.fonts.get('digits');
  fields.grid.numbers.forEach((number, index) => {
    const value = view.grid[index] ?? 0;
    const magnitude = Math.min(Math.abs(value), 100);
    const [tens, units] =
      magnitude < 100 ? [Math.floor(magnitude / 10), magnitude % 10] : [10, 10];
    for (let row = 0; row < 5; row += 1) {
      const y = fields.grid.y + row;
      for (let x = number.box[0]; x <= number.box[1]; x += 1) {
        planes.set(x, y, 0, false);
        planes.set(x, y, 3, true);
      }
      for (const [digit, x0] of [
        [tens, number.tens],
        [units, number.units]
      ] as const) {
        [...(digitFont?.glyphs.get(String(digit))?.[row] ?? '')].forEach(
          (bit, column) => {
            if (bit === '1') {
              if (value >= 0) {
                planes.set(x0 + column, y, 3, false);
              } else {
                planes.set(x0 + column, y, 0, true);
              }
            }
          }
        );
      }
    }
  });

  // `$4E506`: height as 16.16, two whole digits then the fraction a hundredth at a time.
  const scaled = (view.eyeY >> 4) + ((view.eyeY >> 3) & 1);
  const whole = Math.floor(scaled / 0x1_00_00);
  let heightDigits: string[];
  if (whole >= 100) {
    heightDigits = Array<string>(6).fill('10');
  } else {
    const first = (scaled & 0xff_ff) * 100;
    const second = (first & 0xff_ff) * 100;
    heightDigits = [
      ...digits(whole, 2),
      ...digits(Math.floor(first / 0x1_00_00), 2),
      ...digits(Math.floor(second / 0x1_00_00), 2)
    ];
  }
  writeField(planes, doc, fields.height, heightDigits);

  // `$4E778`: eleven of the twelve BCD cash digits.
  writeField(planes, doc, fields.cash, view.cash.slice(1).split(''));

  // `$531D2`: HH-MM-SS in the clock font, planes 0 and 1 set and cleared under ink.
  const clockFont = doc.fonts.get('clock');
  const seconds = ((view.clockSeconds % 86_400) + 86_400) % 86_400;
  const clock = [
    ...digits(Math.floor(seconds / 3600), 2),
    ...digits(Math.floor(seconds / 60) % 60, 2),
    ...digits(seconds % 60, 2)
  ];
  clock.forEach((digit, index) => {
    const x0 = fields.clock.cells[index]!;
    const glyph = clockFont?.glyphs.get(digit);
    for (let row = 0; row < fields.clock.rows; row += 1) {
      [...(glyph?.[row] ?? '')].forEach((bit, column) => {
        for (const plane of fields.clock.planes) {
          planes.set(x0 + column, fields.clock.y + row, plane, bit === '0');
        }
      });
    }
  });

  // `$53A2E`: the compass strip, 64 steps of the heading.
  const step = (-(view.heading + 0x70) & 0x3_f0) >> 4;
  for (let row = 0; row < fields.compass.rows; row += 1) {
    for (let x = 80; x <= 119; x += 1) {
      const inside = x >= fields.compass.x[0] && x <= fields.compass.x[1];
      const bit = fields.compass.strip[row]?.[step + 1 + (x - 80)];
      planes.set(x, fields.compass.y + row, 3, inside ? bit === '1' : true);
    }
  }

  // `$53AB2`: twenty rows of the pitch strip, from the pitch's high bits.
  const pitchRow = (view.pitch & 0x3_f0) >> 4;
  for (let row = 0; row < 20; row += 1) {
    const strip = fields.pitch.strip[pitchRow + row];
    if (strip === undefined) {
      continue;
    }
    for (let x = 0; x < 16; x += 1) {
      planes.set(
        fields.pitch.x[0] + x,
        fields.pitch.y + row,
        1,
        strip[0][x] === '1'
      );
      planes.set(
        fields.pitch.x[0] + x,
        fields.pitch.y + row,
        3,
        strip[1][x] === '1'
      );
    }
  }

  // `$537E4`: a level L clears its planes in the bar's bottom L rows.
  const levels = [
    Math.min(view.gauges.t, 48),
    Math.min(view.gauges.p, 48),
    view.gauges.inventory
  ];
  fields.gauges.forEach((bar, index) => {
    const level = levels[index] ?? 0;
    for (let row = 0; row < bar.rows; row += 1) {
      for (const plane of bar.planes) {
        planes.set(bar.x, bar.top + row, plane, row < bar.rows - level);
      }
    }
  });

  writeField(
    planes,
    doc,
    fields.inventoryName,
    view.inventory.padEnd(16).slice(0, 16).split('')
  );

  // The card or logo's own two colours replace colour 4, and colour 1 from row 152.
  const centre =
    view.centre.kind === 'card' && (view.centre.reveal ?? 0) <= 32
      ? doc.centre.taxicard
      : doc.centre.logo;
  const upper = [...doc.palette.upper];
  const lower = [...doc.palette.lower];
  upper[4] = centre.colour4;
  lower[4] = centre.colour4;
  lower[1] = centre.colour1From152;
  return { palette: { lower, upper }, pixels };
};

const gun = (word: number, shift: number): number =>
  Math.round((((word >> shift) & 7) * 255) / 7);

/// The panel as RGBA: an ST shows three bits a gun, so the STE's fourth is dropped.
export const panelRgba = (
  image: DionPanelImage,
  target: Uint8ClampedArray
): void => {
  for (let row = 0; row < PANEL_ROWS; row += 1) {
    const palette =
      PANEL_TOP + row < 152 ? image.palette.upper : image.palette.lower;
    for (let x = 0; x < WIDTH; x += 1) {
      const colour = palette[image.pixels[row * WIDTH + x]!] ?? 0;
      const at = (row * WIDTH + x) * 4;
      target[at] = gun(colour, 8);
      target[at + 1] = gun(colour, 4);
      target[at + 2] = gun(colour, 0);
      target[at + 3] = 255;
    }
  }
};

/// The centre box's logo as RGBA, in the colours the panel shows it in below row 152 and with its
/// colour 0, the box's black, left clear: Mercenary III's Title Logo (ADR 0063).
export const dionLogoRgba = (
  doc: DionPanelDocument
): {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly height: number;
  readonly width: number;
} => {
  const { box, logo } = doc.centre;
  const palette = [...doc.palette.lower];
  palette[4] = logo.colour4;
  palette[1] = logo.colour1From152;
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  logo.pixels.forEach((row, y) => {
    row.forEach((index, x) => {
      if (index === 0) {
        return;
      }
      const colour = palette[index] ?? 0;
      const at = (y * box.width + x) * 4;
      data[at] = gun(colour, 8);
      data[at + 1] = gun(colour, 4);
      data[at + 2] = gun(colour, 0);
      data[at + 3] = 255;
    });
  });
  return { data, height: box.height, width: box.width };
};
