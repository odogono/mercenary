import type { Vector3 } from '../orientation/index.ts';
import { bodySteps, continuousBodySteps } from './panel.ts';

/// The Damocles day/night terminator, `$050562` (#494, #497).
///
/// Every VBL the handler at `$051E4E` adds each Body's rotation rate to its accumulator at
/// `$62EA + 4 * body`. Each frame the surface pass adds the accumulator's high word to the
/// observer's longitude step (`$059384`), masked to ten bits, so one turn of the Body is
/// `$04000000` while the longword itself wraps at 2^32. The terminator
/// compares that System-frame longitude with the Body's sub-stellar longitude `$79BE`. The
/// answer sets `$7A4E`, fills the sky from the Body's day or night word (`$7C86`), and binds
/// the scene palette's day half (`$7A14`) or its base (`$7A12`) in `$7A10`, through which every
/// `$80xx` colour word is read. It runs before the enclosed-region branch, so it holds indoors
/// too. docs/research/damocles-day-night-terminator.md.

const LONGWORD = 2 ** 32;

/// The accumulator after `vbls` more VBLs at `rate` a VBL, wrapping as the longword does.
export const advanceTurn = (turn: number, rate: number, vbls: number): number =>
  (turn + ((rate * vbls) % LONGWORD)) % LONGWORD;

/// The sky angles `$042C6C` and `$042C70`: the System-frame longitude, which is the
/// observer's longitude step turned by the accumulator's high word (`$059384`), and the biased
/// latitude step. The terminator and the sky Bodies (#530) both read them, so sunrise and the
/// Bodies' places come from the one accumulator.
export const skyAngles = (
  turn: number,
  position: Vector3
): { readonly latitude: number; readonly longitude: number } => {
  const steps = bodySteps(position);
  return {
    latitude: steps.z,
    longitude: (steps.x + Math.floor(turn / 0x1_00_00)) & 0x3_ff
  };
};

/// The sky angles without the engine's truncation: the whole accumulator over `$10000`, and the
/// player's position between Body Coordinate steps. They agree with `skyAngles` wherever the
/// accumulator's low word and the step fractions are zero, and between those points they move
/// on where the engine holds. Enhanced presentation only.
export const continuousSkyAngles = (
  turn: number,
  position: Vector3
): { readonly latitude: number; readonly longitude: number } => {
  const steps = continuousBodySteps(position);
  return {
    latitude: steps.z,
    longitude: (steps.x + turn / 0x1_00_00) % 0x4_00
  };
};

/// Whether the terminator puts the observer at `position` in daylight: where the System
/// longitude is a quarter turn or more from the sub-stellar longitude, bit 9 of the biased
/// latitude step inverting the answer (`$050562`-`$05057E`).
export const inDaylight = (
  subStellarLongitude: number,
  turn: number,
  position: Vector3
): boolean => {
  const { latitude, longitude } = skyAngles(turn, position);
  return (
    ((((subStellarLongitude - longitude + 0x1_00) & 0x2_00) + latitude) &
      0x2_00) !==
    0
  );
};
