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

  var limits = WalkLimits()
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
    static let w: UInt16 = 13
    static let a: UInt16 = 0
    static let s: UInt16 = 1
    static let d: UInt16 = 2
    static let q: UInt16 = 12
    static let e: UInt16 = 14
    static let left: UInt16 = 123
    static let right: UInt16 = 124
    static let up: UInt16 = 126
    static let down: UInt16 = 125
    static let leftBracket: UInt16 = 33
    static let rightBracket: UInt16 = 30
    static let y: UInt16 = 16
    static let b: UInt16 = 11
    static let t: UInt16 = 17
    static let space: UInt16 = 49

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
      limits.groundExtent = Double(world.groundExtent)
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

    state = GameCore.step(state, intent: currentIntent(), dt: elapsed, limits: limits)
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
      // Climbing aboard puts the player where the craft is, as the Reference
      // Build did. It also took the craft's heading, which waits for the flight
      // step that gives a craft a heading worth having.
      if case .boarded = outcome, let craft = world.objects.first(where: { $0.slot == slot }) {
        state.player.position = SIMD3(
          Double(craft.origin.x), state.player.position.y, Double(craft.origin.z)
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
    return Intent(
      forward: axis(Key.w, Key.s),
      strafe: axis(Key.e, Key.q),
      turn: axis(Key.d, Key.a) + axis(Key.right, Key.left),
      lookUp: axis(Key.up, Key.down),
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
      switch event.keyCode {
      case Key.leftBracket: page(by: -1)
      case Key.rightBracket: page(by: 1)
      // Skipping is a reading aid, so it deliberately does not tell the scripts
      // the player pressed something — the opening reads that as intent to walk.
      case Key.space where session != nil: session?.skipMessage()
      case Key.b where interaction != nil: reach(for: .board)
      case Key.t where interaction != nil: reach(for: .take)
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
