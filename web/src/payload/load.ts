import { recoverTargGeometry } from '../geometry/targ.ts';
import {
  applyTargAssets,
  parseAssetFile,
  type AssetFile
} from '../geometry/targAssets.ts';
import type { Bundle, Source } from './documents.ts';
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
/// version, while endgame.json, sound.json, and object-effects.json are independently required;
/// the geometry decoder's version is checked against the manifest; then five optional documents,
/// each present-or-absent and each carrying a version of its own, because their formats change
/// on their own schedules. Talk Scripts are maintained source, so the historical Benson program is not loaded.
///
/// **A stale schema is refused rather than tolerated.** That is not a new rule — the kit
/// already does it — but it is the rule most worth keeping through a port, because a payload
/// half a version out would decode into a world that looked almost right.

/// The bytes of one payload document, or `undefined` when it is absent.
export type ReadDocument = (name: string) => Promise<string | undefined>;

/// Every file under `assets/targ/`. Edited and Authored Assets are not payload: a loader given
/// none plays the Recovered Baselines alone, which is what the Golden Trace gates compare.
export type ReadAssets = () => Promise<readonly AssetFile[]>;

export const SUPPORTED_SCHEMA_VERSION = 8;
export const SUPPORTED_DECODER_VERSION = 9;
export const SUPPORTED_TEXT_SCHEMA_VERSION = 1;
export const SUPPORTED_INTERACTION_SCHEMA_VERSION = 1;
export const SUPPORTED_FLIGHT_SCHEMA_VERSION = 3;
export const SUPPORTED_UNDERGROUND_SCHEMA_VERSION = 3;
export const SUPPORTED_ENDGAME_SCHEMA_VERSION = 13;
export const SUPPORTED_SOUND_SCHEMA_VERSION = 2;
export const SUPPORTED_OBJECT_EFFECTS_SCHEMA_VERSION = 2;

const parse = (name: string, body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch (error) {
    return fail({ kind: 'unreadable', name, reason: String(error) });
  }
};

const source = <T>(
  name: string,
  body: string,
  onto: (reader: { name: string }, value: unknown) => T
): Source<T> => {
  const value = parse(name, body);
  return { body, document: onto({ name }, value), value };
};

const required = async <T>(
  read: ReadDocument,
  name: string,
  onto: (reader: { name: string }, value: unknown) => T
): Promise<Source<T>> => {
  const body = await read(name);
  if (body === undefined) {
    return fail({ kind: 'missingFile', name });
  }
  return source(name, body, onto);
};

const present = async <T>(
  read: ReadDocument,
  name: string,
  onto: (reader: { name: string }, value: unknown) => T
): Promise<Partial<Source<T>>> => {
  const body = await read(name);
  return body === undefined ? {} : source(name, body, onto);
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

export const load = async (
  read: ReadDocument,
  readAssets?: ReadAssets
): Promise<Bundle> => {
  // All thirteen documents are asked for at once and then checked in order.
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
    { document: manifest },
    { document: world },
    surfaceSource,
    objectsSource,
    { document: rooms },
    { document: endgame },
    { document: text },
    { document: interaction },
    { document: flight },
    { document: underground },
    { document: sound },
    { document: objectEffects }
  ] = await inOrder([
    required(read, 'manifest.json', readers.manifest),
    required(read, 'world.json', readers.world),
    required(read, 'surface.json', readers.surface),
    required(read, 'objects.json', readers.objects),
    required(read, 'rooms.json', readers.rooms),
    required(read, 'endgame.json', readers.endgame),
    present(read, 'text.json', readers.text),
    present(read, 'interaction.json', readers.interaction),
    present(read, 'flight.json', readers.flight),
    present(read, 'underground.json', readers.underground),
    present(read, 'sound.json', readers.sound),
    required(read, 'object-effects.json', readers.objectEffects)
  ]);
  const surface = surfaceSource.document;
  const objects = objectsSource.document;

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
  check(
    'object-effects.json',
    objectEffects.schemaVersion,
    SUPPORTED_OBJECT_EFFECTS_SCHEMA_VERSION
  );
  if (manifest.decoderVersion !== SUPPORTED_DECODER_VERSION) {
    fail({ kind: 'unsupportedDecoder', version: manifest.decoderVersion });
  }

  if (text !== undefined) {
    check('text.json', text.schemaVersion, SUPPORTED_TEXT_SCHEMA_VERSION);
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
    soundDocument.sid.clockHz !== 985_248 ||
    soundDocument.sid.registerCount !== 25 ||
    soundDocument.sid.voiceStride !== 7 ||
    soundDocument.initialRegisters.length !== soundDocument.sid.registerCount ||
    soundDocument.oneShots.length !== soundDocument.counts['oneShotPrograms'] ||
    soundDocument.liftProfiles.length !==
      soundDocument.counts['liftProfiles'] ||
    soundDocument.sid.supportedControls.join(',') !== '0,4,16,21,65,128,129' ||
    soundDocument.counts['initialRegisters'] !== 25 ||
    soundDocument.counts['voices'] !== 3 ||
    soundDocument.oneShots.map(program => program.selector).join(',') !==
      '0,4,8,12,16,20,24,28,32,36,40,44,48' ||
    soundDocument.liftProfiles.map(profile => profile.entry).join(',') !==
      'af3e,af3a' ||
    soundDocument.initialRegisters.some(value => value < 0 || value > 255) ||
    [4, 11, 18].some(
      register =>
        !soundDocument.sid.supportedControls.includes(
          soundDocument.initialRegisters[register]!
        )
    ) ||
    soundDocument.initialRegisters.slice(21).join(',') !== '0,0,0,15' ||
    soundDocument.liftProfiles.some(
      profile =>
        profile.registers.length !== 14 ||
        profile.startControl !== 21 ||
        profile.registers.some(value => value < 0 || value > 255) ||
        [4, 11].some(
          register =>
            !soundDocument.sid.supportedControls.includes(
              profile.registers[register]!
            )
        )
    ) ||
    soundDocument.craft.frequencyHighRegister !== 8 ||
    soundDocument.craft.sustainReleaseRegister !== 13 ||
    soundDocument.craft.programSelector !== 36 ||
    soundDocument.liftJourney.dingSelector !== 0 ||
    soundDocument.liftJourney.programSelector !== 48 ||
    soundDocument.liftJourney.pitchHighRegister !== 8 ||
    soundDocument.liftJourney.controlRegister !== 11 ||
    soundDocument.liftJourney.stoppedValue !== 0 ||
    soundDocument.craft.speedHighShift !== 4 ||
    soundDocument.bensonDisplay.frequencyHighRegister !== 15 ||
    soundDocument.bensonDisplay.controlRegister !== 18 ||
    soundDocument.bensonDisplay.control !== 65 ||
    soundDocument.bensonDisplay.voice !== 3 ||
    soundDocument.stopRules.oneShotControlRegister !== 4 ||
    soundDocument.stopRules.secondVoiceControlRegister !== 11 ||
    soundDocument.stopRules.liftControlRegister !== 11 ||
    soundDocument.stopRules.bensonDisplayFrequencyHighRegister !== 15 ||
    soundDocument.stopRules.stoppedValue !== 0 ||
    soundDocument.oneShots.some(
      program =>
        ![0x41, 0x80, 0x81].includes(program.control) ||
        [
          program.frequencyHigh,
          program.attackDecay,
          program.sustainRelease
        ].some(value => value < 0 || value > 255)
    )
  ) {
    fail({
      kind: 'unreadable',
      name: 'sound.json',
      reason: 'inconsistent or unsupported bounded SID contract'
    });
  }

  const recovered = await recoverTargGeometry(
    objectsSource,
    surfaceSource,
    world
  );
  const files = [...((await readAssets?.()) ?? [])].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  const geometry = await applyTargAssets(
    { ...recovered, instances: objects.instances },
    await Promise.all(files.map(parseAssetFile))
  );

  return {
    endgame,
    manifest,
    objectEffects,
    objects: {
      ...objects,
      instances: geometry.instances,
      models: geometry.objects
    },
    rooms,
    sound: soundDocument,
    surface: { ...surface, cells: geometry.structures },
    world,
    ...(text !== undefined ? { text } : {}),
    ...(flight !== undefined ? { flight } : {}),
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

/// Fetch every Targ asset file from the dev server, which lists `assets/targ/` as one document.
export const fetchAssets =
  (url: string): ReadAssets =>
  async () => {
    const response = await fetch(url);
    if (!response.ok) {
      return fail({
        kind: 'unreadable',
        name: 'assets/targ',
        reason: `HTTP ${response.status}`
      });
    }
    return (await response.json()) as AssetFile[];
  };
