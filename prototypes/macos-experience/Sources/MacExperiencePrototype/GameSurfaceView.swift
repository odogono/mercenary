import Combine
import MacExperienceCore
import SwiftUI

struct ExperienceView: View {
  @ObservedObject var store: ExperienceStore
  @Environment(\.openWindow) private var openWindow
  private let timer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()

  var body: some View {
    VStack(spacing: 0) {
      if let notice = store.session.hostNotice {
        HostNoticeView(message: notice, dismiss: store.dismissHostNotice)
          .transition(.move(edge: .top).combined(with: .opacity))
      }
      GameSurfaceView(store: store)
    }
    .background(Color.prototypeMatte)
    .frame(minWidth: 800, minHeight: 600)
    .background(WindowConfigurator(store: store).frame(width: 0, height: 0))
    .onReceive(timer) { _ in store.advanceSimulation(by: 1.0 / 30.0) }
    .onAppear {
      store.startPlatformMonitoring()
      if !store.preferences.hasShownWelcome {
        openWindow(id: "welcome")
        store.markWelcomeShown()
      }
    }
    .onDisappear { store.stopPlatformMonitoring() }
    .alert(
      "Unsaved synthetic progress",
      isPresented: Binding(
        get: { store.confirmationContext != nil },
        set: { if !$0 { store.cancelDestructiveAction() } }
      )
    ) {
      Button("Save…") { store.confirmSaveBeforeDestructiveAction() }
      Button("Discard", role: .destructive) { store.confirmDiscardBeforeDestructiveAction() }
      Button("Cancel", role: .cancel) { store.cancelDestructiveAction() }
    } message: {
      Text(store.confirmationContext ?? "")
    }
  }
}

private struct HostNoticeView: View {
  var message: String
  var dismiss: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "info.circle")
        .accessibilityHidden(true)
      Text(message)
        .font(.callout)
      Spacer()
      Button("Dismiss", action: dismiss)
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 36)
    .background(.bar)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Host notice: \(message)")
  }
}

private struct GameSurfaceView: View {
  @ObservedObject var store: ExperienceStore

  var body: some View {
    GeometryReader { proxy in
      let layout = GameSurfaceLayout.resolve(
        in: PrototypeSize(width: proxy.size.width, height: proxy.size.height),
        accommodations: store.preferences.accommodations
      )

      ZStack {
        Color.prototypeMatte

        SyntheticCameraView(
          accommodations: store.preferences.accommodations,
          isPaused: store.session.isPaused,
          isMessageVisible: store.isMessageVisible,
          activeActions: store.activeActions
        )
        .frame(width: layout.gameplayFrame.width, height: layout.gameplayFrame.height)
        .position(x: layout.gameplayFrame.midX, y: layout.gameplayFrame.midY)

        StatusPanel(
          composition: layout.composition,
          simulationTime: store.session.simulationTime,
          heading: store.syntheticHeading,
          actions: store.activeActions,
          isDirty: store.isDirty,
          saveGateOpen: store.isSaveGateOpen,
          profileName: store.preferences.keyboardProfile.name,
          hapticsEnabled: store.preferences.hapticsEnabled,
          textScale: store.preferences.accommodations.textScale
        )
        .frame(width: layout.statusFrame.width, height: layout.statusFrame.height)
        .position(x: layout.statusFrame.midX, y: layout.statusFrame.midY)
      }
      .animation(.easeInOut(duration: 0.18), value: layout.composition)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Synthetic Game Surface, \(layout.composition.title) composition")
    }
  }
}

private struct SyntheticCameraView: View {
  var accommodations: AccommodationSettings
  var isPaused: Bool
  var isMessageVisible: Bool
  var activeActions: Set<SemanticAction>

  private var lineColor: Color {
    accommodations.highContrast ? .white : .prototypeLine
  }

  var body: some View {
    ZStack {
      Color.prototypeCamera

      Canvas { context, size in
        let scaleX = size.width / 640
        let scaleY = size.height / 480
        var path = Path()
        path.move(to: CGPoint(x: 0, y: 302 * scaleY))
        path.addLine(to: CGPoint(x: 640 * scaleX, y: 302 * scaleY))
        path.move(to: CGPoint(x: 40 * scaleX, y: 302 * scaleY))
        path.addLines([
          CGPoint(x: 128 * scaleX, y: 210 * scaleY),
          CGPoint(x: 216 * scaleX, y: 302 * scaleY),
          CGPoint(x: 128 * scaleX, y: 352 * scaleY),
          CGPoint(x: 40 * scaleX, y: 302 * scaleY),
        ])
        path.move(to: CGPoint(x: 452 * scaleX, y: 302 * scaleY))
        path.addLines([
          CGPoint(x: 492 * scaleX, y: 244 * scaleY),
          CGPoint(x: 556 * scaleX, y: 262 * scaleY),
          CGPoint(x: 590 * scaleX, y: 302 * scaleY),
        ])
        path.move(to: CGPoint(x: 320 * scaleX, y: 90 * scaleY))
        path.addLine(to: CGPoint(x: 320 * scaleX, y: 142 * scaleY))
        path.move(to: CGPoint(x: 294 * scaleX, y: 116 * scaleY))
        path.addLine(to: CGPoint(x: 346 * scaleX, y: 116 * scaleY))
        context.stroke(
          path,
          with: .color(lineColor),
          lineWidth: max(1, accommodations.lineWeight * min(scaleX, scaleY))
        )
      }
      .accessibilityHidden(true)

      VStack {
        HStack {
          Text("SYNTHETIC NAVIGATION STUDY")
          Spacer()
          Text("FIXED 640 × 480 PROJECTION")
        }
        .font(.system(size: 11 * accommodations.textScale, weight: .medium, design: .monospaced))
        .foregroundStyle(lineColor.opacity(0.85))
        .padding(12)
        Spacer()

        if accommodations.visualAudioCues, activeActions.contains(.primaryAction) {
          Label("Visual cue: synthetic pulse", systemImage: "waveform")
            .font(.system(.callout, design: .monospaced))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Color.prototypeCamera.opacity(0.94))
            .overlay(Rectangle().stroke(lineColor, lineWidth: 1))
            .accessibilityLabel("Visual audio cue: synthetic pulse")
        }

        if isMessageVisible {
          Text("PROTOTYPE MESSAGE · HOST UI REMAINS OUTSIDE THIS SURFACE")
            .font(
              .system(size: 12 * accommodations.textScale, weight: .semibold, design: .monospaced)
            )
            .foregroundStyle(lineColor)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color.prototypeCamera.opacity(0.92))
            .overlay(Rectangle().stroke(lineColor.opacity(0.8), lineWidth: 1))
            .padding(.bottom, 16)
        }
      }

      if isPaused {
        Text("PAUSED")
          .font(.system(size: 24, weight: .bold, design: .monospaced))
          .tracking(4)
          .foregroundStyle(lineColor)
          .padding(.horizontal, 18)
          .padding(.vertical, 12)
          .background(Color.prototypeCamera.opacity(0.94))
          .overlay(Rectangle().stroke(lineColor, lineWidth: 1))
          .accessibilityAddTraits(.isHeader)
      }
    }
    .clipped()
    .overlay(Rectangle().stroke(lineColor.opacity(0.6), lineWidth: 1))
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Synthetic fixed-projection wireframe scene")
    .accessibilityValue(isPaused ? "Paused" : "Running")
  }
}

private struct StatusPanel: View {
  var composition: DisplayComposition
  var simulationTime: TimeInterval
  var heading: Double
  var actions: Set<SemanticAction>
  var isDirty: Bool
  var saveGateOpen: Bool
  var profileName: String
  var hapticsEnabled: Bool
  var textScale: Double

  private var fields: [(String, String)] {
    [
      ("TIME", String(format: "%07.2f", simulationTime)),
      ("VECTOR", String(format: "%03.0f°", heading.truncatingRemainder(dividingBy: 360))),
      (
        "INPUT",
        actions.isEmpty
          ? "IDLE"
          : actions.sorted(by: { $0.rawValue < $1.rawValue }).map(\.shortTitle).joined(
            separator: "+")
      ),
      ("PROFILE", profileName.uppercased()),
      ("SAVE", saveGateOpen ? (isDirty ? "CHANGED" : "CLEAN") : "EVIDENCE GATE"),
      ("HAPTIC", hapticsEnabled ? "OPT-IN ARMED" : "OFF"),
    ]
  }

  var body: some View {
    Group {
      if composition == .wide {
        VStack(alignment: .leading, spacing: 0) { fieldViews }
      } else {
        HStack(alignment: .top, spacing: 0) { fieldViews }
      }
    }
    .background(Color.prototypeStatus)
    .overlay(Rectangle().stroke(Color.prototypeLine.opacity(0.45), lineWidth: 1))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Synthetic status information")
  }

  @ViewBuilder
  private var fieldViews: some View {
    ForEach(fields, id: \.0) { label, value in
      VStack(alignment: .leading, spacing: 5) {
        Text(label)
          .font(.system(size: 9 * textScale, weight: .semibold, design: .monospaced))
          .foregroundStyle(Color.prototypeLine.opacity(0.58))
        Text(value)
          .font(.system(size: 12 * textScale, weight: .medium, design: .monospaced))
          .foregroundStyle(Color.prototypeLine)
          .lineLimit(composition == .wide ? 3 : 2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(12)
      .accessibilityElement(children: .combine)
      .accessibilityLabel("\(label): \(value)")
    }
  }
}

extension PrototypeRect {
  fileprivate var midX: Double { x + width / 2 }
  fileprivate var midY: Double { y + height / 2 }
}

extension DisplayComposition {
  var title: String { self == .stacked ? "stacked" : "wide" }
}

extension SemanticAction {
  var title: String {
    switch self {
    case .moveForward: "Move Forward"
    case .moveBackward: "Move Backward"
    case .turnLeft: "Turn Left"
    case .turnRight: "Turn Right"
    case .primaryAction: "Primary Action"
    case .brake: "Brake"
    case .board: "Board"
    case .leave: "Leave"
    case .take: "Take"
    case .drop: "Drop"
    case .activate: "Activate"
    case .pause: "Pause"
    case .save: "Save"
    case .load: "Load"
    case .quitSituation: "Quit Situation"
    }
  }

  var shortTitle: String {
    switch self {
    case .moveForward: "FWD"
    case .moveBackward: "BACK"
    case .turnLeft: "LEFT"
    case .turnRight: "RIGHT"
    case .primaryAction: "PRIMARY"
    default: title.uppercased()
    }
  }
}

extension PhysicalControl {
  var title: String {
    switch self {
    case .key(let key): key.replacingOccurrences(of: "-", with: " ").uppercased()
    case .controllerElement(let element): element.uppercased()
    }
  }
}

extension Color {
  fileprivate static let prototypeMatte = Color(red: 0.035, green: 0.052, blue: 0.050)
  fileprivate static let prototypeCamera = Color(red: 0.018, green: 0.027, blue: 0.026)
  fileprivate static let prototypeStatus = Color(red: 0.050, green: 0.074, blue: 0.070)
  fileprivate static let prototypeLine = Color(red: 0.56, green: 0.80, blue: 0.70)
}
