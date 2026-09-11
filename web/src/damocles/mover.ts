import type { Intent } from '../gameCore/index.ts';
import type { ErisPose } from './world.ts';

/// The on-foot Mover for Eris.
///
/// A fixed step and a fixed turn, as the Reference Build's on-foot mover is (ADR 0016) and as
/// Damocles's appears to be: the one observation is a constant advance under a held stick. The
/// rates come from the authored document, not from Targ's decoded numbers, because they are
/// Damocles's to recover (#205). There is no vertical term, no damping and, in this slice, no
/// collision: the eye stays at its recovered height over a flat authored ground.
export interface WalkRules {
  readonly eyeHeight: number;
  readonly turnRadiansPerSecond: number;
  readonly unitsPerSecond: number;
}

const TURN = 2 * Math.PI;

const wrap = (heading: number): number => {
  const wrapped = heading % TURN;
  return wrapped < 0 ? wrapped + TURN : wrapped;
};

/// One step of walking. Pure: the same pose, intent and time always give the same pose.
///
/// Heading zero faces -Z and a positive turn goes toward -X, matching the Camera's reading of
/// a heading; `intent.turn` is positive to the right, so it is subtracted. Forward is the
/// direction the Camera looks along.
export const walk = (
  pose: ErisPose,
  intent: Intent,
  seconds: number,
  rules: WalkRules
): ErisPose => {
  const heading = wrap(
    pose.heading - intent.turn * rules.turnRadiansPerSecond * seconds
  );
  const step = intent.walk * rules.unitsPerSecond * seconds;
  return {
    heading,
    position: {
      x: pose.position.x - Math.sin(heading) * step,
      y: rules.eyeHeight,
      z: pose.position.z - Math.cos(heading) * step
    }
  };
};
