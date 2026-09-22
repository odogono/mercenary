#!/usr/bin/env python3
"""Fly a boarded craft to another Structure Workspace on the same body (#447).

#441 recovered a road network for every Structure Workspace group a capture has
loaded, and #414 draws them. Twenty of the forty-two island records that bind a
workspace have no capture, so the Atlas draws a dashed gap square for each. The
gap is per group, not per body: a capture contributes one live ``$00ABDC``
window, so it covers the one workspace it stands in.

Every existing capture is an arrival pose — the craft came down wherever the
landing routine put it, and #326's departure work stops at the body. Reaching a
*second* workspace on a body already captured is the missing move, and it is a
surface flight rather than a launch: the workspace loader builds ``$ABDC`` for
whichever island record ``$056464`` finds nearest, so standing somewhere else on
the same surface is the whole requirement.

This probe boards a craft from a restorable pose, climbs, and steers a closed
loop toward a named island record's own origin, reading the craft's body-local
longwords each tick rather than timing a stick script. It learns its cruise rate
from the machine, wraps the surface at 2^28 source units, and lands where the
target record is the one the engine selects. The capture is Hatari's own
statesave, which is what ``damocleslab.catalogue`` reads as a ``--workspace``
input.

Nothing is injected. Steering is the joystick-1 soft-copy the laboratory already
uses, the throttle and ``L`` are real key events, and every sample is a
``savebin`` taken while the machine is stopped.

Usage (from the repository root):

  # what this pose can reach, and which groups still have no network
  python3 research/damocles-st/scripts/workspace-capture-probe.py --list

  # fly the Eris pose to SNOW ISLAND and capture the pose that lands there
  python3 research/damocles-st/scripts/workspace-capture-probe.py \
      --island island-eris-06327c --capture eris-snow-island

  # the same by group, from the Lucan arrival pose
  python3 research/damocles-st/scripts/workspace-capture-probe.py \
      --snapshot research/damocles-st/snapshots/damocles.lucan.sav \
      --group 0x1d --capture lucan-1d

See docs/research/damocles-eris-ground.md for the groups these captures publish.
"""

from __future__ import annotations

import argparse
import importlib.util
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

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
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

_spec = importlib.util.spec_from_file_location(
    "arrival_route_probe", Path(__file__).resolve().parent / "arrival-route-probe.py"
)
_route = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_route)

Machine = _route.Machine
approach = _route.approach
survey = _route.survey
_sha256 = _route._sha256

CELL_UNITS = _route.CELL_UNITS
SCAN_BOARD, SCAN_LEAVE = _route.SCAN_BOARD, _route.SCAN_LEAVE
SCAN_DIGIT = _route.SCAN_DIGIT
SCAN_SLOWER, SCAN_FASTER = _route.SCAN_SLOWER, _route.SCAN_FASTER
STICK_STOP, STICK_FORWARD = _route.STICK_STOP, _route.STICK_FORWARD
STICK_LEFT, STICK_RIGHT, STICK_BACK = (
    _route.STICK_LEFT, _route.STICK_RIGHT, _route.STICK_BACK)
YAW_MASK, YAW_NORTH, YAW_UNITS_PER_TURN = (
    _route.YAW_MASK, _route.YAW_NORTH, _route.YAW_UNITS_PER_TURN)
CRAFT_SLOTS = _route.CRAFT_SLOTS
WORK_ROOT = _route.WORK_ROOT
SNAPSHOTS = _route.SNAPSHOTS
REPO = _route.REPO

CATALOGUE = REPO / "payload" / "damocles" / "catalogue.json"

# The board gate's key array, per docs/research/damocles-vehicle-key-gate.md:
# $7272 + slot*4 is the paired key object's association-A handling byte, and
# bit 7 is its carried bit.
KEY_BYTES = 0x7272


# A memstate decodes to the whole 1 MiB of ST RAM, so an address is its own
# offset; the route probe's readers take a window base as well.
def _u16(memory: bytes, address: int) -> int:
    return _route._u16(memory, 0, address)


def _u32(memory: bytes, address: int) -> int:
    return _route._u32(memory, 0, address)


def _s32(memory: bytes, address: int) -> int:
    return _route._s32(memory, 0, address)


# A body surface wraps at 4096 cells, which is the 28-bit wrap the island
# transforms in docs/research/damocles-eris-islands.md already apply. A delta
# has to be taken modulo that or a target across the seam reads as a flight
# most of the way round the world -- which is what every Lucan group needs,
# their origins sitting either side of the coordinate origin.
SURFACE_WRAP = 4096 * CELL_UNITS

# The workspace is a 16x16 window whose origin is the island record's own, so
# aim at its middle rather than its corner: the loader binds the record the
# engine finds nearest, and the middle is the least ambiguous place to stand.
WORKSPACE_CELLS = 16

CRUISE_FLOOR = 60000     # hold the craft clear of surface structures
CRUISE_CEILING = 160000  # and low enough that the descent is short
CRUISE_TRIM = 32         # about eleven degrees: the most the cruise ever tilts
CRUISE_WORD_CAP = 8      # the fastest throttle word the control loop can hold
LEVEL_PITCH = YAW_NORTH  # $7AC0 reads 512 with the nose on the horizon


class WedgedMachine(LabError):
    """Raised when the emulator stops answering the command FIFO."""


FIFO_WRITE_TIMEOUT = 20.0


def _safe_fifo_send(handle, lines: list[str]) -> None:
    """Write to the command FIFO without ever blocking forever.

    ``laboratory._fifo_send`` writes and flushes straight onto the FIFO. That
    is fine for a probe that sends a handful of commands, but a control loop
    sends thousands, and when Hatari's reader stops consuming them -- its log
    fills with ``command FIFO read error: Resource temporarily unavailable``
    -- the pipe buffer fills and the write never returns. The run then looks
    like a slow flight for as long as anyone lets it. The fd is non-blocking
    and short writes are retried against a deadline instead, so a wedged
    emulator ends the run rather than outliving it.
    """
    payload = "".join(line + "\n" for line in lines).encode("ascii")
    deadline = time.monotonic() + FIFO_WRITE_TIMEOUT
    while payload:
        try:
            written = os.write(handle.fileno(), payload)
        except BlockingIOError:
            written = 0
        payload = payload[written:]
        if payload:
            if time.monotonic() > deadline:
                raise WedgedMachine(
                    "the emulator stopped reading the command FIFO after "
                    f"{FIFO_WRITE_TIMEOUT:.0f}s; abandoning the run rather "
                    "than leaving it blocked")
            time.sleep(0.02)


# Every Machine call reaches the FIFO through the route probe's module-level
# helper, so replacing it there covers stick, press, sample and statesave.
_route._fifo_send = _safe_fifo_send
_fifo_send = _safe_fifo_send


class WatchedMachine(Machine):
    """A Machine that fails fast when the emulator stops answering.

    Two hazards only show up in a control loop that runs for minutes rather
    than seconds, and both were hit driving this probe:

    * Hatari's FIFO reader can stop consuming commands, and a blocking write
      into a FIFO nobody reads never returns. A run wedged this way looks
      exactly like a slow flight. Writes therefore go through a non-blocking
      fd with a deadline.
    * ``savebin`` writes a fixed per-tick filename, so a sample taken after the
      emulator has stopped answering re-reads the *previous* tick's bytes. The
      loop then steers for as long as its budget allows on state that is not
      changing. Each window is removed before it is asked for, so a stale file
      cannot be mistaken for a fresh one.
    """

    SAMPLE_DEADLINE = 6.0

    def sample(self, *, shot: bool = False, keep: bool = False,
               full: bool = False) -> dict:
        index = self.samples
        self.samples += 1
        prefix = f"sample{index:03d}" if keep else "tick"
        paths = {}
        commands = ["hatari-stop", "hatari-debug setopt hex"]
        windows = (_route.WINDOWS if (full or keep or self.strings is None)
                   else _route.WINDOWS[:1])
        for label, base, length in windows:
            path = self.run_directory / f"{prefix}-{label}.bin"
            # Remove it first: savebin reuses the filename every tick, so a
            # sample taken after the emulator stopped answering would re-read
            # the previous tick's bytes and read as a craft that has stopped
            # moving rather than as a run that has stopped running.
            if path.is_file():
                path.unlink()
            paths[label] = path
            commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
        if shot:
            commands.append(
                f"hatari-debug screenshot {self.run_directory}/{prefix}.png")
        commands.append("hatari-cont")
        _safe_fifo_send(self.handle, commands)
        blobs = dict(self.strings or {})
        for label, path in paths.items():
            deadline = time.monotonic() + self.SAMPLE_DEADLINE
            data = b""
            while time.monotonic() < deadline:
                if path.is_file():
                    data = path.read_bytes()
                if len(data) == dict(
                        (name, length) for name, _b, length in _route.WINDOWS)[label]:
                    break
                time.sleep(0.05)
            else:
                raise WedgedMachine(
                    f"sample {index} window {label} did not land within "
                    f"{self.SAMPLE_DEADLINE:.0f}s; the emulator has stopped "
                    "answering")
            blobs[label] = data
        if self.strings is None:
            self.strings = {label: blobs[label] for label in ("strings", "pool")}
        state = _route.decode(blobs, self.watch)
        if keep:
            state["sha256"] = {label: _sha256(path) for label, path in paths.items()}
        return state


def wrapped(delta: int) -> int:
    """Shortest signed distance on a surface axis that wraps at 2^28."""
    delta %= SURFACE_WRAP
    return delta - SURFACE_WRAP if delta > SURFACE_WRAP // 2 else delta


def island_targets() -> list[dict]:
    """Island records that bind a structure group, and whether one is covered.

    The catalogue is the tracked reading of both halves: `islands` carries every
    record's origin and group, and `roadNetworks` carries the group a capture
    has actually loaded. A record in the first and not the second is a gap.
    """
    document = json.loads(CATALOGUE.read_text())
    bodies = {body["id"]: body["name"] for body in document["bodies"]}
    covered = {(network["body"], tuple(network["origin"]))
               for network in document["roadNetworks"]}
    targets = []
    for island in document["islands"]:
        group = island.get("structureGroup")
        if not group:
            continue
        targets.append({
            "island": island["id"],
            "body": island["body"],
            "bodyName": bodies.get(island["body"], island["body"]),
            "group": group,
            "origin": island["origin"],
            "areaName": island.get("areaName"),
            "covered": (island["body"], tuple(island["origin"])) in covered,
        })
    targets.sort(key=lambda item: (item["bodyName"], item["group"]))
    return targets


def select_target(targets: list[dict], *, island: str | None,
                  group: int | None, body: str | None) -> dict:
    matches = [item for item in targets
               if (island is None or item["island"] == island)
               and (group is None or item["group"] == group)
               and (body is None or item["bodyName"].upper() == body.upper())]
    if not matches:
        raise LabError("no island record matches that --island/--group/--body")
    if len(matches) > 1:
        names = ", ".join(f"{item['island']} (group ${item['group']:02X})"
                          for item in matches)
        raise LabError(f"ambiguous target; name one of: {names}")
    return matches[0]


def pose_routes() -> list[dict]:
    """Which tracked memstate could fly to a gap, read without booting anything.

    A flight needs three things from the pose it starts at, and all three are
    in the memstate: the body it stands on, a craft on that body the board gate
    at $054310 will accept, and the distance from there to each uncovered
    record. The gate's own test is bit 7 of the craft's key byte at
    $7272 + slot*4, which #404 established is the paired key object's carried
    bit -- so a pose either holds the key or it does not, and no flight starts
    where it does not.
    """
    targets = island_targets()
    routes = []
    for path in sorted(SNAPSHOTS.glob("*.sav")):
        try:
            memory = hatari_memstate_ram(path.read_bytes())
        except Exception as error:  # noqa: BLE001 - a bad container is a skip
            routes.append({"snapshot": path.name, "error": str(error)})
            continue
        if len(memory) != 1048576:
            continue
        selector = _u16(memory, _route.BODY_SELECTOR)
        if selector == 0 or selector % 4:
            continue
        body = f"body-{selector // 4}"
        x, z = _s32(memory, _route.CAMERA_X), _s32(memory, _route.CAMERA_Z)
        boardable = []
        for slot in CRAFT_SLOTS:
            if _u32(memory, _route.RESIDENT_B + slot * 4) >> 24 != selector:
                continue
            key = memory[KEY_BYTES + slot * 4]
            gap = max(abs(_s32(memory, _route.RESIDENT_X + slot * 4) - x),
                      abs(_s32(memory, _route.RESIDENT_Z + slot * 4) - z))
            boardable.append({"slot": slot, "cells": round(gap / CELL_UNITS, 2),
                              "key": f"0x{key:02x}",
                              # Slot 1 is DART II, which $0542E0 boards without
                              # a key at all; every other craft needs bit 7.
                              "boards": bool(key & 0x80) or slot == 1})
        gaps = [item for item in targets
                if not item["covered"] and item["body"] == body]
        for item in gaps:
            item = dict(item)
            item["cells"] = round(math.hypot(
                wrapped((item["origin"][0] + WORKSPACE_CELLS // 2) * CELL_UNITS - x),
                wrapped((item["origin"][1] + WORKSPACE_CELLS // 2) * CELL_UNITS - z),
            ) / CELL_UNITS, 1)
            item["reachable"] = any(craft["boards"] and craft["cells"] < 8
                                    for craft in boardable)
            routes.append({"snapshot": path.name, "body": body,
                           "craft": boardable, "target": item})
    return routes


def nearest_craft(state: dict) -> tuple[int, float]:
    """The closest craft slot on this body, and its distance in cells.

    Association B's first byte is four times the body index, the same encoding
    the body selector uses, so a craft counts only where the two agree: a
    distance to a craft parked on another body is not a distance at all.
    """
    selector = int(state["bodySelector"], 16)
    best: tuple[int, float] | None = None
    for slot in CRAFT_SLOTS:
        entry = state["residents"].get(str(slot))
        if entry is None or int(entry["associationB"], 16) >> 24 != selector:
            continue
        gap = math.hypot(wrapped(entry["x"] - state["x"]),
                         wrapped(entry["z"] - state["z"])) / CELL_UNITS
        if best is None or gap < best[1]:
            best = (slot, gap)
    if best is None:
        raise LabError("no craft on this body is in the live resident arrays")
    return best


def climb(machine: Machine, *, speed: int, seconds: float) -> dict:
    """Get the craft off the ground and up to the cruise floor.

    The same two facts #326's departure chain records apply here: the collision
    response at $059750 forces the throttle back whenever a move is refused, so
    it is re-pressed each tick, and a level craft under power flies into
    whatever is parked in front of it, so the nose is held up until there is
    height to spend.
    """
    log = []
    started = time.monotonic()
    airborne = False
    clear = 0
    while time.monotonic() - started < seconds:
        machine.press(SCAN_DIGIT[speed])
        state = machine.sample()
        if (state["pitch"] & YAW_MASK) > _route.CLIMB_PITCH:
            machine.stick(STICK_BACK)
            time.sleep(0.15)
            machine.stick(STICK_STOP)
        log.append({"t": round(time.monotonic() - started, 2),
                    "craftY": state["craftY"], "throttle": state["throttle"],
                    "groundContact": state["groundContact"],
                    "occupancy": state["occupancy"]})
        if state["groundContact"] == 0 and state["craftY"] > CRUISE_FLOOR:
            clear += 1
            if clear >= 3:
                airborne = True
                break
        else:
            clear = 0
        time.sleep(0.2)
    machine.stick(STICK_STOP)
    return {"airborne": airborne, "ticks": log}


def throttle_word(state: dict) -> int:
    return int(state["throttle"], 16) >> 16


def set_speed(machine: Machine, state: dict, wanted: int) -> None:
    """Nudge $7BAC toward a wanted magnitude with at most one key per tick.

    The route probe's own version presses and re-reads until the word matches,
    which is up to six presses and six samples. In a flight that runs for
    minutes that is most of the traffic on the command FIFO, and the FIFO is
    what stops answering first. One press per tick is enough: the loop reads
    the word back on its next sample anyway, so the correction still closes,
    just over a few ticks instead of inside one.
    """
    current = throttle_word(state)
    if current == wanted:
        return
    if 4 <= wanted <= 12 and abs(current - wanted) > 1:
        # A digit sets the word outright, which is the only way back from the
        # boarding preset or from whatever a collision left behind.
        machine.press(SCAN_DIGIT[max(1, min(9, wanted - 3))], hold=0.05)
    else:
        machine.press(SCAN_SLOWER if current > wanted else SCAN_FASTER,
                      hold=0.05)


def cruise(machine: Machine, target: tuple[int, int], *, seconds: float,
           arrive: int, yaw_tolerance: int) -> dict:
    """Steer a flying craft toward a body-local surface point, closed loop.

    Nothing about the flight model is assumed. Each tick reads the craft's own
    longwords at $7AB2/$7AB6/$7ABA, takes the wrapped delta to the target,
    corrects the larger of the heading and the height error, and otherwise
    spends the tick cruising. The ground speed the craft actually makes is
    measured between ticks and the throttle is chosen from it, so a tick never
    commits more than a fraction of what is left -- a workspace is sixteen
    cells across and overshooting it selects the neighbour instead.
    """
    log: list[dict] = []
    started = time.monotonic()
    outcome = "timeout"
    rate: float | None = None
    previous: tuple[float, tuple[int, int]] | None = None
    stalled_since = time.monotonic()
    closest: int | None = None
    state = machine.sample()
    while time.monotonic() - started < seconds:
        position = (state["craftX"], state["craftZ"])
        delta_x, delta_z = (wrapped(target[0] - position[0]),
                            wrapped(target[1] - position[1]))
        distance = int(math.hypot(delta_x, delta_z))
        now = time.monotonic()
        if previous is not None:
            moved = math.hypot(wrapped(position[0] - previous[1][0]),
                               wrapped(position[1] - previous[1][1]))
            elapsed = now - previous[0]
            if moved and elapsed > 0:
                measured = moved / elapsed
                rate = measured if rate is None else 0.5 * rate + 0.5 * measured
        previous = (now, position)
        if closest is None or distance < closest:
            # Stall is measured against the approach, not against movement: a
            # craft flying steadily in the wrong direction is not progress.
            closest = distance
            stalled_since = now
        want_yaw = int(round(YAW_NORTH + math.atan2(delta_x, delta_z)
                             / (2 * math.pi) * YAW_UNITS_PER_TURN))
        want_yaw %= YAW_UNITS_PER_TURN
        error = (want_yaw - (state["yaw"] & YAW_MASK)) % YAW_UNITS_PER_TURN
        error -= YAW_UNITS_PER_TURN if error > YAW_UNITS_PER_TURN // 2 else 0
        log.append({
            "t": round(now - started, 2), "distance": distance,
            "cells": round(distance / CELL_UNITS, 2), "yawError": error,
            "craftX": position[0], "craftZ": position[1],
            "craftY": state["craftY"], "pitch": state["pitch"],
            "throttle": state["throttle"], "cell": state["cell"],
            "groundContact": state["groundContact"],
            "occupancy": state["occupancy"],
            "rate": None if rate is None else int(rate),
        })
        if state["occupancy"] != 0:
            # Boarded is occupancy 0. Anything else means the craft was left,
            # destroyed or launched, and the flight is over however it reads.
            outcome = "lost the craft"
            break
        if distance <= arrive:
            outcome = "arrived"
            break
        if now - stalled_since > 40:
            outcome = "stalled"
            break
        # The throttle is chosen every tick, not only when the craft is already
        # settled: a tick should cover at most a third of what is left, because
        # a workspace is sixteen cells across and a craft that flies past one
        # selects its neighbour instead. The word doubles the speed per step,
        # so the correction is the log of the ratio between that budget and the
        # ground speed the craft has actually been making at the word it is on.
        budget = max(1.0, distance / 3.0)
        if rate:
            wanted = throttle_word(state) + int(round(
                math.log2(budget / max(1.0, rate))))
        else:
            wanted = 4 + int(round(math.log2(
                budget / _route.SPACE_UNITS_PER_SECOND[1])))
        # Cap the cruise: above about a cell a tick the loop cannot hold the
        # height band, and a craft that leaves the band at speed either
        # climbs out of the atmosphere or arrives too high to land.
        set_speed(machine, state, max(1, min(CRUISE_WORD_CAP, wanted)))

        # Height is held by trimming the pitch *target*, never by pointing the
        # craft at the ground: at cruise speed a nose-down attitude covers the
        # whole height band between two samples, and the craft is destroyed on
        # contact. The trim is a few degrees either side of the horizon, so the
        # worst a wrong reading can do is drift.
        if state["craftY"] < CRUISE_FLOOR:
            # A craft that sinks into the surface is refused its move and the
            # collision response at $059750 takes the throttle with it.
            want_pitch = LEVEL_PITCH - CRUISE_TRIM
        elif state["craftY"] > CRUISE_CEILING:
            want_pitch = LEVEL_PITCH + CRUISE_TRIM
        else:
            want_pitch = LEVEL_PITCH
        # $7AC0 reads *below* 512 with the nose up -- $05582E's own climb test
        # at $01B0 is twenty-two degrees above the horizon -- so bringing a
        # climbing craft back to level is stick forward. Getting this backwards
        # pitches it past vertical, where it still answers the heading test and
        # flies steadily away from the target.
        pitch_error = want_pitch - (state["pitch"] & YAW_MASK)
        pitch_error -= (YAW_UNITS_PER_TURN
                        if pitch_error > YAW_UNITS_PER_TURN // 2 else 0)
        pitch_error += (YAW_UNITS_PER_TURN
                        if pitch_error < -YAW_UNITS_PER_TURN // 2 else 0)
        # Both axes are corrected every tick, in turn. Steering them with one
        # either/or branch starves whichever is second: the heading oscillates
        # by a few tens of units all the way down the approach, so a pitch
        # correction that waits for the heading to settle never runs at all,
        # and the craft climbed to twenty times the cruise ceiling while
        # holding the right bearing.
        corrected = False
        if abs(error) > yaw_tolerance:
            machine.stick(STICK_RIGHT if error > 0 else STICK_LEFT)
            time.sleep(min(0.3, max(0.02, abs(error) / 700)))
            machine.stick(STICK_STOP)
            corrected = True
        if abs(pitch_error) > 16:
            machine.stick(STICK_FORWARD if pitch_error > 0 else STICK_BACK)
            time.sleep(0.12)
            machine.stick(STICK_STOP)
            corrected = True
        if not corrected:
            time.sleep(0.4)
        machine.stick(STICK_STOP)
        state = machine.sample()
    machine.stick(STICK_STOP)
    return {"target": list(target), "outcome": outcome, "closest": closest,
            "rate": None if rate is None else int(rate), "ticks": log}


DESCENT_PITCH = LEVEL_PITCH + 96  # about thirty degrees below the horizon
FLARE_PITCH = LEVEL_PITCH + 24    # a shallow sink once the ground is close
FLARE = 60000                     # height at which to ease off and settle

# Atmospheric speed is nothing like the space table: the cruise measured tens
# of thousands of units a second at the high words, but word 4 nose-down loses
# only about 520 units of height a second, which is forty minutes from cruise
# height. The descent therefore runs several words higher and eases off late.
DESCENT_SPEED, FLARE_SPEED = 6, 2


def descend(machine: Machine, *, seconds: float) -> dict:
    """Fly the craft down onto the surface it is already over.

    Cutting the throttle is not enough on its own: the craft holds its height
    under power, and the one press ``set_speed`` makes per tick only scales the
    word, so the throttle has to be walked down over several ticks while the
    nose is held below the horizon. Near the ground the nose comes back to
    level and the craft settles, which is what raises ground contact at $7ACA
    -- flying into the surface nose-down destroys it instead, and a destroyed
    craft puts the player back on foot somewhere this probe did not choose.
    """
    log = []
    started = time.monotonic()
    landed = False
    state = machine.sample()
    while time.monotonic() - started < seconds:
        height = state["craftY"]
        flaring = height <= FLARE
        # Four is the lowest word a digit sets outright, so the descent
        # gets there in one press; the flare walks below it with the
        # scaling key, which is the only way under key 1.
        set_speed(machine, state, FLARE_SPEED if flaring else DESCENT_SPEED)
        pitch = state["pitch"] & YAW_MASK
        want_pitch = FLARE_PITCH if flaring else DESCENT_PITCH
        error = want_pitch - pitch
        error -= YAW_UNITS_PER_TURN if error > YAW_UNITS_PER_TURN // 2 else 0
        error += YAW_UNITS_PER_TURN if error < -YAW_UNITS_PER_TURN // 2 else 0
        log.append({"t": round(time.monotonic() - started, 2),
                    "craftY": height, "pitch": state["pitch"],
                    "throttle": state["throttle"], "flaring": flaring,
                    "groundContact": state["groundContact"],
                    "cell": state["cell"], "occupancy": state["occupancy"]})
        if state["groundContact"]:
            landed = True
            break
        if state["occupancy"] != 0:
            break
        if abs(error) > 16:
            machine.stick(STICK_FORWARD if error > 0 else STICK_BACK)
            time.sleep(0.12)
            machine.stick(STICK_STOP)
        else:
            time.sleep(0.3)
        state = machine.sample()
    machine.stick(STICK_STOP)
    return {"landed": landed, "ticks": log}


def leave_and_capture(machine: Machine, snapshot_out: Path) -> dict:
    """Step out of the craft and statesave the machine standing there."""
    machine.press(SCAN_LEAVE)
    time.sleep(1.5)
    state = machine.sample(keep=True, shot=True)
    if state["onFoot"] != 1:
        return {"saved": False, "reason": "did not leave the craft",
                "state": state}
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
                    "bodySelector": state["bodySelector"],
                    "cell": state["cell"], "state": state}
        time.sleep(0.2)
    return {"saved": False, "reason": "statesave did not land"}


def run(snapshot: Path, roms_root: Path | None, target: dict, *,
        capture_name: str | None, settle: float, board_slot: int | None,
        climb_seconds: float, cruise_seconds: float, descend_seconds: float,
        speed: int, arrive_cells: float, yaw_tolerance: int,
        ticks: int, burst: float, tolerance: int,
        fast_forward: bool) -> dict:
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

    run_directory = WORK_ROOT / _run_id(
        f"workspace-capture-{target['bodyName'].lower()}-{target['group']:02x}")
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

    goal = (((target["origin"][0] + WORKSPACE_CELLS // 2) * CELL_UNITS) % SURFACE_WRAP,
            ((target["origin"][1] + WORKSPACE_CELLS // 2) * CELL_UNITS) % SURFACE_WRAP)
    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "runDirectory": str(run_directory),
        "snapshot": {"path": str(snapshot), "sha256": _sha256(snapshot)},
        "probe": {
            "path": str(Path(__file__).resolve().relative_to(REPO)),
            "sha256": _sha256(Path(__file__).resolve()),
        },
        "toolchain": toolchain,
        "target": target,
        "goal": list(goal),
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
            if process.poll() is not None:
                # A memstate captured by a Hatari with CAPS/IPF floppy support
                # abandons the restore under the pinned build and the emulator
                # exits, which otherwise leaves this loop writing into a FIFO
                # nobody is reading. Say what to do about it (#331).
                raise LabError(
                    f"Hatari exited while restoring {snapshot.name}; boot the "
                    "rehosted container under snapshots/rehosted/ instead "
                    "(scripts/memstate-rehost.py)")
            os.set_blocking(handle.fileno(), False)
            machine = WatchedMachine(handle, run_directory, tuple(CRAFT_SLOTS))
            state = machine.sample(keep=True, shot=True)
            result["pose"] = state
            selector = int(state["bodySelector"], 16)
            if selector % 4 or selector // 4 != int(target["body"].split("-")[1]):
                raise LabError(
                    f"pose stands on body selector {state['bodySelector']}, not "
                    f"{target['bodyName']}; this probe flies within one body")
            slot = board_slot
            if slot is None:
                slot, gap = nearest_craft(state)
                result["nearestCraft"] = {"slot": slot, "cells": round(gap, 3)}
            if state["onFoot"] == 1:
                result["approach"] = approach(
                    machine, slot, tolerance=tolerance, ticks=ticks,
                    burst=burst, yaw_tolerance=yaw_tolerance)
                machine.press(SCAN_BOARD)
                time.sleep(1.5)
                result["afterBoard"] = machine.sample(keep=True, shot=True)
                if result["afterBoard"]["onFoot"] != 0:
                    raise LabError(f"boarding slot {slot} was refused")
            result["climb"] = climb(machine, speed=speed, seconds=climb_seconds)
            if result["climb"]["airborne"]:
                result["cruise"] = cruise(
                    machine, goal, seconds=cruise_seconds,
                    arrive=int(arrive_cells * CELL_UNITS),
                    yaw_tolerance=yaw_tolerance)
                if result["cruise"]["outcome"] == "arrived":
                    result["descent"] = descend(machine, seconds=descend_seconds)
                    if result["descent"]["landed"] and capture_name:
                        result["capture"] = leave_and_capture(
                            machine, SNAPSHOTS / f"{capture_name}.sav")
            result["final"] = machine.sample(keep=True, shot=True)
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
        json.dumps(result, indent=1, sort_keys=True, default=str) + "\n",
        encoding="utf-8")
    return result


def summarise(result: dict) -> None:
    target = result["target"]
    print(f"run: {Path(result['runDirectory']).name}")
    print(f"target: {target['bodyName']} group ${target['group']:02X} "
          f"{target['areaName'] or '(unnamed)'} origin {target['origin']}")
    pose = result["pose"]
    print(f"pose: body {pose['bodySelector']} cell {pose['cell']} "
          f"onFoot={pose['onFoot']} at ({pose['x']}, {pose['z']})")
    if "nearestCraft" in result:
        print(f"nearest craft: slot {result['nearestCraft']['slot']} at "
              f"{result['nearestCraft']['cells']} cells")
    if "climb" in result:
        print(f"climb: airborne={result['climb']['airborne']} in "
              f"{len(result['climb']['ticks'])} ticks")
    flight = result.get("cruise")
    if flight:
        print(f"cruise: {flight['outcome']} after {len(flight['ticks'])} ticks, "
              f"closest {flight['closest'] / CELL_UNITS:.2f} cells, "
              f"rate {flight['rate']} units/s")
        for row in flight["ticks"][::max(1, len(flight["ticks"]) // 12)]:
            print(f"  t+{row['t']:7.2f}s {row['cells']:9.2f} cells "
                  f"yawErr {row['yawError']:5d} y {row['craftY']:9d} "
                  f"cell {row['cell']}")
    if "descent" in result:
        print(f"descent: landed={result['descent']['landed']}")
    capture = result.get("capture")
    if capture:
        if capture.get("saved"):
            print(f"capture: {capture['path']}")
            print(f"  sha256 {capture['sha256']}")
            print(f"  body {capture['bodySelector']} cell {capture['cell']}")
        else:
            print(f"capture: refused -- {capture.get('reason')}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=_route.DEFAULT_SNAPSHOT,
                        help="pose to fly from; must already stand on the target body")
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--list", action="store_true",
                        help="list island records that bind a group and whether one is covered")
    parser.add_argument("--routes", action="store_true",
                        help="read every tracked memstate and report which gap each could fly to")
    parser.add_argument("--island", default=None, help="catalogue island record id")
    parser.add_argument("--group", type=lambda v: int(v, 0), default=None,
                        help="structure group number, e.g. 0x1d")
    parser.add_argument("--body", default=None, help="body name, to disambiguate --group")
    parser.add_argument("--capture", default=None, metavar="NAME",
                        help="statesave the landed pose to snapshots/NAME.sav")
    parser.add_argument("--board-slot", type=int, default=None,
                        help="craft slot to board; the nearest on this body by default")
    parser.add_argument("--settle", type=float, default=3.0)
    parser.add_argument("--climb-seconds", type=float, default=60.0)
    parser.add_argument("--cruise-seconds", type=float, default=600.0)
    parser.add_argument("--descend-seconds", type=float, default=120.0)
    parser.add_argument("--speed", type=int, default=5, choices=sorted(SCAN_DIGIT))
    parser.add_argument("--arrive-cells", type=float, default=2.0,
                        help="how close to the workspace middle counts as arrived")
    parser.add_argument("--yaw-tolerance", type=int, default=16)
    parser.add_argument("--ticks", type=int, default=400,
                        help="closed-loop walk ticks when the pose is on foot")
    parser.add_argument("--burst", type=float, default=0.25)
    parser.add_argument("--tolerance", type=int, default=CELL_UNITS // 4)
    parser.add_argument("--no-fast-forward", dest="fast_forward",
                        action="store_false", default=False)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    targets = island_targets()
    if args.list:
        for item in targets:
            print(f"{'OK ' if item['covered'] else 'GAP'} {item['bodyName']:<10} "
                  f"${item['group']:02X} {str(item['origin']):<14} "
                  f"{item['island']:<24} {item['areaName'] or ''}")
        gaps = sum(1 for item in targets if not item["covered"])
        print(f"{len(targets)} records bind a group; {gaps} have no recovered network")
        return
    if args.routes:
        routes = [row for row in pose_routes() if "target" in row]
        routes.sort(key=lambda row: (row["target"]["bodyName"],
                                     row["target"]["group"], row["target"]["cells"]))
        seen = set()
        for row in routes:
            item = row["target"]
            craft = ", ".join(
                f"slot {entry['slot']} at {entry['cells']}c key {entry['key']}"
                f"{'' if entry['boards'] else ' (gated)'}"
                for entry in row["craft"]) or "no craft on this body"
            print(f"{'FLY' if item['reachable'] else '---'} "
                  f"{item['bodyName']:<10} ${item['group']:02X} "
                  f"{item['cells']:>8.1f} cells  {row['snapshot']:<34} {craft}")
            seen.add((item["bodyName"], item["group"]))
        blocked = [item for item in island_targets()
                   if not item["covered"]
                   and (item["bodyName"], item["group"]) not in seen]
        for item in blocked:
            print(f"--- {item['bodyName']:<10} ${item['group']:02X} "
                  f"{'':>8}        no pose stands on this body")
        return
    if args.island is None and args.group is None:
        parser.error("name a target with --island or --group, or pass --list, --routes")

    target = select_target(targets, island=args.island, group=args.group,
                           body=args.body)
    if target["covered"]:
        print(f"note: {target['bodyName']} group ${target['group']:02X} already "
              "has a recovered road network", file=sys.stderr)
    result = run(
        args.snapshot, args.roms, target,
        capture_name=args.capture, settle=args.settle,
        board_slot=args.board_slot, climb_seconds=args.climb_seconds,
        cruise_seconds=args.cruise_seconds, descend_seconds=args.descend_seconds,
        speed=args.speed, arrive_cells=args.arrive_cells,
        yaw_tolerance=args.yaw_tolerance, ticks=args.ticks, burst=args.burst,
        tolerance=args.tolerance, fast_forward=args.fast_forward,
    )
    if args.json:
        print(json.dumps(result, indent=1, sort_keys=True, default=str))
    else:
        summarise(result)


if __name__ == "__main__":
    main()
