#!/usr/bin/env python3
"""Damocles hand-over rotation probe: Eris's turn when a fresh game starts.

The port starts its session from Eris's rotation accumulator (`$62EA + 4 * 11`), and until
now took it from `eris-spaceport-onfoot`, a capture made about 24 minutes of emulator time
after the new-game reset `$051052` zeroed every accumulator. That capture stands at night.
A player who presses Space on the title screen is handed control far sooner.

This probe cold-boots the Working Authority to the pinned title-screen checkpoint, presses
Space, and follows the scripted arrival on a self-chaining run of exact-VBL debugger
scripts, as `deadline-start-probe.py` does. Each sample dumps `$6200`-`$7D00` (the
accumulators, the impact clock `$793C`, the walk flag `$7A8E`, the terminator's answer
`$7A4E` and the sky word `$7C86`) and a screenshot. The first sample with the walk flag set
is the hand-over.

Sampled every VBL, the accumulator still holds the reset's zero at the hand-over. Eris
starts turning about 23 debugger VBLs later. Space's host timing moves the hand-over's VBL,
but not that answer.

Run from the repository root:

  research/damocles-st/.venv/bin/python research/damocles-st/scripts/start-turn-probe.py \
    --start-vbls 0 --interval 1 --count 12000 --no-screenshots

The tracked output is this procedure and the resulting research note, never the RAM images,
screenshots, or save states.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError, validate_image  # noqa: E402
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

WINDOW_BASE = 0x6200
WINDOW_LENGTH = 0x1B00
ACCUMULATORS = 0x62EA
ERIS = 11
CLOCK = 0x793C
WALK = 0x7A8E
DAYLIGHT = 0x7A4E
SKY = 0x7C86
POSITION = (0x7A92, 0x7A96, 0x7A9A)
SPACE_SCANCODE = 57


def _long(payload: bytes, address: int, fmt: str = ">I") -> int:
    offset = address - WINDOW_BASE
    return struct.unpack(fmt, payload[offset : offset + 4])[0]


def _word(payload: bytes, address: int) -> int:
    offset = address - WINDOW_BASE
    return struct.unpack(">H", payload[offset : offset + 2])[0]


def _hms(seconds: int) -> str:
    return f"{seconds // 3600:02d}-{seconds % 3600 // 60:02d}-{seconds % 60:02d}"


def _write_chain(
    run: Path, count: int, interval: int, start_vbls: int, screenshots: bool
) -> Path:
    scripts = [run / f"sample-{index:04d}.txt" for index in range(count)]
    for index, script in enumerate(scripts):
        lines = [
            "setopt hex",
            f"savebin {(run / f's{index:04d}.bin').resolve()} "
            f"${WINDOW_BASE:x} ${WINDOW_LENGTH:x}",
        ]
        if screenshots:
            lines.append(f"screenshot {(run / f's{index:04d}.png').resolve()}")
        if index + 1 < count:
            lines.append(
                f'b VBL = "VBL+{interval}" :once :quiet '
                f":file {scripts[index + 1].resolve()}"
            )
            lines.append("c")
        else:
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")

    entry = run / "enter-sampling.txt"
    entry.write_text(
        f'b VBL = "VBL+{start_vbls}" :once :quiet :file {scripts[0].resolve()}\nc\n',
        encoding="utf-8",
    )
    return entry


def _sample(path: Path, index: int, vbl: int) -> dict[str, Any]:
    payload = path.read_bytes()
    clock = _long(payload, CLOCK, ">i")
    return {
        "index": index,
        "vbl": vbl,
        "erisTurn": _long(payload, ACCUMULATORS + 4 * ERIS),
        "clock": clock,
        "readout": _hms(-clock) if 0 < -clock < 86400 else None,
        "walk": _word(payload, WALK),
        "daylight": _word(payload, DAYLIGHT),
        "sky": _word(payload, SKY),
        "position": [_long(payload, address) for address in POSITION],
    }


def probe(
    *,
    roms: Path | None,
    interval: int,
    count: int,
    start_vbls: int,
    space_delay: float,
    screenshots: bool = True,
) -> tuple[Path, dict[str, Any]]:
    authority, config = load_configuration()
    root = resolve_roms_root(roms)
    program, tos = resolve_images(authority, root)
    validate_image(program, authority["programImage"], label="Working Authority STX")
    validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, _ = discover_toolchain(config)
    pc = config["checkpoints"]["title-screen"]["pc"]
    title_vbls = int(config["checkpoints"]["title-screen"].get("extraVbls", 1400))

    run = WORK_ROOT / _run_id(f"start-turn-{interval}x{count}")
    run.mkdir(parents=True)
    entry = _write_chain(run, count, interval, start_vbls, screenshots)

    on_title = run / "on-title.txt"
    on_title.write_text(
        f'b VBL = "VBL+{title_vbls}" :once :quiet :file {entry.resolve()}\nc\n',
        encoding="utf-8",
    )
    parse = run / "boot.txt"
    parse.write_text(
        f"b pc = ${pc:x} :once :quiet :file {on_title.resolve()}\nc\n", encoding="utf-8"
    )

    fifo = run / "cmd.fifo"
    command = build_hatari_command(
        hatari_binary=hatari,
        tos=tos,
        disk_a=program,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse,
        fast_forward=bool(config.get("fastForward", True)),
        statusbar=False,
        cmd_fifo=fifo,
    )
    env = os.environ.copy()
    env.update(headless_env())

    first_sample = run / "s0000.bin"
    last_sample = run / f"s{count - 1:04d}.bin"
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
        )
        try:
            for _ in range(600):
                if fifo.exists() or process.poll() is not None:
                    break
                time.sleep(0.05)
            if not fifo.exists():
                raise LabError(f"Hatari did not create {fifo}")
            with fifo.open("w", encoding="utf-8") as handle:
                deadline = time.time() + 300
                while not first_sample.is_file() and time.time() < deadline:
                    if process.poll() is not None:
                        raise LabError("Hatari exited before the first sample")
                    time.sleep(0.05)
                time.sleep(space_delay)
                _fifo_send(handle, [f"hatari-event keypress {SPACE_SCANCODE}"])

                deadline = time.time() + 60 + interval * count / 100.0
                while time.time() < deadline:
                    if last_sample.is_file() or process.poll() is not None:
                        break
                    time.sleep(0.2)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if fifo.exists():
                fifo.unlink()

    samples: list[dict[str, Any]] = []
    for index in range(count):
        path = run / f"s{index:04d}.bin"
        if not path.is_file():
            break
        samples.append(_sample(path, index, start_vbls + index * interval))

    reset = next(
        (
            sample
            for sample in samples
            if sample["clock"] == -15560 and sample["erisTurn"] < 0x10000
        ),
        None,
    )
    handover = next((sample for sample in samples if sample["walk"] == 1), None)
    result: dict[str, Any] = {
        "schemaVersion": 1,
        "probe": "start-turn",
        "recordedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "interval": interval,
        "count": count,
        "startVbls": start_vbls,
        "sampleCount": len(samples),
        "reset": reset,
        "handover": handover,
        "samples": samples,
    }
    (run / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return run, result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--interval", type=int, default=50, help="VBLs between samples")
    parser.add_argument("--count", type=int, default=120, help="number of samples")
    parser.add_argument(
        "--start-vbls",
        type=int,
        default=1000,
        help="VBLs after the title checkpoint before the first sample",
    )
    parser.add_argument(
        "--space-delay",
        type=float,
        default=0.5,
        help="host seconds to wait after sampling begins before pressing Space",
    )
    parser.add_argument(
        "--no-screenshots",
        action="store_true",
        help="dump only the RAM window, for a dense chain",
    )
    arguments = parser.parse_args(argv)

    run, result = probe(
        roms=arguments.roms,
        interval=arguments.interval,
        count=arguments.count,
        start_vbls=arguments.start_vbls,
        space_delay=arguments.space_delay,
        screenshots=not arguments.no_screenshots,
    )
    print(f"run: {run}")
    print(f"samples: {result['sampleCount']}/{result['count']}")
    handover = result["handover"]
    if handover is None:
        print("the walk flag never turned on in this window")
        return 1
    print(
        f"hand-over: VBL {handover['vbl']}, Eris turn {handover['erisTurn']} "
        f"(${handover['erisTurn']:08X}), clock {handover['readout']}, "
        f"$7A4E {handover['daylight']:#06x}, sky {handover['sky']:#06x}, "
        f"position {handover['position']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
