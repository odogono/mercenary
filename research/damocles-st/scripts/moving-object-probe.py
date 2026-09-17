#!/usr/bin/env python3
"""Moving-object pool probe: resident slots 8, 11 and 15 (#327).

The static reading recovered from the pinned first-world RAM is that resident
slots 8..15 are an eight-entry moving-object pool with its own lifetime counter
and 16.16 velocity, and that three of those entries are driven:

  slot 8   the shot the player fires    launched at `$050B96`
  slot 11  ATTACK SHIP                  placed and steered at `$050E44`
  slot 15  the shot the ATTACK SHIP fires, launched at `$050DB4`

All three are placed by writing the current body byte `$7AC9` into Association B
byte 0 and clearing byte 1, which is the ordinary surface-resident form, and all
three are unplaced again by clearing Association B. This probe checks that
reading against the running program.

Cases
  ``fire-boarded``    Boot the tracked ``boarded-limo`` memstate and hold the
                      joystick fire bit. Slot 8 is expected to take a body byte,
                      move, and fall back to `$00000000` when its counter
                      expires.
  ``fire-onfoot``     The same held fire from the ``eris-spaceport-onfoot``
                      memstate. `$7AB0` is `$FFFF` on foot, so slot 8 is
                      expected to stay unplaced: this is the control that shows
                      the gate is the one the static reading names.
  ``attack-disarmed`` Boarded, fire held, sampling slots 11 and 15. `$70104` is
                      zero in ordinary first-world state, so the attack-ship
                      routine `$050D80` returns at once and both slots stay
                      unplaced.
  ``attack-armed``    The same run with `$70104` set to `$0001` first -- the
                      exact word the TOLOSA arrival script writes at `$072B16`
                      through bank.write `$0104`. Slots 11 and 15 are expected
                      to become placed surface residents.

``attack-armed`` writes one word of persistent game state that the ordinary
route only reaches by travelling to TOLOSA, so it is **an instruction-level
checkpoint, not an ordinary-route observation**. ``fire-boarded`` and
``fire-onfoot`` inject nothing but the joystick softcopy the laboratory already
uses for locomotion, and are ordinary routes.

Usage (from the repository root):

  python3 research/damocles-st/scripts/moving-object-probe.py --roms /path/to/roms
  python3 research/damocles-st/scripts/moving-object-probe.py --case fire-boarded

See docs/research/damocles-moving-objects.md.
"""

from __future__ import annotations

import argparse
import dataclasses
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

from damocleslab.core import JOYSTICK1_SOFTCOPY, LabError, validate_image  # noqa: E402
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

# Joystick-1 softcopy bit 7 is the fire button the launch gate at $050B96 tests.
FIRE = 0x80

# Saved at every sample. The low window carries the resident arrays, the pool
# counters and the gates; the bank window carries the four persistent longwords
# the save routine at $055402 mirrors.
WINDOWS = (("low", 0x006000, 0x2000), ("bank", 0x070100, 0x0010))

WATCH = (8, 11, 15)

# The pool's per-slot lifetime counter, addressed as $612A + 4*slot.
POOL_COUNTER = 0x612A
ATTACK_GATE = 0x070104

CASES = ("fire-boarded", "fire-onfoot", "attack-disarmed", "attack-armed")
SNAPSHOT_FOR = {
    "fire-boarded": "boarded-limo.sav",
    "fire-onfoot": "eris-spaceport-onfoot.sav",
    "attack-disarmed": "boarded-limo.sav",
    "attack-armed": "boarded-limo.sav",
}


def build_case(name: str, samples: int, period: float) -> list[dict]:
    actions: list[dict] = [{"t": 0.0, "kind": "sample"}]
    if name == "attack-armed":
        actions.append({"t": 0.4, "kind": "poke", "address": ATTACK_GATE, "bytes": "00 01"})
    actions.append({"t": 0.8, "kind": "stick", "byte": FIRE})
    # Samples straddle several flights, so a held fire is caught both in flight
    # and between flights whatever the host timing does.
    for index in range(samples):
        actions.append({"t": 1.2 + period * index, "kind": "sample", "shot": index == 4})
    actions.append({"t": 1.2 + period * samples, "kind": "stick", "byte": 0x00})
    actions.append({"t": 1.2 + period * (samples + 1), "kind": "sample"})
    return actions


def _u16(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 2], "big")


def _u32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big")


def _s32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big", signed=True)


def decode(blobs: dict[str, bytes]) -> dict:
    low, bank = blobs["low"], blobs["bank"]
    lb, bb = 0x6000, 0x070100
    state = {
        "fireBit": f"0x{low[0x79C2 - lb]:02x}",
        "boardedWord": f"0x{_u16(low, lb, 0x7AB0):04x}",
        "fireInhibit": f"0x{_u16(low, lb, 0x7BBE):04x}",
        "bodySelector": f"0x{_u16(low, lb, 0x7AA8):04x}",
        "dropBodyByte": f"0x{low[0x7AC9 - lb]:02x}",
        "playerX": _s32(low, lb, 0x7AB2),
        "playerY": _s32(low, lb, 0x7AB6),
        "playerZ": _s32(low, lb, 0x7ABA),
        "attackGate": f"0x{_u16(bank, bb, ATTACK_GATE):04x}",
        "bankLongwords": [f"0x{_u32(bank, bb, bb + 4 * i):08x}" for i in range(4)],
        "residents": {},
    }
    for slot in WATCH:
        offset = slot * 4
        state["residents"][str(slot)] = {
            "associationA": f"0x{_u32(low, lb, 0x6FA8 + offset):08x}",
            "associationB": f"0x{_u32(low, lb, 0x73A8 + offset):08x}",
            "x": _s32(low, lb, 0x63A8 + offset),
            "y": _s32(low, lb, 0x67A8 + offset),
            "z": _s32(low, lb, 0x6BA8 + offset),
            "counter": f"0x{_u16(low, lb, POOL_COUNTER + offset):04x}",
            "velocityX": _s32(low, lb, 0x614A + offset),
            "velocityY": _s32(low, lb, 0x616A + offset),
            "velocityZ": _s32(low, lb, 0x618A + offset),
        }
    return state


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sample(handle, run_directory: Path, index: int, offset: float, shot: bool) -> dict:
    paths = {}
    commands = ["hatari-stop", "hatari-debug setopt hex"]
    for label, base, length in WINDOWS:
        path = run_directory / f"sample{index:02d}-{label}.bin"
        paths[label] = path
        commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
    if shot:
        commands.append(f"hatari-debug screenshot {run_directory}/sample{index:02d}.png")
    commands.append("hatari-cont")
    _fifo_send(handle, commands)
    time.sleep(0.2)
    return {"index": index, "offset": offset, "paths": paths}


def _decode_pair(low: Path, bank: Path) -> dict:
    return {
        "sha256": {"low": _sha256(low), "bank": _sha256(bank)},
        "state": decode({"low": low.read_bytes(), "bank": bank.read_bytes()}),
    }


def run_case(
    name: str, roms_root: Path | None, settle: float, samples_wanted: int, period: float
) -> dict:
    actions = sorted(
        build_case(name, samples_wanted, period),
        key=lambda a: (a["t"], 0 if a["kind"] in ("stick", "poke") else 1),
    )

    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    snapshot = SNAPSHOTS / SNAPSHOT_FOR[name]
    if not snapshot.is_file():
        raise LabError(f"Snapshot not found: {snapshot}")

    run_directory = WORK_ROOT / _run_id(f"moving-object-{name}")
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
        fast_forward=False,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())

    samples: list[dict] = []
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
            started = time.monotonic()
            for action in actions:
                delay = action["t"] - (time.monotonic() - started)
                if delay > 0:
                    time.sleep(delay)
                kind = action["kind"]
                if kind == "stick":
                    _fifo_send(
                        handle,
                        [
                            "hatari-stop",
                            "hatari-debug setopt hex",
                            f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {action['byte']:02x}",
                            "hatari-cont",
                        ],
                    )
                elif kind == "poke":
                    _fifo_send(
                        handle,
                        [
                            "hatari-stop",
                            "hatari-debug setopt hex",
                            # One space-separated token per byte: the word the
                            # TOLOSA script writes is $0001, not the byte $01.
                            f"hatari-debug w ${action['address']:x} {action['bytes']}",
                            "hatari-cont",
                        ],
                    )
                elif kind == "sample":
                    samples.append(
                        _sample(
                            handle,
                            run_directory,
                            len(samples),
                            action["t"],
                            action.get("shot", False),
                        )
                    )
            _fifo_send(
                handle,
                [
                    "hatari-stop",
                    "hatari-debug setopt hex",
                    f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} 00",
                    f"hatari-debug screenshot {run_directory}/observed.png",
                    "hatari-debug quit",
                ],
            )
            for _ in range(300):
                if (run_directory / "observed.png").is_file():
                    break
                time.sleep(0.1)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if fifo.exists():
            try:
                fifo.unlink()
            except OSError:
                pass

    decoded = []
    for sample in samples:
        missing = [label for label, path in sample["paths"].items() if not path.is_file()]
        if missing:
            decoded.append({"offset": sample["offset"], "missing": missing})
            continue
        decoded.append({"offset": sample["offset"], **_decode_pair(*sample["paths"].values())})

    placed = {
        str(slot): sorted(
            {
                s["state"]["residents"][str(slot)]["associationB"]
                for s in decoded
                if "state" in s
            }
        )
        for slot in WATCH
    }
    result = {
        "case": name,
        "runId": run_directory.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "memstate": {"path": str(snapshot), "sha256": _sha256(snapshot)},
        "probeSha256": _sha256(Path(__file__)),
        "ordinaryRoute": name in ("fire-boarded", "fire-onfoot", "attack-disarmed"),
        "settleSeconds": settle,
        "samplePeriodSeconds": period,
        "inputs": [a for a in actions if a["kind"] != "sample"],
        "watchedSlots": list(WATCH),
        "associationBObserved": placed,
        "toolchain": dataclasses.asdict(toolchain)
        if dataclasses.is_dataclass(toolchain)
        else {k: str(v) for k, v in vars(toolchain).items()},
        "samples": decoded,
    }
    (run_directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def _report(result: dict) -> None:
    print(f"{result['case']}: {result['runId']}")
    for sample in result["samples"]:
        if "missing" in sample:
            print(f"        t+{sample['offset']:6.2f}s  windows missing: {sample['missing']}")
            continue
        state = sample["state"]
        parts = [
            f"t+{sample['offset']:6.2f}s",
            f"fire={state['fireBit']}",
            f"boarded={state['boardedWord']}",
            f"gate={state['attackGate']}",
        ]
        for slot in WATCH:
            resident = state["residents"][str(slot)]
            parts.append(
                f"s{slot}:B={resident['associationB']}/c={resident['counter']}"
            )
        print("        " + "  ".join(parts))
    for slot, values in result["associationBObserved"].items():
        print(f"        slot {slot} Association B seen: {', '.join(values)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--roms", type=Path, default=None, help="Restricted Material root")
    parser.add_argument("--case", choices=CASES, action="append", default=None)
    parser.add_argument("--settle", type=float, default=2.0)
    parser.add_argument("--samples", type=int, default=12, help="samples after the fire input")
    parser.add_argument("--period", type=float, default=0.45, help="seconds between samples")
    args = parser.parse_args(argv)
    try:
        for name in args.case or list(CASES):
            _report(run_case(name, args.roms, args.settle, args.samples, args.period))
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
