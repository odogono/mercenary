import Foundation
import MercenaryCLI
import MercenaryKit

/// What the platform's elementary functions returned, as a Golden Trace.
///
/// Beneath every other emitter. The kit reaches for exactly five library functions —
/// `sin`, `cos` and `tan` in ``Projection``, ``Orientation``, ``World`` and the movers,
/// `atan` for the reference frustum's field of view, and `pow` in ``ControlLoop/settle``
/// and the decimal registers — and a Golden Trace of a *run* pins their results only
/// where that run happens to have called them.
///
/// That is not enough for the browser port. Neither libm nor a JavaScript engine's `Math`
/// is bit-guaranteed, so a TypeScript implementation carries its own deterministic
/// versions (ADR 0022) rather than calling `Math.sin`. This trace is what those are
/// checked against, and it exists for error locality: a one-bit disagreement in `pow`
/// reached through a flight trace presents as a divergence at step four hundred of a
/// craft's descent, while here it presents as `pow` disagreeing at a named pair.
///
/// The header deliberately carries **no payload identity**. This emitter reads no payload,
/// so recording which extraction the run belonged to would make a re-export report the
/// math trace as differing — the same false signal the per-emitter narrowing of settings
/// was introduced to remove.
enum MathTrace {
  static func emit(
    _ run: TraceRun, scenario: TraceScenario, body: TraceScenario.Math
  ) throws -> TraceFile {
    var trace = TraceFile(emitter: scenario.emitter.rawValue, id: scenario.id)
    let angles = self.angles(samples: body.samples)
    let arctangents = self.arctangents(samples: body.samples)
    let powers = self.powers(samples: body.samples)

    // No clock: like `decode`, this is a set of facts rather than a run, so there is no
    // step to key on and no dt to feed. The domain sizes are recorded so a replay can
    // say "this trace pinned 562 angles" without counting lines.
    try trace.header(
      run.header(
        for: scenario, dt: nil, includesPayload: false,
        extra: [
          (
            key: "domain",
            value: .object([
              "angles": .int(angles.count),
              "arctangents": .int(arctangents.count),
              "powers": .int(powers.count),
            ])
          )
        ]))

    // Grouped by function rather than interleaved by argument, so the first differing
    // line names the function that disagrees instead of the argument they share.
    for x in angles { try trace.record(unary("sin", x, sin(x))) }
    for x in angles { try trace.record(unary("cos", x, cos(x))) }
    for x in angles { try trace.record(unary("tan", x, tan(x))) }
    for x in arctangents { try trace.record(unary("atan", x, atan(x))) }
    for pair in powers {
      try trace.record(
        .object([
          "kind": .string("binary"), "fn": .string("pow"),
          "x": .double(pair.base), "y": .double(pair.exponent),
          "value": .double(pow(pair.base, pair.exponent)),
        ]))
    }
    return trace
  }

  private static func unary(_ name: String, _ x: Double, _ value: Double) -> TraceValue {
    .object(["kind": .string("unary"), "fn": .string(name), "x": .double(x), "value": .double(value)])
  }

  /// The arguments `sin`, `cos` and `tan` are asked for.
  ///
  /// Bounded on purpose. Every angle that reaches these functions in play has been through
  /// `GameCore.wrap` into `[0, 2π)`, `GameCore.wrapPitch` into `[-π, π]`, or
  /// `Orientation.radians`, which divides a payload byte into one turn — so the domain is
  /// one turn either side of zero, and this sweeps two. The excursions past that go far
  /// enough to prove an implementation reduces its argument at all, and no further: pinning
  /// `sin(1e300)` would oblige the port to reproduce a full Payne–Hanek reduction for an
  /// angle no wrapper can produce, which is a large amount of delicate work bought for a
  /// case that cannot arise. Should one ever arise, the samples are the place to say so.
  static func angles(samples: Int) -> [Double] {
    var values: [Double] = []
    // The 256 discrete angles `Orientation.radians` can derive from a payload byte, which
    // are the exact arguments every rotated object model is built with.
    for byte in 0..<256 { values.append(Double(byte) / 256 * 2 * .pi) }

    // A uniform sweep across two turns either side of zero.
    let span = 4 * Double.pi
    let count = max(2, samples)
    for index in 0..<count {
      values.append(-span + 2 * span * Double(index) / Double(count - 1))
    }

    // The landmarks an implementation is most likely to get wrong: the quadrant boundaries,
    // `tan`'s pole and its immediate neighbours, the signed zero, the denormal floor, and a
    // few moderate excursions that force argument reduction.
    // Split into groups rather than one literal: the type checker gives up on a single
    // array this size, and the groups are the reason each sample is here anyway.
    let quadrant: Double = Double.pi / 2
    let turn: Double = 2 * Double.pi
    let quadrants: [Double] = [
      0, -0.0, Double.pi, -Double.pi, quadrant, -quadrant, turn, -turn,
      3 * quadrant, -3 * quadrant,
    ]
    let thirds: [Double] = [
      Double.pi / 3, -Double.pi / 3, Double.pi / 4, -Double.pi / 4,
      Double.pi / 6, -Double.pi / 6,
    ]
    // `tan`'s pole and the neighbours either side of it, where a bad reduction shows first.
    let poles: [Double] = [
      quadrant.nextUp, quadrant.nextDown, (-quadrant).nextUp, (-quadrant).nextDown,
      Double.pi.nextUp, Double.pi.nextDown, turn.nextUp, turn.nextDown,
    ]
    let small: [Double] = [
      1e-8, -1e-8, 1e-16, -1e-16, 2.2250738585072014e-308, 5e-324, -5e-324,
    ]
    let excursions: [Double] = [
      1, -1, 0.5, -0.5, 100, -100, 1000, -1000, 123.456, -123.456,
    ]
    values += quadrants
    values += thirds
    values += poles
    values += small
    values += excursions

    return deduplicated(values)
  }

  /// The arguments `atan` is asked for.
  ///
  /// One call site, and it is a constant: the reference frustum's half-angle. `atan`
  /// saturates rather than reducing, so unlike the circular functions there is no cost to
  /// pinning the extremes, and they are where a series implementation stops agreeing.
  static func arctangents(samples: Int) -> [Double] {
    var values: [Double] = []
    let span = 8.0
    let count = max(2, samples)
    for index in 0..<count {
      values.append(-span + 2 * span * Double(index) / Double(count - 1))
    }
    let landmarks: [Double] = [0, -0.0, 1, -1, 0.5, -0.5, 2, -2]
    let tiny: [Double] = [1e-8, -1e-8, 5e-324, 2.2250738585072014e-308]
    let saturating: [Double] = [
      1e8, -1e8, 1e16, -1e16, 1e300, -1e300,
      Double.greatestFiniteMagnitude, -Double.greatestFiniteMagnitude,
    ]
    values += landmarks
    values += tiny
    values += saturating
    return deduplicated(values)
  }

  /// The pairs `pow` is asked for.
  ///
  /// Two call sites of quite different character. ``ControlLoop/settle`` raises a damping
  /// factor in `(0, 1]` to a number of reference frames, and ``BensonHostState`` raises a
  /// literal hundred to a small whole number for the decimal registers.
  ///
  /// **The exponent is bounded by the same reasoning the angles are.** `settle` is solved for
  /// an arbitrary timestep precisely so that it is never iterated: `GameCore.step` subdivides
  /// any `dt` into slices of at most `maximumStep`, a thirtieth, and multiplies by the
  /// reference frame rate to get frames — so with the rate at its tuned 20 the exponent
  /// cannot exceed two thirds. The sweep reaches ten, which is margin for retuning that rate
  /// as high as three hundred, and stops. Ten seconds of the original's own rate is not a
  /// number this function can be handed, and pinning it would oblige the port to reproduce
  /// large-exponent `pow` — the hardest part of `pow` to get bit-exact — for a case the
  /// subdivision rules out. See ADR 0022, where the measurement that made this concrete is
  /// recorded: JavaScriptCore and Apple's libm disagree by up to twelve units in the last
  /// place at exponent six hundred, and agree exactly everywhere inside this bound.
  static func powers(samples: Int) -> [(base: Double, exponent: Double)] {
    var pairs: [(base: Double, exponent: Double)] = []
    // The damping grid. A tenth of a frame is finer than any slice the app runs at.
    let bases = max(2, samples / 16)
    let exponents: [Double] = [
      0.1, 0.25, 1.0 / 3.0, 0.5, 2.0 / 3.0, 5.0 / 6.0, 1.0, 4.0 / 3.0, 5.0 / 3.0, 2.0, 3.0, 4.0,
      10.0,
    ]
    for index in 0..<bases {
      let damping = Double(index + 1) / Double(bases)
      for frames in exponents { pairs.append((damping, frames)) }
    }
    // The decimal registers' scale factors, which are the only whole-number powers here and
    // the only base that is not a damping factor.
    for byte in 0...3 { pairs.append((100, Double(3 - byte))) }
    // The identities every implementation special-cases, then the signs.
    let identities: [(base: Double, exponent: Double)] = [
      (0, 0), (1, 0), (2, 0), (0.5, 0), (1, 2), (1, 10), (0, 1), (0, 2),
    ]
    let reciprocals: [(base: Double, exponent: Double)] = [
      (2, 1), (2, 0.5), (2, -1), (0.5, -1), (0.5, -2),
    ]
    // A negative base is defined only for a whole exponent, and the parity decides the sign.
    let negatives: [(base: Double, exponent: Double)] = [
      (-2, 2), (-2, 3), (-1, 2), (-1, 3),
    ]
    pairs += identities
    pairs += reciprocals
    pairs += negatives
    var seen: Set<String> = []
    return pairs.filter { seen.insert("\($0.base.bitPattern):\($0.exponent.bitPattern)").inserted }
  }

  /// Same value twice is noise in a trace, and the sweeps deliberately overlap the
  /// landmarks. Compared by bit pattern so a signed zero survives as two samples.
  private static func deduplicated(_ values: [Double]) -> [Double] {
    var seen: Set<UInt64> = []
    return values.filter { seen.insert($0.bitPattern).inserted }
  }
}
