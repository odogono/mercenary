import MacExperienceCore
import SwiftUI

struct PrototypeSettingsView: View {
  @ObservedObject var store: ExperienceStore

  var body: some View {
    TabView {
      GeneralSettings(store: store)
        .tabItem { Label("General", systemImage: "gearshape") }
      ControlSettings(store: store)
        .tabItem { Label("Controls", systemImage: "gamecontroller") }
      AccessSettings(store: store)
        .tabItem { Label("Access", systemImage: "accessibility") }
      AudioSettings(store: store)
        .tabItem { Label("Audio", systemImage: "speaker.wave.2") }
    }
    .padding(20)
    .frame(width: 620, height: 520)
    .alert(item: $store.bindingConflict) { conflict in
      Alert(
        title: Text("Reassign \(conflict.control.title)?"),
        message: Text(
          "This control currently performs \(conflict.displaced.title). Reassign it to \(conflict.replacement.title)?"
        ),
        primaryButton: .destructive(Text("Reassign")) { store.confirmBindingConflict() },
        secondaryButton: .cancel { store.cancelBindingConflict() }
      )
    }
  }
}

private struct GeneralSettings: View {
  @ObservedObject var store: ExperienceStore

  var body: some View {
    Form {
      Section("Prototype status") {
        LabeledContent("Code lifetime", value: "Throwaway")
        LabeledContent("Content", value: "Synthetic only")
        LabeledContent("Contract", value: "Accepted; evidence pending")
      }

      Section("Save scenario") {
        Toggle(
          "Evidence-derived save gate is open",
          isOn: $store.isSaveGateOpen
        )
        Text(
          "Turn this off to exercise disabled document and quick-slot commands. The prototype never creates a semantic autosave."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }

      Section("Active controller") {
        if store.connectedControllers.isEmpty {
          ContentUnavailableView(
            "No controller connected",
            systemImage: "gamecontroller",
            description: Text("Keyboard controls remain available.")
          )
          .frame(height: 110)
        } else {
          Picker(
            "Controller",
            selection: Binding(
              get: { store.preferences.selectedControllerID },
              set: { store.selectController($0) }
            )
          ) {
            ForEach(store.connectedControllers) { controller in
              Text(controller.name).tag(Optional(controller.id))
            }
          }
        }
      }
    }
    .formStyle(.grouped)
  }
}

private struct ControlSettings: View {
  @ObservedObject var store: ExperienceStore
  @State private var deviceKind = DeviceKind.keyboard

  private var profile: ControlProfile {
    deviceKind == .keyboard
      ? store.preferences.keyboardProfile : store.preferences.controllerProfile
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Picker("Device", selection: $deviceKind) {
        Text("Keyboard").tag(DeviceKind.keyboard)
        Text("Controller").tag(DeviceKind.controller)
      }
      .pickerStyle(.segmented)

      HStack {
        Text(profile.name)
          .font(.headline)
        Spacer()
        Menu("Reset Profile") {
          if deviceKind == .keyboard {
            Button("Modern Keyboard") { store.useKeyboardProfile(.modernKeyboard) }
            Button("Reference-style Keyboard") { store.useKeyboardProfile(.referenceKeyboard) }
          } else {
            Button("Modern Controller") { store.useControllerProfile(.modernController) }
            Button("Reference-style Controller") {
              store.useControllerProfile(.referenceController)
            }
          }
        }
      }

      List(SemanticAction.allCases, id: \.self) { action in
        HStack {
          Text(action.title)
          Spacer()
          Menu(bindingTitle(for: action)) {
            ForEach(candidateControls, id: \.self) { control in
              Button(control.title) {
                store.requestBinding(control, to: action, deviceKind: deviceKind)
              }
            }
          }
          .frame(minWidth: 130, alignment: .trailing)
          .accessibilityLabel("Binding for \(action.title)")
        }
      }
      .listStyle(.inset)

      Text(
        "All events become device-independent Semantic Actions. Command-key shortcuts remain reserved for macOS, and OS key repeat is ignored."
      )
      .font(.caption)
      .foregroundStyle(.secondary)
    }
  }

  private var candidateControls: [PhysicalControl] {
    if deviceKind == .keyboard {
      return [
        "w", "a", "s", "d", "space", "b", "e", "l", "t", "p",
        "q", "r", "f", "g", "x", "c", "v", "1", "2", "3", "4",
        "arrow-up", "arrow-down", "arrow-left", "arrow-right",
      ].map(PhysicalControl.key)
    }
    return ["up", "down", "left", "right", "primary", "secondary"].map(
      PhysicalControl.controllerElement)
  }

  private func bindingTitle(for action: SemanticAction) -> String {
    profile.bindings.first(where: { $0.action == action })?.control.title ?? "Choose…"
  }
}

private struct AccessSettings: View {
  @ObservedObject var store: ExperienceStore

  var body: some View {
    Form {
      Section("Visual accommodations") {
        Toggle(
          "High contrast",
          isOn: accommodationBinding(\.highContrast)
        )
        Toggle(
          "Reduced flashing",
          isOn: accommodationBinding(\.reducedFlashing)
        )
        Toggle(
          "Visual descriptions of audio cues",
          isOn: accommodationBinding(\.visualAudioCues)
        )

        LabeledContent("Wireframe weight") {
          Slider(
            value: accommodationValueBinding(\.lineWeight),
            in: 1...2,
            step: 0.25
          )
          .frame(width: 240)
        }

        LabeledContent("Status text") {
          Slider(
            value: accommodationValueBinding(\.textScale),
            in: 1...1.35,
            step: 0.05
          )
          .frame(width: 240)
        }
      }

      Section("Semantic boundary") {
        Text(
          "These options may change redundant presentation only. They do not change projection, visible scene membership, Semantic Actions, simulation timing, progression, or difficulty."
        )
        .font(.callout)
        Text(
          "Timing and difficulty aids require separately governed Departure Records and are not present in this prototype."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
    .formStyle(.grouped)
  }

  private func accommodationBinding(_ keyPath: WritableKeyPath<AccommodationSettings, Bool>)
    -> Binding<Bool>
  {
    Binding(
      get: { store.preferences.accommodations[keyPath: keyPath] },
      set: { value in store.updateAccommodations { $0[keyPath: keyPath] = value } }
    )
  }

  private func accommodationValueBinding(_ keyPath: WritableKeyPath<AccommodationSettings, Double>)
    -> Binding<Double>
  {
    Binding(
      get: { store.preferences.accommodations[keyPath: keyPath] },
      set: { value in store.updateAccommodations { $0[keyPath: keyPath] = value } }
    )
  }
}

private struct AudioSettings: View {
  @ObservedObject var store: ExperienceStore

  var body: some View {
    Form {
      Section("Playback plumbing") {
        LabeledContent("Master") {
          Slider(
            value: Binding(
              get: { store.preferences.masterVolume },
              set: { store.updateAudio(master: $0) }
            ),
            in: 0...1
          )
          .frame(width: 260)
        }
        LabeledContent("Music") {
          Slider(
            value: Binding(
              get: { store.preferences.musicVolume },
              set: { store.updateAudio(music: $0) }
            ),
            in: 0...1
          )
          .frame(width: 260)
        }
        LabeledContent("Effects") {
          Slider(
            value: Binding(
              get: { store.preferences.effectsVolume },
              set: { store.updateAudio(effects: $0) }
            ),
            in: 0...1
          )
          .frame(width: 260)
        }
      }

      Section("Redundant feedback") {
        Toggle(
          "Controller haptics (opt-in prototype hook)",
          isOn: Binding(
            get: { store.preferences.hapticsEnabled },
            set: { store.setHapticsEnabled($0) }
          )
        )
        Text(
          "Haptics and visual cue descriptions may echo an existing cue but never carry gameplay information by themselves. Exact cue content remains evidence-pending."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
    .formStyle(.grouped)
  }

}
