import Foundation

/// The app's tuned values, kept as data so they can be changed without a rebuild.
///
/// Everything here is a feel choice rather than a decoded fact: the Reference
/// Build's own numbers live in the Data Payload and in the decode notes, while
/// these are the speeds and pauses chosen for a modern player (ADR 0014). They
/// are settings precisely because judging them means playing, and playing them
/// should not mean editing Swift.
///
/// Every field has a default, so a file may name only what it changes.
public struct Settings: Codable, Sendable, Equatable {
  public struct Message: Codable, Sendable, Equatable {
    /// How long a fully revealed message stays up to be read.
    public var holdSeconds: Double
    /// How fast the message line reveals text, before the script timing scale.
    public var charactersPerSecond: Double

    public init(
      holdSeconds: Double = MessageTicker.referenceHold,
      charactersPerSecond: Double = MessageTicker.referenceRate
    ) {
      self.holdSeconds = holdSeconds
      self.charactersPerSecond = charactersPerSecond
    }

    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      let defaults = Message()
      holdSeconds = try container.decodeIfPresent(Double.self, forKey: .holdSeconds) ?? defaults.holdSeconds
      charactersPerSecond =
        try container.decodeIfPresent(Double.self, forKey: .charactersPerSecond) ?? defaults.charactersPerSecond
    }
  }

  public struct Scripts: Codable, Sendable, Equatable {
    /// Multiplies the pace of the Reference Build's own script timing: its waits
    /// and its message reveal. The reading hold is deliberately not scaled by it.
    public var timeScale: Double
    /// Instructions one advance may run before yielding, which stands in for the
    /// frame boundary the original interpreter had for free.
    public var instructionBudget: Int

    public init(timeScale: Double = 6, instructionBudget: Int = 512) {
      self.timeScale = timeScale
      self.instructionBudget = instructionBudget
    }

    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      let defaults = Scripts()
      timeScale = try container.decodeIfPresent(Double.self, forKey: .timeScale) ?? defaults.timeScale
      instructionBudget =
        try container.decodeIfPresent(Int.self, forKey: .instructionBudget) ?? defaults.instructionBudget
    }
  }

  public struct Flight: Codable, Sendable, Equatable {
    /// Frames per second the decoded craft parameters were written for. This is
    /// the one knob that paces every craft at once, walking included.
    public var referenceFrameRate: Double
    public var turnScale: Double
    public var pitchScale: Double
    public var speedScale: Double
    /// How much faster a held run key walks. The Reference Build had no run.
    public var runMultiplier: Double
    /// The notch the lowest throttle key selects. The decoded ladder spans 512 to
    /// 1, so starting part way up is what makes all ten keys do something.
    public var throttleFloorNotch: Int
    /// Eye height on foot. Absent means the Reference Build's own ground
    /// altitude, which the payload carries.
    public var groundAltitude: Double?

    // Each knob's default is the control loop's own, so it lives once, on
    // ``ControlLimits``, rather than being restated here.
    public init(
      referenceFrameRate: Double = ControlLimits().referenceFrameRate,
      turnScale: Double = ControlLimits().turnScale,
      pitchScale: Double = ControlLimits().pitchScale,
      speedScale: Double = ControlLimits().speedScale,
      runMultiplier: Double = ControlLimits().runMultiplier,
      throttleFloorNotch: Int = ControlLimits().throttleFloorNotch,
      groundAltitude: Double? = ControlLimits().groundAltitude
    ) {
      self.referenceFrameRate = referenceFrameRate
      self.turnScale = turnScale
      self.pitchScale = pitchScale
      self.speedScale = speedScale
      self.runMultiplier = runMultiplier
      self.throttleFloorNotch = throttleFloorNotch
      self.groundAltitude = groundAltitude
    }

    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      let defaults = Flight()
      referenceFrameRate =
        try container.decodeIfPresent(Double.self, forKey: .referenceFrameRate) ?? defaults.referenceFrameRate
      turnScale = try container.decodeIfPresent(Double.self, forKey: .turnScale) ?? defaults.turnScale
      pitchScale = try container.decodeIfPresent(Double.self, forKey: .pitchScale) ?? defaults.pitchScale
      speedScale = try container.decodeIfPresent(Double.self, forKey: .speedScale) ?? defaults.speedScale
      runMultiplier =
        try container.decodeIfPresent(Double.self, forKey: .runMultiplier) ?? defaults.runMultiplier
      throttleFloorNotch =
        try container.decodeIfPresent(Int.self, forKey: .throttleFloorNotch) ?? defaults.throttleFloorNotch
      groundAltitude = try container.decodeIfPresent(Double.self, forKey: .groundAltitude)
    }

    /// The host bounds and knobs the control loop takes, for one world's extent.
    public func limits(groundExtent: Double) -> ControlLimits {
      ControlLimits(
        referenceFrameRate: referenceFrameRate,
        turnScale: turnScale,
        pitchScale: pitchScale,
        speedScale: speedScale,
        runMultiplier: runMultiplier,
        throttleFloorNotch: throttleFloorNotch,
        groundExtent: groundExtent,
        groundAltitude: groundAltitude
      )
    }

    /// The flight model these knobs produce for one payload's parameters.
    public func model(for document: Payload.FlightDocument, groundExtent: Double) -> FlightModel {
      FlightModel(document: document, limits: limits(groundExtent: groundExtent))
    }
  }

  public var message: Message
  public var scripts: Scripts
  public var flight: Flight

  public init(message: Message = Message(), scripts: Scripts = Scripts(), flight: Flight = Flight()) {
    self.message = message
    self.scripts = scripts
    self.flight = flight
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    message = try container.decodeIfPresent(Message.self, forKey: .message) ?? Message()
    scripts = try container.decodeIfPresent(Scripts.self, forKey: .scripts) ?? Scripts()
    flight = try container.decodeIfPresent(Flight.self, forKey: .flight) ?? Flight()
  }

  /// Script pacing built from these settings, for one payload's tick length.
  public func bensonTunables(framesPerTick: Int) -> BensonTunables {
    BensonTunables(
      framesPerTick: framesPerTick,
      timeScale: scripts.timeScale,
      instructionBudget: scripts.instructionBudget,
      messageCharactersPerSecond: message.charactersPerSecond,
      messageHoldSeconds: message.holdSeconds
    )
  }

  public enum LoadError: Error, CustomStringConvertible, Equatable {
    case unreadable(String, String)

    public var description: String {
      switch self {
      case .unreadable(let path, let reason):
        // A typo here would otherwise leave a tuning session quietly running the
        // defaults, so it is reported rather than shrugged off.
        return "Could not read settings from \(path): \(reason)"
      }
    }
  }

  /// Load the settings file, or the defaults when there is none.
  public static func load(
    at url: URL? = SettingsLocator.locate(),
    read: (URL) throws -> Data = { try Data(contentsOf: $0) }
  ) throws -> Settings {
    guard let url else { return Settings() }
    do {
      return try JSONDecoder().decode(Settings.self, from: try read(url))
    } catch {
      throw LoadError.unreadable(url.lastPathComponent, String(describing: error))
    }
  }
}

/// Finds the settings file, in the same spirit as ``PayloadLocator``.
public enum SettingsLocator {
  public static let environmentKey = "MERCENARY_SETTINGS"
  public static let fileName = "settings.json"

  public static func locate(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    startingAt start: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath),
    fileExists: (URL) -> Bool = { FileManager.default.fileExists(atPath: $0.path) }
  ) -> URL? {
    if let override = environment[environmentKey], !override.isEmpty {
      let url = URL(fileURLWithPath: override)
      return fileExists(url) ? url : nil
    }
    // Walk up from the working directory, as the payload does: `swift run` starts
    // inside app/, while a built binary usually starts at the repository root.
    var directory = start.standardizedFileURL
    while true {
      let candidate = directory.appendingPathComponent(fileName)
      if fileExists(candidate) { return candidate }
      let parent = directory.deletingLastPathComponent().standardizedFileURL
      if parent == directory { return nil }
      directory = parent
    }
  }
}
