import Foundation

/// Finds the Data Payload without hard-coding a developer's directory layout.
///
/// The payload is never bundled with the app (it is game data, deliberately kept
/// out of the repository), so it has to be discovered at launch.
public enum PayloadLocator {
  /// Overrides discovery entirely. Useful for pointing a build at an alternate
  /// export without moving files around.
  public static let environmentKey = "MERCENARY_PAYLOAD"

  public static func locate(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    startingAt start: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath),
    fileExists: (URL) -> Bool = { FileManager.default.fileExists(atPath: $0.path) }
  ) -> URL? {
    if let override = environment[environmentKey], !override.isEmpty {
      let url = URL(fileURLWithPath: override, isDirectory: true)
      return fileExists(url.appendingPathComponent("manifest.json")) ? url : nil
    }
    // Walk up from the working directory: `swift run` starts inside app/, while a
    // built binary is usually launched from the repository root.
    var directory = start.standardizedFileURL
    while true {
      let candidate = directory.appendingPathComponent("payload", isDirectory: true)
      if fileExists(candidate.appendingPathComponent("manifest.json")) {
        return candidate
      }
      let parent = directory.deletingLastPathComponent().standardizedFileURL
      if parent == directory { return nil }
      directory = parent
    }
  }
}
