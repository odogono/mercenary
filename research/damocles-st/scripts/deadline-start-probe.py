#!/usr/bin/env python3
"""Damocles impact-deadline start-value probe (#368).

#208 bound the impact clock's encoding: a signed big-endian 32-bit at `$793C`
holding **minus** the remaining seconds, counting up toward zero at 20 VBLs per
displayed second.  What it did not bind is the value a fresh game starts from.

This probe answers that by catching the write.  It cold-boots the Working
Authority to the pinned title-screen checkpoint and then samples `$7900`-`$7B00`
on a self-chaining run of debugger scripts, each one dumping the window and
arming the next VBL breakpoint, so the whole cadence is exact emulator time
rather than host sleeps.  The clock is not live at the checkpoint -- every
title-screen RAM dump in the laboratory holds the same uninitialised word --
so the first sample holding a plausible remaining time brackets the deadline
to within one sample interval.

The deadline is installed while the title screen is still up, which is why
``--no-space`` is the pass that answers the question: leave the title alone and
the write is the only thing that happens.  Pressing Space starts a scripted
arrival that spends an hour and a half of the deadline in one sweep, so a run
that presses it measures the arrival rather than the start value.

Run from the repository root:

  python3 research/damocles-st/scripts/deadline-start-probe.py \
    --roms /path/to/roms --start-vbls 0 --interval 5 --count 200 --no-space

and press Space to follow the arrival through to the walk flag at `$7A8E`
turning on, which is where the original hands the player control on foot:

  python3 research/damocles-st/scripts/deadline-start-probe.py \
    --roms /path/to/roms --start-vbls 0 --interval 100 --count 1200

The tracked output is this procedure and the resulting research note, never the
RAM images, screenshots, or save states.
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

CLOCK = 0x793C
WINDOW_BASE = 0x7900
WINDOW_LENGTH = 0x200
SPACE_SCANCODE = 57
#: A remaining time this probe is willing to call "the clock is live": positive,
#: under a day, and not one of the uninitialised words a cold boot leaves behind.
PLAUSIBLE_SECONDS = range(1, 86400)


def _sample_word(path: Path) -> int:
    payload = path.read_bytes()
    offset = CLOCK - WINDOW_BASE
    return struct.unpack(">i", payload[offset : offset + 4])[0]


def _hms(seconds: int) -> str:
    return f"{seconds // 3600:02d}-{seconds % 3600 // 60:02d}-{seconds % 60:02d}"


def _write_chain(run: Path, count: int, interval: int, start_vbls: int) -> Path:
    """Write the run of debugger scripts that samples the clock window.

    Each script dumps the window and arms the next VBL breakpoint, so the whole
    cadence is exact emulator time rather than host sleeps.
    """
    scripts = [run / f"sample-{index:04d}.txt" for index in range(count)]
    for index, script in enumerate(scripts):
        lines = [
            "setopt hex",
            f"savebin {(run / f's{index:04d}.bin').resolve()} "
            f"${WINDOW_BASE:x} ${WINDOW_LENGTH:x}",
        ]
        if index + 1 < count:
            lines.append(
                f'b VBL = "VBL+{interval}" :once :quiet '
                f":file {scripts[index + 1].resolve()}"
            )
            lines.append("c")
        else:
            lines.append(f"screenshot {(run / 'final.png').resolve()}")
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")

    entry = run / "enter-sampling.txt"
    entry.write_text(
        f'b VBL = "VBL+{start_vbls}" :once :quiet :file {scripts[0].resolve()}\nc\n',
        encoding="utf-8",
    )
    return entry


def probe(
    *,
    roms: Path | None,
    interval: int,
    count: int,
    start_vbls: int,
    space_delay: float,
    press_space: bool = True,
) -> tuple[Path, dict[str, Any]]:
    authority, config = load_configuration()
    root = resolve_roms_root(roms)
    program, tos = resolve_images(authority, root)
    validate_image(program, authority["programImage"], label="Working Authority STX")
    validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, _ = discover_toolchain(config)
    pc = config["checkpoints"]["title-screen"]["pc"]
    title_vbls = int(config["checkpoints"]["title-screen"].get("extraVbls", 1400))

    run = WORK_ROOT / _run_id(f"deadline-start-{interval}x{count}")
    run.mkdir(parents=True)
    entry = _write_chain(run, count, interval, start_vbls)

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
            command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
        )
        try:
            for _ in range(600):
                if fifo.exists() or process.poll() is not None:
                    break
                time.sleep(0.05)
            if not fifo.exists():
                raise LabError(f"Hatari did not create {fifo}")
            with fifo.open("w", encoding="utf-8") as handle:
                # Space enters the world. Its host timing does not need to be
                # precise: the sample cadence is exact, so wherever the write
                # lands the transition is still bracketed by two known VBLs.
                deadline = time.time() + 300
                while not first_sample.is_file() and time.time() < deadline:
                    if process.poll() is not None:
                        raise LabError("Hatari exited before the first sample")
                    time.sleep(0.05)
                if press_space:
                    time.sleep(space_delay)
                    _fifo_send(handle, [f"hatari-event keypress {SPACE_SCANCODE}"])

                deadline = time.time() + 60 + interval * count / 200.0
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
        word = _sample_word(path)
        live = -word in PLAUSIBLE_SECONDS
        samples.append(
            {
                "index": index,
                "vbl": start_vbls + index * interval,
                "word": word,
                "live": live,
                "readout": _hms(-word) if live else None,
            }
        )

    live = [sample for sample in samples if sample["live"]]
    result: dict[str, Any] = {
        "schemaVersion": 1,
        "probe": "deadline-start",
        "pressedSpace": press_space,
        "recordedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "clockAddress": f"${CLOCK:06X}",
        "interval": interval,
        "count": count,
        "startVbls": start_vbls,
        "sampleCount": len(samples),
        "firstLive": live[0] if live else None,
        "lastBeforeLive": (
            samples[live[0]["index"] - 1]
            if live and live[0]["index"] > 0
            else None
        ),
        "samples": samples,
    }
    (run / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return run, result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--interval", type=int, default=1000, help="VBLs between samples")
    parser.add_argument("--count", type=int, default=400, help="number of samples")
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
        "--no-space",
        action="store_true",
        help="leave the title screen alone, sampling the clock the title itself runs",
    )
    arguments = parser.parse_args(argv)

    run, result = probe(
        roms=arguments.roms,
        interval=arguments.interval,
        count=arguments.count,
        start_vbls=arguments.start_vbls,
        space_delay=arguments.space_delay,
        press_space=not arguments.no_space,
    )
    print(f"run: {run}")
    print(f"samples: {result['sampleCount']}/{result['count']}")
    before = result["lastBeforeLive"]
    first = result["firstLive"]
    if first is None:
        tail = result["samples"][-1] if result["samples"] else None
        print("clock never became live in this window")
        if tail is not None:
            print(f"  last sample VBL {tail['vbl']} word {tail['word']:#x}")
        return 1
    if before is not None:
        print(f"last uninitialised: VBL {before['vbl']} word {before['word']:#010x}")
    print(
        f"first live: VBL {first['vbl']} word {first['word']} "
        f"= {first['readout']} (bracketed to {arguments.interval / 20:.1f} "
        "displayed seconds)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
