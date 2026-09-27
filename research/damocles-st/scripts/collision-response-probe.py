#!/usr/bin/env python3
"""Exact-VBL Damocles craft collision-response probe (#550).

Each observation boots ``boarded-limo.sav`` (the V.I.P. LIMO, slot 5, boarded
facing the Capital Spaceport), sets a throttle, and chains one Hatari VBL
breakpoint per frame. Every breakpoint saves the movement block
``$7900``-``$7C1F`` (throttle ``$7BAC``, current speed ``$797A``, position
``$7AB2``/``$7AB6``/``$7ABA``, the pre-move copy ``$7A3C``..``$7A47``, ground
contact ``$7ACA``, the channel-B sound request ``$7A78``), the linear speed
``$4DFEC``, and the channel-B programme pointer ``$4BF54``.

Throttle modes:

* ``poke`` writes the value the key-4 handler writes (``$00071000``) straight
  into ``$7BAC`` from the chain's start script, so the whole run is in
  emulator time. It is the deterministic reproduction.
* ``tap`` and ``hold`` press the real key through ``format_hatari_key`` while
  the game runs, then start the chain. ``tap`` releases the key before the
  chain; ``hold`` keeps it down for the whole chain.

``--rethrottle VBL HEX`` writes a second throttle after that VBL's sample, to
drive into the wall again (``00071000``) or back off in reverse (``0007F000``,
F4).

Only one probe may run at a time. A Hatari orphaned in its debugger (for
example by killing this script) stalls later chains after their first link.

Run from the repository root:

  research/damocles-st/.venv/bin/python \
    research/damocles-st/scripts/collision-response-probe.py \
    --roms roms --modes poke tap hold --vbls 500

  research/damocles-st/.venv/bin/python \
    research/damocles-st/scripts/collision-response-probe.py \
    --roms roms --vbls 640 --rethrottle 480 0007F000

Restricted captures stay under the laboratory's gitignored work directory.
The tracked output is this procedure and the decoded rules in
``docs/research/damocles-collision-response.md``.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError, file_hash, format_hatari_key, validate_image  # noqa: E402
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

SNAPSHOT = LAB_ROOT / "snapshots" / "boarded-limo.sav"
BLOCK, BLOCK_LEN = 0x7900, 0x320
LINEAR, LINEAR_LEN = 0x4DFEC, 4
SOUND, SOUND_LEN = 0x4BF54, 4
THROTTLE = 0x7BAC
KEY4_THROTTLE = 0x00071000  # $0557D6[$05] = 14 -> 14 << 15, low word $1000
KEY4_SCANCODE = 0x05


def _wait_for(path: Path, process: subprocess.Popen[str], seconds: float) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if path.is_file():
            return
        if process.poll() is not None:
            break
        time.sleep(0.02)
    raise LabError(f"Timed out waiting for {path}; process status={process.poll()}")


def _long(data: bytes, address: int, signed: bool = False) -> int:
    offset = address - BLOCK
    return int.from_bytes(data[offset : offset + 4], "big", signed=signed)


def _word(data: bytes, address: int, signed: bool = False) -> int:
    offset = address - BLOCK
    return int.from_bytes(data[offset : offset + 2], "big", signed=signed)


def _decode(run: Path, stem: str) -> dict[str, Any]:
    block = (run / f"{stem}.block.bin").read_bytes()
    if len(block) != BLOCK_LEN:
        raise LabError(f"{stem}.block.bin has {len(block)} bytes, expected {BLOCK_LEN}")
    linear = int.from_bytes((run / f"{stem}.linear.bin").read_bytes(), "big", signed=True)
    sound = int.from_bytes((run / f"{stem}.sound.bin").read_bytes(), "big")
    return {
        "throttle": f"{_long(block, 0x7BAC):08X}",
        "speed": f"{_long(block, 0x797A):08X}",
        "linear": linear,
        "x": _long(block, 0x7AB2, True),
        "y": _long(block, 0x7AB6, True),
        "z": _long(block, 0x7ABA, True),
        "saved": [_long(block, 0x7A3C, True), _long(block, 0x7A40, True), _long(block, 0x7A44, True)],
        "yaw": _word(block, 0x7AA2),
        "pitch": _word(block, 0x7AC0),
        "contact": _word(block, 0x7ACA),
        "occupancy": _word(block, 0x7AAE),
        "slot": _word(block, 0x7AB0),
        "zone": _word(block, 0x7A38),
        "toggle7A1C": _word(block, 0x7A1C),
        "soundRequest": _word(block, 0x7A78),
        "soundB": f"{sound:06X}",
    }


def _save_lines(run: Path, stem: str) -> list[str]:
    return [
        f"savebin {(run / f'{stem}.block.bin').resolve()} ${BLOCK:x} ${BLOCK_LEN:x}",
        f"savebin {(run / f'{stem}.linear.bin').resolve()} ${LINEAR:x} ${LINEAR_LEN:x}",
        f"savebin {(run / f'{stem}.sound.bin').resolve()} ${SOUND:x} ${SOUND_LEN:x}",
    ]


def _poke_line(value: int) -> str:
    return f"w ${THROTTLE:x} " + " ".join(f"{byte:02x}" for byte in value.to_bytes(4, "big"))


def _observe(
    *,
    mode: str,
    vbls: int,
    roms: Path,
    settle_seconds: float,
    rethrottle: tuple[int, int] | None,
) -> tuple[Path, dict[str, Any]]:
    authority, config = load_configuration()
    root = resolve_roms_root(roms)
    program, tos = resolve_images(authority, root)
    program_info = validate_image(program, authority["programImage"], label="Working Authority STX")
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    if not SNAPSHOT.is_file():
        raise LabError(f"Snapshot not found: {SNAPSHOT}")

    label = f"-then-{rethrottle[1]:08x}-at-{rethrottle[0]}" if rethrottle else ""
    run = WORK_ROOT / _run_id(f"collision-response-{mode}-{vbls}vbl{label}")
    run.mkdir(parents=True)
    fifo_path = run / "cmd.fifo"
    parse = run / "play.txt"
    scripts = [run / f"vbl-{index:03d}.txt" for index in range(1, vbls + 1)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex", *_save_lines(run, f"vbl-{index + 1:03d}")]
        if rethrottle and index + 1 == rethrottle[0]:
            # Written after the sample, so this VBL still shows the old value.
            lines.append(_poke_line(rethrottle[1]))
        if index == len(scripts) - 1:
            lines.append("quit")
        else:
            lines.extend(
                (
                    f'b VBL = "VBL+1" :once :quiet :file {scripts[index + 1].resolve()}',
                    "c",
                )
            )
        script.write_text("\n".join((*lines, "")), encoding="utf-8")
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
        extra_args=["--memstate", str(SNAPSHOT.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    key = format_hatari_key(KEY4_SCANCODE)
    last = run / f"vbl-{vbls:03d}.sound.bin"
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env)
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            if not fifo_path.exists():
                raise LabError(f"Hatari did not create {fifo_path}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle_seconds)
                if process.poll() is not None:
                    raise LabError(f"Hatari exited during settle; see {run / 'hatari.log'}")
                if mode in ("tap", "hold"):
                    _fifo_send(fifo, [f"hatari-event keydown {key}"])
                    time.sleep(0.12)
                    if mode == "tap":
                        _fifo_send(fifo, [f"hatari-event keyup {key}"])
                    time.sleep(0.12)
                # No hatari-stop: one breakpoint armed over the FIFO runs a
                # script that takes the baseline, applies the poke and arms the
                # chain. A FIFO stop occasionally landed again after the
                # chain's first link and stranded the emulator in the debugger.
                start = run / "start.txt"
                lines = ["setopt hex", *_save_lines(run, "before")]
                if mode == "poke":
                    lines.append(_poke_line(KEY4_THROTTLE))
                lines.extend(
                    (
                        f'b VBL = "VBL+1" :once :quiet :file {scripts[0].resolve()}',
                        "c",
                    )
                )
                start.write_text("\n".join((*lines, "")), encoding="utf-8")
                _fifo_send(fifo, [f"hatari-debug b VBL > 0 :once :quiet :file {start.resolve()}"])
                _wait_for(last, process, vbls / 25.0 + 30)
                process.wait(timeout=10)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()

    before = _decode(run, "before")
    samples = [_decode(run, f"vbl-{index:03d}") for index in range(1, vbls + 1)]
    refusals = []
    previous = before
    for index, sample in enumerate(samples, start=1):
        if sample["throttle"].startswith("FFF0") and not previous["throttle"].startswith("FFF0"):
            refusals.append(
                {
                    "vbl": index,
                    "before": previous,
                    "after": sample,
                }
            )
        previous = sample
    result: dict[str, Any] = {
        "mode": mode,
        "vbls": vbls,
        "rethrottle": {"vbl": rethrottle[0], "throttle": f"{rethrottle[1]:08X}"} if rethrottle else None,
        "before": before,
        "samples": samples,
        "refusals": refusals,
        "authority": {
            "programSha256": program_info["hashes"]["sha256"],
            "tosSha256": tos_info["hashes"]["sha256"],
            "snapshotSha256": file_hash(SNAPSHOT),
        },
        "toolchain": toolchain.as_dict(),
    }
    (run / "result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return run, result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", required=True, type=Path)
    parser.add_argument("--modes", nargs="+", choices=("poke", "tap", "hold"), default=("poke",))
    parser.add_argument("--vbls", type=int, default=500)
    parser.add_argument("--settle-seconds", type=float, default=4.0)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument(
        "--rethrottle",
        nargs=2,
        metavar=("VBL", "HEX"),
        help="write a throttle long into $7BAC after sampling this VBL (e.g. 480 0007F000 for F4)",
    )
    args = parser.parse_args()
    if args.vbls <= 0:
        parser.error("--vbls must be positive")
    rethrottle = (int(args.rethrottle[0]), int(args.rethrottle[1], 16)) if args.rethrottle else None
    for mode in args.modes:
        # A stalled chain (see the module note on orphaned Hatari processes)
        # times out; retry it rather than lose the batch.
        for attempt in range(1, args.attempts + 1):
            try:
                run, result = _observe(
                    mode=mode,
                    vbls=args.vbls,
                    roms=args.roms,
                    settle_seconds=args.settle_seconds,
                    rethrottle=rethrottle,
                )
                break
            except LabError as error:
                if attempt == args.attempts:
                    raise
                print(f"attempt {attempt} failed: {error}")
        print(f"{run.name}: {len(result['refusals'])} refusal(s)")
        for refusal in result["refusals"]:
            print(f"  VBL {refusal['vbl']}: {refusal['before']} -> {refusal['after']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
