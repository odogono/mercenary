# The Damocles day/night terminator: sky and palette half

Working-Authority Evidence for [#494](https://github.com/odogono/mercenary/issues/494) and
[#497](https://github.com/odogono/mercenary/issues/497), part of
[#470](https://github.com/odogono/mercenary/issues/470), recovered 2026-09-24.
Authoritative Evidence remains bound to the C64 Reference Build. This note records decoded
ST facts only ([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). The
captures stay ignored Restricted Material under `research/damocles-st/snapshots/`.

[The Gamma System research](damocles-gamma-system.md#what-consumes-the-phase-shifted-longitude)
found the terminator at `$050562` and showed that its angle moves with the Body's rotation.
[The level binding research](damocles-level-structure-binding.md#a-floor-is-drawn-in-the-records-palette)
found that it also chooses one of two palette words, and left open which half is day. This
note settles both questions and records what the Catalogue and the port now carry.

## Decision

- **`$7A14`, the palette base plus its offset word, is the day half.** `$050562` sets `$7A4E`,
  fills the sky from `$7946` and binds `$7A14` in `$7A10` on the same branch. #439's `jump`
  poke turned `$7A4E` from `$0000` to `$FFFF` while the display went from starfield to blue
  sky. All 33 captures agree with the rule. 14 of them bind a palette with two halves: 7
  stand by day in the offset half, and 7 stand by night in the base.
- **Every `$80xx` word publishes both halves.** Each primitive keeps `colour` as the base
  (night) half, as before. It gains `dayColour` where its palette has a non-zero offset and
  the two halves differ. A Floor palette gains `dayColours` on the same terms. A palette
  with a zero offset publishes exactly what it did before.
- **Each Body publishes its sky pair and rotation rate.** The pair comes from
  `$85DC + 4·body` and the rate from `$835C + 4·body`. Each arrival pose publishes the two
  terminator inputs that are live state: the Body's rotation accumulator and `$79BE`.
- **The port runs the terminator.** The session keeps the current Body's accumulator,
  advances it every VBL, and answers `daylight` for the Pose. The frame fills the sky from
  the Body's day or night word, and reads every face through the matching half.

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Gates | `research/damocles-st/tests/test_catalogue.py` `PaletteHalfTests`; `test_arrival_poses.py`; `location-ledger.py poses` |

| Window | Role | SHA-256 |
| --- | --- | --- |
| `$050562`–`$0505B5` | terminator | `f773b25a1d516aa25e4e3a27fcd1a4305720ef5df746c6ff51e6a7e48d373a26` |
| `$05935A`–`$059393` | surface pass angle pair | `9dced07780f2bf40f5393fe9b8b41009eb0241194152db5a179f338ff6f95e54` |
| `$0595C0`–`$0595F5` | surface pass and terminator call | `b21da24e0ce688b6ba33871fbc6514c10427decef49018805b41555f755ae5ce` |
| `$054E10`–`$054E2B` | palette binder | `8e34979ebdd9bbcba0fb9a0a5c9bfcbea94f69bffc5817bc5a21494dcfe7a40c` |
| `$055B3C`–`$055B55` | lift rebind | `f1c7b75ad1a1eeebe9b4906711f171a2e59e1efa64cfadfb751e75b1c4de4a9f` |
| `$0592BC`–`$0592C7` | sky pair load | `9b0d584e4b471f450da35866fc23a0bbfaeb85272b0125276384f94a405e7a93` |
| `$059DA2`–`$059DC9` | scene colours at assembly | `80c7b98d6f612a791706b3c3c40251f554364b3944f8bc467a59eedb3bb9cc0c` |
| `$04EA02`–`$04EA33` | sub-stellar longitude | `e293ba071b2db321f236ca3ebc871f2c29d4210cedff99f20de80635d8158f48` |

## The terminator

```text
050562  move.w   $79be.w, d0          ; sub-stellar longitude
050566  sub.w    $42c6c.l, d0         ; minus the observer's System longitude
05056C  addi.w   #$100, d0
050570  andi.w   #$200, d0
050574  add.w    $42c70.l, d0         ; plus the biased latitude
05057A  andi.w   #$200, d0
05057E  beq.b    $505a0
050580  move.w   $7946.w, $7c86.w     ; day sky
050586  move.w   #$ffff, $7a4e.w
05058C  move.w   $7a14.w, $7a10.w     ; day half
        ...
0505A0  clr.w    $7a4e.w
0505A4  move.w   $7a12.w, $7a10.w     ; base
0505AA  move.w   $7948.w, $7c86.w     ; night sky
```

The two angles are written by the surface pass just before it:

```text
05935A  move.w   $7aba.w, d1          ; z high word
05935E  asr.w    #2, d1
059360  addi.w   #$100, d1
059364  andi.w   #$3ff, d1            ; = $7A22, the Body Coordinate z step
05936C  move.w   d1, $42c70.l
059372  move.w   $7ab2.w, d0          ; x high word
059376  asr.w    #2, d0
059378  andi.w   #$3ff, d0            ; = $7A1E, the Body Coordinate x step
059384  add.w    $62ea(a1), d0        ; plus the rotation accumulator's high word
059388  andi.w   #$3ff, d0
05938C  move.w   d0, $42c6c.l
```

These two steps are the ones [the Body Coordinate Readout](damocles-gamma-system.md) prints.
In closed form, with `stepX`, `stepZ` from the position and `turn` the accumulator:

```text
longitude = (stepX + (turn >> 16)) & $3FF
daylight  = ((($79BE - longitude + $100) & $200) + stepZ) & $200  ≠ 0
```

The observer is in daylight where its System longitude is a quarter turn or more from
`$79BE`. Bit 9 of the biased latitude inverts that answer. Only the low ten bits of the
accumulator's high word reach the angle, so one turn of the Body is `$04000000`. The
longword itself wraps at 2^32. VOID's rate `$10624` turns once in 1,000 VBLs, which is how
[the rotation table](damocles-gamma-system.md#the-published-rotation-table) counts its day.

`$0595F0` calls the terminator before `$0595F6` tests the enclosed-region bit, so the palette
half is chosen indoors too. Only the sky fill `$059638` belongs to the non-enclosed branch.

### Its inputs

| Input | Where | Published as |
| --- | --- | --- |
| Night and day sky words | `$85DC + 4·body`, copied to `$7948`/`$7946` at `$0592BC` on entering the Body | `bodies[].bodySurface.sky` |
| Rotation rate | `$835C + 4·body`, the authored `$82DC` shifted right 6 | `bodies[].bodySurface.rotationRate` |
| Rotation accumulator | `$62EA + 4·body`, advanced every VBL by `$051E4E` | `poses[].bodyTurn`; the start's in `web/damocles/eris.json` |
| Sub-stellar longitude | `$79BE`, written once on arrival at `$04EA30` | `poses[].subStellarLongitude` |

The sky table and the rate table are static: every capture's `$7946`/`$7948` equals the
image's pair for its Body. `$79BE` comes from a table-driven atan2 (`$04EA48`, fed by
`$04BDD8`) of the Body's centre, EOR `$200`. A float atan2 reproduces it on 19 of the 23
captured Bodies and misses by one step on CYCLOPES, ERIS and LUCAN. DAMOCLES misses by
more, because its centre moves after arrival. The value is therefore read from each
capture, not recomputed. Poses on the same Body agree.

### Every capture agrees

The closed form, evaluated from each capture's position and accumulator rather than from its
`$42C6C`/`$42C70`, predicts `$7A4E` in all 33 captures. In each capture, `$7C86` is the
predicted sky word and `$7A10` the predicted half. `location-ledger.py poses` refuses a pose
whose answer disagrees with `$7A4E`, and none does.

## The palette half

`$054E12`–`$054E28` (entry) and `$055B3C`–`$055B52` (a lift arrival) bind the palette:

```text
054E12  movea.l  $4bd16.l, a0
054E18  adda.w   (a0,d0.w), a0        ; the palette's base, from the $D200 index
054E1C  move.l   a0, $7a0e.w
054E20  move.w   a0, $7a12.w          ; base
054E24  adda.w   -2(a0), a0           ; plus the signed word before it
054E28  move.w   a0, $7a14.w          ; day half
```

31 of the 155 palettes have a non-zero offset: 0, 1, 8, 22, 25, 28, 29, 44, 45, 51, 62, 66,
67, 70, 76, 77, 89, 91, 92, 94, 99, 113, 130, 131, 132, 135, 143, 149, 150, 151 and 154. Each
half is 64 words from its own address, and the two overlap. Palette 66's day entry `i` is
its base entry `i + 12`.

In every capture, `$7A14 − $7A12` equals the offset word the image holds before the palette
at `$7A12`. The two-half captures cover both sides:

| Capture | Palette | Offset | `$7A4E` | `$7A12` | `$7A14` | `$7A10` | Half |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| `damocles.acheron` | 1 | 28 | `$FFFF` | `$D336` | `$D352` | `$D352` | day |
| `damocles.damocles` | 1 | 28 | `$FFFF` | `$D336` | `$D352` | `$D352` | day |
| `damocles.lucan` | 1 | 28 | `$FFFF` | `$D336` | `$D352` | `$D352` | day |
| `damocles.gaea.transporter` | 66 | 24 | `$FFFF` | `$DB5C` | `$DB74` | `$DB74` | day |
| `damocles.metis.transporter` | 66 | 24 | `$FFFF` | `$DB5C` | `$DB74` | `$DB74` | day |
| `damocles.pan` | 25 | 26 | `$FFFF` | `$D5A8` | `$D5C2` | `$D5C2` | day |
| `damocles.logos.transporter` | 150 | 24 | `$FFFF` | `$E758` | `$E770` | `$E770` | day |
| `damocles.cronus` | 1 | 28 | `$0000` | `$D336` | `$D352` | `$D336` | base |
| `damocles.key-west` | 1 | 28 | `$0000` | `$D336` | `$D352` | `$D336` | base |
| `damocles.thalia` | 1 | 28 | `$0000` | `$D336` | `$D352` | `$D336` | base |
| `damocles.clotho` | 22 | 26 | `$0000` | `$D56A` | `$D584` | `$D56A` | base |
| `damocles.dion.transporter` | 28 | 24 | `$0000` | `$D62A` | `$D642` | `$D62A` | base |
| `damocles.perseus` | 99 | 24 | `$0000` | `$E074` | `$E08C` | `$E074` | base |
| `gaea-ur-city-4-2` | 76 | 50 | `$0000` | `$DCD6` | `$DD08` | `$DCD6` | base |

Palette 1 appears on both sides: by day at ACHERON, DAMOCLES and LUCAN, and by night at
CRONUS, Key West and THALIA.

### The scene colours latch

`$059DA2` resolves the structure's two scene colours through `$7A0E` once, when the
structure is assembled, not every frame. They therefore take whichever half was bound at
that moment. ACHERON, DAMOCLES and LUCAN hold `$7C82`/`$7C84` that match only the day half
of their palette, and CRONUS, Key West and THALIA hold values that match only the base.
The Catalogue publishes both halves of each scene colour. The port takes the current half,
which differs from the ST only after the terminator crosses a player who stays in one
structure.

## What the Catalogue publishes

- `dayColour` on each face, line, scene colour or Floor Label whose `$80xx` word resolves
  differently through the day half. Its absence means one colour serves both halves. 199
  Model files gain it.
- `levelBinding.palettes[].dayColours`, beside `colours`, where the day half changes an
  entry a bound structure names. 27 Floor palettes carry it. Palette 66 turns entries 1 and
  11 from `#eeeeee` to `#000000` by day.
- `bodies[].bodySurface.sky` (`day`, `night`: `colour`, `sourceColour`) and
  `bodies[].bodySurface.rotationRate`. The VOID slot still carries no surface.

`PaletteHalfTests` holds all of this to the captures. For every capture, each published
`$80xx` word of a structure drawn in the capture's palette, and each published Floor palette
entry for it, equals the colour of that word in the capture's `$7A10` half. Two-half
palettes are checked on both sides.

The schema version stays 17: no Save depends on these fields
([ADR 0048](../adr/0048-store-each-damocles-model-as-its-own-catalogue-file.md)).

## What the port does

- `web/src/damocles/terminator.ts` implements the closed form and the accumulator's advance.
- The session starts from `start.bodyTurn`. That is Eris's accumulator in
  `eris-spaceport-onfoot`, the capture the start position comes from, and it puts the start
  at night. The session adds the Body's rate for every VBL its frame clock counts. A switch
  takes the arrival pose's accumulator, so `switch metis-transporter` stands by day under
  `$355`. The Save carries the accumulator at schema 9.
- `planErisFrame` takes `daylight`. It clears to the Body's day or night word outside an
  enclosed region, reads `dayColour ?? colour` by day, and caches triangles per half.
- A Floor's day half replaces the bound structure's own. The structure's `dayColour` belongs
  to its own palette, which the Floor does not bind.
- The authored `sky` block in `web/damocles/eris.json` is removed (schema 8). Every Body a
  session can stand on has its own pair.

## Reproduce

```sh
research/damocles-st/.venv/bin/python -m unittest \
  tests.test_catalogue.PaletteHalfTests tests.test_arrival_poses   # from research/damocles-st
python3 research/damocles-st/scripts/location-ledger.py poses \
  --memstate ... --payload      # the recipe in damocles-gamma-system-location-ledger.md
```

The catalogue payload regenerates byte for byte with the command in
[the catalogue note](damocles-catalogue.md#reproduce).

## Not settled

- **The per-frame order.** A crossing takes effect in the next frame's colour reads, and the
  port redraws at the new half at once. Nothing here measures whether the ST's crossing
  frame shows a mix.
- **Bodies without a capture.** LACHESIS, AURORA, TRITON, JUNO, JASON and SAPPHIRE have no
  arrival pose, so no `$79BE` is published for them. Reproducing the table atan2 exactly
  would publish it, but no session can stand on those Bodies yet.
- **The Enhanced preset's sky model ([#232](https://github.com/odogono/mercenary/issues/232))**
  is separate. This note covers only what the Authentic presentation draws.
