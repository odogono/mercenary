#!/usr/bin/env python3
"""Drive the Damocles transporter handlers live and record what they do (#1005).

`docs/research/damocles-arrival-routes.md` recovers the ring step at `$059126`
and the digit-key entry at `$059184` from the program image. This probe checks
the parts a port depends on against the running Working Authority:

- ``ring``: walk into the nearest transporter by the face that steps the ring
  the chosen way, then stand still. Records the arrival against the
  destination slot's resident entry (position, Floor word, yaw) and whether the
  destination fires again while the player stays in it.
- ``digit``: the same entry, then press a digit key while standing in the
  arrival transporter, which `$0555E4` routes to `$059184`.
- ``outside``: the same entry, then leave the arrival cube, confirm the latch
  `$7884` has cleared, press a digit key, and walk back in with the other stick.
- ``drop`` (#1007): put a TRANSPORTER on the Carried Stack as a take leaves it,
  walk clear of every cube, then drop it where the player stands, which puts the
  player inside its cube, and record whether the ring handler fires.
- ``digit --carry SLOT`` (#1017): after the entry, put `SLOT` on the Carried Stack at
  ``--carry-index`` and park the whole stack as `$052D42` does, then press SLOT's digit
  in the arrival cube. ``--exits`` then tries ways out of where that leaves the player:
  Drop and HELP, then ``--exit-digit`` in the cube, or leaving it, every digit outside
  it, and backing in again.

A hop is counted only from a tracing breakpoint on the common hop `$0591FA`,
armed before the first step, never inferred from a Body or cell change. Every
sample reads the player state, the Cell Readout's camera cell words
`$7A2C`/`$7A34` and the panel's cached location-name selector `$04DBF0` (which
`$04DBFA` points at VOID, `$78`, while `$7882` is non-zero) in one debugger
stop.

Nothing is poked except the joystick soft-copy byte, and for ``drop`` the carried
TRANSPORTER's handling byte, Association B and Carried Stack entry, written as an
ANTIGRAV take writes them; for ``digit --carry`` the same, plus each carried slot's
parked X, Y, Z, Association B and Association A byte 1 as `$052D42` writes them;
keys are real key events.

Usage (from the repository root):

  python3 research/damocles-st/scripts/transporter-probe.py ring \
      --snapshot research/damocles-st/snapshots/rehosted/mentor-transporter.sav
  python3 research/damocles-st/scripts/transporter-probe.py digit --digit 4 \
      --snapshot research/damocles-st/snapshots/rehosted/eris-transporter-11-8.sav
  python3 research/damocles-st/scripts/transporter-probe.py digit --digit 4 --carry 68 \
      --carry-index 2 --exits --side keep --no-aim \
      --snapshot research/damocles-st/snapshots/rehosted/eris-transporter-11-8.sav
"""

from __future__ import annotations

import argparse
import gzip
import importlib.util
import json
import os
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("arrival_route_probe", HERE / "arrival-route-probe.py")
route = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(route)

from damocleslab.core import LabError, validate_image  # noqa: E402
from damocleslab.laboratory import _fifo_send, _run_id, load_configuration, resolve_images, resolve_roms_root  # noqa: E402
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

PANEL_NAME = 0x04DBF0  # the selector $04DC18 last drew into the location field
HOP = 0x0591FA  # the common hop both handlers reach
READOUT_X, READOUT_Z = 0x7A2C, 0x7A34  # the camera cell words $04E246 draws as the Cell Readout
FLOOR = 0x7AC4  # the Floor word; $0591FC writes its low byte from Association B byte 2
LATCH = 0x7884  # the transporter the ring handler last fired for, cleared on leaving
VIEW_YAW = 0x7AC2  # the yaw word $05913A reads for the direction
SCAN_DROP = 0x50  # Down: the keyboard dispatcher's drop
CARRIED_COUNT, CARRIED_STACK = 0x61CC, 0x61CE
BRIEFCASE_STORE = 0x61CA  # how many objects a dropped BRIEFCASE holds, at stack index 10 up
HANDLING, ASSOCIATION_B = 0x6FAA, 0x73A8
CARRIED_FORM = 0x78010010  # Association B of a carried object at stack index 0
RESIDENT_X, RESIDENT_Y, RESIDENT_Z, ASSOCIATION_A = 0x63A8, 0x67A8, 0x6BA8, 0x6FA8
FRAMES = 0x7AE8  # steps once a rendered frame ($0599A0)
SCAN_HELP = 0x62  # opens the F1 SAVE / F2 LOAD / F10 QUIT menu
SCAN_SPACE = 0x39
SCAN_DIGIT = {1: 0x02, 2: 0x03, 3: 0x04, 4: 0x05, 5: 0x06, 6: 0x07, 7: 0x08,
              8: 0x09, 9: 0x0A, 0: 0x0B}


class Machine(route.Machine):
    """The arrival-route machine, reading the panel selector in the same stop as the state."""

    def sample(self, *, shot: bool = False, keep: bool = False, full: bool = False) -> dict:
        index = self.samples
        self.samples += 1
        prefix = f"sample{index:03d}" if keep else "tick"
        windows = [route.WINDOWS[0], ("panel", PANEL_NAME, 2)]
        if self.strings is None or keep or full:
            windows += list(route.WINDOWS[1:])
        blobs = dict(self.strings or {})
        # The remote debugger now and then drops a burst of FIFO lines; send the stop again.
        # Each attempt dumps to its own paths and counts only if it wrote every window, so a
        # sample never mixes windows from two stops.
        for attempt in range(8):
            if attempt:
                # #1022: a dropped burst can leave the machine stopped; continue it first.
                _fifo_send(self.handle, ["hatari-cont"])
                time.sleep(0.5)
            paths = {label: self.run_directory / f"{prefix}-{attempt}-{label}.bin"
                     for label, _, _ in windows}
            for path in paths.values():
                path.unlink(missing_ok=True)
            commands = ["hatari-stop", "hatari-debug setopt hex"]
            commands += [f"hatari-debug savebin {paths[label]} ${base:x} ${length:x}"
                         for label, base, length in windows]
            if shot:
                commands.append(f"hatari-debug screenshot {self.run_directory}/{prefix}.png")
            commands.append("hatari-cont")
            _fifo_send(self.handle, commands)
            read = {}
            for (label, _, length), path in zip(windows, paths.values()):
                for _ in range(100):
                    if path.is_file() and path.stat().st_size == length:
                        break
                    time.sleep(0.03)
                else:
                    break
                read[label] = path.read_bytes()
            else:
                blobs.update(read)
                break
        else:
            raise LabError(f"sample {index} read nothing for window {label}")
        if self.strings is None:
            self.strings = {label: blobs[label] for label in ("strings", "pool")}
        state = route.decode(blobs, self.watch)
        low = blobs["low"]
        state["panelName"] = f"0x{int.from_bytes(blobs['panel'], 'big'):04x}"
        state["floor"] = route._u16(low, 0x6000, FLOOR)
        state["latch"] = f"0x{route._u16(low, 0x6000, LATCH):04x}"
        state["viewYaw"] = route._u16(low, 0x6000, VIEW_YAW)
        state["cellReadout"] = [int.from_bytes(low[a - 0x6000:a - 0x5FFE], "big", signed=True)
                                for a in (READOUT_X, READOUT_Z)]
        state["hops"] = self.hops()
        state["frames"] = route._u16(low, 0x6000, FRAMES)
        count = route._u16(low, 0x6000, CARRIED_COUNT)
        state["carried"] = list(low[CARRIED_STACK - 0x6000:CARRIED_STACK - 0x6000 + count])
        return state

    def poke(self, address: int, data: bytes) -> None:
        _fifo_send(self.handle, [
            "hatari-stop", "hatari-debug setopt hex",
            f"hatari-debug w ${address:x} " + " ".join(f"{byte:02x}" for byte in data),
            "hatari-cont",
        ])
        time.sleep(0.2)

    def carry(self, slot: int, index: int = 0, park: bool = False) -> list[int]:
        """Push `slot` on the Carried Stack as a take does: the head, its carried bit set and
        its Association B the carried form. The scene pass renumbers the stack index.

        `index` puts it lower in the stack instead, and `park` then writes every entry's
        parked placement as `$052D42` does, so nothing waits on a rebuild. An `index` of 10
        or more puts it in the BRIEFCASE store instead: at that array index beyond the count,
        `$61CA` counting the store, parked as the pass last left it before the drop."""
        stack = self.sample()["carried"]
        # Ten carried and ten stored are the most there can be; a carried index past the end
        # of the stack would land lower than asked, and the result would misreport it.
        if not 0 <= index < 20:
            raise LabError(f"--carry-index {index} is outside 0-19")
        if index < 10 and index > len(stack):
            raise LabError(f"--carry-index {index} is past the {len(stack)}-entry Carried Stack")
        if index >= 10:
            self.poke(ASSOCIATION_B + slot * 4, CARRIED_FORM.to_bytes(4, "big"))
            self.poke(HANDLING + slot * 4, bytes([0xA0]))
            self.poke(CARRIED_STACK + index, bytes([slot]))
            self.poke(BRIEFCASE_STORE, (index - 9).to_bytes(2, "big"))
            self.park(slot, index)
            return stack + [None] * (index - len(stack)) + [slot]
        stack.insert(index, slot)
        # Association B and the carried bit first, so no pass sees a listed slot left resident.
        self.poke(ASSOCIATION_B + slot * 4, CARRIED_FORM.to_bytes(4, "big"))
        self.poke(HANDLING + slot * 4, bytes([0xA0]))
        self.poke(CARRIED_STACK, bytes(stack))
        self.poke(CARRIED_COUNT, len(stack).to_bytes(2, "big"))
        if park:
            for position, entry in enumerate(stack):
                self.park(entry, position)
        return stack

    def park(self, slot: int, index: int) -> None:
        """`$052D42`'s writes for the carried entry at `index`, its wrap at ten included."""
        row, z = (index, 0x1831C) if index < 10 else (index - 10, 0x2831C)
        form = 0x78010000 | row << 8 | (0x10 if index < 10 else 0x20)
        offset = slot * 4
        self.poke(RESIDENT_X + offset, (0x81D5).to_bytes(4, "big"))
        self.poke(RESIDENT_Y + offset, (0x12C * row).to_bytes(4, "big"))
        self.poke(RESIDENT_Z + offset, z.to_bytes(4, "big"))
        self.poke(ASSOCIATION_B + offset, form.to_bytes(4, "big"))
        self.poke(ASSOCIATION_A + offset + 1, bytes([0x31]))

    def arm_hop_trace(self) -> None:
        self.watch_program_counters((HOP,))

    def hops(self) -> int:
        """Tracing breakpoint hits on the common hop, read from the emulator's log."""
        log = self.run_directory / "hatari.log"
        if not log.is_file():
            return 0
        text = log.read_text(errors="replace").lower()
        # A hit prints the condition with its ":trace" option; the echo of the
        # command that armed it starts with ">", and its confirmation has no option.
        return sum(1 for line in text.splitlines()
                   if f"${HOP:x} :trace" in line and not line.lstrip().startswith(">"))


def retarget(snapshot: Path, run_directory: Path, tos: Path, program: Path) -> tuple[Path, list[str]]:
    """A run-local copy of the memstate whose stored image paths name the pinned images.

    Hatari reloads TOS and the floppy from the absolute paths a memstate stores,
    so a capture taken under another checkout path, or under the Hatari.app
    bundle's own `tos.img`, restores to a machine with no TOS. The bundled image
    is byte-identical to the pinned `emutos206.img`, so pointing the field at the
    pinned file restores the same machine. Each path is a NUL-padded fixed-size
    field: the replacement is padded to the old field's extent, and refused if
    it would not fit.
    """
    data = bytearray(gzip.decompress(snapshot.read_bytes()))
    replaced = []
    for suffix, target in ((b"tos.img", tos), (b"emutos206.img", tos), (b".stx", program)):
        new = str(target.resolve()).encode()
        start = 0
        while (end := data.find(suffix + b"\x00", start)) >= 0:
            end += len(suffix)
            begin = data.rfind(b"\x00", 0, end) + 1
            while begin < end and data[begin] < 0x20:  # a flag byte can precede the field
                begin += 1
            old = bytes(data[begin:end])
            start = end
            if not old.startswith(b"/") or old == new:
                continue
            pad = end
            while pad < len(data) and data[pad] == 0:
                pad += 1
            if len(new) > pad - begin - 1:
                raise LabError(f"pinned path does not fit the stored field for {old!r}")
            data[begin:pad] = new + b"\x00" * (pad - begin - len(new))
            replaced.append(old.decode(errors="replace"))
    out = run_directory / "retargeted.sav"
    out.write_bytes(gzip.compress(bytes(data), mtime=0))
    return out, replaced


def brief(state: dict) -> dict:
    keys = ("hops", "frames", "bodySelector", "cell", "cellReadout", "transporterMode",
            "latch", "panelName", "floor", "x", "y", "z", "yaw", "viewYaw", "onFoot")
    row = {key: state.get(key) for key in keys}
    row["message"] = (state.get("message") or {}).get("text")
    return row


def arrival(state: dict, hopped: bool) -> dict | None:
    """The arrival measured against the nearest slot, only after a counted hop."""
    if not hopped:
        return None
    slot, gap = route.nearest_transporter(state)
    cube = state["residents"][str(slot)]
    return {
        "slot": slot,
        "associationB": cube["associationB"],
        "offset": {"x": state["x"] - cube["x"], "y": state["y"] - cube["y"],
                   "z": state["z"] - cube["z"]},
        "floorWord": state.get("floor"),
        "associationLevel": int(cube["associationB"], 16) >> 8 & 0xFF,
    }


def enter(machine: Machine, forward: bool | None, standoff: int, backwards: bool = False,
          aim: bool = True, turn: bool = True, pulse: float = 0.04) -> dict:
    """Walk into the nearest transporter, from the side that steps the ring `forward`.

    `None` keeps whichever side the player is already on. `backwards` faces away
    from the cube and walks in backwards, which `$059152` inverts.
    """
    before = machine.sample()
    slot, gap = route.nearest_transporter(before)
    cube = before["residents"][str(slot)]
    log = {"fromSlot": slot, "fromDistance": gap}
    if forward is not None:
        want_yaw = 0x040 if forward else 0x1C0
        unit = route.direction_unit(want_yaw)
        standpoint = (int(cube["x"] - unit[0] * standoff), int(cube["z"] - unit[1] * standoff))
        log["standWalk"] = route.walk_to(machine, standpoint, tolerance=40, ticks=80,
                                         burst=0.12, yaw_tolerance=14)["outcome"]
    if aim:
        log["aim"] = route.approach(machine, slot, tolerance=0, ticks=12, burst=0.05,
                                    yaw_tolerance=10)["outcome"]
    machine.stick(route.STICK_STOP)
    if backwards and turn:
        # Turn half a circle, then back in. The turn rate is learned, not assumed.
        aimed = machine.sample()
        target = (aimed["yaw"] + 512) & route.YAW_MASK
        for _ in range(40):
            state = machine.sample()
            error = (target - (state["yaw"] & route.YAW_MASK)) % 1024
            error -= 1024 if error > 512 else 0
            if abs(error) <= 12:
                break
            machine.stick(route.STICK_RIGHT if error > 0 else route.STICK_LEFT)
            time.sleep(min(0.3, max(0.03, abs(error) / 500)))
            machine.stick(route.STICK_STOP)
    entry = machine.sample()
    log["entryYaw"] = entry["yaw"] & route.YAW_MASK
    log["bearingStepsForward"] = route.steps_forward(route.heading_to(entry, cube))
    log["stick"] = "back" if backwards else "forward"
    # Short pulses, each followed by a stopped sample, so the player is standing
    # still the moment the hop lands rather than walking on out of the arrival cube.
    path = []
    arrived = None
    for _ in range(120):
        machine.stick(route.STICK_BACK if backwards else route.STICK_FORWARD)
        time.sleep(pulse)
        machine.stick(route.STICK_STOP)
        sample = machine.sample()
        path.append(brief(sample))
        if sample["hops"] > before["hops"]:
            arrived = sample
            break
    after = machine.sample(keep=True, shot=True)
    log["hopped"] = arrived is not None
    log["hopsBefore"], log["hopsAfter"] = before["hops"], after["hops"]
    return {"before": brief(before), "hop": log, "path": path, "after": brief(after),
            "arrival": arrival(after, arrived is not None)}


def leave(machine: Machine, stick: str, clear: int = 90) -> dict:
    """Pulse out of the cube the player stands in until clear of its box and the latch is 0."""
    start = machine.sample()
    slot, _ = route.nearest_transporter(start)
    rows = []
    for _ in range(60):
        machine.stick(route.STICK_FORWARD if stick == "forward" else route.STICK_BACK)
        time.sleep(0.04)
        machine.stick(route.STICK_STOP)
        state = machine.sample()
        rows.append(brief(state))
        if route.distance(state, state["residents"][str(slot)]) > clear and state["latch"] == "0x0000":
            break
    return {"slot": slot, "stick": stick, "path": rows[-3:], "steps": len(rows),
            "cleared": rows[-1]["latch"] == "0x0000" if rows else False}


def press_digit(machine: Machine, digit: int) -> dict:
    before = machine.sample()
    slot, gap = route.nearest_transporter(before)
    machine.press(SCAN_DIGIT[digit])
    time.sleep(1.0)
    after = machine.sample(keep=True, shot=True)
    hopped = after["hops"] > before["hops"]
    return {"digit": digit, "standingSlot": slot, "distance": gap,
            "before": brief(before), "after": brief(after), "hopped": hopped,
            "arrival": arrival(after, hopped)}


def drop_transporter(machine: Machine, slot: int, clear: int, seconds: float) -> dict:
    """Carry `slot`, back away until clear of every cube by `clear`, then drop it."""
    stack = machine.carry(slot)
    carrying = machine.sample(keep=True)
    rows = []
    for _ in range(80):
        state = machine.sample()
        near, gap = route.nearest_transporter(state)
        rows.append(brief(state))
        if gap > clear and state["latch"] == "0x0000":
            break
        machine.stick(route.STICK_BACK)
        time.sleep(0.05)
        machine.stick(route.STICK_STOP)
    before = machine.sample(keep=True, shot=True)
    _, gap = route.nearest_transporter(before)
    if gap <= clear or before["latch"] != "0x0000":
        raise LabError(f"did not clear every cube before the drop: {gap} units, latch {before['latch']}")
    machine.press(SCAN_DROP)
    after = []
    started = time.monotonic()
    while time.monotonic() - started < seconds:
        try:
            state = machine.sample()
        except LabError as error:  # a hop to another Body loads from disk; the stop can lag
            after.append({"error": str(error)})
            time.sleep(1.0)
            continue
        after.append(brief(state) | {"carried": state["carried"]})
        time.sleep(0.2)
    for _ in range(10):
        try:
            last = machine.sample(keep=True, shot=True)
            break
        except LabError:
            time.sleep(1.0)
    else:
        raise LabError("the machine did not answer after the drop")
    if slot in last["carried"]:
        raise LabError(f"the drop was refused: slot {slot} is still carried")
    cube = last["residents"][str(slot)]
    return {
        "slot": slot, "stackAfterCarry": stack, "carriedRead": carrying["carried"],
        "backedAway": rows[-3:], "beforeDrop": brief(before) | {"carried": before["carried"]},
        "afterDrop": after, "last": brief(last) | {"carried": last["carried"]},
        "dropped": {"x": cube["x"], "y": cube["y"], "z": cube["z"],
                    "associationB": cube["associationB"]},
        "hopped": last["hops"] > before["hops"],
    }


def carried_slot(state: dict, slot: int) -> dict:
    return brief(state) | {"carried": state["carried"], "slot": state["residents"][str(slot)]}


def exits(machine: Machine, slot: int, seconds: float, digit: int | None, standoff: int,
          pulse: float) -> dict:
    """Every way out tried from where the digit left the player, each sampled after.

    Standing, Drop and HELP first, still in the cube the digit left them in. Then
    `digit` pressed there; or, with none, walk forwards out of that cube, sweep every
    digit outside it, and back into it along the same line.
    """
    out: dict = {"standing": hold(machine, seconds)}
    before = machine.sample(keep=True)
    machine.press(SCAN_DROP)
    time.sleep(1.5)
    after = machine.sample(keep=True, shot=True)
    out["drop"] = {"before": carried_slot(before, slot), "after": carried_slot(after, slot),
                   "accepted": len(after["carried"]) < len(before["carried"])}
    machine.press(SCAN_HELP)
    time.sleep(1.5)
    menu = machine.sample(keep=True, shot=True)
    machine.press(SCAN_SPACE)
    time.sleep(1.5)
    out["help"] = {"menu": brief(menu), "afterSpace": brief(machine.sample(keep=True, shot=True))}
    if digit is not None:
        out["digit"] = press_digit(machine, digit)
        out["afterDigit"] = hold(machine, seconds)
        return out
    out["leave"] = leave(machine, "forward")
    out["outside"] = carried_slot(machine.sample(keep=True, shot=True), slot)
    out["digits"] = []
    for key in range(10):
        start = machine.sample()
        machine.press(SCAN_DIGIT[key])
        time.sleep(0.6)
        end = machine.sample()
        out["digits"].append({"digit": key, "hopped": end["hops"] > start["hops"], "after": brief(end)})
    out["reenter"] = enter(machine, None, standoff, backwards=True, aim=False, turn=False,
                           pulse=pulse)
    out["afterReenter"] = hold(machine, seconds)
    return out


def face(machine: Machine, point: tuple[int, int], tolerance: int = 8) -> dict:
    """Turn on the spot until facing `point` (#1022)."""
    state = machine.sample()
    for _ in range(60):
        state = machine.sample()
        want = route.heading_to(state, {"x": point[0], "z": point[1]})
        error = (want - (state["yaw"] & route.YAW_MASK)) % 1024
        error -= 1024 if error > 512 else 0
        if abs(error) <= tolerance:
            break
        machine.stick(route.STICK_RIGHT if error > 0 else route.STICK_LEFT)
        time.sleep(min(0.3, max(0.06, abs(error) / 600)))
        machine.stick(route.STICK_STOP)
        time.sleep(0.08)
    return {"yaw": state["yaw"] & route.YAW_MASK, "x": state["x"], "z": state["z"]}


def stroll(machine: Machine, point: tuple[int, int], tolerance: int = 24) -> dict:
    """Walk to `point` in short pulses, stopping when it stops closing (#1022)."""
    rows = []
    best, stalled = None, 0
    for _ in range(200):
        state = machine.sample()
        gap = max(abs(point[0] - state["x"]), abs(point[1] - state["z"]))
        rows.append({"x": state["x"], "z": state["z"], "regionFlags": state.get("regionFlags"),
                     "gap": gap})
        if gap <= tolerance:
            return {"outcome": "arrived", "path": rows[-4:], "steps": len(rows)}
        if best is None or gap < best - 4:
            best, stalled = gap, 0
        else:
            stalled += 1
            if stalled >= 12:
                return {"outcome": "stalled", "path": rows[-4:], "steps": len(rows)}
        # One debugger stop per step: Hatari stops reading the FIFO after a few hundred.
        want = route.heading_to(state, {"x": point[0], "z": point[1]})
        error = (want - (state["yaw"] & route.YAW_MASK)) % 1024
        error -= 1024 if error > 512 else 0
        if abs(error) > 16:
            stalled = max(0, stalled - 1)
            machine.stick(route.STICK_RIGHT if error > 0 else route.STICK_LEFT)
            time.sleep(min(0.3, max(0.06, abs(error) / 600)))
        else:
            machine.stick(route.STICK_FORWARD)
            time.sleep(min(0.25, max(0.06, gap / 1500)))
        machine.stick(route.STICK_STOP)
        time.sleep(0.08)
    return {"outcome": "exhausted", "path": rows[-4:], "steps": len(rows)}


def look(machine: Machine, slot: int, floors: list[int], out: dict) -> dict:
    """VOID's carried column (#1022): from the carried cube, leave it, look back at it,
    walk through the door into the lift, ride to each Floor in `floors`, walk back out
    and look at the column there. Every view is sampled with its screenshot."""
    out["leave"] = leave(machine, "forward")
    start = machine.sample()
    cube = start["residents"][str(slot)]
    # Cell origin of the bound structure: the cell's own corner plus the $8000 bias.
    origin = (cube["x"] - (cube["x"] & 0xFFFF) + 0x8000, cube["z"] - (cube["z"] & 0xFFFF) + 0x8000)
    column = (cube["x"], cube["z"])
    view = (origin[0] + 450, origin[1] + 1150)
    lift = (origin[0] + 450, origin[1] + 150)
    # Round the carried cube at the column, never through it: crossing it fires the ring.
    around = [(origin[0] + 150, origin[1] + 1100), (origin[0] + 150, origin[1] + 450),
              (origin[0] + 450, origin[1] + 450)]
    def route_to(points: list[tuple[int, int]]) -> list[dict]:
        legs = []
        for point in points:
            legs.append(stroll(machine, point))
            if machine.sample()["bodySelector"] != "0x0078":
                legs.append({"left VOID": True})
                break
        return legs
    out["origin"] = origin
    def snap(label: str, target: tuple[int, int]) -> dict:
        turned = face(machine, target)
        state = machine.sample(keep=True, shot=True)
        return {"label": label, "faced": turned, "state": brief(state) | {
            "regionFlags": state.get("regionFlags"), "carried": state["carried"],
            "residents": {key: value for key, value in state["residents"].items()
                          if key in {str(s) for s in state["carried"]}}},
            "sample": machine.samples - 1}
    out["views"] = [snap("back of room, facing the column and door", column)]
    out["toView"] = route_to([around[0], view])
    out["views"].append(snap("far wall, facing the column", column))
    out["toLift"] = route_to(around + [lift])
    out["views"].append(snap("lift, facing back into the room", column))
    out["rides"] = []
    for floor in floors:
        before = machine.sample()
        machine.press(SCAN_DIGIT[floor] if floor else 0x22)
        rows = []
        for _ in range(40):
            time.sleep(0.25)
            state = machine.sample()
            rows.append({"floor": state["floor"], "y": state["y"], "regionFlags": state.get("regionFlags")})
            if state["floor"] == floor and state["y"] == 300 * floor + 63:
                break
        ride = {"floor": floor, "before": brief(before), "path": rows[-4:]}
        out["rides"].append(ride)
        ride["views"] = [snap(f"floor {floor}, lift, facing the room", column)]
        ride["toView"] = route_to(list(reversed(around)) + [view])
        ride["views"].append(snap(f"floor {floor}, far wall, facing the column", column))
        ride["toLift"] = route_to(around + [lift])
    return out


def hold(machine: Machine, seconds: float) -> list[dict]:
    rows = []
    started = time.monotonic()
    while time.monotonic() - started < seconds:
        rows.append(brief(machine.sample()))
        time.sleep(0.3)
    return rows


def run(args) -> dict:
    authority, config = load_configuration()
    root = resolve_roms_root(args.roms)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    if not args.snapshot.is_file():
        raise LabError(f"Snapshot not found: {args.snapshot}")

    run_directory = route.WORK_ROOT / _run_id(f"transporter-{args.case}")
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    parse_script = run_directory / "play.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    memstate, retargeted = retarget(args.snapshot, run_directory, tos_path, program_path)
    command = build_hatari_command(
        hatari_binary=hatari_binary, tos=tos_path, disk_a=program_path,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse_script, fast_forward=False, statusbar=False, cmd_fifo=fifo,
        extra_args=["--memstate", str(memstate.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "case": args.case,
        "runDirectory": str(run_directory),
        "snapshot": {"path": str(args.snapshot), "sha256": route._sha256(args.snapshot),
                     "retargetedPaths": retargeted},
        "probe": {"path": str(Path(__file__).resolve().relative_to(route.REPO)),
                  "sha256": route._sha256(Path(__file__).resolve())},
        "toolchain": toolchain,
    }
    class _Done(Exception):
        pass

    process = subprocess.Popen(command, stdout=(run_directory / "hatari.log").open("wb"),
                               stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(200):
            if fifo.exists():
                break
            time.sleep(0.05)
        else:
            raise LabError("Hatari did not create the command FIFO")
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(args.settle)
            machine = Machine(handle, run_directory,
                              tuple(route.TRANSPORTER_SLOTS) + tuple(args.watch or ()))
            machine.arm_hop_trace()
            result["start"] = brief(machine.sample(keep=True, shot=True))
            if args.case == "drop":
                result["drop"] = drop_transporter(machine, args.slot, args.clear, args.hold)
                _fifo_send(handle, ["hatari-stop"])
                time.sleep(0.4)
                raise _Done
            result["entry"] = enter(machine, None if args.side == "keep" else args.side == "forward",
                                    args.standoff, backwards=args.backwards, aim=not args.no_aim,
                                    pulse=args.pulse)
            result["standing"] = hold(machine, args.hold)
            if args.case == "digit":
                if args.carry is not None:
                    result["carry"] = {"slot": args.carry, "index": args.carry_index,
                                       "stack": machine.carry(args.carry, args.carry_index, park=True)}
                    result["carry"]["read"] = carried_slot(machine.sample(keep=True), args.carry)
                result["digit"] = press_digit(machine, args.digit)
                result["afterDigit"] = hold(machine, args.hold)
                if args.look is not None:
                    result["look"] = {}
                    result["look"] = look(machine, args.carry or 64 + args.digit, args.look,
                                          result["look"])
                if args.exits:
                    result["exits"] = exits(machine, args.carry or 64 + args.digit, args.hold,
                                            args.exit_digit, args.standoff, args.pulse)
            if args.case == "outside":
                result["leave"] = leave(machine, args.leave)
                result["digit"] = press_digit(machine, args.digit)
                result["reenter"] = enter(machine, None, args.standoff,
                                          backwards=args.leave == "forward", aim=False,
                                          turn=False, pulse=args.pulse)
                result["afterReenter"] = hold(machine, args.hold)
            _fifo_send(handle, ["hatari-stop"])
            time.sleep(0.4)
    except _Done:
        pass
    except LabError as error:
        result["error"] = str(error)
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("case", choices=("ring", "digit", "outside", "drop"))
    parser.add_argument("--slot", type=int, default=66, choices=range(64, 74),
                        help="drop: the TRANSPORTER to carry and drop")
    parser.add_argument("--carry", type=int, default=None, choices=range(64, 74),
                        help="digit: carry this TRANSPORTER, parked, before pressing the digit")
    parser.add_argument("--carry-index", type=int, default=0,
                        help="digit: the Carried Stack index --carry goes in at")
    parser.add_argument("--exits", action="store_true",
                        help="digit: after the hop, try Drop, HELP, then a way out")
    parser.add_argument("--exit-digit", type=int, default=None, choices=range(10),
                        help="--exits: press this digit in the cube; without it, leave and walk back in")
    parser.add_argument("--clear", type=int, default=400,
                        help="drop: back away until this far from every cube")
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--settle", type=float, default=3.0)
    parser.add_argument("--hold", type=float, default=4.0,
                        help="seconds to stand still after each hop")
    parser.add_argument("--side", choices=("forward", "backward", "keep"), default="forward",
                        help="enter from the side whose bearing steps the ring this way")
    parser.add_argument("--backwards", action="store_true",
                        help="face away from the cube and walk in backwards")
    parser.add_argument("--standoff", type=int, default=260)
    parser.add_argument("--no-aim", action="store_true",
                        help="walk in along the pose's own facing")
    parser.add_argument("--digit", type=int, default=4, choices=range(10))
    parser.add_argument("--pulse", type=float, default=0.04,
                        help="seconds the stick is held per step of the entry walk")
    parser.add_argument("--leave", choices=("forward", "back"), default="forward",
                        help="outside: the stick that leaves; re-entry uses the other one")
    parser.add_argument("--look", type=int, nargs="*", default=None,
                        help="digit --carry (#1022): leave the VOID cube, look, then ride the lift to these Floors")
    parser.add_argument("--watch", type=int, nargs="*", default=None,
                        help="extra resident slots to read in every sample")
    args = parser.parse_args()
    result = run(args)
    print(json.dumps({key: result[key] for key in result
                      if key in ("entry", "carry", "leave", "digit", "reenter", "drop", "look")},
                     indent=1, default=str))
    print("run:", result["runDirectory"])


if __name__ == "__main__":
    main()
