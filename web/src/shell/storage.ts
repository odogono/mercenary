/// The parts of `Storage` this shell actually uses.
///
/// Each surface asks for only the methods it needs, so a test double stays a two-line object
/// literal and no module gains the power to clear a store it merely reads.
export interface ReadStorage {
  getItem(key: string): string | null;
}

export interface WriteStorage {
  setItem(key: string, value: string): void;
}

export interface RemoveStorage {
  removeItem(key: string): void;
}

/// Notice when another tab sharing this storage changes one of the given keys.
///
/// A `null` key means the whole store was cleared, which changes every key at once. Saves,
/// preferences and the typeface all want this, so the keys are the caller's rather than
/// hardcoded here.
export const installStorageWatch = (
  storageEvents: Window,
  keys: readonly string[],
  onChange: () => void
): void => {
  storageEvents.addEventListener('storage', event => {
    if (event.key === null || keys.includes(event.key)) {
      onChange();
    }
  });
};
