# Multi-title Gameplay Session sketch (non-loaded)

**Status:** Research sketch only. Not a Data Payload schema, not loaded by the app, not a change to `MercenaryKit`. Allowed under ADR 0021; live Damocles content and Filled Presentation on the shipping Game Surface wait until after *The Second City*.

**Verdict this sketch supports:** one multi-title Independent Implementation — not a second Independent Implementation (#82 / ADR 0021).

## Seams a future multi-title Gameplay Session must name

These are seam *categories* inferred from Working-Authority Evidence. Confirmed inventory notes are cited; Fog is left unnamed here on purpose.

| Seam | Targ today | Damocles (Confirmed signals) | Inventory |
|---|---|---|---|
| Presentation | Wireframe line-list Game Surface (ADR 0019) | Filled Presentation: soft colours, dual playfields, scene-mode palette | `damocles-filled-polygons.md` (#79) |
| World model | Location = surface or Room; `world.json` / `rooms.json` | Gamma System: celestial name roster, place labels, object catalogues | `damocles-gamma-system.md` (#80) |
| Script ISA | Benson Script + Host Callout (ADR 0015) | Damocles Script: successor 16-bit bytecode VM; live PC observed | `damocles-script-isa.md` (#85), `damocles-script-motion-time.md` (#81) |
| Occupancy / craft | Occupancy on foot or aboard; Craft Parameter Blocks | Walk/board soft state; keyboard speed gears; board/leave keys | `damocles-walk-board-flight.md` (#86) |
| Time / deadline | (Targ session time as today) | Impact-deadline panel clock advances while idle (encoding still Fog) | `damocles-script-motion-time.md` (#81) |

Method that transfers without transferring live types: Host Callout pattern, Gameplay Session as sole Session State authority, own extractors into a gitignored Data Payload, Trace Oracle discipline, ADR 0002 (no mechanical translation of Working Authority or MDDClone).

## What this sketch must not become yet

- A loaded schema or Content Set for Damocles.
- A `CONTEXT-MAP.md` split.
- Generalisation of live Gameplay Session / payload types on the Targ critical path.
- Glossary entries for Unresolved Fog (VOID / spaceflight dynamics, full Damocles Script opcode map, interior doorway graph, solar shade animation, impact-clock RAM cells).

## Sequencing

1. Initial Release (*Escape from Targ*).
2. *The Second City* (Content Overlay seam unchanged by #82).
3. Then Damocles inside the multi-title Independent Implementation; whole-series titles beyond Damocles remain aspiration only.
