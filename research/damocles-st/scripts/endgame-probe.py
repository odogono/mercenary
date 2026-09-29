#!/usr/bin/env python3
"""Drive the Damocles endgame on a real machine: the impact, the BOOK's wishes (#622).

Research instrumentation for #622, not a payload writer. The desk decode in
docs/research/damocles-endgame.md says:

- at zero on the Impact Clock, `$051F42` destroys DAMOCLES and ERIS through the
  destruction marker `$04C98E` and fires trigger `$0F`, unless the drift `$7A7E`
  is armed or either body is already gone;
- the destruction marker kills a player standing on the destroyed Body
  (`$04C9F2` → `$04CBAE`: system string `$23`, `$7A64` ← 1);
- a BOOK page read with the MAGIC CRYSTAL carried queues `$7B96` ← `$8000`, and
  the script dispatch head then runs `$04D7F0` on the page index `$7857`.
  Page 3 destroys DAMOCLES and fires `$17`; page 5 arms the drift
  `$FFFFEDCC` and fires `$3C`.

Every case injects, and says what it pokes. The wishes are injected at the
dispatch head's inputs (`$7856`/`$7857`, `$7126` bit 7, `$7B96`), which is
exactly what `$0547F2` leaves after a Read; nothing downstream is poked. The
impact is reached by poking the clock forward to a few seconds before zero,
which the waypoint mover already tolerates (#440's `waypoint` case).

Cases (``--case``):

``impact``   poke the clock to ``--seconds`` before zero and sample past it.
``wish``     inject BOOK page ``--page``, sample, then (``--then-impact``)
             poke the clock and sample past zero.

Usage (from the repository root):

  research/damocles-st/.venv/bin/python research/damocles-st/scripts/endgame-probe.py \\
      --case impact --snapshot research/damocles-st/snapshots/rehosted/dion-2-3.sav
  research/damocles-st/.venv/bin/python research/damocles-st/scripts/endgame-probe.py \\
      --case wish --page 5 --then-impact \\
      --snapshot research/damocles-st/snapshots/rehosted/dion-2-3.sav

Each sample is a full 1 MiB `savebin` and a screenshot, taken stopped, in an
ignored `work/endgame-*` run directory with a `result.json`.
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

ERIS, DAMOCLES = 11 * 4, 29 * 4
BODY_STATE = 0x626A          # word per Body; bit 15 set = destroyed ($04C9B6)
CLOCK = 0x793C               # signed seconds, minus the time left
DRIFT_ARM = 0x7A7E
IMPACT_FLAG = 0x7A82
DESTROYED = 0x7BEA           # count of destroyed Bodies ($04C9BC)
DEATH = 0x7A64               # 1 once the player is dead (#581)
PLAYER_BODY = 0x7AA8         # the player's Body selector
OCCUPANCY = 0x7AAE
PENDING = 0x7A88             # the queued trigger
SCRIPT_PC = 0x781E
MESSAGE = 0x7B98             # pointer to the message being revealed
GATE = 0x7BA0
PAGE_GATE = 0x7B96
DOCUMENT = 0x7856            # object, then the page index at $7857
CRYSTAL = 0x7126             # bit 7: the MAGIC CRYSTAL carried
PAUSE_GATE = 0x7A26

# The code the claims rest on, fingerprinted on the first sample.
CODE_WINDOWS = (
    ("$04C8D2-$04CA20 destruction dispatcher and marker", 0x4C8D2, 0x4CA20),
    ("$04CBAE-$04CBDA death on a destroyed Body", 0x4CBAE, 0x4CBDA),
    ("$04D7F0-$04D8F0 the BOOK's page actions", 0x4D7F0, 0x4D8F0),
    ("$051F42-$051FD0 zero on the clock", 0x51F42, 0x51FD0),
    ("$0547C6-$054808 the deferred Read", 0x547C6, 0x54808),
)


def poke(address: int, value: int, size: int) -> str:
    body = " ".join(f"{byte:02x}"
                    for byte in (value & ((1 << 8 * size) - 1)).to_bytes(size, "big"))
    return f"hatari-debug w ${address:x} {body}"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _s(ram: bytes, address: int, size: int) -> int:
    return int.from_bytes(ram[address:address + size], "big", signed=True)


def _u(ram: bytes, address: int, size: int) -> int:
    return int.from_bytes(ram[address:address + size], "big")


def _text(ram: bytes, address: int) -> str:
    if not 0 < address < len(ram):
        return ""
    end = ram.index(b"\x00", address, min(len(ram), address + 400))
    return ram[address:end].decode("ascii", errors="replace").strip()


def decode(ram: bytes) -> dict:
    message = _u(ram, MESSAGE, 4)
    return {
        "clock": _s(ram, CLOCK, 4),
        "erisState": f"0x{_u(ram, BODY_STATE + ERIS, 2):04x}",
        "damoclesState": f"0x{_u(ram, BODY_STATE + DAMOCLES, 2):04x}",
        "erisDestroyed": bool(_u(ram, BODY_STATE + ERIS, 2) & 0x8000),
        "damoclesDestroyed": bool(_u(ram, BODY_STATE + DAMOCLES, 2) & 0x8000),
        "destroyedCount": _u(ram, DESTROYED, 2),
        "driftArm": _s(ram, DRIFT_ARM, 4),
        "impactFlag": f"0x{_u(ram, IMPACT_FLAG, 2):04x}",
        "death": _u(ram, DEATH, 2),
        "playerBody": _u(ram, PLAYER_BODY, 2) // 4,
        "occupancy": _u(ram, OCCUPANCY, 2),
        "pending": f"0x{_u(ram, PENDING, 2):04x}",
        "scriptPc": f"0x{_u(ram, SCRIPT_PC, 4):06x}",
        "gate": _u(ram, GATE, 2),
        "pageGate": f"0x{_u(ram, PAGE_GATE, 2):04x}",
        "document": f"0x{_u(ram, DOCUMENT, 2):04x}",
        "crystal": f"0x{_u(ram, CRYSTAL, 1):02x}",
        "pauseGate": _u(ram, PAUSE_GATE, 2),
        "message": f"0x{message:06x}",
        "messageText": _text(ram, message),
    }


class Machine:
    """One booted Hatari, stopped and continued around every read and poke."""

    def __init__(self, handle, run: Path):
        self.handle = handle
        self.run = run
        self.count = 0

    def sample(self, label: str) -> dict:
        prefix = f"{self.count:03d}-{label}"
        self.count += 1
        ram_path = self.run / f"{prefix}.ram"
        shot = self.run / f"{prefix}.png"
        _fifo_send(self.handle, [
            "hatari-stop", "hatari-debug setopt hex",
            f"hatari-debug savebin {ram_path} 0 $100000",
            f"hatari-debug screenshot {shot}", "hatari-cont",
        ])
        ram = b""
        for _ in range(120):
            if ram_path.is_file():
                ram = ram_path.read_bytes()
            if len(ram) == 0x100000:
                break
            time.sleep(0.05)
        if len(ram) != 0x100000:
            raise LabError(f"sample {prefix} read {len(ram)} bytes")
        state = decode(ram)
        state["sample"] = prefix
        state["ramSha256"] = _sha256(ram)
        if shot.is_file():
            state["display"] = shot.name
        state["_ram"] = ram
        return state

    def poke(self, *commands: str) -> None:
        _fifo_send(self.handle, ["hatari-stop", "hatari-debug setopt hex",
                                 *commands, "hatari-cont"])
        time.sleep(0.2)

    def press(self, scan: int, hold: float = 0.15) -> None:
        code = f"{scan:02d}"
        _fifo_send(self.handle, [f"hatari-event keydown {code}"])
        time.sleep(hold)
        _fifo_send(self.handle, [f"hatari-event keyup {code}"])
        time.sleep(0.2)


def series(machine: Machine, label: str, count: int, interval: float) -> list[dict]:
    rows = []
    for index in range(count):
        if index:
            time.sleep(interval)
        rows.append(machine.sample(f"{label}{index:02d}"))
    return rows


def impact(machine: Machine, seconds: int, count: int, interval: float) -> dict:
    machine.poke(poke(CLOCK, -seconds, 4))
    return {"poked": {"clock": -seconds}, "samples": series(machine, "impact", count, interval)}


def wish(machine: Machine, page: int, count: int, interval: float) -> dict:
    before = machine.sample("wish-before")
    crystal = _u(before["_ram"], CRYSTAL, 1) | 0x80
    pokes = {"$7856": "0x83", "$7857": f"0x{page:02x}", "$7126": f"0x{crystal:02x}",
             "$7B96": "0x8000"}
    machine.poke(poke(DOCUMENT, 0x8300 | page, 2), poke(CRYSTAL, crystal, 1),
                 poke(PAGE_GATE, 0x8000, 2))
    return {"page": page, "poked": pokes, "before": before,
            "samples": series(machine, f"wish{page}-", count, interval)}


def run(args: argparse.Namespace) -> dict:
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(args.roms))
    validate_image(program, authority["programImage"], label="Working Authority STX")
    validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    snapshot = args.snapshot.resolve(strict=True)
    name = f"endgame-{args.case}" + (f"{args.page}" if args.case == "wish" else "")
    run_directory = WORK_ROOT / _run_id(name)
    run_directory.mkdir(parents=True)
    fifo = run_directory / "cmd.fifo"
    (run_directory / "play.txt").write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari, tos=tos, disk_a=program,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=run_directory / "play.txt", fast_forward=args.fast_forward,
        statusbar=False, cmd_fifo=fifo, extra_args=["--memstate", str(snapshot)],
    )
    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "case": args.case,
        "runDirectory": str(run_directory.relative_to(REPO)),
        "snapshot": {"path": str(snapshot), "sha256": _sha256(snapshot.read_bytes())},
        "probe": {"path": str(Path(__file__).resolve().relative_to(REPO)),
                  "sha256": _sha256(Path(__file__).read_bytes())},
        "toolchain": toolchain.as_dict(),
        "fastForward": args.fast_forward,
    }
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                               stdout=(run_directory / "hatari.log").open("wb"),
                               stderr=subprocess.STDOUT, env=os.environ | headless_env())
    try:
        for _ in range(200):
            if fifo.exists():
                break
            if process.poll() is not None:
                raise LabError(f"Hatari exited before the FIFO; inspect {run_directory}")
            time.sleep(0.05)
        else:
            raise LabError("Hatari did not create the command FIFO")
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(args.settle)
            if process.poll() is not None:
                raise LabError(f"Hatari exited during the restore; inspect {run_directory}")
            machine = Machine(handle, run_directory)
            baseline = machine.sample("baseline")
            if baseline["pauseGate"]:
                machine.press(0x39)  # space resumes a paused capture
                baseline = machine.sample("baseline")
            ram = baseline["_ram"]
            result["code"] = {label: _sha256(ram[start:end])
                              for label, start, end in CODE_WINDOWS}
            result["baseline"] = baseline
            if args.case == "impact":
                result["impact"] = impact(machine, args.seconds, args.samples, args.interval)
            else:
                result["wish"] = wish(machine, args.page, args.samples, args.interval)
                if args.then_impact:
                    result["impact"] = impact(machine, args.seconds, args.samples,
                                              args.interval)
            _fifo_send(handle, ["hatari-debug quit"])
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        fifo.unlink(missing_ok=True)

    def clean(value):  # noqa: ANN001, ANN202
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k != "_ram"}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    result = clean(result)
    (run_directory / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def summarise(result: dict) -> None:
    print(f"run {result['runDirectory']}")
    rows = [("baseline", result["baseline"])]
    if "wish" in result:
        rows += [("wish", s) for s in result["wish"]["samples"]]
    if "impact" in result:
        rows += [("impact", s) for s in result["impact"]["samples"]]
    last_text = None
    for phase, s in rows:
        text = s["messageText"] if s["messageText"] != last_text else "…"
        last_text = s["messageText"]
        print(f"{phase:<8} {s['sample']:<14} clock {s['clock']:>7} "
              f"E {s['erisState']} D {s['damoclesState']} n {s['destroyedCount']:>2} "
              f"drift {s['driftArm']:>6} imp {s['impactFlag']} dead {s['death']} "
              f"body {s['playerBody']:>2} pend {s['pending']} pc {s['scriptPc']} "
              f"| {text[:70]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--case", choices=("impact", "wish"), required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--page", type=int, default=5)
    parser.add_argument("--then-impact", action="store_true")
    parser.add_argument("--seconds", type=int, default=4)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--settle", type=float, default=3.0)
    parser.add_argument("--no-fast-forward", dest="fast_forward", action="store_false")
    args = parser.parse_args()
    summarise(run(args))


if __name__ == "__main__":
    try:
        main()
    except (LabError, OSError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"error: {error}") from error
