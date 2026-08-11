import XCTest

@testable import MacExperienceCore

final class PreferencesTests: XCTestCase {
  func testPreferencesRoundTripPreservesDeviceAwareProfiles() throws {
    let preferences = ExperiencePreferences(
      keyboardProfile: .modernKeyboard,
      controllerProfile: .referenceController,
      accommodations: .maximumPrototypeSet,
      masterVolume: 0.75,
      musicVolume: 0.5,
      effectsVolume: 0.9,
      hapticsEnabled: true,
      selectedControllerID: "pad-a",
      hasShownWelcome: true
    )

    let encoded = try JSONEncoder().encode(preferences)
    let decoded = try JSONDecoder().decode(ExperiencePreferences.self, from: encoded)

    XCTAssertEqual(decoded, preferences)
  }

  func testDefaultsUseModernProfilesAndOptOutOfHaptics() {
    let preferences = ExperiencePreferences.default

    XCTAssertEqual(preferences.keyboardProfile.name, "Modern Keyboard")
    XCTAssertEqual(preferences.controllerProfile.name, "Modern Controller")
    XCTAssertFalse(preferences.hapticsEnabled)
    XCTAssertFalse(preferences.hasShownWelcome)
  }
}
