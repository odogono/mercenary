import { footAxes, type Intent } from '../gameCore/index.ts';
import type { Pose } from './world.ts';

/// The on-foot Mover for Eris.
///
/// A fixed step and a fixed turn, as the Reference Build's on-foot mover is (ADR 0016) and as
/// Damocles's appears to be: the one observation is a constant advance under a held stick. The
/// rates come from the authored document, not from Targ's decoded numbers, because they are
/// Damocles's to recover (#205). There is no vertical term, no damping and, in this slice, no
/// collision: the eye stays at its current elevation, including recovered upper floors.
export interface WalkRules {
  readonly eyeHeight: number;
  readonly runMultiplier: number;
  readonly runTurnMultiplier: number;
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
/// The heading is a bearing clockwise from north, as the recovered yaw word counts (#204):
/// `intent.turn` is positive to the right, so it is added. Forward at north is +z and at
/// east is +x, which is how the camera position words move under a held stick.
///
/// Damocles's recovered `R` mode lengthens both increments (#205): the forward update rises
/// from 48 to 80 units and the initial north-facing turn from 16 to 24 yaw units. The
/// seconds-based rates remain derived averages because the Working Authority applies those
/// quantized updates on its render/game loop rather than on every VBL.
export const walk = (
  pose: Pose,
  intent: Intent,
  seconds: number,
  rules: WalkRules
): Pose => {
  const turnMultiplier = intent.running ? rules.runTurnMultiplier : 1;
  const heading = wrap(
    pose.heading +
      intent.turn * rules.turnRadiansPerSecond * turnMultiplier * seconds
  );
  // Strafe, an Extension (ADR 0059), is the same step at right angles to the heading: east of
  // north is its right.
  const axes = footAxes(intent);
  const run = intent.running ? rules.runMultiplier : 1;
  const step = axes.walk * rules.unitsPerSecond * run * seconds;
  const sidestep = axes.strafe * rules.unitsPerSecond * run * seconds;
  return {
    body: pose.body,
    heading,
    // Walking never tilts the view: on foot the Working Authority leaves `$7AC0` alone. Free
    // Look is the session's to write.
    pitch: pose.pitch,
    position: {
      x:
        pose.position.x +
        Math.sin(heading) * step +
        (sidestep === 0 ? 0 : Math.cos(heading) * sidestep),
      y: pose.position.y,
      z:
        pose.position.z +
        Math.cos(heading) * step -
        (sidestep === 0 ? 0 : Math.sin(heading) * sidestep)
    }
  };
};
