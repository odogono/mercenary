import { pow } from '../math/index.ts';
import type { Block, FlightDocument } from '../payload/documents.ts';

/// The craft dynamics as the Reference Build's shared control loop runs them.
///
/// This is the craft Mover. Its two first-order filters are not the same filter twice: yaw damps
/// and then takes its input, while speed takes its input and then damps. Both are solved for an
/// arbitrary timestep rather than iterated per frame, so the dynamics match the original at its
/// own rate and stay smooth at any other — see `settle`. The fixed-step on-foot Mover lives in
/// `gameCore` and never reaches a Craft Parameter Block (ADR 0016).
///
/// The decoded parameters themselves live in `payload/documents`, because they are a document
/// the loader reads rather than anything this module computes.

/// Whether the player is on foot or airborne.
///
/// The Reference Build keeps this in one byte and switches it by crossing an altitude band rather
/// than by any input, which is why take-off and landing are modes here and not actions. The two
/// spellings are the ones a Golden Trace writes, so a replay compares them directly rather than
/// through a table that could disagree with either side.
export type FlightMode = 'flying' | 'grounded';

/// How a touchdown ended, for the caller to report once. Absence is "no touchdown this step".
///
/// Spelled as the trace spells it, for the same reason as `FlightMode`.
export type Touchdown = 'crashed' | 'landed';

/// The block for a boarded craft slot, or walking when nothing is boarded.
///
/// A slot the document has no block for is a refusal rather than a reading past the end: the kit
/// subscripts its own array here, which traps, and quietly flying on a block that is not there
/// is the one outcome neither side should produce.
export const blockFor = (
  document: FlightDocument,
  craft: number | undefined
): Block => {
  const index = craft ?? document.rules.walkingBlock;
  const block = document.blocks[index];
  if (block === undefined) {
    throw new Error(
      `the flight document carries no Craft Parameter Block ${index}`
    );
  }
  return block;
};

/// Advance a first-order filter to where it would be after `frames` of the original's own
/// recurrence, exactly rather than by iterating it.
///
/// The recurrence approaches its fixed point by a constant factor per frame, so raising that
/// factor to a fractional number of frames lands on the same curve between frames instead of
/// stepping along it. This is the heaviest consumer of `pow` in the port, which is why the math
/// seam it goes through is load-bearing rather than theoretical (ADR 0022).
export const settle = (
  value: number,
  target: number,
  damping: number,
  frames: number
): number => {
  // `!(damping > 0)` rather than `damping <= 0`, because that is what the guard this comes from
  // does: a damping that is not a number at all takes this branch instead of reaching `pow` and
  // turning an absent parameter into a state of NaNs.
  if (!(damping > 0)) {
    return frames >= 1 ? target : value;
  }
  const decay = pow(damping, frames);
  return target + (value - target) * decay;
};

/// Where yaw velocity settles while an input is held: `velocity * damping + authority`.
export const yawFixedPoint = (authority: number, damping: number): number =>
  damping < 1 ? authority / (1 - damping) : authority;

/// Where speed settles for a throttle: `(velocity + throttle * gain) * damping`.
export const speedFixedPoint = (
  throttle: number,
  gain: number,
  damping: number
): number =>
  damping < 1 ? (throttle * gain * damping) / (1 - damping) : throttle * gain;
