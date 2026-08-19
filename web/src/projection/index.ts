import { atan, cos, sin, tan, toFloat32 } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import {
  SURFACE,
  displacement,
  isDetailed,
  isDrawable,
  movedHorizontally,
  objectSegments,
  room,
  type Ink,
  type Residence,
  type Segment,
  type World,
  type Location as WorldLocation
} from '../world/index.ts';

/// Perspective projection from world space to view pixels, and what is worth projecting.
///
/// **Pixel space is Y-down**, exactly as `Camera.project` computes it: the projection subtracts
/// the vertical term from the centre, so a point above the eye has the smaller Y. That is the
/// Reference Build's own screen convention and the one a `FrameCapture` PNG is written in, so
/// the port keeps it rather than flipping here and flipping the Golden Traces with it. The
/// WebGL2 layer flips Y once, where it maps pixels to clip space, and nowhere else.
///
/// CoreGraphics is not on this side of the port, so `CGPoint`, `CGSize`, `CGRect` and
/// `CGAffineTransform` become the plain records below. They carry no behaviour in the kit
/// either — they are four numbers and a name.
///
/// The narrowing to binary32 happens at one boundary and one only: a `ScreenLine`, whose
/// coordinates are `Float` in the kit. Everything upstream of it is binary64, because that is
/// what `Camera` computes in. A projection that carried double precision to the screen would
/// be very slightly more accurate and would not reproduce a single recorded line.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly height: number;
  readonly width: number;
}

export interface Rect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/// A 2×3 affine transform, in the order CoreGraphics writes its six members: a point maps to
/// `(a·x + c·y + tx, b·x + d·y + ty)`.
export interface AffineTransform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

/// Apply `first`, then `second` — the order `CGAffineTransform`'s builders compose in.
const concatenated = (
  first: AffineTransform,
  second: AffineTransform
): AffineTransform => ({
  a: first.a * second.a + first.b * second.c,
  b: first.a * second.b + first.b * second.d,
  c: first.c * second.a + first.d * second.c,
  d: first.c * second.b + first.d * second.d,
  tx: first.tx * second.a + first.ty * second.c + second.tx,
  ty: first.tx * second.b + first.ty * second.d + second.ty
});

export const transformed = (
  transform: AffineTransform,
  point: Point
): Point => ({
  x: transform.a * point.x + transform.c * point.y + transform.tx,
  y: transform.b * point.x + transform.d * point.y + transform.ty
});

/// A projected line ready to stroke, in view pixels. Its coordinates are binary32.
export interface ScreenLine {
  readonly ink: Ink;
  readonly x1: number;
  readonly x2: number;
  readonly y1: number;
  readonly y2: number;
}

/// The Reference Build projects into 160-by-136 logical coordinates centred at (80, 68). Its
/// multicolour display makes each logical X coordinate two physical pixels wide, producing a
/// 320-by-136 playfield. Keeping that pixel aspect is essential: treating logical pixels as
/// square makes every model half as wide as it should be.
///
/// The perspective scale follows the Reference Build's `$21` FOCUS value of `$18`. Its
/// floating-point projection adds six exponent steps to X/Z, multiplying that ratio by 64. Y
/// receives one additional exponent step, so its ratio is multiplied by 128 before either axis
/// is added to the centre.
const LOGICAL_WIDTH = 160;
const HORIZONTAL_PIXEL_SCALE = 2;

export const ReferenceViewport = {
  /// Perspective scale in reference pixels, decoded from FOCUS `$18` as 2^6.
  focalPixels: 64,
  height: 136,
  horizontalPixelScale: HORIZONTAL_PIXEL_SCALE,
  /// The point pipeline increments the Y exponent once before perspective.
  verticalRatioScale: 2,
  /// The physical playfield: each logical column is two pixels wide.
  width: LOGICAL_WIDTH * HORIZONTAL_PIXEL_SCALE
} as const;

/// Uniform scale from physical reference pixels to view pixels.
export const viewportScale = (size: Size): number =>
  Math.min(
    size.width / ReferenceViewport.width,
    size.height / ReferenceViewport.height
  );

/// Where the reference viewport's centre lands in view pixels.
export const viewportCentre = (size: Size): Point => ({
  x: size.width / 2,
  y: size.height / 2
});

export const horizontalFocalLength = (size: Size): number =>
  ReferenceViewport.focalPixels *
  ReferenceViewport.horizontalPixelScale *
  viewportScale(size);

/// Vertical field of view implied by the reference frustum. A constant, because it is a
/// property of the frustum rather than of any window the frustum is shown in.
export const REFERENCE_VERTICAL_FIELD_OF_VIEW =
  2 *
  atan(
    ReferenceViewport.height /
      2 /
      (ReferenceViewport.focalPixels * ReferenceViewport.verticalRatioScale)
  );

export const DEFAULT_NEAR_PLANE = 24;
export const DEFAULT_FAR_PLANE = 320_000;

export interface CameraFields {
  readonly farPlane?: number;
  readonly heading: number;
  /// Whether the view is mirrored left for right. One underground Room turns this on.
  readonly mirrored?: boolean;
  readonly nearPlane?: number;
  readonly pitch: number;
  readonly position: Vector3;
  /// Radians about the direction of travel. Non-zero only in flight.
  readonly roll?: number;
  readonly verticalFieldOfView?: number;
}

/// Perspective projection from world space to view pixels.
///
/// A class where the rest of this module is functions, for the reason `World` is one: the six
/// trig values are taken once here rather than per vertex. A camera is built once a frame and
/// then asked to transform every point in the scene, so this is the difference between six
/// trig calls a frame and six per vertex.
///
/// The mirror is applied in camera space rather than by negating anything in the world,
/// because that is where the Reference Build applies it — a single `EOR` on the parity flag at
/// eight sites in the transform — and because mirroring the world itself would mirror the
/// objects in it too.
export class Camera {
  readonly position: Vector3;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly verticalFieldOfView: number;
  readonly nearPlane: number;
  readonly farPlane: number;
  readonly mirrored: boolean;

  private readonly sinHeading: number;
  private readonly cosHeading: number;
  private readonly sinPitch: number;
  private readonly cosPitch: number;
  private readonly sinRoll: number;
  private readonly cosRoll: number;

  constructor(fields: CameraFields) {
    this.position = fields.position;
    this.heading = fields.heading;
    this.pitch = fields.pitch;
    this.roll = fields.roll ?? 0;
    this.verticalFieldOfView =
      fields.verticalFieldOfView ?? REFERENCE_VERTICAL_FIELD_OF_VIEW;
    this.nearPlane = fields.nearPlane ?? DEFAULT_NEAR_PLANE;
    this.farPlane = fields.farPlane ?? DEFAULT_FAR_PLANE;
    this.mirrored = fields.mirrored ?? false;
    this.sinHeading = sin(this.heading);
    this.cosHeading = cos(this.heading);
    this.sinPitch = sin(this.pitch);
    this.cosPitch = cos(this.pitch);
    // The world turns against the craft, so these are the sine and cosine of the *negated*
    // roll: a right bank has to lift the right of the horizon, not drop it, and getting that
    // backwards makes a turn read as a turn the other way.
    this.sinRoll = sin(-this.roll);
    this.cosRoll = cos(-this.roll);
  }

  /// Whether the camera is past the vertical, so the ground is above the horizon.
  ///
  /// Pitch wraps in the Reference Build rather than clamping, so a craft really can be flown
  /// over the top and the fill has to know which side is which.
  get isInverted(): boolean {
    return this.cosPitch < 0;
  }

  /// Transform a world point into view space: +X right, +Y up, +Z forward.
  ///
  /// World coordinates are binary32 and the arithmetic is binary64, which in the kit is a
  /// widening at this boundary and here is simply what a JavaScript number already is.
  viewSpace(world: Vector3): Vector3 {
    const relativeX = world.x - this.position.x;
    const relativeY = world.y - this.position.y;
    const relativeZ = world.z - this.position.z;
    // Yaw about the vertical axis, with heading measured clockwise from +Z.
    const yawed = relativeX * this.cosHeading - relativeZ * this.sinHeading;
    const x = this.mirrored ? -yawed : yawed;
    const forward = relativeX * this.sinHeading + relativeZ * this.cosHeading;
    const pitched = relativeY * this.cosPitch - forward * this.sinPitch;
    const z = relativeY * this.sinPitch + forward * this.cosPitch;
    if (this.roll === 0) {
      return { x, y: pitched, z };
    }
    // Roll turns the view about the direction of travel, which is how a banking craft leans
    // the whole world rather than moving through it differently.
    return {
      x: x * this.cosRoll + pitched * this.sinRoll,
      y: pitched * this.cosRoll - x * this.sinRoll,
      z
    };
  }

  /// Project a clipped view-space point into pixels for a view of `size`.
  ///
  /// The frustum comes from the reference viewport, so the projection keeps the original's
  /// aspect and centre whatever the window size.
  project(view: Vector3, size: Size): Point {
    const centre = viewportCentre(size);
    return {
      x: centre.x + (view.x * horizontalFocalLength(size)) / view.z,
      y: centre.y - (view.y * this.verticalFocalLength(size)) / view.z
    };
  }

  /// Where the horizon sits in view pixels for this camera.
  horizon(size: Size): number {
    return (
      viewportCentre(size).y + tan(this.pitch) * this.verticalFocalLength(size)
    );
  }

  /// The ground's fill for a view of `size`: a rectangle in unrolled screen space and the lean
  /// to apply to it about the view's centre.
  ///
  /// Both renderers need the same answer, and in flight it is no longer simply "below the
  /// middle": the fill leans with the craft's roll, and changes sides when pitch carries the
  /// view past the vertical, since pitch wraps rather than clamping. The rectangle reaches well
  /// past the corners so leaning it cannot uncover one.
  groundFill(size: Size): { lean: number; rect: Rect } {
    const edge = this.horizon(size);
    const reach = (size.width + size.height) * 2;
    const rect: Rect = {
      height: reach,
      width: reach * 2,
      x: -reach,
      // Inverted, the ground is above the horizon rather than below it.
      y: this.isInverted ? edge - reach : edge
    };
    return { lean: -this.roll, rect };
  }

  /// Clip a segment to the near plane, returning undefined when it is wholly behind.
  clipToNearPlane(
    a: Vector3,
    b: Vector3
  ): readonly [Vector3, Vector3] | undefined {
    const aVisible = a.z >= this.nearPlane;
    const bVisible = b.z >= this.nearPlane;
    if (aVisible && bVisible) {
      return [a, b];
    }
    if (!aVisible && !bVisible) {
      return undefined;
    }
    const t = (this.nearPlane - a.z) / (b.z - a.z);
    const crossing: Vector3 = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    };
    return aVisible ? [a, crossing] : [crossing, b];
  }

  /// Project one world segment, or undefined when it is clipped away entirely.
  projectSegment(segment: Segment, size: Size): ScreenLine | undefined {
    const a = this.viewSpace(segment.a);
    const b = this.viewSpace(segment.b);
    if (!(a.z <= this.farPlane || b.z <= this.farPlane)) {
      return undefined;
    }
    const clipped = this.clipToNearPlane(a, b);
    if (clipped === undefined) {
      return undefined;
    }
    const first = this.project(clipped[0], size);
    const second = this.project(clipped[1], size);
    if (
      !Number.isFinite(first.x) ||
      !Number.isFinite(first.y) ||
      !Number.isFinite(second.x) ||
      !Number.isFinite(second.y)
    ) {
      return undefined;
    }
    // The one narrowing. `ScreenLine` is `Float` in the kit, and this is where it becomes one.
    return {
      ink: segment.ink,
      x1: toFloat32(first.x),
      x2: toFloat32(second.x),
      y1: toFloat32(first.y),
      y2: toFloat32(second.y)
    };
  }

  /// Project a single world point, or undefined when it is behind the near plane.
  ///
  /// A far point is not narrowed: the kit returns a `CGPoint` here and stays in binary64, so
  /// this stays there too.
  projectPoint(world: Vector3, size: Size): Point | undefined {
    const view = this.viewSpace(world);
    if (!(view.z >= this.nearPlane && view.z <= this.farPlane)) {
      return undefined;
    }
    const projected = this.project(view, size);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      return undefined;
    }
    return projected;
  }

  /// Recomputed from the field of view rather than read off the viewport, because a camera may
  /// be given a field of view the reference frustum did not imply.
  private verticalFocalLength(size: Size): number {
    const referencePixels =
      ReferenceViewport.height / 2 / tan(this.verticalFieldOfView / 2);
    return referencePixels * viewportScale(size);
  }
}

/// Leaning the ground fill means turning it about the view's centre.
///
/// Composed in the order `CGAffineTransform`'s builders compose in, but not bit-identical to
/// what CoreGraphics produces: its own concatenation fuses a multiply and an add, so the two
/// translations come out about one unit in the last place apart. Nothing pins this — a Golden
/// Trace records the lean angle, not the matrix — and the difference moves the corner of an
/// 8320-pixel quad by a fraction of nothing. It is written down because a reader who measured
/// it deserves to find it already known rather than think the port had drifted.
export const leanTransform = (roll: number, size: Size): AffineTransform => {
  const centre = viewportCentre(size);
  const rotation: AffineTransform = {
    a: cos(roll),
    b: sin(roll),
    c: -sin(roll),
    d: cos(roll),
    tx: 0,
    ty: 0
  };
  return concatenated(
    concatenated(
      { a: 1, b: 0, c: 0, d: 1, tx: -centre.x, ty: -centre.y },
      rotation
    ),
    { a: 1, b: 0, c: 0, d: 1, tx: centre.x, ty: centre.y }
  );
};

/// Append in place. `push(...source)` spreads into an argument list, which has a ceiling a
/// cell's geometry could reach; this does not.
const append = <T>(into: T[], source: readonly T[]): void => {
  for (const item of source) {
    into.push(item);
  }
};

/// What the renderer should draw this frame: line segments plus any objects reduced to a
/// single point by the detail rule.
export interface Visible {
  readonly detailedObjects: number;
  /// Origins of objects outside the detail cube, drawn as points.
  readonly points: readonly Vector3[];
  readonly segments: readonly Segment[];
}

export interface VisibilityOptions {
  readonly elapsed?: number;
  /// Where objects have got to, by slot. The payload's placement only says where a thing
  /// started: a craft that has been flown is somewhere else, one being flown is nowhere, and
  /// anything picked up is in the player's hands.
  readonly residence?: ReadonlyMap<number, Residence>;
  readonly room?: number;
}

/// Gather what is worth projecting near the camera. Frustum rejection is left to the
/// projection step, which has to compute view space anyway.
///
/// Surface structures include the immediately surrounding cells to avoid a whole building
/// appearing at a cell boundary. This one-cell ring is a presentation adaptation; the Reference
/// Build expands only the current structure. Objects retain their separate decoded detail-cube
/// rule.
///
/// The append order is the pipeline order a Golden Trace records, and it is **cells, then the
/// map lines, then objects** — underground, the Room's own wireframe and then its objects.
/// Objects last, in both paths.
export const visible = (
  world: World,
  position: Vector3,
  options: VisibilityOptions = {}
): Visible => {
  const elapsed = options.elapsed ?? 0;
  const residence = options.residence;
  const segments: Segment[] = [];
  const points: Vector3[] = [];
  let detailedObjects = 0;

  // Underground the Reference Build draws one room and nothing else: no cell ring, no roads,
  // no surface objects. A room is its own world — but the things standing in that room are
  // drawn, by the same rules that draw the things on the surface.
  /// The object rule, which is the same rule on the surface and underground: the things
  /// present are drawn by their own detail-cube rule, and collapse to a point beyond it. Only
  /// where they are differs, so only that is a parameter.
  const appendObjects = (location: WorldLocation): void => {
    for (const object of world.objects) {
      const where = residence?.get(object.slot);
      if (!isDrawable(object, location, where)) {
        continue;
      }
      const moved = where === undefined ? undefined : displacement(where);
      const placed =
        moved === undefined ? object : movedHorizontally(object, moved);
      if (isDetailed(placed, position)) {
        append(segments, objectSegments(placed));
        detailedObjects += 1;
      } else if (placed.drawsFarAsPoint) {
        points.push(placed.origin);
      }
    }
  };

  if (options.room !== undefined) {
    const here = world.rooms.get(options.room);
    if (here !== undefined) {
      append(segments, here.segments);
    }
    appendObjects(room(options.room));
    return { detailedObjects, points, segments };
  }

  const column = Math.floor(position.x / world.cellSize);
  const row = Math.floor(position.z / world.cellSize);
  const radius = 1;
  const firstColumn = Math.max(0, column - radius);
  const lastColumn = Math.min(world.cellsPerAxis - 1, column + radius);
  const firstRow = Math.max(0, row - radius);
  const lastRow = Math.min(world.cellsPerAxis - 1, row + radius);
  for (let selectedRow = firstRow; selectedRow <= lastRow; selectedRow++) {
    for (
      let selectedColumn = firstColumn;
      selectedColumn <= lastColumn;
      selectedColumn++
    ) {
      const cell = world.cell(selectedColumn, selectedRow);
      if (cell !== undefined && cell.index !== 0) {
        append(segments, cell.segments(elapsed));
      }
    }
  }

  append(segments, world.mapSegments(position));
  appendObjects(SURFACE);

  return { detailedObjects, points, segments };
};

/// Everything one Pose resolves to: the lines to stroke, in pipeline order, and the far points.
///
/// The order is the claim a projection Golden Trace makes, so this is the one traversal — the
/// Replay Gate grades this function and the browser runs it. A renderer that wants its lines
/// grouped by ink groups them afterwards; batching is a choice about draw calls and not a
/// property of the projection.
export const projectFrame = (
  camera: Camera,
  seen: Visible,
  size: Size
): { lines: ScreenLine[]; points: Point[] } => {
  const lines: ScreenLine[] = [];
  for (const segment of seen.segments) {
    const line = camera.projectSegment(segment, size);
    if (line !== undefined) {
      lines.push(line);
    }
  }
  const points: Point[] = [];
  for (const origin of seen.points) {
    const point = camera.projectPoint(origin, size);
    if (point !== undefined) {
      points.push(point);
    }
  }
  return { lines, points };
};
