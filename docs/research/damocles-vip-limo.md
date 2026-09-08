# Damocles V.I.P. limo

Working-Authority Evidence for the reusable V.I.P. limo model, its initial Eris
surface instance, its residence changes while boarded, and its relationship to
`KEY- V.I.P. LIMO` in the pinned Atari ST Working Authority.

Authoritative Evidence remains bound to the C64 Reference Build. Findings here
are Working-Authority Evidence only. They extend the catalogue research and do
not establish playable Damocles behaviour in the browser.

## Working Authority and evidence

| Item                    | Value                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Program                 | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx`                                                                                     |
| Program SHA-256         | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`                                                                                   |
| First-world RAM         | `research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`                                                               |
| First-world RAM SHA-256 | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`                                                                                   |
| Fresh on-foot RAM       | `research/damocles-st/work/occ-onfoot-20260818T184106Z-bccaa487/observed.ram` (`8acceaabcfccb3191bfb97f7dddad301ba8a4562c5d1f43b2e057842772dad04`)   |
| Boarded RAM             | `research/damocles-st/work/occ-boarded-20260818T184116Z-6ae44a13/observed.ram` (`5b6b5164ea5a7de0096693ebb3daddad7a0558a872ae05d1f65504f9de79ff9c`)  |
| Driving RAM             | `research/damocles-st/work/occ-driving-20260818T184125Z-4e1ce2ac/observed.ram` (`57df696d8b4812e0543cddcd94f6535f688f9f4d2159a4a40a2651283b9c987a`)  |
| Left-limo RAM           | `research/damocles-st/work/occ-left-20260818T185829Z-238e808e/observed.ram` (`bd608b2f0e49f146d68ead1c400ab2607e3899d2577e0553b5d0cb86e42159b8`)     |
| Left-limo snapshot      | `research/damocles-st/snapshots/left-limo.sav` (`5d0ac4653d9209e6426aac3e04a3fb6671dd13694030f3d977eb6eda1d990c1a`)                                  |
| No-key route            | `research/damocles-st/scenarios/limo-no-key-route.json`                                                                                              |
| No-key replay A         | `research/damocles-st/work/stick-replay-20260908T091435Z-ac090b95/observed.ram` (`a0fae448509dd7ba852fb6bb4ea286149e5ee23ad7f23aeb7958ed87f2307e90`) |
| No-key replay B         | `research/damocles-st/work/stick-replay-20260908T091435Z-add59acd/observed.ram` (`494b8d7198ffc5d2e42e249b3bca970768bec889aee5b573d512e3aa47042cd9`) |

The board/leave controls and four occupancy captures were first established in
[`damocles-walk-board-flight.md`](damocles-walk-board-flight.md). The Spaceport
origin and the key's independent pickup transition are established in
[`damocles-spaceport-interior.md`](damocles-spaceport-interior.md).

## Stable identity and model record

Object-table slot 5 at `$035714` contains relative pointer `$00000A76`, selecting
model address **`$036176`**. The 16 bytes immediately before it, at
`$036166..$036175`, contain the source label **`V.I.P. LIMO`**. The catalogue
identity `object-036176` therefore names source data; it is not a curated guess.

The record begins `$8001 $0040`, followed by geometry at `$03617A`. The neutral
model record decodes as:

- 32 signed big-endian X/Y/Z vertices, terminated by `$8000` at `$03623A`;
- the ordinary zero view-group word at `$03623C`;
- 31 filled polygons, terminated by the zero colour word ending at `$03630F`;
- local bounds X `-70..70`, Y `0..50`, Z `0..260`;
- every one of the 32 vertices referenced by at least one polygon.

The exact record range `$036176..$03630E` has SHA-256
`19bec768e2b96ec4c9fc89c9c13f07170ffda6ef83d8f58ddeb25a3c72fa9d19`.
The header parameter `$0040` is preserved as source evidence, but its full
orientation semantics are not yet decoded and must not be baked into the
reusable model.

### Colours and observed shape

The polygon stream uses four direct ST RGB words and one hardware-palette
reference:

| Source word | Recovered colour | Observed role                          |
| ----------: | ---------------- | -------------------------------------- |
|     `$0321` | `#664422`        | darkest brown body facets              |
|     `$0432` | `#886644`        | dark brown body facets                 |
|     `$0543` | `#AA8866`        | tan body facets                        |
|     `$0654` | `#CCAA88`        | light tan upper facets                 |
|     `$8000` | `#000000`        | hardware palette slot 0, black glazing |

These are direct record values; no scene-palette inference is needed for the
four browns. In the first-world capture, hardware slot 0 at `$06FD00` is
`$0000`, resolving `$8000` to black.

A bounded replay from `left-limo.sav` walks forward for 100 VBLs, settles for
15, then turns left for 150. The resulting source render is
`research/damocles-st/work/stick-replay-20260908T073248Z-baff7010/observed.png`
(SHA-256 `90d55867921eb31cdfc8eda4a6946e3d74892de57d25f59556b0a4f311f3ebd4`).
It shows the limo left of centre as a very low tan vehicle with a darker
faceted body, a raised light-tan cabin and black glazing. That silhouette and
colour zoning agree with the decoded model's long Z axis, shallow Y range,
raised vertices 20–31 and black faces 22, 25, 26 and 29. This is a shape and
colour comparison, not a claim of exact ST rasterisation.

## Initial surface placement

The resident arrays place slot 5 at:

| Field         |                   Address | First-world value |
| ------------- | ------------------------: | ----------------: |
| X             | `$0063BC` (`$63A8 + 5*4`) |       `$00478388` |
| Y             | `$0067BC` (`$67A8 + 5*4`) |       `$00000000` |
| Z             | `$006BBC` (`$6BA8 + 5*4`) |       `$0088796F` |
| Association A |                 `$006FBC` |       `$FF122002` |
| Association B |                 `$0073BC` |       `$2C000087` |
| Raw yaw byte  |   `$0079D2` (`$79CD + 5`) |             `$00` |

Association B's low byte places the object in Eris surface cell `$87`, the same
cell as the Capital Spaceport. The captured Eris grid origin is X `$00400000`,
Z `$00800000`, so the limo's initial position is
**(71.5137939453125, 0, 136.47434997558594)** in the catalogue's absolute
65,536-unit surface-grid coordinate system. Subtracting the captured grid origin
would yield `(7.5137939453125, 0, 8.474349975585938)`, but those origin-relative
values are not the catalogue coordinates.

The Spaceport origin is X `$00477CD6`, Z `$00888618`. Direct subtraction puts
the limo at **(1714, 0, -3241)** in the same raw local frame used for the
Spaceport assembly. This establishes proximity and a shared surface cell; it
does not make the limo part of Structure 74 or its Room.

The raw yaw byte at `$79D2` is `$00` in the first-world, fresh on-foot, boarded,
driving and left-limo captures. The model's long local axis is +Z, but the
absolute angular convention remains only partially decoded. The catalogue can
retain heading `0` because the coordinate-system label identifies it as the raw
ST angle byte; consumers must not present it as degrees or infer a cardinal
direction from it yet.

## Residence while boarding, driving and leaving

The four captures distinguish a reusable model, a resident surface instance,
and the player's temporary Occupancy:

| Pose          | Slot-5 association words  | Slot-5 coordinates                  | `$7A8E` / `$7A90` | Evidenced state                                                                     |
| ------------- | ------------------------- | ----------------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| Fresh on foot | `$FF122002` / `$2C000087` | X `$00478388`, Y `0`, Z `$0088796F` | `1` / `$FFFF`     | limo resident on surface in cell `$87`                                              |
| Boarded       | `$FF002002` / `$78000000` | unchanged                           | `0` / `5`         | surface residence removed; player occupies craft slot 5                             |
| Driving       | `$FF002002` / `$78000000` | unchanged                           | `0` / `5`         | occupied craft moves through player/craft workspace; resident coordinates are stale |
| Left          | `$FF122002` / `$2C000087` | X `$00478388`, Y `0`, Z `$00887B06` | `1` / `$FFFF`     | slot 5 restored to surface at the leave position                                    |

In the boarded capture, player X/Z at `$7A92`/`$7A9A` equal the limo's initial
X/Z. In the driving capture those player coordinates advance to `$0047830F` /
`$00887C2E` while the resident arrays remain unchanged. On leaving, the slot is
made resident again and its Z becomes `$00887B06`, the player's captured leave
position. Consequently the resident arrays are authoritative for a placed
instance only while the association words say it is resident; the occupied
craft's current transform must come from the Occupancy workspace.

## Relationship to `KEY- V.I.P. LIMO`

Three independent source facts connect the key to craft slot 5:

1. Vehicle slots 2, 3, 4, 5, 6, 10, 12 and 13 pair by name with key slots 180,
   181, 182, 183, 184, 188, 190 and 191. Every pair uses the same exact table
   relation: **key slot = vehicle slot + 178**. The V.I.P. pair is therefore
   craft slot 5 and resident key slot 183.
2. The source labels are `V.I.P. LIMO` at `$036166` and `KEY- V.I.P. LIMO` at
   `$03E484`. The key model's `$8008` header also carries source display code
   `VL`; this is supporting visual identity, not the basis of the pairing.
3. The recorded route acquires that key with Right Shift + Up and then boards
   with `B`. The result has `KEY- V.I.P. LIMO` plus pointer `$0003E484` in the
   inventory panel at `$04DDBC`, walk flag `$7A8E = 0`, and occupied craft
   `$7A90 = 5`. After `L`, the key and pointer remain in the inventory while
   `$7A8E`/`$7A90` return to on-foot values. The key is not consumed by
   boarding.

The tracked `limo-no-key-route.json` starts from the untouched
`eris-spaceport-onfoot.sav`, whose inventory is `EMPTY`, walks around the
building without entering the Room or taking its key, and presses `B` beside
resident slot 5. Two independent starts reproduce the same result. Both remain
on foot (`$7A8E/$7A90 = $0001/$FFFF`), leave the limo surface-resident
(`$6FBC/$73BC = $FF122002/$2C000087`), retain the empty inventory and visibly
display **`VEHICLE KEY REQUIRED`**. The two final positions differ because this
older replay helper schedules walking by host time, but each is within boarding
range and produces the same state transition and message.

The resident Script system string table independently contains that message in
slot 3: `$070006` contains relative offset `$2DC4`, selecting the string record
at `$072DC4` (text begins at `$072DD2` after padding). The successful keyed
capture and the two legal no-key captures therefore verify the V.I.P. limo key
requirement. The native branch implementing the comparison remains undecoded.

The key's pickup transition occurs before boarding and persists after leaving;
see the slot-183 values in
[`damocles-spaceport-interior.md`](damocles-spaceport-interior.md#pickup-removes-the-resident-placement).
The key is therefore a separate resident object associated with the limo, not
geometry or mutable state embedded in the vehicle model.

## Catalogue consequences and remaining unknowns

- `object-036176` is a fully decoded reusable model with one evidenced initial
  surface instance, resident slot 5.
- The initial instance belongs on the recovered Eris map in cell `$87` at the
  exact raw coordinates above. A post-leave position is mutable Session State,
  not a second authored placement.
- Boarding temporarily removes slot 5 from surface residence and selects craft
  slot 5 as Occupancy. A future playable implementation must not leave a second
  stationary limo at the initial coordinates while it is driven.
- The model's `$8001 $0040` header semantics and the absolute yaw convention
  remain unresolved. The recovered heading `0` is a raw ST angle byte, not a
  verified degree or cardinal heading.
- The source evidence connects key slot 183 to craft slot 5 and shows successful
  keyed boarding. Two untouched-checkpoint replays verify that the same craft
  refuses boarding without the key and emits `VEHICLE KEY REQUIRED`.
- The matching names and exact `+178` slot relation link the other seven
  recovered vehicle/key pairs in the catalogue. Their residences and individual
  no-key runtime paths remain unresolved.
