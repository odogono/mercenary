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

  /// The message currently on the status line, and how to page through the set.
  struct Comms: Equatable {
    var table: TextTable
    var index: Int

    var text: String {
      // Credits are the only runtime slot the walkabout can honestly fill; the
      // rest stay as placeholders until the simulation owns that state.
      table.message(index, substituting: .init(numbers: [0: 5000])) ?? ""
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
  }

  init() {
    // Spawn facing the tallest structure on the surface, so the first thing on
    // screen is recognisably Targ rather than empty ground.
    state = GameState(
      player: PlayerState(position: SIMD3(557_056, 400, 745_000), heading: 0, pitch: 0.2)
    )
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
    guard var comms, comms.table.messageCount > 0 else { return }
    let count = comms.table.messageCount
    comms.index = ((comms.index + delta) % count + count) % count
    self.comms = comms
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
      let bundle = try Payload.load(from: directory)
      let world = World(bundle: bundle)
      limits.groundExtent = Double(world.groundExtent)
      if let text = bundle.text {
        comms = Comms(table: TextTable(document: text), index: 0)
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

    frameAccumulator.count += 1
    frameAccumulator.seconds += elapsed
    if frameAccumulator.seconds >= 0.5 {
      framesPerSecond = Double(frameAccumulator.count) / frameAccumulator.seconds
      frameAccumulator = (0, 0)
    }
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
      default: pressed.insert(event.keyCode)
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
