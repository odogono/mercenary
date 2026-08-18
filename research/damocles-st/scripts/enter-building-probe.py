#!/usr/bin/env python3
"""Multi-step Damocles locomotion probe via the $79C2 joystick-1 soft-copy.

Boots to first-world, then runs a sequence of stick_hold-style memwrites and
captures a PNG (+ optional RAM) after each step. Used to find a steer-and-
approach path into a building for outward-window evidence (#79).

Directions / bitmasks match damocleslab.core (up=$01 down=$02 left=$04
right=$08 fire=$80). Duration is scenario VBLs at the lab's host wait rate
(~2000 VBL/s under fast-forward).

Examples (from repo root):

  # short right turn, then walk forward
  python3 research/damocles-st/scripts/enter-building-probe.py right:3000 up:25000

  # turn a bit more, walk, turn left, walk again
  python3 research/damocles-st/scripts/enter-building-probe.py right:5000 up:15000 left:2000 up:20000
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

from damocleslab.core import (  # noqa: E402
    JOYSTICK1_SOFTCOPY,
    LabError,
    resolve_stick_bitmask,
    validate_image,
)
from damocleslab.laboratory import (  # noqa: E402
    WORK_ROOT,
    _fifo_send,
    _run_id,
    capture,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import (  # noqa: E402
    build_hatari_command,
    headless_env,
    render_title_capture_script,
    render_vbl_wait_script,
)
from damocleslab.toolchain import discover_toolchain  # noqa: E402

BURST_VBLS = 2000


def _sleep_vbls(count: int) -> None:
    time.sleep(max(0.05, count / 2000.0))


def _parse_steps(args: list[str]) -> list[tuple[str, int]]:
    if not args:
        raise SystemExit("usage: enter-building-probe.py <dir:vbls> [dir:vbls ...]")
    steps: list[tuple[str, int]] = []
    for arg in args:
        if ":" not in arg:
            raise SystemExit(f"bad step {arg!r}; expected direction:vbls")
        direction, raw = arg.split(":", 1)
        direction = direction.strip().lower()
        resolve_stick_bitmask(direction)  # validate
        vbls = int(raw)
        if not (0 < vbls <= 100000):
            raise SystemExit(f"vbls out of range in {arg!r}")
        steps.append((direction, vbls))
    return steps


def _hold(fifo_handle, process: subprocess.Popen[str], direction: str, vbls: int) -> None:
    bitmask = resolve_stick_bitmask(direction)
    addr = JOYSTICK1_SOFTCOPY
    remaining = vbls
    while remaining > 0:
        if process.poll() is not None:
            break
        chunk = min(BURST_VBLS, remaining)
        _fifo_send(
            fifo_handle,
            [
                "hatari-stop",
                "hatari-debug setopt hex",
                f"hatari-debug w ${addr:x} {bitmask:02x}",
                "hatari-cont",
            ],
        )
        _sleep_vbls(chunk)
        remaining -= chunk
    if process.poll() is None:
        _fifo_send(
            fifo_handle,
            [
                "hatari-stop",
                "hatari-debug setopt hex",
                f"hatari-debug w ${addr:x} 00",
                "hatari-cont",
            ],
        )
        time.sleep(0.1)


def _capture_frame(
    fifo_handle,
    process: subprocess.Popen[str],
    run_directory: Path,
    prefix: str,
    *,
    final: bool,
    with_ram: bool,
) -> None:
    dump_parent = run_directory.resolve()
    commands = [
        "hatari-stop",
        f"hatari-debug logfile {dump_parent}/{prefix}.registers.log",
        "hatari-debug r",
        f"hatari-debug screenshot {dump_parent}/{prefix}.png",
    ]
    if with_ram:
        commands.insert(3, f"hatari-debug savebin {dump_parent}/{prefix}.ram 0 $100000")
    commands.append("hatari-debug quit" if final else "hatari-cont")
    _fifo_send(fifo_handle, commands)
    deadline = time.time() + 45
    while time.time() < deadline:
        png_ready = (run_directory / f"{prefix}.png").is_file()
        ram_ready = (not with_ram) or (run_directory / f"{prefix}.ram").is_file()
        if png_ready and ram_ready:
            break
        if process.poll() is not None:
            break
        time.sleep(0.05)
    # Give Hatari time to leave the debugger and drain FIFO before the next poke.
    if not final:
        time.sleep(0.75)


def _summarise_png(path: Path) -> dict:
    from PIL import Image

    im = Image.open(path).convert("RGB")
    width, height = im.size
    top = im.crop((0, 0, width, int(height * 0.55)))
    colors = top.getcolors(maxcolors=200000) or []
    colors = sorted(colors, key=lambda item: -item[0])
    # Heuristic: interiors tend to lose the outdoor green ground + navy sky
    # dominance and gain wall greys / browns / cyans as large regions.
    green = sum(n for n, c in colors if c[1] > c[0] + 40 and c[1] > c[2] + 40)
    navy = sum(n for n, c in colors if c[2] > 20 and c[0] < 40 and c[1] < 40 and c[2] < 80)
    grey = sum(n for n, c in colors if abs(c[0] - c[1]) < 20 and abs(c[1] - c[2]) < 20 and 40 < c[0] < 200)
    return {
        "size": [width, height],
        "uniqueViewportColors": len(colors),
        "greenPixels": green,
        "navyPixels": navy,
        "greyPixels": grey,
        "topColors": [{"rgb": list(c), "n": n} for n, c in colors[:6]],
    }


def main() -> int:
    raw_args = sys.argv[1:]
    capture_each = False
    if "--each-step" in raw_args:
        capture_each = True
        raw_args = [a for a in raw_args if a != "--each-step"]
    steps = _parse_steps(raw_args)
    authority, config = load_configuration()
    root = resolve_roms_root(None)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    run_id = _run_id("enter-building-probe")
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
        "method": "fifo-memwrite-joy1-softcopy-sequence",
        "softcopy": f"${JOYSTICK1_SOFTCOPY:04X}",
        "steps": [{"direction": d, "vbls": v} for d, v in steps],
        "frames": [],
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

            with fifo.open("w", encoding="utf-8") as fifo_handle:
                _fifo_send(fifo_handle, ["hatari-event keypress 57"])
                _sleep_vbls(90000)
                if process.poll() is not None:
                    result["verdict"] = "hatari_died_during_world_load"
                else:
                    _capture_frame(
                        fifo_handle,
                        process,
                        run_directory,
                        "frame-00-spawn",
                        final=False,
                        with_ram=True,
                    )
                    result["frames"].append({"prefix": "frame-00-spawn", "after": "spawn"})
                    result["captureEachStep"] = capture_each

                    for index, (direction, vbls) in enumerate(steps, start=1):
                        if process.poll() is not None:
                            result["diedDuringStep"] = index
                            break
                        _hold(fifo_handle, process, direction, vbls)
                        final = index == len(steps)
                        if capture_each or final:
                            prefix = f"frame-{index:02d}-{direction}-{vbls}"
                            _capture_frame(
                                fifo_handle,
                                process,
                                run_directory,
                                prefix,
                                final=final,
                                with_ram=final,
                            )
                            result["frames"].append(
                                {"prefix": prefix, "after": {"direction": direction, "vbls": vbls}}
                            )

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

    for frame in result["frames"]:
        png = run_directory / f"{frame['prefix']}.png"
        frame["pngExists"] = png.is_file()
        if png.is_file():
            frame["summary"] = _summarise_png(png)

    # Crude interior heuristic: outdoor spawn has lots of navy+green; interior
    # usually drops green ground and gains mid greys / wall colours.
    spawn = next((f for f in result["frames"] if f["prefix"] == "frame-00-spawn"), None)
    last = result["frames"][-1] if result["frames"] else None
    if spawn and last and spawn.get("summary") and last.get("summary"):
        s, l = spawn["summary"], last["summary"]
        result["greenDrop"] = s["greenPixels"] - l["greenPixels"]
        result["navyDrop"] = s["navyPixels"] - l["navyPixels"]
        result["greyRise"] = l["greyPixels"] - s["greyPixels"]
        likely = l["greenPixels"] < s["greenPixels"] * 0.3 and l["navyPixels"] < s["navyPixels"] * 0.7
        result["likelyInterior"] = bool(likely)

    if "verdict" not in result:
        if not result["frames"] or not result["frames"][-1].get("pngExists"):
            result["verdict"] = "capture_failed"
        elif result.get("likelyInterior"):
            result["verdict"] = "likely_interior"
        else:
            result["verdict"] = "outdoor_or_unclear"

    result["createdAt"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    out = run_directory / "enter-building-probe.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    print(f"wrote {out}", file=sys.stderr)
    return 0 if result["verdict"] in {"likely_interior", "outdoor_or_unclear"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
