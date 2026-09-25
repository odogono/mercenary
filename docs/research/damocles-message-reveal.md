# Damocles message reveal: the display routine and what the duration divides between

Working-Authority Evidence for [#307](https://github.com/odogono/mercenary/issues/307), recovered
2026-09-17. The native routine on the other side of the message gate `$7BA0` is **`$052402`**,
called once per display frame from the frame interrupt. It scrolls a fixed row of **48 six-pixel
character cells** leftwards by **eight pixels every frame** for **36 frames**, copies the finished
row into the other screen buffer on the 37th, holds it for the rest of the duration, and only then
lowers the gate that the Damocles Script interpreter is suspended behind. A message arrives from the
right; nothing about it is centred, faded, typed or paged, and no input ends one early.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not
translation of the Working Authority into application code. Captures, RAM, native listings and the
row's own pixels remain ignored Restricted Material under `research/damocles-st/work/`, consistent
with the [research boundary](damocles-gap.md); the message text is Data Payload under
[ADR 0029](../adr/0029-track-the-data-payload-in-the-private-repository.md). Only decoded structure,
counts and hashes are recorded here.

## What was already established

[The pickup note](damocles-limo-key-pickup.md) recovered the script side: the text pointer at
`$7B98`, the display timer `$0523B8` loaded from bank word `$070102` (`$00C8`), and the gate `$7BA0`
raised as `$0001` by the message opcodes and observed reading `$FFFF` while a message presented.
[The strings note](damocles-script-strings.md) recovered the records themselves — 36 distinct system
strings on a pointer table and 206 inline messages, ASCII, NUL-terminated, no markup, 0 to 49
characters, with their padding stored rather than stripped. [The display-rate note](damocles-display-rate.md)
settled the frame at 50 Hz. This note adds the consumer and closes the reveal model.

## Reproduce

From the repository root:

```sh
research/damocles-st/lab doctor --roms /path/to/roms
python3 research/damocles-st/scripts/message-reveal-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/message-reveal-probe.py --roms /path/to/roms --case reveal
research/damocles-st/lab xref \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d --address 0x7B98
```

Static recovery reads bounded windows of the pinned first-world capture
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` (SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`) with Capstone's M68K 68000
big-endian decoder.

The tracked [message reveal probe](../../research/damocles-st/scripts/message-reveal-probe.py) runs
in two processes. The first replays the tracked [pickup route](../../research/damocles-st/scenarios/limo-key-pickup-route.json)
or [no-key route](../../research/damocles-st/scenarios/limo-no-key-route.json) from
`snapshots/eris-spaceport-onfoot.sav` and saves whole-machine state while the response is running.
The second boots that state, arms one breakpoint, and then stops on **215 consecutive VBLs**,
saving the message workspace, the routine's own variables and the row's six scanlines in both screen
buffers at every stop. Splitting the two is not cosmetic: a route stop/continue landing inside a
breakpoint script wedges Hatari's debugger, and the traced process issues no route commands at all.
The `keys` case samples instead of tracing, for the reason given under
[early completion](#early-completion).

Only structural comparisons of the row leave the run directory — whether frame *n* equals frame
*n−1* shifted left by eight pixels, and how many pixels are lit. The pixels themselves are game
text and stay ignored.

## The routine

`$052402` is entered by `bsr.w` from **`$051E1E`**, in the frame interrupt, a few instructions before
the `addq.w #$1,$7B9C` that [the pickup note](damocles-limo-key-pickup.md) measured at exactly one
per VBL. It is the only `bsr` or `jsr` to it anywhere in resident RAM.

```text
$052402  tst.w $7BA0            gate lowered -> return, this is the whole cost between messages
         bpl   $0523C6          gate positive ($0001, just raised by a handler) -> begin
$05240A  addq.w #$1,$7BE6       otherwise the gate is $FFFF: age the presenting message
         cmp.w $0523B8,d0       counter reached the duration -> $0523BE, next block or finish
         cmpi.w #$25,d0         counter is 37 -> $052638, copy the row into the other buffer
         bgt   $0523EC          counter is past 37 -> silence channel A and return
         bsr   $05234C          counter is 1..36: fetch the next character
         ...                    pitch channel A from it, then scroll and draw
$0523C6  move.w #$0,$7BE6       begin: counter 0, gate $FFFF, sub-cell shift $FFFE
$0523BE  tst.b (a1)             at the duration: text left -> begin again, else finish
$0523DC  move.w #$0,$7BA0       finish: lower the gate, clear the row plane, silence channel A
```

`$7BE6` is the reveal counter and `$0523B8` the live duration. The gate's three values are the
whole protocol: `$0000` lowered, `$0001` raised by a handler and not yet seen, `$FFFF` presenting.

**The gate suspends the interpreter.** `$05193E`, the Damocles Script dispatch head, returns
immediately while `$7BA0` is non-zero, so a script that raises the gate executes nothing further
until this routine lowers it.

## The row

Geometry is read out of the routine and confirmed by the traces.

| Fact | Value | Where |
|---|---|---|
| Row base | the long at `$042C00` (the screen base), `^ $10000`, with its low word replaced by `$DA08` | `$05246C`–`$052478` |
| Screen base in the captures | `$068000` at `$042C00`, so the row alternates `$06DA08`/`$07DA08` | observed |
| Position | scanline **144**, x **16**–**303**, six scanlines tall | `$5A08 = 144 × 160 + 8` |
| Width | 18 interleaved groups × 16 px = **288 pixels** | the `movep` block, `$052488`–`$0525AD` |
| Bitplanes touched | **0 and 1 only** — bytes 0..3 of each eight-byte group | every `movep` slot |
| Glyph table | `$076300 + code × 8`; codes `$20`–`$5A` occupy `$076400`–`$0765D7` | `$0525D2` |
| Glyph shape | six rows, **five pixels** wide (no row exceeds `$1F`); bytes 6–7 are `$FFFF` filler | observed |
| Character pitch | **six pixels** — `asl.w #$6` reserves six bits per character | `$0525E8` |
| Row width in characters | 288 / 6 = **48** | derived, confirmed below |

`$7BA2` is added to the destination before the glyph store, and the only values it takes are `0` and
`2` — byte offsets that put the glyph in **plane 0** or **plane 1**, so it selects the row's colour
(index 1 or index 2) rather than its position. It is cleared when a message finishes.

## The reveal

**Direction: right to left. Unit: eight screen pixels. Rate: one unit per display frame. Extent: 36
frames, which is the whole row.**

Each of frames 1 to 36 runs the unrolled `movep` block at `$052488`, which copies every eight-pixel
column of the six scanlines from the previous frame's buffer into the column one to its left, clears
the rightmost column, and draws one composed cell there. The composition at `$0525E2`–`$052630`
takes the previous and current glyphs, packs them as `prev << 6 | cur`, and shifts right by a
sub-cell amount held in `$0523B6` that cycles **4, 2, 0** and then re-fetches — the residue of
advancing eight screen pixels through a six-pixel character stream.

So the row is a 288-pixel window on the record's glyph stream, and the stream enters it at
**4/3 characters per frame**. Over 36 frames that is exactly **48 characters = 288 pixels**, and the
first character of the record comes to rest in the leftmost cell.

The traces measure both halves of that independently:

- the text pointer `$7B98` advances **2, 1, 1** and repeats, in every frame of every traced message
  — four characters per three frames;
- the row's pixels satisfy `row(n)[x] == row(n−1)[x + 8]` on **every** frame of the pass, and on no
  frame outside it.

There is **no centring**: character *k* of the record lands in cell *k*. Padding a record on the
left is therefore how the original centres a line, exactly as the strings note left it, and the
`$32A6` record's 49 spaces are a full-width line clear rather than a statement with a leading run.

### Records shorter and longer than the row

Short and long are both handled by the character fetch at `$05234C`, not by the frame driver.

- **At the terminator** (`$052398`) the fetch returns a **space** and backs the pointer up so it
  stays on the NUL. A record shorter than 48 characters therefore keeps arriving as blanks until the
  pass ends, and comes to rest left-aligned with the remainder of the row blank. Nothing is
  truncated and nothing wraps.
- **At the duration** (`$0523BE`) the routine re-reads the pointer. If a character is still there it
  resets the counter and presents **another 36-frame pass from where the pointer stopped**; only an
  exhausted record lowers the gate. A record longer than 48 characters is therefore shown in
  48-character blocks, each one scrolling the previous one off.
- **A 49-character record is the only long case the bank holds**, and its second block carries one
  character and 47 blanks — which is to say it wipes the row. The `system` trace below catches one
  of those records and runs straight through the join.

### Numeric fields

A character of `$61` or above is not text. `$052356`–`$052396` treats it as an index into an
eight-byte-strided table at `$00793A`, reads a packed-BCD long from it, and returns **one decimal
digit per call** with leading zeros suppressed, parking the pointer on the code byte until the field
is spent. It is a variable-substitution facility.

**No record in the resident bank uses it.** The strings note found no byte above `$5A` in any of the
270 records, so this path is recovered and unexercised, and nothing in the limo-key response reaches
it.

## What the duration divides between

`$0523B8` counts **display frames**, one per VBL: `$7BE6` and the script wait counter `$7B9C`
advanced by exactly the same amount at all 215 stops of every trace, and `$7B9C` is the counter
[#298](https://github.com/odogono/mercenary/issues/298) measured against VBLs and
[#305](https://github.com/odogono/mercenary/issues/305) settled at 50 Hz. The open question in the
pickup note is closed: **frames, and 200 of them is 4.00 s.**

For the contract's 200-frame messages the division is

| Frames | Phase |
|---|---|
| 1 | the gate turns from `$0001` to `$FFFF`; nothing is drawn |
| 1–36 | arrival: 36 eight-pixel scrolls, one per frame, with one tone per frame |
| 37 | the finished row is copied into the other screen buffer (`$052638`); channel A goes silent |
| 38–199 | reading hold: the row is not touched and both buffers agree |
| 200 | the gate is lowered and the interpreter resumes; **the row is left exactly as it is** |

There is no departure phase. A message stays on the row until the next one scrolls over it, which is
why the response ends by presenting a record of 49 spaces rather than by clearing anything.

### The one exception: the shorten flag

`$0523BC`, set by the native system-string helper at `$054808` and by nothing else, makes the
terminator shorten the live duration to **50 frames** (`$0523A2`) — every frame after the record
runs out, not once. A native message therefore ends at counter 50 rather than 200: about thirteen
frames after the last of its text has arrived, or almost immediately if the record ran out in an
earlier block. The flag is cleared when the message finishes. The `system` trace shows both halves:
a 49-character record whose first block never reached the terminator held the full 200 frames, and
its second block dropped to 50 on the frame the terminator was read.

**The four messages this contract presents do not use it.** All three inline messages and the
indexed clearing line are raised by script opcodes, which leave `$0523BC` at zero, and all four were
observed holding the full 200 frames.

## Who raises the gate

| Site | Raised by | Duration used | Pointer |
|---|---|---|---|
| `$0519CE` | script opcode `$01`, inline text | bank word `$070102` | the text in the instruction stream |
| `$051B90` | script opcode `$14`, indexed | bank word `$070102` | system string table, **plus one** |
| `$051C68` | script opcode `$1B` (`$051C2C`), which draws its index from the stream at `$7E18` | bank word `$070102` | system string table, **plus one** |
| `$0547EC` | the deferred path behind `$7B96`, which also sets `$7BA2` to 2 | `$0523BA`, the default 200 | `$7B92` |
| `$054840` | the native system-string helper, refused outright if a message is already presenting | `$0523BA` | system string table |
| `$0550CA` | the blocking helper, whose callers spin on the gate | **50**, written directly | system string table |

**The `$14` and `$1B` opcodes advance the published pointer by one byte** (`addq.w #$1,$7B9A`, the
low word of the pointer long), so they display a system string record from its **second** character;
the native helpers display it from its first. The trace confirms it: the clearing line's record
begins at `$0732A6` and the opcode published `$000732A7`, and 48 of its 49 spaces were consumed —
which is exactly the row.

This asymmetry is harmless in this bank and should not be smoothed over. All 14 indexed sites carry
operand `$0032`, so slot 50 — 49 spaces — is the only record either opcode ever names, and a lost
leading space is not observable. It would be observable on slot 10, the one record that begins with
a letter, and no reachable script names it.

## Early completion

**No input ends a presenting message.** A linear decode of all resident RAM at both instruction
alignments finds exactly fifteen instructions that name `$7BA0`, and the only one that lowers it is
`$0523DC`, inside this routine, reached only when the counter reaches the duration with the record
exhausted. `$7BE6` is likewise written from nowhere else. No keyboard handler, joystick path or
script opcode can shorten, skip or cancel a message; the blocking helpers at `$055092`–`$0550A4`
spin *waiting* for the gate rather than clearing it.

The `keys` case holds that against ordinary play. Space, Return, Escape, Left Shift, Control, Left,
Right, Undo and the joystick fire bit were all held down from the moment the response resumed, and
the response ran to completion unchanged: message 2 and message 3 each reached counter 200, the
`$04` delay call ran its 200 frames, the clearing line reached counter 200, and the interpreter was
back at the idle jump with its busy flag clear. Nothing was shortened, skipped or cancelled.

The first run of this case, `message-reveal-keys-20260917T132426Z-1b9b746b`, held `1` instead
of Escape. The probe sent make code `$01` as `keydown 1`, which Hatari reads as the host
character `1`. It now sends `01`. The re-run `message-reveal-keys-20260924T151542Z-b261bf7a`
holds a real Escape, and each of its nine samples matches the first run's message pointer,
script program counter, busy flag and shorten flag. The reveal counters differ by at most five,
which is sampling jitter.

That case **samples rather than traces**, at nine points across the response. The trace mechanism
could not be used for it: in this harness a breakpoint chain does not arm once inputs are held, and
any command reaching the command FIFO around the arm wedges the debugger before the first stop
resumes. Second granularity is enough for what the case has to answer — an input that ended a
message early would move the whole response by seconds, not by a frame — but it is a weaker
observation than the traces, and the exhaustive scan above is what actually answers the question.

Damocles has no equivalent of Targ's `SKIP_MESSAGE_CODE`. That is a recovered absence, not an
unexplored one.

## Sound

The reveal is audible. On each of frames 1 to 36, the character fetched that frame sets the
YM2149's channel A fine-tune period (register 0) to **twice its character code** and channel A's
volume (register 8) to **12**; a space sets the volume to 0 instead, and every frame past 37 sets it
to 0. The writes are to `$FFFF8800`/`$FFFF8802` directly, gated on `$033F68` being zero — it is
zero in every capture, and non-zero diverts the frame interrupt to an installed driver at `$033F6A`.

This is recovered statically. Hatari runs with sound off in this laboratory, so **no audible output
was observed or is claimed**, exactly as for [the pickup path's sound request](damocles-limo-key-pickup.md).

## Observed traces

Every trace is 215 consecutive VBLs from one breakpoint, in a process that replays nothing. The
`keys` case is sampled rather than traced, for the reason given above, and is listed separately.

| Trace | Record | Frames whose row changed | Pointer advance | Duration | Gate lowered |
|---|---|---|---|---|---|
| `reveal` | script slot 2's third inline message, 46 characters | 2–37, all 36 | 46 bytes, then parked on the NUL from frame 35 | 200 | frame 201, counter 200 |
| `clear` | system string slot 50 via opcode `$14`, 49 spaces | 2–36 | **48 bytes** — the full row | 200 | frame 201, counter 200 |
| `system` | the boarding refusal, a **49-character** record via the native helper | 12–37 and 202–214 | 48 bytes in the first block, the 49th in the second | 200, then **50** | not within 215 frames |

Every change on every one of those frames is an exact eight-pixel left shift, and **no frame outside
them changed the row at all**. In the two traces that finished a block, the two screen buffers held
identical rows from frame 38 — the frame after the scroll stops — and stayed identical for the rest
of the hold. The text pointer advanced **2, 1, 1** and repeated, in every frame of every trace.

The `system` trace is worth reading in full, because one pass of it shows the whole over-length
story:

| Frame | Counter | What happened |
|---:|---:|---|
| 0 | 0 | the helper's gate is `$0001`; the pointer is the record's **first** byte, not its second; the shorten flag is already 1; the row is blank |
| 1 | 0 | the gate becomes `$FFFF` |
| 2–37 | 1–36 | 36 scrolls consume **48** characters, leaving the pointer on the 49th; ink first appears on frame 12, which is the record's own 14 leading spaces arriving |
| 38 | 37 | the row is copied into the other buffer |
| 38–200 | 37–199 | held; the duration is still 200 because the terminator was never reached |
| 201 | 0 | the counter resets and the gate stays raised: a **second block** |
| 202 | 1 | the 49th character is consumed, the terminator is reached, and the shorten flag drops the duration to **50** |
| 202–214 | 1–13 | the second block scrolls the row away |

Three further observations are worth stating as their own facts.

- The `clear` trace's row ink falls to **zero** and stays there. A record of spaces is a full-width
  line clear, observed rather than inferred — and the pointer it was handed was `$000732A7`, one
  past the record's start, so 48 of its 49 spaces were shown.
- The script resumes the frame the gate falls. In the `keys` samples the response ran on to the
  `$04` delay call, the clearing line and the idle jump without a pause.
- The `keys` samples, taken with eight keys and the joystick fire bit held down throughout: message
  2 and message 3 each reached counter 200, the delay call ran, the clearing line reached counter
  200, and by 15 s the busy flag was clear and the program counter was back at the idle jump
  `$0703FC`. The response was neither shortened nor extended.

## Display state a save must carry

At a stop inside a message the routine's whole state is the eight words below, and every one of them
is either constant for a given message, derivable from the frame counter, or already carried by
`Presenting` — with a single exception.

| Value | What it is | Needed in a save? |
|---|---|---|
| `$7BA0` | the gate | Yes — it is `Presenting` being non-null |
| `$7B98` | the text pointer | Yes, as a record id plus the offset the current block started at |
| `$7BE6` | the reveal counter | Yes, but it is already `messageFrames − remainingFrames` |
| `$0523B8` | the live duration | Yes when the shorten flag can change it; constant at 200 here |
| `$0523BC` | the shorten flag | Yes for native messages; always 0 for this contract's four |
| `$0523B6`, `$0523B2` | sub-cell shift and previous-glyph pointer | No — both are a function of the counter |
| `$7BA2` | the row's colour plane | Yes, one bit; always 0 for this contract's four |
| the row's pixels | what is actually on screen | **Yes, and not derivable** — see below |

The one genuinely independent piece is what the row held when the message began. A message scrolls
over its predecessor rather than onto a blank row, so at counter *n* the row is the last 288 pixels
of *(the previous row) ++ (the first 8n pixels of this record)*. A restore that starts from a blank
row is visibly wrong for the first 36 frames of every message after the first.

### A recommended shape for `Reveal`

The contract's `Reveal` is `unknown` and is required to be JSON-compatible, validated, and
consistent with `remainingFrames`. The recovered model makes a small shape sufficient:

```ts
/// The message row as $052402 keeps it: a 288-pixel window, 48 six-pixel cells
/// wide, that the record's characters enter from the right eight pixels per frame.
type Reveal = {
  /// Pixels of this block's character stream already inside the row. Advances by
  /// 8 each frame and stops at 288, which is the whole row. Always a multiple of 8.
  readonly pixels: number;
  /// The character offset into the record that this block started from. 0 for
  /// every record this contract presents; non-zero only for a record longer than
  /// 48 characters, which needs a second block.
  readonly offset: number;
  /// The 48 characters the row showed when this block began, which the message is
  /// scrolling over. Spaces for a row that was blank.
  readonly beneath: string;
};
```

Validation a restore can refuse on, all of it recovered rather than invented:

- `pixels` is an integer in `0..288` and a multiple of **8**;
- `pixels === Math.min(288, 8 * (messageFrames - remainingFrames))` — the cross-check that makes a
  hand-edited counter and a hand-edited reveal disagree;
- `offset` is an integer in `0..len(record)`, and `len(record) - offset <= 48` unless the record is
  long enough to need another block;
- `beneath` is exactly **48** characters of printable ASCII, the same alphabet the strings payload
  validates.

Three consequences for the contract, stated so they are decided rather than discovered later:

1. **`Reveal` is not a revealed-character count.** The issue expected one, and the row is indeed
   never scrolled through — but the reveal advances eight pixels while a character is six, so for
   two frames in every three the row's left edge falls inside a character. A cell-granular reveal is
   a visible departure, not a rounding.
2. **The four messages all hold the full 200 frames**, of which only the first 36 are arrival. A
   renderer that spreads the reveal across the whole duration is wrong by a factor of five and a
   half.
3. **The response's `clear-line` step is a 48-character blank scrolling the row away over 36
   frames**, not an instantaneous clear, and its 200 frames are part of the 1000 the contract already
   counts.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus reproduced runtime observation): `$052402` as the routine, its
single caller in the frame interrupt, and the gate's three values; the row's position, its 288-pixel
width, its six scanlines and its two bitplanes; the eight-pixel-per-frame right-to-left scroll for
36 frames and the buffer copy on the 37th; the 4/3-characters-per-frame consumption and the
six-pixel pitch; left alignment with no centring; the terminator returning spaces so a short record
rests left-aligned; the second block for an over-length record; the shorten flag cutting a native
message's duration to 50; the `$14` opcode's one-byte pointer skip; the duration counting display
frames in lockstep with `$7B9C`; that no input ends a message; that the interpreter is suspended
behind the gate and resumes the frame it falls.

**Derived from instructions, not reproduced at runtime**: the numeric-field expansion at
`$052356`, which no record in the bank exercises; the per-character channel A writes, since this
laboratory runs with sound off; `$7BA2 = 2` as a second row colour, reached only by the `$7B96`
deferred path that this response never takes; the blocking helpers at `$055092`–`$0550A4`; the
`$1B` random-index opcode's pointer skip, which no reachable script uses.

**Recorded as a laboratory limitation rather than a program fact**: the held-input case is sampled,
not traced, because a breakpoint chain does not arm under held input in this harness.

**Resolved since, by [#514](damocles-sound-programmes.md#what-arms-each-programme)**: `$7B96` is
raised when a page of a readable object is selected (`$04D788`), and the `$7856 = $83` / `$7126` test
at `$0547F2` is the BOOK (slot `$83`) with the MAGIC CRYSTAL carried, which queues the page's action.
So the second row colour is a readable object's page. **Unresolved**: whether any bank loaded from
disk carries a record above `$5A` and so exercises the numeric fields; and, as a laboratory matter
rather than a program one, why Hatari's `VBL` debugger variable does not keep step with the
program's frame interrupt across multi-VBL gaps in this scene — the traces here avoid it by stopping
on every VBL and reading the program's own counters.

## Smallest faithful implementation boundary

Nothing in the application changes in this issue. What the recovered model asks of
[#300](https://github.com/odogono/mercenary/issues/300) is small and self-contained: a 48-cell row
that a record enters from the right at eight pixels a frame for 36 frames, holds for the rest of its
duration, and never clears; the `Reveal` shape above in the Save Snapshot; and the clearing line
treated as an ordinary message rather than a blanking operation. The sound is a separate
PresentationEvent question and is outside this contract.

## Evidence identities

All hashes are SHA-256. Laboratory machine: ST, 1 MiB; program and TOS images are checked against
[`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Input | Hash |
|---|---|
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| `eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| Tracked pickup route | `b03c447a85b59ec9ce0bec73f0a035e032c8a46b1e7aa62ff22a5148c8951b0d` |
| Tracked no-key route | `8afde370bedb3118168cfc49c6c348231226ec4b697955105399b33c1bffac5c` |
| Tracked probe | `1a59b06b37530b548b3d453fe3f277d6f848f6c34ea5dca0243366b93fb93228` |

Source ranges read for this note, hashed in the pinned first-world capture:

| Range | Hash |
|---|---|
| Character fetch `$05234C`–`$0523B1` | `52902629f39503d2a6b3fd0ee0413fd11d4dabc538fa9e9dfdf4460216052ae4` |
| Display variables `$0523B2`–`$0523BD` | `d3f20e56b12cef97130a69aa9aaeaf9ab66e6a95a193959309a53e164e933faf` |
| Block advance `$0523BE`–`$052401` | `f16ad98058094d534966d8f1c8d8c620df3c4f94997d5f6366ca521714f4c440` |
| Frame driver `$052402`–`$052637` | `132ef9a5a9d85164ba53f79ab96ad01f3ff8a4598b1352cbf74caf26ae962936` |
| Buffer copy `$052638`–`$0526C1` | `24d757d5f092e30ed73cac51a3f324fe74dc23723236859ee71835b5ea74d94e` |
| Glyph table `$076400`–`$0765D7` | `8332b28c0aa1f7931f619106a5c5e364a41b77ef7f4452dbb92fe2bf39ba6d42` |
| Interpreter gate `$05193E`–`$05194B` | `a58ec29258d6226267b8afe4e7ff33eedfa1afee2814a1d57dcf17f4fbe5df7b` |
| Script message opcodes `$0519BC`–`$0519DF` | `fc70cf8afd8ad567fc6cbc73b8fd08090c4f9906466cb635c6c53495f55f39af` |
| Indexed message opcode `$051B5C`–`$051B97` | `92dbc321fa3316a3665fbd971678cb0460edcd0091302498cfff1a9478838aec` |
| Frame-interrupt call `$051DFE`–`$051E25` | `cb89de20c4e0bc36e47b90440d5f510230d060889dc927c367b7ba59309cf6c2` |
| Native message helpers `$0547C6`–`$054847` | `d8fd8bcb6d9b27ecdffa0c6fc1007a85491c40accb13e68bc7a5d0334b9477fa` |
| Blocking message helpers `$055092`–`$0550D1` | `84e2a1503fed9c0b38db8a3bf4236a4e9e50a20ad4a070eaa31137ae60bbb7e4` |

Runs under `research/damocles-st/work/`. Hatari 2.6.1 (binary
`05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`), Python 3.13.15. Each run's
`result.json` records the case, every stop's decoded state and structural row comparison, the image
hashes and the toolchain.

| Run | `result.json` hash |
|---|---|
| `message-reveal-reveal-20260917T132316Z-bca08269` | `692f2cc59f79a1c579eb172cb9909b662139a72061a9699c8cc596c1f63e3554` |
| `message-reveal-keys-20260917T132426Z-1b9b746b` | `d35d4f2dc0cce59b1d766a5052847aba15420f01110e6536323bb430aa2c6a1f` |
| `message-reveal-keys-20260924T151542Z-b261bf7a` (Escape corrected) | `cdaef1972c2068221e22ddbf348021772757f0b175244fb8573e10f834371a0f` |
| `message-reveal-indexed-20260917T132615Z-a6b8b6b5` | `6cc21eb2ec36bdb5c81b247885191130484b2670b2ba44c60a7ef93fde6bcbc7` |
| `message-reveal-clear-20260917T132729Z-21784d96` | `00e91a5c9693f276987b96cef5639a24e126e238b3fdac125c2794b82f815c29` |
| `message-reveal-system-20260917T132846Z-cc35752d` | `21a59d64909ba2416823f0ea26d741dcf3c276adfd385b5adac54b79796c7446` |

All five cases reached their message on the first attempt of the run that produced these, from one
invocation with no arguments but `--roms`.

### Claim boundary

These are ordinary gameplay observations of the original program running in Hatari, sampled while
the emulator is stopped on its own frame interrupt. The route stops the player at a slightly
different position on every run and the take is supplied on a host-scheduled timeline, so these
establish per-frame display behaviour, not frame-exact input timing. Hatari runs with sound off, so
the per-character tones are recovered from instructions and no audible output is claimed. The
exhaustive claim about `$7BA0` rests on a linear decode of resident RAM at both instruction
alignments: it would not see a write through an address register, and it speaks for the resident
program, not for banks loaded from disk later. Nothing here is a whole-game equivalence claim.
