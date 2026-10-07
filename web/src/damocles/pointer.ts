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

/// The centre box's 64 by 32 cells, which `drawCentreBox` letters on.
const CENTRE_BOX_CELLS = { height: 32, width: 64 } as const;

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
