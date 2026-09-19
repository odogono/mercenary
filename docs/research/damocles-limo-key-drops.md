# Damocles limo-key drops: placement and visibility evidence

Working-Authority Evidence for [#312](https://github.com/odogono/mercenary/issues/312),
recovered 2026-09-17. This note extends the [pickup research](damocles-limo-key-pickup.md).
Static recovery is not an ordinary-route observation. Expanded location coverage remains a
separate requirement.

[#300](https://github.com/odogono/mercenary/issues/300)'s **implementation boundary** is
[the limo-key interaction contract](../design/damocles-limo-key-interaction.md), not this
ledger. Uncovered rows below stay named exclusions; they do not reopen this ticket and they
do not authorise a silent Spaceport-only drop rule.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery,
not translation of machine code into application code. Raw RAM, native listings, screenshots and
experimental probe results remain ignored under `research/damocles-st/work/`.

## Evidence identity and available runtime

The pinned first-world RAM is
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`.
Static recovery used Capstone M68K 68000 decoding in the laboratory virtual environment.
`research/damocles-st/lab doctor` passed on 2026-09-17: ST with 1 MiB, Hatari 2.6.1,
Python 3.13.15, and the STX/TOS identities in
[`working-authority.json`](../../research/damocles-st/config/working-authority.json).
The runtime and pinned checkpoint are available locally; missing evidence is not an unavailable
emulator or missing-ROM problem.

## Direct placement and support placement are different paths

The native drop handler `$054520`–`$054743` has a direct placement path and a nearby-support
path. Neither is specified merely by the player being inside a building.

**Direct placement**, statically recovered at `$0546CC`–`$05471C`, writes:

| Resident field | Source |
| --- | --- |
| X, Z | Player `$7AB2`, `$7ABA` |
| Y | Player `$7AB6` minus 63 source units |
| Body byte | `$7AC9` |
| Level byte | `$7AC5` |
| Structure-group byte | `$794F` |
| Association A final byte | `$7A39` |
| Cell byte | `$7B5D` |
| Insertion group | Current region byte `$7AFD` if `$7AAE=1` and bit 6 of byte `$7B34` is clear; otherwise zero |

The bit test is expressed as `btst #14` on a byte address in native code: its tested bit is
6 of that byte, corresponding to bit 14 of the word. Group zero is the surface association
form. Interior direct placement first searches the association-list root `$7B0E` for a group
whose selector equals the current region; absence refuses through system-string index 9.
This is evidence that a region number is used to *choose* the drop's insertion group, not that
an insertion group is synonymous with one visible region.

[#316](damocles-carry-capacity.md#the-drop-handler-which-side-of-the-rank-comparison-is-which) settles
the two sides of the rank comparison and adds the `DOOR KEY A` bypass that skips it entirely.

**Support placement** is entered when a selected resident exists within distance exponent 6
(distance below 128 source units), except slot 74. The dropped key's handling byte requires
support rank at least 1. The selected support's own rank is its low two handling bits, while
the dropped object's requirement is bits 2–3. The support's maximum model Y plus resident Y
must not exceed player Y. On acceptance, the key inherits support X/Z, that computed top Y,
all of support Association B, and support Association A bytes 1 and 3. The object's own model
and handling identity remain its own. Unsupported model forms and insufficient support rank
refuse through system-string index 9. These facts are instruction-derived; no new support-drop
runtime claim is made here.

The direct path additionally requires `$7ACA != 0` unless resident slot 0 has its carried bit
set. Static movement recovery identifies it as ground/support contact: ground-clamped eye Y 63
and accepted support both set it to 63, while failed support clears it and on-foot movement
applies falling. The observed room and exterior drops have contact 63. Unsupported/falling
drop refusal is instruction-derived and still needs an ordinary-route observation.

## Why insertion group 12 becomes 1

The Spaceport association-list root `$014AAC` has group 1 and group 12. Both contain authored
pairs for regions 2, 3, 4, 5, 9, 10, 11 and 12; group 12 additionally contains region 1 with
insertion key `$18`.

There is an important implicit pair in the builder `$052D24`–`$052D34`: before copying the
explicit pairs it emits the resident slot followed by **its insertion-group selector and zero**.
The queue assembler `$05A3DE`–`$05A432` consumes those latter two bytes as an ordinary
region/insertion-key pair. Therefore every group also supplies its own numbered region with
insertion key zero, placing the resident before the plan queue terminator. The
[resident-object note](damocles-resident-objects.md)'s description of the emitted zero as a
sentinel is insufficient: it is an insertion key in this position.

Consequently a region-1 direct drop writes group 1, and the key remains drawable in region 1
via the implicit `(1,0)` pair. Its authored placement uses group 12 and reaches region 1 through
the explicit `(1,$18)` pair. The difference changes drawing order. Both also supply visibility
in the other listed regions. Preserve the association-list semantics; a `placed.region ===
currentRegion` visibility rule loses recovered behaviour.

Duplicate region pairs are possible: group 12 has both implicit `(12,0)` and explicit `(12,8)`.
The queue assembler collects each matching pair, rather than deduplicating by resident identity.
A port must distinguish this recovered drawing-order fact from an authored decision to draw
one object once. A duplicate drawing entry does not create a second Object Residence.

## State and effects ordering

After all refusal checks pass, the handler decrements the Carried Stack count, updates the
panel list, clears the dropped object's carried bit, refreshes carry-dependent state, handles
special object state, updates movement-related state, calls the guarded sound-request helper, writes placement,
refreshes applicable local geometry, rebuilds the structure queue when on foot, and rebuilds
the surface resident list. The support and direct branches call the same sound helper.
The update routines can have additional special-object behaviour outside this key-only scope;
no claim of complete general-object recovery is made.

A drop does not re-arm trigger 2. Re-pick still uses nearest *drawn* object selection and its
separate take range below 512 source units; taking the key again does not restart the one-shot
response. These are already observed in the pinned region-1 post-response trace.

## Existing observations and remaining route requirements

The [pickup note](damocles-limo-key-pickup.md#proximity-repeats-drop-and-re-pick) supplies ordinary
region-1 drop and re-pick after completion, including Association B `$2C0C0087` to `$2C010087`.
It does not by itself establish surface drop, other structure regions, leaving/revisiting, or
drop during the initial response. A whole-machine save mid-response is an emulator observation,
not proof of the port's Save Snapshot or Session Resume implementation.

For every newly covered ordinary route, record actual region flags, structure/group/cell and
body selectors, player and key XYZ, selection and range, panel scroll state, `$7ACA`, carried
count, trigger 2 and script state. Confirm the take landed before interpreting a later drop.
A failed host-timed walk is not a refusal observation. Mechanical reversal of timed joystick
segments is only a route candidate until sampled positions establish that it returned outside.

The port persistence requirements are derived acceptance tests, not emulator observations:
save and restore before and after take/drop/re-pick; retain the same residence when leaving and
revisiting its cell or structure; retain residence in an unbound structure; retain Carried Stack
order, one-shot trigger, execution and display state; and resume the deterministic next transition
without duplicate effects. Surface and support/interior residence must retain enough source
association and drawing-order information to reproduce their distinct candidate sets.

## Initial-response drop and re-pick

A new ordinary route run, `limo-key-midresponse-drop-20260917T164605Z-438bd822`,
replayed the pinned pickup route, took at offset 0, dropped at 3 and re-took at 6 seconds.
Its `result.json` SHA-256 is
`dc37149443a141e9247fcfb6d5443b47f8c76418f6f60c4099a5cfad943c4f5e`.
The ignored wrapper `work/drop312-midresponse.py` has its hash recorded as `extensionSha256`
in that result; the tracked pickup probe's `midresponse-drop` case preserves the case inputs.
The following observations were sampled from that run:

- At offsets 1.4 and 2.5 seconds the key was carried.
- At 4.4 and 5.5 it was dropped, Association A `$00120404`, B `$2C010087`,
  X `$00478121`, Y 0 and Z `$008888C7`. Player Y was 63, agreeing with direct placement.
- From 7.4 it was carried again. The selected region remained 1 throughout.
- Trigger 2 stayed disarmed. The script continued through `$07045A`, `$070488`, `$0704BA`
  and `$0704C2`, returning to `$0703FC` at the 24-second sample. Drop and re-pick did not
  restart or cancel the initial response.

## Newly reachable prerequisites

The gate audit resolves `$04DDD0` as the inventory-label scroll counter. Its signed 16-step
movement converges to zero; take and drop both refuse while it is nonzero. A quick opposite
action after take/drop is therefore a reachable gate even with only one takeable object.
Message presentation itself is not that gate, as the mid-response trace demonstrates.

The `$7AA8=$78` exclusion names VOID (body-table index 30); Eris uses `$2C`, so ordinary
on-foot Eris routes do not reach it.

The monetary take check `$04E158` is conditional on the selected resident matching `$795C`,
not on the key's handling bits. The special drop branch for structure `$52`, region 9 credits
through `$04E13C` and records the dropped slot in `$795D`. Structure `$52` is
`structure-015eea`, placed on Eris at cells `$3C`, `$3D`, `$3E`, `$3F` and `$E8` (Trading Post).
Native region 9 is payload region index 8: flags `$8000`, local X 2420–2960,
Z 1020–1770. Its flags permit the trade branch. The `$C000` exterior region at payload index 9
is native region 10 and must not be confused with this region. Ordinary access through the
structure's entrance topology still needs verification. The key's handling byte does **not**
exclude the monetary take check; sale/drop/re-pick and economy-state recovery remain open.
The credit and buyback-slot assignment happen **before** the later support/placement checks,
so a refused trade drop cannot be assumed to leave all state unchanged.
These are instruction-derived findings, not claims that a sale was reproduced in this run.

## Surface drop and re-pick after walking out

The ordinary run `limo-key-reverse-surface-20260917T164644Z-746afe1f` took the key in region 1,
waited for the response, then replayed the pickup route's movement segments in reverse order
with forward/back and left/right joystick directions exchanged. This retraced a usable exit:
sampled selected regions changed from 1 (`$8000`) through 3 (`$C000`) to 11 (`$C000`).
It then dropped and re-picked on the exterior surface while the Spaceport remained bound.
This covers a bound structure's exterior surface, **not** leaving the cell or unbinding it.

| State | Before drop | After drop | After re-pick |
| --- | --- | --- | --- |
| Carried count | 1 | 0 | 1 |
| Key Association A | `$00318404` | `$00120400` | `$00318400` |
| Key Association B | `$78010010` | `$2C000087` | `$78010010` |
| Selected resident | 7 | 183 | 7 |
| Selection exponent | 10 | 5 | 10 |

Player X/Y/Z remained `$0047714B`, 63, `$00886648` over these samples; the dropped key's Y was
0. `$7ACA` was 63, `$7AAE` was 1 and body selector `$7AA8` was `$2C`. The surface association
has insertion group zero despite a still-bound Spaceport structure. Association A's final byte
changed from 4 to 0; restoring the original association record on re-pick would be incorrect.
The selected key at exponent 5 is below the take threshold, and the re-pick succeeded.

`result.json` SHA-256:
`675247ca573827d45ea3dde1d7f718d59d95638d1c946c30d907721544941fbc`.
Ignored wrapper `work/drop312/reverse.py` SHA-256:
`147b8eb7c11d116d2e64903826f3f46a6d31c62d3bcd0948f5922d0efc976839`.
The result records every injected input, sample-window hash, source-route hash and toolchain.
The wrapper hash is separate because the base probe's recorded hash does not identify an
importing wrapper's additional case. Joystick softcopy writes supply movement input; no object,
player-position, association or script-state field was injected.

## Guarded sound helper and static range identities

Both accepted placement branches call `$054848`: the support branch at `$0546A4` and direct
branch at `$0546CC`. It returns without requesting sound when `$7A0C != 0`; otherwise it writes
`$7A78=3` and sound callback `$04BF54=$04C556`. This is a statically recovered **guarded sound
request**, not observed audible output. The laboratory runs with sound off, and the samples
do not establish the guard's value at the exact drop instruction. The contract cannot claim
that drop inherently has no effect.

All following SHA-256 ranges are half-open in the pinned first-world RAM:

| Range | SHA-256 |
| --- | --- |
| `$054520`–`$054744` drop handler | `32ff685b20f7b7a98476499f89b540abbef26150df2adfb297e2016e631d8f5e` |
| `$052CDC`–`$052D42` association builder | `46158686e82a668f4d36e137a94341b10ac6d4f76a88959a695ecca1bb12720d` |
| `$05A3DE`–`$05A438` queue assembly prefix | `477e2fb4c762cb07b1a02e358ce69cd3d49312997a382b97d047c7787cd346be` |
| `$014AAC`–`$014AD2` Spaceport association lists | `5818597c77c16f81ef19c27e0f2c87eeabd41b00f269bb20092e3727956090d9` |
| `$054848`–`$054860` guarded sound request prefix | `fc6ef4d4fd3878da9f0f9f445a540be32cd89cf2bc443de4a1c558978c579475` |

The existing payload carries per-instance authored association pairs, not all insertion groups
needed for a moved key's destination. Extraction of parent association-list groups, including
the implicit own-region pair, is a prerequisite to faithful drawing after arbitrary interior
placement. The original key's authored region insertions cannot serve as its mutable visibility.

## Playable location coverage and open blockers

The current 16×16 Eris workspace has 180 cells without a structure and 76 structure cells:
57 selected structures and 19 intentional-empty `structure-01a618` placements, which the port
leaves unbound. Across the selected structures there are 1,058 region entries: 958 with no
entrance gate, 91 with an attachment latch and nine with a passage gate. The whole-body payload
also contains a distant out-of-grid placement; this census does not silently treat it as an
ordinary playable route. Region counts are catalogue/code topology, not 1,058 runtime samples.

Ordinary runtime coverage establishes Capital Spaceport region-1 direct placement during and
after the initial response, interior residence retained after exiting the room, exterior surface
drop/re-pick, and surface residence retained across leaving the cell, returning and re-picking.
It does not yet cover no-structure cells, intentional-empty unbound placements, a bound
structure's unmatched region, other supported interior groups/levels, support placement,
other missing-group refusals or passage placement. The later doorway trace observes the
Spaceport attachment-region refusal. The surface-cell trace below closes
leaving the cell, returning and re-picking; the interior return route remains incomplete.
All are explicit coverage gaps rather than permission to restrict drop to Spaceport.

The body/parent residence and source drawing-list rules can be specified from the recovered
paths, but arbitrary-destination group extraction, route evidence and validation remain
prerequisites. This note does not mark #312 complete or #300 unblocked.

The inventory-label gate is instruction-derived at `$04DD36` (take writes −16), `$04DC68`
(sole-object drop writes +16), `$051E3E` (VBL dispatch) and `$04DDE2`–`$04DE81` (one-character
step toward zero). Sixteen VBLs are 0.32 seconds at the recovered 50 Hz PAL rate. Existing
spaced samples all see zero; they do not observe the brief refusal window itself.

Additional SHA-256 source ranges, **inclusive**:

| Range | SHA-256 |
| --- | --- |
| `$04DC40`–`$04DD8F` inventory/panel setup | `38b6d2e4fc22af452eff273d943d65149f4f8820e8aee1bc9be8912eb673c877` |
| `$04E05A`–`$04E17D` price/add/subtract | `eb977e835d0a228a83fde200d0c9744c9dcc695b7aefee5d1873c176fb36726e` |
| `$04DDE2`–`$04DE81` inventory scroll | `a134b9232705f74c66788920f51cf326752fea83e97d17d70e5c30ec1be1071c` |
| `$051E3A`–`$051E49` VBL panel step | `0efdc386d9bfeb85213e74f6b53b93fcfae851074dfd0b4c2dc36ea175097b32` |

Association A byte 3 also belongs to mutable placement state: the direct path copies `$7A39`,
while support placement copies the support's byte. The surface trace observes 4→0, and the
[selection note](damocles-object-selection.md) establishes that class 4 affects drawing priority.
Retain its value across save/restore rather than silently restoring the authored value or
assuming every interior is 4.

**Superseded in part.** This note recorded that a complete derivation of the class from
residence is not recovered. [The placement class note](damocles-placement-class.md) derives
it: `$7A39` is the 3×3 zone of the intra-cell position against the bound structure's extent
rectangle, computed at `$059076`, and the 4→0 this trace observes is the player leaving
Capital Spaceport's rectangle. What remains unrecovered is the static source of that
rectangle, not the rule that reads it.

Contact-state source ranges, inclusive, in the same pinned RAM:

| Range | SHA-256 |
| --- | --- |
| `$0582AA`–`$05832B` vertical contact update | `2ea45e8c312d477f5865e032057b525c88f8912ce6716d0f623beb32dbfb6f54` |
| `$0583EA`–`$05843B` support rectangle search | `aed65361dbe13fb59d29acdd4c97737ad5634f0d2530a6c1b428a1daa803b82f` |
| `$057DE6`–`$057DFD` on-foot unsupported fall | `9fa1f3e044d1e09e2af92fbc7d979d199e3c0340a37b971001ceed22db6cf45c` |

## Surface residence survives leaving the cell and returning

`limo-key-surface-leave-return-20260917T165006Z-e591f6f8` successfully extends the exterior
route. After the surface drop it holds backward movement for 100 seconds, pauses for three,
then holds forward for 100 seconds and attempts re-pick. These are ordinary movement inputs,
not position injection. The route's actual sample states establish the result:

| Checkpoint | Player cell / region | Key residence | Selection |
| --- | --- | --- | --- |
| Surface drop | `$87` / 11 | X `$0047748E`, Y 0, Z `$0088658B`, B `$2C000087` | slot 183, exponent 5 |
| Away | `$77` / 1 | Same X/Y/Z and association | another resident |
| Returning | `$87` / 1 | Same X/Y/Z and association | slot 183, exponent 14 |
| Back beside key | `$87` / 11 | Same X/Y/Z and association | slot 183, exponent 7 |
| Re-pick | `$87` / 11 | Carried, B `$78010010`, count 1 | another resident |

At the away checkpoint player X/Z were `$0047E946`/`$0087C9EB`; back beside the key they were
`$0047742E`/`$0088660B`. The small route drift remained inside take range. Region flags at
these surface checkpoints were `$C000`. This establishes persistence across leaving Spaceport's
cell, occupying another cell, returning and re-picking. It does not establish a port Save/Resume
round-trip, and does not establish dropping in the destination cell.

`result.json` SHA-256:
`3e3b8eb3b4a38b673e07e77d82de2eb2e6e4b327f941c3724524e7a2080a410e`.
Ignored wrapper `work/drop312/leave-return.py` SHA-256:
`a56a73b1a7b6f38663fbc1e8599d25f92db83cdc243bce79b0a85e793b5054c0`.
The result records the full input timeline and sample hashes.

## Interior exit observation and unsuccessful return route

`limo-key-interior-leave-return-20260917T165539Z-1ac2f94e` took and dropped in region 1,
then reversed the movement route to exterior region 11. The dropped key retained X `$004780C9`,
Y 0, Z `$0088882F`, B `$2C010087` throughout the exit. Its region-1 post-drop selection was
slot 183 at exponent 5. This is an ordinary observation that an interior key survives leaving
its room.

The attempted forward replay drifted to exterior region 6, ending at player X/Z
`$00478526`/`$00888905`. It did not return to the room or select the key, and re-pick did not
occur. Record this as an unsuccessful return route, **not** a refused in-range take or a key
that disappeared. Interior return/re-pick after leaving remains a coverage gap.

`result.json` SHA-256:
`674738368fb1719e1eee559f71e9502336883e001a3d8e362609e8dcddc68149`.
Ignored wrapper `work/drop312/interior-leave-return.py` SHA-256:
`2312a87a8162dab8282f69f4496e5751c006500fa0fade7c1b9e8caa9302f10f`.

## Trading Post association prerequisite

The pinned source's structure `structure-015eea` association-list root is `$016574`.
The ordinary association decoder confirms group 9 exists. Its explicit region/insertion pairs
are `(6,25), (7,24), (8,24), (10,44), (11,44), (12,44), (15,43), (17,43), (18,43),
(19,44), (20,44), (23,44), (24,44), (34,24)`; the builder adds implicit `(9,0)`.
Thus the initial missing-group refusal does not by itself exclude native region 9's trade path.
The 256-byte bounded source window `$016574`–`$016673` has SHA-256
`0fc1e41f000187ff90a90d73b860c9bcc4f927a20848273fd4874f9ca6067ac2`.
The root was located by walking the existing region parser with palette-only dummy values and
its geometry-reference validation relaxed for this research inspection; the association bytes
were then read by the unchanged `decode_structure_associations`. This is static source evidence,
not a captured native visit.

A separate port probe walks through two proximity-opened attachments to payload region index 8
(native region 9), preserving attachment state while steering heading through Save Snapshot
restores. Its route is local `(2100,-800) → (2100,500) → (2100,1100) → (1600,1100) →
(1600,1650) → (1700,1800) → (1700,2100) → (2700,2100) → (2700,1650)`.
This establishes current port accessibility, not ordinary native trading behaviour or a browser
input replay. Ignored script `work/issue-312-port-coverage/trading-post-route.ts` SHA-256
`cd7c086d809ab6a75ab8f8a0b096fd0685547474991d6717d652ca7475770467`, output
`trading-post-route.jsonl` SHA-256
`8e200f503fed543938fda2732516fd08fc1a4e0cbf80950d7593f5300a62c1c3`.

## Full supported-model insertion-group census

A static scan covers all 36 distinct selector structure models among the supported Eris
surface placements. It checks each decoded selector against the payload region descriptors,
then reads the association groups after the zero region terminator. Counts below are distinct
model descriptors, not weighted by repeated placements and not ordinary-playback visits.
Native region numbers are one-based; port indices are zero-based.

| Region class | Matching drop group exists | Matching group absent |
| --- | ---: | ---: |
| Ordinary interior | 144 | 19 |
| Interior with attachment gate | 0 | 53 |
| Passage | 2 | 2 |
| Exterior, which bypasses the group check | 0 | 393 |

Every scanned interior attachment descriptor lacks its own numbered drop group. Opening its
movement latch does not change that lookup: dropping while standing within that descriptor
refuses through system-string index 9. Exterior attachment descriptors have bit 14 set and
bypass the lookup; do not confuse an attachment gate with an interior-only classification.
Two passage descriptors pass and two fail, so a blanket passage permission is also incorrect.
The 19 ordinary-interior omissions show why interior residence alone cannot imply permission.
Existence passes only this gate; contact, nearby support, panel scroll and trade checks remain.

The missing ordinary-interior groups, using **native** region numbers, occur in models:
`structure-00fc52` (1), `structure-00feb4` (1), `structure-010188` (4,6,9,26),
`structure-011ada` (1), `structure-0127f0` (1), `structure-014ad2` (4,5),
`structure-015eea` (5), `structure-01a648` (1), `structure-01a66c` (1),
`structure-01a6a2` (1), `structure-01a6c0` (1), `structure-01baa6` (1),
`structure-01c508` (3), `structure-01dea8` (5), `structure-01decc` (5).
Missing passage groups are native region 2 in `structure-010152` and `structure-010176`.
These identify source-defined candidates for ordinary routes; they do not establish that every
listed region is reachable in the original.

`structure-01832e` group 19 repeats explicit region 14. The existing dictionary decoder rejects
that record, so the audit uses a bounded pair-preserving scan there. This does not affect group
membership counts, but confirms that production extraction must preserve ordered duplicate
pairs rather than convert them silently to a dictionary.

Ignored `work/drop312/insertion-audit.py` SHA-256:
`d011f682b2ef5f8cc0622b15319ea429e6b756b53a5bb3869f2d9ca91f7149de`;
`insertion-audit.json` SHA-256:
`47439cd574b8d79bededff9ffcb682b521115b7dbf7fc97ce7b68d0db5a25ea6`.
The JSON records each model's source root/end and source-range hash, cell placements, region
flags and group membership. Reproduce from the repository root with the laboratory virtual
environment's Python and the ignored audit script; it reads pinned RAM and performs no guest writes.

Independent tracked-probe repetitions also succeeded:

| Case / run | `result.json` SHA-256 |
| --- | --- |
| `midresponse-drop`, `limo-key-midresponse-drop-20260917T164944Z-981fa8b6` | `c453ef607591623ebf61c06536691bb4c6fb63898404c0b94ea97c5711912aff` |
| `reverse-surface`, `limo-key-reverse-surface-20260917T165427Z-0aa999b9` | `391a709f368c47845910bfde3fa8065a272036eacbb4ffdf46f13cf6645d400a` |

The tracked `surface-leave-return` case retains the successful wrapper's input recipe. Its
existence makes the route reproducible; it does not imply an additional runtime result beyond
the hashed run recorded above.

## General-object generalisation

[#315's object drop research](damocles-object-drops.md) resolves the rank comparison
this note describes: the dropped object's bits 2-3 are the rank it *requires* and the
selected object's bits 0-1 are the rank it *supplies*, and the nearby-support branch is
entered for any drawn resident inside exponent 6, with no fallback to direct placement.
It also observes the inventory-label scroll refusal this note lists as unobserved, and
records why the remaining support and multi-object cases have no reachable ordinary
route.

## Coverage decision for #312

| Location/transition class | Ordinary runtime evidence | Static recovery / remaining gap |
| --- | --- | --- |
| Spaceport region 1 take/drop/re-pick after response | Established by prior pickup traces | Placement and insertion changes explained |
| Same room during response | Two successful runs | Response remains one-shot and continuous |
| Interior key left while player exits room | Key residence retained | Return route drifted; successful return/re-pick still needed |
| Bound-structure exterior surface drop/re-pick | Two successful runs | Group zero and mutable draw class observed |
| Surface key left across cell transition and return | Successful return/re-pick | Port persistence round-trips remain requirements |
| No-structure cell or intentional-empty unbound structure | Not observed | Native placement path recovered; destination route needed |
| Other interior groups/levels; bound unmatched region | Not observed | Model-wide source-group census only |
| Interior attachment region | Spaceport region-2 missing-group refusal observed | Other attachment regions have source census only |
| Passage | Not observed | Source census proves differing group permissions |
| Nearby-support placement; unsupported/falling refusal | Not observed | Rank, height and contact gates recovered |
| Inventory-label scrolling refusal | Not observed | Reachable 16-VBL guard recovered |
| Trading Post native region 9 | Port route only | Native flags/group permit trade; sale/buyback behaviour needs native replay |

The remaining blockers are concrete: reproducible ordinary routes for the uncovered location
classes and refusals; a successful interior return/re-pick; native trading credit/buyback and
possible post-credit refusal ordering; support/falling and panel-scroll cases; extraction of
ordered destination insertion groups including duplicates; and final validated persistence of
residence, placement class and newly reachable host state. #312 remains incomplete and #300
remains blocked. No missing observation is replaced by a Spaceport-only drop restriction.

## Ordinary doorway refusal observed

`limo-key-door-refusal-20260917T170549Z-594796f2` successfully stops the reverse route in
Spaceport native region 2. After the response completed, an observational breakpoint watched
`($7AFC).w = 2`; its callback zeroed only the joystick movement input and captured a low-memory
window. Remaining scheduled movement inputs were suppressed, and the probe then supplied the
ordinary drop key. No player position, carried state, association, region or script state was
injected. This is an ordinary gameplay refusal with a debugger-controlled input stop.

At offset 58.952, before drop, the player was in region 2, flags `$83FC`, X/Z
`$00478293`/`$0088831F`, carried count 1, script idle and message gate zero. At offsets 61.352
and 63.952 after drop, the same region/position and carried key remained; Association B stayed
`$78010010`. The message gate was `$FFFF` and message pointer `$072EEE`, while script PC
remained `$0703FC`. Selection was another object at exponent 11, excluding the nearby-support
branch. The source group census has no group 2 for Spaceport, so this matches the native
missing-group refusal at `$05455C` and system-string index 9. That string's source record starts
at `$072EBE`; the sampled pointer is 48 bytes into it after display consumption, rather than a
new script dispatch. The note makes no quoted-text or audible-output claim.

The log contains transient FIFO errors, but the completed run has all five decoded sample
windows and the breakpoint callback capture. An intermediate inspection before completion had
not yet seen those files; missing files at that earlier instant were not a failed refusal result.

`result.json` SHA-256:
`4978677283db8d68bd42d5da1bf4b29fa1f505db94fb46bc8ae2cae134820890`;
ignored wrapper `work/drop312/door-refusal.py` SHA-256:
`109eb77c36c2ae69713cc7e738a33330a9664983179e0ac615202c8dd74eedc8`;
callback `door-at-region.bin` SHA-256:
`5c1f7b05f612e57c23e9fbc5d8b3b25375f0c61fcae26ab8a241b01658b549d2`.

Reproduction recipe: use the tracked reverse-surface movement timeline, but arm the breakpoint
immediately after the carried post-response sample at offset 23 seconds. In a **fresh unique run
directory**, write a debugger callback containing `w $<JOYSTICK1_SOFTCOPY> 00`,
`savebin <run>/door-at-region.bin $6000 $2000`, and `c`, substituting the laboratory's existing
`JOYSTICK1_SOFTCOPY` constant. Arm it with
`b ($7afc).w = $2 :once :quiet :file <callback>`. Once that capture exists, replace subsequent
scheduled joystick writes with zero. Keep the reverse-surface drop input at offset 59.952 and
sample at 58.952, 61.352 and 63.952 seconds (offsets from the take anchor). Omit the subsequent
re-pick. Record the callback, inputs and sample hashes. A stale capture must never be reused as
the stop condition: this experimental wrapper was run once with its capture absent; a rerun must
use an isolated path rather than silently treating an earlier capture as a new region arrival.
