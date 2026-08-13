import AppKit
import MercenaryKit
import SwiftUI

/// Entry point. `--render-frame <path>` writes one frame and exits; otherwise the
/// interactive app runs.
@main
enum Entry {
  static func main() {
    if let mode = InspectCommand.mode(from: CommandLine.arguments) {
      exit(InspectCommand.run(mode))
    }
    if let options = FrameCapture.options(from: CommandLine.arguments) {
      exit(FrameCapture.run(options))
    }
    MercenaryApp.main()
  }
}

struct MercenaryApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @State private var model = WalkaboutModel()

  var body: some Scene {
    WindowGroup("Mercenary — Targ") {
      RootView(model: model)
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }
    .defaultSize(width: 960, height: 640)
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationWillFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

private struct RootView: View {
  let model: WalkaboutModel

  var body: some View {
    switch model.load {
    case .loading:
      ProgressView("Loading Data Payload…")
        .frame(minWidth: 480, minHeight: 320)
    case .failed(let message):
      PayloadMissingView(message: message)
    case .ready(let world, let manifest):
      WorldView(world: world, manifest: manifest, model: model)
    }
  }
}
