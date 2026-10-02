/// The Damocles Title Logo (ADR 0063, #695): the DAMOCLES lettering of the title screen,
/// extracted from `ETITLE.NEO` on the Working Authority's own disk by `damocleslab.title`.
///
/// `title.png` carries the lettering, 4-bit indexed in the picture's own palette with
/// colour 0 clear. `title.json` carries its provenance, the program identity and hashes of
/// the PNG and of its indices. The document's disk and screen blocks are provenance only.

import { loadTitleLogoPng, type TitleLogoPng } from '../shell/titleLogo.ts';

export const DAMOCLES_TITLE_PATH = '/payload/damocles/title.json';

export interface DamoclesTitleLogo extends TitleLogoPng {
  readonly file: string;
  /// SHA-256 of the indices: two a byte, left pixel high, rows padded to a byte.
  readonly markSha256: string;
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
const string = (value: unknown): string =>
  typeof value === 'string' ? value : fail('expected text');
const digest = (value: unknown): string => {
  const text = string(value);
  return /^[\da-f]{64}$/.test(text) ? text : fail('expected a SHA-256');
};
const size = (value: unknown, max: number): number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= max
    ? value
    : fail(`expected a size from 1 to ${max}`);
const literal = <T extends number | string>(value: unknown, expected: T): T =>
  value === expected ? expected : fail(`expected ${expected}`);

export const parseDamoclesTitle = (value: unknown): DamoclesTitleLogo => {
  const root = object(value);
  literal(root['schemaVersion'], 1);
  literal(root['title'], 'Damocles');
  literal(root['kind'], 'title-logo');
  const logo = object(root['logo']);
  const image = object(logo['image']);
  return {
    file: literal(image['file'], 'title.png'),
    height: size(logo['height'], 200),
    markSha256: digest(image['markSha256']),
    pngSha256: digest(image['sha256']),
    programSha256: digest(object(root['source'])['programSha256']),
    width: size(logo['width'], 320)
  };
};

/// Fetch the document and the PNG it hashes, and decode the lettering for presentation.
export const loadDamoclesTitleLogo = async (
  document: unknown,
  payload: URL
): Promise<{ readonly image: ImageData; readonly logo: DamoclesTitleLogo }> => {
  const logo = parseDamoclesTitle(document);
  const image = await loadTitleLogoPng(
    logo,
    new URL(`damocles/${logo.file}`, payload)
  );
  return { image, logo };
};
