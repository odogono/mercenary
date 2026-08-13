import MercenaryKit
import SwiftUI

/// The Game Surface: sky, ground, horizon, wireframe, and a status strip.
struct WorldView: View {
  let world: World
  let manifest: Payload.Manifest
  let model: WalkaboutModel

  var body: some View {
    VStack(spacing: 0) {
      Canvas(rendersAsynchronously: false) { context, size in
        draw(context: context, size: size)
      }
      .frame(minWidth: 480, minHeight: 320)
      StatusStrip(model: model, manifest: manifest, world: world)
    }
    .background(SceneStyle.sky)
  }

  private func draw(context: GraphicsContext, size: CGSize) {
    let camera = Camera(player: model.state.player)
    drawGround(context: context, size: size, camera: camera)

    let segments = model.selector.segments(in: world, from: model.state.player.position)
    var paths: [Ink: Path] = [:]
    var drawn = 0
    for segment in segments {
      guard let line = camera.project(segment: segment, size: size) else { continue }
      guard isOnScreen(line, size: size) else { continue }
      paths[segment.ink, default: Path()].move(to: CGPoint(x: CGFloat(line.x1), y: CGFloat(line.y1)))
      paths[segment.ink]?.addLine(to: CGPoint(x: CGFloat(line.x2), y: CGFloat(line.y2)))
      drawn += 1
    }
    // Dim pass first so the bright pass reads on top where they overlap.
    if let dim = paths[.black] {
      context.stroke(dim, with: .color(SceneStyle.blackInk), lineWidth: 1)
    }
    if let bright = paths[.white] {
      context.stroke(bright, with: .color(SceneStyle.whiteInk), lineWidth: 1)
    }
    Task { @MainActor in model.report(visibleLines: drawn) }
  }

  /// Fill the ground below the projected horizon, so the world reads as a
  /// surface rather than floating lines.
  private func drawGround(context: GraphicsContext, size: CGSize, camera: Camera) {
    let focal = Double(size.height) / (2 * tan(camera.verticalFieldOfView / 2))
    // The horizon sits where an infinitely distant ground point projects.
    let horizon = Double(size.height) / 2 + tan(camera.pitch) * focal
    let clamped = max(0, min(Double(size.height), horizon))
    guard clamped < Double(size.height) else { return }
    let ground = CGRect(x: 0, y: clamped, width: size.width, height: Double(size.height) - clamped)
    context.fill(Path(ground), with: .color(SceneStyle.ground))
    var line = Path()
    line.move(to: CGPoint(x: 0, y: clamped))
    line.addLine(to: CGPoint(x: size.width, y: clamped))
    context.stroke(line, with: .color(SceneStyle.horizon), lineWidth: 1)
  }

  /// Reject lines wholly outside the view. A generous margin keeps long segments
  /// that cross the screen without either endpoint inside it.
  private func isOnScreen(_ line: ScreenLine, size: CGSize) -> Bool {
    let margin: Float = 4000
    let minX = min(line.x1, line.x2)
    let maxX = max(line.x1, line.x2)
    let minY = min(line.y1, line.y2)
    let maxY = max(line.y1, line.y2)
    return maxX > -margin && minX < Float(size.width) + margin
      && maxY > -margin && minY < Float(size.height) + margin
  }
}

private struct StatusStrip: View {
  let model: WalkaboutModel
  let manifest: Payload.Manifest
  let world: World

  var body: some View {
    let player = model.state.player
    let column = Int(player.position.x / Double(world.cellSize))
    let row = Int(player.position.z / Double(world.cellSize))
    HStack(spacing: 18) {
      Text("GRID \(column, specifier: "%02d"):\(row, specifier: "%02d")")
      Text("X \(Int(player.position.x))  Z \(Int(player.position.z))")
      Text("HDG \(Int(player.heading * 180 / .pi))°")
      Spacer()
      Text("\(model.visibleLines) LINES")
      Text("\(Int(model.framesPerSecond.rounded())) FPS")
    }
    .font(.system(size: 11, weight: .medium, design: .monospaced))
    .foregroundStyle(SceneStyle.statusText)
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .background(SceneStyle.statusBackground)
    .overlay(alignment: .top) { Divider().overlay(SceneStyle.horizon) }
  }
}

/// Shown when no payload has been exported yet — the most likely first-run state.
struct PayloadMissingView: View {
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Data Payload required")
        .font(.title2.bold())
      Text(message)
        .font(.system(size: 12, design: .monospaced))
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(28)
    .frame(minWidth: 620, alignment: .leading)
  }
}
