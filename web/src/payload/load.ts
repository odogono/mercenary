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
/// The load order and every check are the kit's. Five documents are required and share one
/// schema version; the geometry decoder's version is checked against the manifest; then five
/// optional documents, each present-or-absent and each carrying a version of its own, because
/// their formats change on their own schedules. `benson.json` without `text.json` is refused,
/// since a script cannot render its messages without the word table.
///
/// **A stale schema is refused rather than tolerated.** That is not a new rule — the kit
/// already does it — but it is the rule most worth keeping through a port, because a payload
/// half a version out would decode into a world that looked almost right.

/// The bytes of one payload document, or `undefined` when it is absent.
export type ReadDocument = (name: string) => Promise<string | undefined>;

export const SUPPORTED_SCHEMA_VERSION = 8;
export const SUPPORTED_DECODER_VERSION = 7;
export const SUPPORTED_TEXT_SCHEMA_VERSION = 1;
export const SUPPORTED_BENSON_SCHEMA_VERSION = 1;
export const SUPPORTED_INTERACTION_SCHEMA_VERSION = 1;
export const SUPPORTED_FLIGHT_SCHEMA_VERSION = 3;
export const SUPPORTED_UNDERGROUND_SCHEMA_VERSION = 2;

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

const check = (name: string, version: number, supported: number): void => {
  if (version !== supported) {
    fail({ kind: 'unsupportedSchema', name, version });
  }
};

export const load = async (read: ReadDocument): Promise<Bundle> => {
  const manifest = await required(read, 'manifest.json', readers.manifest);
  const world = await required(read, 'world.json', readers.world);
  const surface = await required(read, 'surface.json', readers.surface);
  const objects = await required(read, 'objects.json', readers.objects);
  const rooms = await required(read, 'rooms.json', readers.rooms);

  // The five geometry documents share one version, because they are one extraction.
  check('manifest.json', manifest.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('world.json', world.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('surface.json', surface.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('objects.json', objects.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  check('rooms.json', rooms.schemaVersion, SUPPORTED_SCHEMA_VERSION);
  if (manifest.decoderVersion !== SUPPORTED_DECODER_VERSION) {
    fail({ kind: 'unsupportedDecoder', version: manifest.decoderVersion });
  }

  const text = await present(read, 'text.json', readers.text);
  if (text !== undefined) {
    check('text.json', text.schemaVersion, SUPPORTED_TEXT_SCHEMA_VERSION);
  }

  const benson = await present(read, 'benson.json', readers.benson);
  if (benson !== undefined) {
    check('benson.json', benson.schemaVersion, SUPPORTED_BENSON_SCHEMA_VERSION);
    if (text === undefined) {
      fail({
        kind: 'missingFile',
        name: 'text.json, which benson.json needs to render its messages'
      });
    }
  }

  const interaction = await present(read, 'interaction.json', readers.interaction);
  if (interaction !== undefined) {
    check(
      'interaction.json',
      interaction.schemaVersion,
      SUPPORTED_INTERACTION_SCHEMA_VERSION
    );
  }

  const flight = await present(read, 'flight.json', readers.flight);
  if (flight !== undefined) {
    check('flight.json', flight.schemaVersion, SUPPORTED_FLIGHT_SCHEMA_VERSION);
  }

  const underground = await present(read, 'underground.json', readers.underground);
  if (underground !== undefined) {
    check(
      'underground.json',
      underground.schemaVersion,
      SUPPORTED_UNDERGROUND_SCHEMA_VERSION
    );
  }

  return {
    manifest,
    objects,
    rooms,
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
/// A 404 is absence rather than failure, because five of the ten documents are optional and
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
