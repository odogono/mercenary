#!/usr/bin/env python3
"""Damocles Lift control probe (#471).

Two halves, both gated: a capture the decode does not reproduce raises.

``decode`` reads memstates without Hatari and checks every lift fact the note
relies on against what the running game stored: the Floor word ``$7AC4`` and its
committed mirror ``$7AA4``, the Floor Label ``$CD04``, the eye height
``$7AB6 = Floor x $7B00 + 63``, a Floor Table entry that is not zero for the
Floor the capture stands on, the idle destination ``$788A = $FFFF``, the step
period ``$788C``, and the lift region bit (bit 13 of ``$7B34``) against the
region table at ``$B23C`` and the player's structure-local position.

``live`` boots one rehosted memstate, presses keys through the command FIFO and
samples small RAM windows while the emulator is stopped. Each case states what
the decode predicts and raises when a sample contradicts it. A case whose
precondition is not met raises as *not reached* rather than reporting a result.
The ``vesta-teleport`` case is the one intervention: it writes the player's X/Z
pose low words and the matching structure-local words to stand inside a Vesta
lift region. It writes nothing else; the region walk derives ``$7B34`` from that
position itself.

Run from the repository root:

  python3 research/damocles-st/scripts/lift-control-probe.py decode
  python3 research/damocles-st/scripts/lift-control-probe.py live --roms roms --case ride

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
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
from damocleslab.core import LabError, file_hash, validate_image  # noqa: E402
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

DESTINATION = 0x788A  # word: requested Floor, $FFFF when no ride is pending
STEP_PERIOD = 0x788C  # word: frames between steps
STEP_COUNTDOWN = 0x788E
FLOOR = 0x7AC4  # word: the Floor the lift indicator stands at
FLOOR_COMMITTED = 0x7AA4  # $058F78 copies $7AAE..$7ACD to $7A8E..$7AAD each frame
OCCUPANCY = 0x7AAE  # word: 1 on foot
SELECTION = 0x7882  # word: non-zero while digit keys select a carried object
EYE_Y = 0x7AB6  # long
POS_X = 0x79A8  # word, structure-local
POS_Z = 0x79B0
STOREY = 0x7B00
REGION_FLAGS = 0x7B34
LAST_DOOR = 0x7AE6  # word: attachment slot of the doorway region last entered
FLOOR_TABLE = 0x7C1E  # long: alias record + 6
ROOT = 0x7B0E
REGION_COUNT = 0x7B32
REGIONS = 0xB23C  # 14-byte records: flags, x0, x1, z0, z1, pointer
LABEL = 0xCD04
LATCH = 0x5A41  # + slot: $00 closed, $01 moving, $FF open
OVERRIDE = 0x5A42  # + slot: high byte $80 pins the leaves shut
LIFT_BIT = 0x2000
EYE = 63

# Atari ST make codes.
SCANCODES = {
    "esc": 0x01,
    **{str(digit): 0x01 + digit for digit in range(1, 10)},
    "0": 0x0B,
    "g": 0x22,
    "b": 0x30,
}

# Captures the decode gate reads. The State Office lift and the Vesta
# transporter Floor are the two the issue names; the rest are every other
# capture that stands inside a structure.
DECODE_CAPTURES = (
    "damocles.eris.lift",
    "damocles.vesta.transporter",
    "vesta-parliament-4-6",
    "damocles.eris.transporter.11-8",
    "damocles.dion.transporter",
    "damocles.gaea.transporter",
    "damocles.metis.transporter",
    "damocles.logos.transporter",
    "damocles.pan",
    "interior-window",
    "eris-spaceport-onfoot",
)


def _u16(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 2], "big")


def _s16(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 2], "big", signed=True)


def _u32(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 4], "big")


def expected_label(floor: int) -> str:
    """$055AB8-$055AD8 and $055B5A-$055B72."""
    if floor == 0:
        return "G"
    if floor == 10:
        return "B"
    return chr(0x30 + floor)


def step(current: int, destination: int) -> int:
    """One pass of $055A88-$055AB4: the Floor the indicator moves to next."""
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
        if len(floors) > 11:
            raise LabError("step never reaches its destination")
    return floors


def admits(scancode: int) -> int | None:
    """$0555F2-$05560E: the Floor a key requests inside a lift region, if any."""
    d1 = scancode & 0xFF
    if d1 < 0x0C:
        return d1 - 1
    d1 = (d1 - 0x21) & 0xFF
    if d1 == 1:
        return 0
    d1 = (d1 - 4) & 0xFF
    if d1 == 0x0B:
        return 10
    return None


def regions(ram: bytes) -> list[dict[str, Any]]:
    out = []
    for index in range(_u16(ram, REGION_COUNT) + 1):
        base = REGIONS + 14 * index
        flags = _u16(ram, base)
        x0, x1, z0, z1 = (_s16(ram, base + 2 + 2 * k) for k in range(4))
        out.append({"index": index, "flags": flags, "bounds": [x0, x1, z0, z1]})
    return out


def standing_region(ram: bytes) -> dict[str, Any] | None:
    """The first region $05A33A-$05A358 would accept for the current position."""
    x, z = _s16(ram, POS_X), _s16(ram, POS_Z)
    for region in regions(ram):
        x0, x1, z0, z1 = region["bounds"]
        if x0 <= x < x1 and z0 <= z < z1:
            return region
    return None


def state(ram: bytes) -> dict[str, Any]:
    door = _u16(ram, LAST_DOOR)
    table = _u32(ram, FLOOR_TABLE)
    return {
        "destination": _s16(ram, DESTINATION),
        "stepPeriod": _u16(ram, STEP_PERIOD),
        "stepCountdown": _u16(ram, STEP_COUNTDOWN),
        "floor": _u16(ram, FLOOR),
        "floorCommitted": _u16(ram, FLOOR_COMMITTED),
        "label": chr(ram[LABEL]),
        "eyeY": _u32(ram, EYE_Y),
        "storey": _u16(ram, STOREY),
        "occupancy": _u16(ram, OCCUPANCY),
        "selection": _u16(ram, SELECTION),
        "regionFlags": _u16(ram, REGION_FLAGS),
        "inLift": bool(_u16(ram, REGION_FLAGS) & LIFT_BIT),
        "position": [_s16(ram, POS_X), _s16(ram, POS_Z)],
        "lastDoor": door,
        "doorLatch": ram[LATCH + door],
        "doorOverride": ram[OVERRIDE + door],
        "floorTableAddress": table,
        "floorTable": list(ram[table : table + 12]),
        "root": _u32(ram, ROOT),
    }


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def decode_gate(ram: bytes, name: str) -> dict[str, Any]:
    s = state(ram)
    floor = s["floor"]
    _check(0 <= floor <= 10, f"{name}: Floor {floor} outside 0..10")
    _check(s["floorCommitted"] == floor, f"{name}: $7AA4 {s['floorCommitted']} != $7AC4 {floor}")
    _check(s["label"] == expected_label(floor), f"{name}: label {s['label']!r} for Floor {floor}")
    _check(
        s["eyeY"] == floor * s["storey"] + EYE,
        f"{name}: eye Y {s['eyeY']} != {floor} x {s['storey']} + {EYE}",
    )
    _check(s["floorTable"][floor] != 0, f"{name}: Floor Table leaves Floor {floor} zero")
    _check(s["destination"] == -1, f"{name}: a ride is pending ({s['destination']})")
    _check(s["stepPeriod"] == 25, f"{name}: step period {s['stepPeriod']}")
    region = standing_region(ram)
    _check(region is not None, f"{name}: position {s['position']} is in no region")
    _check(
        region["flags"] == s["regionFlags"],
        f"{name}: region walk would publish {region['flags']:04x}, game has {s['regionFlags']:04x}",
    )
    lifts = [r["index"] for r in regions(ram) if r["flags"] & LIFT_BIT]
    return {
        "capture": name,
        "floor": floor,
        "label": s["label"],
        "eyeY": s["eyeY"],
        "storey": s["storey"],
        "floorTable": s["floorTable"],
        "regionFlags": f"${s['regionFlags']:04X}",
        "inLift": s["inLift"],
        "liftRegions": lifts,
    }


def decode(snapshots: Path) -> int:
    # The route rule, stated once as data the note quotes.
    _check(route(2, 10) == [1, 0, 10], "route 2 -> B")
    _check(route(10, 2) == [0, 1, 2], "route B -> 2")
    _check(route(0, 10) == [10], "route G -> B")
    _check(route(9, 10) == [8, 7, 6, 5, 4, 3, 2, 1, 0, 10], "route 9 -> B")
    keys = {name: admits(code) for name, code in SCANCODES.items()}
    _check(
        keys == {"esc": 0, **{str(d): d for d in range(1, 10)}, "0": 10, "g": 0, "b": 10},
        f"key table {keys}",
    )
    _check(all(admits(code) is None for code in range(0x0C, 0x80) if code not in (0x22, 0x30)), "stray key")
    rows = []
    for name in DECODE_CAPTURES:
        path = snapshots / f"{name}.sav"
        if not path.is_file():
            raise LabError(f"capture not found: {path}")
        row = decode_gate(hatari_memstate_ram(path.read_bytes()), name)
        row["sha256"] = file_hash(path)
        rows.append(row)
    print(json.dumps(rows, indent=2))
    return 0


# --- live ------------------------------------------------------------------

WINDOWS = {
    "low": (0x7800, 0x7D00),
    "doors": (0x5A40, 0x5E40),
    "label": (0xCD00, 0xCD10),
    "regions": (REGIONS, REGIONS + 14 * 48),
    "records": (0x10000, 0x20000),  # the Floor Table lives in the alias records
}


class Session:
    def __init__(self, run: Path, fifo, process: subprocess.Popen[str]):
        self.run, self.fifo, self.process = run, fifo, process
        self.samples: list[dict[str, Any]] = []
        self.started = time.monotonic()

    def _wait(self, path: Path, size: int, seconds: float = 15) -> None:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if path.is_file() and path.stat().st_size == size:
                return
            if self.process.poll() is not None:
                break
            time.sleep(0.02)
        raise LabError(f"timed out waiting for {path}; hatari status={self.process.poll()}")

    def sample(self, name: str, screenshot: bool = False) -> dict[str, Any]:
        index = len(self.samples)
        lines = ["hatari-stop", "hatari-debug setopt hex"]
        paths = {}
        for key, (start, end) in WINDOWS.items():
            path = (self.run / f"s{index:02d}-{key}.bin").resolve()
            paths[key] = (path, start, end)
            lines.append(f"hatari-debug savebin {path} ${start:x} ${end - start:x}")
        if screenshot:
            lines.append(f"hatari-debug screenshot {(self.run / f's{index:02d}-{name}.png').resolve()}")
        lines.append("hatari-cont")
        _fifo_send(self.fifo, lines)
        ram = bytearray(0x20000)
        for path, start, end in paths.values():
            self._wait(path, end - start)
            ram[start:end] = path.read_bytes()
        s = state(bytes(ram))
        s["name"] = name
        s["hostSeconds"] = round(time.monotonic() - self.started, 2)
        s["standingRegion"] = standing_region(bytes(ram))
        if name.endswith("regions"):
            s["regions"] = regions(bytes(ram))
        self.samples.append(s)
        print(
            f"  {name:<24} t={s['hostSeconds']:6.2f} dest={s['destination']:3} "
            f"floor={s['floor']:2} label={s['label']} y={s['eyeY']:5} latch={s['doorLatch']:02x} "
            f"override={s['doorOverride']:02x} flags={s['regionFlags']:04x} root={s['root']:06x}",
            file=sys.stderr,
        )
        return s

    def key(self, name: str) -> None:
        # A one-character argument is read as a host character, so a scancode
        # below 10 must be sent with two digits.
        code = f"{SCANCODES[name]:02d}"
        _fifo_send(self.fifo, [f"hatari-event keydown {code}"])
        time.sleep(0.12)
        _fifo_send(self.fifo, [f"hatari-event keyup {code}"])
        time.sleep(0.12)

    def poke_word(self, address: int, value: int) -> None:
        _fifo_send(
            self.fifo,
            ["hatari-stop", f"hatari-debug w ${address:x} {value >> 8 & 0xFF:02x} {value & 0xFF:02x}", "hatari-cont"],
        )

    def ride(self, until_floor: int, seconds: float, interval: float = 0.25) -> list[dict[str, Any]]:
        """Sample until the ride settles at ``until_floor`` with no destination pending."""
        taken = []
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            time.sleep(interval)
            s = self.sample("ride")
            taken.append(s)
            if s["destination"] == -1 and s["floor"] == until_floor and s["eyeY"] == until_floor * s["storey"] + EYE:
                return taken
        raise LabError(f"not reached: the ride did not settle at Floor {until_floor} in {seconds}s")


def _labels(samples: list[dict[str, Any]]) -> list[str]:
    seen: list[str] = []
    for s in samples:
        if not seen or seen[-1] != s["label"]:
            seen.append(s["label"])
    return seen


def _refused(before: dict[str, Any], after: dict[str, Any], why: str) -> None:
    _check(after["destination"] == -1, f"{why}: the key set a destination {after['destination']}")
    _check(after["floor"] == before["floor"], f"{why}: the Floor moved")
    _check(after["doorOverride"] == before["doorOverride"], f"{why}: the door was pinned")


def _admitted(after: dict[str, Any], floor: int) -> None:
    _check(after["destination"] == floor or after["floor"] == floor, f"the key did not request Floor {floor}")


def case_ride(sess: Session) -> dict[str, Any]:
    start = sess.sample("start", screenshot=True)
    _check(start["inLift"] and start["floor"] == 0, "not reached: capture is not in a lift on Floor 0")
    sess.key("3")
    time.sleep(0.5)
    _refused(start, sess.sample("key-3-unbound"), "Floor 3 is zero in the table")
    sess.key("g")
    time.sleep(0.5)
    _refused(start, sess.sample("key-g-current"), "Floor 0 is the current Floor")
    sess.key("2")
    first = sess.sample("key-2")
    _admitted(first, 2)
    _check(first["doorOverride"] == 0x80, "Floor 2 request did not pin the lift door")
    up = sess.ride(2, 40)
    labels_up = _labels([first, *up])
    _check(labels_up[-2:] == ["1", "2"], f"G -> 2 showed {labels_up}")
    at2 = sess.sample("at-2-regions", screenshot=True)
    _check(at2["floorTable"][2] != 0 and at2["floor"] == 2, "not at Floor 2")
    sess.key("b")
    first_b = sess.sample("key-b")
    _admitted(first_b, 10)
    down = sess.ride(10, 60)
    labels_down = _labels([first_b, *down])
    _check(labels_down == ["2", "1", "G", "B"], f"2 -> B showed {labels_down}")
    at_b = sess.sample("at-b-regions", screenshot=True)
    sess.key("1")
    first_1 = sess.sample("key-1")
    _admitted(first_1, 1)
    back = sess.ride(1, 40)
    labels_back = _labels([first_1, *back])
    _check(labels_back == ["B", "G", "1"], f"B -> 1 showed {labels_back}")
    return {"labelsUp": labels_up, "labelsDown": labels_down, "labelsBack": labels_back, "atB": at_b["eyeY"]}


def case_keys(sess: Session) -> dict[str, Any]:
    """'0' and Esc, the two keys the dispatcher admits beside digits, G and B."""
    start = sess.sample("start")
    _check(start["inLift"] and start["floor"] == 0, "not reached: capture is not in a lift on Floor 0")
    sess.key("0")
    first = sess.sample("key-0")
    _admitted(first, 10)
    sess.ride(10, 40)
    sess.key("esc")
    first_esc = sess.sample("key-esc")
    _admitted(first_esc, 0)
    sess.ride(0, 40)
    return {"zero": "Floor 10", "escape": "Floor 0"}


def case_retarget(sess: Session) -> dict[str, Any]:
    """A second key while the door is still closing replaces the destination."""
    start = sess.sample("start")
    _check(start["inLift"] and start["floor"] == 0, "not reached: capture is not in a lift on Floor 0")
    sess.key("2")
    sess.key("1")
    after = sess.sample("key-2-then-1")
    _check(after["destination"] == 1 or after["floor"] == 1, f"retarget left destination {after['destination']}")
    sess.ride(1, 40)
    return {"retarget": "second key replaces $788A"}


def case_walk_out(sess: Session, floor_key: str, floor: int, direction: int, vbls: int) -> dict[str, Any]:
    """Ride to a Floor, then hold the stick and watch the region and Floor."""
    start = sess.sample("start")
    _check(start["inLift"] and start["floor"] == 0, "not reached: capture is not in a lift on Floor 0")
    if floor:
        sess.key(floor_key)
        sess.ride(floor, 40)
    arrived = sess.sample("arrived", screenshot=True)
    _fifo_send(sess.fifo, ["hatari-stop", f"hatari-debug w $79c2 {direction:02x}", "hatari-cont"])
    walked = []
    for _ in range(max(1, vbls // 25)):
        time.sleep(0.5)
        _fifo_send(sess.fifo, ["hatari-stop", f"hatari-debug w $79c2 {direction:02x}", "hatari-cont"])
        walked.append(sess.sample("walk"))
    _fifo_send(sess.fifo, ["hatari-stop", "hatari-debug w $79c2 00", "hatari-cont"])
    end = sess.sample("walked-regions", screenshot=True)
    return {"arrived": arrived["position"], "end": end["position"], "endFloor": end["floor"], "endFlags": end["regionFlags"]}


def case_vesta_outside(sess: Session) -> dict[str, Any]:
    start = sess.sample("start")
    _check(not start["inLift"] and start["floor"] == 10, "not reached: expected Floor 10 outside a lift")
    _check(start["floorTable"][1] != 0, "Floor 1 must be bound for the refusal to be about the region")
    sess.key("1")
    time.sleep(0.5)
    _refused(start, sess.sample("key-1-outside"), "outside a lift region")
    return {"refused": "bit 13 of $7B34 clear"}


def case_vesta_teleport(sess: Session) -> dict[str, Any]:
    start = sess.sample("start")
    _check(start["floor"] == 10, "not reached: expected Vesta Floor 10")
    lift = next(
        (r for r in regions_of(sess) if r["flags"] & LIFT_BIT and r["bounds"][0] < 0),
        None,
    )
    _check(lift is not None, "not reached: no lift region in the Floor 10 structure")
    x0, x1, z0, z1 = lift["bounds"]
    x, z = (x0 + x1) // 2, (z0 + z1) // 2
    # $055BE2-$055BF8: local = low word of the pose minus the structure origin.
    origin_x = start["originX"]
    origin_z = start["originZ"]
    # Movement advances both copies together ($057DCA-$057DE0, $058E10-$058E1C),
    # so the teleport writes both: the pose's low words and the local words.
    sess.poke_word(0x7AB4, (x + origin_x) & 0xFFFF)
    sess.poke_word(0x7ABC, (z + origin_z) & 0xFFFF)
    sess.poke_word(POS_X, x & 0xFFFF)
    sess.poke_word(POS_Z, z & 0xFFFF)
    time.sleep(1.0)
    inside = sess.sample("teleported", screenshot=True)
    _check(inside["inLift"], f"not reached: region walk published {inside['regionFlags']:04x} at {inside['position']}")
    sess.key("g")
    first = sess.sample("key-g")
    _admitted(first, 0)
    down = sess.ride(0, 40)
    labels = _labels([first, *down])
    _check(labels == ["B", "G"], f"B -> G showed {labels}")
    sess.key("3")
    first3 = sess.sample("key-3")
    _admitted(first3, 3)
    up = sess.ride(3, 60)
    labels3 = _labels([first3, *up])
    _check(labels3 == ["G", "1", "2", "3"], f"G -> 3 showed {labels3}")
    sess.key("5")
    time.sleep(0.5)
    at3 = sess.samples[-1]
    _refused(at3, sess.sample("key-5-unbound"), "Floor 5 is zero in the table")
    return {"teleport": [x, z], "labelsDown": labels, "labelsUp": labels3}


def regions_of(sess: Session) -> list[dict[str, Any]]:
    index = len(sess.samples) - 1
    ram = bytearray(0x20000)
    for key in ("low", "regions"):
        start, end = WINDOWS[key]
        ram[start:end] = (sess.run / f"s{index:02d}-{key}.bin").read_bytes()
    return regions(bytes(ram))


CASES = {
    "ride": ("rehosted/eris-lift.sav", case_ride),
    "keys": ("rehosted/eris-lift.sav", case_keys),
    "retarget": ("rehosted/eris-lift.sav", case_retarget),
    "walk-out-0": ("rehosted/eris-lift.sav", lambda s: case_walk_out(s, "g", 0, 0x01, 400)),
    "walk-out-2": ("rehosted/eris-lift.sav", lambda s: case_walk_out(s, "2", 2, 0x01, 400)),
    "vesta-outside": ("rehosted/vesta-transporter.sav", case_vesta_outside),
    "vesta-teleport": ("rehosted/vesta-transporter.sav", case_vesta_teleport),
}


def live(roms: Path | None, snapshots: Path, case: str, settle: float) -> int:
    snapshot_name, body = CASES[case]
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    program_info = validate_image(program, authority["programImage"], label="Working Authority STX")
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    snapshot = snapshots / snapshot_name
    if not snapshot.is_file():
        raise LabError(f"snapshot not found: {snapshot}")

    run = WORK_ROOT / _run_id(f"lift-control-{case}")
    run.mkdir(parents=True)
    fifo_path = run / "cmd.fifo"
    parse = run / "play.txt"
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
    outcome: dict[str, Any]
    error: str | None = None
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env)
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            if not fifo_path.exists():
                raise LabError(f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle)
                if process.poll() is not None:
                    raise LabError("Hatari exited during restore; is the memstate rehosted?")
                sess = Session(run, fifo, process)
                if case == "vesta-teleport":
                    _attach_origin(sess)
                try:
                    outcome = body(sess)
                except LabError as failure:
                    error = str(failure)
                    outcome = {}
                _fifo_send(fifo, ["hatari-stop", "hatari-debug quit"])
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
            if fifo_path.exists():
                fifo_path.unlink()

    result = {
        "schemaVersion": 1,
        "case": case,
        "outcome": outcome,
        "error": error,
        "samples": sess.samples,
        "authority": {
            "programSha256": program_info["hashes"]["sha256"],
            "tosSha256": tos_info["hashes"]["sha256"],
            "snapshot": snapshot_name,
            "snapshotSha256": file_hash(snapshot),
        },
        "toolchain": toolchain.as_dict(),
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    (run / "result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"run": run.name, "case": case, "outcome": outcome, "error": error}, indent=2))
    if error:
        raise LabError(error)
    return 0


def _attach_origin(sess: Session) -> None:
    """Record the structure origin words $7AF2/$7AF4 on the state dict of each sample."""
    original = sess.sample

    def sample(name: str, screenshot: bool = False) -> dict[str, Any]:
        s = original(name, screenshot)
        low = (sess.run / f"s{len(sess.samples) - 1:02d}-low.bin").read_bytes()
        s["originX"] = int.from_bytes(low[0x7AF2 - 0x7800 : 0x7AF4 - 0x7800], "big")
        s["originZ"] = int.from_bytes(low[0x7AF4 - 0x7800 : 0x7AF6 - 0x7800], "big")
        return s

    sess.sample = sample  # type: ignore[method-assign]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--snapshots", type=Path, default=SNAPSHOTS)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("decode")
    live_parser = sub.add_parser("live")
    live_parser.add_argument("--roms", type=Path)
    live_parser.add_argument("--case", choices=tuple(CASES), required=True)
    live_parser.add_argument("--settle-seconds", type=float, default=4.0)
    args = parser.parse_args()
    if args.mode == "decode":
        return decode(args.snapshots)
    return live(args.roms, args.snapshots, args.case, args.settle_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
