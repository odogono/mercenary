import Foundation
import MercenaryCLI
import MercenaryKit

/// What the payload decoded to, as a Golden Trace.
///
/// The first thing the browser port builds is the decode: payload to world, before
/// anything projects or moves (#68). So this is the first replay gate, and the one that
/// needs no simulation at all — every record is a fact about the decoded content, and a
/// diff to it is a decode that changed.
///
/// It carries the Craft Parameter Blocks and the control-loop rules too, which
/// ``FlightTrace`` prints for a human. Those are decoded numbers rather than flight
/// behaviour, so a replay of the *decode* should be able to check them without a mover
/// having been ported first.
enum DecodeTrace {
  static func emit(_ run: TraceRun, scenario: TraceScenario) throws -> TraceFile {
    let world = run.world
    let inspector = Inspector(world: world)
    var trace = TraceFile(emitter: scenario.emitter.rawValue, id: scenario.id)

    // No clock: a decode is not a run, so there is no step to key on and no dt to feed.
    try trace.header(
      run.header(
        for: scenario, dt: nil,
        extra: [
          (
            key: "counts",
            value: .object(run.bundle.manifest.counts.map { (key: $0.key, value: .int($0.value)) })
          ),
          (
            key: "world",
            value: .object([
              "groundExtent": .float(world.groundExtent),
              "cellSize": .float(world.cellSize),
              "deferredEdges": .int(world.deferredEdges),
              "objects": .int(world.objects.count),
              "cells": .int(world.cells.count),
              "rooms": .int(world.rooms.count),
            ])
          ),
        ]))

    if let flight = run.bundle.flight {
      for block in flight.blocks {
        try trace.record(
          .object(["kind": .string("craftParameterBlock"), "block": TraceRecords.value(block)]))
      }
      try trace.record(
        .object(["kind": .string("controlLoopRules"), "rules": TraceRecords.value(flight.rules)]))
      try trace.record(
        .object(["kind": .string("walk"), "walk": TraceRecords.value(flight.walk)]))
    }

    // One record per subject, in the order the inspector reports them, which is already
    // sorted by slot, index and identity. Rooms are keyed by a dictionary, so their rows
    // are the one place the order has to be asked for.
    for row in inspector.objectRows() {
      try trace.record(.object(["kind": .string("object"), "row": TraceRecords.value(row)]))
    }
    for row in inspector.cellRows() {
      try trace.record(.object(["kind": .string("cell"), "row": TraceRecords.value(row)]))
    }
    for row in inspector.structureRows() {
      try trace.record(.object(["kind": .string("structure"), "row": TraceRecords.value(row)]))
    }
    for row in inspector.roomRows() {
      try trace.record(.object(["kind": .string("room"), "row": TraceRecords.value(row)]))
    }

    // Where every object starts, and how it is placed. This is the state every
    // behavioural trace's header begins from, so it is worth pinning once on its own —
    // and `placement` is load-bearing rather than descriptive: it is the field that made
    // every Room object undrawable before #65.
    for object in world.objects {
      try trace.record(
        .object([
          "kind": .string("placement"),
          "slot": .int(object.slot),
          "id": .string(object.id),
          "model": .string(object.model),
          "origin": .vector(object.origin),
          "placement": .string(object.placement),
          "room": .int(object.room),
          "detailCube": .float(object.detailCube),
          "drawsFarAsPoint": .bool(object.drawsFarAsPoint),
          "orientation": .string(String(describing: object.orientation)),
          "withinWorld": .bool(object.withinWorld),
          "stateFlags": .int(object.stateFlags),
          "vertices": .int(object.vertices.count),
          "edges": .int(object.edges.count),
        ]))
    }
    return trace
  }
}
