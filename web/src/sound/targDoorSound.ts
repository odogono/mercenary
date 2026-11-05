import type { DoorwayWipeDirection } from '../session/doorwayTransition.ts';

/// The door sound Targ's Atari ST wipes play during a Doorway Transition (#978, ADR 0091).
///
/// Recovered from the ST release (docs/research/targ-st-doorway-wipe.md#the-door-sound) and
/// confirmed by Hatari's `psg_write` trace on real crossings. Each wipe writes the YM2149 inline
/// at three points: as it starts, between its sweep and its hold, and as it ends. Tones B and C
/// play at fixed volume 12 with every noise gate shut; no envelope. Channel A stays at volume 0.
///
/// The ST restores its own mixer shadow (`$624EA`) at the end. Targ's browser YM2149 carries
/// nothing else, so the end returns the mixer to all-off instead.

/// One phase: the writes in the ST's order, and the VBL of the wipe they land on.
export interface DoorSoundPhase {
  readonly vbl: number;
  readonly writes: readonly (readonly [register: number, value: number])[];
}

/// The browser YM2149's idle mixer: every tone and noise gate off.
export const DOOR_SOUND_IDLE_MIXER = 0xff;

export const TARG_DOOR_SOUND: Readonly<
  Record<DoorwayWipeDirection, readonly DoorSoundPhase[]>
> = {
  // `$41AEE`: C = $890, B = $980; the 33-VBL sweep; `$41BC2`: B = $780, C = $680;
  // the 21-VBL hold; `$41C1C`: off.
  up: [
    {
      vbl: 0,
      writes: [
        [4, 0x90],
        [5, 0x08],
        [2, 0x80],
        [3, 0x09],
        [10, 12],
        [9, 12],
        [7, 0xf8]
      ]
    },
    {
      vbl: 33,
      writes: [
        [2, 0x80],
        [3, 0x07],
        [4, 0x80],
        [5, 0x06]
      ]
    },
    {
      vbl: 54,
      writes: [
        [9, 0],
        [10, 0],
        [7, DOOR_SOUND_IDLE_MIXER]
      ]
    }
  ],
  // `$41C64`: the same chord; the 25-VBL hold; `$41D0E`: C = $780, B = $680;
  // the 33-VBL sweep; `$41DCE`: off.
  down: [
    {
      vbl: 0,
      writes: [
        [4, 0x90],
        [5, 0x08],
        [2, 0x80],
        [3, 0x09],
        [9, 12],
        [10, 0],
        [10, 12],
        [7, 0xf8]
      ]
    },
    {
      vbl: 25,
      writes: [
        [4, 0x80],
        [5, 0x07],
        [2, 0x80],
        [3, 0x06]
      ]
    },
    {
      vbl: 58,
      writes: [
        [10, 0],
        [9, 0],
        [7, DOOR_SOUND_IDLE_MIXER]
      ]
    }
  ]
};

/// The phases due after `from` VBLs and up to `to` VBLs into the wipe.
export const doorSoundPhasesBetween = (
  direction: DoorwayWipeDirection,
  from: number,
  to: number
): readonly DoorSoundPhase[] =>
  TARG_DOOR_SOUND[direction].filter(
    phase => phase.vbl > from && phase.vbl <= to
  );
