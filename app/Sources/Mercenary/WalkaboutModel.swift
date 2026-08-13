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

  private(set) var load: Load = .loading
  private(set) var state: GameState
  private(set) var framesPerSecond: Double = 0
  private(set) var visibleLines: Int = 0

  var limits = WalkLimits()
  let selector = VisibilitySelector()

  private var pressed: Set<UInt16> = []
  private var running = false
  private var ticker: Timer?
  private var lastTick: CFTimeInterval?
  private var monitor: Any?
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
    pressed.removeAll()
  }

  func report(visibleLines: Int) {
    self.visibleLines = visibleLines
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
      pressed.insert(event.keyCode)
      return true
    case .keyUp:
      pressed.remove(event.keyCode)
      return true
    default:
      return false
    }
  }
}
