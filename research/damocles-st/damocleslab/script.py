"""Damocles Script decoder: turn the bytecode bank into a readable listing.

Research instrumentation, **not** an extractor. It prints a human-readable
report for a researcher to read and must never grow a machine-readable output,
a payload writer, or a schema; the Independent Implementation may not be written
from a mechanical translation of this program (ADR 0002). Listings it produces
are untracked Restricted Material; only decoded facts belong in `docs/research/`
notes. See `docs/research/damocles-gap.md`.

Payload writing is a separate module's job, as it is for the Catalogue:
`damocleslab.strings` (#304) imports the pure decode functions below and writes
`payload/damocles/strings.json`, so the instruction grammar has one home and
this module keeps its single output. ADRs 0039 and 0043 admit those payloads.

Operand widths come from the handler census in
`docs/research/damocles-script-isa.md`, read out of the interpreter at
$0519BC-$051D80. Two structural rules drive the whole decode:

- The opcode is the **low 6 bits** of the fetched word. Bit 6 selects
  call-over-jump and bit 7 negates, so a *predicate* op carries a trailing
  2-byte branch target consumed by the shared epilogue at $051A28/$051A2C —
  which is why a fixed per-opcode width table alone desynchronises.
- Control transfers are **bank-relative**: handlers commit the PC as a word to
  $007820, the low half of $00781E, so a target word `w` means $070000 + w.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .core import LabError, parse_hex_int, require, verify_run_artifacts

BANK_BASE = 0x070000

# Region 1 of the populated bank holds, in order: two pointer tables, the
# bytecode, and then a string pool. The larger regions behind it look like
# world/object catalogues (#80), not code.
DEFAULT_START = 0x070100
# Code ends where the string pool begins — the first string-table target.
# Decoding past it walks ASCII as instructions (a word of two spaces, $2020,
# has $20 in its low six bits and looks like a valid slot).
DEFAULT_END = 0x072D2E
STRING_POOL_END = 0x07336C

# Entry points observed in the Working Authority: the arrival briefing the intro
# script runs, and the idle loop the resident PC parks in.
DEFAULT_ENTRIES = (0x070110, 0x0703FC)

# The bank opens with *two* 64-slot tables of bank-relative word offsets, not
# one 128-slot table. The first indexes the string pool — its targets are
# NUL-terminated text on a $32 stride, e.g. slot $00 -> "LOCKED" and slot $01 ->
# "WARNING - OBJECTS LEFT IN CASE!". The second is the script entry table, the
# Damocles analogue of the C64 Benson entry table. In both, repeated values are
# unused slots pointing at a shared target — a jump table with holes.
STRING_TABLE_BASE = 0x070000
SCRIPT_TABLE_BASE = 0x070080
TABLE_COUNT = 64


def _read_table(data: bytes, base: int, count: int) -> list[int]:
    return [
        BANK_BASE + int.from_bytes(data[base + slot * 2 : base + slot * 2 + 2], "big")
        for slot in range(count)
    ]


def read_script_table(data: bytes) -> list[int]:
    """Resolve the script entry table to absolute addresses, in slot order."""
    return _read_table(data, SCRIPT_TABLE_BASE, TABLE_COUNT)


def read_string_table(data: bytes, *, pool_end: int = STRING_POOL_END) -> list[tuple[int, str]]:
    """Resolve the string table to (address, text) pairs, in slot order."""
    strings: list[tuple[int, str]] = []
    for address in _read_table(data, STRING_TABLE_BASE, TABLE_COUNT):
        stop = data.find(b"\x00", address, pool_end)
        if stop == -1:
            strings.append((address, ""))
            continue
        strings.append((address, data[address:stop].decode("ascii", errors="replace")))
    return strings


@dataclass(frozen=True)
class Op:
    """One dispatch slot: how wide it is and what it does to control flow."""

    name: str
    operand_bytes: int
    predicate: bool = False
    kind: str = "plain"  # plain | jump | call | return | message | native | unused
    note: str = ""


# Slot -> shape. `operand_bytes` excludes the opcode word and excludes the
# predicate branch target, which is added uniformly for predicate slots.
OPS: dict[int, Op] = {
    0x00: Op("unused", 0, kind="unused", note="offset $0000, points at the table"),
    0x01: Op("message", 0, kind="message", note="inline NUL-terminated text, word-aligned"),
    0x02: Op("reset.wait", 0, note="clear $7B9C"),
    0x03: Op("jump", 2, kind="jump"),
    0x04: Op("call", 2, kind="call", note="pushes onto the $6266 script stack"),
    0x05: Op("return", 0, kind="return"),
    0x06: Op("if.pair", 2, predicate=True, note="two bytes vs $7A2D/$7A35"),
    0x07: Op("if.wait", 2, predicate=True, note="$7B9C vs operand"),
    0x08: Op("native", 4, kind="native", note="jsr into the script stream"),
    0x09: Op("native.if", 4, predicate=True, kind="native", note="jsr into the stream, then test"),
    0x0A: Op("if.random", 2, predicate=True, note="pseudo-random word vs operand"),
    0x0B: Op("if.key", 2, predicate=True, note="operand vs $7B61"),
    0x0C: Op("if.record.sign", 0, predicate=True, note="$6FAA record indexed by $7C3E"),
    0x0D: Op("record.write", 8, note="6 bytes into a $7482 record"),
    0x0E: Op("record.bcd.add", 8, note="packed-decimal add into a $7482 record"),
    0x0F: Op("word.write", 4, note="into the $7A42 table"),
    0x10: Op("flags.set", 2, note="or into $7BD8"),
    0x11: Op("flags.clear", 2, note="and-not into $7BD8"),
    0x12: Op("if.flags", 2, predicate=True, note="test $7BD8"),
    0x13: Op("if.7C40", 0, predicate=True),
    0x14: Op("message.indexed", 2, kind="message", note="string pointer via the $7A42 table"),
    0x15: Op("record.bcd.three", 6, note="packed-decimal across three $7482 records"),
    0x16: Op("counter.add", 2, note="add into $7BD2"),
    0x17: Op("if.counter", 2, predicate=True, note="$7BD2 vs operand"),
    0x18: Op("if.bank.word", 4, predicate=True, note="word at $070000+operand vs operand"),
    0x19: Op("bank.write", 4, note="word into $070000+operand"),
    0x1A: Op("unused", 0, kind="unused", note="offset $0000, points at the table"),
    0x1B: Op("message.random", 4, kind="message", note="random index into a bank table"),
    0x1C: Op("set.7B60", 0, note="$7B60 = $00FF"),
    0x1D: Op("if.7C40.ptr", 0, predicate=True),
    0x1E: Op("word.copy", 4, note="$7A42 word to $7A42 word"),
    0x1F: Op("if.7C3C", 0, predicate=True),
    0x20: Op("record.bits", 2, note="set or clear bits in a $6FAA record"),
    0x21: Op("if.record.bits", 2, predicate=True, note="mask a $6FAA record"),
    0x22: Op("if.7A90", 2, predicate=True),
    0x23: Op("if.record.value", 8, predicate=True, note="compare a full $7482 record"),
    0x24: Op("read.word.byte", 4),
}


@dataclass
class Decoded:
    """One decoded instruction."""

    address: int
    word: int
    opcode: int
    op: Op
    size: int
    operands: bytes
    target: int | None
    text: str | None

    def render(self) -> str:
        flags = ""
        if self.word & 0x40:
            flags += " :call"
        if self.word & 0x80:
            flags += " :not"
        parts = [f"${self.address:06X}  {self.op.name}{flags}"]
        if self.text is not None:
            parts.append(f'  "{self.text}"')
        elif self.operands:
            words = " ".join(
                f"${int.from_bytes(self.operands[i : i + 2], 'big'):04X}"
                for i in range(0, len(self.operands) - len(self.operands) % 2, 2)
            )
            parts.append(f"  {words}")
        if self.target is not None:
            parts.append(f"  -> ${self.target:06X}")
        if self.op.kind == "native":
            parts.append("  [68000 code inline in the stream]")
        return "".join(parts)


@dataclass
class Decode:
    ops: dict[int, Decoded] = field(default_factory=dict)
    entries: set[int] = field(default_factory=set)
    call_targets: set[int] = field(default_factory=set)
    jump_targets: set[int] = field(default_factory=set)
    unknown: dict[int, int] = field(default_factory=dict)
    natives: list[int] = field(default_factory=list)
    table: list[int] = field(default_factory=list)
    strings: list[tuple[int, str]] = field(default_factory=list)


def _decode_one(data: bytes, address: int, start: int, end: int) -> Decoded:
    """Decode the instruction at `address`. Raises LabError if it runs off the region."""
    if not start <= address < end - 1:
        raise LabError(f"Address ${address:06X} is outside the decode region")
    word = int.from_bytes(data[address : address + 2], "big")
    opcode = word & 0x3F
    op = OPS.get(opcode)
    if op is None:
        raise LabError(f"Slot ${opcode:02X} is above the 37-entry dispatch table")

    cursor = address + 2
    text: str | None = None
    operands = b""

    if op.kind == "message" and opcode == 0x01:
        # tst.b (a0)+ until NUL, then word-align (adda.w of a0 & 1).
        stop = data.index(b"\x00", cursor, end)
        text = data[cursor:stop].decode("ascii", errors="replace")
        cursor = stop + 1
        if cursor & 1:
            cursor += 1
    else:
        operands = data[cursor : cursor + op.operand_bytes]
        cursor += op.operand_bytes

    target: int | None = None
    if op.kind in ("jump", "call"):
        target = BANK_BASE + int.from_bytes(operands[:2], "big")
    elif op.predicate:
        target = BANK_BASE + int.from_bytes(data[cursor : cursor + 2], "big")
        cursor += 2

    return Decoded(address, word, opcode, op, cursor - address, operands, target, text)


def decode_scripts(
    data: bytes,
    *,
    start: int = DEFAULT_START,
    end: int = DEFAULT_END,
    entries: tuple[int, ...] = DEFAULT_ENTRIES,
) -> Decode:
    """Walk the script bank from its entry points, following every transfer.

    Reachability rather than a linear sweep: inline message text and the native
    escapes would desynchronise a linear walk, and following transfers is also
    what proves which bytes are code at all.
    """
    result = Decode(entries=set(entries))
    worklist = list(entries)
    while worklist:
        address = worklist.pop()
        if address in result.ops or not start <= address < end - 1:
            continue
        try:
            decoded = _decode_one(data, address, start, end)
        except (LabError, ValueError):
            result.unknown[address] = int.from_bytes(data[address : address + 2], "big")
            continue
        result.ops[address] = decoded

        if decoded.op.kind == "native":
            result.natives.append(address)

        if decoded.target is not None:
            if decoded.op.kind == "call":
                result.call_targets.add(decoded.target)
            else:
                result.jump_targets.add(decoded.target)
            worklist.append(decoded.target)

        # An unconditional jump, a return, and an unused slot all end the run.
        if decoded.op.kind not in ("jump", "return", "unused"):
            worklist.append(decoded.address + decoded.size)
    return result


def format_report(decode: Decode, *, start: int, end: int) -> str:
    """Render the decode as a report for a researcher to read."""
    lines: list[str] = []
    lines.append("Damocles Script decode (Working-Authority Evidence)")
    lines.append(f"region ${start:06X}-${end:06X}")
    lines.append("")
    lines.append(
        f"reached {len(decode.ops)} ops; "
        f"{len(decode.call_targets)} call targets; "
        f"{len(decode.natives)} inline-native sites; "
        f"{len(decode.unknown)} undecodable addresses"
    )
    covered = sum(op.size for op in decode.ops.values())
    span = end - start
    lines.append(f"bytes reached: {covered} of {span} in region ({100.0 * covered / span:.1f}%)")
    lines.append("")

    mix: dict[int, int] = {}
    for op in decode.ops.values():
        mix[op.opcode] = mix.get(op.opcode, 0) + 1
    lines.append("slot frequency:")
    for opcode in sorted(mix, key=lambda k: -mix[k]):
        lines.append(f"  ${opcode:02X} {OPS[opcode].name:<18} {mix[opcode]}")
    lines.append("")

    if decode.strings:
        lines.append(f"string table: {len(decode.strings)} slots at ${STRING_TABLE_BASE:06X}")
        for slot, (address, text) in enumerate(decode.strings):
            lines.append(f'  ${slot:02X}  ${address:06X}  "{text.strip()}"')
        lines.append("")

    if decode.table:
        seen: dict[int, list[int]] = {}
        for slot, address in enumerate(decode.table):
            seen.setdefault(address, []).append(slot)
        lines.append(f"script entry table: {len(decode.table)} slots at ${SCRIPT_TABLE_BASE:06X}")
        lines.append(f"  distinct targets: {len(seen)} (repeats are unused slots)")
        for address in sorted(seen):
            slots = seen[address]
            shown = ",".join(f"${s:02X}" for s in slots[:6])
            if len(slots) > 6:
                shown += f",... ({len(slots)} slots)"
            reached = "" if address in decode.ops else "   [not reached]"
            lines.append(f"  ${address:06X}  slots {shown}{reached}")
        lines.append("")

    if decode.natives:
        lines.append("inline-native sites (script bytes that are 68000 code):")
        for address in sorted(decode.natives):
            lines.append(f"  ${address:06X}")
        lines.append("")

    lines.append("listing (blank line marks a discovered entry or call target):")
    previous_end: int | None = None
    for address in sorted(decode.ops):
        decoded = decode.ops[address]
        if address in decode.call_targets or address in decode.entries or address != previous_end:
            lines.append("")
            label = []
            if address in decode.entries:
                label.append("entry")
            if address in decode.call_targets:
                label.append("call target")
            if label:
                lines.append(f"; --- {', '.join(label)} ${address:06X} ---")
        lines.append(decoded.render())
        previous_end = address + decoded.size

    if decode.unknown:
        lines.append("")
        lines.append("undecodable (reached but not a valid slot, or ran off the region):")
        for address in sorted(decode.unknown):
            lines.append(f"  ${address:06X}  word ${decode.unknown[address]:04X}")

    return "\n".join(lines) + "\n"


def script(
    run_directory: Path,
    *,
    start: str | None = None,
    end: str | None = None,
    entries: list[str] | None = None,
) -> dict[str, Any]:
    """Decode the script bank of an attested run and write a listing beside it."""
    from .laboratory import _select_ram_artifact, load_json

    manifest = load_json(run_directory / "manifest.json")
    verify_run_artifacts(run_directory, manifest)
    ram_artifact = _select_ram_artifact(manifest, None)
    data = (run_directory / ram_artifact["path"]).read_bytes()
    require(len(data) == 0x100000, f"RAM dump must be exactly 1 MiB, got {len(data)}")

    first = parse_hex_int(start, label="start") if start else DEFAULT_START
    last = parse_hex_int(end, label="end") if end else DEFAULT_END
    require(first < last, "start must be below end")

    table = read_script_table(data)
    seeds = set(DEFAULT_ENTRIES) | {address for address in table if first <= address < last}
    if entries:
        seeds |= {parse_hex_int(e, label="entry") for e in entries}

    decode = decode_scripts(data, start=first, end=last, entries=tuple(sorted(seeds)))
    decode.table = table
    decode.strings = read_string_table(data)
    listing = run_directory / "script-decode.txt"
    listing.write_text(format_report(decode, start=first, end=last), encoding="utf-8")

    return {
        "schemaVersion": 1,
        "runId": manifest["runId"],
        "sourceRam": {
            "role": ram_artifact["role"],
            "path": ram_artifact["path"],
            "sha256": ram_artifact["sha256"],
        },
        "region": {"startHex": f"0x{first:06x}", "endHex": f"0x{last:06x}"},
        "entries": [f"0x{seed:06x}" for seed in seeds],
        "evidenceClass": "working-authority-evidence",
        "stringTable": {
            "baseHex": f"0x{STRING_TABLE_BASE:06x}",
            "slots": len(decode.strings),
            "distinctTargets": len({address for address, _ in decode.strings}),
        },
        "scriptTable": {
            "baseHex": f"0x{SCRIPT_TABLE_BASE:06x}",
            "slots": len(table),
            "distinctTargets": len(set(table)),
        },
        "opsReached": len(decode.ops),
        "callTargets": len(decode.call_targets),
        "inlineNativeSites": sorted(f"0x{a:06x}" for a in decode.natives),
        "undecodable": len(decode.unknown),
        "listing": listing.name,
    }
