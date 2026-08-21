# Damocles script catalogue

What the Damocles Script bank actually contains, script by script, and the
authoring idioms the scripts are built from. Companion to
[`damocles-script-isa.md`](damocles-script-isa.md), which covers the interpreter
and the instruction set; this note covers the *programs*.

Working-Authority Evidence only. Authoritative Evidence remains bound to the C64
Reference Build. This note mints no glossary terms, adds no types to
`MercenaryKit`, and is not a payload, a schema, or an extract.

## Scope and non-goals

**In scope:** the inventory of script entry points and system strings, what each
script is for, and the recurring patterns scripts use to talk to the player and
to world state.

**Out of scope:** verbatim reproduction of game text (the strings are
Restricted Material — this note quotes short fragments and describes the rest);
per-operand semantics of every op; the native routines the handlers call
([#136](https://github.com/odogono/mercenary/issues/136)); which record indices
mean which entity ([#80](https://github.com/odogono/mercenary/issues/80)).

## Reproduce

| Item | Value |
|---|---|
| Program | `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` (SHA-256 `8d512ac6…08e9a2ef`) |
| Lab | `research/damocles-st/` |
| Scenario | `scenarios/script-dispatch.json` |
| Run | `observe-script-dispatch-20260821T153758Z-16510c3c` |

```sh
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/script-dispatch.json
research/damocles-st/lab script --run research/damocles-st/work/<run-id>
```

`lab script` walks the bank by reachability from its entry table and writes a
listing into the run directory. The listing is untracked Restricted Material;
this note carries the findings (`damocles-gap.md`).

Coverage of the decode this note is written from: **497 ops, 98.2% of the code
region `$070100`–`$072D2E`, nothing undecodable.**

## Two tables, not one

The bank opens with two 64-slot tables of bank-relative word pointers:

- **`$070000` — string table.** 64 slots into the string pool at `$072D2E`, on a
  `$32` stride. These are the engine's *system* messages, raised by native code
  rather than by scripts.
- **`$070080` — script entry table.** 64 slots to bytecode. This is the
  Damocles analogue of the C64 Benson entry table at `$0800`.

In both tables, repeated values are unused slots pointing at a shared target —
a jump table with holes. Several string slots repeat heavily (thirteen slots
share one death message, eight share another), which suggests the slot index is
a *cause code* and many causes collapse onto one line of text.

## System strings (`$070000` table)

Sixty-four slots, grouped by what they are for. Text is characterised rather
than reproduced.

| Slots | Purpose |
|---|---|
| `$00`–`$03` | Interaction refusals: locked, too heavy, vehicle key required, objects left behind |
| `$04`–`$09` | Environmental hazards and survival countdowns: cold, heat, no air, pressure, no room |
| `$0A` | The function-key menu legend (save / load / quit / return) |
| `$0B`–`$0D` | Trade and inventory refusals, including insufficient funds and arming explosives |
| `$0E`–`$0F`, `$13` | **Cross-title save import** — prompts to load a *Mercenary I* or *Second City* game by number, and a constraint that a *Mercenary I* load must be at the game's beginning |
| `$10`–`$16` | Save/transport refusals: non-winning save, transporter unavailable, craft not equipped for space, ship not refitted |
| `$17`–`$30` | Death causes: frozen, fried, suffocated, blown up, zapped — with many slots collapsing onto each message |
| `$31`–`$3A` | Combat and disk/flow notices, plus load-number and ready prompts |
| `$32`, `$3B`–`$3F` | Empty slots |

Two things worth flagging beyond the inventory:

- The **cross-title import strings are direct evidence that the original shipped
  save continuity between titles.** ADR 0021 records that reaching the Colony
  Craft in this remake does not load Damocles, and that fiction continuity is
  not session continuity. That decision stands, but it should now be read
  knowing the original did offer an explicit import path, so a future
  multi-title design is choosing to diverge rather than filling a gap.
- One string carries a spelling error in the original (`SUITUATION`). If
  Damocles ever ships here, that is a Preserved Quirk decision rather than a
  typo to fix silently.

## Scripts (`$070080` table)

All 64 slots resolve; the decode reaches every one. They fall into four groups.

### Arrival and tutorial (slots `$01`–`$06`, `$0A`, `$0B`)

The opening sequence: the arrival briefing, instructions to proceed by car along
the spaceport exit road, communications from the State President, keypad
operating instructions, and the craft waiting on the pad. Slots `$0A`/`$0B`
handle a security system triggering and a scolding for taking something.

The briefing script at `$070110` is the one the intro runs; it ends in the idle
jump-to-self at `$0703FC` that the resident PC parks in.

### Plot and faction messages (slots `$07`–`$1F`, `$3C`–`$3F`)

The bulk of the game's driven narrative, each opening with an attributed
header — State President, *ex* State President, department-store and insurance
chairmen, the tax collector, a solicitor's chief clerk, an estate agent, the
chief prison officer, the post office, a casino. Several report escalating
disaster news. This group is where the mission offers live.

### Place descriptions (slots `$20`–`$3B`)

One script per Gamma System location, each a short gazetteer entry with a
settlement date and a characterisation — mineral exploration, self-reproducing
machines, penal colonies, military bases, gas giants unsuitable for habitation,
currency reserves, way stations, a parliament, a yuppie colony.

**This is a direct lift for #80.** The scripts name bodies and cities
(ICARUS, MIDAS, ACHERON, DION, CLOTHO, VESTA, LUCAN, LOGOS, TRITON, HADES,
THALIA, JUNO, TOLOSA, PENN, TOR CITY among them) and several describe a place as
being *void*, which corroborates VOID as a place state in the celestial roster
rather than a body name.

### Author easter eggs (slots `$01`, `$14`–`$1A`, `$2A`)

A cluster about the author's computer and chair, a wish-granting crystal, and
warnings about uninformed use of the author's computers — including a
congratulation for destroying something you should not have.

## Authoring idioms

The patterns worth knowing before reading any listing.

### The `(OK?)` prompt

A prompt ending `- (OK?)` is followed by this shape:

```
reset.wait                     ; clear the wait counter
if.key <accept> -> <accepted>  ; scancode $15 or $18
if.key <decline> -> <next>     ; scancode $31
if.wait <ticks>  -> <re-poll>  ; timeout loops back to the first if.key
```

Both `$15` and `$18` branch to the same accepted path, and `$31` advances. On ST
scancodes those are **Y**, **O** and **N** — so the prompt accepts either Y or
O, and N moves on. `if.wait` re-polls rather than blocking, which is what makes
the prompt sit there indefinitely.

### The bargaining ladder

The assignment offer is a chain of `(OK?)` prompts with a rising reward. Each
declined offer writes the new figure and re-prompts:

```
record.write $00F9 $0010 …     ; ten million
message " DO YOU ACCEPT … - (OK?)"
…
record.write $00F9 $0015 …     ; fifteen million
message " WELL - HOW ABOUT FIFTEEN MILLION THEN? - (OK?)"
…
record.write $00F9 $0020 …     ; twenty
```

The figures are **packed decimal**: `$0010`, `$0015`, `$0020` are BCD 10, 15 and
20, matching the text. This is the clearest confirmation that Damocles money is
BCD — consistent with slots `$0E`/`$15` running `abcd` over 6-byte fields. Note
the record index `$00F9`, adjacent to the `$00F8` the interpreter special-cases,
so the high indices look like system rather than world records. #136 adds a
detail for #80: the `$00F8` special case in both `$0E` and `$15` does nothing to
the record itself — it fires the sound effect at `$054848` and falls through to
the ordinary BCD path.

### Timed delays are subroutines

Pacing is not an opcode. Scripts `call` into a bank of tiny subroutines at
`$072CD6`–`$072D2E`, each `reset.wait` / `if.wait <n>` / `return`, one per
duration. A script sequences narration by calling the delay it wants between
messages.

### Messages suspend rather than block

`message` sets the gate at `$7BA0`, and the dispatch loop returns immediately
while it is set. A script therefore does not wait for its own text; the
interpreter simply stops running until native code clears the gate. Any port
needs a resumable message effect for this.

#136 decoded the native side of that gate: the pending message is a source word
`$7B98` plus the gate `$7BA0`, and the resume path at `$0547C6` is what raises
them again after a prompt, reloading a display timer at `$0005 23B8`. The same
shape is used by a system-string helper at `$054820` reading the `$070000`
table. Scripts also fire a **sound effect** natively — `$0B` on a key match, and
`$0E`/`$15` on record index `$00F8`, all call `$054848`, which arms a one-shot
PSG programme and returns at once.

## Not decoded

- The 5 slots' worth of string-pool tail and the 1.8% of the code region no
  entry reaches — probably alignment padding and dead scripts, not shown to be
  either.
- What each `record.write` index means. `$00F8`/`$00F9` look like system
  records; the rest belongs to #80.
- Whether any script **on a mission disk** uses the inline-native slots
  `$08`/`$09`. Neither appears anywhere in this bank, and #136 bounded that to
  the whole loaded image — one script entry table at `$070080`, read by one
  instruction — but mission-disk media have not been examined. An extract
  should still detect both slots defensively: one occurrence would
  desynchronise a linear parse.
