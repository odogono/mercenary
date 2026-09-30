/// The TIMED DETONATOR and the EXPLOSIVE it arms (#635, docs/research/damocles-endgame.md,
/// "The TIMED DETONATOR decoded").
///
/// The panel is Open table mode 3 (`$04D69C`–`$04D762`). Until an EXPLOSIVE is armed, a keypad
/// digit sets the charge `$7866` and `+` and `-` step the fuse `$786A` by 5 s, from 0 to 595 s.
/// `*` (`$04D6F4`) arms the EXPLOSIVE at the head of the Carried Stack, with the deadline `$7868`
/// = the Impact Clock's second + the fuse. Once one is armed, only `*` acts: on that EXPLOSIVE
/// it disarms it, and on any other head it presents system string 13, as it does on a head that
/// is not an EXPLOSIVE. Every second `$05221A` → `$04DACC` writes the seconds left to `$786A`.
/// At 0 it disarms, and sets `$7834` to −1 so that the next main-loop pass runs the blast.

export interface TimedDetonator {
  /// `$7A54`, whether an EXPLOSIVE is armed and its fuse is running.
  readonly armed: boolean;
  /// `$7866`, the charge digit 0 to 9.
  readonly charge: number;
  /// `$7868`, the Impact Clock second the armed EXPLOSIVE goes off at.
  readonly deadline: number;
  /// `$786A`, the fuse in seconds up to `FUSE_MAXIMUM`, and while armed the seconds left.
  readonly fuse: number;
  /// `$7A5A`, whether the blast tests a resident inside a structure by its cell rather than by
  /// distance. `$05A928` sets it when the armed EXPLOSIVE is dropped, or goes off carried.
  readonly regionBlast: boolean;
  /// `$7A5C`, the EXPLOSIVE last armed, which the blast reads; null until one is.
  readonly slot: number | null;
}

/// The reset's: charge 0, fuse 0 and nothing armed.
export const initialTimedDetonator = (): TimedDetonator => ({
  armed: false,
  charge: 0,
  deadline: 0,
  fuse: 0,
  regionBlast: false,
  slot: null
});

/// The EXPLOSIVEs, slots 75–83 (`$4B`–`$53`).
export const EXPLOSIVE_FIRST_SLOT = 75;
export const EXPLOSIVE_LAST_SLOT = 83;

export const isExplosiveSlot = (slot: number | null): slot is number =>
  slot !== null && slot >= EXPLOSIVE_FIRST_SLOT && slot <= EXPLOSIVE_LAST_SLOT;

/// `$04D6C8`/`$04D6E2`: `+` and `-` step the fuse by 5 s and clamp it to 0 and 595 s.
export const FUSE_STEP = 5;
export const FUSE_MAXIMUM = 595;

export const stepFuse = (fuse: number, key: '+' | '-'): number =>
  Math.max(
    0,
    Math.min(FUSE_MAXIMUM, fuse + (key === '+' ? FUSE_STEP : -FUSE_STEP))
  );

/// `$04CA24`: the blast's reach is `$40` << the charge digit, `$8000` at 9.
export const blastRadius = (charge: number): number => 0x40 << charge;

/// `$04CA90`: a blast that catches the NOVAGEN SAFE at this charge or less sets the safe gate
/// `$7A60` instead of clearing the safe.
export const SAFE_GATE_CHARGE = 3;

/// `$05A928`: the region test `$7A5A` needs a charge of at least 4. With the player on foot
/// in a structure's region (`region`, the byte a Drop writes to Association B), that is all it
/// needs. Otherwise the player must stand within `$10` << the charge of the bound Building
/// detail's extent rectangle, `gap` being the larger of the X and Z word gaps (0 inside it, or
/// with no extent).
export const regionBlastFor = (
  charge: number,
  region: number,
  gap: number
): boolean => charge >= 4 && (region !== 0 || gap < 0x10 << charge);

/// `$0541BA`: within reach on every axis. Each 32-bit difference and the reach are shifted up
/// four bits before the unsigned comparison, so a difference past 2^27 wraps, as on the ST.
export const withinReach = (
  delta: { readonly x: number; readonly y: number; readonly z: number },
  radius: number
): boolean => {
  const reach = (radius << 4) >>> 0;
  return [delta.x, delta.y, delta.z].every(
    value => Math.abs(value << 4) >>> 0 <= reach
  );
};

/// `$04DAFC`: a fuse drawn as `M.SS`, the minute digit and the two-digit second pair.
export const fuseText = (fuse: number): string =>
  `${Math.floor(fuse / 60)}.${String(fuse % 60).padStart(2, '0')}`;
