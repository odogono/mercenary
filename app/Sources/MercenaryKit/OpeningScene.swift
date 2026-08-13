/// A ground-level vantage point for inspecting the opening scene at cell 8:8.
public enum OpeningScene {
  public static let focus = SIMD3<Double>(559_104, 0, 559_104)

  /// Back away from the structure centre while staying inside cell 8:8, so the
  /// pyramid, two craft, and airstrip are visible instead of surrounding the camera.
  public static let player = PlayerState(
    position: SIMD3(focus.x, 400, 545_000), heading: 0, pitch: 5 * .pi / 180
  )
}
