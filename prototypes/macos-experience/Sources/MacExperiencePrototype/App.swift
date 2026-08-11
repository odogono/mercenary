import AppKit
import MacExperienceCore
import SwiftUI

@main
struct MacExperiencePrototypeApp: App {
  @NSApplicationDelegateAdaptor(PrototypeAppDelegate.self) private var appDelegate
  @StateObject private var store = ExperienceStore()

  var body: some Scene {
    WindowGroup("Mac Experience Prototype", id: "main") {
      ExperienceView(store: store)
    }
    .defaultSize(width: 960, height: 720)
    .windowResizability(.contentMinSize)
    .commands { PrototypeCommands(store: store) }

    Settings {
      PrototypeSettingsView(store: store)
    }

    Window("Welcome", id: "welcome") {
      WelcomeView()
    }
    .defaultSize(width: 520, height: 360)
    .windowResizability(.contentSize)

    Window("Prototype Help", id: "help") {
      PrototypeHelpView()
    }
    .defaultSize(width: 680, height: 560)
  }
}

@MainActor
final class PrototypeAppDelegate: NSObject, NSApplicationDelegate {
  func applicationWillFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.activate(ignoringOtherApps: true)
  }
}

private struct PrototypeCommands: Commands {
  @ObservedObject var store: ExperienceStore
  @Environment(\.openWindow) private var openWindow

  var body: some Commands {
    CommandGroup(replacing: .newItem) {
      Button("Open Synthetic Save…") { store.requestLoadDocument() }
        .keyboardShortcut("o", modifiers: .command)
    }

    CommandGroup(replacing: .saveItem) {
      Button("Save Synthetic Session…") { store.saveDocument() }
        .keyboardShortcut("s", modifiers: .command)
        .disabled(!store.savePolicy.canSaveDocument)
    }

    CommandMenu("Game") {
      Button(store.session.isPaused ? "Resume" : "Pause") { store.togglePause() }
        .keyboardShortcut(.return, modifiers: .control)
      Button(store.isMessageVisible ? "Hide Prototype Message" : "Show Prototype Message") {
        store.toggleMessage()
      }
      Divider()
      Toggle("Evidence-derived Save Gate", isOn: $store.isSaveGateOpen)
    }

    CommandMenu("Quick Slots") {
      ForEach(QuickSlot.allCases, id: \.rawValue) { slot in
        Menu("Slot \(slot.rawValue)") {
          Button("Save") { store.saveQuickSlot(slot) }
            .disabled(!store.savePolicy.canUseQuickSlots)
          Button("Load") { store.requestLoadQuickSlot(slot) }
            .disabled(!store.savePolicy.canUseQuickSlots)
        }
      }
    }

    CommandGroup(replacing: .help) {
      Button("Mac Experience Prototype Help") { openWindow(id: "help") }
        .keyboardShortcut("?", modifiers: .command)
    }

    CommandGroup(replacing: .appTermination) {
      Button("Quit Mac Experience Prototype") { store.requestQuit() }
        .keyboardShortcut("q", modifiers: .command)
    }
  }
}
