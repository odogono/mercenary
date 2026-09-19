# Damocles guide: targeted location research

Research checklist for [#326](https://github.com/odogono/mercenary/issues/326),
checked 2026-09-18. The [Damocles guide](http://mercenarysite.free.fr/damocles.htm)
is a **secondary source of navigation leads**, not recovered runtime data or
Working-Authority Evidence. Use its base-game planet descriptions and key list
to choose where to investigate in the Atari ST Working Authority. No capture,
workspace, parent, placement or access rule is established by this note.

## Evidence and current coverage

Directly recounting [arrival-poses.json](../../payload/damocles/arrival-poses.json)
gives **19 on-foot poses across 15 physical bodies**. Fifteen of the thirty
physical bodies remain unposed; VOID is excluded. Running
`python3 research/damocles-st/scripts/location-ledger.py ledger` against
[catalogue.json](../../payload/damocles/catalogue.json) confirms the resident
counts below. All eight priority bodies have **zero recovered interior
placements**, no recovered surface workspace and no arrival pose. Their 25
resident records include 24 takeable objects; THALIA's BULLET is not takeable.
See the [coverage ledger](damocles-gamma-system-location-ledger.md) and
[resident association decoding](damocles-resident-objects.md).

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
following section are independently extracted payload facts. All tasks remain
open; arriving on foot and resolving interior placement are separate tasks.
The guide labels all eight destinations airless; its ACME Universal Suit lead
is the trading post at `09/14` on Dion Birmingham Island. Treat environmental
protection and keyed access as route-planning leads to verify, not newly
recovered prerequisites.

| Capture task | Approximate planetary destination | Local cells, floors, contents and access leads |
| --- | --- | --- |
| [ ] ICARUS | Mining complex `~152/417` | HQ `02/01`: Red Herring; floor and entry restriction unspecified. |
| [ ] ATROPOS | City `~009/304` | Spaceport `02/02`; bank `01/02`; GUM store `01/01`, floor 1: Shopping Bag; radar `02/01`; open area `00/01`: Black Beacon. |
| [ ] CRONUS | Mercenary I museum `~626/463` | `05/05`: Museum Guide and Black Beacon. Exhibits: Sprintcar `05/03`, Dart `03/01`, Mechanoid `01/01`, Eagle 8 SE (“Cheese”) `01/03`, Hexapod `03/05`. Floors/access unspecified. |
| [ ] CYCLOPES | IDI camp `~851/602` | Palace of Fun `02/02`: Amplifier; floor unspecified. Lottery ticket lead: Clotho New Town, Lloyds building `01/00`, floor 2. A lottery condition is not evidence of an arrival restriction. |
| [ ] SOLON | Penn School of Literature `~969/590` | Penn College `01/01`: Blue Beacon and underground maze. Nesbitt Library: Table, Stool, Bookcase, Gold; library floor and route through maze unspecified. |
| [ ] THALIA | Military base `~487/042` | Spaceport `06/03`: Red Beacon and Bullet. Bullet key lead: Pan Hades administration `04/01`, floor 1; this is a craft-access lead, not a requirement to stand at the spaceport. |
| [ ] TOLOSA | Currency repository `~667/633` | Outside `01/00`: Blue Beacon. Repository `02/01`: four Gold objects; floor unspecified, Door Key H required according to guide. Guide warns of a defending drone. Key H lead: Midas, guide coordinates `220:345` (also printed `70-03-77-31`); conversion between those notations is unresolved here. |
| [ ] PERSEUS | Alkane base `~940/456` | Emergency facilities `04/01` and `04/06`, basement: one Bed and Life Support in each. Research lab `05/02`: Battery and Davy Jones' Locker; floor unspecified. |

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

For each unchecked body: navigate using the leads, capture a reachable on-foot
pose, decode and validate it with the existing pose tooling, then recover the
workspace and any structures/regions needed by the intended delivery. Record
mismatches rather than replacing observed values with the guide's values.

Lower-priority unposed bodies are **DIALIS, LACHESIS, AURORA, TRITON, JUNO,
JASON and SAPPHIRE**: none has a resident in the first-world census. This says
nothing about landability. DAMOCLES also has no residents but already has a
pose. Keep #326 open for remaining coverage.

Gate each implementation delivery on its admitted bodies' validated poses and
its required geometry, associations, placement and behavior evidence. Unrelated
bodies' missing captures need not block that delivery. This does not change
[ADR 0046](../adr/0046-switch-damocles-bodies-within-one-gameplay-session.md).

The guide also contains mission-disk walkthroughs, platform observations and
MDDClone-specific advice. None is used to establish the checklist's base-game
runtime facts. In particular, later mission-disk references to transporter 5 on
Thalia do not replace the base-game guide's transporter 5 on Eris. Guide-only
names, keys and routes still require Working-Authority verification.
