import Foundation

/// A device-independent movement intent for one simulation step.
///
/// The app layer turns keys and mouse motion into this; the core never sees an
/// input device. Axes are clamped to -1...1 on construction so a caller cannot
/// smuggle in extra speed.
public struct Intent: Sendable, Equatable {
  public var forward: Double
  public var strafe: Double
  public var turn: Double
  public var lookUp: Double
  public var running: Bool

  public static let idle = Intent()

  public init(forward: Double = 0, strafe: Double = 0, turn: Double = 0, lookUp: Double = 0, running: Bool = false) {
    self.forward = Intent.clamp(forward)
    self.strafe = Intent.clamp(strafe)
    self.turn = Intent.clamp(turn)
    self.lookUp = Intent.clamp(lookUp)
    self.running = running
  }

  private static func clamp(_ value: Double) -> Double {
    value.isFinite ? Swift.min(1, Swift.max(-1, value)) : 0
  }
}

/// Speeds and bounds for walking, in world units and radians per second.
///
/// Tuned for how the walkabout plays rather than derived from the Reference
/// Build's rates — the fidelity bar for this project is modernised feel.
public struct WalkLimits: Sendable, Equatable {
  public var walkSpeed: Double
  public var runMultiplier: Double
  public var turnRate: Double
  public var pitchRate: Double
  public var pitchLimit: Double
  public var eyeHeight: Double
  public var groundExtent: Double

  public init(
    walkSpeed: Double = 2600,
    runMultiplier: Double = 4,
    turnRate: Double = 1.9,
    pitchRate: Double = 1.3,
    pitchLimit: Double = 1.2,
    eyeHeight: Double = 128,
    groundExtent: Double = 1_048_576
  ) {
    self.walkSpeed = walkSpeed
    self.runMultiplier = runMultiplier
    self.turnRate = turnRate
    self.pitchRate = pitchRate
    self.pitchLimit = pitchLimit
    self.eyeHeight = eyeHeight
    self.groundExtent = groundExtent
  }
}

public struct PlayerState: Sendable, Equatable {
  /// Ground position; the vertical component is eye height above the surface.
  public var position: SIMD3<Double>
  /// Radians clockwise from +Z.
  public var heading: Double
  public var pitch: Double

  public init(position: SIMD3<Double>, heading: Double = 0, pitch: Double = 0) {
    self.position = position
    self.heading = heading
    self.pitch = pitch
  }
}

public struct GameState: Sendable, Equatable {
  public var player: PlayerState
  public var elapsed: Double

  public init(player: PlayerState, elapsed: Double = 0) {
    self.player = player
    self.elapsed = elapsed
  }
}

/// The simulation. A pure function of state, intent and elapsed time.
///
/// Determinism is kept as a design property rather than a logging system: the
/// same inputs always produce the same state, which is what makes a side-by-side
/// comparison against the Reference Build meaningful.
public enum GameCore {
  /// Longest step the integrator will take at once. A stalled frame becomes
  /// several bounded steps instead of one teleport through the world.
  public static let maximumStep: Double = 1.0 / 30.0

  public static func step(_ state: GameState, intent: Intent, dt: Double, limits: WalkLimits = WalkLimits()) -> GameState {
    guard dt.isFinite, dt > 0 else { return state }
    var result = state
    var remaining = dt
    while remaining > 0 {
      let slice = Swift.min(remaining, maximumStep)
      result = integrate(result, intent: intent, dt: slice, limits: limits)
      remaining -= slice
    }
    return result
  }

  private static func integrate(
    _ state: GameState, intent: Intent, dt: Double, limits: WalkLimits
  ) -> GameState {
    var player = state.player

    player.heading = wrap(player.heading + intent.turn * limits.turnRate * dt)
    player.pitch = Swift.min(
      limits.pitchLimit,
      Swift.max(-limits.pitchLimit, player.pitch + intent.lookUp * limits.pitchRate * dt)
    )

    let speed = limits.walkSpeed * (intent.running ? limits.runMultiplier : 1)
    // Normalise so diagonal movement is not faster than cardinal movement.
    let magnitude = (intent.forward * intent.forward + intent.strafe * intent.strafe).squareRoot()
    if magnitude > 0 {
      let scale = speed * dt / Swift.max(1, magnitude)
      let sin = Foundation.sin(player.heading)
      let cos = Foundation.cos(player.heading)
      let dx = (intent.forward * sin + intent.strafe * cos) * scale
      let dz = (intent.forward * cos - intent.strafe * sin) * scale
      player.position.x = clampToWorld(player.position.x + dx, extent: limits.groundExtent)
      player.position.z = clampToWorld(player.position.z + dz, extent: limits.groundExtent)
    }
    player.position.y = limits.eyeHeight

    return GameState(player: player, elapsed: state.elapsed + dt)
  }

  private static func clampToWorld(_ value: Double, extent: Double) -> Double {
    Swift.min(extent, Swift.max(0, value))
  }

  private static func wrap(_ radians: Double) -> Double {
    let turn = 2 * Double.pi
    let remainder = radians.truncatingRemainder(dividingBy: turn)
    return remainder < 0 ? remainder + turn : remainder
  }
}
