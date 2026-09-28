#!/usr/bin/env python3
"""Damocles TOLOSA encounter probe (#581).

#327 found that resident slots 8..15 are a moving-object pool and that three of
its entries are driven: slot 8 is the player's shot, slot 11 the ATTACK SHIP and
slot 15 the ship's shot. #327 saw one encounter, against a parked player with the
gate injected, sampled on host time. This probe traces encounters pass by pass,
and checks every pass against an exact model of the three routines.

``decode`` reads the pinned first-world RAM and the memstates without Hatari. It
checks the instruction words the model rests on, hashes the routines the note
quotes, and sweeps the memstates for the encounter's words.

``live`` boots one memstate and arms a chain of two PC breakpoints a pass: one
at ``$05987A``, where the surface frame path calls the fire launcher
``$050B96``, the stepper ``$050ABC`` and the attack routine ``$050D80`` in turn,
and one at ``$059886``, between the stepper and the attack routine. A PC
breakpoint re-armed on the instruction it stopped at fires again at once, so
each stop arms the other. Both stops save the same RAM windows. A case may write
RAM at the first stop, and a case that holds fire writes the joystick softcopy
at every stop, as the ACIA handler would.

``analyse`` reads the stops back. For every pass it runs the model from the
state at ``$05987A`` and compares the pool with the state at ``$059886`` (fire
and step) and at the next pass's ``$05987A`` (the attack routine too). It raises
on any difference.

Run from the repository root:

  python3 research/damocles-st/scripts/encounter-probe.py decode \\
    --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d
  python3 research/damocles-st/scripts/encounter-probe.py live --roms roms --case NAME
  python3 research/damocles-st/scripts/encounter-probe.py analyse --trace work/encounter-NAME-...

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
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable

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

CALLS = 0x05987A  # jsr $050B96, then $050ABC, then $050D80
ATTACK_CALL = 0x059886  # jsr $050D80
GATE = 0x070104
DEATH = 0x7A64
FLASH = 0x51D24
VECTOR_B = 0x4BF54
POINTER = 0x7E18
TABLE = 0x77000
FRAMES = 0x7AE8
VBL_CLOCK = 0x51D98
STICK = 0x79C2
FIRE = 0x80

# Pool arrays, indexed by slot * 4.
COUNTER, VX, VY, VZ = 0x612A, 0x614A, 0x616A, 0x618A
X, Y, Z = 0x63A8, 0x67A8, 0x6BA8
ASSOC_A, ASSOC_B = 0x6FA8, 0x73A8
POOL = range(8, 16)

WINDOWS = {
    "pool": (0x6100, 0x7400),
    "lo": (0x7800, 0x7F00),
    "bank": (0x70100, 0x70110),
    "vbl": (0x51D20, 0x51DA0),
    "vector": (0x4BF50, 0x4BF60),
    "table": (TABLE, TABLE + 0x1000),
}

#: Instruction words the model rests on, as the note quotes them.
FACTS = {
    0x05987A: ("4eb900050b964eb900050abc4eb900050d80", "surface frame path: fire, step, attack"),
    0x059906: ("4eb900050b964eb900050abc", "space frame path: fire and step only"),
    0x050D80: ("4a790007010467f6", "attack: returns while the gate is clear"),
    0x050D8E: ("3428612a6bea", "attack: returns while slot 11's counter is negative"),
    0x050D98: ("223c00003000", "attack: the $3000 window"),
    0x050DB4: ("397c0020612a", "ship's shot: 32 steps"),
    0x050DC4: ("7004", "ship's shot: separation / 16"),
    0x050DD8: ("23fc0004c6300004bf54", "ship's shot: the thud"),
    0x050DEC: ("223c00000400", "zap: the $400 box"),
    0x050E00: ("23fc0004c6520004bf54", "zap: the zapped programme"),
    0x050E14: ("7230", "zap: system string $30 while boarded"),
    0x050E32: ("33fcaaaa00051d24", "zap: flash $AAAA"),
    0x050E3A: ("31fc00017a64", "zap: the death state"),
    0x050E46: ("7006", "steer: separation / 64"),
    0x050E50: ("397c805a612a", "steer: coast $805A"),
    0x050AC8: ("0c407fff", "stepper: $7FFF holds a slot"),
    0x050AEE: ("217cffffffff67a8", "stepper: Y clamped to -1"),
    0x050B3C: ("223c00000400", "kill: the $400 box"),
    0x050B5A: ("33fcaa0000051d24", "kill: flash $AA00"),
    0x050B62: ("7231", "kill: system string $31"),
    0x050BCE: ("317c0020612a", "player's shot: 32 steps"),
    0x050BE4: ("2a3c000a1f00", "player's shot: speed + $000A1F00"),
    0x050BF8: ("4245", "player's shot: only the sum's exponent is kept"),
    0x050ECC: ("203c0000ffff", "zap flash: 65,535 steps"),
    0x050F0E: ("0c7800017a64", "death: the frame path's test of $7A64 = 1"),
    0x051010: ("7221", "death: system string $21"),
    0x05101C: ("0c000062", "death: HELP opens the menu"),
    0x051028: ("0c7800017a64", "death: loops while $7A64 = 1"),
    0x0558FE: ("42787a64", "menu: QUIT clears the death state"),
    0x051D74: ("e3f900051d24", "VBL: the flash word shifts left a VBL"),
    0x051D7C: ("203c07770777", "VBL: a set bit paints the palette white"),
}

RANGES = {
    "attack $050D80-$050ECC": (0x050D80, 0x050ECC),
    "stepper and kill $050ABC-$050B94": (0x050ABC, 0x050B94),
    "player's shot $050B96-$050D80": (0x050B96, 0x050D80),
    "zap flash $050ECC-$050F0C": (0x050ECC, 0x050F0C),
    "hazard and death $050F0E-$051036": (0x050F0E, 0x051036),
    "box test $0541BA-$0541E0": (0x0541BA, 0x0541E0),
    "separation $05416E-$05418E": (0x05416E, 0x05418E),
}


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _u8(ram: bytes, address: int) -> int:
    return ram[address]


def _u16(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 2], "big")


def _u32(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 4], "big")


def _s(value: int, bits: int = 32) -> int:
    value &= (1 << bits) - 1
    return value - (1 << bits) if value >> (bits - 1) else value


def _w(address: int, value: int, size: int) -> tuple[int, str]:
    return address, f"{value & ((1 << (8 * size)) - 1):0{2 * size}x}"


def decode(run: Path, memstates: Path | None) -> int:
    ram = (run / "observed.ram").read_bytes()
    report: dict[str, Any] = {"facts": {}, "ranges": {}}
    for address, (word, about) in FACTS.items():
        actual = ram[address : address + len(word) // 2].hex()
        _check(actual == word, f"${address:06X} ({about}): {actual} is not {word}")
        report["facts"][f"${address:06X}"] = about
    for name, (start, end) in RANGES.items():
        report["ranges"][name] = hashlib.sha256(ram[start:end]).hexdigest()
    report["firstWorld"] = {
        f"slot{slot}": {
            "counter": f"${_u16(ram, COUNTER + 4 * slot):04X}",
            "position": [f"${_u32(ram, base + 4 * slot):08X}" for base in (X, Y, Z)],
            "associationB": f"${_u32(ram, ASSOC_B + 4 * slot):08X}",
        }
        for slot in (8, 11, 15)
    }
    if memstates is not None:
        sweep = {}
        for path in sorted(memstates.glob("*.sav")):
            state = hatari_memstate_ram(path.read_bytes())
            sweep[path.stem] = {
                "gate": _u16(state, GATE),
                "death": f"${_u16(state, DEATH):04X}",
                "counters": [f"${_u16(state, COUNTER + 4 * s):04X}" for s in (8, 11, 15)],
            }
        report["memstates"] = sweep
    print(json.dumps(report, indent=2))
    return 0


# ---- The model ------------------------------------------------------------------


class Arithmetic:
    """The log-domain floats the player's shot is launched through (craft.ts)."""

    def __init__(self, ram: bytes) -> None:
        self.ram = ram

    def log_of(self, f: int) -> int:
        # `move.w (a5, d0.w), d0`: the word at $64000 plus the signed mantissa, so a negative
        # mantissa reads below $64000.
        address = 0x64000 + _s(f & 0xFFFF, 16)
        return (f & 0xFFFF0000) | _u16(self.ram, address)

    def exp_of(self, f: int) -> int:
        word = f & 0xFFFF
        index = ((word >> 4) | (word << 12)) & 0x1FFE
        return (f & 0xFFFF0000) | _u16(self.ram, 0x60000 + index)


def float_add(first: int, second: int) -> int:
    """`$04BD34`, as craft.ts `craftAdd`."""
    d1, d2 = first & 0xFFFFFFFF, second & 0xFFFFFFFF
    if _s(d1) >= _s(d2):
        d1, d2 = d2, d1
    m1, m2 = d1 & 0xFFFF, d2 & 0xFFFF
    diff = _s((d2 >> 16) - (d1 >> 16), 16)
    if diff > 11:
        return d2
    shifted = (_s(m1, 16) >> min(diff & 63, 31)) & 0xFFFF
    total = (m2 + shifted) & 0xFFFF
    d2 = (d2 & 0xFFFF0000) | total
    differ = ((m1 ^ m2) & 0x8000) != 0

    def double_low(v: int) -> int:
        return (((v & 0xFFFF0000) | ((v << 1) & 0xFFFF)) - 0x10000) & 0xFFFFFFFF

    def halve_low(v: int) -> int:
        return (((v & 0xFFFF0000) | ((_s(v, 16) >> 1) & 0xFFFF)) + 0x10000) & 0xFFFFFFFF

    def even(v: int) -> int:
        return v & 0xFFFFFFFE

    if (total & 0x8000) == 0:
        if total == 0:
            return (d2 + 0xFFF01000) & 0xFFFFFFFF
        if differ:
            while (d2 & 0x1000) == 0:
                d2 = double_low(d2)
            return even(d2)
        if d2 & 0x2000:
            d2 = halve_low(d2)
        return even(d2)
    if differ:
        if (d2 & 0x1000) == 0:
            return even(d2)
        while d2 & 0x1000:
            d2 = double_low(d2)
        return d2
    if (d2 & 0x2000) == 0:
        d2 = halve_low(d2)
    return even(d2)


def fixed(f: int) -> int:
    """`$050C18`-`$050C74` and its two repeats: a float as a 16.16 long."""
    d7 = f & 0xFFFFFFFF
    if _s(d7) < 0:
        if ((d7 >> 16) + 1) & 0xFFFF == 0:
            return -1 if _s(d7, 16) < 0 else 1
        return 0
    shift = _s(29 - (d7 >> 16), 16)
    if shift < 0:
        if shift + 1 == 0:
            m = _s(d7, 16) * 4 * 0x10000
            if -0x80000000 <= m < 0x80000000:
                return _s(m & 0xFFFC0000)
        return 0x7FFFFFFF if _s(d7, 16) >= 0 else -0x80000000
    placed = (((d7 * 2) & 0xFFFF) << 16) & 0xFFFFFFFF
    value = _s(placed)
    carry = (value >> (shift - 1)) & 1 if shift > 0 else 0
    return (value >> shift) + carry


def inside(radius: int, components: tuple[int, int, int]) -> bool:
    """`$0541BA`: each component, shifted left by four as a long, within the radius shifted too."""
    limit = (radius << 4) & 0xFFFFFFFF
    for c in components:
        d2 = (c << 4) & 0xFFFFFFFF
        if d2 & 0x80000000:
            d2 = (-d2) & 0xFFFFFFFF
        if limit < d2:
            return False
    return True


def wrap_byte(value: int) -> int:
    """`swap / ext.w / swap`: the high word cut to its low byte, sign-extended."""
    value &= 0xFFFFFFFF
    high = _s((value >> 16) & 0xFF, 8) & 0xFFFF
    return _s((high << 16) | (value & 0xFFFF))


def state_of(ram: bytes) -> dict[str, Any]:
    slots = {}
    for slot in POOL:
        o = 4 * slot
        slots[slot] = {
            "counter": _u16(ram, COUNTER + o),
            "v": [_s(_u32(ram, base + o)) for base in (VX, VY, VZ)],
            "p": [_u32(ram, base + o) for base in (X, Y, Z)],
            "b": _u32(ram, ASSOC_B + o),
            "a1": _u8(ram, ASSOC_A + o + 1),
        }
    return {
        "slots": slots,
        "gate": _u16(ram, GATE),
        "death": _u16(ram, DEATH),
        "flash": _u16(ram, FLASH),
        "vectorB": _u32(ram, VECTOR_B),
        "pointer": _u32(ram, POINTER),
        "frames": _u16(ram, FRAMES),
        "vbl": _u16(ram, VBL_CLOCK),
        "stick": _u8(ram, STICK),
        "boarded": _s(_u16(ram, 0x7AB0), 16),
        "inhibit": _u16(ram, 0x7BBE),
        "mode": _u16(ram, 0x7AAE),
        "selector": _u8(ram, 0x7AA9),
        "bodyByte": _u8(ram, 0x7AC9),
        "speed": _u32(ram, 0x797A),
        "trig": [_u32(ram, a) for a in (0x7AD6, 0x7ADA, 0x7ADE, 0x7AE2)],
        "pose": [_u32(ram, a) for a in (0x7AB2, 0x7AB6, 0x7ABA)],
        "camera": [_u32(ram, a) for a in (0x7A92, 0x7A30, 0x7A9A)],
        "attitude": [_u16(ram, a) for a in (0x7AC0, 0x7AC2)],
        "death7a66": _u16(ram, 0x7A66),
        "warning": _u16(ram, 0x7A7C),
    }


def fire_and_step(s: dict[str, Any], arithmetic: Arithmetic, events: list[str]) -> None:
    slots = s["slots"]
    # $050B96: the player's shot.
    shot = slots[8]
    if s["stick"] & FIRE and s["boarded"] >= 0 and s["inhibit"] == 0 and shot["counter"] == 0:
        events.append("fire")
        s["vectorB"] = 0x4C610
        shot["b"] = (s["bodyByte"] << 24) | (shot["b"] & 0xFFFF)
        shot["counter"] = 0x20
        scale = float_add(s["speed"], 0x000A1F00) & 0xFFFF0000
        cp, sp, cy, sy = s["trig"]
        vx = (arithmetic.exp_of((arithmetic.log_of(cp) + arithmetic.log_of(sy)) & 0xFFFFFFFF) + scale) & 0xFFFFFFFF
        vy = (sp + scale) & 0xFFFFFFFF
        vz = (arithmetic.exp_of((arithmetic.log_of(cp) + arithmetic.log_of(cy)) & 0xFFFFFFFF) + scale) & 0xFFFFFFFF
        shot["v"] = [fixed(vx), fixed(vy), fixed(vz)]
        shot["p"] = list(s["pose"])
    # $050ABC: slots 15 down to 8.
    for slot in range(15, 7, -1):
        e = slots[slot]
        if e["counter"] in (0, 0x7FFF):
            continue
        e["counter"] = (e["counter"] - 1) & 0xFFFF
        if e["counter"] == 0:
            e["b"] = 0
            events.append(f"expire {slot}")
            continue
        e["p"][0] = (e["p"][0] + e["v"][0]) & 0xFFFFFFFF
        y = (e["p"][1] + e["v"][1]) & 0xFFFFFFFF
        if y & 0x80000000 and s["mode"] != 2:
            y = 0xFFFFFFFF
        e["p"][1] = y
        e["p"][2] = (e["p"][2] + e["v"][2]) & 0xFFFFFFFF
        if slot == 8:
            # $050B28: the kill test, then the stepper returns.
            ship = slots[11]
            if (ship["b"] >> 24) == s["selector"]:
                sep = (
                    wrap_byte(e["p"][0] - ship["p"][0]),
                    _s(e["p"][1] - ship["p"][1]),
                    wrap_byte(e["p"][2] - ship["p"][2]),
                )
                if inside(0x400, sep):
                    events.append("kill")
                    s["vectorB"] = 0x4C610
                    s["flash"] = 0xAA00
                    s["gate"] = 0
                    ship["counter"] = 0
                    ship["b"] = 0
                    ship["a1"] = 0
                    e["counter"] = 0
                    e["b"] = 0
                    e["a1"] = 0
            return


def attack(s: dict[str, Any], events: list[str]) -> None:
    slots = s["slots"]
    if s["gate"] == 0:
        return
    ship, shot = slots[11], slots[15]
    if ship["counter"] & 0x8000:
        return
    cx, cy, cz = s["camera"]
    sep = tuple(_s(p - c) for p, c in zip(ship["p"], (cx, cy, cz)))
    if not inside(0x3000, sep):
        events.append("steer")
        ship["v"] = [_s(-(c >> 6)) for c in sep]
        ship["counter"] = 0x805A
        ship["b"] = (s["bodyByte"] << 24) | (ship["b"] & 0xFFFF)
        return
    if shot["counter"] == 0:
        events.append("ship fires")
        shot["counter"] = 0x20
        shot["b"] = (s["bodyByte"] << 24) | (shot["b"] & 0xFFFF)
        shot["v"] = [_s(-(c >> 4)) for c in sep]
        shot["p"] = list(ship["p"])
        s["vectorB"] = 0x4C630
        return
    near = tuple(_s(p - c) for p, c in zip(shot["p"], (cx, cy, cz)))
    if not inside(0x400, near):
        return
    events.append("zap")
    s["vectorB"] = 0x4C652
    s["gate"] = 0
    ship["b"] = 0
    shot["b"] = 0
    ship["a1"] = 0
    shot["a1"] = 0
    s["flash"] = 0xAAAA
    s["death"] = 1


def _stop_path(run: Path, index: int, phase: str, key: str) -> Path:
    return run / f"t{index:05d}{phase}-{key}.bin"


def _read_stop(run: Path, index: int, phase: str) -> bytes | None:
    ram = bytearray(0x80000)
    for key, (start, end) in WINDOWS.items():
        path = _stop_path(run, index, phase, key)
        if not path.is_file() or path.stat().st_size != end - start:
            return None
        ram[start:end] = path.read_bytes()
    return bytes(ram)


# ---- Cases ------------------------------------------------------------------------

def armed(ram: bytes) -> list[tuple[int, str]]:
    """The word TOLOSA's landing script writes (`bank.write $0104 $0001`)."""
    return [_w(GATE, 1, 2)]


def ahead(ram: bytes) -> list[tuple[int, str]]:
    """Armed, with the ship parked on the line the player's next shot takes, 6 steps out."""
    arithmetic = Arithmetic(ram)
    s = state_of(ram)
    s["stick"], s["slots"][8]["counter"] = FIRE, 0
    events: list[str] = []
    fire_and_step(s, arithmetic, events)
    v, p = s["slots"][8]["v"], s["pose"]
    target = [(p[k] + 6 * v[k]) & 0xFFFFFFFF for k in range(3)]
    ship = 11 * 4
    writes = armed(ram)
    writes += [_w(base + ship, target[k], 4) for k, base in enumerate((X, Y, Z))]
    writes += [_w(base + ship, 0, 4) for base in (VX, VY, VZ)]
    # Coasting: $050D80 returns while the counter is negative, so the ship holds still.
    writes += [_w(COUNTER + ship, 0x8050, 2), _w(ASSOC_B + ship, ram[0x7AC9] << 24, 4)]
    return writes


# name: (memstate, passes, first-stop writes, hold fire)
CASES: dict[str, tuple[str, int, Callable[[bytes], list[tuple[int, str]]] | None, bool]] = {
    "limo-armed": ("boarded-limo.sav", 3000, armed, False),
    "airborne-armed": ("dion-north-airborne.sav", 3000, armed, False),
    "limo-ahead": ("boarded-limo.sav", 200, ahead, True),
}


def _write_chain(run: Path, passes: int, first_lines: list[str], hold_fire: bool) -> Path:
    def script(index: int, phase: str) -> Path:
        return run / f"s{index:05d}{phase}.txt"

    for index in range(passes):
        for phase, here, there in (("a", CALLS, ATTACK_CALL), ("h", ATTACK_CALL, CALLS)):
            lines = ["setopt hex"]
            for key, (start, end) in WINDOWS.items():
                lines.append(f"savebin {_stop_path(run, index, phase, key).resolve()} ${start:x} ${end - start:x}")
            if phase == "a":
                if index == 0:
                    lines += first_lines
                if hold_fire:
                    lines.append(f"w ${STICK:x} ${FIRE:02x}")
            nxt = (index, "h") if phase == "a" else (index + 1, "a")
            if nxt[0] < passes:
                lines.append(f"b pc = ${there:x} :once :quiet :file {script(*nxt).resolve()}")
                lines.append("c")
            else:
                lines.append(f"screenshot {(run / 'final.png').resolve()}")
                lines.append("quit")
            script(index, phase).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return script(0, "a")


def live(roms: Path | None, case: str, settle: float, stall: float) -> int:
    snapshot_name, passes, intervention, hold_fire = CASES[case]
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    meta: dict[str, Any] = {
        "case": case,
        "recordedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "programSha256": validate_image(program, authority["programImage"], label="Working Authority STX")["hashes"]["sha256"],
        "tosSha256": validate_image(tos, authority["tosImage"], label="TOS image")["hashes"]["sha256"],
        "holdFire": hold_fire,
    }
    hatari, toolchain = discover_toolchain(config)
    meta["toolchain"] = toolchain.as_dict()
    run = WORK_ROOT / _run_id(f"encounter-{case}")
    run.mkdir(parents=True)
    snapshot = LAB_ROOT / "snapshots" / snapshot_name
    meta["memstate"] = snapshot_name
    meta["memstateSha256"] = hashlib.sha256(snapshot.read_bytes()).hexdigest()
    first_lines: list[str] = []
    if intervention is not None:
        ram = hatari_memstate_ram(snapshot.read_bytes())
        writes = intervention(ram)
        meta["writes"] = [f"${a:06X}={v}" for a, v in writes]
        first_lines = [f"w ${a:x} " + " ".join(f"${v[i:i + 2]}" for i in range(0, len(v), 2)) for a, v in writes]
    entry = _write_chain(run, passes, first_lines, hold_fire)
    parse = run / "parse.txt"
    parse.write_text("c\n", encoding="utf-8")
    fifo_path = run / "cmd.fifo"
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
    seen = 0
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
        )
        try:
            for _ in range(600):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.05)
            _check(fifo_path.exists(), f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle)
                _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                _fifo_send(fifo, [f"hatari-debug b pc = ${CALLS:x} :once :quiet :file {entry.resolve()}"])
                last = time.monotonic()
                while process.poll() is None:
                    while _read_stop(run, seen, "h") is not None:
                        seen, last = seen + 1, time.monotonic()
                    if time.monotonic() - last > stall:
                        # The frame path stopped calling $05987A: the death loop, or a
                        # path the case left. Keep what was traced.
                        meta["stalledAfterPass"] = seen
                        _fifo_send(fifo, [f"hatari-debug screenshot {(run / 'stalled.png').resolve()}"])
                        time.sleep(2)
                        break
                    time.sleep(0.05)
        except BrokenPipeError:
            pass
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    for index in range(passes):
        for phase in ("a", "h"):
            s = run / f"s{index:05d}{phase}.txt"
            if s.exists():
                s.unlink()
    (run / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"run: {run}")
    return analyse(run)


#: On foot the frame path is $059520-$0596F4, which calls none of the pool routines. The
#: control boots a memstate, counts PC hits over a few host seconds without stopping, and
#: expects the frame join $05948C to be hit and the three pool routines never to be.
CONTROL_PCS = {0x05948C: "frame join", 0x050B96: "fire launcher", 0x050ABC: "stepper", 0x050D80: "attack"}


def control(roms: Path | None, memstate: str, seconds: float, settle: float) -> int:
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    hatari, toolchain = discover_toolchain(config)
    run = WORK_ROOT / _run_id(f"encounter-control-{Path(memstate).stem}")
    run.mkdir(parents=True)
    snapshot = LAB_ROOT / "snapshots" / memstate
    parse = run / "parse.txt"
    parse.write_text("c\n", encoding="utf-8")
    fifo_path = run / "cmd.fifo"
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
    log_path = run / "hatari.log"
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
        )
        try:
            for _ in range(600):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.05)
            _check(fifo_path.exists(), f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle)
                _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                _fifo_send(fifo, [f"hatari-debug b pc = ${pc:x} :trace" for pc in CONTROL_PCS])
                time.sleep(seconds)
                _fifo_send(fifo, [f"hatari-debug screenshot {(run / 'control.png').resolve()}"])
                time.sleep(1)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    # Each :trace hit logs "N. CPU breakpoint condition(s) matched K times." and then the
    # breakpoint's own condition on the next line.
    hits: Counter[str] = Counter()
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    for line, following in zip(lines, lines[1:]):
        if "CPU breakpoint condition(s) matched" in line:
            for pc, name in CONTROL_PCS.items():
                if following.strip().lower().startswith(f"pc = ${pc:x} "):
                    hits[name] += 1
    counts = {name: hits[name] for name in CONTROL_PCS.values()}
    _check(counts["frame join"] > 0, "the frame join was never hit")
    result = {"memstate": memstate, "seconds": seconds, "hits": counts}
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"run: {run}")
    print(json.dumps(result, indent=2))
    return 0


DEATH_WINDOWS = {
    "lo": (0x7800, 0x7F00),
    "vbl": (0x51D20, 0x51DA0),
    "palette": (0x8E00, 0x9000),
    "table": (TABLE, TABLE + 0x1000),
}


def zap_next_pass(ram: bytes) -> list[tuple[int, str]]:
    """Armed, the ship parked inside its window, and its shot already on the camera."""
    camera = [_u32(ram, a) for a in (0x7A92, 0x7A30, 0x7A9A)]
    body = ram[0x7AC9] << 24
    ship, shot = 11 * 4, 15 * 4
    writes = armed(ram)
    writes += [_w(base + ship, (camera[k] + (0x100 if k == 0 else 0)) & 0xFFFFFFFF, 4) for k, base in enumerate((X, Y, Z))]
    writes += [_w(COUNTER + ship, 0x7FFF, 2), _w(ASSOC_B + ship, body, 4)]
    writes += [_w(base + shot, camera[k], 4) for k, base in enumerate((X, Y, Z))]
    writes += [_w(base + shot, 0, 4) for base in (VX, VY, VZ)]
    writes += [_w(COUNTER + shot, 0x10, 2), _w(ASSOC_B + shot, body, 4)]
    return writes


def death(roms: Path | None, memstate: str, vbls: int, settle: float) -> int:
    """VBL by VBL from a zap forced on the next pass: the flash, the fade and the death loop."""
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    hatari, toolchain = discover_toolchain(config)
    run = WORK_ROOT / _run_id(f"encounter-death-{Path(memstate).stem}")
    run.mkdir(parents=True)
    snapshot = LAB_ROOT / "snapshots" / memstate
    ram = hatari_memstate_ram(snapshot.read_bytes())
    writes = zap_next_pass(ram)
    meta: dict[str, Any] = {
        "mode": "death",
        "memstate": memstate,
        "memstateSha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        "toolchain": toolchain.as_dict(),
        "writes": [f"${a:06X}={v}" for a, v in writes],
    }
    scripts = [run / f"v{i:05d}.txt" for i in range(vbls)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex"]
        for key, (start, end) in DEATH_WINDOWS.items():
            lines.append(f"savebin {(run / f'v{index:05d}-{key}.bin').resolve()} ${start:x} ${end - start:x}")
        lines.append(f"screenshot {(run / f'v{index:05d}.png').resolve()}")
        if index == 0:
            lines += [f"w ${a:x} " + " ".join(f"${v[i:i + 2]}" for i in range(0, len(v), 2)) for a, v in writes]
        if index + 1 < vbls:
            lines.append(f'b VBL = "VBL+1" :once :quiet :file {scripts[index + 1].resolve()}')
            lines.append("c")
        else:
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")
    parse = run / "parse.txt"
    parse.write_text("c\n", encoding="utf-8")
    fifo_path = run / "cmd.fifo"
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
            for _ in range(600):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.05)
            _check(fifo_path.exists(), f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle)
                _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                _fifo_send(fifo, [f'hatari-debug b VBL = "VBL+1" :once :quiet :file {scripts[0].resolve()}'])
                seen, last = 0, time.monotonic()
                while process.poll() is None:
                    while (run / f"v{seen:05d}-palette.bin").exists():
                        seen, last = seen + 1, time.monotonic()
                    _check(time.monotonic() - last < 60, f"the chain stalled after {seen} VBLs")
                    time.sleep(0.05)
        except BrokenPipeError:
            pass
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    for script in scripts:
        script.unlink(missing_ok=True)
    rows = []
    for index in range(vbls):
        blob = bytearray(0x80000)
        ok = True
        for key, (start, end) in DEATH_WINDOWS.items():
            path = run / f"v{index:05d}-{key}.bin"
            if not path.exists():
                ok = False
                break
            blob[start:end] = path.read_bytes()
        if not ok:
            break
        pointer = _u32(blob, 0x7C14)
        rows.append(
            {
                "vbl": index,
                "clock": _u16(blob, VBL_CLOCK),
                "frames": _u16(blob, FRAMES),
                "death": f"${_u16(blob, DEATH):04X}",
                "flash": f"${_u16(blob, FLASH):04X}",
                "selector": f"${_u16(blob, 0x7AA8):04X}",
                "palette": [f"{_u16(blob, pointer + 2 * i):03X}" for i in range(16)] if 0x8E00 <= pointer < 0x8FE0 else f"@{pointer:06X}",
            }
        )
    first = (run / "v00000-table.bin").read_bytes()
    final = (run / f"v{len(rows) - 1:05d}-table.bin").read_bytes()
    meta["tableChanged"] = [
        {"word": i, "before": first[2 * i : 2 * i + 2].hex(), "after": final[2 * i : 2 * i + 2].hex()}
        for i in range(2048)
        if first[2 * i : 2 * i + 2] != final[2 * i : 2 * i + 2]
    ]
    meta["pointerWord"] = (_u32(ram, POINTER) - TABLE) // 2
    (run / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: meta[k] for k in ("tableChanged", "pointerWord")}))
    (run / "rows.json").write_text(json.dumps(rows, indent=1) + "\n", encoding="utf-8")
    print(f"run: {run}")
    last = None
    for row in rows:
        key = {k: v for k, v in row.items() if k not in ("vbl", "clock")}
        if key != last:
            print(row)
            last = key
    return 0


def _pool_view(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "slots": {k: v for k, v in s["slots"].items() if k in (8, 11, 15)},
        "gate": s["gate"],
    }


def analyse(run: Path) -> int:
    meta = json.loads((run / "meta.json").read_text(encoding="utf-8"))
    stops: list[tuple[dict[str, Any], dict[str, Any] | None, bytes]] = []
    while (a := _read_stop(run, len(stops), "a")) is not None:
        if not stops:
            # The first stop saves its windows before it makes the case's writes.
            patched = bytearray(a)
            for write in meta.get("writes", []):
                address, value = write.split("=")
                start = int(address.lstrip("$"), 16)
                patched[start : start + len(value) // 2] = bytes.fromhex(value)
            if meta.get("holdFire"):
                patched[STICK] = FIRE
            a = bytes(patched)
        h = _read_stop(run, len(stops), "h")
        stops.append((state_of(a), state_of(h) if h is not None else None, a))
    _check(len(stops) > 1, f"{run}: no stops")
    arithmetic = Arithmetic(hatari_memstate_ram((LAB_ROOT / "snapshots" / meta["memstate"]).read_bytes()))
    timeline: list[dict[str, Any]] = []
    mismatches: list[str] = []
    counts: Counter[str] = Counter()
    camera_equals_pose = 0
    for index, (a, h, _) in enumerate(stops):
        if a["camera"] == a["pose"]:
            camera_equals_pose += 1
        if a["death"] == 1:
            break
        model = json.loads(json.dumps(a), object_hook=lambda d: {int(k) if k.isdigit() else k: v for k, v in d.items()})
        events: list[str] = []
        fire_and_step(model, arithmetic, events)
        if h is not None:
            if _pool_view(model) != _pool_view(h):
                mismatches.append(f"pass {index}: fire/step {events}: model {_pool_view(model)} != {_pool_view(h)}")
            # The attack routine runs from the state the stepper left.
            model = json.loads(json.dumps(h), object_hook=lambda d: {int(k) if k.isdigit() else k: v for k, v in d.items()})
        attack(model, events)
        if index + 1 < len(stops):
            nxt = stops[index + 1][0]
            if _pool_view(model) != _pool_view(nxt):
                mismatches.append(f"pass {index}: attack {events}: model {_pool_view(model)} != {_pool_view(nxt)}")
            if model["death"] != nxt["death"] and not (model["death"] != 1 and nxt["death"] in (0, 2, 0x8000)):
                mismatches.append(f"pass {index}: death {model['death']:#x} != {nxt['death']:#x}")
        for e in events:
            counts[e.split()[0] if e.startswith("expire") else e] += 1
        if events:
            ship = a["slots"][11]
            timeline.append(
                {
                    "pass": index,
                    "vbl": a["vbl"],
                    "events": events,
                    "shipCounter": f"${ship['counter']:04X}",
                    "separation": [_s(p - c) for p, c in zip(ship["p"], a["camera"])],
                }
            )
    last_a = stops[-1][0]
    result: dict[str, Any] = {
        **{k: v for k, v in meta.items() if k != "toolchain"},
        "passes": len(stops),
        "vbls": (last_a["vbl"] - stops[0][0]["vbl"]) & 0xFFFF,
        "events": dict(counts),
        "cameraEqualsPose": f"{camera_equals_pose}/{len(stops)}",
        "last": {
            "gate": last_a["gate"],
            "death": f"${last_a['death']:04X}",
            "flash": f"${last_a['flash']:04X}",
            "vectorB": f"${last_a['vectorB']:06X}",
            "boarded": last_a["boarded"],
            "counters": {s: f"${last_a['slots'][s]['counter']:04X}" for s in (8, 11, 15)},
        },
        "mismatches": len(mismatches),
    }
    # The zap's table word: compare the table before and after the zap pass.
    zap = next((t["pass"] for t in timeline if "zap" in t["events"]), None)
    if zap is not None and zap + 1 < len(stops):
        before, after = stops[zap][2], stops[zap + 1][2]
        changed = [
            (i, int.from_bytes(before[TABLE + 2 * i : TABLE + 2 * i + 2], "big"), int.from_bytes(after[TABLE + 2 * i : TABLE + 2 * i + 2], "big"))
            for i in range(2048)
            if before[TABLE + 2 * i : TABLE + 2 * i + 2] != after[TABLE + 2 * i : TABLE + 2 * i + 2]
        ]
        pointer = (stops[zap][1] or stops[zap][0])["pointer"]
        result["zapTable"] = {
            "pointerWord": (pointer - TABLE) // 2,
            "changed": [{"word": i, "before": f"${b:04X}", "after": f"${c:04X}"} for i, b, c in changed],
        }
    (run / "timeline.json").write_text(json.dumps(timeline, indent=1) + "\n", encoding="utf-8")
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    (run / "mismatches.txt").write_text("\n".join(mismatches) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    for t in timeline[:40]:
        print(t)
    _check(not mismatches, f"{len(mismatches)} passes differ from the model; first: {mismatches[0] if mismatches else ''}")
    return 0


def export(run: Path, out: Path) -> int:
    """A Golden Trace: every pass's inputs and pool at `$05987A`, and how the last pass ended."""
    analyse(run)
    meta = json.loads((run / "meta.json").read_text(encoding="utf-8"))
    timeline = json.loads((run / "timeline.json").read_text(encoding="utf-8"))
    passes = []
    index = 0
    while (a := _read_stop(run, index, "a")) is not None:
        if index == 0:
            patched = bytearray(a)
            for write in meta.get("writes", []):
                address, value = write.split("=")
                start = int(address.lstrip("$"), 16)
                patched[start : start + len(value) // 2] = bytes.fromhex(value)
            if meta.get("holdFire"):
                patched[STICK] = FIRE
            a = bytes(patched)
        s = state_of(a)
        passes.append(
            {
                "attitude": s["attitude"],
                "boarded": s["boarded"],
                "bodyByte": s["bodyByte"],
                "camera": s["camera"],
                "death": s["death"],
                "gate": s["gate"],
                "inhibit": s["inhibit"],
                "mode": s["mode"],
                "pose": s["pose"],
                "selector": s["selector"],
                "slots": {
                    str(slot): {
                        "body": s["slots"][slot]["b"] >> 24,
                        "counter": s["slots"][slot]["counter"],
                        "position": s["slots"][slot]["p"],
                        "velocity": s["slots"][slot]["v"],
                    }
                    for slot in (8, 11, 15)
                },
                "speed": s["speed"],
                "stick": s["stick"],
                "trig": s["trig"],
                "vbl": s["vbl"],
            }
        )
        index += 1
    last = timeline[-1]["events"] if timeline and timeline[-1]["pass"] == len(passes) - 1 else []
    trace = {
        "case": meta["case"],
        "end": "zap" if "zap" in last else None,
        "memstate": meta["memstate"],
        "passes": passes,
        "run": run.name,
        "writes": meta.get("writes", []),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(trace, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{out}: {len(passes)} passes, end {trace['end']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    d = sub.add_parser("decode")
    d.add_argument("--run", type=Path, required=True)
    d.add_argument("--memstates", type=Path, default=None)
    l = sub.add_parser("live")
    l.add_argument("--roms", type=Path, default=None)
    l.add_argument("--case", choices=sorted(CASES), required=True)
    l.add_argument("--settle", type=float, default=2.0)
    l.add_argument("--stall", type=float, default=20.0)
    c = sub.add_parser("control")
    c.add_argument("--roms", type=Path, default=None)
    c.add_argument("--memstate", default="rehosted/tolosa.sav")
    c.add_argument("--seconds", type=float, default=4.0)
    c.add_argument("--settle", type=float, default=2.0)
    x = sub.add_parser("death")
    x.add_argument("--roms", type=Path, default=None)
    x.add_argument("--memstate", default="boarded-limo.sav")
    x.add_argument("--vbls", type=int, default=400)
    x.add_argument("--settle", type=float, default=2.0)
    e = sub.add_parser("export")
    e.add_argument("--trace", type=Path, required=True)
    e.add_argument("--out", type=Path, required=True)
    a = sub.add_parser("analyse")
    a.add_argument("--trace", type=Path, required=True)
    arguments = parser.parse_args()
    try:
        if arguments.command == "decode":
            return decode(arguments.run, arguments.memstates)
        if arguments.command == "death":
            return death(arguments.roms, arguments.memstate, arguments.vbls, arguments.settle)
        if arguments.command == "control":
            return control(arguments.roms, arguments.memstate, arguments.seconds, arguments.settle)
        if arguments.command == "live":
            return live(arguments.roms, arguments.case, arguments.settle, arguments.stall)
        if arguments.command == "export":
            return export(arguments.trace, arguments.out)
        return analyse(arguments.trace)
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
