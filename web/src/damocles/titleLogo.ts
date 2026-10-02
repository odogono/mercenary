/// The Damocles Title Logo (ADR 0063, #695): the DAMOCLES lettering of the title screen,
/// extracted from `ETITLE.NEO` on the Working Authority's own disk by `damocleslab.title`.
///
/// Only what the System Menu draws is read here: the program identity, the picture's palette
/// and the lettering's pixels. The document's disk and screen blocks are its provenance.

export const DAMOCLES_TITLE_PATH = '/payload/damocles/title.json';

export interface DamoclesTitleLogo {
  readonly height: number;
  /// One row of palette indices a line, 0 left clear.
  readonly pixels: readonly (readonly number[])[];
  readonly width: number;
}

export interface DamoclesTitleDocument {
  readonly logo: DamoclesTitleLogo;
  /// The picture's sixteen ST colour words.
  readonly palette: readonly number[];
  readonly programSha256: string;
}

const fail = (message: string): never => {
  throw new Error(`Invalid Damocles title logo: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('expected a record');
  }
  return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : fail('expected an array');
const string = (value: unknown): string =>
  typeof value === 'string' ? value : fail('expected text');
const integer = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : fail('expected a positive integer');
const literal = <T extends number | string>(value: unknown, expected: T): T =>
  value === expected ? expected : fail(`expected ${expected}`);

export const parseDamoclesTitle = (value: unknown): DamoclesTitleDocument => {
  const root = object(value);
  literal(root['schemaVersion'], 1);
  literal(root['title'], 'Damocles');
  literal(root['kind'], 'title-logo');
  const programSha256 = string(object(root['source'])['programSha256']);
  if (!/^[\da-f]{64}$/.test(programSha256)) {
    fail('invalid program identity');
  }
  const palette = list(object(root['palette'])['colours']).map(colour =>
    typeof colour === 'number' &&
    Number.isInteger(colour) &&
    colour >= 0 &&
    colour <= 0x7_77 &&
    (colour & 0x8_88) === 0
      ? colour
      : fail('expected an ST colour word')
  );
  if (palette.length !== 16) {
    fail('expected sixteen colours');
  }
  const rawLogo = object(root['logo']);
  const width = integer(rawLogo['width']);
  const height = integer(rawLogo['height']);
  const rows = list(rawLogo['pixels']).map(string);
  if (rows.length !== height) {
    fail(`expected ${height} rows`);
  }
  const pixels = rows.map(row =>
    row.length === width && /^[\da-f]*$/.test(row)
      ? Array.from(row, digit => Number.parseInt(digit, 16))
      : fail(`expected ${width} palette indices a row`)
  );
  return { logo: { height, pixels, width }, palette, programSha256 };
};

/// An ST gun: three bits, spread over the whole byte.
const gun = (word: number, shift: number): number =>
  Math.round((((word >> shift) & 7) * 255) / 7);

/// The lettering as RGBA in the title screen's own colours, colour 0 left clear.
export const damoclesLogoRgba = (
  doc: DamoclesTitleDocument
): {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly height: number;
  readonly width: number;
} => {
  const { height, pixels, width } = doc.logo;
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((row, y) => {
    row.forEach((index, x) => {
      if (index === 0) {
        return;
      }
      const colour = doc.palette[index]!;
      const at = (y * width + x) * 4;
      data[at] = gun(colour, 8);
      data[at + 1] = gun(colour, 4);
      data[at + 2] = gun(colour, 0);
      data[at + 3] = 255;
    });
  });
  return { data, height, width };
};
