# Damocles bytecode script ISA

Working-Authority Evidence that Damocles still runs a **bytecode script
machine** — a 16-bit successor to the C64 **Benson Script** ISA, not a
byte-identical port. Research note for
[#85](https://github.com/odogono/mercenary/issues/85). Predecessor inventory:
[`damocles-script-motion-time.md`](damocles-script-motion-time.md) (#81).

Authoritative Evidence remains bound to the C64 Reference Build. Observations
here are Working-Authority Evidence only. This note does not mint glossary
terms, does not add types to `MercenaryKit`, and does not claim the encodings
are safe to execute as **Benson Scripts** in this remake.

## Scope and non-goals

**In scope:** prove or refute a bytecode ISA; classify same-as-C64 / successor /
absent; census host-facing effects against this remake’s Host Callout concerns.

**Out of scope:** full opcode semantics decode; filled polygons (#79);
walk/board and flight dynamics (#86); Independent Implementation (#82).

## Working Authority and reproduce path

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Lab | `research/damocles-st/` |
| World load | `scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`) |

```sh
research/damocles-st/lab doctor
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
```

Cited RAM: `observe-first-world-20260818T101013Z-c5a32b7d` (and matching second
cold run / `deadline-clock` captures for the live script PC).

**Title screen alone is insufficient.** The script bank at `$070000+` is absent
(zero-filled) at title-screen and present after `first-world`.

## Classification

**Successor bytecode VM — Confirmed.**

Not “no VM,” and not “same-as-C64 Benson encoding.” Damocles keeps a table-driven
script program with word opcodes whose **numbers** overlap the C64 Benson
dispatch slots for the core family (message, jump, call, return, wait, key-test,
random), but operands are 16-bit and control transfers use **bank-relative
offsets** into the `$070000` script bank.

Do **not** feed these streams to `BensonMachine` without a new decoder.

## Evidence

### Script bank shape

After world load, `$070100`–`$073500` (at least) holds an interleaved stream of:

| Word opcode | Working name | Operands (words) | Notes |
|---:|---|---|---|
| `$0001` | message | inline ASCII until `$00`, then word-align | Prefixed text lines; 211 hits in a partial parse |
| `$0002` | wait/sync | none (in delay subs) | Opens timed-wait subroutines |
| `$0003` | jump | 1 bank-relative offset | Idle loop: `$0003 $03FC` at `$0703FC` |
| `$0004` | call | 1 bank-relative offset | Targets more bytecode (e.g. `$2CD6` → `$072CD6`) |
| `$0005` | return | none | Ends delay subroutines |
| `$0007` | wait | ticks, continue-offset | e.g. `$01F4` (500) with continue back into the op |
| `$000A` | random/branch | mask, target | Appears in OK? bargaining |
| `$000B` | key/case | key-code, target | Chains after `(OK?)` prompts |
| `$000D` / `$000E` / `$0014` / `$0019` / `$001C` / … | other | varies | Present; full semantics Unresolved |

Partial parse of `$070100`–`$073500`: **490** decoded ops across **19** distinct
opcodes (one stray `$000F` left Unresolved by the width table).

### Call / wait / return subroutine (smoking gun)

At `$072CD6` (reached via `$0004 $2CD6` from the arrival briefing):

```text
$072CD6  OP02
$072CD8  WAIT $0032  cont $2CD8   ; 50 ticks, spin
$072CDE  RET
$072CE0  OP02
$072CE2  WAIT $0064  cont $2CE2   ; 100 ticks
$072CE8  RET
… longer waits $00C8, $00FA, $01F4, $02EE …
```

That is bytecode calling bytecode for timed delays — not a native-only message
list.

### Arrival briefing stream

From `$070110`, the landing sequence is scripts: messages (`GOOD MORNING`,
`ENTERING THE GAMMA SYSTEM`, …), `$0004` calls into the delay subs above,
`$0014`/`$0019` state ops, ending in `$0003 $03FC` (jump to self) at `$0703FC`.

### `(OK?)` dialogue

After `DO YOU ACCEPT THE ASSIGNMENT? - (OK?)`:

```text
$0002
$000B $0015 $09AA
$000B $0018 $09AA
$000B $0031 $0830
$0007 $01F4 $0818
…
$0001  " WELL - HOW ABOUT FIFTEEN MILLION THEN? - (OK?)"
```

Key/case ops + wait loop + follow-on messages — same machine as the briefing.

### Live script program counter

Across independent cold `first-world` runs and both `deadline-clock` captures,
low RAM **`$00781E`** holds **`$000703FC`**, i.e. points at the idle
`$0003 $03FC` instruction. The interpreter has a resident PC into the script
bank after the intro script parks in that loop.

### Relation to C64 Benson

| Concern | C64 Benson (byte ops) | Damocles (word ops) |
|---|---|---|
| Message | `$01` msg | `$0001` + inline ASCII |
| Jump / call / return | `$03` / `$04` / `$05` | `$0003` / `$0004` / `$0005` with bank-relative offsets |
| Wait | `$07` wfr | `$0007` ticks + continue offset |
| Key test | `$0B` tstk | `$000B` key + target |
| Random | `$0A` rand | `$000A` mask + target |
| Encoding | 8-bit op, fixed widths, 6510 | 16-bit op, 16-bit operands, 68000 host |
| Script home | entry table `$0800` | bank ~`$070000` after world load |

Shared **slot numbers** for the core family; **not** a mechanical translation of
C64 instruction bytes.

### What was not required / not done

- 68k native dispatch-table address (handler stubs) — Unresolved; bytecode
  shape + live PC are enough to answer #85.
- Pressing `O` on a live `(OK?)` in-lab — not needed once the parked PC and
  decoded streams are in hand.
- Full ISA document / extractor — out of scope.

## Host Callout effect census (category rows)

Against `BensonHostState` / `BensonEffect` concerns (not field-identical):

| Concern | Damocles evidence | vs Targ Host Callout |
|---|---|---|
| Play message | `$0001` inline text | **would-map (concern)** — needs Damocles text encoding |
| Wait / pacing | `$0007` tick waits; delay subs | **would-map (concern)** — tick unit Unresolved |
| Key / OK prompt | `$0002` / `$000B` after `(OK?)` | **would-map (concern)** — not proven identical to `pendingKey` |
| Control flow | `$0003` jmp, `$0004` call, `$0005` ret | **interpreter-local** — not Host Callout fields |
| Random branch | `$000A` | **would-map (concern)** |
| Object / craft / room tests | not decoded in this pass | **unknown** |
| Decimal / flags / inventory writes | `$0014`/`$0019`/… Unresolved | **unknown** |
| Effects (sound, finished) | Unresolved | **unknown** |

A future Damocles Host Callout would need its **own** seam: same *method* as
Targ, new field list after a full opcode census. Live Targ `BensonHostState`
must not be stretched.

## Implications for #82

- Script logic is a **real bytecode payload**, not only string tables — sizing
  a remake must budget for an interpreter + script extract, or for rewriting
  logic behind a new seam after a complete census.
- Method transfer (Host Callout, own extractors, Independent Implementation)
  still holds; C64 `BensonMachine` / ADR 0015 encodings do **not** transfer.
- Fog item “whether Damocles still has a Benson-like script VM” is answered:
  **yes, a successor VM**; remaining fog is full semantics and host-state map
  (not existence).

## Provenance summary

| Fact | Evidence |
|---|---|
| Script bank absent at title, present after load | Title vs `first-world` RAM at `$070000+` |
| Word opcodes + message/call/wait/ret streams | Decode of `$070110+`, `$072CD6+`, `(OK?)` block |
| Live script PC | `$00781E` → `$0703FC` idle jmp on multiple runs |
| Scenario pin | `scenarios/first-world.json` |
