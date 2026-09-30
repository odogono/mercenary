# Damocles interior residents in every captured workspace

Working-Authority Evidence, recovered 2026-09-25. It extends
[the Dion and Vesta structure-group maps](damocles-dion-vesta-structure-groups.md)
(#325) from two hard-coded groups to every structure group a capture stands in, and
reads each resident against the structure its own Floor binds. The prompt was Metis
DOOBERRYS SOLICITORS: on Floor 9 the ST draws a PROCESSORS CHAIR and a PROCESSORS
DESK, and the port drew nothing, because no Metis resident had a placement.

Placed interior residents go from **28 to 139** of the 195 interior-associated
residents. None of the 28 moves. Publishing the workspaces of groups no capture
stands in, replayed from the image, then takes it to **190**; see
[Groups no capture stands in](#groups-no-capture-stands-in).

## Every capture binds its group

A capture binds its structure group (`$794E`) when its live `$ABDC` is byte-identical
to the workspace `load_structure_workspace` replays from that group's authored
stream. That is the rule #325 applied to Vesta `$05` and Dion `$02`. The extractor now
checks it for every workspace it attaches and raises on a mismatch. All 22 pass:
first-world (Eris `$12`) and the 21 `--workspace` captures.

| Capture | Body | Group | Capture | Body | Group |
| --- | --- | --- | --- | --- | --- |
| first-world | ERIS | `$12` | `damocles.solon` | SOLON | `$04` |
| `vesta-parliament-4-6` | VESTA | `$05` | `damocles.theon` | THEON | `$09` |
| `gaea-ur-city-4-2` | GAEA | `$07` | `damocles.metis.transporter` | METIS | `$03` |
| `dion-2-3` | DION | `$02` | `damocles.lucan` | LUCAN | `$25` |
| `damocles.icarus` | ICARUS | `$33` | `damocles.logos.transporter` | LOGOS | `$08` |
| `damocles.acheron` | ACHERON | `$06` | `damocles.pan` | PAN | `$0C` |
| `damocles.atropos` | ATROPOS | `$37` | `damocles.thalia` | THALIA | `$0B` |
| `damocles.clotho` | CLOTHO | `$32` | `damocles.bacchus.transporter` | BACCHUS | `$18` |
| `damocles.gaea.transporter` | GAEA | `$0F` | `damocles.tolosa` | TOLOSA | `$17` |
| `damocles.cronus` | CRONUS | `$36` | `damocles.perseus` | PERSEUS | `$16` |
| `damocles.cyclopes` | CYCLOPES | `$35` | `damocles.mentor.transporter` | MENTOR | `$1A` |

Gaea `$0F` is among them, so the disposition #324 recorded for it ("bound to a static
group record, named workspace identity unresolved") no longer applies: the
`gaea-transporter` capture stands in it.

## A resident belongs to the structure its Floor binds

A resident on level *n* is read against the structure the cell instance's floor table
binds at *n* (`$055B24`, [the level-to-structure binding](damocles-level-structure-binding.md)).
That structure's plan bounds the placement, and its association list gives the regions
that insert the resident. Level 0 is the cell instance itself. Earlier, every resident
was read against the level-0 structure. Seven upper-Floor residents were left with the
implicit own-region pair, and three Dion residents in cell `$E3` fell outside a plan
that was never theirs. Now all 139 placed residents carry their own group's pairs.

### A Floor keeps the instance's scale and Building detail

Only the cell bind writes the structure scale. `$054D98`/`$054DA8` write it from an
alias record and `$054DEA`/`$054DFA` from a plain structure's `-8` bytes. The Building
detail byte `$53A85` likewise has only the two bind-path writers, `$054DB6` and
`$054E08`. The lift's move (`$055B12` → `$055BA6` → `$059D70`, then `$05A64A`,
`$052C9C` and `$054744`) reaches none of them. `$054D70` writes `$7AF0` unconditionally
before either scale write, and `$7AF0` is known never to be rewritten on a lift move.

The live captures agree. Each holds the alias record's scale in `$539CE`/`$539D2`,
whatever the Floor's own record authors:

| Capture | Floor | Instance slot, scale | Floor slot, own scale | Live `$539CE`/`$539D2` |
| --- | ---: | --- | --- | --- |
| `eris-transporter-11-8` | 10 | 17, (3, 3) | 16, **(1, 1)** | **(3, 3)** |
| `metis-transporter` | 9 | 155, (2, 2) | 58, (2, 2) | (2, 2) |
| `vesta-transporter` | 10 | 70, (3, 3) | 91, (3, 3) | (3, 3) |
| `dion-transporter` | 1 | 56, (2, 2) | 58, (2, 2) | (2, 2) |
| `logos-transporter` | 4 | 267, (1, 1) | 67, (1, 1) | (1, 1) |

So a Floor draws its slot's plan and the instance's Building detail, **both at the
instance's scale**. The extractor rescales a Floor's own-scale plan into the
instance's before bounding a resident by it. At the Floor's own scale, fifteen
residents fall outside the plan. At the instance's scale all fifteen lie inside it,
and fourteen sit exactly on their Floor's storey line. The fifteenth, ANSAFONE, is 30
units up, on the COFFEE TABLE at the same X and Z. Among them are ANTIGRAV (Eris
`$12`/`$29`, Floor 10), GOLD, STOOL, BOOKCASE and TABLE in Solon `$04`/`$11` Floor 10,
and NOVAGEN SAFE (Dion `$B2`, Floor 1), which #325 had refused.

Across the Catalogue, 173 upper-Floor entries bind a slot whose own scale differs
from its instance's, and 11 more bind another Building detail. #531 publishes each
as a Floor form in its instance's frame (`drawnStructureId`), which the port draws.
Of the 102 upper-Floor residents, 23 stood outside their Floor as it was drawn before
and none do now.

## A region may be named twice in one group

`decode_structure_associations` refused a group that names one region twice. The
native builder copies pairs verbatim (`$52D24`), and the queue assembler inserts once
for every pair whose region matches (`$5A3DE`). Eris slot 209's structure (root
`$18824`) authors region `$0E` twice in group `$13`, so both pairs are kept. The port's
`insertionsInRegion` already counts them. A repeated *group* is still refused, since
`$52D14` stops at the first match.

## Instance angle

Structure placements publish the instance angle byte (`$77A8 + 4 × slot`) as
`heading`, as surface locations already did, and the port turns a structure resident
by it through `placementHeading`. As [#361](https://github.com/odogono/mercenary/issues/361)
established, only a Model with the single-Y orientation record turns. The Metis Floor 9
furniture has none, so it draws as modelled whatever its byte reads.

## Result by Body

| Body | Placed | Interior-associated |
| --- | ---: | ---: |
| DION | 19 | 29 |
| CLOTHO | 17 | 17 |
| GAEA | 28 | 28 |
| ERIS | 23 | 64 |
| VESTA | 10 | 10 |
| METIS | 8 | 8 |
| PERSEUS, MENTOR | 6 each | 6 each |
| SOLON, TOLOSA | 4 each | 4 each |
| THEON, LOGOS, BACCHUS | 3 each | 3 each |
| ICARUS, ACHERON, ATROPOS, CYCLOPES, PAN | 1 each | 1 each |

Metis DOOBERRYS SOLICITORS (`metis-surface-60`), Floor 9, binds slot 58
(`structure-012d2e`). PROCESSORS CHAIR sits at local `(-324, 1350, 660)` and
PROCESSORS DESK at `(-319, 1350, 740)`, with FILOFAX and TRANSPORTER a. All four lie
on the storey line (9 × 150). Standing at the `metis-transporter` arrival pose (Floor 9,
region 5), the port draws all four.

## Groups no capture stands in

A capture was never what supplied a resident's position. The resident arrays are
byte-identical in every snapshot. What a capture supplied was the building the
resident belongs to, and the building comes from the group's authored stream:
`load_structure_workspace` replays it. The group's place on its Body comes from
its island record. So every island whose group no capture stands in now publishes
the workspace the loader would build for it: structures, ground, Places and
residents. `image_workspace` writes the few fields a capture would also carry (the
body selector, a camera pair at the island's origin, and the group's place list)
and hands the result to the same attach path the captures use. Each instance's
reason says "Image-replayed", and each road network keeps `attestation: "image"`.

Twenty islands are published this way, on Eris (Snow Island `$10`, Velos City `$11`,
Bare Island `$14`, Key West `$15`), Dion (North `$1B`, East `$1C`), Gaea (`$0E`),
Lachesis (Pulvin Mines) and eleven Lucan groups. Midas is the exception, below.
Placed residents go from **139 to 190**; the only interior residents still
without a placement are Midas's five.

Bare Island's workspace places, at cell `$26`, exactly the instance #172
recovered by hand for `KEY - 99 CHEVY`: the same model at the same position to the
bit. It also names it, **HANTZEN SALES**. The hand-recovered identity
`eris-structure-0251d7` is kept, since Saves and links already name it. It takes the
workspace's island and Place, and the workspace's twin is folded into it. Two
further residents, slots 65 and 145, now bind to it through the general path.

### How far to trust the replay

Four independent checks, all passing.

1. **Leave-one-out, every capture.** `scripts/image-workspace-check.py` reruns the
   whole extraction without each of the 21 workspace captures in turn, so that
   capture's island is published from the image instead. It then compares the two
   publications cell by cell: structure model, position, Place and key base; ground
   geometry; and every resident's parent cell, local position, heading and
   insertion pairs. **All 21 are identical.** Two differ only in sign text: Vesta
   Parliament (`$64`) and Tolosa (`$12`) carry dynamic vector text read from the
   capture's RAM. That text belongs to the building's detail Model, not to the
   workspace, and without the capture the Model draws its static form.
2. **The game's own tables, every capture on disk.** `ImageWorkspaceTests` checks
   that the replay holds what the running loader wrote in each of 32 captures:
   `$ABDC`, the run grid, `$1E400`, `$83DC`, the six selectors and `$7A6C`. The 32
   include captures the extractor cannot use as a workspace. **Key West** (`$15`)
   is one of the groups published here from the image alone, and the game's tables
   in `damocles.key-west.sav` are byte-identical to the replay. That capture was
   never usable as a workspace because the player stands 60 cells outside the
   built window; the loader had built the tables all the same.
3. **A live flight to Dion North.** `workspace-capture-probe.py` flew the Dion pose's
   craft to DION NORTH (`$1B`) with real stick and key input, nothing injected, and
   statesaved over it (`--capture-airborne`; the descent does not land in the time
   allowed). The capture, `dion-north-airborne.sav` (SHA-256
   `71d0a1224672551e4a0ddcefa32903007b3a284a123012d6e83cd68261064c64`), stands
   inside the built window: its implied origin is the island's (3316, 1378). The
   running loader's tables are byte-identical to the replay, and leave-one-out with
   it added publishes the same 25 structures, 256 ground cells and 5 placed residents
   whether the island comes from the capture or from the image. It stays a
   verification capture, not a Catalogue input.
4. **The port draws them.** A session standing on synthetic arrival poses inside
   image-derived buildings binds HATHAWAYS WINE BAR, POSTOFFICE SORTING and TRADING
   POST on Snow Island, a Velos City building, and HANTZEN SALES, and draws the
   resident stood beside in each.

## What is not placed

Midas's five interior residents. Midas is not a 16×16 workspace. `$0592FA` sets
`$7A2A` when the body is Midas (index 2) and for no other body. Then `$04ED2A`, after
the placement loop, copies cell 0's structure word over all 256 cells, keeping each
cell's own offset word. The Midas capture's `$ABDC` shows it: structure 68 in every
cell. [The non-Eris workspace note](damocles-non-eris-workspaces.md) had refused
that reading on the capture's disagreeing origin; the program settles it.

The five residents (three DOOR KEY As, MAGIC CRYSTAL and CHEESE SANDWICH) are
scattered across the whole Body, from X 430 to 2364. Each sits at its own cell's
centre (low words ≈ `$8000`), with one cell phase (+1, +10) shared by all five, so
each stands inside its cell's copy of structure 68. No island window represents
that, and the port has no workspace that repeats one structure across a Body.
Publishing them needs that form first.

**Since placed (#172).** The Midas island now publishes a `field`, and a copy of
structure 68 named by its Body Coordinate stands in each resident's cell. The binder
resolves a field resident's parent by Body Coordinate rather than by window cell, so
all five are placed at level 0. See [the Midas field](damocles-midas-field.md).
