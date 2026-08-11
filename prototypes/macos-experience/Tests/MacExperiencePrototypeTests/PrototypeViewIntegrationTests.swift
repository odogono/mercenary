import AppKit
import SwiftUI
import XCTest

@testable import MacExperiencePrototype

@MainActor
final class PrototypeViewIntegrationTests: XCTestCase {
  func testFirstLaunchWelcomeStatePersists() {
    let (defaults, suiteName) = makeDefaults()
    defer { defaults.removePersistentDomain(forName: suiteName) }
    let firstStore = ExperienceStore(defaults: defaults)
    XCTAssertFalse(firstStore.preferences.hasShownWelcome)

    firstStore.markWelcomeShown()
    let restoredStore = ExperienceStore(defaults: defaults)

    XCTAssertTrue(restoredStore.preferences.hasShownWelcome)
  }

  func testMainSurfaceHasValidatedMinimumIntrinsicSize() {
    let (defaults, suiteName) = makeDefaults()
    defer { defaults.removePersistentDomain(forName: suiteName) }
    let store = ExperienceStore(defaults: defaults)
    let hostingView = NSHostingView(rootView: ExperienceView(store: store))

    let fittingSize = hostingView.fittingSize

    XCTAssertGreaterThanOrEqual(fittingSize.width, 800)
    XCTAssertGreaterThanOrEqual(fittingSize.height, 600)
  }

  func testSettingsAndHelpRenderAsNativeViews() {
    let (defaults, suiteName) = makeDefaults()
    defer { defaults.removePersistentDomain(forName: suiteName) }
    let store = ExperienceStore(defaults: defaults)
    let settings = NSHostingView(rootView: PrototypeSettingsView(store: store))
    let help = NSHostingView(rootView: PrototypeHelpView())

    XCTAssertGreaterThan(settings.fittingSize.width, 0)
    XCTAssertGreaterThan(settings.fittingSize.height, 0)
    XCTAssertGreaterThan(help.fittingSize.width, 0)
    XCTAssertGreaterThan(help.fittingSize.height, 0)
  }

  private func makeDefaults() -> (UserDefaults, String) {
    let suiteName = "MacExperiencePrototypeTests.\(UUID().uuidString)"
    return (UserDefaults(suiteName: suiteName)!, suiteName)
  }
}
