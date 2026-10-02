/// `payload/targ-st/title.json`: Targ's Title Logo, recovered from the ST release (#696).
///
/// The C64 Reference Build has no title screen (ADR 0032). The ST release's `ESCAPE.PRG`
/// shows the NEOchrome picture `E0` while it loads, and `research/targ-st/` reads that file
/// straight off the pinned disk. The logo is every pixel of palette index 3 there: the
/// MERCENARY lettering and the globe it overlaps. It is presentation only (ADR 0063).

export interface TargTitleLogo {
  readonly colour: number;
  readonly height: number;
  /// One row per line, `true` where the mark is drawn.
  readonly rows: readonly (readonly boolean[])[];
  readonly width: number;
}

const refuse = (message: string): never => {
  throw new Error(`payload/targ-st/title.json: ${message}`);
};

const record = (value: unknown, path: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : refuse(`${path} is not a record`);

const size = (value: unknown, path: string, max: number): number =>
  Number.isInteger(value) && (value as number) > 0 && (value as number) <= max
    ? (value as number)
    : refuse(`${path} is not a size from 1 to ${max}`);

/// Read the document, refusing anything but this export of the Targ title picture.
export const readTargTitleLogo = (value: unknown): TargTitleLogo => {
  const raw = record(value, 'document');
  if (raw['schemaVersion'] !== 1 || raw['kind'] !== 'titleLogo') {
    refuse('is not a schema 1 titleLogo document');
  }
  if (record(raw['source'], 'source')['title'] !== 'targ') {
    refuse("source.title is not 'targ'");
  }
  const logo = record(raw['logo'], 'logo');
  const index = logo['index'];
  if (
    !Number.isInteger(index) ||
    (index as number) < 1 ||
    (index as number) > 15
  ) {
    refuse('logo.index is not a palette index from 1 to 15');
  }
  const colours = record(raw['palette'], 'palette')['colours'];
  if (
    !Array.isArray(colours) ||
    colours.length !== 16 ||
    !colours.every(c => Number.isInteger(c) && c >= 0 && c <= 0xf_ff)
  ) {
    refuse('palette.colours is not sixteen ST colour words');
  }
  const width = size(logo['width'], 'logo.width', 320);
  const height = size(logo['height'], 'logo.height', 200);
  const pixels = logo['pixels'];
  if (!Array.isArray(pixels) || pixels.length !== height) {
    refuse(`logo.pixels is not ${height} rows`);
  }
  const mark = (index as number).toString(16);
  const rows = (pixels as unknown[]).map((row, y) =>
    typeof row === 'string' &&
    row.length === width &&
    [...row].every(c => c === '0' || c === mark)
      ? [...row].map(c => c === mark)
      : refuse(`logo.pixels[${y}] is not ${width} pixels of 0 or ${mark}`)
  );
  return {
    colour: (colours as number[])[index as number]!,
    height,
    rows,
    width
  };
};

/// An ST shows three bits a gun.
const gun = (word: number, shift: number): number =>
  Math.round((((word >> shift) & 7) * 255) / 7);

/// The logo as RGBA, transparent outside the mark.
export const targTitleLogoRgba = (
  logo: TargTitleLogo
): Uint8ClampedArray<ArrayBuffer> => {
  const data = new Uint8ClampedArray(logo.width * logo.height * 4);
  const ink = [gun(logo.colour, 8), gun(logo.colour, 4), gun(logo.colour, 0)];
  logo.rows.forEach((row, y) =>
    row.forEach((drawn, x) => {
      if (drawn) {
        data.set([...ink, 255], (y * logo.width + x) * 4);
      }
    })
  );
  return data;
};
