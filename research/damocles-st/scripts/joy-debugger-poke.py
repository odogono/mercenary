#!/usr/bin/env python3
"""Debugger poke experiment for Damocles locomotion input (NEGATIVE result).

Boots to first-world, memwrites the IKBD scancode queue at $61CC/$61CE via
hatari-debug `w`, continues with periodic refills, and compares t0/t1 display.

Result: the memwrite sticks (memwriteConfirmed=true) but the outdoor camera does
NOT move (viewportPixelDiffs=0) — walking is joystick-driven, not keyboard-
driven. Cited run: work/joy-debugger-poke-20260818T124048Z-bb02de4a.

The working approach pokes the joystick-1 direction soft-copy at $79C2 instead;
see joy-softcopy-poke.py and HATARI-RESEARCH.md. Kept here as the recorded
negative for the scancode-queue hypothesis.

Run from repo root:
  python3 research/damocles-st/scripts/joy-debugger-poke.py
"""

from __future__ import annotations

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
    WORK_ROOT,
    load_configuration,
    resolve_images,
    resolve_roms_root,
    _fifo_send,
    _run_id,
    capture,
)
from damocleslab.runtime import (  # noqa: E402
    build_hatari_command,
    headless_env,
    render_title_capture_script,
    render_vbl_wait_script,
)
from damocleslab.toolchain import discover_toolchain  # noqa: E402

KEY_COUNT = 0x61CC
KEY_QUEUE = 0x61CE
SCAN_UP = 0x48


def _sleep_vbls(count: int) -> None:
    time.sleep(max(0.05, count / 2000.0))


def main() -> int:
    authority, config = load_configuration()
    root = resolve_roms_root(None)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    run_id = _run_id("joy-debugger-poke")
    run_directory = WORK_ROOT / run_id
    capture(checkpoint="title-screen", roms_root=root, run_id=run_id)

    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    ready_log = run_directory / "observe-title.log"
    if ready_log.exists():
        ready_log.unlink()

    pc = config["checkpoints"]["title-screen"]["pc"]
    extra_vbls = int(config["checkpoints"]["title-screen"].get("extraVbls", 1400))
    on_title = run_directory / "observe-on-title.txt"
    wait_script = run_directory / "observe-wait-vbl.txt"
    parse_script = run_directory / "observe-boot.txt"
    on_title.write_text(f"logfile {ready_log.resolve()}\nr\nc\n", encoding="utf-8")
    wait_script.write_text(render_vbl_wait_script(dump_script=on_title, extra_vbls=extra_vbls), encoding="utf-8")
    parse_script.write_text(render_title_capture_script(next_script=wait_script, pc=pc), encoding="utf-8")

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=bool(config.get("fastForward", True)),
        statusbar=bool(config.get("statusbar", False)),
        cmd_fifo=fifo,
    )
    env = os.environ.copy()
    env.update(headless_env())
    observe_log = run_directory / "hatari-observe.log"
    process: subprocess.Popen[str] | None = None
    result: dict = {
        "runId": run_id,
        "toolchain": toolchain.as_dict(),
        "method": "fifo-open-memwrite-key-queue",
        "keyCount": f"${KEY_COUNT:04X}",
        "keyQueue": f"${KEY_QUEUE:04X}",
        "scancode": f"${SCAN_UP:02X}",
    }

    try:
        with observe_log.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
            )
            deadline = time.time() + int(config.get("hostTimeoutSeconds", 240))
            while time.time() < deadline:
                if ready_log.is_file() and ready_log.stat().st_size > 0:
                    break
                if process.poll() is not None:
                    raise LabError(f"Hatari exited before title; see {observe_log}")
                time.sleep(0.05)
            else:
                raise LabError(f"Timed out waiting for title; see {observe_log}")

            for _ in range(50):
                if fifo.exists():
                    break
                time.sleep(0.05)
            if not fifo.exists():
                raise LabError(f"Missing FIFO {fifo}")

            dump_parent = run_directory.resolve()
            with fifo.open("w", encoding="utf-8") as fifo_handle:
                _fifo_send(fifo_handle, ["hatari-event keypress 57"])
                _sleep_vbls(90000)
                if process.poll() is not None:
                    result["verdict"] = "hatari_died_during_world_load"
                else:
                    scancodes = " ".join(f"{SCAN_UP:02x}" for _ in range(8))
                    _fifo_send(
                        fifo_handle,
                        [
                            "hatari-stop",
                            f"hatari-debug logfile {dump_parent}/observed-t0.registers.log",
                            "hatari-debug r",
                            f"hatari-debug savebin {dump_parent}/observed-t0.ram 0 $100000",
                            f"hatari-debug screenshot {dump_parent}/observed-t0.png",
                            "hatari-debug setopt hex",
                            f"hatari-debug w ${KEY_COUNT:x} 00 08",
                            f"hatari-debug w ${KEY_QUEUE:x} {scancodes}",
                            f"hatari-debug savebin {dump_parent}/poke-verify.bin ${KEY_COUNT:x} 10",
                            "hatari-cont",
                        ],
                    )
                    artifact_deadline = time.time() + 30
                    while time.time() < artifact_deadline:
                        if (run_directory / "observed-t0.png").is_file() and (
                            run_directory / "poke-verify.bin"
                        ).is_file():
                            break
                        if process.poll() is not None:
                            break
                        time.sleep(0.05)
                    time.sleep(0.5)

                    for index in range(20):
                        if process.poll() is not None:
                            result["diedDuringPokes"] = index
                            break
                        _fifo_send(
                            fifo_handle,
                            [
                                "hatari-stop",
                                "hatari-debug setopt hex",
                                f"hatari-debug w ${KEY_COUNT:x} 00 08",
                                f"hatari-debug w ${KEY_QUEUE:x} {scancodes}",
                                "hatari-cont",
                            ],
                        )
                        time.sleep(1.0)

                    if process.poll() is None:
                        _fifo_send(
                            fifo_handle,
                            [
                                "hatari-stop",
                                f"hatari-debug logfile {dump_parent}/observed-t1.registers.log",
                                "hatari-debug r",
                                f"hatari-debug savebin {dump_parent}/observed-t1.ram 0 $100000",
                                f"hatari-debug screenshot {dump_parent}/observed-t1.png",
                                "hatari-debug quit",
                            ],
                        )
                        t1_deadline = time.time() + 30
                        while time.time() < t1_deadline:
                            if (run_directory / "observed-t1.png").is_file() or process.poll() is not None:
                                break
                            time.sleep(0.05)

            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
    finally:
        if process is not None and process.poll() is None:
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

    verify_bin = run_directory / "poke-verify.bin"
    result["pokeVerifyBinExists"] = verify_bin.is_file()
    if verify_bin.is_file():
        raw = verify_bin.read_bytes()
        result["pokeVerifyHex"] = raw.hex()
        result["memwriteConfirmed"] = raw[:2] == b"\x00\x08" and raw[2:10] == bytes([SCAN_UP] * 8)

    t0 = run_directory / "observed-t0.png"
    t1 = run_directory / "observed-t1.png"
    result["t0Exists"] = t0.is_file()
    result["t1Exists"] = t1.is_file()
    if t0.is_file() and t1.is_file():
        from PIL import Image

        a = Image.open(t0).convert("RGB")
        b = Image.open(t1).convert("RGB")
        width, height = a.size
        da, db = list(a.getdata()), list(b.getdata())
        diffs = [i for i in range(len(da)) if da[i] != db[i]]
        top = sum(1 for i in diffs if (i // width) < int(height * 0.55))
        result["viewportPixelDiffs"] = top
        result["panelPixelDiffs"] = len(diffs) - top
        result["viewportChanged"] = top > 100
        if (run_directory / "observed-t0.ram").is_file() and (run_directory / "observed-t1.ram").is_file():
            ram0 = (run_directory / "observed-t0.ram").read_bytes()
            ram1 = (run_directory / "observed-t1.ram").read_bytes()
            result["playfieldTopByteDiffs"] = sum(
                1 for i in range(160 * 150) if ram0[0x68000 + i] != ram1[0x68000 + i]
            )

    if "verdict" not in result:
        if result.get("viewportChanged") or result.get("playfieldTopByteDiffs", 0) > 500:
            result["verdict"] = "viewport_changed"
        elif result.get("memwriteConfirmed") and result.get("t1Exists"):
            result["verdict"] = "memwrite_ok_no_viewport_change"
        elif result.get("memwriteConfirmed"):
            result["verdict"] = "memwrite_ok_capture_incomplete"
        else:
            result["verdict"] = "failed"

    result["createdAt"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    out = run_directory / "joy-debugger-poke.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    print(f"wrote {out}", file=sys.stderr)
    return 0 if result["verdict"] == "viewport_changed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
