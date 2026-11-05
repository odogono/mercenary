import { skyPassTriangles, type SkyPass } from '../enhanced/sky.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import type { RGB8 } from '../scene/index.ts';
import type { SkyPose } from './frame.ts';
import { skyGradientAt, type SkyDisc, type SkyState } from './index.ts';

/// Targ's sky as the `SkyPass` every Title fills (#969), which the shared Enhanced planner's
/// sky pass draws (#956): the twilight gradient as the pass's dome, the stars by direction, and
/// the sun and moons as Orbs, the moons phased toward the sun. `skyPassTriangles` turns it into
/// triangles in Targ's view, as it does every Title's sky.

const hex = (colour: RGB8): string =>
  `#${[colour.red, colour.green, colour.blue]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`;

export interface TargSkyPass {
  /// The colour the sky fills from: the night or day sky.
  readonly clear: RGB8;
  /// The sky's colour at the horizon: the twilight gradient's foot, or the fill.
  readonly horizon: RGB8;
  readonly pass: SkyPass;
}

/// The sky of one moment, `state`. `pixelsPerTangent` is the view's output pixels a unit
/// tangent spans, the pass's projection scale.
export const targSkyPass = (
  state: SkyState,
  pixelsPerTangent: number
): TargSkyPass => {
  const gradient = skyGradientAt(state.solarAltitudeDegrees);
  const horizon = gradient?.horizon ?? state.clear;
  const orb = (id: string, body: SkyDisc, phased: boolean) => ({
    angularRadius: body.angularDiameterRadians / 2,
    ...(body.darkColour === undefined ? {} : { dark: hex(body.darkColour) }),
    direction: body.direction,
    id,
    kind: 'orb' as const,
    lit: hex(body.litColour),
    phaseCosine: body.phaseCosine,
    // By day the sky in front of a moon washes it toward the sky behind; by night none does.
    ...(phased
      ? { skyWash: 1 - state.starVisibility, sun: state.sun.direction }
      : {})
  });
  const star = hex(state.starColour);
  return {
    clear: state.clear,
    horizon,
    pass: {
      // The sun, then the outer moon, then the inner, which covers both.
      bodies: [
        orb('sun', state.sun, false),
        orb('outerMoon', state.moons[1], true),
        orb('innerMoon', state.moons[0], true)
      ],
      dome: {
        horizon: hex(horizon),
        zenith: hex(gradient?.zenith ?? state.clear)
      },
      // Targ's sky has no row of the ST's to measure a disc by, and no horizon cut.
      halfWidthDivisor: 0,
      horizonCut: false,
      projectionScale: pixelsPerTangent,
      starPoints:
        state.starVisibility > 0
          ? state.stars.map(({ alpha, direction }) => ({
              alpha: alpha * state.starVisibility,
              colour: star,
              direction
            }))
          : [],
      stars: []
    }
  };
};

export interface TargSkyView {
  readonly clear: RGB8;
  readonly horizon: RGB8;
  /// The pass's triangles in Targ's view space, at `depth`, in the plan's ten-float vertices.
  readonly vertices: Float32Array;
}

/// The sky of one moment, `state`, as Targ's view sees it from `pose`, at `depth` in view
/// space. `pixel` is one output pixel as a tangent of the view.
export const targSkyView = (
  state: SkyState,
  pose: SkyPose,
  depth: number,
  pixel: number
): TargSkyView => {
  const camera = new Camera({
    heading: pose.heading,
    mirrored: pose.mirrored,
    pitch: pose.pitch,
    position: { x: 0, y: 0, z: 0 },
    roll: pose.roll
  });
  const { clear, horizon, pass } = targSkyPass(state, 1 / pixel);
  const direction = (value: Vector3): Vector3 => camera.viewDirection(value);
  return {
    clear,
    horizon,
    vertices: skyPassTriangles(pass, {
      depth,
      direction,
      horizonRow: -Infinity,
      offset: direction,
      pixel
    }).vertices
  };
};
