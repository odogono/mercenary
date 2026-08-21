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
