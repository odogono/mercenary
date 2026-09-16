# Damocles disk loads, bank extents and visual replacements

Working-Authority Evidence for [#280](https://github.com/odogono/mercenary/issues/280),
a follow-up to [#173](https://github.com/odogono/mercenary/issues/173). It settles
three questions the catalogue previously left provisional:

1. what the packed Pasti STX actually contains, and whether any resident bank is
   readable from it;
2. where each resident bank begins and ends, and on what evidence;
3. whether any other load, mission state or script can replace a resident slot or
   introduce a model.

Raw RAM, disk data and the Working Disassembly stay in the ignored research
workspace. Only findings and independently authored tooling are committed.

## Evidence base

Ten pinned captures of the loaded world, all on the same Working Authority image
(program SHA-256
`8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`, EmuTOS 2.06
SHA-256 `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5`):

| Capture | What it holds |
| --- | --- |
| `observe-first-world-20260818T101013Z-c5a32b7d` | cold first-world load (ERIS), `observed.ram` SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| `observe-first-world-20260818T101117Z-010b9ad3` | second independent cold load |
| `eris-spaceport-onfoot`, `boarded-car`, `boarded-limo`, `left-limo` | Eris on foot and boarded |
| `interior-window` | inside Capital Spaceport |
| `vesta-parliament-4-6`, `gaea-ur-city-4-2`, `dion-2-3` | live non-Eris `$ABDC` workspaces |

plus the title-screen RAM from the first run, where the `$04BD00` base block is
still zero.

## 1. The packed Pasti STX

`research/damocles-st/scripts/stx-inventory.py` parses the container and reports
structure only; it never writes disk content anywhere.

```sh
python3 research/damocles-st/scripts/stx-inventory.py \
  --stx "roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx" \
  --ram research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d/observed.ram
```

The image is a Pasti RSY version 3, revision 2 container of 1,031,930 bytes
holding **164 track records**, and every byte of the file is accounted for by
them.

- Cylinders **0–79** are formatted on both sides. Cylinders 80–81 have empty
  16-byte records on both sides: unformatted, no image, no sectors.
- **Only two tracks carry sector descriptors.** Cylinder 0 side 0 holds ten
  standard 512-byte sectors with clean FDC status, including an executable ST
  boot sector (word checksum `$1234`). Cylinder 1 side 0 is the copy-protection
  track: 512 bytes of fuzzy mask, sector 1 marked unstable and failing its data
  CRC, and a bogus id naming cylinder 6 head 48 with no data record at all.
- The other **158 formatted tracks carry a raw track image and no sector
  descriptors**, so the game reads them with its own loader rather than through
  normal FDC sector reads. That is 1,017,812 bytes of track image against 10,240
  bytes of standard-format sector data.

Reconciled against the loaded image, **no resident pointer table, record bank,
glyph table or body-label table appears verbatim anywhere in the payload.** Two
consequences follow, and they are the ones #280 asked for:

- the track payload is packed or encoded, so the catalogue cannot be sourced from
  the disk image directly — it is sourced from RAM after the title-to-world
  unpack, which is what fills `$04BD0C=$00E900`, `$04BD10=$035700` and
  `$04BD22=$026000`;
- the protected sectors are **not a second, directly readable model bank**. There
  is no readable geometry hiding behind the protection, and none is claimed.

What this does **not** establish is what each packed track decodes to. The
inventory bounds the disk; it does not open it. A bank reachable only by a load no
pinned capture performs would not appear in this census, and `coverage.complete`
stays false for that reason among others.

## 2. Bank extents

The catalogue previously described all three pointer-table extents as
"provisional". They are not: each is bounded above by the first record's own
bytes, and bounded below by every entry decoding. The extractor now measures both
bounds from the capture and emits them as `tables[].extent`, so the numbers cannot
drift away from the evidence.

| Bank | Table | Entries | Preamble | Records | Zero fill | Followed by |
| --- | --- | ---: | --- | --- | ---: | --- |
| Object | `$035700`–`$035CE7` | 378 | 20 bytes: a zero longword and the first record's 16-byte name field | `$035CFC`–`$042BBD` | 66 | the live projection workspace at `$042C00` |
| Surface assemblies | `$00E900`–`$00ED5F` | 280 | 8 bytes: the first record's metadata | `$00ED68`–`$01DEFA` | 261 | the `$01E000` ground workspace seed table |
| Building detail | `$026000`–`$026207` | 130 | 6 bytes: the first record's `$8000` vertex-terminator preamble | `$02620E`–`$0315D9` | 294 | the `$031700` glyph source table |

Read this as two separate bounds.

**Upper bound on the entry count.** One further table entry would overlap
authored record data — for the object table, the zero longword at `$035CE8` and
then the ASCII name `      NULL      `; for the surface table, the eight metadata
bytes of the record at `$00ED68`; for the detail table, the `$8000` words at
`$026208`. Entry 378 of the object table reads as `$00000000`, which resolves to
the table base and is not a record. So the counts are ceilings, not guesses.

**Lower bound on the entry count.** Every entry in every table resolves to a
record the extractor decodes or explains, across both independent first-world
loads. A shorter table would leave decoded records unreachable.

**Upper bound on the bank.** Each bank's last record is followed by hundreds of
zero bytes and then by an item the capture recognises independently of this
decode. The extractor raises if a bank ever reaches its follower, so the bound
fails loudly rather than silently widening.

The ground table keeps its own qualification: it is a 256-word workspace index at
`$01E400` over records from `$01E000`, not a relative-pointer bank, and it is one
body's workspace rather than a census.

## 3. Nothing replaces a bank; six slots are a world binding

### The shared banks are identical across every captured world

Across all ten captures the surface-assembly table and bank, the building-detail
table and bank, the ground record bank `$01E790`–`$023FFF` and the `$031700`
glyph table are **byte identical**. Travelling between bodies, entering a
building and boarding a vehicle change none of them.

All **212 unique object records decode identically in every captured world**, and
no world introduces a record address the first-world table does not already name.

Three byte pairs inside the object bank do differ between the Eris captures and
the Vesta/Gaea/Dion ones, and all three are accounted for:

- `$03E415` is the `$8003` **unconditional patch site the three beacons share**.
  It holds `$0411` where RED BEACON drew last and `$0246` where BLUE did. The
  decoder writes its own patch there, so the live value never reaches a mesh.
- `$03AEED` and `$03B302` lie **outside every decoded record's consumed stream**;
  decoding BENCH, COFFEE TABLE and their neighbours from an Eris capture and from
  a Vesta capture gives identical vertices, faces and colours. Which routine
  writes them is not established here, and is named as a residual below.

### Object slots 248–255 are a world binding, not a resident fact

The object pointer table is the one bank that is not wholly resident.

`$055026` consumes the world's resident-object stream. For each entry it writes
the signed 16.16 X/Y/Z arrays at `$63A8`/`$67A8`/`$6BA8`, and then at `$05503C`
it does

```
movea.l $4bd10.l, a2        ; a2 = object pointer table base ($035700)
move.w  a3, d1              ; d1 = this entry's slot offset
move.w  (a0)+, d0           ; d0 = a source slot offset from the stream
move.l  (a2, d0.w), (a2, d1.w)
```

— it **copies one table entry onto the entry's own slot**, then steps `a3` down by
four. A Hatari write watch on `$035AEA` during a cold title-to-world load breaks
here with `a2 = $00035700` and `a3 = $000003E8`, which is slot 250
(`research/damocles-st/scenarios/object-slot-250-writer.json`, run
`observe-object-slot-250-writer-20260916T130407Z-5b1aa07a`).

So a world *binds an existing model to a slot*. It never writes a record, and the
value it copies is always another entry of the same table. Across the ten
captures:

- slots **248–255** are the block the stream rewrites — their positions differ
  between worlds;
- slots **250–255** additionally land on a **different model**: Eris and Dion
  bind objects 343/344/346, Gaea binds 333/334, Vesta binds 340, 337, 333 and
  334;
- slot **247 and below are identical in all ten captures**.

The positions put these eight objects inside the player's own cell, a fraction of
a grid unit apart, which reads as per-cell scatter rather than as authored
placements. They are not promoted to instances.

The catalogue previously presented these slot numbers as fixed model identities.
It now records the pinned first-world binding, names the models other captured
worlds bind, and the extractor **raises** if a capture repoints a slot below the
block or points one at an address the resident table does not already hold —
either would be a load this census has not examined.

### The `$6364` mission table and the `$DF` branch

Exactly three instructions in the 1 MiB image name `$6364` (`lab xref --address
0x6364`). The table is nine six-byte records starting at `$636A`; the word at
`$6364` itself is unrelated scratch.

- **`$04CC48` writes it.** It scans up to nine slots for a free one and appends
  `[world][cell][word][byte][byte]`, where the word is either `$8000 | $7A59` or
  zero.
- **`$04ED4A` replays it over the cell workspace.** `$04EC94` has just rebuilt
  `$ABDC` from the authored surface-assembly map. For each record whose first
  byte matches the world index `$794E`, this writes the record's **non-negative**
  word into `$ABDC + cell*4` — replacing the surface assembly that cell places, or
  clearing it when the word is zero.
- **`$059F64` reads it for the `$DF` branch.** On the **negative**-word records,
  matched additionally on `$7AC5` and the structure, it substitutes character
  `$DF` for the entrance label glyph that the cell-derived `$7AFB` base would
  otherwise supply. `$059F7A` also compares the record's cell byte against
  `$7B5C`, but `$059F7E`'s `tst.w` overwrites the flags before any branch reads
  them, so that comparison has no effect: the match is on world, word sign,
  `$7AC5` and structure only. That is the source behaviour, not a decode
  shortcut.

So the sign of the record's third word selects the consumer: a cell's structure is
replaced, or one door label character changes. **Neither path introduces a record
and neither repoints a pointer bank.** The `$DF` branch was suspected of being a
geometry change; it is a glyph code.

The nine-record table is **all zero in every one of the ten pinned captures**, so
no capture exercises either branch. That is a bound on the observation, not on the
code, and it stays a named residual.

### The script bank cannot reach a bank

The decoded script ISA reaches 497 ops from all 64 entry slots with nothing
undecodable and no reachable inline-native escape
([script ISA](damocles-script-isa.md)). Its only stores are to the interpreter's
own state — `$7482` records, the `$7A42` word table, `$6FAA` bit records, flag
word `$7BD8`, counter `$7BD2`, key `$7B61`, PC `$7820` — and, through opcode
`$19`, to the script bank at `$070000 + operand`. None of the four native routines
the handlers reach writes anything else. **No script can write a pointer table, a
record bank or `$6364`.**

## Residuals

These stay open, and `coverage.complete` stays false.

| Residual | Why it is still open |
| --- | --- |
| The 158 custom-format tracks | Inventoried and bounded, not decoded. A bank reachable only by a load no pinned capture performs would not appear. |
| The `$6364` branches | Read from the code and bounded by it; empty in every capture, so neither replacement nor the `$DF` glyph has been watched running. |
| `$03AEED` and `$03B302` | Differ between Eris and non-Eris captures, outside every decoded record stream. No decoded model depends on them; their writer is unidentified. |
| The lower edge of the slot window | `$055026` fills downwards and the count is world data. Captures bound the window at 248–255; a world with a longer stream would extend it. |

Related follow-ups: [#172](https://github.com/odogono/mercenary/issues/172) for
unexamined workspaces, [#277](https://github.com/odogono/mercenary/issues/277) for
the object 338 palette binding, and
[#174](https://github.com/odogono/mercenary/issues/174) for visual fidelity.
