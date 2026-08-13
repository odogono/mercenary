/// A ground-level vantage point for inspecting the opening scene at cell 8:8.
public enum OpeningScene {
  public static let focus = SIMD3<Double>(559_104, 0, 559_104)

  /// A neutral-horizon view from 12,000 world units south of the scene centre.
  /// This keeps the pyramid, two craft, and airstrip visible with the decoded
  /// Reference Build projection instead of compensating with geometry scale.
  public static let player = PlayerState(
    position: SIMD3(focus.x, 400, focus.z - 12_000), heading: 0, pitch: 0
  )
}
