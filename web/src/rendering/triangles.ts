/// Compatibility input for the existing filled GPU path. Title planners migrate separately.
export const FLOATS_PER_VERTEX = 10;
export interface TriangleFrame {
  readonly clear: readonly [number, number, number];
  readonly farPlane: number;
  readonly fillTriangleCount: number;
  readonly glowVertices?: Float32Array;
  readonly groundTriangleCount: number;
  /// The frame's Haze (ADR 0088): the horizon colour every world layer fades toward with view
  /// distance, and the distance at which it covers half. Absent or null, there is none.
  readonly haze?: {
    readonly colour: readonly [number, number, number];
    readonly halfDistance: number;
  } | null;
  readonly horizonIslandVertices: Float32Array;
  readonly horizonVertices: Float32Array;
  readonly islandTriangleCount: number;
  readonly nearPlane: number;
  /// Glow halos (#951), added over the roads and over the world after it.
  readonly roadGlowVertices?: Float32Array;
  readonly roadVertices?: Float32Array;
  readonly skyVertices: Float32Array;
  readonly triangleCount: number;
  readonly verticalFieldOfViewDegrees: number;
  readonly vertices: Float32Array;
  /// Models fixed to the view, a cab about the eye, painted after the world over a cleared
  /// depth buffer, as the ST paints them last (#807).
  readonly viewFixedVertices?: Float32Array;
}
