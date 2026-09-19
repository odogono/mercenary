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
SYSTEM_PAYLOAD = REPO / "payload" / "damocles" / "system.json"
POSES_PAYLOAD = REPO / "payload" / "damocles" / "arrival-poses.json"
WORK_ROOT = LAB_ROOT / "work"
SNAPSHOTS = LAB_ROOT / "snapshots"
DEFAULT_SNAPSHOT = SNAPSHOTS / "eris-spaceport-onfoot.sav"

SCAN_BOARD, SCAN_LEAVE = 0x30, 0x26  # ST scancodes for B and L
SCAN_LAUNCH = 0x01  # Esc: the space-launch handler at $055822
SCAN_SLOWER, SCAN_FASTER = 0x0C, 0x0D  # the two throttle-scaling keys at $05575E

# Measured space speed per digit key, in source units per second: the throttle
# word doubles the speed per step, from $7BAC = 4 at key 1.
SPACE_UNITS_PER_SECOND = {key: 12000 * 2 ** (key - 1) for key in range(1, 10)}
SCAN_DIGIT = {1: 0x02, 2: 0x03, 3: 0x04, 4: 0x05, 5: 0x06,
              6: 0x07, 7: 0x08, 8: 0x09, 9: 0x0A}  # craft speed keys

STICK_STOP, STICK_FORWARD = 0x00, 0x01
STICK_LEFT, STICK_RIGHT = 0x04, 0x08
STICK_BACK = 0x02  # nose up in a craft; the surface walk never uses it

# Camera, occupancy and message words, as established in
# docs/research/damocles-walk-board-flight.md and
# docs/research/damocles-message-reveal.md.
CAMERA_X, CAMERA_Y, CAMERA_Z = 0x7A92, 0x7A96, 0x7A9A
# While boarded the craft's own position is the twin set the board routine
# fills at $054374 from the resident arrays.
CRAFT_X, CRAFT_Y, CRAFT_Z = 0x7AB2, 0x7AB6, 0x7ABA
CAMERA_YAW = 0x7AA2
ON_FOOT = 0x7A8E
BOARDED_SLOT = 0x7AB0
BODY_SELECTOR = 0x7AA8
MESSAGE_GATE = 0x7BA0
MESSAGE_POINTER = 0x7B98

# Craft control words. $7BAC is the throttle longword the key dispatcher writes
# at $0556F8 from a scancode-indexed table at $0557D6; boarding presets it to
# $FF001000 at $054744.
THROTTLE = 0x7BAC
GROUND_CONTACT = 0x7ACA
REGION_FLAGS = 0x7B34
KEY_WORD = 0x7B60    # the dispatcher's own copy of the last scancode ($0555D8)
CELL = 0x7B5C        # current workspace cell
TRANSPORTER_MODE = 0x7882  # the transporter the player is standing in ($053950)
NAV_TARGET = 0x7922  # the body the panel names under NAVIGATION ($04DC0C)
ARRIVAL_FLAG = 0x7A28  # non-zero runs the landing routine at $059268
PITCH = 0x7AC0       # second view angle, masked to ten bits at $057FD2
OCCUPANCY = 0x7AAE   # 1 on foot, 0 boarded, 2 in space ($05586C)
ALTITUDE = 0x7A30    # the word $05976A tests against $1F0 before entering space

# Resident object arrays, as established in docs/research/damocles-resident-objects.md.
RESIDENT_X, RESIDENT_Y, RESIDENT_Z = 0x63A8, 0x67A8, 0x6BA8
RESIDENT_A, RESIDENT_B = 0x6FA8, 0x73A8
RESIDENT_HEADING = 0x77A8

# System string bank region 1, as established in docs/research/damocles-script-strings.md.
STRING_TABLE = 0x070000
STRING_SLOTS = 64
STRING_POOL, STRING_POOL_END = 0x072D2E, 0x07336F

CLIMB_PITCH = 0x01B0  # nose up about twenty-two degrees while leaving a surface
ROUND_TRIP = 1200  # source units to swing round a cube to reach its far face
STANDOFF = 12000  # source units beyond the target, away from its nearest neighbour

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
# The transporter ring: $059130 steps the selector by four between $100 and
# $124, so slots 64 to 73 inclusive, wrapping at both ends.
TRANSPORTER_SLOTS = tuple(range(64, 74))
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
        "craftX": _s32(low, base, CRAFT_X),
        "craftY": _s32(low, base, CRAFT_Y),
        "craftZ": _s32(low, base, CRAFT_Z),
        "throttle": f"0x{_u32(low, base, THROTTLE):08x}",
        "groundContact": _u16(low, base, GROUND_CONTACT),
        "occupancy": _u16(low, base, OCCUPANCY),
        "pitch": _u16(low, base, PITCH),
        "navTarget": f"0x{_u16(low, base, NAV_TARGET):04x}",
        "cell": f"0x{_u16(low, base, CELL):04x}",
        "transporterMode": f"0x{_u16(low, base, TRANSPORTER_MODE):04x}",
        "arrivalFlag": _u16(low, base, ARRIVAL_FLAG),
        "keyWord": f"0x{_u16(low, base, KEY_WORD):04x}",
        "altitude": _u16(low, base, ALTITUDE),
        "regionFlags": f"0x{_u16(low, base, REGION_FLAGS):04x}",
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
        self.strings: dict[str, bytes] | None = None

    def sample(self, *, shot: bool = False, keep: bool = False,
               full: bool = False) -> dict:
        index = self.samples
        self.samples += 1
        prefix = f"sample{index:03d}" if keep else "tick"
        paths = {}
        commands = ["hatari-stop", "hatari-debug setopt hex"]
        # A control loop only needs the state window; the string table and pool
        # never change, so re-reading them every tick is pure latency.
        windows = WINDOWS if (full or keep or self.strings is None) else WINDOWS[:1]
        for label, base, length in windows:
            path = self.run_directory / f"{prefix}-{label}.bin"
            paths[label] = path
            commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
        if shot:
            commands.append(f"hatari-debug screenshot {self.run_directory}/{prefix}.png")
        commands.append("hatari-cont")
        _fifo_send(self.handle, commands)
        time.sleep(0.22)
        blobs = dict(self.strings or {})
        for label, path in paths.items():
            # savebin writes while the machine is stopped; a fast sampling loop
            # can look before the file lands, so wait for it rather than failing.
            data = b""
            for _ in range(8):
                if path.is_file():
                    data = path.read_bytes()
                if data:
                    break
                time.sleep(0.05)
            if not data:
                # A wedged emulator never lands the file. Fail loudly rather
                # than spinning: every caller is a timed control loop.
                raise LabError(f"sample {index} read nothing for window {label}")
            blobs[label] = data
        if self.strings is None:
            self.strings = {label: blobs[label] for label in ("strings", "pool")}
        state = decode(blobs, self.watch)
        if keep:
            state["sha256"] = {label: _sha256(path) for label, path in paths.items()}
        return state

    def watch_program_counters(self, addresses: tuple[int, ...]) -> tuple[int, ...]:
        """Arm a tracing breakpoint per address.

        ``:trace`` prints the hit and continues, so the machine keeps running —
        which is what tells a key that never reached a handler from a handler
        that ran and was overruled. Hits are counted afterwards from the
        emulator's own log.
        """
        for address in addresses:
            _fifo_send(self.handle, [
                "hatari-stop",
                f"hatari-debug b pc = ${address:x} :trace",
                "hatari-cont",
            ])
        return addresses

    def fast_forward(self, enabled: bool) -> None:
        """Switch the emulator's fast-forward at runtime.

        Aiming needs the ordinary frame rate — the craft turns about ten
        thousand yaw units a second under fast-forward, far past any bearing a
        control loop can hold — while climbing to the launch altitude needs the
        fast rate to finish in reasonable host time.
        """
        _fifo_send(self.handle, [
            "hatari-stop",
            f"hatari-debug setopt --fast-forward {'on' if enabled else 'off'}",
            "hatari-cont",
        ])
        time.sleep(0.2)

    def stick(self, byte: int) -> None:
        _fifo_send(self.handle, [
            "hatari-stop",
            "hatari-debug setopt hex",
            f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {byte:02x}",
            "hatari-cont",
        ])

    def press(self, scan: int, hold: float = 0.15) -> None:
        # Hatari reads a one-character argument as ASCII and anything longer as
        # an ST scancode, so a single-digit scancode has to be zero-padded or
        # Esc ($01) arrives as the "1" key ($02).
        code = f"{scan:02d}"
        _fifo_send(self.handle, [f"hatari-event keydown {code}"])
        time.sleep(hold)
        _fifo_send(self.handle, [f"hatari-event keyup {code}"])


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


def fly(machine: Machine, *, speed: int, seconds: float, stick: int,
        keys: tuple[int, ...] = (), watch_pcs: tuple[int, ...] = (),
        hold_throttle: bool = False) -> dict:
    """Hold a speed key and a stick byte after boarding, and log the telemetry.

    Purely observational: it reports where the craft went, not how to fly one.
    Flight itself belongs to vehicle travel, which #313 keeps out of scope; this
    exists so a route attempt can say whether the craft left the ground.
    """
    machine.watch_program_counters(watch_pcs)
    log = []
    started = time.monotonic()
    for scan in (keys if keys else () if speed == 0 else (SCAN_DIGIT[speed],)):
        machine.press(scan)
        time.sleep(0.2)
    machine.stick(stick)
    interval = 0.15 if seconds <= 5 else 1.0
    while time.monotonic() - started < seconds:
        if hold_throttle and speed:
            # The collision response at $059750 forces the throttle to $FFF0
            # every time a move is refused, so a single press does not survive
            # contact. Re-apply it each tick to tell "refused" from "unset".
            machine.press(SCAN_DIGIT[speed])
        state = machine.sample()
        log.append({
            "t": round(time.monotonic() - started, 2),
            "x": state["x"], "y": state["y"], "z": state["z"],
            "yaw": state["yaw"], "onFoot": state["onFoot"],
            "boardedSlot": state["boardedSlot"],
            "bodySelector": state["bodySelector"],
            "craftX": state["craftX"], "craftY": state["craftY"],
            "craftZ": state["craftZ"],
            "throttle": state["throttle"],
            "groundContact": state["groundContact"],
        })
        time.sleep(interval)
    machine.stick(STICK_STOP)
    return {"watched": [f"0x{address:06x}" for address in watch_pcs], "speedKey": speed, "keys": [f"0x{k:02x}" for k in keys],
            "stick": f"0x{stick:02x}", "seconds": seconds, "telemetry": log}


def system_heading(origin: dict, target: dict) -> tuple[int, int]:
    """Yaw and pitch, in raw words, from one body centre toward another.

    While the craft is still in the atmosphere its position longwords are
    body-local surface coordinates, not system coordinates, so a heading cannot
    be taken from them. The launch body's own centre is the origin instead, and
    the surface axes are the system axes.
    """
    delta = [target["position"][axis] - origin["position"][axis] for axis in "xyz"]
    flat = math.hypot(delta[0], delta[2])
    yaw = int(round(YAW_NORTH + math.atan2(delta[0], delta[2])
                    / (2 * math.pi) * YAW_UNITS_PER_TURN)) % YAW_UNITS_PER_TURN
    pitch = int(round(YAW_NORTH - math.atan2(delta[1], flat)
                      / (2 * math.pi) * YAW_UNITS_PER_TURN)) % YAW_UNITS_PER_TURN
    return yaw, pitch


def aim(machine: Machine, want_yaw: int, want_pitch: int, *, seconds: float,
        tolerance: int = 12, speed: int = 0) -> dict:
    """Turn the craft onto a heading before launching.

    The navigation target is whatever body the renderer finds nearest
    ($052E90 keeps the minimum, $052FCA publishes it after the fifty-frame hold
    $05586C sets), so the destination follows from where the craft is pointed.
    """
    log = []
    started = time.monotonic()
    aligned = False
    while time.monotonic() - started < seconds:
        if speed:
            # Turning costs height, and the launch handler refuses a craft that
            # has settled back onto the ground, so keep the climb alive.
            machine.press(SCAN_DIGIT[speed], hold=0.05)
        state = machine.sample()
        yaw_error = ((want_yaw - (state["yaw"] & YAW_MASK)) % YAW_UNITS_PER_TURN)
        yaw_error -= YAW_UNITS_PER_TURN if yaw_error > YAW_UNITS_PER_TURN // 2 else 0
        pitch_error = ((want_pitch - (state["pitch"] & YAW_MASK)) % YAW_UNITS_PER_TURN)
        pitch_error -= YAW_UNITS_PER_TURN if pitch_error > YAW_UNITS_PER_TURN // 2 else 0
        log.append({"t": round(time.monotonic() - started, 2),
                    "yaw": state["yaw"], "pitch": state["pitch"],
                    "yawError": yaw_error, "pitchError": pitch_error})
        if abs(yaw_error) <= tolerance and abs(pitch_error) <= tolerance:
            aligned = True
            break
        if abs(yaw_error) > tolerance:
            machine.stick(STICK_RIGHT if yaw_error > 0 else STICK_LEFT)
            time.sleep(min(0.35, max(0.02, abs(yaw_error) / 700)))
        else:
            machine.stick(STICK_FORWARD if pitch_error > 0 else STICK_BACK)
            time.sleep(min(0.35, max(0.02, abs(pitch_error) / 700)))
        machine.stick(STICK_STOP)
    machine.stick(STICK_STOP)
    return {"aligned": aligned, "wantYaw": want_yaw, "wantPitch": want_pitch, "ticks": log}


def depart(machine: Machine, *, speed: int, climb_seconds: float,
           space_seconds: float, run_directory: Path,
           watch_pcs: tuple[int, ...] = (),
           plan: tuple[tuple[int, float], ...] = (), space_speed: int = 0,
           aim_heading: tuple[int, int] | None = None, aim_seconds: float = 25.0) -> dict:
    """Lift a boarded craft off the ground, then ask it to launch.

    The launch handler at $055822 refuses while $7ACA still reads ground
    contact, so the climb has to come first. The throttle is re-pressed each
    tick because the collision response at $059750 forces it back the moment a
    move is refused.
    """
    machine.watch_program_counters(watch_pcs)
    climb = []
    started = time.monotonic()
    airborne = False
    clear = 0
    while time.monotonic() - started < climb_seconds:
        machine.press(SCAN_DIGIT[speed])
        state = machine.sample()
        # Hold the nose up. Level and under power the craft flies into whatever
        # is in front of it — the Vesta pose is parked among structures — and a
        # destroyed craft puts the player back on foot with no launch.
        if (state["pitch"] & YAW_MASK) > CLIMB_PITCH:
            machine.stick(STICK_BACK)
            time.sleep(0.15)
            machine.stick(STICK_STOP)
        climb.append({
            "t": round(time.monotonic() - started, 2),
            "groundContact": state["groundContact"],
            "occupancy": state["occupancy"], "altitude": state["altitude"],
            "throttle": state["throttle"], "craftY": state["craftY"],
            "craftX": state["craftX"], "craftZ": state["craftZ"],
        })
        # One sample of zero ground contact is a bounce, not a climb: the
        # launch handler re-reads $7ACA and refuses if the craft has settled.
        # Require height as well, and hold it.
        if state["groundContact"] == 0 and state["craftY"] > 2000:
            clear += 1
            if clear >= 3:
                airborne = True
                break
        else:
            clear = 0
        time.sleep(0.2)
    launched = None
    aimed = None
    reached_space = False
    if airborne and aim_heading is not None:
        aimed = aim(machine, aim_heading[0], aim_heading[1], seconds=aim_seconds,
                    speed=speed)
        # Re-establish the climb before asking to launch.
        settled = time.monotonic()
        while time.monotonic() - settled < 20:
            machine.press(SCAN_DIGIT[speed], hold=0.05)
            state = machine.sample()
            if state["groundContact"] == 0 and state["craftY"] > 4000:
                break
            time.sleep(0.2)
    if airborne:
        machine.press(SCAN_LAUNCH)
        if space_speed:
            # The launch handler commands $7BAC = $000E, faster than any digit,
            # so the throttle has to come down at once or the craft crosses the
            # system before the first sample.
            machine.press(SCAN_DIGIT[space_speed], hold=0.05)
        # The launch is accepted at $055844, but occupancy only becomes 2 at
        # $05586C, once the climb has carried $7A30 past $01F0. Hold the throttle
        # and wait for that rather than assuming the craft is already in space.
        reached_space = False
        waited = time.monotonic()
        while time.monotonic() - waited < space_seconds:
            # Keep the climb throttle: the transition needs $7A30 past $01F0,
            # which is tens of seconds of guest time. Sampling stops the
            # machine, so sample rarely here and let it fly.
            machine.press(SCAN_DIGIT[speed], hold=0.05)
            state = machine.sample()
            if (state["pitch"] & YAW_MASK) > CLIMB_PITCH:
                machine.stick(STICK_BACK)
                time.sleep(0.15)
                machine.stick(STICK_STOP)
            time.sleep(5.0)
            state = machine.sample()
            if state["occupancy"] == 2:
                reached_space = True
                if space_speed:
                    machine.press(SCAN_DIGIT[space_speed], hold=0.05)
                break
        launched = []
        legs = plan or ((STICK_STOP, 2.0),)
        for stick, leg_seconds in legs:
            machine.stick(stick)
            started = time.monotonic()
            while time.monotonic() - started < leg_seconds:
                state = machine.sample()
                launched.append({
                    "t": round(time.monotonic() - started, 2),
                    "stick": f"0x{stick:02x}",
                    "occupancy": state["occupancy"], "altitude": state["altitude"],
                    "navTarget": state["navTarget"], "arrivalFlag": state["arrivalFlag"],
                    "keyWord": state["keyWord"], "yaw": state["yaw"],
                    "pitch": state["pitch"],
                    "bodySelector": state["bodySelector"], "throttle": state["throttle"],
                    "craftX": state["craftX"], "craftY": state["craftY"],
                    "craftZ": state["craftZ"],
                    "message": (state["message"] or {}).get("text"),
                })
                time.sleep(0.8)
    machine.stick(STICK_STOP)
    return {"speedKey": speed, "airborne": airborne, "climb": climb, "space": launched,
            "aim": aimed, "reachedSpace": bool(airborne and reached_space),
            "watched": [f"0x{address:06x}" for address in watch_pcs]}


def system_bodies() -> dict[int, dict]:
    """Body centres from the tracked system payload, keyed by source index."""
    document = json.loads(SYSTEM_PAYLOAD.read_text())
    return {body["sourceIndex"]: body for body in document["bodies"]}


def throttle_word(state: dict) -> int:
    return int(state["throttle"], 16) >> 16


def set_speed(machine: Machine, state: dict, wanted: int) -> dict:
    """Bring $7BAC toward a wanted magnitude with the digit and scaling keys.

    Digits set the word outright; `-` and `=` scale what is there, which is the
    only way below key 1. Each press is followed by a read, so the loop never
    assumes a step size.
    """
    for _ in range(6):
        current = throttle_word(state)
        if current == wanted:
            break
        if 4 <= wanted <= 12 and abs(current - wanted) > 1:
            machine.press(SCAN_DIGIT[max(1, min(9, wanted - 3))], hold=0.05)
        else:
            machine.press(SCAN_SLOWER if current > wanted else SCAN_FASTER, hold=0.05)
        state = machine.sample()
    return state


def navigate(machine: Machine, target: dict, bodies: dict[int, dict], *,
             seconds: float, arrive: int, yaw_tolerance: int,
             pitch_tolerance: int, burst: float) -> dict:
    """Fly a launched craft to a body, closed loop, until it is the nearest one.

    Arrival is not a distance to the target: $052FDA tests the nearest body of
    the frame against its own extent, so the craft has to be closer to the
    target than to any of its neighbours before the landing routine can fire on
    the right one. The Eris cluster puts six bodies within seven thousand units
    of each other, which is why this steers on the margin rather than on range.
    """
    centre = tuple(target["position"][axis] for axis in "xyz")
    others = [body for index, body in bodies.items() if index != target["sourceIndex"]]
    # Arrival fires on the nearest body, and the target's neighbours are only a
    # few thousand units away, so the craft first flies to a standoff point on
    # the far side of the target from its nearest neighbour. Coming in from
    # there, the target is the nearest body for the whole approach.
    neighbour = min(others, key=lambda body: math.dist(
        centre, tuple(body["position"][axis] for axis in "xyz")))
    away = [centre[i] - neighbour["position"]["xyz"[i]] for i in range(3)]
    span = math.sqrt(sum(value * value for value in away)) or 1.0
    standoff = tuple(centre[i] + away[i] / span * STANDOFF for i in range(3))
    waypoint = standoff
    log: list[dict] = []
    started = time.monotonic()
    outcome = "timeout"
    last_change = time.monotonic()
    previous = None
    state = machine.sample()
    while time.monotonic() - started < seconds:
        position = (state["craftX"], state["craftY"], state["craftZ"])
        if position != previous:
            previous, last_change = position, time.monotonic()
        elif time.monotonic() - last_change > 25:
            outcome = "stalled"
            break
        if waypoint is not None and math.dist(position, waypoint) <= STANDOFF / 2:
            waypoint = None
        goal = centre if waypoint is None else waypoint
        delta = [goal[i] - position[i] for i in range(3)]
        flat = math.hypot(delta[0], delta[2])
        distance = math.sqrt(sum(value * value for value in delta))
        to_target = math.dist(position, centre)
        nearest = min(
            (math.dist(position, tuple(body["position"][axis] for axis in "xyz")), body["name"])
            for body in others
        )
        want_yaw = int(round(YAW_NORTH + math.atan2(delta[0], delta[2])
                             / (2 * math.pi) * YAW_UNITS_PER_TURN)) % YAW_UNITS_PER_TURN
        want_pitch = int(round(YAW_NORTH - math.atan2(delta[1], flat)
                               / (2 * math.pi) * YAW_UNITS_PER_TURN)) % YAW_UNITS_PER_TURN
        yaw_error = ((want_yaw - (state["yaw"] & YAW_MASK)) % YAW_UNITS_PER_TURN)
        yaw_error -= YAW_UNITS_PER_TURN if yaw_error > YAW_UNITS_PER_TURN // 2 else 0
        pitch_error = ((want_pitch - (state["pitch"] & YAW_MASK)) % YAW_UNITS_PER_TURN)
        pitch_error -= YAW_UNITS_PER_TURN if pitch_error > YAW_UNITS_PER_TURN // 2 else 0
        log.append({
            "t": round(time.monotonic() - started, 2),
            "distance": int(distance), "toTarget": int(to_target),
            "leg": "standoff" if waypoint is not None else "target",
            "nearestOther": nearest[1],
            "nearestOtherDistance": int(nearest[0]),
            "yawError": yaw_error, "pitchError": pitch_error,
            "throttle": state["throttle"], "navTarget": state["navTarget"],
            "craftX": position[0], "craftY": position[1], "craftZ": position[2],
            "bodySelector": state["bodySelector"], "occupancy": state["occupancy"],
        })
        if state["occupancy"] != 2 or state["bodySelector"] != "0xffff":
            outcome = "landed"
            break
        if waypoint is None and to_target <= arrive and to_target < nearest[0]:
            outcome = "closest"
        # One control tick should not cover more than a fraction of what is
        # left, or the craft flies straight past a body only a few thousand
        # units across.
        wanted = 4 + max(-4, min(8, int(round(math.log2(max(1.0, distance / 8) / 12000)))))
        state = set_speed(machine, state, wanted)
        if abs(yaw_error) > yaw_tolerance:
            machine.stick(STICK_RIGHT if yaw_error > 0 else STICK_LEFT)
            time.sleep(min(0.3, max(0.02, abs(yaw_error) / 700)))
        elif abs(pitch_error) > pitch_tolerance:
            machine.stick(STICK_FORWARD if pitch_error > 0 else STICK_BACK)
            time.sleep(min(0.3, max(0.02, abs(pitch_error) / 700)))
        else:
            time.sleep(burst)
        machine.stick(STICK_STOP)
        state = machine.sample()
    machine.stick(STICK_STOP)
    return {"target": target["name"], "targetIndex": target["sourceIndex"],
            "centre": centre, "standoff": standoff, "outcome": outcome, "ticks": log}


def save_pose(machine: Machine, snapshot_out: Path) -> dict | None:
    """Statesave wherever the player is standing, if they are on foot."""
    state = machine.sample(keep=True, shot=True)
    if state["onFoot"] != 1:
        return {"saved": False, "reason": "not on foot", "state": state}
    snapshot_out.parent.mkdir(parents=True, exist_ok=True)
    _fifo_send(machine.handle, [
        "hatari-stop",
        f"hatari-debug statesave {snapshot_out.resolve()}",
        "hatari-cont",
    ])
    deadline = time.time() + 20
    while time.time() < deadline:
        if snapshot_out.is_file() and snapshot_out.stat().st_size > 0:
            return {"saved": True, "path": str(snapshot_out),
                    "sha256": _sha256(snapshot_out),
                    "bodySelector": state["bodySelector"], "cell": state["cell"]}
        time.sleep(0.2)
    return {"saved": False, "reason": "statesave did not land"}


def land_and_capture(machine: Machine, snapshot_out: Path, *, seconds: float) -> dict:
    """Wait out the descent, step out of the craft, and save the pose.

    The landing routine at $059268 drops the craft in at $7AB6 = $1800000, so
    the craft has to fall before anyone can leave it. Leaving is the ordinary
    `L` the laboratory already uses, and the capture is Hatari's own statesave:
    a memstate of the machine standing on the new body, which is exactly what
    location-ledger.py reads.
    """
    log = []
    started = time.monotonic()
    landed = False
    while time.monotonic() - started < seconds:
        state = machine.sample()
        log.append({"t": round(time.monotonic() - started, 2),
                    "craftY": state["craftY"], "groundContact": state["groundContact"],
                    "bodySelector": state["bodySelector"], "onFoot": state["onFoot"],
                    "occupancy": state["occupancy"]})
        if state["groundContact"] and state["craftY"] < 100000:
            landed = True
            break
        time.sleep(0.5)
    left = None
    if landed:
        machine.press(SCAN_LEAVE)
        time.sleep(1.5)
        left = machine.sample(keep=True, shot=True)
    saved = None
    if left is not None and left["onFoot"] == 1:
        snapshot_out.parent.mkdir(parents=True, exist_ok=True)
        _fifo_send(machine.handle, [
            "hatari-stop",
            f"hatari-debug statesave {snapshot_out.resolve()}",
            "hatari-cont",
        ])
        deadline = time.time() + 20
        while time.time() < deadline:
            if snapshot_out.is_file() and snapshot_out.stat().st_size > 0:
                saved = {"path": str(snapshot_out), "sha256": _sha256(snapshot_out)}
                break
            time.sleep(0.2)
    return {"landed": landed, "descent": log,
            "afterLeave": left, "snapshot": saved}


def walk(machine: Machine, *, seconds: float, stick: int = STICK_FORWARD,
         watch_slots: tuple[int, ...] = (),
         plan: tuple[tuple[int, float], ...] = ()) -> dict:
    """Hold a walking direction and log where the player ends up.

    Used to walk into a transporter: the network is entered by stepping into
    the cube, and which face is entered decides the direction of travel
    ($059130 tests bit 9 of the camera yaw and steps the slot selector by
    plus or minus four).
    """
    log = []
    legs = plan or ((stick, seconds),)
    for leg_stick, leg_seconds in legs:
        machine.stick(leg_stick)
        started = time.monotonic()
        while time.monotonic() - started < leg_seconds:
            state = machine.sample()
            row = {
                "t": round(time.monotonic() - started, 2),
                "stick": f"0x{leg_stick:02x}",
                "onFoot": state["onFoot"], "occupancy": state["occupancy"],
                "bodySelector": state["bodySelector"], "cell": state["cell"],
                "transporterMode": state["transporterMode"],
                "x": state["x"], "y": state["y"], "z": state["z"],
                "yaw": state["yaw"],
                "message": (state["message"] or {}).get("text"),
            }
            for slot in watch_slots:
                target = state["residents"][str(slot)]
                row[f"distance{slot}"] = max(abs(target["x"] - state["x"]),
                                             abs(target["z"] - state["z"]))
            log.append(row)
            time.sleep(0.4)
    machine.stick(STICK_STOP)
    return {"seconds": seconds, "legs": [[f"0x{a:02x}", b] for a, b in legs], "ticks": log}


def walk_to(machine: Machine, point: tuple[int, int], *, tolerance: int,
            ticks: int, burst: float = 0.25, yaw_tolerance: int = 24) -> dict:
    """Closed-loop walk to an arbitrary point on the surface, in x and z."""
    log = []
    state = machine.sample()
    best = None
    stalled = 0
    outcome = "exhausted"
    for _ in range(ticks):
        state = machine.sample()
        position = (state["x"], state["z"])
        gap = max(abs(point[0] - position[0]), abs(point[1] - position[1]))
        want = int(round(YAW_NORTH + math.atan2(point[0] - position[0],
                                                point[1] - position[1])
                         / (2 * math.pi) * YAW_UNITS_PER_TURN)) % YAW_UNITS_PER_TURN
        error = ((want - (state["yaw"] & YAW_MASK)) % YAW_UNITS_PER_TURN)
        error -= YAW_UNITS_PER_TURN if error > YAW_UNITS_PER_TURN // 2 else 0
        log.append({"gap": gap, "yawError": error, "x": position[0], "z": position[1]})
        if gap <= tolerance:
            outcome = "arrived"
            break
        if best is None or gap < best - 200:
            best, stalled = gap, 0
        else:
            stalled += 1
            if stalled >= 10:
                outcome = "stalled"
                break
        if abs(error) > yaw_tolerance:
            machine.stick(STICK_RIGHT if error > 0 else STICK_LEFT)
            time.sleep(min(0.35, max(0.03, abs(error) / 500)))
        else:
            machine.stick(STICK_FORWARD)
            time.sleep(burst)
        machine.stick(STICK_STOP)
    machine.stick(STICK_STOP)
    return {"outcome": outcome, "ticks": log}


def nearest_transporter(state: dict) -> tuple[int, int]:
    """The ring slot the player is standing at, and its distance."""
    best = None
    for slot in TRANSPORTER_SLOTS:
        target = state["residents"][str(slot)]
        distance = max(abs(target["x"] - state["x"]), abs(target["z"] - state["z"]))
        if best is None or distance < best[1]:
            best = (slot, distance)
    return best


def steps_forward(yaw: int) -> bool:
    """Whether walking into a cube at this yaw steps the ring forward.

    $059130 adds $100 to the camera yaw and tests bit 9, having first inverted
    the word unless the stick's forward bit is set. Walking in forwards, the
    selector therefore gains four -- the next transporter -- when that bit is
    clear, and loses four when it is set.
    """
    return ((yaw + 0x100) & 0x200) == 0


def direction_unit(yaw: int) -> tuple[float, float]:
    angle = (yaw - YAW_NORTH) / YAW_UNITS_PER_TURN * 2 * math.pi
    return (math.sin(angle), math.cos(angle))


def hop(machine: Machine, *, walk_seconds: float, forward: bool = True,
        standoff: int = 1300) -> dict:
    """One transporter hop in a chosen direction round the ring.

    The direction is the entry yaw, not the face as such, so this puts the
    player on the side of the cube from which facing it gives a yaw in the
    right half, and only then walks in.
    """
    state = machine.sample()
    slot, distance = nearest_transporter(state)
    cube = state["residents"][str(slot)]
    want_yaw = 0x040 if forward else 0x1C0
    assert steps_forward(want_yaw) == forward
    unit = direction_unit(want_yaw)
    standpoint = (int(cube["x"] - unit[0] * standoff), int(cube["z"] - unit[1] * standoff))
    approached = walk_to(machine, standpoint, tolerance=450, ticks=60)
    aimed = approach(machine, slot, tolerance=350, ticks=40, burst=0.2, yaw_tolerance=14)
    before = machine.sample()
    entry_yaw = before["yaw"] & YAW_MASK
    machine.stick(STICK_FORWARD)
    started = time.monotonic()
    arrived = None
    while time.monotonic() - started < walk_seconds:
        sample = machine.sample()
        if (sample["bodySelector"] != before["bodySelector"]
                or sample["cell"] != before["cell"]):
            arrived = sample
            break
        time.sleep(0.3)
    machine.stick(STICK_STOP)
    after = arrived or machine.sample()
    return {
        "fromSlot": slot, "fromDistance": distance,
        "fromBody": before["bodySelector"], "fromCell": before["cell"],
        "toBody": after["bodySelector"], "toCell": after["cell"],
        "moved": after["bodySelector"] != before["bodySelector"],
        "wantForward": forward, "entryYaw": entry_yaw,
        "entryStepsForward": steps_forward(entry_yaw),
        "standWalk": approached["outcome"], "aim": aimed["outcome"],
    }


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
        fly_seconds: float = 0.0, speed: int = 9, fly_stick: int = STICK_STOP,
        keys: tuple[int, ...] = (), watch_pcs: tuple[int, ...] = (),
        hold_throttle: bool = False, depart_seconds: float = 0.0,
        space_plan: tuple[tuple[int, float], ...] = (), space_speed: int = 0,
        navigate_to: int | None = None, navigate_seconds: float = 120.0,
        arrive: int = 4000, aim_before_launch: bool = False,
        capture_name: str | None = None, walk_seconds: float = 0.0,
        walk_plan: tuple[tuple[int, float], ...] = (), chain: int = 0,
        turn_first: float = 0.0, back_step: float = 0.0,
        reverse: bool = False) -> dict:
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
        extra_args=["--memstate", str(snapshot.resolve()),
                    "--trace", "keymap",
                    "--trace-file", str((run_directory / "keymap.trace").resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())

    watch = tuple(sorted(set(CRAFT_SLOTS) | set(TRANSPORTER_SLOTS)
                         | ({target} if target is not None else set())))
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
            if chain:
                bodies = system_bodies()
                covered = {int(p["body"].split("-")[1])
                           for p in json.loads(POSES_PAYLOAD.read_text())["poses"]}
                hops = []
                for index in range(chain):
                    step = hop(machine, walk_seconds=12.0, forward=not reverse)
                    selector = int(step["toBody"], 16)
                    body_index = selector // 4 if selector % 4 == 0 else None
                    step["toName"] = (bodies.get(body_index) or {}).get("name")
                    step["newBody"] = body_index is not None and body_index not in covered
                    if step["moved"] and step["newBody"] and capture_name:
                        name = f"{(step['toName'] or f'body-{body_index}').lower()}-transporter"
                        step["capture"] = save_pose(machine, SNAPSHOTS / f"{name}.sav")
                        covered.add(body_index)
                    hops.append(step)
                    if not step["moved"]:
                        break
                result["chain"] = hops
            if walk_seconds or walk_plan:
                result["walk"] = walk(machine, seconds=walk_seconds,
                                      watch_slots=TRANSPORTER_SLOTS,
                                      plan=walk_plan)
                result["afterWalk"] = machine.sample(keep=True, shot=True)
                if capture_name:
                    result["capture"] = save_pose(
                        machine, SNAPSHOTS / f"{capture_name}.sav")
            if not survey_only and target is not None:
                result["approach"] = approach(
                    machine, target, tolerance=tolerance, ticks=ticks,
                    burst=burst, yaw_tolerance=yaw_tolerance,
                )
                result["afterApproach"] = machine.sample(keep=True, shot=True)
                if board:
                    machine.press(SCAN_BOARD)
                    time.sleep(1.5)
                    result["afterBoard"] = machine.sample(keep=True, shot=True)
                    aim_heading = None
                    if navigate_to is not None and aim_before_launch:
                        bodies = system_bodies()
                        if navigate_to not in bodies:
                            raise LabError(f"no body with source index {navigate_to}")
                        origin_index = int(result["afterBoard"]["bodySelector"], 16) // 4
                        if origin_index not in bodies:
                            raise LabError(f"pose body {origin_index} is not in the system payload")
                        aim_heading = system_heading(bodies[origin_index], bodies[navigate_to])
                        result["aimHeading"] = {
                            "from": bodies[origin_index]["name"],
                            "to": bodies[navigate_to]["name"],
                            "yaw": aim_heading[0], "pitch": aim_heading[1],
                        }
                    if depart_seconds and result["afterBoard"]["onFoot"] == 0:
                        result["departure"] = depart(
                            machine, speed=speed, climb_seconds=depart_seconds,
                            space_seconds=depart_seconds, run_directory=run_directory,
                            watch_pcs=watch_pcs, plan=space_plan,
                            space_speed=space_speed,
                            aim_heading=aim_heading)
                        if navigate_to is not None and result["departure"].get("reachedSpace"):
                            bodies = system_bodies()
                            if navigate_to not in bodies:
                                raise LabError(f"no body with source index {navigate_to}")
                            result["navigation"] = navigate(
                                machine, bodies[navigate_to], bodies,
                                seconds=navigate_seconds, arrive=arrive,
                                yaw_tolerance=16, pitch_tolerance=16, burst=0.3)
                        if capture_name and (result.get("navigation") or {}).get("outcome") == "landed":
                            result["capture"] = land_and_capture(
                                machine, SNAPSHOTS / f"{capture_name}.sav", seconds=120)
                        result["afterDeparture"] = machine.sample(keep=True, shot=True)
                    elif fly_seconds and result["afterBoard"]["onFoot"] == 0:
                        result["flight"] = fly(machine, speed=speed,
                                               seconds=fly_seconds, stick=fly_stick,
                                               keys=keys, watch_pcs=watch_pcs,
                                               hold_throttle=hold_throttle)
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
    print(f"flight: speed key {flight['speedKey']}, keys {flight.get('keys')}, "
          f"stick {flight['stick']}")
    if flight.get("watched"):
        print(f"  watched: {flight['watched']}")
    for row in flight["telemetry"]:
        print(f"  t+{row['t']:5.1f}s craft {row['boardedSlot']} onFoot {row['onFoot']} "
              f"throttle {row['throttle']} yaw 0x{row['yaw']:04x} "
              f"craft=({row['craftX']}, {row['craftY']}, {row['craftZ']})")


def summarise_departure(result: dict) -> None:
    departure = result.get("departure")
    if not departure:
        return
    climb = departure["climb"]
    print(f"departure: speed key {departure['speedKey']}, airborne={departure['airborne']} "
          f"after {len(climb)} ticks, reachedSpace={departure.get('reachedSpace')}")
    if departure.get("aim"):
        aimed = departure["aim"]
        last = aimed["ticks"][-1] if aimed["ticks"] else {}
        print(f"  aim: want yaw {aimed['wantYaw']} pitch {aimed['wantPitch']}, "
              f"aligned={aimed['aligned']}, final yaw 0x{last.get('yaw', 0):04x} "
              f"errors {last.get('yawError')}/{last.get('pitchError')}")
    for row in climb[-3:]:
        print(f"  climb t+{row['t']:5.1f}s ground={row['groundContact']} "
              f"alt=0x{row['altitude']:04x} y={row['craftY']}")
    for row in departure.get("space") or []:
        print(f"  space t+{row['t']:5.1f}s stick {row.get('stick')} "
              f"yaw 0x{row.get('yaw', 0):04x} nav {row.get('navTarget')} "
              f"arr {row.get('arrivalFlag')} body {row['bodySelector']} "
              f"craft=({row['craftX']}, {row['craftY']}, {row['craftZ']})")


def summarise_navigation(result: dict) -> None:
    navigation = result.get("navigation")
    if not navigation:
        return
    print(f"navigation to {navigation['target']} ({navigation['outcome']}):")
    for row in navigation["ticks"][::max(1, len(navigation["ticks"]) // 12)]:
        print(f"  t+{row['t']:6.1f}s {row.get('leg','target'):<8} to target {row['toTarget']:>9} "
              f"nearest {row['nearestOther']}@{row['nearestOtherDistance']:<10} "
              f"yawErr {row['yawError']:>5} thr {row['throttle']} "
              f"body {row['bodySelector']}")
    last = navigation["ticks"][-1]
    print(f"  final distance {last['distance']} at "
          f"({last['craftX']}, {last['craftY']}, {last['craftZ']})")


def summarise_capture(result: dict) -> None:
    capture = result.get("capture")
    if not capture:
        return
    if "saved" in capture:
        if capture["saved"]:
            print(f"capture: saved {capture['path']}")
            print(f"  body {capture['bodySelector']} cell {capture['cell']}")
            print(f"  sha256 {capture['sha256']}")
        else:
            print(f"capture: not saved ({capture.get('reason')})")
        return
    left = capture.get("afterLeave") or {}
    print(f"capture: landed={capture['landed']} onFoot={left.get('onFoot')} "
          f"body {left.get('bodySelector')}")
    if capture.get("saved"):
        print(f"capture: saved {capture['path']}")
        print(f"  body {capture['bodySelector']} cell {capture['cell']}")
        print(f"  sha256 {capture['sha256']}")
        return
    if capture.get("snapshot"):
        print(f"  saved {capture['snapshot']['path']}")
        print(f"  sha256 {capture['snapshot']['sha256']}")


def summarise_walk(result: dict) -> None:
    walked = result.get("walk")
    if not walked:
        return
    print(f"walk: legs {walked['legs']}")
    for row in walked["ticks"]:
        extra = " ".join(f"d{k[8:]}={v}" for k, v in row.items() if k.startswith("distance"))
        print(f"  t+{row['t']:5.1f}s {row.get('stick')} body {row['bodySelector']} "
              f"cell {row['cell']} mode {row['transporterMode']} "
              f"yaw 0x{row['yaw'] & YAW_MASK:03x} pos=({row['x']}, {row['y']}, {row['z']})")


def summarise_chain(result: dict) -> None:
    hops = result.get("chain")
    if not hops:
        return
    print("transporter chain:")
    for step in hops:
        mark = "NEW" if step.get("newBody") else "   "
        print(f"  {mark} slot {step['fromSlot']} ({step['fromBody']} cell {step['fromCell']}) "
              f"-> {step['toBody']} cell {step['toCell']} "
              f"{step.get('toName') or ''} moved={step['moved']} "
              f"entry yaw 0x{step['entryYaw']:03x} "
              f"forward={step['entryStepsForward']} "
              f"(walk {step['standWalk']}, aim {step['aim']})")
        capture = step.get("capture") or {}
        if capture.get("saved"):
            print(f"        saved {capture['path']}  sha256 {capture['sha256'][:16]}…")


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
    summarise_departure(result)
    summarise_navigation(result)
    summarise_capture(result)
    summarise_walk(result)
    summarise_chain(result)


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
    parser.add_argument("--speed", type=int, default=9, choices=[0, *sorted(SCAN_DIGIT)],
                        help="craft speed key pressed for --fly")
    parser.add_argument("--fly-stick", type=lambda v: int(v, 0), default=STICK_STOP,
                        help="stick byte held during --fly (0x01 up, 0x02 down)")
    parser.add_argument("--press", default="",
                        help="comma-separated ST scancodes pressed instead of the speed key")
    parser.add_argument("--depart", type=float, default=0.0, metavar="SECONDS",
                        help="after boarding, climb until airborne then press Esc")
    parser.add_argument("--navigate", type=int, default=None, metavar="INDEX",
                        help="after launch, fly toward this body source index")
    parser.add_argument("--navigate-seconds", type=float, default=120.0)
    parser.add_argument("--chain", type=int, default=0, metavar="HOPS",
                        help="walk the transporter ring this many hops, capturing new bodies")
    parser.add_argument("--reverse", action="store_true",
                        help="walk the ring backwards instead of forwards")
    parser.add_argument("--back-step", type=float, default=2.0, metavar="SECONDS",
                        help="step backwards out of the cube before each later hop")
    parser.add_argument("--turn-first", type=float, default=0.0, metavar="SECONDS",
                        help="turn right this long before each hop after the first")
    parser.add_argument("--walk-plan", default="",
                        help="walking legs as stickbyte:seconds,stickbyte:seconds")
    parser.add_argument("--walk", type=float, default=0.0, metavar="SECONDS",
                        help="hold the stick forward and log where the player ends up")
    parser.add_argument("--capture", default=None, metavar="NAME",
                        help="after landing, leave the craft and statesave snapshots/NAME.sav")
    parser.add_argument("--aim-before-launch", action="store_true",
                        help="turn onto the target heading before pressing Esc")
    parser.add_argument("--arrive", type=int, default=4000,
                        help="distance in source units counted as arrival")
    parser.add_argument("--space-speed", type=int, default=0, choices=[0, *sorted(SCAN_DIGIT)],
                        help="speed key pressed once in space")
    parser.add_argument("--space-plan", default="",
                        help="stick legs once in space, as byte:seconds,byte:seconds")
    parser.add_argument("--hold-throttle", action="store_true",
                        help="re-press the speed key every tick during --fly")
    parser.add_argument("--watch", default="",
                        help="comma-separated PCs to arm a marker breakpoint on")
    parser.add_argument("--ordinary-rate", action="store_true",
                        help="run without fast-forward, at the PAL frame rate")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if (not args.survey and args.target is None and not args.walk
            and not args.walk_plan and not args.chain):
        parser.error("give --target SLOT, --walk SECONDS, or --survey")

    result = run(
        args.snapshot, args.roms, target=args.target, board=args.board,
        survey_only=args.survey, settle=args.settle, ticks=args.ticks,
        burst=args.burst, tolerance=args.tolerance, yaw_tolerance=args.yaw_tolerance,
        fast_forward=not args.ordinary_rate,
        fly_seconds=args.fly, speed=args.speed, fly_stick=args.fly_stick,
        keys=tuple(int(v, 0) for v in args.press.split(",") if v.strip()),
        watch_pcs=tuple(int(v, 0) for v in args.watch.split(",") if v.strip()),
        hold_throttle=args.hold_throttle, depart_seconds=args.depart,
        space_speed=args.space_speed, navigate_to=args.navigate,
        navigate_seconds=args.navigate_seconds, arrive=args.arrive,
        aim_before_launch=args.aim_before_launch, capture_name=args.capture,
        walk_seconds=args.walk, chain=args.chain, turn_first=args.turn_first,
        back_step=args.back_step, reverse=args.reverse,
        walk_plan=tuple(
            (int(leg.split(":")[0], 0), float(leg.split(":")[1]))
            for leg in args.walk_plan.split(",") if leg.strip()
        ),
        space_plan=tuple(
            (int(leg.split(":")[0], 0), float(leg.split(":")[1]))
            for leg in args.space_plan.split(",") if leg.strip()
        ),
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
