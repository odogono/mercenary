import AppKit
import CoreHaptics
import GameController
import MacExperienceCore
import SwiftUI

@MainActor
final class KeyboardMonitor {
  private weak var store: ExperienceStore?
  private var monitors: [Any] = []

  init(store: ExperienceStore) {
    self.store = store
  }

  func start() {
    guard monitors.isEmpty else { return }
    let down = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      self?.handle(event, pressed: true)
    }
    let up = NSEvent.addLocalMonitorForEvents(matching: .keyUp) { [weak self] event in
      self?.handle(event, pressed: false)
    }
    monitors = [down, up].compactMap { $0 }
  }

  func stop() {
    monitors.forEach(NSEvent.removeMonitor)
    monitors.removeAll()
  }

  private func handle(_ event: NSEvent, pressed: Bool) -> NSEvent? {
    let mainWindowID = NSUserInterfaceItemIdentifier("MacExperiencePrototypeMainWindow")
    guard
      NSApp.keyWindow?.identifier == mainWindowID,
      !(NSApp.keyWindow?.firstResponder is NSTextView),
      !event.modifierFlags.contains(.command),
      let control = physicalControl(for: event)
    else {
      return event
    }
    if event.isARepeat {
      store?.handleInput(.repeatEvent(device: .keyboard, control: control))
    } else if pressed {
      store?.handleInput(.press(device: .keyboard, control: control))
    } else {
      store?.handleInput(.release(device: .keyboard, control: control))
    }
    return nil
  }

  private func physicalControl(for event: NSEvent) -> PhysicalControl? {
    switch event.keyCode {
    case 123: return .key("arrow-left")
    case 124: return .key("arrow-right")
    case 125: return .key("arrow-down")
    case 126: return .key("arrow-up")
    case 49: return .key("space")
    default:
      guard let characters = event.charactersIgnoringModifiers?.lowercased(), characters.count == 1
      else {
        return nil
      }
      return .key(characters)
    }
  }
}

@MainActor
final class ControllerMonitor: NSObject {
  private weak var store: ExperienceStore?
  private var started = false
  private var controllerIDs: [ObjectIdentifier: String] = [:]
  private var hapticEngines: [CHHapticEngine] = []

  init(store: ExperienceStore) {
    self.store = store
  }

  func start() {
    guard !started else { return }
    started = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(controllerConnected(_:)),
      name: .GCControllerDidConnect,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(controllerDisconnected(_:)),
      name: .GCControllerDidDisconnect,
      object: nil
    )
    refreshControllers()
  }

  func stop() {
    guard started else { return }
    NotificationCenter.default.removeObserver(self)
    for engine in hapticEngines {
      engine.stop()
    }
    hapticEngines.removeAll()
    started = false
  }

  func playRedundantHaptic() {
    guard
      let selectedID = store?.preferences.selectedControllerID,
      let controller = GCController.controllers().first(where: { identifier(for: $0) == selectedID }
      ),
      let engine = controller.haptics?.createEngine(withLocality: .default)
    else { return }

    do {
      try engine.start()
      let event = CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.35),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2),
        ],
        relativeTime: 0
      )
      let pattern = try CHHapticPattern(events: [event], parameters: [])
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: 0)
      hapticEngines.append(engine)
      if hapticEngines.count > 4 { hapticEngines.removeFirst() }
    } catch {
      engine.stop()
    }
  }

  @objc private func controllerConnected(_ notification: Notification) {
    guard let controller = notification.object as? GCController else { return }
    configure(controller)
    refreshControllers()
  }

  @objc private func controllerDisconnected(_ notification: Notification) {
    guard let controller = notification.object as? GCController else { return }
    let id = identifier(for: controller)
    store?.handleHostEvent(.controllerDisconnected(id))
    controllerIDs.removeValue(forKey: ObjectIdentifier(controller))
    refreshControllers()
  }

  private func refreshControllers() {
    let controllers = GCController.controllers()
    controllerIDs.removeAll(keepingCapacity: true)
    var countsByBaseID: [String: Int] = [:]
    for controller in controllers {
      let baseID = baseIdentifier(for: controller)
      let occurrence = countsByBaseID[baseID, default: 0] + 1
      countsByBaseID[baseID] = occurrence
      controllerIDs[ObjectIdentifier(controller)] =
        occurrence == 1 ? baseID : "\(baseID)-\(occurrence)"
    }
    controllers.forEach(configure)
    let choices = controllers.map { controller in
      ControllerChoice(
        id: identifier(for: controller), name: controller.vendorName ?? controller.productCategory)
    }
    store?.updateConnectedControllers(choices)
  }

  private func configure(_ controller: GCController) {
    let id = identifier(for: controller)
    guard let gamepad = controller.extendedGamepad else { return }

    bind(gamepad.dpad.up, control: "up", controllerID: id)
    bind(gamepad.dpad.down, control: "down", controllerID: id)
    bind(gamepad.dpad.left, control: "left", controllerID: id)
    bind(gamepad.dpad.right, control: "right", controllerID: id)
    bind(gamepad.buttonA, control: "primary", controllerID: id)
    bind(gamepad.buttonB, control: "secondary", controllerID: id)
  }

  private func bind(_ button: GCControllerButtonInput, control: String, controllerID: String) {
    button.pressedChangedHandler = { [weak self] _, _, isPressed in
      Task { @MainActor [weak self] in
        let physical = PhysicalControl.controllerElement(control)
        if isPressed {
          self?.store?.handleInput(.press(device: .controller(controllerID), control: physical))
        } else {
          self?.store?.handleInput(.release(device: .controller(controllerID), control: physical))
        }
      }
    }
  }

  private func identifier(for controller: GCController) -> String {
    let objectID = ObjectIdentifier(controller)
    if let existing = controllerIDs[objectID] { return existing }
    let id = baseIdentifier(for: controller)
    controllerIDs[objectID] = id
    return id
  }

  private func baseIdentifier(for controller: GCController) -> String {
    let source = [controller.vendorName, controller.productCategory]
      .compactMap { $0 }
      .joined(separator: "-")
      .lowercased()
    let slug =
      source
      .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
      .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    return slug.isEmpty ? "controller" : slug
  }
}

@MainActor
final class PlatformLifecycleMonitor: NSObject {
  private weak var store: ExperienceStore?
  private var started = false

  init(store: ExperienceStore) {
    self.store = store
  }

  func start() {
    guard !started else { return }
    started = true
    let center = NSWorkspace.shared.notificationCenter
    center.addObserver(
      self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
    center.addObserver(
      self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
  }

  func stop() {
    NSWorkspace.shared.notificationCenter.removeObserver(self)
    started = false
  }

  @objc private func willSleep() {
    store?.handleHostEvent(.systemSleep)
  }

  @objc private func didWake() {
    store?.handleHostEvent(.systemWake)
  }
}

struct WindowConfigurator: NSViewRepresentable {
  @ObservedObject var store: ExperienceStore

  func makeCoordinator() -> Coordinator {
    Coordinator(store: store)
  }

  func makeNSView(context: Context) -> WindowProbeView {
    let view = WindowProbeView()
    view.onWindow = context.coordinator.configure
    return view
  }

  func updateNSView(_ nsView: WindowProbeView, context: Context) {
    nsView.onWindow = context.coordinator.configure
  }

  @MainActor
  final class Coordinator {
    private let proxy: WindowDelegateProxy
    private weak var configuredWindow: NSWindow?

    init(store: ExperienceStore) {
      proxy = WindowDelegateProxy(store: store)
    }

    func configure(_ window: NSWindow) {
      guard configuredWindow !== window else { return }
      configuredWindow = window
      let autosaveName = "MacExperiencePrototypeMainWindow"
      let hasSavedFrame =
        UserDefaults.standard.string(forKey: "NSWindow Frame \(autosaveName)") != nil
      window.identifier = NSUserInterfaceItemIdentifier("MacExperiencePrototypeMainWindow")
      window.contentMinSize = NSSize(width: 800, height: 600)
      window.setFrameAutosaveName(autosaveName)
      if !hasSavedFrame { window.center() }
      proxy.forwardDelegate = window.delegate
      window.delegate = proxy
    }
  }
}

final class WindowProbeView: NSView {
  var onWindow: ((NSWindow) -> Void)?

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if let window { onWindow?(window) }
  }
}

@MainActor
final class WindowDelegateProxy: NSObject, NSWindowDelegate {
  private weak var store: ExperienceStore?
  weak var forwardDelegate: NSWindowDelegate?

  init(store: ExperienceStore) {
    self.store = store
  }

  func windowShouldClose(_ sender: NSWindow) -> Bool {
    guard let store else { return true }
    if store.consumeCloseAuthorization() { return true }
    store.requestWindowClose(sender)
    return false
  }

  func windowDidBecomeKey(_ notification: Notification) {
    store?.handleHostEvent(.focusChanged(true))
    forwardDelegate?.windowDidBecomeKey?(notification)
  }

  func windowDidResignKey(_ notification: Notification) {
    store?.handleHostEvent(.focusChanged(false))
    forwardDelegate?.windowDidResignKey?(notification)
  }

  func windowDidMiniaturize(_ notification: Notification) {
    store?.handleHostEvent(.minimized(true))
    forwardDelegate?.windowDidMiniaturize?(notification)
  }

  func windowDidDeminiaturize(_ notification: Notification) {
    store?.handleHostEvent(.minimized(false))
    forwardDelegate?.windowDidDeminiaturize?(notification)
  }

  func windowWillStartLiveResize(_ notification: Notification) {
    store?.handleHostEvent(.liveResize(true))
    forwardDelegate?.windowWillStartLiveResize?(notification)
  }

  func windowDidEndLiveResize(_ notification: Notification) {
    store?.handleHostEvent(.liveResize(false))
    forwardDelegate?.windowDidEndLiveResize?(notification)
  }
}
