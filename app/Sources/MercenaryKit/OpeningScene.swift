/// A ground-level vantage point for inspecting the opening scene at cell 8:8.
public enum OpeningScene {
  public static let focus = SIMD3<Double>(559_104, 0, 559_104)

  /// The Reference Build's captured crash position, using its decoded $0080 eye
  /// height. The player begins in the centre of the wreck rather than at a staged
  /// overview of the airstrip.
  public static let player = PlayerState(
    position: SIMD3(focus.x, FlightModel.referenceWalkingEyeAltitude, focus.z), heading: 0, pitch: 0
  )
}
