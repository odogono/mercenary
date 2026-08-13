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
  public var roads: [Segment]
  public var objects: [Segment]
  public var cellSize: Float
  public var cellsPerAxis: Int
  public var groundExtent: Float
  public var deferredEdges: Int

  /// Cells indexed by `row * cellsPerAxis + column`, mirroring the payload's
  /// packed cell numbering, for O(1) neighbourhood lookup while culling.
  private var byGrid: [Int: Int]

  public func cell(column: Int, row: Int) -> WorldCell? {
    guard let index = byGrid[row * cellsPerAxis + column] else { return nil }
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
    self.roads = bundle.world.roads.compactMap { road in
      guard road.from.count == 2, road.to.count == 2 else { return nil }
      let height: Float = 8
      return Segment(
        a: SIMD3((Float(road.from[0]) + 0.5) * cellSize, height, (Float(road.from[1]) + 0.5) * cellSize),
        b: SIMD3((Float(road.to[0]) + 0.5) * cellSize, height, (Float(road.to[1]) + 0.5) * cellSize),
        ink: .white
      )
    }

    self.objects = World.objectSegments(bundle: bundle)
  }

  private static func point(_ raw: [Int]) -> SIMD3<Float> {
    guard raw.count == 3 else { return .zero }
    return SIMD3(Float(raw[0]), Float(raw[1]), Float(raw[2]))
  }

  /// Place every surface instance's model in world space.
  ///
  /// Model vertices are centred on their own bounding cube, so an instance
  /// position does not by itself say where the model's base sits. We ground the
  /// model — its lowest vertex lands on the instance's height — which is the
  /// placement that reads correctly for objects standing on the surface. This is
  /// a modernised-feel judgement, not a decoded fact.
  private static func objectSegments(bundle: Payload.Bundle) -> [Segment] {
    var models: [String: Payload.ObjectsDocument.Model] = [:]
    for model in bundle.objects.models { models[model.id] = model }

    var segments: [Segment] = []
    for instance in bundle.objects.instances where instance.placement == "surface" {
      guard let model = models[instance.model], instance.position.count == 3 else { continue }
      let origin = point(instance.position)
      let points = model.vertices.map { point($0) }
      guard let lowest = points.map(\.y).min() else { continue }
      let placed = points.map { SIMD3($0.x + origin.x, $0.y - lowest + origin.y, $0.z + origin.z) }
      for edge in model.edges where edge.count == 2 {
        guard placed.indices.contains(edge[0]), placed.indices.contains(edge[1]) else { continue }
        segments.append(Segment(a: placed[edge[0]], b: placed[edge[1]], ink: .white))
      }
    }
    return segments
  }
}
