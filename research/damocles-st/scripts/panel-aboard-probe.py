#!/usr/bin/env python3
"""Damocles panel readouts aboard a craft (#551).

Four panel facts are decoded from the program and checked here:

- the speed field ``$04DFF4`` prints the long ``$04DFEC`` that the craft
  routines derive from the speed ``$797A``, a float in the program's own
  log-table format; in space the derivation is relativistic;
- the altitude window ``$04DF42`` prints eye Y ``$7AB6`` over 16 as a 16.16
  number;
- the second lamp ``$050A5C`` is lit while the encounter gate ``$070104`` is
  non-zero;
- the impact clock ``$793C`` gains one second each time the VBL handler has
  subtracted ``$7876`` from ``$787A`` past zero, with ``$787A`` reloaded by
  ``$7878``; aboard in space ``$7876`` is 32 times the Lorentz factor.

``decode`` reads the pinned first-world RAM and the memstates without Hatari:
it checks the instruction words the decode rests on, hashes the ranges the
note quotes, emulates the float library on the tables in RAM, and checks the
speed and altitude derivations against every memstate that holds a speed.

``live`` boots one memstate and runs a chain that stops on every VBL, saving
small RAM windows (and a screenshot every ``--shot-every`` stops). Keys go in
as the make code the ACIA handler leaves in its mailbox ``$05558C``, written
from a stop script, so a case needs no host timing. Every case raises unless
each stop's clock, speed field and altitude agree with the decode.

Run from the repository root:

  python3 research/damocles-st/scripts/panel-aboard-probe.py decode
  python3 research/damocles-st/scripts/panel-aboard-probe.py live --roms roms --case launch

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
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

SNAPSHOTS = LAB_ROOT / "snapshots"
FIRST_WORLD = WORK_ROOT / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"

LOG_TABLE = 0x64000  # a5: word log2 of a mantissa, indexed by the signed mantissa word
EXP_TABLE = 0x60000  # a6: mantissa word of a log fraction, indexed by (fraction | sign) & $1FFE

CLOCK = 0x793C  # long: minus the seconds left
TIME_STEP = 0x7876  # word: subtracted from the accumulator every VBL
TIME_RELOAD = 0x7878  # word: $19 << the time option, added back on each tick
TIME_ACCUMULATOR = 0x787A
SPEED = 0x797A  # float: the craft's speed, mantissa word $797C carries the sign
SPEED_FIELD = 0x4DFEC  # long: what the speed field prints
THROTTLE = 0x7BAC
OCCUPANCY = 0x7AAE
SCENE = 0x7A8E
CONTACT = 0x7ACA
EYE_Y = 0x7AB6
FLOOR = 0x7AC4
BODY_DISTANCE = 0x791C  # float: the nearest range, System units (docs/research/damocles-sky-bodies.md)
TIME_OPTION = 0x7C98  # option 3's value word in the panel option table at $7C8C
ENCOUNTER = 0x70104
LAMP_CACHE = 0x50A5A
VBL_CLOCK = 0x51D98  # low word of the long the VBL handler increments at $051E34
MAILBOX = 0x5558C
SCREEN = 0x42C00  # long: the buffer the panel is drawn into

SPEED_OF_LIGHT = 0x2FF77FC6  # $058B1A: the speed field's c, 299 792 458 when printed

# Instruction words the decode rests on, checked byte for byte.
CODE_FACTS = {
    # The VBL handler's clock.
    0x051E6E: ("30387876", "move.w $7876,d0"),
    0x051E72: ("9178787a6f00032a", "sub.w d0,$787a; ble $521a2"),
    0x0521A2: ("3038787852b8793cd178787a6fe8", "reload $7878, $793C += 1, until the accumulator is positive"),
    0x04D612: ("3038786e323c0019e16131c17878", "$7878 = $19 << the time option"),
    # The speed field.
    0x04DFF4: ("22390004dfec", "move.l $4dfec,d1"),
    0x04E010: ("4a78797c6a02700c", "the sign glyph from the mantissa word $797C"),
    0x04E026: ("c283d2812001e581d280", "d1 = (d1 & $0FFFFFFF) * 10"),
    0x054744: ("21fcff0010007bac21fcff001000797a42787a1c42b90004dfec", "boarding zeroes throttle, speed and field"),
    0x059744: ("4478797c", "the collision response negates the speed's mantissa"),
    # Surface craft: the field is the speed as an integer, and the clock runs at the ordinary rate.
    0x058076: ("21c1797a", "move.l d1,$797a"),
    0x0580E0: ("23c30004dfec31fc00207876", "store the field; $7876 = $20"),
    # Space: 32 gamma, and the relativistic field.
    0x05893E: ("283c000a1000", "1024 as a float"),
    0x0589A2: ("31c378760c4300bc6e00010c0c4300206e74", "$7876 = sqrt(v^2 + 1024); the three regimes"),
    0x0589BC: ("283c001817fc", "c / 32"),
    0x058A28: ("263c004511fa", "1024 c^2"),
    0x058A42: ("283c003b11fa", "c^2"),
    0x058AB8: ("263c002617fc", "512 c"),
    0x058B1A: ("283c2ff77fc6", "c as the field's integer"),
    # The altitude window.
    0x04DF42: ("0c78000a7ac46608243c7fffffff600424387ab6e88a64025282", "Floor 10 prints **; else (Y >> 4) rounded"),
    0x04DF76: ("48410c4100646d0c", "an integer part of 100 or more prints **"),
    0x04DF90: ("c4fc0064", "mulu #100: two decimal digits of the fraction"),
    # The second lamp.
    0x050A5C: ("343900070104b47900050a5a", "the lamp reads the encounter gate"),
    0x050A76: ("303c07c0", "five pixels, x 213-217"),
    0x04D93A: ("61003120", "the surface panel calls the lamp"),
    0x04D960: ("610030fa", "so does the space panel"),
}

STATIC_WINDOWS = {
    "speed-field": (0x04DFF4, 0x04E058),
    "altitude-window": (0x04DF42, 0x04DFC4),
    "space-altitude": (0x04DEEE, 0x04DF42),
    "second-lamp": (0x050A5C, 0x050ABC),
    "vbl-clock": (0x051E6E, 0x051E86),
    "clock-tick": (0x0521A2, 0x0521B8),
    "time-option": (0x04D612, 0x04D662),
    "surface-speed": (0x05807A, 0x0580EC),
    "space-speed": (0x05892C, 0x058B28),
    "float-add": (0x04BD34, 0x04BDBE),
}

# --- the float library ---------------------------------------------------------------------------

M32 = 0xFFFFFFFF


def _s16(value: int) -> int:
    value &= 0xFFFF
    return value - 0x10000 if value & 0x8000 else value


def _s32(value: int) -> int:
    value &= M32
    return value - 0x100000000 if value & 0x80000000 else value


def _u16(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 2], "big")


def _u32(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 4], "big")


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(f"not reproduced: {message}")


class Floats:
    """The program's floats: exponent word, then a signed mantissa word of 1.12 (value m/4096 * 2^e).

    Products and quotients go through the two tables: the log table replaces the mantissa word
    with a log2 fraction (sign in bit 0), the exponents and fractions add as one long, and the exp
    table turns the fraction back into a mantissa.
    """

    def __init__(self, ram: bytes):
        self.log = ram[LOG_TABLE - 0x8000 : LOG_TABLE + 0x8000]
        self.exp = ram[EXP_TABLE : EXP_TABLE + 0x2000]

    def _log(self, x: int) -> int:
        index = _s16(x) + 0x8000
        return (x & 0xFFFF0000) | int.from_bytes(self.log[index : index + 2], "big")

    def _exp(self, x: int) -> int:
        low = x & 0xFFFF
        low = ((low >> 4) | (low << 12)) & 0x1FFE  # ror.w #4; andi.w #$1ffe
        return (x & 0xFFFF0000) | int.from_bytes(self.exp[low : low + 2], "big")

    def mul(self, a: int, b: int) -> int:
        return self._exp((self._log(a) + self._log(b)) & M32)

    def div(self, a: int, b: int) -> int:
        return self._exp((self._log(a) - self._log(b)) & M32)

    def square(self, a: int) -> int:
        return self._exp((2 * self._log(a)) & M32)

    def sqrt(self, a: int) -> int:
        d = _s32(self._log(a)) >> 1  # asr.l #1
        low = ((d & 0xFFFF) >> 4) & 0x0FFE  # lsr.w #4; andi.w #$ffe
        return (d & 0xFFFF0000) | int.from_bytes(self.exp[low : low + 2], "big")

    @staticmethod
    def add(d1: int, d2: int) -> int:
        """$04BD34, instruction for instruction."""
        d1 &= M32
        d2 &= M32
        if not _s32(d1) < _s32(d2):
            d1, d2 = d2, d1
        d6 = ((d1 << 16) | (d1 >> 16)) & M32
        d7 = ((d2 << 16) | (d2 >> 16)) & M32
        d7 = (d7 & 0xFFFF0000) | ((d7 - d6) & 0xFFFF)
        if _s16(d7) > 11:
            return d2
        shifted = _s16(d1) >> (d7 & 63) if (d7 & 63) < 16 else (-1 if _s16(d1) < 0 else 0)
        low = (d2 + shifted) & 0xFFFF
        d2 = (d2 & 0xFFFF0000) | low
        differ = bool(((d6 ^ d7) & M32) & 0x80000000)
        if low == 0:
            return (d2 + 0xFFF01000) & M32
        if not low & 0x8000:  # positive sum
            if not differ:
                if low & 0x2000:
                    d2 = (d2 & 0xFFFF0000) | ((_s16(d2) >> 1) & 0xFFFF)
                    d2 = (d2 + 0x10000) & M32
                return d2 & 0xFFFFFFFE
            if low & 0x1000:
                return d2 & 0xFFFFFFFE
            while True:
                d2 = (d2 & 0xFFFF0000) | ((d2 << 1) & 0xFFFF)
                d2 = (d2 - 0x10000) & M32
                if d2 & 0x1000:
                    return d2
        if differ:
            if not low & 0x1000:
                return d2 & 0xFFFFFFFE
            while True:
                d2 = (d2 & 0xFFFF0000) | ((d2 << 1) & 0xFFFF)
                d2 = (d2 - 0x10000) & M32
                if not d2 & 0x1000:
                    return d2
        if not low & 0x2000:
            d2 = (d2 & 0xFFFF0000) | ((_s16(d2) >> 1) & 0xFFFF)
            d2 = (d2 + 0x10000) & M32
        return d2 & 0xFFFFFFFE

    @staticmethod
    def to_long(x: int, *, rounded: bool) -> int:
        """The fix to a 32-bit integer: m * 2^(e-12), from $05807A (rounded) or $0589D6."""
        exponent, mantissa = _s16(x >> 16), _s16(x)
        if exponent < 0:
            if rounded and exponent == -1:
                return 1
            return 0 if mantissa >= 0 else M32
        shift = 29 - exponent
        if shift >= 0:
            value = _s32(((2 * mantissa) & 0xFFFF) << 16)
            result = value >> shift
            if rounded and shift and (value >> (shift - 1)) & 1:
                result += 1
            return result & M32
        if shift == -1:
            value = mantissa << 18
            if -(1 << 31) <= value < (1 << 31):
                return value & 0xFFFC0000 & M32
        return 0x7FFFFFFF if mantissa >= 0 else 0x80000000

    @staticmethod
    def to_word(x: int) -> int:
        """$058964: the fix to a 16-bit integer, rounded, which gives $7876."""
        exponent, mantissa = _s16(x >> 16), _s16(x)
        if exponent < 0:
            return 1 if exponent == -1 else 0
        shift = 14 - exponent
        if shift < 0:
            return 0x7FFF if mantissa >= 0 else 0x8000
        value = mantissa << 2
        result = value >> shift
        if shift and (value >> (shift - 1)) & 1:
            result += 1
        return result & 0xFFFF

    @staticmethod
    def value(x: int) -> float:
        return _s16(x) / 4096 * 2.0 ** _s16(x >> 16)


def surface_field(speed: int) -> int:
    """$05807A-$0580E0: the field is |speed| as a rounded integer."""
    magnitude = (speed & 0xFFFF0000) | (abs(_s16(speed)) & 0xFFFF)
    return Floats.to_long(magnitude, rounded=True)


def space_readouts(floats: Floats, speed: int) -> tuple[int, int]:
    """$05892C-$058B22: ($7876, the field) for a speed in space."""
    sum_ = floats.add(0x000A1000, floats.square(speed))  # v^2 + 1024
    step = floats.to_word(floats.sqrt(sum_))  # 32 gamma
    if step > 0xBC:
        correction = Floats.to_long(floats.div(0x002617FC, sum_), rounded=False)
        return step, (SPEED_OF_LIGHT - _s32(correction)) & M32
    if step > 0x20:
        quotient = floats.div(0x004511FA, sum_)
        negated = (quotient & 0xFFFF0000) | (-quotient & 0xFFFF)  # neg.w
        squared = floats.add(negated, 0x003B11FA)
        return step, Floats.to_long(floats.sqrt(squared), rounded=False)
    magnitude = (speed & 0xFFFF0000) | (abs(_s16(speed)) & 0xFFFF)
    return step, Floats.to_long(floats.mul(magnitude, 0x001817FC), rounded=False)


def field_digits(field: int, sign_word: int) -> str:
    """$04DFF4: a sign, then nine digits of field / 2^28 read as a 4.28 fraction."""
    digits, d1 = [], field & M32
    for _ in range(9):
        digits.append((d1 >> 28) & 15)
        d1 = ((d1 & 0x0FFFFFFF) * 10) & M32
    text = "".join("*" if d > 9 else str(d) for d in digits)
    return f"{'-' if sign_word & 0x8000 else '+'} {text[:3]} {text[3:6]} {text[6:]}"


def altitude_digits(eye_y: int, floor: int) -> str:
    """$04DF42: II FF FF of (Y >> 4, rounded) read as 16.16, or ** past 99 and on Floor 10."""
    d2 = 0x7FFFFFFF if floor == 10 else eye_y
    carry = d2 & 8
    d2 = (d2 >> 4) + (1 if carry else 0)
    whole = d2 >> 16
    if whole >= 100:
        return "******"
    first = (d2 & 0xFFFF) * 100
    second = (first & 0xFFFF) * 100
    return f"{whole:02d}{first >> 16:02d}{second >> 16:02d}"


def space_altitude_digits(range_: int) -> str:
    """$04DEEE: the nearest range $791C times four, fixed to an integer and printed as 16.16."""
    d2 = Floats.to_long((range_ + 0x20000) & M32, rounded=False)
    whole = _s32(d2) >> 16
    if whole >= 100 or whole < 0:
        return "******"
    first = (d2 & 0xFFFF) * 100
    second = (first & 0xFFFF) * 100
    return f"{whole:02d}{first >> 16:02d}{second >> 16:02d}"


def lamp_colours(ram: bytes) -> list[int]:
    """The colour index of each of the lamp's 35 pixels in the buffer $042C00 names."""
    base = _u32(ram, SCREEN)
    colours = []
    for row in range(186, 193):
        group = base + row * 160 + 13 * 8
        planes = [_u16(ram, group + 2 * p) for p in range(4)]
        for x in range(213, 218):
            bit = 15 - (x - 208)
            colours.append(sum(((planes[p] >> bit) & 1) << p for p in range(4)))
    return colours


# --- decode --------------------------------------------------------------------------------------


def decode() -> int:
    _check(FIRST_WORLD.is_file(), f"pinned first-world RAM not found: {FIRST_WORLD}")
    ram = FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(ram).hexdigest() == FIRST_WORLD_SHA256, "first-world RAM hash")
    for address, (hexbytes, meaning) in CODE_FACTS.items():
        found = ram[address : address + len(hexbytes) // 2].hex()
        _check(found == hexbytes, f"${address:06X} ({meaning}): {found} != {hexbytes}")
    windows = {
        name: {"range": f"${start:06X}-${end - 1:06X}", "sha256": hashlib.sha256(ram[start:end]).hexdigest()}
        for name, (start, end) in STATIC_WINDOWS.items()
    }
    tables = {
        "log": hashlib.sha256(ram[LOG_TABLE - 0x8000 : LOG_TABLE + 0x8000]).hexdigest(),
        "exp": hashlib.sha256(ram[EXP_TABLE : EXP_TABLE + 0x2000]).hexdigest(),
    }
    floats = Floats(ram)
    _check(field_digits(SPEED_OF_LIGHT, 0) == "+ 299 792 458", "c prints as the speed of light")
    _check(Floats.value(floats.mul(0x00031000, 0x00021800)) == 48.0, "8 * 6 through the tables")
    _check(Floats.value(floats.sqrt(0x00081000)) == 16.0, "sqrt 256 through the tables")
    _check(Floats.value(floats.add(0x00031000, 0x00021000)) == 12.0, "8 + 4")
    _check(space_readouts(floats, 0xFF001000)[0] == 0x20, "at rest in space 32 gamma is 32")

    # The relativistic field against the closed form, at every exponent a throttle can reach.
    curve = []
    for exponent in range(0, 31):
        speed = (exponent << 16) | 0x1000
        step, field = space_readouts(floats, speed)
        v = Floats.value(speed)
        curve.append(
            {
                "speed": f"${speed:08X}",
                "v": v,
                "timeStep": step,
                "gamma": round(step / 32, 3),
                "field": field_digits(field, 0),
                "closedForm": round(299792458 * v / (v * v + 1024) ** 0.5),
            }
        )

    captures = []
    for path in sorted(SNAPSHOTS.glob("*.sav")):
        capture = hatari_memstate_ram(path.read_bytes())
        speed = _u32(capture, SPEED)
        entry = {
            "capture": path.stem,
            "sha256": file_hash(path),
            "scene": _u16(capture, SCENE),
            "speed": f"${speed:08X}",
            "field": _u32(capture, SPEED_FIELD),
            "timeStep": _u16(capture, TIME_STEP),
            "timeReload": _u16(capture, TIME_RELOAD),
            "timeOption": _u16(capture, TIME_OPTION),
            "altitude": altitude_digits(_u32(capture, EYE_Y), _u16(capture, FLOOR)),
            "encounter": _u16(capture, ENCOUNTER),
            "lampCache": _u16(capture, LAMP_CACHE),
            "lamp": sorted(set(lamp_colours(capture))),
        }
        _check(entry["timeReload"] == 0x19 << entry["timeOption"], f"{path.stem}: $7878 = $19 << the time option")
        _check(entry["timeStep"] == 0x20, f"{path.stem}: no capture is in space, so $7876 is 32")
        if _u16(capture, OCCUPANCY) == 0 and _s16(speed >> 16) >= 0:
            _check(entry["field"] == surface_field(speed), f"{path.stem}: the field is the rounded speed")
        _check(entry["lampCache"] == entry["encounter"], f"{path.stem}: the lamp has drawn the gate")
        _check(entry["lamp"] == ([9] if entry["encounter"] else [10]), f"{path.stem}: lamp colours {entry['lamp']}")
        captures.append(entry)
    print(json.dumps({"windows": windows, "tables": tables, "codeFacts": len(CODE_FACTS), "curve": curve,
                      "captures": captures}, indent=2))
    return 0


# --- live ----------------------------------------------------------------------------------------

WINDOWS = {
    "low": (0x7800, 0x7D00),
    "field": (0x4DFE8, 0x4DFF4),
    "clock": (0x51D90, 0x51DA0),
    "mailbox": (0x55588, 0x55590),
    "gate": (0x70100, 0x70110),
    "lamp": (0x50A5A, 0x50A5C),
}

SCANCODES = {"esc": 0x01, **{str(digit): 0x01 + digit for digit in range(1, 10)}, "0": 0x0B}

# name: (memstate, stops, {stop: [key]})
CASES: dict[str, tuple[str, int, dict[int, list[str]]]] = {
    # On foot: the ordinary rate.
    "onfoot": ("rehosted/eris-spaceport-onfoot.sav", 260, {}),
    # A wheeled craft on the ground: key 4, then 9.
    "limo": ("boarded-limo.sav", 400, {10: ["4"], 200: ["9"]}),
    # EAGLE NINE in the air over Dion: the throttle it holds, then key 9.
    "airborne": ("dion-north-airborne.sav", 300, {150: ["9"]}),
    # The same craft launched: Esc, then cut to key 1 and key 5 in space.
    "launch": ("dion-north-airborne.sav", 900, {10: ["esc"], 300: ["1"], 600: ["5"]}),
    # Tolosa after its briefing armed the gate: the lit lamp in the frame.
    "tolosa": ("rehosted/tolosa.sav", 60, {}),
}


def _stop_path(run: Path, index: int, key: str) -> Path:
    return run / f"t{index:04d}-{key}.bin"


def _read_stop(run: Path, index: int) -> bytes | None:
    ram = bytearray(0x80000)
    for key, (start, end) in WINDOWS.items():
        path = _stop_path(run, index, key)
        if not path.is_file() or path.stat().st_size != end - start:
            return None
        ram[start:end] = path.read_bytes()
    return bytes(ram)


def _write_chain(run: Path, stops: int, keys: dict[int, list[str]], shot_every: int) -> None:
    scripts = [run / f"trace-{i:04d}.txt" for i in range(stops)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex"]
        for key, (start, end) in WINDOWS.items():
            lines.append(f"savebin {_stop_path(run, index, key).resolve()} ${start:x} ${end - start:x}")
        if index % shot_every == 0 or index + 1 == stops:
            lines.append(f"screenshot {(run / f't{index:04d}.png').resolve()}")
        for key in keys.get(index, []):
            lines.append(f"w ${MAILBOX:x} {SCANCODES[key]:02x}")
        if index + 1 < stops:
            lines.append(f'b VBL = "VBL+1" :once :quiet :file {scripts[index + 1].resolve()}')
            lines.append("c")
        else:
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_chain(roms: Path | None, run: Path, snapshot: Path, stops: int, keys: dict[int, list[str]],
              settle: float, shot_every: int) -> tuple[list[bytes], dict[str, Any]]:
    _write_chain(run, stops, keys, shot_every)
    meta: dict[str, Any] = {"snapshot": str(snapshot.relative_to(LAB_ROOT)), "snapshotSha256": file_hash(snapshot)}
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    meta["programSha256"] = validate_image(program, authority["programImage"], label="Working Authority STX")["hashes"]["sha256"]
    meta["tosSha256"] = validate_image(tos, authority["tosImage"], label="TOS image")["hashes"]["sha256"]
    hatari, toolchain = discover_toolchain(config)
    meta["toolchain"] = toolchain.as_dict()
    fifo_path = run / "cmd.fifo"
    parse = run / "parse.txt"
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
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
        )
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            _check(fifo_path.exists(), f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle)
                _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                _fifo_send(fifo, [f'hatari-debug b VBL = "VBL+1" :once :quiet :file {(run / "trace-0000.txt").resolve()}'])
                seen, last = 0, time.monotonic()
                while process.poll() is None:
                    while _read_stop(run, seen) is not None:
                        seen, last = seen + 1, time.monotonic()
                    _check(time.monotonic() - last < 60, f"the trace stalled after {seen} stops")
                    time.sleep(0.05)
        except BrokenPipeError:
            pass
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    trace = []
    while (stop := _read_stop(run, len(trace))) is not None:
        trace.append(stop)
    _check(len(trace) == stops, f"{len(trace)} of {stops} stops")
    for index, (a, b) in enumerate(zip(trace, trace[1:]), start=1):
        moved = (_u16(b, VBL_CLOCK) - _u16(a, VBL_CLOCK)) & 0xFFFF
        _check(moved == 1, f"stop {index}: the VBL clock moved {moved}")
    return trace, meta


def _row(index: int, ram: bytes) -> dict[str, Any]:
    return {
        "stop": index,
        "vbl": _u16(ram, VBL_CLOCK),
        "clock": _s32(_u32(ram, CLOCK)),
        "accumulator": _s16(_u16(ram, TIME_ACCUMULATOR)),
        "timeStep": _u16(ram, TIME_STEP),
        "timeReload": _u16(ram, TIME_RELOAD),
        "occupancy": _s16(_u16(ram, OCCUPANCY)),
        "scene": _s16(_u16(ram, SCENE)),
        "contact": _u16(ram, CONTACT),
        "throttle": f"${_u32(ram, THROTTLE):08X}",
        "speed": f"${_u32(ram, SPEED):08X}",
        "field": _u32(ram, SPEED_FIELD),
        "printed": field_digits(_u32(ram, SPEED_FIELD), _u16(ram, SPEED + 2)),
        "eyeY": _u32(ram, EYE_Y),
        "altitude": space_altitude_digits(_u32(ram, BODY_DISTANCE)) if _s16(_u16(ram, SCENE)) == 2
        else altitude_digits(_u32(ram, EYE_Y), _u16(ram, FLOOR)),
        "range": f"${_u32(ram, BODY_DISTANCE):08X}",
        "encounter": _u16(ram, ENCOUNTER),
        "lampCache": _u16(ram, LAMP_CACHE),
    }


def analyse(trace: list[bytes], floats: Floats) -> dict[str, Any]:
    rows = [_row(i, ram) for i, ram in enumerate(trace)]
    ticks = []
    for a, b in zip(rows, rows[1:]):
        # The VBL handler: subtract the step; each time the accumulator passes zero, one second.
        accumulator, seconds = a["accumulator"] - a["timeStep"], 0
        if a["timeStep"] == b["timeStep"]:
            while accumulator <= 0:
                accumulator += a["timeReload"]
                seconds += 1
            _check(b["clock"] - a["clock"] == seconds, f"stop {b['stop']}: clock {a['clock']} -> {b['clock']}, predicted +{seconds}")
            _check(b["accumulator"] == accumulator, f"stop {b['stop']}: accumulator {b['accumulator']}, predicted {accumulator}")
        if b["clock"] != a["clock"]:
            ticks.append((b["stop"], b["clock"] - a["clock"]))
    mismatches = []
    previous = None
    for row, ram in zip(rows, trace):
        speed = _u32(ram, SPEED)
        written = previous is None or row["field"] != previous["field"]
        previous = row
        if not written:
            continue  # the craft routine has not run (the launch hold), so the field is its last value
        if row["occupancy"] == 2:
            step, field = space_readouts(floats, speed)
            if (step, field) != (row["timeStep"], row["field"]):
                mismatches.append((row["stop"], "space", step, field))
        elif row["occupancy"] == 0 and row["field"] and row["timeStep"] == 0x20:
            if surface_field(speed) != row["field"]:
                mismatches.append((row["stop"], "surface", surface_field(speed)))
    return {"rows": rows, "ticks": ticks, "fieldMismatches": mismatches}


def live(roms: Path | None, case: str, settle: float, shot_every: int) -> int:
    snapshot_name, stops, keys = CASES[case]
    snapshot = SNAPSHOTS / snapshot_name
    _check(snapshot.is_file(), f"memstate not found: {snapshot}")
    floats = Floats(FIRST_WORLD.read_bytes())
    run = WORK_ROOT / _run_id(f"panel-aboard-{case}")
    run.mkdir(parents=True)
    trace, meta = run_chain(roms, run, snapshot, stops, keys, settle, shot_every)
    result = analyse(trace, floats)
    for stop in range(0, stops, 50):
        (run / f"t{stop:04d}.ram.json").write_text(json.dumps(result["rows"][stop]), encoding="utf-8")
    summary = {"case": case, "run": run.name, "keys": keys, **meta, "ticks": result["ticks"],
               "fieldMismatches": result["fieldMismatches"],
               "samples": [r for r in result["rows"] if r["stop"] % 25 == 0 or r["stop"] in keys]}
    (run / "summary.json").write_text(json.dumps({**summary, "rows": result["rows"]}, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    _check(not result["fieldMismatches"], f"{len(result['fieldMismatches'])} stops disagree with the field decode")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("decode")
    live_parser = sub.add_parser("live")
    live_parser.add_argument("--roms", type=Path)
    live_parser.add_argument("--case", choices=tuple(CASES), required=True)
    live_parser.add_argument("--settle-seconds", type=float, default=4.0)
    live_parser.add_argument("--shot-every", type=int, default=25)
    args = parser.parse_args()
    if args.mode == "decode":
        return decode()
    return live(args.roms, args.case, args.settle_seconds, args.shot_every)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
