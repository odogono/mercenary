import type { Mesh } from '../catalogue/data.ts';
import { Camera, type Point, type Size } from '../projection/index.ts';
import type { Pose, ScenePlacement } from './scene.ts';

/// The pointer's hit on a placement as the Enhanced planner draws it (#599, #808): whether the
/// pointer lies within the projected extent of the placement's mesh, with `hitSlop` pixels to
/// spare. The canvas is filled with the vertical field of view, as the renderer fills it.

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
  placement: ScenePlacement,
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

export const placementUnderPointer = (
  pose: Pose,
  placement: ScenePlacement & { readonly mesh: Mesh },
  presentation: PointerPresentation,
  size: Size,
  pointer: Point,
  hitSlop: number,
  negateModelZ = false
): boolean => {
  const camera = new Camera({
    farPlane: presentation.farPlane,
    heading: -pose.heading,
    nearPlane: presentation.nearPlane,
    // The frame is drawn through the Pose's pitch and roll (`planEnhancedFrame`), so the object is
    // hit where it is seen when the view looks down at a table or banks aboard.
    pitch: pose.pitch,
    position: toCameraSpace(pose.position),
    roll: pose.roll ?? 0,
    verticalFieldOfView:
      (presentation.verticalFieldOfViewDegrees * Math.PI) / 180
  });
  const mesh = placement.mesh;
  const segments: {
    readonly a: readonly [number, number, number];
    readonly b: readonly [number, number, number];
  }[] = [];
  for (const primitive of [...mesh.faces, ...mesh.lines]) {
    for (let index = 0; index < primitive.vertices.length; index += 1) {
      if (primitive.vertices.length === 2 && index === 1) {
        break;
      }
      segments.push({
        a: mesh.vertices[primitive.vertices[index]!]!,
        b: mesh.vertices[
          primitive.vertices[(index + 1) % primitive.vertices.length]!
        ]!
      });
    }
  }
  // The renderer fills the canvas with the vertical field of view (`VERTEX` in `renderer.ts`):
  // one focal length, half the canvas height over the half-angle's tangent, on both axes.
  // `Camera.project` is Targ's Reference Viewport, whose narrower frustum put the hit area
  // between the object and the middle of the view.
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
        toCameraSpace(placed(segment.a, placement, negateModelZ))
      );
      const b = camera.viewSpace(
        toCameraSpace(placed(segment.b, placement, negateModelZ))
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
    return false;
  }
  const xs = lines.flatMap(line => [line.x1, line.x2]);
  const ys = lines.flatMap(line => [line.y1, line.y2]);
  return (
    pointer.x >= Math.min(...xs) - hitSlop &&
    pointer.x <= Math.max(...xs) + hitSlop &&
    pointer.y >= Math.min(...ys) - hitSlop &&
    pointer.y <= Math.max(...ys) + hitSlop
  );
};
