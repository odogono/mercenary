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

    public struct RoadSegment: Codable, Sendable, Equatable {
      public var slot: Int
      public var from: [Int]
      public var to: [Int]
    }

    /// One index into the four Reference Build road tables. The cell selects
    /// which entries are consulted; it does not own the segment geometry.
    public struct RoadCell: Codable, Sendable, Equatable {
      public var cell: Int
      public var segments: [RoadSegment]
    }

    public var schemaVersion: Int
    public var grid: Grid
    public var bounds: Bounds
    /// Maps `floor(cameraY / 2048)` to the road-table lookup extent.
    public var roadAltitudeLookup: [Int]
    public var roadCells: [RoadCell]
    public var highAltitudeMap: [RoadSegment]
  }

  public struct SurfaceDocument: Codable, Sendable, Equatable {
    public struct Vertex: Codable, Sendable, Equatable {
      public enum Kind: String, Codable, Sendable {
        case worldPoint = "world-point"
        case rotatedInput = "rotated-input"
      }

      public var kind: Kind
      public var position: [Int]?
      public var rotationInput: [Int]?

      public init(kind: Kind, position: [Int]?, rotationInput: [Int]?) {
        self.kind = kind
        self.position = position
        self.rotationInput = rotationInput
      }
    }

    public struct Rotation: Codable, Sendable, Equatable {
      public var descriptor: Int
      public var center: [Int]
    }

    public struct Cell: Codable, Sendable, Equatable {
      public var cell: Int
      public var grid: [Int]
      public var structure: String?
      /// Original structure point order. Rotated inputs deliberately remain in
      /// the same index space as world points so every decoded edge survives.
      public var vertices: [Vertex]
      /// `[startIndex, endIndex, inkCode]` triples.
      public var edges: [[Int]]
      public var rotation: Rotation?
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

    /// The Reference Build's object detail rule: beyond this cube per axis the
    /// object is drawn as a single projected point rather than its wireframe.
    public struct Visibility: Codable, Sendable, Equatable {
      public var detailCubePerAxis: Int
      public var farRepresentation: String
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
      public var visibility: Visibility
    }

    public var schemaVersion: Int
    public var models: [Model]
    public var instances: [Instance]
  }

  /// The underground rooms, expanded into wireframes at extraction.
  ///
  /// Each room is a closed point space of its own: the Reference Build expands a
  /// room's drawing commands into points before it draws anything, so a room's edge
  /// indices mean nothing outside it.
  public struct RoomsDocument: Codable, Sendable, Equatable {
    public struct Room: Codable, Sendable, Equatable {
      /// A way through to somewhere else, or a behaviour — the Reference Build packs
      /// both into one byte and the decode does not claim to know which is which.
      public struct Portal: Codable, Sendable, Equatable {
        public var linked: Int
        public var plane: String
        public var xMiddle: Int
        public var zMiddle: Int
      }

      public struct Bounds: Codable, Sendable, Equatable {
        public var min: [Int]
        public var max: [Int]
      }

      public var room: Int
      public var vertices: [[Int]]
      /// `[startIndex, endIndex]` pairs into this room's own vertices.
      public var edges: [[Int]]
      public var bounds: Bounds
      public var hasPortal: Bool
      public var portals: [Portal]
    }

    public var schemaVersion: Int
    public var rooms: [Room]

    public func room(_ id: Int) -> Room? {
      rooms.first { $0.room == id }
    }
  }

  /// The lift, which is the only way between the surface and the rooms.
  ///
  /// The rooms' geometry travels in ``RoomsDocument`` out of the dataset; this is the
  /// runtime half — where the lifts are and how one moves.
  public struct UndergroundDocument: Codable, Sendable, Equatable {
    public struct Entrance: Codable, Sendable, Equatable {
      public var site: Int
      /// `[column, row]` on the surface grid.
      public var cell: [Int]
      /// The room this lift arrives in. The Reference Build hands the site straight
      /// to the room setup as a room id, so the two are the same number.
      public var room: Int
    }

    /// Where a lift will take the player from: a square near the middle of the cell.
    public struct Pad: Codable, Sendable, Equatable {
      public var x: Int
      public var z: Int
      /// The position's middle byte is shifted down by this before comparing, so one
      /// pad value covers a run of middle bytes rather than a single one.
      public var shift: Int

      /// Whether a world position stands on the pad, on either axis.
      public func covers(_ position: Double, cellSize: Double) -> Bool {
        let within = position.truncatingRemainder(dividingBy: cellSize)
        let middle = Int(within) >> 8
        return middle >> shift == x
      }
    }

    public struct Lift: Codable, Sendable, Equatable {
      public var ascendRate: Int
      public var descendRate: Int
      public var surfaceAt: Int
      public var submergeAt: Int
      public var surfaceMiddle: Int
      public var submergeMiddle: Int
      public var floor: Int
      public var altitudeWrap: Int
      public var altitudeWrapSubtract: Int
    }

    public var schemaVersion: Int
    public var entrances: [Entrance]
    public var pad: Pad
    public var lift: Lift
    public var counts: [String: Int]

    /// The lift serving a surface cell, if one does.
    public func entrance(column: Int, row: Int) -> Entrance? {
      entrances.first { $0.cell.count == 2 && $0.cell[0] == column && $0.cell[1] == row }
    }
  }

  public struct Bundle: Sendable, Equatable {
    public var manifest: Manifest
    public var world: WorldDocument
    public var surface: SurfaceDocument
    public var objects: ObjectsDocument
    public var rooms: RoomsDocument
    /// Absent when the payload was exported without an interactive capture to
    /// decode text from.
    public var text: TextDocument?
    /// Absent for the same reason as `text`, which it depends on: its inline
    /// messages and message indices are meaningless without the word dictionary.
    public var benson: BensonDocument?
    /// Absent when the payload was exported without a capture to read the
    /// take-and-board rules from.
    public var interaction: InteractionDocument?
    /// Absent for the same reason: the craft dynamics are read from a capture.
    public var flight: FlightDocument?
    /// Absent for the same reason: the lift's rules are read from a capture.
    public var underground: UndergroundDocument?

    public init(
      manifest: Manifest,
      world: WorldDocument,
      surface: SurfaceDocument,
      objects: ObjectsDocument,
      rooms: RoomsDocument,
      text: TextDocument? = nil,
      benson: BensonDocument? = nil,
      interaction: InteractionDocument? = nil,
      flight: FlightDocument? = nil,
      underground: UndergroundDocument? = nil
    ) {
      self.manifest = manifest
      self.world = world
      self.surface = surface
      self.objects = objects
      self.rooms = rooms
      self.text = text
      self.benson = benson
      self.interaction = interaction
      self.flight = flight
      self.underground = underground
    }
  }

  public enum LoadError: Error, CustomStringConvertible, Equatable {
    case missingDirectory(String)
    case missingFile(String)
    case unreadable(String, String)
    case unsupportedSchema(String, Int)
    case unsupportedDecoder(Int)

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
      case .unsupportedDecoder(let version):
        return "Data Payload was extracted with geometry decoder \(version); re-extract and export it."
      }
    }
  }

  public static let supportedSchemaVersion = 4
  public static let supportedDecoderVersion = 3
  /// The text document carries its own version, because its format is
  /// independent of the geometry documents and changes on its own schedule.
  public static let supportedTextSchemaVersion = 1
  /// The Benson document versions separately again: its instruction format is
  /// ours rather than the Reference Build's, so it moves as the interpreter does.
  public static let supportedBensonSchemaVersion = 1
  /// The interaction rules version separately again: they are decoded engine
  /// parameters rather than geometry, and move when that routine's decode does.
  public static let supportedInteractionSchemaVersion = 1
  /// The flight parameters version separately again: they move when the control
  /// loop's decode does, which is independent of every other document.
  public static let supportedFlightSchemaVersion = 3
  /// The lift's rules version separately again, for the same reason.
  public static let supportedUndergroundSchemaVersion = 2

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
    let rooms: RoomsDocument = try decode("rooms.json", in: directory)

    try check("manifest.json", manifest.schemaVersion)
    try check("world.json", world.schemaVersion)
    try check("surface.json", surface.schemaVersion)
    try check("objects.json", objects.schemaVersion)
    try check("rooms.json", rooms.schemaVersion)
    guard manifest.decoderVersion == supportedDecoderVersion else {
      throw LoadError.unsupportedDecoder(manifest.decoderVersion)
    }

    var text: TextDocument?
    if FileManager.default.fileExists(atPath: directory.appendingPathComponent("text.json").path) {
      let decoded: TextDocument = try decode("text.json", in: directory)
      guard decoded.schemaVersion == supportedTextSchemaVersion else {
        throw LoadError.unsupportedSchema("text.json", decoded.schemaVersion)
      }
      text = decoded
    }

    var benson: BensonDocument?
    if FileManager.default.fileExists(atPath: directory.appendingPathComponent("benson.json").path) {
      let decoded: BensonDocument = try decode("benson.json", in: directory)
      guard decoded.schemaVersion == supportedBensonSchemaVersion else {
        throw LoadError.unsupportedSchema("benson.json", decoded.schemaVersion)
      }
      guard text != nil else {
        throw LoadError.missingFile("text.json, which benson.json needs to render its messages")
      }
      benson = decoded
    }

    var interaction: InteractionDocument?
    if FileManager.default.fileExists(atPath: directory.appendingPathComponent("interaction.json").path) {
      let decoded: InteractionDocument = try decode("interaction.json", in: directory)
      guard decoded.schemaVersion == supportedInteractionSchemaVersion else {
        throw LoadError.unsupportedSchema("interaction.json", decoded.schemaVersion)
      }
      interaction = decoded
    }

    var flight: FlightDocument?
    if FileManager.default.fileExists(atPath: directory.appendingPathComponent("flight.json").path) {
      let decoded: FlightDocument = try decode("flight.json", in: directory)
      guard decoded.schemaVersion == supportedFlightSchemaVersion else {
        throw LoadError.unsupportedSchema("flight.json", decoded.schemaVersion)
      }
      flight = decoded
    }

    var underground: UndergroundDocument?
    if FileManager.default.fileExists(atPath: directory.appendingPathComponent("underground.json").path) {
      let decoded: UndergroundDocument = try decode("underground.json", in: directory)
      guard decoded.schemaVersion == supportedUndergroundSchemaVersion else {
        throw LoadError.unsupportedSchema("underground.json", decoded.schemaVersion)
      }
      underground = decoded
    }

    return Bundle(
      manifest: manifest, world: world, surface: surface, objects: objects, rooms: rooms, text: text,
      benson: benson, interaction: interaction, flight: flight, underground: underground
    )
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
