import Foundation

/// Which space the player is in.
///
/// The Reference Build keeps one room variable and consults it before it decides
/// anything else. This is that variable, typed: the surface is its own case rather
/// than a room id of zero, so the two cannot be confused at a call site.
public enum Location: Sendable, Equatable {
  case surface
  case room(Int)

  /// The room id, or nil on the surface.
  public var room: Int? {
    switch self {
    case .surface: return nil
    case .room(let id): return id
    }
  }

  /// How the Host Callout names this, where zero means the surface.
  public var hostValue: Int {
    switch self {
    case .surface: return 0
    case .room(let id): return id
    }
  }

  public init(hostValue: Int) {
    self = hostValue == 0 ? .surface : .room(hostValue)
  }
}

/// What the player is in.
public enum Occupancy: Sendable, Equatable {
  case onFoot
  case aboard(Int)

  /// The craft's object slot, or nil on foot.
  public var craft: Int? {
    switch self {
    case .onFoot: return nil
    case .aboard(let slot): return slot
    }
  }

  /// How the Host Callout names this, which has its own sentinel for on foot.
  public var hostValue: Int {
    switch self {
    case .onFoot: return BensonHostState.onFoot
    case .aboard(let slot): return slot
    }
  }

  public init(hostValue: Int) {
    self = hostValue == BensonHostState.onFoot ? .onFoot : .aboard(hostValue)
  }
}

/// Where one object is.
///
/// The Reference Build keeps two facts per object — a room-membership byte, and a
/// carried bit in its state flags — and the payload carries the placement each one
/// starts at. Those had grown into four representations here, two of which said
/// the same thing and could disagree, so they are one value now and the Host
/// Callout's byte-wide views are projected from it.
public enum Residence: Sendable, Equatable {
  /// On the surface. A position displaces the object from where the payload put
  /// it, which is what happens to a craft the player parks somewhere else; nil
  /// means it is still where the payload placed it.
  case surface(at: SIMD3<Double>?)
  case room(Int)
  case carried
  /// Out of the world: being flown, or destroyed with it.
  case gone

  public var isCarried: Bool { self == .carried }

  /// Where this object has been moved to, if it has been.
  public var displacement: SIMD3<Double>? {
    guard case .surface(let position) = self else { return nil }
    return position
  }

  /// How the Host Callout's room-membership table names this.
  public var hostRoom: Int {
    switch self {
    case .surface: return Interaction.surfaceRoom
    case .room(let id): return id
    case .carried, .gone: return BensonHostState.outOfTheWorld
    }
  }
}

/// One consistent description of a session, for whoever is drawing it.
///
/// Both renderers consume this rather than reading the session's parts, so the
/// interactive and headless paths cannot drift into showing different things —
/// and a parity check has one value to compare instead of a list of properties.
public struct SessionSnapshot: Sendable, Equatable {
  public var player: PlayerState
  public var location: Location
  public var occupancy: Occupancy
  public var mode: FlightMode
  public var throttle: Double
  /// The throttle as a notch on the decoded ladder, or 0 when shut.
  public var throttleNotch: Int
  public var elapsed: Double
  /// What the message line shows right now.
  public var message: String
  public var credits: Int
  /// Whether a script currently owns the message line.
  public var isScriptRunning: Bool
  /// Slots the game has taken out of the world, so the renderer stops drawing them.
  public var hiddenSlots: Set<Int>
  /// Objects that are no longer where the payload put them.
  public var displacedObjects: [Int: SIMD3<Double>]

  public init(
    player: PlayerState,
    location: Location,
    occupancy: Occupancy,
    mode: FlightMode,
    throttle: Double,
    throttleNotch: Int,
    elapsed: Double,
    message: String,
    credits: Int,
    isScriptRunning: Bool,
    hiddenSlots: Set<Int>,
    displacedObjects: [Int: SIMD3<Double>]
  ) {
    self.player = player
    self.location = location
    self.occupancy = occupancy
    self.mode = mode
    self.throttle = throttle
    self.throttleNotch = throttleNotch
    self.elapsed = elapsed
    self.message = message
    self.credits = credits
    self.isScriptRunning = isScriptRunning
    self.hiddenSlots = hiddenSlots
    self.displacedObjects = displacedObjects
  }
}

/// Something that happened which only presentation should answer.
///
/// The session decides what happened; a shell decides whether that is a beep, a
/// sound file, or nothing at all. Script effects travel through unchanged, since
/// the Host Callout already models them and they are part of the same sequence.
public enum PresentationEvent: Sendable, Equatable {
  /// The tone the Reference Build answered an accepted action with.
  case tone
  /// A script asked the host to do something.
  case script(BensonEffect)
  /// A touchdown ended, one way or the other.
  case touchdown(Touchdown)
  /// The lift arrived somewhere.
  case arrived(Location)
}
