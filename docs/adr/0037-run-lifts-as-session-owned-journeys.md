# Run lifts as session-owned journeys

The Reference Build keeps a lift active across hundreds of PAL frames. Its raster interrupt advances camera position, split and sound pitch, while the main loop changes the visible scene and eventually stops the ride. During descent `CURRENT_ROOM` already names the destination even while the surface remains visible. Treating the lift as an immediate Location change loses this ordering, makes Drop choose the wrong Object Residence, and cannot resume the audiovisual state.

The Gameplay Session therefore owns a **Lift Journey** with its direction, entrance Room, recovered 50 Hz phase, position, visible scene, timing remainder, and retained Metal Detector colour. The Host Callout projects the destination Room separately from the visible Location during descent. Save and Session Resume persist this state exactly under a new strict schema version. Production always uses the journey.

The frozen Trace Oracle predates this recovered behavior and expects an immediate transition. Replay construction alone may select an explicit instantaneous compatibility mode. That mode is independent of Benson's legacy message mode and is unavailable to production callers. Reference observations govern new lift behavior; the oracle boundary exists only to keep the frozen comparison suite readable while the browser becomes more faithful.
