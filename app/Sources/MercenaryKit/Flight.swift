import Foundation

extension Payload {
  /// Craft dynamics, re-extracted as real numbers rather than the engine's own
  /// sixteen-bit floats — the app never handles that encoding (ADR 0015's rule
  /// applied to arithmetic, see `c64lab/flight.py`).
  public struct FlightDocument: Codable, Sendable, Equatable {
    /// One Craft Parameter Block: everything that makes a craft fly as it does.
    public struct Block: Codable, Sendable, Equatable {
      /// Only the tumble handler reads the block's leading offsets as integers.
      public struct Tumble: Codable, Sendable, Equatable {
        public var altitudeDrop: Int
        public var rollStep: Int
        public var pitchStep: Int
        public var yawStep: Int
      }

      /// The control routines a block may dispatch through; the export refuses
      /// any address it cannot name, so this set is closed.
      public enum Handler: String, Codable, Sendable {
        case standard, sinking, slot7, tumble, descent
      }

      public var index: Int
      /// Which control routine this block dispatches through.
      public var handler: Handler
      /// Set only on the three blocks the engine installs itself.
      public var mode: String?
      public var yawDamping: Double
      public var yawAuthority: Double
      /// Angle units added to pitch per input frame; there is no pitch velocity.
      public var pitchStep: Int
      /// Multiplies yaw velocity into roll, so a craft banks into its turn.
      /// Decoded at export from the engine's exponent offset.
      public var rollCoupling: Double
      public var liftFactor: Double
      public var speedDamping: Double
      /// Highest altitude this craft may climb to, in ``Rules/ceilingUnit`` steps.
      public var ceiling: Int
      public var throttleGain: Double
      public var tumble: Tumble?
    }

    public struct Rules: Codable, Sendable, Equatable {
      public struct Poweramp: Codable, Sendable, Equatable {
        /// The craft the engine special-cases: the player's first one.
        public var craft: Int
        public var throttleScale: Double
        public var ceiling: Int
      }

      public var angleUnitsPerTurn: Int
      /// The pitch value that means level, which is half a turn.
      public var levelPitch: Int
      public var groundAltitude: Int
      /// Altitude at or below which the loop takes its touchdown path.
      public var groundBand: Int
      /// Speed a craft must reach before it may leave the ground at all.
      public var takeoffSpeed: Double
      /// Descent rate at touchdown above which the landing is a crash.
      public var crashDescentRate: Double
      /// Pitch at touchdown beyond which the landing is a crash.
      public var crashPitch: Int
      public var ceilingClimbScale: Double
      public var ceilingUnit: Int
      public var throttleNotches: [Double]
      public var throttleLimit: Double
      public var poweramp: Poweramp
      public var walkingBlock: Int
    }

    /// The on-foot mover, which is not a Craft Parameter Block at all.
    ///
    /// `MOVE` dispatches to a separate routine whenever the player is underground
    /// or out of a craft: a fixed step and a fixed turn per frame, with no velocity,
    /// no damping and no throttle. Only a craft reaches the blocks (ADR 0016).
    public struct Walk: Codable, Sendable, Equatable {
      /// World units per frame. Walking backwards is this negated, which is how the
      /// Reference Build did it — one value, with its sign bit flipped.
      public var step: Double
      /// Angle units added to or taken off the heading per frame.
      public var turnStep: Int
    }

    public var schemaVersion: Int
    public var blocks: [Block]
    public var walk: Walk
    public var rules: Rules
    public var counts: [String: Int]

    /// The block for a boarded craft slot, or walking when nothing is boarded.
    public func block(craft: Int?) -> Block {
      blocks[craft ?? rules.walkingBlock]
    }
  }
}

/// Whether the player is on foot or airborne.
///
/// The Reference Build keeps this in one byte and switches it by crossing an
/// altitude band rather than by any input, which is why take-off and landing are
/// modes here and not actions.
public enum FlightMode: Sendable, Equatable {
  case grounded
  case flying
}

/// How a touchdown ended, for the caller to report.
public enum Touchdown: Sendable, Equatable {
  /// Within the descent-rate and pitch limits: the craft is simply on the ground.
  case landed
  /// Outside them. The engine puts the player out of the craft.
  case crashed
}

/// The craft dynamics as the Reference Build's shared control loop runs them.
///
/// Walking and flying are the same loop over different Craft Parameter Blocks, so
/// this is the only mover in the app. Two first-order filters, but not the same
/// filter twice: yaw damps and then takes its input, speed takes its input and
/// then damps. Both are solved for an arbitrary timestep rather than iterated per
/// frame, so the dynamics match the original at its own rate and stay smooth at
/// any other — see ``ControlLoop/settle(_:toward:damping:over:)``.
public enum ControlLoop {
  /// Advance a first-order filter to where it would be after `frames` of the
  /// original's own recurrence, exactly rather than by iterating it.
  ///
  /// The recurrence approaches its fixed point by a constant factor per frame, so
  /// raising that factor to a fractional number of frames lands on the same curve
  /// between frames instead of stepping along it.
  static func settle(_ value: Double, toward target: Double, damping: Double, over frames: Double) -> Double {
    guard damping > 0 else { return frames >= 1 ? target : value }
    let decay = pow(damping, frames)
    return target + (value - target) * decay
  }

  /// Where yaw velocity settles while an input is held: `velocity * damping + authority`.
  static func yawFixedPoint(authority: Double, damping: Double) -> Double {
    damping < 1 ? authority / (1 - damping) : authority
  }

  /// Where speed settles for a throttle: `(velocity + throttle * gain) * damping`.
  static func speedFixedPoint(throttle: Double, gain: Double, damping: Double) -> Double {
    damping < 1 ? throttle * gain * damping / (1 - damping) : throttle * gain
  }
}
