#!/usr/bin/env python3
"""Attempt an on-foot departure route from a validated arrival pose (#326).

#326 needs one on-foot capture per celestial body, and twenty-six bodies have
none. Before a capture can exist, the player has to get there, so this probe
answers the prior question on an ordinary route: **from a pose the laboratory
can restore, which craft can be walked to and boarded, and what does the game
say when it refuses?** A refusal recorded here is a route that failed. It is
not a finding that a body cannot be stood on.

Nothing is injected. Walking is the joystick-1 soft-copy byte the laboratory
already uses, boarding is a real key event, and every sample is a ``savebin``
taken while the machine is stopped.

The approach is closed loop rather than a timed stick script: each tick stops
the machine, reads the camera longwords and the target resident's own position
out of the live resident arrays, and steers. It learns the sign of the yaw
response from the machine instead of assuming it, and it gives up and says so
when the distance stops falling.

Usage (from the repository root):

  # what is within reach of the Eris pose, and how far
  python3 research/damocles-st/scripts/arrival-route-probe.py --survey

  # walk to EAGLE NINE S E (slot 3) and press B
  python3 research/damocles-st/scripts/arrival-route-probe.py --target 3 --board

  # the same for the interstellar ship the player arrives in
  python3 research/damocles-st/scripts/arrival-route-probe.py --target 7 --board

See docs/research/damocles-arrival-routes.md for the claims these runs support.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import JOYSTICK1_SOFTCOPY, LabError, validate_image  # noqa: E402
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

SCAN_BOARD, SCAN_LEAVE = 0x30, 0x26  # ST scancodes for B and L
SCAN_DIGIT = {1: 0x02, 2: 0x03, 3: 0x04, 4: 0x05, 5: 0x06,
              6: 0x07, 7: 0x08, 8: 0x09, 9: 0x0A}  # craft speed keys

STICK_STOP, STICK_FORWARD = 0x00, 0x01
STICK_LEFT, STICK_RIGHT = 0x04, 0x08

# Camera, occupancy and message words, as established in
# docs/research/damocles-walk-board-flight.md and
# docs/research/damocles-message-reveal.md.
CAMERA_X, CAMERA_Y, CAMERA_Z = 0x7A92, 0x7A96, 0x7A9A
CAMERA_YAW = 0x7AA2
ON_FOOT = 0x7A8E
BOARDED_SLOT = 0x7AB0
BODY_SELECTOR = 0x7AA8
MESSAGE_GATE = 0x7BA0
MESSAGE_POINTER = 0x7B98

# Resident object arrays, as established in docs/research/damocles-resident-objects.md.
RESIDENT_X, RESIDENT_Y, RESIDENT_Z = 0x63A8, 0x67A8, 0x6BA8
RESIDENT_A, RESIDENT_B = 0x6FA8, 0x73A8
RESIDENT_HEADING = 0x77A8

# System string bank region 1, as established in docs/research/damocles-script-strings.md.
STRING_TABLE = 0x070000
STRING_SLOTS = 64
STRING_POOL, STRING_POOL_END = 0x072D2E, 0x07336F

CELL_UNITS = 65536
YAW_MASK = 0x03FF
YAW_NORTH = 512
YAW_UNITS_PER_TURN = 1024

WINDOWS = (
    ("low", 0x006000, 0x2000),
    ("strings", STRING_TABLE, 0x0080),
    ("pool", STRING_POOL & ~0xF, ((STRING_POOL_END - STRING_POOL) + 0x2F) & ~0xF),
)

# Craft slots and the board gate's own constants, read from the pinned image at
# $054310-$0542FC. d1 is the resident array offset, so four times the slot.
CRAFT_SLOTS = (1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13)
BOARD_GATE = 0x054310


def _u16(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 2], "big")


def _u32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big")


def _s32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big", signed=True)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resident(low: bytes, slot: int) -> dict:
    offset = slot * 4
    association_a = _u32(low, 0x6000, RESIDENT_A + offset)
    return {
        "slot": slot,
        "x": _s32(low, 0x6000, RESIDENT_X + offset),
        "y": _s32(low, 0x6000, RESIDENT_Y + offset),
        "z": _s32(low, 0x6000, RESIDENT_Z + offset),
        "associationA": f"0x{association_a:08x}",
        "associationB": f"0x{_u32(low, 0x6000, RESIDENT_B + offset):08x}",
        "handling": f"0x{(association_a >> 8) & 0xFF:02x}",
        "heading": low[RESIDENT_HEADING - 0x6000 + slot],
    }


def decode_message(blobs: dict[str, bytes]) -> dict | None:
    """Resolve the live message pointer to the system-string record it is inside.

    ``$7B98`` is an absolute address that advances through the record as the
    message reveals, so the pointer at an arbitrary sample is usually part-way
    in. The record is therefore the table entry with the greatest address at or
    below the pointer, and the slots reported are every table slot naming it.
    """
    low, table, pool = blobs["low"], blobs["strings"], blobs["pool"]
    pointer = _u32(low, 0x6000, MESSAGE_POINTER)
    if not pointer:
        return None
    records: dict[int, list[int]] = {}
    for slot in range(STRING_SLOTS):
        address = STRING_TABLE + _u16(table, STRING_TABLE, STRING_TABLE + slot * 2)
        records.setdefault(address, []).append(slot)
    starts = sorted(address for address in records if address <= pointer)
    start = starts[-1] if starts else None
    pool_base = STRING_POOL & ~0xF
    text = None
    if start is not None and pool_base <= start < pool_base + len(pool):
        text = pool[start - pool_base :].split(b"\x00", 1)[0].decode("ascii", "replace")
    return {
        "pointer": f"0x{pointer:08x}",
        "recordAddress": None if start is None else f"0x{start:06x}",
        "revealedCharacters": None if start is None else pointer - start,
        "slots": records.get(start, []) if start is not None else [],
        "text": text,
    }


def decode(blobs: dict[str, bytes], watch: tuple[int, ...]) -> dict:
    low = blobs["low"]
    base = 0x6000
    yaw = _u16(low, base, CAMERA_YAW)
    state = {
        "x": _s32(low, base, CAMERA_X),
        "y": _s32(low, base, CAMERA_Y),
        "z": _s32(low, base, CAMERA_Z),
        "yaw": yaw,
        "bearing": round(((yaw & YAW_MASK) - YAW_NORTH) % YAW_UNITS_PER_TURN
                         / YAW_UNITS_PER_TURN * 360, 2),
        "onFoot": _u16(low, base, ON_FOOT),
        "boardedSlot": f"0x{_u16(low, base, BOARDED_SLOT):04x}",
        "bodySelector": f"0x{_u16(low, base, BODY_SELECTOR):04x}",
        "messageGate": f"0x{_u16(low, base, MESSAGE_GATE):04x}",
        "message": decode_message(blobs),
        "residents": {str(slot): resident(low, slot) for slot in watch},
    }
    return state


def heading_to(state: dict, target: dict) -> int:
    """Yaw the player would need to face the target, in raw yaw units."""
    dx = target["x"] - state["x"]
    dz = target["z"] - state["z"]
    angle = math.atan2(dx, dz) / (2 * math.pi) * YAW_UNITS_PER_TURN
    return int(round(YAW_NORTH + angle)) % YAW_UNITS_PER_TURN


def yaw_error(state: dict, target: dict) -> int:
    """Signed shortest turn, in yaw units, from the current facing to the target."""
    error = (heading_to(state, target) - (state["yaw"] & YAW_MASK)) % YAW_UNITS_PER_TURN
    return error - YAW_UNITS_PER_TURN if error > YAW_UNITS_PER_TURN // 2 else error


def distance(state: dict, target: dict) -> int:
    return max(abs(target["x"] - state["x"]), abs(target["z"] - state["z"]))


class Machine:
    """One booted Hatari, stopped and continued around every read and poke."""

    def __init__(self, handle, run_directory: Path, watch: tuple[int, ...]):
        self.handle = handle
        self.run_directory = run_directory
        self.watch = watch
        self.samples = 0

    def sample(self, *, shot: bool = False, keep: bool = False) -> dict:
        index = self.samples
        self.samples += 1
        prefix = f"sample{index:03d}" if keep else "tick"
        paths = {}
        commands = ["hatari-stop", "hatari-debug setopt hex"]
        for label, base, length in WINDOWS:
            path = self.run_directory / f"{prefix}-{label}.bin"
            paths[label] = path
            commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
        if shot:
            commands.append(f"hatari-debug screenshot {self.run_directory}/{prefix}.png")
        commands.append("hatari-cont")
        _fifo_send(self.handle, commands)
        time.sleep(0.22)
        blobs = {}
        for label, path in paths.items():
            data = path.read_bytes()
            if not data:
                raise LabError(f"sample {index} read nothing for window {label}")
            blobs[label] = data
        state = decode(blobs, self.watch)
        if keep:
            state["sha256"] = {label: _sha256(path) for label, path in paths.items()}
        return state

    def stick(self, byte: int) -> None:
        _fifo_send(self.handle, [
            "hatari-stop",
            "hatari-debug setopt hex",
            f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {byte:02x}",
            "hatari-cont",
        ])

    def press(self, scan: int, hold: float = 0.15) -> None:
        _fifo_send(self.handle, [f"hatari-event keydown {scan}"])
        time.sleep(hold)
        _fifo_send(self.handle, [f"hatari-event keyup {scan}"])


def approach(machine: Machine, slot: int, *, tolerance: int, ticks: int,
             burst: float, yaw_tolerance: int) -> dict:
    """Closed-loop walk toward a resident, learning the machine's responses.

    Neither the walking rate nor the sign of the yaw response is assumed. Each
    forward and turning hold measures what it produced, and the next hold is
    sized from that measurement, so the same controller works on foot at the
    laboratory's fast-forward rate and at the ordinary one.
    """
    log: list[dict] = []
    turn_sign = 1  # +1 means STICK_RIGHT raises the yaw word; corrected on the way
    learned = False
    walk_rate: float | None = None  # source units per second of forward hold
    turn_rate: float | None = None  # yaw units per second of turning hold
    state = machine.sample()
    target = state["residents"][str(slot)]
    best = distance(state, target)
    stalled = 0
    detours = 0
    outcome = "tolerance"
    for tick in range(ticks):
        previous = state
        state = machine.sample()
        target = state["residents"][str(slot)]
        gap = distance(state, target)
        error = yaw_error(state, target)
        entry = {
            "tick": tick,
            "x": state["x"], "z": state["z"], "yaw": state["yaw"],
            "distance": gap, "yawError": error,
            "targetX": target["x"], "targetZ": target["z"],
        }
        log.append(entry)
        if gap <= tolerance:
            outcome = "arrived"
            break
        if gap < best - CELL_UNITS // 64:
            best, stalled, detours = gap, 0, 0
        else:
            stalled += 1
            if stalled >= 8:
                # Not closing on the target. Something is in the way, and a
                # blocked walk must not be reported as a refusal, so try to go
                # round: face progressively further off the direct bearing,
                # alternating sides, and walk a fixed leg before re-aiming.
                detours += 1
                if detours > 6:
                    outcome = "blocked"
                    break
                offset = (128 * ((detours + 1) // 2)) * (1 if detours % 2 else -1)
                entry["detour"] = offset
                error = ((error + offset + YAW_UNITS_PER_TURN // 2) % YAW_UNITS_PER_TURN
                         - YAW_UNITS_PER_TURN // 2)
                stalled = 0

        if abs(error) > yaw_tolerance:
            before = state["yaw"] & YAW_MASK
            hold = burst if turn_rate is None else min(
                burst * 4, max(burst / 4, abs(error) * 0.8 / turn_rate))
            machine.stick(STICK_RIGHT if (error > 0) == (turn_sign > 0) else STICK_LEFT)
            time.sleep(hold)
            machine.stick(STICK_STOP)
            after = machine.sample()["yaw"] & YAW_MASK
            delta = ((after - before + YAW_UNITS_PER_TURN // 2) % YAW_UNITS_PER_TURN
                     - YAW_UNITS_PER_TURN // 2)
            entry["turnHold"] = round(hold, 3)
            entry["yawResponse"] = delta
            if delta:
                if not learned and (delta > 0) != (error > 0):
                    # The stick was chosen for a positive response; if the yaw
                    # moved the other way, remember that for the whole run.
                    turn_sign = -turn_sign
                learned = True
                turn_rate = abs(delta) / hold if turn_rate is None else (
                    0.5 * turn_rate + 0.5 * abs(delta) / hold)
            continue

        hold = burst * 3 if walk_rate is None else min(
            burst * 20, max(burst, (gap - tolerance) * 0.6 / walk_rate))
        machine.stick(STICK_FORWARD)
        time.sleep(hold)
        machine.stick(STICK_STOP)
        entry["walkHold"] = round(hold, 3)
        moved = max(abs(state["x"] - previous["x"]), abs(state["z"] - previous["z"]))
        if previous.get("walkHold") and moved:
            rate = moved / previous["walkHold"]
            walk_rate = rate if walk_rate is None else 0.5 * walk_rate + 0.5 * rate
        state["walkHold"] = hold
    else:
        outcome = "exhausted"
    machine.stick(STICK_STOP)
    return {"slot": slot, "outcome": outcome, "ticks": log, "turnSign": turn_sign,
            "detours": detours,
            "yawResponseLearned": learned,
            "walkRate": None if walk_rate is None else round(walk_rate, 1),
            "turnRate": None if turn_rate is None else round(turn_rate, 1)}


def fly(machine: Machine, *, speed: int, seconds: float, stick: int) -> dict:
    """Hold a speed key and a stick byte after boarding, and log the telemetry.

    Purely observational: it reports where the craft went, not how to fly one.
    Flight itself belongs to vehicle travel, which #313 keeps out of scope; this
    exists so a route attempt can say whether the craft left the ground.
    """
    machine.press(SCAN_DIGIT[speed])
    time.sleep(0.4)
    machine.stick(stick)
    log = []
    started = time.monotonic()
    while time.monotonic() - started < seconds:
        state = machine.sample()
        log.append({
            "t": round(time.monotonic() - started, 2),
            "x": state["x"], "y": state["y"], "z": state["z"],
            "yaw": state["yaw"], "onFoot": state["onFoot"],
            "boardedSlot": state["boardedSlot"],
            "bodySelector": state["bodySelector"],
        })
        time.sleep(1.0)
    machine.stick(STICK_STOP)
    return {"speedKey": speed, "stick": f"0x{stick:02x}", "seconds": seconds, "telemetry": log}


def survey(machine: Machine) -> dict:
    state = machine.sample(keep=True, shot=True)
    rows = []
    selector = int(state["bodySelector"], 16)
    for slot in CRAFT_SLOTS:
        target = state["residents"][str(slot)]
        # Association B's first byte is four times the body index, the same
        # encoding the body selector uses, so a craft is on this body only when
        # the two agree. Distances to any other craft are across bodies and
        # mean nothing on the ground.
        body_byte = int(target["associationB"], 16) >> 24
        rows.append({
            **target,
            "bodyByte": f"0x{body_byte:02x}",
            "onThisBody": body_byte == selector,
            "distance": distance(state, target),
            "distanceCells": round(distance(state, target) / CELL_UNITS, 3),
            "bearing": round(((heading_to(state, target) - YAW_NORTH) % YAW_UNITS_PER_TURN)
                             / YAW_UNITS_PER_TURN * 360, 2),
        })
    rows.sort(key=lambda row: row["distance"])
    return {"pose": state, "craft": rows}


def run(snapshot: Path, roms_root: Path | None, *, target: int | None, board: bool,
        survey_only: bool, settle: float, ticks: int, burst: float,
        tolerance: int, yaw_tolerance: int, fast_forward: bool,
        fly_seconds: float = 0.0, speed: int = 9, fly_stick: int = STICK_STOP) -> dict:
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

    label = "survey" if survey_only else f"slot{target}"
    run_directory = WORK_ROOT / _run_id(f"arrival-route-{label}")
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

    watch = tuple(sorted(set(CRAFT_SLOTS) | ({target} if target is not None else set())))
    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "runDirectory": str(run_directory),
        "snapshot": {"path": str(snapshot), "sha256": _sha256(snapshot)},
        "probe": {
            "path": str(Path(__file__).resolve().relative_to(REPO)),
            "sha256": _sha256(Path(__file__).resolve()),
        },
        "toolchain": toolchain,
        "boardGate": f"0x{BOARD_GATE:06x}",
        "fastForward": fast_forward,
        "target": target,
        "boardAttempted": board,
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
            machine = Machine(handle, run_directory, watch)
            result["survey"] = survey(machine)
            if not survey_only:
                result["approach"] = approach(
                    machine, target, tolerance=tolerance, ticks=ticks,
                    burst=burst, yaw_tolerance=yaw_tolerance,
                )
                result["afterApproach"] = machine.sample(keep=True, shot=True)
                if board:
                    machine.press(SCAN_BOARD)
                    time.sleep(1.5)
                    result["afterBoard"] = machine.sample(keep=True, shot=True)
                    if fly_seconds and result["afterBoard"]["onFoot"] == 0:
                        result["flight"] = fly(machine, speed=speed,
                                               seconds=fly_seconds, stick=fly_stick)
                        result["afterFlight"] = machine.sample(keep=True, shot=True)
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


def summarise_flight(result: dict) -> None:
    flight = result.get("flight")
    if not flight:
        return
    print(f"flight: speed key {flight['speedKey']}, stick {flight['stick']}")
    for row in flight["telemetry"]:
        print(f"  t+{row['t']:5.1f}s body {row['bodySelector']} craft {row['boardedSlot']} "
              f"onFoot={row['onFoot']} y={row['y']:>12} x={row['x']:>12} z={row['z']:>12}")


def summarise(result: dict) -> None:
    pose = result["survey"]["pose"]
    print(f"run: {Path(result['runDirectory']).name}")
    print(f"pose: body {pose['bodySelector']} onFoot={pose['onFoot']} "
          f"at ({pose['x']}, {pose['y']}, {pose['z']}) yaw 0x{pose['yaw']:04x}")
    print("craft within the live resident arrays, nearest first:")
    for row in result["survey"]["craft"]:
        here = "here" if row["onThisBody"] else "elsewhere"
        print(f"  slot {row['slot']:>3}  {row['distanceCells']:>10.3f} cells  "
              f"bearing {row['bearing']:>6.2f}deg  handling {row['handling']}  "
              f"body {row['bodyByte']} ({here})")
    approach_result = result.get("approach")
    if approach_result:
        ticks = approach_result["ticks"]
        first, last = (ticks[0], ticks[-1]) if ticks else ({}, {})
        print(f"approach slot {approach_result['slot']}: {approach_result['outcome']} "
              f"after {len(ticks)} ticks, "
              f"{first.get('distance')} -> {last.get('distance')} units "
              f"(walk {approach_result['walkRate']} units/s, "
              f"turn {approach_result['turnRate']} yaw/s)")
    after = result.get("afterBoard")
    if after:
        message = after["message"] or {}
        print(f"board: onFoot={after['onFoot']} boardedSlot={after['boardedSlot']} "
              f"gate={after['messageGate']}")
        print(f"       message slots {message.get('slots')}: {message.get('text')!r}")
        print(f"       record {message.get('recordAddress')}, "
              f"{message.get('revealedCharacters')} characters revealed")
    summarise_flight(result)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT,
                        help="memstate to boot; defaults to eris-spaceport-onfoot.sav")
    parser.add_argument("--target", type=int, default=None,
                        help="resident slot to walk to")
    parser.add_argument("--board", action="store_true",
                        help="press B once the approach has finished")
    parser.add_argument("--survey", action="store_true",
                        help="report the craft distances from the pose and stop")
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--settle", type=float, default=3.0)
    parser.add_argument("--ticks", type=int, default=400,
                        help="maximum closed-loop control ticks")
    parser.add_argument("--burst", type=float, default=0.25,
                        help="seconds the stick is held per control tick")
    parser.add_argument("--tolerance", type=int, default=CELL_UNITS // 4,
                        help="arrival distance in source units")
    parser.add_argument("--yaw-tolerance", type=int, default=24,
                        help="facing tolerance in raw yaw units")
    parser.add_argument("--fly", type=float, default=0.0, metavar="SECONDS",
                        help="after boarding, hold a speed key and log telemetry")
    parser.add_argument("--speed", type=int, default=9, choices=sorted(SCAN_DIGIT),
                        help="craft speed key pressed for --fly")
    parser.add_argument("--fly-stick", type=lambda v: int(v, 0), default=STICK_STOP,
                        help="stick byte held during --fly (0x01 up, 0x02 down)")
    parser.add_argument("--ordinary-rate", action="store_true",
                        help="run without fast-forward, at the PAL frame rate")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if not args.survey and args.target is None:
        parser.error("give --target SLOT, or --survey")

    result = run(
        args.snapshot, args.roms, target=args.target, board=args.board,
        survey_only=args.survey, settle=args.settle, ticks=args.ticks,
        burst=args.burst, tolerance=args.tolerance, yaw_tolerance=args.yaw_tolerance,
        fast_forward=not args.ordinary_rate,
        fly_seconds=args.fly, speed=args.speed, fly_stick=args.fly_stick,
    )
    if args.json:
        print(json.dumps(result, indent=1, sort_keys=True, default=str))
    else:
        summarise(result)


if __name__ == "__main__":
    try:
        main()
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
