/// The MIII view: projection, clipping, back-face culling and flat fill into an
/// indexed frame (#644, `docs/research/mercenary-iii-taxi-projection.md`).
///
/// The game projects every vertex on its level camera as
/// `sx = 160 − 256·u/d`, `sy = 68 + 256·v/d`, clips at depth 0⁺ and at the half-pixel
/// screen rectangle, culls faces that are not clockwise on integer screen
/// coordinates, and fills each polygon with one palette index. This module is the
/// independent implementation of those facts: a homogeneous near clip at a tiny
/// positive depth, then Sutherland–Hodgman against the rectangle, then a scanline
/// fill of pixel centres. Exact ST rasterisation is waived (D1); only geometry is
/// claimed to agree within a pixel.

export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 136;
const FOCAL = 256;
const CENTRE_X = 160;
const CENTRE_Y = 68;
const NEAR = 1e-3;
const LEFT = -0.5;
const RIGHT = VIEW_WIDTH - 0.5;
const TOP = -0.5;
const BOTTOM = VIEW_HEIGHT - 0.5;

/// Camera space: `d` is depth along the view, `u` and `v` the lateral terms.
export interface CameraPoint {
  readonly d: number;
  readonly u: number;
  readonly v: number;
}

/// The level camera at a heading in 1024ths of a turn, with the half-step yaw of the
/// sine table (`$64000 + 4·a` is `sin(2π(a + ½)/1024)`).
export interface LevelCamera {
  readonly c: number;
  readonly eye: readonly [number, number, number];
  readonly s: number;
}

export const levelCamera = (
  eye: readonly [number, number, number],
  heading: number
): LevelCamera => {
  const angle = (2 * Math.PI * ((heading & 0x3ff) + 0.5)) / 1024;
  return { c: Math.cos(angle), eye, s: Math.sin(angle) };
};

/// A point relative to the eye, into camera space: `d = −(s·x + c·z)`,
/// `u = c·x − s·z`, `v = −y`.
export const toCamera = (
  camera: LevelCamera,
  x: number,
  y: number,
  z: number
): CameraPoint => ({
  d: -(camera.s * x + camera.c * z),
  u: camera.c * x - camera.s * z,
  v: -y
});

export const project = (point: CameraPoint): readonly [number, number] => [
  CENTRE_X - (FOCAL * point.u) / point.d,
  CENTRE_Y + (FOCAL * point.v) / point.d
];

const lerp = (a: CameraPoint, b: CameraPoint, t: number): CameraPoint => ({
  d: a.d + (b.d - a.d) * t,
  u: a.u + (b.u - a.u) * t,
  v: a.v + (b.v - a.v) * t
});

/// Clip a camera-space polygon to depth `NEAR` (the limit the game's ray method
/// reaches), keeping the order of its vertices.
const clipNear = (points: readonly CameraPoint[]): CameraPoint[] => {
  const result: CameraPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const aIn = a.d >= NEAR;
    const bIn = b.d >= NEAR;
    if (aIn) {
      result.push(a);
    }
    if (aIn !== bIn) {
      result.push(lerp(a, b, (NEAR - a.d) / (b.d - a.d)));
    }
  }
  return result;
};

type Point = readonly [number, number];

const clipEdge = (
  points: readonly Point[],
  inside: (p: Point) => boolean,
  cross: (a: Point, b: Point) => Point
): Point[] => {
  const result: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn) {
      result.push(a);
    }
    if (aIn !== bIn) {
      result.push(cross(a, b));
    }
  }
  return result;
};

const atX =
  (x: number) =>
  (a: Point, b: Point): Point => [
    x,
    a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])
  ];
const atY =
  (y: number) =>
  (a: Point, b: Point): Point => [
    a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]),
    y
  ];

export const clipToView = (points: readonly Point[]): Point[] => {
  let result: Point[] = [...points];
  result = clipEdge(result, p => p[0] >= LEFT, atX(LEFT));
  result = clipEdge(result, p => p[0] <= RIGHT, atX(RIGHT));
  result = clipEdge(result, p => p[1] >= TOP, atY(TOP));
  result = clipEdge(result, p => p[1] <= BOTTOM, atY(BOTTOM));
  return result;
};

/// Twice the signed area on integer screen coordinates; positive is clockwise with y
/// pointing down, the only winding the culled polygon entries draw.
export const integerArea = (points: readonly Point[]): number => {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [ax, ay] = points[index]!;
    const [bx, by] = points[(index + 1) % points.length]!;
    sum +=
      Math.floor(ax + 0.5) * Math.floor(by + 0.5) -
      Math.floor(bx + 0.5) * Math.floor(ay + 0.5);
  }
  return sum;
};

/// The screen outline of a camera-space polygon, or none if it is wholly behind,
/// culled, or off screen.
export const screenPolygon = (
  points: readonly CameraPoint[],
  cull: boolean
): Point[] | null => {
  if (points.length < 3) {
    return null;
  }
  const near = clipNear(points);
  if (near.length < 3) {
    return null;
  }
  const projected = near.map(project);
  if (cull && integerArea(projected) < 0) {
    return null;
  }
  const clipped = clipToView(projected);
  return clipped.length >= 3 ? clipped : null;
};

export const screenLine = (
  a: CameraPoint,
  b: CameraPoint
): readonly [Point, Point] | null => {
  if (a.d < NEAR && b.d < NEAR) {
    return null;
  }
  const front = (from: CameraPoint, to: CameraPoint): CameraPoint =>
    from.d >= NEAR ? from : lerp(from, to, (NEAR - from.d) / (to.d - from.d));
  let [x0, y0] = project(front(a, b));
  let [x1, y1] = project(front(b, a));
  // Liang–Barsky against the half-pixel rectangle.
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [
    [-dx, x0 - LEFT],
    [dx, RIGHT - x0],
    [-dy, y0 - TOP],
    [dy, BOTTOM - y0]
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) {
        return null;
      }
      t0 = Math.max(t0, r);
    } else {
      if (r < t0) {
        return null;
      }
      t1 = Math.min(t1, r);
    }
  }
  [x0, y0, x1, y1] = [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  return [
    [x0, y0],
    [x1, y1]
  ];
};

/// One indexed frame of the 3D view.
export class IndexedFrame {
  readonly pixels = new Uint8Array(VIEW_WIDTH * VIEW_HEIGHT);

  clear(index: number): void {
    this.pixels.fill(index);
  }

  /// Fill pixel centres inside a convex outline.
  fillPolygon(points: readonly Point[], index: number): void {
    let top = Infinity;
    let bottom = -Infinity;
    for (const [, y] of points) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const firstRow = Math.max(0, Math.ceil(top - 1e-9));
    const lastRow = Math.min(VIEW_HEIGHT - 1, Math.floor(bottom + 1e-9));
    for (let row = firstRow; row <= lastRow; row += 1) {
      let left = Infinity;
      let right = -Infinity;
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i]!;
        const [bx, by] = points[(i + 1) % points.length]!;
        if ((ay <= row && by >= row) || (by <= row && ay >= row)) {
          if (ay === by) {
            left = Math.min(left, ax, bx);
            right = Math.max(right, ax, bx);
          } else {
            const x = ax + ((bx - ax) * (row - ay)) / (by - ay);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      }
      const from = Math.max(0, Math.ceil(left - 1e-9));
      const to = Math.min(VIEW_WIDTH - 1, Math.floor(right + 1e-9));
      if (to >= from) {
        this.pixels.fill(index, row * VIEW_WIDTH + from, row * VIEW_WIDTH + to + 1);
      }
    }
  }

  drawLine(a: Point, b: Point, index: number): void {
    let x0 = Math.floor(a[0] + 0.5);
    let y0 = Math.floor(a[1] + 0.5);
    const x1 = Math.floor(b[0] + 0.5);
    const y1 = Math.floor(b[1] + 0.5);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      if (x0 >= 0 && x0 < VIEW_WIDTH && y0 >= 0 && y0 < VIEW_HEIGHT) {
        this.pixels[y0 * VIEW_WIDTH + x0] = index;
      }
      if (x0 === x1 && y0 === y1) {
        return;
      }
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x0 += sx;
      }
      if (twice <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  }
}
