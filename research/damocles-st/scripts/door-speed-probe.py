#!/usr/bin/env python3
"""Damocles door speed probe (#498).

#472 timed two lift doors VBL by VBL and found them slower or faster than the
Structure 74 trace the port's one rate came from. This probe asks where each
door's speed is set. Two halves, both gated: a fact the decode does not
reproduce raises.

``decode`` reads the pinned first-world RAM without Hatari. It hashes the
attachment animation ``$05AA3C``, checks that each of its twelve motion paths
loads the same step, ``move.l #1,d4``, and that nothing else in the routine
writes ``d4``, and checks the eight-unit endpoint insets. It then checks that
every memstate under ``snapshots/`` holds the same routine, byte for byte, so
no capture patches the step. Last, it reads each timed door's travel from the
Catalogue the port loads.

``trace`` reads the per-VBL traces ``lift-ride-probe.py live`` writes and
counts, exactly, the substeps each ride's door takes to close. The frame
loop runs ``clamp($51D22, 4, 8)`` substeps a frame. In every trace the door
starts moving in the frame the key is first seen in, so the count takes all
of that frame's substeps. The step countdown only runs once the latch has
cleared, so the countdown at the first stop with the latch clear says how
many of that frame's substeps came after it. The count must be the door's
travel plus one: the edge reaches its endpoint on the travel-th tick, and the
next tick clears the latch. That holds for these doors because both have two
leaves; a one-leaf door clears on the travel-th tick when its low edge falls.

Run from the repository root:

  python3 research/damocles-st/scripts/door-speed-probe.py decode
  python3 research/damocles-st/scripts/door-speed-probe.py trace --case eris --run <lift-ride-eris-...>
  python3 research/damocles-st/scripts/door-speed-probe.py trace --case vesta --run <lift-ride-vesta-...>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = LAB_ROOT.parents[1]
sys.path.insert(0, str(LAB_ROOT))

from capstone import CS_ARCH_M68K, CS_MODE_BIG_ENDIAN, CS_MODE_M68K_000, Cs  # noqa: E402

from damocleslab.catalogue import hatari_memstate_ram, read_catalogue  # noqa: E402
from damocleslab.core import LabError  # noqa: E402
from damocleslab.laboratory import WORK_ROOT  # noqa: E402

SNAPSHOTS = LAB_ROOT / "snapshots"
CATALOGUE = REPO_ROOT / "payload" / "damocles" / "catalogue.json"
FIRST_WORLD = WORK_ROOT / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"

HANDLER = (0x05AA3C, 0x05AD52)
HANDLER_SHA256 = "cd936e76d64a368856ff04e411221d249cfa4beeafc82b38e6b47533ec508cdb"
STEP = "283c00000001"  # move.l #1,d4

# The twelve motion paths: (address of the step load, what it moves).
STEP_SITES = {
    0x05AACC: "close, one leaf X, bit 8 set: high-X edge back up",
    0x05AAF4: "close, one leaf X, bit 8 clear: low-X edge back down",
    0x05AB22: "close, one leaf Z, bit 8 set",
    0x05AB4A: "close, one leaf Z, bit 8 clear",
    0x05AB86: "close, two leaves X: both inner edges to the midpoint",
    0x05ABCA: "close, two leaves Z",
    0x05AC2A: "open, one leaf X, bit 8 set",
    0x05AC54: "open, one leaf X, bit 8 clear",
    0x05AC84: "open, one leaf Z, bit 8 set",
    0x05ACAE: "open, one leaf Z, bit 8 clear",
    0x05ACE6: "open, two leaves X: inner edges out to outer edge +/- 8",
    0x05AD26: "open, two leaves Z",
}

# The eight-unit endpoint insets the open paths take off the far edge.
CODE_FACTS = {
    0x05AC24: ("5140", "subq.w #8,d0: one leaf X stops 8 short"),
    0x05AC4E: ("5040", "addq.w #8,d0: one leaf X stops 8 short"),
    0x05AC7E: ("5140", "subq.w #8,d0: one leaf Z stops 8 short"),
    0x05ACA8: ("5040", "addq.w #8,d0: one leaf Z stops 8 short"),
    0x05ACE2: ("50405143", "addq/subq #8: two leaves X stop 8 inside"),
    0x05AD22: ("50405143", "addq/subq #8: two leaves Z stop 8 inside"),
    0x059570: ("610014ca", "bsr $5aa3c: once per substep"),
    0x059548: ("0c4000086f04303c0008", "clamp the substeps at 8"),
    0x059552: ("0c4000046c04303c0004", "clamp the substeps at 4"),
}

# Each timed door: its slot and the structure slots its lift's Floors bind (#472).
CASES = {
    "eris": {"door": 0x3F4, "structures": (76, 78, 79)},
    "vesta": {"door": 0x3FC, "structures": (90, 91, 92, 93)},
    "spaceport": {"door": 0x3FC, "structures": (74,)},
}
LIFT_STEP_TICKS = 25
LATCH_OPEN = 0xFF


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def travel(model: dict[str, Any], slot: int) -> int:
    """The port's `attachmentOpenLimit`: the constructor's travel from the closed mesh."""
    attachment = next(item for item in model["structureSelection"]["attachments"] if item["slot"] == slot)
    axis = 0 if attachment["constructor"]["motionAxis"] == "x" else 2
    values = [vertex[axis] for vertex in attachment["mesh"]["vertices"]]
    span = max(values) - min(values)
    reach = span // 2 if attachment["constructor"]["leafCount"] == 2 else span
    return reach - 8


def case_travel(case: str) -> int:
    catalogue = read_catalogue(CATALOGUE)
    spec = CASES[case]
    travels = set()
    for slot in spec["structures"]:
        model = next(
            item for item in catalogue["models"] if item.get("structureSelection") and item["slots"][:1] == [slot]
        )
        travels.add(travel(model, spec["door"]))
    _check(len(travels) == 1, f"{case}: the door's travel differs between Floors: {sorted(travels)}")
    return travels.pop()


def decode() -> int:
    _check(FIRST_WORLD.is_file(), f"pinned first-world RAM not found: {FIRST_WORLD}")
    ram = FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(ram).hexdigest() == FIRST_WORLD_SHA256, "first-world RAM hash")
    start, end = HANDLER
    handler = ram[start:end]
    _check(hashlib.sha256(handler).hexdigest() == HANDLER_SHA256, "attachment animation hash")

    for address, meaning in STEP_SITES.items():
        found = ram[address : address + 6].hex()
        _check(found == STEP, f"${address:06X} ({meaning}): {found} != {STEP}")
    for address, (hexbytes, meaning) in CODE_FACTS.items():
        found = ram[address : address + len(hexbytes) // 2].hex()
        _check(found == hexbytes, f"${address:06X} ({meaning}): {found} != {hexbytes}")

    # Nothing else in the routine writes d4, so the step cannot come from the record.
    disassembler = Cs(CS_ARCH_M68K, CS_MODE_BIG_ENDIAN | CS_MODE_M68K_000)
    writers = [
        instruction.address
        for instruction in disassembler.disasm(handler, start)
        if instruction.op_str.replace(" ", "").endswith(",d4")
    ]
    _check(writers == sorted(STEP_SITES), f"d4 writers {[f'${a:06X}' for a in writers]}")

    memstates = sorted({*SNAPSHOTS.glob("*.sav"), *SNAPSHOTS.glob("rehosted/*.sav")})
    _check(memstates, f"no memstates under {SNAPSHOTS}")
    for path in memstates:
        capture = hatari_memstate_ram(path.read_bytes())
        _check(
            hashlib.sha256(capture[start:end]).hexdigest() == HANDLER_SHA256,
            f"{path.name}: the attachment animation differs",
        )

    print(
        json.dumps(
            {
                "handler": {"range": f"${start:06X}-${end - 1:06X}", "sha256": HANDLER_SHA256},
                "stepSites": len(STEP_SITES),
                "codeFacts": len(CODE_FACTS),
                "memstates": len(memstates),
                "travel": {case: case_travel(case) for case in CASES},
            },
            indent=2,
        )
    )
    return 0


def close_substeps(stops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every ride whose door starts fully open, with the exact substeps it took to close."""
    substeps = {stop["frames"]: max(4, min(8, stop["frameVbls"])) for stop in stops}
    rides = []
    for index in range(1, len(stops)):
        before, admitted = stops[index - 1], stops[index]
        if not (before["destination"] == -1 and admitted["destination"] != -1):
            continue
        if before["latch"] != LATCH_OPEN:
            continue  # the door was still moving: the admission reversed it part-way
        closed = next(stop for stop in stops[index:] if stop["latch"] == 0)
        first, last = admitted["frames"], closed["frames"]
        after_clear = LIFT_STEP_TICKS - closed["countdown"]
        _check(0 <= after_clear < substeps[last], f"VBL {closed['vbl']}: countdown {closed['countdown']}")
        count = sum(substeps[frame] for frame in range(first, last)) + substeps[last] - after_clear
        rides.append({"admittedVbl": admitted["vbl"], "closedVbl": closed["vbl"], "substeps": count})
    return rides


def trace(case: str, run: Path) -> int:
    path = run / "trace.json"
    _check(path.is_file(), f"{run.name}: no trace.json; run lift-ride-probe.py live to write one")
    stops = json.loads(path.read_text())
    door = CASES[case]["door"]
    _check(all(stop["door"] == door for stop in stops), f"{run.name}: not door ${door:03X}")
    expected = case_travel(case) + 1
    rides = close_substeps(stops)
    _check(rides, f"{run.name}: no ride started from a fully open door")
    for ride in rides:
        _check(
            ride["substeps"] == expected,
            f"{run.name}: VBL {ride['admittedVbl']} closed in {ride['substeps']} substeps, not {expected}",
        )
    print(json.dumps({"run": run.name, "case": case, "expected": expected, "rides": rides}, indent=1))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("decode")
    trace_parser = sub.add_parser("trace")
    trace_parser.add_argument("--case", choices=("eris", "vesta"), required=True)
    trace_parser.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    if args.mode == "decode":
        return decode()
    return trace(args.case, args.run)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
