import type { Size } from '../projection/index.ts';
import { ScenePalette, type RGB8 } from '../scene/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import type { TargOrrery } from '../sky/index.ts';
import type { World } from '../world/index.ts';
import type { ArrivalPhaseKind } from './arrival.ts';
import {
  descentViewSnapshot,
  type ArrivalCameraPose
} from './arrivalCamera.ts';
import { planFrame, type FramePlan } from './frame.ts';

/// The Arrival Field: the authored star field the Arrival's space segment is seen against, and
/// the planet that grows out of the middle of it.
///
/// A fourth star field in this app, and named so it cannot be mistaken for the other three: it
/// is not the Targ Star Sphere (which belongs to the Enhanced sky and turns at a sidereal rate),
/// not the Interstellar Ship Field (which is decoded behaviour with a respawning depth model),
/// and not ordinary flight. It is a fixed arrangement of points seen from a camera that does not
/// move, because that is what the original's opening shows.
///
/// The arrangement is generated once from a named seed by the same technique the Star Sphere
/// uses, and shares nothing else with it: no seed, no count, and none of the decoded generator
/// the Interstellar Ship Field is obliged to reproduce. Being authored, it is identical under
/// both Presentation Presets — there is no Reference Build appearance here for Authentic
/// presentation to retain (ADR 0032).

/// This field's own seed. 1985 belongs to the Star Sphere; this is the year the 16-bit release
/// whose opening is being recreated came out.
export const ARRIVAL_FIELD_SEED = 1986;

export const ARRIVAL_FIELD_STARS = 220;

/// How far the field drifts across the frame over the whole space segment, in fractions of the
/// view. Small: the original's camera is still, and the drift is only enough to say the ship is
/// moving rather than parked.
const DRIFT = 0.04;

/// The planet's colours. Targ is the green world; the disc is drawn in the ground's own green so
/// the surface the descent arrives at is the surface that grew in the field.
const PLANET_LIT = ScenePalette.ground;

/// Space is not black in the original's opening — it is a very dark navy — and its stars are not
/// all white. Recreated by eye from the release screenshot: mostly white, a scattering of red,
/// and a few blue and grey (ADR 0032).
const FIELD_SKY: RGB8 = { blue: 0x3a, green: 0x0d, red: 0x0d };

const STAR_INKS: readonly RGB8[] = [
  { blue: 0xff, green: 0xff, red: 0xff },
  { blue: 0x3b, green: 0x3c, red: 0xd8 },
  { blue: 0xd8, green: 0x9a, red: 0x7a },
  { blue: 0x9a, green: 0x9a, red: 0x9a }
];

/// How the inks are shared out. White dominates, red is the notable second, and the blue and grey
/// are occasional.
const STAR_INK_SHARES: readonly number[] = [0.62, 0.22, 0.08, 0.08];

/// Mulberry32, the Star Sphere's generator, kept here rather than shared: the two fields must be
/// able to change independently, and a generator is four lines.
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x01_00_00_00_00;
  };
};

interface FieldStar {
  /// Fractions of the view, so the field is resolution independent.
  readonly across: number;
  readonly down: number;
  /// Which of the inks this star is drawn in.
  readonly ink: number;
}

const inkFor = (roll: number): number => {
  let carried = 0;
  for (const [index, share] of STAR_INK_SHARES.entries()) {
    carried += share;
    if (roll < carried) {
      return index;
    }
  }
  return 0;
};

const field = (count: number, seed: number): readonly FieldStar[] => {
  const random = mulberry32(seed);
  const stars: FieldStar[] = [];
  for (let index = 0; index < count; index += 1) {
    stars.push({ across: random(), down: random(), ink: inkFor(random()) });
  }
  return stars;
};

const STARS = field(ARRIVAL_FIELD_STARS, ARRIVAL_FIELD_SEED);

export interface ArrivalFieldProgress {
  /// How far through the space segment the Arrival is, from 0 to 1. Drives the drift.
  readonly drift: number;
  /// How much of the frame's smaller axis the planet covers, from 0 (absent) to beyond 1
  /// (larger than the view). Only the planet approach gives this a value.
  readonly planet: number;
}

/// How many triangles the planet's disc is drawn with. Enough that its edge reads as a curve at
/// the size it fills the screen at.
const PLANET_SEGMENTS = 96;

const planetVertices = (radius: number, size: Size): Float32Array => {
  const centreX = size.width / 2;
  const centreY = size.height / 2;
  const vertices: number[] = [];
  for (let segment = 0; segment < PLANET_SEGMENTS; segment += 1) {
    const from = (segment / PLANET_SEGMENTS) * Math.PI * 2;
    const to = ((segment + 1) / PLANET_SEGMENTS) * Math.PI * 2;
    vertices.push(
      centreX,
      centreY,
      centreX + radius * Math.cos(from),
      centreY + radius * Math.sin(from),
      centreX + radius * Math.cos(to),
      centreY + radius * Math.sin(to)
    );
  }
  return new Float32Array(vertices);
};

/// One batch of vertices per ink, so the field is drawn in the colours it is written in.
const starVertices = (drift: number, size: Size, ink: number): Float32Array => {
  const chosen = STARS.filter(star => star.ink === ink);
  const out = new Float32Array(chosen.length * 2);
  for (const [index, star] of chosen.entries()) {
    // Wrapped rather than clamped, so the field never thins out at an edge.
    const across = (star.across + drift * DRIFT) % 1;
    const down = (star.down + drift * DRIFT * 0.5) % 1;
    out[index * 2] = Math.trunc(across * size.width) + 0.5;
    out[index * 2 + 1] = Math.trunc(down * size.height) + 0.5;
  }
  return out;
};

const batch = (
  mode: 'points' | 'triangles',
  vertices: Float32Array,
  colour: RGB8
) => ({ colour, mode, vertices }) as const;

/// The frame the Arrival's space segment draws: stars, and the planet once it is there.
export const arrivalFieldPlan = (
  progress: ArrivalFieldProgress,
  size: Size
): FramePlan => {
  const batches = STAR_INKS.map((ink, index) =>
    batch('points', starVertices(progress.drift, size, index), ink)
  ).filter(drawn => drawn.vertices.length > 0);
  if (progress.planet > 0) {
    const radius = (progress.planet * Math.min(size.width, size.height)) / 2;
    batches.push(batch('triangles', planetVertices(radius, size), PLANET_LIT));
  }
  return {
    batches,
    clear: FIELD_SKY,
    // The status strip counts what the world renderer drew, and this is not it.
    lines: 0,
    points: STARS.length,
    size
  };
};

/// The frame the impact draws: nothing at all.
///
/// The original blacks out for a beat at zero altitude, which its manual explains as the
/// mercenary losing consciousness under the G force. It is one beat and it is the whole reason
/// the cut to the ground view reads as a crash rather than a jump.
export const arrivalBlackoutPlan = (size: Size): FramePlan => ({
  batches: [],
  clear: ScenePalette.blackInk,
  lines: 0,
  points: 0,
  size
});

/// The frame one moment of the Arrival draws.
///
/// Two of its states are the shell's own pictures and two are the world's. The descent is the
/// ordinary world renderer looking at Targ from a camera the session is not standing in, which
/// is why it is `planFrame` over a synthetic Pose rather than anything new: the city grid that
/// grows as the ship falls is the same city the player will walk out onto, drawn the same way,
/// with the Enhanced sky behind it if the preset asks for one.
export const arrivalFramePlan = (
  phase: ArrivalPhaseKind,
  view: {
    readonly field: ArrivalFieldProgress;
    readonly orrery?: TargOrrery;
    readonly pose: ArrivalCameraPose;
    readonly size: Size;
    readonly snapshot: SessionSnapshot;
    readonly world: World;
  }
): FramePlan => {
  switch (phase) {
    case 'titleCard':
    case 'space':
    case 'planetApproach':
      return arrivalFieldPlan(view.field, view.size);
    case 'blackout':
      return arrivalBlackoutPlan(view.size);
    case 'descent':
      return planFrame(
        view.world,
        descentViewSnapshot(view.snapshot, view.pose),
        view.size,
        view.orrery
      );
    default:
      // The verdict is read from the ground, at the session's own Pose: the Arrival is still
      // holding the player's keys, but there is nothing left for it to pretend about the view.
      return planFrame(view.world, view.snapshot, view.size, view.orrery);
  }
};
