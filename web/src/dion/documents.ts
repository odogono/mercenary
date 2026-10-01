import {
  fail,
  int,
  list,
  record,
  text,
  type Provenance,
  provenance
} from './read.ts';

/// The documents a Mercenary III Destination loads, and the identity they must share.
///
/// Every document in `payload/dion/` is exported from one capture run of the pinned
/// **Mercenary III research baseline** by `research/mercenary-iii-st/` and carries the
/// same `source` block. A document is refused, never half-admitted, if it names another
/// Title, another program image, another schema, or a different capture from its
/// siblings: a Damocles Catalogue, a Targ payload document or a mixed export cannot
/// stand in for MIII content (#647).

/// The pinned STX: `Mercenary III.STX`, 512,160 bytes.
export const DION_PROGRAM_SHA256 =
  '4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c';
export const DION_SCHEMA_VERSION = 1;
export const DION_PAYLOAD = '/payload/dion';

export const DION_DOCUMENTS = [
  'world',
  'panel',
  'messages',
  'scripts',
  'sound',
  'service'
] as const;
export type DionDocumentKind = (typeof DION_DOCUMENTS)[number];

export const dionDocumentPath = (kind: DionDocumentKind): string =>
  `${DION_PAYLOAD}/${kind}.json`;

export interface DionCaptureIdentity {
  readonly entry: string;
  readonly loaded: string;
  readonly opening: string;
}

export interface DionSource {
  readonly capture: DionCaptureIdentity;
  readonly programSha256: string;
  readonly title: 'dion';
  readonly tosSha256: string;
}

const sha = (value: unknown, path: string): string => {
  const raw = text(value, path);
  return /^[\da-f]{64}$/.test(raw) ? raw : fail(`${path} is not a SHA-256`);
};

/// The header every MIII document carries: schema, kind and the pinned baseline.
export const readDionHeader = (
  value: unknown,
  kind: DionDocumentKind
): { readonly body: Record<string, unknown>; readonly source: DionSource } => {
  const raw = record(value, kind);
  const version = int(raw['schemaVersion'], `${kind}.schemaVersion`, 0);
  if (version !== DION_SCHEMA_VERSION) {
    fail(
      `${kind}.schemaVersion is ${version}; this build reads ${DION_SCHEMA_VERSION}`
    );
  }
  if (raw['kind'] !== kind) {
    fail(`${kind}.json declares kind ${JSON.stringify(raw['kind'])}`);
  }
  const source = record(raw['source'], `${kind}.source`);
  if (source['title'] !== 'dion') {
    fail(
      `${kind}.json belongs to Title ${JSON.stringify(source['title'])}, not dion`
    );
  }
  const program = sha(source['programSha256'], `${kind}.source.programSha256`);
  if (program !== DION_PROGRAM_SHA256) {
    fail(
      `${kind}.json was exported from program ${program.slice(0, 12)}…, not the pinned Mercenary III baseline`
    );
  }
  const capture = record(source['capture'], `${kind}.source.capture`);
  const ram = (name: string): string =>
    sha(
      record(capture[name], `${kind}.source.capture.${name}`)['ramSha256'],
      `${kind}.source.capture.${name}.ramSha256`
    );
  return {
    body: raw,
    source: {
      capture: { entry: ram('entry'), loaded: ram('loaded'), opening: ram('opening') },
      programSha256: program,
      title: 'dion',
      tosSha256: sha(source['tosSha256'], `${kind}.source.tosSha256`)
    }
  };
};

/// Refuse documents exported from different capture runs.
export const checkSameCapture = (
  sources: ReadonlyMap<DionDocumentKind, DionSource>
): void => {
  let first: [DionDocumentKind, DionSource] | undefined;
  for (const entry of sources) {
    if (first === undefined) {
      first = entry;
      continue;
    }
    const [kind, source] = entry;
    const [firstKind, reference] = first;
    for (const key of ['entry', 'loaded', 'opening'] as const) {
      if (source.capture[key] !== reference.capture[key]) {
        fail(
          `${kind}.json and ${firstKind}.json come from different capture runs (${key} image)`
        );
      }
    }
  }
};

/// What a non-world document must at least hold to be admitted: its stated shape and
/// a provenance for the slices it was decoded from.
export const readSources = (
  body: Record<string, unknown>,
  kind: DionDocumentKind
): Provenance[] =>
  list(body['sources'], `${kind}.sources`).map((item, index) =>
    provenance(item, `${kind}.sources[${index}]`)
  );
