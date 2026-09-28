#!/usr/bin/env python3
"""Ordinary-route ground contact, and the direct-drop gate that reads it (#357).

The drop handler's direct path at `$054620`–`$05462E` refuses silently while
`$7ACA` reads zero, and `$7ACA` read 63 in every tracked memstate, so the
refusal had never been reached. This probe reaches it on an ordinary route and
brackets it with a control on the same route:

1. Restore the Dion pose (rehosted ``dion-2-3``), which stands beside
   `EAGLE NINE S E` carrying three objects, and press B.
2. **Ground drop.** Press the drop chord while the parked craft still has
   contact. The gate passes and the head of the Carried Stack is placed.
3. **Climb.** Hold a speed key with the nose up until `$7ACA` has read zero,
   above a clear height, for three samples running. The craft's own vertical
   update at `$0582AA` cleared it; nothing is poked.
4. **Air drop.** Press the drop chord again. The gate is reached and refuses.

`:trace` breakpoints mark the drop handler's entry `$054520`, the contact test
`$05462A` and the instruction after it, `$054632`. Hits are counted from the
emulator's log between phases, so each drop says whether it reached the gate
and whether it got past it.

Nothing is injected. Keys are real key events, the stick is the joystick-1 soft
copy the laboratory already uses, and every sample is a ``savebin`` taken while
the machine is stopped. The run is at the ordinary frame rate so that a held
drop chord is one keypress in guest time too.

Usage (from the repository root):

  python3 research/damocles-st/scripts/ground-contact-probe.py

See docs/research/damocles-ground-contact.md for the claims this run supports.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
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

# The arrival-route probe already owns the sampling machine, the resident
# decode and the key handling this route needs.
_spec = importlib.util.spec_from_file_location(
    "arrival_route_probe", Path(__file__).with_name("arrival-route-probe.py"))
route = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(route)

REPO = LAB_ROOT.parents[1]
WORK_ROOT = LAB_ROOT / "work"
SNAPSHOT = LAB_ROOT / "snapshots" / "rehosted" / "dion-2-3.sav"

SCAN_RSHIFT, SCAN_DOWN = 0x36, 0x50  # the drop chord
EAGLE = 3
CARRIED_COUNT, CARRIED_STACK = 0x61CC, 0x61CE

DROP_ENTRY = 0x054520
CONTACT_TEST = 0x05462A
PAST_CONTACT = 0x054632
MARKERS = (DROP_ENTRY, CONTACT_TEST, PAST_CONTACT)


def carried(machine) -> dict:
    """The Carried Stack and the head's resident, from a kept sample."""
    state = machine.sample(keep=True, shot=True)
    low = (machine.run_directory / f"sample{machine.samples - 1:03d}-low.bin").read_bytes()
    count = route._u16(low, 0x6000, CARRIED_COUNT)
    stack = list(low[CARRIED_STACK - 0x6000 : CARRIED_STACK - 0x6000 + count])
    return {
        "carriedCount": count,
        "carriedStack": stack,
        "groundContact": state["groundContact"],
        "occupancy": state["occupancy"],
        "boardedSlot": state["boardedSlot"],
        "craftX": state["craftX"], "craftY": state["craftY"], "craftZ": state["craftZ"],
        "sha256": state["sha256"],
    }


def hits(log: Path, offset: int) -> tuple[dict[str, int], int]:
    """Marker hits written to the emulator log since ``offset``."""
    text = log.read_bytes()
    fresh = text[offset:].decode("latin-1")
    counts = {f"0x{address:06x}": fresh.count(f"pc = ${address:x}") for address in MARKERS}
    return counts, len(text)


def drop(machine) -> None:
    for kind, scan, wait in (("keydown", SCAN_RSHIFT, 0.55), ("keydown", SCAN_DOWN, 0.15),
                             ("keyup", SCAN_DOWN, 0.30), ("keyup", SCAN_RSHIFT, 1.5)):
        _fifo_send(machine.handle, [f"hatari-event {kind} {scan}"])
        time.sleep(wait)


def climb(machine, *, speed: int, seconds: float, height: int) -> tuple[bool, list[dict]]:
    """Hold the throttle and the nose up until contact has read zero three times."""
    log = []
    clear = 0
    started = time.monotonic()
    while time.monotonic() - started < seconds:
        machine.press(route.SCAN_DIGIT[speed])
        state = machine.sample()
        if (state["pitch"] & route.YAW_MASK) > route.CLIMB_PITCH:
            machine.stick(route.STICK_BACK)
            time.sleep(0.15)
            machine.stick(route.STICK_STOP)
        log.append({"t": round(time.monotonic() - started, 2),
                    "groundContact": state["groundContact"],
                    "craftY": state["craftY"], "occupancy": state["occupancy"],
                    "throttle": state["throttle"]})
        if state["groundContact"] == 0 and state["craftY"] > height:
            clear += 1
            if clear >= 3:
                return True, log
        else:
            clear = 0
        time.sleep(0.2)
    return False, log


def run(snapshot: Path, roms_root: Path | None, *, settle: float, speed: int,
        climb_seconds: float, height: int) -> dict:
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    if not snapshot.is_file():
        raise LabError(f"Snapshot not found: {snapshot}. Rehost it first with "
                       "research/damocles-st/scripts/memstate-rehost.py")

    run_directory = WORK_ROOT / _run_id("ground-contact")
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    parse_script = run_directory / "play.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    log_path = run_directory / "hatari.log"
    command = build_hatari_command(
        hatari_binary=hatari_binary, tos=tos_path, disk_a=program_path,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse_script, fast_forward=False, statusbar=False,
        cmd_fifo=fifo, extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())

    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "runDirectory": str(run_directory),
        "snapshot": {"path": str(snapshot), "sha256": route._sha256(snapshot)},
        "probe": {"path": str(Path(__file__).resolve().relative_to(REPO)),
                  "sha256": route._sha256(Path(__file__).resolve())},
        "toolchain": toolchain,
        "markers": [f"0x{address:06x}" for address in MARKERS],
    }
    process = subprocess.Popen(command, stdout=log_path.open("wb"),
                               stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, env=env)
    try:
        for _ in range(200):
            if fifo.exists():
                break
            if process.poll() is not None:
                raise LabError("Hatari exited before creating the command FIFO")
            time.sleep(0.05)
        else:
            raise LabError("Hatari did not create the command FIFO")
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            if process.poll() is not None:
                raise LabError("Hatari exited during the restore; is the memstate rehosted?")
            machine = route.Machine(handle, run_directory, (EAGLE,))
            result["restored"] = carried(machine)
            machine.watch_program_counters(MARKERS)
            time.sleep(0.3)
            _, offset = hits(log_path, 0)

            machine.press(route.SCAN_BOARD)
            time.sleep(1.5)
            result["boarded"] = carried(machine)

            drop(machine)
            result["groundDrop"] = carried(machine)
            result["groundDrop"]["hits"], offset = hits(log_path, offset)
            head = result["boarded"]["carriedStack"][:1]
            if head:
                low = (run_directory / f"sample{machine.samples - 1:03d}-low.bin").read_bytes()
                result["groundDrop"]["placed"] = route.resident(low, head[0])

            airborne, trace = climb(machine, speed=speed, seconds=climb_seconds,
                                    height=height)
            result["climb"] = {"airborne": airborne, "trace": trace}
            _, offset = hits(log_path, offset)
            if airborne:
                result["beforeAirDrop"] = carried(machine)
                drop(machine)
                result["airDrop"] = carried(machine)
                result["airDrop"]["hits"], offset = hits(log_path, offset)
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
    print(Path(result["runDirectory"]).name)
    for key in ("restored", "boarded", "groundDrop", "beforeAirDrop", "airDrop"):
        if key not in result:
            continue
        s = result[key]
        print(f"  {key:14s} contact={s['groundContact']:3d} occupancy={s['occupancy']} "
              f"slot={s['boardedSlot']} y={s['craftY']} carried={s['carriedCount']} "
              f"stack={s['carriedStack']} hits={s.get('hits', '-')}")
    if "placed" in result.get("groundDrop", {}):
        print(f"  placed: {result['groundDrop']['placed']}")
    print(f"  airborne: {result['climb']['airborne']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--settle", type=float, default=3.0)
    parser.add_argument("--speed", type=int, default=4, choices=sorted(route.SCAN_DIGIT))
    parser.add_argument("--climb", type=float, default=60.0, metavar="SECONDS")
    parser.add_argument("--height", type=int, default=2000,
                        help="craft Y the climb must exceed with contact clear")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = run(args.snapshot, args.roms, settle=args.settle, speed=args.speed,
                 climb_seconds=args.climb, height=args.height)
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
