#!/usr/bin/env python3
"""Exact-VBL Damocles on-foot step, turn, and R-key probe (#205).

Each observation boots the pinned on-foot snapshot, captures $7A92/$7A9A/$7AA2,
sets the joystick-1 soft-copy, and arms Hatari's VBL breakpoint for an exact
number of frames. The breakpoint script releases the stick and captures the
same words before quitting. R conditions are established before the baseline,
so their host-side delivery time is outside the measured leg.

Run from the repository root:

  python3 research/damocles-st/scripts/walk-step-probe.py \
    --roms /path/to/roms --vbls 1 2 4 8 16 --repeats 2

Restricted captures remain under the laboratory's gitignored work directory.
The tracked output is this procedure, not any expression-bearing disassembly.
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

from damocleslab.core import LabError, file_hash, validate_image  # noqa: E402
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

SNAPSHOT = LAB_ROOT / "snapshots" / "eris-spaceport-onfoot.sav"
STICK = 0x79C2
CAMERA = 0x7A92
CAMERA_LEN = 0x12  # x=$7A92, z=$7A9A, yaw=$7AA2
UP, RIGHT = 0x01, 0x08
R_SCANCODE = 19


def _wait_for(path: Path, process: subprocess.Popen[str], seconds: float) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if path.is_file():
            return
        if process.poll() is not None:
            break
        time.sleep(0.02)
    raise LabError(f"Timed out waiting for {path}; process status={process.poll()}")


def _decode(path: Path) -> dict[str, int]:
    data = path.read_bytes()
    if len(data) != CAMERA_LEN:
        raise LabError(f"{path} has {len(data)} bytes, expected {CAMERA_LEN}")
    return {
        "x": int.from_bytes(data[0:4], "big", signed=True),
        "z": int.from_bytes(data[8:12], "big", signed=True),
        "yaw": int.from_bytes(data[16:18], "big"),
    }


def _condition(fifo, name: str) -> None:
    def tap() -> None:
        _fifo_send(fifo, [f"hatari-event keydown {R_SCANCODE}"])
        time.sleep(0.08)
        _fifo_send(fifo, [f"hatari-event keyup {R_SCANCODE}"])
        time.sleep(0.08)

    if name == "plain":
        return
    if name == "tap":
        tap()
    elif name == "held":
        _fifo_send(fifo, [f"hatari-event keydown {R_SCANCODE}"])
    elif name == "double-tap":
        tap()
        tap()
    else:
        raise LabError(f"Unknown R condition {name!r}")
    # Let the IKBD event reach Damocles before taking the baseline. This delay
    # is deliberately outside the exact-VBL movement interval.
    time.sleep(0.20)


def _observe(
    *,
    action: str,
    condition: str,
    vbls: int,
    repeat: int,
    roms: Path,
    settle_seconds: float,
    trace: bool,
) -> tuple[Path, dict[str, Any]]:
    authority, config = load_configuration()
    root = resolve_roms_root(roms)
    program, tos = resolve_images(authority, root)
    program_info = validate_image(program, authority["programImage"], label="Working Authority STX")
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    if not SNAPSHOT.is_file():
        raise LabError(f"Snapshot not found: {SNAPSHOT}")

    run = WORK_ROOT / _run_id(f"walk-step-{action}-{condition}-{vbls}vbl-r{repeat}")
    run.mkdir(parents=True)
    fifo_path = run / "cmd.fifo"
    parse = run / "play.txt"
    before_path = run / "before.bin"
    after_path = run / "after.bin"
    endpoint = run / "endpoint.txt"
    if trace:
        scripts = [run / f"vbl-{index:03d}.txt" for index in range(1, vbls + 1)]
        captures = [run / f"vbl-{index:03d}.bin" for index in range(1, vbls + 1)]
        for index, (script, capture) in enumerate(zip(scripts, captures)):
            final = index == len(scripts) - 1
            lines = [
                "setopt hex",
                f"savebin {capture.resolve()} ${CAMERA:x} ${CAMERA_LEN:x}",
            ]
            if final:
                lines.extend(
                    (
                        f"w ${STICK:x} 00",
                        f"logfile {(run / 'endpoint.registers.log').resolve()}",
                        "r",
                        "quit",
                    )
                )
            else:
                lines.extend(
                    (
                        f"w ${STICK:x} {(UP if action == 'forward' else RIGHT):02x}",
                        f'b VBL = "VBL+1" :once :quiet :file {scripts[index + 1].resolve()}',
                        "c",
                    )
                )
            script.write_text("\n".join((*lines, "")), encoding="utf-8")
        endpoint = scripts[0]
        after_path = captures[-1]
    else:
        endpoint.write_text(
            "\n".join(
                (
                    "setopt hex",
                    f"w ${STICK:x} 00",
                    f"savebin {after_path.resolve()} ${CAMERA:x} ${CAMERA_LEN:x}",
                    f"logfile {(run / 'endpoint.registers.log').resolve()}",
                    "r",
                    "quit",
                    "",
                )
            ),
            encoding="utf-8",
        )
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
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
        )
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            if not fifo_path.exists():
                raise LabError(f"Hatari did not create {fifo_path}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle_seconds)
                _condition(fifo, condition)
                direction = UP if action == "forward" else RIGHT
                first_break = 1 if trace else vbls
                _fifo_send(
                    fifo,
                    [
                        "hatari-stop",
                        "hatari-debug setopt hex",
                        f"hatari-debug savebin {before_path.resolve()} ${CAMERA:x} ${CAMERA_LEN:x}",
                        f"hatari-debug w ${STICK:x} {direction:02x}",
                        (
                            f'hatari-debug b VBL = "VBL+{first_break}" :once :quiet '
                            f":file {endpoint.resolve()}"
                        ),
                        "hatari-cont",
                    ],
                )
                _wait_for(after_path, process, max(15, vbls / 25.0 + 15))
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

    before, after = _decode(before_path), _decode(after_path)
    trace_points = [_decode(run / f"vbl-{index:03d}.bin") for index in range(1, vbls + 1)] if trace else []
    previous = before
    per_vbl = []
    for index, point in enumerate(trace_points, start=1):
        per_vbl.append(
            {
                "vbl": index,
                "x": point["x"] - previous["x"],
                "z": point["z"] - previous["z"],
                "yaw": point["yaw"] - previous["yaw"],
            }
        )
        previous = point
    result: dict[str, Any] = {
        "action": action,
        "condition": condition,
        "vbls": vbls,
        "repeat": repeat,
        "before": before,
        "after": after,
        "delta": {
            "x": after["x"] - before["x"],
            "z": after["z"] - before["z"],
            "yaw": after["yaw"] - before["yaw"],
        },
        "perVbl": per_vbl,
        "authority": {
            "programSha256": program_info["hashes"]["sha256"],
            "tosSha256": tos_info["hashes"]["sha256"],
            "snapshotSha256": file_hash(SNAPSHOT),
        },
        "toolchain": toolchain.as_dict(),
    }
    (run / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return run, result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", required=True, type=Path)
    parser.add_argument("--vbls", type=int, nargs="+", default=[1, 2, 4, 8, 16])
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--settle-seconds", type=float, default=4.0)
    parser.add_argument(
        "--trace",
        action="store_true",
        help="capture every VBL within each leg (use with one count and repeat)",
    )
    parser.add_argument(
        "--conditions",
        nargs="+",
        choices=("plain", "tap", "held", "double-tap"),
        default=("plain", "tap", "held", "double-tap"),
    )
    parser.add_argument(
        "--actions", nargs="+", choices=("forward", "turn"), default=("forward", "turn")
    )
    args = parser.parse_args()
    if any(vbls <= 0 for vbls in args.vbls):
        parser.error("--vbls values must be positive")
    if args.repeats <= 0:
        parser.error("--repeats must be positive")
    if args.trace and (len(args.vbls) != 1 or args.repeats != 1):
        parser.error("--trace requires exactly one --vbls value and --repeats 1")

    observations: list[dict[str, Any]] = []
    runs: list[str] = []
    for action in args.actions:
        for condition in args.conditions:
            # Preserve the full count series for the two forward modes that
            # determine the step multiplier. One maximum-length turn run per R
            # condition is enough to expose its separate turn increment.
            counts = args.vbls
            if action == "turn" and condition != "plain":
                counts = [max(args.vbls)]
            if action == "forward" and condition in ("held", "double-tap"):
                counts = [max(args.vbls)]
            for vbls in counts:
                for repeat in range(1, args.repeats + 1):
                    run, result = _observe(
                        action=action,
                        condition=condition,
                        vbls=vbls,
                        repeat=repeat,
                        roms=args.roms,
                        settle_seconds=args.settle_seconds,
                        trace=args.trace,
                    )
                    runs.append(run.name)
                    observations.append(result)
                    delta = result["delta"]
                    print(
                        f"{run.name}: x={delta['x']} z={delta['z']} "
                        f"yaw={delta['yaw']}"
                    )

    summary = {
        "schemaVersion": 1,
        "method": "Hatari VBL breakpoint, fresh on-foot snapshot per observation",
        "runs": runs,
        "observations": observations,
    }
    summary_path = WORK_ROOT / _run_id("walk-step-summary")
    summary_path.mkdir(parents=True)
    (summary_path / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"summary {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
