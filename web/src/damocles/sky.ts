import type { BodySky } from '../catalogue/data.ts';
import type { GammaSystemDocument } from '../flyover/documents.ts';
import type { Vector3 } from '../orientation/index.ts';
import { skyAngles } from './terminator.ts';

/// The other Bodies of a cluster in a Body's sky (#530), to the closed form #528 recovered
/// (docs/research/damocles-sky-bodies.md).
///
/// The sky's eye is the current Body's own centre, `eyeHeight` up, so where the player stands
/// enters only through the sky angles: the longitude `$042C6C`, which carries the Body's turn,
/// and the latitude `$042C70`. `$04529C` rotates each listed Body's offset from the eye by
/// `R(lon, lat)` into the Body's surface frame, and the eye's view matrix `V` then takes it to
/// the screen as it does the ground. This module stops at the surface frame: the frame plan
/// hands the offset to the same Camera that draws the structures, so a Body keeps its place
/// among them however the port's view is shaped.
///
/// DAMOCLES is not drawn. `$04FBF2` draws it through a comet path of its own, two triangles
/// towards a tail tip, and its position is the impact clock's rather than the capture-time
/// sample `system.json` publishes (#538).

/// The 1024-step sine table at `$064000`: entry `a` is `sin((a + ½) · 2π / 1024)`, and the
/// cosine is the entry a quarter turn on.
const sine = (angle: number): number =>
  Math.sin(
    ((((angle % 0x4_00) + 0x4_00) % 0x4_00) + 0.5) * ((2 * Math.PI) / 0x4_00)
  );
const cosine = (angle: number): number => sine(angle + 0x1_00);

/// `R(lon, lat)`, row-major: the System frame about the Body's centre turned into the surface
/// frame the eye's view matrix reads, x east, y up and z north (`$04529C` via `$042D18`).
export const celestialRotation = (
  longitude: number,
  latitude: number
): readonly (readonly [number, number, number])[] => {
  const sl = sine(longitude);
  const cl = cosine(longitude);
  const sp = sine(latitude);
  const cp = cosine(latitude);
  return [
    [cl, 0, -sl],
    [-sl * sp, cp, -cl * sp],
    [sl * cp, sp, cl * cp]
  ];
};

/// One listed Body as the sky pass sees it this frame.
export interface SkyBody {
  /// The lit side's colour: the low word of `$0060C0 + sel`, as `system.json` expands it.
  readonly colour: string;
  /// Which colour the first span takes. `$0459CE` swaps the pair when the XZ cross product at
  /// the Body is non-negative.
  readonly first: 'lit' | 'shadow';
  readonly id: string;
  /// The Body's centre less the eye, in the current Body's surface frame.
  readonly offset: Vector3;
  /// The unlit side's colour: the sky by day on a Body with an atmosphere, `$000` otherwise.
  readonly shadow: string;
  /// `$006040`'s decode: the disc's pixel radius is `size / depth`.
  readonly size: number;
  /// Where the terminator crosses each row, as a fraction of the row's half-width from the
  /// centre: the first span, `[−w, split·w)`, is drawn in `first`, the rest in the other colour.
  /// DIALIS's is 1, a full disc.
  readonly split: number;
}

/// `C = round(2^15 cos φ)`, saturated to a signed word (`$04FEB4`).
const phaseWord = (cosPhase: number): number =>
  Math.max(-0x80_00, Math.min(0x7f_ff, Math.floor(cosPhase * 0x80_00 + 0.5)));

/// `$04FD44`: the phase at the Body between the eye and DIALIS, in the System XZ plane only.
const phaseOf = (
  body: Vector3,
  eye: Vector3
): { readonly first: 'lit' | 'shadow'; readonly split: number } => {
  const vx = eye.x - body.x;
  const vz = eye.z - body.z;
  const ux = -body.x;
  const uz = -body.z;
  const lengths = Math.hypot(vx, vz) * Math.hypot(ux, uz);
  const word = phaseWord((vx * ux + vz * uz) / lengths);
  const cross = (vx * uz - vz * ux) / lengths;
  // `$04FF4A` complements the word (NOT, `−C − 1`) where the colours swap.
  return cross < 0
    ? { first: 'lit', split: word / 0x80_00 }
    : { first: 'shadow', split: ~word / 0x80_00 };
};

export interface SkyInputs {
  /// The Catalogue id of the Body stood on, `body-<sourceIndex>`.
  readonly body: string;
  /// The terminator's answer (`$7A4E`).
  readonly daylight: boolean;
  /// The player's position on the Body, whose Body Coordinate steps the sky angles start from.
  readonly position: Vector3;
  readonly sky: BodySky | null;
  /// The Body's rotation accumulator (`$62EA + 4 * body`).
  readonly turn: number;
}

/// One frame's sky pass: its Bodies, and the two static facts the frame measures them by.
export interface SkyPass {
  /// Every Body the current Body's draw list names, in the list's order, which is the order the
  /// engine draws them in with no depth sort. DAMOCLES is left out (see above).
  readonly bodies: readonly SkyBody[];
  /// `$045A0C`: a disc narrower than this many pixels at its widest row has no row at all.
  readonly halfWidthDivisor: number;
  /// `$7964`: the projection scale a disc's `size / depth` pixel radius is measured against.
  readonly projectionScale: number;
}

export const skyPass = (
  system: GammaSystemDocument,
  inputs: SkyInputs
): SkyPass => ({
  bodies: skyBodies(system, inputs),
  halfWidthDivisor: system.sky.halfWidthDivisor,
  projectionScale: system.sky.projectionScale
});

const skyBodies = (
  system: GammaSystemDocument,
  inputs: SkyInputs
): readonly SkyBody[] => {
  const here = system.bodies.find(
    body => `body-${body.sourceIndex}` === inputs.body
  );
  if (here === undefined) {
    return [];
  }
  const { latitude, longitude } = skyAngles(inputs.turn, inputs.position);
  const rotation = celestialRotation(longitude, latitude);
  const eye = {
    x: here.position.x,
    y: here.position.y + system.sky.eyeHeight,
    z: here.position.z
  };
  // `$050562` puts the sky colour in the shadow slot by day where `$794D` is non-zero, which
  // it is exactly where the Body's day and night sky words differ: on the Bodies with an
  // atmosphere. Otherwise the slot is `$000`.
  const shadow =
    inputs.daylight &&
    inputs.sky !== null &&
    inputs.sky.day.colour !== inputs.sky.night.colour
      ? inputs.sky.day.colour
      : '#000000';
  const result: SkyBody[] = [];
  for (const id of here.drawList) {
    const body = system.bodies.find(item => item.id === id);
    if (body === undefined || body.positionKind === 'capture-time-sample') {
      continue;
    }
    const x = body.position.x - eye.x;
    const y = body.position.y - eye.y;
    const z = body.position.z - eye.z;
    const [east, up, north] = rotation.map(
      row => row[0] * x + row[1] * y + row[2] * z
    ) as [number, number, number];
    // `$04FBAE` skips the phase for DIALIS and leaves `C = $7FFF` with no swap, so the split
    // lands at the rim and the whole disc is its own colour.
    const phase =
      body.sourceIndex === 0
        ? { first: 'lit' as const, split: 0x7f_ff / 0x80_00 }
        : phaseOf(body.position, eye);
    result.push({
      colour: body.baseColour,
      first: phase.first,
      id: body.id,
      offset: { x: east, y: up, z: north },
      shadow,
      size: body.size,
      split: phase.split
    });
  }
  return result;
};
