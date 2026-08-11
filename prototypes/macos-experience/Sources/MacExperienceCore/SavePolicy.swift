import Foundation

package enum QuickSlot: Int, CaseIterable, Codable, Sendable {
  case zero = 0
  case one
  case two
  case three
  case four
  case five
  case six
  case seven
  case eight
  case nine
}

package enum SaveAvailability: Codable, Equatable, Sendable {
  case available
  case unavailable(String)
}

package enum DestructiveOperation: Equatable, Sendable {
  case load
  case close
  case quit
}

package enum RequiredDecision: Equatable, Sendable {
  case none
  case saveDiscardOrCancel
}

package struct SavePolicy: Equatable, Sendable {
  package static let supportsSemanticAutosave = false

  package var availability: SaveAvailability
  package var isDirty: Bool

  package init(availability: SaveAvailability, isDirty: Bool) {
    self.availability = availability
    self.isDirty = isDirty
  }

  package var canSaveDocument: Bool { isAvailable }
  package var canLoadDocument: Bool { isAvailable }
  package var canUseQuickSlots: Bool { isAvailable }

  package func requiredDecision(for operation: DestructiveOperation) -> RequiredDecision {
    isDirty ? .saveDiscardOrCancel : .none
  }

  private var isAvailable: Bool {
    if case .available = availability { return true }
    return false
  }
}
