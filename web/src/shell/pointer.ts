import type { Interaction } from '../interaction/index.ts';
import { Camera, type Point, type Size } from '../projection/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import {
  atUnsignedSurfacePosition,
  isDetailed,
  isDrawable,
  objectSegments,
  placedAtResidence,
  type ObjectPlacement,
  type World
} from '../world/index.ts';

const DEFAULT_HIT_SLOP = 12;

const placedObject = (
  world: World,
  object: ObjectPlacement,
  snapshot: SessionSnapshot
): ObjectPlacement => {
  const residence = snapshot.residence.get(object.slot);
  if (residence !== undefined) {
    return placedAtResidence(world, object, residence, snapshot.location);
  }
  return snapshot.location.kind === 'surface'
    ? atUnsignedSurfacePosition(object)
    : object;
};

const distanceSquared = (a: Point, b: Point): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/// Select the nearby object whose projected wireframe contains a pointer.
///
/// The result is only an identity. Taking remains a Session semantic action, so pointer and
/// keyboard input share capacity, weight, fixed-object, scripting and inventory behaviour.
export const takeTargetAt = (
  world: World,
  snapshot: SessionSnapshot,
  interaction: Interaction,
  size: Size,
  pointer: Point,
  hitSlop = DEFAULT_HIT_SLOP
): number | undefined => {
  if (snapshot.escapePresentation !== undefined || snapshot.indoor?.dark) {
    return undefined;
  }

  const camera = new Camera({
    ...snapshot.player,
    mirrored: snapshot.worldFlipped
  });
  let selected: { readonly score: number; readonly slot: number } | undefined;

  for (const object of world.objects) {
    const residence = snapshot.residence.get(object.slot);
    if (!isDrawable(object, snapshot.location, residence)) {
      continue;
    }
    const placed = placedObject(world, object, snapshot);
    if (
      !isDetailed(placed, snapshot.player.position) ||
      !interaction.isWithinReach(
        { position: placed.origin, slot: placed.slot },
        snapshot.player.position,
        interaction.takeRange
      )
    ) {
      continue;
    }

    const lines = objectSegments(placed)
      .map(segment => camera.projectSegment(segment, size))
      .filter(line => line !== undefined);
    if (lines.length === 0) {
      continue;
    }
    const xs = lines.flatMap(line => [line.x1, line.x2]);
    const ys = lines.flatMap(line => [line.y1, line.y2]);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    if (
      pointer.x < left - hitSlop ||
      pointer.x > right + hitSlop ||
      pointer.y < top - hitSlop ||
      pointer.y > bottom + hitSlop
    ) {
      continue;
    }

    const score = distanceSquared(pointer, {
      x: (left + right) / 2,
      y: (top + bottom) / 2
    });
    if (selected === undefined || score < selected.score) {
      selected = { score, slot: object.slot };
    }
  }

  return selected?.slot;
};

/// Convert a CSS-pixel pointer location into the canvas's drawing coordinates. The returned
/// hit slop scales with the canvas too, keeping a finger-sized target when the authored frame
/// is shrunk on a phone.
export const canvasPointer = (
  canvas: HTMLCanvasElement,
  client: Point,
  cssHitSlop = DEFAULT_HIT_SLOP
): { readonly hitSlop: number; readonly point: Point } | undefined => {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return undefined;
  }
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  return {
    hitSlop: cssHitSlop * Math.max(scaleX, scaleY),
    point: {
      x: (client.x - bounds.left) * scaleX,
      y: (client.y - bounds.top) * scaleY
    }
  };
};
