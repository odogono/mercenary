import Foundation

/// Decoding mirrors for the Data Payload written by `lab payload export`.
///
/// These types describe the on-disk shape only. Anything the renderer or the
/// simulation needs in a friendlier form is derived in ``World``.
public enum Payload {
  public struct Manifest: Codable, Sendable, Equatable {
    public var schemaVersion: Int
    public var sourceDatasetId: String
    public var sourceCoreDigest: String
    public var decoderVersion: Int
    public var counts: [String: Int]
  }

  public struct WorldDocument: Codable, Sendable, Equatable {
    public struct Grid: Codable, Sendable, Equatable {
      public var cellsPerAxis: Int
      public var cellSize: Int
    }

    public struct Bounds: Codable, Sendable, Equatable {
      public var min: [Int]
      public var max: [Int]
    }

    public struct Road: Codable, Sendable, Equatable {
      public var from: [Int]
      public var to: [Int]
      public var segment: Int
    }

    public var schemaVersion: Int
    public var grid: Grid
    public var bounds: Bounds
    public var roads: [Road]
  }

  public struct SurfaceDocument: Codable, Sendable, Equatable {
    public struct Cell: Codable, Sendable, Equatable {
      public var cell: Int
      public var grid: [Int]
      /// World-space integer positions; index space for ``edges``.
      public var vertices: [[Int]]
      /// `[startIndex, endIndex, inkCode]` triples.
      public var edges: [[Int]]
      public var deferredVertices: Int
      public var deferredEdges: Int
    }

    public var schemaVersion: Int
    public var cells: [Cell]
  }

  public struct ObjectsDocument: Codable, Sendable, Equatable {
    public struct Model: Codable, Sendable, Equatable {
      public var id: String
      /// Vertices centred on the model's own bounding cube.
      public var vertices: [[Int]]
      /// `[startIndex, endIndex]` pairs.
      public var edges: [[Int]]
    }

    public struct Instance: Codable, Sendable, Equatable {
      public var slot: Int
      public var id: String
      public var model: String
      public var position: [Int]
      public var orientation: [Int]?
      public var room: Int
      public var stateFlags: Int
      public var rotatable: Bool
      public var placement: String
    }

    public var schemaVersion: Int
    public var models: [Model]
    public var instances: [Instance]
  }

  public struct Bundle: Sendable, Equatable {
    public var manifest: Manifest
    public var world: WorldDocument
    public var surface: SurfaceDocument
    public var objects: ObjectsDocument
    /// Absent when the payload was exported without an interactive capture to
    /// decode text from.
    public var text: TextDocument?

    public init(
      manifest: Manifest,
      world: WorldDocument,
      surface: SurfaceDocument,
      objects: ObjectsDocument,
      text: TextDocument? = nil
    ) {
      self.manifest = manifest
      self.world = world
      self.surface = surface
      self.objects = objects
      self.text = text
    }
  }

  public enum LoadError: Error, CustomStringConvertible, Equatable {
    case missingDirectory(String)
    case missingFile(String)
    case unreadable(String, String)
    case unsupportedSchema(String, Int)

    public var description: String {
      switch self {
      case .missingDirectory(let path):
        return """
          No Data Payload at \(path). Export one with:
            research/c64-reference-build/lab payload export \\
              --dataset research/c64-reference-build/work/<geometry-dataset> --output payload
          """
      case .missingFile(let name):
        return "Data Payload is missing \(name)."
      case .unreadable(let name, let reason):
        return "Could not read \(name) from the Data Payload: \(reason)"
      case .unsupportedSchema(let name, let version):
        return "Data Payload \(name) declares unsupported schemaVersion \(version)."
      }
    }
  }

  public static let supportedSchemaVersion = 1

  /// Load and schema-check a payload directory.
  public static func load(from directory: URL) throws -> Bundle {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: directory.path, isDirectory: &isDirectory), isDirectory.boolValue else {
      throw LoadError.missingDirectory(directory.path)
    }
    let manifest: Manifest = try decode("manifest.json", in: directory)
    let world: WorldDocument = try decode("world.json", in: directory)
    let surface: SurfaceDocument = try decode("surface.json", in: directory)
    let objects: ObjectsDocument = try decode("objects.json", in: directory)

    try check("manifest.json", manifest.schemaVersion)
    try check("world.json", world.schemaVersion)
    try check("surface.json", surface.schemaVersion)
    try check("objects.json", objects.schemaVersion)

    var text: TextDocument?
    if FileManager.default.fileExists(atPath: directory.appendingPathComponent("text.json").path) {
      let decoded: TextDocument = try decode("text.json", in: directory)
      try check("text.json", decoded.schemaVersion)
      text = decoded
    }

    return Bundle(manifest: manifest, world: world, surface: surface, objects: objects, text: text)
  }

  private static func check(_ name: String, _ version: Int) throws {
    guard version == supportedSchemaVersion else {
      throw LoadError.unsupportedSchema(name, version)
    }
  }

  private static func decode<T: Decodable>(_ name: String, in directory: URL) throws -> T {
    let url = directory.appendingPathComponent(name)
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw LoadError.missingFile(name)
    }
    do {
      return try JSONDecoder().decode(T.self, from: try Data(contentsOf: url))
    } catch {
      throw LoadError.unreadable(name, String(describing: error))
    }
  }
}
