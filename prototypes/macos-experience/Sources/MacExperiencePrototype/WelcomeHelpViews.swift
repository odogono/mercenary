import SwiftUI

struct WelcomeView: View {
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      Image(systemName: "point.3.connected.trianglepath.dotted")
        .font(.system(size: 34, weight: .light))
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 8) {
        Text("Mac Experience Prototype")
          .font(.title2.weight(.semibold))
        Text(
          "A synthetic interaction study for the boundary between the fidelity-governed Game Surface and the minimal Native Shell."
        )
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      }

      Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 10) {
        welcomeRow(
          "arrow.up.left.and.arrow.down.right", "Resize freely",
          "The projection and visible scene remain invariant.")
        welcomeRow(
          "keyboard", "Use keyboard or controller",
          "Modern, Reference-style, and custom profiles are available.")
        welcomeRow(
          "accessibility", "Try Accommodations",
          "Contrast, line weight, text, flash, and cue options stay semantically neutral.")
      }

      HStack {
        SettingsLink { Text("Open Settings") }
        Button("Open Help") { openWindow(id: "help") }
        Spacer()
      }
    }
    .padding(28)
    .frame(width: 520, height: 360)
  }

  private func welcomeRow(_ symbol: String, _ title: String, _ detail: String) -> some View {
    GridRow {
      Image(systemName: symbol)
        .frame(width: 24)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.headline)
        Text(detail).font(.caption).foregroundStyle(.secondary)
      }
    }
  }
}

struct PrototypeHelpView: View {
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        helpSection("Purpose") {
          Text(
            "This executable is a throwaway, synthetic prototype for issue #9. Its durable output is the accepted macOS experience contract, not production architecture or game content."
          )
        }
        helpSection("Controls") {
          Text(
            "The modern keyboard profile uses W, A, S, D and Space for the representative motion and primary actions. A selected controller and keyboard may contribute simultaneously. Configure every Semantic Action in Settings."
          )
        }
        helpSection("Presentation") {
          Text(
            "Ordinary windows use a stacked Display Composition. Wide windows move status beside the fixed 640 × 480 synthetic projection. Resize, enter native full screen, and compare the scene membership in both compositions."
          )
        }
        helpSection("Evidence gates") {
          Text(
            "Bindings, timings, save availability, exact cues, and characteristic feel remain pending the linked Reference Build uncertainties. Nothing shown here is a final conformance claim."
          )
        }
        helpSection("Reviewer task") {
          Text(
            "Complete scenarios MAS-0001 through MAS-0007 in docs/macos-experience.md and record findings without committing Restricted Material."
          )
        }
      }
      .padding(28)
      .frame(maxWidth: 680, alignment: .leading)
    }
    .frame(minWidth: 620, minHeight: 480)
  }

  private func helpSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content)
    -> some View
  {
    VStack(alignment: .leading, spacing: 7) {
      Text(title).font(.headline)
      content().foregroundStyle(.secondary)
    }
  }
}
