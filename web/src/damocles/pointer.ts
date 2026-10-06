import { placementUnderPointer } from '../enhanced/pointer.ts';
import type { Point, Size } from '../projection/index.ts';
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
  return placementUnderPointer(
    snapshot.pose,
    { ...resident, mesh: resident.mesh },
    presentation,
    size,
    pointer,
    hitSlop,
    negateModelZ
  )
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

/// The AUTHORS COMPUTER's parameter field, bevel included (#628).
const PARAMETER_FIELD = { bottom: 18, left: 54, right: 64, top: 9 } as const;

/// The pointer on the open AUTHORS COMPUTER (#628), an Accommodation for a keyboard with no
/// keypad digits: a click on the parameter field steps to the next parameter, and anywhere else
/// steps the value the way its `−` or `+` stands. `*` stays a key, since it can destroy a Body.
export const computerBoxPoint = (
  point: Point,
  size: Size
): 'next' | 'parameter' | 'previous' => {
  const x = (point.x / size.width) * CENTRE_BOX_CELLS.width;
  const y = (point.y / size.height) * CENTRE_BOX_CELLS.height;
  if (
    x >= PARAMETER_FIELD.left &&
    x < PARAMETER_FIELD.right &&
    y >= PARAMETER_FIELD.top &&
    y < PARAMETER_FIELD.bottom
  ) {
    return 'parameter';
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
