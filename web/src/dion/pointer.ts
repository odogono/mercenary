import type {
  FrameDescription,
  ScreenPoint
} from '../rendering/description.ts';

/// Whether the pointer lies on the drawn take candidate, in the frame's own 320-wide pixels.
///
/// The result only says "this is the candidate". A press then makes the ordinary Take, so the
/// pointer and the `T` key share the original handler's range, refusals and effects, as
/// Damocles's pointer does (#599, #756).
export const dionTakeTargetAt = (
  description: FrameDescription,
  candidate: number | undefined,
  point: { readonly x: number; readonly y: number },
  hitSlop: number
): boolean => {
  if (candidate === undefined) {
    return false;
  }
  const source = `resident:${candidate}`;
  const p: ScreenPoint = [point.x, point.y];
  return description.primitives.some(primitive => {
    if (primitive.source !== source) {
      return false;
    }
    if (primitive.kind === 'polygon') {
      return (
        inside(primitive.screen, p) ||
        primitive.screen.some(
          (a, i, all) =>
            segmentDistance(a, all[(i + 1) % all.length]!, p) <= hitSlop
        )
      );
    }
    if (primitive.kind === 'line') {
      return (
        segmentDistance(primitive.screen[0], primitive.screen[1], p) <= hitSlop
      );
    }
    return segmentDistance(primitive.screen, primitive.screen, p) <= hitSlop;
  });
};

const inside = (polygon: readonly ScreenPoint[], [x, y]: ScreenPoint) => {
  let crossings = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      crossings = !crossings;
    }
  }
  return crossings;
};

const segmentDistance = (
  [ax, ay]: ScreenPoint,
  [bx, by]: ScreenPoint,
  [px, py]: ScreenPoint
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
