import Foundation
import MercenaryCLI
import MercenaryKit

/// `--core-trace`: run the control loop against a literal input sequence.
///
/// The one emitter with no printed diagnostic behind it, because there was never a reason
/// to watch a walk go by: what this pins is the mover, and the readable artifact is the
/// trace. Its legs are held input rather than a feedback loop, which makes it the simplest
/// thing the browser port can replay once it has a mover at all.
enum CoreTraceCommand {
  struct Options {
    var body = TraceScenario.GameCore()
    var trace: URL?
    var id = "walk"

    var scenario: TraceScenario {
      TraceScenario(
        emitter: .gameCore, id: id, note: "written by --core-trace", body: .gameCore(body))
    }
  }

  static let knownFlags: Set<String> = [
    "--core-trace", "--craft", "--notch", "--room", "--at", "--leg", "--id", "--trace",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--core-trace") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    var options = Options()
    options.body.craft = try arguments.int("--craft", expected: "a craft slot")
    options.body.notch = try arguments.int("--notch", expected: "a throttle notch")
    options.body.room = try arguments.int("--room", expected: "a room id")
    if let at = try arguments.string("--at", expected: "a position, as X,Z") {
      let parts = at.split(separator: ",", maxSplits: 1)
      guard parts.count == 2, let x = Double(parts[0]), let z = Double(parts[1]) else {
        throw Arguments.Failure.missingValue(flag: "--at", expected: "a position, written X,Z")
      }
      var position = TraceScenario.Position()
      position.x = x
      position.z = z
      options.body.at = position
    }
    if let id = try arguments.string("--id", expected: "a name for this trace") {
      options.id = id
    }
    for value in try arguments.values(
      of: "--leg", expected: "a leg, as TURN,PITCH,WALK@SECONDS")
    {
      options.body.legs.append(try leg(value))
    }
    options.trace = try arguments.trace()
    return options
  }

  /// Parses `TURN,PITCH,WALK@SECONDS`.
  ///
  /// The separator is checked rather than assumed, the way every other operand here is:
  /// `1,0,0:4` reading as "for zero seconds" would look like it had worked and trace
  /// nothing at all.
  private static func leg(_ value: String) throws -> TraceScenario.GameCore.Leg {
    let halves = value.split(separator: "@", maxSplits: 1)
    guard halves.count == 2, let seconds = Double(halves[1]) else {
      throw Arguments.Failure.missingValue(
        flag: "--leg", expected: "a time, written TURN,PITCH,WALK@SECONDS")
    }
    let axes = halves[0].split(separator: ",", maxSplits: 2)
    guard axes.count == 3, let turn = Double(axes[0]), let pitch = Double(axes[1]),
      let walk = Double(axes[2])
    else {
      throw Arguments.Failure.missingValue(
        flag: "--leg", expected: "three axes, written TURN,PITCH,WALK@SECONDS")
    }
    var leg = TraceScenario.GameCore.Leg()
    leg.turn = turn
    leg.pitch = pitch
    leg.walk = walk
    leg.seconds = seconds
    return leg
  }

  static func run(_ options: Options) -> Int32 {
    do {
      let trace = try CoreTrace.emit(
        try TraceRun(), scenario: options.scenario, body: options.body)
      if let output = options.trace {
        try trace.write(to: output)
        print("wrote \(output.path)")
      } else {
        print(String(decoding: trace.bytes, as: UTF8.self), terminator: "")
      }
      return 0
    } catch {
      FileHandle.standardError.write(Data("error: \(error)\n".utf8))
      return 1
    }
  }
}
