#!/usr/bin/env python3
"""Instance-orientation probe for the parked V.I.P. limo (#361).

The model-draw path at $05363A reads the drawn instance angle as the high byte
of the long at `$77A8 + slot*4`, not from `$79CD + slot`. This probe parks the
camera a fixed distance south of resident slot 5 on the Capital Spaceport pad,
screenshots the parked limo, then pokes candidate angle bytes into both
addresses and screenshots each. The $77A8 pokes must rotate the drawn mesh and
the $79CD poke must not.

Run from the repo root:
  python3 research/damocles-st/scripts/instance-heading-probe.py sweep
  python3 research/damocles-st/scripts/instance-heading-probe.py sweep \
      --offset-x -1400 --offset-z 130 --yaw 0x300

Output stays in the gitignored work/<run> directory. Findings are recorded in
docs/research/damocles-vip-limo.md as Working-Authority Evidence.
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import time
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

_spec = importlib.util.spec_from_file_location(
    "yaw_probe", Path(__file__).resolve().parent / "yaw-probe.py"
)
_yaw = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_yaw)
Probe = _yaw.Probe

DRAW_ANGLE = 0x77A8  # long per slot; the draw path reads the high byte
CLAIMED_HEADING = 0x79CD  # byte per slot, as the catalogue currently reads it
LIMO_SLOT = 5
LIMO_X, LIMO_Z = 0x00478388, 0x0088796F
ORIGIN_X, ORIGIN_Z = 0x00400000, 0x00800000
YAW, YAW_TWIN = 0x7AA2, 0x7AC2
ANGLES = (0x00, 0x20, 0x40, 0x7F, 0x80, 0xC0)


def _be32(value: int) -> tuple[int, int, int, int]:
    value &= 0xFFFFFFFF
    return (value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF


def sweep(offset: tuple[int, int], yaw: int) -> None:
    probe = Probe("instance-heading")
    try:
        parked = probe.dump("parked-table", DRAW_ANGLE + LIMO_SLOT * 4, 4, screenshot=False)
        claimed = probe.dump("parked-claimed", CLAIMED_HEADING + LIMO_SLOT, 1, screenshot=False)
        print(f"$77A8+5*4 = {parked.hex()}   $79CD+5 = {claimed.hex()}")

        cam_x, cam_z = LIMO_X + offset[0], LIMO_Z + offset[1]
        for address in (0x7A92, 0x7AB2, 0x7A3C):
            probe.poke(address, *_be32(cam_x))
        for address in (0x7A9A, 0x7ABA, 0x7A44):
            probe.poke(address, *_be32(cam_z))
        probe.poke(0x7A2C, *_be32(cam_x - ORIGIN_X))
        probe.poke(0x7A34, *_be32(cam_z - ORIGIN_Z))
        probe.poke(YAW, yaw >> 8, yaw & 0xFF)
        probe.poke(YAW_TWIN, yaw >> 8, yaw & 0xFF)
        time.sleep(1.5)
        probe.dump("parked", DRAW_ANGLE + LIMO_SLOT * 4, 4)
        pose = probe.dump("pose", 0x7A92, 0x14, screenshot=False)
        print(
            f"camera x={int.from_bytes(pose[0:4], 'big'):08X} "
            f"z={int.from_bytes(pose[8:12], 'big'):08X} "
            f"yaw={int.from_bytes(pose[0x10:0x12], 'big'):04X}"
        )

        for angle in ANGLES:
            probe.poke(DRAW_ANGLE + LIMO_SLOT * 4, angle)
            time.sleep(0.8)
            probe.dump(f"draw-{angle:02X}", DRAW_ANGLE + LIMO_SLOT * 4, 4)
            print(f"poked $77BC = ${angle:02X}")
        probe.poke(DRAW_ANGLE + LIMO_SLOT * 4, parked[0])
        time.sleep(0.8)
        probe.dump("restored", DRAW_ANGLE + LIMO_SLOT * 4, 4)
        for angle in (0x40, 0x80):
            probe.poke(CLAIMED_HEADING + LIMO_SLOT, angle)
            time.sleep(0.8)
            probe.dump(f"claimed-{angle:02X}", CLAIMED_HEADING + LIMO_SLOT, 1)
            print(f"poked $79D2 = ${angle:02X}")
        probe.poke(CLAIMED_HEADING + LIMO_SLOT, claimed[0])
    finally:
        probe.close()
    print(f"run {probe.run}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("sweep",))
    parser.add_argument("--offset-x", type=int, default=0)
    parser.add_argument("--offset-z", type=int, default=-1400)
    parser.add_argument("--yaw", type=lambda v: int(v, 0), default=0x0200)
    args = parser.parse_args()
    sweep((args.offset_x, args.offset_z), args.yaw)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
