"""Decode the Reference Build's Benson Scripts into our own instruction format.

Benson is the Reference Build's game-logic interpreter: a small bytecode machine
whose programs drive the opening sequence, room events, and object interactions.
The scripts are recovered here from our own Reference Build; the community
Reference Disassembly was read only to locate the interpreter and name its
opcodes (ADR 0014). The bytes are re-encoded rather than copied verbatim
(ADR 0015), so the app never sees a C64 address.

Engine shape, as disassembled and confirmed against our own image:

* An entry table of 16-bit addresses, two bytes per script, indexed by script id.
* An opcode byte is ``IJOOOOOO``: bits 0-5 select the handler through a jump
  table, bit 6 chooses jump-versus-call for a taken branch, and bit 7 is
  compared against the handler's result to decide whether the branch is taken.
  Every conditional handler leaves its answer in the carry flag, and the shared
  epilogue takes the branch when that answer equals bit 7 — so bit 7 reads as
  "branch on this outcome" rather than as a plain negation.
* Operand widths are fixed per opcode, except a message, whose text is inlined
  into the instruction stream and terminated by zero.
* A taken branch's target is the two bytes after the operands. A conditional
  *call* pushes the instruction address plus three, whatever the instruction's
  real width — so only the three-byte conditionals can survive being called.
  A longer one would return into its own operands, which we refuse to decode.

Re-encoding rules:

* Instructions are linearized in address order and every branch, jump, and call
  target becomes an index into that list. Script entries become indices too.
* Inline message text is decoded into the same token shape as the message
  table, so one renderer serves both.
* Packed BCD literals become plain integers, least-significant byte first as
  the engine stores them.
* Absolute addresses and key codes become named symbols. An address we have not
  named is an error rather than a guess: the census of what the scripts actually
  touch is the specification of the app's Host Callout seam.
"""

from __future__ import annotations

from typing import Any

from .core import LabError
from .text import TEXT_REGION, decode_token_stream, decode_words


BENSON_SCHEMA_VERSION = 1

ENTRY_TABLE = 0x0800
#: The table has no terminator; its length is fixed by where the first script
#: body starts, which the entries themselves point at. ``entry_addresses``
#: asserts that boundary, so a wrong count cannot pass quietly as script data.
SCRIPT_COUNT = 51
#: Script bodies share the text region; the entry table sits at its base.
SCRIPT_REGION = (ENTRY_TABLE + SCRIPT_COUNT * 2, TEXT_REGION[1])

INTERPRETER_START = 0x8A8C
INTERPRETER_STEP = 0x8AB2
DISPATCH_TABLE = 0x8D5E

#: Interpreter sites asserted before decoding. The prologue pins the program
#: counter, the opcode mask, and the dispatch table; the entry-table read pins
#: where the scripts are indexed from.
STEP_CHECKS = (
    (0x8AB2, (0xA5, 0xE6), "step does not gate on the message-busy byte"),
    (0x8AB9, (0xB1, 0x1F), "step does not fetch its opcode through the program counter at $1f"),
    (0x8ABD, (0x29, 0x3F), "step does not mask its opcode to six bits"),
    (0x8AC0, (0x69, DISPATCH_TABLE & 0xFF), "step does not index the dispatch table's low byte"),
    (0x8AC5, (0xA9, DISPATCH_TABLE >> 8), "step does not index the dispatch table's high byte"),
    (0x8A9F + 0x08, (0xB9, ENTRY_TABLE & 0xFF, ENTRY_TABLE >> 8), "start does not read the script entry table"),
)

#: Each handler's opening bytes, asserted so a build whose semantics differ from
#: the ones implemented here fails loudly. These are also where the engine state
#: addresses below were read from, which is why the fingerprints include them.
HANDLER_CHECKS = {
    0x01: ((0xA5, 0x1F), "inline message does not point the renderer at the program counter"),
    0x02: ((0xA9, 0x00, 0x85, 0xE3), "frame-counter clear does not zero $e3"),
    0x03: ((0xC8, 0xB1, 0x1F), "jump does not read its target through the program counter"),
    0x04: ((0xA5, 0x1F, 0x18, 0x69, 0x03), "call does not push the instruction address plus three"),
    0x05: ((0x20,), "return does not pull the return stack"),
    0x07: ((0xA5, 0xE3, 0xA6, 0xE4), "frame wait does not read the frame counter at $e3"),
    0x0A: ((0x20,), "random test does not draw a random value"),
    0x0B: ((0xA5, 0xE9, 0x29, 0x3F), "key test does not read the input key at $e9"),
    0x0C: ((0xAD, 0xEE, 0x57), "inventory test does not select through the object register"),
    0x0D: ((0xA9, 0x2C), "decimal load does not patch its store to a plain load"),
    0x0E: ((0xA9, 0x7D), "decimal add does not patch its store to an add"),
    0x0F: ((0xC8, 0xB1, 0x1F, 0x29, 0x0F), "register load does not take its index from a nibble"),
    0x10: ((0xC8, 0xB1, 0x1F, 0x0D, 0xC0, 0xBE), "flag set does not or into the engine flags"),
    0x11: ((0xC8, 0xB1, 0x1F, 0x49, 0xFF), "flag clear does not invert its mask"),
    0x12: ((0xAD, 0xC0, 0xBE), "flag test does not read the engine flags"),
    0x13: ((0xAD, 0xEF, 0x57, 0xC5, 0xCD), "room test does not compare the room register to the current room"),
    0x14: ((0xC8, 0xB1, 0x1F, 0x10), "indexed message does not branch on its operand's high bit"),
    0x15: ((0xC8, 0xB1, 0x1F, 0x29, 0x0F), "decimal add does not take its registers from nibbles"),
    0x18: ((0xC8, 0xB1, 0x1F, 0x8D), "compare does not patch its own operand address"),
    0x19: ((0xC8, 0xB1, 0x1F, 0x8D), "store does not patch its own target address"),
    0x1A: ((0xAE, 0xED, 0x57), "block test does not select through the map register"),
    0x1B: ((0x20,), "random message does not draw a random value"),
    0x1C: ((0x20,), "key clear does not call the input clear"),
    0x1D: ((0xAE, 0xEE, 0x57, 0xAD, 0xEF, 0x57), "object-in-room test does not select object and room"),
    0x1E: ((0xC8, 0xB1, 0x1F, 0x29, 0x0F), "register copy does not take its source from a nibble"),
    0x20: ((0xAE, 0xEE, 0x57), "object flag change does not select through the object register"),
    0x21: ((0xC8, 0xB1, 0x1F, 0xAE, 0xEE, 0x57), "object flag test does not select through the object register"),
    0x22: ((0xC8, 0xB1, 0x1F, 0xC5, 0xA9), "craft test does not compare the boarded craft"),
}

#: Opcodes the interpreter dispatches but no Mercenary script is expected to
#: reach. They call native code or read engine state we have not modelled, so a
#: script using one is a finding, not something to decode quietly.
UNUSED_OPCODES = {
    0x06: "cmpl",
    0x08: "ldf",
    0x09: "func",
    0x16: "adds",
    0x17: "cmps",
    0x1F: "tstv",
}

BRANCH_WIDTH = 2

#: opcode -> (name, operand width, conditional). Inline message is the one
#: variable-width instruction and is decoded separately.
OPCODES: dict[int, tuple[str, int, bool]] = {
    0x01: ("msg", 0, False),
    0x02: ("cfr", 0, False),
    0x03: ("jmp", 2, False),
    0x04: ("call", 2, False),
    0x05: ("ret", 0, False),
    0x06: ("cmpl", 2, True),
    0x07: ("wfr", 2, True),
    0x08: ("ldf", 7, False),
    0x09: ("func", 2, True),
    0x0A: ("rand", 1, True),
    0x0B: ("tstk", 1, True),
    0x0C: ("tsti", 0, True),
    0x0D: ("ldr", 5, False),
    0x0E: ("adr", 5, False),
    0x0F: ("loadi", 2, False),
    0x10: ("setf", 1, False),
    0x11: ("clrf", 1, False),
    0x12: ("tstf", 1, True),
    0x13: ("room", 0, True),
    0x14: ("msgi", 1, False),
    0x15: ("dadd", 3, False),
    0x16: ("adds", 1, False),
    0x17: ("cmps", 1, True),
    0x18: ("cmp", 3, True),
    0x19: ("stor", 3, False),
    0x1A: ("tstb", 0, True),
    0x1B: ("msgr", 2, False),
    0x1C: ("clrk", 0, False),
    0x1D: ("inrm", 0, True),
    0x1E: ("load", 1, False),
    0x1F: ("tstv", 0, True),
    0x20: ("modf", 1, False),
    0x21: ("tsto", 1, True),
    0x22: ("tstc", 1, True),
}

#: Execution does not continue past these into the following bytes.
TERMINAL = {"jmp", "ret"}

#: The interpreter's own decimal registers. Slot 8 is the bank balance and slot 9
#: the cash in the current room; the rest are unused. Each slot is four packed
#: BCD bytes with the most significant pair first, so byte 0 holds the millions.
DECIMAL_BASE = 0x76E0
DECIMAL_SLOTS = 16
DECIMAL_WIDTH = 4

#: Per-object tables, indexed by object slot.
OBJECT_ROOM_TABLE = 0x2940
OBJECT_FLAGS_TABLE = 0x29C0
OBJECT_SLOTS = 0x40

#: Engine state a script may read through the general compare. The names are the
#: app's Host Callout vocabulary; the addresses were read off the handlers above
#: and the initialized memory map. An address outside this table stops the
#: decode, because a script reading unmodelled state is a gap in the seam.
READ_SYMBOLS = {
    0x00A9: "boardedCraft",
    0x00CD: "currentRoom",
    0x00E9: "inputKey",
    0xBEBD: "signedRegister",
    0xBEC0: "engineFlags",
}

#: Sound registers. The Reference Build has no sound opcode; scripts poke the
#: SID directly, so those stores are named as sound and the app may ignore them.
SID_BASE = 0xD400
SID_TOP = 0xD41F
SID_REGISTERS = {
    0x00: "voice1.frequencyLow",
    0x01: "voice1.frequencyHigh",
    0x02: "voice1.pulseWidthLow",
    0x03: "voice1.pulseWidthHigh",
    0x04: "voice1.control",
    0x05: "voice1.attackDecay",
    0x06: "voice1.sustainRelease",
    0x07: "voice2.frequencyLow",
    0x08: "voice2.frequencyHigh",
    0x09: "voice2.pulseWidthLow",
    0x0A: "voice2.pulseWidthHigh",
    0x0B: "voice2.control",
    0x0C: "voice2.attackDecay",
    0x0D: "voice2.sustainRelease",
    0x0E: "voice3.frequencyLow",
    0x0F: "voice3.frequencyHigh",
    0x10: "voice3.pulseWidthLow",
    0x11: "voice3.pulseWidthHigh",
    0x12: "voice3.control",
    0x13: "voice3.attackDecay",
    0x14: "voice3.sustainRelease",
    0x15: "filterCutoffLow",
    0x16: "filterCutoffHigh",
    0x17: "filterResonance",
    0x18: "filterMode",
}

#: Engine state a script may write through the general store, beyond the SID and
#: the indexed tables handled separately.
WRITE_SYMBOLS = {
    # Video frames between message advances. The scroll interrupt compares its
    # own frame tally against this, so a script writing it is retiming the
    # message line — the endgame slows the crawl this way.
    0x00E1: "messageInterval",
    0xBEF8: "attackingShip",
    0xBEFE: "gameComplete",
    0xBEFF: "shipInbound",
}

#: Key codes a script tests. The engine masks the scanner's code to six bits
#: before comparing, so these are matrix codes rather than characters. Only the
#: yes key is ever tested: prompts offer no key for "no" and time out instead.
KEY_SYMBOLS = {
    0x19: "keyY",
}

#: One tick of the interpreter's wait counter. An interrupt tallies video frames
#: and advances the counter every fiftieth one, so on a 50 Hz machine a wait
#: operand counts seconds.
FRAMES_PER_TICK = 50
FRAME_COUNTER_DIVIDER = 0xBA6C


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _require_engine(ram: bytes) -> None:
    """Confirm the interpreter is the one these semantics were written for."""
    _require(len(ram) == 65536, "Benson decode requires a 64 KiB physical RAM image")
    for address, expected, complaint in STEP_CHECKS:
        found = tuple(ram[address:address + len(expected)])
        _require(found == expected, f"Reference Build {complaint}")
    for opcode, (expected, complaint) in sorted(HANDLER_CHECKS.items()):
        handler = _dispatch(ram, opcode)
        found = tuple(ram[handler:handler + len(expected)])
        _require(found == expected, f"Reference Build {complaint}")


def _dispatch(ram: bytes, opcode: int) -> int:
    return ram[DISPATCH_TABLE + opcode * 2] | (ram[DISPATCH_TABLE + opcode * 2 + 1] << 8)


def _word(ram: bytes, address: int) -> int:
    return ram[address] | (ram[address + 1] << 8)


def _in_script_region(address: int) -> bool:
    return SCRIPT_REGION[0] <= address < SCRIPT_REGION[1]


def _bcd(ram: bytes, address: int) -> int:
    """Read a four-byte packed BCD literal, least significant byte first."""
    value = 0
    for offset in range(4):
        byte = ram[address + offset]
        high, low = byte >> 4, byte & 0x0F
        _require(
            high <= 9 and low <= 9,
            f"Decimal literal at ${address + offset:04x} holds ${byte:02x}, which is not packed BCD",
        )
        value += (high * 10 + low) * (100 ** offset)
    return value


def _name_address(fields: dict[str, Any], address: int, table: dict[int, str], complaint: str) -> None:
    """Name one absolute address, so no C64 address reaches the app.

    The indexed tables are named structurally — symbol plus slot — because a
    script addresses one object's row or one decimal register's byte directly,
    and the app holds those as collections rather than as separate values.
    """
    if DECIMAL_BASE <= address < DECIMAL_BASE + DECIMAL_SLOTS * DECIMAL_WIDTH:
        offset = address - DECIMAL_BASE
        fields["symbol"] = "decimalByte"
        fields["decimal"] = offset // DECIMAL_WIDTH
        fields["byte"] = offset % DECIMAL_WIDTH
        return
    for base, symbol in ((OBJECT_ROOM_TABLE, "objectRoom"), (OBJECT_FLAGS_TABLE, "objectFlags")):
        if base <= address < base + OBJECT_SLOTS:
            fields["symbol"] = symbol
            fields["slot"] = address - base
            return
    symbol = table.get(address)
    _require(symbol is not None, f"{complaint} unnamed address ${address:04x}")
    fields["symbol"] = symbol


def _sound_symbol(address: int) -> str | None:
    if not SID_BASE <= address <= SID_TOP:
        return None
    return SID_REGISTERS.get(address - SID_BASE)


def entry_addresses(ram: bytes) -> list[int]:
    """Read the entry table, rejecting anything that leaves the script region."""
    entries: list[int] = []
    for script in range(SCRIPT_COUNT):
        address = _word(ram, ENTRY_TABLE + script * 2)
        _require(
            _in_script_region(address),
            f"Script {script} enters at ${address:04x}, outside the script region",
        )
        entries.append(address)
    _require(
        min(entries) == SCRIPT_REGION[0],
        f"Script entry table ends at ${SCRIPT_REGION[0]:04x} but the lowest entry is "
        f"${min(entries):04x}, so the table is not {SCRIPT_COUNT} entries long",
    )
    return entries


def decode_instruction(ram: bytes, address: int, words: list[dict[str, Any]]) -> dict[str, Any]:
    """Decode one instruction, in isolation, keeping targets as addresses.

    Returns the re-encoded fields plus the bookkeeping the walk needs: total
    ``length``, the ``targets`` execution may reach, and whether control
    ``falls`` through into the following bytes.
    """
    _require(_in_script_region(address), f"Instruction address ${address:04x} is outside the script region")
    raw = ram[address]
    opcode = raw & 0x3F
    spec = OPCODES.get(opcode)
    _require(spec is not None, f"Script byte ${raw:02x} at ${address:04x} selects opcode ${opcode:02x}, which crashes the interpreter")
    name, width, conditional = spec
    _require(
        opcode not in UNUSED_OPCODES,
        f"Script at ${address:04x} uses opcode ${opcode:02x} ({UNUSED_OPCODES.get(opcode)}), "
        "which is unused in the Reference Build and therefore unmodelled",
    )

    operand = address + 1
    fields: dict[str, Any] = {"op": name}
    targets: list[int] = []
    falls = name not in TERMINAL

    if name == "msg":
        tokens, cursor = decode_token_stream(ram, address, words, context=f"inline message at ${address:04x}")
        fields["tokens"] = tokens
        length = cursor + 1 - address
    elif name in {"jmp", "call"}:
        target = _word(ram, operand)
        fields["target"] = target
        targets.append(target)
        length = 1 + width
    else:
        length = 1 + width + (BRANCH_WIDTH if conditional else 0)
        _decode_operands(ram, address, operand, name, fields)
        if conditional:
            # Bit 7 is the outcome the branch fires on, bit 6 selects a call.
            target = _word(ram, address + 1 + width)
            fields["branchOn"] = bool(raw & 0x80)
            fields["onTaken"] = {"kind": "call" if raw & 0x40 else "jmp", "target": target}
            targets.append(target)
            if raw & 0x40:
                # The shared epilogue pushes the instruction address plus three
                # however wide the instruction really is, so a called
                # conditional resumes there; anything wider returns into its
                # own operands.
                _require(
                    length == 3,
                    f"Conditional call at ${address:04x} is {length} bytes wide, so it would return "
                    "into its own operands",
                )
        else:
            _require(
                not raw & 0xC0,
                f"Instruction at ${address:04x} sets a branch modifier on ${opcode:02x} ({name}), "
                "which the interpreter ignores",
            )
    if falls:
        targets.append(address + length)
    return {**fields, "length": length, "targets": targets, "falls": falls}


def _decode_operands(ram: bytes, address: int, operand: int, name: str, fields: dict[str, Any]) -> None:
    """Fill in the re-encoded operands for every fixed-width instruction."""
    if name in {"cfr", "ret", "clrk", "tsti", "room", "tstb", "inrm"}:
        return
    if name in {"setf", "clrf"}:
        fields["mask"] = ram[operand]
    elif name == "tstf":
        fields["mask"] = ram[operand]
    elif name == "tsto":
        fields["mask"] = ram[operand]
    elif name == "modf":
        value = ram[operand]
        # The immediate's high bit selects masking off rather than setting.
        fields["mode"] = "and" if value & 0x80 else "or"
        fields["mask"] = value
    elif name == "loadi":
        fields["register"] = ram[operand] & 0x0F
        fields["value"] = ram[operand + 1]
    elif name == "load":
        packed = ram[operand]
        # Named "from"/"to" rather than source/target: those two field names
        # already carry a message selector's kind and a branch destination, and
        # one field must mean one thing across the whole document.
        fields["from"] = packed & 0x0F
        fields["to"] = packed >> 4
    elif name in {"ldr", "adr"}:
        fields["decimal"] = ram[operand] & 0x0F
        fields["value"] = _bcd(ram, operand + 1)
    elif name == "dadd":
        fields["a"] = ram[operand] & 0x0F
        fields["b"] = ram[operand + 1] & 0x0F
        fields["into"] = ram[operand + 2] & 0x0F
    elif name == "msgi":
        selector = ram[operand]
        if selector & 0x80:
            fields["source"] = "register"
            fields["register"] = selector & 0x0F
        else:
            fields["source"] = "immediate"
            fields["index"] = selector
    elif name == "msgr":
        fields["mask"] = ram[operand]
        fields["base"] = ram[operand + 1]
    elif name == "wfr":
        fields["ticks"] = _word(ram, operand)
    elif name == "rand":
        fields["value"] = ram[operand]
    elif name == "tstc":
        fields["craft"] = ram[operand]
    elif name == "tstk":
        code = ram[operand] & 0x3F
        key = KEY_SYMBOLS.get(code)
        _require(key is not None, f"Key test at ${address:04x} compares unnamed key code ${code:02x}")
        fields["key"] = key
    elif name == "cmp":
        target = _word(ram, operand)
        _name_address(fields, target, READ_SYMBOLS, f"Compare at ${address:04x} reads")
        fields["value"] = ram[operand + 2]
    elif name == "stor":
        target = _word(ram, operand)
        sound = _sound_symbol(target)
        if sound is not None:
            fields["op"] = "sound"
            fields["symbol"] = sound
        else:
            _name_address(fields, target, WRITE_SYMBOLS, f"Store at ${address:04x} writes")
        fields["value"] = ram[operand + 2]
    else:  # pragma: no cover - every decoded opcode is handled above
        raise LabError(f"No operand rule for {name} at ${address:04x}")


def decimal_seeds(ram: bytes) -> dict[str, int]:
    """Read the decimal registers a conditioned capture starts play with.

    No script sets the opening bank balance, so it has to come from the image.
    Only the slots the engine actually initializes hold packed BCD; the rest
    hold whatever was in memory and are left out rather than guessed at.
    """
    seeds: dict[str, int] = {}
    for slot in range(DECIMAL_SLOTS):
        address = DECIMAL_BASE + slot * DECIMAL_WIDTH
        digits = [(ram[address + offset] >> 4, ram[address + offset] & 0x0F) for offset in range(DECIMAL_WIDTH)]
        if any(high > 9 or low > 9 for high, low in digits):
            continue
        value = 0
        for high, low in digits:
            value = value * 100 + high * 10 + low
        seeds[str(slot)] = value
    return seeds


def decode_benson(ram: bytes) -> dict[str, Any]:
    """Decode every reachable instruction from all script entry points.

    The scripts share subroutines, so they are entry points into one program
    rather than separate programs. A recursive walk from all entries decodes
    each instruction exactly once and leaves unreachable bytes alone.
    """
    _require_engine(ram)
    words = decode_words(ram)
    entries = entry_addresses(ram)

    decoded: dict[int, dict[str, Any]] = {}
    pending = list(entries)
    while pending:
        address = pending.pop()
        if address in decoded:
            continue
        instruction = decode_instruction(ram, address, words)
        decoded[address] = instruction
        pending.extend(instruction["targets"])

    order = sorted(decoded)
    index_of = {address: index for index, address in enumerate(order)}
    for address in order:
        instruction = decoded[address]
        for target in instruction["targets"]:
            _require(
                target in index_of,
                f"Instruction at ${address:04x} reaches ${target:04x}, which was never decoded",
            )
        end = address + instruction["length"]
        _require(
            end <= SCRIPT_REGION[1],
            f"Instruction at ${address:04x} runs past the script region",
        )

    instructions: list[dict[str, Any]] = []
    for address in order:
        instruction = dict(decoded[address])
        instruction.pop("length")
        instruction.pop("targets")
        instruction.pop("falls")
        if "target" in instruction and instruction["op"] in {"jmp", "call"}:
            instruction["target"] = index_of[instruction["target"]]
        if "onTaken" in instruction:
            taken = dict(instruction["onTaken"])
            taken["target"] = index_of[taken["target"]]
            instruction["onTaken"] = taken
        instructions.append(instruction)

    covered = sum(decoded[address]["length"] for address in order)
    span = (order[0], order[-1] + decoded[order[-1]]["length"]) if order else (0, 0)
    used = {instruction["op"] for instruction in instructions}
    return {
        "schemaVersion": BENSON_SCHEMA_VERSION,
        "scripts": [{"id": script, "entry": index_of[address]} for script, address in enumerate(entries)],
        "instructions": instructions,
        "decimalSeeds": decimal_seeds(ram),
        # The census of what the scripts actually touch. This is the
        # specification of the app's Host Callout seam: nothing else is reachable.
        "symbols": {
            "reads": sorted({item["symbol"] for item in instructions if item["op"] == "cmp"}),
            "writes": sorted({item["symbol"] for item in instructions if item["op"] == "stor"}),
            "keys": sorted({item["key"] for item in instructions if "key" in item}),
            "sounds": sorted({item["symbol"] for item in instructions if item["op"] == "sound"}),
            "opcodes": sorted(used),
        },
        "framesPerTick": FRAMES_PER_TICK,
        "counts": {
            "scripts": len(entries),
            "instructions": len(instructions),
            "inlineMessages": sum(instruction["op"] == "msg" for instruction in instructions),
            "opcodesUsed": len(used),
            "soundStores": sum(instruction["op"] == "sound" for instruction in instructions),
            "codeBytes": covered,
            # Bytes inside the decoded span that no entry point reaches. Data
            # and dead code both land here, so this is reported rather than
            # treated as a failure.
            "unreachableBytes": max(0, span[1] - span[0] - covered),
        },
    }
