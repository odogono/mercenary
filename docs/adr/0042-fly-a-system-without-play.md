# Fly a System without play

The Browser Shell gains a **Flyover**, an internal development surface in which a free Camera can inspect a System without creating a Gameplay Session. It lives at the canonical `/<title>/debug` paths, composes evidence-bound System facts with explicitly authored presentation data, and keeps routing, time, movement, rendering and UI state wholly outside Game Semantics; this admits a narrow read-only Damocles System view before _The Second City_ without admitting Damocles play.

The System is independent of Title and Destination: Targ refers to the `targ` System, while Damocles and any future Dion treatment may both refer to `gamma`. Targ presents its Orrery as an authored, Targ-relative four-Body model and maps one canonical city patch onto an authored city Island; the second Island is empty presentation geography until _The Second City_. Gamma presents the 29 stable Body centres recovered by #181 as fixed inspection spheres using the individually authored Damocles Body palette, with authored display radii and no inferred types, Primaries, physical scale or orbits; the capture-time DAMOCLES position remains absent.

The Flyover uses one System-space Cartesian Pose through Orbital, Coastal and Surface Ranges, deriving Body-relative coordinates without rebasing the Camera when its nearest Body changes. It reuses a surface-rendering seam that accepts immutable geometry and a Camera rather than fabricating a Session Snapshot, and it may show only initial Data Payload placements without mutable play. Its own backdrop, geography, dimensions, colours, speed bounds and range support are versioned authored documents outside the Data Payload and are accepted by deterministic screenshots, not by the Fidelity Contract or Golden Traces.

## Considered Options

- Disable Gameplay Session subsystems to turn play into a viewer.
- Put free flight inside the Departure.
- Copy authored geography and display dimensions into the evidence-bound Data Payload.
- Infer a complete animated Gamma System from incomplete Working-Authority Evidence.
- Flatten Targ's independently wrapping surface axes onto a whole sphere.
- Give the Flyover its own Camera, clock and presentation documents while sharing pure rendering seams.

The last option is taken. The rejected designs either create false Session State, weaken the Data Payload's provenance boundary, contradict ADR 0040's authored Departure, or turn incomplete evidence and incompatible topology into silent claims.

## Consequences

- ADR 0021's early sequencing gains a second narrow read-only exception alongside the Damocles Catalogue: Flyover may load `payload/damocles/system.json`, but no Damocles Gameplay Session, Destination, Save, Game Semantics or Game Surface is admitted.
- `/targ/debug` and `/damocles/debug` are canonical; `/debug` redirects to `/targ/debug`. This is only the debug-route slice of ADR 0041: `/targ` and `/damocles` remain deferred, and unknown document paths return to `/` without converting missing assets or payloads into HTML.
- Flyover documents are keyed by System (`targ`, `gamma`), strictly validated, and kept outside `payload/`. They distinguish recovered, mechanically derived and authored values.
- Targ alone currently supports Coastal and Surface Ranges. The sun, moons and all current Gamma Bodies remain Orbital-only.
- The Flyover claims no session ownership, reads or writes no Save or Session Resume, persists no Pose or clock, and changes no Golden Trace.
- The Damocles Catalogue remains canonical at `/catalogue`; `/catalogue.html` redirects there. Its eventual move remains deferred.
- This ADR amends ADRs 0021, 0039, 0040 and 0041 only to the extents stated above; their playable-product decisions otherwise stand.
