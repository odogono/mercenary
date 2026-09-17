# Damocles Script message strings: encoding and extraction

Working-Authority Evidence for [#304](https://github.com/odogono/mercenary/issues/304), recovered
2026-09-17. The Damocles Script bank holds every string the VM can present, in two forms, and
neither had a Data Payload. This note records the recovered encoding and the extraction that puts
both into `payload/damocles/strings.json`, the prerequisite
[the limo-key interaction contract](../design/damocles-limo-key-interaction.md) named for
[#300](https://github.com/odogono/mercenary/issues/300).

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not
translation of the Working Authority into application code. Recovered text is Data Payload under
[ADR 0029](../adr/0029-track-the-data-payload-in-the-private-repository.md) and
[ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md) and stays tracked-private
under the [publication policy](../publication-policy.md). A paraphrase authored into the app is not
a substitute and must never be presented as faithful content. Captures, RAM and Working Disassembly
remain ignored Restricted Material.

## Reproduce

From the repository root:

```sh
PYTHONPATH=research/damocles-st python3 -m damocleslab.strings \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --output payload/damocles/strings.json
python3 -m unittest discover -s research/damocles-st/tests -v
cd web && bun test test/damocles-strings.test.ts
```

The extractor verifies the run's artifact hashes and the program, TOS and first-world scenario pins
before reading anything, exactly as the Catalogue extractor does, and uses the standard library
only. A missing capture is regenerated with
`lab observe --scenario research/damocles-st/scenarios/first-world.json`.

Both pinned first-world captures — `observe-first-world-20260818T101013Z-c5a32b7d` and
`observe-first-world-20260818T101117Z-010b9ad3`, independent cold loads — produce a byte-identical
document apart from the `source` block. Extraction is therefore a property of the program image,
not of a run.

## The two forms

[The ISA note](damocles-script-isa.md) maps region 1 of the bank: a 64-slot system string table at
`$070000`, a 64-slot script entry table at `$070080`, bytecode from `$070100`, and a string pool at
the tail.

**System strings.** Each of the 64 slots is a bank-relative word pointer. In this bank they resolve
to **36 distinct records** occupying `$072D2E`–`$07336F`; repeated pointers are unused slots sharing
a target, the same jump-table-with-holes idiom the script entry table uses. Four slots (60–63) point
at the pool's final terminator and resolve to an empty record — that is what the table holds, not a
failed read.

**Inline messages.** Opcode `$01` carries its text in the instruction stream: the opcode word, then
NUL-terminated text, then word alignment. Walking the bank by reachability from all 64 entry slots
plus the two entries the lab also seeds reaches **206** of them.

## Encoding

| Fact | Value |
|---|---|
| Character encoding | ASCII, one byte per character |
| Terminator | `$00`, in both forms |
| Alignment | Records are word-aligned; an inline message's stream position is re-aligned after its terminator |
| Observed byte range | `$20`–`$5A` across all 270 records: no lowercase letter appears anywhere |
| Formatting, escapes, control codes | **None.** Zero records carry a byte outside the printable range |
| Unsupported records | **0.** The decode fails closed outside `$20`–`$7E` and no record reached that path |
| System string lengths | 0 to 49 characters |
| Inline message lengths | 29 to 48 characters |

There is no markup: no newline, no colour or speed code, no substitution marker, no terminator other
than NUL. Whatever the native display routine does with a record, it does not read instructions out
of it.

### The stride is not a fixed field

The issue that raised this work described the pool as a fixed 49-character space-padded field on a
`$32` stride. It is not. Records are **variable-length and packed**: the stride between two
neighbours is that record's own length plus its terminator plus at most one alignment byte.
Twenty-two of the 36 distinct records are 49 characters, which makes `$32` the common stride and
the fixed-field reading an easy one, but thirteen are shorter — as short as 31 characters — one is
empty, and the pool is contiguous rather than slotted. A reader that indexes by stride instead of
following the table's pointer is wrong for those fourteen.

### Padding is stored, not stripped

Records carry their own padding and the payload keeps it verbatim. The padding is not uniform: some
records are padded on both sides to a full 49 characters, and some carry only the leading spaces
that centre the line, with the trailing run absent. Both patterns are in the bank as authored.

Stripping would be lossy in a way that matters now: the leading run is how the original centres a
line within its field, and the message reveal model ([#307](https://github.com/odogono/mercenary/issues/307))
is still deciding what a reveal position counts. Trimming belongs to whatever presents a record.

## Identity

Payload ids are the ids the interaction contract already names.

- **System strings**: `system-string-<slot>`, slot 0–63. The contract's `system-string-50` is the
  limo-key response's clearing line, and all 49 of its characters are spaces — a full-width line
  clear rather than a fourth statement, as the contract records.
- **Inline messages**: `<scope>-inline-<ordinal>`, where the scope is the script the record belongs
  to and the ordinal counts that scope's own records in source-address order from 1. Damocles Script
  slot 2's three records are `script2-inline-1`, `-2` and `-3` at `$07042A`, `$07045A` and
  `$070488`, matching the contract.

Two facts stop scope being a plain slot lookup, and both are stated rather than smoothed over:

- **Eight records are reached from more than one script**, because the bank shares code between
  entries. The owner is the **lowest reaching entry-table slot**. That tie-break is a convention of
  this extraction, not a recovered fact; it is deterministic for a given bank, which is what an id
  needs. The obvious alternative — the nearest preceding entry address — disagrees on all eight and
  assumes a contiguous per-script layout the bank never promises, so it is not more principled.
- **Fifteen records are reached only from `$070110`**, the arrival briefing the intro script runs,
  which the entry table does not name. Its scope is its six-digit source address, `script070110`.
  Table slots render as decimal 0–63 and cannot collide with it.

So 191 of the 206 inline messages belong to the 64 entry-table scripts and 15 to that one entry.
62 scopes carry at least one record.

## Indexed references

Opcode `$14` is the indexed form. It doubles its operand; below `$01E0` that doubled value indexes
the system string table at `$070000` directly, and only at or above it is a slot fetched from
`$7A42` first — the correction [#298](https://github.com/odogono/mercenary/issues/298) made.

All **14** indexed sites in the bank carry operand `$0032` and so name **slot 50**, the blank
clearing line. None takes the indirect path, so none is recorded without a target. `$0704BE`, the
contract's `clear-line` step, is one of the 14.

The `$1B` random-index form exists in the dispatch table but **no reachable script uses it**, so no
random message table is extracted.

## Payload shape

`payload/damocles/strings.json`, schema version 1, read by
[`web/src/damocles/strings.ts`](../../web/src/damocles/strings.ts) and validated whole on load:
schema version, title, source digests, slot order and count, id agreement with slot or with scope
and ordinal, gap-free ordinals within a scope, printable-ASCII records, unique ids, and every
indexed reference naming a slot the table holds. A record's `sha256` is taken over its **stored
text**, terminator and alignment byte excluded, so it can be checked against the `text` beside it;
`web/test/damocles-strings.test.ts` checks all 270.

Per-record `address` is the source address in the Working Authority: the pool address for a system
string, the opcode word's address for an inline message.

## Coverage and what this does not establish

`coverage.complete` is `false`. This is the **resident script bank only**. The Working Authority
loads further banks from disk, and any text they carry is outside this extraction; nothing here
claims the 270 records are all the game's text.

**Settled since, by [#307](https://github.com/odogono/mercenary/issues/307)**: the routine is
`$052402`, the row is **48 six-pixel cells**, and a record enters it from the right at eight pixels
a frame for 36 frames. Character *k* of a record lands in cell *k* — the routine does not centre,
so the leading run this note keeps verbatim is the original's own hand-centring, and stripping it
would move the line. Two details bear on this extraction directly and neither changes it: opcode
`$14` publishes a system string's pointer **plus one**, so it displays a record from its second
character — harmless here, because slot 50 is the only record any indexed site names and all of its
characters are spaces; and a record of 49 characters needs a second 36-frame block, of which the
first block shows 48 characters. See [the reveal note](damocles-message-reveal.md).

Nothing in the application changed: the payload is available and validated, and no surface reads it
yet. #300 is what makes the limo-key response present these records.
