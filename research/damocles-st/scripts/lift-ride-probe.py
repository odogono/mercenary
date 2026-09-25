#!/usr/bin/env python3
"""Damocles Lift ride probe (#472, movement #509).

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

``movement`` (#509) holds the joystick through rides. Each case boots the
memstate afresh and runs a fixed chain whose stop scripts write the inputs at
fixed stops: the lift key into the ACIA mailbox and the stick into its
joystick-1 byte, which is what the ACIA handler itself would write. So a case
needs no host timing at all. It raises unless the region holds for the whole
ride, the settled eye stays inside the car and within the clamp the decode
predicts, and the arrival moves the eye by no more than the held stick walks
in a frame. Two controls run without a ride: the same walk out of the open
doorway, and a walk at the State Office hall's shut door.

Run from the repository root:

  python3 research/damocles-st/scripts/lift-ride-probe.py decode
  python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case eris
  python3 research/damocles-st/scripts/lift-ride-probe.py live --roms roms --case vesta
  python3 research/damocles-st/scripts/lift-ride-probe.py movement --roms roms [--case NAME ...]

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
    # #509: what holds the eye during a ride.
    "mover-on-foot": (0x058CFE, 0x058D7E),
    "region-walk": (0x05A32C, 0x05A4D0),
    "clamp-edges": (0x05A4D0, 0x05A646),
    "clamp-entry": (0x05A64A, 0x05A6EC),
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
    # #509: movement during a ride.
    0x05956C: ("6100e754", "bsr $57cc2: the Mover runs every substep, ride or not"),
    0x058CFE: ("103879c2", "the on-foot Mover reads the joystick-1 byte"),
    0x0594DC: ("6100bfb8", "bsr $55496: the key is read before the frame's substeps"),
    0x05A35C: ("4a78788a6a000160", "the region walk refuses every region while a ride is pending"),
    0x05A37E: ("4a295a416a00013e", "a gated region is selectable only once its latch is negative"),
    0x05A4CA: ("7c0060000122", "no region selected: clamp to the current one with no inset"),
    0x05A67C: ("7c004a387b356b0a7c0bd4469646", "the clamp's inset is 11 unless $7B35 is negative"),
    0x05A504: ("341043f90000b22e3e387b3243e9000eb4690004", "the edge test looks for a neighbour by its bounds alone"),
    0x05A6E8: ("6100fc42", "bsr $5a32c: past the region's own edge, walk the regions"),
    0x05A63C: ("13fc00010005a646", "a clamp raises $5A646"),
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
    "clamped": (0x5A646, 0x5A648),
}
DOOR_MOVING = 0x5A9D9  # $05AA12: last pass's "a door moved" flag, whose edges pick the door sound
SOUND_VECTOR_B = 0x4BF58
DOOR_START_SOUND = 0x4C37A  # $05AA2A: armed when doors start moving
DOOR_STOP_SOUND = 0x4C2B8  # $05A9DC: armed when they stop
MAILBOX = 0x5558C  # the ACIA handler's make-code mailbox, read by $0555B8
STICK = 0x79C2  # $05556E: the ACIA handler's joystick-1 byte, read by the Mover $058CFE
REGION = 0x7B12  # the selected region's bounds, which $05A3C4 publishes
CLAMPED = 0x5A646  # $05A63C: the clamp pushed the eye back this substep


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
        "stick": ram[STICK],
        "region": _u32(ram, REGION),
        "clamped": ram[CLAMPED],
        "latches": ram[LATCH : LATCH + 0x400 : 4].hex(),
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


def _write_chain(run: Path, vbls: int, first_lines: list[str], lines_at: dict[int, list[str]] | None = None) -> list[Path]:
    """One stop per VBL. Each script saves its windows, arms the next and continues.

    ``lines_at`` adds debugger lines to the stops it names, after they are saved:
    what they write is seen from the next stop on.
    """
    scripts = [run / f"trace-{i:04d}.txt" for i in range(vbls)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex"]
        if index == 0:
            lines += first_lines
        for key, (start, end) in WINDOWS.items():
            lines.append(f"savebin {_stop_path(run, index, key).resolve()} ${start:x} ${end - start:x}")
        lines.append(f"screenshot {(run / f't{index:04d}.png').resolve()}")
        lines += (lines_at or {}).get(index, [])
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


# --- movement (#509) ---------------------------------------------------------
#
# The rides above held no input. These cases hold the joystick through a ride.
# Every input is written from the chain's own stop scripts at a fixed stop, so a
# case is deterministic from its first stop: the lift key is the make code the
# ACIA handler would leave in the mailbox $05558C (the dispatcher $055496 reads
# it and writes $FF back), and the stick is the byte it would leave in $79C2
# ($05556E), which the Mover reads every substep ($058CFE). Nothing else is
# written, except the Vesta case's teleport at the first stop.

UP, DOWN, LEFT, RIGHT = 0x01, 0x02, 0x04, 0x08


def _teleport_lines(ram: bytes, x: int, z: int) -> list[str]:
    """Put the eye at structure-local (x, z): the pose X/Z low words and the local copies."""
    origin_x, origin_z = _u16(ram, 0x7AF2), _u16(ram, 0x7AF4)
    writes = {POSE_X: (x + origin_x) & 0xFFFF, POSE_Z: (z + origin_z) & 0xFFFF, POS_X: x & 0xFFFF, POS_Z: z & 0xFFFF}
    return [f"w ${address:x} {value >> 8:02x} {value & 0xFF:02x}" for address, value in writes.items()]


# The door control: the State Office hall (region 0), in line with the door $3FC (region 5,
# X 290..300, Z -149..-51) and facing it, as the capture faces +X.
HALL_DOOR = {"local": [200, -100], "slot": 0x3FC, "doorRegion": 5}


def hall_teleport(ram: bytes) -> tuple[list[str], dict[str, Any]]:
    x, z = HALL_DOOR["local"]
    return _teleport_lines(ram, x, z), {"local": [x, z], "hallDoor": HALL_DOOR}


CASES["eris-hall"] = ("rehosted/eris-lift.sav", [], hall_teleport)
INPUT_STOP = 10  # the first key and stick go in at this stop
CLEARANCE = 11  # $05A684: the clamp's inset when $7B35 is not negative


def _poke(address: int, value: int) -> str:
    return f"w ${address:x} {value:02x}"


# name: (source case, stops, {stop: [(address, byte)]}, the Floor the ride must end at, or None
# for a control with no ride)
MOVEMENT_CASES: dict[str, tuple[str, int, dict[int, list[tuple[int, int]]], int | None]] = {
    # Walk at the doorway from the admission on, and keep walking after the arrival.
    "eris-forward": ("eris", 300, {INPUT_STOP: [(MAILBOX, SCANCODES["1"]), (STICK, UP)]}, 1),
    # Walk at the open doorway, and press the key in the frame whose substeps would carry the eye
    # through it: from the stick at stop 10 the frames move the eye at stops 17, 24, 31 and 37,
    # and the key is read at $0594DC, before that frame's substeps.
    "eris-walk-in": ("eris", 260, {INPUT_STOP: [(STICK, UP)], INPUT_STOP + 23: [(MAILBOX, SCANCODES["1"])]}, 1),
    # The same walk with no key: the eye leaves the car through the open doorway.
    "eris-walk-out": ("eris", 80, {INPUT_STOP: [(STICK, UP)]}, None),
    # No ride: walk at a door that is shut, and see where the clamp holds the eye while it opens.
    "eris-hall-door": ("eris-hall", 200, {INPUT_STOP: [(STICK, UP)]}, None),
    # Back into the car's back wall.
    "eris-backward": ("eris", 200, {INPUT_STOP: [(MAILBOX, SCANCODES["1"]), (STICK, DOWN)]}, 1),
    # Turn on the spot for the whole ride.
    "eris-turn": ("eris", 200, {INPUT_STOP: [(MAILBOX, SCANCODES["1"]), (STICK, RIGHT)]}, 1),
    # Walk while turning, into the side walls.
    "eris-arc": ("eris", 200, {INPUT_STOP: [(MAILBOX, SCANCODES["1"]), (STICK, UP | RIGHT)]}, 1),
    # Ask for 2 and walk; once the door is shut, while the label still shows G, ask for 1.
    "eris-redirect": (
        "eris",
        220,
        {INPUT_STOP: [(MAILBOX, SCANCODES["2"]), (STICK, UP | LEFT)], INPUT_STOP + 50: [(MAILBOX, SCANCODES["1"])]},
        1,
    ),
    # The Vesta car, from the middle of its region, walking as the capture faces.
    "vesta-forward": ("vesta", 300, {INPUT_STOP: [(MAILBOX, SCANCODES["2"]), (STICK, UP)]}, 2),
    "vesta-arc": ("vesta", 300, {INPUT_STOP: [(MAILBOX, SCANCODES["2"]), (STICK, UP | LEFT)]}, 2),
}


def _regions(ram: bytes) -> list[dict[str, Any]]:
    out = []
    for index in range(_u16(ram, 0x7B32) + 1):
        base = REGIONS + 14 * index
        out.append(
            {
                "index": index,
                "pointer": base + 2,
                "flags": _u16(ram, base),
                "bounds": [_s16(ram, base + 2 + 2 * k) for k in range(4)],
            }
        )
    return out


def predicted_limits(regions: list[dict[str, Any]], car: dict[str, Any], across: tuple[int, int]) -> list[int]:
    """Where $05A64A stops the eye at each edge of the car while no region can be reselected.

    Past the car's inset edge, $05A504-$05A5EA look for a region whose opposite
    edge is the car's and whose inset span holds the other coordinate. They test
    no latch. If one is found the eye goes on to the car's own edge, where
    $05A6E8 walks the regions; $05A35C refuses every one while a ride is
    pending, and $05A4CA clamps to the car with no inset. Otherwise the inset
    edge holds. ``across`` is the (Z, X) the eye stands at along each edge.
    Returns [x min, x max, z min, z max], inclusive.
    """
    x0, x1, z0, z1 = car["bounds"]
    inset = 0 if car["flags"] & 0x80 else CLEARANCE

    def neighbour(axis: int, upper: bool) -> bool:
        edge = car["bounds"][2 * axis + (1 if upper else 0)]
        coordinate = across[axis]
        other = 1 - axis
        for region in regions:
            if region is car:
                continue
            bounds = region["bounds"]
            lo, hi = bounds[2 * other] + inset, bounds[2 * other + 1] - inset
            if bounds[2 * axis + (0 if upper else 1)] == edge and lo <= coordinate < hi:
                return True
        return False

    return [
        x0 if neighbour(0, False) else x0 + inset,
        x1 - 1 if neighbour(0, True) else x1 - inset - 1,
        z0 if neighbour(1, False) else z0 + inset,
        z1 - 1 if neighbour(1, True) else z1 - inset - 1,
    ]


def run_chain(roms: Path | None, run: Path, snapshot: Path, stops: int, first_lines: list[str], lines_at: dict[int, list[str]], settle: float) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Boot ``snapshot``, run a chain of ``stops`` stops to its end, and read every stop."""
    _write_chain(run, stops, first_lines, lines_at)
    meta: dict[str, Any] = {}
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
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
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
                time.sleep(settle)
                _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                _fifo_send(fifo, [f'hatari-debug b VBL = "VBL+1" :once :quiet :file {(run / "trace-0000.txt").resolve()}'])
                seen, last = 0, time.monotonic()
                while process.poll() is None:
                    while _read_stop(run, seen) is not None:
                        seen, last = seen + 1, time.monotonic()
                    _check(time.monotonic() - last < 60, f"not reached: the trace stalled after {seen} stops")
                    time.sleep(0.05)
        except BrokenPipeError:
            pass
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    trace = []
    while (s := _read_stop(run, len(trace))) is not None:
        trace.append(s)
    _check(len(trace) == stops, f"not reached: {len(trace)} of {stops} stops")
    for a, b in zip(trace, trace[1:]):
        _check((b["vbl"] - a["vbl"]) & 0xFFFF == 1, f"stop {b['stop']}: VBL clock moved {(b['vbl'] - a['vbl']) & 0xFFFF}")
    return trace, meta


def _settled(s: dict[str, Any]) -> bool:
    """A stop outside the substep loop. Inside it a VBL can land between the Mover and
    the clamp, and the eye is then where the step put it, not where the clamp left it."""
    return s["substeps"] == 0


def _frame_step(trace: list[dict[str, Any]]) -> int:
    """The largest move of the eye, on either axis, between two consecutive settled stops."""
    settled = [s for s in trace if _settled(s) and s["regionFlags"] & LIFT_BIT]
    return max(
        (max(abs(b["local"][0] - a["local"][0]), abs(b["local"][1] - a["local"][1])) for a, b in zip(settled, settled[1:]) if a["region"] == b["region"]),
        default=0,
    )


def analyse_walk_out(trace: list[dict[str, Any]], regions: list[dict[str, Any]]) -> dict[str, Any]:
    """The control: the same walk with no key leaves the car through its open doorway."""
    by_pointer = {r["pointer"]: r for r in regions}
    _check(all(s["destination"] == -1 for s in trace), "a ride was admitted with no key")
    car = by_pointer.get(trace[0]["region"])
    _check(car is not None and car["flags"] & LIFT_BIT, "not reached: the control did not start in a lift region")
    left = next((s for s in trace if s["region"] != trace[0]["region"]), None)
    _check(left is not None, "the control never left the car")
    region = by_pointer.get(left["region"])
    return {
        "car": car,
        "leftAtStop": left["stop"],
        "into": region,
        "local": left["local"],
        "latch": left["latch"],
    }


def analyse_hall_door(trace: list[dict[str, Any]], regions: list[dict[str, Any]]) -> dict[str, Any]:
    """No ride: where the clamp holds the eye at a door that is not latched open.

    $05A504-$05A5EA admit the door's region past the hall's inset edge whatever its latch;
    $05A366-$05A386 then refuse it at the hall's own edge until the latch reads $FF, and
    $05A4CA clamps to the hall with no inset. So the eye waits at the hall's edge less one.
    """
    by_pointer = {r["pointer"]: r for r in regions}
    _check(all(s["destination"] == -1 for s in trace), "a ride was admitted with no key")
    slot = HALL_DOOR["slot"]
    door_region = regions[HALL_DOOR["doorRegion"]]
    hall = next((r for r in regions if r["index"] == 0), None)
    start = next((s for s in trace if _settled(s) and s["region"] == hall["pointer"]), None)
    _check(start is not None, "not reached: the teleport did not select the hall")
    latch = lambda s: int(s["latches"][2 * (slot // 4) : 2 * (slot // 4) + 2], 16)
    waiting = [s for s in trace if _settled(s) and s["region"] == hall["pointer"] and latch(s) != 0xFF]
    _check(waiting, "not reached: the door was open before the eye reached it")
    held = max(s["local"][0] for s in waiting)
    predicted = predicted_limits(regions, hall, (start["local"][1], start["local"][0]))[1]
    _check(held <= predicted, f"the eye passed the hall's edge {predicted} while the door was shut: {held}")
    through = next((s for s in trace[start["stop"] :] if _settled(s) and s["region"] != hall["pointer"]), None)
    _check(through is None or latch(through) == 0xFF, "the eye left the hall before the door latched open")
    return {
        "hall": hall,
        "door": door_region,
        "start": start["local"],
        "heldAt": held,
        "predicted": predicted,
        "portWouldHold": hall["bounds"][1] - CLEARANCE - 1,
        "latchesWhileHeld": sorted({latch(s) for s in waiting if s["local"][0] == held}),
        "stopsHeld": sum(1 for s in waiting if s["local"][0] == held),
        "throughAtStop": through["stop"] if through else None,
        "throughInto": by_pointer[through["region"]]["index"] if through else None,
        "throughLocal": through["local"] if through else None,
    }


def analyse_movement(trace: list[dict[str, Any]], regions: list[dict[str, Any]], destination: int | None, inputs: dict[int, list[tuple[int, int]]], case: str = "") -> dict[str, Any]:
    if destination is None:
        return analyse_hall_door(trace, regions) if case == "eris-hall-door" else analyse_walk_out(trace, regions)
    by_pointer = {r["pointer"]: r for r in regions}
    admit = next((s for s in trace if s["destination"] != -1), None)
    _check(admit is not None and admit["stop"] > 0, "not reached: no admission bracketed by two stops")
    before = trace[admit["stop"] - 1]
    car = by_pointer.get(before["region"])
    _check(car is not None and car["flags"] & LIFT_BIT, "not reached: the admission was not made in a lift region")
    started = next((s for s in trace[admit["stop"] :] if s["destination"] == -1), None)
    _check(started is not None, "not reached: no arrival")
    arrival = next((s for s in trace[started["stop"] :] if s["regionFlags"] & LIFT_BIT and _settled(s)), None)
    _check(arrival is not None, "not reached: the arrival never republished a lift region")
    _check(arrival["floor"] == destination, f"arrived at {arrival['floor']}, not {destination}")
    riding = trace[admit["stop"] : started["stop"]]
    settled = [s for s in riding if _settled(s)]
    last = settled[-1]
    closed = next((s for s in riding if s["latch"] == 0), None)
    _check(closed is not None, "not reached: the door never closed")

    held = sorted({s["stick"] for s in riding})
    moved = any((s["local"], s["yaw"]) != (before["local"], before["yaw"]) for s in riding)
    _check(moved or held == [0], f"not reached: stick {held} held but nothing moved during the ride")

    # The region is frozen: the same bounds and flags from the admission to the arrival.
    _check(all(s["region"] == before["region"] for s in riding), "the region changed during the ride")
    _check(all(s["regionFlags"] == before["regionFlags"] for s in riding), "the region flags changed during the ride")
    _check(all(s["door"] == before["door"] for s in riding), "the doorway slot changed during the ride")
    # So the settled eye never leaves the car's box, whatever is held.
    x0, x1, z0, z1 = car["bounds"]
    outside = [s["stop"] for s in settled if not (x0 <= s["local"][0] < x1 and z0 <= s["local"][1] < z1)]
    _check(not outside, f"the eye left the car during the ride at stops {outside[:5]}")
    _check(all(s["y"] == before["y"] for s in riding), "Y moved during the ride")
    # The arrival writes no X/Z (the no-input rides show them unchanged). With the stick held,
    # the substeps of the arrival's frame walk on, so the eye may move by one frame's walk.
    step = _frame_step(trace)
    shift = [arrival["local"][0] - last["local"][0], arrival["local"][1] - last["local"][1]]
    _check(max(map(abs, shift)) <= step, f"the eye moved {shift} across the arrival, more than a frame's walk {step}")
    if held == [0]:
        _check(shift == [0, 0], "X/Z moved on arrival")
    if case == "eris-walk-in":
        # The key must land in the frame whose substeps would carry the eye out of the open doorway.
        _check(before["latch"] == 0xFF, f"not reached: the door was not open at the key (latch ${before['latch']:02X})")
        _check(before["local"][0] + step >= x1, f"not reached: at the key the eye was {x1 - before['local'][0]} short of the doorway, more than a frame's walk")

    # Where the clamp held the eye: every stop that pushed against an edge.
    extremes = {
        "x": [min(s["local"][0] for s in settled), max(s["local"][0] for s in settled)],
        "z": [min(s["local"][1] for s in settled), max(s["local"][1] for s in settled)],
    }
    limits = predicted_limits(regions, car, (before["local"][1], before["local"][0]))
    for name, value, limit, beyond in (
        ("x min", extremes["x"][0], limits[0], lambda v, l: v < l),
        ("x max", extremes["x"][1], limits[1], lambda v, l: v > l),
        ("z min", extremes["z"][0], limits[2], lambda v, l: v < l),
        ("z max", extremes["z"][1], limits[3], lambda v, l: v > l),
    ):
        _check(not beyond(value, limit), f"{name} {value} passed the predicted clamp {limit}")

    def rel(s: dict[str, Any]) -> int:
        return (s["vbl"] - admit["vbl"]) & 0xFFFF

    path = [(rel(s), s["local"][0], s["local"][1], f"${s['yaw']:04X}", s["clamped"]) for s in settled]
    changes = [path[0]] + [p for q, p in zip(path, path[1:]) if p[1:4] != q[1:4]]
    after = trace[arrival["stop"] :]
    left_car = next((s for s in after if s["region"] != arrival["region"]), None)
    return {
        "car": car,
        "inputs": {str(k): [f"${a:05X}<-${v:02X}" for a, v in pokes] for k, pokes in inputs.items()},
        "stick": held,
        "admittedAtStop": admit["stop"],
        "doorClosedVbl": rel(closed),
        "arrivalVbl": rel(arrival),
        "destinations": sorted({s["destination"] for s in riding}),
        "labels": [s["label"] for p, s in zip([before] + riding, riding) if s["label"] != p["label"]],
        "start": {"local": before["local"], "yaw": f"${before['yaw']:04X}", "latch": before["latch"]},
        "end": {"local": last["local"], "yaw": f"${last['yaw']:04X}"},
        "arrival": {"local": arrival["local"], "yaw": f"${arrival['yaw']:04X}", "pitch": f"${arrival['pitch']:04X}", "y": arrival["y"]},
        "extremes": extremes,
        "predictedLimits": limits,
        "clampedStops": sum(1 for s in settled if s["clamped"]),
        "frameStep": step,
        "arrivalShift": shift,
        "frameVbls": sorted({s["frameVbls"] for s in riding}),
        "unsettledStops": len(riding) - len(settled),
        "pathChanges": changes if len(changes) <= 60 else changes[:30] + changes[-30:],
        "afterArrival": {
            "regionChangeVbl": rel(left_car) if left_car else None,
            "regionFlags": f"${left_car['regionFlags']:04X}" if left_car else None,
            "local": left_car["local"] if left_car else None,
            "doorLatches": sorted({s["latch"] for s in after}),
            "finalLocal": trace[-1]["local"],
        },
    }


def movement(roms: Path | None, cases: list[str], settle: float) -> int:
    failures = []
    for name in cases:
        source, stops, inputs, destination = MOVEMENT_CASES[name]
        snapshot_name, _, intervention = CASES[source]
        snapshot = SNAPSHOTS / snapshot_name
        _check(snapshot.is_file(), f"snapshot not found: {snapshot}")
        run = WORK_ROOT / _run_id(f"lift-move-{name}")
        run.mkdir(parents=True)
        ram = bytearray(hatari_memstate_ram(snapshot.read_bytes()))
        first_lines: list[str] = []
        meta: dict[str, Any] = {}
        if intervention:
            first_lines, meta = intervention(bytes(ram))
        regions = _regions(bytes(ram))
        lines_at = {stop: [_poke(a, v) for a, v in pokes] for stop, pokes in inputs.items()}
        error = None
        result: dict[str, Any] = {}
        try:
            trace, chain_meta = run_chain(roms, run, snapshot, stops, first_lines, lines_at, settle)
            meta.update(chain_meta)
            (run / "trace.json").write_text(json.dumps(trace) + "\n", encoding="utf-8")
            if meta.get("local"):
                _check(meta["local"] in (trace[0]["local"], trace[1]["local"]), "the teleport did not land")
            result = analyse_movement(trace, regions, destination, inputs, name)
        except LabError as failure:
            error = str(failure)
            failures.append(f"{name}: {error}")
        document = {
            "schemaVersion": 1,
            "case": name,
            "result": result,
            "error": error,
            "meta": meta,
            "snapshot": snapshot_name,
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
    live_parser.add_argument("--case", choices=tuple(CASES), required=True)
    live_parser.add_argument("--settle-seconds", type=float, default=4.0)
    movement_parser = sub.add_parser("movement")
    movement_parser.add_argument("--roms", type=Path)
    movement_parser.add_argument("--case", choices=tuple(MOVEMENT_CASES), action="append")
    movement_parser.add_argument("--settle-seconds", type=float, default=4.0)
    args = parser.parse_args()
    if args.mode == "decode":
        return decode()
    if args.mode == "movement":
        return movement(args.roms, args.case or list(MOVEMENT_CASES), args.settle_seconds)
    return live(args.roms, args.case, args.settle_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
