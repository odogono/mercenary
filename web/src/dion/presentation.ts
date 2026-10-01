import { DION_PROGRAM_SHA256 } from './documents.ts';
import { fail, int, list, record, text } from './read.ts';

/// `web/dion/metis.json`: what this project authors or derives for the METIS
/// Destination, each value tagged with its provenance (ADR 0043), and the coverage
/// inventory every required item of the slice is accounted in.
///
/// Recovered values live in `payload/dion/`. This document holds the rest: the 50 Hz
/// eleven-tick cadence ADR 0058 adopted, the colour levels the browser shows, and the
/// day placeholder #646 will replace. Its coverage list names, for each required item,
/// the payload record that recovers it or the gap and ticket it waits on. A gap that
/// gates I1 refuses the Destination; gaps that gate I2 are carried as named gaps.

export const DION_PRESENTATION_PATH = '/dion/metis.json';

export type DionProvenanceTag = 'authored' | 'derived' | 'recovered';

export interface DionTaggedValue<T> {
  readonly evidence: string;
  readonly provenance: DionProvenanceTag;
  readonly value: T;
}

export interface DionCoverageItem {
  readonly gates: 'I1' | 'I2';
  /// A dotted path into the loaded documents, `world.structures.132`.
  readonly in: string | null;
  readonly item: string;
  readonly status: 'gap' | 'recovered' | 'waived';
  readonly ticket: string | null;
}

export interface DionPresentation {
  readonly colourLevels: DionTaggedValue<number>;
  readonly coverage: readonly DionCoverageItem[];
  readonly nightFlip: DionTaggedValue<'day'>;
  readonly ticksPerFrame: DionTaggedValue<number>;
  readonly ticksPerSecond: DionTaggedValue<number>;
  readonly walkingSubsteps: DionTaggedValue<number>;
}

const PATH = 'metis.json';

const tag = (value: unknown, path: string): DionProvenanceTag => {
  const raw = text(value, path);
  return raw === 'authored' || raw === 'derived' || raw === 'recovered'
    ? raw
    : fail(`${path} is not a provenance tag`);
};

const tagged = <T>(
  values: Record<string, unknown>,
  name: string,
  read: (value: unknown, path: string) => T
): DionTaggedValue<T> => {
  const raw = record(values[name], `${PATH} values.${name}`);
  return {
    evidence: text(raw['evidence'], `${PATH} values.${name}.evidence`),
    provenance: tag(raw['provenance'], `${PATH} values.${name}.provenance`),
    value: read(raw['value'], `${PATH} values.${name}.value`)
  };
};

export const readDionPresentation = (value: unknown): DionPresentation => {
  const raw = record(value, PATH);
  if (raw['schemaVersion'] !== 1) {
    fail(`${PATH} schemaVersion is not 1`);
  }
  if (raw['title'] !== 'dion' || raw['programSha256'] !== DION_PROGRAM_SHA256) {
    fail(`${PATH} does not name the pinned Mercenary III baseline`);
  }
  const values = record(raw['values'], `${PATH} values`);
  const ticksPerSecond = tagged(values, 'ticksPerSecond', (v, p) =>
    int(v, p, 50, 50)
  );
  const ticksPerFrame = tagged(values, 'ticksPerFrame', (v, p) =>
    int(v, p, 11, 11)
  );
  const walkingSubsteps = tagged(values, 'walkingSubsteps', (v, p) =>
    int(v, p, 4, 8)
  );
  if (walkingSubsteps.value !== Math.max(4, Math.min(8, ticksPerFrame.value))) {
    fail(`${PATH} walkingSubsteps is not clamp(ticksPerFrame, 4, 8)`);
  }
  const coverage = list(raw['coverage'], `${PATH} coverage`).map(
    (item, index): DionCoverageItem => {
      const at = `${PATH} coverage[${index}]`;
      const c = record(item, at);
      const rawStatus = text(c['status'], `${at}.status`);
      const rawGates = text(c['gates'], `${at}.gates`);
      const status =
        rawStatus === 'gap' ||
        rawStatus === 'recovered' ||
        rawStatus === 'waived'
          ? rawStatus
          : fail(`${at}.status is ${rawStatus}`);
      const gates =
        rawGates === 'I1' || rawGates === 'I2'
          ? rawGates
          : fail(`${at}.gates is ${rawGates}`);
      if (status === 'gap' && gates === 'I1') {
        fail(
          `${at}: ${text(c['item'], `${at}.item`)} is a required I1 gap, so the Destination cannot be admitted`
        );
      }
      return {
        gates,
        in: c['in'] === undefined ? null : text(c['in'], `${at}.in`),
        item: text(c['item'], `${at}.item`),
        status,
        ticket:
          c['ticket'] === undefined ? null : text(c['ticket'], `${at}.ticket`)
      };
    }
  );
  return {
    colourLevels: tagged(values, 'colourLevels', (v, p) => int(v, p, 7, 7)),
    coverage,
    nightFlip: tagged(values, 'nightFlip', (v, p) =>
      v === 'day' ? 'day' : fail(`${p} is not the day placeholder`)
    ),
    ticksPerFrame,
    ticksPerSecond,
    walkingSubsteps
  };
};

/// Every recovered item must name a record the loaded documents hold.
export const checkCoverage = (
  presentation: DionPresentation,
  documents: Readonly<Record<string, unknown>>
): void => {
  for (const item of presentation.coverage) {
    if (item.status !== 'recovered') {
      continue;
    }
    const path =
      item.in ?? fail(`${PATH}: recovered item ${item.item} names no record`);
    let cursor: unknown = documents;
    for (const step of path.split('.')) {
      cursor =
        typeof cursor === 'object' && cursor !== null
          ? (cursor as Record<string, unknown>)[step]
          : undefined;
    }
    if (
      cursor === undefined ||
      (Array.isArray(cursor) && cursor.length === 0)
    ) {
      fail(
        `${PATH}: ${item.item} names ${path}, which the payload does not hold`
      );
    }
  }
};
