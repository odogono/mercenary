import MercenaryKit
import SwiftUI

/// The Game Surface: sky, ground, wireframe, and a status strip.
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
      if let comms = model.comms {
        MessageLine(comms: comms)
      }
      StatusStrip(model: model, manifest: manifest, world: world)
    }
    .background(SceneStyle.sky)
  }

  private func draw(context: GraphicsContext, size: CGSize) {
    let camera = Camera(player: model.state.player)
    drawGround(context: context, size: size, camera: camera)

    let visible = model.selector.visible(
      in: world, from: model.state.player.position, elapsed: model.state.elapsed,
      hidden: model.hiddenSlots
    )
    var paths: [Ink: Path] = [:]
    var drawn = 0
    for segment in visible.segments {
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

    // Objects beyond their detail cube are a single point, as in the original.
    var dots = Path()
    for origin in visible.points {
      guard let point = camera.project(point: origin, size: size) else { continue }
      dots.addRect(CGRect(x: point.x, y: point.y, width: 1, height: 1))
    }
    context.fill(dots, with: .color(SceneStyle.whiteInk))

    Task { @MainActor in model.report(visibleLines: drawn, points: visible.points.count) }
  }

  /// Fill the ground on the far side of the projected horizon, so the world reads
  /// as a surface rather than floating lines.
  ///
  /// In flight the horizon has to do two things it never did on foot: lean with
  /// the craft's roll, and change sides when pitch carries the view over the
  /// vertical, since the Reference Build's pitch wraps rather than clamping.
  private func drawGround(context: GraphicsContext, size: CGSize, camera: Camera) {
    let (rect, lean) = camera.groundFill(size: size)
    var path = Path(rect)
    if lean != 0 {
      path = path.applying(Camera.leanTransform(lean, size: size))
    }
    context.fill(path, with: .color(SceneStyle.ground))
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

/// The game's message line, showing text composed from the decoded tables.
private struct MessageLine: View {
  let comms: WalkaboutModel.Comms

  /// The balance while the game is running; the pager's position when it is not.
  private var trailing: String {
    switch comms {
    case .scripted(_, let credits):
      return "\(credits) CREDITS"
    case .browsing(let table, let index):
      return String(format: "MSG %02d/%d  [ ]", index, table.messageCount - 1)
    }
  }

  var body: some View {
    HStack(spacing: 12) {
      Text(comms.text.isEmpty ? "—" : comms.text)
        .lineLimit(1)
      Spacer()
      Text(trailing)
        .foregroundStyle(SceneStyle.interfaceAccent)
    }
    .font(.system(size: 13, weight: .semibold, design: .monospaced))
    .foregroundStyle(SceneStyle.messageText)
    .padding(.horizontal, 12)
    .padding(.vertical, 7)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(SceneStyle.statusBackground)
    .overlay(alignment: .top) { Divider().overlay(SceneStyle.interfaceAccent) }
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
      // What the player is in, and the readouts that only mean anything aboard.
      Text(model.craftName)
        .foregroundStyle(SceneStyle.interfaceAccent)
      if model.state.craft != nil {
        Text("ALT \(Int(player.position.y))")
        Text("THR \(model.throttleNotch)")
        Text(model.state.mode == .flying ? "FLYING" : "GROUNDED")
      }
      Spacer()
      Text("\(model.visibleLines) LINES")
      Text("\(model.visiblePoints) PTS")
      Text("\(Int(model.framesPerSecond.rounded())) FPS")
    }
    .font(.system(size: 11, weight: .medium, design: .monospaced))
    .foregroundStyle(SceneStyle.statusText)
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .background(SceneStyle.statusBackground)
    .overlay(alignment: .top) { Divider().overlay(SceneStyle.interfaceAccent) }
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
