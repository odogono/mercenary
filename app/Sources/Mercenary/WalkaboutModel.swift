import AppKit
import MercenaryKit
import Observation
import SwiftUI

/// Drives the simulation loop and turns physical keys into a device-independent
/// ``Intent``. The core never learns which keys exist.
@MainActor
@Observable
final class WalkaboutModel {
  enum Load {
    case loading
    case ready(World, Payload.Manifest)
    case failed(String)
  }

  /// The message line. A payload with scripts hands it to them; without them it
  /// stays a browser over the message table, which is all step one could offer.
  enum Comms: Equatable {
    /// A Benson Script owns the line, revealing its own text as it runs.
    case scripted(text: String, credits: Int)
    /// Nothing is running the game, so the messages are paged by hand.
    case browsing(table: TextTable, index: Int)

    var text: String {
      switch self {
      case .scripted(let text, _):
        return text
      case .browsing(let table, let index):
        return table.message(index) ?? ""
      }
    }
  }

  private(set) var load: Load = .loading
  private(set) var state: GameState
  private(set) var framesPerSecond: Double = 0
  private(set) var visibleLines: Int = 0
  private(set) var visiblePoints: Int = 0
  private(set) var comms: Comms?

  /// Present when the payload carries the craft parameters. Without them there
  /// is nothing to move the player with, since walking runs on them too.
  private(set) var flight: FlightModel?
  let selector = VisibilitySelector()

  /// The opening script, which the Reference Build starts play with.
  static let openingScript = 0

  /// Tuned values read from `settings.json`, so judging them does not mean
  /// editing Swift. Falls back to the built-in defaults when there is no file.
  private(set) var settings = Settings()

  /// Present when the payload carries scripts.
  private var session: BensonSession?
  /// Present when the payload carries the take-and-board rules.
  private var interaction: Interaction?

  /// Where a craft was left, so it is drawn where the player got out of it rather
  /// than back where the payload first placed it.
  private var landedCraft: [Int: SIMD3<Double>] = [:]
  private var pressed: Set<UInt16> = []
  private var running = false
  private var ticker: Timer?
  private var lastTick: CFTimeInterval?
  private var monitor: Any?
  private var observers: [NSObjectProtocol] = []
  private var frameAccumulator: (count: Int, seconds: Double) = (0, 0)

  /// macOS virtual key codes. Keeping the mapping in one table makes the
  /// keyboard layout the only device knowledge in the app.
  private enum Key {
    static let left: UInt16 = 123
    static let right: UInt16 = 124
    static let up: UInt16 = 126
    static let down: UInt16 = 125
    static let leftBracket: UInt16 = 33
    static let rightBracket: UInt16 = 30
    static let y: UInt16 = 16
    static let b: UInt16 = 11
    static let t: UInt16 = 17
    static let l: UInt16 = 37
    static let space: UInt16 = 49
    static let minus: UInt16 = 27
    static let equal: UInt16 = 24
    /// The digit row, in throttle-notch order: 1 is the lowest, 0 the highest.
    static let digits: [UInt16] = [18, 19, 20, 21, 23, 22, 26, 28, 25, 29]

    /// Which throttle notch a digit key stands for, or nil if it is not one.
    static func throttleNotch(for code: UInt16) -> Int? {
      digits.firstIndex(of: code).map { $0 + 1 }
    }

    /// The keys a Benson Script can be asked about.
    static func bensonKey(for code: UInt16) -> BensonKey? {
      code == y ? .y : nil
    }
  }

  init() {
    state = GameState(player: OpeningScene.player)
  }

  func start() {
    loadPayload()
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged]) { [weak self] event in
      guard let self else { return event }
      return self.handle(event) ? nil : event
    }
    // A key-up that arrives while the app is inactive is never seen, which would
    // otherwise leave that key held down forever.
    observers = [NSApplication.willResignActiveNotification, NSWindow.didResignKeyNotification].map { name in
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated { self?.releaseAllKeys() }
      }
    }
    lastTick = CACurrentMediaTime()
    let ticker = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.tick() }
    }
    RunLoop.main.add(ticker, forMode: .common)
    self.ticker = ticker
  }

  func stop() {
    ticker?.invalidate()
    ticker = nil
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
    observers.forEach(NotificationCenter.default.removeObserver)
    observers.removeAll()
    releaseAllKeys()
  }

  private func releaseAllKeys() {
    pressed.removeAll()
    running = false
  }

  func report(visibleLines: Int, points: Int) {
    self.visibleLines = visibleLines
    self.visiblePoints = points
  }

  private func page(by delta: Int) {
    guard case .browsing(let table, let index) = comms, table.messageCount > 0 else { return }
    let count = table.messageCount
    comms = .browsing(table: table, index: ((index + delta) % count + count) % count)
  }

  private func loadPayload() {
    guard let directory = PayloadLocator.locate() else {
      load = .failed(
        """
        No Data Payload found.

        Export one from a verified World Geometry Dataset:
          research/c64-reference-build/lab payload export \\
            --dataset research/c64-reference-build/work/<geometry-dataset> \\
            --output payload

        Or point at an existing export with the MERCENARY_PAYLOAD environment variable.
        """
      )
      return
    }
    do {
      settings = try Settings.load()
      let bundle = try Payload.load(from: directory)
      let world = World(bundle: bundle)
      if let parameters = bundle.flight {
        let model = settings.flight.model(for: parameters, groundExtent: Double(world.groundExtent))
        flight = model
        state.player.position.y = model.groundAltitude
      }
      if let rules = bundle.interaction {
        interaction = Interaction(document: rules)
      }
      if let text = bundle.text {
        let table = TextTable(document: text)
        if let document = bundle.benson {
          let program = try BensonProgram(document: document)
          var session = BensonSession(
            program: program,
            text: table,
            tunables: settings.bensonTunables(framesPerTick: program.framesPerTick)
          )
          session.start(script: Self.openingScript)
          self.session = session
          comms = .scripted(text: "", credits: session.credits)
        } else {
          comms = .browsing(table: table, index: 0)
        }
      }
      load = .ready(world, bundle.manifest)
    } catch {
      load = .failed(String(describing: error))
    }
  }

  private func tick() {
    let now = CACurrentMediaTime()
    let elapsed = min(0.25, max(0, now - (lastTick ?? now)))
    lastTick = now
    guard elapsed > 0 else { return }

    if let flight {
      state = GameCore.step(state, intent: currentIntent(), dt: elapsed, flight: flight)
      if let touchdown = state.touchdown { report(touchdown) }
    }
    advanceScripts(by: elapsed)

    frameAccumulator.count += 1
    frameAccumulator.seconds += elapsed
    if frameAccumulator.seconds >= 0.5 {
      framesPerSecond = Double(frameAccumulator.count) / frameAccumulator.seconds
      frameAccumulator = (0, 0)
    }
  }

  /// Reach for whatever the player is standing next to.
  ///
  /// The Reference Build ran this check inside its draw loop, so only objects in
  /// the scene could be reached; the candidates here are the same drawable
  /// surface objects the renderer works from.
  private func reach(for action: InteractionAction) {
    guard let interaction, var session, case .ready(let world, _) = load else { return }
    let candidates = world.objects
      .filter(\.isDrawable)
      .filter { session.hostState.objectRooms[$0.slot] != BensonHostState.outOfTheWorld }
      .map {
        Interaction.Candidate(slot: $0.slot, position: SIMD3<Double>($0.origin))
      }

    var host = session.hostState
    let outcome = interaction.attempt(action, from: state.player.position, among: candidates, host: &host)
    session.hostState = host

    switch outcome {
    case .took(let slot), .boarded(let slot):
      NSSound.beep()
      // Climbing aboard puts the player where the craft is and takes its heading,
      // as the Reference Build did, and swaps in its Craft Parameter Block.
      if case .boarded = outcome, let craft = world.objects.first(where: { $0.slot == slot }),
        let flight {
        state = GameCore.board(
          state, craft: slot, at: SIMD3(Double(craft.origin.x), 0, Double(craft.origin.z)),
          heading: Self.heading(of: craft), flight: flight
        )
      }
      // Both paths play the object's own description, which for some objects
      // starts a script instead — boarding the Dart is how the opening ends.
      session.describe(interaction.description(of: slot, flags: host.objectFlags[slot] ?? 0))
    case .tooHeavy:
      session.show(message: interaction.tooHeavyMessage)
    case .nothingInReach, .fixedInPlace, .handsFull, .notACraft, .alreadyAboard:
      // The Reference Build refused these silently.
      break
    }
    self.session = session
    comms = .scripted(text: session.messageText, credits: session.credits)
  }

  /// A craft's heading, from the orientation bytes the payload carries for it.
  ///
  /// Those bytes count 256 to a turn, which is the object tables' own unit and not
  /// the 1024 the control loop's angles use. The half turn is the models' own
  /// facing: a craft's nose points along decreasing Z when its orientation byte is
  /// zero, while a heading of zero looks along increasing Z, so boarding one
  /// without this put the player in it back to front.
  private static func heading(of craft: ObjectPlacement) -> Double {
    let turn = Double(craft.orientation.y & 0xFF) / 256 * 2 * .pi
    return (turn + .pi).truncatingRemainder(dividingBy: 2 * .pi)
  }

  /// What the player is currently in, for the status strip. The Reference Build's
  /// object tables carry no names for the craft, so the slot is what there is.
  var craftName: String {
    guard let craft = state.craft else { return "ON FOOT" }
    return String(format: "CRAFT %02d", craft)
  }

  /// The throttle as a notch on the decoded ladder, which is what the digit keys
  /// set, or 0 when the throttle is shut.
  var throttleNotch: Int {
    guard let flight else { return 0 }
    guard let index = flight.rules.throttleNotches.firstIndex(where: {
      abs($0 - state.throttle) < 0.5
    }) else { return 0 }
    return index + 1
  }

  /// Object slots the game has taken out of the world, which the renderer needs so
  /// that a boarded craft stops being drawn and reappears when it is left.
  var hiddenSlots: Set<Int> {
    guard let host = session?.hostState else { return [] }
    return Set(
      host.objectRooms.compactMap { slot, room in
        room == BensonHostState.outOfTheWorld ? slot : nil
      }
    )
  }

  /// Step out, which the Reference Build allowed only once on the ground.
  ///
  /// The craft goes back into the world where the player left it, so it can be
  /// walked away from and boarded again.
  private func leaveCraft() {
    guard let flight, let interaction, var session, state.mode == .grounded else { return }
    var host = session.hostState
    guard let slot = interaction.leave(host: &host) else { return }
    session.hostState = host
    self.session = session
    landedCraft[slot] = state.player.position
    state = GameCore.leave(state, flight: flight)
    NSSound.beep()
  }

  /// Say how a touchdown ended. A crash puts the player out of the craft, which
  /// is what the Reference Build's own crash path did.
  private func report(_ touchdown: Touchdown) {
    NSSound.beep()
    if touchdown == .crashed, let flight {
      state = GameCore.leave(state, flight: flight)
    }
  }

  /// Run the game's own logic for this frame, and act on what it asks for.
  private func advanceScripts(by elapsed: Double) {
    guard var session else { return }
    for effect in session.advance(by: elapsed) {
      switch effect {
      case .keyAcknowledged:
        // The Reference Build answered an accepted key with a tone.
        NSSound.beep()
      case .sound, .cityLocationChanged, .scriptFinished:
        // Sound waits for an audio pass; the location readout and script
        // completion wait for the surfaces that would show them.
        break
      case .playMessage:
        break
      }
    }
    self.session = session
    comms = .scripted(text: session.messageText, credits: session.credits)
  }

  private func currentIntent() -> Intent {
    func axis(_ positive: UInt16, _ negative: UInt16) -> Double {
      (pressed.contains(positive) ? 1 : 0) - (pressed.contains(negative) ? 1 : 0)
    }
    // The cursor keys are the whole movement surface, as the original's stick was.
    // Up and down walk while on foot and pitch while aboard, and aboard they read
    // as a stick rather than a camera: pushing forward puts the nose down.
    let vertical = axis(Key.up, Key.down)
    return Intent(
      turn: axis(Key.right, Key.left),
      pitch: state.craft == nil ? 0 : -vertical,
      walk: state.craft == nil ? vertical : 0,
      running: running
    )
  }

  /// Returns true when the event was consumed and should not travel further.
  private func handle(_ event: NSEvent) -> Bool {
    switch event.type {
    case .flagsChanged:
      running = event.modifierFlags.contains(.shift)
      return false
    case .keyDown:
      // Never swallow a Command chord; the menu bar needs it.
      guard !event.modifierFlags.contains(.command) else { return false }
      // The throttle moves only from a craft, whichever key asks for it.
      if let flight, state.craft != nil {
        if let notch = Key.throttleNotch(for: event.keyCode) {
          state = GameCore.throttle(state, notch: notch, rules: flight.rules)
          return true
        }
        if event.keyCode == Key.minus || event.keyCode == Key.equal {
          state = GameCore.throttle(state, step: event.keyCode == Key.equal ? 1 : -1, rules: flight.rules)
          return true
        }
      }
      switch event.keyCode {
      case Key.leftBracket: page(by: -1)
      case Key.rightBracket: page(by: 1)
      // Skipping is a reading aid, so it deliberately does not tell the scripts
      // the player pressed something — the opening reads that as intent to walk.
      // Aboard, space is the throttle's off switch; on foot it stays the reading
      // aid it was, since there is no throttle to shut.
      case Key.space where state.craft != nil:
        state.throttle = 0
      case Key.space where session != nil: session?.skipMessage()
      case Key.b where interaction != nil: reach(for: .board)
      case Key.t where interaction != nil: reach(for: .take)
      case Key.l where state.craft != nil: leaveCraft()
      default:
        pressed.insert(event.keyCode)
        // Any key tells the scripts the player is there; only some are matched.
        session?.press(Key.bensonKey(for: event.keyCode))
      }
      return true
    case .keyUp:
      pressed.remove(event.keyCode)
      return true
    default:
      return false
    }
  }
}
