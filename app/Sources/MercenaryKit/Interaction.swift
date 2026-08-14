import Foundation

extension Payload {
  /// The rules the Reference Build's take-and-board routine applies.
  public struct InteractionDocument: Codable, Sendable, Equatable {
    public var schemaVersion: Int
    public var takeKey: Int
    public var boardKey: Int
    /// Per-axis reach, counted in ``rangeUnit`` steps.
    public var takeRange: Int
    public var boardRange: Int
    public var rangeUnit: Int
    /// Object slots below this are craft, and the only things boardable.
    public var craftSlotBound: Int
    public var inventoryLimit: Int
    public var fixedMask: Int
    public var heavyMask: Int
    public var carriedMask: Int
    public var descriptionMask: Int
    public var tooHeavyMessage: Int
    public var removedFromWorld: Int
    public var counts: [String: Int]
  }
}

/// What the player is trying to do to the thing in front of them.
public enum InteractionAction: Sendable, Equatable {
  case take
  case board
}

/// Reaching for the world: what the player may take or board, and what happens.
///
/// In the Reference Build this was one routine called once per object from
/// inside the draw loop, so the player could only reach what was being drawn and
/// the rules were whatever that routine consulted. Both parts are kept: the
/// candidates come from the scene, and every rule below was decoded rather than
/// invented.
public struct Interaction: Sendable, Equatable {
  public let takeKey: Int
  public let boardKey: Int
  public let takeRange: Int
  public let boardRange: Int
  public let rangeUnit: Int
  public let craftSlotBound: Int
  public let inventoryLimit: Int
  public let fixedMask: UInt8
  public let heavyMask: UInt8
  public let carriedMask: UInt8
  public let descriptionMask: UInt8
  public let tooHeavyMessage: Int

  public init(document: Payload.InteractionDocument) {
    takeKey = document.takeKey
    boardKey = document.boardKey
    takeRange = document.takeRange
    boardRange = document.boardRange
    rangeUnit = document.rangeUnit
    craftSlotBound = document.craftSlotBound
    inventoryLimit = document.inventoryLimit
    fixedMask = UInt8(truncatingIfNeeded: document.fixedMask)
    heavyMask = UInt8(truncatingIfNeeded: document.heavyMask)
    carriedMask = UInt8(truncatingIfNeeded: document.carriedMask)
    descriptionMask = UInt8(truncatingIfNeeded: document.descriptionMask)
    tooHeavyMessage = document.tooHeavyMessage
  }

  /// One thing the player could reach for.
  public struct Candidate: Sendable, Equatable {
    public var slot: Int
    public var position: SIMD3<Double>

    public init(slot: Int, position: SIMD3<Double>) {
      self.slot = slot
      self.position = position
    }
  }

  /// What came of reaching. The refusals are distinct because the Reference
  /// Build distinguished them: one is silent, one has a message of its own.
  public enum Outcome: Sendable, Equatable {
    case took(slot: Int)
    case boarded(slot: Int)
    /// Nothing was close enough, or nothing there could be reached at all.
    case nothingInReach
    /// Close enough, but bolted down.
    case fixedInPlace(slot: Int)
    /// Close enough, but too heavy to carry.
    case tooHeavy(slot: Int)
    case handsFull
    /// Only craft can be boarded.
    case notACraft(slot: Int)
    /// Already aboard something, so there is nothing to climb into.
    case alreadyAboard
  }

  /// Whether an object is within reach on every axis.
  ///
  /// The Reference Build compared each axis difference separately, discarding
  /// its low byte, so reach is a cube and its edge is a whole number of range
  /// units rather than a smooth distance.
  public func isWithinReach(_ candidate: Candidate, of player: SIMD3<Double>, range: Int) -> Bool {
    let limit = Double(range * rangeUnit) + Double(rangeUnit - 1)
    let difference = candidate.position - player
    return abs(difference.x) <= limit && abs(difference.y) <= limit && abs(difference.z) <= limit
  }

  public func isCraft(_ slot: Int) -> Bool { slot < craftSlotBound }

  /// The nearest candidate within reach, which is what the player meant.
  ///
  /// The original acted on the first match in draw order; with a reach this
  /// tight there is rarely more than one, and taking the nearest is the answer a
  /// player would predict when there is.
  func nearest(
    among candidates: [Candidate], to player: SIMD3<Double>, within range: Int
  ) -> Candidate? {
    candidates
      .filter { isWithinReach($0, of: player, range: range) }
      .min { first, second in
        distanceSquared(first.position, player) < distanceSquared(second.position, player)
      }
  }

  private func distanceSquared(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double {
    let d = a - b
    return d.x * d.x + d.y * d.y + d.z * d.z
  }

  /// Try to take or board, and say what happened.
  ///
  /// The host state is updated in place for whatever succeeded, so the caller's
  /// remaining job is presentation: the message, the sound, and where the player
  /// now stands.
  public func attempt(
    _ action: InteractionAction,
    from player: SIMD3<Double>,
    among candidates: [Candidate],
    host: inout BensonHostState
  ) -> Outcome {
    switch action {
    case .take:
      guard let candidate = nearest(among: candidates, to: player, within: takeRange) else {
        return .nothingInReach
      }
      let flags = host.objectFlags[candidate.slot] ?? 0
      if !host.canTakeAnything, flags & fixedMask != 0 {
        return .fixedInPlace(slot: candidate.slot)
      }
      if !host.canLiftAnything, flags & heavyMask != 0 {
        return .tooHeavy(slot: candidate.slot)
      }
      guard host.inventory.count < inventoryLimit else { return .handsFull }
      host.inventory.insert(candidate.slot)
      host.objectFlags[candidate.slot] = flags | carriedMask
      host.objectRooms[candidate.slot] = BensonHostState.outOfTheWorld
      return .took(slot: candidate.slot)

    case .board:
      guard host.boardedCraft == BensonHostState.onFoot else { return .alreadyAboard }
      guard let candidate = nearest(among: candidates, to: player, within: boardRange) else {
        return .nothingInReach
      }
      guard isCraft(candidate.slot) else { return .notACraft(slot: candidate.slot) }
      host.boardedCraft = candidate.slot
      host.objectRooms[candidate.slot] = BensonHostState.outOfTheWorld
      return .boarded(slot: candidate.slot)
    }
  }

  /// Step out of the boarded craft, which puts it back where the player is.
  ///
  /// Boarding takes the craft out of the world; leaving has to undo both halves of
  /// that or the craft is gone for good. The Reference Build copied the camera's
  /// position back into the craft's own, which is what makes it possible to fly
  /// somewhere, get out, and find it still standing there.
  public func leave(host: inout BensonHostState) -> Int? {
    let slot = host.boardedCraft
    guard slot != BensonHostState.onFoot else { return nil }
    host.boardedCraft = BensonHostState.onFoot
    host.objectRooms[slot] = Interaction.surfaceRoom
    return slot
  }

  /// The room a craft belongs to when it is standing on the surface.
  public static let surfaceRoom = 0

  /// What an object says when the player reaches it: a message, a script, or
  /// nothing. The Reference Build packed the choice into two flag bits, and both
  /// the take and the board path consult it.
  public enum Description: Sendable, Equatable {
    case none
    case message(Int)
    case script(Int)
  }

  public func description(of slot: Int, flags: UInt8) -> Description {
    let selector = flags & descriptionMask
    if selector == 0 { return .none }
    // The low bit alone selects a script; anything higher selects a message.
    return (selector >> 3) == 0 ? .script(slot) : .message(slot)
  }
}
