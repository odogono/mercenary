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

Every sample also reads the panel's cached location-name selector `$04DBF0`,
which `$04DBFA` points at VOID (`$78`) while `$7882` is non-zero.

Nothing is poked except the joystick soft-copy byte; keys are real key events.

Usage (from the repository root):

  python3 research/damocles-st/scripts/transporter-probe.py ring \
      --snapshot research/damocles-st/snapshots/rehosted/mentor-transporter.sav
  python3 research/damocles-st/scripts/transporter-probe.py digit --digit 4 \
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
FLOOR = 0x7AC4  # the Floor word; $0591FC writes its low byte from Association B byte 2
LATCH = 0x7884  # the transporter the ring handler last fired for, cleared on leaving
VIEW_YAW = 0x7AC2  # the yaw word $05913A reads for the direction
SCAN_DIGIT = {1: 0x02, 2: 0x03, 3: 0x04, 4: 0x05, 5: 0x06, 6: 0x07, 7: 0x08,
              8: 0x09, 9: 0x0A, 0: 0x0B}


class Machine(route.Machine):
    def sample(self, **kwargs) -> dict:
        index = self.samples
        state = super().sample(**kwargs)
        path = self.run_directory / "panel.bin"
        _fifo_send(self.handle, ["hatari-stop", f"hatari-debug savebin {path} ${PANEL_NAME:x} $2",
                                 "hatari-cont"])
        for _ in range(60):
            time.sleep(0.05)
            if path.is_file() and path.stat().st_size == 2:
                break
        state["panelName"] = (f"0x{int.from_bytes(path.read_bytes(), 'big'):04x}"
                              if path.is_file() and path.stat().st_size == 2 else None)
        path.unlink(missing_ok=True)
        kept = kwargs.get("keep", False)
        low = self.run_directory / (f"sample{index:03d}-low.bin" if kept else "tick-low.bin")
        if low.is_file():
            data = low.read_bytes()
            state["floor"] = route._u16(data, 0x6000, FLOOR)
            state["latch"] = f"0x{route._u16(data, 0x6000, LATCH):04x}"
            state["viewYaw"] = route._u16(data, 0x6000, VIEW_YAW)
        return state


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
    keys = ("bodySelector", "cell", "transporterMode", "latch", "panelName", "floor",
            "x", "y", "z", "yaw", "viewYaw", "onFoot")
    row = {key: state.get(key) for key in keys}
    row["message"] = (state.get("message") or {}).get("text")
    return row


def arrival(state: dict) -> dict:
    """The arrival measured against the slot the player now stands in."""
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
        if sample["bodySelector"] != before["bodySelector"] or sample["cell"] != before["cell"]:
            arrived = sample
            break
    after = machine.sample(keep=True, shot=True)
    log["moved"] = arrived is not None
    return {"before": brief(before), "hop": log, "path": path, "after": brief(after),
            "arrival": arrival(after)}


def leave(machine: Machine, stick: str, clear: int = 90) -> dict:
    """Pulse out of the cube the player stands in until clear of its box."""
    start = machine.sample()
    slot, _ = route.nearest_transporter(start)
    rows = []
    for _ in range(60):
        machine.stick(route.STICK_FORWARD if stick == "forward" else route.STICK_BACK)
        time.sleep(0.04)
        machine.stick(route.STICK_STOP)
        state = machine.sample()
        rows.append(brief(state))
        if route.distance(state, state["residents"][str(slot)]) > clear:
            break
    return {"slot": slot, "stick": stick, "path": rows[-3:], "steps": len(rows)}


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
            machine = Machine(handle, run_directory, route.TRANSPORTER_SLOTS)
            result["start"] = brief(machine.sample(keep=True, shot=True))
            result["entry"] = enter(machine, None if args.side == "keep" else args.side == "forward",
                                    args.standoff, backwards=args.backwards, aim=not args.no_aim,
                                    pulse=args.pulse)
            result["standing"] = hold(machine, args.hold)
            if args.case == "digit":
                before = machine.sample()
                machine.press(SCAN_DIGIT[args.digit])
                time.sleep(1.0)
                after = machine.sample(keep=True, shot=True)
                result["digit"] = {"digit": args.digit, "before": brief(before),
                                   "after": brief(after), "arrival": arrival(after)}
                result["afterDigit"] = hold(machine, args.hold)
                if args.reenter:
                    result["leave"] = leave(machine, args.leave)
                    result["reenter"] = enter(machine, None, args.standoff,
                                              backwards=args.leave == "forward", aim=False,
                                              turn=False)
                    result["afterReenter"] = hold(machine, args.hold)
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("case", choices=("ring", "digit"))
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
    parser.add_argument("--reenter", action="store_true",
                        help="after the digit hop, leave the cube and walk back in")
    parser.add_argument("--leave", choices=("forward", "back"), default="forward",
                        help="the stick that leaves; re-entry uses the other one")
    args = parser.parse_args()
    result = run(args)
    print(json.dumps({key: result[key] for key in result
                      if key in ("start", "entry", "standing", "digit", "afterDigit")},
                     indent=1, default=str))
    print("run:", result["runDirectory"])


if __name__ == "__main__":
    main()
