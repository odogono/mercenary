#!/usr/bin/env python3
"""Damocles Lift ride probe (#472).

#471 recovered the order of a ride: a key is admitted, the door is pinned and
closes, the Floor Label steps one Floor per 25 countdown ticks, and one expiry
after the label reaches the destination the arrival at ``$055B12`` binds the
Floor's structure. What #471 could not give is emulator time, because its runs
used host sleeps. This probe traces rides VBL by VBL.

Two halves, both gated: a trace the decode does not reproduce raises.

``decode`` reads the pinned first-world RAM and the in-lift captures without
Hatari. It hashes the windows the note quotes, checks the instruction words
the decode rests on (the substep clamp, the step countdown, the arrival's
pitch reset and sound writes), and derives each capture's per-Floor palette
choice from its Floor Table record.

``live`` boots one rehosted memstate, arms a chain over the command FIFO that
stops on every VBL, saving small RAM windows and a screenshot at each stop,
and presses the case's keys with ``hatari-event`` while the chain runs, each
once the previous ride has arrived and settled. Host timing only decides which
VBL a key lands on; every effect is bracketed by two consecutive stops, and the
program's own VBL clock ``$051D96`` is checked to advance by one at each.

The traps that shape this design (Hatari 2.6.1, found while writing it): a
chain armed before the restore finishes, or from the ``<memstate>.debug`` file
Hatari replays after a restore, stops after its first stop; and a state saved
by this Hatari, from a breakpoint or over the FIFO, does not reliably chain
again. So everything runs in one process from a rehosted memstate.

The ``vesta`` case makes #471's one intervention, at the chain's first stop:
it writes the player's X/Z (pose low words and structure-local copies) to
stand inside the Vesta transporter's lift region. Nothing else is written.

Run from the repository root:

  python3 research/damocles-st/scripts/lift-ride-probe.py decode
  python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case eris
  python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case vesta

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
from damocleslab.core import LabError, file_hash, format_hatari_key, validate_image  # noqa: E402
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

SNAPSHOTS = LAB_ROOT / "snapshots"
FIRST_WORLD = WORK_ROOT / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"

DESTINATION = 0x788A  # word: requested Floor, $FFFF when no ride is pending
STEP_PERIOD = 0x788C
STEP_COUNTDOWN = 0x788E
FLOOR = 0x7AC4
POSE_X = 0x7AB4  # low word of the pose X long
EYE_Y = 0x7AB6  # long
POSE_Z = 0x7ABC
PITCH = 0x7AC0
YAW = 0x7AC2
POS_X = 0x79A8  # structure-local
POS_Z = 0x79B0
STOREY = 0x7B00
REGION_FLAGS = 0x7B34
LAST_DOOR = 0x7AE6
FLOOR_TABLE = 0x7C1E
ROOT = 0x7B0E
PALETTE = 0x7A0E  # long: palette binding
SOUND_GUARD = 0x7A0C
SOUND_TICKS = 0x7A78
MIXER_SHADOW = 0x7C04
FRAMES_DRAWN = 0x7AE8  # $0599A0: +1 per frame loop
VBL_CLOCK = 0x51D98  # low word of the long $051E34 increments every VBL
FRAME_VBLS = 0x51D22  # $0599B2: VBLs the last frame took
SUBSTEPS = 0x5948A  # $05955C: substeps left in this frame, clamp(FRAME_VBLS, 4, 8)
SOUND_VECTOR = 0x4BF54
SOUND_IDLE = 0x51E86
SOUND_ARRIVAL = 0x4C556
LABEL = 0xCD04
LATCH = 0x5A41
OVERRIDE = 0x5A42
REGIONS = 0xB23C
LIFT_BIT = 0x2000
EYE = 63
LEVEL_PITCH = 0x1FF

SCANCODES = {
    "esc": 0x01,
    **{str(digit): 0x01 + digit for digit in range(1, 10)},
    "0": 0x0B,
    "g": 0x22,
    "b": 0x30,
}

# Static windows the note quotes, hashed from the pinned first-world RAM.
STATIC_WINDOWS = {
    "sound-request": (0x054848, 0x054884),
    "arrival-and-rebind": (0x055B12, 0x055C7A),
    "substep-loop": (0x059542, 0x059586),
    "frame-wait": (0x059992, 0x0599B8),
    "vbl-counter": (0x051E34, 0x051E3A),
    "sound-effect": (0x04C556, 0x04C5A8),
    "door-sound-edges": (0x05A9DC, 0x05AA3C),
    "door-start-sound": (0x04C37A, 0x04C3C6),
    "door-stop-sound": (0x04C2B8, 0x04C304),
}

# Instruction words the decode rests on, checked byte for byte.
CODE_FACTS = {
    0x051E34: ("52b900051d96", "addq.l #1,$51d96: the VBL clock"),
    0x0599B2: ("33c000051d22", "move.w d0,$51d22: VBLs the frame took"),
    0x059548: ("0c4000086f04303c0008", "clamp the substeps at 8"),
    0x059552: ("0c4000046c04303c0004", "clamp the substeps at 4"),
    0x059562: ("4a78788a6b046100c504", "the step runs once per substep while a ride is pending"),
    0x05957E: ("53790005948a66dc", "the substep loop"),
    0x055A7C: ("5378788e665c", "the countdown ticks once per step call"),
    0x055A76: ("4a285a41", "the countdown waits for the door latch"),
    0x055B2E: ("4a28fffe6622", "the per-Floor palette only when the record's palette byte is zero"),
    0x055BAE: ("31fc01ff7ac0", "pitch to level"),
    0x055C1E: ("11fc00098800", "select YM register 9"),
    0x055C24: ("11fc00008802", "channel B volume 0"),
    0x055C38: ("11fc000a8800", "select YM register 10"),
    0x055C3E: ("11fc00008802", "channel C volume 0"),
    0x055B88: ("6000ecbe", "bra $054848: the arrival ends in the sound request"),
    0x054856: ("23fc0004c5560004bf54", "the request arms $04C556"),
    0x05AA04: ("42390005a9d8b0390005a9d9", "the door-moving flag is compared with the last pass"),
    0x05AA2A: ("31fc00037a7823fc0004c37a0004bf58", "doors start moving: arm $04C37A"),
    0x05A9DC: ("31fc00037a7823fc0004c2b80004bf58", "doors stop: arm $04C2B8"),
    0x05AAA4: ("13fc00010005a9d8", "a moving door raises the flag"),
    0x059570: ("610014ca", "the door animation runs after the step in each substep"),
}


def _u16(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 2], "big")


def _s16(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 2], "big", signed=True)


def _u32(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 4], "big")


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def expected_label(floor: int) -> str:
    if floor == 0:
        return "G"
    if floor == 10:
        return "B"
    return chr(0x30 + floor)


def step(current: int, destination: int) -> int:
    """$055A88-$055AB4, as #471 decoded it."""
    if destination - current < 0 or destination == 10:
        if current == 10:
            return 0
        return 10 if current == 0 else current - 1
    return current + 1


def route(current: int, destination: int) -> list[int]:
    floors = []
    while current != destination:
        current = step(current, destination)
        floors.append(current)
    return floors


def palette_choice(ram: bytes, floor: int) -> dict[str, Any]:
    """$055B2E-$055B52: which palette the arrival binds, if it binds one."""
    table = _u32(ram, FLOOR_TABLE)
    record_palette = ram[table - 2]
    if record_palette:
        return {"rebinds": False, "recordPalette": record_palette}
    index = ram[table + 12 + floor]
    base = _u32(ram, 0x4BD16)
    offset = _u16(ram, base + 2 * index)
    return {"rebinds": True, "index": index, "binding": (base + offset) & 0xFFFFFFFF}


def decode() -> int:
    _check(FIRST_WORLD.is_file(), f"pinned first-world RAM not found: {FIRST_WORLD}")
    ram = FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(ram).hexdigest() == FIRST_WORLD_SHA256, "first-world RAM hash")
    for address, (hexbytes, meaning) in CODE_FACTS.items():
        found = ram[address : address + len(hexbytes) // 2].hex()
        _check(found == hexbytes, f"${address:06X} ({meaning}): {found} != {hexbytes}")
    windows = {
        name: {
            "range": f"${start:06X}-${end - 1:06X}",
            "sha256": hashlib.sha256(ram[start:end]).hexdigest(),
        }
        for name, (start, end) in STATIC_WINDOWS.items()
    }
    _check(_u16(ram, STEP_PERIOD) == 25, "step period")
    captures = []
    for name, floors in (
        ("damocles.eris.lift", (0, 1, 2, 10)),
        ("damocles.vesta.transporter", tuple(range(11))),
    ):
        path = SNAPSHOTS / f"{name}.sav"
        _check(path.is_file(), f"capture not found: {path}")
        capture = hatari_memstate_ram(path.read_bytes())
        table = _u32(capture, FLOOR_TABLE)
        bound = [f for f in floors if capture[table + f]]
        captures.append(
            {
                "capture": name,
                "sha256": file_hash(path),
                "floorTable": list(capture[table : table + 12]),
                "palettes": {f: palette_choice(capture, f) for f in bound},
                "palette": f"${_u32(capture, PALETTE):06X}",
            }
        )
    print(json.dumps({"windows": windows, "codeFacts": len(CODE_FACTS), "captures": captures}, indent=2))
    return 0


# --- live ------------------------------------------------------------------

WINDOWS = {
    "low": (0x7800, 0x7D00),
    "doors": (0x5A40, 0x5E40),
    "label": (0xCD00, 0xCD10),
    "clock": (0x51D20, 0x51DA0),
    "substeps": (0x59488, 0x5948C),
    "sound": (0x4BF50, 0x4BF5C),
    "mailbox": (0x55588, 0x55590),
    "doorsound": (0x5A9D8, 0x5A9DC),
}
DOOR_MOVING = 0x5A9D9  # $05AA12: last pass's "a door moved" flag, whose edges pick the door sound
SOUND_VECTOR_B = 0x4BF58
DOOR_START_SOUND = 0x4C37A  # $05AA2A: armed when doors start moving
DOOR_STOP_SOUND = 0x4C2B8  # $05A9DC: armed when they stop
MAILBOX = 0x5558C  # the ACIA handler's make-code mailbox, read by $0555B8


def _state(ram: bytes) -> dict[str, Any]:
    door = _u16(ram, LAST_DOOR)
    return {
        "vbl": _u16(ram, VBL_CLOCK),
        "frames": _u16(ram, FRAMES_DRAWN),
        "frameVbls": _u16(ram, FRAME_VBLS),
        "substeps": _u16(ram, SUBSTEPS),
        "mailbox": ram[MAILBOX],
        "destination": _s16(ram, DESTINATION),
        "countdown": _u16(ram, STEP_COUNTDOWN),
        "floor": _u16(ram, FLOOR),
        "label": chr(ram[LABEL]),
        "x": _s16(ram, POSE_X),
        "z": _s16(ram, POSE_Z),
        "y": _u32(ram, EYE_Y),
        "local": [_s16(ram, POS_X), _s16(ram, POS_Z)],
        "yaw": _u16(ram, YAW),
        "pitch": _u16(ram, PITCH),
        "storey": _u16(ram, STOREY),
        "regionFlags": _u16(ram, REGION_FLAGS),
        "door": door,
        "latch": ram[LATCH + door],
        "override": ram[OVERRIDE + door],
        "root": _u32(ram, ROOT),
        "palette": _u32(ram, PALETTE),
        "soundGuard": _u16(ram, SOUND_GUARD),
        "soundTicks": _u16(ram, SOUND_TICKS),
        "soundVector": _u32(ram, SOUND_VECTOR),
        "soundVectorB": _u32(ram, SOUND_VECTOR_B),
        "doorMoving": ram[DOOR_MOVING],
        "mixer": ram[MIXER_SHADOW],
    }


def _stop_path(run: Path, index: int, key: str) -> Path:
    return run / f"t{index:04d}-{key}.bin"


def _read_stop(run: Path, index: int) -> dict[str, Any] | None:
    ram = bytearray(0x60000)
    for key, (start, end) in WINDOWS.items():
        path = _stop_path(run, index, key)
        if not path.is_file() or path.stat().st_size != end - start:
            return None
        ram[start:end] = path.read_bytes()
    s = _state(bytes(ram))
    s["stop"] = index
    return s


def _write_chain(run: Path, vbls: int, first_lines: list[str]) -> list[Path]:
    """One stop per VBL. Each script saves its windows, arms the next and continues."""
    scripts = [run / f"trace-{i:04d}.txt" for i in range(vbls)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex"]
        if index == 0:
            lines += first_lines
        for key, (start, end) in WINDOWS.items():
            lines.append(f"savebin {_stop_path(run, index, key).resolve()} ${start:x} ${end - start:x}")
        lines.append(f"screenshot {(run / f't{index:04d}.png').resolve()}")
        if index + 1 < vbls:
            lines.append(f'b VBL = "VBL+1" :once :quiet :file {scripts[index + 1].resolve()}')
            lines.append("c")
        else:
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return scripts


def vesta_teleport(ram: bytes) -> tuple[list[str], dict[str, Any]]:
    """#471's one intervention, derived from the capture itself.

    The Vesta transporter capture stands on Floor 10 in a corridor. These writes
    put the player in the middle of the lift region: the pose X/Z low words and
    the structure-local copies the region walk reads. They are made at the
    trace's first stop, so the trace sees the region walk publish the lift bit.
    """
    lift = None
    for index in range(_u16(ram, 0x7B32) + 1):
        base = REGIONS + 14 * index
        bounds = [_s16(ram, base + 2 + 2 * k) for k in range(4)]
        if _u16(ram, base) & LIFT_BIT and bounds[0] < 0:
            lift = (index, bounds)
            break
    _check(lift is not None, "not reached: no lift region in the Vesta Floor 10 structure")
    index, (x0, x1, z0, z1) = lift
    x, z = (x0 + x1) // 2, (z0 + z1) // 2
    origin_x, origin_z = _u16(ram, 0x7AF2), _u16(ram, 0x7AF4)
    writes = {POSE_X: (x + origin_x) & 0xFFFF, POSE_Z: (z + origin_z) & 0xFFFF, POS_X: x & 0xFFFF, POS_Z: z & 0xFFFF}
    lines = [f"w ${address:x} {value >> 8:02x} {value & 0xFF:02x}" for address, value in writes.items()]
    return lines, {"region": index, "bounds": [x0, x1, z0, z1], "local": [x, z]}


# name: (rehosted memstate, [(key, Floor the ride must arrive at)], intervention)
CASES = {
    "eris": ("rehosted/eris-lift.sav", [("1", 1), ("2", 2), ("b", 10), ("g", 0)], None),
    "vesta": ("rehosted/vesta-transporter.sav", [("2", 2), ("g", 0)], vesta_teleport),
}
SOURCE_CAPTURES = {"eris": "damocles.eris.lift.sav", "vesta": "damocles.vesta.transporter.sav"}
MAX_STOPS = 2400
LEAD_VBLS = 10  # stops before the first key
TAIL_VBLS = 100  # stops after an arrival before the next key, to watch the door and the sound


def trace_case(roms: Path | None, run: Path, case: str, settle: float) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    snapshot_name, rides, intervention = CASES[case]
    snapshot = SNAPSHOTS / snapshot_name
    _check(snapshot.is_file(), f"snapshot not found: {snapshot}")
    first_lines: list[str] = []
    meta: dict[str, Any] = {}
    ram = hatari_memstate_ram(snapshot.read_bytes())
    if intervention:
        first_lines, meta = intervention(ram)
    table = _u32(ram, FLOOR_TABLE)
    meta["floorTable"] = list(ram[table : table + 12])
    meta["palettes"] = {
        floor: palette_choice(ram, floor).get("binding") for floor in range(11) if ram[table + floor]
    }
    _write_chain(run, MAX_STOPS, first_lines)

    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    meta["programSha256"] = validate_image(program, authority["programImage"], label="Working Authority STX")["hashes"]["sha256"]
    meta["tosSha256"] = validate_image(tos, authority["tosImage"], label="TOS image")["hashes"]["sha256"]
    hatari, toolchain = discover_toolchain(config)
    meta["toolchain"] = toolchain.as_dict()
    fifo_path = run / "cmd.fifo"
    parse = run / "parse.txt"
    parse.write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari,
        tos=tos,
        disk_a=program,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse,
        fast_forward=False,
        statusbar=False,
        cmd_fifo=fifo_path,
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    trace: list[dict[str, Any]] = []
    keys: list[dict[str, Any]] = []
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        # stdin is /dev/null: Hatari re-enters its debugger prompt after each
        # stop, and a prompt reading an open, empty stdin blocks the chain.
        process = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
        )
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            _check(fifo_path.exists(), f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                # Arming inside the restore loses the chain after one stop.
                time.sleep(settle)
                _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                _fifo_send(fifo, [f'hatari-debug b VBL = "VBL+1" :once :quiet :file {(run / "trace-0000.txt").resolve()}'])

                def advance(seconds: float) -> dict[str, Any]:
                    deadline = time.monotonic() + seconds
                    while time.monotonic() < deadline:
                        s = _read_stop(run, len(trace))
                        if s is not None and _read_stop(run, len(trace) + 1) is not None or (
                            s is not None and len(trace) + 1 == MAX_STOPS
                        ):
                            trace.append(s)
                            return s
                        _check(process.poll() is None, f"Hatari exited after {len(trace)} stops")
                        time.sleep(0.02)
                    raise LabError(f"not reached: the trace stalled after {len(trace)} stops")

                while len(trace) < LEAD_VBLS:
                    advance(60)
                for key, floor in rides:
                    s = trace[-1]
                    _check(s["destination"] == -1, "a ride is already pending")
                    _check(s["regionFlags"] & LIFT_BIT, f"not reached: region {s['regionFlags']:04x} is not a lift")
                    code = format_hatari_key(SCANCODES[key])
                    # Keys go in while the chain runs, as deadline-start-probe.py
                    # sends Space. Host timing does not matter: the cadence is
                    # exact and the stops bracket every effect.
                    _fifo_send(fifo, [f"hatari-event keydown {code}"])
                    sent = len(trace)
                    released = None
                    arrived = None
                    while arrived is None or len(trace) < arrived + TAIL_VBLS:
                        _check(len(trace) < MAX_STOPS, "not reached: out of stops")
                        s = advance(60)
                        if released is None and len(trace) >= sent + 6:
                            _fifo_send(fifo, [f"hatari-event keyup {code}"])
                            released = len(trace)
                        if arrived is None and s["destination"] == -1 and s["floor"] == floor and any(
                            t["destination"] == floor for t in trace[sent:]
                        ):
                            arrived = len(trace) - 1
                        if arrived is None and len(trace) > sent + 1200:
                            raise LabError(f"not reached: key {key} did not bring the lift to Floor {floor}")
                    keys.append({"key": key, "floor": floor, "sentAfterStop": sent - 1, "releasedAfterStop": released - 1})
                _fifo_send(fifo, ["hatari-event keyup 00"])
        except BrokenPipeError:
            pass
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    return trace, keys, meta


def analyse_ride(
    trace: list[dict[str, Any]], start: int, end: int, destination: int, table: list[int], palettes: dict[int, int | None]
) -> dict[str, Any]:
    """One ride: from the stop that shows the admission to the stop before the next key."""
    segment = trace[start:end]
    admit_index = next((i for i, s in enumerate(segment) if s["destination"] != -1), None)
    _check(admit_index is not None and admit_index > 0, "not reached: no admission bracketed by two stops")
    before = segment[admit_index - 1]
    admit = segment[admit_index]
    _check(admit["destination"] == destination, f"admitted {admit['destination']}, not {destination}")
    _check(admit["override"] == 0x80, "the admission did not pin the door")
    ride = segment[admit_index:]
    origin = before["floor"]
    expected = route(origin, destination)
    base = admit["vbl"]

    def rel(s: dict[str, Any]) -> int:
        """Signed VBLs from the first stop that shows the admission."""
        d = (s["vbl"] - base) & 0xFFFF
        return d - 0x10000 if d >= 0x8000 else d

    mailbox = [s for s in segment[:admit_index + 1] if s["mailbox"] == SCANCODES_BY_FLOOR.get(destination, -1)]

    door_closed = next((s for s in ride if s["latch"] == 0), None)
    _check(door_closed is not None, "not reached: the door never closed")
    closing = ride[: ride.index(door_closed)]
    _check(all(s["countdown"] == admit["countdown"] for s in closing), "the countdown moved while the door was moving")
    _check(all(s["override"] == 0x80 for s in closing), "the door was not held shut while closing")

    # The arrival can straddle a VBL: $788A and Y are written before the
    # rebind at $055BA6 (which parks $7B34 at $C000) and $59D70 finish. It is
    # done once the region walk has published the lift region again.
    started = next((s for s in ride if s["destination"] == -1), None)
    _check(started is not None, "not reached: no arrival")
    arrival = next((s for s in ride[ride.index(started) :] if s["regionFlags"] & LIFT_BIT), None)
    _check(arrival is not None, "not reached: the arrival never republished a lift region")
    riding = ride[: ride.index(started)]
    after = ride[ride.index(arrival) :]

    labels: list[tuple[int, str]] = []
    for s in ride:
        if not labels or labels[-1][1] != s["label"]:
            labels.append((rel(s), s["label"]))
    shown = [label for _, label in labels[1:]]
    _check(shown == [expected_label(f) for f in expected], f"labels {shown} != route {expected}")
    _check(arrival["floor"] == destination, f"arrived at {arrival['floor']}")
    _check(arrival["y"] == destination * arrival["storey"] + EYE, f"Y {arrival['y']} != {destination} x {arrival['storey']} + {EYE}")
    _check((arrival["x"], arrival["z"]) == (before["x"], before["z"]), "X/Z moved on arrival")
    _check(arrival["yaw"] == before["yaw"], "yaw changed")
    _check(arrival["pitch"] == LEVEL_PITCH, f"pitch {arrival['pitch']:#x} after arrival")
    expected_palette = palettes[destination]
    if expected_palette is None:
        _check(all(s["palette"] == before["palette"] for s in ride), "the palette changed although the record has its own")
    else:
        _check(arrival["palette"] == expected_palette, f"palette ${arrival['palette']:06X} != ${expected_palette:06X}")
        _check(all(s["palette"] == before["palette"] for s in riding), "the palette changed mid-ride")
    if table[origin] != table[destination]:
        _check(arrival["root"] != before["root"], "the structure did not rebind")
    _check(all(s["y"] == before["y"] and s["root"] == before["root"] for s in riding), "Y or the structure moved mid-ride")
    _check(all((s["x"], s["z"]) == (before["x"], before["z"]) for s in riding), "the player moved mid-ride")

    step_vbls = [b - a for (a, _), (b, _) in zip(labels, labels[1:])]
    sound: dict[str, Any] = {"guard": arrival["soundGuard"]}
    if arrival["soundGuard"] == 0:
        armed = [s for s in after if s["soundVector"] == SOUND_ARRIVAL]
        sound.update(
            {
                "armedStops": [rel(s) for s in armed],
                "ticks": [(rel(s), s["soundTicks"]) for p, s in zip(after, after[1:]) if s["soundTicks"] != p["soundTicks"]][:12],
            }
        )
    door_sounds = [
        (rel(s), {DOOR_START_SOUND: "start", DOOR_STOP_SOUND: "stop"}.get(s["soundVectorB"], f"${s['soundVectorB']:06X}"))
        for p, s in zip(segment, segment[1:])
        if s["soundVectorB"] != p["soundVectorB"] and s["soundVectorB"] != SOUND_IDLE
    ]
    door_track = [(rel(s), f"${s['door']:03X}", s["latch"], s["override"]) for s in segment]
    door_changes = [door_track[0]] + [d for p, d in zip(door_track, door_track[1:]) if d[1:] != p[1:]]
    return {
        "origin": origin,
        "destination": destination,
        "route": expected,
        "admittedBetweenVbls": [rel(before), rel(admit)],
        "makeCodeSeenVbl": rel(mailbox[0]) if mailbox else None,
        "doorClosedVbl": rel(door_closed),
        "labels": labels,
        "stepVbls": step_vbls,
        "doorClosedToFirstStepVbls": labels[1][0] - rel(door_closed),
        "arrivalStartedVbl": rel(started),
        "arrivalVbl": rel(arrival),
        "arrivalAfterLastLabelVbls": rel(arrival) - labels[-1][0],
        "framesDrawn": (arrival["frames"] - before["frames"]) & 0xFFFF,
        "frameVbls": sorted({s["frameVbls"] for s in ride}),
        "slots": [table[origin], table[destination]],
        "arrival": {
            "floor": arrival["floor"],
            "y": arrival["y"],
            "storey": arrival["storey"],
            "x": arrival["x"],
            "z": arrival["z"],
            "yaw": f"${arrival['yaw']:04X}",
            "pitch": f"${before['pitch']:04X} -> ${arrival['pitch']:04X}",
            "root": f"${before['root']:06X} -> ${arrival['root']:06X}",
            "palette": f"${before['palette']:06X} -> ${arrival['palette']:06X}",
            "regionFlags": " -> ".join(
                [f"${before['regionFlags']:04X}"]
                + [f"${s['regionFlags']:04X}" for s in ride[ride.index(started) : ride.index(arrival) + 1]]
            ),
        },
        "paletteChanges": [(rel(s), f"${s['palette']:06X}") for p, s in zip(segment, segment[1:]) if s["palette"] != p["palette"]],
        "door": door_changes,
        "doorMovingChanges": [(rel(s), s["doorMoving"]) for p, s in zip(segment, segment[1:]) if s["doorMoving"] != p["doorMoving"]],
        "doorSounds": door_sounds,
        "sound": sound,
        "soundVectorsMidRide": sorted({f"${s['soundVector']:06X}" for s in riding}),
        "arrivalStop": arrival["stop"],
    }


SCANCODES_BY_FLOOR = {1: 0x02, 2: 0x03, 10: 0x30, 0: 0x22}


def live(roms: Path | None, case: str, settle: float) -> int:
    run = WORK_ROOT / _run_id(f"lift-ride-{case}")
    run.mkdir(parents=True)
    error = None
    rides: list[dict[str, Any]] = []
    trace: list[dict[str, Any]] = []
    keys: list[dict[str, Any]] = []
    meta: dict[str, Any] = {}
    try:
        trace, keys, meta = trace_case(roms, run, case, settle)
        (run / "trace.json").write_text(json.dumps(trace) + "\n", encoding="utf-8")
        for a, b in zip(trace, trace[1:]):
            _check((b["vbl"] - a["vbl"]) & 0xFFFF == 1, f"stop {b['stop']}: VBL clock moved {(b['vbl'] - a['vbl']) & 0xFFFF}")
        if meta.get("local"):
            _check(trace[0]["local"] == meta["local"], "the teleport did not land")
        bounds = [k["sentAfterStop"] for k in keys] + [len(trace)]
        for k, start, end in zip(keys, bounds, bounds[1:]):
            rides.append(analyse_ride(trace, start, end, k["floor"], meta["floorTable"], meta["palettes"]))
    except LabError as failure:
        error = str(failure)
    snapshot = SNAPSHOTS / CASES[case][0]
    result = {
        "schemaVersion": 1,
        "case": case,
        "rides": rides,
        "keys": keys,
        "stops": len(trace),
        "error": error,
        "meta": meta,
        "snapshot": CASES[case][0],
        "snapshotSha256": file_hash(snapshot),
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    (run / "result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"run": run.name, "case": case, "rides": rides, "keys": keys, "error": error}, indent=1))
    if error:
        raise LabError(error)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("decode")
    live_parser = sub.add_parser("live")
    live_parser.add_argument("--roms", type=Path)
    live_parser.add_argument("--case", choices=tuple(CASES), required=True)
    live_parser.add_argument("--settle-seconds", type=float, default=4.0)
    args = parser.parse_args()
    if args.mode == "decode":
        return decode()
    return live(args.roms, args.case, args.settle_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
