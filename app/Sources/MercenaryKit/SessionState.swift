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

/// How the Room the player is in looks right now.
///
/// This is a session fact rather than a property of the Room: darkness depends on
/// where the photon emitter is, which changes during play. Both renderers take the
/// scene from here so that neither has to decide for itself what dark means.
public struct IndoorScene: Sendable, Equatable {
  /// The two colours the indoor backdrop alternates between.
  public var background: Int
  public var foreground: Int
  /// The colour the Room's wireframe is drawn in. Global in the Reference Build —
  /// every Room setup stores the same value — which is why no Room carries it.
  public var lineColour: Int
  /// Whether the Room is dark *now*. Nothing is drawn in a dark Room; the three
  /// colours above are all zero, which is the Reference Build's own way of saying it.
  public var dark: Bool

  public init(background: Int, foreground: Int, lineColour: Int, dark: Bool) {
    self.background = background
    self.foreground = foreground
    self.lineColour = lineColour
    self.dark = dark
  }

  /// How a Room looks, given where the photon emitter has got to.
  ///
  /// One implementation, because both renderers ask and the answer must not differ
  /// between them: a Room the payload marks dark is dark unless the emitter is in the
  /// player's hands or lying in that same Room. Darkness zeroes all three colours
  /// together, which is the Reference Build's own way of saying nothing is visible.
  public init(
    room: Room, rules: Payload.RoomsDocument.DoorwayRules, emitter: Residence
  ) {
    let lit = emitter.isCarried || emitter.hostRoom == room.id
    if room.dark && !lit {
      self.init(background: 0, foreground: 0, lineColour: 0, dark: true)
    } else {
      self.init(
        background: room.palette.background, foreground: room.palette.foreground,
        lineColour: rules.lineColour, dark: false
      )
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
  /// Where objects have got to, for whoever is drawing them. One value rather than
  /// the two derived views it used to carry — the slots taken out of the world, and
  /// the positions of those that had moved — which were both readings of this.
  public var residence: [Int: Residence]
  /// The Room as it looks now, or nil on the surface.
  public var indoor: IndoorScene?
  /// Whether the world is mirrored left for right, which both renderers must obey.
  public var worldFlipped: Bool

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
    residence: [Int: Residence],
    indoor: IndoorScene? = nil,
    worldFlipped: Bool = false
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
    self.residence = residence
    self.indoor = indoor
    self.worldFlipped = worldFlipped
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
  /// The player walked into a Room's wall, carrying the sound the Reference Build
  /// made of it. Once per contact, not once per frame of leaning on it.
  ///
  /// Nothing plays it yet — per-frame audio is out of scope for this work — but the
  /// event is where the fidelity is: it fires exactly when the Reference Build's own
  /// latch fires, which is also the moment a Doorway is looked for.
  case wall(sound: Int)
  /// The world was mirrored left for right, or put back.
  case worldFlipped(Bool)
}
