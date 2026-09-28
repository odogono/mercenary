#!/usr/bin/env python3
"""What the ST draws below the horizon aboard a craft high over a Body (#573).

Aboard, the frame loop's flight branch (``$059822``) sets colour 8 to the sky ``$7C86`` and
colour 15 to the Body's base colour ``$7C88`` (``$7A1A`` instead while the craft is on the
ground). It draws the stars and the sky pass, then ``$0599D6``, then the ground records at
``$0560F2``. ``$0599D6`` fills the 136-row viewport below a horizon line in colour 15. The
line comes from the roll ``$7A9E``, the pitch ``$7AA0`` and the view terms ``$7982``/``$7986``
with the projection scale ``$7964``. No height word enters it.

``capture`` replays the #558 ``cross`` case (``space-flight-probe.py``) and takes a Hatari
screenshot at chosen stops: the climb over DION and the flight over LACHESIS from its
landing point at Y ``$1800000``. ``check`` reads each screenshot's viewport and counts, per
row, the pixels in the sky colour and in the Body's base colour.

Run from the repository root:

  python3 research/damocles-st/scripts/high-altitude-ground-probe.py capture --roms roms
  python3 research/damocles-st/scripts/high-altitude-ground-probe.py check --run <run-directory>

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("space_flight_probe", HERE / "space-flight-probe.py")
sfp = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
sys.modules["space_flight_probe"] = sfp
_spec.loader.exec_module(sfp)

u16, s32 = sfp.u16, sfp.s32

# Climbing over DION at pitch 655, then level over LACHESIS from its landing point.
SHOTS = (22, 24, 26, 30, 36, 50, 70, 216, 230, 260, 300)

SKY, BASE, LAND = 0x7C86, 0x7C88, 0x7A1A
ROLL, PITCH, Y = 0x7A9E, 0x7AA0, 0x7AB6

# Hatari 2.6.1 screenshots of this machine: 2x pixels, 96 px left border and
# 58 px (29 ST lines) top border (832x552 overall). The viewport is rows 0..135.
SHOT_SCALE, SHOT_LEFT, SHOT_TOP = 2, 96, 58
VIEW_ROWS, VIEW_COLUMNS = 136, 320


def capture(roms: Path | None, settle: float) -> Path:
    case = dict(sfp.CASES["cross"])
    case["stops"] = max(SHOTS) + 1
    shots = {
        stop: [f"screenshot {{run}}/shot-{stop:05d}.png"] for stop in SHOTS
    }
    write_chain = sfp._write_chain

    def with_shots(run: Path, stops: int, first: list[str], inputs: dict[int, list[str]]) -> None:
        extra = {stop: [line.format(run=run.resolve()) for line in lines] for stop, lines in shots.items()}
        write_chain(run, stops, first, sfp._merge(inputs, extra))

    sfp._write_chain = with_shots
    sfp.CASES["high-altitude"] = case
    run = sfp.run_case(roms, "high-altitude", settle)
    print(run)
    return run


def st_rgb(word: int) -> tuple[int, int, int]:
    """Hatari's screenshot maps each 3-bit ST level v to 34 * v."""
    return tuple(((word >> shift) & 7) * 34 for shift in (8, 4, 0))


def screenshot_pixels(path: Path) -> tuple[int, bytes]:
    width = int(subprocess.run(["magick", "identify", "-format", "%w", str(path)],
                               check=True, capture_output=True, text=True).stdout)
    raw = subprocess.run(["magick", str(path), "-depth", "8", "rgb:-"],
                         check=True, capture_output=True).stdout
    return width, raw


def check(run: Path) -> dict[str, Any]:
    frames = []
    for stop in SHOTS:
        shot = run / f"shot-{stop:05d}.png"
        ram = sfp._read_stop(run, stop)
        if ram is None or not shot.is_file():
            continue
        sky, base = st_rgb(u16(ram, SKY)), st_rgb(u16(ram, BASE))
        width, raw = screenshot_pixels(shot)
        rows = []
        for row in range(VIEW_ROWS):
            counts = {"sky": 0, "base": 0, "other": 0}
            for column in range(VIEW_COLUMNS):
                offset = 3 * ((SHOT_TOP + row * SHOT_SCALE) * width + SHOT_LEFT + column * SHOT_SCALE)
                pixel = tuple(raw[offset:offset + 3])
                kind = "sky" if pixel == sky else "base" if pixel == base else "other"
                counts[kind] += 1
            rows.append(counts)
        # The first row, from the bottom up, where the base colour is not the majority.
        ground = 0
        for counts in reversed(rows):
            if counts["base"] * 2 <= VIEW_COLUMNS:
                break
            ground += 1
        frames.append({
            "stop": stop,
            "y": s32(ram, Y),
            "roll": u16(ram, ROLL),
            "pitch": u16(ram, PITCH),
            "sky": f"${u16(ram, SKY):03X}",
            "base": f"${u16(ram, BASE):03X}",
            "land": f"${u16(ram, LAND):03X}",
            "skyPixels": sum(r["sky"] for r in rows),
            "basePixels": sum(r["base"] for r in rows),
            "otherPixels": sum(r["other"] for r in rows),
            "groundRowsFromBottom": ground,
        })
    result = {"run": run.name, "frames": frames}
    (run / "check.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    cap = sub.add_parser("capture")
    cap.add_argument("--roms", type=Path)
    cap.add_argument("--settle", type=float, default=2.0)
    chk = sub.add_parser("check")
    chk.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "capture":
        run = capture(args.roms, args.settle)
        print(json.dumps(check(run), indent=2))
        return 0
    print(json.dumps(check(args.run), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
