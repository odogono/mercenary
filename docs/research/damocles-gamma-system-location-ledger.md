# Damocles Gamma System location coverage ledger

Working-Authority Evidence for
[#314](https://github.com/odogono/mercenary/issues/314). This note is the
coverage ledger the Gamma System pickup programme
([#313](https://github.com/odogono/mercenary/issues/313)) is gated on: which
celestial bodies carry resident objects, which of those objects can be reached,
which scene selectors each unreached object still needs, and where the player
has been observed standing.

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint Damocles world
terms in `CONTEXT.md`, and it does not restate the recovery already owned by
[#172](https://github.com/odogono/mercenary/issues/172) (non-Eris surface
structures and places) or
[#252](https://github.com/odogono/mercenary/issues/252) (Eris structure
selectors). It counts what those tickets have delivered and names what they
have not.

## Scope and non-goals

**In scope:** a per-body census of resident object slots and their residence
evidence; the scene selectors an interior-associated resident needs before a
parent and a local placement exist; validated on-foot arrival poses; the
accounting for the six pickup-trigger objects, BRIEFCASE and both ANTIGRAV
instances; and which delivery slices the present evidence is sufficient for.

**Out of scope:** authored substitute geography, body-switching implementation,
vehicle travel, any named place not recovered from the Working Authority, and
any claim that a body is landable because it appears in the roster.

**A roster entry is not a location.** Catalogue presence, a body-name slot, or a
null placement is evidence that a record exists, not that a player can stand
there and take something.

## Working Authority and reproduce path

| Item              | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Program           | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`   |
| SHA-256           | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Resident evidence | `payload/damocles/catalogue.json` (tracked)                        |
| Pose evidence     | nineteen on-foot Hatari memstates covering fifteen bodies, published in `payload/damocles/arrival-poses.json` |
| Tool              | `research/damocles-st/scripts/location-ledger.py`                  |
| Route evidence    | `research/damocles-st/scripts/arrival-route-probe.py`              |

Every count in this note is derived from the tracked catalogue payload, so the
body ledger reproduces without Restricted Material:

```sh
python3 research/damocles-st/scripts/location-ledger.py ledger
```

The arrival poses read Restricted Material memstates. Only the decoded pose
words leave the tool, and the payload document it writes is tracked. The report
also prints each pose's Body Coordinate Readout, derived from the camera
longwords and refused where it disagrees with the engine's own `$7A1E`/`$7A22`
([the navigation digits](damocles-gamma-system.md), #371); the readout is
derived rather than published, so it is not in the payload document:

```sh
python3 research/damocles-st/scripts/location-ledger.py poses \
  --memstate eris-spaceport-onfoot=research/damocles-st/snapshots/eris-spaceport-onfoot.sav \
  --memstate dion-2-3=research/damocles-st/snapshots/dion-2-3.sav \
  --memstate gaea-ur-city-4-2=research/damocles-st/snapshots/gaea-ur-city-4-2.sav \
  --memstate vesta-parliament-4-6=research/damocles-st/snapshots/vesta-parliament-4-6.sav \
  --payload
```

## What a resident record can say about its location

Three residence forms are distinguished, and only the first two are locations at
all. The decoding is established in
[resident object associations](damocles-resident-objects.md) and is used here
rather than re-derived.

| Form                  | Evidence                                                                         | What it licenses                                              |
| --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Surface resident      | Association B's first byte is four times a body index and its second byte is zero | Body, signed 16.16 body-local coordinates, raw heading byte   |
| Interior-associated   | Association B's second byte is nonzero                                            | Body plus four scene selectors; **no** parent and no position |
| Unclaimed             | Body byte `$00`, the VOID staging byte `$78`, or the special `$FF`                | Nothing spatial                                               |

A parent and a local placement additionally require the body's structure-group
map, the selected structure's region descriptors and the association-list root
to have been recovered for that body and cell. Two residents in the whole census
have reached that state.

## Body ledger

`Surface` and `Interior` count resident object slots by residence form.
`Placed` counts residents with a recovered parent and local placement.
`Arrival pose` names the capture in `payload/damocles/arrival-poses.json`.

| # | Body | Residents | Takeable | Surface | Interior | Placed | Surface workspace | Arrival pose |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 0 | DIALIS | 0 | 0 | 0 | 0 | 0 | none recovered | none |
| 1 | ICARUS | 2 | 2 | 1 | 1 | 0 | none recovered | none |
| 2 | MIDAS | 5 | 5 | 0 | 5 | 0 | none recovered | `midas` |
| 3 | ACHERON | 2 | 2 | 1 | 1 | 0 | none recovered | `acheron` |
| 4 | DION | 30 | 28 | 1 | 29 | 16 | Dion live `$ABDC` | `dion-2-3`, `dion-transporter` |
| 5 | ATROPOS | 2 | 2 | 1 | 1 | 0 | none recovered | none |
| 6 | CLOTHO | 17 | 17 | 0 | 17 | 0 | none recovered | `clotho` |
| 7 | LACHESIS | 0 | 0 | 0 | 0 | 0 | none recovered | none |
| 8 | GAEA | 33 | 28 | 5 | 28 | 0 | Birmingham Island authored; UR City live `$ABDC` | `gaea-ur-city-4-2`, `gaea-transporter` |
| 9 | CRONUS | 2 | 2 | 2 | 0 | 0 | none recovered | none |
| 10 | CYCLOPES | 1 | 1 | 0 | 1 | 0 | none recovered | none |
| 11 | ERIS | 71 | 64 | 7 | 64 | 2 | first-world live `$ABDC` | `eris-spaceport-onfoot`, `eris-transporter-11-8` |
| 12 | SOLON | 5 | 5 | 1 | 4 | 0 | none recovered | none |
| 13 | THEON | 4 | 4 | 1 | 3 | 0 | none recovered | `theon` |
| 14 | VESTA | 11 | 10 | 1 | 10 | 10 | Politburo City live `$ABDC` | `vesta-parliament-4-6`, `vesta-transporter` |
| 15 | METIS | 9 | 8 | 1 | 8 | 0 | none recovered | `metis-transporter` |
| 16 | LUCAN | 2 | 2 | 2 | 0 | 0 | none recovered | `lucan` |
| 17 | LOGOS | 4 | 3 | 1 | 3 | 0 | none recovered | `logos-transporter` |
| 18 | AURORA | 0 | 0 | 0 | 0 | 0 | none recovered | none |
| 19 | TRITON | 0 | 0 | 0 | 0 | 0 | none recovered | none |
| 20 | PAN | 2 | 2 | 1 | 1 | 0 | none recovered | `pan` |
| 21 | THALIA | 2 | 1 | 2 | 0 | 0 | none recovered | none |
| 22 | JUNO | 0 | 0 | 0 | 0 | 0 | none recovered | none |
| 23 | BACCHUS | 6 | 4 | 3 | 3 | 0 | none recovered | `bacchus-transporter` |
| 24 | JASON | 0 | 0 | 0 | 0 | 0 | none recovered | none |
| 25 | TOLOSA | 5 | 5 | 1 | 4 | 0 | none recovered | none |
| 26 | PERSEUS | 6 | 6 | 0 | 6 | 0 | none recovered | none |
| 27 | MENTOR | 8 | 7 | 2 | 6 | 0 | none recovered | `mentor-transporter` |
| 28 | SAPPHIRE | 0 | 0 | 0 | 0 | 0 | none recovered | none |
| 29 | DAMOCLES | 0 | 0 | 0 | 0 | 0 | none recovered | `damocles` |
| 30 | VOID | 0 | 0 | 0 | 0 | 0 | none recovered | none |

Totals: **241** resident instances, **210** takeable, **34** surface-located,
**195** interior-associated, **28** with a recovered placement, across **116**
distinct interior scene selectors.

The placement count rose from 2 to 28 with
[#325](https://github.com/odogono/mercenary/issues/325): Vesta's ten interior
residents in cells `$64` and `$73`, and sixteen of Dion's nineteen in group `$02`.
Three Dion records decode a parent but place outside its extent, and the ten Dion
residents in groups `$1B` and `$1C` are bound to a static group record no capture
binds. See
[the Dion and Vesta structure-group research](damocles-dion-vesta-structure-groups.md).

### Bodies classified

- **Evidenced walkable, with a validated arrival pose (15):** MIDAS, ACHERON,
  DION, CLOTHO, GAEA, ERIS, THEON, VESTA, METIS, LUCAN, LOGOS, PAN, BACCHUS,
  MENTOR, DAMOCLES. Each has at least one live on-foot capture. Four of them —
  DION, GAEA, ERIS, VESTA — also have a recovered named 16×16 surface workspace;
  the other eleven have a pose and a cell but no named workspace yet.
- **Residents but no recovered surface workspace and no arrival pose (8):**
  ICARUS, ATROPOS, CRONUS, CYCLOPES, SOLON, THALIA, TOLOSA, PERSEUS. Each
  carries residents whose positions sit on a surface nobody has yet captured;
  CYCLOPES and PERSEUS carry only interior-associated residents.
- **No resident records at all (8):** DIALIS, LACHESIS, AURORA, TRITON, JUNO,
  JASON, SAPPHIRE, DAMOCLES. No object is associated with these bodies in the
  first-world resident arrays. DAMOCLES nonetheless has a validated arrival
  pose, which is the clearest illustration that resident count says nothing
  about whether a body can be stood on.

These classes no longer partition the thirty physical bodies: DAMOCLES is in
both the first and the third. Having a pose and having residents are independent
facts, and now that poses outnumber workspaces the two have come apart.
- **Not a physical body (1):** VOID, source slot 30, the space-as-place
  sentinel.

**None of these classes is a landability claim.** A body with no residents is
not thereby unlandable, and a body with residents is not thereby walkable. The
only walkable evidence in this note is a capture of the player standing on the
body.

## Validated on-foot arrival poses

Nineteen live captures put the player on foot on fifteen different bodies. Each
pose is published in `payload/damocles/arrival-poses.json` with its memstate
hash. Four bodies carry two poses each, standing in different places.

| Body | Capture | Body selector | Camera X, Y, Z | Yaw | Bearing | Cell | Workspace origin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MIDAS | `midas` | `$0008` | `23494601, 63, 228950707` | `$030C` | 94.22° | `$B5` | `353,3482` implied |
| ACHERON | `acheron` | `$000C` | `224298727, 63, 19757658` | `$FD77` | 311.84° | `$33` | `3419,298` implied |
| DION | `dion-2-3` | `$0010` | `213288851, 63, 86343888` | `$F620` | 11.25° | `$32` | `3252,1314` confirmed |
| DION | `dion-transporter` | `$0010` | `213351262, 213, 87064898` | `$EA17` | 8.09° | `$E3` | `3252,1314` confirmed |
| CLOTHO | `clotho` | `$0018` | `158761083, 63, 19690965` | `$F43F` | 202.15° | `$01` | `2421,300` implied |
| GAEA | `gaea-ur-city-4-2` | `$0020` | `33847828, 63, 117602545` | `$022F` | 16.52° | `$24` | `512,1792` confirmed |
| GAEA | `gaea-transporter` | `$0020` | `17334574, 213, 50890231` | `$E3AE` | 151.17° | `$88` | `256,768` implied |
| ERIS | `eris-spaceport-onfoot` | `$002C` | `4681905, 63, 8940589` | `$0600` | 0.00° | `$87` | `64,128` confirmed |
| ERIS | `eris-transporter-11-8` | `$002C` | `4946298, 1163, 8945118` | `$E4C8` | 250.31° | `$8B` | `64,128` confirmed |
| THEON | `theon` | `$0034` | `166952347, 63, 218595213` | `$0316` | 97.73° | `$11` | `2546,3334` implied |
| VESTA | `vesta-parliament-4-6` | `$0038` | `71270097, 63, 20544365` | `$0614` | 7.03° | `$64` | `1083,307` confirmed |
| VESTA | `vesta-transporter` | `$0038` | `71269092, 3233, 20547167` | `$E5B2` | 332.58° | `$64` | `1083,307` confirmed |
| METIS | `metis-transporter` | `$003C` | `165642616, 1413, 70288873` | `$EA26` | 13.36° | `$60` | `2527,1066` implied |
| LUCAN | `lucan` | `$0040` | `255428843, 63, 229920` | `$01B7` | 334.34° | `$31` | `3896,0` implied |
| LOGOS | `logos-transporter` | `$0044` | `85098916, 703, 173702108` | `$DEC2` | 68.20° | `$24` | `1294,2648` implied |
| PAN | `pan` | `$0050` | `27885887, 213, 117998423` | `$07E7` | 171.21° | `$14` | `421,1799` implied |
| BACCHUS | `bacchus-transporter` | `$005C` | `109020344, 63, 104496724` | `$DC25` | 193.01° | `$82` | `1661,1586` implied |
| MENTOR | `mentor-transporter` | `$006C` | `185238283, 63, 18055367` | `$DFCA` | 161.02° | `$79` | `2817,268` implied |
| DAMOCLES | `damocles` | `$0074` | `16451637, 63, 214692179` | `$085C` | 212.34° | `$00` | `251,3275` implied |

Each pose is read from `$7A8E` (on foot), `$7AA8` (body selector), `$7A92` /
`$7A96` / `$7A9A` (camera longwords) and `$7AA2` with its `$7AC2` twin.

The cell is **read** from `$7B5C`, the engine's own current-surface-cell word —
the same word the resident-object matcher and the object-drop matcher already
compare against. It is not derived. Deriving it was the earlier method, and it
does not survive contact with fifteen bodies: a 16×16 workspace is a window onto
a body surface that spans thousands of cells, only four window origins are
recovered, and a pose can stand in a second window of a body whose first window
is known.

Where an origin is recovered the derivation is kept as a cross-check, and it
still passes: seven of the nineteen poses stand on a body with a recovered
origin, and in all seven the camera longwords reproduce `$7B5C` exactly. Two of
those seven — `dion-transporter` and `eris-transporter-11-8` — were captured far
from the workspace note's own capture, so the origin is a property of the window,
not of the capture that first found it.

`impliedWorkspaceOrigin` carries what each pose's longwords and cell imply, for
every pose. For the seven anchored poses it equals the recovered origin. For the
other twelve it is the only thing anchoring the cell, and the payload says so
rather than presenting an unanchored cell as a located one.

**`gaea-transporter` implies a Gaea window at `256,768`,** which is neither of
the two Gaea workspaces this note records at `512,1792`. The cell it reports,
`$88`, is corroborated three ways: the catalogue's own association for
transporter slot 70 is Gaea cell 136 = `$88`; the live resident array puts slot
70 within 216 units of the pose; and the player who captured it read "8-8" off
the location display. So the cell is not in doubt — what is unreconciled is the
origin, and a third Gaea window is the reading the evidence supports. That is
recorded here as an open item, not folded into the existing Gaea note.

The Eris pose is the one `web/damocles/eris.json` already carries as `start`;
the payload document republishes it beside the three that were not previously
expressed as poses. The yaw word is published raw and carries bits above
`$03FF`; only its low ten bits are the bearing, on the convention recovered in
[walk, board, flight](damocles-walk-board-flight.md).

**Fifteen bodies have no arrival pose:** DIALIS, ICARUS, ATROPOS, LACHESIS,
CRONUS, CYCLOPES, SOLON, AURORA, TRITON, THALIA, JUNO, JASON, TOLOSA, PERSEUS,
SAPPHIRE. That is an unresolved gap for each of them, not a finding that they
cannot be stood on. Recovering one remains a bounded task per body: reach the
body in the Working Authority, capture an on-foot memstate, and run the `poses`
command.

Reaching the body is the part that was not bounded, and
[#326](https://github.com/odogono/mercenary/issues/326) has now attempted it on
an ordinary route. **Vehicle travel, which this programme originally excluded,
was brought into scope on 2026-09-18** once it became clear that every one of
the twenty-six captures depends on it. [Departure routes from a validated arrival
pose](damocles-arrival-routes.md) records what happened: the pinned Eris start
cannot leave Eris, because the one craft it can reach without a key is the
arrival ship and the board gate refuses that slot unconditionally
(`SHIP NOT REFITTED FOR FURTHER FLIGHT`, observed live). The three progressed
poses can — each restores with `EAGLE NINE S E` parked at the player's feet and
its key byte set, the laboratory boards it, and the departure chain that follows
(climb, `Esc`, space, arrival, landing) is recovered and driven live. Those
three poses, not the pinned start, are where the remaining captures begin.

In the event, flight supplied only part of the answer. **The transporter network
reaches eight bodies on foot,** and the fifteen poses now published were captured
in play by the project owner across both routes. A pose no longer needs a
recovered workspace origin to publish: `location-ledger.py poses --payload`
reads the cell from the engine and states what anchors it, instead of refusing.

## A workspace is selected before the cell is interpreted

The native load path selects a structure-group record in `$794E` before it
rebuilds `$ABDC` and the 16×16 data at `$1E000`. An interior resident then
matches Association A byte 1 against that group, Association B byte 3 against
the current cell `$7B5C`, and uses Association B bytes 2 and 1 for level and
insertion-group traversal. The effective key is therefore
`(body, structure-group, cell, level, insertion-group)`, not the cell byte alone.
The body selector `$7AA8` classifies the resident but does not select the
workspace.

For Gaea, the 15 interior residents with group `$07` are bound to the live UR
City record: the first-world static group and the live Gaea capture agree on
`$794E=$07`, `$7A6C=$024402` and the rebuilt `$ABDC`. The other 13 are bound to
group `$0F`, and that group is **now bound to a live workspace too**:
`gaea-transporter` (#326) restores with `$794E=$0F`, `$7A6C=$024AB4` and an
`$ABDC` identical to the static decode, and its place list reads
`CHALDEA METROPOLIS`. The named-workspace gap this note recorded for group `$0F`
is closed. It persisted because group `$0F` is a different 16×16 window of Gaea —
the capture implies origin `256,768` against UR City's `512,1792` — so no capture
taken in UR City could ever have bound it. The complete slot inventory and
the probe hashes are in [Damocles workspace selection](damocles-workspace-selection.md).

Gaea's two recovered surface workspaces still share the body-local origin
qualifier `(512, 1792)`. That value is a coordinate phase, not a map identity.
The authored Birmingham stream is empty at cell `$17`, while live UR City has
HANTZENS NEW HOUSE there. Surface residents use body-local coordinates and do
not consume the interior group selector, so 99 CHEVY's Birmingham-versus-UR-City
assignment remains **Unresolved** on the available evidence. The catalogue's
existing Birmingham map pin is a documented binding choice, not independent
runtime proof. See the dedicated research note for the load writes, resident
reads and the full Gaea consequence.

## Interior scene selectors still required

Every interior-associated resident needs the same four selectors matched before
the structure-association builder will place it: structure group
(Association A byte 1), insertion group (Association B byte 1), level
(Association B byte 2) and cell (Association B byte 3). The table below is the
complete inventory of the distinct `(body, group, cell, level)` scenes the
census requires, with the resident slots waiting on each. None of these
selectors is by itself a building, Room, floor or named place.

| Body | Group | Cell | Level | Residents | Takeable | Slots |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| ICARUS | `$33` | `$12` | `$00` | 1 | 1 | 91 |
| MIDAS | `$38` | `$0D` | `$00` | 1 | 1 | 219 |
| MIDAS | `$38` | `$22` | `$00` | 1 | 1 | 36 |
| MIDAS | `$38` | `$23` | `$00` | 1 | 1 | 39 |
| MIDAS | `$38` | `$EB` | `$00` | 1 | 1 | 95 |
| MIDAS | `$38` | `$F7` | `$00` | 1 | 1 | 37 |
| ACHERON | `$06` | `$11` | `$00` | 1 | 1 | 99 |
| DION | `$02` | `$09` | `$00` | 2 | 2 | 50 51 |
| DION | `$02` | `$22` | `$00` | 1 | 1 | 128 |
| DION | `$02` | `$33` | `$00` | 1 | 1 | 38 |
| DION | `$02` | `$A0` | `$00` | 3 | 3 | 154 195 204 |
| DION | `$02` | `$B2` | `$00` | 1 | 1 | 109 |
| DION | `$02` | `$B2` | `$01` | 4 | 4 | 102 111 148 220 |
| DION | `$02` | `$C2` | `$01` | 1 | 1 | 63 |
| DION | `$02` | `$DE` | `$00` | 3 | 3 | 14 101 234 |
| DION | `$02` | `$E3` | `$01` | 1 | 0 | 66 |
| DION | `$02` | `$E3` | `$09` | 1 | 1 | 34 |
| DION | `$02` | `$E9` | `$00` | 1 | 1 | 135 |
| DION | `$1B` | `$06` | `$00` | 2 | 2 | 240 243 |
| DION | `$1B` | `$06` | `$0A` | 1 | 1 | 198 |
| DION | `$1B` | `$41` | `$00` | 1 | 1 | 120 |
| DION | `$1B` | `$50` | `$00` | 1 | 1 | 77 |
| DION | `$1C` | `$06` | `$00` | 3 | 3 | 33 241 244 |
| DION | `$1C` | `$06` | `$0A` | 1 | 1 | 196 |
| DION | `$1C` | `$30` | `$00` | 1 | 1 | 104 |
| ATROPOS | `$37` | `$11` | `$01` | 1 | 1 | 138 |
| CLOTHO | `$32` | `$01` | `$02` | 3 | 3 | 208 214 218 |
| CLOTHO | `$32` | `$04` | `$0A` | 1 | 1 | 129 |
| CLOTHO | `$32` | `$11` | `$00` | 3 | 3 | 96 116 245 |
| CLOTHO | `$32` | `$12` | `$00` | 2 | 2 | 216 247 |
| CLOTHO | `$32` | `$12` | `$02` | 1 | 1 | 193 |
| CLOTHO | `$32` | `$12` | `$03` | 1 | 1 | 140 |
| CLOTHO | `$32` | `$12` | `$04` | 5 | 5 | 122 127 192 217 224 |
| CLOTHO | `$32` | `$56` | `$00` | 1 | 1 | 139 |
| GAEA | `$07` | `$17` | `$00` | 5 | 4 | 64 84 141 197 205 |
| GAEA | `$07` | `$21` | `$00` | 2 | 2 | 210 233 |
| GAEA | `$07` | `$21` | `$0A` | 1 | 1 | 78 |
| GAEA | `$07` | `$25` | `$00` | 2 | 2 | 211 232 |
| GAEA | `$07` | `$25` | `$0A` | 1 | 1 | 79 |
| GAEA | `$07` | `$29` | `$0A` | 2 | 2 | 152 163 |
| GAEA | `$07` | `$31` | `$00` | 1 | 1 | 52 |
| GAEA | `$07` | `$39` | `$00` | 1 | 1 | 26 |
| GAEA | `$0F` | `$14` | `$00` | 3 | 3 | 28 90 103 |
| GAEA | `$0F` | `$14` | `$01` | 1 | 1 | 98 |
| GAEA | `$0F` | `$65` | `$00` | 1 | 1 | 86 |
| GAEA | `$0F` | `$66` | `$01` | 4 | 4 | 27 125 229 239 |
| GAEA | `$0F` | `$66` | `$0A` | 1 | 1 | 155 |
| GAEA | `$0F` | `$88` | `$01` | 2 | 1 | 70 191 |
| GAEA | `$0F` | `$D4` | `$02` | 1 | 1 | 30 |
| CYCLOPES | `$35` | `$22` | `$00` | 1 | 1 | 46 |
| ERIS | `$10` | `$03` | `$00` | 4 | 4 | 85 123 143 201 |
| ERIS | `$10` | `$43` | `$00` | 1 | 1 | 113 |
| ERIS | `$10` | `$46` | `$00` | 3 | 3 | 45 60 61 |
| ERIS | `$10` | `$46` | `$0A` | 2 | 2 | 41 76 |
| ERIS | `$11` | `$14` | `$01` | 3 | 3 | 185 227 235 |
| ERIS | `$11` | `$14` | `$02` | 2 | 2 | 48 207 |
| ERIS | `$11` | `$14` | `$09` | 3 | 3 | 117 213 222 |
| ERIS | `$11` | `$54` | `$01` | 3 | 3 | 40 186 223 |
| ERIS | `$11` | `$73` | `$00` | 1 | 1 | 93 |
| ERIS | `$12` | `$12` | `$00` | 1 | 1 | 209 |
| ERIS | `$12` | `$29` | `$0A` | 1 | 1 | 158 |
| ERIS | `$12` | `$3F` | `$00` | 1 | 1 | 134 |
| ERIS | `$12` | `$5E` | `$00` | 1 | 1 | 136 |
| ERIS | `$12` | `$87` | `$00` | 1 | 1 | 183 |
| ERIS | `$12` | `$89` | `$00` | 2 | 2 | 118 151 |
| ERIS | `$12` | `$89` | `$01` | 1 | 1 | 110 |
| ERIS | `$12` | `$89` | `$02` | 2 | 2 | 115 187 |
| ERIS | `$12` | `$89` | `$0A` | 1 | 1 | 181 |
| ERIS | `$12` | `$8B` | `$0A` | 1 | 0 | 69 |
| ERIS | `$12` | `$99` | `$00` | 1 | 1 | 124 |
| ERIS | `$12` | `$B4` | `$00` | 1 | 1 | 105 |
| ERIS | `$12` | `$CF` | `$01` | 2 | 2 | 228 236 |
| ERIS | `$12` | `$CF` | `$02` | 1 | 1 | 35 |
| ERIS | `$12` | `$CF` | `$0A` | 1 | 1 | 47 |
| ERIS | `$12` | `$E1` | `$0A` | 1 | 1 | 57 |
| ERIS | `$12` | `$E8` | `$00` | 1 | 1 | 182 |
| ERIS | `$12` | `$EC` | `$01` | 1 | 1 | 56 |
| ERIS | `$12` | `$FD` | `$00` | 1 | 1 | 131 |
| ERIS | `$14` | `$26` | `$00` | 1 | 0 | 65 |
| ERIS | `$14` | `$26` | `$01` | 1 | 1 | 180 |
| ERIS | `$14` | `$26` | `$0A` | 1 | 1 | 145 |
| ERIS | `$14` | `$47` | `$09` | 3 | 3 | 149 206 212 |
| ERIS | `$14` | `$56` | `$03` | 3 | 3 | 75 80 81 |
| ERIS | `$14` | `$56` | `$04` | 5 | 5 | 42 43 146 150 200 |
| ERIS | `$14` | `$56` | `$0A` | 1 | 1 | 31 |
| ERIS | `$14` | `$66` | `$01` | 1 | 1 | 137 |
| ERIS | `$15` | `$77` | `$0A` | 1 | 1 | 157 |
| ERIS | `$15` | `$89` | `$01` | 3 | 3 | 44 237 238 |
| SOLON | `$04` | `$11` | `$0A` | 4 | 4 | 55 59 88 246 |
| THEON | `$09` | `$13` | `$00` | 2 | 2 | 100 242 |
| THEON | `$09` | `$32` | `$00` | 1 | 1 | 82 |
| VESTA | `$05` | `$64` | `$00` | 1 | 1 | 215 |
| VESTA | `$05` | `$64` | `$01` | 3 | 3 | 184 225 230 |
| VESTA | `$05` | `$64` | `$02` | 2 | 2 | 153 202 |
| VESTA | `$05` | `$64` | `$03` | 1 | 1 | 108 |
| VESTA | `$05` | `$64` | `$0A` | 1 | 0 | 68 |
| VESTA | `$05` | `$73` | `$01` | 2 | 2 | 94 203 |
| METIS | `$03` | `$31` | `$00` | 1 | 1 | 32 |
| METIS | `$03` | `$60` | `$09` | 4 | 3 | 67 133 226 231 |
| METIS | `$03` | `$65` | `$00` | 3 | 3 | 87 106 114 |
| LOGOS | `$08` | `$24` | `$03` | 1 | 1 | 142 |
| LOGOS | `$08` | `$24` | `$04` | 1 | 0 | 71 |
| LOGOS | `$08` | `$36` | `$00` | 1 | 1 | 121 |
| PAN | `$0C` | `$14` | `$01` | 1 | 1 | 190 |
| BACCHUS | `$18` | `$21` | `$00` | 1 | 1 | 130 |
| BACCHUS | `$18` | `$31` | `$00` | 2 | 2 | 147 221 |
| TOLOSA | `$17` | `$12` | `$00` | 4 | 4 | 159 160 161 162 |
| PERSEUS | `$16` | `$14` | `$0A` | 2 | 2 | 58 194 |
| PERSEUS | `$16` | `$25` | `$00` | 2 | 2 | 107 126 |
| PERSEUS | `$16` | `$64` | `$0A` | 2 | 2 | 97 199 |
| MENTOR | `$1A` | `$12` | `$00` | 1 | 1 | 53 |
| MENTOR | `$1A` | `$34` | `$00` | 1 | 1 | 119 |
| MENTOR | `$1A` | `$44` | `$00` | 1 | 1 | 144 |
| MENTOR | `$1A` | `$45` | `$00` | 1 | 1 | 89 |
| MENTOR | `$1A` | `$56` | `$00` | 1 | 1 | 132 |
| MENTOR | `$1A` | `$79` | `$00` | 1 | 1 | 188 |

## What is placed today

Two residents in the entire census have a recovered parent and a local
placement, both on Eris and both keys:

| Slot | Object           | Parent                                       | Local position    | Evidence                                                  |
| ---: | ---------------- | -------------------------------------------- | ----------------- | --------------------------------------------------------- |
|  180 | KEY - 99 CHEVY   | `eris-structure-0251d7` (group `$14`, cell `$26`) | `-394, 200, 1846` | [resident object associations](damocles-resident-objects.md#key---99-chevy) |
|  183 | KEY- V.I.P. LIMO | `eris-surface-87` (Capital Spaceport region 1)    | `1038, 0, 789`    | [Capital Spaceport interior](damocles-spaceport-interior.md) |

The remaining **193** interior-associated residents have selectors and no
parent. That is the dominant coverage gap in the programme.

Twenty-one of the 34 surface residents are takeable. Five of those stand on a
body with a recovered surface workspace — SUNSHADE (slot 92, Eris cell `$4C`),
RED BEACON (178, Eris `$29`), EXPLOSIVE (83, Gaea `$88`), BLUE BEACON (175,
Gaea `$88`) and RED BEACON LOCTR (54, Vesta `$44`) — and the other sixteen have
coordinates on a surface that has never been captured.

## Pickup-trigger objects and special items

The object-to-script trigger table at `$0543EC` names six resident slots, from
[the limo-key pickup note](damocles-limo-key-pickup.md#the-object-to-script-trigger-table).
All six are accounted for here. None of the other five objects is reachable,
because none has a recovered placement. Their mappings and responses have since
been recovered by [#317](https://github.com/odogono/mercenary/issues/317) —
see [the pickup-response note](damocles-pickup-responses.md) — which changes
nothing about the placements this table records.

| Slot | Object           | Trigger | Body  | Group / cell / level  | Placement | Reachable | Blocked on                                    |
| ---: | ---------------- | ------: | ----- | --------------------- | --------- | --------- | --------------------------------------------- |
|  183 | KEY- V.I.P. LIMO |   `$02` | ERIS  | `$12` / `$87` / `$00` | recovered | **yes**   | nothing; delivered under #297 / #300          |
|  181 | KEY - EAGLE 9SE  |   `$05` | ERIS  | `$12` / `$89` / `$0A` | none      | no        | Eris structure selectors (#252) at cell `$89` |
|  151 | DAMOCLES FILE    |   `$06` | ERIS  | `$12` / `$89` / `$00` | none      | no        | Eris structure selectors (#252) at cell `$89` |
|   95 | MAGIC CRYSTAL    |   `$14` | MIDAS | `$38` / `$EB` / `$00` | none      | no        | no Midas surface workspace (#172)             |
|  101 | AUTHORS COMPUTER |   `$0B` | DION  | `$02` / `$DE` / `$00` | recovered | no        | its regions are unwalkable (#362)             |
|   94 | CASH REGISTER    |   `$3E` | VESTA | `$05` / `$73` / `$01` | recovered | no        | level-to-structure binding (#355)             |

Cell `$89` is STATE OFFICE, and #252 owns every Eris structure selector, so two
of the five unreached trigger objects fall inside that ticket's existing scope.

`CASH REGISTER` is placed in GUM STORE and `AUTHORS COMPUTER` in AUTHORS HOUSE by
[#325](https://github.com/odogono/mercenary/issues/325), the latter at
parent-local `(-1630, 38, -81)` on structure-group `$02` cell `$DE` instance slot
216. Reaching either on foot is a separate question, and the section below
settles it: neither is reachable, for two different reasons.

The programme's three named special items are likewise accounted for. BRIEFCASE
is now placed; both ANTIGRAV instances remain interior-associated with no
placement:

| Slot | Object    | Body  | Group / cell / level | Blocked on                              |
| ---: | --------- | ----- | -------------------- | --------------------------------------- |
|  108 | BRIEFCASE | VESTA | `$05` / `$64` / `$03` | nothing; placed in VESTA PARLIAMENT under #325 |
|  157 | ANTIGRAV  | ERIS  | `$15` / `$77` / `$0A` | Eris structure selectors (#252)          |
|  158 | ANTIGRAV  | ERIS  | `$12` / `$29` / `$0A` | Eris structure selectors (#252)          |

Both ANTIGRAV instances select the same source model `object-03f384` and are
distinct residents at distinct Eris cells; neither is a duplicate of the other.
BRIEFCASE sits in Vesta cell `$64` — the same cell as the validated Vesta
arrival pose — which is why it was the special item closest to being reachable.
[#325](https://github.com/odogono/mercenary/issues/325) places it at
parent-local `(337, 951, -210)` inside VESTA PARLIAMENT, on floor 3 of the
structure's 317-unit storey pitch. Reaching it on foot is a separate question and
is still blocked: no route has entered that interior
([#331](https://github.com/odogono/mercenary/issues/331)).

Nothing about capacity, refusal or reversible special-item effects is claimed
here. All three carry the ordinary takeable handling byte `$04`; their special
behaviour is a separate question and belongs to the programme's later slices.

## A recovered placement is not reachability

This ledger already insists a roster entry is not a location. The browser
verification for [#320](https://github.com/odogono/mercenary/issues/320) forces
the next distinction: **a recovered parent and local placement are not
reachability either.** An object is reachable only if the port, standing
somewhere a player can stand, draws it and admits it to the selection.

Of the six pickup-trigger slots, exactly **one** — slot 183, KEY- V.I.P. LIMO —
can be stood beside anywhere in the game today. The other five fail for three
distinct reasons, and separating them matters because they are owned by three
different tickets.

| Reason                                                                     | Slots        | Owner                      |
| -------------------------------------------------------------------------- | ------------ | -------------------------- |
| No recovered residence at all                                              | 95, 151, 181 | #252 (151, 181), #172 (95) |
| Placed above ground level; only level 0 is drawn                           | 94           | [#355](https://github.com/odogono/mercenary/issues/355) |
| Exposed only in regions reached through a shut door                        | 101          | [#362](https://github.com/odogono/mercenary/issues/362) |

The method: for each admitted arrival Pose, switch to it and visit all 256
cells of that Body, collecting every resident the Session Snapshot draws.
`web/test/damocles-console.test.ts` runs it and is the reproduce path. A sweep
at 2048-unit resolution **within** each relevant cell confirms the region
result below.

### Slot 94 is a level, and the level rule is not recovered

CASH REGISTER sits at level 1 of `vesta-surface-73`, 48 units above floor 1 on
the structure's 160-unit storey pitch. `worldPosition` draws only level 0, which
is not a shortcut but the absence of the static level-to-structure binding rule
that [#355](https://github.com/odogono/mercenary/issues/355) owns. This is the
same prerequisite #313 already records against the model-form gate, the height
gate and the `$7AC5`/`$7AA5` identity: an ordinary route into a structure
interior at a non-zero level.

### Slot 101 is behind a shut door

AUTHORS COMPUTER is the informative case, because nothing about it is missing in
the obvious sense. It is level 0. Its parent `dion-surface-de` is recovered, and
the player binds to exactly that parent at Dion cell `$DE`. It has a local
placement. And it is still never drawn.

A resident is exposed in a region if its insertion group **numbers** that region
— the implicit `(group, group)` pair — or if the parent's association list names
the region explicitly. Those explicit pairs **are** recovered and published, per
resident, as `association.insertions`: the association-list root is derived from
the region-descriptor walk, not tabulated ([Dion and Vesta structure
groups](damocles-dion-vesta-structure-groups.md#the-association-list-root-is-derived-not-tabulated)),
and the extractor resolves each placed resident's own group through it. Twenty-one
of the 28 placed residents carry pairs; the other seven have a group their
parent's list does not hold, which their `reason` records.

AUTHORS COMPUTER's group `$20` exposes it in region selectors 11, 12, 26, 27, 28,
33 and 34. A `goto` to Dion cell `$DE` binds selector 18, and every path from 18
to any of those seven crosses a region whose gate is `attachmentLatch`. With the
door shut the walk reaches selectors 17 and 18 only; with it open the whole
35-region building connects and all seven become available.

So this is not a missing table and not a placement error. It is the question
[#252](https://github.com/odogono/mercenary/issues/252) owns on Eris — what opens
a structure's attachments, and from where — asked of a Dion structure.
[#362](https://github.com/odogono/mercenary/issues/362) carries it.

### What the exposure rule was reading, and what changed

Until #362 the port asked the **parent** for its `associationGroups` table. The
extractor publishes that table for `eris-surface-87` alone, so every other
structure fell back to the implicit pair and its residents were placed and never
drawn. Reading each resident's own published pairs instead took Dion from nothing
drawn anywhere to nine placed residents reachable on an ordinary walked route.

Capital Spaceport is unchanged: the resident's pairs and the parent's table agree
there, which is what licenses one replacing the other.

### Reachability of the fourteen level-0 placed residents

Fourteen of the 28 recovered placements are at level 0, the only level the draw
pass admits. Their reachability is decided by whether any region that exposes them
is connected, through region edges the clamp admits, to the region a `goto` to
their parent's cell lands in.

| Outcome                                | Count | Slots                                        |
| -------------------------------------- | ----: | -------------------------------------------- |
| Reachable on foot with every door shut |     9 | 38, 50, 51, 128, 135, 154, 183, 195, 204      |
| Reachable only once a door opens       |     5 | 14, 101, 234 (`dion-surface-de`), 109, 215    |

All nine are takeable. Eight of them — `DOOR KEY A`, `BATH`, `TOWEL RAIL`,
`WASHING MACHINE`, `ACME UNIVERSAL`, `NOTE PAD`, `BED` and `TABLE`, all on Dion —
are the first interior objects outside Eris the port can reach.

The five that remain are not a placement gap and not an exposure gap. Their
parents' region graphs connect to the exposing regions **only** through a region
whose gate is `attachmentLatch`, so they need a door open. Both of Capital
Spaceport's counterparts are already reachable with the door shut, which is why
the question never arose on Eris.

A secondary source corroborates this from an independent direction: the
[guide item list](damocles-guide-resident-list.md) annotates all three of their
cells "needs key", and none of the nine reachable residents' cells. It is a lead,
not evidence, and it also orders the work — two of the three keys it names are
above level 0, so four of the five residents are behind #355 before #362.
[#362](https://github.com/odogono/mercenary/issues/362) carries it, and it is the
same mechanism [#252](https://github.com/odogono/mercenary/issues/252) owns on
Eris: what opens a structure's attachments, and from where.

A warning for anyone extending this: **the cell centre is one position.** Sweeping
`goto` over every cell finds only four of the nine, because the other five are
exposed in regions the player must walk into. Reachability claims here are made
against the region-connectivity graph and corroborated by walked sessions, not
against cell centres.

## Residents with no location evidence

Twelve resident instances claim no body at all and are not locations. Their
Association B records are read from the on-foot capture, whose
`$63A8..$77A7` window hashes to
`9e71dcdc45aba40a7d6db0068f7e5e9076dff7226e31406eb4dffcc0474eae4c` — the same
value the pinned first-world and interior runs give.

| Slot | Object       | Takeable | Association B | Reading                                     |
| ---: | ------------ | -------- | ------------- | ------------------------------------------- |
|    8 | NEUTRON FUEL | yes      | `$00000000`   | moving-object pool at rest — **resolved, #327** |
|   11 | ATTACK SHIP  | no       | `$00000000`   | moving-object pool at rest — **resolved, #327** |
|   15 | NEUTRON FUEL | yes      | `$00000000`   | moving-object pool at rest — **resolved, #327** |
|   74 | Object 74    | no       | `$FF000000`   | the special `$FF` slot                      |
|  248 | Object 248   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |
|  249 | Object 248   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |
|  250 | Object 248   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |
|  251 | Object 251   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |
|  252 | Object 251   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |
|  253 | Object 251   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |
|  254 | Object 254   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |
|  255 | Object 254   | no       | `$00000067`   | body byte `$00`; world-bound model slot     |

Slots 248–255 are the block the world's resident-object stream rewrites at
`$05503C`; the catalogue already records them as a world binding rather than a
resident fact.

Slots 8, 11 and 15 are **not** location gaps.
[#327](https://github.com/odogono/mercenary/issues/327) established that they are
the three driven entries of an eight-entry moving-object pool covering slots
8–15: slot 8 is the shot the player fires, slot 11 is the `ATTACK SHIP`, and
slot 15 is the shot that ship fires back. Each is placed at launch — the current
body byte `$7AC9` written into Association B byte 0 with byte 1 cleared, the
ordinary surface-resident form — and cleared again when its lifetime counter
expires or the encounter resolves. `$00000000` is their resting value, not an
absent placement.

Slot 8 is reachable in ordinary play: boarded (`$7AB0` non-negative) with the
fire button held, it was observed placed on ERIS as `$2C000000` and stepping
through a 32-step flight. Slot 15 and slot 11 additionally require the
persistent encounter gate `$070104`, which exactly one site in the program arms
— the TOLOSA body-briefing script at `$072B16`. Both were observed placed once
that word was set. The full path, its gates and the four probe cases are in
[the moving-object research](damocles-moving-objects.md); neither slot is
takeable in practice, because a moving object is out of reach for the whole of
its life and is cleared the moment that life ends.

A further fourteen slots — 9, 16–25, 29, 62 and 189 — bind the NULL model and
emit no instance. Twelve of them carry body byte `$00`; slots **62 and 189** are
the two VOID staging records, both holding Association B `$78010010`, which is
exactly the parked value the take handler and the later scene rebuild leave on a
carried object ([limo-key pickup](damocles-limo-key-pickup.md)). They are
neither objects nor location gaps.

Those readings reconcile the whole census: 23 records with body byte `$00`, two
`$78` VOID staging records and the one `$FF` slot, of which 12 emit an instance
and 14 do not.

## Delivery slices

Arrival coverage gates each delivery's admitted bodies, not the whole design
in [#318](https://github.com/odogono/mercenary/issues/318). Each admitted body
needs a validated arrival pose and the geometry, workspace, object placement and
behaviour evidence required by that delivery. A pose alone does not establish
playable content. Evidence-complete deliveries may proceed while
[#326](https://github.com/odogono/mercenary/issues/326) remains open for other
bodies; the full programme's coverage gaps remain explicit.

The [guide-backed location checklist](damocles-guide-location-checklist.md)
prioritises the eight unposed bodies with residents, and the
[guide item list](damocles-guide-resident-list.md) covers every body with a floor
marker per item. Its settlement names and
coordinates are secondary-source leads for verification, not recovered payload
data or permission to invent a standing position. The other seven unposed
bodies remain lower-priority coverage work.

| Slice                                          | Evidence sufficient?                       | What it rests on                                                                |
| ---------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Ordinary take and drop on the Eris surface     | **Yes**                                    | First-world Eris workspace, the validated Eris pose, 34-record surface census    |
| Ordinary take and drop inside Capital Spaceport | **Yes**                                    | Slot 183 placement, region grammar, drop research (#312)                        |
| Body switch to DION / GAEA / VESTA at a pose   | **Yes**, for the pose itself               | `payload/damocles/arrival-poses.json`; each pose is one standing position only   |
| Surface objects on DION / GAEA / VESTA         | **Partly**                                 | Coordinates exist; 99 CHEVY's authored/live Gaea map identity remains Unresolved |
| Interior objects anywhere but the two Eris keys | **No**                                     | 193 residents have selectors and no parent                                       |
| Pickup-triggered responses beyond slot 183     | **No**                                     | Responses recovered (#317) and implemented (#346); none of the other five objects is reachable |
| Interior objects with a recovered placement on DION / VESTA | **No**                        | Placements recovered (#325); nothing exposes them — the association-list root is decoded for Capital Spaceport only |
| Body switch to any of the other eleven posed bodies | **Yes**, for the pose itself           | `payload/damocles/arrival-poses.json`; the cell is engine-read but unanchored to a named workspace |
| Any of the fifteen unposed bodies              | **No**                                     | No surface workspace, no arrival pose                                            |

### Bounded tasks this ledger identifies

Already owned, and this ledger supplies the target list rather than new scope:

- **#252** — Eris structure selectors. Cells `$89` (KEY - EAGLE 9SE, DAMOCLES
  FILE), `$77` and `$29` (both ANTIGRAV) are the ledger's highest-value Eris
  cells; all four objects are unreachable until those selectors decode.
- **#172** — non-Eris surface structures and places. The eighteen bodies with
  residents and no named workspace are its remaining target list, and MIDAS is
  the only one holding a trigger object (MAGIC CRYSTAL, slot 95). Ten of them now
  have an arrival pose and an implied window origin, which gives the work a live
  standing position to start from rather than coordinates alone.

Additional research under #313, required by the deliveries that use it:

0. **Which regions of a non-Eris structure a player can walk into.**
   [#362](https://github.com/odogono/mercenary/issues/362). Reading each
   resident's own published insertion pairs took Dion from nothing drawn to
   four reachable residents, but AUTHORS COMPUTER's regions are still behind
   the structure's clamp. This is #252's question — doors, openings and the eye
   clamp — asked of a Dion structure. See [a recovered placement is not
   reachability](#a-recovered-placement-is-not-reachability).

1. **Remaining Gaea map identity and placement.** Runtime selection is decoded:
   group `$07` is tied to UR City, while group `$0F` is statically bound but has
   no proven named Gaea workspace. Surface 99 CHEVY remains Unresolved because
   its coordinate phase does not choose Birmingham versus UR City. Further
   islands and authored disambiguation remain #172 / out of scope.
2. **Structure-group maps for DION and VESTA.** Delivered by
   [#325](https://github.com/odogono/mercenary/issues/325): the group-offset root
   traversal is done, all 24 scenes have a decoded parent, and Vesta's ten
   residents and Dion's group-`$02` residents are published with parents and
   parent-local placements, including AUTHORS COMPUTER, CASH REGISTER and
   BRIEFCASE. The seven Dion residents in groups `$1B` and `$1C` are bound to a
   static group record whose named workspace identity is unresolved, the same
   disposition #324 records for Gaea group `$0F`.
3. **Arrival poses for the remaining fifteen bodies.** Substantially advanced by
   [#326](https://github.com/odogono/mercenary/issues/326): coverage went from
   four bodies to fifteen. Departure is recovered and driven live, the
   transporter network is recovered and its ring resolved, and the payload
   publishes an engine-read cell for a body with no recovered workspace origin.
   What remains is fifteen bodies reachable only by a steered flight arrival,
   which is the one part of the route still unsolved. See [departure
   routes](damocles-arrival-routes.md).
Resolved since this ledger was first written:

4. **Residence of slots 8 and 15.** Closed by
   [#327](https://github.com/odogono/mercenary/issues/327): both are entries in
   the moving-object pool, placed on the current body at launch and cleared at
   expiry. See [Residents with no location
   evidence](#residents-with-no-location-evidence).

## Coverage and remaining gaps

- `complete: false`. Fifteen of the thirty physical bodies have no arrival pose;
  eight of those fifteen carry residents and have no recovered surface workspace
  either. Of the fifteen bodies that do have a pose, eleven have an engine-read
  cell with no named workspace to anchor it.
- 193 of 195 interior-associated residents have no parent and no local
  placement.
- Of the 28 residents that **do** have a recovered placement, **nine** can be
  reached on foot — one on Eris and eight on Dion. Fourteen are above level 0 and
  are not drawn at all (#355); the remaining five are at level 0 but sit behind a
  door (#362).
- Workspace selection within a body is decoded, and both Gaea groups are now
  bound to a live workspace. What remains undecoded is which structure a **level**
  selects: the association list is bound per level, read live from `$7B0E`, and
  not yet predicted statically.
- The static decode of Eris group `$12` does not reproduce `$ABDC` byte 1 for
  cells `$3C`–`$3F`. Every Eris capture agrees on the live bytes, so it is a
  decoder gap rather than gameplay state.
- Capacity, refusal behaviour, reversible special-item effects and the five
  unobserved pickup responses are outside this note and remain Fog for #313.
- No named place is asserted for any structure in this note. Where a parent
  exists it is named by its selectors, not by a building name.

## Provenance summary

| Fact                                                | Evidence                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Per-body resident counts and residence forms        | `payload/damocles/catalogue.json`; `location-ledger.py ledger`           |
| Residence-form decoding                             | [resident object associations](damocles-resident-objects.md)             |
| Nineteen on-foot arrival poses on fifteen bodies    | Nineteen Hatari memstates; `location-ledger.py poses`                    |
| Arrival cells                                       | The engine cell word `$7B5C`, cross-checked against the camera longwords on the seven poses whose body has a recovered origin |
| The transporter ring and its eight bodies           | [departure routes](damocles-arrival-routes.md); catalogue slots 64–73    |
| Board gate, its refusals and the per-craft key byte | [departure routes](damocles-arrival-routes.md); `arrival-route-probe.py` |
| Engine-read arrival cells agree with the workspace notes | [Dion](damocles-dion-workspace.md), [Gaea UR City](damocles-gaea-ur-city-workspace.md), [Vesta](damocles-vesta-workspace.md), [catalogue](damocles-catalogue.md) |
| Gaea's two workspaces share an origin qualifier     | [Gaea UR City workspace](damocles-gaea-ur-city-workspace.md)             |
| Gaea group `$0F` is CHALDEA METROPOLIS              | `gaea-transporter`; `$7A6C=$024AB4` and an `$ABDC` identical to the static decode ([workspace selection](damocles-workspace-selection.md)) |
| The association list is bound per level             | Vesta cell `$64` at levels 0 and 10 bind different structures; ten residents across six bodies resolve in the list bound at their own level |
| Six pickup-trigger slots                            | [limo-key pickup](damocles-limo-key-pickup.md#the-object-to-script-trigger-table) |
| Slot 183 is the only reachable pickup-trigger object | All-cell sweep of every admitted Body against the tracked payload; `web/test/damocles-console.test.ts` |
| Nine placed residents are reachable, eight of them on Dion | Region-connectivity graph over the published region bounds, corroborated by walked sessions; `web/test/damocles-body-aware.test.ts` |
| A resident's exposing regions are published per resident | `association.insertions` in `payload/damocles/catalogue.json`, resolved through the derived association-list root ([Dion and Vesta structure groups](damocles-dion-vesta-structure-groups.md#the-association-list-root-is-derived-not-tabulated)) |
| Keyed access matches the five unreachable residents' cells, 3 cells for 3 | Secondary source only: [guide item list](damocles-guide-resident-list.md); `guide-resident-list-check.py` |
| Slots 248–255 are a world binding                   | [catalogue](damocles-catalogue.md)                                       |
