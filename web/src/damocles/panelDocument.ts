import type { PanelFont, PanelTextField } from '../shell/panelPixels.ts';
import { readDamoclesPanel } from './pitchStrip.ts';

/// The #740 payload consumed by Damocles's own composer. Geometry is checked at
/// this boundary; provenance and source hashes remain in the tracked document.
interface Gauge {
  readonly name: string;
  readonly planes: readonly number[];
  readonly rows: number;
  readonly top: number;
  readonly x: number;
}

export interface CentreDefinition {
  readonly band: number;
  readonly category: number;
  readonly colourA: number;
  readonly colourB: number;
}

export interface DamoclesPanelDocument {
  readonly art: readonly Uint8Array[];
  readonly centre: {
    readonly art: ReadonlyMap<number, readonly Uint8Array[]>;
    readonly bands: ReadonlyMap<number, readonly (readonly string[])[]>;
    readonly definitions: ReadonlyMap<number, CentreDefinition>;
  };
  readonly clock: {
    readonly cells: readonly number[];
    readonly planes: readonly number[];
    readonly rows: number;
    readonly y: number;
  };
  readonly compass: { readonly frames: readonly (readonly string[])[] };
  readonly fields: ReadonlyMap<string, PanelTextField>;
  readonly fonts: ReadonlyMap<string, PanelFont>;
  readonly gaps: readonly string[];
  readonly gauges: readonly Gauge[];
  readonly lamps: {
    readonly rows: number;
    readonly x: readonly (readonly [number, number])[];
    readonly y: number;
  };
  readonly palette: {
    readonly lower: readonly number[];
    readonly upper: readonly number[];
  };
  readonly programSha256: string;
  readonly strip: readonly (readonly [string, string])[];
}

const fail = (path: string, expected: string): never => {
  throw new Error(
    `/payload/damocles/panel.json: ${path} should be ${expected}`
  );
};
const object = (value: unknown, path: string): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(path, 'a record');
const array = (
  value: unknown,
  path: string,
  length?: number
): readonly unknown[] =>
  Array.isArray(value) && (length === undefined || value.length === length)
    ? value
    : fail(path, length === undefined ? 'a list' : `${length} entries`);
const integer = (
  value: unknown,
  path: string,
  min: number,
  max: number
): number =>
  Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : fail(path, `an integer from ${min} to ${max}`);
const text = (value: unknown, path: string): string =>
  typeof value === 'string' ? value : fail(path, 'text');
const bitRows = (
  value: unknown,
  path: string,
  width: number,
  height: number
): string[] =>
  array(value, path, height).map((row, index) => {
    const result = text(row, `${path}[${index}]`);
    return result.length === width && /^[01]+$/.test(result)
      ? result
      : fail(`${path}[${index}]`, `${width} bits`);
  });
const pixels = (
  value: unknown,
  path: string,
  width: number,
  height: number
): Uint8Array[] =>
  array(value, path, height).map((row, index) => {
    const result = text(row, `${path}[${index}]`);
    if (result.length !== width || !/^[\da-f]+$/.test(result)) {
      fail(`${path}[${index}]`, `${width} palette nibbles`);
    }
    return Uint8Array.from(result, character => Number.parseInt(character, 16));
  });
const numbers = (
  value: unknown,
  path: string,
  min: number,
  max: number,
  length?: number
): number[] =>
  array(value, path, length).map((entry, index) =>
    integer(entry, `${path}[${index}]`, min, max)
  );
const span = (value: unknown, path: string): [number, number] => {
  const [left, right] = numbers(value, path, 0, 319, 2);
  return right! >= left! ? [left!, right!] : fail(path, 'an inclusive span');
};

export const readDamoclesPanelDocument = (
  value: unknown
): DamoclesPanelDocument => {
  const pitch = readDamoclesPanel(value);
  const root = object(value, 'document');
  const art = object(root['panelArt'], 'panelArt');
  if (art['width'] !== 320 || art['height'] !== 64 || art['top'] !== 136) {
    fail('panelArt', 'the 320 by 64 panel at row 136');
  }
  const compass = object(root['compass'], 'compass');
  if (
    compass['y'] !== 182 ||
    compass['plane'] !== 3 ||
    compass['windowRows'] !== 9
  ) {
    fail('compass', 'nine plane-3 rows at 182');
  }
  const fonts = new Map<string, PanelFont>();
  const fontRaw = object(root['fonts'], 'fonts');
  for (const [name, width, height, count] of [
    ['panel', 5, 5, 64],
    ['message', 5, 6, 64],
    ['digits', 3, 5, 13],
    ['cardDigits', 5, 5, 10],
    ['clock', 8, 7, 10]
  ] as const) {
    const font = object(fontRaw[name], `fonts.${name}`);
    const glyphs = object(font['glyphs'], `fonts.${name}.glyphs`);
    if (
      font['width'] !== width ||
      font['height'] !== height ||
      Object.keys(glyphs).length !== count
    ) {
      fail(`fonts.${name}`, `${count} ${width} by ${height} glyphs`);
    }
    const keys = Array.from({ length: count }, (_, index) =>
      name === 'panel' || name === 'message'
        ? String.fromCharCode(0x20 + index)
        : String(index)
    );
    if (keys.some(key => !Object.hasOwn(glyphs, key))) {
      fail(`fonts.${name}.glyphs`, 'the complete recovered character bank');
    }
    fonts.set(name, {
      glyphs: new Map(
        Object.entries(glyphs).map(([key, rows]) => [
          key,
          bitRows(rows, `fonts.${name}.glyphs.${key}`, width, height)
        ])
      ),
      height,
      width
    });
  }
  const fieldsRaw = object(root['fields'], 'fields');
  const fields = new Map<string, PanelTextField>();
  for (const [name, count] of [
    ['location', 8],
    ['inventoryName', 16],
    ['altitude', 6],
    ['speed', 10],
    ['cash', 11],
    ['position', 6],
    ['centre2Text', 8]
  ] as const) {
    const field = object(fieldsRaw[name], `fields.${name}`);
    const fontName = text(field['font'], `fields.${name}.font`);
    const font =
      fonts.get(fontName) ?? fail(`fields.${name}.font`, 'a loaded font');
    const cells = numbers(
      field['cells'],
      `fields.${name}.cells`,
      0,
      320 - font.width,
      count
    );
    const y = integer(field['y'], `fields.${name}.y`, 136, 200 - font.height);
    const rows = integer(
      field['rows'],
      `fields.${name}.rows`,
      font.height,
      font.height
    );
    fields.set(name, {
      box: array(field['box'], `fields.${name}.box`).map((box, index) =>
        span(box, `fields.${name}.box[${index}]`)
      ),
      cells,
      font: fontName,
      plane: integer(field['plane'], `fields.${name}.plane`, 0, 3),
      rows,
      y
    });
  }
  const clock = object(fieldsRaw['clock'], 'fields.clock');
  const lamps = object(fieldsRaw['lamps'], 'fields.lamps');
  const gauges = object(fieldsRaw['gauges'], 'fields.gauges');
  const palette = object(root['palette'], 'palette');
  const centre = object(root['centre'], 'centre');
  const box = object(centre['box'], 'centre.box');
  if (
    box['x'] !== 128 ||
    box['y'] !== 160 ||
    box['width'] !== 64 ||
    box['height'] !== 32
  ) {
    fail('centre.box', 'the 64 by 32 box at 128,160');
  }
  const centreArt = new Map<number, readonly Uint8Array[]>();
  array(centre['categories'], 'centre.categories', 7).forEach(
    (entry, index) => {
      const category = object(entry, `centre.categories[${index}]`);
      integer(
        category['category'],
        `centre.categories[${index}].category`,
        index,
        index
      );
      centreArt.set(
        index,
        pixels(category['pixels'], `centre.categories[${index}].pixels`, 64, 32)
      );
    }
  );
  const definitions = object(centre['definitions'], 'centre.definitions');
  const records = new Map<number, CentreDefinition>();
  array(definitions['records'], 'centre.definitions.records', 29).forEach(
    (entry, index) => {
      const record = object(entry, `centre.definitions.records[${index}]`);
      const item = integer(record['item'], 'centre definition item', 1, 255);
      if (records.has(item)) {
        fail('centre definition item', 'unique');
      }
      records.set(item, {
        band: integer(record['band'], 'centre definition band', 0, 36),
        category: integer(
          record['category'],
          'centre definition category',
          2,
          6
        ),
        colourA: integer(
          record['colourA'],
          'centre definition colourA',
          0,
          0xf_ff
        ),
        colourB: integer(
          record['colourB'],
          'centre definition colourB',
          0,
          0xf_ff
        )
      });
    }
  );
  const bands = new Map<number, readonly (readonly string[])[]>();
  array(centre['bands'], 'centre.bands', 2).forEach((entry, index) => {
    const band = object(entry, `centre.bands[${index}]`);
    const category = integer(
      band['category'],
      'centre band category',
      index === 0 ? 2 : 6,
      index === 0 ? 2 : 6
    );
    bands.set(
      category,
      array(band['rows'], 'centre band slots', index === 0 ? 19 : 8).map(
        (slot, at) => bitRows(slot, `centre band slots[${at}]`, 64, 5)
      )
    );
  });
  for (const record of records.values()) {
    if (record.category === 2 || record.category === 6) {
      if (
        record.band % 2 !== 0 ||
        bands.get(record.category)?.[record.band / 2] === undefined
      ) {
        fail('centre definition band', 'a loaded title slot');
      }
    }
  }
  return {
    ...pitch,
    art: pixels(art['pixels'], 'panelArt.pixels', 320, 64),
    centre: { art: centreArt, bands, definitions: records },
    clock: {
      cells: numbers(clock['cells'], 'fields.clock.cells', 0, 312, 6),
      planes: numbers(clock['planes'], 'fields.clock.planes', 0, 3, 2),
      rows: integer(clock['rows'], 'fields.clock.rows', 7, 7),
      y: integer(clock['y'], 'fields.clock.y', 136, 193)
    },
    compass: {
      frames: array(compass['frames'], 'compass.frames', 64).map(
        (frame, index) => bitRows(frame, `compass.frames[${index}]`, 40, 9)
      )
    },
    fields,
    fonts,
    gaps: array(root['gaps'], 'gaps').map((entry, index) =>
      text(entry, `gaps[${index}]`)
    ),
    gauges: array(gauges['bars'], 'fields.gauges.bars', 3).map(
      (entry, index) => {
        const bar = object(entry, `fields.gauges.bars[${index}]`);
        const rows = integer(bar['rows'], 'gauge rows', 1, 64);
        return {
          name: text(bar['name'], 'gauge name'),
          planes: numbers(bar['planes'], 'gauge planes', 0, 3),
          rows,
          top: integer(bar['top'], 'gauge top', 136, 200 - rows),
          x: integer(bar['x'], 'gauge x', 0, 319)
        };
      }
    ),
    lamps: {
      rows: integer(lamps['rows'], 'fields.lamps.rows', 7, 7),
      x: array(lamps['list'], 'fields.lamps.list', 3).map((entry, index) =>
        span(
          object(entry, `fields.lamps.list[${index}]`)['x'],
          `fields.lamps.list[${index}].x`
        )
      ),
      y: integer(lamps['y'], 'fields.lamps.y', 186, 186)
    },
    palette: {
      lower: numbers(
        palette['rows152to199'],
        'palette.rows152to199',
        0,
        0xf_ff,
        16
      ),
      upper: numbers(
        palette['rows136to151'],
        'palette.rows136to151',
        0,
        0xf_ff,
        16
      )
    }
  };
};
