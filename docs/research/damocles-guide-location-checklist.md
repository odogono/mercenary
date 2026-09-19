# Damocles guide: targeted location research

Research checklist for [#326](https://github.com/odogono/mercenary/issues/326),
checked 2026-09-19. **All eight priority captures are now taken**, by steered
craft flight; what each capture did and did not establish is recorded below.
The [Damocles guide](http://mercenarysite.free.fr/damocles.htm)
is a **secondary source of navigation leads**, not recovered runtime data or
Working-Authority Evidence. Use its base-game planet descriptions and key list
to choose where to investigate in the Atari ST Working Authority. No capture,
workspace, parent, placement or access rule is established by this note.

## Evidence and current coverage

Directly recounting [arrival-poses.json](../../payload/damocles/arrival-poses.json)
gives **27 on-foot poses across 23 physical bodies**. Seven of the thirty
physical bodies remain unposed; VOID is excluded. Running
`python3 research/damocles-st/scripts/location-ledger.py ledger` against
[catalogue.json](../../payload/damocles/catalogue.json) confirms the resident
counts below. All eight priority bodies now have a validated arrival pose, and
each still has **zero recovered interior placements** and no recovered surface
workspace. Their 25 resident records include 24 takeable objects; THALIA's
BULLET is not takeable. See the
[coverage ledger](damocles-gamma-system-location-ledger.md) and
[resident association decoding](damocles-resident-objects.md).

**A pose is not a placement.** Each capture below establishes one reachable
standing position and the engine's own cell word there. It establishes no
workspace origin, no parent, no interior placement and no access rule, and it
does not convert a guide lead into recovered runtime data.

Guide planetary coordinates beginning `~` are approximate navigation readings.
Local `x/z` building cells are a separate coordinate system; the native packed
cell is `(z << 4) | x`. Floors are a third identifier: `B` means the guide's
basement, and “unspecified” does not mean ground floor. A second secondary
source, the [guide item list](damocles-guide-resident-list.md), marks a floor on
most items and reads `G → 0`, `B → 10`, `n → n` against the catalogue's level
selectors with no contradiction across 37 cells. That is a lead for
[#355](https://github.com/odogono/mercenary/issues/355), not a decoded rule. Native level selectors
below remain raw selectors, not assumed floor numbers. No conversion from
planetary coordinates to camera longwords or workspace origins is established.

## Guide-backed capture checklist

Every destination, building name, floor and access instruction in this table is
from the guide's **base-game body section**. Resident slots and selectors in the
following section are independently extracted payload facts. Arriving on foot
is done for all eight; resolving interior placement remains a separate task on
every one of them.
The guide labels all eight destinations airless; its ACME Universal Suit lead
is the trading post at `09/14` on Dion Birmingham Island. Treat environmental
protection and keyed access as route-planning leads to verify, not newly
recovered prerequisites.

The `Captured` column records the pose taken for that body, the engine cell word
`$7B5C` read where the player stood, and the Body Coordinate Readout derived
from the camera longwords. On all eight bodies the cell the engine reports
equals the catalogue's statically decoded cell for a resident of that body —
the payload cross-check in the next section, reached from the opposite
direction. The readouts also land within a few units of the guide's approximate
planetary coordinates, which is a navigation lead corroborated, not the guide's
building names, floors or access rules promoted to recovered facts.

| Capture task | Captured | Approximate planetary destination | Local cells, floors, contents and access leads |
| --- | --- | --- | --- |
| [x] ICARUS | `icarus`, cell `$12`, readout `152-417` | Mining complex `~152/417` | HQ `02/01`: Red Herring; floor and entry restriction unspecified. |
| [x] ATROPOS | `atropos`, cell `$11`, readout `009-304` | City `~009/304` | Spaceport `02/02`; bank `01/02`; GUM store `01/01`, floor 1: Shopping Bag; radar `02/01`; open area `00/01`: Black Beacon. |
| [x] CRONUS | `cronus`, cell `$55`, readout `626-463` | Mercenary I museum `~626/463` | `05/05`: Museum Guide and Black Beacon. Exhibits: Sprintcar `05/03`, Dart `03/01`, Mechanoid `01/01`, Eagle 8 SE (“Cheese”) `01/03`, Hexapod `03/05`. Floors/access unspecified. |
| [x] CYCLOPES | `cyclopes`, cell `$22`, readout `851-602` | IDI camp `~851/602` | Palace of Fun `02/02`: Amplifier; floor unspecified. Lottery ticket lead: Clotho New Town, Lloyds building `01/00`, floor 2. A lottery condition is not evidence of an arrival restriction. |
| [x] SOLON | `solon`, cell `$11`, readout `969-590` | Penn School of Literature `~969/590` | Penn College `01/01`: Blue Beacon and underground maze. Nesbitt Library: Table, Stool, Bookcase, Gold; library floor and route through maze unspecified. |
| [x] THALIA | `thalia`, cell `$36`, readout `489-044` | Military base `~487/042` | Spaceport `06/03`: Red Beacon and Bullet. Bullet key lead: Pan Hades administration `04/01`, floor 1; this is a craft-access lead, not a requirement to stand at the spaceport. |
| [x] TOLOSA | `tolosa`, cell `$12`, readout `667-633` | Currency repository `~667/633` | Outside `01/00`: Blue Beacon. Repository `02/01`: four Gold objects; floor unspecified, Door Key H required according to guide. Guide warns of a defending drone. Key H lead: Midas, guide coordinates `220:345` (also printed `70-03-77-31`); conversion between those notations is unresolved here. |
| [x] PERSEUS | `perseus`, cell `$25`, readout `936-450` | Alkane base `~940/456` | Emergency facilities `04/01` and `04/06`, basement: one Bed and Life Support in each. Research lab `05/02`: Battery and Davy Jones' Locker; floor unspecified. |

## Payload cross-check and unresolved differences

| Body | Residents: surface/interior | Independently recovered associations and open questions |
| --- | --- | --- |
| ICARUS | 1/1 | Red Herring slot 91: cell `$12` (`02/01`), structure group `$33`, level `$00`; agrees with guide cell. Black Beacon slot 164: surface cell `$11`, omitted from the guide's Icarus list. Investigate it as an additional payload-backed lead. |
| ATROPOS | 1/1 | Shopping Bag 138: `$11`, group `$37`, level `$01`; Black Beacon 166: surface `$10`. Both match guide cells. |
| CRONUS | 2/0 | Museum Guide 112 and Black Beacon 168: surface `$55`, matching guide. Museum exhibits are not additional resident-object slots in this census; investigate their representation separately. |
| CYCLOPES | 0/1 | Amplifier 46: `$22`, group `$35`, level `$00`; guide cell agrees, parent and placement unresolved. |
| SOLON | 1/4 | Blue Beacon 173: surface `$11`. Gold 55, Stool 59, Bookcase 88, Table 246: `$11`, group `$04`, level `$0A`. Guide contents agree; it does not locate the library's floor or establish what `$0A` means. |
| THALIA | 2/0 | Bullet 12 and Red Beacon 176: surface `$36`, matching spaceport cell. Bullet is not takeable; the beacon is. |
| TOLOSA | 1/4 | Blue Beacon 172: surface `$01`; Gold 159–162: `$12`, group `$17`, level `$00`. Cells and four gold residents agree; keyed access remains a guide lead. |
| PERSEUS | 0/6 | Life Support 58 / Bed 194: `$14`; Life Support 97 / Bed 199: `$64`; all level `$0A`. Battery 107 / Locker 126: `$25`, level `$00`. All group `$16`. Guide cells/content agree; basement correspondence requires native level/region evidence. |

Agreement on a local cell does not identify a body-wide workspace origin or
supply a parent/local placement. Surface positions are recovered body-local
coordinates with unresolved named places; interior associations are selectors,
not coordinates. Do not populate runtime data from the guide table.

## Existing captures and settlement names

The eight new captures are covered by the table above; the entries below cover
the bodies that already had a pose when this note was opened. Note that none of
the eight new captures names a settlement: agreeing with a guide cell does not
recover the named area the workspace belongs to, and no name below is extended
to them.


- **GAEA / Ur City:** supported match. The
  [live workspace note](damocles-gaea-ur-city-workspace.md) records `UR CITY`
  and Hantzen's new house at `$17`, matching the guide's `07/01`. The captured
  `gaea-ur-city-4-2` pose remains the evidenced standing position.
- **DION / Birmingham Island:** candidate match. The guide puts transporter 2
  at `03/14`; `dion-transporter` is `$E3` in the same confirmed window as
  `dion-2-3`. However, the [Dion note](damocles-dion-workspace.md) explicitly
  leaves the named-area list unresolved and warns against retargeting the
  first-world Birmingham labels currently attributed to Gaea. Record the
  agreement without renaming that workspace. Dion North (`~807/586`) and
  Dion East (`~810/566`) remain separate uncaptured settlement leads.
- **GAEA / Chaldea:** candidate for `gaea-transporter`. The guide puts cube 6
  at `08/08` in Chaldea (`~065/440`); the pose and transporter slot 70 agree
  on `$88`, implying origin `256,768`. The ledger has not recovered this
  workspace's named-area identity. Do not merge it into Ur City's `512,1792`
  window or resolve the existing Gaea/Birmingham attribution from this lead.
- **ERIS / capital and VESTA / Politburo City:** guide cells `07/08` / `11/08`
  on Eris and government building `04/06` on Vesta agree with existing poses.
  Vesta's named area and Parliament cell are independently recorded in the
  [Vesta workspace note](damocles-vesta-workspace.md). No additional pose is
  needed merely to reproduce those guide addresses.

## Next evidence and delivery gates

**Every body that carries a resident object now has a validated arrival pose.**
The seven bodies still unposed — **DIALIS, LACHESIS, AURORA, TRITON, JUNO,
JASON and SAPPHIRE** — are exactly the seven with no resident in the first-world
census. That says nothing about landability, and it is still an unresolved gap
on each of them; DAMOCLES also has no residents and was posed anyway. Keep #326
open for that remaining coverage. The guide describes abandoned mines on
LACHESIS, which is the strongest lead among the seven.

**Seven of the eight now have a recovered 16×16 workspace too**, extracted from
those same captures by [#172](https://github.com/odogono/mercenary/issues/172),
so their poses are anchored and their `workspaceOrigin` is no longer null. The
recovered area lists verify six of this note's leads outright — `PENN COLLEGE`
on Solon, `IDI PALACE OF FUN` on Cyclopes, `RESEARCH LABORATORY` and two
`EMERGENCY FACILITY` records on Perseus, `PAN HADES ADMIN DEPT`, and
`LLOYDS GP4 INVESTMENT` on Clotho — as recovered runtime data rather than guide
names. Tolosa's repository cell `$12` also turns out to carry a keyed entrance
naming object slot 37, which resides on **MIDAS**: the guide said the repository
needs a key found on Midas, and the recovered data says the same thing while
naming the slot instead of the guide's letter H.

What no capture delivered is interior placement. None of the eight has a
recovered parent or local placement for any resident, so for each: recover the
structures and regions the intended delivery needs, and record mismatches rather
than replacing observed values with the guide's values.

Gate each implementation delivery on its admitted bodies' validated poses and
its required geometry, associations, placement and behavior evidence. Unrelated
bodies' missing captures need not block that delivery. This does not change
[ADR 0046](../adr/0046-switch-damocles-bodies-within-one-gameplay-session.md).

The guide also contains mission-disk walkthroughs, platform observations and
MDDClone-specific advice. None is used to establish the checklist's base-game
runtime facts. In particular, later mission-disk references to transporter 5 on
Thalia do not replace the base-game guide's transporter 5 on Eris. Guide-only
names, keys and routes still require Working-Authority verification.
