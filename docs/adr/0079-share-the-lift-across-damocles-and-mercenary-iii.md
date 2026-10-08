# Share the Lift across Damocles and Mercenary III

Accepted, 2026-10-08, for [#835](https://github.com/odogono/mercenary/issues/835). Mercenary III's lift key test (`$5684C`), request (`$56D66`), step (`$56CF4`), arrival (`$56D98`) and rebind (`$56E2C`) are the Damocles Lift's code at other addresses, and they read the same Floor Table layout ([the report](../research/mercenary-iii-lift.md)). The rules therefore live once, in `web/src/structure/lift.ts`, beside the shared region clamp.

## Decision

- `structure/lift.ts` holds what the two programs share: the lift region bit, the 25-tick period, the request's refusals and its replacement of a pending destination, the step that waits for the pinned door, the B, G, 1 … 9 walk, the arrival pitch and the Floor Label's characters. Damocles's session now runs on it, with no change to its outcomes.
- Each Title binds its own Floor on arrival from its own records: Damocles through its Catalogue's level bindings, Mercenary III through the Floor Tables the TOURCRAFT export publishes. Each pins its own doorway door and plays its own sounds. Damocles plays the take effect. Mercenary III plays the cut and the key click, which play the same tone.

## Consequences

- The TOURCRAFT export selects every Floor a promoted structure binds, with its structure and palette, from the Catalogue's immutable records. The content identity changes.
- The TOURCRAFT Save carries `tourcraft.lift`, the Floor, the ride and the doorway, at schema 8. Saves from schema 7 receive New Game guidance ([ADR 0073](0073-drop-pre-release-prototype-save-migration.md)).
- The Dion frame binds the Floor's structure at the Floor's height, and Floor Label tokens `$80` and `$81` show the live label.
