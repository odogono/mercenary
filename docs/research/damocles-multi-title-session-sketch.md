# Multi-title Gameplay Session sketch (non-loaded)

**Status:** Research sketch only. Not a Data Payload schema, not loaded by the app, not a change to `MercenaryKit`. Allowed under ADR 0021; live Damocles content and Filled Presentation on the shipping Game Surface wait until after *The Second City*.

**Verdict this sketch supports:** one multi-title Independent Implementation — not a second Independent Implementation (#82 / ADR 0021).

## Seams a future multi-title Gameplay Session must name

These are seam *categories* inferred from Working-Authority Evidence. Confirmed inventory notes are cited; Fog is left unnamed here on purpose.

| Seam | Targ today | Damocles (Confirmed signals) | Inventory |
|---|---|---|---|
| Presentation | Wireframe line-list Game Surface (ADR 0019) | Filled Presentation: soft colours, dual playfields, scene-mode palette | `damocles-filled-polygons.md` (#79) |
| World model | Location = surface or Room; `world.json` / `rooms.json` | Gamma System: celestial name roster, place labels, object catalogues | `damocles-gamma-system.md` (#80) |
| Script ISA | Benson Script + Host Callout (ADR 0015) | Damocles Script: successor 16-bit bytecode VM; dispatch loop, 37-slot table, and handler census decoded — plus a native `jsr` escape (see below) | `damocles-script-isa.md` (#85, #128), `damocles-script-motion-time.md` (#81) |
| Occupancy / craft | Occupancy on foot or aboard; Craft Parameter Blocks | Walk/board soft state; keyboard speed gears; board/leave keys | `damocles-walk-board-flight.md` (#86) |
| Time / deadline | (Targ session time as today) | Impact-deadline panel clock advances while idle (encoding still Fog) | `damocles-script-motion-time.md` (#81) |

Method that transfers without transferring live types: Host Callout pattern, Gameplay Session as sole Session State authority, own extractors into a gitignored Data Payload, Trace Oracle discipline, ADR 0002 (no mechanical translation of Working Authority or MDDClone).

### The script seam has a native escape (#128)

The Working Disassembly of the Damocles Script interpreter (`damocles-script-isa.md`) found that opcodes `$08` and `$09` do `jsr (a0)` — **straight into the script stream**. Some script bytes are 68000 code, not bytecode.

This is a constraint on the script seam rather than a decode gap, and it has no Targ analogue: a Benson Script is bytecode all the way down, so "re-encode at export and run our own interpreter" (ADR 0015) covers it completely. For Damocles that method covers only the part of a script that is bytecode. Consequences a future multi-title design has to answer, not this sketch:

- A Damocles script extract must **detect** `$08`/`$09` sites rather than assume a uniform stream, or it will mis-parse whatever follows them.
- Those sites cannot be interpreted by an Independent Implementation at all. The affected script logic has to be **re-authored behind the Host Callout**, which makes the seam partly a rewrite boundary rather than purely a translation boundary — and ADR 0002 forbids the alternative.
- Scale is unknown: no census exists yet of how many scripts reach an `$08`/`$09`, or what those routines do. Until that is known, any effort estimate for "port the Damocles script VM" is a floor, not a range.

Separately, the interpreter **suspends itself** on a message gate (`$7BA0`) instead of blocking, so the Damocles message effect is resumable where Targ's is synchronous. A shared Host Callout cannot assume Targ's shape.

## What this sketch must not become yet

- A loaded schema or Content Set for Damocles.
- A `CONTEXT-MAP.md` split.
- Generalisation of live Gameplay Session / payload types on the Targ critical path.
- Glossary entries for Unresolved Fog (VOID / spaceflight dynamics, the native routines Damocles Script handlers call and the `$08`/`$09` census, which record tables hold objects/craft/places, interior doorway graph, solar shade animation, impact-clock RAM cells).

## Sequencing

1. Initial Release (*Escape from Targ*).
2. *The Second City* (Content Overlay seam unchanged by #82).
3. Then Damocles inside the multi-title Independent Implementation; whole-series titles beyond Damocles remain aspiration only.
