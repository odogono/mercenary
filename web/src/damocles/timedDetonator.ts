/// The TIMED DETONATOR and the EXPLOSIVE it arms (#635, docs/research/damocles-endgame.md,
/// answer 5, and docs/research/damocles-sound-programmes.md).
///
/// The panel is Open table mode 3 (`$04D69C`–`$04D762`). A keypad digit sets the charge `$7866`,
/// `+` and `-` step the fuse `$786A` by 5 s up to 595 s, and `*` (`$04D6F4`) arms the EXPLOSIVE
/// at the head of the Carried Stack, deadline `$7868` = the Impact Clock + the fuse, or presents
/// system string 13 when the head is not one. `$05221A` → `$04DACC` sets it off once the deadline
/// less the Impact Clock is 0 or less.

export interface TimedDetonator {
  /// `$7866`, the charge digit 0 to 9.
  readonly charge: number;
  /// `$7868`, the armed EXPLOSIVE's deadline in Impact Clock seconds, or null while none is armed.
  readonly deadline: number | null;
  /// `$786A`, the fuse in seconds, a multiple of `FUSE_STEP` up to `FUSE_MAXIMUM`.
  readonly fuse: number;
  /// `$7A54`, the armed EXPLOSIVE's slot, or null while none is armed.
  readonly slot: number | null;
}

/// The reset's: charge 0, fuse 0 and nothing armed.
export const initialTimedDetonator = (): TimedDetonator => ({
  charge: 0,
  deadline: null,
  fuse: 0,
  slot: null
});

/// The EXPLOSIVEs, slots 75–83 (`$4B`–`$53`).
export const EXPLOSIVE_FIRST_SLOT = 75;
export const EXPLOSIVE_LAST_SLOT = 83;

export const isExplosiveSlot = (slot: number | null): slot is number =>
  slot !== null && slot >= EXPLOSIVE_FIRST_SLOT && slot <= EXPLOSIVE_LAST_SLOT;

/// `$04D69C`: `+` and `-` step the fuse by 5 s and clamp it to 0 and 595 s.
export const FUSE_STEP = 5;
export const FUSE_MAXIMUM = 595;

export const stepFuse = (fuse: number, key: '+' | '-'): number =>
  Math.max(
    0,
    Math.min(FUSE_MAXIMUM, fuse + (key === '+' ? FUSE_STEP : -FUSE_STEP))
  );

/// `$04CBDA`: the blast's reach is `$40` << the charge digit, `$8000` at 9.
export const blastRadius = (charge: number): number => 0x40 << charge;

/// `$04CBDA`: a blast that catches the NOVAGEN SAFE at this charge or less sets the safe gate
/// `$7A60` instead of clearing the safe.
export const SAFE_GATE_CHARGE = 3;

/// `$04DAFC`: a fuse drawn as `M.SS`, the minute digit and the two-digit second pair.
export const fuseText = (fuse: number): string =>
  `${Math.floor(fuse / 60)}.${String(fuse % 60).padStart(2, '0')}`;
