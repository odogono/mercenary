import Foundation

package struct ExperiencePreferences: Codable, Equatable, Sendable {
  package var keyboardProfile: ControlProfile
  package var controllerProfile: ControlProfile
  package var accommodations: AccommodationSettings
  package var masterVolume: Double
  package var musicVolume: Double
  package var effectsVolume: Double
  package var hapticsEnabled: Bool
  package var selectedControllerID: String?
  package var hasShownWelcome: Bool

  package init(
    keyboardProfile: ControlProfile, controllerProfile: ControlProfile,
    accommodations: AccommodationSettings, masterVolume: Double, musicVolume: Double,
    effectsVolume: Double, hapticsEnabled: Bool, selectedControllerID: String?,
    hasShownWelcome: Bool
  ) {
    self.keyboardProfile = keyboardProfile
    self.controllerProfile = controllerProfile
    self.accommodations = accommodations
    self.masterVolume = masterVolume
    self.musicVolume = musicVolume
    self.effectsVolume = effectsVolume
    self.hapticsEnabled = hapticsEnabled
    self.selectedControllerID = selectedControllerID
    self.hasShownWelcome = hasShownWelcome
  }

  package static let `default` = ExperiencePreferences(
    keyboardProfile: .modernKeyboard,
    controllerProfile: .modernController,
    accommodations: .default,
    masterVolume: 1,
    musicVolume: 1,
    effectsVolume: 1,
    hapticsEnabled: false,
    selectedControllerID: nil,
    hasShownWelcome: false
  )
}
