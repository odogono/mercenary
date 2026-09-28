import { Camera, type Point, type Size } from '../projection/index.ts';
import type { Selection } from './session.ts';
import type { ErisPlacement, Pose } from './world.ts';

const DEFAULT_HIT_SLOP = 12;

interface PointerSnapshot {
  readonly pose: Pose;
  readonly residents: readonly ErisPlacement[];
  readonly selection: Selection;
}

interface PointerPresentation {
  readonly farPlane: number;
  readonly nearPlane: number;
  readonly verticalFieldOfViewDegrees: number;
}

const toCameraSpace = (point: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}) => ({ x: point.x, y: point.y, z: -point.z });

const placed = (
  vertex: readonly [number, number, number],
  placement: ErisPlacement,
  negateZ: boolean
) => {
  const z = negateZ ? -vertex[2] : vertex[2];
  const sin = Math.sin(placement.heading);
  const cos = Math.cos(placement.heading);
  return {
    x: placement.position.x + vertex[0] * cos + z * sin,
    y: placement.position.y + vertex[1],
    z: placement.position.z - vertex[0] * sin + z * cos
  };
};

/// Select the ordinary take candidate when its projected model contains the pointer.
///
/// The result is only an identity. `DamoclesSession.take()` remains the semantic action, so
/// keyboard and pointer input share the same range, gate, capacity, scripting and persistence.
export const damoclesTakeTargetAt = (
  snapshot: PointerSnapshot,
  presentation: PointerPresentation,
  size: Size,
  pointer: Point,
  hitSlop = DEFAULT_HIT_SLOP,
  negateModelZ = false
): string | undefined => {
  const selection = snapshot.selection;
  if (selection.kind === 'none' || !selection.inRange) {
    return undefined;
  }
  const resident = snapshot.residents.find(
    placement => placement.id === selection.instance
  );
  if (resident?.mesh === undefined) {
    return undefined;
  }
  const camera = new Camera({
    farPlane: presentation.farPlane,
    heading: -snapshot.pose.heading,
    nearPlane: presentation.nearPlane,
    // The frame is drawn through the Pose's pitch and roll (`planErisFrame`), so the object is
    // hit where it is seen when the view looks down at a table or banks aboard.
    pitch: snapshot.pose.pitch,
    position: toCameraSpace(snapshot.pose.position),
    roll: snapshot.pose.roll ?? 0,
    verticalFieldOfView:
      (presentation.verticalFieldOfViewDegrees * Math.PI) / 180
  });
  const segments: {
    readonly a: readonly [number, number, number];
    readonly b: readonly [number, number, number];
  }[] = [];
  for (const primitive of [...resident.mesh.faces, ...resident.mesh.lines]) {
    for (let index = 0; index < primitive.vertices.length; index += 1) {
      if (primitive.vertices.length === 2 && index === 1) {
        break;
      }
      segments.push({
        a: resident.mesh.vertices[primitive.vertices[index]!]!,
        b: resident.mesh.vertices[
          primitive.vertices[(index + 1) % primitive.vertices.length]!
        ]!
      });
    }
  }
  const lines = segments
    .map(segment =>
      camera.projectSegment(
        {
          a: toCameraSpace(placed(segment.a, resident, negateModelZ)),
          b: toCameraSpace(placed(segment.b, resident, negateModelZ)),
          ink: 0 as const
        },
        size
      )
    )
    .filter(line => line !== undefined);
  if (lines.length === 0) {
    return undefined;
  }
  const xs = lines.flatMap(line => [line.x1, line.x2]);
  const ys = lines.flatMap(line => [line.y1, line.y2]);
  return pointer.x >= Math.min(...xs) - hitSlop &&
    pointer.x <= Math.max(...xs) + hitSlop &&
    pointer.y >= Math.min(...ys) - hitSlop &&
    pointer.y <= Math.max(...ys) + hitSlop
    ? resident.id
    : undefined;
};
