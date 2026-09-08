# Departure and Destination sketch (non-loaded)

**Status:** Research sketch only. Not loaded by the app, no change to `web/src`, no Save schema change. The decision it details is ADR 0040; the vehicle is the one ADR 0021 licenses (non-loaded sketches until after *The Second City*).

**Verdict this sketch supports:** the player chooses what to play by choosing where to fly — a shell-owned Departure committing one Destination, ending seamlessly where the unchanged Arrival (ADR 0032) begins.

## Sequence

Three segments, one continuous camera, no cuts:

1. **Carousel** — deep space, a star field, the carousel of Destinations. Rotation left/right snaps per entry; each entry is a labelled system view (`TARG`, `TARG — SECOND CITY`, `DAMOCLES`, as each ships). Initially snapped to the last played Destination; Targ, original city, on first boot. Flat: no nesting, no sub-menu, and only Destinations that exist appear.
2. **Committed journey** — on commit, the view travels: interstellar run out of the star field, flyby past the chosen system's bodies, then planet approach. For Targ the approach shows the two cities as **two islands on the planet disc — approach fiction only**; the choice was committed back at the carousel, and the in-game surface remains the wrapping 16×16 world (ADR 0034).
3. **Seam into the Arrival** — the journey's final frame is the Arrival's opening state: the Arrival Field (seed 1986, 220 stars) with the planet as a dot, handing over to the Arrival's existing phase machine (`web/src/shell/arrival.ts`). Left open here: whether handover lands before `titleCard` or the `M E R C E N A R Y` title card moves ahead of the carousel as the app's first frame. Either preserves ADR 0032 unchanged from `space` onward.

## Celestial rosters (evidence-bound, invented bodies prohibited)

| Destination | System bodies shown | Authority |
|---|---|---|
| Targ (original city) | Targ's sun and two moons | Targ Orrery (ADR 0025) — already a deterministic model |
| Targ — Second City | Same roster; second island appears on approach | Targ Orrery; island dressing is authored fiction |
| Damocles | Gamma System roster (DAMOCLES, VOID, et al.) | Working-Authority Evidence, `damocles-gamma-system.md` (#80) |

The Arrival Narration's quoted "DESTINATION-GAMMA FIVE" (`web/src/shell/arrivalNarration.ts`) is the existing fictional stitch between Targ's opening and the Gamma System. *The Dion Crisis* shares the Gamma System, which is why a Destination is a system **plus** a world **plus** a landing target — one system may host more than one Destination — but Dion gets no entry, roster, or seam here (non-binding aspiration, ADR 0040).

## Skip path

Skip = **commit the currently snapped entry + fast-forward**. One key from deep space runs journey and Arrival to the join in the same fixed steps the frame loop would have given the held session, so skipped and watched reach the identical Save Snapshot — ADR 0032's proof extended by composition, testable the same way (`web/test/arrival.test.ts` is the model). A first play reaches the status report with zero decisions.

## When it shows

- First boot with no Session Resume, and every New Game (behind the existing two-press confirm in `web/src/shell/menu.ts`).
- A Session Resume bypasses the Departure entirely.
- Preset-blind under both Presentation Presets (ADR 0032's argument: nothing recovered to differ from).

## Paths (ADR 0041)

Each Title has one path; the carousel lives only at the root.

| Path | Starts | Notes |
|---|---|---|
| `/` | The Departure carousel across every Destination that exists | Loads no payload |
| `/targ` | Targ's default Destination: original city, journey then Arrival, carousel omitted | Resumes Targ's Session Resume if present, correcting the address to the Destination in progress |
| `/targ/second-city` | *The Second City* | Same Title, same Saves; the Destination field decides what restores |
| `/damocles` | Damocles | One Destination, so no sub-path |
| `/dion` | Reserved, non-binding | No design |
| anything else | Falls back to `/` | |

Commit on the carousel pushes the Title's path into history, so Back returns to deep space; the address never changes again inside a game. New Game restarts the current Title's default Destination on the current path. Slugs (`targ`, `second-city`, `damocles`) are the identifiers a Save and a Session Resume store.

A Title's Data Payload loads on commit. Damocles's is already under `payload/damocles/` (ADR 0039); Targ's moves from the payload root to `payload/targ/` only when a second Title actually loads. The Damocles catalogue's eventual home is `/damocles/catalogue`; it stays at `/catalogue.html` for now.

## Save and Resume identity (deferred schema note)

When the second Destination ships, a Save and the Session Resume name their Destination, and a Save restores only into a session of the same Destination. Saves and the Session Resume are kept per Title (ADR 0041, revising ADR 0040's single app-wide record): one Resume record for Targ, one for Damocles, so leaving one Title to visit another loses nothing. Within a Title, committing a different Destination is New Game. Preferences and typeface stay global. No schema change before then.

**Future-continuity material, out of scope here:** the original Damocles imported *Mercenary I* / *Second City* saves — script slots `$0E`–`$0F` and `$13` in `damocles-script-catalogue.md`. If cross-Destination continuity is ever designed, that is the precedent to grill against; nothing in ADR 0040 promises it.

## What this sketch must not become yet

- Shipped shell code, a boot-flow change, path routing in the shell or `serve.ts`, or anything imported from `web/src`.
- A Save schema bump, a Destination or Title field in today's Save identity, or a storage namespace change.
- A locked or teased carousel entry, or any Dion Crisis treatment.
- A second island in the World Geometry Dataset or any surface-geometry change.
