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
[#128](https://github.com/odogono/mercenary/issues/128) extended this with a
Working Disassembly of the native interpreter: dispatch loop, dispatch table,
opcode encoding, and a first-pass handler census.

**Out of scope:** exhaustive per-operand semantics and a script extractor;
filled polygons (#79); walk/board and flight dynamics (#86); Independent
Implementation (#82).

## Working Authority and reproduce path

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` |
| SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Lab | `research/damocles-st/` |
| World load | `scenarios/first-world.json` (SHA-256 `e5383458…8582f96e`) |
| Dispatch loop | `scenarios/script-dispatch.json` |

```sh
research/damocles-st/lab doctor
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/first-world.json
# Working Disassembly of the interpreter (listing stays in the ignored run dir):
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/script-dispatch.json
research/damocles-st/lab xref --run research/damocles-st/work/<run-id> --address 0x781E
research/damocles-st/lab export --run research/damocles-st/work/<run-id> --range 0x050000-0x054000
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

### Native dispatch loop and table

Resolved by Working Disassembly ([#128](https://github.com/odogono/mercenary/issues/128));
this supersedes the earlier "68k native dispatch-table address — Unresolved" note.

`$051956` is the **only** instruction in the whole 1 MiB image that names the
resident script PC (`movea.l $781E.w,a0`), found with
`lab xref --address 0x781E`. It sits inside the interpreter's fetch-decode-
dispatch loop at `$05193E`–`$05196E`, whose decoded structure is:

| Address | Decoded step |
|---|---|
| `$05193E` | if `$7BA0` ≠ 0 → `rts` — **a pending message suspends the VM** |
| `$051944` | if `$7B96` ≠ 0 → `$0547C6` |
| `$05194C` | if `$7A88` ≠ 0 → `bsr $054764` |
| `$051956` | `A0` ← long at `$00781E` (resident script PC) |
| `$05195A` | `D0` ← `(A0)+` — fetch opcode word, advance |
| `$05195C` | `D1` ← `D0` — keep the **full** word; its high bits are flags |
| `$05195E` | `D0` &= `$003F` — opcode is the **low 6 bits** |
| `$051962` | `D0` ≪ 1 |
| `$051964` | `A1` ← `$051972` — **dispatch table base** |
| `$05196A` | `A1` += word at `(A1 + D0)` — 16-bit **self-relative** offset |
| `$05196E` | `jmp (A1)` |

The table at `$051972` holds **37 entries** (`$00`–`$24`) of 16-bit offsets
relative to the table base; handler stubs begin immediately after it at
`$0519BC`. Slots `$00` and `$1A` carry offset `$0000`, i.e. they point at the
table itself and are unused. `and.w #$003F` admits 64 indices, so opcodes above
`$24` would read handler code as an offset — the interpreter trusts its input.

Handlers commit the advanced PC with `move.w a0,$7820.w` — a **word** store to
the low half of the longword at `$00781E`. The high word stays `$0007`, which is
why every control transfer is bank-relative: the script bank cannot leave
`$07xxxx`. Opcode `$19` makes the base explicit with `adda.l #$00070000,a1`.

### Opcode encoding: bits 6 and 7 select the branch

Predicate handlers do not encode their own branch. They fall into one of two
shared epilogues, and the flag bits preserved in `D1` decide what happens:

| Site | Decoded step |
|---|---|
| `$051A28` | `bchg.l #7,d1` — invert the polarity bit, fall through |
| `$051A2C` | if bit 7 of `D1` clear → `$051A3A`; else skip the 2-byte operand, commit PC, `rts` |
| `$051A3A` | if bit 6 of `D1` clear → jump handler `$0519EE`; else call handler `$0519F6` |

So one word carries: opcode in bits 0–5, **call-instead-of-jump in bit 6**, and
**negate in bit 7**. A test op reaching `$051A2C` takes its branch; reaching
`$051A28` inverts first. This is the mechanism behind the note's earlier
"key/case ops + wait loop" reading, and it explains why a fixed per-opcode width
table left a stray `$000F` Unresolved: predicate ops carry a target operand that
is consumed by the *shared* epilogue, not by the handler.

### Handler census

Handler = `$051972` + table offset. Semantics below are read from the stubs;
rows marked *probable* are single-pass readings that were not re-derived.

| Op | Handler | Decoded meaning |
|---:|---|---|
| `$00`, `$1A` | `$051972` | Unused (offset `$0000`, points at the table) |
| `$01` | `$0519BC` | **Message**: stash long text pointer at `$7B98`, scan to `$00`, word-align PC, set `$7BA0` = 1 (suspends the VM) |
| `$02` | `$0519E2` | Clear `$7B9C`, the counter `$07` tests — **reset wait** |
| `$03` | `$0519EE` | **Jump**: operand → `$7820` |
| `$04` | `$0519F6` | **Call**: push PC word on the script stack at `$6266`/`$6268`, then jump |
| `$05` | `$051A08` | **Return**: pop the script stack into `$7820` |
| `$06` | `$051A16` | Predicate: two byte operands vs `$7A2D` and `$7A35` |
| `$07` | `$051A42` | **Wait**: unsigned word `$7B9C` < operand; unmodified `$0007` branches while below, falls through at equality or above (#287) |
| `$08` | `$051A4C` | `jsr (a0)` — **native 68k code inline in the script stream**, then skip 4 |
| `$09` | `$051A56` | As `$08`, then predicate on the result |
| `$0A` | `$051A5E` | Predicate against a pseudo-random word walked from the `$7E18`/`$7E1A` pointer |
| `$0B` | `$051A7E` | **Key/case**: operand low byte vs `$7B61`; on match request sound via `bsr $054848`; does not clear the key |
| `$0C` | `$051A8C` | Predicate on the sign of a `$6FAA` record indexed by `$7C3E` |
| `$0D` | `$051AA6` | Write 6 bytes into an 8-byte-strided record table at `$7482`, indexed by operand |
| `$0E` | `$051AE6` | **BCD add**: six `abcd` steps over a 6-byte packed-decimal field of a `$7482` record, with an `$00F8` special case calling `$054848` |
| `$0F` | `$051B16` | Indexed **word write** into the `$7A42` table |
| `$10` | `$051B28` | `or.w` operand into flag word `$7BD8` — **set flags** |
| `$11` | `$051B34` | `not`+`and` operand into `$7BD8` — **clear flags** |
| `$12` | `$051B42` | Predicate on `$7BD8` — **test flags** |
| `$13` | `$051B50` | Predicate on `$7C40` |
| `$14` | `$051B5C` | **Indexed message**: bounded (`$01E0`) read from `$7A42`, treat as string pointer, set `$7B98`, bump `$7B9A`, set `$7BA0` = 1 |
| `$15` | `$051B98` | **BCD three-operand**: gathers three `$7482` records, copies one into scratch at `$7968`, then six `abcd` steps — packed-decimal arithmetic between entities |
| `$16` | `$051BE2` | `add.w` operand into counter `$7BD2` |
| `$17` | `$051BEE` | Predicate on `$7BD2` vs operand |
| `$18` | `$051BFC` | Predicate on the word at `$070000` + operand |
| `$19` | `$051C10` | **Store word** into the script bank at `$070000` + operand |
| `$1B` | `$051C2C` | Random message: pseudo-random index into a bank table, then the `$01`-style message commit |
| `$1C` | `$051C74` | Write word `$00FF` at `$7B60`: byte `$7B60` = 0, key byte `$7B61` = `$FF` |
| `$1D` | `$051C80` | Predicate on `$7C40` vs bytes at the `$7C3E` pointer |
| `$1E` | `$051C92` | Copy one `$7A42` word to another (double-indexed) |
| `$1F` | `$051CAA` | Predicate on `$7C3C` vs `$7B5C` |
| `$20` | `$051CBA` | Set or clear bits in a `$6FAA` record, chosen by operand sign |
| `$21` | `$051CDC` | Predicate: `and` a `$6FAA` record byte with operand |
| `$22` | `$051CF8` | Predicate on operand vs `$7A90` |
| `$23` | `$051ABE` | Predicate comparing a full `$7482` record (long + word) |
| `$24` | `$051C20` | Reads a word then a byte operand (*probable*) |

Interpreter state named by the handlers: script PC `$00781E` (low word
`$007820`), call stack `$006266`/`$006268`, message pointer `$007B98` with
low word `$007B9A`, message gate `$007BA0`, wait counter `$007B9C`, flag word
`$007BD8`, counter `$007BD2`, key `$007B61`, record table `$007482`, word table
`$007A42`, bit records `$006FAA`, RNG pointer `$007E18`/`$007E1A`.

#287 rechecks the first offer in [the first-offer research](damocles-first-offer.md).
The native caller at `$0594FA` dispatches one opcode at a time; the counter is
incremented separately at `$051E3A` in the interrupt routine, subject to the
`$7A26` guard. Therefore a Y/O/N/counter polling sequence is not atomic.
The message gate holds the successor PC before reset-wait executes, and neither
reset-wait nor a matched key predicate consumes key byte `$7B61`. The first
offer's explicit `$1C` precedes its message. Counter ticks remain distinct from
a proven seconds-per-tick conversion.

### Bank layout and full decode

With the handler census giving correct operand widths — including the branch
target that predicate ops carry via the shared epilogue, which is what defeated
the earlier partial parse and left a stray `$000F` — the bank decodes almost
completely. `lab script` walks it by reachability from its entry table.

What the decoded programs *contain* — the script inventory, the string table,
and the authoring idioms — is catalogued separately in
[`damocles-script-catalogue.md`](damocles-script-catalogue.md).

Region 1 of the populated bank (`$070000`–`$07336C`) is four things in order:

| Range | Contents |
|---|---|
| `$070000`–`$07007F` | **String table**: 64 bank-relative word pointers into the string pool |
| `$070080`–`$0700FF` | **Script entry table**: 64 bank-relative word pointers to bytecode — the Damocles analogue of the C64 Benson entry table at `$0800` |
| `$070100`–`$072D2E` | **Bytecode**, including the timed-delay subroutines from `$072CD6` |
| `$072D2E`–`$07336C` | **String pool**: NUL-terminated text on a `$32` stride (slot `$00` = `LOCKED`, slot `$01` = `WARNING - OBJECTS LEFT IN CASE!`) |

Two 64-slot tables, not one 128-slot table: the first half's targets are text on
a regular stride, the second half's are code. Repeated values in either are
unused slots pointing at a shared target. Decoding past `$072D2E` walks ASCII as
instructions — a word of two spaces (`$2020`) has `$20` in its low six bits and
looks like a valid slot — which is how an over-wide region inflates slot `$20`
and invents `$08`/`$09` sites that are really letters.

Decode of the code region from all 64 entry slots: **497 ops reached, 98.2% of
the region's 11,310 bytes, nothing undecodable.** That independently corroborates
the earlier partial parse's 490 ops and 211 message hits. Slot mix, in order:
`$01` message (206), `$04` call (72), `$03` jump (67), `$0A` if.random (30),
`$05` return (16), `$0B` if.key (15), `$14` message.indexed (14), `$02`
reset.wait (13), `$07` if.wait (13), `$19` bank.write (11), `$0D` record.write
(9), `$11` flags.clear (7), `$0E` record.bcd.add (6), `$12` if.flags (5), `$1C`
(5), `$10` flags.set (2), `$15` record.bcd.three (2), `$0F` word.write (2),
`$20` and `$21` (1 each).

**Neither `$08` nor `$09` appears.** The inline-native escape exists in the
interpreter but no reachable script in this region uses it.

The operand-width table the decode rests on: a plain op consumes its own
operands; a predicate op consumes those **plus** a trailing 2-byte branch
target; `$01` consumes NUL-terminated text and word-aligns; `$08`/`$09` consume
4 bytes of inline code. Widths are read from the handler stubs — for example
`$07` takes 2 operand bytes and is a predicate, so `$07` at `$072CD8` with
operand `$0032` and target `$2CD8` puts `return` at `$072CDE`, exactly where the
earlier hand decode of that delay subroutine put it.

### The native routines the handlers call (#136)

#128 left the four native addresses the interpreter reaches as Unresolved.
Working Disassembly of two bounded windows — `$054700`–`$0556FF` and
`$04C400`–`$04D3FF` — decodes all four. They are **not** one kind of thing:
two drive the script/message scheduler, two are the sound driver.

**`$054848` — sound-effect request (stage 1).** The #287 static recheck
corrects the original guard ordering: `$054848` first tests `$7A0C` and returns
without arming if it is non-zero. Otherwise `$054850` sets the tick counter
`$7A78` = 3 and `$054856` stores `$0004C556` into vector slot `$0004BF54`.
Only **after arming** does it test `$7C0C` at `$054860` and `$00033F68` at
`$054868`. If either is non-zero it skips the immediate PSG writes; otherwise
it sets `$7C06` = `$0A` and writes YM2149 register `$0A` (channel C amplitude)
← `$00`. Request entry, vector arming and emitted sound are distinct facts.

It is reached from three script handlers: `bsr` at `$051A86` (`$0B` key/case,
on match), and `jsr` at `$051AEE` (`$0E`) and `$051BAA` (`$15`), both on the
`$00F8` record-index special case. Five further callers are native, not script:
`jsr` at `$04D2B2`, `$05097C`, `$05099A` and `jmp` at `$04EB28`, `$04EB3E` — so
this is a shared engine entry point rather than a script-only one.

**`$0004BF54` — a per-pass sound-step vector.** `$051E0E` does
`movea.l $0004BF54,a0` and `$051E14` `jsr (a0)`; a sibling slot `$0004BF58` is
called the same way immediately after. The slot's idle value is `$00051E86`,
which is a bare `rts`. When its first guard permits, `$054848` arms a step
and returns at once.
At `$051DFE`, non-zero `$00033F68` selects an alternate native sound path,
bypassing both vectors. Thus even an armed step is not proof that PSG writes
have occurred, still less that a player heard the effect.

**`$0004C556` — stage 2, the effect body.** Sets `$7A78` = `$0F`, programs the
envelope period (registers `$0B`/`$0C` ← `$00`/`$1F`) and the channel B tone
period (`$02`/`$03` ← `$60`/`$00`), then rewrites the mixer (register `$07`)
from the shadow byte `$7C04`, clearing bit 1 and setting bit 4 — channel B tone
on, channel B noise off. It branches to the shared tail at `$0004C5EC`, which
sets
channel B amplitude (register `$09`) = `$1F` (envelope mode) and envelope shape
(register `$0D`) = `$09`, then **restores `$0004BF54` to `$00051E86`** and
returns. The two-stage sequence disarms itself.

**`$0004C6B2` — a sibling effect step in the same driver.** Same shape as
`$0004C556` with different constants: envelope period registers `$0B`/`$0C` ←
`$40`/`$00`, channel B tone period `$02`/`$03` ← `$30`/`$00`, the same mixer
edit, and the same shared tail at `$0004C5EC`. Its only reference in the 1 MiB
image is `jsr $0004C6B2` at `$051D62`, immediately after `clr.w $7A76` — the
timer path #136 reported it on.

The window shows at least four more steps of the same family (`$04C5A8`,
`$04C610`, `$04C630`, `$04C700`), each setting its own `$7A78` and its own PSG
programme. They split over two tails: those reaching `$0004C5EC` play a **tone**
on channel B, while those reaching `$0004C5C6` set the noise period (register
`$06`) and invert the mixer edit — noise on, tone off. So the driver is a small
bank of short PSG sequences, selected by which one the caller arms or calls.

**`$054764` — pending-script launcher.** Called `bsr` from `$05194C` with
`D1` ← `$7A88`, the gate the dispatch loop tests. It returns early if bit 6 of
`$7BD9` is set. Otherwise it clears `$7A88`, indexes a byte table at `$7CB4` by
`D1`, and returns unless bit 7 of that byte is set. It then sets bit 6 of
`$7BD9`, and clears bit 7 of the flag byte unless bit 6 of the same byte is set
— a one-shot / sticky distinction per entry. Finally it reads the script entry
table: `D1`×2 + `$00070080` → the new script offset, and **pushes the current
script PC**: `movea.l $6266,a0; move.w $7820,-(a0); move.w D1,$7820;
move.w a0,$6268`. So `$7A88` names a *pending script* and this routine enters
it, with `$6266`/`$6268` bounding the script return stack that opcode `$05`
pops.

**`$0547C6` — message resume.** Reached by `bne.w` **branch**, not a call, from
`$051948`, so it runs on the dispatch loop's own frame and its `rts` returns to
the loop's caller. Its first instruction is `bmi.w $0004D7F0`, taken when
`$7B96` is negative — and `$054800`, at the end of this same routine, is what
writes `$7B96` = `$8000`. So `$7B96` is tri-state: zero (idle), positive
(resume here), negative (route to `$04D7F0`). The resume path clears `$7B96`,
sets `$7BA2` = 2, copies `$7B92` → `$7B98`, reloads the display timer
(`$0005 23B8` ← `$0005 23BA`, `$0005 23BC` = 1), and **sets `$7BA0` = 1** —
the gate the dispatch loop checks first at `$05193E`. It closes by re-arming
`$7B96` = `$8000` when `$7856` = `$83` and `$7126` is negative.

Adjacent in the same window, `$054808`/`$05481A`/`$054820` are a system-string
display helper built the same way: skip if `$7BA0` is already set, otherwise
`D1`×2 + `$00070000` (the **system string** table, as against the script table
at `$070080`) → `$7B98`, reload `$0005 23B8`, set `$7BA0` = 1.

Taken together, `$7B98` is the pending-message source and `$7BA0` its gate,
raised by three separate producers; `$0005 23B8`/`$23BA` are the message display
timer and its reload.

### No inline-native escape outside the decoded region (#136 item 2)

The `$08`/`$09` census asked for by #136 was already withdrawn in that issue as
a decoding artifact. Re-run independently here, `lab script` reaches 497 ops
from all 64 entry slots over `$070100`–`$072D2E` with **0 undecodable** and
`inlineNativeSites: []`. Two further checks bound it to the whole loaded image
rather than to one decode:

- The 32-bit immediate `$00070080` occurs **exactly once** in the 1 MiB image,
  at `$0547AC`, inside `$054764`. There is one script entry table and one
  instruction that reads it.
- `$00781E`, the resident script PC, is named by exactly one instruction
  (`$051956`), as #128 found.

So within the Working Authority at this checkpoint there is a single script
bank with a single entry table, and no reachable `$08`/`$09` site. **Mission
disks are not examined and remain a bounded unknown** — which does not change
the recommendation: an extract should still detect both slots defensively,
because one occurrence would desynchronise a linear parse.

### What was not required / not done

- Pressing `O` on a live `(OK?)` in-lab — not needed once the parked PC and
  decoded streams are in hand.
- Full ISA document / extractor — out of scope.
- Semantics of the native routines the handlers call (`$054848`, `$054764`,
  `$0547C6`, `$0004C6B2`) — **Resolved** by #136; see "The native routines the
  handlers call" above. What those routines *reach* is bounded in turn: the
  sound driver's remaining steps are catalogued only by shape, and `$04D7F0`
  (the negative-`$7B96` route out of `$0547C6`) is not decoded.
- Which `$7482` / `$7A42` / `$6FAA` records correspond to objects, craft, or
  places — Unresolved; that is the Gamma System question (#80), not this one.

## Host Callout effect census (category rows)

Against `BensonHostState` / `BensonEffect` concerns (not field-identical):

| Concern | Damocles evidence | vs Targ Host Callout |
|---|---|---|
| Play message | `$0001` inline text; the pending message is a long source pointer at `$7B98` plus the gate `$7BA0`, raised by `$14`, by `$0547C6`, and by the system-string helper at `$054820`, with display timer `$0005 23B8` (#136) | **would-map (concern)** — needs Damocles text encoding; the effect is resumable rather than synchronous |
| Wait / pacing | `$0007` tick waits; delay subs | **would-map (concern)** — tick unit Unresolved |
| Key / OK prompt | `$0002` / `$000B` after `(OK?)`; on match `$0B` requests sound at `$054848` (#136, guard ordering corrected in #287) | **would-map (concern)** — not proven identical to `pendingKey`, and the match requests sound without consuming the key; audible output depends on native guards and scheduling |
| Control flow | `$0003` jmp, `$0004` call, `$0005` ret | **interpreter-local** — not Host Callout fields |
| Random branch | `$000A` | **would-map (concern)** |
| Object / craft / room tests | Predicates over `$7482` records (`$0C`, `$21`, `$23`), `$7A42` words (`$14`), and bank words (`$18`); branch via the bit-6/bit-7 epilogue | **would-map (concern)** — needs a Damocles state map before fields can be named |
| Decimal / flags / inventory writes | Flag word `$7BD8` set/clear/test (`$10`–`$12`), counter `$7BD2` (`$16`, `$17`), record writes (`$0D`, `$15`), bank store (`$19`) | **would-map (concern)** — a flag word plus counters, not Targ's field list |
| Effects (sound, finished) | No dedicated opcode; scripts request sound by native call to `$054848` from `$0B` (key match) and from `$0E`/`$15` on record index `$00F8`. It may arm a one-shot PSG step through vector `$0004BF54` and returns immediately (#136, #287) | **would-map (concern)** — a fire-and-forget effect maps to the Targ method, but the effect *identity* is a PSG programme, not a named sound; re-authoring is required either way (ADR 0002) |

A future Damocles Host Callout would need its **own** seam: same *method* as
Targ, new field list after a full opcode census. Live Targ `BensonHostState`
must not be stretched. #136 removes the one row that previously read
**does-not-map**, so no concern in this census is now known to be unmappable in
principle.

## Implications for #82

- Script logic is a **real bytecode payload**, not only string tables — sizing
  a remake must budget for an interpreter + script extract, or for rewriting
  logic behind a new seam after a complete census.
- Slots `$08`/`$09` `jsr (a0)` **straight into the script stream**, so the
  interpreter can run inline 68000 code as part of a script. The full decode
  below found **no reachable use of either slot**, and #136 bounded that to the
  whole loaded image (one script table, one reader), so this is a latent
  capability rather than a live constraint; an extract should still detect them,
  because one occurrence would desynchronise a linear parse.
- The native routines the handlers call are **host effects, not hidden game
  logic** (#136): a guarded PSG sound request (`$054848`), a pending-script
  launcher (`$054764`), and a message resume (`$0547C6`). None of them
  interprets script bytes, so none of them widens the bytecode a port must
  understand — they widen the *effect list* the seam must offer, which is the
  cheaper of the two.
- The interpreter suspends itself on a message gate (`$7BA0`) rather than
  blocking, so a Damocles Host Callout needs a resumable message effect rather
  than Targ's synchronous one.
- Script arithmetic is **packed decimal** (`$0E`, `$15` run `abcd` over 6-byte
  BCD fields), so a port must either reproduce BCD semantics or prove binary
  arithmetic is observationally equivalent.
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
| Only instruction naming `$00781E` | `lab xref --address 0x781E` → one hit, `$051956` `movea.l $781E.w,a0` |
| Dispatch loop, table base, 37 entries | Working Disassembly of `$05193E`–`$051D80`; loop listing identical across three independent cold runs |
| Handler semantics and interpreter state | Same listing; table offsets re-derived from an exported `$050000`–`$054000` window |
| Working Disassembly pin | `scenarios/script-dispatch.json`, run `observe-script-dispatch-20260821T153758Z-16510c3c` |
| Native routines `$054764`, `$0547C6`, `$054848` | Working Disassembly of `$054700`–`$0556FF`; `scenarios/native-handlers.json`, run `observe-native-handlers-20260821T162713Z-2a6d1dd4` |
| Sound driver `$0004C556`, `$0004C6B2` and the shared tail `$0004C5EC` | Working Disassembly of `$04C400`–`$04D3FF`; `scenarios/timer-native.json`, run `observe-timer-native-20260821T163112Z-501efbc6` |
| Callers of `$054848` (7 absolute sites) | `lab xref --address 0x54848` on run `observe-native-handlers-20260821T162713Z-2a6d1dd4`; the eighth, `$051A86`, is a PC-relative `bsr` and so invisible to `xref` — read from the `script-dispatch` listing |
| Sole caller of `$0004C6B2` | `lab xref --address 0x4C6B2` → one hit, `$051D62` |
| `$0004BF54` read at `$051E0E` and `jsr (a0)` at `$051E14`; idle value `$00051E86` is `rts` | Bytes read from `observed.ram` of run `observe-script-dispatch-20260821T163011Z-697e5300` at `$051E00`, `$051E86`, `$04BF54` |
| Caller side (`$051A86`, `$051AEE`, `$051BAA`, `$051944`, `$05194C`, `$051D62`) re-confirmed | `scenarios/script-dispatch.json`, run `observe-script-dispatch-20260821T163011Z-697e5300` |
| 497 ops, 0 undecodable, no inline-native sites | `lab script --run observe-script-dispatch-20260821T163011Z-697e5300` |
| `$00070080` occurs once in the 1 MiB image, at `$0547AC` | Byte scan of `observed.ram`, same run |
| First-offer comparison, key-byte reset, dispatch/counter separation and sound guard ordering (#287) | Static recheck of `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`; [first-offer research](damocles-first-offer.md) |
