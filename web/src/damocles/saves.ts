import type { Catalogue } from '../catalogue/data.ts';
import {
  createSlotPersistence,
  type SavePersistence,
  type SaveSlot,
  type SlotStorage
} from '../shell/saves.ts';
import type { ArrivalPoses } from './poses.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveIdentity,
  type DamoclesSaveSnapshot
} from './save.ts';

export interface DamoclesSavePersistenceOptions {
  readonly capture: () => {
    readonly snapshot: DamoclesSaveSnapshot;
    readonly where: string;
  };
  readonly catalogue: Catalogue;
  readonly identity: DamoclesSaveIdentity;
  readonly now?: () => Date;
  readonly poses?: ArrivalPoses;
  readonly release: () => void;
  readonly restore: (snapshot: DamoclesSaveSnapshot, slot: SaveSlot) => void;
  readonly slotKey: (slot: SaveSlot) => string;
  readonly storage: SlotStorage | undefined;
  readonly time?: () => number;
}

/// Damocles Saves: the shared persistence core plus the Title-scoped Damocles codec.
export const createDamoclesSavePersistence = (
  options: DamoclesSavePersistenceOptions
): SavePersistence =>
  createSlotPersistence({
    capture: options.capture,
    decode: encoded => {
      const saved = decodeDamoclesSave(
        encoded,
        options.identity,
        options.catalogue,
        options.poses
      );
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
