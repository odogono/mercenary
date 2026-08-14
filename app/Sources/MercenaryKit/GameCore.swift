import Foundation

/// A device-independent movement intent for one simulation step.
///
/// The app layer turns keys into this; the core never sees an input device. Axes
/// are clamped to -1...1 on construction so a caller cannot smuggle in extra
/// speed. Throttle is not here: in the Reference Build it is a persistent setting
/// rather than a held input, so it lives in ``GameState`` and is changed through
/// ``GameCore/throttle(_:notch:rules:)`` and ``GameCore/throttle(_:step:rules:)``.
public struct Intent: Sendable, Equatable {
  /// Yaw input. Positive turns right, which the loop reaches by negating the
  /// craft's yaw authority exactly as the Reference Build's `INY` on a sign bit did.
  public var turn: Double
  /// Pitch input. Positive is nose up.
  public var pitch: Double
  /// On foot only: how hard the player is walking.
  ///
  /// A Mac Adaptation of the throttle. Walking in the Reference Build ran on the
  /// same persistent throttle a craft uses, which on a keyboard would mean the
  /// player keeps walking after letting go, so on foot the throttle follows the
  /// key instead. The dynamics are still the walking block's.
  public var walk: Double
  public var running: Bool

  public static let idle = Intent()

  public init(turn: Double = 0, pitch: Double = 0, walk: Double = 0, running: Bool = false) {
    self.turn = Intent.clamp(turn)
    self.pitch = Intent.clamp(pitch)
    self.walk = Intent.clamp(walk)
    self.running = running
  }

  private static func clamp(_ value: Double) -> Double {
    value.isFinite ? Swift.min(1, Swift.max(-1, value)) : 0
  }
}

/// The decoded craft dynamics the loop runs on, plus the few values that are ours.
///
/// Everything in `document` came out of the Reference Build; everything in
/// `limits` is either a host bound or a tuning knob, and none of it changes what
/// the loop computes from the decoded parameters.
public struct FlightModel: Sendable, Equatable {
  public var document: Payload.FlightDocument
  public var limits: ControlLimits

  /// One angle unit in radians. The Reference Build's turn is 1024 units.
  public let radiansPerUnit: Double
  /// Eye height on foot: the tuning knob's, or the Reference Build's own.
  public let groundAltitude: Double
  /// The throttle a step and a run stand for, off the ladder once rather than
  /// per frame — the notches are fixed for as long as the model lives.
  let walkThrottle: Double
  let runThrottle: Double

  public init(document: Payload.FlightDocument, limits: ControlLimits = ControlLimits()) {
    self.document = document
    self.limits = limits
    self.radiansPerUnit = 2 * Double.pi / Double(document.rules.angleUnitsPerTurn)
    self.groundAltitude = limits.groundAltitude ?? Double(document.rules.groundAltitude)
    let ladder = document.rules.throttleNotches
    func notch(_ wanted: Int) -> Double {
      guard !ladder.isEmpty else { return 0 }
      return ladder[Swift.min(Swift.max(wanted - 1, 0), ladder.count - 1)]
    }
    self.walkThrottle = notch(limits.walkNotch)
    self.runThrottle = notch(limits.runNotch)
  }

  public var rules: Payload.FlightDocument.Rules { document.rules }

  public func block(for state: GameState) -> Payload.FlightDocument.Block {
    document.block(craft: state.craft)
  }

  /// Whether the Reference Build's one craft-conditioned bonus applies here.
  func hasPoweramp(_ state: GameState) -> Bool {
    state.poweramp && state.craft == rules.poweramp.craft
  }

  /// The throttle the loop actually sees, after the walking substitution and the
  /// Reference Build's one Object-Conditioned Predicate on the player's first craft.
  func effectiveThrottle(for state: GameState, intent: Intent) -> Double {
    var throttle = state.throttle
    if state.craft == nil {
      throttle = intent.walk * (intent.running ? runThrottle : walkThrottle)
    }
    if hasPoweramp(state) {
      throttle *= rules.poweramp.throttleScale
    }
    return throttle
  }

  /// Which notch a throttle key stands for, counting from the ladder window's
  /// floor and stopping at the top rather than running off it.
  public func notch(forKey key: Int) -> Int {
    let ladder = rules.throttleNotches.count
    return Swift.min(ladder, Swift.max(1, limits.throttleFloorNotch + key - 1))
  }

  /// This craft's ceiling, raised for the one craft the poweramp lifts.
  func ceiling(for state: GameState, block: Payload.FlightDocument.Block) -> Double {
    guard hasPoweramp(state) else { return Double(block.ceiling) }
    return Double(Swift.max(block.ceiling, rules.poweramp.ceiling))
  }
}

/// Host bounds and the tuning knobs for how the decoded dynamics feel.
///
/// The Reference Build's parameters are per-frame values, so the rate they were
/// written for is the one knob that changes everything at once; the scales are
/// there for judging feel by playing (ADR 0014).
public struct ControlLimits: Sendable, Equatable {
  /// Frames per second the decoded parameters were written for. The loop solves
  /// its filters for any timestep, so this sets the pace without setting the
  /// simulation's step.
  public var referenceFrameRate: Double
  public var turnScale: Double
  public var pitchScale: Double
  public var speedScale: Double
  /// Which throttle notch a step and a run stand for while on foot.
  public var walkNotch: Int
  public var runNotch: Int
  /// The notch the lowest throttle key selects.
  ///
  /// The decoded ladder is ten notches each twice the last, so it spans 512 to 1
  /// and its bottom rungs are imperceptible whatever the overall speed. Starting
  /// the keys part way up trades reach for ten keys that all do something. It maps
  /// keys to notches and changes nothing about the ladder itself.
  public var throttleFloorNotch: Int
  public var groundExtent: Double
  /// Eye height on foot. Defaults to the Reference Build's own ground altitude,
  /// which the payload carries, and is here so it can be judged separately.
  public var groundAltitude: Double?

  public init(
    referenceFrameRate: Double = 20,
    turnScale: Double = 1,
    pitchScale: Double = 1,
    speedScale: Double = 1,
    walkNotch: Int = 4,
    runNotch: Int = 6,
    throttleFloorNotch: Int = 1,
    groundExtent: Double = 1_048_576,
    groundAltitude: Double? = nil
  ) {
    self.referenceFrameRate = referenceFrameRate
    self.turnScale = turnScale
    self.pitchScale = pitchScale
    self.speedScale = speedScale
    self.walkNotch = walkNotch
    self.runNotch = runNotch
    self.throttleFloorNotch = throttleFloorNotch
    self.groundExtent = groundExtent
    self.groundAltitude = groundAltitude
  }
}

public struct PlayerState: Sendable, Equatable {
  /// World position; the vertical component is altitude, which flight moves.
  public var position: SIMD3<Double>
  /// Radians clockwise from +Z.
  public var heading: Double
  /// Radians, positive nose up.
  public var pitch: Double
  /// Radians. Set from yaw velocity while flying, so a craft banks into its turn.
  public var roll: Double
  /// Angle units per reference frame. Damped and driven by the yaw input.
  public var yawVelocity: Double
  /// World units per reference frame. Damped and driven by the throttle.
  public var speed: Double

  public init(
    position: SIMD3<Double>,
    heading: Double = 0,
    pitch: Double = 0,
    roll: Double = 0,
    yawVelocity: Double = 0,
    speed: Double = 0
  ) {
    self.position = position
    self.heading = heading
    self.pitch = pitch
    self.roll = roll
    self.yawVelocity = yawVelocity
    self.speed = speed
  }
}

public struct GameState: Sendable, Equatable {
  public var player: PlayerState
  public var elapsed: Double
  public var mode: FlightMode
  /// The boarded craft's slot, or nil on foot. Selects the Craft Parameter Block.
  public var craft: Int?
  /// Throttle in the engine's own world units, persistent as the original's was.
  public var throttle: Double
  /// Whether a poweramp is fitted, which the Reference Build reads for one craft.
  public var poweramp: Bool
  /// How the last touchdown ended, for the caller to act on once.
  public var touchdown: Touchdown?

  public init(
    player: PlayerState,
    elapsed: Double = 0,
    mode: FlightMode = .grounded,
    craft: Int? = nil,
    throttle: Double = 0,
    poweramp: Bool = false,
    touchdown: Touchdown? = nil
  ) {
    self.player = player
    self.elapsed = elapsed
    self.mode = mode
    self.craft = craft
    self.throttle = throttle
    self.poweramp = poweramp
    self.touchdown = touchdown
  }
}

/// The simulation. A pure function of state, intent and elapsed time.
///
/// Determinism is kept as a design property rather than a logging system: the
/// same inputs always produce the same state, which is what makes a side-by-side
/// comparison against the Reference Build meaningful.
///
/// Walking and flying are one loop over different Craft Parameter Blocks, as they
/// were in the Reference Build — see `notes/decode/flight.md`.
public enum GameCore {
  /// Longest step the integrator will take at once. A stalled frame becomes
  /// several bounded steps instead of one teleport through the world.
  public static let maximumStep: Double = 1.0 / 30.0

  public static func step(_ state: GameState, intent: Intent, dt: Double, flight: FlightModel) -> GameState {
    guard dt.isFinite, dt > 0 else { return state }
    var result = state
    result.touchdown = nil
    var remaining = dt
    while remaining > 0 {
      let slice = Swift.min(remaining, maximumStep)
      result = integrate(result, intent: intent, dt: slice, flight: flight)
      remaining -= slice
    }
    return result
  }

  /// Set the throttle to one of the ladder's notches, as a digit key did.
  public static func throttle(_ state: GameState, notch: Int, rules: Payload.FlightDocument.Rules) -> GameState {
    guard (1...rules.throttleNotches.count).contains(notch) else { return state }
    var result = state
    result.throttle = rules.throttleNotches[notch - 1]
    return result
  }

  /// Double or halve the throttle, as the relative keys did, stopping at the
  /// engine's own limit and at the bottom of the ladder.
  public static func throttle(_ state: GameState, step: Int, rules: Payload.FlightDocument.Rules) -> GameState {
    guard step != 0, let lowest = rules.throttleNotches.first else { return state }
    var result = state
    if step > 0 {
      let raised = result.throttle == 0 ? lowest : result.throttle * 2
      // The Reference Build refused the change rather than clamping it.
      guard raised < rules.throttleLimit else { return state }
      result.throttle = raised
    } else {
      let lowered = result.throttle / 2
      result.throttle = lowered < lowest ? 0 : lowered
    }
    return result
  }

  /// Board a craft: the Reference Build took its position and its heading.
  public static func board(
    _ state: GameState, craft: Int, at position: SIMD3<Double>, heading: Double, flight: FlightModel
  ) -> GameState {
    var result = state
    result.craft = craft
    result.player.position.x = position.x
    result.player.position.z = position.z
    result.player.heading = heading
    settleOnGround(&result, flight: flight)
    return result
  }

  /// Leave the craft, which puts the player back on the walking block.
  public static func leave(_ state: GameState, flight: FlightModel) -> GameState {
    var result = state
    result.craft = nil
    settleOnGround(&result, flight: flight)
    return result
  }

  /// Stop everything and stand on the ground, which both crossings of the craft
  /// door share: boarding and leaving alike begin from rest.
  private static func settleOnGround(_ state: inout GameState, flight: FlightModel) {
    state.throttle = 0
    state.player.yawVelocity = 0
    state.player.speed = 0
    state.player.pitch = 0
    state.player.roll = 0
    state.player.position.y = flight.groundAltitude
    state.mode = .grounded
  }

  private static func integrate(
    _ state: GameState, intent: Intent, dt: Double, flight: FlightModel
  ) -> GameState {
    var result = state
    var player = result.player
    let block = flight.block(for: state)
    let rules = flight.rules
    let limits = flight.limits
    // The decoded parameters are per-frame, so a step is a number of frames.
    let frames = dt * limits.referenceFrameRate
    guard frames > 0 else { return state }

    // Yaw: velocity damps, then takes its input. Turning right negates the
    // authority, which is all the Reference Build's INY on the sign bit did.
    let authority = intent.turn * block.yawAuthority * limits.turnScale
    let yawTarget = ControlLoop.yawFixedPoint(authority: authority, damping: block.yawDamping)
    player.yawVelocity = ControlLoop.settle(
      player.yawVelocity, toward: yawTarget, damping: block.yawDamping, over: frames
    )
    player.heading = wrap(player.heading + player.yawVelocity * frames * flight.radiansPerUnit)

    // Speed: takes its input, then damps. The other filter's shape.
    let throttle = flight.effectiveThrottle(for: state, intent: intent)
    let speedTarget = ControlLoop.speedFixedPoint(
      throttle: throttle, gain: block.throttleGain, damping: block.speedDamping
    )
    player.speed = ControlLoop.settle(
      player.speed, toward: speedTarget * limits.speedScale, damping: block.speedDamping, over: frames
    )

    // Pitch is a direct step with no filter, and only where the block allows one:
    // the sinking craft have their pitch step zeroed so they cannot be pitched.
    // Only a craft leaves the ground. On foot the walking block would otherwise
    // qualify on speed alone, since the take-off gate is a speed and nothing else.
    let mayLeaveTheGround = state.craft != nil
      && (result.mode == .flying || abs(player.speed) >= rules.takeoffSpeed)
    if !mayLeaveTheGround {
      // Below the take-off run the loop pins pitch level, as it does on foot.
      player.pitch = 0
    } else if block.pitchStep > 0 {
      let step = intent.pitch * Double(block.pitchStep) * limits.pitchScale
      player.pitch = wrapPitch(player.pitch + step * frames * flight.radiansPerUnit)
    }

    // Roll is set from yaw velocity rather than accumulated, and only in flight.
    player.roll = result.mode == .flying
      ? wrap(player.yawVelocity * block.rollCoupling * flight.radiansPerUnit)
      : 0

    // Translation, one axis at a time as the Reference Build did it.
    let advance = player.speed * frames
    let cosPitch = cos(player.pitch)
    player.position.x = clampToWorld(
      player.position.x + cosPitch * sin(player.heading) * advance, extent: limits.groundExtent
    )
    player.position.z = clampToWorld(
      player.position.z + cosPitch * cos(player.heading) * advance, extent: limits.groundExtent
    )

    // Altitude only moves once the craft has the speed for it, which is the
    // take-off run: on the ground below that speed the vertical step is skipped.
    var climb = 0.0
    if mayLeaveTheGround {
      climb = sin(player.pitch) * advance * block.liftFactor
      let ceiling = flight.ceiling(for: state, block: block) * Double(rules.ceilingUnit)
      if climb > 0 && player.position.y > ceiling {
        climb *= rules.ceilingClimbScale
      }
      player.position.y += climb
    }
    // The sinking handler loses height every frame whatever the player does.
    if block.handler == .sinking && result.mode == .flying {
      let drop = Double(rules.ceilingUnit) * frames
      climb -= drop
      player.position.y -= drop
    }

    result.player = player
    result.elapsed = state.elapsed + dt
    // The verdict on a touchdown is about how fast the craft was going down, so
    // the rate is what crosses the boundary rather than the step it came from.
    return transition(result, descentRate: frames > 0 ? abs(climb) / frames : 0, flight: flight)
  }

  /// Cross the altitude band in either direction, which is the only way the
  /// Reference Build entered or left flight.
  private static func transition(
    _ state: GameState, descentRate: Double, flight: FlightModel
  ) -> GameState {
    var result = state
    let rules = flight.rules
    let band = Double(rules.groundBand)
    switch result.mode {
    case .grounded where result.craft != nil && result.player.position.y >= band:
      result.mode = .flying
    case .flying where result.player.position.y < band:
      result.mode = .grounded
      result.touchdown = verdict(pitch: result.player.pitch, descentRate: descentRate, rules: rules)
      result.player.position.y = flight.groundAltitude
      result.player.roll = 0
      // Touchdown forces pitch back to level when it is past it.
      if rawPitch(result.player.pitch, rules: rules) > Double(rules.levelPitch) {
        result.player.pitch = 0
      }
    default:
      break
    }
    if result.mode == .grounded && result.craft == nil {
      result.player.position.y = flight.groundAltitude
    }
    return result
  }

  /// Whether a touchdown was a landing or a crash: descent rate, then pitch.
  private static func verdict(
    pitch: Double, descentRate: Double, rules: Payload.FlightDocument.Rules
  ) -> Touchdown {
    if descentRate >= rules.crashDescentRate { return .crashed }
    // The Reference Build tests only the nose-down side directly; a nose-up
    // attitude has to wrap past a half turn before it counts, which it lets land.
    return rawPitch(pitch, rules: rules) >= Double(rules.crashPitch) ? .crashed : .landed
  }

  /// The Reference Build's ten-bit pitch, where level is half a turn and larger
  /// values are nose down. The tests it applies are written in those terms.
  static func rawPitch(_ radians: Double, rules: Payload.FlightDocument.Rules) -> Double {
    let units = Double(rules.angleUnitsPerTurn)
    let raw = Double(rules.levelPitch) - radians / (2 * Double.pi) * units
    let wrapped = raw.truncatingRemainder(dividingBy: units)
    return wrapped < 0 ? wrapped + units : wrapped
  }

  private static func clampToWorld(_ value: Double, extent: Double) -> Double {
    Swift.min(extent, Swift.max(0, value))
  }

  private static func wrap(_ radians: Double) -> Double {
    let turn = 2 * Double.pi
    let remainder = radians.truncatingRemainder(dividingBy: turn)
    return remainder < 0 ? remainder + turn : remainder
  }

  /// The shortest signed turn to an angle: what pitch wraps to, and what any
  /// caller steering toward a heading needs.
  ///
  /// Pitch wraps rather than clamps because the Reference Build's ten-bit pitch
  /// does: a craft can be flown right over the top.
  public static func wrapPitch(_ radians: Double) -> Double {
    let turn = 2 * Double.pi
    var wrapped = radians.truncatingRemainder(dividingBy: turn)
    if wrapped > Double.pi { wrapped -= turn }
    if wrapped < -Double.pi { wrapped += turn }
    return wrapped
  }
}
