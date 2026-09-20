#!/usr/bin/env python3
"""Probe the Damocles island land/sea classifier on the Working Authority (#391).

The static decode says every body carries a list of ten-byte *island records* at
the longword ``$7A16``, terminated by the word ``$8000``:

    +0  word   origin x, in whole surface cells
    +2  word   origin z, in whole surface cells
    +4  word   offset from the record to the coastline vertex list
    +6  word   structure group -- the 16x16 workspace bound at this origin
    +8  word   the island's land colour, published to ``$7A1A``

``$056490`` picks the record nearest the player's *body* position
(``$7A92``/``$7A9A``) into ``$7894``; ``$056464`` then publishes its origin into
``$789A``/``$789E`` and falls into ``$04EB46``, which loads the record's group.
``$0560F2`` classifies the player against the selected island's coastline and
publishes the result in ``$78A6``: 0 inside the island's core box, 1 on the
island, ``$FFFF`` at sea.

This probe restores the pinned on-foot memstate, writes one probe position into
the body-position words, lets the machine settle, and reads back what the engine
itself selected and classified. Nothing is decoded from the capture: the machine
publishes ``$7894``, ``$789A``, ``$789E``, ``$794E``, ``$7A1A`` and ``$78A6``, and
the probe only compares them with the static decode.

Run from the repository root:

  python3 research/damocles-st/scripts/island-classification-probe.py \
      --roms roms --points research/damocles-st/scenarios/eris-island-points.json

  ... --screenshot       # also write a framebuffer PNG per point
  ... --json             # machine-readable

Captures stay under the laboratory's gitignored work directory.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
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

SNAPSHOTS = LAB_ROOT / "snapshots"
DEFAULT_SNAPSHOT = "boarded-car.sav"

# Words the engine publishes, captured as one contiguous block per probe point.
OBSERVE = 0x7890
OBSERVE_LEN = 0x40  # $7890..$78CF covers $7890, $7894, $789A, $789E, $78A2, $78A6
STATE = 0x7A16
STATE_LEN = 0x100  # $7A16..$7B15 covers $7A16, $7A1A, $7A2C.., $7A92.., $794E is low

CELL = 0x10000
# $058F64 masks each body position high word to twelve bits.
SURFACE_CELLS = 0x1000


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def _cell_gap(observed: float, requested: float) -> float:
    gap = (observed - requested) % SURFACE_CELLS
    return min(gap, SURFACE_CELLS - gap)


def _wait_for(path: Path, process: subprocess.Popen[str], seconds: float) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if path.is_file():
            return
        if process.poll() is not None:
            break
        time.sleep(0.02)
    raise LabError(f"Timed out waiting for {path}; process status={process.poll()}")


def _poke_word(address: int, value: int) -> str:
    return _poke(address, (value & 0xFFFF).to_bytes(2, "big"))


def _poke_long(address: int, value: int) -> str:
    return _poke(address, (value & 0xFFFFFFFF).to_bytes(4, "big"))


def _poke(address: int, octets: bytes) -> str:
    """Hatari's ``w`` takes space-separated byte values, not one packed word.

    Every byte carries an explicit ``$``: Hatari's expression parser reads a
    bare ``0d`` as its decimal-radix prefix and rejects the line, so an
    unprefixed poke silently drops whichever byte happens to look like one.
    """
    return f"w ${address:x} " + " ".join(f"${byte:02x}" for byte in octets)


def _observe_point(point: dict[str, Any], *, run: Path, hatari: Path, tos: Path,
                   program: Path, config: dict[str, Any], settle_vbls: int,
                   settle_seconds: float, screenshot: bool, commit: bool,
                   snapshot: Path) -> dict[str, Any]:
    """Restore the pinned pose, move the player, and read back what the engine did."""
    stem = run / point["id"]
    fifo_path = run / f"{point['id']}.fifo"
    parse = run / f"{point['id']}.play.txt"
    endpoint = run / f"{point['id']}.endpoint.txt"
    observe_bin = stem.with_suffix(".observe.bin")
    state_bin = stem.with_suffix(".state.bin")
    parse.write_text("c\n", encoding="utf-8")
    lines = ["setopt hex",
             f"savebin {observe_bin.resolve()} ${OBSERVE:x} ${OBSERVE_LEN:x}",
             f"savebin {state_bin.resolve()} ${STATE:x} ${STATE_LEN:x}"]
    if screenshot:
        lines.append(f"screenshot {stem.with_suffix('.png').resolve()}")
    lines.append("quit")
    endpoint.write_text("\n".join((*lines, "")), encoding="utf-8")

    x = int(round(point["x"] * CELL))
    y = int(round(point.get("y", 63 / CELL) * CELL))
    z = int(round(point["z"] * CELL))
    # $7AB2/$7AB6/$7ABA is the staged body position. $058F64 publishes it into
    # $7A92/$7A96/$7A9A and derives the scene camera $7A2C/$7A34 from it by
    # subtracting the workspace origin $789A/$789E, and the frame loop calls
    # $058F64 every frame ($0594F6, $0595D6, $0597B8). $7A3C/$7A44 is the
    # last-known-good position $059690 snaps back to when the classifier says
    # sea, so it moves with the probe unless --no-commit asks for the snap-back.
    pokes = [_poke_long(0x7AB2, x), _poke_long(0x7AB6, y), _poke_long(0x7ABA, z)]
    # $7AA2 is yaw and $7AC0 is pitch, both ten-bit, $0200 facing +z and level,
    # rising pitch putting the nose down (damocles-arrival-routes.md). An
    # overhead validation view is a pitch poke, not a different capture.
    if "yaw" in point:
        pokes.append(_poke_word(0x7AA2, int(point["yaw"]) & 0x3FF))
    if "pitch" in point:
        pokes.append(_poke_word(0x7AC0, int(point["pitch"]) & 0x3FF))
    if commit:
        pokes.extend([_poke_long(0x7A3C, x), _poke_long(0x7A44, z)])

    command = build_hatari_command(
        hatari_binary=hatari, tos=tos, disk_a=program,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse, fast_forward=True, statusbar=False, cmd_fifo=fifo_path,
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    with (run / f"{point['id']}.hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                   text=True, env=env)
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            if not fifo_path.exists():
                raise LabError(f"Hatari did not create {fifo_path}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle_seconds)
                # The whole block goes in one burst: `hatari-stop` halts the
                # emulator, and a halted Hatari does not drain the FIFO, so
                # pacing the lines loses every one after the stop. The burst
                # itself occasionally drops a line, which is why run_points
                # re-reads the engine's own published position and retries.
                _fifo_send(fifo, [
                    "hatari-stop",
                    "hatari-debug setopt hex",
                    *[f"hatari-debug {poke}" for poke in pokes],
                    f'hatari-debug b VBL = "VBL+{settle_vbls}" :once :quiet '
                    f":file {endpoint.resolve()}",
                    "hatari-cont",
                ])
                try:
                    _wait_for(state_bin, process, 30)
                except LabError:
                    # A teleport far from the pinned pose can leave the machine
                    # without a settled frame. Record the point as unobserved
                    # rather than abandoning the sweep.
                    return {"id": point["id"], "requested": [point["x"], point["z"]],
                            "unobserved": "no frame settled within 30s"}
                # `quit` inside a breakpoint script does not always unwind the
                # emulator promptly; the capture is already on disk by then.
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
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

    obs = observe_bin.read_bytes()
    state = state_bin.read_bytes()
    return {
        "id": point["id"],
        "requested": [point["x"], point["z"]],
        "nearestRecord": u32(obs, 0x7894 - OBSERVE),
        "originX": u16(obs, 0x789A - OBSERVE),
        "originZ": u16(obs, 0x789E - OBSERVE),
        "vertexList": u32(obs, 0x78A2 - OBSERVE),
        "classification": u16(obs, 0x78A6 - OBSERVE),
        "landColour": u16(state, 0x7A1A - STATE),
        "islandListRoot": u32(state, 0x7A16 - STATE),
        "bodyX": u32(state, 0x7A92 - STATE) / CELL,
        "bodyZ": u32(state, 0x7A9A - STATE) / CELL,
        "sceneX": struct.unpack_from(">i", state, 0x7A2C - STATE)[0] / CELL,
        "sceneZ": struct.unpack_from(">i", state, 0x7A34 - STATE)[0] / CELL,
    }


def run_points(points: list[dict[str, Any]], *, roms: Path, settle_vbls: int,
               screenshot: bool, settle_seconds: float, snapshot: Path,
               tolerance: float = 0.75, commit: bool = True) -> tuple[Path, list[dict[str, Any]]]:
    authority, config = load_configuration()
    root = resolve_roms_root(roms)
    program, tos = resolve_images(authority, root)
    validate_image(program, authority["programImage"], label="Working Authority STX")
    validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, _toolchain = discover_toolchain(config)
    if not snapshot.is_file():
        raise LabError(f"Snapshot not found: {snapshot}")
    run = WORK_ROOT / _run_id("island-classification")
    run.mkdir(parents=True)
    observed = []
    for point in points:
        # A point is only evidence if the engine's own published position is the
        # one that was asked for. Anything else is a lost poke, not a reading.
        for attempt in range(3):
            row = _observe_point(point, run=run, hatari=hatari, tos=tos,
                                 program=program, config=config,
                                 settle_vbls=settle_vbls,
                                 settle_seconds=settle_seconds,
                                 screenshot=screenshot, commit=commit,
                                 snapshot=snapshot)
            if "unobserved" in row:
                continue
            print(f"  [{point['id']}] attempt {attempt+1}: got "
                  f"{row['bodyX']:.2f},{row['bodyZ']:.2f} want {point['x']},{point['z']}",
                  file=sys.stderr)
            # The surface is a 4096-cell torus ($058F64 masks each high word
            # to twelve bits), so a point asked for at a negative cell comes
            # back wrapped. Compare on the torus or Snow Island's west coast
            # looks like a lost poke.
            if (_cell_gap(row["bodyX"], point["x"]) < tolerance
                    and _cell_gap(row["bodyZ"], point["z"]) < tolerance):
                row["attempts"] = attempt + 1
                break
        else:
            row = {"id": point["id"], "requested": [point["x"], point["z"]],
                   "unobserved": "the engine never published the requested position"}
        observed.append(row)
    return run, observed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--points", type=Path, required=True)
    parser.add_argument("--settle-vbls", type=int, default=12)
    parser.add_argument("--settle-seconds", type=float, default=2.0)
    parser.add_argument("--screenshot", action="store_true")
    parser.add_argument("--snapshot", type=Path,
                        default=SNAPSHOTS / DEFAULT_SNAPSHOT)
    parser.add_argument("--tolerance", type=float, default=0.75,
                        help="cells the engine may drift from the requested point")
    parser.add_argument("--no-commit", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    points = json.loads(args.points.read_text(encoding="utf-8"))["points"]
    run, observed = run_points(points, roms=args.roms, settle_vbls=args.settle_vbls,
                               screenshot=args.screenshot, settle_seconds=args.settle_seconds,
                               commit=not args.no_commit, snapshot=args.snapshot,
                               tolerance=args.tolerance)
    if args.json:
        print(json.dumps({"run": run.name, "observations": observed}, indent=2))
        return 0
    print(f"run {run.name}")
    header = f"{'point':<22}{'body x,z':<20}{'$7894':<10}{'origin':<14}{'$78A6':<8}{'$7A1A':<8}"
    print(header)
    for row in observed:
        print(f"{row['id']:<22}"
              f"{row['bodyX']:.2f},{row['bodyZ']:.2f}".ljust(42 - 22 + 22)[:20].ljust(20)
              + f"${row['nearestRecord']:06X}".ljust(10)
              + f"{row['originX']},{row['originZ']}".ljust(14)
              + f"${row['classification']:04X}".ljust(8)
              + f"${row['landColour']:04X}".ljust(8))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
