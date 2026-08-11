import Foundation

package enum HostEvent: Equatable, Sendable {
  case focusChanged(Bool)
  case minimized(Bool)
  case liveResize(Bool)
  case systemSleep
  case systemWake
  case controllerDisconnected(String)
}

package struct PrototypeSession: Equatable, Sendable {
  package private(set) var simulationTime: TimeInterval = 0
  package private(set) var isPaused = false
  package private(set) var isSystemSleeping = false
  package private(set) var hostNotice: String?

  package init() {}

  package mutating func togglePause() {
    isPaused.toggle()
  }

  package mutating func advance(by interval: TimeInterval) {
    guard interval > 0, !isPaused, !isSystemSleeping else { return }
    simulationTime += interval
  }

  package mutating func handleHostEvent(_ event: HostEvent) {
    switch event {
    case .systemSleep:
      isSystemSleeping = true
    case .systemWake:
      isSystemSleeping = false
    case .controllerDisconnected:
      hostNotice = "Controller disconnected. Keyboard controls remain available."
    case .focusChanged, .minimized, .liveResize:
      break
    }
  }

  package mutating func dismissHostNotice() {
    hostNotice = nil
  }

  package mutating func setHostNotice(_ notice: String) {
    hostNotice = notice
  }

  package mutating func restore(to simulationTime: TimeInterval) {
    self.simulationTime = max(0, simulationTime)
    isPaused = false
  }
}
