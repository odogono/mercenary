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

/// A road piece belonging to one grid cell.
public struct RoadPiece: Sendable, Equatable {
  public var segment: Segment
  public var column: Int
  public var row: Int
}

/// One grid cell's drawable content, kept together so the renderer can cull by
/// cell before touching individual segments.
public struct WorldCell: Sendable, Equatable {
  public var index: Int
  public var column: Int
  public var row: Int
  /// Centre of the cell on the ground plane, for distance culling.
  public var centre: SIMD3<Float>
  public var segments: [Segment]
}

/// Render-ready world derived from a ``Payload.Bundle``.
public struct World: Sendable, Equatable {
  public var cells: [WorldCell]
  public var roads: [RoadPiece]
  public var objects: [ObjectPlacement]
  public var cellSize: Float
  public var cellsPerAxis: Int
  public var groundExtent: Float
  public var deferredEdges: Int
  /// Altitude-indexed road extent, straight from the Reference Build's table.
  public var roadAltitudeLookup: [Int]

  /// Cells indexed by `row * cellsPerAxis + column`, mirroring the payload's
  /// packed cell numbering, for O(1) neighbourhood lookup while culling.
  private var byGrid: [Int: Int]

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
    var deferred = 0
    cells.reserveCapacity(bundle.surface.cells.count)
    for cell in bundle.surface.cells {
      deferred += cell.deferredEdges
      let points = cell.vertices.map { World.point($0) }
      var segments: [Segment] = []
      segments.reserveCapacity(cell.edges.count)
      for edge in cell.edges where edge.count == 3 {
        let (start, end, ink) = (edge[0], edge[1], edge[2])
        guard points.indices.contains(start), points.indices.contains(end) else { continue }
        segments.append(Segment(a: points[start], b: points[end], ink: Ink(rawValue: ink) ?? .white))
      }
      let column = cell.grid.count == 2 ? cell.grid[0] : cell.cell % cellsPerAxis
      let row = cell.grid.count == 2 ? cell.grid[1] : cell.cell / cellsPerAxis
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
          segments: segments
        )
      )
    }
    self.cells = cells
    self.byGrid = byGrid
    self.deferredEdges = deferred

    // Roads join cell centres on the ground plane. Lifting them a hair above
    // zero keeps them from z-fighting the ground horizon line.
    self.roadAltitudeLookup = bundle.world.roadAltitudeLookup
    self.roads = bundle.world.roads.compactMap { road in
      guard road.from.count == 2, road.to.count == 2, road.cell.count == 2 else { return nil }
      let height: Float = 8
      return RoadPiece(
        segment: Segment(
          a: SIMD3((Float(road.from[0]) + 0.5) * cellSize, height, (Float(road.from[1]) + 0.5) * cellSize),
          b: SIMD3((Float(road.to[0]) + 0.5) * cellSize, height, (Float(road.to[1]) + 0.5) * cellSize),
          ink: .white
        ),
        column: road.cell[0],
        row: road.cell[1]
      )
    }

    self.objects = World.placements(bundle: bundle, groundExtent: cellSize * Float(cellsPerAxis))
  }

  private static func point(_ raw: [Int]) -> SIMD3<Float> {
    guard raw.count == 3 else { return .zero }
    return SIMD3(Float(raw[0]), Float(raw[1]), Float(raw[2]))
  }

  /// Experimental scale applied to model Y only, for testing whether the vertical
  /// component of a model vertex uses a different shift from X and Z. Set
  /// `MERCENARY_MODEL_Y_SCALE` to try a factor; 1 is the decoded value.
  static let modelVerticalScale: Float = {
    guard let raw = ProcessInfo.processInfo.environment["MERCENARY_MODEL_Y_SCALE"],
      let value = Float(raw), value > 0
    else { return 1 }
    return value
  }()

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
      let local = model.vertices.map { raw -> SIMD3<Float> in
        var vertex = point(raw)
        vertex.y *= World.modelVerticalScale
        return orientation.apply(to: vertex)
      }
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

  /// How far road geometry reaches, as a cell radius around the camera.
  ///
  /// The Reference Build selects road extent through an altitude-indexed table.
  /// The index is read here as the altitude's high byte, which is the natural
  /// reading for a 24-bit position on this machine and gives radius zero — the
  /// camera's own cell — at ground level, widening as the player climbs. The
  /// table is the Reference Build's; this indexing is an interpretation.
  public func roadRadius(altitude: Double) -> Int {
    guard !roadAltitudeLookup.isEmpty else { return cellsPerAxis }
    let index = max(0, Int(altitude)) >> 16
    return roadAltitudeLookup[min(index, roadAltitudeLookup.count - 1)]
  }
}
