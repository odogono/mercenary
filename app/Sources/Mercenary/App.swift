import AppKit
import MercenaryKit
import SwiftUI

/// Entry point. Each headless command claims the line if its own flag is there and
/// otherwise passes; with none of them the interactive app runs.
///
/// Every command writes where `--output` says, or to a named default it prints. A
/// command that claims the line refuses any flag it does not have, because the
/// alternative — which is what this used to do — was to ignore the flag and report
/// success from somewhere the caller was not looking.
@main
enum Entry {
  static func main() {
    let arguments = CommandLine.arguments
    do {
      if let mode = try InspectCommand.mode(from: arguments) {
        exit(InspectCommand.run(mode))
      }
      if let options = try FrameCapture.options(from: arguments) {
        exit(FrameCapture.run(options))
      }
      if let options = try BensonTrace.options(from: arguments) {
        exit(BensonTrace.run(options))
      }
      if let options = try FlightTrace.options(from: arguments) {
        exit(FlightTrace.run(options))
      }
    } catch {
      FileHandle.standardError.write(Data("error: \(error)\n".utf8))
      FileHandle.standardError.write(Data(Self.usage.utf8))
      exit(2)
    }
    MercenaryApp.main()
  }

  static let usage = """

    usage:
      mercenary                                   the game
      mercenary --render-frame [--output PATH] [--x N --z N --eye N]
                               [--heading DEG --pitch DEG --roll DEG]
                               [--time SECONDS] [--room ID]
      mercenary --inspect-objects    [--output PATH]
      mercenary --inspect-structures [--output PATH]
      mercenary --inspect-rooms      [--output PATH]
      mercenary --inspect-object SLOT [--output PATH] [--in-situ]
      mercenary --inspect-cell INDEX  [--output PATH]
      mercenary --inspect-room ID     [--output PATH]
      mercenary --benson-trace [--script ID] [--seconds N] [--time-scale N]
                               [--press KEY@SECONDS] [--board SLOT@SECONDS]
                               [--walk-to SLOT | --take SLOT]
      mercenary --flight-trace [--craft SLOT] [--notch N] [--seconds N] [--poweramp]

    """
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
