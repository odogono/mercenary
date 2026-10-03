import type { Vector3 } from '../orientation/index.ts';
import { FLOATS_PER_VERTEX } from './triangles.ts';

/// The caster grid a Cast Shadow is ray-tested against (ADR 0069). It takes the deduplicated
/// caster triangles in the frame's view space and the direction toward DIALIS in the same
/// space. There is no texel grid in the light's plane, so an edge slides with the sun instead
/// of being resampled, and is as crisp as the polygon edges beside it.

const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

const dot = (a: Vector3, b: Vector3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

const vertexAt = (vertices: Float32Array, index: number): Vector3 => {
  const offset = index * FLOATS_PER_VERTEX;
  return {
    x: vertices[offset]!,
    y: vertices[offset + 1]!,
    z: vertices[offset + 2]!
  };
};

/// Texture rows are this many texels wide for the triangle and index tables.
export const CASTER_TEXTURE_WIDTH = 2048;
/// Cells per side of the light-space grid the ray test looks a fragment up in.
export const CASTER_GRID_SIZE = 512;
/// The grid covers this far either side of the eye in the light's plane; a receiver beyond it
/// is lit. Cells are 32 units across.
export const CASTER_GRID_HALF_EXTENT = 8192;

export interface CasterGrid {
  /// The light basis in view space: x and y span the grid, z points toward the sun.
  readonly basis: readonly [Vector3, Vector3, Vector3];
  /// Grid origin and inverse cell size in light space.
  readonly bounds: readonly [number, number, number, number];
  /// Per cell, the first index into `indices` and how many follow.
  readonly cells: Int32Array;
  readonly indexRows: number;
  readonly indices: Int32Array;
  readonly triangleRows: number;
  /// Each caster's three corners in light space, one RGBA32F texel per corner.
  readonly triangles: Float32Array;
}

/// Under an orthographic sun every shadow ray from a fragment is one point in the light's
/// plane, so finding what lies between a fragment and the sun is a single grid cell's list of
/// triangles tested in two dimensions, then compared along the light's depth.
export const casterGrid = (casters: Float32Array, sun: Vector3): CasterGrid => {
  const lz = sun;
  const up: Vector3 =
    Math.abs(lz.y) > 0.999 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const rawX = cross(up, lz);
  const lengthX = Math.hypot(rawX.x, rawX.y, rawX.z);
  const lx = { x: rawX.x / lengthX, y: rawX.y / lengthX, z: rawX.z / lengthX };
  const ly = cross(lz, lx);
  const count = casters.length / (3 * FLOATS_PER_VERTEX);
  const triangleRows = Math.max(
    1,
    Math.ceil((count * 3) / CASTER_TEXTURE_WIDTH)
  );
  const triangles = new Float32Array(triangleRows * CASTER_TEXTURE_WIDTH * 4);
  for (let corner = 0; corner < count * 3; corner += 1) {
    const p = vertexAt(casters, corner);
    const x = dot(p, lx);
    const y = dot(p, ly);
    triangles[corner * 4] = x;
    triangles[corner * 4 + 1] = y;
    triangles[corner * 4 + 2] = dot(p, lz);
  }
  // The eye is the view space's origin, so it is the light plane's origin too.
  const minX = -CASTER_GRID_HALF_EXTENT;
  const minY = -CASTER_GRID_HALF_EXTENT;
  const size = CASTER_GRID_SIZE;
  if (count === 0) {
    return {
      basis: [lx, ly, lz],
      bounds: [0, 0, 0, 0],
      cells: new Int32Array(size * size * 2),
      indexRows: 1,
      indices: new Int32Array(CASTER_TEXTURE_WIDTH),
      triangleRows,
      triangles
    };
  }
  const inverseX = size / (2 * CASTER_GRID_HALF_EXTENT);
  const inverseY = inverseX;
  const cellRange = (
    triangle: number
  ): readonly [number, number, number, number] => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < 3; k += 1) {
      const x = triangles[(triangle * 3 + k) * 4]!;
      const y = triangles[(triangle * 3 + k) * 4 + 1]!;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const clamp = (value: number): number =>
      Math.min(size - 1, Math.max(0, value));
    const outside =
      (x1 - minX) * inverseX < 0 ||
      (y1 - minY) * inverseY < 0 ||
      (x0 - minX) * inverseX >= size ||
      (y0 - minY) * inverseY >= size;
    if (outside) {
      // An empty range: the loops below never run.
      return [1, 1, 0, 0];
    }
    return [
      clamp(Math.floor((x0 - minX) * inverseX)),
      clamp(Math.floor((y0 - minY) * inverseY)),
      clamp(Math.floor((x1 - minX) * inverseX)),
      clamp(Math.floor((y1 - minY) * inverseY))
    ];
  };
  const counts = new Int32Array(size * size);
  for (let triangle = 0; triangle < count; triangle += 1) {
    const [x0, y0, x1, y1] = cellRange(triangle);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        counts[y * size + x]! += 1;
      }
    }
  }
  const cells = new Int32Array(size * size * 2);
  let total = 0;
  for (let cell = 0; cell < size * size; cell += 1) {
    cells[cell * 2] = total;
    total += counts[cell]!;
  }
  const indexRows = Math.max(1, Math.ceil(total / CASTER_TEXTURE_WIDTH));
  const indices = new Int32Array(indexRows * CASTER_TEXTURE_WIDTH);
  for (let triangle = 0; triangle < count; triangle += 1) {
    const [x0, y0, x1, y1] = cellRange(triangle);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = y * size + x;
        indices[cells[cell * 2]! + cells[cell * 2 + 1]!] = triangle;
        cells[cell * 2 + 1]! += 1;
      }
    }
  }
  return {
    basis: [lx, ly, lz],
    bounds: [minX, minY, inverseX, inverseY],
    cells,
    indexRows,
    indices,
    triangleRows,
    triangles
  };
};
