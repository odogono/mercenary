import Foundation

package struct PrototypeSize: Codable, Equatable, Sendable {
  package var width: Double
  package var height: Double

  package init(width: Double, height: Double) {
    self.width = width
    self.height = height
  }

  package static let reference = PrototypeSize(width: 640, height: 480)
  package static let minimumUsable = PrototypeSize(width: 800, height: 600)
}

package struct PrototypeRect: Codable, Equatable, Sendable {
  package var x: Double
  package var y: Double
  package var width: Double
  package var height: Double
}

package enum DisplayComposition: String, Codable, Equatable, Sendable {
  case stacked
  case wide
}

package struct AccommodationSettings: Codable, Equatable, Sendable {
  package var highContrast: Bool
  package var lineWeight: Double
  package var textScale: Double
  package var reducedFlashing: Bool
  package var visualAudioCues: Bool

  package init(
    highContrast: Bool, lineWeight: Double, textScale: Double, reducedFlashing: Bool,
    visualAudioCues: Bool
  ) {
    self.highContrast = highContrast
    self.lineWeight = lineWeight
    self.textScale = textScale
    self.reducedFlashing = reducedFlashing
    self.visualAudioCues = visualAudioCues
  }

  package static let `default` = AccommodationSettings(
    highContrast: false,
    lineWeight: 1,
    textScale: 1,
    reducedFlashing: false,
    visualAudioCues: false
  )

  package static let maximumPrototypeSet = AccommodationSettings(
    highContrast: true,
    lineWeight: 2,
    textScale: 1.35,
    reducedFlashing: true,
    visualAudioCues: true
  )
}

package enum SyntheticScene {
  package static let referenceSceneIDs: Set<String> = [
    "synthetic-horizon",
    "synthetic-marker-left",
    "synthetic-marker-centre",
    "synthetic-marker-right",
  ]
}

package struct GameSurfaceLayout: Equatable, Sendable {
  package var composition: DisplayComposition
  package var containerSize: PrototypeSize
  package var gameplayFrame: PrototypeRect
  package var statusFrame: PrototypeRect
  package var logicalCameraSize: PrototypeSize
  package var visibleSceneIDs: Set<String>
  package var projectionSignature: String

  package static func resolve(
    in requestedSize: PrototypeSize,
    accommodations: AccommodationSettings = .default
  ) -> GameSurfaceLayout {
    let size = PrototypeSize(
      width: max(requestedSize.width, PrototypeSize.minimumUsable.width),
      height: max(requestedSize.height, PrototypeSize.minimumUsable.height)
    )
    let margin = 24.0
    let gap = 16.0
    let wideStatusWidth = 280.0 * accommodations.textScale
    let stackedStatusHeight = 128.0 * accommodations.textScale
    let canUseWide =
      size.width >= 1_200
      && size.width - (margin * 2) - gap - wideStatusWidth >= 640
      && size.height - (margin * 2) >= 480
    let composition: DisplayComposition = canUseWide ? .wide : .stacked

    let gameplayAvailable: PrototypeSize
    let statusFrame: PrototypeRect
    switch composition {
    case .stacked:
      gameplayAvailable = PrototypeSize(
        width: size.width - (margin * 2),
        height: size.height - (margin * 2) - gap - stackedStatusHeight
      )
      statusFrame = PrototypeRect(
        x: margin,
        y: size.height - margin - stackedStatusHeight,
        width: size.width - (margin * 2),
        height: stackedStatusHeight
      )
    case .wide:
      gameplayAvailable = PrototypeSize(
        width: size.width - (margin * 2) - gap - wideStatusWidth,
        height: size.height - (margin * 2)
      )
      statusFrame = PrototypeRect(
        x: size.width - margin - wideStatusWidth,
        y: margin,
        width: wideStatusWidth,
        height: size.height - (margin * 2)
      )
    }

    let gameplaySize = aspectFit(.reference, inside: gameplayAvailable)
    let gameplayFrame = PrototypeRect(
      x: margin + (gameplayAvailable.width - gameplaySize.width) / 2,
      y: margin + (gameplayAvailable.height - gameplaySize.height) / 2,
      width: gameplaySize.width,
      height: gameplaySize.height
    )

    return GameSurfaceLayout(
      composition: composition,
      containerSize: size,
      gameplayFrame: gameplayFrame,
      statusFrame: statusFrame,
      logicalCameraSize: .reference,
      visibleSceneIDs: SyntheticScene.referenceSceneIDs,
      projectionSignature: "synthetic-camera:640x480:fixed-projection"
    )
  }

  private static func aspectFit(_ content: PrototypeSize, inside bounds: PrototypeSize)
    -> PrototypeSize
  {
    let scale = min(bounds.width / content.width, bounds.height / content.height)
    return PrototypeSize(width: content.width * scale, height: content.height * scale)
  }
}
