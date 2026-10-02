import type { CraftArithmetic } from '../damocles/craft.ts';
import { celestialRotation, phaseOf } from '../damocles/sky.ts';
import {
  rollTangent,
  starPixels,
  type StarRoutine,
  type Starfield
} from '../damocles/stars.ts';
import type {
  FrameColour,
  OrderedPrimitive,
  ScreenPoint
} from '../rendering/description.ts';
import { screenPolygon } from '../rendering/raster.ts';
import { DION_PROJECTION } from './projection.ts';
import { generalCamera, toCamera, type CameraPoint } from './raster.ts';
import type { DionSky } from './sky.ts';
import type { TourcraftSystem } from './tourcraftContent.ts';

export interface TourcraftSkyView {
  /// Null is System space. Surface Bodies remain distinct from a nearest-name label.
  readonly body: number | null;
  readonly clipRow: number;
  readonly day: boolean;
  readonly latitude: number;
  readonly longitude: number;
  readonly pitch: number;
  readonly roll: number;
  readonly routine: StarRoutine;
  readonly systemEye: readonly [number, number, number];
  readonly yaw: number;
}
const hexColour = (word: number): string =>
  `#${[8, 4, 0]
    .map(s =>
      Math.round((((word >> s) & 7) * 255) / 7)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

/// MIII supplies its own field, offsets and context to the already recovered
/// Damocles band arithmetic. Only native 320×136 pixels enter the shared frame.
export const tourcraftStars = (
  sky: DionSky,
  arithmetic: CraftArithmetic,
  view: TourcraftSkyView
): readonly (readonly [number, number, number])[] => {
  if (view.body !== null && view.day) {
    return [];
  }
  const field: Starfield = {
    colours: {
      entries: sky.colours.map(word => ({
        colour: hexColour(word),
        sourceColour: word
      }))
    },
    columnsPerTurn: 1800,
    pitchOffsets: { flight: 0x1_28, space: 0x1_c0 },
    pitchScale: 0x6c_cc,
    scrollScale: 0xe1_0e,
    stars: sky.stars
      .slice(0, 1600)
      .map(([x, packed]) => [x, packed & 1023, (packed >> 10) & 15] as const)
  };
  const byColour = new Map(
    field.colours.entries.map(c => [c.colour, c.sourceColour])
  );
  return starPixels(field, {
    clipRow: view.clipRow,
    pitch: view.pitch,
    rollTangent: rollTangent(arithmetic, view.roll),
    routine: view.routine,
    yaw: view.yaw
  })
    .filter(
      p => p.column >= 0 && p.column < 320 && p.row >= 0 && p.row < view.clipRow
    )
    .map(p => [p.column, p.row, byColour.get(p.colour)!] as const);
};

/// The same Frame Description as ground/cabin drawing; no new renderer or scene graph.
export const tourcraftSkyPrimitives = (
  system: TourcraftSystem,
  view: TourcraftSkyView,
  literal: (colour: number) => FrameColour,
  tail: {
    readonly colour: number;
    readonly faces: readonly (readonly number[])[];
    readonly vertices: readonly (readonly number[])[];
  }
): OrderedPrimitive[] => {
  const camera = generalCamera([0, 0, 0], view.roll, view.pitch, view.yaw);
  const here =
    view.body === null
      ? undefined
      : system.bodies.find(b => b.offset === view.body);
  const eye = here ? [here.centre[0], 64, here.centre[2]] : view.systemEye;
  const rotation = here
    ? celestialRotation(view.longitude, view.latitude)
    : null;
  const point = (p: readonly number[]): CameraPoint => {
    const delta = p.map((v, i) => v - eye[i]!);
    const [x, y, z] = rotation
      ? rotation.map(r => r.reduce((sum, v, i) => sum + v * delta[i]!, 0))
      : delta;
    return toCamera(camera, x!, y!, z!);
  };
  const out: OrderedPrimitive[] = [];
  const polygon = (
    points: readonly CameraPoint[],
    colour: number,
    source: string
  ) => {
    const screen = screenPolygon(points, false, DION_PROJECTION);
    if (screen && screen.length >= 3) {
      out.push({
        camera: points,
        colour: literal(colour),
        kind: 'polygon',
        order: out.length,
        screen,
        source
      });
    }
  };
  const discRow = (
    left: number,
    right: number,
    row: number,
    colour: number,
    source: string,
    depth: number
  ) => {
    left = Math.max(0, left);
    right = Math.min(320, right);
    if (right <= left) {
      return;
    }
    const screen: ScreenPoint[] = [
      [left, row],
      [right, row],
      [right, row + 1],
      [left, row + 1]
    ];
    const points = screen.map(([x, y]) => ({
      d: depth,
      u: ((160 - x) * depth) / 256,
      v: ((y - 68) * depth) / 256
    }));
    out.push({
      camera: points,
      colour: literal(colour),
      kind: 'polygon',
      order: out.length,
      screen,
      source
    });
  };
  const membership =
    view.body === null ? system.spaceScan : system.drawLists.get(view.body)!;
  const range = (i: number) =>
    Math.hypot(...system.bodies[i]!.centre.map((v, n) => v - eye[n]!));
  const ordered =
    view.body === null
      ? [...membership].sort((a, b) => range(b) - range(a))
      : membership;
  for (const index of ordered) {
    const body = system.bodies[index]!;
    if (body.centre[1] < 0) {
      continue;
    }
    const at = point(body.centre);
    if (at.d <= 0) {
      continue;
    }
    const source = `sky:${body.id}`;
    const special = body.colour >>> 16 === 0x30;
    if (special) {
      const tip = [
        body.centre[0] + (body.centre[0] >> 2),
        body.centre[1],
        body.centre[2] + (body.centre[2] >> 2)
      ];
      const vertices = tail.vertices.map((v, i) =>
        point(i === 0 ? tip : body.centre.map((n, axis) => n + v[axis]!))
      );
      for (const face of tail.faces) {
        polygon(
          face.map(i => vertices[i]!),
          tail.colour,
          source
        );
      }
    }
    const radius = body.size / at.d;
    if (radius < 0.843_75) {
      continue;
    }
    const cx = Math.trunc(160 - (256 * at.u) / at.d);
    const cy = Math.trunc(68 + (256 * at.v) / at.d);
    const phase =
      index === 0 || special
        ? { first: 'lit' as const, split: 1 }
        : phaseOf(
            { x: body.centre[0], y: body.centre[1], z: body.centre[2] },
            { x: eye[0]!, y: eye[1]!, z: eye[2]! }
          );
    const lit = special ? 0 : body.colour & 0x7_77;
    const shadow =
      here && view.day && here.skyDay !== here.skyNight ? here.skyDay : 0;
    const [first, second] =
      phase.first === 'lit' ? [lit, shadow] : [shadow, lit];
    for (
      let y = Math.max(0, Math.ceil(cy - radius));
      y < Math.min(view.clipRow, cy + radius);
      y += 1
    ) {
      const width = Math.trunc(
        Math.sqrt(Math.max(0, radius * radius - (y - cy) ** 2)) / 0.843_75
      );
      const split = cx + Math.floor(width * phase.split) + 1;
      discRow(
        cx - width,
        Math.min(cx + width + 1, split),
        y,
        first,
        source,
        at.d
      );
      discRow(
        Math.max(cx - width, split),
        cx + width + 1,
        y,
        second,
        source,
        at.d
      );
    }
  }
  return out;
};
