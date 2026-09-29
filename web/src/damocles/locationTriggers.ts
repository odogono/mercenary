import type { LocationEntry } from '../catalogue/data.ts';

/// Bit 14 of a region's flags, which `$05A722` tests as bit 6 of the byte `$7B34`. Every
/// captured region with it set is outdoors (`$C000`, `$D000`), so a region byte of 0 in the
/// table means any indoor region, door strips included.
const OUTDOOR_REGION = 0x40_00;

/// Where the eye stands as the walk reads it.
export interface LocationWhere {
  /// `$7B5C`: the workspace cell, `x + 16 * z`.
  readonly cell: number;
  /// `$7AA4`: the Floor.
  readonly floor: number;
  /// `$7AFC`: the 1-based index of the region just selected.
  readonly region: number;
  /// `$7B34`: that region's flags word.
  readonly regionFlags: number;
}

/// `$05A6EC`-`$05A72C`, the region walk that follows every reselection `$05A32C`: the trigger of
/// the first entry that matches, or null where the table ends first. The walk compares low
/// bytes: the cell with `$7B5C`'s, the region with `$7AFD` and the Floor with `$7AA5`
/// (docs/research/damocles-location-triggers.md).
///
/// The cell-entry walk `$054C94`, which takes the region-`$FF` entries on a cell change, is not
/// run: no group's table has one.
export const locationTrigger = (
  table: readonly LocationEntry[],
  where: LocationWhere
): number | null => {
  for (const entry of table) {
    // A zero cell byte ends the table. The Catalogue carries none, but a walk stops at one.
    if (entry.cell === 0) {
      return null;
    }
    if (entry.cell !== (where.cell & 0xff)) {
      continue;
    }
    if (entry.region === 0) {
      if ((where.regionFlags & OUTDOOR_REGION) !== 0) {
        continue;
      }
    } else if (entry.region !== (where.region & 0xff)) {
      continue;
    }
    if (entry.floor >= 0 && entry.floor !== (where.floor & 0xff)) {
      continue;
    }
    return entry.trigger;
  }
  return null;
};
