import type { CarriedResident, CarryPlace, DionPawn } from './carry.ts';
import type { DionHead } from './head.ts';

/// `$56286` reloads BARGAIN TRADERS' offered resident; `$4E61E` prices the
/// head while its counter is empty. The cash transfers live in Take/Drop.
export const repricePawn = (
  current: DionPawn,
  residents: readonly CarriedResident[],
  head: number,
  prices: DionHead['pawn'],
  place: CarryPlace,
  reload: boolean
): DionPawn => {
  if (place.structure !== 0x52) {
    return current;
  }
  const price = (slot: number, multiplier: number) => {
    const resident = residents.find(r => r.slot === slot);
    // Unbound geometry retains the opening model's price identity. The two
    // script model swaps use BIL'S CHAIR and NULL respectively.
    const entry =
      slot === 97 && resident?.model === 316
        ? 316
        : slot === 218 && resident?.model === null
          ? 0
          : slot;
    const base = prices.prices.get(entry);
    if (base === undefined) {
      throw new Error(`pawn: model ${entry} has no price header`);
    }
    return String(
      (BigInt(base) * BigInt(multiplier)) % 1_000_000_000_000n
    ).padStart(12, '0');
  };
  let pawn = current;
  if (reload) {
    // The original scans downward, matching group/cell/association, independently
    // of Floor or the held bit. The highest matching resident wins.
    const slot = residents.reduce(
      (highest, r) =>
        r.group === place.group && r.cell === place.cell && r.association === 9
          ? Math.max(highest, r.slot)
          : highest,
      0
    );
    pawn = { previous: slot, price: price(slot, prices.buyMultiplier), slot };
  }
  if (pawn.slot === 0 && place.interior?.region === 9) {
    pawn = {
      ...pawn,
      price: price(
        head,
        head === pawn.previous ? prices.buyMultiplier : prices.sellMultiplier
      )
    };
  }
  return pawn;
};
