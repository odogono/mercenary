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
///
/// #649 ran it live and decoded what a blast leaves behind (#650): the structure damage table
/// `$636A`, the flash by charge, and the EXPLOSIVE-ARMED! model.

/// `$7A56`/`$7A58`, the keyed door `$05A928`'s tail found the player inside at the Drop: its
/// attachment slot, its key's object slot, and the Floor it was found on.
export interface BlastDoor {
  readonly key: number;
  readonly level: number;
  readonly slot: number;
}

export interface TimedDetonator {
  /// `$7A54`, whether an EXPLOSIVE is armed and its fuse is running.
  readonly armed: boolean;
  /// `$7866`, the charge digit 0 to 9.
  readonly charge: number;
  /// `$7868`, the Impact Clock second the armed EXPLOSIVE goes off at.
  readonly deadline: number;
  /// `$7A56`/`$7A58`, the keyed door the player stood in when `$05A928` last ran, or null.
  readonly door: BlastDoor | null;
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
  door: null,
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

/// `$04CBEC` reads the flash word by charge with an 8-bit displacement that truncates −`$A2`
/// to `$5E`, so the ST reads the code words at `$04CC4C` rather than the table at `$04CB4C`
/// that the code means. Charge 4 gave `$FFFA` live (#649).
export const BLAST_FLASH_WORDS: readonly number[] = [
  0x70_08, 0x5c_48, 0x4a_10, 0x57_c8, 0xff_fa, 0x4a_78, 0x7a_5a, 0x6b_1a,
  0x30_38, 0x7a_56
];

/// `$04C9A0`: the marker's flash word, for every Body it destroys.
export const MARKER_FLASH_WORD = 0xca_00;

/// Models 256 and 257 (`$4BD10` + `$400` and + `$404`): arming copies the second into the
/// EXPLOSIVE's entry and disarming copies back the first. The name is the model's, so the
/// carried EXPLOSIVE reads EXPLOSIVE-ARMED! while armed.
export const EXPLOSIVE_MODEL = 'object-038956';
export const ARMED_EXPLOSIVE_MODEL = 'object-0389ca';

/// `$058E60`, after a Load: slots 75 to 82 go back to model 256. The loop ends at `$14C`, so
/// slot 83 keeps the model it had.
export const MODEL_RESET_LAST_SLOT = 82;

/// One six-byte entry of the structure damage table at `$636A`, as `$04CC48` writes it: the
/// blast centre's structure group and cell bytes, the word, the Floor and the door slot byte.
/// A word of 0 removes the structure the cell's workspace long names; a negative word,
/// `$8000` | the key's slot, is a door that loses its key.
export interface StructureDamage {
  readonly cell: number;
  readonly door: number;
  readonly group: number;
  readonly level: number;
  readonly word: number;
}

/// `$636A`: nine entries. With all nine used, `$04CC48` overwrites the ninth.
export const STRUCTURE_DAMAGE_ENTRIES = 9;

/// `$04CC34`: the charge from which a blast can damage a structure.
export const STRUCTURE_DAMAGE_CHARGE = 3;

/// `$04CC34`–`$04CC88`: the entry a blast writes, or null. It needs a charge of 3 or more and
/// non-zero group and cell bytes. With `$7A5A` set the structure in the cell goes. With it
/// clear, a door the player stood in at the Drop loses its key. Otherwise nothing is written.
export const structureDamageFor = (
  charge: number,
  group: number,
  cell: number,
  detonator: Pick<TimedDetonator, 'door' | 'regionBlast'>
): StructureDamage | null => {
  if (charge < STRUCTURE_DAMAGE_CHARGE || group === 0 || cell === 0) {
    return null;
  }
  if (detonator.regionBlast) {
    return { cell, door: 0, group, level: 0, word: 0 };
  }
  const door = detonator.door;
  return door === null
    ? null
    : {
        cell,
        door: door.slot & 0xff,
        group,
        level: door.level,
        word: 0x80_00 | (door.key & 0xff)
      };
};

/// `$04CC48`: the table with `entry` in its first free place, or over the ninth when full.
export const withStructureDamage = (
  table: readonly StructureDamage[],
  entry: StructureDamage
): readonly StructureDamage[] =>
  table.length < STRUCTURE_DAMAGE_ENTRIES
    ? [...table, entry]
    : [...table.slice(0, STRUCTURE_DAMAGE_ENTRIES - 1), entry];

/// `$04ED4A`, on every workspace load of `group`: whether an entry clears the cell's
/// structure. The loader skips a negative word, which is a door entry.
export const structureRemoved = (
  table: readonly StructureDamage[],
  group: number,
  cell: number
): boolean =>
  table.some(
    entry => entry.word === 0 && entry.group === group && entry.cell === cell
  );

/// `$059E9E`: whether a door entry takes the key from the attachment `slot` on `level` of a
/// structure in `group`. The builder's cell compare at `$059F7A` is dead, because `$059F7E`
/// retests the flags, so every structure of the group with that door slot on that Floor opens.
export const doorUnkeyed = (
  table: readonly StructureDamage[],
  group: number,
  level: number,
  slot: number
): boolean =>
  table.some(
    entry =>
      (entry.word & 0x80_00) !== 0 &&
      entry.group === group &&
      entry.level === level &&
      entry.door === (slot & 0xff)
  );
