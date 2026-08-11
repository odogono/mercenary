import Foundation

package enum SemanticAction: String, CaseIterable, Codable, Hashable, Sendable {
  case moveForward
  case moveBackward
  case turnLeft
  case turnRight
  case primaryAction
  case brake
  case board
  case leave
  case take
  case drop
  case activate
  case pause
  case save
  case load
  case quitSituation
}

package enum DeviceKind: String, Codable, Equatable, Sendable {
  case keyboard
  case controller
}

package enum InputDevice: Codable, Hashable, Sendable {
  case keyboard
  case controller(String)

  package var kind: DeviceKind {
    switch self {
    case .keyboard: .keyboard
    case .controller: .controller
    }
  }
}

package enum PhysicalControl: Codable, Hashable, Sendable {
  case key(String)
  case controllerElement(String)
}

package struct ControlBinding: Codable, Equatable, Sendable {
  package var control: PhysicalControl
  package var action: SemanticAction

  package init(control: PhysicalControl, action: SemanticAction) {
    self.control = control
    self.action = action
  }
}

package struct ControlProfile: Codable, Equatable, Sendable {
  package var name: String
  package var deviceKind: DeviceKind
  package private(set) var bindings: [ControlBinding]

  package init(name: String, deviceKind: DeviceKind, bindings: [ControlBinding]) {
    self.name = name
    self.deviceKind = deviceKind
    self.bindings = bindings
  }

  package func action(for control: PhysicalControl) -> SemanticAction? {
    bindings.first { $0.control == control }?.action
  }

  @discardableResult
  package mutating func assign(_ control: PhysicalControl, to action: SemanticAction)
    -> SemanticAction?
  {
    if let index = bindings.firstIndex(where: { $0.control == control }) {
      let displaced = bindings[index].action
      bindings[index].action = action
      return displaced
    }

    bindings.append(ControlBinding(control: control, action: action))
    return nil
  }
}

extension ControlProfile {
  package static let modernKeyboard = ControlProfile(
    name: "Modern Keyboard",
    deviceKind: .keyboard,
    bindings: [
      .init(control: .key("w"), action: .moveForward),
      .init(control: .key("s"), action: .moveBackward),
      .init(control: .key("a"), action: .turnLeft),
      .init(control: .key("d"), action: .turnRight),
      .init(control: .key("space"), action: .primaryAction),
      .init(control: .key("b"), action: .board),
      .init(control: .key("l"), action: .leave),
      .init(control: .key("t"), action: .take),
      .init(control: .key("e"), action: .activate),
      .init(control: .key("p"), action: .pause),
    ]
  )

  package static let referenceKeyboard = ControlProfile(
    name: "Reference-style Keyboard",
    deviceKind: .keyboard,
    bindings: [
      .init(control: .key("arrow-up"), action: .moveForward),
      .init(control: .key("arrow-down"), action: .moveBackward),
      .init(control: .key("arrow-left"), action: .turnLeft),
      .init(control: .key("arrow-right"), action: .turnRight),
      .init(control: .key("space"), action: .brake),
      .init(control: .key("b"), action: .board),
      .init(control: .key("l"), action: .leave),
      .init(control: .key("t"), action: .take),
      .init(control: .key("d"), action: .drop),
      .init(control: .key("e"), action: .activate),
    ]
  )

  package static let modernController = ControlProfile(
    name: "Modern Controller",
    deviceKind: .controller,
    bindings: [
      .init(control: .controllerElement("up"), action: .moveForward),
      .init(control: .controllerElement("down"), action: .moveBackward),
      .init(control: .controllerElement("left"), action: .turnLeft),
      .init(control: .controllerElement("right"), action: .turnRight),
      .init(control: .controllerElement("primary"), action: .primaryAction),
      .init(control: .controllerElement("secondary"), action: .brake),
    ]
  )

  package static let referenceController = ControlProfile(
    name: "Reference-style Controller",
    deviceKind: .controller,
    bindings: [
      .init(control: .controllerElement("up"), action: .moveForward),
      .init(control: .controllerElement("down"), action: .moveBackward),
      .init(control: .controllerElement("left"), action: .turnLeft),
      .init(control: .controllerElement("right"), action: .turnRight),
      .init(control: .controllerElement("primary"), action: .primaryAction),
    ]
  )
}

package enum InputEvent: Equatable, Sendable {
  case press(device: InputDevice, control: PhysicalControl)
  case release(device: InputDevice, control: PhysicalControl)
  case repeatEvent(device: InputDevice, control: PhysicalControl)
  case systemShortcut(control: PhysicalControl)
}

package struct InputRouter: Sendable {
  package var keyboardProfile: ControlProfile
  package var controllerProfile: ControlProfile
  package var selectedControllerID: String?

  private var pressedInputs: Set<PressedInput> = []

  package var activeActions: Set<SemanticAction> {
    Set(
      pressedInputs.compactMap { pressed in
        guard accepts(pressed.device) else { return nil }
        switch pressed.device.kind {
        case .keyboard:
          return keyboardProfile.action(for: pressed.control)
        case .controller:
          return controllerProfile.action(for: pressed.control)
        }
      })
  }

  package init(
    keyboardProfile: ControlProfile,
    controllerProfile: ControlProfile,
    selectedControllerID: String?
  ) {
    self.keyboardProfile = keyboardProfile
    self.controllerProfile = controllerProfile
    self.selectedControllerID = selectedControllerID
  }

  package mutating func handle(_ event: InputEvent) {
    switch event {
    case .press(let device, let control):
      guard accepts(device) else { return }
      pressedInputs.insert(PressedInput(device: device, control: control))
    case .release(let device, let control):
      pressedInputs.remove(PressedInput(device: device, control: control))
    case .repeatEvent, .systemShortcut:
      break
    }
  }

  package mutating func disconnectController(_ id: String) {
    pressedInputs = Set(
      pressedInputs.filter { input in
        input.device != .controller(id)
      })
    if selectedControllerID == id {
      selectedControllerID = nil
    }
  }

  private func accepts(_ device: InputDevice) -> Bool {
    switch device {
    case .keyboard:
      true
    case .controller(let id):
      id == selectedControllerID
    }
  }
}

private struct PressedInput: Hashable, Sendable {
  var device: InputDevice
  var control: PhysicalControl
}
