import Foundation

/// Selection and reporting for the geometry debug mode.
///
/// Owns the parts both surfaces need — which object or cell is selected, how to
/// frame it, and how to describe it — so the headless renderer and the in-app
/// panel cannot drift apart.
public struct Inspector: Sendable {
  public enum Subject: Sendable, Equatable {
    case object(slot: Int)
    case cell(index: Int)
    case structure(id: String)
    case room(id: Int)
  }

  public let world: World

  public init(world: World) {
    self.world = world
  }

  public var objectSlots: [Int] { world.objects.map(\.slot).sorted() }
  public var cellIndices: [Int] { world.cells.map(\.index).sorted() }
  public var structureIdentities: [String] {
    Array(Set(world.cells.compactMap(\.structure))).sorted()
  }

  public func object(slot: Int) -> ObjectPlacement? {
    world.objects.first { $0.slot == slot }
  }

  public func cell(index: Int) -> WorldCell? {
    world.cells.first { $0.index == index }
  }

  public func representativeCell(forStructure id: String) -> WorldCell? {
    world.cells.filter { $0.structure == id }.min { $0.index < $1.index }
  }

  /// The geometry for a subject, in world space.
  public func segments(for subject: Subject) -> [Segment] {
    switch subject {
    case .object(let slot):
      return object(slot: slot)?.segments ?? []
    case .cell(let index):
      return cell(index: index)?.segments(at: 0) ?? []
    case .structure(let id):
      return representativeCell(forStructure: id)?.segments(at: 0) ?? []
    case .room(let id):
      return world.rooms[id]?.segments ?? []
    }
  }

  /// Axis-aligned bounds of a subject's geometry, or nil when it has none.
  public func bounds(for subject: Subject) -> (min: SIMD3<Float>, max: SIMD3<Float>)? {
    bounds(of: segments(for: subject))
  }

  private func bounds(of segments: [Segment]) -> (min: SIMD3<Float>, max: SIMD3<Float>)? {
    let points = segments.flatMap { [$0.a, $0.b] }
    guard let first = points.first else { return nil }
    var low = first
    var high = first
    for point in points {
      low = SIMD3(min(low.x, point.x), min(low.y, point.y), min(low.z, point.z))
      high = SIMD3(max(high.x, point.x), max(high.y, point.y), max(high.z, point.z))
    }
    return (low, high)
  }

  /// A camera that frames a subject in isolation.
  ///
  /// This is the canonical view: it ignores orientation, level of detail and the
  /// rest of the world, because a malformed model has to be visible as a
  /// malformed model. Placed on a three-quarter view so all three axes read.
  public func canonicalCamera(for subject: Subject, margin: Double = 1.6) -> Camera? {
    guard let bounds = bounds(for: subject) else { return nil }
    let centre = SIMD3<Double>(
      Double(bounds.min.x + bounds.max.x) / 2,
      Double(bounds.min.y + bounds.max.y) / 2,
      Double(bounds.min.z + bounds.max.z) / 2
    )
    let extent = max(
      Double(bounds.max.x - bounds.min.x),
      max(Double(bounds.max.y - bounds.min.y), Double(bounds.max.z - bounds.min.z))
    )
    // A degenerate subject still needs a workable distance.
    let distance = max(extent, 1) * margin
    let heading = Double.pi / 4
    let pitch = -0.35
    let position = SIMD3<Double>(
      centre.x - sin(heading) * distance * cos(pitch),
      centre.y - sin(pitch) * distance,
      centre.z - cos(heading) * distance * cos(pitch)
    )
    let neutralVerticalFieldOfView = 2 * atan(
      ReferenceViewport.height / 2 / ReferenceViewport.focalPixels)
    return Camera(
      position: position, heading: heading, pitch: pitch,
      verticalFieldOfView: neutralVerticalFieldOfView,
      nearPlane: max(1, distance / 1000))
  }

  /// One row of the report table.
  public struct Row: Sendable, Equatable {
    public var subject: String
    public var detail: String
    public var vertices: Int
    public var edges: Int
    public var spans: SIMD3<Float>
    public var note: String
  }

  /// One row per underground room, ordered by the room's own identifier.
  ///
  /// A room's coordinates are its own, so its spans say how big the room is rather
  /// than where it sits — there is nowhere in the surface world for it to sit.
  public func roomRows() -> [Row] {
    world.rooms.keys.sorted().compactMap { id in
      guard let room = world.rooms[id] else { return nil }
      let spans = bounds(for: .room(id: id)).map { $0.max - $0.min } ?? .zero
      return Row(
        subject: String(format: "room %02X", id),
        detail: room.doorways.isEmpty ? "sealed" : "\(room.doorways.count) linked",
        vertices: room.segments.count * 2,
        edges: room.segments.count,
        spans: spans,
        note: room.segments.isEmpty ? "empty" : ""
      )
    }
  }

  public func objectRows() -> [Row] {
    world.objects.sorted { $0.slot < $1.slot }.map { object in
      let bounds = self.bounds(for: .object(slot: object.slot))
      let spans = bounds.map { $0.max - $0.min } ?? .zero
      var notes: [String] = []
      if !object.orientation.isIdentity {
        notes.append("rot z\(object.orientation.z) x\(object.orientation.x) y\(object.orientation.y)")
      }
      if object.placement != "surface" { notes.append("room \(object.room)") }
      if !object.withinWorld { notes.append("parked outside world") }
      notes.append(String(format: "flags $%02X", object.stateFlags))
      return Row(
        subject: String(format: "slot %02X", object.slot),
        detail: object.model,
        vertices: object.vertices.count,
        edges: object.edges.count,
        spans: spans,
        note: notes.joined(separator: "; ")
      )
    }
  }

  public func cellRows() -> [Row] {
    world.cells.sorted { $0.index < $1.index }.map { cell in
      let segments = cell.segments(at: 0)
      let bounds = self.bounds(for: .cell(index: cell.index))
      let spans = bounds.map { $0.max - $0.min } ?? .zero
      return Row(
        subject: String(format: "cell %3d", cell.index),
        detail: "grid \(cell.column):\(cell.row)",
        vertices: Set(segments.flatMap { [$0.a, $0.b] }.map(\.debugDescription)).count,
        edges: segments.count,
        spans: spans,
        note: ""
      )
    }
  }

  public func structureRows() -> [Row] {
    structureIdentities.compactMap { id in
      guard let cell = representativeCell(forStructure: id) else { return nil }
      let bounds = self.bounds(for: .structure(id: id))
      let spans = bounds.map { $0.max - $0.min } ?? .zero
      let usageCount = world.cells.count { $0.structure == id }
      let shared = cell.unresolvedEdgeCount
      var notes = ["\(usageCount) \(usageCount == 1 ? "cell" : "cells")"]
      if shared > 0 {
        notes.append("\(shared) road-workspace \(shared == 1 ? "edge" : "edges")")
      }
      return Row(
        subject: id.replacingOccurrences(of: "surface-structure:", with: ""),
        detail: String(format: "cell %02X", cell.index),
        vertices: cell.vertexCount,
        edges: cell.edgeCount,
        spans: spans,
        note: notes.joined(separator: "; ")
      )
    }
  }

  /// Render the table as fixed-width text.
  public static func table(_ rows: [Row], title: String) -> String {
    var lines = ["\(title)  (\(rows.count) rows)"]
    lines.append("subject   detail                 verts  edges     span x     span y     span z  note")
    for row in rows {
      lines.append(
        String(
          format: "%-9@ %-22@ %5d  %5d %10.0f %10.0f %10.0f  %@",
          row.subject as NSString,
          row.detail as NSString,
          row.vertices,
          row.edges,
          Double(row.spans.x),
          Double(row.spans.y),
          Double(row.spans.z),
          row.note as NSString
        )
      )
    }
    return lines.joined(separator: "\n")
  }
}
