# Live surface workspaces beyond Eris

Working-Authority Evidence for
[#172](https://github.com/odogono/mercenary/issues/172). Until this note, the
Damocles Catalogue carried live `$00ABDC` surface maps for three bodies — Dion,
Gaea UR City and Vesta — and every other body's residents sat on a surface
nobody had captured. It now carries **twenty-one live workspaces across twenty
bodies**, recovered from the arrival-pose memstates
[#326](https://github.com/odogono/mercenary/issues/326) published.

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`, and it does not re-derive the `$ABDC` grammar already
recorded in [the catalogue note](damocles-catalogue.md) and
[workspace selection](damocles-workspace-selection.md).

## Scope and non-goals

**In scope:** which bodies now have a live workspace; what each one's cells,
ground records and area list yield; the origin cross-check that decides whether a
capture may be published at all; and the environmental state each capture was
taken in.

**Out of scope:** interior resident placement, which stays with
[#325](https://github.com/odogono/mercenary/issues/325); any claim that a
recovered area name identifies a body-wide place; any island or window of a body
other than the one its capture stands in; and any survivability rule beyond what
a capture and a restore show.

**A recovered workspace is one 16×16 window, not a body.** Cronus carries an area
named `CRONUS MUSEUM` and no surface assembly at all in the window its pose
stands in. That is a recovered fact about that window, not about Cronus.

## Working Authority and reproduce path

| Item             | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Program          | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`   |
| SHA-256          | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| First-world RAM  | `work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`  |
| Workspaces       | The arrival-pose memstates, `payload/damocles/arrival-poses.json`  |
| Tool             | `damocleslab.catalogue`, `--workspace` (repeatable)                |

The memstates are Restricted Material and are not committed. The extractor reads
them without an emulator: it carves the 1 MiB ST RAM window and decodes `$ABDC`,
`$1E000`/`$1E400`/`$83DC` and the `$7A6C` area list. The exact command is in
[the catalogue note's reproduce section](damocles-catalogue.md#reproduce).

**The decoder carries no body identity.** Body, label, slug and area name all
come from the machine, so adding a workspace is an input, not a code change. The
only per-body table left is `WORKSPACE_EVIDENCE`, which names the note a body's
records cite; a body absent from it cites this note.

## What each workspace yields

`Surface` is occupied `$ABDC` cells, `ground` is plotted `$1E000` cell fills, and
`origin` is the window's body-local origin in whole cells. `Cell` is where the
capture stands.

| Body | Area name | Instance prefix | Surface | Ground | Origin | Cell |
| --- | --- | --- | ---: | ---: | --- | --- |
| ACHERON | `ACHERON RETREAT` | `acheron` | 28 | 25 | 3419,298 | `$33` |
| ATROPOS | `ATROPOS WAYSTATION` | `atropos` | 8 | 8 | 42,225 | `$11` |
| BACCHUS | `BACCHUS WAYSTATION` | `bacchus` | 19 | 19 | 1661,1586 | `$82` |
| CLOTHO | `CLOTHO NEW TOWN` | `clotho` | 22 | 21 | 2421,300 | `$01` |
| CRONUS | `CRONUS MUSEUM` | `cronus` | **0** | 15 | 2564,873 | `$55` |
| CYCLOPES | `IDI CENTRE` | `cyclopes` | 15 | 21 | 3487,1445 | `$22` |
| DION | `BIRMINGHAM ISLAND` | `dion` | 140 | 249 | 3252,1314 | `$32` |
| GAEA | `CHALDEA METROPOLIS` | `gaea-chaldea-metropolis` | 100 | 125 | 256,768 | `$88` |
| GAEA | `UR CITY` | `gaea-ur-city` | 22 | 38 | 512,1792 | `$24` |
| ICARUS | `TAKOUSHI BASE` | `icarus` | 5 | 7 | 624,688 | `$12` |
| LOGOS | `LOGOS CITY` | `logos` | 23 | 24 | 1294,2648 | `$24` |
| LUCAN | *(empty)* | `lucan` | **0** | 14 | 3896,0 | `$31` |
| MENTOR | `MENTOR WAYSTATION` | `mentor` | 23 | 23 | 2817,268 | `$79` |
| METIS | `METIS MOONBASE` | `metis` | 21 | 30 | 2527,1066 | `$60` |
| PAN | `PAN HADES LABOUR CAMP` | `pan` | 10 | 17 | 421,1799 | `$14` |
| PERSEUS | `ALKANE BASE` | `perseus` | 9 | 19 | 3834,821 | `$25` |
| SOLON | `SOLON BASE` | `solon` | 1 | 1 | 3974,1396 | `$11` |
| THALIA | `THALIA BASE CAMP` | `thalia` | 10 | 19 | 1999,3256 | `$36` |
| THEON | `THEON BASE` | `theon` | 5 | 16 | 2546,3334 | `$11` |
| TOLOSA | `ERIS BANK REPOSITORY` | `tolosa` | 14 | 14 | 2737,1571 | `$12` |
| VESTA | `POLITBURO CITY` | `vesta` | 19 | 24 | 1083,307 | `$64` |

Eris keeps its 76 first-world surface assemblies and 123 ground instances, and
the authored Birmingham Island map its 82, neither of which this pass touches.

**Gaea now carries two live windows.** `UR CITY` at origin 512,1792 and
`CHALDEA METROPOLIS` at 256,768 place into one body surface at their own world
coordinates, 256 and 1024 cells apart on the two axes, and the frame draws only
the occupied cell's. This closes the open item the coverage ledger recorded
against `gaea-transporter`: the third window its longwords implied is now
recovered, with its own area list, rather than being folded into UR CITY.

## Thirty-seven recovered place names

The `$7A6C` area list decodes on every published workspace, and the names are
recovered runtime data rather than guide leads. Six of them land exactly where
the [guide checklist](damocles-guide-location-checklist.md) had filed a
secondary-source lead, which verifies the lead and does not promote the guide:

| Body | Recovered place | The lead it verifies |
| --- | --- | --- |
| SOLON | `PENN COLLEGE` | guide's Penn College `01/01` |
| CYCLOPES | `IDI PALACE OF FUN` | guide's Palace of Fun `02/02` |
| PERSEUS | `RESEARCH LABORATORY` | guide's research lab `05/02` |
| PERSEUS | `EMERGENCY FACILITY` ×2 | guide's emergency facilities `04/01`, `04/06` |
| PAN | `PAN HADES ADMIN DEPT` | guide's Pan Hades administration `04/01` |
| CLOTHO | `LLOYDS GP4 INVESTMENT` | guide's Lloyds building `01/00` |

Acheron's retreat yields `TANIS SPHYNX`, `OSIRIS SHYNX` (the record's own
spelling, kept verbatim), `KING BURDOCK` twice, and `THE TOMB OF SETH`, `HORUS`,
`MAAT` and `NEITH`. Logos yields `BURDOCK MEDIA LINK`, `SKY-DISNEY MEDIA LINK`
and `ERIS TV MEDIA LINK`; Metis `NIXON INTR COURT`, `TIMEWARP PRISON` and
`DOOBERRYS SOLICITORS`; Bacchus `UNCLES CASINO`, `BOSHERS BAR`,
`GABRIELS PLACE` and `MOTHER MERCURYS`; Mentor four `FRANKS BARGAIN TP` records;
Chaldea `BANK OF GAEA HQ`, `MARILLION APARTMENTS`, `TRADE COMMISSION`,
`MEGA TRADING` and `ESTATE AGENTS`.

A place record names a cell in one window. It does not name the body, and
repeated names — `KING BURDOCK` twice, `FRANKS BARGAIN TP` four times — are
repeated records, not one place seen twice.

## The origin cross-check, and the two captures it refuses

A workspace's origin is the world/local camera pair at `$7A92`/`$7A2C` and
`$7A9A`/`$7A34`. That pair is only an origin while the workspace is actually
built for the cell the player occupies, and the engine's cell word `$7B5C`
implies the same origin independently:

```text
implied_x = $7A92 >> 16 − (cell & $0F)
implied_z = $7A9A >> 16 − (cell >> 4)
```

On twenty-five of the twenty-seven arrival poses the two agree exactly. On two
they do not, and the extractor now **refuses** those captures rather than
publishing placements against a fabricated origin:

| Capture | Camera-pair origin | Cell-implied origin | What the capture also shows |
| --- | --- | --- | --- |
| `midas` | `−63807,−60502` | `353,3482` | all 256 `$ABDC` cells hold the identical record — structure 68, ground offset `$2540`, orientation 0 |
| `damocles` | `−105,2101` | `251,3275` | no occupied cell, and the area list decodes as the non-text `UGHIJK` |

Both readings point the same way: the workspace was not built for the cell the
capture stands in. This matters because the first reading of `midas` was that
THE MIDAS PROJECT is a uniform field of one repeated structure — a striking
claim the origin disagreement refuses. **MIDAS and DAMOCLES therefore have an
arrival pose and no recovered workspace**, and MIDAS still holds MAGIC CRYSTAL,
the only pickup-trigger object outside Eris, Dion and Vesta. Recovering it needs
a fresh capture standing in a built MIDAS workspace, not a re-read of this one.

## Two windows with no surface assembly

`CRONUS` and `LUCAN` publish a workspace with **zero** occupied `$ABDC` cells.
Both are self-consistent rather than broken: the origin cross-check passes, the
bound-structure word `$7AF0` reads 0, and ground records decode normally — 15
and 14 of them.

Cronus is the interesting one, because its area decodes as `CRONUS MUSEUM` and
the capture stands at cell `$55`, which is exactly where the guide puts the
museum. The most economical reading is that the pose stands in a different 16×16
window from the museum's, but nothing here shows that, and it is recorded as an
open question rather than resolved. Lucan's area record is empty.

## What the captures say about the environment they were taken in

Restoring these memstates and letting the machine run does not always leave a
player standing. The live message pointer `$7B98` resolves to the system-string
record it is inside, and the gate `$7BA0` says whether that record is being
presented at all — 0 lowered, `$0001` just raised, `$FFFF` presenting
([message reveal](damocles-message-reveal.md)). `arrival-poses.json` now
publishes both per pose as `captureEnvironment`.

Fourteen poses were captured **presenting** system string 6,
`NO AIR! YOU CAN SURVIVE FOR TEN SECONDS`. Restoring all twenty-seven in the
pinned laboratory and letting each settle separates them exactly along that line:

| Restored outcome | Count | Poses |
| --- | ---: | --- |
| Body selector becomes `$0078` (VOID), panel reads `YOU'RE A BIT DEAD` | 14 | `acheron`, `atropos`, `clotho`, `cronus`, `cyclopes`, `icarus`, `lucan`, `mentor-transporter`, `midas`, `perseus`, `solon`, `thalia`, `theon`, `tolosa` |
| Still on the body it was captured on | 13 | `bacchus-transporter`, `damocles`, `dion-2-3`, `dion-transporter`, `eris-spaceport-onfoot`, `eris-transporter-11-8`, `gaea-transporter`, `gaea-ur-city-4-2`, `logos-transporter`, `metis-transporter`, `pan`, `vesta-parliament-4-6`, `vesta-transporter` |

**The fourteen that die are exactly the fourteen whose gate was up over a
countdown record.** No pose with the gate down died, and no pose with it up
survived. Eris restores alive with its scene drawn; MIDAS restores dead on a body
the panel then calls VOID.

**The gate being down still does not mean the environment is safe.** It falls
after about 200 frames while the ten-second timer keeps running, so a pose whose
gate reads 0 over a `NO AIR` record has simply had the message expire — `pan` and
`damocles` are both in that position, and both happen to survive the settle. The
published `hazardWarning` is therefore true only where the gate is up. It
predicts this sweep perfectly, but it is a statement about the capture and the
restore, not a recovered per-body environment rule: what each body's atmosphere
actually is, and what the ten-second timer's own state word is, remain
unrecovered.

This does not weaken the poses. Each is still a live capture of the player on
foot on that body, with its body selector, position words and cell word intact,
and — for the twenty-one published here — a workspace built around it. It does
mean **a validated arrival pose is not a survivable one**, and the payload now
says so rather than leaving a reader to assume it.

## Five ground records that do not decode

Every Eris ground record decodes. Five on three of the new bodies do not, and
all five name one reason: ground `$6000` vector text is copied into the frame
stream untransformed, and these cells carry a nonzero orientation.

| Model | Body |
| --- | --- |
| `cronus-ground-01fe26-06-55` | CRONUS |
| `cyclopes-ground-01ead2-03-14` | CYCLOPES |
| `cyclopes-ground-01ead2-03-24` | CYCLOPES |
| `cyclopes-ground-01ead2-03-34` | CYCLOPES |
| `metis-ground-01edf2-03-65` | METIS |

Eris never places painted ground text at a nonzero orientation, so the gap only
becomes visible once other bodies are captured. It is a decoder gap, not
gameplay state, and `web/test/catalogue.test.ts` names all five so it stays
tracked.

## What this closes, and what it does not

**Closed.** `object-041b8a`, the one `$7000` ground template no captured cell
table placed, is now placed: the new workspaces bind it through six evidenced
palettes. The catalogue note had named exactly this as the next probe — "a
surface workspace capture on a further body" — and it resolved without authoring
a default.

**Not closed, and the largest remaining item.** A recovered workspace is not an
interior placement. The extractor resolves interior residents only for the two
structure groups a pinned capture binds, Vesta `$05` and Dion `$02`. These
captures bind many more — Icarus `$33`, Cyclopes `$35`, Solon `$04`, Tolosa
`$17`, Perseus `$16` and others — so the group-override traversal
[#325](https://github.com/odogono/mercenary/issues/325) proved could now run on
them. That is a separate pass with its own storey and extent validation, and
nothing here places an interior resident.

**Also open.** None of these twenty bodies has a named place identity for its
*window* as opposed to its area record; MIDAS and DAMOCLES need a fresh capture;
and Cronus's empty museum window is unexplained.

**Closed by [#391](https://github.com/odogono/mercenary/issues/391).** Every
origin in the table above is authored, not a property of the capture: each body
carries a list of island records naming an origin, a structure group and a land
colour, and the workspace built around a pose is the record nearest to it. All
twenty-one origins here match a record exactly, as do MIDAS's and DAMOCLES's —
which is further reason to read those two as poses displaced from their built
workspace rather than as bad origins. Twelve of these bodies carry more than one
record, so "no other window recovered" was a limit of the capture set, not of
the data. See [the island note](damocles-eris-islands.md).
