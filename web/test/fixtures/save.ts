import { createCore } from '@northtalk/ts';

import type { SessionContent } from '../../src/session/index.ts';
import type { SaveEnvironment, SaveSnapshot } from '../../src/session/save.ts';

/// One Save identity for tests that do not care which payload they came from.
///
/// Shared so a schema bump lands in one place: a Save is refused when any of these differs, so
/// two copies of this literal could quietly disagree about what compatibility means.
export const environment: SaveEnvironment = {
  payload: {
    bensonSchemaVersion: 1,
    decoderVersion: 9,
    endgameSchemaVersion: 2,
    flightSchemaVersion: 3,
    interactionSchemaVersion: 1,
    schemaVersion: 8,
    sourceCoreDigest: 'core',
    sourceDatasetId: 'dataset',
    textSchemaVersion: 1,
    undergroundSchemaVersion: 2
  },
  settings: {
    flight: {
      groundAltitude: null,
      pitchScale: 1,
      referenceFrameRate: 20,
      runMultiplier: 3,
      speedScale: 1,
      throttleFloorNotch: 1,
      turnScale: 1
    },
    message: { holdSeconds: 3 },
    scripts: { instructionBudget: 512, timeScale: 6 }
  }
};

/// A world with nothing in it, for tests about session plumbing rather than content.
export const emptyContent = (): SessionContent => ({
  cellSize: 65_536,
  doorwayRules: undefined,
  flight: undefined,
  interaction: undefined,
  objects: [],
  rooms: new Map(),
  underground: undefined
});

/// A snapshot whose NorthTalk save is replaced by its State Fingerprint (ADR 0142). Each save's
/// bytes carry the Group's save counter and so never repeat (ADR 0080); the fingerprint leaves
/// out only that counter, so two snapshots of one Talk state compare equal and any other
/// difference in Talk Script state still fails the comparison.
export const comparable = (snapshot: SaveSnapshot): SaveSnapshot => ({
  ...snapshot,
  talk: snapshot.talk && {
    ...snapshot.talk,
    group: Buffer.from(
      createCore().stateFingerprint(Buffer.from(snapshot.talk.group, 'base64'))
    ).toString('hex')
  }
});
