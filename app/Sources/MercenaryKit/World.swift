import Foundation

/// How a line should be drawn. The Reference Build's surface expansion splits a
/// structure's edges into two ink operations; they read as a bright and a dim
/// pass over the same wireframe.
public enum Ink: Int, Sendable, Equatable, CaseIterable {
  case white = 0
  case black = 1
}

public struct Segment: Sendable, Equatable {
  public var a: SIMD3<Float>
  public var b: SIMD3<Float>
  public var ink: Ink

  public init(a: SIMD3<Float>, b: SIMD3<Float>, ink: Ink) {
    self.a = a
    self.b = b
    self.ink = ink
  }
}

/// One placed object, kept as a model rather than pre-flattened segments so the
/// renderer can choose lines-or-point per frame.
public struct ObjectPlacement: Sendable, Equatable {
  public var slot: Int
  public var id: String
  public var model: String
  /// Where the object sits, and the point its far representation is drawn at.
  public var origin: SIMD3<Float>
  /// World-space vertices with orientation already applied.
  public var vertices: [SIMD3<Float>]
  public var edges: [(Int, Int)]
  /// Beyond this per-axis distance the object collapses to a point.
  public var detailCube: Float
  public var drawsFarAsPoint: Bool
  public var orientation: Orientation
  /// "surface" or "room". Room instances carry room-local coordinates, so they
  /// are inspectable but must not be drawn on the surface.
  public var placement: String
  /// False when the position falls outside the world grid — several slots are
  /// parked far beyond it rather than placed.
  public var withinWorld: Bool
  public var room: Int
  public var stateFlags: Int

  /// Whether this instance belongs in the surface scene.
  public var isDrawable: Bool { placement == "surface" && withinWorld }

  public static func == (a: ObjectPlacement, b: ObjectPlacement) -> Bool {
    a.slot == b.slot && a.vertices == b.vertices && a.edges.elementsEqual(b.edges, by: ==)
  }

  /// The object's own line segments, for when it is inside the detail cube.
  public var segments: [Segment] {
    edges.compactMap { edge in
      guard vertices.indices.contains(edge.0), vertices.indices.contains(edge.1) else { return nil }
      return Segment(a: vertices[edge.0], b: vertices[edge.1], ink: .white)
    }
  }

  /// True when every axis is within the detail cube, so the wireframe is drawn.
  public func isDetailed(from position: SIMD3<Double>) -> Bool {
    let cube = Double(detailCube)
    return abs(Double(origin.x) - position.x) <= cube
      && abs(Double(origin.y) - position.y) <= cube
      && abs(Double(origin.z) - position.z) <= cube
  }
}

/// One full surface map line decoded from a road-table endpoint pair.
public struct SurfaceMapLine: Sendable, Equatable {
  public var segment: Segment
  public var startPacked: Int
  public var endPacked: Int
  public var slot: Int
}

/// One grid cell's drawable content, kept together so the renderer can cull by
/// cell before touching individual segments.
public struct WorldCell: Sendable, Equatable {
  public var index: Int
  public var column: Int
  public var row: Int
  /// Centre of the cell on the ground plane, for distance culling.
  public var centre: SIMD3<Float>
  private var vertices: [SurfaceVertex]
  private var edges: [SurfaceEdge]
  private var rotation: SurfaceRotation?

  init(
    index: Int, column: Int, row: Int, centre: SIMD3<Float>,
    vertices: [SurfaceVertex], edges: [SurfaceEdge], rotation: SurfaceRotation?
  ) {
    self.index = index
    self.column = column
    self.row = row
    self.centre = centre
    self.vertices = vertices
    self.edges = edges
    self.rotation = rotation
  }

  /// Resolve runtime-rotated points and return the cell's complete wireframe.
  public func segments(at elapsed: Double) -> [Segment] {
    let points = vertices.map { vertex in
      switch vertex {
      case .world(let point):
        return point
      case .rotated(let input):
        return rotation?.resolve(input, elapsed: elapsed) ?? .zero
      }
    }
    return edges.compactMap { edge in
      guard points.indices.contains(edge.start), points.indices.contains(edge.end) else { return nil }
      return Segment(a: points[edge.start], b: points[edge.end], ink: edge.ink)
    }
  }
}

enum SurfaceVertex: Sendable, Equatable {
  case world(SIMD3<Float>)
  case rotated(SIMD3<Int>)
}

struct SurfaceEdge: Sendable, Equatable {
  var start: Int
  var end: Int
  var ink: Ink
}

struct SurfaceRotation: Sendable, Equatable {
  /// The Reference Build advances structures at the PAL update rate.
  static let referenceFramesPerSecond = 50.0
  /// Its sine routine uses the low byte within a quadrant and the low two bits
  /// of the high byte to select the four quadrants: one turn is therefore $0400.
  static let angleUnitsPerTurn = 1_024.0

  var descriptor: Int
  var centre: SIMD2<Int>

  func resolve(_ input: SIMD3<Int>, elapsed: Double) -> SIMD3<Float> {
    let step = Double((descriptor & 0xF0) >> 1)
    let referenceFrame = floor(max(0, elapsed) * Self.referenceFramesPerSecond)
    let angle = referenceFrame * step
      / Self.angleUnitsPerTurn * (2 * Double.pi)
    let localX = Double(Self.signedByte(input.x) << 8)
    let localZ = Double(Self.signedByte(input.z) << 8)
    let cosine = cos(angle)
    let sine = sin(angle)
    return SIMD3(
      Float(Double(centre.x) + localX * cosine - localZ * sine),
      Float(input.y << 8),
      Float(Double(centre.y) + localX * sine + localZ * cosine)
    )
  }

  private static func signedByte(_ value: Int) -> Int {
    value & 0x80 == 0 ? value & 0xFF : (value & 0xFF) - 0x100
  }
}

/// Render-ready world derived from a ``Payload.Bundle``.
public struct World: Sendable, Equatable {
  public var cells: [WorldCell]
  public var objects: [ObjectPlacement]
  public var cellSize: Float
  public var cellsPerAxis: Int
  public var groundExtent: Float
  public var deferredEdges: Int
  /// Altitude-indexed square extent used to select road-table cells.
  public var roadAltitudeLookup: [Int]

  /// Cells indexed by `row * cellsPerAxis + column`, mirroring the payload's
  /// packed cell numbering, for O(1) neighbourhood lookup while culling.
  private var byGrid: [Int: Int]
  private var mapLinesByCell: [Int: [SurfaceMapLine]]
  private var highAltitudeMap: [SurfaceMapLine]

  public func cell(column: Int, row: Int) -> WorldCell? {
    // Range-check before packing: a negative column would otherwise alias onto
    // the previous row and duplicate that cell's geometry at the world edges.
    guard (0..<cellsPerAxis).contains(column), (0..<cellsPerAxis).contains(row),
      let index = byGrid[row * cellsPerAxis + column]
    else { return nil }
    return cells[index]
  }

  public init(bundle: Payload.Bundle) {
    let cellSize = Float(bundle.world.grid.cellSize)
    let cellsPerAxis = bundle.world.grid.cellsPerAxis
    self.cellSize = cellSize
    self.cellsPerAxis = cellsPerAxis
    self.groundExtent = cellSize * Float(cellsPerAxis)

    var cells: [WorldCell] = []
    var byGrid: [Int: Int] = [:]
    cells.reserveCapacity(bundle.surface.cells.count)
    for cell in bundle.surface.cells {
      let column = cell.grid.count == 2 ? cell.grid[0] : cell.cell % cellsPerAxis
      let row = cell.grid.count == 2 ? cell.grid[1] : cell.cell / cellsPerAxis
      let vertices: [SurfaceVertex] = cell.vertices.map { vertex in
        if vertex.kind == .worldPoint, let position = vertex.position {
          return .world(World.point(position))
        }
        let raw = vertex.rotationInput ?? []
        return .rotated(raw.count == 3 ? SIMD3(raw[0], raw[1], raw[2]) : .zero)
      }
      let edges = cell.edges.compactMap { edge -> SurfaceEdge? in
        guard edge.count == 3 else { return nil }
        return SurfaceEdge(start: edge[0], end: edge[1], ink: Ink(rawValue: edge[2]) ?? .white)
      }
      let rotation = cell.rotation.flatMap { rotation -> SurfaceRotation? in
        guard rotation.center.count == 2 else { return nil }
        let centre = SIMD2(
          (column << 16) + (rotation.center[0] << 8),
          (row << 16) + (rotation.center[1] << 8)
        )
        return SurfaceRotation(descriptor: rotation.descriptor, centre: centre)
      }
      byGrid[row * cellsPerAxis + column] = cells.count
      cells.append(
        WorldCell(
          index: cell.cell,
          column: column,
          row: row,
          centre: SIMD3(
            (Float(column) + 0.5) * cellSize,
            0,
            (Float(row) + 0.5) * cellSize
          ),
          vertices: vertices,
          edges: edges,
          rotation: rotation
        )
      )
    }
    self.cells = cells
    self.byGrid = byGrid
    self.deferredEdges = 0

    self.roadAltitudeLookup = bundle.world.roadAltitudeLookup
    var mapLinesByCell: [Int: [SurfaceMapLine]] = [:]
    for roadCell in bundle.world.roadCells {
      mapLinesByCell[roadCell.cell] = roadCell.segments.compactMap {
        World.mapLine($0, cellSize: cellSize)
      }
    }
    self.mapLinesByCell = mapLinesByCell
    self.highAltitudeMap = bundle.world.highAltitudeMap.compactMap {
      World.mapLine($0, cellSize: cellSize)
    }

    self.objects = World.placements(bundle: bundle, groundExtent: cellSize * Float(cellsPerAxis))
  }

  /// Select the Reference Build's map lines for one camera position.
  public func mapSegments(from position: SIMD3<Double>) -> [Segment] {
    let column = Int((position.x / Double(cellSize)).rounded(.down))
    let row = Int((position.z / Double(cellSize)).rounded(.down))
    guard (0..<cellsPerAxis).contains(column), (0..<cellsPerAxis).contains(row) else { return [] }

    let y = max(0, Int(position.y.rounded(.down)))
    if y >> 16 >= 0x20 { return highAltitudeMap.map(\.segment) }
    guard !roadAltitudeLookup.isEmpty else { return [] }
    let altitudeIndex = min(roadAltitudeLookup.count - 1, y >> 11)
    let extent = max(0, roadAltitudeLookup[altitudeIndex])
    let currentCell = row * cellsPerAxis + column
    var selected: [SurfaceMapLine] = []
    var seen: Set<MapLineKey> = []

    for selectedRow in max(0, row - extent)...min(cellsPerAxis - 1, row + extent) {
      for selectedColumn in max(0, column - extent)...min(cellsPerAxis - 1, column + extent) {
        let lookupCell = selectedRow * cellsPerAxis + selectedColumn
        for line in mapLinesByCell[lookupCell, default: []] {
          if currentCell != 0 && (line.startPacked == currentCell || line.endPacked == currentCell) { continue }
          if seen.insert(MapLineKey(line)).inserted { selected.append(line) }
        }
      }
    }

    // Above the first 64 KiB, the Reference Build draws the current lookup
    // cell's stored runs separately after suppressing structure endpoints.
    if y >> 16 != 0 {
      for line in mapLinesByCell[currentCell, default: []] where seen.insert(MapLineKey(line)).inserted {
        selected.append(line)
      }
    }
    return selected.map(\.segment)
  }

  private struct MapLineKey: Hashable {
    var low: Int
    var high: Int

    init(_ line: SurfaceMapLine) {
      low = min(line.startPacked, line.endPacked)
      high = max(line.startPacked, line.endPacked)
    }
  }

  private static func mapLine(
    _ raw: Payload.WorldDocument.RoadSegment, cellSize: Float
  ) -> SurfaceMapLine? {
    guard raw.from.count == 2, raw.to.count == 2 else { return nil }
    let startPacked = raw.from[1] << 4 | raw.from[0]
    let endPacked = raw.to[1] << 4 | raw.to[0]
    return SurfaceMapLine(
      segment: Segment(
        a: SIMD3((Float(raw.from[0]) + 0.5) * cellSize, 0, (Float(raw.from[1]) + 0.5) * cellSize),
        b: SIMD3((Float(raw.to[0]) + 0.5) * cellSize, 0, (Float(raw.to[1]) + 0.5) * cellSize),
        ink: .black
      ),
      startPacked: startPacked,
      endPacked: endPacked,
      slot: raw.slot
    )
  }

  private static func point(_ raw: [Int]) -> SIMD3<Float> {
    guard raw.count == 3 else { return .zero }
    return SIMD3(Float(raw[0]), Float(raw[1]), Float(raw[2]))
  }

  /// Place every surface instance's model in world space.
  ///
  /// Model-local orientation is applied first, as the Reference Build does, and
  /// only for the rotatable slots. Model vertices are centred on their own
  /// bounding cube, so an instance position does not by itself say where the base
  /// sits; the model is grounded so its lowest vertex lands on the instance's
  /// height. That grounding is a modernised-feel judgement, not a decoded fact.
  ///
  /// Every instance is placed, including those in rooms and those parked outside
  /// the grid, so the inspector can see all 64. The renderer filters to
  /// ``ObjectPlacement/isDrawable``.
  private static func placements(bundle: Payload.Bundle, groundExtent: Float) -> [ObjectPlacement] {
    var models: [String: Payload.ObjectsDocument.Model] = [:]
    for model in bundle.objects.models { models[model.id] = model }

    var placements: [ObjectPlacement] = []
    for instance in bundle.objects.instances {
      guard let model = models[instance.model], instance.position.count == 3 else { continue }
      let origin = point(instance.position)
      let withinWorld = (0...groundExtent).contains(origin.x) && (0...groundExtent).contains(origin.z)

      let orientation = instance.rotatable ? (Orientation(bytes: instance.orientation) ?? .identity) : .identity
      let local = model.vertices.map { orientation.apply(to: point($0)) }
      guard let lowest = local.map(\.y).min() else { continue }
      let placed = local.map { SIMD3($0.x + origin.x, $0.y - lowest + origin.y, $0.z + origin.z) }

      placements.append(
        ObjectPlacement(
          slot: instance.slot,
          id: instance.id,
          model: instance.model,
          origin: SIMD3(origin.x, origin.y, origin.z),
          vertices: placed,
          edges: model.edges.compactMap { $0.count == 2 ? ($0[0], $0[1]) : nil },
          detailCube: Float(instance.visibility.detailCubePerAxis),
          drawsFarAsPoint: instance.visibility.farRepresentation == "point",
          orientation: orientation,
          placement: instance.placement,
          withinWorld: withinWorld,
          room: instance.room,
          stateFlags: instance.stateFlags
        )
      )
    }
    return placements
  }

}
