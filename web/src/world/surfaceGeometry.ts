/// Surface Cell rotation shared by Recovered Baseline display coordinates and live geometry.
import { cos, sin, toFloat32 } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { SurfaceCell } from '../payload/documents.ts';

export const vector = (x: number, y: number, z: number): Vector3 => ({
  x: toFloat32(x),
  y: toFloat32(y),
  z: toFloat32(z)
});

/// The Reference Build advances a structure's phase once per completed geometry frame, which at
/// cell 8:8 is approximately every ten PAL frames.
const REFERENCE_FRAMES_PER_SECOND = 5;
/// Its sine routine uses the low byte within a quadrant and the low two bits of the high byte to
/// select the four quadrants: one turn is therefore `$0400`.
const ANGLE_UNITS_PER_TURN = 1024;

const signedByte = (value: number): number =>
  (value & 0x80) === 0 ? value & 0xff : (value & 0xff) - 0x1_00;

export interface SurfaceRotation {
  readonly centre: { readonly x: number; readonly y: number };
  readonly descriptor: number;
}

export const resolveRotation = (
  rotation: SurfaceRotation,
  input: readonly [number, number, number],
  elapsed: number
): Vector3 => {
  const step = (rotation.descriptor & 0xf0) >> 1;
  // The original advanced the phase in whole steps once per geometry frame, about five times a
  // second, which at sixty frames a second reads as a stutter rather than a spin. The rate is
  // the decoded one; letting the phase run continuously between its steps is a presentation
  // adaptation that keeps the recovered motion smooth at the browser's display rate.
  const phase = Math.max(0, elapsed) * REFERENCE_FRAMES_PER_SECOND;
  const angle = ((phase * step) / ANGLE_UNITS_PER_TURN) * (2 * Math.PI);
  // SETUP_STRUCTURE_POINTERS passes the source byte to `BIT24_TO_FP` as the high byte of a
  // twenty-four bit value, so the float it gets back is the byte shifted left sixteen; it then
  // subtracts $28 from the exponent byte, which is ten powers of two. That leaves a signed ×64
  // displacement, a quarter of the middle-byte unit the surface's own points are placed in. Only
  // the independently stored Y byte is in that middle-byte (×256) unit itself.
  const localX = signedByte(input[0]) << 6;
  const localZ = signedByte(input[2]) << 6;
  const cosine = cos(angle);
  const sine = sin(angle);
  return vector(
    rotation.centre.x + localX * cosine - localZ * sine,
    input[1] << 8,
    rotation.centre.y + localX * sine + localZ * cosine
  );
};

/// A cell's column and row: the stored grid pair, or else derived from its packed index.
export const cellGrid = (
  cell: SurfaceCell,
  cellsPerAxis: number
): { readonly column: number; readonly row: number } =>
  cell.grid.length === 2
    ? { column: cell.grid[0]!, row: cell.grid[1]! }
    : {
        column: cell.cell % cellsPerAxis,
        row: Math.floor(cell.cell / cellsPerAxis)
      };

export const surfaceRotation = (
  cell: SurfaceCell,
  cellsPerAxis: number
): SurfaceRotation | undefined => {
  if (cell.rotation === undefined || cell.rotation.center.length !== 2) {
    return undefined;
  }
  const { column, row } = cellGrid(cell, cellsPerAxis);
  return {
    centre: {
      x: (column << 16) + (cell.rotation.center[0]! << 8),
      y: (row << 16) + (cell.rotation.center[1]! << 8)
    },
    descriptor: cell.rotation.descriptor
  };
};
