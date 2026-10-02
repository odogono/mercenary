/// Compatibility input for the existing filled GPU path. Title planners migrate separately.
export const FLOATS_PER_VERTEX = 10;
export interface TriangleFrame {
  readonly clear: readonly [number, number, number];
  readonly farPlane: number;
  readonly fillTriangleCount: number;
  readonly groundTriangleCount: number;
  readonly horizonIslandVertices: Float32Array;
  readonly horizonVertices: Float32Array;
  readonly islandTriangleCount: number;
  readonly nearPlane: number;
  readonly roadVertices?: Float32Array;
  readonly skyVertices: Float32Array;
  readonly triangleCount: number;
  readonly verticalFieldOfViewDegrees: number;
  readonly vertices: Float32Array;
}
