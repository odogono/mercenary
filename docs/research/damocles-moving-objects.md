# Damocles moving objects: resident slots 8, 11 and 15

Working-Authority Evidence for
[#327](https://github.com/odogono/mercenary/issues/327), recovered 2026-09-17.
It answers the question the [Gamma System location
ledger](damocles-gamma-system-location-ledger.md) left open: what the two
takeable residents with no residence of any kind — `NEUTRON FUEL` slots 8 and
15 — actually are.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits
factual recovery, not translation of machine code into application code. Raw
RAM, native listings, screenshots and probe output stay ignored under
`research/damocles-st/work/`. Authoritative Evidence remains bound to the C64
Reference Build; everything here is Working-Authority Evidence.

**The answer is that neither slot is a dead record and neither is an object a
script inserts into a scene.** Slots 8..15 are an eight-entry *moving-object
pool*, and three of its entries are driven by the scene loop: slot 8 is the shot
the player fires, slot 11 is the `ATTACK SHIP`, and slot 15 is the shot the
attack ship fires back. All three are unplaced at rest precisely because a
moving object exists only while it is in flight.

## Evidence identity and runtime

Static recovery reads the pinned first-world RAM
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, decoded with
Capstone M68K 68000 in the laboratory virtual environment. Reference searches use
`research/damocles-st/lab xref` against that dump, complemented by a raw scan for
the same short addresses, because `xref` only matches absolute addressing in an
instruction's *source* effective-address field and therefore misses
`move.w #imm, addr.w`.

Runtime observations are produced by the tracked
[`scripts/moving-object-probe.py`](../../research/damocles-st/scripts/moving-object-probe.py),
SHA-256 `675130c1e23384f713fd59693396f534f65e85d5b2153b8bf9970e55590d665b`, on
Hatari 2.6.1 / Python 3.13.15, booting two tracked memstates:

| Memstate | SHA-256 |
| --- | --- |
| `snapshots/boarded-limo.sav` | `bbcc82de0d5da96ad6db4b8b67b9165122b65b8d7a54c7e7fb78fba02bfbbab4` |
| `snapshots/eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |

## The moving-object pool

Four word- and longword-strided arrays sit immediately below the resident
coordinate arrays and are indexed by the same `slot * 4` that indexes them. Each
is only 32 bytes long, which is exactly eight slots, and the stepping loop walks
`slot * 4` from `$3C` down to `$20` — **slots 15 down to 8**.

| Base | Stride | Field |
| --- | --- | --- |
| `$612A` | word at `+4*slot` | lifetime counter; `$0000` = not in flight |
| `$614A` | long at `+4*slot` | X velocity, signed 16.16 per step |
| `$616A` | long at `+4*slot` | Y velocity |
| `$618A` | long at `+4*slot` | Z velocity |

So for slot 8 the counter is `$614A` and for slot 15 it is `$6166`.

`$050ABC` is the per-pass stepper. For each slot with a non-zero counter it
decrements the counter and adds the three velocities into the resident's own
`$63A8` / `$67A8` / `$6BA8` records, clamping Y to `$FFFFFFFF` when the step
would drive it negative and `$7AAE` is not `$0002`. When a counter reaches zero
it clears the resident's Association B outright and re-runs the surface-resident
builder `$52C9C`:

```
$050B14  clr.l  $73a8(a0)     ; a0 = slot * 4 — the object stops existing
$050B18  clr.w  $612a(a0)
$050B1E  bsr.w  $52c9c        ; rebuild the surface residence list
```

That clear is why slots 8, 11 and 15 read Association B `$00000000` in every
capture taken at rest. It is the *resting* value of a moving object, not the
absence of a placement.

Slots 9, 10, 12, 13 and 14 fall inside the loop's index range but no code ever
writes their counters. The only counter writes in the image are the five sites
listed below, and each has its index register fixed to `$20` (slot 8), `$2C`
(slot 11) or `$3C` (slot 15).

## Slot 8 — the shot the player fires

`$050B96` is the launch, called once per scene pass from the main loop at
`$05987A` and `$059906`. It refuses unless all four of these hold:

| Gate | Address | Condition |
| --- | --- | --- |
| Fire button | `$79C2` | bit 7 set on the joystick-1 softcopy |
| Boarded | `$7AB0` | non-negative; `$FFFF` on foot and `$0005` boarded ([walk/board/flight](damocles-walk-board-flight.md)) |
| Inhibit | `$7BBE` | zero |
| Already in flight | `$614A` | zero |

On acceptance it writes the current body byte `$7AC9` into Association B byte 0
and clears byte 1 — the ordinary **surface-resident** form — copies the player's
own camera position `$7AB2` / `$7AB6` / `$7ABA` into the resident's coordinates,
derives the three velocities from the player's heading and pitch words through
the sine tables at `$060000` / `$064000`, sets the lifetime counter to `$20`
(32 steps), and re-runs `$52C9C` so the shot is drawn.

Immediately after slot 8 is stepped, `$050B28` tests it against the attack ship:
if slot 11's body byte matches the current body selector `$7AA9` and the
separation `$050EA0` computes is inside `$400` by the box test at `$0541BA`,
both slots are cleared, the encounter gate `$70104` is zeroed and system string
**`$31` "ENEMY SHIP DESTROYED"** is raised.

Every absolute reference to slot 8's own records in the whole 1 MiB image is in
this one routine: `$050B86`, `$050B8A`, `$050BC4` and `$050BCA`.

## Slot 15 — the shot the attack ship fires

`$050D80` is the attack-ship routine, called from the main loop at `$059886`
only. Its first instruction is the gate:

```
$050D80  tst.w  $70104
$050D86  beq.b  $50d7e        ; disarmed — return at once
```

With the gate armed it steers and fires:

- while the ship is farther from the player than `$3000`, `$050E44` sets slot
  11's velocity toward the player at one sixty-fourth of the separation, writes
  the current body byte into slot 11's Association B, and sets slot 11's counter
  to `$805A` — a negative value, which the routine's own second test reads as
  "coasting" and which makes it return for the next 90 steps;
- once the ship is inside `$3000` and slot 15 is not already in flight,
  `$050DB4` launches slot 15: counter `$20`, body byte `$7AC9` into Association
  B byte 0, byte 1 cleared, coordinates copied from slot 11, velocity the
  ship-to-player separation scaled down by sixteen and reversed;
- if slot 15 *is* in flight and comes within `$400` of the player, the encounter
  resolves against the player: a full-screen effect at `$050ECC`, system string
  **`$30` "YOU'VE BEEN ZAPPED"** while boarded, `$70104` zeroed, slots 11 and 15
  both cleared, and `$7A64` set to `$0001`.

Every absolute reference to slot 15's own records is `$050E26` and `$050E2E`,
both in that resolution; the launch reaches the same records through `a4`.

## What arms the encounter

`$070104` is one of four persistent longwords at `$070100..$07010F` that the
save routine mirrors into `$7804..$7813` at `$055402` and the load routine
restores at `$0552DA`. No native path sets it to a non-zero value. Exactly one
site in the whole program does, and it is a script:

```
; --- entry $072A6E ---   (body briefing for TOLOSA)
$072A6E  call  $2CE0
$072A72  if.flags  $0002  -> $072AE8
$072A78  flags.set  $0002
$072A7C  message  "   TOLOSA HOUSES THE ERISEAN CURRENCY RESERVES"
$072AAE  message  "HEAVILY DEFENDED AGAINST UNAUTHORISED VISITORS!"
$072AE8  message  "    REPOSITORY DEFENCE FORCES ARE ATTACKING"
$072B16  bank.write  $0104 $0001
```

`$072A6E` is entry 24 of the 32-slot body-briefing table at `$0700C0`, which is
indexed by body index minus one — so entry 24 is body 25, **TOLOSA**. The flag
test only suppresses the two introductory lines on a repeat visit; the attack
line and the `bank.write` run on every arrival. Opcode `$19 bank.write` stores a
word at `$070000` plus its operand ([script ISA](damocles-script-isa.md)), so
`$0104` is `$070104` itself.

`$050A5C` is the third reader: a panel routine that lights or clears an
indicator whenever `$070104` changes, caching the last value it drew in the
instruction stream at `$050A5A`.

Once armed the encounter is **not** body-specific. Nothing in `$050D80` or
`$050B96` consults which body the player is on beyond copying `$7AC9` into the
objects it places, so the attack ship follows the player off Tolosa until one
side resolves it.

## Runtime confirmation

Four probe cases, all sampling Association B, the pool counters, the gates and
the positions from `savebin` windows taken while the machine is stopped.

| Case | Memstate | Injected | Slot 8 | Slot 11 | Slot 15 |
| --- | --- | --- | --- | --- | --- |
| `fire-boarded` | `boarded-limo` | nothing but the joystick softcopy | `$00000000` ⇄ **`$2C000000`** | `$00000000` | `$00000000` |
| `fire-onfoot` | `eris-spaceport-onfoot` | nothing but the joystick softcopy | `$00000000` | `$00000000` | `$00000000` |
| `attack-disarmed` | `boarded-limo` | nothing but the joystick softcopy | `$00000000` ⇄ **`$2C000000`** | `$00000000` | `$00000000` |
| `attack-armed` | `boarded-limo` | `$070104` = `$0001` | `$00000000` ⇄ **`$2C000000`** | `$00000000` ⇄ **`$2C000000`** | `$00000000` ⇄ **`$2C000000`** |

`$2C` is four times body index 11, ERIS: the launched objects take the exact
surface-resident form the [resident object
associations](damocles-resident-objects.md) note decodes, with a zero second
byte and coordinates in the resident arrays.

- `fire-boarded` (`moving-object-fire-boarded-20260917T193628Z-249c9824`) holds
  the fire bit for six seconds. Slot 8's counter runs `$1D → $02`, wraps to
  `$1F` and runs down again, its coordinates step, and Association B alternates
  between the launched and cleared forms. One 32-step flight took about 4.6 s of
  host time here; that is the scene-pass rate under this harness, not a measured
  frame rate.
- `fire-onfoot` (`moving-object-fire-onfoot-20260917T193647Z-d7d45ee0`) is the
  control. The same held fire with `$7AB0` = `$FFFF` never places slot 8 and
  never moves its counter off zero. [#581](damocles-tolosa-encounter.md) found
  the reason is the on-foot frame path, which never calls `$050B96`, rather than
  the `$7AB0` gate.
- `attack-disarmed` (`moving-object-attack-disarmed-20260917T193658Z-d9f0535a`)
  shows that the ordinary first-world value `$070104` = `$0000` keeps slots 11
  and 15 unplaced while slot 8 cycles normally.
- `attack-armed` (`moving-object-attack-armed-20260917T194431Z-bdf10d28`) writes
  the word the TOLOSA script writes and then samples for 220 s. Slot 11 is
  placed within one pass; its counter cycles `$805A → $8000` and re-arms while
  the ship closes on the parked player; at about t+170 s slot 11's counter
  reaches `$7FFF` inside the firing window and **slot 15 launches**, stepping
  from the ship to the player; at t+177 s `$070104` returns to `$0000`, both
  slots clear and `$7A64` is `$0001`.

`attack-armed` is **an instruction-level checkpoint, not an ordinary route**: it
writes one word of persistent game state that ordinary play only reaches by
travelling to Tolosa. The other three cases inject nothing but the joystick
softcopy byte the laboratory already uses for locomotion.

## What the names mean, and what they do not

Model `$03F54A` carries the source name `NEUTRON FUEL` and is bound by exactly
two resident slots in the whole census — 8 and 15. The shots are therefore
*drawn with* that model. Nothing here says either slot is a fuel item, and
nothing connects them to the Mercenary-era delivery goods of the same name in
[residence-conditioned effects](residence-conditioned-effects.md). The name is
model provenance, not an object role.

Their handling bytes still read the way [the drop
research](damocles-object-drops.md) decodes them — slot 8 is `$00`, demanding a
support rank of zero and therefore never placeable on a support, and slot 15 is
`$04` — but a moving object is out of the player's reach for the whole of its
32-step life and is cleared the moment that life ends, so neither byte has an
observed consequence. Both remain counted as takeable in the census because the
census reads the byte, and that is correct; it is not a claim that either can be
picked up.

## What is not recovered here

[#581](damocles-tolosa-encounter.md) has since traced the encounter pass by
pass. It decodes `$7A64`, `$050ECC` and the `$059906` path, and it answers the
first item below for aboard play.

- Whether an ordinary route can reach a hit at all. `attack-armed` resolves the
  encounter against a stationary player after 170 s of the ship converging; a
  flying player on Tolosa was not observed, and no claim is made about how long
  the real encounter takes or how it is meant to be won.
- The second main-loop path at `$059906` calls the fire launcher and the stepper
  but **not** the attack-ship routine. Which mode that path serves is not
  established here.
- `$050ECC`, the effect the player-hit branch runs, and the display pointers
  `$4BF54` / `$4BF58` the three resolutions write, are named only.
- `$7A64`, set to `$0001` when the player is hit, is read at five other sites and
  is not decoded here.
- `$070100`, `$070108` and `$07010C`, the other three persistent longwords, are
  outside this ticket.
