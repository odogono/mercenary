#!/usr/bin/env python3
"""Camera yaw and instance-heading probe (#204).

Boots headless from snapshots/eris-spaceport-onfoot.sav with fast-forward off,
so wall-clock seconds map to VBLs at 50 Hz, and drives the joystick-1 soft-copy
$79C2 over the command FIFO (right=$08, left=$04, up=$01). Modes:

  hold     rest, two right holds, three left holds; dump $7A00-$7B00 each time
           and print the words that changed. Finds the yaw word and its sign.
  period   hold right for N seconds, saving the yaw word and a screenshot every
           second; print each frame's viewport difference from the rest frame so
           the wrap (the smallest recurring difference) can be read off.
  axis     walk forward at rest, poke the yaw word a quarter turn on, walk again;
           print the camera position words $7A92/$7A9A after each walk.
  heading  park the camera south of the V.I.P. limo, poke $79CD+5 through the
           cardinals, screenshot each, then walk one step and poke $40.

Run from repo root:
  python3 research/damocles-st/scripts/yaw-probe.py hold
  python3 research/damocles-st/scripts/yaw-probe.py period 50
  python3 research/damocles-st/scripts/yaw-probe.py axis
  python3 research/damocles-st/scripts/yaw-probe.py heading

Output stays in the gitignored work/<run> directory. Findings are recorded in
docs/research/damocles-walk-board-flight.md as Working-Authority Evidence.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

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

SNAPSHOT = LAB_ROOT / "snapshots" / "eris-spaceport-onfoot.sav"
STICK = 0x79C2
YAW = 0x7AA2
YAW_TWIN = 0x7AC2
CAMERA_BLOCK = 0x7A8E  # walk flag; +4 x, +8 y, +12 z (signed 16.16), +$14 yaw
HEADING = 0x79CD
LIMO_SLOT, SHIP_SLOT = 5, 7
WINDOW_LO, WINDOW_LEN = 0x7A00, 0x100
RIGHT, LEFT, UP = 0x08, 0x04, 0x01
CARDINALS = (("00", 0x00), ("40", 0x40), ("80", 0x80), ("C0", 0xC0))


class Probe:
    def __init__(self, name: str) -> None:
        authority, config = load_configuration()
        root = resolve_roms_root(None)
        program, tos = resolve_images(authority, root)
        validate_image(program, authority["programImage"], label="Working Authority STX")
        validate_image(tos, authority["tosImage"], label="TOS image")
        hatari, _ = discover_toolchain(config)
        if not SNAPSHOT.is_file():
            raise LabError(f"Snapshot not found: {SNAPSHOT}")
        self.run = WORK_ROOT / _run_id(f"yaw-{name}")
        self.run.mkdir(parents=True, exist_ok=True)
        self.fifo = self.run / "cmd.fifo"
        parse = self.run / "play.txt"
        parse.write_text("c\n", encoding="utf-8")
        command = build_hatari_command(
            hatari_binary=hatari, tos=tos, disk_a=program,
            machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
            parse_script=parse, fast_forward=False, statusbar=False, cmd_fifo=self.fifo,
            extra_args=["--memstate", str(SNAPSHOT.resolve())],
        )
        env = os.environ.copy()
        env.update(headless_env())
        self.log = (self.run / "hatari.log").open("w", encoding="utf-8")
        self.process = subprocess.Popen(command, stdout=self.log, stderr=subprocess.STDOUT, text=True, env=env)
        for _ in range(200):
            if self.fifo.exists() or self.process.poll() is not None:
                break
            time.sleep(0.05)
        if not self.fifo.exists():
            raise LabError("Hatari did not create the command FIFO")
        time.sleep(2.0)
        self.fh = self.fifo.open("w", encoding="utf-8")

    def send(self, *cmds: str) -> None:
        _fifo_send(self.fh, ["hatari-stop", "hatari-debug setopt hex", *cmds, "hatari-cont"])

    def poke(self, address: int, *bytes_: int) -> None:
        self.send(f"hatari-debug w ${address:x} " + " ".join(f"{b:02x}" for b in bytes_))

    def hold(self, direction: int, seconds: float) -> None:
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            self.poke(STICK, direction)
            time.sleep(0.1)
        self.poke(STICK, 0)
        time.sleep(0.3)

    def dump(self, name: str, lo: int, length: int, screenshot: bool = True) -> bytes:
        path = self.run / f"{name}.bin"
        cmds = [f"hatari-debug savebin {path} ${lo:x} ${length:x}"]
        if screenshot:
            cmds.append(f"hatari-debug screenshot {self.run}/{name}.png")
        self.send(*cmds)
        for _ in range(100):
            if path.is_file() and path.stat().st_size == length:
                break
            time.sleep(0.05)
        return path.read_bytes()

    def close(self) -> None:
        try:
            _fifo_send(self.fh, ["hatari-debug quit"])
            self.fh.close()
        finally:
            time.sleep(1)
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
            self.log.close()
            if self.fifo.exists():
                self.fifo.unlink()


def mode_hold(seconds: float) -> None:
    probe = Probe("hold")
    steps = [("rest", 0, 0.0), ("right1", RIGHT, seconds), ("right2", RIGHT, seconds),
             ("left1", LEFT, seconds), ("left2", LEFT, seconds), ("left3", LEFT, seconds)]
    dumps: dict[str, bytes] = {}
    try:
        for name, direction, secs in steps:
            if secs:
                probe.hold(direction, secs)
            dumps[name] = probe.dump(name, WINDOW_LO, WINDOW_LEN)
    finally:
        probe.close()
    names = [s[0] for s in steps]
    changed = sorted({i for a, b in zip(names, names[1:]) for i in range(WINDOW_LEN) if dumps[a][i] != dumps[b][i]})
    print(f"run {probe.run}")
    print("changed bytes:", [f"${WINDOW_LO + i:04X}" for i in changed])
    for off in range(0, WINDOW_LEN, 2):
        if off in changed or off + 1 in changed:
            print(f"${WINDOW_LO + off:04X}: " + "  ".join(
                f"{n}={int.from_bytes(dumps[n][off:off + 2], 'big'):04X}" for n in names))


def mode_period(seconds: float) -> None:
    probe = Probe("period")
    frames: list[tuple[str, int]] = []
    try:
        start = time.monotonic()
        index = 0
        while time.monotonic() - start < seconds:
            name = f"s{index:03d}"
            yaw = int.from_bytes(probe.dump(name, YAW, 2), "big")
            frames.append((name, yaw))
            probe.hold(RIGHT, 0.7)
            index += 1
    finally:
        probe.close()
    from PIL import Image, ImageChops

    def viewport(name: str) -> Image.Image:
        image = Image.open(probe.run / f"{name}.png").convert("RGB")
        return image.crop((0, 0, image.width, int(image.height * 0.7)))

    base = viewport(frames[0][0])
    print(f"run {probe.run}")
    for name, yaw in frames:
        diff = ImageChops.difference(base, viewport(name)).getbbox()
        changed = sum(1 for px in ImageChops.difference(base, viewport(name)).getdata() if px != (0, 0, 0))
        print(f"{name} yaw={yaw:04X} viewportDiffPixels={changed} bbox={diff}")


def mode_axis(seconds: float) -> None:
    probe = Probe("axis")

    def camera(name: str) -> None:
        block = probe.dump(name, CAMERA_BLOCK, 0x20)
        x = int.from_bytes(block[4:8], "big", signed=True)
        y = int.from_bytes(block[8:12], "big", signed=True)
        z = int.from_bytes(block[12:16], "big", signed=True)
        yaw = int.from_bytes(block[0x14:0x16], "big")
        print(f"{name:10s} yaw={yaw:04X} x={x} y={y} z={z}")

    try:
        camera("rest")
        probe.hold(UP, seconds)
        camera("walked")
        rest_yaw = int.from_bytes(probe.dump("yaw", YAW, 2, screenshot=False), "big")
        quarter = (rest_yaw + 0x100) & 0xFFFF
        probe.poke(YAW, quarter >> 8, quarter & 0xFF)
        probe.poke(YAW_TWIN, quarter >> 8, quarter & 0xFF)
        time.sleep(0.5)
        camera("quarter")
        probe.hold(UP, seconds)
        camera("walked2")
    finally:
        probe.close()
    print(f"run {probe.run}")


def _heading_at(table: bytes, slot: int) -> int:
    return table[slot]


def _be32(value: int) -> tuple[int, int, int, int]:
    value &= 0xFFFFFFFF
    return (value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF


def _poke_u32(probe: Probe, address: int, value: int) -> None:
    probe.poke(address, *_be32(value))


def mode_heading(seconds: float) -> None:
    from PIL import Image, ImageChops

    probe = Probe("heading")
    try:
        rest_headings = probe.dump("rest", HEADING, 256)
        rest_yaw = int.from_bytes(probe.dump("rest-yaw", YAW, 2, screenshot=False), "big")
        print(
            f"rest yaw={rest_yaw:04X} limo=${_heading_at(rest_headings, LIMO_SLOT):02X} "
            f"ship=${_heading_at(rest_headings, SHIP_SLOT):02X}"
        )
        # Standing on the arrival ship: B boards slot 7 (heading $FF) if the
        # occupancy path runs, giving a second heading-to-yaw sample besides the
        # parked limo at $00 → $01FC.
        _fifo_send(probe.fh, ["hatari-event keydown 48"])
        time.sleep(0.15)
        _fifo_send(probe.fh, ["hatari-event keyup 176"])
        time.sleep(0.8)
        boarded = probe.dump("board-ship", CAMERA_BLOCK, 0x20)
        print(
            f"after-B walk={int.from_bytes(boarded[0:2], 'big'):04X} "
            f"craft={int.from_bytes(boarded[2:4], 'big', signed=True)} "
            f"yaw={int.from_bytes(boarded[0x14:0x16], 'big'):04X} "
            f"x={int.from_bytes(boarded[4:8], 'big'):08X} "
            f"z={int.from_bytes(boarded[12:16], 'big'):08X}"
        )
        # Park south of the limo, facing north, so heading 0's long axis is readable.
        limo_x, limo_z = 0x00478388, 0x0088796F
        origin_x, origin_z = 0x00400000, 0x00800000
        cam_x, cam_z = limo_x, limo_z - 0x5000
        for addr in (0x7A92, 0x7AB2, 0x7A3C):
            _poke_u32(probe, addr, cam_x)
        for addr in (0x7A9A, 0x7ABA, 0x7A44):
            _poke_u32(probe, addr, cam_z)
        _poke_u32(probe, 0x7A2C, cam_x - origin_x)
        _poke_u32(probe, 0x7A34, cam_z - origin_z)
        probe.poke(YAW, 0x06, 0x00)
        probe.poke(YAW_TWIN, 0x06, 0x00)
        time.sleep(0.6)
        probe.dump("south", HEADING, 256)
        for name, value in CARDINALS:
            probe.poke(HEADING + LIMO_SLOT, value)
            time.sleep(0.6)
            table = probe.dump(f"limo-{name}", HEADING, 256)
            print(f"limo-{name} poked={value:02X} read=${_heading_at(table, LIMO_SLOT):02X}")
        probe.poke(HEADING + LIMO_SLOT, 0x00)
        time.sleep(0.4)
        probe.hold(UP, 0.3)
        probe.dump("south-step", HEADING, 256)
        probe.poke(HEADING + LIMO_SLOT, 0x40)
        probe.hold(UP, 0.3)
        probe.dump("south-step-40", HEADING, 256)

        def pixels(a: str, b: str) -> int:
            left = Image.open(probe.run / f"{a}.png").convert("RGB")
            right = Image.open(probe.run / f"{b}.png").convert("RGB")
            crop = (0, 0, left.width, int(left.height * 0.7))
            return sum(
                1
                for px in ImageChops.difference(left.crop(crop), right.crop(crop)).getdata()
                if px != (0, 0, 0)
            )

        for pair in (
            ("rest", "south"),
            ("south", "limo-00"),
            ("limo-00", "limo-40"),
            ("limo-00", "limo-80"),
            ("limo-00", "limo-C0"),
            ("south-step", "south-step-40"),
        ):
            try:
                print(f"viewportDiff {pair[0]} vs {pair[1]}={pixels(*pair)}")
            except FileNotFoundError as error:
                print(f"missing {error}")
        print(f"hold-seconds={seconds}")
    finally:
        probe.close()
    print(f"run {probe.run}")


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "hold"
    defaults = {"hold": 1.0, "period": 50.0, "axis": 6.0, "heading": 0.0}
    arg = float(sys.argv[2]) if len(sys.argv) > 2 else defaults[mode]
    {
        "hold": mode_hold,
        "period": mode_period,
        "axis": mode_axis,
        "heading": mode_heading,
    }[mode](arg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
