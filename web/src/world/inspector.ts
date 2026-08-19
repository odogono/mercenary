import { toFloat32 } from "../math/index.ts"
import type { Vector3 } from "../orientation/index.ts"
import { isIdentity } from "../orientation/index.ts"
import type { ObjectPlacement, Room, Segment, World, WorldCell } from "./index.ts"
import { objectSegments } from "./index.ts"

/// The geometry report the `decode` Golden Trace records.
///
/// This is a diagnostic projection rather than engine behaviour, and it is ported because the
/// decode gate replays it: the trace carries one row per object, cell, structure and Room, so
/// reproducing the decode means reproducing the summary of it too. The rows are also the most
/// direct statement of what came out of the payload, which is why they were traced.
///
/// Only the row projections are here. The inspector's camera framing belongs with `projection`
/// (#91), and its table formatting is the Swift app's own presentation.

export interface Row {
  readonly subject: string
  readonly detail: string
  readonly vertices: number
  readonly edges: number
  readonly spans: Vector3
  readonly note: string
}

const ZERO: Vector3 = { x: 0, y: 0, z: 0 }

const spansOf = (segments: readonly Segment[]): Vector3 => {
  let low: Vector3 | undefined
  let high: Vector3 | undefined
  for (const segment of segments) {
    for (const p of [segment.a, segment.b]) {
      if (low === undefined || high === undefined) {
        low = p
        high = p
        continue
      }
      low = { x: Math.min(low.x, p.x), y: Math.min(low.y, p.y), z: Math.min(low.z, p.z) }
      high = { x: Math.max(high.x, p.x), y: Math.max(high.y, p.y), z: Math.max(high.z, p.z) }
    }
  }
  if (low === undefined || high === undefined) return ZERO
  // A subtraction of two binary32 values, narrowed where the kit narrows: `SIMD3<Float>`
  // subtraction produces a `Float`.
  return {
    x: toFloat32(high.x - low.x),
    y: toFloat32(high.y - low.y),
    z: toFloat32(high.z - low.z),
  }
}

/// Two hex digits, upper case, as `String(format: "%02X")` writes them.
const hex2 = (value: number): string => value.toString(16).toUpperCase().padStart(2, "0")

/// Right-aligned in three columns, as `String(format: "%3d")` writes it.
const dec3 = (value: number): string => String(value).padStart(3, " ")

/// A point's identity, for counting distinct ones.
///
/// The kit counts distinct vertices by each point's *description*, which spells a negative zero
/// differently from a positive one — two spellings, two vertices — so this key has to as well.
/// `String(-0)` in JavaScript is `"0"`, which would silently merge them.
const pointKey = (p: Vector3): string => {
  const part = (v: number): string => (Object.is(v, -0) ? "-0" : String(v))
  return `${part(p.x)},${part(p.y)},${part(p.z)}`
}

export class Inspector {
  readonly world: World

  constructor(world: World) {
    this.world = world
  }

  get structureIdentities(): string[] {
    const ids = new Set<string>()
    for (const cell of this.world.cells) {
      if (cell.structure !== undefined) ids.add(cell.structure)
    }
    return [...ids].sort()
  }

  representativeCell(structure: string): WorldCell | undefined {
    // Reduced rather than sorted, because the kit takes a minimum by index with a strict `<`, so
    // the first cell wins a tie.
    let best: WorldCell | undefined
    for (const cell of this.world.cells) {
      if (cell.structure !== structure) continue
      if (best === undefined || cell.index < best.index) best = cell
    }
    return best
  }

  objectRows(): Row[] {
    return [...this.world.objects]
      .sort((a, b) => a.slot - b.slot)
      .map((object: ObjectPlacement) => {
        const notes: string[] = []
        if (!isIdentity(object.orientation)) {
          notes.push(
            `rot z${object.orientation.z} x${object.orientation.x} y${object.orientation.y}`,
          )
        }
        if (object.placement !== "surface") notes.push(`room ${object.room}`)
        if (!object.withinWorld) notes.push("parked outside world")
        notes.push(`flags $${hex2(object.stateFlags)}`)
        return {
          subject: `slot ${hex2(object.slot)}`,
          detail: object.model,
          vertices: object.vertices.length,
          edges: object.edges.length,
          spans: spansOf(objectSegments(object)),
          note: notes.join("; "),
        }
      })
  }

  cellRows(): Row[] {
    return [...this.world.cells]
      .sort((a, b) => a.index - b.index)
      .map((cell) => {
        const segments = cell.segments(0)
        const distinct = new Set<string>()
        for (const segment of segments) {
          distinct.add(pointKey(segment.a))
          distinct.add(pointKey(segment.b))
        }
        return {
          subject: `cell ${dec3(cell.index)}`,
          detail: `grid ${cell.column}:${cell.row}`,
          // Distinct points rather than the stored vertex count: a cell's edges may reach into
          // the shared road workspace, whose points are not in its own list.
          vertices: distinct.size,
          edges: segments.length,
          spans: spansOf(segments),
          note: "",
        }
      })
  }

  structureRows(): Row[] {
    const rows: Row[] = []
    for (const id of this.structureIdentities) {
      const cell = this.representativeCell(id)
      if (cell === undefined) continue
      const usageCount = this.world.cells.filter((c) => c.structure === id).length
      const shared = cell.unresolvedEdgeCount
      const notes = [`${usageCount} ${usageCount === 1 ? "cell" : "cells"}`]
      if (shared > 0) {
        notes.push(`${shared} road-workspace ${shared === 1 ? "edge" : "edges"}`)
      }
      rows.push({
        subject: id.replace("surface-structure:", ""),
        detail: `cell ${hex2(cell.index)}`,
        vertices: cell.vertexCount,
        edges: cell.edgeCount,
        spans: spansOf(cell.segments(0)),
        note: notes.join("; "),
      })
    }
    return rows
  }

  /// One row per underground Room, ordered by the Room's own identifier.
  ///
  /// A Room's coordinates are its own, so its spans say how big it is rather than where it sits.
  /// There is nowhere in the surface world for it to sit.
  roomRows(): Row[] {
    const ids = [...this.world.rooms.keys()].sort((a, b) => a - b)
    const rows: Row[] = []
    for (const id of ids) {
      const room: Room | undefined = this.world.rooms.get(id)
      if (room === undefined) continue
      rows.push({
        subject: `room ${hex2(id)}`,
        detail: room.doorways.length === 0 ? "sealed" : `${room.doorways.length} linked`,
        vertices: room.segments.length * 2,
        edges: room.segments.length,
        spans: spansOf(room.segments),
        note: room.segments.length === 0 ? "empty" : "",
      })
    }
    return rows
  }
}
