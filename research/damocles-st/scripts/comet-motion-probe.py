#!/usr/bin/env python3
"""Recompute DAMOCLES's centre from the Impact Clock, and check the machine agrees (#440).

#439 left one exception to Gamma System orbit stasis: slot 29's centre is the
only one the resident image ever writes, at ``$051F36``/``$051F3A``, from a
mover at ``$051E88`` that reaches a record through ``$00782C``. #440 asks what
that record holds, what path it describes, and whether the path is a function
of the Impact Clock at ``$00793C``.

The desk trace says it is a **waypoint table** of 31 ten-byte records at
``$052022`` — a signed word of seconds-to-impact and a longword X and Z — read
as a piecewise-linear path and interpolated at 1/32-second resolution. This
probe answers the observable half on a real machine.

``path``
    Sample DAMOCLES's centre, the Impact Clock, its 1/32-second companion at
    ``$007942``, the path cursor ``$00782C`` and the segment rates at
    ``$007822..$00782B`` at intervals, and for each sample recompute the centre
    from the clock and the table alone. For every sample it also searches the
    last two game-seconds for the single 1/32-second tick that reproduces both
    axes bit-exactly, which is the frame the mover last ran on.

``waypoint``
    Poke the clock forward onto an authored waypoint time and check that the
    machine's centre lands on that waypoint's own X and Z. The cursor only ever
    steps forward, so the pokes ascend.

``pose``
    Reconcile one restored memstate's held centre against its own clock, which
    tests the formula against a capture taken long before it and by other work,
    and report whether the ``$051F26..$051F32`` carry — which the gate at
    ``$051F12`` allows only while ``$007AAE`` reads 2 — is open in that pose.

Nothing is injected except in ``waypoint``, which says so. Every sample is a
``savebin`` taken while the machine is stopped.

Usage (from the repository root):

  python3 research/damocles-st/scripts/comet-motion-probe.py --case path
  python3 research/damocles-st/scripts/comet-motion-probe.py --case path \\
      --snapshot research/damocles-st/snapshots/rehosted/damocles.sav
  python3 research/damocles-st/scripts/comet-motion-probe.py --case waypoint
  python3 research/damocles-st/scripts/comet-motion-probe.py --case pose \\
      --snapshot research/damocles-st/snapshots/rehosted/damocles.sav

See docs/research/damocles-script-motion-time.md for the claims these runs
support.
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
from datetime import UTC, datetime
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    _fifo_send,
    _run_id,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

REPO = LAB_ROOT.parents[1]
WORK_ROOT = LAB_ROOT / "work"
SNAPSHOTS = LAB_ROOT / "snapshots"
DEFAULT_SNAPSHOT = SNAPSHOTS / "eris-spaceport-onfoot.sav"
COMET_SNAPSHOT = SNAPSHOTS / "rehosted" / "damocles.sav"

# DAMOCLES is slot 29, so its selector into every body array is 29 * 4 = $74
# (docs/research/damocles-gamma-system.md).
SELECTOR = 29 * 4
BODY_X, BODY_Y, BODY_Z = 0x005F40, 0x00626A, 0x005FC0
COMET_X, COMET_Y, COMET_Z = BODY_X + SELECTOR, BODY_Y + SELECTOR, BODY_Z + SELECTOR

CLOCK = 0x00793C          # signed longword, minus the seconds left (#208, #368)
CLOCK_LOW = 0x00793E      # the word half the mover reads
DAY = 0x007940            # bumped as $051E7E subtracts a whole day from the clock
FINE = 0x007942           # clock * 32 + the fraction of the current second
TICK_STEP = 0x007876      # subtracted from the counter once an interrupt
TICK_COUNTER = 0x00787A   # counts down; a tick reloads it with the period
TICK_PERIOD = 0x007878    # 25 << $786E, the counter's own reload

PATH_CURSOR = 0x00782C    # the waypoint record the mover is interpolating from
RATE_X, RATE_X_FRAC = 0x007822, 0x007824   # |dX| / segment, as 16.16
RATE_Z, RATE_Z_FRAC = 0x007826, 0x007828   # |dZ| / segment, as 16.16
SIGN_X, SIGN_Z = 0x00782A, 0x00782B        # $FF when the segment's delta is negative

DRIFT_ARM = 0x007A7E      # armed with the clock at $04C8FC, or $FFFFEDCC at $04D8B0
IMPACT_FLAG = 0x007A82    # $FFFF once the table has run out at $051FB8
DRIFT = 0x007A84          # $7A7E - clock, added to X at $051F0E
SCRATCH = 0x007CF4        # the two records copied out of the table's end

CARRY_GATE = 0x001634     # $051F12 skips the carry unless this reads 11 or less
OCCUPANCY = 0x007AAE      # 1 on foot, 0 boarded, 2 in space
PAUSE_GATE = 0x007A26     # non-zero skips the whole interrupt body at $051E26
CAMERA_X, CAMERA_Y, CAMERA_Z = 0x00799A, 0x00799E, 0x0079A2

TABLE = 0x052022          # the waypoint table, installed at $051088 beside the clock
TABLE_END = 0x052158      # the first byte past it: the panel's own digit divisors
RECORD = 10               # signed word seconds, longword X, longword Z

INTERRUPT_COUNTER = 0x051D96
PAL_VBL_HZ = 50.0

WINDOWS = (
    ("gate", 0x001600, 0x0040),     # the carry gate at $1634
    ("state", 0x005F00, 0x2600),    # body arrays, $78xx path state, $79xx-$7Cxx
    ("counter", 0x051D80, 0x0020),  # the interrupt counter
    ("table", 0x052000, 0x0180),    # the waypoint table and the digit divisors
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _window(blobs: dict[str, bytes], address: int) -> tuple[bytes, int]:
    for label, base, length in WINDOWS:
        if base <= address < base + length:
            return blobs[label], base
    raise LabError(f"no sampled window covers ${address:06x}")


def _read(blobs: dict[str, bytes], address: int, size: int, *, signed: bool) -> int:
    data, base = _window(blobs, address)
    return int.from_bytes(data[address - base : address - base + size], "big",
                          signed=signed)


def _u8(blobs, address):  # noqa: ANN001, ANN201
    return _read(blobs, address, 1, signed=False)


def _u16(blobs, address):  # noqa: ANN001, ANN201
    return _read(blobs, address, 2, signed=False)


def _s16(blobs, address):  # noqa: ANN001, ANN201
    return _read(blobs, address, 2, signed=True)


def _u32(blobs, address):  # noqa: ANN001, ANN201
    return _read(blobs, address, 4, signed=False)


def _s32(blobs, address):  # noqa: ANN001, ANN201
    return _read(blobs, address, 4, signed=True)


def read_table(blobs: dict[str, bytes]) -> list[dict]:
    """The waypoint table as the mover walks it: seconds, X, Z, ten bytes a record."""
    data, base = _window(blobs, TABLE)
    records = []
    for address in range(TABLE, TABLE_END, RECORD):
        offset = address - base
        seconds, x, z = struct.unpack_from(">hii", data, offset)
        records.append({
            "address": f"0x{address:06x}",
            "index": len(records),
            "seconds": seconds,
            "x": x,
            "z": z,
        })
    return records


def segment_rates(first: dict, second: dict) -> dict:
    """Reproduce $051FDA..$05201A: |delta| / length as an unsigned 16.16 rate."""
    length = ((second["seconds"] - first["seconds"]) << 5) & 0xFFFF
    rates = {"lengthTicks": length}
    for axis in ("x", "z"):
        delta = second[axis] - first[axis]
        magnitude = abs(delta)
        if length == 0:
            rates[axis] = {"negative": delta < 0, "integer": None, "fraction": None}
            continue
        integer, remainder = divmod(magnitude, length)
        rates[axis] = {
            "negative": delta < 0,
            "integer": integer & 0xFFFF,
            "fraction": ((remainder << 16) // length) & 0xFFFF,
        }
    return rates


def displacement(ticks: int, rate: dict) -> int:
    """Reproduce $051EC6..$051EF0: a 16.16 multiply, then the segment's sign."""
    low = ticks & 0xFFFF
    value = low * rate["integer"] + ((low * rate["fraction"]) >> 16)
    return -value if rate["negative"] else value


def locate(table: list[dict], clock_low: int) -> int:
    """The record the cursor rests on for this clock word, by $051EB2's own test.

    The mover advances while the clock word has reached the next record's time,
    comparing signed words, so the segment is the last record whose time the
    clock has passed.
    """
    clock = struct.unpack(">h", struct.pack(">H", clock_low))[0]
    index = 0
    while index + 1 < len(table) and clock >= table[index + 1]["seconds"]:
        index += 1
    return index


def predict(table: list[dict], index: int, clock_low: int, ticks_into: int,
            drift: int) -> tuple[int, int]:
    """DAMOCLES's centre for one 1/32-second tick of one segment."""
    first, second = table[index], table[index + 1]
    rates = segment_rates(first, second)
    if rates["lengthTicks"] == 0:
        return first["x"] + drift, first["z"]
    x = first["x"] + displacement(ticks_into, rates["x"]) + drift
    z = first["z"] + displacement(ticks_into, rates["z"])
    return x, z


def ticks_into_segment(table: list[dict], index: int, clock_low: int,
                       fraction: int) -> int:
    """$051EBA..$051EBE: (clock - segment start) * 32 + the sub-second fraction."""
    start = table[index]["seconds"] & 0xFFFF
    return ((((clock_low - start) & 0xFFFF) << 5) + fraction) & 0xFFFF


def decode(blobs: dict[str, bytes]) -> dict:
    clock = _s32(blobs, CLOCK)
    clock_low = _u16(blobs, CLOCK_LOW)
    fine = _u16(blobs, FINE)
    fraction = (fine - ((clock_low << 5) & 0xFFFF)) & 0xFFFF
    period = _u16(blobs, TICK_PERIOD)
    counter = _s16(blobs, TICK_COUNTER)
    step = _u16(blobs, TICK_STEP)
    armed = _s32(blobs, DRIFT_ARM)
    return {
        "interrupts": _u32(blobs, INTERRUPT_COUNTER),
        "clock": clock,
        "clockLow": f"0x{clock_low:04x}",
        "readout": _readout(clock),
        "day": _u16(blobs, DAY),
        "fine": fine,
        "fraction": fraction,
        "tickPeriod": period,
        "tickCounter": counter,
        "tickStep": step,
        "vblsPerSecond": None if not step else period / step,
        "cursor": f"0x{_u32(blobs, PATH_CURSOR):06x}",
        "rates": {
            "x": {"integer": _u16(blobs, RATE_X), "fraction": _u16(blobs, RATE_X_FRAC),
                  "negative": bool(_u8(blobs, SIGN_X) & 0x80)},
            "z": {"integer": _u16(blobs, RATE_Z), "fraction": _u16(blobs, RATE_Z_FRAC),
                  "negative": bool(_u8(blobs, SIGN_Z) & 0x80)},
        },
        "driftArm": armed,
        "drift": _s32(blobs, DRIFT) if armed else 0,
        "impactFlag": f"0x{_u16(blobs, IMPACT_FLAG):04x}",
        "cometX": _s32(blobs, COMET_X),
        "cometY": _s16(blobs, COMET_Y),
        "cometZ": _s32(blobs, COMET_Z),
        "cameraX": _s32(blobs, CAMERA_X),
        "cameraY": _s32(blobs, CAMERA_Y),
        "cameraZ": _s32(blobs, CAMERA_Z),
        "occupancy": _u16(blobs, OCCUPANCY),
        "carryGate": _s16(blobs, CARRY_GATE),
        "pauseGate": _u16(blobs, PAUSE_GATE),
    }


def _readout(clock: int) -> str:
    """The panel's own HH-MM-SS of the clock's magnitude (#208)."""
    seconds = abs(clock)
    return f"{seconds // 3600:02d}-{seconds % 3600 // 60:02d}-{seconds % 60:02d}"


def reconcile(state: dict, table: list[dict], *, lookback: int = 64) -> dict:
    """Recompute the centre from the clock, and find the tick that matches exactly.

    The mover runs once a drawn frame while the clock runs once an interrupt, so
    the centre in RAM is the one a slightly earlier tick asks for. Searching back
    over `lookback` ticks — two game-seconds — for the single tick that
    reproduces both axes bit-exactly separates a wrong formula from a stale frame.
    """
    clock_low = int(state["clockLow"], 16)
    index = locate(table, clock_low)
    sampled = ticks_into_segment(table, index, clock_low, state["fraction"])
    drift = state["drift"]
    predicted_x, predicted_z = predict(table, index, clock_low, sampled, drift)
    exact = None
    for back in range(lookback + 1):
        ticks = sampled - back
        if ticks < 0:
            break
        x, z = predict(table, index, clock_low, ticks, drift)
        if x == state["cometX"] and z == state["cometZ"]:
            exact = ticks
            break
    return {
        "segment": index,
        "segmentStart": table[index]["seconds"],
        "segmentEnd": table[index + 1]["seconds"],
        "cursorExpected": table[index]["address"],
        "cursorMatches": state["cursor"] == table[index]["address"],
        "ticksIntoSegment": sampled,
        "predictedX": predicted_x,
        "predictedZ": predicted_z,
        "residualX": state["cometX"] - predicted_x,
        "residualZ": state["cometZ"] - predicted_z,
        "exactTick": exact,
        "lagTicks": None if exact is None else sampled - exact,
        "lagVbls": None if exact is None or not state["tickStep"]
        else (sampled - exact) * state["tickPeriod"] / state["tickStep"] / 32.0,
    }


def poke(address: int, value: int, size: int = 4) -> str:
    body = " ".join(f"{byte:02x}"
                    for byte in (value & ((1 << 8 * size) - 1)).to_bytes(size, "big"))
    return f"hatari-debug w ${address:x} {body}"


class Machine:
    """One booted Hatari, stopped and continued around every read and poke."""

    def __init__(self, handle, run_directory: Path):
        self.handle = handle
        self.run_directory = run_directory
        self.samples = 0

    def sample(self, *, shot: bool = True, label: str | None = None) -> dict:
        index = self.samples
        self.samples += 1
        prefix = label or f"sample{index:03d}"
        paths = {}
        commands = ["hatari-stop", "hatari-debug setopt hex"]
        for window, base, length in WINDOWS:
            path = self.run_directory / f"{prefix}-{window}.bin"
            paths[window] = path
            commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
        shot_path = None
        if shot:
            shot_path = self.run_directory / f"{prefix}.png"
            commands.append(f"hatari-debug screenshot {shot_path}")
        commands.append("hatari-cont")
        _fifo_send(self.handle, commands)
        time.sleep(0.22)
        blobs = {}
        for window, base, length in WINDOWS:
            path = paths[window]
            data = b""
            # A `savebin` occasionally lands after the continue on a loaded host,
            # so wait for the whole window rather than for the first byte of it.
            for _ in range(80):
                if path.is_file():
                    data = path.read_bytes()
                if len(data) == length:
                    break
                time.sleep(0.05)
            if len(data) != length:
                raise LabError(
                    f"sample {prefix} read {len(data)} of {length} bytes "
                    f"for window {window}")
            blobs[window] = data
        state = decode(blobs)
        state["prefix"] = prefix
        state["table"] = read_table(blobs)
        state["sha256"] = {window: _sha256(path) for window, path in paths.items()}
        if shot_path is not None and shot_path.is_file():
            state["display"] = shot_path.name
            state["sha256"]["display"] = _sha256(shot_path)
        return state

    def poke(self, *commands: str) -> None:
        _fifo_send(self.handle, ["hatari-stop", "hatari-debug setopt hex",
                                 *commands, "hatari-cont"])
        time.sleep(0.2)

    def press(self, scan: int, hold: float = 0.15) -> None:
        # Hatari reads a one-character argument as ASCII and anything longer as
        # an ST scancode, so a single-digit scancode has to be zero-padded.
        code = f"{scan:02d}"
        _fifo_send(self.handle, [f"hatari-event keydown {code}"])
        time.sleep(hold)
        _fifo_send(self.handle, [f"hatari-event keyup {code}"])
        time.sleep(0.2)


def _strip(state: dict) -> dict:
    """A sample without its copy of the table, which never changes within a run."""
    return {key: value for key, value in state.items() if key != "table"}


def sample_series(machine: Machine, *, samples: int, interval: float,
                  label: str = "sample", unpause: int | None = None) -> list[dict]:
    series = []
    for index in range(samples):
        if index:
            time.sleep(interval)
        state = machine.sample(label=f"{label}{index:03d}")
        if unpause is not None and state["pauseGate"]:
            machine.press(unpause)
            state = machine.sample(label=f"{label}{index:03d}")
        series.append(state)
    return series


def case_path(machine: Machine, *, samples: int, interval: float,
              unpause: int | None = None) -> dict:
    series = sample_series(machine, samples=samples, interval=interval,
                           unpause=unpause)
    table = series[-1]["table"]
    rows = [reconcile(state, table) for state in series]
    first, last = series[0], series[-1]
    return {
        "table": table,
        "series": [_strip(state) for state in series],
        "reconciliation": rows,
        "elapsedInterrupts": (last["interrupts"] - first["interrupts"]) & 0xFFFFFFFF,
        "clockSpan": [first["clock"], last["clock"]],
        "readoutSpan": [first["readout"], last["readout"]],
        "segmentsCrossed": sorted({row["segment"] for row in rows}),
        "exactEverywhere": all(row["exactTick"] is not None for row in rows),
        "cursorAgrees": all(row["cursorMatches"] for row in rows),
        "worstLagTicks": max((row["lagTicks"] for row in rows
                              if row["lagTicks"] is not None), default=None),
    }


def case_waypoint(machine: Machine, *, interval: float, targets: int,
                  unpause: int | None = None) -> dict:
    baseline = machine.sample(label="waypoint-baseline")
    if unpause is not None and baseline["pauseGate"]:
        machine.press(unpause)
        baseline = machine.sample(label="waypoint-baseline")
    table = baseline["table"]
    # Only ever forward: the cursor at $00782C steps on and never back, so a
    # clock poked earlier than the segment it rests on would wrap the mover's
    # unsigned elapsed word rather than rewind the comet.
    ahead = [record for record in table
             if record["seconds"] > baseline["clock"] and record["seconds"] < 0]
    if len(ahead) < 2:
        raise LabError(f"clock {baseline['clock']} leaves no authored waypoint ahead")
    stride = max(1, len(ahead) // targets)
    chosen = ahead[::stride][:targets]
    steps = []
    for record in chosen:
        machine.poke(poke(CLOCK, record["seconds"] & 0xFFFFFFFF))
        time.sleep(interval)
        state = machine.sample(label=f"waypoint-{record['index']:02d}")
        row = reconcile(state, table)
        steps.append({
            "waypoint": record,
            "poked": record["seconds"],
            "state": _strip(state),
            "reconciliation": row,
            "offX": state["cometX"] - record["x"],
            "offZ": state["cometZ"] - record["z"],
            "secondsPastWaypoint": state["clock"] - record["seconds"],
        })
    return {
        "table": table,
        "baseline": _strip(baseline),
        "steps": steps,
        "exactEverywhere": all(step["reconciliation"]["exactTick"] is not None
                               for step in steps),
    }


def case_pose(machine: Machine, *, samples: int, interval: float,
               unpause: int | None = None) -> dict:
    series = sample_series(machine, samples=samples, interval=interval,
                           label="pose", unpause=unpause)
    table = series[-1]["table"]
    first, last = series[0], series[-1]
    return {
        "table": table,
        "series": [_strip(state) for state in series],
        "reconciliation": [reconcile(state, table) for state in series],
        "occupancy": sorted({state["occupancy"] for state in series}),
        "carryGate": sorted({state["carryGate"] for state in series}),
        "carryAllowed": all(state["occupancy"] == 2 and state["carryGate"] <= 11
                            for state in series),
        "cometMoved": {"x": last["cometX"] - first["cometX"],
                       "z": last["cometZ"] - first["cometZ"]},
        "cameraMoved": {"x": last["cameraX"] - first["cameraX"],
                        "y": last["cameraY"] - first["cameraY"],
                        "z": last["cameraZ"] - first["cameraZ"]},
    }


def run(case: str, snapshot: Path, roms_root: Path | None, *, samples: int,
        interval: float, settle: float, fast_forward: bool, targets: int,
        press_first: int | None = None) -> dict:
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    if not snapshot.is_file():
        raise LabError(
            f"Snapshot not found: {snapshot}. Restricted Material is not committed; "
            "capture or rehost it first (scripts/memstate-rehost.py)."
        )

    run_directory = WORK_ROOT / _run_id(f"comet-motion-{case}")
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    parse_script = run_directory / "play.txt"
    parse_script.write_text("c\n", encoding="utf-8")

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=fast_forward,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())

    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "case": case,
        "runDirectory": str(run_directory),
        "snapshot": {"path": str(snapshot), "sha256": _sha256(snapshot.resolve())},
        "probe": {
            "path": str(Path(__file__).resolve().relative_to(REPO)),
            "sha256": _sha256(Path(__file__).resolve()),
        },
        "toolchain": toolchain,
        "fastForward": fast_forward,
        "samples": samples,
        "intervalSeconds": interval,
        "addresses": {
            "mover": "0x051e88",
            "writer": "0x051f36/0x051f3a",
            "clock": f"0x{CLOCK:06x}",
            "fine": f"0x{FINE:06x}",
            "cursor": f"0x{PATH_CURSOR:06x}",
            "table": f"0x{TABLE:06x}..0x{TABLE_END - 1:06x}",
            "cometX": f"0x{COMET_X:06x}",
            "cometZ": f"0x{COMET_Z:06x}",
        },
    }
    process = subprocess.Popen(
        command,
        stdout=(run_directory / "hatari.log").open("wb"),
        stderr=subprocess.STDOUT,
        env=env,
    )
    try:
        for _ in range(200):
            if fifo.exists():
                break
            time.sleep(0.05)
        else:
            raise LabError("Hatari did not create the command FIFO")
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            machine = Machine(handle, run_directory)
            if press_first is not None:
                machine.press(press_first)
                result["pressedFirst"] = f"0x{press_first:02x}"
            if case == "path":
                result["path"] = case_path(machine, samples=samples, interval=interval,
                                           unpause=press_first)
            elif case == "waypoint":
                result["waypoint"] = case_waypoint(machine, interval=interval,
                                                   targets=targets,
                                                   unpause=press_first)
            elif case == "pose":
                result["pose"] = case_pose(machine, samples=samples, interval=interval,
                                             unpause=press_first)
            else:
                raise LabError(f"unknown case {case}")
            _fifo_send(handle, ["hatari-stop"])
            time.sleep(0.4)
    finally:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)

    (run_directory / "result.json").write_text(
        json.dumps(result, indent=1, sort_keys=True, default=str) + "\n", encoding="utf-8")
    return result


def summarise(result: dict) -> None:
    print(f"case {result['case']}  run {Path(result['runDirectory']).name}")
    path = result.get("path") or result.get("pose")
    if path:
        series = path["series"]
        rows = path["reconciliation"]
        print(f"{'clock':>8} {'readout':>9} {'seg':>4} {'ticks':>6} "
              f"{'observed X':>12} {'observed Z':>12} {'resX':>7} {'resZ':>7} "
              f"{'lag':>4} {'cursor':>9}")
        for state, row in zip(series, rows, strict=True):
            lag = "-" if row["lagTicks"] is None else str(row["lagTicks"])
            print(f"{state['clock']:>8} {state['readout']:>9} {row['segment']:>4} "
                  f"{row['ticksIntoSegment']:>6} {state['cometX']:>12} "
                  f"{state['cometZ']:>12} {row['residualX']:>7} {row['residualZ']:>7} "
                  f"{lag:>4} {'yes' if row['cursorMatches'] else 'NO':>9}")
    if result.get("path"):
        entry = result["path"]
        print(f"segments crossed: {entry['segmentsCrossed']}")
        print(f"cursor agrees with the clock everywhere: "
              f"{'yes' if entry['cursorAgrees'] else 'NO'}")
        print(f"an exact tick reproduces both axes everywhere: "
              f"{'yes' if entry['exactEverywhere'] else 'NO'} "
              f"(worst lag {entry['worstLagTicks']} ticks of 1/32 s)")
    if result.get("pose"):
        entry = result["pose"]
        print(f"occupancy {entry['occupancy']}, carry gate $1634 {entry['carryGate']}")
        print(f"carry allowed by $051F12: {'yes' if entry['carryAllowed'] else 'no'}")
        print(f"comet moved {entry['cometMoved']}")
        print(f"camera moved {entry['cameraMoved']}")
    waypoint = result.get("waypoint")
    if waypoint:
        print(f"baseline clock {waypoint['baseline']['clock']} "
              f"({waypoint['baseline']['readout']})")
        print(f"{'poked':>8} {'waypoint X':>12} {'waypoint Z':>12} "
              f"{'observed X':>12} {'observed Z':>12} {'offX':>7} {'offZ':>7} "
              f"{'+s':>4} {'lag':>4}")
        for step in waypoint["steps"]:
            record, state, row = step["waypoint"], step["state"], step["reconciliation"]
            lag = "-" if row["lagTicks"] is None else str(row["lagTicks"])
            print(f"{step['poked']:>8} {record['x']:>12} {record['z']:>12} "
                  f"{state['cometX']:>12} {state['cometZ']:>12} "
                  f"{step['offX']:>7} {step['offZ']:>7} "
                  f"{step['secondsPastWaypoint']:>4} {lag:>4}")
        print(f"an exact tick reproduces both axes everywhere: "
              f"{'yes' if waypoint['exactEverywhere'] else 'NO'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--case", required=True, choices=["path", "waypoint", "pose"])
    parser.add_argument("--snapshot", type=Path, default=None,
                        help="memstate to boot; defaults to eris-spaceport-onfoot.sav, "
                             "or rehosted/damocles.sav for --case pose")
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--interval", type=float, default=1.0,
                        help="host seconds between samples")
    parser.add_argument("--targets", type=int, default=6,
                        help="how many authored waypoints --case waypoint pokes onto")
    parser.add_argument("--settle", type=float, default=4.0)
    parser.add_argument("--ordinary-rate", action="store_true",
                        help="run without fast-forward, at the PAL frame rate")
    parser.add_argument("--press-first", type=lambda v: int(v, 0), default=None,
                        metavar="SCANCODE",
                        help="press this ST scancode before sampling; clears a "
                             "restored pause flag ($7A26) without poking memory")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    snapshot = args.snapshot
    if snapshot is None:
        snapshot = COMET_SNAPSHOT if args.case == "pose" else DEFAULT_SNAPSHOT

    result = run(args.case, snapshot, args.roms, samples=args.samples,
                 interval=args.interval, settle=args.settle,
                 fast_forward=not args.ordinary_rate, targets=args.targets,
                 press_first=args.press_first)
    if args.json:
        print(json.dumps(result, indent=1, sort_keys=True, default=str))
    else:
        summarise(result)


if __name__ == "__main__":
    main()
