import { fail, int, ints, list, record, text, word } from './read.ts';

/// `payload/dion/panel.json`: the instrument panel of the Mercenary III research
/// baseline, as its readers draw it.
///
/// The artwork is the program file DAM6 as the loader leaves it in the screen at
/// the game entry, before any readout is drawn over it. Each readout is a field the
/// panel writers fill by bit-plane rule: most set one plane across their box and clear
/// it under glyph ink, so a field shows as artwork colour with the plane added, and its
/// characters as the artwork colour beneath.

export interface DionPanelFont {
  readonly glyphs: ReadonlyMap<string, readonly string[]>;
  readonly height: number;
  readonly width: number;
}

export interface DionPanelTextField {
  readonly box: readonly (readonly [number, number])[];
  readonly cells: readonly number[];
  readonly font: string;
  readonly plane: number;
  readonly rows: number;
  readonly y: number;
}

export interface DionPanelDocument {
  readonly art: readonly Uint8Array[];
  readonly artTop: number;
  readonly centre: {
    readonly box: {
      readonly height: number;
      readonly width: number;
      readonly x: number;
      readonly y: number;
    };
    readonly logo: {
      readonly colour1From152: number;
      readonly colour4: number;
      readonly pixels: readonly Uint8Array[];
    };
    readonly taxicard: {
      readonly bands: {
        readonly footer: {
          readonly lines: readonly [number, number];
          readonly rows: readonly string[];
        };
        readonly title: {
          readonly lines: readonly [number, number];
          readonly rows: readonly string[];
        };
      };
      readonly colour1From152: number;
      readonly colour4: number;
      readonly pixels: readonly Uint8Array[];
    };
  };
  readonly fields: {
    readonly cardText: DionPanelTextField & {
      readonly lines: readonly [number, number];
    };
    readonly cash: DionPanelTextField;
    readonly clock: {
      readonly cells: readonly number[];
      readonly planes: readonly number[];
      readonly rows: number;
      readonly y: number;
    };
    readonly compass: {
      readonly rows: number;
      readonly strip: readonly string[];
      readonly x: readonly [number, number];
      readonly y: number;
    };
    readonly gauges: readonly {
      readonly name: string;
      readonly planes: readonly number[];
      readonly rows: number;
      readonly top: number;
      readonly x: number;
    }[];
    readonly grid: {
      readonly numbers: readonly {
        readonly box: readonly [number, number];
        readonly tens: number;
        readonly units: number;
      }[];
      readonly y: number;
    };
    readonly height: DionPanelTextField;
    readonly inventoryName: DionPanelTextField;
    readonly location: DionPanelTextField;
    readonly messageBar: {
      readonly cells: readonly number[];
      readonly y: number;
    };
    readonly pitch: {
      readonly strip: readonly (readonly [string, string])[];
      readonly x: readonly [number, number];
      readonly y: number;
    };
    readonly position: DionPanelTextField;
  };
  readonly fonts: ReadonlyMap<string, DionPanelFont>;
  readonly labels: readonly {
    readonly code: number;
    readonly lines: readonly [string, string];
  }[];
  /// Colour words for rows 136..151 and 152..199 (bit 3 of each gun is the STE's and
  /// does not show on an ST).
  readonly palette: {
    readonly lower: readonly number[];
    readonly upper: readonly number[];
  };
  readonly strings: {
    readonly card: ReadonlyMap<string, readonly [string, string]>;
    readonly inventory: string;
    readonly location: string;
    readonly roster: readonly string[];
  };
}

const nibbles = (value: unknown, path: string, width: number): Uint8Array => {
  const raw = text(value, path);
  if (!/^[\da-f]*$/.test(raw) || raw.length !== width) {
    fail(`${path} is not ${width} palette nibbles`);
  }
  return Uint8Array.from(raw, character => Number.parseInt(character, 16));
};

const bits = (value: unknown, path: string, width?: number): string => {
  const raw = text(value, path);
  if (!/^[01]*$/.test(raw) || (width !== undefined && raw.length !== width)) {
    fail(`${path} is not a row of bits`);
  }
  return raw;
};

const span = (value: unknown, path: string): [number, number] => {
  const [a, b] = ints(value, path, 2, 0, 319);
  if (b! < a!) {
    fail(`${path} is empty`);
  }
  return [a!, b!];
};

const textField = (
  raw: Record<string, unknown>,
  path: string
): DionPanelTextField => ({
  box: list(raw['box'], `${path}.box`).map((item, index) =>
    span(item, `${path}.box[${index}]`)
  ),
  cells: ints(raw['cells'], `${path}.cells`, undefined, 0, 319),
  font: text(raw['font'], `${path}.font`),
  plane: int(raw['plane'], `${path}.plane`, 0, 3),
  rows: int(raw['rows'], `${path}.rows`, 1, 64),
  y: int(raw['y'], `${path}.y`, 136, 199)
});

const lines = (value: unknown, path: string): [string, string] => {
  const items = list(value, path);
  if (items.length !== 2) {
    fail(`${path} should be two lines`);
  }
  return [text(items[0], `${path}[0]`), text(items[1], `${path}[1]`)];
};

const font = (value: unknown, path: string): DionPanelFont => {
  const raw = record(value, path);
  const width = int(raw['width'], `${path}.width`, 1, 16);
  const height = int(raw['height'], `${path}.height`, 1, 16);
  const glyphs = new Map<string, readonly string[]>();
  for (const [key, rows] of Object.entries(
    record(raw['glyphs'], `${path}.glyphs`)
  )) {
    const items = list(rows, `${path}.glyphs.${key}`);
    if (items.length !== height) {
      fail(`${path}.glyphs.${key} should have ${height} rows`);
    }
    glyphs.set(
      key,
      items.map((row, index) =>
        bits(row, `${path}.glyphs.${key}[${index}]`, width)
      )
    );
  }
  return { glyphs, height, width };
};

const centreArt = (value: unknown, path: string): Uint8Array[] => {
  const rows = list(value, path);
  if (rows.length !== 32) {
    fail(`${path} should have 32 rows`);
  }
  return rows.map((row, index) => nibbles(row, `${path}[${index}]`, 64));
};

export const readDionPanelBody = (
  raw: Record<string, unknown>
): DionPanelDocument => {
  const art = record(raw['panelArt'], 'panelArt');
  if (art['width'] !== 320 || art['height'] !== 64 || art['top'] !== 136) {
    fail('panelArt is not the 320 by 64 panel at row 136');
  }
  const centre = record(raw['centre'], 'centre');
  const box = record(centre['box'], 'centre.box');
  const logo = record(centre['logo'], 'centre.logo');
  const logoColours = record(logo['colours'], 'centre.logo.colours');
  const card = record(centre['taxicard'], 'centre.taxicard');
  const cardColours = record(card['colours'], 'centre.taxicard.colours');
  const bands = record(card['bands'], 'centre.taxicard.bands');
  const band = (name: string) => {
    const b = record(bands[name], `centre.taxicard.bands.${name}`);
    const [first, last] = ints(
      b['lines'],
      `centre.taxicard.bands.${name}.lines`,
      2,
      0,
      31
    );
    return {
      lines: [first!, last!] as const,
      rows: list(b['rows'], `centre.taxicard.bands.${name}.rows`).map(
        (row, index) =>
          bits(row, `centre.taxicard.bands.${name}.rows[${index}]`, 64)
      )
    };
  };
  const fields = record(raw['fields'], 'fields');
  const field = (name: string) => record(fields[name], `fields.${name}`);
  const clock = field('clock');
  const compass = field('compass');
  const compassStrip = record(compass['strip'], 'fields.compass.strip');
  const pitch = field('pitch');
  const pitchStrip = record(pitch['strip'], 'fields.pitch.strip');
  const grid = field('grid');
  const gauges = record(field('gauges'), 'fields.gauges');
  const messageBar = field('messageBar');
  const cardText = field('cardText');
  const palette = record(raw['palette'], 'palette');
  const strings = record(raw['strings'], 'strings');
  const cardStrings = record(strings['card'], 'strings.card');
  const fontsRaw = record(raw['fonts'], 'fonts');
  const fonts = new Map<string, DionPanelFont>();
  for (const name of ['panel', 'message', 'digits', 'clock']) {
    fonts.set(name, font(fontsRaw[name], `fonts.${name}`));
  }
  const card4 = (value: Record<string, unknown>, path: string) => ({
    colour1From152: word(value['colour1From152'], `${path}.colour1From152`),
    colour4: word(value['colour4'], `${path}.colour4`)
  });
  return {
    art: list(art['pixels'], 'panelArt.pixels').map((row, index) =>
      nibbles(row, `panelArt.pixels[${index}]`, 320)
    ),
    artTop: 136,
    centre: {
      box: {
        height: int(box['height'], 'centre.box.height', 32, 32),
        width: int(box['width'], 'centre.box.width', 64, 64),
        x: int(box['x'], 'centre.box.x', 0, 256),
        y: int(box['y'], 'centre.box.y', 136, 168)
      },
      logo: {
        ...card4(logoColours, 'centre.logo.colours'),
        pixels: centreArt(logo['pixels'], 'centre.logo.pixels')
      },
      taxicard: {
        bands: { footer: band('footer'), title: band('title') },
        ...card4(cardColours, 'centre.taxicard.colours'),
        pixels: centreArt(card['pixels'], 'centre.taxicard.pixels')
      }
    },
    fields: {
      cardText: (() => {
        const [first, second] = ints(
          cardText['y'],
          'fields.cardText.y',
          2,
          136,
          199
        );
        return {
          ...textField({ ...cardText, y: first }, 'fields.cardText'),
          lines: [first!, second!] as const
        };
      })(),
      cash: textField(field('cash'), 'fields.cash'),
      clock: {
        cells: ints(clock['cells'], 'fields.clock.cells', 6, 0, 319),
        planes: ints(clock['planes'], 'fields.clock.planes', undefined, 0, 3),
        rows: int(clock['rows'], 'fields.clock.rows', 1, 16),
        y: int(clock['y'], 'fields.clock.y', 136, 199)
      },
      compass: {
        rows: int(compass['rows'], 'fields.compass.rows', 1, 16),
        strip: list(compassStrip['rows'], 'fields.compass.strip.rows').map(
          (row, index) => bits(row, `fields.compass.strip.rows[${index}]`)
        ),
        x: span(compass['x'], 'fields.compass.x'),
        y: int(compass['y'], 'fields.compass.y', 136, 199)
      },
      gauges: list(gauges['bars'], 'fields.gauges.bars').map((item, index) => {
        const bar = record(item, `fields.gauges.bars[${index}]`);
        return {
          name: text(bar['name'], `fields.gauges.bars[${index}].name`),
          planes: ints(
            bar['planes'],
            `fields.gauges.bars[${index}].planes`,
            undefined,
            0,
            3
          ),
          rows: int(bar['rows'], `fields.gauges.bars[${index}].rows`, 1, 64),
          top: int(bar['top'], `fields.gauges.bars[${index}].top`, 136, 199),
          x: int(bar['x'], `fields.gauges.bars[${index}].x`, 0, 319)
        };
      }),
      grid: {
        numbers: list(grid['numbers'], 'fields.grid.numbers').map(
          (item, index) => {
            const n = record(item, `fields.grid.numbers[${index}]`);
            return {
              box: span(n['box'], `fields.grid.numbers[${index}].box`),
              tens: int(
                n['tens'],
                `fields.grid.numbers[${index}].tens`,
                0,
                319
              ),
              units: int(
                n['units'],
                `fields.grid.numbers[${index}].units`,
                0,
                319
              )
            };
          }
        ),
        y: int(grid['y'], 'fields.grid.y', 136, 199)
      },
      height: textField(field('height'), 'fields.height'),
      inventoryName: textField(field('inventoryName'), 'fields.inventoryName'),
      location: textField(field('location'), 'fields.location'),
      messageBar: {
        cells: ints(messageBar['cells'], 'fields.messageBar.cells', 48, 0, 319),
        y: int(messageBar['y'], 'fields.messageBar.y', 136, 199)
      },
      pitch: {
        strip: list(pitchStrip['rows'], 'fields.pitch.strip.rows').map(
          (row, index) => {
            const pair = list(row, `fields.pitch.strip.rows[${index}]`);
            return [
              bits(pair[0], `fields.pitch.strip.rows[${index}][0]`, 16),
              bits(pair[1], `fields.pitch.strip.rows[${index}][1]`, 16)
            ] as const;
          }
        ),
        x: span(pitch['x'], 'fields.pitch.x'),
        y: int(pitch['y'], 'fields.pitch.y', 136, 199)
      },
      position: textField(field('position'), 'fields.position')
    },
    fonts,
    labels: list(
      record(raw['labels'], 'labels')['records'],
      'labels.records'
    ).map((item, index) => {
      const r = record(item, `labels.records[${index}]`);
      return {
        code: int(r['code'], `labels.records[${index}].code`, 0, 255),
        lines: lines(r['lines'], `labels.records[${index}].lines`)
      };
    }),
    palette: {
      lower: ints(
        palette['rows152to199'],
        'palette.rows152to199',
        16,
        0,
        0xf_ff
      ),
      upper: ints(
        palette['rows136to151'],
        'palette.rows136to151',
        16,
        0,
        0xf_ff
      )
    },
    strings: {
      card: new Map(
        ['outOfRange', 'pressToCall', 'selectToStart', 'busPass'].map(name => [
          name,
          lines(
            record(cardStrings[name], `strings.card.${name}`)['lines'],
            `strings.card.${name}.lines`
          )
        ])
      ),
      // The item record's whole sixteen-byte name, padding and all, is what `$4E446` writes.
      inventory: text(
        record(strings['inventory'], 'strings.inventory')['text'],
        'strings.inventory.text'
      ),
      location: text(
        record(strings['location'], 'strings.location')['name'],
        'strings.location.name'
      ),
      roster: list(
        record(strings['roster'], 'strings.roster')['names'],
        'strings.roster.names'
      ).map((name, index) => text(name, `strings.roster.names[${index}]`))
    }
  };
};
