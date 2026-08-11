import AppKit
import Combine
import Foundation
import MacExperienceCore
import UniformTypeIdentifiers

@MainActor
final class ExperienceStore: ObservableObject {
  @Published private(set) var preferences: ExperiencePreferences
  @Published private(set) var session = PrototypeSession()
  @Published private(set) var activeActions: Set<SemanticAction> = []
  @Published private(set) var isDirty = false
  @Published private(set) var syntheticHeading = 84.0
  @Published var isMessageVisible = true
  @Published var isSaveGateOpen = true
  @Published var bindingConflict: BindingConflict?
  @Published var confirmationContext: String?
  @Published private(set) var connectedControllers: [ControllerChoice] = []

  private let defaults: UserDefaults
  private var inputRouter: InputRouter
  private var pendingBinding: PendingBinding?
  private var pendingDestructiveAction: (() -> Void)?
  private var closeAuthorization = false
  private(set) lazy var controllerMonitor = ControllerMonitor(store: self)
  private(set) lazy var keyboardMonitor = KeyboardMonitor(store: self)
  private(set) lazy var lifecycleMonitor = PlatformLifecycleMonitor(store: self)

  private static let preferencesKey = "mercenary.prototype.experience-preferences"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let decoded = defaults.data(forKey: Self.preferencesKey)
      .flatMap { try? JSONDecoder().decode(ExperiencePreferences.self, from: $0) }
    let preferences = decoded ?? .default
    self.preferences = preferences
    inputRouter = InputRouter(
      keyboardProfile: preferences.keyboardProfile,
      controllerProfile: preferences.controllerProfile,
      selectedControllerID: preferences.selectedControllerID
    )
  }

  var savePolicy: SavePolicy {
    SavePolicy(
      availability: isSaveGateOpen ? .available : .unavailable("Evidence-pending state"),
      isDirty: isDirty
    )
  }

  func startPlatformMonitoring() {
    keyboardMonitor.start()
    controllerMonitor.start()
    lifecycleMonitor.start()
  }

  func stopPlatformMonitoring() {
    keyboardMonitor.stop()
    controllerMonitor.stop()
    lifecycleMonitor.stop()
  }

  func advanceSimulation(by interval: TimeInterval) {
    session.advance(by: interval)
    if activeActions.contains(.turnLeft) { syntheticHeading -= interval * 18 }
    if activeActions.contains(.turnRight) { syntheticHeading += interval * 18 }
  }

  func handleInput(_ event: InputEvent) {
    let wasPaused = activeActions.contains(.pause)
    inputRouter.handle(event)
    activeActions = inputRouter.activeActions

    if activeActions.contains(.pause), !wasPaused {
      session.togglePause()
    }
    if case .press = event {
      let nonMutatingActions: Set<SemanticAction> = [.pause, .save, .load]
      if !activeActions.subtracting(nonMutatingActions).isEmpty {
        isDirty = true
      }
      if activeActions.contains(.primaryAction), preferences.hapticsEnabled {
        controllerMonitor.playRedundantHaptic()
      }
    }
  }

  func handleHostEvent(_ event: HostEvent) {
    if case .controllerDisconnected(let id) = event {
      inputRouter.disconnectController(id)
      activeActions = inputRouter.activeActions
    }
    session.handleHostEvent(event)
  }

  func dismissHostNotice() {
    session.dismissHostNotice()
  }

  func togglePause() {
    session.togglePause()
  }

  func toggleMessage() {
    isMessageVisible.toggle()
  }

  func markWelcomeShown() {
    guard !preferences.hasShownWelcome else { return }
    preferences.hasShownWelcome = true
    persistPreferences()
  }

  func useKeyboardProfile(_ profile: ControlProfile) {
    preferences.keyboardProfile = profile
    syncProfilesAndPersist()
  }

  func useControllerProfile(_ profile: ControlProfile) {
    preferences.controllerProfile = profile
    syncProfilesAndPersist()
  }

  func requestBinding(_ control: PhysicalControl, to action: SemanticAction, deviceKind: DeviceKind)
  {
    let profile =
      deviceKind == .keyboard ? preferences.keyboardProfile : preferences.controllerProfile
    if let displaced = profile.action(for: control), displaced != action {
      pendingBinding = PendingBinding(control: control, action: action, deviceKind: deviceKind)
      bindingConflict = BindingConflict(control: control, displaced: displaced, replacement: action)
      return
    }
    applyBinding(control, to: action, deviceKind: deviceKind)
  }

  func confirmBindingConflict() {
    guard let pendingBinding else { return }
    applyBinding(
      pendingBinding.control, to: pendingBinding.action, deviceKind: pendingBinding.deviceKind)
    self.pendingBinding = nil
    bindingConflict = nil
  }

  func cancelBindingConflict() {
    pendingBinding = nil
    bindingConflict = nil
  }

  func updateAccommodations(_ update: (inout AccommodationSettings) -> Void) {
    update(&preferences.accommodations)
    persistPreferences()
  }

  func updateAudio(master: Double? = nil, music: Double? = nil, effects: Double? = nil) {
    if let master { preferences.masterVolume = master }
    if let music { preferences.musicVolume = music }
    if let effects { preferences.effectsVolume = effects }
    persistPreferences()
  }

  func setHapticsEnabled(_ enabled: Bool) {
    preferences.hapticsEnabled = enabled
    persistPreferences()
  }

  func selectController(_ id: String?) {
    preferences.selectedControllerID = id
    inputRouter.selectedControllerID = id
    activeActions = inputRouter.activeActions
    persistPreferences()
  }

  func updateConnectedControllers(_ choices: [ControllerChoice]) {
    connectedControllers = choices
    let availableIDs = Set(choices.map(\.id))
    if let selected = preferences.selectedControllerID, availableIDs.contains(selected) {
      return
    }
    selectController(choices.first?.id)
  }

  @discardableResult
  func saveDocument() -> Bool {
    guard savePolicy.canSaveDocument else {
      showHostNotice("Saving is unavailable in this evidence-pending state.")
      return false
    }

    let panel = NSSavePanel()
    panel.allowedContentTypes = [.json]
    panel.nameFieldStringValue = "Synthetic Session.json"
    guard panel.runModal() == .OK, let url = panel.url else { return false }

    do {
      try encodedPayload().write(to: url, options: .atomic)
      isDirty = false
      return true
    } catch {
      showHostNotice("The synthetic save could not be written.")
      return false
    }
  }

  func requestLoadDocument() {
    requestDestructive(operation: .load, context: "Loading a document replaces unsaved progress.") {
      [weak self] in
      self?.loadDocumentNow()
    }
  }

  func saveQuickSlot(_ slot: QuickSlot) {
    guard savePolicy.canUseQuickSlots else {
      showHostNotice("Quick slots are unavailable in this evidence-pending state.")
      return
    }
    defaults.set(encodedPayload(), forKey: quickSlotKey(slot))
    isDirty = false
    showHostNotice("Synthetic session saved to quick slot \(slot.rawValue).")
  }

  func requestLoadQuickSlot(_ slot: QuickSlot) {
    requestDestructive(
      operation: .load, context: "Quick-loading slot \(slot.rawValue) replaces unsaved progress."
    ) { [weak self] in
      self?.loadQuickSlotNow(slot)
    }
  }

  func requestQuit() {
    requestDestructive(operation: .quit, context: "Quitting discards unsaved progress.") {
      [weak self] in
      self?.isDirty = false
      NSApp.terminate(nil)
    }
  }

  func requestWindowClose(_ window: NSWindow) {
    requestDestructive(operation: .close, context: "Closing the window discards unsaved progress.")
    { [weak self, weak window] in
      self?.isDirty = false
      self?.closeAuthorization = true
      window?.performClose(nil)
    }
  }

  func consumeCloseAuthorization() -> Bool {
    if closeAuthorization {
      closeAuthorization = false
      return true
    }
    return !isDirty
  }

  func confirmSaveBeforeDestructiveAction() {
    guard saveDocument() else { return }
    performPendingDestructiveAction()
  }

  func confirmDiscardBeforeDestructiveAction() {
    isDirty = false
    performPendingDestructiveAction()
  }

  func cancelDestructiveAction() {
    pendingDestructiveAction = nil
    confirmationContext = nil
  }

  private func requestDestructive(
    operation: DestructiveOperation, context: String, action: @escaping () -> Void
  ) {
    guard savePolicy.requiredDecision(for: operation) == .saveDiscardOrCancel else {
      action()
      return
    }
    pendingDestructiveAction = action
    confirmationContext = context
  }

  private func performPendingDestructiveAction() {
    let action = pendingDestructiveAction
    pendingDestructiveAction = nil
    confirmationContext = nil
    action?()
  }

  private func applyBinding(
    _ control: PhysicalControl, to action: SemanticAction, deviceKind: DeviceKind
  ) {
    if deviceKind == .keyboard {
      preferences.keyboardProfile.assign(control, to: action)
      preferences.keyboardProfile.name = "Custom Keyboard"
    } else {
      preferences.controllerProfile.assign(control, to: action)
      preferences.controllerProfile.name = "Custom Controller"
    }
    syncProfilesAndPersist()
  }

  private func syncProfilesAndPersist() {
    inputRouter.keyboardProfile = preferences.keyboardProfile
    inputRouter.controllerProfile = preferences.controllerProfile
    persistPreferences()
  }

  private func persistPreferences() {
    if let data = try? JSONEncoder().encode(preferences) {
      defaults.set(data, forKey: Self.preferencesKey)
    }
  }

  private func encodedPayload() -> Data {
    let payload = SyntheticSavePayload(
      format: "PROTOTYPE-ONLY",
      simulationTime: session.simulationTime,
      heading: syntheticHeading,
      createdAt: Date()
    )
    return (try? JSONEncoder().encode(payload)) ?? Data()
  }

  private func loadDocumentNow() {
    guard savePolicy.canLoadDocument else {
      showHostNotice("Loading is unavailable in this evidence-pending state.")
      return
    }
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.json]
    panel.allowsMultipleSelection = false
    guard panel.runModal() == .OK, let url = panel.url else { return }
    do {
      let values = try url.resourceValues(forKeys: [.fileSizeKey])
      guard (values.fileSize ?? 0) <= SyntheticSavePayload.maximumByteCount else {
        throw PrototypeSaveError.fileTooLarge
      }
      try restore(from: Data(contentsOf: url))
    } catch {
      showHostNotice("The selected file is not a valid synthetic prototype save.")
    }
  }

  private func loadQuickSlotNow(_ slot: QuickSlot) {
    guard savePolicy.canUseQuickSlots, let data = defaults.data(forKey: quickSlotKey(slot)) else {
      showHostNotice("Quick slot \(slot.rawValue) is empty or unavailable.")
      return
    }
    do {
      try restore(from: data)
      showHostNotice("Synthetic session loaded from quick slot \(slot.rawValue).")
    } catch {
      showHostNotice("Quick slot \(slot.rawValue) could not be read.")
    }
  }

  private func restore(from data: Data) throws {
    guard data.count <= SyntheticSavePayload.maximumByteCount else {
      throw PrototypeSaveError.fileTooLarge
    }
    let payload = try JSONDecoder().decode(SyntheticSavePayload.self, from: data)
    guard
      payload.format == "PROTOTYPE-ONLY",
      payload.simulationTime.isFinite,
      payload.simulationTime >= 0,
      payload.heading.isFinite
    else { throw PrototypeSaveError.invalidFormat }
    session.restore(to: payload.simulationTime)
    syntheticHeading = payload.heading
    isDirty = false
  }

  private func quickSlotKey(_ slot: QuickSlot) -> String {
    "mercenary.prototype.quick-slot.\(slot.rawValue)"
  }

  private func showHostNotice(_ message: String) {
    session = session.withHostNotice(message)
  }
}

struct BindingConflict: Identifiable {
  let id = UUID()
  var control: PhysicalControl
  var displaced: SemanticAction
  var replacement: SemanticAction
}

struct ControllerChoice: Identifiable, Hashable {
  var id: String
  var name: String
}

private struct PendingBinding {
  var control: PhysicalControl
  var action: SemanticAction
  var deviceKind: DeviceKind
}

private struct SyntheticSavePayload: Codable {
  static let maximumByteCount = 64 * 1_024

  var format: String
  var simulationTime: TimeInterval
  var heading: Double
  var createdAt: Date
}

private enum PrototypeSaveError: Error {
  case invalidFormat
  case fileTooLarge
}

extension PrototypeSession {
  fileprivate func withHostNotice(_ message: String) -> PrototypeSession {
    var copy = self
    copy.setHostNotice(message)
    return copy
  }
}
