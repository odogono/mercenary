import type { PitchStrip } from '../shell/panelView.ts';
import type { ErisPresentationDocument } from './documents.ts';

/// The Damocles pitch strip (#716), extracted by `damocleslab.panel` from the first-world image.
///
/// `$052B24` reads the camera pitch `$7AC0`, masks it with `$3F0`, and copies twenty rows of the
/// strip at `$76600` from row `(pitch & $3F0) >> 4` into the gauge: bit-planes 1 and 3 of eleven
/// columns, colour 2 for the sky, 8 for the ground and 0 for the ink. The strip is the artwork
/// Mercenary III's `$53AB2` draws, row for row (docs/research/damocles-pitch-strip.md).

export const DAMOCLES_PANEL_PATH = '/payload/damocles/panel.json';

const ROWS = 83;

const fail = (message: string): never => {
  throw new Error(`${DAMOCLES_PANEL_PATH}: ${message}`);
};
const object = (value: unknown, path: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(`${path} should be a record`);
const word = (value: unknown, path: string): string =>
  typeof value === 'string' && /^[01]{16}$/.test(value)
    ? value
    : fail(`${path} should be sixteen bits`);

export interface DamoclesPanelDocument {
  readonly programSha256: string;
  readonly strip: readonly (readonly [string, string])[];
}

export const readDamoclesPanel = (value: unknown): DamoclesPanelDocument => {
  const root = object(value, 'the document');
  if (root['schemaVersion'] !== 1 || root['title'] !== 'damocles') {
    return fail('should be schema 1 for damocles');
  }
  const programSha256 = object(root['source'], 'source')['programSha256'];
  if (
    typeof programSha256 !== 'string' ||
    !/^[\da-f]{64}$/.test(programSha256)
  ) {
    return fail('source.programSha256 should be a SHA-256');
  }
  const rows = object(root['pitch'], 'pitch')['rows'];
  if (!Array.isArray(rows) || rows.length !== ROWS) {
    return fail(`pitch.rows should hold ${ROWS} rows`);
  }
  return {
    programSha256,
    strip: rows.map((row: unknown, index): readonly [string, string] => {
      if (!Array.isArray(row) || row.length !== 2) {
        return fail(`pitch.rows[${index}] should be two words`);
      }
      return [
        word(row[0], `pitch.rows[${index}][0]`),
        word(row[1], `pitch.rows[${index}][1]`)
      ];
    })
  };
};

/// The strip with its row rule. The gauge is handed a pitch in degrees, nose up positive, which
/// is the camera word `$7AC0` read back through the document's orientation: `pitchLevel` level
/// and `yawUnitsPerTurn` a turn, rising as the nose goes down.
export const damoclesPitchStrip = (
  panel: DamoclesPanelDocument,
  orientation: ErisPresentationDocument['orientation']
): PitchStrip => ({
  row: degrees => {
    const units = orientation.yawUnitsPerTurn;
    const pitch =
      Math.round(orientation.pitchLevel - (degrees / 360) * units) &
      (units - 1);
    return (pitch & 0x3_f0) >> 4;
  },
  rows: panel.strip
});
