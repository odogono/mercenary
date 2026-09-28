#!/usr/bin/env python3
"""Landing-message decode check (#572).

Decodes the Damocles Script each landing trigger `$20`-`$3C` names and checks
the native facts around it, from captured RAM alone. It is a deterministic
check on the reading recorded in `docs/research/damocles-landing-messages.md`,
not a probe: it runs no emulator.

What it checks:

  scripts     the entry word at `$070080 + 2 * index` for `$20`-`$3D`, and
              each script's shape as the Script ISA decodes it. Message text
              is never printed; each message is named by the id
              `payload/damocles/strings.json` already gives its address.
  arming      the first world's `$7CB4 + index` bytes.
  random      the `if.random` handler `$051A5E`, the main loop's one-word
              advance at `$05948C`, and the 2,048-word table at `$77000` the
              pointer `$7E18` walks. `--memstates` sweeps the table across
              every memstate in a directory.
  firers      the three launcher calls that name the landing range: the
              landing `$059280`, trigger `$2A` at `$04D270` and trigger `$3C`
              at `$04D8BE`.
  save        the in-game load's copy `$0552C0`-`$0552D6`, which restores
              `$6140`-`$7E17` and so carries `$7CB4` and `$7BD8`.
  cross       with `--cross`, the #558 `cross` trace around the LACHESIS
              landing: the launch pass, the word `if.random` read, the wait
              and the first message.

Run from the repo root with the lab's venv python (Capstone):
  research/damocles-st/.venv/bin/python \\
    research/damocles-st/scripts/landing-message-check.py \\
    --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \\
    --cross research/damocles-st/work/space-flight-cross-20260928T094644Z-a1cc495e \\
    --memstates research/damocles-st/snapshots/rehosted

Output is a JSON report on stdout; the exit status is nonzero if any check
fails. Findings are Working-Authority Evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

LAB = Path(__file__).resolve().parents[1]
REPO = LAB.parents[1]
sys.path.insert(0, str(LAB))

import capstone  # noqa: E402

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
from damocleslab.script import (  # noqa: E402
    BANK_BASE,
    DEFAULT_END,
    DEFAULT_START,
    _decode_one,
    read_script_table,
)

ARMING = 0x7CB4
FLAGS = 0x7BD8
PENDING = 0x7A88
SCRIPT_PC = 0x781E
GATE = 0x7BA0
SOURCE = 0x7B98
COUNTER = 0x7B9C
RANDOM_POINTER = 0x7E18
NOISE = 0x77000
NOISE_BYTES = 0x1000

FIRST_LANDING = 0x20
LAST_LANDING = 0x3C
SKIP_TO_CLEAR_BUSY = 0x072CBE
SHARED_EPILOGUE = 0x072CAE
LANDING_WAIT = 0x072CE0
RANDOM_OPERAND = 0xA000

# The issue's table: the entry words the pinned first-world RAM holds.
ENTRY_WORDS = {
    0x20: 0x20B2, 0x21: 0x211A, 0x22: 0x21B0, 0x23: 0x2222, 0x24: 0x23C6,
    0x25: 0x22C0, 0x26: 0x232A, 0x27: 0x2438, 0x28: 0x2574, 0x29: 0x24D8,
    0x2A: 0x204C, 0x2B: 0x264E, 0x2C: 0x27A4, 0x2D: 0x26C2, 0x2E: 0x25E2,
    0x2F: 0x2734, 0x30: 0x2816, 0x31: 0x2852, 0x32: 0x2892, 0x33: 0x28D4,
    0x34: 0x2948, 0x35: 0x29BC, 0x36: 0x2B92, 0x37: 0x2B20, 0x38: 0x2A6E,
    0x39: 0x29FC, 0x3A: 0x2C04, 0x3B: 0x2C6E, 0x3C: 0x1254, 0x3D: 0x1DCE,
}

# Instruction facts, as Capstone prints them.
INSTRUCTIONS = {
    # if.random: read a word at the pointer, advance it inside $xx7000-$xx7FFE.
    0x051A60: "movea.l $7e18.w, a0",
    0x051A64: "move.w (a0)+, d0",
    0x051A68: "andi.w #$fff, d7",
    0x051A6C: "ori.w #$7000, d7",
    0x051A70: "move.w d7, $7e1a.w",
    0x051A78: "cmp.w d2, d0",
    # word below the operand reaches $051A2C, which takes the branch.
    0x051A7A: "bcs.b $51a2c",
    0x051A7C: "bra.b $51a28",
    # The main loop's join: one word a pass, no read.
    0x05948C: "move.w $7e1a.w, d7",
    0x059490: "addq.w #$2, d7",
    0x05949A: "move.w d7, $7e1a.w",
    # New Game seeds the pointer.
    0x051090: "move.l #$77000, $7e18.w",
    # The landing: trigger body + $1F, except ERIS ($2C) and DAMOCLES ($74).
    0x059284: "cmpi.w #$2c, d1",
    0x05928A: "cmpi.w #$74, d1",
    0x059290: "lsr.w #$2, d1",
    0x059292: "addi.w #$1f, d1",
    0x059296: "bsr.w $54770",
    # Trigger $2A: keypad Enter with slot 101 at the head of the Carried Stack.
    0x04D3F2: "cmpi.b #$72, d0",
    0x04D3F6: "beq.w $4d24c",
    0x04D24C: "move.b $61ce.w, d1",
    0x04D262: "cmpi.b #$65, d1",
    0x04D268: "cmpi.w #$e, $7a90.w",
    0x04D270: "moveq #$2a, d1",
    0x04D272: "bsr.w $54770",
    # Trigger $3C: case 5 of the $7856 dispatcher, with the comet drift armed.
    0x04D80E: "jmp $4d814(pc, d0.w)",
    0x04D828: "bra.w $4d898",
    0x04D8B0: "move.l #$ffffedcc, $7a7e.w",
    0x04D8B8: "movea.l #$74, a0",
    0x04D8BE: "moveq #$3c, d1",
    0x04D8F0: "bsr.w $54770",
    # The in-game load restores $6140..$7E17 whole.
    0x0552C0: "movea.l #$6140, a1",
    0x0552CE: "move.l #$1cd7, d1",
    0x0552D4: "move.b (a0)+, (a1)+",
    0x0552D6: "dbra d1, $552d4",
}

HASHED_RANGES = {
    "if.random $051A5E-$051A7E": (0x051A5E, 0x051A7E),
    "main-loop advance $05948C-$05949E": (0x05948C, 0x05949E),
    "landing trigger $059280-$05929A": (0x059280, 0x05929A),
    "noise table $77000-$77FFF": (NOISE, NOISE + NOISE_BYTES),
    "landing scripts $07204C-$072CAE": (0x07204C, 0x072CAE),
    "epilogues and delays $072CAE-$072D2E": (0x072CAE, 0x072D2E),
    "trigger dispatch $054764-$0547C6": (0x054764, 0x0547C6),
}


class CheckError(Exception):
    pass


def word(data: bytes, address: int) -> int:
    return int.from_bytes(data[address : address + 2], "big")


def long(data: bytes, address: int) -> int:
    return int.from_bytes(data[address : address + 4], "big")


def hexa(value: int) -> str:
    return f"${value:06X}"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise CheckError(message)


def disassemble(data: bytes, address: int) -> str:
    md = capstone.Cs(capstone.CS_ARCH_M68K, capstone.CS_MODE_BIG_ENDIAN | capstone.CS_MODE_M68K_000)
    for instruction in md.disasm(data[address : address + 10], address):
        return f"{instruction.mnemonic} {instruction.op_str}"
    return "?"


def message_ids() -> dict[int, str]:
    strings = json.loads((REPO / "payload/damocles/strings.json").read_text())
    return {int(record["address"], 16): record["id"] for record in strings["inlineMessages"]}


def walk(data: bytes, entry: int, ids: dict[int, str]) -> list[dict]:
    """Decode one script's straight-line body, following jumps once."""
    steps: list[dict] = []
    address = entry
    seen: set[int] = set()
    while address not in seen and len(steps) < 40:
        seen.add(address)
        decoded = _decode_one(data, address, DEFAULT_START, DEFAULT_END)
        step: dict = {"at": hexa(address), "op": decoded.op.name}
        if decoded.word & 0x80:
            step["not"] = True
        if decoded.text is not None:
            step["id"] = ids.get(address, "?")
        elif decoded.operands:
            step["operands"] = [
                f"${word(decoded.operands, i):04X}" for i in range(0, len(decoded.operands) - 1, 2)
            ]
        if decoded.target is not None:
            step["target"] = hexa(decoded.target)
        steps.append(step)
        if decoded.op.kind in ("return", "unused"):
            break
        if decoded.op.kind == "jump":
            address = decoded.target
            continue
        address += decoded.size
    return steps


def gazetteer(steps: list[dict]) -> list[str] | None:
    """The shape every one-shot landing script shares, or None if it differs."""
    if len(steps) < 4:
        return None
    head, wait = steps[0], steps[1]
    if not (
        head["op"] == "if.random"
        and "not" not in head
        and head["operands"] == [f"${RANDOM_OPERAND:04X}"]
        and head["target"] == hexa(SKIP_TO_CLEAR_BUSY)
        and wait["op"] == "call"
        and wait["target"] == hexa(LANDING_WAIT)
    ):
        return None
    body = steps[2:]
    messages = []
    while body and body[0]["op"] == "message":
        messages.append(body.pop(0)["id"])
    if not messages or not body or body[0]["op"] != "jump" or body[0]["target"] != hexa(SHARED_EPILOGUE):
        return None
    return messages


def check_scripts(data: bytes, ids: dict[int, str]) -> dict:
    table = read_script_table(data)
    arming = data[ARMING : ARMING + 64]
    report: dict = {"scripts": {}}
    for index, expected in ENTRY_WORDS.items():
        require(table[index] == BANK_BASE + expected, f"entry ${index:02X} is {hexa(table[index])}")
    for index in range(FIRST_LANDING, LAST_LANDING + 2):
        steps = walk(data, table[index], ids)
        messages = gazetteer(steps)
        entry = {
            "entry": hexa(table[index]),
            "arming": f"${arming[index]:02X}" if index <= LAST_LANDING else None,
        }
        if messages is not None:
            entry["shape"] = "gazetteer"
            entry["messages"] = messages
        else:
            entry["shape"] = "other"
            entry["steps"] = steps
        report["scripts"][f"${index:02X}"] = entry

    gazetteers = [k for k, v in report["scripts"].items() if v["shape"] == "gazetteer"]
    others = sorted(set(report["scripts"]) - set(gazetteers))
    require(others == ["$2A", "$38", "$3C", "$3D"], f"non-gazetteer scripts {others}")
    report["gazetteerCount"] = len(gazetteers)

    for index in range(FIRST_LANDING, LAST_LANDING + 1):
        expected = {0x38: 0xC0, 0x3C: 0xA0}.get(index, 0x80)
        require(arming[index] == expected, f"arming ${index:02X} is ${arming[index]:02X}")

    wait = walk(data, LANDING_WAIT, ids)
    require(
        [s["op"] for s in wait] == ["reset.wait", "if.wait", "return"]
        and wait[1]["operands"] == ["$0064"]
        and wait[1]["target"] == hexa(LANDING_WAIT + 2),
        "the $072CE0 delay is not the 100-count member",
    )
    return report


def check_instructions(data: bytes) -> dict:
    for address, expected in INSTRUCTIONS.items():
        actual = disassemble(data, address)
        require(actual == expected, f"{hexa(address)} reads {actual!r}, not {expected!r}")
    noise = data[NOISE : NOISE + NOISE_BYTES]
    words = [word(noise, i) for i in range(0, NOISE_BYTES, 2)]
    shown = sum(1 for value in words if value >= RANDOM_OPERAND)
    require(data[NOISE - 16 : NOISE] == bytes(16), "the noise table is not preceded by zeros")
    return {
        "instructions": len(INSTRUCTIONS),
        "hashes": {
            name: hashlib.sha256(data[start:end]).hexdigest() for name, (start, end) in HASHED_RANGES.items()
        },
        "noise": {
            "words": len(words),
            "atOrAboveOperand": shown,
            "belowOperand": len(words) - shown,
        },
        "randomPointer": hexa(long(data, RANDOM_POINTER)),
    }


def sweep(directory: Path, reference: bytes) -> dict:
    digest = hashlib.sha256(reference).hexdigest()
    swept = 0
    for path in sorted(directory.glob("*.sav")):
        ram = hatari_memstate_ram(path.read_bytes())
        table = ram[NOISE : NOISE + NOISE_BYTES]
        require(hashlib.sha256(table).hexdigest() == digest, f"{path.name} holds a different noise table")
        pointer = long(ram, RANDOM_POINTER)
        require(NOISE <= pointer < NOISE + NOISE_BYTES and pointer % 2 == 0, f"{path.name} pointer {hexa(pointer)}")
        swept += 1
    require(swept > 0, f"no memstates in {directory}")
    return {"memstates": swept, "identical": True}


def check_cross(run: Path, reference: bytes) -> dict:
    """The LACHESIS landing of the #558 `cross` trace, from its per-pass low windows."""
    passes: dict[int, bytes] = {}
    for path in run.glob("p*-low.bin"):
        passes[int(path.name[1:6])] = path.read_bytes()
    require(passes, f"no pass windows in {run}")
    trigger = 0x26
    launch = next(n for n in sorted(passes) if passes[n][ARMING + trigger] == 0)
    before, at = passes[launch - 1], passes[launch]
    require(before[ARMING + trigger] == 0x80 and before[FLAGS + 1] & 0x40 == 0, "not armed and idle before")
    require(at[FLAGS + 1] & 0x40, "busy not raised at the launch")
    pointer_before, pointer_at = long(before, RANDOM_POINTER), long(at, RANDOM_POINTER)
    require(pointer_at - pointer_before == 4, "the launch pass did not draw once besides the advance")
    drawn = word(reference, pointer_before + 2)
    require(drawn >= RANDOM_OPERAND, f"drawn word ${drawn:04X} would skip")
    first_message = next(n for n in sorted(passes) if n > launch and word(passes[n], GATE) != 0)
    source = long(passes[first_message], SOURCE)
    require(source == 0x072336, f"first message reads from {hexa(source)}")
    wait_start = next(n for n in sorted(passes) if n > launch and word(passes[n], COUNTER) < 10)
    wait_end = next(n for n in sorted(passes) if n > wait_start and long(passes[n], SCRIPT_PC) != 0x072CE2)
    per_pass = {
        word(passes[n + 1], COUNTER) - word(passes[n], COUNTER)
        for n in range(wait_start, wait_end - 1)
        if n + 1 in passes
    }
    return {
        "launchPass": launch,
        "pointerBefore": hexa(pointer_before),
        "pointerAfter": hexa(pointer_at),
        "wordDrawn": f"${drawn:04X}",
        "wordSkippedByAdvance": f"${word(reference, pointer_before):04X}",
        "waitPasses": [wait_start, wait_end],
        "counterPerPass": sorted(per_pass),
        "firstMessagePass": first_message,
        "passesAfterLaunch": first_message - launch,
        "firstMessageSource": hexa(source),
        "pendingThroughout": sorted({word(passes[n], PENDING) for n in passes if n >= launch - 1}),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--run", type=Path, required=True, help="a run holding the pinned observed.ram")
    parser.add_argument("--cross", type=Path, help="the #558 cross trace run directory")
    parser.add_argument("--memstates", type=Path, help="a directory of memstates to sweep the noise table over")
    args = parser.parse_args()

    ram_path = args.run / "observed.ram"
    data = ram_path.read_bytes()
    report: dict = {"ram": {"path": str(ram_path), "sha256": hashlib.sha256(data).hexdigest()}}
    try:
        report.update(check_scripts(data, message_ids()))
        report.update(check_instructions(data))
        report["save"] = {"restores": "$006140-$007E17", "carries": ["$7CB4", "$7BD8", "$7A88"], "omits": ["$7E18"]}
        if args.memstates:
            report["sweep"] = sweep(args.memstates, data[NOISE : NOISE + NOISE_BYTES])
        if args.cross:
            report["cross"] = check_cross(args.cross, data)
    except CheckError as error:
        report["error"] = str(error)
        print(json.dumps(report, indent=2))
        return 1
    report["ok"] = True
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
