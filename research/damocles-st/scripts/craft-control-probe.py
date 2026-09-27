#!/usr/bin/env python3
"""Damocles per-slot craft control routines (#549).

The craft routine table at ``$055C80`` has one 32-byte entry per craft slot. Each
entry opens with ``bra.w`` to that slot's control routine and carries fourteen
parameter words after it. This probe decodes the table and the routines, and then
checks the decode against the running program pass by pass.

``decode`` reads the pinned first-world RAM and every tracked or linked memstate
without Hatari. It hashes the ranges the note quotes, checks the instruction words
the decode rests on, and prints each slot's routine and parameters as numbers.

``trace`` boots one memstate and arms a chain of breakpoints on ``$057CC2``, the
craft dispatch, so the machine stops at the start of every craft pass. Each stop
saves the craft state and arms the next. Inputs are written from the stop scripts
at fixed passes: the stick into its joystick-1 byte ``$79C2`` and keys into the ACIA
mailbox ``$05558C``, which is what the keyboard handler itself would write. No host
timing decides what the machine sees.

Every pass is then replayed through ``model_pass``, a transcription of the decoded
pass in Python that uses the program's own log, exponent and sine tables read from
the stop. The run raises unless each pass's X, Y, Z, pitch, yaw, roll, contact, turn
rate, speed and panel speed equal what the program wrote, bit for bit. Passes that
the collision test refused are listed and left out of the comparison: the collision
response belongs to #550.

Run from the repository root:

  python3 research/damocles-st/scripts/craft-control-probe.py decode
  python3 research/damocles-st/scripts/craft-control-probe.py trace --roms roms --case limo
  python3 research/damocles-st/scripts/craft-control-probe.py trace --roms roms --case eagle

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
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
FIRST_WORLD = WORK_ROOT / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"

CRAFT_TABLE = 0x055C80
CRAFT_DISPATCH = 0x057CC2
SLOTS = 16
ENTRY = 32

# Craft state words. Longs unless noted.
STICK = 0x79C2  # byte: joystick-1 soft copy; bit 0 up, 1 down, 2 left, 3 right
TURN_RATE = 0x7970  # float
SPEED = 0x797A  # float
ALTITUDE = 0x79BA  # float of -Y, written by $058FAA
OCCUPANCY = 0x7AAE  # word: 1 on foot, 0 aboard, 2 in space; the slot is the word after it
SLOT = 0x7AB0
X = 0x7AB2
Y = 0x7AB6
Z = 0x7ABA
ROLL = 0x7ABE  # word
PITCH = 0x7AC0  # word
YAW = 0x7AC2  # word
CONTACT = 0x7ACA  # word
SUPPORTED = 0x7BC8  # word
SUPPORT_LEVEL = 0x7B02  # word
COS_PITCH, SIN_PITCH = 0x7AD6, 0x7ADA
COS_YAW, SIN_YAW = 0x7ADE, 0x7AE2
THROTTLE = 0x7BAC  # float
POST_LAUNCH = 0x7B0C  # word
REPLAY = 0x7A0C  # word
FRAMES_DRAWN = 0x7AE8  # word: +1 per frame loop
PANEL_SPEED = 0x4DFEC  # long
FRAME_VBLS = 0x51D22  # word: VBLs the last frame took
VBL_CLOCK = 0x51D98  # word: low word of the VBL clock $051D96
MAILBOX = 0x5558C  # byte: ACIA key mailbox the dispatcher $055496 reads
SUPPORTS = 0xCB7A  # fourteen-byte support records from +14 to a negative header

LOG_EXP = (0x060000, 0x066000)  # exponent table at $60000, sine and log table at $64000
WINDOWS = {
    "state": (0x007900, 0x007C20),
    "supports": (0x00CB7A, 0x00CE00),
    "panel": (0x04DFE8, 0x04DFF0),
    "clock": (0x051D20, 0x051DA0),
    "slot": (0x057F40, 0x057F46),
    "craft-table": (0x055C80, 0x055E80),
    "tables": LOG_EXP,
}

SCANCODES = {
    **{str(digit): 0x01 + digit for digit in range(1, 10)},
    "0": 0x0B,
    "minus": 0x0C,
    "equals": 0x0D,
    "b": 0x30,
    "space": 0x39,
    **{f"f{n}": 0x3A + n for n in range(1, 11)},
}
STICK_BITS = {"none": 0, "up": 1, "down": 2, "left": 4, "right": 8}

# Half-open ranges the note quotes. The three data slots inside the routines,
# $057DFE, $057E8E and $057F42, are written at run time and are excluded.
STATIC_WINDOWS = {
    "craft-table": (0x055C80, 0x055E80),
    "dispatch": (0x057CC2, 0x057CF2),
    "landing": (0x057CF2, 0x057D64),
    "fall": (0x057D64, 0x057DE6),
    "wheeled": (0x057DE6, 0x057DFE),
    "post-launch-pitch": (0x057F18, 0x057F42),
    "craft-pass": (0x057F46, 0x0583EA),
    "support-search": (0x0583EA, 0x05843C),
    "float-add": (0x04BD34, 0x04BDBE),
    "trig": (0x056072, 0x0560F2),
    "pose-copy": (0x058F64, 0x058FB0),
    "throttle-keys": (0x0556AA, 0x055708),
    "throttle-scale": (0x05575E, 0x0557D6),
    "throttle-table": (0x0557D6, 0x05581B),
    "stop-preset": (0x054744, 0x054764),
    "frame-loop-aboard": (0x05970E, 0x05977A),
    "substep-loop": (0x059542, 0x059586),
}

CODE_FACTS = {
    0x057CCE: ("0c7800017aae67001028", "on foot: the on-foot Mover $058CFE"),
    0x057CD8: ("6a000a54", "occupancy above 1: the space routine $05872E"),
    0x057CE4: ("eb403040", "slot x 32"),
    0x057CE8: ("d1fc00055c804ed0", "aboard: jump into the slot's 32-byte entry"),
    0x059512: ("0c7800017a8e6b0001f4", "the frame loop branches aboard before the substep loop"),
    0x059720: ("6100e5a0", "aboard: one craft pass per frame"),
    0x057FE8: ("22387bac068100010000", "target speed starts from the throttle, doubled"),
    0x05802C: ("4a787aca6706048100020000", "in contact the target speed is quartered"),
    0x0582A2: ("4a68000c66024483", "a craft with no pitch step negates its vertical step"),
    0x057DF0: ("04b8000000407a30", "the wheeled routine lowers the copy $7A30, not Y"),
    0x058F98: ("48f8000e7a2c", "$058F64 rewrites $7A2C-$7A37 from the pose each call"),
    0x0597B8: ("6100f7aa", "and is called again after the craft pass, before the frame draws"),
}


class ProbeError(RuntimeError):
    pass


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise ProbeError(message)


def u16(ram: bytes, address: int) -> int:
    return struct.unpack_from(">H", ram, address)[0]


def s16(ram: bytes, address: int) -> int:
    return struct.unpack_from(">h", ram, address)[0]


def u32(ram: bytes, address: int) -> int:
    return struct.unpack_from(">I", ram, address)[0]


def s32(ram: bytes, address: int) -> int:
    return struct.unpack_from(">i", ram, address)[0]


def _sx16(v: int) -> int:
    v &= 0xFFFF
    return v - 0x10000 if v & 0x8000 else v


def _sx32(v: int) -> int:
    v &= 0xFFFFFFFF
    return v - 0x100000000 if v & 0x80000000 else v


def value(f: int) -> float:
    """A float as a number: signed mantissa word / 4096, times 2 to the signed exponent word."""
    return _sx16(f) / 4096 * 2.0 ** _sx16(f >> 16)


# --- The program's number system ---------------------------------------------
#
# A float is a long: the high word is a signed binary exponent, the low word a
# signed mantissa normalised to 1.0-2.0 in units of $1000. A product is a log-table
# add: each mantissa is replaced by its entry in the table at $64000 (indexed by the
# signed mantissa), the two longs are added, and the sum's low word indexes the
# exponent table at $60000 through ror.w #4 / andi.w #$1FFE. $FF001000 (2^-256) is
# the program's zero.


class Tables:
    def __init__(self, ram: bytes) -> None:
        self.ram = ram

    def log(self, f: int) -> int:
        return (f & 0xFFFF0000) | u16(self.ram, 0x64000 + _sx16(f))

    def exp(self, f: int) -> int:
        w = f & 0xFFFF
        w = ((w >> 4) | (w << 12)) & 0xFFFF
        return (f & 0xFFFF0000) | u16(self.ram, 0x60000 + (w & 0x1FFE))

    def mul(self, a: int, b: int) -> int:
        return self.exp((self.log(a) + self.log(b)) & 0xFFFFFFFF)

    def sine(self, angle: int) -> int:
        return u32(self.ram, 0x64000 + ((angle * 4) & 0xFFC))


def fadd(d1: int, d2: int) -> int:
    """$04BD34: d2 := d1 + d2."""
    if _sx32(d1) >= _sx32(d2):
        d1, d2 = d2, d1
    m1, m2 = d1 & 0xFFFF, d2 & 0xFFFF
    diff = _sx16((d2 >> 16) - (d1 >> 16))
    if diff > 11:
        return d2
    shifted = (_sx16(m1) >> (diff & 63)) & 0xFFFF
    total = (m2 + shifted) & 0xFFFF
    d2 = (d2 & 0xFFFF0000) | total
    differ = (m1 ^ m2) & 0x8000
    if total & 0x8000 == 0:
        if total == 0:
            return (d2 + 0xFFF01000) & 0xFFFFFFFF
        if differ:
            while not d2 & 0x1000:
                d2 = (d2 & 0xFFFF0000) | ((d2 << 1) & 0xFFFF)
                d2 = (d2 - 0x10000) & 0xFFFFFFFF
            return (d2 & 0xFFFF0000) | (d2 & 0xFFFE)
        if d2 & 0x2000:
            d2 = (d2 & 0xFFFF0000) | ((_sx16(d2) >> 1) & 0xFFFF)
            d2 = (d2 + 0x10000) & 0xFFFFFFFF
        return (d2 & 0xFFFF0000) | (d2 & 0xFFFE)
    if differ:
        if not d2 & 0x1000:
            return (d2 & 0xFFFF0000) | (d2 & 0xFFFE)
        while d2 & 0x1000:
            d2 = (d2 & 0xFFFF0000) | ((d2 << 1) & 0xFFFF)
            d2 = (d2 - 0x10000) & 0xFFFFFFFF
        return d2
    if not d2 & 0x2000:
        d2 = (d2 & 0xFFFF0000) | ((_sx16(d2) >> 1) & 0xFFFF)
        d2 = (d2 + 0x10000) & 0xFFFFFFFF
    return (d2 & 0xFFFF0000) | (d2 & 0xFFFE)


def _asr32(v: int, count: int) -> tuple[int, bool]:
    count &= 63
    v = _sx32(v)
    if count == 0:
        return v & 0xFFFFFFFF, False
    carry = bool((v >> (count - 1)) & 1) if count <= 32 else v < 0
    return (v >> min(count, 63)) & 0xFFFFFFFF, carry


def to_fixed(f: int) -> int:
    """$05807A-$0580E0 and its three repeats: a float as a 32-bit integer, mantissa x 2^(exp-12)."""
    d3, d7 = f & 0xFFFFFFFF, f & 0xFFFFFFFF
    if _sx32(d7) < 0:
        d3 = _sx16(d3) & 0xFFFFFFFF
        d3 = ((d3 << 16) | (d3 >> 16)) & 0xFFFFFFFF
        d3 = _sx16(d3) & 0xFFFFFFFF
        if (d7 >> 16) + 1 & 0xFFFF == 0:
            return _sx32(d3 | 1)
        return 0
    shift = _sx16(29 - (d7 >> 16))
    if shift < 0:
        if shift + 1 == 0:
            m = _sx16(d3) << 2
            if -0x80000000 <= m << 16 < 0x80000000:
                return _sx32((m << 16) & 0xFFFC0000)
        return 0x7FFFFFFF if _sx16(d3) >= 0 else -0x80000000
    d3 = (((d3 * 2) & 0xFFFF) << 16) & 0xFFFFFFFF
    d3, carry = _asr32(d3, shift)
    return _sx32(d3 + (1 if carry else 0))


def to_word(f: int) -> int:
    """$05837A-$0583A6 and $0583B8-$0583E4: a float as a word, mantissa x 2^(exp-12)."""
    d4, d7 = f & 0xFFFFFFFF, f & 0xFFFFFFFF
    if _sx32(d7) < 0:
        d4 = _sx16(d4) & 0xFFFFFFFF
        d4 = ((d4 << 16) | (d4 >> 16)) & 0xFFFFFFFF
        if (d7 >> 16) + 1 & 0xFFFF == 0:
            return _sx16(d4 | 1)
        return 0
    shift = (14 - (d7 >> 16)) & 0xFFFF
    d4 = (_sx16(d4) << 2) & 0xFFFFFFFF
    d4, carry = _asr32(d4, shift)
    if carry:
        d4 = (d4 & 0xFFFF0000) | ((d4 + 1) & 0xFFFF)
    return _sx16(d4)


# --- The craft table ---------------------------------------------------------

ROUTINES = {
    0x05872E: "space",
    0x057F46: "flying (common craft pass)",
    0x057DE6: "wheeled (common craft pass, then the $7A30 test)",
    0x057D64: "fall",
}


def craft_entry(ram: bytes, slot: int) -> dict[str, Any]:
    base = CRAFT_TABLE + slot * ENTRY
    _check(u16(ram, base) == 0x6000, f"slot {slot}: entry does not open with bra.w")
    target = base + 2 + s16(ram, base + 2)
    words = [u16(ram, base + i) for i in range(4, ENTRY, 2)]
    entry = {
        "slot": slot,
        "routine": f"${target:06X}",
        "kind": ROUTINES.get(target, "unknown"),
        "hex": ram[base:base + ENTRY].hex(),
    }
    if target == 0x057D64:
        entry["fall"] = {
            "yStep": u32(ram, base + 4),
            "tumble78EE": s16(ram, base + 8),
            "pitchStep": s16(ram, base + 10),
            "yawStep": s16(ram, base + 12),
        }
        return entry
    entry["params"] = {
        "turnDamping+4": {"raw": f"${u32(ram, base + 4):08X}", "value": value(u32(ram, base + 4))},
        "turnAccel+8": {"raw": f"${u32(ram, base + 8):08X}", "value": value(u32(ram, base + 8))},
        "pitchStep+C": s16(ram, base + 0x0C),
        "rollExponent+E": s16(ram, base + 0x0E),
        "unread+10": {"raw": f"${u32(ram, base + 0x10):08X}", "value": value(u32(ram, base + 0x10))},
        "speedLag+14": {"raw": f"${u32(ram, base + 0x14):08X}", "value": value(u32(ram, base + 0x14))},
        "unread+18": s16(ram, base + 0x18),
        "ceilingAndLaunch+1A": s16(ram, base + 0x1A),
        "thrustGain+1C": {"raw": f"${u32(ram, base + 0x1C):08X}", "value": value(u32(ram, base + 0x1C))},
    }
    entry["words"] = [f"{w:04X}" for w in words]
    return entry


# --- The pass ----------------------------------------------------------------


def support_search(ram: bytes, x: int, y: int, z: int) -> int | None:
    """$0583EA: the record offset whose support stands under the eye, or None."""
    if (y >> 16) & 0xFFFF:
        return None
    ye, xe, ze = y & 0xFFFF, x & 0xFFFF, z & 0xFFFF
    a = SUPPORTS
    while True:
        a += 14
        if s16(ram, a) < 0:
            return None
        d = _sx16(u16(ram, a + 2) + 63 - ye)
        if d < 0 or d > 0x80:
            continue
        if xe < u16(ram, a + 4) or xe > u16(ram, a + 6):
            continue
        if ze < u16(ram, a + 8) or ze > u16(ram, a + 10):
            continue
        return a


def model_pass(ram: bytes) -> dict[str, Any]:
    """One craft pass from the state in ``ram``, taken at $057CC2 aboard."""
    t = Tables(ram)
    _check(u16(ram, OCCUPANCY) == 0, "model_pass runs aboard only")
    slot = u16(ram, SLOT)
    base = CRAFT_TABLE + slot * ENTRY
    target = base + 2 + s16(ram, base + 2)
    _check(target in (0x057F46, 0x057DE6), f"slot {slot}: routine ${target:06X} is not modelled")
    p = lambda off: u32(ram, base + off)  # noqa: E731
    pw = lambda off: s16(ram, base + off)  # noqa: E731
    out: dict[str, Any] = {"slot": slot, "events": []}
    x, y, z = u32(ram, X), u32(ram, Y), u32(ram, Z)
    pitch, yaw, roll = u16(ram, PITCH), u16(ram, YAW), u16(ram, ROLL)
    contact = u16(ram, CONTACT)
    _check(u16(ram, POST_LAUNCH) == 0, "the post-launch pitch path is not modelled")
    _check(u16(ram, REPLAY) == 0, "the stick replay path is not modelled")
    stick = ram[STICK]
    # Turn rate: damped, then accelerated by the stick.
    r = u32(ram, TURN_RATE)
    if _sx32(r) >= _sx32(0xFF000000):
        r = t.mul(r, p(4))
    if stick & 8:
        r = fadd(p(8), r)
    elif stick & 4:
        r = fadd((p(8) & 0xFFFF0000) | ((-p(8)) & 0xFFFF), r)
    # Pitch: the stick's up bit adds the step, its down bit subtracts it.
    step = pw(0x0C)
    if not stick & 2:
        pitch = (pitch + step) & 0x3FF
    if not stick & 1:
        pitch = (pitch - step) & 0x3FF
    # Target speed.
    target_speed = (u32(ram, THROTTLE) + 0x10000) & 0xFFFFFFFF
    alt = u32(ram, ALTITUDE)
    alt = (alt & 0xFFFF0000) | ((-alt) & 0xFFFF)
    alt = (alt - 0x100000) & 0xFFFFFFFF
    factor = None
    if _sx32(alt) >= 0:
        factor = min(_sx32(alt), 0x51000)
        target_speed = t.mul(target_speed, factor)
    if contact:
        target_speed = (target_speed - 0x20000) & 0xFFFFFFFF
    target_speed = t.mul(target_speed, p(0x1C))
    speed = t.mul(fadd(u32(ram, SPEED), target_speed), p(0x14))
    magnitude = speed if not speed & 0x8000 else (speed & 0xFFFF0000) | ((-speed) & 0xFFFF)
    out["panelSpeed"] = to_fixed(magnitude)
    # Displacement along the pre-pass attitude.
    cp, sp = u32(ram, COS_PITCH), u32(ram, SIN_PITCH)
    cy, sy = u32(ram, COS_YAW), u32(ram, SIN_YAW)
    dz = to_fixed(t.mul(t.mul(cp, cy), speed))
    dx = to_fixed(t.mul(t.mul(cp, sy), speed))
    z = (z + dz) & 0xFFFFFFFF
    x = (x + dx) & 0xFFFFFFFF
    vertical = t.mul(sp, speed)
    if not vertical & 0x8000:
        over = _sx16(pw(0x1A) - (y >> 16))
        if over < 0:
            vertical = (vertical + ((over & 0xFFFF) << 16)) & 0xFFFFFFFF
            out["events"].append("ceiling")
    dy = to_fixed(vertical)
    if pw(0x0C) == 0:
        dy = -dy
    out.update(dx=_sx32(dx), dy=dy, dz=_sx32(dz), altitudeFactor=None if factor is None else value(factor))
    y = (y + dy) & 0xFFFFFFFF
    supported, level = u16(ram, SUPPORTED), u16(ram, SUPPORT_LEVEL)
    if _sx32(y) >= 0x40:
        hit = support_search(ram, x, y, z)
        if hit is None:
            contact, supported, level = 0, 0, 0
            grounded = False
        else:
            supported = 0x3F
            y = (y & 0xFFFF0000) | ((u16(ram, hit + 2) + 0x3F) & 0xFFFF)
            level = u16(ram, hit + 12)
            grounded = True
            out["events"].append("support")
    else:
        if _sx32(dy) < -100 or ((pitch >> 2) & 0xFF) >= 0xA0:
            out["events"].append("landing-handler")
            out["landing"] = True
            return out
        y = 0x3F
        grounded = True
    if grounded:
        contact = 0x3F
        roll = 0
        if pitch > 0x1FF or _sx16(speed) < 0 or _sx32(speed) <= 0x4FFFF:
            pitch = 0x1FF
    # Yaw from the turn rate, scaled by cos^4 pitch near the vertical.
    d4 = r
    if 0x80 <= (pitch & 0x3FF) < 0x180:
        c = t.exp((t.log(u32(ram, COS_PITCH)) * 2) & 0xFFFFFFFF)
        c = t.exp((t.log(c) * 2) & 0xFFFFFFFF)
        d4 = t.exp((t.log(d4) + t.log(c)) & 0xFFFFFFFF)
    yaw = (yaw + to_word(d4)) & 0xFFFF
    if not contact:
        roll = to_word((r + ((pw(0x0E) & 0xFFFF) << 16)) & 0xFFFFFFFF) & 0xFFFF
    out.update(
        x=x, y=y, z=z, pitch=pitch, yaw=yaw, roll=roll, contact=contact,
        supported=supported, supportLevel=level, turnRate=r, speed=speed,
    )
    if target == 0x057DE6 and not contact:
        # $057DEA-$057DF8: lower the frame's copy of Y, and land if it goes negative.
        if _sx32(u32(ram, 0x7A30) - 0x40) < 0:
            out["events"].append("wheeled-landing")
            out["landing"] = True
    return out


def observed(ram: bytes) -> dict[str, Any]:
    return {
        "x": u32(ram, X), "y": u32(ram, Y), "z": u32(ram, Z),
        "pitch": u16(ram, PITCH), "yaw": u16(ram, YAW), "roll": u16(ram, ROLL),
        "contact": u16(ram, CONTACT), "supported": u16(ram, SUPPORTED),
        "supportLevel": u16(ram, SUPPORT_LEVEL),
        "turnRate": u32(ram, TURN_RATE), "speed": u32(ram, SPEED),
        "panelSpeed": s32(ram, PANEL_SPEED),
    }


COMPARED = ("x", "y", "z", "pitch", "yaw", "roll", "contact", "supported", "supportLevel", "turnRate", "speed", "panelSpeed")


def compare(before: bytes, after: bytes) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    model = model_pass(before)
    seen = observed(after)
    if model.get("landing"):
        return model, seen, []
    # $058F64 masks the high words of X and Z to twelve bits after the pass.
    for key in ("x", "z"):
        model[key] = model[key] & 0x0FFFFFFF
    bad = [k for k in COMPARED if model[k] != seen[k]]
    return model, seen, bad


# --- Static decode -----------------------------------------------------------


def _memstates() -> list[Path]:
    found = sorted(SNAPSHOTS.glob("*.sav")) + sorted((SNAPSHOTS / "rehosted").glob("*.sav"))
    return [p for p in found if p.exists()]


def decode() -> int:
    ram = FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(ram).hexdigest() == FIRST_WORLD_SHA256, "pinned first-world RAM hash mismatch")
    report: dict[str, Any] = {"windows": {}, "slots": []}
    for name, (start, end) in STATIC_WINDOWS.items():
        report["windows"][name] = {"range": f"${start:06X}-${end:06X}", "sha256": hashlib.sha256(ram[start:end]).hexdigest()}
    report["windows"]["log-exp-sine-tables"] = {
        "range": f"${LOG_EXP[0]:06X}-${LOG_EXP[1]:06X}",
        "sha256": hashlib.sha256(ram[LOG_EXP[0]:LOG_EXP[1]]).hexdigest(),
    }
    for address, (hexwords, meaning) in CODE_FACTS.items():
        got = ram[address:address + len(hexwords) // 2].hex()
        _check(got == hexwords, f"${address:06X}: {got} is not {hexwords} ({meaning})")
    # The sine table: entry i is sin(2 pi (i + 1/2) / 1024).
    t = Tables(ram)
    worst = max(abs(value(t.sine(i)) - math.sin(2 * math.pi * (i + 0.5) / 1024)) for i in range(1024))
    _check(worst < 1 / 2048, f"sine table differs from sin(2pi(i+1/2)/1024) by {worst}")
    report["sineTableWorstError"] = worst
    # Products agree with real multiplication to the table's precision.
    worst_mul = 0.0
    for a in range(0x1000, 0x2000, 0x36):
        for b in range(0x1000, 0x2000, 0x3A):
            got = value(t.mul(a, b))
            want = value(a) * value(b)
            worst_mul = max(worst_mul, abs(got - want) / want)
    report["mulWorstRelativeError"] = worst_mul
    for slot in range(SLOTS):
        report["slots"].append(craft_entry(ram, slot))
    # Code identity across every memstate, excluding the three run-time data slots.
    data_slots = set(range(0x057DFE, 0x057E02)) | set(range(0x057E8E, 0x057E92)) | set(range(0x057F42, 0x057F46))
    identical = []
    for path in _memstates():
        other = hatari_memstate_ram(path.read_bytes())
        for name, (start, end) in STATIC_WINDOWS.items():
            diff = [a for a in range(start, end) if other[a] != ram[a] and a not in data_slots]
            _check(not diff, f"{path.name}: {name} differs at {[hex(a) for a in diff[:4]]}")
        _check(other[LOG_EXP[0]:LOG_EXP[1]] == ram[LOG_EXP[0]:LOG_EXP[1]], f"{path.name}: tables differ")
        identical.append(path.name)
    report["memstatesIdentical"] = identical
    # What each capture that stands aboard says about the steady state.
    aboard = []
    for path in _memstates():
        other = hatari_memstate_ram(path.read_bytes())
        if u16(other, OCCUPANCY) != 0:
            continue
        aboard.append({
            "memstate": path.name,
            "slot": u16(other, SLOT),
            "y": s32(other, Y),
            "pitch": f"${u16(other, PITCH):03X}",
            "contact": u16(other, CONTACT),
            "throttle": value(u32(other, THROTTLE)),
            "speed": value(u32(other, SPEED)),
            "panelSpeed": s32(other, PANEL_SPEED),
            "frameVbls": u16(other, FRAME_VBLS),
        })
    report["aboard"] = aboard
    print(json.dumps(report, indent=2))
    return 0


# --- Live trace --------------------------------------------------------------


def _poke(address: int, value_: int, size: str = "b") -> str:
    width = {"b": 1, "w": 2, "l": 4}[size]
    data = value_.to_bytes(width, "big")
    return f"w ${address:x} " + " ".join(f"${b:02x}" for b in data)


def _key_lines(key: str) -> list[str]:
    return [_poke(MAILBOX, SCANCODES[key])]


def _stick_lines(direction: str) -> list[str]:
    return [_poke(STICK, STICK_BITS[direction])]


# A case: the memstate, the number of passes, and the inputs written at given stops.
CASES: dict[str, dict[str, Any]] = {
    # The V.I.P. LIMO parked by the airport, slot 5: throttle, both turns, both pitch
    # directions (a wheeled craft has no pitch step), reverse and stop.
    "limo": {
        "memstate": "boarded-limo.sav",
        "stops": 260,
        "inputs": {
            4: _key_lines("2"),
            30: _stick_lines("right"),
            50: _stick_lines("left"),
            70: _stick_lines("up"),
            90: _stick_lines("down"),
            110: _stick_lines("none"),
            120: _key_lines("f2"),
            170: _key_lines("space"),
            200: _key_lines("4"),
            230: _key_lines("space"),
        },
    },
    # EAGLE NINE S E from the Dion pose, slot 3: board, throttle on the ground, nose up
    # off the ground, a banked turn, level flight, nose down to the ground.
    "eagle": {
        "memstate": "rehosted/dion-2-3.sav",
        "stops": 900,
        "inputs": {
            4: _key_lines("b"),
            40: _key_lines("4"),
            70: _stick_lines("down"),
            110: _stick_lines("none"),
            200: _stick_lines("right"),
            260: _stick_lines("none"),
            320: _stick_lines("left"),
            350: _stick_lines("none"),
            420: _stick_lines("up"),
            440: _stick_lines("none"),
        },
    },
    # EAGLE NINE S E: a gentle climb, a level turn, a shallow descent and a landing.
    "eagle-land": {
        "memstate": "rehosted/dion-2-3.sav",
        "stops": 520,
        "inputs": {
            4: _key_lines("b"),
            40: _key_lines("4"),
            70: _stick_lines("down"),
            76: _stick_lines("none"),
            140: _stick_lines("right"),
            170: _stick_lines("none"),
            200: _stick_lines("up"),
            212: _stick_lines("none"),
        },
    },
    # EAGLE NINE S E: a climb, then a dive steeper than the ground branch accepts.
    "eagle-crash": {
        "memstate": "rehosted/dion-2-3.sav",
        "stops": 300,
        "inputs": {
            4: _key_lines("b"),
            40: _key_lines("4"),
            70: _stick_lines("down"),
            76: _stick_lines("none"),
            150: _stick_lines("up"),
            172: _stick_lines("none"),
        },
    },
    # EAGLE NINE S E at key 3: the ground speed stays below the take-off threshold.
    "eagle-slow": {
        "memstate": "rehosted/dion-2-3.sav",
        "stops": 160,
        "inputs": {
            4: _key_lines("b"),
            40: _key_lines("3"),
            70: _stick_lines("down"),
            100: _stick_lines("none"),
        },
    },
    # Controls, not ordinary routes. EAGLE NINE S E in a gentle climb is lifted by a poke
    # to just under the altitude where the frame loop enters space ($05976A), and, in
    # the second case, relabelled as slot 10 (CONCORD III, +$1A = 90) above its ceiling.
    "eagle-high": {
        "memstate": "rehosted/dion-2-3.sav",
        "stops": 160,
        "inputs": {
            4: _key_lines("b"),
            40: _key_lines("4"),
            70: _stick_lines("down"),
            76: _stick_lines("none"),
            100: [_poke(Y, 0x01EF0000, "l")],
        },
    },
    "concord-ceiling": {
        "memstate": "rehosted/dion-2-3.sav",
        "stops": 200,
        "inputs": {
            4: _key_lines("b"),
            40: _key_lines("4"),
            70: _stick_lines("down"),
            76: _stick_lines("none"),
            100: [_poke(Y, 0x00580000, "l"), _poke(SLOT, 10, "w")],
        },
    },
    # A control, not an ordinary route: the parked limo lifted to Y 2000 by a poke, to
    # show what a wheeled craft does with no ground under it.
    "limo-lifted": {
        "memstate": "boarded-limo.sav",
        "stops": 120,
        "first": [_poke(Y, 2000, "l"), _poke(0x7A30, 2000, "l")],
        "inputs": {40: _key_lines("4")},
    },
    "limo-lifted-fast": {
        "memstate": "boarded-limo.sav",
        "stops": 220,
        "first": [_poke(Y, 2000, "l"), _poke(0x7A30, 2000, "l")],
        "inputs": {10: _key_lines("9")},
    },
}


def _stop_path(run: Path, index: int, key: str) -> Path:
    return run / f"p{index:04d}-{key}.bin"


def _read_stop(run: Path, index: int) -> bytes | None:
    ram = bytearray(0x70000)
    for key, (start, end) in WINDOWS.items():
        path = _stop_path(run, index, key)
        if not path.is_file() or path.stat().st_size != end - start:
            return None
        ram[start:end] = path.read_bytes()
    return bytes(ram)


def _write_chain(run: Path, stops: int, first: list[str], inputs: dict[int, list[str]]) -> None:
    scripts = [run / f"pass-{i:04d}.txt" for i in range(stops)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex"]
        for key, (start, end) in WINDOWS.items():
            lines.append(f"savebin {_stop_path(run, index, key).resolve()} ${start:x} ${end - start:x}")
        if index == 0:
            lines += first
        lines += inputs.get(index, [])
        if index + 1 < stops:
            # A breakpoint armed on the instruction the machine is stopped at fires again
            # at once, so each stop hops through the next instruction before re-arming.
            hop = run / f"hop-{index:04d}.txt"
            hop.write_text(
                f"b pc = ${CRAFT_DISPATCH:x} :once :quiet :file {scripts[index + 1].resolve()}\nc\n",
                encoding="utf-8",
            )
            lines.append(f"b pc = ${CRAFT_DISPATCH + 6:x} :once :quiet :file {hop.resolve()}")
            lines.append("c")
        else:
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_case(roms: Path | None, name: str, settle: float) -> int:
    case = CASES[name]
    run = WORK_ROOT / _run_id(f"craft-control-{name}")
    run.mkdir(parents=True)
    snapshot = SNAPSHOTS / case["memstate"]
    _write_chain(run, case["stops"], case.get("first", []), case["inputs"])
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    meta: dict[str, Any] = {
        "case": name,
        "memstate": case["memstate"],
        "memstateSha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        "programSha256": validate_image(program, authority["programImage"], label="Working Authority STX")["hashes"]["sha256"],
        "tosSha256": validate_image(tos, authority["tosImage"], label="TOS image")["hashes"]["sha256"],
        "probeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "inputs": {str(k): v for k, v in case["inputs"].items()},
        "first": case.get("first", []),
    }
    hatari, toolchain = discover_toolchain(config)
    meta["toolchain"] = toolchain.as_dict()
    fifo_path = run / "cmd.fifo"
    parse = run / "parse.txt"
    parse.write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari, tos=tos, disk_a=program,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse, fast_forward=False, statusbar=False, cmd_fifo=fifo_path,
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, text=True, env=env)
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            _check(fifo_path.exists(), f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle)
                _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                _fifo_send(fifo, [f"hatari-debug b pc = ${CRAFT_DISPATCH:x} :once :quiet :file {(run / 'pass-0000.txt').resolve()}"])
                seen, last = 0, time.monotonic()
                while process.poll() is None:
                    while _read_stop(run, seen) is not None:
                        seen, last = seen + 1, time.monotonic()
                    _check(time.monotonic() - last < 60, f"the chain stalled after {seen} stops")
                    time.sleep(0.05)
        except BrokenPipeError:
            pass
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    stops = []
    while (s := _read_stop(run, len(stops))) is not None:
        stops.append(s)
    _check(len(stops) == case["stops"], f"only {len(stops)} of {case['stops']} stops")
    result = analyse(stops, case)
    result["meta"] = meta
    result["run"] = run.name
    (run / "trace.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "passes"}, indent=2))
    return 0


def _pokes(lines: list[str]) -> list[tuple[int, bytes]]:
    """The memory writes in a stop's debugger lines, as (address, bytes)."""
    found = []
    for line in lines:
        parts = line.split()
        if parts and parts[0] == "w":
            found.append((int(parts[1][1:], 16), bytes(int(b[1:], 16) for b in parts[2:])))
    return found


def analyse(stops: list[bytes], case: dict[str, Any] | None = None) -> dict[str, Any]:
    """Replay each pass from its stop. A poke written at a stop is seen by that stop's
    pass, so it is applied to the stop's image first. The key mailbox is the exception:
    the dispatcher has already run in that frame, and the key lands in the next."""
    passes = []
    matched = refused = 0
    mismatches = []
    written: dict[int, list[tuple[int, bytes]]] = {}
    if case:
        written[0] = _pokes(case.get("first", []))
        for stop, lines in case["inputs"].items():
            written.setdefault(stop, []).extend(_pokes(lines))
    for index, (before, after) in enumerate(zip(stops, stops[1:])):
        pokes = [(a, b) for a, b in written.get(index, []) if a != MAILBOX]
        if pokes:
            image = bytearray(before)
            for address, data in pokes:
                image[address:address + len(data)] = data
            before = bytes(image)
        row: dict[str, Any] = {
            "stop": index,
            "occupancy": u16(before, OCCUPANCY),
            "slot": u16(before, SLOT),
            "frame": u16(before, FRAMES_DRAWN),
            "vbl": u16(before, VBL_CLOCK),
            "frameVbls": u16(before, FRAME_VBLS),
            "stick": before[STICK],
            "throttle": f"${u32(before, THROTTLE):08X}",
            "state": {k: (f"${v:08X}" if k in ("turnRate", "speed") else v) for k, v in observed(before).items()},
        }
        # A second pass aboard in the same frame is the collision response's re-run.
        same_frame_next = (
            u16(after, FRAMES_DRAWN) == u16(before, FRAMES_DRAWN)
            and u16(after, OCCUPANCY) == 0
        )
        row["refused"] = same_frame_next and row["occupancy"] == 0
        if row["occupancy"] == 0 and not same_frame_next and u16(after, OCCUPANCY) == 0:
            prev_same = (
                index > 0
                and u16(stops[index - 1], OCCUPANCY) == 0
                and u16(stops[index - 1], FRAMES_DRAWN) == u16(before, FRAMES_DRAWN)
            )
            if prev_same:
                row["note"] = "the collision response's second pass"
            model, seen, bad = compare(before, after)
            row["events"] = model["events"]
            row["model"] = {k: model.get(k) for k in ("dx", "dy", "dz", "altitudeFactor", "panelSpeed")}
            if model.get("landing"):
                row["note"] = "landing handler"
            elif prev_same:
                pass
            elif bad:
                mismatches.append({"stop": index, "fields": {k: [model[k], seen[k]] for k in bad}})
            else:
                matched += 1
        elif same_frame_next and row["occupancy"] == 0:
            refused += 1
        passes.append(row)
    frames = [p for p in passes if p["occupancy"] == 0]
    vbl_steps = [
        (u16(b, VBL_CLOCK) - u16(a, VBL_CLOCK)) & 0xFFFF
        for a, b in zip(stops, stops[1:])
        if u16(a, OCCUPANCY) == 0 and u16(b, FRAMES_DRAWN) != u16(a, FRAMES_DRAWN)
    ]
    summary = {
        "passesAboard": len(frames),
        "passesMatched": matched,
        "refusedPasses": refused,
        "mismatches": mismatches[:40],
        "mismatchCount": len(mismatches),
        "vblsPerPass": {str(v): vbl_steps.count(v) for v in sorted(set(vbl_steps))},
        "passes": passes,
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("decode")
    tr = sub.add_parser("trace")
    tr.add_argument("--roms", type=Path)
    tr.add_argument("--case", choices=sorted(CASES), required=True)
    tr.add_argument("--settle", type=float, default=2.0)
    args = parser.parse_args()
    try:
        if args.command == "decode":
            return decode()
        return run_case(args.roms, args.case, args.settle)
    except (ProbeError, LabError) as error:
        print(f"craft-control-probe: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
