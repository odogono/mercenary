# Place authored content on the surface and react to it through Surface Regions

Accepted, 2026-10-30. Targ gains its first Authored Asset placed in the world: the Shrine, a fixed object at Surface Cell (20,20), outside the 16×16 city, with a Talk Script that reacts when the player arrives and when an object is left inside it. It exercises [ADR 0081](0081-share-one-geometry-asset-format-and-edit-it-in-blender.md)'s Blender path and [ADR 0080](0080-run-targs-scripts-as-talk-scripts.md)'s Talk Scripts end to end, and it ships in normal play: it is out of the way and changes no existing outcome.

## Decision

- **Authored placements are tracked beside the payload.** The Data Payload stays pure extractor output. The Authored Asset's own Sidecar placements (`assets/targ/objects/authored-shrine.json`) place it as an object instance in slot 64, after the original 64, as the original places its own out-of-city building (slot 61, at cell (81,35)) as a fixed object rather than a Surface Structure. Object placement already covers any surface position, distant drawing and Saves; the 16×16 Surface Structure cell table does not reach (20,20). A Save made before an Authored object was placed has no word of it, and restores with the object where its placement put it.
- **Surface Regions are play data.** A Surface Region is a named area of the surface the Gameplay Session tracks. Regions are a table in the Gameplay Session (`web/src/session/surfaceRegions.ts`), not drawn into the Geometry Asset: shape is presentation, regions decide play.
- **One new World Event, one new query.** Arriving in a region, on foot or aboard a craft, at any altitude, is told as `arrived region`; it is a message of its own because NorthTalk tells handlers apart by message name, and `entered` is the Room's. A drop stays `dropped object`; the World Port gains `within(region)` for the Talk Script to check where it lies.
- **The city ends at its grid.** The view had repeated the 16×16 city across the whole surface, so (20,20) drew a copy of cell (4,4). Nothing in the evidence supports that, and Targ outside cells 0–15 is open ground; the repeat is removed, so the Shrine stands alone.
- **Comparisons see no authored content.** Golden Traces and comparisons with the original load the Data Payload without `assets/targ/`, so the Shrine's slot is absent on both sides; the Surface Regions see nothing to compare outside the city.

Rejected: a new cell in the payload's surface table (breaks the payload's purity and the 16×16 grid); regions as marker parts in Blender (couples play to a model edit); the region on `dropped object` itself (grows the event shape when a query serves).

## Consequences

- An authored object slot must not collide with an original one, which the asset loader refuses, and Saves already store slots as bytes.
- The energy crystal, once offered at the Shrine, is fixed and can no longer be sold. That is the player's choice.
