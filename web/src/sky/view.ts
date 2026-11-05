import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import type { RGB8 } from '../scene/index.ts';
import { discBasis, type SkyPose } from './frame.ts';
import { skyGradientAt, type SkyDisc, type SkyState } from './index.ts';
import { normalized } from './vector.ts';

/// Targ's sky as the shared Enhanced planner's sky pass draws it (#956): flat-coloured
/// triangles in Targ's view space, at the sky's depth, in the plan's ten-float vertices. The
/// renderer paints them over the sky fill with the depth test off, as it does every Title's.
///
/// What the Targ renderer's sky shader worked out per pixel is laid out as geometry here: the
/// twilight gradient as a dome whose rings carry its colour, each star as a square two output
/// pixels across in its colour already blended over the sky behind it, and each disc as rows
/// split at its terminator, which on a sphere lit at phase cosine `c` crosses each row of
/// half-width `w` at `−c·w` from the centre on the far side from the sun. The rim and the
/// terminator are feathered over an output pixel (#968), the vertices carrying the blend the
/// shader's `fwidth` smoothsteps gave: the rim into the sky behind, the dark side into the lit.

/// The gradient reaches the zenith's colour this far above the horizon, by `smoothstep`.
const GRADIENT_TOP = (30 * Math.PI) / 180;
/// Rings between the horizon and `GRADIENT_TOP`, each a step of the smoothstep.
const GRADIENT_RINGS = 15;
const DOME_SEGMENTS = 48;
const DISC_ROWS = 32;

type Channels = readonly [number, number, number];

const channels = (colour: RGB8): Channels => [
  colour.red / 255,
  colour.green / 255,
  colour.blue / 255
];

const mix = (from: Channels, to: Channels, amount: number): Channels => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount
];

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/// `centre` moved `u` along `right` and `v` along `up`.
const across = (
  centre: Vector3,
  right: Vector3,
  up: Vector3,
  u: number,
  v: number
): Vector3 => ({
  x: centre.x + right.x * u + up.x * v,
  y: centre.y + right.y * u + up.y * v,
  z: centre.z + right.z * u + up.z * v
});

export interface TargSkyView {
  /// The colour the sky fills from: the night or day sky.
  readonly clear: RGB8;
  /// The sky's colour at the horizon: the twilight gradient's foot, or the fill.
  readonly horizon: RGB8;
  readonly vertices: Float32Array;
}

/// The sky of one moment, `state`, from `pose`, at `depth` in view space. `pixel` is one output
/// pixel as a tangent of the view.
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
  const values: number[] = [];
  const emit = (direction: Vector3, colour: Channels): void => {
    const view = camera.viewDirection(direction);
    values.push(
      view.x * depth,
      view.y * depth,
      view.z * depth,
      colour[0],
      colour[1],
      colour[2],
      0,
      0,
      1,
      -depth
    );
  };
  const triangles = (
    corners: readonly Vector3[],
    colours: readonly Channels[],
    order: readonly number[]
  ): void => {
    for (const index of order) {
      emit(corners[index]!, colours[index]!);
    }
  };

  const gradient = skyGradientAt(state.solarAltitudeDegrees);
  const horizon = gradient?.horizon ?? state.clear;
  const skyAt = (direction: Vector3): Channels =>
    gradient === undefined
      ? channels(state.clear)
      : mix(
          channels(gradient.horizon),
          channels(gradient.zenith),
          smoothstep(
            0,
            GRADIENT_TOP,
            Math.asin(Math.max(-1, Math.min(1, direction.y)))
          )
        );

  if (gradient !== undefined) {
    // From the horizon, below which the ground covers the sky, up to the zenith.
    const elevations = [
      ...Array.from(
        { length: GRADIENT_RINGS + 1 },
        (_, index) => (index / GRADIENT_RINGS) * GRADIENT_TOP
      ),
      (50 * Math.PI) / 180,
      (70 * Math.PI) / 180,
      Math.PI / 2
    ];
    const around = (elevation: number, segment: number): Vector3 => {
      const azimuth = (segment / DOME_SEGMENTS) * 2 * Math.PI;
      return {
        x: Math.cos(elevation) * Math.cos(azimuth),
        y: Math.sin(elevation),
        z: Math.cos(elevation) * Math.sin(azimuth)
      };
    };
    // A skirt from straight down to the horizon in the horizon's colour, so no sliver of the
    // fill shows between the ground's edge and the dome.
    const rings = [-Math.PI / 2, ...elevations];
    for (let ring = 0; ring + 1 < rings.length; ring += 1) {
      for (let segment = 0; segment < DOME_SEGMENTS; segment += 1) {
        const corners = [
          around(rings[ring]!, segment),
          around(rings[ring]!, segment + 1),
          around(rings[ring + 1]!, segment + 1),
          around(rings[ring + 1]!, segment)
        ];
        triangles(corners, corners.map(skyAt), [0, 1, 2, 0, 2, 3]);
      }
    }
  }

  // The stars first, so the discs cover them.
  if (state.starVisibility > 0) {
    const star = channels(state.starColour);
    for (const { alpha, direction } of state.stars) {
      const centre = normalized(direction);
      const [right, up] = discBasis(centre, undefined);
      const colour = mix(skyAt(centre), star, alpha * state.starVisibility);
      // Two output pixels across, as the Targ renderer's points were.
      const corners = [
        across(centre, right, up, -pixel, -pixel),
        across(centre, right, up, pixel, -pixel),
        across(centre, right, up, pixel, pixel),
        across(centre, right, up, -pixel, pixel)
      ];
      triangles(
        corners,
        corners.map(() => colour),
        [0, 1, 2, 0, 2, 3]
      );
    }
  }

  const disc = (body: SkyDisc, phased: boolean): void => {
    const centre = normalized(body.direction);
    const [axisX, axisY] = discBasis(
      centre,
      phased ? normalized(state.sun.direction) : undefined
    );
    const angularRadius = body.angularDiameterRadians / 2;
    const centreScale = Math.cos(angularRadius);
    const rimScale = Math.sin(angularRadius);
    const at = (u: number, v: number): Vector3 => ({
      x: centre.x * centreScale + (axisX.x * u + axisY.x * v) * rimScale,
      y: centre.y * centreScale + (axisX.y * u + axisY.y * v) * rimScale,
      z: centre.z * centreScale + (axisX.z * u + axisY.z * v) * rimScale
    });
    const lit = channels(body.litColour);
    const dark = channels(body.darkColour ?? body.litColour);
    // One output pixel in the disc's own units, its radius being 1: the width of the rim's and
    // the terminator's feather, as `fwidth` gave the Targ renderer's sky shader.
    const feather = Math.min(
      1,
      pixel / Math.tan(Math.max(angularRadius, 1e-6))
    );
    const inner = 1 - feather;
    // The lit side faces the sun along +u: a row of half-width `w` is dark from −w to −c·w and
    // lit beyond, blended across the terminator over a pixel either side.
    const phasedDark = phased && body.darkColour !== undefined;
    const colourAt = (u: number, v: number): Channels => {
      const illuminated = phasedDark
        ? smoothstep(
            -feather,
            feather,
            u + body.phaseCosine * Math.sqrt(Math.max(0, 1 - v * v))
          )
        : 1;
      const coverage = 1 - smoothstep(inner, 1, Math.hypot(u, v));
      return mix(skyAt(at(u, v)), mix(dark, lit, illuminated), coverage);
    };
    // Each row's columns: the rim, the rim's feather, and the terminator's band, in order, so
    // rows pair column by column.
    const rows = Array.from({ length: DISC_ROWS + 1 }, (_, row) => {
      const v = -Math.cos((row / DISC_ROWS) * Math.PI);
      const outer = Math.sqrt(Math.max(0, 1 - v * v));
      const within = Math.sqrt(Math.max(0, inner * inner - v * v));
      const clamp = (u: number): number => Math.max(-outer, Math.min(outer, u));
      const split = -body.phaseCosine * outer;
      const columns = (
        phasedDark
          ? [
              -outer,
              -within,
              clamp(split - feather),
              clamp(split),
              clamp(split + feather),
              within,
              outer
            ]
          : [-outer, -within, 0, within, outer]
      ).sort((a, b) => a - b);
      return columns.map(u => ({ colour: colourAt(u, v), corner: at(u, v) }));
    });
    for (let row = 0; row < DISC_ROWS; row += 1) {
      const low = rows[row]!;
      const high = rows[row + 1]!;
      for (let column = 0; column + 1 < low.length; column += 1) {
        const quad = [
          low[column]!,
          low[column + 1]!,
          high[column + 1]!,
          high[column]!
        ];
        triangles(
          quad.map(({ corner }) => corner),
          quad.map(({ colour }) => colour),
          [0, 1, 2, 0, 2, 3]
        );
      }
    }
  };
  disc(state.sun, false);
  disc(state.moons[1], true);
  disc(state.moons[0], true);

  return { clear: state.clear, horizon, vertices: new Float32Array(values) };
};
