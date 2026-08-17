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
      public struct Palette: Codable, Sendable, Equatable {
        public var background: Int
        public var foreground: Int
      }

      /// One opening in this room's wall, and the directed Room Link it carries.
      ///
      /// A Doorway belongs to exactly one room. Two rooms that face each other have
      /// two Doorways and two Room Links, which is why a one-way link needs no
      /// special case: the room on the other side simply has no Doorway back. The
      /// decoder resolved every field here, so nothing in the app reads an opcode.
      public struct Doorway: Codable, Sendable, Equatable {
        /// Where a Doorway leads. The surface is not a room, so it is its own case
        /// rather than a room id of zero.
        public enum Destination: Sendable, Equatable {
          case room(Int)
          case surface
        }

        /// What a Doorway demands before it opens: a lock class, and the object slot
        /// that satisfies it. The skeleton key overrides every one of them.
        public struct Lock: Codable, Sendable, Equatable {
          public var `class`: Int
          public var requiresObject: Int
        }

        public struct Point: Codable, Sendable, Equatable {
          public var x: Int
          public var z: Int
        }

        public var index: Int
        /// The door's shape, which is also its lock class when it has one.
        public var shape: Int
        public var plane: String
        public var position: Point
        public var destination: Destination
        /// Which of the destination room's own Doorways the player arrives in.
        public var arrivalCommandIndex: Int
        /// Where the player lands, already resolved. Absent for the surface, which
        /// the Reference Build places from its own start position instead.
        public var arrival: Point?
        /// False for the one Doorway whose arrival index names a Doorway its
        /// destination does not have; the Reference Build reads past that room's
        /// record and lands the player outside it.
        public var arrivalWithinDestination: Bool
        public var lock: Lock?

        private enum CodingKeys: String, CodingKey {
          case index, shape, plane, position, destination, arrivalCommandIndex, arrival
          case arrivalWithinDestination, lock
        }

        private struct DestinationBox: Codable {
          var room: Int?
          var surface: Bool?
        }

        public init(from decoder: Swift.Decoder) throws {
          let values = try decoder.container(keyedBy: CodingKeys.self)
          index = try values.decode(Int.self, forKey: .index)
          shape = try values.decode(Int.self, forKey: .shape)
          plane = try values.decode(String.self, forKey: .plane)
          position = try values.decode(Point.self, forKey: .position)
          arrivalCommandIndex = try values.decode(Int.self, forKey: .arrivalCommandIndex)
          arrival = try values.decodeIfPresent(Point.self, forKey: .arrival)
          arrivalWithinDestination = try values.decode(Bool.self, forKey: .arrivalWithinDestination)
          lock = try values.decodeIfPresent(Lock.self, forKey: .lock)
          let box = try values.decode(DestinationBox.self, forKey: .destination)
          switch (box.room, box.surface) {
          case (let id?, nil): destination = .room(id)
          case (nil, true): destination = .surface
          default:
            throw DecodingError.dataCorruptedError(
              forKey: .destination,
              in: values,
              debugDescription: "A Doorway must name exactly one of a room or the surface"
            )
          }
        }

        public func encode(to encoder: Swift.Encoder) throws {
          var values = encoder.container(keyedBy: CodingKeys.self)
          try values.encode(index, forKey: .index)
          try values.encode(shape, forKey: .shape)
          try values.encode(plane, forKey: .plane)
          try values.encode(position, forKey: .position)
          try values.encode(arrivalCommandIndex, forKey: .arrivalCommandIndex)
          try values.encodeIfPresent(arrival, forKey: .arrival)
          try values.encode(arrivalWithinDestination, forKey: .arrivalWithinDestination)
          try values.encodeIfPresent(lock, forKey: .lock)
          switch destination {
          case .room(let id): try values.encode(DestinationBox(room: id, surface: nil), forKey: .destination)
          case .surface: try values.encode(DestinationBox(room: nil, surface: true), forKey: .destination)
          }
        }
      }

      /// What entering a room sets off. The Reference Build chooses between these two
      /// on one header bit, so they are alternatives rather than independent fields.
      public enum Entry: Sendable, Equatable {
        case script(Int)
        case message(Int)
      }

      /// A room whose one Doorway the Reference Build rewrites on arrival, and the
      /// destinations it rewrites it to.
      public struct SpecialSetup: Codable, Sendable, Equatable {
        public enum Selector: String, Codable, Sendable {
          /// Chosen at random on every arrival.
          case random
          /// Chosen by which room the player came from.
          case previousRoom
        }

        public struct Alternate: Codable, Sendable, Equatable {
          public var room: Int
          public var arrivalCommandIndex: Int
        }

        public var selector: Selector
        public var alternates: [Alternate]
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
      public var palette: Palette
      /// Dark unless the photon emitter is carried or lying in this room. In the
      /// Reference Build this is the record's terminator rather than a field of its
      /// own, which is why every other room states it too.
      public var dark: Bool
      public var entry: Entry?
      public var specialSetup: SpecialSetup?
      public var doorways: [Doorway]

      private enum CodingKeys: String, CodingKey {
        case room, vertices, edges, bounds, palette, dark, entry, specialSetup, doorways
      }

      private struct EntryBox: Codable {
        var script: Int?
        var message: Int?
      }

      public init(from decoder: Swift.Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        room = try values.decode(Int.self, forKey: .room)
        vertices = try values.decode([[Int]].self, forKey: .vertices)
        edges = try values.decode([[Int]].self, forKey: .edges)
        bounds = try values.decode(Bounds.self, forKey: .bounds)
        palette = try values.decode(Palette.self, forKey: .palette)
        dark = try values.decode(Bool.self, forKey: .dark)
        specialSetup = try values.decodeIfPresent(SpecialSetup.self, forKey: .specialSetup)
        doorways = try values.decode([Doorway].self, forKey: .doorways)
        switch try values.decodeIfPresent(EntryBox.self, forKey: .entry) {
        case nil: entry = nil
        case .some(let box):
          switch (box.script, box.message) {
          case (let script?, nil): entry = .script(script)
          case (nil, let message?): entry = .message(message)
          default:
            throw DecodingError.dataCorruptedError(
              forKey: .entry,
              in: values,
              debugDescription: "A room's entry must be exactly one of a script or a message"
            )
          }
        }
      }

      public func encode(to encoder: Swift.Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(room, forKey: .room)
        try values.encode(vertices, forKey: .vertices)
        try values.encode(edges, forKey: .edges)
        try values.encode(bounds, forKey: .bounds)
        try values.encode(palette, forKey: .palette)
        try values.encode(dark, forKey: .dark)
        try values.encodeIfPresent(specialSetup, forKey: .specialSetup)
        try values.encode(doorways, forKey: .doorways)
        switch entry {
        case nil: break
        case .script(let script): try values.encode(EntryBox(script: script, message: nil), forKey: .entry)
        case .message(let message): try values.encode(EntryBox(script: nil, message: message), forKey: .entry)
        }
      }
    }

    /// The traversal constants, every one an immediate read out of the Reference
    /// Build rather than a number chosen here.
    ///
    /// ``lineColour`` belongs to no Doorway: it is the third of the three colours
    /// darkness clears, and no room carries it, because every room setup stores the
    /// same immediate.
    public struct DoorwayRules: Codable, Sendable, Equatable {
      public var depthHalfWindow: Int
      public var alongWallBias: Int
      public var headingRounding: Int
      public var lockBoundary: Int
      public var keySlotBias: Int
      public var skeletonKeySlot: Int
      public var photonEmitterSlot: Int
      public var lockedMessage: Int
      public var darkMessage: Int
      public var lineColour: Int
      public var cooldownFrames: Int
      public var worldFlipCooldownFrames: Int
      public var randomRoom: Int
      public var worldFlipRoom: Int
    }

    public var schemaVersion: Int
    public var doorwayRules: DoorwayRules
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

  public static let supportedSchemaVersion = 6
  public static let supportedDecoderVersion = 5
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
