import type { Bundle } from './documents.ts';
import { fail } from './errors.ts';
import { readers } from './read.ts';

/// Loading the Data Payload, through a seam.
///
/// The kit reads the payload directory with `FileManager` directly. In a browser there is no
/// directory — there is a fetch that either answers or 404s — so the read is injected: `load`
/// takes a function from a document's name to its bytes, or `undefined` when it is not there.
/// The pattern is the kit's own `Settings.load(at:read:)` generalised, which is the seam that
/// already existed for exactly this reason.
///
/// The load order and every check are the kit's. Five geometry documents share one schema
/// version, and endgame.json is independently required; the geometry decoder's version is
/// checked against the manifest; then five optional documents, each present-or-absent and each carrying a version of its own, because
/// their formats change on their own schedules. `benson.json` without `text.json` is refused,
/// since a script cannot render its messages without the word table.
///
/// **A stale schema is refused rather than tolerated.** That is not a new rule — the kit
/// already does it — but it is the rule most worth keeping through a port, because a payload
/// half a version out would decode into a world that looked almost right.

/// The bytes of one payload document, or `undefined` when it is absent.
export type ReadDocument = (name: string) => Promise<string | undefined>;

export const SUPPORTED_SCHEMA_VERSION = 8;
export const SUPPORTED_DECODER_VERSION = 9;
export const SUPPORTED_TEXT_SCHEMA_VERSION = 1;
export const SUPPORTED_BENSON_SCHEMA_VERSION = 1;
export const SUPPORTED_INTERACTION_SCHEMA_VERSION = 1;
export const SUPPORTED_FLIGHT_SCHEMA_VERSION = 3;
export const SUPPORTED_UNDERGROUND_SCHEMA_VERSION = 2;
export const SUPPORTED_ENDGAME_SCHEMA_VERSION = 13;
export const SUPPORTED_SOUND_SCHEMA_VERSION = 1;

const parse = (name: string, body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch (error) {
    return fail({ kind: 'unreadable', name, reason: String(error) });
  }
};

const required = async <T>(
  read: ReadDocument,
  name: string,
  onto: (reader: { name: string }, value: unknown) => T
): Promise<T> => {
  const body = await read(name);
  if (body === undefined) {
    return fail({ kind: 'missingFile', name });
  }
  return onto({ name }, parse(name, body));
};

const present = async <T>(
  read: ReadDocument,
  name: string,
  onto: (reader: { name: string }, value: unknown) => T
): Promise<T | undefined> => {
  const body = await read(name);
  if (body === undefined) {
    return undefined;
  }
  return onto({ name }, parse(name, body));
};

/// Await every read, then re-raise the first failure by position rather than by finishing time.
///
/// `Promise.all` reports whichever promise rejected first, which for ten concurrent reads is a
/// race. The documents are ordered by how fundamental they are, and a caller missing several
/// should be told about the most fundamental one, the same way the sequential reads told them.
const inOrder = async <T extends readonly unknown[]>(
  reads: readonly [...{ [K in keyof T]: Promise<T[K]> }]
): Promise<T> => {
  const settled = await Promise.allSettled(reads);
  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      throw outcome.reason;
    }
  }
  return settled.map(
    outcome => (outcome as PromiseFulfilledResult<unknown>).value
  ) as unknown as T;
};

const check = (name: string, version: number, supported: number): void => {
  if (version !== supported) {
    fail({ kind: 'unsupportedSchema', name, version });
  }
};

export const load = async (read: ReadDocument): Promise<Bundle> => {
  // All eleven documents are asked for at once and then checked in order.
  //
  // The read seam is a `fetch` in the browser (ADR 0011), so awaiting each document before
  // asking for the next made startup ten serialised round trips before the first frame. They
  // are independent files, so the requests overlap.
  //
  // `inOrder` rather than a bare `Promise.all`, because which failure a caller is told about is
  // part of this function's contract and `Promise.all` rejects with whichever read lost the
  // race. Settling them all and then re-raising by position reports exactly what the sequential
  // version reported — the earliest document in this list that could not be read — whatever
  // order the reads happen to finish in.
  const [
    manifest,
    world,
    surface,
    objects,
    rooms,
    endgame,
    text,
    benson,
    interaction,
    flight,
    underground,
    sound
  ] = await inOrder([
    required(read, 'manifest.json', readers.manifest),
    required(read, 'world.json', readers.world),
    required(read, 'surface.json', readers.surface),
    required(read, 'objects.json', readers.objects),
    required(read, 'rooms.json', readers.rooms),
    required(read, 'endgame.json', readers.endgame),
    present(read, 'text.json', readers.text),
    present(read, 'benson.json', readers.benson),
    present(read, 'interaction.json', readers.interaction),
    present(read, 'flight.json', readers.flight),
    present(read, 'underground.json', readers.underground),
    present(read, 'sound.json', readers.sound)
  ]);

  // The five geometry documents share one version, because they are one extraction.
  check('manifest.json', manifest.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('world.json', world.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('surface.json', surface.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('objects.json', objects.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('rooms.json', rooms.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check(
    'endgame.json',
    endgame.schemaVersion,
    SUPPORTED_ENDGAME_SCHEMA_VERSION
  );
  if (manifest.decoderVersion !== SUPPORTED_DECODER_VERSION) {
    fail({ kind: 'unsupportedDecoder', version: manifest.decoderVersion });
  }

  if (text !== undefined) {
    check('text.json', text.schemaVersion, SUPPORTED_TEXT_SCHEMA_VERSION);
  }

  if (benson !== undefined) {
    check('benson.json', benson.schemaVersion, SUPPORTED_BENSON_SCHEMA_VERSION);
    if (text === undefined) {
      fail({
        kind: 'missingFile',
        name: 'text.json, which benson.json needs to render its messages'
      });
    }
  }

  if (interaction !== undefined) {
    check(
      'interaction.json',
      interaction.schemaVersion,
      SUPPORTED_INTERACTION_SCHEMA_VERSION
    );
  }

  if (flight !== undefined) {
    check('flight.json', flight.schemaVersion, SUPPORTED_FLIGHT_SCHEMA_VERSION);
  }

  if (underground !== undefined) {
    check(
      'underground.json',
      underground.schemaVersion,
      SUPPORTED_UNDERGROUND_SCHEMA_VERSION
    );
  }
  const soundDocument =
    sound ?? fail({ kind: 'missingFile', name: 'sound.json' });
  check(
    'sound.json',
    soundDocument.schemaVersion,
    SUPPORTED_SOUND_SCHEMA_VERSION
  );

  if (
    soundDocument.sid.registerCount !== 25 ||
    soundDocument.sid.voiceStride !== 7 ||
    soundDocument.initialRegisters.length !== soundDocument.sid.registerCount ||
    soundDocument.oneShots.length !== soundDocument.counts['oneShotPrograms'] ||
    soundDocument.liftProfiles.length !==
      soundDocument.counts['liftProfiles'] ||
    soundDocument.sid.supportedControls.join(',') !== '0,21,65,128,129' ||
    soundDocument.oneShots.some(
      program => ![0x41, 0x80, 0x81].includes(program.control)
    )
  ) {
    fail({
      kind: 'unreadable',
      name: 'sound.json',
      reason: 'inconsistent or unsupported bounded SID contract'
    });
  }

  return {
    endgame,
    manifest,
    objects,
    rooms,
    sound: soundDocument,
    surface,
    world,
    ...(text !== undefined ? { text } : {}),
    ...(flight !== undefined ? { flight } : {}),
    ...(benson !== undefined ? { benson } : {}),
    ...(interaction !== undefined ? { interaction } : {}),
    ...(underground !== undefined ? { underground } : {})
  };
};

/// A reader that fetches from a base URL, which is how the browser loads the payload.
///
/// A 404 is absence rather than failure, because five of the eleven documents are optional and
/// the loader distinguishes the two. Any other bad status is a failure: a payload served with a
/// 500 is not a payload without a `flight.json`.
export const fetchReader =
  (baseUrl: string): ReadDocument =>
  async name => {
    const response = await fetch(new URL(name, baseUrl));
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      return fail({
        kind: 'unreadable',
        name,
        reason: `HTTP ${response.status}`
      });
    }
    return await response.text();
  };
