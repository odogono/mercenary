import type { Catalogue } from '../catalogue/data.ts';
import {
  createSlotPersistence,
  type SavePersistence,
  type SaveSlot,
  type SlotStorage
} from '../shell/saves.ts';
import type { DamoclesDocuments } from './documentBank.ts';
import type { ArrivalPoses } from './poses.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveIdentity,
  type DamoclesSaveSnapshot
} from './save.ts';
import type { DamoclesStrings } from './strings.ts';

export interface DamoclesSavePersistenceOptions {
  readonly capture: () => {
    readonly snapshot: DamoclesSaveSnapshot;
    readonly where: string;
  };
  readonly catalogue: Catalogue;
  readonly documents?: DamoclesDocuments;
  readonly identity: DamoclesSaveIdentity;
  readonly now?: () => Date;
  readonly poses?: ArrivalPoses;
  readonly release: () => void;
  readonly restore: (snapshot: DamoclesSaveSnapshot, slot: SaveSlot) => void;
  readonly slotKey: (slot: SaveSlot) => string;
  readonly storage: SlotStorage | undefined;
  readonly strings?: DamoclesStrings;
  readonly time?: () => number;
}

/// Damocles Saves: the shared persistence core plus the Title-scoped Damocles codec.
export const createDamoclesSavePersistence = (
  options: DamoclesSavePersistenceOptions
): SavePersistence =>
  createSlotPersistence({
    capture: options.capture,
    decode: encoded => {
      const saved = decodeDamoclesSave(encoded, options.identity, {
        catalogue: options.catalogue,
        ...(options.documents === undefined
          ? {}
          : { documents: options.documents }),
        ...(options.poses === undefined ? {} : { poses: options.poses }),
        ...(options.strings === undefined ? {} : { strings: options.strings })
      });
      return {
        savedAt: saved.savedAt,
        snapshot: saved.snapshot,
        where: saved.where
      };
    },
    encode: (captured, savedAt) =>
      encodeDamoclesSave({
        identity: options.identity,
        savedAt,
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot: captured.snapshot,
        where: captured.where
      }),
    release: options.release,
    restore: options.restore,
    slotKey: options.slotKey,
    storage: options.storage,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.time === undefined ? {} : { time: options.time })
  });
