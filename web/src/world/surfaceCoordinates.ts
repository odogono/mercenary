/// One complete horizontal axis in the Reference Build. Surface positions are
/// unsigned 24-bit values, so leaving one edge eventually returns at the other.
export const SURFACE_AXIS_MODULUS = 0x01_00_00_00;

export const wrapSurfaceAxis = (value: number): number => {
  const wrapped = value % SURFACE_AXIS_MODULUS;
  return wrapped < 0 ? wrapped + SURFACE_AXIS_MODULUS : wrapped;
};

export const surfaceCellCoordinate = (
  value: number,
  cellSize: number
): number => Math.floor(wrapSurfaceAxis(value) / cellSize);
