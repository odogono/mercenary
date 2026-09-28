import type { BodySky } from '../catalogue/data.ts';
import type { GammaSystemDocument } from '../flyover/documents.ts';
import type { Vector3 } from '../orientation/index.ts';
import { cometCentre, type ImpactTime } from './comet.ts';
import { starPixels, type StarPixel, type StarView } from './stars.ts';
import { continuousSkyAngles, skyAngles } from './terminator.ts';

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
/// DAMOCLES is drawn through a comet path of its own (`$04FBF2`, #538): two white triangles
/// from its head to a tail tip, then a disc over the head. Its centre is the impact clock's
/// (`comet.ts`) rather than the capture-time sample `system.json` publishes.

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
  readonly kind: 'disc';
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

/// The comet as the sky pass sees it this frame. Every offset is from the eye, in the current
/// Body's surface frame, as a disc's is.
export interface SkyComet {
  /// The polygons `$04F8FE` draws, in order, each naming `points` by index.
  readonly faces: readonly {
    readonly colour: string;
    readonly points: readonly number[];
  }[];
  /// The disc `$04FCE6` draws over the head once the polygons are down, where the head is in
  /// front of the eye. `$042C04 = $7FFF0000` puts its split at the rim, so it is one colour:
  /// palette slot 0, which the surface pass holds at `$000`. It is under a pixel from every
  /// surface at every clock a Session reaches before the impact, so no frame has shown it.
  readonly head: {
    readonly colour: string;
    readonly size: number;
  } | null;
  readonly id: string;
  readonly kind: 'comet';
  /// The comet's centre.
  readonly offset: Vector3;
  /// The tail tip, then the head points, in the slots `$04FBF6` projects them into.
  readonly points: readonly Vector3[];
}

export type SkyItem = SkyBody | SkyComet;

/// The colours a palette slot holds in the surface pass, as far as the sky reads them.
/// `$0597E2` loads slot 8 with the sky; slot 0 is `$000`.
const PALETTE_SLOT_0 = '#000000';

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
  /// The impact clock, which places the comet.
  readonly impact: ImpactTime;
  /// The player's position on the Body, whose Body Coordinate steps the sky angles start from.
  readonly position: Vector3;
  readonly sky: BodySky | null;
  /// Enhanced presentation: move the Bodies with the whole accumulator and the exact position
  /// rather than in the engine's 1/1024-turn steps, which jump a Body 0.35° at a time.
  readonly smooth?: boolean;
  /// The view the starfield scrolls by (#578), or null for no stars.
  readonly stars?: StarView | null;
  /// The Body's rotation accumulator (`$62EA + 4 * body`).
  readonly turn: number;
}

/// One frame's sky pass: its Bodies, and the two static facts the frame measures them by.
export interface SkyPass {
  /// Every Body the current Body's draw list names, in the list's order, which is the order the
  /// engine draws them in with no depth sort. DAMOCLES is its comet, and is gone once the
  /// impact clock reaches zero.
  readonly bodies: readonly SkyItem[];
  /// `$045A0C`: a disc narrower than this many pixels at its widest row has no row at all.
  readonly halfWidthDivisor: number;
  /// `$7964`: the projection scale a disc's `size / depth` pixel radius is measured against.
  readonly projectionScale: number;
  /// The starfield's pixels, in the ST's screen pixels, in plot order (#578). The stars are
  /// drawn before the sky pass, so every Body covers them.
  readonly stars: readonly StarPixel[];
}

/// Whether the Body has an atmosphere: `$794D`, non-zero exactly where its day and night sky
/// words differ (#528).
const hasAtmosphere = (sky: BodySky | null): boolean =>
  sky !== null && sky.day.colour !== sky.night.colour;

export const skyPass = (
  system: GammaSystemDocument,
  inputs: SkyInputs
): SkyPass => ({
  bodies: skyBodies(system, inputs),
  halfWidthDivisor: system.sky.halfWidthDivisor,
  projectionScale: system.sky.projectionScale,
  // `$0503FE` and `$0505B8` both return at once by day on a Body with an atmosphere.
  stars:
    inputs.stars === undefined ||
    inputs.stars === null ||
    (inputs.daylight && hasAtmosphere(inputs.sky))
      ? []
      : starPixels(system.starfield, inputs.stars)
});

const skyBodies = (
  system: GammaSystemDocument,
  inputs: SkyInputs
): readonly SkyItem[] => {
  const here = system.bodies.find(
    body => `body-${body.sourceIndex}` === inputs.body
  );
  if (here === undefined) {
    return [];
  }
  const { latitude, longitude } = (
    inputs.smooth === true ? continuousSkyAngles : skyAngles
  )(inputs.turn, inputs.position);
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
    inputs.daylight && inputs.sky !== null && hasAtmosphere(inputs.sky)
      ? inputs.sky.day.colour
      : PALETTE_SLOT_0;
  const surfaceOffset = (point: Vector3): Vector3 => {
    const x = point.x - eye.x;
    const y = point.y - eye.y;
    const z = point.z - eye.z;
    const [east, up, north] = rotation.map(
      row => row[0] * x + row[1] * y + row[2] * z
    ) as [number, number, number];
    return { x: east, y: up, z: north };
  };
  const result: SkyItem[] = [];
  for (const id of here.drawList) {
    const body = system.bodies.find(item => item.id === id);
    if (body === undefined) {
      continue;
    }
    if (body.positionKind === 'capture-time-sample') {
      const comet = skyComet(system, body, inputs.impact, surfaceOffset);
      if (comet !== null) {
        result.push(comet);
      }
      continue;
    }
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
      kind: 'disc',
      offset: surfaceOffset(body.position),
      shadow,
      size: body.size,
      split: phase.split
    });
  }
  return result;
};

export interface SpaceSkyInputs {
  /// The craft's position in the System (`$799A`/`$799E`/`$79A2`).
  readonly eye: Vector3;
  readonly impact: ImpactTime;
  /// Whether a Body is in the scene: the range scan's negative-Y flag, by source index.
  readonly inScene: (sourceIndex: number) => boolean;
  /// The view the space starfield `$05067C` scrolls by (#578), or null for no stars. Nothing
  /// gates it by day.
  readonly stars?: StarView | null;
}

/// The Bodies seen from space (#558). The range scan `$052DB0` puts every Body in the scene
/// that lies in front of the view on the sort list at `$8F5A`, with its range, and lets the
/// comet through behind it too. The sky is drawn through the view matrix alone (`$7A8E` = 2),
/// so each offset is the Body's less the craft's in the System's own axes. Read statically
/// only: the port draws them farthest first, the painter's order, over `$001`.
export const spaceSkyPass = (
  system: GammaSystemDocument,
  inputs: SpaceSkyInputs
): SkyPass => {
  const { eye } = inputs;
  const offset = (point: Vector3): Vector3 => ({
    x: point.x - eye.x,
    y: point.y - eye.y,
    z: point.z - eye.z
  });
  const items: { readonly item: SkyItem; readonly range: number }[] = [];
  for (const body of system.bodies) {
    if (!inputs.inScene(body.sourceIndex)) {
      continue;
    }
    if (body.positionKind === 'capture-time-sample') {
      const comet = skyComet(system, body, inputs.impact, offset);
      if (comet !== null) {
        const { x, y, z } = comet.offset;
        items.push({ item: comet, range: Math.hypot(x, y, z) });
      }
      continue;
    }
    const phase =
      body.sourceIndex === 0
        ? { first: 'lit' as const, split: 0x7f_ff / 0x80_00 }
        : phaseOf(body.position, eye);
    const at = offset(body.position);
    items.push({
      item: {
        colour: body.baseColour,
        first: phase.first,
        id: body.id,
        kind: 'disc',
        offset: at,
        shadow: PALETTE_SLOT_0,
        size: body.size,
        split: phase.split
      },
      range: Math.hypot(at.x, at.y, at.z)
    });
  }
  return {
    bodies: items.sort((a, b) => b.range - a.range).map(entry => entry.item),
    halfWidthDivisor: system.sky.halfWidthDivisor,
    projectionScale: system.sky.projectionScale,
    stars:
      inputs.stars === undefined || inputs.stars === null
        ? []
        : starPixels(system.starfield, inputs.stars)
  };
};

/// `$04FBF2`: the comet's points about its centre at the impact clock, or null once it is gone.
const skyComet = (
  system: GammaSystemDocument,
  body: GammaSystemDocument['bodies'][number],
  impact: ImpactTime,
  surfaceOffset: (point: Vector3) => Vector3
): SkyComet | null => {
  const { comet } = system;
  const centre = cometCentre(comet, impact);
  if (centre === null) {
    return null;
  }
  // `$04FC14..$04FC22`: the tip is a quarter further from DIALIS again, at Y 0. `$7A82 ≠ 0`
  // takes the quarter from ERIS's X and Z instead; the mover raises it only where the table
  // ends at zero on the clock, which destroys the comet too unless ERIS was already destroyed.
  // That is the endgame's (#580), so the port reads the comet's own centre.
  const tip = {
    x: centre.x + (centre.x >> comet.tailShift),
    y: 0,
    z: centre.z + (centre.z >> comet.tailShift)
  };
  const head = { x: centre.x, y: body.position.y, z: centre.z };
  const [firstSlot] = comet.headDisc.slots;
  return {
    faces: comet.polygons.faces.map(face => ({
      colour: face.colour,
      points: face.points
    })),
    head: firstSlot === 0 ? { colour: PALETTE_SLOT_0, size: body.size } : null,
    id: body.id,
    kind: 'comet',
    offset: surfaceOffset(head),
    points: [
      surfaceOffset(tip),
      ...comet.headPoints.offsets.map(offset =>
        surfaceOffset({
          x: head.x + offset.x,
          y: head.y + offset.y,
          z: head.z + offset.z
        })
      )
    ]
  };
};
