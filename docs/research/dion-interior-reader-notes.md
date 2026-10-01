# Dion interior reader evidence

Recovered for [#683](https://github.com/odogono/mercenary/issues/683) from **Mercenary III's pinned ST baseline**. This is a record-format study, not an instruction translation. Damocles data was not used. The [Catalogue contract](../dion-catalogue-contract.md) supplies the public identities; [the location census](dion-full-location-recovery.md) supplies the original group and resident references.

Primary evidence is `restricted/mercenary-iii-647/runs/location-census-334983y7/start.ram` (SHA-256 `cd697c802472a319fcd8fd5dd7193ad870cf4ff0a7f37cd6fda51893dd899fe4`), its `census-reader-disassembly.txt`, and the original execution probe `restricted/mercenary-iii-683/reader-probe/`. These ignored files remain Research Evidence. The [baseline configuration](../../research/mercenary-iii-st/config/baseline.json) pins the program, TOS and emulator. Addresses below refer to that image.

## Floor binding and presentation

The cell binder reads a nine-bit structure slot, selects its structure-table record, and tests the record's first word. A negative first word selects an alias: its low fifteen bits are floor pitch; signed bytes +2/+3 are X/Z scales; +4 is the common palette; +5 is the building detail; +6 starts the floor selectors. A direct record gets its scales, palette and detail from the eight preceding bytes. The opening bind selects alias floor 0. A zero common palette makes it take floor 0's palette from alias +18. Sources: original `$560B0..$5617E`; [existing title-local decoder](../../research/mercenary-iii-st/m3lab/geometry.py).

Changing floor selects the byte at floor-table + Floor and makes **one direct lookup** in the structure table. It does not revisit the alias discriminator, or replace the building's scale/detail with the selected floor record's preceding header. The original assembler consequently uses the building's existing scales with the selected plan. A negative record accidentally selected as a floor is not evidence for recursive alias support. Sources: `$56D98..$56E5E`, `$5AD30..$5AD56`.

The supported Floor indices are 0–10; Floor 0 displays G and Floor 10 displays B. A zero selector rejects that particular floor, rather than terminating the whole table. For example alias 27 has floors 0–2 and 10 separated by zero entries, and aliases 15/17/40 have floor 0 and basement 10. Arrival eye height is Floor × pitch + 63. If the common palette is zero, a floor change selects the parallel palette byte at alias +18+Floor; otherwise the common palette remains selected. Sources: `$56D1E..$56D7A`, `$56DB4..$56E06`; alias records `$0E51C`, `$0DFF8`, `$0E248`, `$0FE6E`; [floor census reader](../../research/mercenary-iii-st/m3lab/census_locations.py).

These are independent facts: a recovered selector is not proof of a usable lift or campaign access. The keyboard floor handler additionally requires indoor mode and bit `$2000` in the active region flags before attempting a floor selection. Source: `$5684C..$5688C`.

## Slot 46 is a compact ground-only alias

The structure table is rooted at `$0CF00`. Its slot-46 entry at `$0CFB8` selects `$1068E`; the next entry at `$0CFBC`, slot 47, selects `$10696`. Slot 46 therefore has **eight authored bytes before the next independently referenced alias**. They describe pitch 150, scale 1/1, palette 22, detail 2, selector 99 at Floor 0 and zero at Floor 1. The apparent later selectors in an eleven-byte census read come from slot 47's header and floor table. In particular 240, 252 and 9 are foreign alias-record bytes, rather than further authored floor geometry for slot 46. Source: table entries `$0CFB8..$0CFC0`, compact record `$1068E..$10696`, following alias `$10696`.

A first-zero rule would break real basement tables, so the justified boundary here is the **next referenced record**, together with the original region evidence. Slot 99's plan at `$1844A` has no vertices, walls, attachments or associations and one all-space region, flags `$C000`, with an empty queue. It has no lift region. The initial resident census has no indoor residents in group 14, the group whose cell `$88` selects slot 46. Sources: original `$1844A` record; [structure decoder](../../research/mercenary-iii-st/m3lab/geometry.py); [object census](../../research/mercenary-iii-st/m3lab/census_objects.py).

The fresh original execution probe confirms that interpretation:

1. Cold boot the pinned baseline and stop at main-loop `$5A41A`.
2. Set group 14 and disable MIDAS uniform mode; execute the original workspace builder `$4F0F2` until `$4F304`.
3. Select cell `$88` through the original binder `$5600C`, stopping at `$5619A`.
4. Execute the original assembler `$5AD2C` until `$5B2DE`, then its region selector at local X/Z zero until `$5B4A2`.
5. Execute the keyboard floor handler at `$5684C` with indoor mode, no alternate input mode, and the key for Floor 2; stop at `$5688C`.

The bound image has slot 99, pitch 150, scales 1/1 and floor-table pointer `$10694`. The assembled image has zero plan vertices and zero walls. The selected region has flags `$C000`. The keyboard attempt takes the non-lift exit without changing RAM: `region.ram` and `keyboard-refused.ram` both have SHA-256 `b6e213076a36f1d8c08601b91ddf72f76ac1a28c118d50915bd776dc34c9fe38`. Reproduce using the ignored `reader-probe/run.py`; it uses the existing pinned-input and Hatari-argument helpers, executes original readers, and saves all RAM under `restricted/`.

The former eleven-byte read is useful as an audit of the census, but its overread values should not become invented interiors. Slot 46's Floor 0 remains an ordinary binding to geometry 99 and detail 2. A debugger-forced lookup into slot 47's bytes would investigate invalid access, not reveal an authored upper floor of slot 46.

## Association hooks control draw ordering

An indoor resident's association byte selects an association record at the plan's association root `$71A6`. Each record consists of an association ID, pairs of **region ordinal and insertion queue token** (the region ordinal is nonzero), and a zero terminator; association ID zero ends the list. The first pair byte is the region, and the second is a byte from that region's authored drawing queue. These pairs are not X/Z offsets. Source: plan-end root publication `$5B2BE..$5B2C6`; consumers `$53C5E..$53CC4`, `$5B3A6..$5B3CA`, `$5B3E8..$5B3F8`.

The indoor reader matches resident cell, group, Floor and nonzero association against the selected plan, then writes an implicit `(association, 0)` hook for the own-region tail and copies the explicit hook pairs into a temporary list rooted at `$50F0`. It does not transform positions. The active-region consumer filters hooks by region ordinal, and the queue builder inserts each matching object immediately before the hook's insertion token. Object slots are scanned in descending order, so the authored hook plus original slot order determines ordering among residents at the same insertion point. Sources: `$53C7C..$53CBE`, `$5B3A6..$5B3F8`.

Resident placement is independently stored in the X/Y/Z tables, `$581C/$5C1C/$601C + 4 × slot`. The model drawing entry subtracts the scene-camera origin directly from those authored coordinates; it neither scales them with the host plan nor adds an association offset. Thus export the original position and the hook separately. A floor's eye height does not imply that its residents' Y values must be rewritten. Source: `$5464C..$54668`; [resident record decoder](../../research/mercenary-iii-st/m3lab/census_objects.py).

MIDAS's cell selection and repeated binding remain separate from these hooks. Its residents 101/118 need the original uniform workspace at field cell `$69`; the authored one-cell workspace cannot validate their hosts. Sources: `$4F2BC..$4F2D2`, `$55E90..$55EBC`, census `midas/group-56-uniform.ram`; [census evidence](dion-full-location-recovery.md#midas-repeats-its-structure).

## Interior details, attachments and lettering

The same building detail record has two independent view-selection groups. The binder assembles the first into `$A6CC` and the second into `$A88E`; the detail drawing entry uses the second indoors when the structure is valid and the region flags are negative. At exterior ground level it uses the first. A complete decoded record must preserve both groups and their default lists, rather than treating the second as trailing padding. Sources: `$54C54..$54D20`, `$54D24..$54D50`; [detail decoder](../../research/mercenary-iii-st/m3lab/geometry.py).

A floor change assembles its plan with the alias's inherited scale and detail, as described above. Attachment and wall-lettering records occur in that plan's stream; they therefore need recovery for each selected plan, including upper floors. The region queue names walls below `$96` and attachments from `$96` upward. Association insertion uses the original queue byte, not a converted wall/attachment index. Sources: `$5AE62..$5B2D2`, `$5B3E8..$5B40E`.

Wall text's offset word contains both an offset value and a scaling flag: the low bit selects whether the signed half-offset is multiplied by the absolute scale along the wall. The anchor's X/Z coordinates are scaled separately. Mirroring along the relevant axis reverses the horizontal glyph direction and offset. A consumer must preserve the encoded word and apply these rules, rather than multiplying every offset by the building scale. Sources: original lettering binder `$5AE76..$5AF10`; existing raw wall-text fields in [the decoder](../../research/mercenary-iii-st/m3lab/geometry.py).

Lettering tokens use the shared original token/glyph readers. Token text may be placement- or session-bound, so recovering the glyph record does not establish a universal literal inscription. Sources: `$54FA0..$5502E`, `$55188..$55204`; [MIII lettering study](mercenary-iii-taxi-lettering.md).

## Independent source slices

All ranges are half-open, hashed from the identified opening RAM. These narrower slices supplement the census's existing stable-reader ledger.

| Range | Fact | SHA-256 |
| --- | --- | --- |
| `$0CFB8..$0CFBC` | Slot 46 table entry | `b112d39c0e96ccc62934c96fe86800bc54cf620287ef1b91b622aaf35d13ebe7` |
| `$0CFBC..$0CFC0` | Following slot 47 entry | `d22098e8e920c94a22268dfeb60a507dd11130dfa70d92ad206be39234f72b3d` |
| `$1068E..$10696` | Compact alias | `95eef75b55937d40489830bed66cb5dbd52706cf1a8258428689839686e49ff3` |
| `$18442..$1846C` | Geometry 99 and preceding header | `3793ce7eca9e8d40163d11bbdbbc6dc30fb5b3efe1b911aba7e95fafdab5b126` |
| `$53C5E..$53CC4` | Indoor resident selection | `5172ad4af7ea90a5cf3e7d506a121ce84deac031063d6bc1bde8b278d8bf5e17` |
| `$5684C..$5688C` | Floor-key lift gate | `c6a88df44a8b9a79d7606fd8156a5668e1e5b049bfb8a349dc4a2a8ae683f88f` |
| `$5B3A6..$5B40E` | Region hooks and queue insertion | `3468c669f98c4e01e03ba03cd32b59207a04e3fcb7af2da4e1c1b3aa04428ebe` |
| `$5464C..$5466A` | Resident position translation | `63a123684fc79d73b50bc5d06af006489ec538911673e02f68d04727136bc0a4` |
| `$56D98..$56E5E` | Floor arrival and palette selection | `efbef10670d246b6b9fad1cd9814d53877dd609a99f6a8a3702eaed3bb9ff69a` |
| `$5AE76..$5AF10` | Wall lettering transform | `73ce7708e6d30ec026fee63937ce83655a0d6066a757076b99d0104b11fce67b` |

## Representative original scenes

The tracked [interior scene harness](../../research/mercenary-iii-st/m3lab/interior_scenes.py) executes the original `$5A006` object-destination path at its ordinary main-loop call boundary. It selects existing indoor residents without clearing their association or Floor. The eight resulting original screenshots and per-scene checks are indexed by ignored `restricted/mercenary-iii-683/scenes.json`.

| Scene | Resident / original host | Floor | Geometry slot | Scale | Palette | Detail |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| Prison attachment | 10 / METIS `3:62`, slot 132 | 0 | 132 | -3, -3 | 58 | 49 |
| Prison wall-lettering queue | 10 / same host, corridor camera | 0 | 132 | -3, -3 | 58 | 49 |
| Companies House | 30 / DION `2:03`, slot 203 | 4 | 58 | -2, -2 | 28 | 56 |
| Enterprise basement | 224 / TOLOSA `23:12`, slot 49 | 10 | 48 | -2, -3 | 50 | 51 |
| VELOS upper floor | 44 / ERIS `17:14`, slot 155 | 9 | 58 | 2, 2 | 66 | 56 |
| Mirrored upper floor | 226 / GAEA `15:68`, slot 154 | 9 | 58 | 2, -2 | 66 | 56 |
| Actual MIDAS resident | 101 / MIDAS `56:69`, slot 68 | 0 | 68 | 1, 1 | 37 | 42 |
| MIDAS displaced period | 101 / same periodic host, physical X +16 cells | 0 | 68 | 1, 1 | 37 | 42 |

Each scene matches original RAM against the recovered group, workspace cell, Floor, geometry lookup, host scale/detail, plan vertices/heights, palette bindings, full association hooks, eye coordinates and local coordinates. Original resident position tables are checked independently of the camera. The original PNGs are captured at the next main-loop top at VBL 7000, after the destination at VBL 6500. The prison corridor view moves only the camera at VBL 6600, by -2116 Z units, to activate region 3, whose drawing queue contains wall-lettering face 12. The ordinary prison view faces its closed attachment; its original resident metadata stays intact in both views.

The MIDAS displaced probe copies resident 101's indoor residence into the existing NULL-model pose slot 9 and adds sixteen physical X cells. The original selects workspace cell `$69` for both captures. Their physical Body cells are **2122, 3632** and **2138, 3632**, while both retain local coordinates **-244, 30, 297**, geometry 68, association 1, and identical recovered hooks. This distinguishes an actual world occurrence from its repeated workspace selector; it does not relocate the original resident 101.

At a displayed frame, `$70A4` is the active day/night palette pointer, rather than necessarily the selected day base. `$70A8` retains the day base and `$70AA` the alternative reached by the signed preceding offset. `$50B3A/$50B52` switches the low word at `$70A6`. Scene validation checks both selected bindings and verifies that the active pointer is one of those two. Source: original `$50B10..$50B64`, `$5618A..$56196`, `$56DCC..$56DD8`.

The existing browser comparison tool, `web/tools/dion-scene.ts`, supplies no selected-Floor input. Accordingly these results are **original-reader comparisons**, not browser raster-parity results. The original PNGs are evidence for later #685/#686 presentation comparison.

One rejected exploratory scene selected resident 67's opening METIS Floor 9 residence. By the captured frame the player was in VESTA group 5, while resident 67's original METIS coordinates, association and Floor remained unchanged. This does not show a resident relocation; it records a runtime access/session uncertainty. It is excluded from the matched representative set, and the recovered initial binding remains independently valid. Campaign access was not established for any debugger-selected scene.

Reproduce the representative scenes from the laboratory directory:

```sh
python3 -m m3lab.interior_scenes \
  --census ../../restricted/mercenary-iii-647/runs/location-census-334983y7
PYTHONPATH=.:tests python3 -m unittest tests.test_interior_scenes
```

Optional positional scene names restrict that command to selected recipes. The four harness tests cover preserved indoor destinations, periodic MIDAS metadata and displacement, the implicit own-region association tail, and rejection of an incorrect Floor. All capture outputs remain under `restricted/`; no playable payload or browser state is changed.
