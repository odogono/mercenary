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

### The script seam has a native escape, so far unexercised (#128)

The Working Disassembly of the Damocles Script interpreter (`damocles-script-isa.md`) found that dispatch slots `$08` and `$09` do `jsr (a0)` — **straight into the script stream**. The mechanism to run inline 68000 code as part of a script therefore exists.

A full decode of the bank then measured how much it is used: **not at all**, in the region that matters. Across 497 ops reached from all 64 script entry slots — 98.2% of the code region `$070100`–`$072D2E` — neither slot appears. So the escape is a latent capability here, not a live constraint. It could still be exercised by scripts on a mission disk, which has not been examined. Other banks are ruled out for the loaded image: #136 found the 32-bit immediate `$00070080` exactly once in the whole 1 MiB image, inside `$054764`, so there is one script entry table and one instruction that reads it.

What that leaves for a future multi-title design:

- A Damocles script extract should **detect** `$08`/`$09` rather than assume a uniform stream, because a single occurrence would desynchronise a linear parse. Cheap insurance, not a known problem.
- If any real script does use them, that logic cannot be interpreted by an Independent Implementation and would have to be **re-authored behind the Host Callout** — ADR 0002 forbids translating it. On current evidence this is contingency, not scope.

A third route is now closed: #136 decoded the four native routines the handlers reach (`$054848`, `$054764`, `$0547C6`, `$0004C6B2`). All four are **host effects, not hidden script logic** — a fire-and-forget PSG sound, a pending-script launcher, and a message resume. None of them interprets script bytes, so none of them enlarges the bytecode a port must understand. They enlarge the *effect list* the seam has to offer, which is the cheaper of the two, and they remove the one **does-not-map** row from the Host Callout effect census.

Two findings that *are* live constraints:

- The interpreter **suspends itself** on a message gate (`$7BA0`) instead of blocking, so the Damocles message effect is resumable where Targ's is synchronous. A shared Host Callout cannot assume Targ's shape.
- Script arithmetic is **packed decimal**: slots `$0E` and `$15` run `abcd` over 6-byte BCD fields. A Damocles economy is BCD in the original, so a port has to choose between reproducing BCD semantics and proving binary arithmetic is observationally equivalent.

## What this sketch must not become yet

- A loaded schema or Content Set for Damocles.
- A `CONTEXT-MAP.md` split.
- Generalisation of live Gameplay Session / payload types on the Targ critical path.
- Glossary entries for Unresolved Fog (VOID / spaceflight dynamics, which record tables hold objects/craft/places, interior doorway graph, solar shade animation, impact-clock RAM cells).

## Sequencing

1. Initial Release (*Escape from Targ*).
2. *The Second City* (Content Overlay seam unchanged by #82).
3. Then Damocles inside the multi-title Independent Implementation; whole-series titles beyond Damocles remain aspiration only.
