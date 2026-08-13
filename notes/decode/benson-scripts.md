# Benson: the game-logic interpreter and its scripts

Benson is the Reference Build's own bytecode machine, and the game's logic is
written in it: the opening sequence, room events, structure approaches, kills, and
object descriptions are all scripts. Decoded by `c64lab/benson.py` into our own
instruction format (ADR 0015) and run by `BensonMachine` in the app.

Everything below was confirmed against our own Reference Build image. The
Reference Disassembly named the interpreter and its opcodes; the addresses,
widths, and semantics were then read off our own bytes, which is why the decoder
fingerprints them before trusting anything.

## The machine

| What | Where | Notes |
| --- | --- | --- |
| Program counter | `$1F` (word) | Every operand fetch is `(pc),y` |
| Return stack | `$BEC2`, pointer at `$E5` | Grows upward |
| Latched opcode | `$E7` | Read again by the branch epilogue |
| Engine flags | `$BEC0` | Bit 7 input detected, bit 6 script running, low six script-owned |
| Registers | `$57E0`, sixteen bytes | 13/14/15 are the map, object, and room selectors |
| Signed register | `$BEBD` | No Mercenary script reads it |
| Decimal registers | `$76E0`, sixteen slots of four packed-BCD bytes | Slot 8 is the bank balance, 9 the cash in the current room |
| Wait counter | `$E3` (word) | See "The clock" below |
| Message busy | `$E6` | Non-zero blocks the interpreter entirely |
| Interpreter | step `$8AB2`, start `$8A8C` | Dispatch table `$8D5E`, 2 bytes per opcode |
| Script entry table | `$0800` | 2 bytes per script, little-endian |

Decimal registers store the most significant digit pair at offset 0, while a
literal in the instruction stream is written least significant pair first — the
add walks the stream forwards while walking memory backwards, because BCD addition
has to start at the bottom. The live image's slot 8 reads `00 00 90 00`, which is
the 9000 credits play starts with; that value is exported as `decimalSeeds`,
because no script sets it.

## Instruction encoding

An opcode byte is `IJOOOOOO`: bits 0-5 index the dispatch table, bit 6 selects
jump-versus-call for a taken branch, and bit 7 is compared against the test's
result to decide whether the branch is taken at all.

Every conditional handler leaves its answer in the carry flag, and the shared
epilogue takes the branch when that answer *equals* bit 7. So bit 7 is not a
negation — it is "branch on this outcome" — and it is exported as `branchOn`
rather than as `invert`. Most handlers also report the *negative* of what their
name suggests: `room` answers "the room register does not match", `tstf` answers
"no bit of the mask is set", `tstc` answers "this is not the craft you are
aboard". The two conventions cancel out in real scripts, which is exactly how a
plausible-looking misreading would survive, so the decoder keeps the machine's
sense and the interpreter documents each predicate.

Operand widths are fixed per opcode. The exception is `msg`, whose text is inlined
into the instruction stream and terminated by zero, in the same token vocabulary
as the message table (see [text-tables.md](text-tables.md)) — which is how the
intro text is addressed, answering the question that file left open: it has no
table index at all, only a position inside a script.

A taken branch's target is the two bytes after the operands. A conditional *call*
pushes the instruction's address plus three whatever its real width, so only the
three-byte conditionals survive being called; the decoder refuses a wider one
rather than emit a return address pointing into an operand. No script in the
Reference Build does this.

## Opcodes

Thirty-four dispatch slots, `$01`-`$22`; slot `$00` crashes the interpreter. The
scripts use twenty-nine of them. The other five — `cmpl` `$06`, `ldf` `$08`,
`func` `$09`, `adds` `$16`, `cmps` `$17`, `tstv` `$1F` — call native code or read
state we have not modelled, and the Reference Disassembly marks them unused in
Mercenary 1. Our own decode confirms it: no script reaches one, and the decoder
stops if one ever appears.

Output and messages: `msg` `$01` inline text; `msgi` `$14` by table index, or from
a register when the operand's high bit is set; `msgr` `$1B` plays `base +
(random & mask)`, and falls through into the key clear when that comes out zero.
Control: `jmp` `$03`, `call` `$04`, `ret` `$05`. Clock: `wfr` `$07`, `cfr` `$02`.
Tests: `rand` `$0A`, `tstk` `$0B`, `tsti` `$0C`, `tstf` `$12`, `room` `$13`,
`cmp` `$18`, `tstb` `$1A`, `inrm` `$1D`, `tsto` `$21`, `tstc` `$22`. State:
`ldr` `$0D`, `adr` `$0E`, `loadi` `$0F`, `setf` `$10`, `clrf` `$11`, `dadd` `$15`,
`stor` `$19`, `load` `$1E`, `modf` `$20`, `clrk` `$1C`.

Two side effects worth knowing: writing register 13 also formats the city location
into the Reference Build's readout, and `tstk` consumes the key and sounds a tone
when it matches.

## The clock

`wfr` operands are **not** video frames. An interrupt at `$BA6C` tallies frames
and advances the counter at `$E3` every fiftieth one, so on a 50 Hz machine one
unit is one second. `wfr` also spins until the counter moves before comparing, so
every execution costs at least one unit — which is what makes a poll loop built
from one cost real time rather than spin freely. Operands are exported unchanged as
`ticks`, with `framesPerTick` alongside them; the app converts, with a time scale
for feel.

## Script table: fifty-one, not forty-five

The table has no terminator, and its length is fixed by where the first script
body starts. Our image's lowest entry is `$0866`, which puts the table at
`$0800`-`$0865` — **fifty-one entries**, six more than the Reference Disassembly
resolves. All six extra entries (`$0C1F`, `$0C35`, `$0C46`, `$0C56`, `$0C97`,
`$0CAB`) decode as valid, otherwise-unreachable code, and adding them drops the
unreachable byte count from 146 to 8. The decoder asserts the table ends exactly
where the lowest entry begins, so a wrong count cannot pass as script data.

Bodies run `$0866`-`$1249`, 494 instructions over 2523 bytes. Scripts share
subroutines and five of them share one entry point, so they are entry points into
one program rather than separate programs; the decoder walks all entries and
decodes each instruction once. The eight bytes nothing reaches are dead code: an
uncalled three-tick wait helper at `$0A96` and a stray `ret` at `$0B15`.

## The symbol census

This is the whole surface the scripts touch, and therefore the specification of
the app's Host Callout. Anything not on it stops the export.

Read through `cmp` (one site): `decimalByte` — the millions pair of the bank
balance, the Reference Build's affordability check before it despatches a hired
ship.

Written through `stor`: `objectRoom` (slot 46, moving the reward into the red
hangar), `messageInterval` (`$00E1`, retiming the message line — the endgame
slows it), `attackingShip` (`$BEF8`), `gameComplete` (`$BEFE`), `shipInbound`
(`$BEFF`). Sound is `stor` into the SID range, exported as named registers the app
may ignore; the scripts use two, both voice controls.

Keys: one. `$19` is Y, fixed by the script that prints "PRESS Y TO LAUNCH" beside
it. Prompts offer no key for "no" — they time out instead, so a player who says
nothing has answered.

Indexed tables are named structurally, symbol plus slot, because a script
addresses one object's row directly while the app holds a collection.

## Script 00: the opening

The whole opening sequence, and the answer to how the intro text is reached. It
sets flags on objects 1, 7, and 12; plays "CRASH IMMINENT," and "RETURNING TO -
- - MANUAL CONTROL"; picks one of four landing verdicts at random (`msgr` base
60); clears the input flag; then delivers the status report from "CRASH LANDED ON
TARG" through "PRICE 5OOO CREDITS" and "YOU HAVE {number0} CREDITS".

Then it argues with you. A subroutine polls for Y with a five-second timeout and
sets flag bit 0 if pressed; between attempts the script tries "I THINK YOU SHOULD
BUY", "IS THIS SENSIBLE", "YOU PLAN TO WALK", "YOU MUST BE CRAZY". Pressing Y
adds `99995000` to the balance — the ten's complement of 5000, which is how a
machine with no subtract charges you for the Dart. Pressing anything else raises
the input flag, which the script reads as "IT WILL BE A LONG WALK". Press nothing
at all and it works through "IS ANYBODY THERE", "AM I TALKING TO MYSELF", "ARE YOU
STILL ALIVE", "WHERE ARE YOU" and then waits indefinitely.

Both paths end at the same place: a two-instruction loop testing whether you have
boarded craft 1. It never blocks, which is why the interpreter needs an
instruction budget to stand in for the frame boundary the original had for free.
The script finishes when you board the Dart.

## Open questions

- **Message scroll granularity.** The scroll interrupt at `$8DC3` compares its
  frame tally against `$E1`, whose live value is 125 — two and a half seconds. That
  is far too slow for one character and plausible for one word, so the unit is not
  settled. The app reveals characters at a tunable rate and treats a script's
  write to `messageInterval` as a *relative* retiming, which preserves what the
  script means without adopting a granularity we have not established. Worth a
  side-by-side ruling.

  The rate, the reading hold, and the script timing scale are all in
  `settings.json` at the repository root, so settling this is a matter of playing
  and editing rather than editing and rebuilding. None of the three is a decoded
  value: script timing scales the Reference Build's own pacing, while the hold is
  time given to the player to read and is deliberately not scaled with it.
- **How the engine starts script 00.** The intro proper was stripped from the
  Reference Disassembly, and we start it at launch. The other triggers — room
  entry, structure approach, kill, object examine — are visible in the engine and
  belong to the later steps that need them.
- `$0E` and `$6D` remain the only unresolved character codes; `$00`-`$09` turned
  out to be the digits, which the numeric emitter settles (see
  [text-tables.md](text-tables.md)).
