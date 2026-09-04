# Text tables

The dictionary-compressed text engine, decoded from our own Reference Build. The
Reference Disassembly was read only to locate the emitter; the tables and the
format below were derived from the disassembled code and confirmed against the
decoded output (ADR 0014).

## Engine

The emitter lives around `$8DAE-$8E90`. It produces **one character per call**,
writing to a single output byte at `$FC`, and keeps two indices in zero page:
`$DE` walks the message token stream and `$DF` walks the current word.

Both pointer tables use a **pre-increment** convention: an entry addresses the
byte *before* its run, because the emitter increments its index before reading.
This is easy to get wrong — using the pointer directly yields words shifted by one
character, which still looks plausible ("OCATION" for "LOCATION").

| Table | Address | Entries |
|---|---|---|
| Message pointers, low / high | `$20A0` / `$20E0` | 64 |
| Word pointers, low / high | `$2120` / `$2210` | 239 (tokens below `$EF`) |
| Substitution indirection | `$56E8` | indexed by token |

Characters are stored with **bit 7 marking the final character** of a run, not as
a separate terminator. The low seven bits are the character code.

## Spacing rule

The emitter writes a space to `$FC` whenever no word is in progress, then fetches
the next token. For an ordinary word it returns immediately, so that space is what
the caller sees and the word gains a leading space. For a **suffix word** — token
below `$08` — it falls straight through to emitting the first character, which
*overwrites* the space in the same call. That is why suffixes such as `ED`, `S`
and `ING` join the preceding word directly, and it is the whole of the
compression scheme's cleverness: `LOCK` + `ED` costs two bytes.

## Token vocabulary

| Token | Meaning |
|---|---|
| `$00` | End of message |
| `$01`–`$07` | Suffix word, joined to the previous word |
| `$08`–`$EE` | Word index, with a leading space |
| `$EF` | An extra space |
| `$F0`–`$F7` | Substitution slot; the word index comes from `$56E8 + token` |
| `$F8`–`$FE` | Numeric field, rendered from a BCD value at `$7700` |
| `$FF` | Inline literal — the characters follow in the message stream itself |

## Character codes

Letters are ASCII `A`–`Z`; `$20` is a space. Five punctuation codes are fixed
unambiguously by the words that use them: `$0D` is the hyphen (BROTHER-IN-LAW),
`$6F` the apostrophe (COMMANDER'S), and `$6E` the comma (the single-character
suffix in "AH, YOU ARE BACK"). The project-owned font tail and the load/save
prompt settle `$0E` as `.` and `$6D` as `?`, producing `NO. O-9 ?` exactly.

Codes `$00`–`$09` are the **digits**. The engine settles this rather than a word
does: the numeric-field emitter (`PRINT_DECIMAL`, `$8E76`) unpacks a decimal
register's BCD nibbles and stores those raw values straight into the character
stream, so the font's first ten glyphs must be `0`–`9`. It also explains the "5"
that was missing from "PRICE 5OOO CREDITS", which is a `$05` inside an inline
literal — and it resolves `$09`, which had been listed as unknown.

No encountered character code remains unresolved. The payload therefore exports
an empty `unresolvedCodes` list, and messages 58 and 59 retain their punctuation.

## What is addressable, and what is not

The 64-entry message table covers `$151F`–`$16CA` only. The text region actually
runs from about `$0880`, and the earlier part holds the **intro and comms text** —
"CRASH LANDED ON TARG", "PRESTINIUM DESTROYED", "STATE OF WAR BETWEEN", "CRAFT FOR
SALE", "PRICE 5OOO CREDITS".

**Resolved:** that text is not addressable because it has no address to speak of.
It is inlined into the Benson Scripts, in this same token vocabulary, immediately
after the instruction that plays it — the intro run belongs to script 00. See
[benson-scripts.md](benson-scripts.md).

Of the 239 word slots, 159 hold distinct text and 82 consecutive slots
(68–149) are filler sharing one pointer value. Only slot 150 in that range is
referenced by a message, and it is a real word. Slots the 64 messages never
reference may well belong to the intro text set.
