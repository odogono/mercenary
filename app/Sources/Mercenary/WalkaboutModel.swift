import AppKit
import MercenaryKit
import Observation
import SwiftUI

/// Drives the clock, turns physical keys into a device-independent ``Intent``, and
/// draws what the session reports. The core never learns which keys exist.
///
/// No game state lives here. A ``GameplaySession`` owns all of it (ADR 0018), which
/// is what makes this path and the headless emitters the same path: everything below
/// the key table is a call into the session and a read of its snapshot.
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
  /// What the session last reported. The only description of play this shell has.
  private(set) var snapshot = SessionSnapshot(
    player: OpeningScene.player, location: .surface, occupancy: .onFoot, mode: .grounded,
    throttle: 0, throttleNotch: 0, elapsed: 0, message: "", credits: 0,
    isScriptRunning: false, hiddenSlots: [], displacedObjects: [:]
  )
  private(set) var framesPerSecond: Double = 0
  private(set) var visibleLines: Int = 0
  private(set) var visiblePoints: Int = 0
  private(set) var comms: Comms?
  let selector = VisibilitySelector()

  /// The opening script, which the Reference Build starts play with.
  static let openingScript = 0

  /// Tuned values read from `settings.json`, so judging them does not mean
  /// editing Swift. Falls back to the built-in defaults when there is no file.
  private(set) var settings = Settings()

  /// Everything that can change during play.
  private var session: GameplaySession?
  /// Kept only to page the message table when there are no scripts to run it.
  private var browsingTable: TextTable?

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
    static let e: UInt16 = 14
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

  init() {}

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
      var scripts: BensonSession?
      if let text = bundle.text {
        let table = TextTable(document: text)
        if let document = bundle.benson {
          let program = try BensonProgram(document: document)
          scripts = BensonSession(
            program: program,
            text: table,
            tunables: settings.bensonTunables(framesPerTick: program.framesPerTick)
          )
        } else {
          browsingTable = table
          comms = .browsing(table: table, index: 0)
        }
      }
      var session = GameplaySession(
        content: GameplaySession.Content(
          world: world,
          bundle: bundle,
          flight: bundle.flight.map {
            settings.flight.model(for: $0, groundExtent: Double(world.groundExtent))
          }
        ),
        player: OpeningScene.player,
        scripts: scripts
      )
      if scripts != nil {
        session.start(script: Self.openingScript)
        comms = .scripted(text: "", credits: session.snapshot.credits)
      }
      snapshot = session.snapshot
      self.session = session
      load = .ready(world, bundle.manifest)
    } catch {
      load = .failed(String(describing: error))
    }
  }

  private func tick() {
    let now = CACurrentMediaTime()
    let elapsed = min(0.25, max(0, now - (lastTick ?? now)))
    lastTick = now
    guard elapsed > 0, session != nil else { return }

    session?.intent = currentIntent()
    if let update = session?.advance(by: elapsed) {
      apply(update)
    }

    frameAccumulator.count += 1
    frameAccumulator.seconds += elapsed
    if frameAccumulator.seconds >= 0.5 {
      framesPerSecond = Double(frameAccumulator.count) / frameAccumulator.seconds
      frameAccumulator = (0, 0)
    }
  }

  /// Take a session update and turn its events into host feedback.
  private func apply(_ update: (snapshot: SessionSnapshot, events: [PresentationEvent])) {
    snapshot = update.snapshot
    for event in update.events {
      switch event {
      case .tone:
        // The Reference Build answered an accepted action with a tone.
        NSSound.beep()
      case .script(.keyAcknowledged):
        NSSound.beep()
      case .script(.sound), .script(.cityLocationChanged), .script(.scriptFinished),
        .script(.playMessage):
        // Sound waits for an audio pass; the location readout and script
        // completion wait for the surfaces that would show them.
        break
      case .touchdown, .arrived:
        // The session has already applied these; the tone alongside them is the
        // only thing a shell has to say about them today.
        break
      case .wall:
        // Deliberately silent: the wall's sound is one of the Reference Build's
        // per-frame SID effects, and audio is out of scope here. The event fires
        // correctly, so this is the only line that has to change to hear it.
        break
      }
    }
    if browsingTable == nil {
      comms = .scripted(text: snapshot.message, credits: snapshot.credits)
    }
  }

  /// What the player is currently in, for the status strip. The Reference Build's
  /// object tables carry no names for the craft, so the slot is what there is.
  var craftName: String {
    guard let craft = snapshot.occupancy.craft else { return "ON FOOT" }
    return String(format: "CRAFT %02d", craft)
  }

  var throttleNotch: Int { snapshot.throttleNotch }
  var hiddenSlots: Set<Int> { snapshot.hiddenSlots }
  var displacedObjects: [Int: SIMD3<Double>] { snapshot.displacedObjects }

  private func currentIntent() -> Intent {
    func axis(_ positive: UInt16, _ negative: UInt16) -> Double {
      (pressed.contains(positive) ? 1 : 0) - (pressed.contains(negative) ? 1 : 0)
    }
    // The cursor keys are the whole movement surface, as the original's stick was.
    // Up and down walk while on foot and pitch while aboard, and aboard they read
    // as a stick rather than a camera: pushing forward puts the nose down.
    let vertical = axis(Key.up, Key.down)
    let onFoot = snapshot.occupancy == .onFoot
    return Intent(
      turn: axis(Key.right, Key.left),
      pitch: onFoot ? 0 : -vertical,
      walk: onFoot ? vertical : 0,
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
      guard session != nil else { return true }
      let aboard = snapshot.occupancy != .onFoot
      // The throttle moves only from a craft, whichever key asks for it.
      if aboard {
        if let notch = Key.throttleNotch(for: event.keyCode) {
          session?.throttle(notch: notch)
          publish()
          return true
        }
        if event.keyCode == Key.minus || event.keyCode == Key.equal {
          session?.throttle(step: event.keyCode == Key.equal ? 1 : -1)
          publish()
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
      case Key.space where aboard:
        session?.shutThrottle()
      case Key.space:
        session?.skipMessage()
      case Key.b: act { $0.reach(for: .board).1 }
      case Key.t: act { $0.reach(for: .take).1 }
      case Key.l where aboard: act { $0.leaveCraft()?.events ?? [] }
      case Key.e: act { $0.rideLift() ?? [] }
      default:
        pressed.insert(event.keyCode)
        // Any key tells the scripts the player is there; only some are matched.
        session?.press(Key.bensonKey(for: event.keyCode))
      }
      publish()
      return true
    case .keyUp:
      pressed.remove(event.keyCode)
      return true
    default:
      return false
    }
  }

  /// Run one Semantic Action on the session and act on what it reports.
  private func act(_ body: (inout GameplaySession) -> [PresentationEvent]) {
    guard var session else { return }
    let events = body(&session)
    self.session = session
    apply((session.snapshot, events))
  }

  /// Republish the snapshot after a call that reports no events.
  private func publish() {
    guard let session else { return }
    snapshot = session.snapshot
    if browsingTable == nil {
      comms = .scripted(text: snapshot.message, credits: snapshot.credits)
    }
  }
}
