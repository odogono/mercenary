#!/usr/bin/env python3
"""Damocles Head Command probe (#596).

The ST binds Open, Read, Next and Previous to keypad Enter, ``*``, ``+`` and
``-``. This probe checks the decode of their dispatch and of the document
display, and confirms both against Hatari.

``decode`` reads the pinned first-world RAM and the memstates without Hatari.
It checks the instruction words each finding rests on, prints the Open table
at ``$04D2C4`` and every document in the bank at ``$073500``, hashes the
routines the note quotes, and sweeps the memstates for the panel state and
the document bank.

``live`` boots one rehosted memstate and puts an object at the head of the
Carried Stack by writing ``$61CC``/``$61CE``. It then presses a case's keys
and, after each one, saves the whole RAM and a screenshot. It raises unless
the panel state after each press is what the decode predicts.

Run from the repository root:

  python3 research/damocles-st/scripts/head-command-probe.py decode \
    --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
    --memstates research/damocles-st/snapshots/rehosted
  python3 research/damocles-st/scripts/head-command-probe.py live --roms roms --case NAME

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
from damocleslab.core import LabError, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    WORK_ROOT,
    _fifo_send,
    _run_id,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

REPO = LAB_ROOT.parents[1]
PROGRAM_SHA256 = "8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"

# ST scancodes, sent to hatari-event as decimal.
KEYPAD_ENTER, KEYPAD_STAR, KEYPAD_PLUS, KEYPAD_MINUS = 0x72, 0x66, 0x4E, 0x4A
LEFT, RIGHT, DOWN = 0x4B, 0x4D, 0x50

STACK_COUNT, STACK = 0x61CC, 0x61CE
PANEL = 0x785E            # long: open object, panel state, document index, 0
ITEM_INDEX, ITEM = 0x7854, 0x7858
DOCUMENT_LENGTH = 0x785C
MESSAGE_OBJECT = 0x7856   # byte object, byte item index, copied by Read
MESSAGE_POINTER, MESSAGE_RESUME = 0x7B92, 0x7B96
TRANSITION = 0x52938      # word: panel transition steps left, keypad ignored while set
IMPACT_CLOCK = 0x793C
VBL_CLOCK = 0x51D98
OCCUPANCY = 0x7AAE        # 1 on foot, 0 aboard, 2 in space
SAFE_GATE, CHAIR_GATE = 0x7A60, 0x7A90

OPEN_TABLE = 0x4D2C4
DOCUMENT_BANK = 0x73500
DOCUMENT_BANK_END = 0x76000
STATES = {2: "document", 3: "detonator", 4: "author's computer", 5: "A to Z computer",
          6: "switch"}

# Instruction words the note's claims rest on: (address, hex, meaning).
INSTRUCTIONS = [
    (0x055690, "0c00004a6d064ef90004d3d2", "scancodes $4A and up jump to the keypad dispatch"),
    (0x04D3EA, "4a7900052938662c", "keys ignored while the panel transition runs"),
    (0x04D3F2, "0c0000726700fe54", "keypad Enter is Open, $04D24C"),
    (0x04D3FA, "1238785f671e", "otherwise dispatch on the panel state $785F"),
    (0x04D24C, "123861ce41f90004d2bc", "Open reads the Carried Stack head $61CE"),
    (0x04D282, "b438785e673a", "Open of the object already open does nothing"),
    (0x04D25C, "4a787a606760", "the NOVAGEN SAFE opens only once $7A60 is set"),
    (0x04D268, "0c78000e7a906652722a610074fc", "AUTHORS COMPUTER only from the AUTHOR'S CHAIR, and fires script $2A"),
    (0x04D762, "0c00004e6738", "document +: Next"),
    (0x04D768, "0c00004a6758", "document -: Previous"),
    (0x04D76E, "0c0000666702", "document *: Read"),
    (0x04D776, "4a787b966600002222387858508121c17b92", "Read queues the item body at +8 as a message"),
    (0x04D7AC, "4a106a0a90f8785c524842787854", "Next wraps at the $80 terminator"),
    (0x04D7D4, "d0f8785c31fc00087854", "Previous wraps to the last item and sets the index to 8"),
    (0x04DB9E, "207c000735007000103878 60".replace(" ", ""), "Open selects document $7860 in the bank at $073500"),
    (0x058F1E, "33fc004000052938", "the panel transition runs $40 steps"),
    (0x0529D6, "1038785f0c0000026700b1de", "at its end state 2 draws the item name, $04DBBE"),
    (0x05468E, "42b8785e61004834", "dropping the open object closes the panel"),
    (0x0547F2, "0c3800837856660c4a3871266a0631fc80007b96", "BOOK page action only with the MAGIC CRYSTAL"),
    (0x04CA90, "0c380003786 66e0831fcffff7a60".replace(" ", ""), "an explosion of strength 3 or less opens the safe"),
]

SOURCE_RANGES = [
    (0x04D24C, 0x04D2C4, "Open"),
    (0x04D2C4, 0x04D3AC, "the Open table"),
    (0x04D3AE, 0x04D4D0, "keypad digits, the keypad dispatch and the switches"),
    (0x04D4D0, 0x04D5DA, "the author's computer"),
    (0x04D69C, 0x04D762, "the timed detonator"),
    (0x04D762, 0x04D7F0, "document Read, Next and Previous"),
    (0x04D7F0, 0x04D834, "the BOOK page action dispatch"),
    (0x04DB9E, 0x04DBDA, "document select and item draw"),
    (0x052938, 0x052A0A, "the panel transition"),
    (0x0555B8, 0x05569C, "the main key dispatcher"),
    (0x058EC8, 0x058F2C, "the panel graphic select"),
    (0x073500, 0x07612C, "the document bank"),
]


def u8(ram: bytes, address: int) -> int:
    return ram[address]


def u16(ram: bytes, address: int) -> int:
    return struct.unpack_from(">H", ram, address)[0]


def s32(ram: bytes, address: int) -> int:
    return struct.unpack_from(">i", ram, address)[0]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_ram(path: Path) -> bytes:
    data = path.read_bytes()
    return hatari_memstate_ram(data) if path.suffix == ".sav" else data


def object_names() -> dict[int, str]:
    catalogue = json.loads((REPO / "payload/damocles/catalogue.json").read_text())
    names: dict[int, str] = {}
    for model in catalogue["modelIndex"]:
        for slot in model.get("slots") or []:
            names.setdefault(slot, model["name"])
    return names


def open_table(ram: bytes) -> list[dict]:
    rows = []
    address = OPEN_TABLE
    while ram[address]:
        slot, state, index = ram[address], ram[address + 1], ram[address + 2]
        rows.append({"address": address, "slot": slot, "state": state, "index": index,
                     "colour15": u16(ram, address + 4), "colour3": u16(ram, address + 6)})
        address += 8
    return rows


def document(ram: bytes, index: int) -> dict:
    """A document: length word, 3 bytes, NUL-terminated items, a negative terminator."""
    offset = struct.unpack_from(">h", ram, DOCUMENT_BANK + index)[0]
    start = DOCUMENT_BANK + offset
    length = u16(ram, start)
    items = []
    pointer = start + 5
    while ram[pointer] < 0x80:
        end = ram.index(0, pointer)
        text = ram[pointer:end].decode("latin-1")
        items.append({"address": pointer, "name": text[:8].rstrip(), "body": text[8:]})
        pointer = end + 1
    if pointer - start != length + 4:
        raise LabError(f"document {index:#x}: terminator at {pointer:#x} is not start + length + 4")
    return {"index": index, "address": start, "length": length, "items": items,
            "terminator": pointer}


# ----------------------------------------------------------------------- decode


def decode(run: Path, memstates: Path | None) -> None:
    ram = (run / "observed.ram").read_bytes()
    if sha256(ram) != FIRST_WORLD_SHA256:
        raise LabError("the pinned first-world RAM does not match")
    for address, expected, meaning in INSTRUCTIONS:
        actual = ram[address:address + len(expected) // 2].hex()
        if actual != expected:
            raise LabError(f"${address:06X}: {actual} is not {expected} ({meaning})")
        print(f"ok ${address:06X}  {meaning}")

    names = object_names()
    print("\nOpen table $04D2C4")
    documents = {}
    for row in open_table(ram):
        name = names.get(row["slot"], "?")
        line = (f"  ${row['address']:06X} slot {row['slot']:3d} {name:<18} state {row['state']} "
                f"{STATES[row['state']]:<17} index ${row['index']:02X} "
                f"colours 15=${row['colour15']:03X} 3=${row['colour3']:03X}")
        if row["state"] == 2:
            documents[row["index"]] = name
        print(line)

    print("\nDocuments in the bank at $073500")
    for index in sorted(documents):
        entry = document(ram, index)
        print(f"  ${index:02X} {documents[index]} at ${entry['address']:06X}, "
              f"{len(entry['items'])} items, length {entry['length']}")
        for number, item in enumerate(entry["items"]):
            print(f"    {number:2d} {item['name']:<8} | {item['body'].strip()}")

    strings = (REPO / "payload/damocles/strings.json").read_text()
    uncovered = sum(1 for index in documents
                    for item in document(ram, index)["items"]
                    if item["body"].strip()[:24] not in strings)
    print(f"\nitems whose body strings.json does not carry: {uncovered}")

    print("\nSource ranges")
    for start, end, label in SOURCE_RANGES:
        print(f"  ${start:06X}-${end:06X} {label}: {sha256(ram[start:end])}")

    if memstates:
        bank = ram[DOCUMENT_BANK:DOCUMENT_BANK_END]
        print("\nMemstates: panel $785E, item $7858, index $7854, transition, bank")
        for path in sorted(memstates.glob("*.sav")):
            state = read_ram(path)
            same = "same" if state[DOCUMENT_BANK:DOCUMENT_BANK_END] == bank else "DIFFERS"
            print(f"  {path.stem:<24} {state[PANEL:PANEL + 4].hex()} {s32(state, ITEM):08x} "
                  f"{u16(state, ITEM_INDEX):04x} {u16(state, TRANSITION):04x} {same}")


# ------------------------------------------------------------------------- live


@dataclass
class Step:
    label: str
    key: int | None
    expect_panel: str | None = None    # hex of $785E..$7861, or None
    wait: float = 2.5
    expect: dict = field(default_factory=dict)


# Documents: the DAMOCLES FILE is slot 151 ($97) and document $0E. Its panel long
# after Open is 97 02 0e 00. The BOOK is slot 131 ($83), document $04.
CASES: dict[str, dict] = {
    "damocles-file": {
        "snapshot": "rehosted/eris-lift",
        "head": 0x97,
        "steps": [
            Step("before", None, "00000000"),
            Step("open", KEYPAD_ENTER, "97020e00", expect={"item": 0}),
            Step("next", KEYPAD_PLUS, "97020e00", expect={"item": 1}),
            Step("read", KEYPAD_STAR, "97020e00", wait=6.0, expect={"item": 1, "read": True}),
            Step("previous", KEYPAD_MINUS, "97020e00", expect={"item": 0}),
            Step("previous-wrap", KEYPAD_MINUS, "97020e00", expect={"item": 10, "index": 8}),
            Step("next-wrap", KEYPAD_PLUS, "97020e00", expect={"item": 0, "index": 0}),
            Step("open-again", KEYPAD_ENTER, "97020e00", expect={"item": 0}),
            Step("rotate", LEFT, "97020e00", expect={"item": 0, "head": "KEY- V.I.P. LIMO"}),
            Step("next-after-rotate", KEYPAD_PLUS, "97020e00", expect={"item": 1}),
        ],
    },
    # dion-2-3 carries the DAMOCLES FILE at the head in its own right, so the
    # drop places a real carried object.
    "damocles-file-drop": {
        "snapshot": "rehosted/dion-2-3",
        "head": None,
        "steps": [
            Step("open", KEYPAD_ENTER, "97020e00"),
            Step("drop", DOWN, "00000000", wait=4.0),
        ],
    },
    "aboard": {
        "snapshot": "dion-north-airborne",
        "head": 0x97,
        "steps": [
            Step("before", None, "00000000"),
            Step("open", KEYPAD_ENTER, "97020e00", expect={"item": 0}),
            Step("next", KEYPAD_PLUS, "97020e00", expect={"item": 1}),
        ],
    },
    "book": {
        "snapshot": "rehosted/eris-spaceport-onfoot",
        "head": 0x83,
        "steps": [
            Step("open", KEYPAD_ENTER, "83020400", expect={"item": 0}),
            Step("next", KEYPAD_PLUS, "83020400", expect={"item": 1}),
            Step("read", KEYPAD_STAR, "83020400", wait=6.0, expect={"item": 1, "read": True}),
        ],
    },
    "safe-shut": {
        "snapshot": "rehosted/eris-spaceport-onfoot",
        "head": 0x66,
        "steps": [
            Step("open", KEYPAD_ENTER, "00000000"),
        ],
    },
}


def poke(address: int, data: bytes) -> str:
    return f"hatari-debug w ${address:x} " + " ".join(f"{byte:02x}" for byte in data)


def press(handle, code: int) -> None:
    _fifo_send(handle, [f"hatari-event keydown {code:02d}"])
    time.sleep(0.15)
    _fifo_send(handle, [f"hatari-event keyup {code:02d}"])


def sample(handle, run_directory: Path, prefix: str) -> bytes:
    ram_path = run_directory / f"{prefix}.ram"
    shot_path = run_directory / f"{prefix}.png"
    _fifo_send(handle, ["hatari-stop", "hatari-debug setopt hex",
                        f"hatari-debug savebin {ram_path} $0 $100000",
                        f"hatari-debug screenshot {shot_path}",
                        "hatari-cont"])
    for _ in range(100):
        if ram_path.is_file() and ram_path.stat().st_size == 0x100000 and shot_path.is_file():
            break
        time.sleep(0.1)
    else:
        raise LabError(f"sample {prefix} was not written")
    time.sleep(0.3)
    return ram_path.read_bytes()


def item_number(ram: bytes) -> int | None:
    panel = ram[PANEL:PANEL + 4]
    if panel[1] != 2:
        return None
    pointer = s32(ram, ITEM)
    items = document(ram, panel[2])["items"]
    for number, item in enumerate(items):
        if item["address"] == pointer:
            return number
    raise LabError(f"item pointer {pointer:#x} is not the start of an item")


def live(case_name: str, roms_root: Path | None, settle: float) -> Path:
    case = CASES[case_name]
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    snapshot = LAB_ROOT / "snapshots" / f"{case['snapshot']}.sav"
    ram0 = read_ram(snapshot)
    count = u16(ram0, STACK_COUNT)
    stack = ram0[STACK:STACK + count]
    if case["head"] is not None:
        stack = bytes([case["head"]]) + stack

    run_directory = WORK_ROOT / _run_id(f"head-command-{case_name}")
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    parse_script = run_directory / "play.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari_binary, tos=tos_path, disk_a=program_path,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse_script, fast_forward=False, statusbar=False,
        cmd_fifo=fifo, extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                               stdout=(run_directory / "hatari.log").open("ab"),
                               stderr=subprocess.STDOUT, env=env)
    samples = []
    names = object_names()
    try:
        for _ in range(200):
            if fifo.exists() or process.poll() is not None:
                break
            time.sleep(0.05)
        if process.poll() is not None or not fifo.exists():
            raise LabError("Hatari exited before creating the command FIFO")
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            if case["head"] is not None:
                _fifo_send(handle, ["hatari-stop", "hatari-debug setopt hex",
                                    poke(STACK_COUNT, len(stack).to_bytes(2, "big")),
                                    poke(STACK, stack),
                                    "hatari-cont"])
                time.sleep(0.5)
            for number, step in enumerate(case["steps"]):
                if step.key is not None:
                    press(handle, step.key)
                time.sleep(step.wait)
                ram = sample(handle, run_directory, f"{number:02d}-{step.label}")
                record = {
                    "step": step.label,
                    "key": None if step.key is None else f"${step.key:02X}",
                    "panel": ram[PANEL:PANEL + 4].hex(),
                    "item": item_number(ram),
                    "itemIndex": u16(ram, ITEM_INDEX),
                    "messageObject": ram[MESSAGE_OBJECT:MESSAGE_OBJECT + 2].hex(),
                    "messagePointer": f"{s32(ram, MESSAGE_POINTER):08x}",
                    "messageResume": f"{u16(ram, MESSAGE_RESUME):04x}",
                    "transition": u16(ram, TRANSITION),
                    "head": names.get(ram[STACK], "?"),
                    "stackCount": u16(ram, STACK_COUNT),
                    "occupancy": u16(ram, OCCUPANCY),
                    "impactClock": s32(ram, IMPACT_CLOCK),
                    "vblClock": u16(ram, VBL_CLOCK),
                    "sha256": sha256(ram),
                }
                samples.append(record)
                print(json.dumps(record), flush=True)
                if step.expect_panel is not None and record["panel"] != step.expect_panel:
                    raise LabError(f"{step.label}: panel {record['panel']}, "
                                   f"expected {step.expect_panel}")
                if "item" in step.expect and record["item"] != step.expect["item"]:
                    raise LabError(f"{step.label}: item {record['item']}, "
                                   f"expected {step.expect['item']}")
                if "head" in step.expect and record["head"] != step.expect["head"]:
                    raise LabError(f"{step.label}: head {record['head']}, "
                                   f"expected {step.expect['head']}")
                if "index" in step.expect and record["itemIndex"] != step.expect["index"]:
                    raise LabError(f"{step.label}: index {record['itemIndex']}, "
                                   f"expected {step.expect['index']}")
            _fifo_send(handle, ["hatari-stop"])
            time.sleep(0.3)
    finally:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
    result = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "case": case_name,
        "snapshot": {"path": str(snapshot.relative_to(REPO)),
                     "sha256": sha256(snapshot.read_bytes())},
        "probe": {"path": str(Path(__file__).resolve().relative_to(REPO)),
                  "sha256": sha256(Path(__file__).resolve().read_bytes())},
        "toolchain": toolchain,
        "stack": stack.hex(),
        "samples": samples,
    }
    (run_directory / "result.json").write_text(json.dumps(result, indent=1, default=str) + "\n",
                                                encoding="utf-8")
    print(run_directory)
    return run_directory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    decode_parser = commands.add_parser("decode")
    decode_parser.add_argument("--run", type=Path, required=True)
    decode_parser.add_argument("--memstates", type=Path)
    live_parser = commands.add_parser("live")
    live_parser.add_argument("--roms", type=Path)
    live_parser.add_argument("--case", choices=sorted(CASES), required=True)
    live_parser.add_argument("--settle", type=float, default=3.0)
    arguments = parser.parse_args()
    if arguments.command == "decode":
        decode(arguments.run, arguments.memstates)
    else:
        live(arguments.case, arguments.roms, arguments.settle)


if __name__ == "__main__":
    main()
