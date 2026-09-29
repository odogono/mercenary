#!/usr/bin/env python3
"""Damocles location-trigger probe (#610).

The port fires Damocles Script triggers from pickups and landings only. The ST
also fires them from a per-structure-group table the workspace loader publishes
at ``[$7A68]``. This probe recovers that table and the two walks that read it,
and confirms the State Office's two entries at runtime.

Two halves, both gated: a reading the capture does not reproduce raises.

``decode`` reads the pinned first-world RAM and every memstate without Hatari.
It checks the instructions the reading rests on (the loader's publish
``$04ED14``-``$04ED26``, the region walk ``$05A6E8``-``$05A72C``, the cell walk
``$054C88``-``$054CAC`` and their callers), decodes the table of every
structure group an island record binds, checks each memstate's live
``[$7A68]`` against the decode of its own group, and decodes each named
trigger's script to its op names and ``strings.json`` message ids. It prints
no game text.

``live`` boots ``snapshots/rehosted/eris-lift.sav`` (the State Office lift,
Floor 0) and runs a chain that stops on every VBL. The inputs are written from
the chain's stop scripts, so a case needs no host timing: the stick into its
joystick-1 byte ``$79C2``, a lift key into the ACIA mailbox ``$5558C``, and,
where a case says so, a pose. The capture has already spent trigger 3, so the
cases that need it re-arm it by writing ``$80`` to ``$7CB7``. That is the one
edit to game state that is not an input.

  walk-out     walk out of the car into the hall: trigger 3 fires on the pass
               the eye leaves the car.
  front-door   stand outside the front door and walk in: the outdoor regions
               (bit 14 set) never fire; the door region does.
  offer        ride to Floor 2, stand in region 1 before door 6 and walk
               through it: trigger 4 fires on entering region 7.
  queue        fire trigger 3, walk back into the car, ride to Floor 2 and walk
               into region 7 while trigger 3 is still presenting: trigger 4
               queues in ``$7A88`` and launches once trigger 3 clears busy.

Run from the repository root with the lab's venv python (Capstone):

  research/damocles-st/.venv/bin/python research/damocles-st/scripts/location-trigger-probe.py decode
  research/damocles-st/.venv/bin/python research/damocles-st/scripts/location-trigger-probe.py live --roms roms [--case NAME ...]

Generated evidence stays below the laboratory's ignored ``work/`` directory.
Findings are Working-Authority Evidence; see
``docs/research/damocles-location-triggers.md``.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import struct
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
REPO = LAB_ROOT.parents[1]
sys.path.insert(0, str(LAB_ROOT))

import capstone  # noqa: E402

from damocleslab.catalogue import (  # noqa: E402
    decode_island_records,
    decode_location_table,
    hatari_memstate_ram,
)
from damocleslab.core import LabError, file_hash  # noqa: E402
from damocleslab.laboratory import WORK_ROOT, _run_id  # noqa: E402
from damocleslab.script import BANK_BASE, DEFAULT_END, DEFAULT_START, _decode_one, read_script_table  # noqa: E402

# The chain machinery is the #509 lift-ride probe's; its file name has hyphens.
_spec = importlib.util.spec_from_file_location("lift_ride_probe", LAB_ROOT / "scripts" / "lift-ride-probe.py")
lift = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lift)

SNAPSHOTS = LAB_ROOT / "snapshots"
FIRST_WORLD = WORK_ROOT / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"

GROUP = 0x794E
TABLE_POINTER = 0x7A68
ARMING = 0x7CB4
FLAGS = 0x7BD8
BUSY = 0x0040
PENDING = 0x7A88
SCRIPT_PC = 0x7820  # bank-relative word of the running script
REGION = 0x7AFC  # word; $7AFD is its low byte
REGION_FLAGS = 0x7B34
OUTDOOR = 0x4000  # bit 14: $05A722's btst #$e on the byte $7B34 is bit 6 of that byte
FLOOR = 0x7AA4  # word; $7AA5 is its low byte
CELL = 0x7B5C
SURFACE_BODIES = 30

# Every table the island records bind, from the pinned first-world RAM. Group $0E is
# kept out: its place list has no terminator, and what the loader reads is checked apart.
TABLES = {
    0x02: ["de00000a", "b2000009", "b204010c"],
    0x03: ["6003081e", "6200003d"],
    0x05: ["73000007"],
    0x0F: ["8603011f"],
    0x12: ["89000003", "89070204", "cf060a08", "ec03011c", "1103011d"],
    0x18: ["3100003f"],
    0x35: ["2200000d"],
}
UNTERMINATED_GROUP = 0x0E
UNTERMINATED_ENTRIES = 24
UNTERMINATED_STRUCTURE_CELL = 0x88  # the one cell group $0E's overrides place a structure in

TRIGGERS = [0x03, 0x04, 0x07, 0x08, 0x09, 0x0A, 0x0C, 0x0D, 0x1C, 0x1D, 0x1E, 0x1F, 0x3D, 0x3F]
ENTRIES = {
    0x03: 0x04C8, 0x04: 0x0650, 0x07: 0x0E82, 0x08: 0x0F24, 0x09: 0x0E22, 0x0A: 0x0B80, 0x0C: 0x0E4E,
    0x0D: 0x0F88, 0x1C: 0x1ACE, 0x1D: 0x1B64, 0x1E: 0x1C2A, 0x1F: 0x1CFC, 0x3D: 0x1DCE, 0x3F: 0x1F20,
}
FIRST_WORLD_ARMING = {index: 0x80 for index in TRIGGERS} | {0x04: 0xA0}
SHARED = {0x072CAE, 0x072CBE, 0x072CE0, 0x072D1C}

# Script ops the port's step list (web/src/damocles/scripts.ts) has an equivalent for.
PORTED_OPS = {"message", "jump", "call", "return", "if.random", "if.flags", "flags.set", "reset.wait", "if.wait"}

# The other launcher callers, with the index each writes into d1 before it.
NATIVE_CALLERS = {
    0x04BEE6: 0x1A, 0x04BEF8: 0x01, 0x04C90C: 0x10, 0x04C918: 0x11, 0x04C93A: 0x12, 0x04C95C: 0x13,
    0x04C96C: 0x0E, 0x04C984: 0x1B, 0x04C9CE: 0x1A, 0x04D272: 0x2A, 0x04D85C: 0x15, 0x04D8D2: 0x19,
    0x051F66: 0x0F,
}
# $04D8F0 is one launcher call that six branches reach, each with its own moveq.
SHARED_CALL = 0x04D8F0
SHARED_CALL_LOADS = {0x04D860: 0x16, 0x04D888: 0x17, 0x04D894: 0x15, 0x04D8BE: 0x3C, 0x04D8C8: 0x15, 0x04D8CC: 0x18}

INSTRUCTIONS = {
    # The loader publishes the place list, steps over it, and publishes the byte after it.
    0x04ED14: "move.l a4, $7a6c.w",
    0x04ED18: "tst.b (a4)+",
    0x04ED1C: "subq.l #$1, a4",
    0x04ED1E: "lea.l $14(a4), a4",
    0x04ED22: "tst.b (a4)+",
    0x04ED24: "bne.b $4ed1e",
    0x04ED26: "move.l a4, $7a68.w",
    # Past the region's own edge: reselect, then walk the table.
    0x05A6E8: "bsr.w $5a32c",
    0x05A6EC: "movea.l $7a68.w, a0",
    0x05A6F0: "move.w $7b5c.w, d2",
    0x05A6FC: "cmp.b d2, d0",
    0x05A704: "beq.b $5a722",
    0x05A706: "cmp.b $7afd.w, d0",
    0x05A710: "bmi.b $5a718",
    0x05A712: "cmp.b $7aa5.w, d0",
    0x05A71A: "move.b $3(a0), d1",
    0x05A71E: "bra.w $54770",
    0x05A722: "btst.b #$e, $7b34.w",
    0x05A728: "beq.b $5a70c",
    # The cell walk: region $FF entries, on a cell change, with Y's high word zero.
    0x054C88: "tst.w $7ab6.w",
    0x054C9A: "cmp.b d3, d0",
    0x054C9E: "cmpi.b #$ff, $1(a1)",
    0x054CAC: "bsr.w $54770",
    0x054B6A: "cmp.w $79c6.w, d0",
    0x054B74: "beq.b $54bb6",
    0x054BA2: "move.w d3, $7b5c.w",
    0x054BA6: "bsr.w $54bf8",
    # Who runs them: the region test every substep and once after, and at a lift arrival.
    0x05957A: "bsr.w $5a64a",
    0x059586: "bsr.w $5a64a",
    0x055BFC: "bsr.w $5a64a",
    0x0596D6: "bsr.w $54b3e",
    0x0597CE: "bsr.w $54b3e",
    # A queueable trigger is left armed and written to $7A88 while busy.
    0x054784: "btst.b #$5, (a0, d1.w)",
    0x05478C: "move.w d1, $7a88.w",
    0x0547A0: "bclr.b #$7, (a0, d1.w)",
}

HASHED_RANGES = {
    "loader publish $04ED14-$04ED2A": (0x04ED14, 0x04ED2A),
    "region walk $05A6E8-$05A72E": (0x05A6E8, 0x05A72E),
    "cell walk $054C88-$054CB0": (0x054C88, 0x054CB0),
    "cell change $054B3E-$054BF8": (0x054B3E, 0x054BF8),
    "trigger dispatch $054764-$0547C6": (0x054764, 0x0547C6),
}


def _u16(data: bytes, address: int) -> int:
    return int.from_bytes(data[address : address + 2], "big")


def _u32(data: bytes, address: int) -> int:
    return int.from_bytes(data[address : address + 4], "big")


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _disassemble(data: bytes, address: int) -> str:
    md = capstone.Cs(capstone.CS_ARCH_M68K, capstone.CS_MODE_BIG_ENDIAN | capstone.CS_MODE_M68K_000)
    for instruction in md.disasm(data[address : address + 10], address):
        return f"{instruction.mnemonic} {instruction.op_str}"
    return "?"


def _entries_hex(table: dict) -> list[str]:
    return [struct.pack(">BBbB", e["cell"], e["region"], e["floor"], e["trigger"]).hex() for e in table["entries"]]


def _message_ids() -> dict[int, str]:
    strings = json.loads((REPO / "payload/damocles/strings.json").read_text())
    return {int(record["address"], 16): record["id"] for record in strings["inlineMessages"]}


def _ported(step: dict[str, Any]) -> bool:
    """The port's ``clear-busy`` is ``flags.clear $0040`` and nothing wider."""
    if step["op"] == "flags.clear":
        return step.get("operands") == [f"${BUSY:04X}"]
    return step["op"] in PORTED_OPS


def script_steps(data: bytes, entry: int, ids: dict[int, str]) -> list[dict[str, Any]]:
    """Every op reachable from ``entry`` without entering the shared epilogues, in address order."""
    seen: dict[int, dict[str, Any]] = {}
    work = [entry]
    while work:
        address = work.pop()
        while address not in seen and DEFAULT_START <= address < DEFAULT_END:
            op = _decode_one(data, address, DEFAULT_START, DEFAULT_END)
            step: dict[str, Any] = {"at": f"${address:06X}", "op": op.op.name}
            if op.word & 0x80:
                step["not"] = True
            if op.text is not None:
                _check(address in ids, f"message at ${address:06X} has no strings.json id")
                step["id"] = ids[address]
            elif op.operands:
                step["operands"] = [f"${_u16(op.operands, i):04X}" for i in range(0, len(op.operands) - 1, 2)]
            if op.target is not None:
                step["target"] = f"${op.target:06X}"
                if op.target not in SHARED:
                    work.append(op.target)
            seen[address] = step
            if op.op.kind in ("jump", "return", "unused"):
                break
            address += op.size
    return [seen[a] for a in sorted(seen)]


def decode() -> int:
    _check(FIRST_WORLD.is_file(), f"pinned first-world RAM not found: {FIRST_WORLD}")
    data = FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(data).hexdigest() == FIRST_WORLD_SHA256, "the pinned first-world RAM hash differs")
    report: dict[str, Any] = {"firstWorldSha256": FIRST_WORLD_SHA256}

    for address, expected in INSTRUCTIONS.items():
        actual = _disassemble(data, address)
        _check(actual == expected, f"${address:06X} is {actual!r}, expected {expected!r}")
    for address, index in NATIVE_CALLERS.items():
        _check("$54770" in _disassemble(data, address), f"${address:06X} does not call the launcher")
        before = [_disassemble(data, address - n) for n in (2, 4)]
        _check(any(f"#${index:x}, d1" in text for text in before), f"${address:06X} does not load ${index:02X}")
    _check(_disassemble(data, SHARED_CALL) == "bsr.w $54770", "$04D8F0 does not call the launcher")
    for address, index in SHARED_CALL_LOADS.items():
        _check(_disassemble(data, address) == f"moveq #${index:x}, d1", f"${address:06X} does not load ${index:02X}")
        branch = _disassemble(data, address + 2)
        _check(branch.endswith("$4d8f0"), f"${address + 2:06X} is {branch!r}")
    report["instructions"] = len(INSTRUCTIONS)
    report["nativeCallers"] = {f"${a:06X}": f"${i:02X}" for a, i in NATIVE_CALLERS.items()}
    report["sharedCall"] = {f"${a:06X}": f"${i:02X}" for a, i in SHARED_CALL_LOADS.items()}
    report["hashes"] = {
        name: hashlib.sha256(data[start:end]).hexdigest() for name, (start, end) in HASHED_RANGES.items()
    }

    groups = sorted({r["structureGroup"] for body in range(SURFACE_BODIES) for r in decode_island_records(data, body)})
    tables = {}
    for group in groups:
        table = decode_location_table(data, group)
        entries = _entries_hex(table)
        if group == UNTERMINATED_GROUP:
            _check(len(entries) == UNTERMINATED_ENTRIES, f"group $0E reads {len(entries)} entries")
            _check(all(e["cell"] != UNTERMINATED_STRUCTURE_CELL for e in table["entries"]), "group $0E names cell $88")
            tables[f"${group:02X}"] = {"sourceAddress": f"${table['sourceAddress']:06X}", "entries": len(entries)}
            continue
        _check(entries == TABLES.get(group, []), f"group ${group:02X} reads {entries}")
        tables[f"${group:02X}"] = {"sourceAddress": f"${table['sourceAddress']:06X}", "entries": entries}
    _check(_u32(data, TABLE_POINTER) == decode_location_table(data, _u16(data, GROUP))["sourceAddress"], "live table")
    report["groups"] = tables

    arming = {f"${i:02X}": f"${data[ARMING + i]:02X}" for i in TRIGGERS}
    _check(all(data[ARMING + i] == FIRST_WORLD_ARMING[i] for i in TRIGGERS), f"first-world arming {arming}")
    report["arming"] = arming

    ids = _message_ids()
    script_table = read_script_table(data)
    scripts = {}
    for index in TRIGGERS:
        _check(script_table[index] == BANK_BASE + ENTRIES[index], f"entry ${index:02X} is ${script_table[index]:06X}")
        steps = script_steps(data, script_table[index], ids)
        scripts[f"${index:02X}"] = {
            "entry": f"${script_table[index]:06X}",
            "messages": [s["id"] for s in steps if "id" in s],
            "unported": sorted({s["op"] for s in steps if not _ported(s)}),
            "steps": steps,
        }
    report["scripts"] = scripts

    sweep: dict[str, Any] = {}
    saves = sorted(SNAPSHOTS.glob("*.sav")) + sorted((SNAPSHOTS / "rehosted").glob("*.sav"))
    for path in saves:
        ram = hatari_memstate_ram(path.read_bytes())
        group = _u16(ram, GROUP)
        table = decode_location_table(ram, group)
        _check(_u32(ram, TABLE_POINTER) == table["sourceAddress"], f"{path.name}: [$7A68] is not group ${group:02X}'s")
        _check(table["entries"] == decode_location_table(data, group)["entries"], f"{path.name}: table differs")
        sweep[str(path.relative_to(SNAPSHOTS))] = {
            "group": f"${group:02X}",
            "entries": len(table["entries"]),
            "trigger3": f"${ram[ARMING + 3]:02X}",
            "trigger4": f"${ram[ARMING + 4]:02X}",
        }
    report["memstates"] = sweep
    print(json.dumps(report, indent=1))
    return 0


# Chain windows beyond the lift-ride probe's: the script stack and the running script.
lift.WINDOWS["script"] = (0x6260, 0x6270)

UP, DOWN = lift.UP, lift.DOWN
KEY_2 = lift.SCANCODES["2"]
REARM_3 = [f"w ${ARMING + 3:x} 80"]
YAW_EAST, YAW_NORTH = 0x02FE, 0x03FE  # the capture's yaw walks +X; $03FE walks -Z


def _pose(ram: bytes, x: int, z: int, yaw: int) -> list[str]:
    return lift._teleport_lines(ram, x, z) + [f"w $7ac2 {yaw >> 8:02x} {yaw & 0xFF:02x}"]


def _stick(value: int) -> str:
    return f"w ${lift.STICK:x} {value:02x}"


def _key(code: int) -> str:
    return f"w ${lift.MAILBOX:x} {code:02x}"


# name: (stops, first lines, {stop: lines}); the pose lines are built from the capture.
def live_cases(ram: bytes) -> dict[str, tuple[int, list[str], dict[int, list[str]]]]:
    before_door_6 = _pose(ram, 250, -335, YAW_EAST)
    return {
        "walk-out": (60, REARM_3, {10: [_stick(UP)]}),
        "front-door": (110, REARM_3 + _pose(ram, 0, 350, YAW_NORTH), {10: [_stick(UP)]}),
        "offer": (240, [], {10: [_key(KEY_2)], 160: before_door_6 + [_stick(UP)]}),
        "queue": (
            1340,
            REARM_3,
            {10: [_stick(UP)], 36: [_stick(DOWN)], 50: [_stick(0)], 52: [_key(KEY_2)], 220: before_door_6 + [_stick(UP)]},
        ),
    }


def _stop(run: Path, index: int) -> dict[str, Any] | None:
    s = lift._read_stop(run, index)
    if s is None:
        return None
    low = lift._stop_path(run, index, "low").read_bytes()

    def word(address: int) -> int:
        return int.from_bytes(low[address - 0x7800 : address - 0x7800 + 2], "big")

    s.update(
        arm3=low[ARMING + 3 - 0x7800],
        arm4=low[ARMING + 4 - 0x7800],
        busy=bool(word(FLAGS) & BUSY),
        pending=word(PENDING),
        pc=BANK_BASE + word(SCRIPT_PC),
        regionIndex=word(REGION),
        floorIndex=word(FLOOR),
        cell=word(CELL),
    )
    return s


def _first(trace: list[dict[str, Any]], test) -> dict[str, Any]:
    hit = next((s for s in trace if test(s)), None)
    _check(hit is not None, "not reached")
    return hit


def _fired(trace: list[dict[str, Any]], key: str, before: int, after: int) -> dict[str, Any]:
    stop = _first(trace, lambda s: s[key] != before)
    _check(stop[key] == after, f"{key} went ${before:02X} -> ${stop[key]:02X} at stop {stop['stop']}")
    return stop


def _summary(s: dict[str, Any]) -> dict[str, Any]:
    return {k: s[k] for k in ("stop", "vbl", "regionIndex", "regionFlags", "floorIndex", "local", "pc", "pending", "busy")}


def analyse(case: str, trace: list[dict[str, Any]]) -> dict[str, Any]:
    _check(all(s["cell"] == 0x89 for s in trace), "the eye left cell $89")
    result: dict[str, Any] = {}
    if case in ("walk-out", "front-door"):
        fired = _fired(trace, "arm3", 0x80, 0x00)
        before = trace[fired["stop"] - 1]
        _check(fired["busy"] and fired["pc"] == BANK_BASE + ENTRIES[3], f"stop {fired['stop']}: trigger 3 did not launch")
        _check(fired["floorIndex"] == 0 and not fired["regionFlags"] & OUTDOOR, "fired outside an indoor region")
        # A stop inside the substep loop can land between $05A32C's selection and the walk.
        selected = before if before["substeps"] else fired
        _check(trace[selected["stop"] - 1]["regionIndex"] != fired["regionIndex"], "fired without a region change")
        if case == "front-door":
            outdoor = [s for s in trace[: fired["stop"]] if s["regionFlags"] & OUTDOOR]
            _check(len({s["regionIndex"] for s in outdoor}) >= 2, "the walk crossed no outdoor region change")
            result["outdoorRegions"] = sorted({s["regionIndex"] for s in outdoor})
        result["fired"] = _summary(fired)
        result["before"] = _summary(before)
        _check(all(s["arm4"] == 0xA0 for s in trace), "trigger 4 changed")
    if case in ("offer", "queue"):
        arrived = _first(trace, lambda s: s["floorIndex"] == 2 and s["destination"] == -1)
        _check(trace[arrived["stop"]]["arm4"] == 0xA0, "trigger 4 spent before the walk")
        entered = _first(trace, lambda s: s["regionIndex"] == 7 and s["floorIndex"] == 2)
        _check(all(s["arm4"] == 0xA0 for s in trace[: entered["stop"]]), "trigger 4 changed before region 7")
        result["arrived"] = _summary(arrived)
        result["entered"] = _summary(entered)
        if case == "offer":
            _check(entered["arm4"] == 0x20 and entered["pc"] == BANK_BASE + ENTRIES[4], "trigger 4 did not launch")
        else:
            fired3 = _fired(trace, "arm3", 0x80, 0x00)
            _check(fired3["stop"] < entered["stop"], "trigger 3 had not fired")
            _check(entered["busy"] and entered["pending"] == 4 and entered["arm4"] == 0xA0, "trigger 4 did not queue")
            cleared = _first(trace[entered["stop"] :], lambda s: not s["busy"])
            launched = _fired(trace, "arm4", 0xA0, 0x20)
            _check(launched["stop"] > cleared["stop"] and launched["pending"] == 0, "the queued trigger did not launch")
            _check(
                all(s["pending"] == 4 and s["arm4"] == 0xA0 for s in trace[entered["stop"] : cleared["stop"]]),
                "the queue did not hold",
            )
            result["fired3"] = _summary(fired3)
            result["cleared"] = _summary(cleared)
            result["launched"] = _summary(launched)
            result["trigger3Vbls"] = cleared["vbl"] - fired3["vbl"]
    return result


def live(roms: Path | None, cases: list[str], settle: float) -> int:
    snapshot = SNAPSHOTS / "rehosted" / "eris-lift.sav"
    _check(snapshot.is_file(), f"snapshot not found: {snapshot}")
    ram = hatari_memstate_ram(snapshot.read_bytes())
    _check(ram[ARMING + 3] == 0x00 and ram[ARMING + 4] == 0xA0, "eris-lift arming is not 3 spent, 4 armed")
    table = live_cases(ram)
    failures = []
    for name in cases:
        stops, first, at = table[name]
        run = WORK_ROOT / _run_id(f"location-trigger-{name}")
        run.mkdir(parents=True)
        error, result, meta = None, {}, {}
        try:
            _, meta = lift.run_chain(roms, run, snapshot, stops, first, at, settle)
            trace = [_stop(run, i) for i in range(stops)]
            (run / "trace.json").write_text(json.dumps(trace) + "\n", encoding="utf-8")
            result = analyse(name, trace)
        except LabError as failure:
            error = str(failure)
            failures.append(f"{name}: {error}")
        document = {
            "schemaVersion": 1,
            "case": name,
            "inputs": {"first": first, "at": {str(k): v for k, v in at.items()}},
            "result": result,
            "error": error,
            "meta": meta,
            "snapshot": str(snapshot.relative_to(SNAPSHOTS)),
            "snapshotSha256": file_hash(snapshot),
            "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }
        (run / "result.json").write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({"run": run.name, "case": name, "result": result, "error": error}, indent=1))
    if failures:
        raise LabError("; ".join(failures))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("decode")
    live_parser = sub.add_parser("live")
    live_parser.add_argument("--roms", type=Path)
    live_parser.add_argument("--case", choices=("walk-out", "front-door", "offer", "queue"), action="append")
    live_parser.add_argument("--settle-seconds", type=float, default=4.0)
    args = parser.parse_args()
    if args.mode == "decode":
        return decode()
    return live(args.roms, args.case or ["walk-out", "front-door", "offer", "queue"], args.settle_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
