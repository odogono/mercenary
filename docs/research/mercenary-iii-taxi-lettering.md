# Mercenary III: lettering in the opening taxi slice

Research for [#643](https://github.com/odogono/mercenary/issues/643), 2026-09-30, extending [R2](mercenary-iii-taxi-content-presentation.md). The authority is the pinned **Mercenary III research baseline**. Original media, RAM, disassembly, glyphs and rendered comparisons stay ignored Restricted Material under `restricted/mercenary-iii-643/`, per [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md). No application, Data Payload, Save format or runtime changes are made.

## Result and boundary

The six `$6000` lettering records in details 56 and 59 are recovered. MIII's token table is **`$B230`** and its vector-font offset table is **`$3E000`**. Both tokens select cell-dependent pointers, rather than a building name baked into the detail:

- **`$89`** reads `$B254`. It selects the blank string at `$B380` throughout the required detail-56 instances and the three detail-59 cells `(1,1)`, `(2,1)`, `(3,1)`. At detail-59 cell **`(3,0)`**, it selects the animated single-character buffer `$B3F2`.
- **`$9D`** reads `$B2A4`. It selects the blank string at `$B338` in every occupied cell of this slice. The associated font-0 space has no vertices or primitives.
- The animated buffer uses **font 5**. Glyph code `$40` draws **FLY**, `$41..$45` draw five stages of an aircraft symbol, and `$46` draws **KAOS**. Those descriptions come from a restricted rendering of MIII's recovered strokes; the codes are glyph selectors, not ordinary `@ABCDEF` lettering. The single-byte script has 19 positions: `$40` ×4, space, `$41,$42,$43,$44,$45`, space, `$46` ×5, space ×3. No Damocles text or font asset is used.

This closes the token, required-glyph and placement research gap for the bounded taxi slice. It does not implement the sign or demonstrate a browser comparison. Projection/rasterisation [#644](https://github.com/odogono/mercenary/issues/644), prison latch [#645](https://github.com/odogono/mercenary/issues/645) and sky/night [#646](https://github.com/odogono/mercenary/issues/646) remain separate. Other tokens, fonts and cells are outside this claim.

## Primary evidence and provenance

All addresses below are hexadecimal; ranges are half-open, words are big-endian. Static source: R1's loaded-play RAM, SHA-256 `94a107412037ce7972a605bfa1355e9fc9751373922df7fbd987d9ff94f1a8ec`. Existing R2 dense RAM captures were used as leads and checked against fresh, unpatched cold boots with the original [integration machine configuration](mercenary-iii-integration.md#cold-boot-and-controlled-probes). Pins were verified before each fresh run:

| Input | SHA-256 |
|---|---|
| Mercenary III STX | `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c` |
| EmuTOS `emutos206.img` | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari 2.6.1 Mach-O | `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |

The detail renderer `$54D24` reads its drawing list at `$AA50`. Its `$6xxx` branch calls `$54FA0`. The token lookup is `$55188..$551A8`: when the first inline byte has its high bit set, the reader saves the continuation after the two-byte token, indexes `$B230` by four times the low seven bits and draws the pointed-to string. At **PC `$551A2`**, D0 is the byte offset and A0 is the resolved string pointer. The glyph reader at `$551C0..$552DE` establishes the font grammar below. The cell binder `$5600C..$560B0` establishes pointer ownership; animation reader `$54F20..$54F96` establishes the mutable character/index behavior. These are direct MIII reader facts, not relocated Damocles assumptions.

Fresh spaceport run `taxi-spaceport-9eoyvfid` captured PC `$551A2`: `$89` with D0 `$24`, A0 `$B380`, and `$9D` with D0 `$74`, A0 `$B338`, both at cell `$60`. A later conditional hit with A0 `$B3F2` captured cell `$03`, initially space and index zero. Whole-RAM identities are artifact identifiers, not portable replay assertions:

| Restricted artifact under `restricted/mercenary-iii-643/` | SHA-256 |
|---|---|
| `taxi-spaceport-9eoyvfid/token89.ram` | `ff4ad7040aa2844637f4dfc129e0966f1e302d9521e73044597387d95dda097b` |
| `taxi-spaceport-9eoyvfid/token9d.ram` | `74effea5f94401f4a30a9ae5b0c521a3304de5bf99b297ea573a5071a59a2e42` |
| `taxi-spaceport-9eoyvfid/animated.ram` | `5a58c8fcf14664528286a199733007b547e7ab0bb2188f28661f5c030e12ffe5` |

Fresh cycle run `taxi-spaceport-c0yjt753` logs the animated pointer at the two detail-59 records and additionally logs the updater at PC `$54F60`, A1 `$B3F4`. The updater covers all 19 positions and wrap during natural travel; its log SHA-256 is `1f4113a6e936539b67d644717bd1fb96dbf407b0c665fce32f08491af8824129`. Draw-site logging alone misses positions 10..16 while the records are not selected by the view, so it cannot establish visible coverage of every phase. The updater briefly stores zero/index 19 before resetting to the first byte in the same call; this intermediate value is not a drawn blank frame. The phase/index sequence, not absolute VBL, is the reproduction assertion. The normal route reaches and leaves this cell without intervention.

### Stable source slices

Hash these slices in a fresh loaded RAM image before trusting the decode. Do not hash mutable token slots, animation buffers or the renderer's self-modified scale/plane words as static data.

| Range | Role | SHA-256 |
|---|---|---|
| `$29E60..$2A24C` | detail 56 | `7607e48515b416b021d5a1864a18538eaf8e5d0292352a9c0cbe5b23cf0b350d` |
| `$2A3D0..$2A808` | detail 59 | `c03df1bbeb159ff585148896936b7b728672787bf3a541990169a89237981f9b` |
| `$54FA0..$5502E` | detail anchor, scales and mirroring reader | `f1981136ac1e65ce2554fefa956e835d722eac7d0d28f35a25d2b4408722c913` |
| `$55188..$55204` | token and glyph lookup reader | `d4a9c6ce4d0fc2aed23ece28d92b2b8ca5dbd01a64d58f08a55279116d5328cc` |
| `$5528A..$552E2` | glyph primitive dispatch and character advance | `34c3cb8de94f4e68cec2c26cfb740f8743f476e5a5e5294fd2c8fab484b07715` |
| `$5600C..$560B0` | cell-conditioned token binding | `359a58c25cd48834139149fedb7be930af316c245040ef0cf67c5a348b143936` |
| `$54F20..$54F96` | text animation reader | `e9283e4da249ee8ccf4cdbdac424cda73d8d1cef4f2ed17184a4842df14dbaea` |
| `$7542..$759A` | 11 `$89` pointers then 11 `$9D` pointers | `0e22d0b83d80f387e1de0e1e86a7cf307444c3f486f7ca6c738dfc1d99b43399` |
| `$B3F6..$B40A` | 19 animation positions plus zero terminator | `e4abfe42f87608f222a19d0a2ba5b53a5e71b45fde55dae5342c1b693ae124ae` |
| `$3E000..$3E080` | font 0's 64 signed glyph offsets | `31952a41ca08187f519bc02a7c3f14176e4b0062bb2ef8d7f937de79bf07245c` |
| `$3E280..$3E300` | font 5's 64 signed glyph offsets | `d34830243071aaddfb6dbc8d0347b6fc67fb673ff7ac088664cc2cfbeeaeb61a` |
| `$3E400..$3E402` | empty space glyph, shared by fonts 0/5 | `9037f92bc91fdcc764a89d9144c341d887ffc83351cc8cf0530555c89920a47d` |
| `$3F669..$3F7E1` | font-5 glyphs `$40..$46` | `9e407d03e7835bce965579d52cc23cd2e14eea44e867b44daf5033ae46e0ad9c` |

## Records and placement

The listed address starts the 16-byte header, **after** the `$6000` command. Its fields are: signed offset, signed X/Y/Z anchor words, flags word, signed advance word, signed X/Y glyph-scale bytes, colour word, followed by the two-byte terminal token. The six records are all direct inline text (flags bit 15); plane bit 7 selects ZY and bit 6 is clear. Low four flags bits select font 0 or 5. Font-4 fallback and other planes are not needed here.

| Detail / header | Token / font | Anchor X,Y,Z | Offset | Advance | Glyph scale X,Y | Colour |
|---|---|---|---:|---:|---|---|
| 56 `$2A0F6` | `$89` / 5 | −350,900,450 | 300 | −96 | −12,12 | `$0777` |
| 56 `$2A10A` | `$9D` / 0 | −350,912,450 | 240 | −36 | −12,24 | `$0777` |
| 59 `$2A5F8` | `$89` / 5 | −200,200,0 | 1800 | −160 | −20,20 | `$8000` |
| 59 `$2A60C` | `$89` / 5 | −200,200,0 | −1000 | −160 | −20,20 | `$8000` |
| 59 `$2A620` | `$9D` / 0 | −200,220,10 | −1000 | −72 | −24,48 | `$8000` |
| 59 `$2A634` | `$9D` / 0 | −200,220,10 | 1800 | −72 | −24,48 | `$8000` |

For required ZY text, first multiply the anchor X/Z by the structure's signed X/Z scale; Y factor is one. If the structure X scale is negative, negate the **offset, glyph X scale and advance**. Add the resulting offset to anchor Z. A glyph point `(gx,gy)` of character ordinal `i` then lies at:

`(anchorX·structureX, anchorY + gy·glyphY, anchorZ·structureZ + offset + i·advance + gx·glyphX)`.

Do not multiply the offset/advance/glyph scales by the structure scale magnitude. The original handler scales anchors and mirrors the authored lettering dimensions separately. This matters particularly for alias 149, scale `(−2,2)`: the two font-5 anchors become **`(400,200,−1800)`** and **`(400,200,1000)`**, with glyph scale `(20,20)` and advance `160`. Its two blank font-0 anchors become `(400,220,1020)` and `(400,220,−1780)`.

Detail 56 at scale `(2,2)` puts the font-5 anchor at `(−700,900,1200)` and font-0 at `(−700,912,1140)`. At scale `(2,−2)`, they become `(−700,900,−600)` and `(−700,912,−660)`; glyph scales and advances retain their authored signs because X is positive. These placements are defined even where the selected string draws no geometry. In the fresh pointer captures, subtracting the saved relative-origin longs at `$7220` from A1/A2/A3 gives `(−700,900,1200)` for `$89`, `(−700,912,1140)` for `$9D`, and `(400,200,−1800)` for the animated detail-59 record. The live scale/advance words at `$54F98..$54F9E` also match the corresponding signs above; the inline continuations on the stack are `$2A108`, `$2A11C` and `$2A60A`. This independently checks reader placement against the extraction.

Colour `$0777` is a literal ST colour resolved through the frame palette allocator; `$8000` is direct frame palette index zero (black). All animated records use `$8000`. Preserve queue order: each `$6000` record remains in its authored detail drawing list; draw its glyph strokes at that position in the detail pass rather than as a screen-space label. Exact clipping, projected rasterisation and coplanar order remain #644's responsibility.

## Cell ownership and animation

Let `key = cellWorkspace[cell·4] & $FE`, from `$4CF0`. When `key >= $A0`, let `j = (key−$A0)/2`; the binder writes:

- `$B254` from the long at `$7542 + 4·j`;
- `$B2A4` from the long at `$756E + 4·j`;
- animation-list pointer `$B376` = the first pointer plus two.

Otherwise it selects `$B380`, `$B338` and `$B382`, respectively. In the occupied prefix, `(3,0)` alone has key `$A4`, hence `j=2` and `$89` target `$B3F2`. The 11-entry `$9D` binding table contains `$B338` throughout. These bindings do not imply that another cell's text is part of the taxi slice.

`$B3F2` is a character followed by zero; `$B3F4` is its animation index; the immutable 19-byte script begins at `$B3F6`, ending with zero at `$B409`. The active animation-list entry at `$B376` points to `$B3F4`. The descriptor word at index−4 (`$B3F0`) is zero, so this entry advances once per call to `$54F20`, with no additional pause-flag gate in that reader. `$5A47A` calls the animation reader once per main-loop frame, after relative-position/cell work and before detail drawing.

On an update, increment the index, use that script position, and if the byte is zero reset the index to zero and use the first script byte. Thus the index cycles through 1..18,0 and the character cycle repeats after 19 updates. The initial output is space/index zero, so the first draw after binding can be blank before the first animation update. Both `$89` records share the same output and index; drawing does not advance it. Leaving the cell rebinds the animation-list pointer to the blank buffer, retaining the previous `$B3F4` index for a later visit. Track phase by simulation frames, not browser rendering frequency; a whole-machine capture supplies both the output and index if comparing a frame before versus after its update.

## Coverage inventory, corrected accounting

R2/D1's **“nine records, eleven cells”** shorthand is inconsistent with their explicit table and [R1 ordered route](mercenary-iii-taxi-journeys.md#selection-route-start-and-pose-ownership). The occupied prefix has **15 distinct cells**, six occupied structure slots including aliases, five underlying geometry records and four nonempty details (plus empty detail 1). “Nine” can describe those five geometry records plus four nonempty details, but that is an accounting convention, not nine structure slots. No four travel cells are dropped to make the old summary fit.

| Cells | Slot → geometry | Detail / scale | Recovered lettering |
|---|---|---|---|
| `(2,6)` | 132 | 49 / `(−3,−3)` | No `$6xxx` lettering in detail 49; opening, call/wait and boarding |
| `(1,6)` | 146 | 1 / `(1,1)` | Empty detail; both routes |
| `(0,6)` | 155 → 57 | 56 / `(2,2)` | Both tokens blank; solicitor arrival and exit, spaceport travel |
| `(0,5),(0,4),(0,3),(0,2)` | 155 → 57 | 56 / `(2,2)` | Both tokens blank; spaceport travel, including cell `(0,3)` between dense samples |
| `(0,1),(4,0)` | 154 → 57 | 56 / `(2,−2)` | Both tokens blank; spaceport turns/travel |
| `(1,1),(2,1),(3,1)` | 149 → 65 | 59 / `(−2,2)` | Both tokens blank; spaceport travel |
| **`(3,0)`** | **149 → 65** | **59 / `(−2,2)`** | **Two synchronized FLY/aircraft/KAOS signs; `$9D` blank** |
| `(4,1)` | 146 | 1 / `(1,1)` | Empty detail; spaceport travel |
| `(2,0)` | 62 → 150 | 36 / `(3,−3)` | No `$6xxx` lettering in detail 36; spaceport arrival and exit |

This mapping follows the live workspace and token slots, not the destination panel label: **DOOBERRYS SOLICITORS** is a panel label and is not a recovered wall inscription. Details 36 and 49 were walked with R2's detail grammar and contain no text records. The tracked extraction below deliberately covers only the six established records and required glyphs.

## Portable reproduction

### Cold boot and pointer capture

Supply the original media locally. Use the [integration standalone Python recipe](mercenary-iii-integration.md#cold-boot-and-controlled-probes), which checks all three pins and specifies the complete machine command. Set `M3_PROBE=taxi-spaceport`; change its output root to `restricted/mercenary-iii-643`. Retain its input schedule through Start at 12200 and choose L at 22000, capture at 22600. This is an unpatched historical 60-Hz run; do not replace it with the browser's eleven-tick timing.

Before continuing from the 12200 callback, create these callback files with absolute paths and arm:

```text
b pc = $551a2 && d0 = $24 :trace :once :quiet :file <run>/token89.ini
b pc = $551a2 && d0 = $74 :trace :once :quiet :file <run>/token9d.ini
b pc = $551a2 && a0 = $b3f2 :trace :once :quiet :file <run>/animated.ini
```

Each callback contains `e VBL`, `r` and `savebin <run>/<name>.ram 0 $100000`. At PC `$551A2` the resolved pointer is already in A0; expect `$B380` / `$B338` for the first two and `$B3F2` for the third. Read the cell at `$71F4`, the workspace record at `$4CF0+4·cell`, the string through A0, the index at `$B3F4`, and the structure scale at `$7046/$7048`. A screenshot at this PC can be mid-draw and is not a completed-frame reference.

To observe the cycle, have `animated.ini` additionally arm a persistent `b pc = $551a2 && a0 = $b3f2 :trace :quiet :file <run>/frames.ini`. Put `e VBL` and `m $b3f2 8` in `frames.ini`. Draw-site output shows the shared phase for records selected by the view. Also arm `b pc = $54f60 && a1 = $b3f4 :trace :quiet :file <run>/updates.ini` from `animated.ini`, with the same `e VBL` / `m $b3f2 8` callback body. This updater trace covers phases omitted by view selection and the wrap/reset. Run at least to VBL 17400 before quitting; do not treat its transient zero/index 19 as a completed-frame phase. The callback must not mutate guest registers, code or state. For a complete-frame screenshot, use a following frame-boundary capture and retain its matching RAM/Pose; retain all logs and images under the ignored root.

### Independent bounded extraction

Set `M3_RAM` to a recreated 1-MiB loaded/captured RAM file. Set `M3_LETTERING_OUT` to a JSON path under ignored `restricted/mercenary-iii-643/`. The following standard-library Python recipe reads **only MIII** and emits Restricted Material there. Check the stable-slice ledger above before running. It intentionally fails if the bounded records or stroke glyph grammar differ; it does not borrow the Damocles catalogue, decoder or assets.

```python
import hashlib, json, os, struct
from pathlib import Path

b = Path(os.environ['M3_RAM']).read_bytes()
assert len(b) == 0x100000
out = Path(os.environ['M3_LETTERING_OUT']).resolve()
root = Path('restricted/mercenary-iii-643').resolve()
assert root in out.parents
for lo, hi, digest in [
    (0x29e60, 0x2a24c, '7607e48515b416b021d5a1864a18538eaf8e5d0292352a9c0cbe5b23cf0b350d'),
    (0x2a3d0, 0x2a808, 'c03df1bbeb159ff585148896936b7b728672787bf3a541990169a89237981f9b'),
    (0x54fa0, 0x5502e, 'f1981136ac1e65ce2554fefa956e835d722eac7d0d28f35a25d2b4408722c913'),
    (0x55188, 0x55204, 'd4a9c6ce4d0fc2aed23ece28d92b2b8ca5dbd01a64d58f08a55279116d5328cc'),
    (0x5528a, 0x552e2, '34c3cb8de94f4e68cec2c26cfb740f8743f476e5a5e5294fd2c8fab484b07715'),
    (0x5600c, 0x560b0, '359a58c25cd48834139149fedb7be930af316c245040ef0cf67c5a348b143936'),
    (0x54f20, 0x54f96, 'e9283e4da249ee8ccf4cdbdac424cda73d8d1cef4f2ed17184a4842df14dbaea'),
    (0x7542, 0x759a, '0e22d0b83d80f387e1de0e1e86a7cf307444c3f486f7ca6c738dfc1d99b43399'),
    (0xb3f6, 0xb40a, 'e4abfe42f87608f222a19d0a2ba5b53a5e71b45fde55dae5342c1b693ae124ae'),
    (0x3e000, 0x3e080, '31952a41ca08187f519bc02a7c3f14176e4b0062bb2ef8d7f937de79bf07245c'),
    (0x3e280, 0x3e300, 'd34830243071aaddfb6dbc8d0347b6fc67fb673ff7ac088664cc2cfbeeaeb61a'),
    (0x3e400, 0x3e402, '9037f92bc91fdcc764a89d9144c341d887ffc83351cc8cf0530555c89920a47d'),
    (0x3f669, 0x3f7e1, '9e407d03e7835bce965579d52cc23cd2e14eea44e867b44daf5033ae46e0ad9c'),
]:
    assert hashlib.sha256(b[lo:hi]).hexdigest() == digest, hex(lo)

def word(a):
    return struct.unpack_from('>H', b, a)[0]

def long(a):
    return struct.unpack_from('>I', b, a)[0]

records = []
for detail, a in [(56,0x2a0f6),(56,0x2a10a),(59,0x2a5f8),
                  (59,0x2a60c),(59,0x2a620),(59,0x2a634)]:
    assert word(a-2) == 0x6000
    offset,x,y,z,flags,advance,sx,sy,colour = struct.unpack_from('>4hHhbbH', b, a)
    token = b[a+16]
    assert token in (0x89,0x9d) and b[a+17] == 0
    assert flags in (0x8080,0x8085)
    records.append(dict(detail=detail, address=a, anchor=[x,y,z], offset=offset,
                        flags=flags, advance=advance, scale=[sx,sy], colour=colour,
                        token=token, pointer=long(0xb230+4*(token&127))))

def glyph(font, code):
    # All required glyphs are $81 stroke glyphs, including the empty space.
    slot = 0x3e000 + 2*(code+64*font-32)
    a = 0x3e000 + struct.unpack_from('>h', b, slot)[0]
    p, points, lines = a, [], []
    while b[p] not in (0x80,0x81,0x82):
        points.append(list(struct.unpack_from('>bb', b, p)))
        p += 2
        assert len(points) <= 63
    assert b[p] == 0x81
    p += 1
    while b[p]:
        refs = b[p:p+2]
        assert len(refs) == 2 and all(r and r%4 == 0 and r//4 <= len(points) for r in refs)
        lines.append([r//4-1 for r in refs])
        p += 2
        assert len(lines) <= 256
    return dict(font=font, code=code, start=a, end=p+1, points=points, lines=lines,
                sha256=hashlib.sha256(b[a:p+1]).hexdigest())

glyphs = [glyph(0,32),glyph(5,32)] + [glyph(5,c) for c in range(0x40,0x47)]
assert [(len(g['points']),len(g['lines'])) for g in glyphs] == [
    (0,0),(0,0),(12,8),(11,11),(11,11),(11,11),(11,11),(11,11),(28,23)]
script = list(b[0xb3f6:0xb409])
assert len(script) == 19 and b[0xb409] == 0
cell = word(0x71f4)
assert cell < 256
key = b[0x4cf0+4*cell] & 0xfe
expected = [0xb380,0xb338]
if key >= 0xa0:
    j = (key-0xa0)//2
    assert j < 11
    expected = [long(0x7542+4*j),long(0x756e+4*j)]
assert [long(0xb254),long(0xb2a4)] == expected
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(dict(ramSha256=hashlib.sha256(b).hexdigest(), cell=cell,
    records=records, glyphs=glyphs, script=script,
    animationIndex=word(0xb3f4), animationCode=b[0xb3f2]), indent=2)+'\n')
```

For each output stroke glyph, the source range/hash is retained. Required nonblank glyph counts total **95 points and 86 strokes** before placement; each visible sign uses one glyph at a time, with both sign records sharing the chosen code. The space glyph is `$3E400..$3E402`, no points and no strokes. The full vector-font family also has filled/compound glyph dispatch, but the bounded extractor need not interpret it: every needed glyph is independently verified as `$81` with signed byte point pairs, one-based four-byte vertex references, pairs of references for strokes and a zero stroke-list terminator.

## Deterministic browser comparisons and remaining gaps

Follow [ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md): 50 ticks/s, one atomic simulation frame every eleven ticks. The animated sign advances by a **simulation frame** while its cell animation entry is bound, giving a 209-tick repeat for continuous occupancy after the initial draw. Save/Session Resume must preserve or deterministically reconstruct this future-affecting animation phase; this report establishes the requirement without changing a Save schema. Absolute original VBL samples are not browser time targets.

For I1/I2, enumerate the corrected 15-cell inventory and assert token bindings per cell, including `(0,3)` even though R2's 200-VBL sampling misses it. Verify that the blank font-0 and font-5 glyphs generate no strokes, and that all seven nonblank font-5 glyphs match the source range, count and hash. Do not turn the panel destination names into building lettering.

For the animated cell, compare deterministic snapshots at: initial blank, FLY, each of the five aircraft stages, KAOS, trailing blank and wrap. Record cell, alias/scale, camera Pose, phase (before/after update), animation index/code, both anchors, colour, detail drawing-list association and palette/day state. Use the extraction's glyph coordinates and the placement rule above to produce local expected strokes for both signs. Fixed phase and restored animation state must reproduce both copies. Use a held-cell research fixture if ordinary travel does not sample all 19 positions; distinguish such a fixture from a natural taxi journey.

The first fresh live hit proves dispatch and binding, not visibility of a finished sign: the buffer is initially blank. The restricted glyph rendering establishes FLY/aircraft/KAOS shape, and the subsequent pointer log establishes selected phases. Full projected stroke/pixel parity remains a comparison to run in I2 after #644 supplies its projection/order rules. No browser has been changed or claimed to pass here. Damocles wall text was used only to suggest what to investigate; no `$CCA0` token address, `$31700` font address, Damocles glyph, token text or fallback rule was carried into these MIII findings.

## Verification performed

The documented extraction was executed verbatim against 201 retained R2 dense captures and seven RAM captures from the fresh pointer run: **208 successful decodes**, each checking all 13 stable slices. Fresh updater-log character/index pairs agree with the immutable script at every position and include the zero/index-19 intermediate followed by code `$40`/index zero. Live anchor/scale checks agree with the independent placement calculation above. A separate research review checked coverage accounting, source links, hashes, extraction, placement examples and glyph totals. This validates the bounded research procedure, not application or browser behavior.
