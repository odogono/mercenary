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
  // The Damocles renderer fills the canvas with the vertical field of view (`VERTEX` in
  // `renderer.ts`): one focal length, half the canvas height over the half-angle's tangent, on
  // both axes. `Camera.project` is Targ's Reference Viewport, whose narrower frustum put the hit
  // area between the object and the middle of the view.
  const focal =
    size.height /
    2 /
    Math.tan((presentation.verticalFieldOfViewDegrees * Math.PI) / 360);
  const drawn = (view: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }) => ({
    x: size.width / 2 + (view.x * focal) / view.z,
    y: size.height / 2 - (view.y * focal) / view.z
  });
  const lines = segments
    .map(segment => {
      const a = camera.viewSpace(
        toCameraSpace(placed(segment.a, resident, negateModelZ))
      );
      const b = camera.viewSpace(
        toCameraSpace(placed(segment.b, resident, negateModelZ))
      );
      if (a.z > presentation.farPlane && b.z > presentation.farPlane) {
        return undefined;
      }
      const clipped = camera.clipToNearPlane(a, b);
      if (clipped === undefined) {
        return undefined;
      }
      const first = drawn(clipped[0]);
      const second = drawn(clipped[1]);
      return { x1: first.x, x2: second.x, y1: first.y, y2: second.y };
    })
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

/// The centre box's item name field, in the 64 by 32 cells `drawCentreBox` letters it on,
/// bevel included.
const CENTRE_BOX_CELLS = { height: 32, width: 64 } as const;
const NAME_FIELD = { bottom: 17, left: 6, right: 57, top: 8 } as const;

/// The pointer's paging of an open document (#599), an Accommodation the original has no
/// pointer for. A click on the item's name reads it, as `*` does. Anywhere else on the centre
/// box pages the way its `−` or `+` stands: the left half back, the right half on. The point
/// and the size are in any one unit.
export const centreBoxPage = (
  point: Point,
  size: Size
): 'next' | 'previous' | 'read' => {
  const x = (point.x / size.width) * CENTRE_BOX_CELLS.width;
  const y = (point.y / size.height) * CENTRE_BOX_CELLS.height;
  if (
    x >= NAME_FIELD.left &&
    x < NAME_FIELD.right &&
    y >= NAME_FIELD.top &&
    y < NAME_FIELD.bottom
  ) {
    return 'read';
  }
  return x < CENTRE_BOX_CELLS.width / 2 ? 'previous' : 'next';
};

/// Wheel travel, in CSS pixels, to one page. A mouse notch is about 100 and a trackpad sends
/// many small deltas, so the travel is gathered and pages one at a time.
export const WHEEL_PAGE_PIXELS = 50;

/// `WheelEvent.deltaMode`'s line and page units, each of which is a notch on its own.
const DOM_DELTA_PIXEL = 0;

/// One wheel event over an open document: the page it turns, if any, and the travel gathered
/// toward the next. Down pages on and up pages back. Travel the other way starts afresh, and
/// one event turns one page at most, so a hard flick does not skip items unseen.
export const wheelPage = (
  gathered: number,
  deltaY: number,
  deltaMode: number
): {
  readonly gathered: number;
  readonly page: 'next' | 'previous' | undefined;
} => {
  if (deltaY === 0) {
    return { gathered, page: undefined };
  }
  const travel =
    deltaMode === DOM_DELTA_PIXEL
      ? (Math.sign(gathered) === Math.sign(deltaY) ? gathered : 0) + deltaY
      : Math.sign(deltaY) * WHEEL_PAGE_PIXELS;
  if (Math.abs(travel) < WHEEL_PAGE_PIXELS) {
    return { gathered: travel, page: undefined };
  }
  return { gathered: 0, page: travel > 0 ? 'next' : 'previous' };
};
