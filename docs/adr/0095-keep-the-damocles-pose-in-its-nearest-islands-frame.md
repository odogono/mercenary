# Keep the Damocles Pose in its nearest island's frame

Accepted, 2026-11-27, for [#999](https://github.com/odogono/mercenary/issues/999).

A Damocles Body's surface wraps on both axes. The Damocles Gameplay Session kept the Pose's X and Z unwrapped and wrapped only where it measured (`craft/pass.ts`), but most measurements against the Catalogue's placements are raw differences. Flying from Moorby to Key West across the wrap landed at NEWTON LTD RESEARCH's door about 2²⁸ units from its placement, so nothing was bound or drawn.

## Decision

- **The Pose is held as the image nearest the nearest island's origin.** Wherever X and Z enter the Pose (a walk's result, `poseFromCraft`, a restore, an arrival, a teleport), they are re-expressed as that island's origin plus a signed 28-bit offset. This is the frame `$058F64` builds: it masks `$7AB2`/`$7ABA` to 28 bits, subtracts the nearest island's origin and sign-extends from 28 bits (docs/research/damocles-eris-islands.md).
- **The craft's X and Z share the frame.** They are re-expressed with the Pose, so boarding, leaving and the next craft pass agree.
- **With no island, the plain mask.** On a Body without island records the position is masked into 0..2²⁸, as `$7AB2` holds it. Space is untouched.
- **What the Pose is measured against shares the frame.** Building a surface lays each placement and the workspace origin in the frame of the island nearest them, and a surface residence on the Body in hand is read in it. Island layouts are already contiguous around their origin, so this moves only records the Catalogue keeps as plain Body Coordinates, such as the Midas Project's at (430, 3706), 2768 cells from Midas's one island on z.
- **Saves are normalised on restore.** The format is unchanged, and an old Save across the wrap, its residences included, loads already in frame.
- **A Catalogue test holds the frame on every Body:** each placement lies within half a surface (2²⁷ units an axis) of its nearest island's origin, or on the surface where a Body has none.

## Considered Options

- **Mask the Pose to 0..2²⁸ and make every placement difference nearest-image.** Faithful to `$7AB2`, but it rewrites about ten raw-difference readers and the Enhanced planner, because placements are deliberately not wrapped (five records cross the wrap; Snow Island reaches x −8).
- **Keep the Pose raw and make every reader wrap-aware.** The same call sites as above plus the cell readers, and every future reader must remember to wrap.

## Consequences

- The raw Pose jumps by 2²⁸ when the nearest island changes over open sea. Nothing on screen moves: island fills already draw their nearest image, and structures are drawn only from their own Surface Cell.
- Raw differences between the Pose and placements, `cellOf` and Enhanced drawing stay correct without change.
- A workspace origin can read as a whole number of surfaces past 0..4095, as Lachesis's (0, 0) reads (4096, 0).
