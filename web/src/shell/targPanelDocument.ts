import type { PanelFont } from './panelPixels.ts';

/// Validated ST presentation data; Targ owns its geometry, fonts and tapes.
export interface TargPanelDocument {
  readonly art: Uint8Array;
  readonly compass: {
    readonly frames: readonly (readonly string[])[];
    readonly ticks: readonly (readonly string[])[];
  };
  readonly fonts: ReadonlyMap<string, PanelFont>;
  readonly palette: readonly number[];
  readonly pitch: readonly (readonly string[])[];
}
const fail = (path: string): never => {
  throw new Error(`/payload/targ-st/panel.json: invalid ${path}`);
};
const record = (value: unknown, path: string): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(path);
const list = (value: unknown, length: number, path: string): unknown[] =>
  Array.isArray(value) && value.length === length ? value : fail(path);
const rows = (
  value: unknown,
  width: number,
  height: number,
  path: string
): string[] =>
  list(value, height, path).map(row =>
    typeof row === 'string' && row.length === width && /^[01]+$/.test(row)
      ? row
      : fail(path)
  );

export const readTargPanelDocument = (value: unknown): TargPanelDocument => {
  const doc = record(value, 'document');
  if (doc['schemaVersion'] !== 1 || doc['kind'] !== 'targStPanel') {
    fail('schema');
  }
  const art = record(doc['art'], 'art');
  if (
    art['width'] !== 320 ||
    art['height'] !== 64 ||
    art['screenY'] !== 136 ||
    art['length'] !== 10_240
  ) {
    fail('art geometry');
  }
  const pixels = Uint8Array.from(
    list(art['rows'], 64, 'art.rows').flatMap(row => {
      if (
        typeof row !== 'string' ||
        row.length !== 320 ||
        !/^[\da-f]+$/.test(row)
      ) {
        return fail('art.rows');
      }
      return [...row].map(pixel => Number.parseInt(pixel, 16));
    })
  );
  const palette = list(
    record(doc['palette'], 'palette')['colours'],
    16,
    'palette.colours'
  ).map(word => {
    if (
      !Number.isInteger(word) ||
      Number(word) < 0 ||
      Number(word) > 0x7_77 ||
      (Number(word) & ~0x7_77) !== 0
    ) {
      return fail('palette.colours');
    }
    return Number(word);
  });
  const fonts = new Map<string, PanelFont>();
  const rawFonts = record(doc['fonts'], 'fonts');
  for (const [name, alphabet, height] of [
    ['number', '0123456789*+-', 5],
    [
      'message',
      Array.from({ length: 65 }, (_, n) => String.fromCharCode(n + 32)).join(
        ''
      ),
      7
    ]
  ] as const) {
    const font = record(rawFonts[name], `fonts.${name}`);
    if (font['width'] !== 8 || font['height'] !== height) {
      fail(`fonts.${name}.geometry`);
    }
    const glyphs = record(font['glyphs'], `fonts.${name}.glyphs`);
    if (Object.keys(glyphs).length !== alphabet.length) {
      fail(`fonts.${name}.alphabet`);
    }
    fonts.set(name, {
      glyphs: new Map(
        [...alphabet].map(c => [
          c,
          rows(glyphs[c], 8, height, `fonts.${name}.${c}`)
        ])
      ),
      height,
      width: 8
    });
  }
  const compass = record(doc['compass'], 'compass');
  const frames = list(compass['frames'], 576, 'compass.frames').map(frame =>
    rows(frame, 32, 5, 'compass.frame')
  );
  const ticks = list(compass['ticks'], 16, 'compass.ticks').map(frame =>
    rows(frame, 16, 4, 'compass.tick')
  );
  const pitch = list(
    record(doc['pitch'], 'pitch')['rows'],
    608,
    'pitch.rows'
  ).map(row => rows(row, 16, 2, 'pitch.row'));
  return { art: pixels, compass: { frames, ticks }, fonts, palette, pitch };
};
