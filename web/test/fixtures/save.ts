import type { SessionContent } from '../../src/session/index.ts';
import type { SaveEnvironment } from '../../src/session/save.ts';

/// One Save identity for tests that do not care which payload they came from.
///
/// Shared so a schema bump lands in one place: a Save is refused when any of these differs, so
/// two copies of this literal could quietly disagree about what compatibility means.
export const environment: SaveEnvironment = {
  payload: {
    bensonSchemaVersion: 1,
    decoderVersion: 7,
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
    message: { charactersPerSecond: 2, holdSeconds: 3 },
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
