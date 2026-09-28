#!/usr/bin/env python3
"""Damocles launch, space flight, nearest-Body arrival and landing (#558).

The launch key (Esc, scancode $01) runs ``$055822``. It refuses while the player is
not aboard or is in ground contact, and below a slot ``+$1A`` of 100. Otherwise it
sets the post-launch flag ``$7B0C`` and commands the reverse throttle ``$000EF000``.
While ``$7B0C`` is set, the craft pass goes to ``$057F18``, which swings the pitch
16 a pass. A pre-pass Y at or above ``$1F00000`` enters space at ``$055868``: the
occupancy ``$7AAE`` becomes 2, and every later pass is the space routine ``$05872E``
over slot 0's parameters. The nearest Body is ``$7924`` (``$052DB0``). After the
``$7B0A`` countdown, ``$052FDA`` raises ``$7A28`` once the range is close enough,
and ``$059268`` lands the craft on that Body.

``decode`` reads the pinned first-world RAM and every memstate without Hatari. It
hashes the ranges the note quotes, checks the instruction words the decode rests on,
and checks that the code is identical in every memstate.

``trace`` boots a memstate and chains one PC breakpoint per craft pass on the
dispatch ``$057CC2``, as the #549 probe does, saving low RAM (the craft words, the
camera words and the Body tables) at every stop. Inputs are written from the stop
scripts: keys into the ACIA mailbox ``$05558C`` and the stick into ``$79C2``. No host
timing reaches the machine, so a run is repeatable, and the ``cross`` inputs were
planned offline by replaying these models from the ``launch`` run.

``analyse`` replays every pass through the models below and records every word that
differs: the common craft pass (the #549 model), the swing ``$057F18``, the launch
handler's and the space entry's writes, the space pass ``$05872E``, the frame's range
and nearest-Body scan ``$052DB0`` with the ``$7B0A`` countdown and the arrival test,
and the landing point ``$04E936``. ``dump`` prints the stops' words.

Run from the repository root:

  python3 research/damocles-st/scripts/space-flight-probe.py decode
  python3 research/damocles-st/scripts/space-flight-probe.py trace --roms roms --case launch
  python3 research/damocles-st/scripts/space-flight-probe.py analyse --run <run-directory>

The cases are ``launch``, ``steer``, ``return``, ``cross``, ``refused-contact`` and
``refused-gate``.

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("craft_control_probe", HERE / "craft-control-probe.py")
ccp = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
sys.modules["craft_control_probe"] = ccp
_spec.loader.exec_module(ccp)

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

ProbeError = ccp.ProbeError
_check = ccp._check
u16, s16, u32, s32 = ccp.u16, ccp.s16, ccp.u32, ccp.s32
_sx16, _sx32 = ccp._sx16, ccp._sx32

CRAFT_DISPATCH = ccp.CRAFT_DISPATCH
MAILBOX = ccp.MAILBOX
STICK = ccp.STICK

# Words the space path reads and writes. Longs unless noted.
OCCUPANCY = 0x7AAE  # word: 0 aboard, 2 in space
POST_LAUNCH = 0x7B0C  # word: set by the launch handler, cleared on entering space
ARRIVAL_WAIT = 0x7B0A  # word: passes before an arrival may be raised
ARRIVAL = 0x7A28  # word: raised by $052FDA, taken by the frame path at $059920
NEAREST = 0x7924  # long: the nearest Body's table offset this pass
DESTINATION = 0x7920  # long: the Body the arrival lands on
RANGE = 0x791C  # float: the nearest range
SCRIPTED = 0x790E  # word: the scripted flight $0510D0 starts; 0 in free flight
PITCH_RATE = 0x7974  # float: space only
SPACE_X, SPACE_Y, SPACE_Z = 0x799A, 0x799E, 0x79A2  # longs: the space position
DILATION = 0x7876  # word: 32 gamma

WINDOWS = {
    "low": (0x000000, 0x008000),
    "sort": (0x008F5A, 0x009100),
    "panel": (0x04DFE8, 0x04DFF0),
    "clock": (0x051D20, 0x051DA0),
    "tables": ccp.LOG_EXP,
    # The word after the log table: an unnormalised mantissa of $2000 indexes it ($FFF0).
    "past-log": (0x066000, 0x066010),
    "craft-table": (0x055C80, 0x055E80),
}

# Half-open ranges the note quotes.
STATIC_WINDOWS = {
    "launch": (0x055822, 0x055868),
    "space-entry": (0x055868, 0x0558AE),
    "post-launch-pitch": (0x057F18, 0x057F42),
    "space-routine": (0x05872E, 0x058CFE),
    "scripted-flight": (0x05843C, 0x05872E),
    "frame-loop-space": (0x0598A6, 0x059932),
    "frame-loop-space-entry": (0x05976A, 0x05977A),
    "nearest-body": (0x052DB0, 0x052FF0),
    "landing": (0x059268, 0x05935A),
}

CODE_FACTS = {
    0x05565C: ("670001c4", "scancode $01 (Esc) goes to the launch handler $055822"),
    0x055822: ("4a787aae6638", "the launch handler refuses unless aboard"),
    0x055828: ("4a787aca66000032", "and refuses in ground contact"),
    0x05583C: ("0c700064001a6d1e", "and below +$1A = 100, with system string 21"),
    0x055844: ("31fcffff7b0c21fc000ef0007bac", "it sets $7B0C and the reverse throttle $000EF000"),
    0x057F46: ("4a787b0c66cc", "while $7B0C is set the craft pass goes to $057F18"),
    0x05976A: ("0c7801f07a30", "a pre-pass Y high word of $1F0 enters space"),
    0x05586C: ("31fc00027aae", "entering space sets occupancy 2"),
    0x058734: ("41f900055c80", "the space routine reads slot 0's parameters"),
    0x05873A: ("4a78790e67000098", "in free flight $790E is zero"),
    0x052FBC: ("4a787b0a6708", "no arrival while the $7B0A countdown runs"),
    0x052FDA: ("3038791c90686040", "arrival compares the range's exponent with the Body's"),
    0x052FE2: ("0c40fff96a000008", "and raises $7A28 more than 7 below it"),
    0x059920: ("4a787a28", "the space frame path takes the arrival"),
    0x059274: ("21fc018000007ab6", "landing sets Y to $1800000"),
}


def value(f: int) -> float:
    return ccp.value(f)


def _read_stop(run: Path, index: int) -> bytes | None:
    ram = bytearray(0x66010)
    for key, (start, end) in WINDOWS.items():
        path = run / f"p{index:05d}-{key}.bin"
        if not path.is_file() or path.stat().st_size != end - start:
            return None
        ram[start:end] = path.read_bytes()
    return bytes(ram)


def _write_chain(run: Path, stops: int, first: list[str], inputs: dict[int, list[str]]) -> None:
    scripts = [run / f"pass-{i:05d}.txt" for i in range(stops)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex"]
        for key, (start, end) in WINDOWS.items():
            lines.append(f"savebin {(run / f'p{index:05d}-{key}.bin').resolve()} ${start:x} ${end - start:x}")
        if index == 0:
            lines += first
        lines += inputs.get(index, [])
        if index + 1 < stops:
            hop = run / f"hop-{index:05d}.txt"
            hop.write_text(
                f"b pc = ${CRAFT_DISPATCH:x} :once :quiet :file {scripts[index + 1].resolve()}\nc\n",
                encoding="utf-8",
            )
            lines.append(f"b pc = ${CRAFT_DISPATCH + 6:x} :once :quiet :file {hop.resolve()}")
            lines.append("c")
        else:
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")


ccp.SCANCODES.setdefault("esc", 0x01)
key = ccp._key_lines
stick = ccp._stick_lines
poke = ccp._poke

def _raw_stick(bits: int) -> list[str]:
    return [poke(STICK, bits)]


def _merge(*parts: dict[int, list[str]]) -> dict[int, list[str]]:
    out: dict[int, list[str]] = {}
    for part in parts:
        for stop, lines in part.items():
            out.setdefault(stop, []).extend(lines)
    return out


# The crossing's inputs, planned offline by replaying the space model below from the
# `launch` run's first space stop: coast 15 passes, Space, turn onto Body 28 ($7924 = 28)
# with the stick, then key 9. The machine sees only these writes at these stops.
CROSS_STICK = {74: 0, 90: 4, 101: 8, 102: 4, 103: 8, 104: 4, 105: 8, 106: 4, 107: 8, 108: 4, 109: 8, 110: 4, 111: 8, 112: 4, 113: 8, 114: 4, 115: 8, 116: 4, 117: 8, 118: 4, 119: 8, 120: 4, 121: 8, 122: 4, 123: 8, 124: 4, 125: 8, 126: 4, 127: 8, 128: 4, 129: 8, 130: 4, 131: 8, 132: 0, 134: 4, 135: 8, 136: 4, 137: 8, 138: 4, 139: 8, 140: 4, 141: 8, 142: 4, 143: 8, 144: 4, 145: 8, 146: 4, 147: 8, 148: 4, 149: 8, 150: 4, 151: 8, 152: 5, 153: 9, 154: 5, 155: 9, 156: 5, 157: 9, 158: 1, 167: 9, 168: 5, 169: 9, 170: 5, 171: 9, 172: 5, 173: 9, 174: 4, 175: 8, 176: 6, 177: 10, 178: 6, 179: 10, 180: 6, 181: 10, 182: 6, 183: 2, 192: 6, 193: 10, 194: 6, 195: 10, 196: 6, 197: 10, 198: 6, 199: 10, 200: 6, 201: 10, 202: 6, 203: 10, 204: 6, 205: 8, 206: 4, 207: 8, 208: 0}
CROSS_KEYS = {89: 'space', 150: '9'}

CASES: dict[str, dict[str, Any]] = {
    # EAGLE NINE S E airborne over Dion, slot 3 (+$1A = 900): Esc at once, then nothing.
    "launch": {
        "memstate": "dion-north-airborne.sav",
        "stops": 1500,
        "inputs": {4: key("esc")},
    },
    # The same launch, then the stick in space: nose up, down, right and left.
    "steer": {
        "memstate": "dion-north-airborne.sav",
        "stops": 400,
        "inputs": _merge({4: key("esc")}, {
            80: stick("up"), 100: stick("none"), 120: stick("down"), 150: stick("none"),
            170: stick("right"), 200: stick("none"), 230: stick("left"), 240: _raw_stick(5),
            260: stick("none"), 300: _raw_stick(10), 320: stick("none"),
        }),
    },
    # The launch with Space pressed in the first space pass: the craft stays within
    # Dion's arrival range, and the arrival lands it back on Dion when $7B0A runs out.
    "return": {
        "memstate": "dion-north-airborne.sav",
        "stops": 400,
        "inputs": {4: key("esc"), 74: key("space")},
    },
    # Esc aboard EAGLE NINE S E still on the ground at Dion: refused silently in contact.
    "refused-contact": {
        "memstate": "rehosted/dion-2-3.sav",
        "stops": 60,
        "inputs": {4: key("b"), 30: key("esc")},
    },
    # A control, not a route: the airborne Eagle relabelled as slot 10 (CONCORD III, +$1A = 90),
    # then Esc: refused with system string 21.
    "refused-gate": {
        "memstate": "dion-north-airborne.sav",
        "stops": 40,
        "inputs": {2: [poke(ccp.SLOT, 10, "w")], 6: key("esc")},
    },
    # The launch, a crossing to the Body at table offset 28, the arrival and landing,
    # and the flight down after it.
    "cross": {
        "memstate": "dion-north-airborne.sav",
        "stops": 900,
        "inputs": _merge(
            {4: key("esc")},
            {stop: _raw_stick(bits) for stop, bits in CROSS_STICK.items()},
            {stop: key(name) for stop, name in CROSS_KEYS.items()},
        ),
    },
}


def run_case(roms: Path | None, name: str, settle: float) -> Path:
    case = CASES[name]
    run = WORK_ROOT / _run_id(f"space-flight-{name}")
    run.mkdir(parents=True)
    snapshot = ccp.SNAPSHOTS / case["memstate"]
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
        "python": sys.version.split()[0],
    }
    hatari, toolchain = discover_toolchain(config)
    meta["toolchain"] = toolchain.as_dict()
    (run / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
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
                _fifo_send(fifo, [f"hatari-debug b pc = ${CRAFT_DISPATCH:x} :once :quiet :file {(run / 'pass-00000.txt').resolve()}"])
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
    return run


def load_stops(run: Path) -> list[bytes]:
    stops = []
    while (s := _read_stop(run, len(stops))) is not None:
        stops.append(s)
    return stops


def summary_row(ram: bytes) -> dict[str, Any]:
    return {
        "occ": u16(ram, OCCUPANCY),
        "slot": u16(ram, ccp.SLOT),
        "frame": u16(ram, ccp.FRAMES_DRAWN),
        "post": u16(ram, POST_LAUNCH),
        "wait": u16(ram, ARRIVAL_WAIT),
        "arr": u16(ram, ARRIVAL),
        "scr": u16(ram, SCRIPTED),
        "near": u32(ram, NEAREST),
        "dest": u32(ram, DESTINATION),
        "range": f"{u32(ram, RANGE):08X}",
        "x": u32(ram, ccp.X), "y": s32(ram, ccp.Y), "z": u32(ram, ccp.Z),
        "sx": s32(ram, SPACE_X), "sy": s32(ram, SPACE_Y), "sz": s32(ram, SPACE_Z),
        "pitch": u16(ram, ccp.PITCH), "yaw": u16(ram, ccp.YAW), "roll": u16(ram, ccp.ROLL),
        "contact": u16(ram, ccp.CONTACT),
        "thr": f"{u32(ram, ccp.THROTTLE):08X}", "v": f"{u32(ram, ccp.SPEED):08X}",
        "rate": f"{u32(ram, ccp.TURN_RATE):08X}", "prate": f"{u32(ram, PITCH_RATE):08X}",
        "panel": s32(ram, ccp.PANEL_SPEED), "g": u16(ram, DILATION),
    }


# --- The models ----------------------------------------------------------------


def neg_m(f: int) -> int:
    """``neg.w`` on a float's mantissa word."""
    return (f & 0xFFFF0000) | ((-f) & 0xFFFF)


def fsub_log(t: Any, a: int, b: int) -> int:
    """A quotient: the two logs subtracted as longs, then the exponent table."""
    return t.exp((t.log(a) - t.log(b)) & 0xFFFFFFFF)


def fsqrt(t: Any, f: int) -> int:
    """A square root: ``asr.l #1`` of the log, then ``lsr.w #4`` / ``andi.w #$FFE`` into $60000."""
    half = ccp._asr32(t.log(f), 1)[0]
    index = ((half & 0xFFFF) >> 4) & 0x0FFE
    return (half & 0xFFFF0000) | u16(t.ram, 0x60000 + index)


def fsquare(t: Any, f: int) -> int:
    return t.exp((t.log(f) * 2) & 0xFFFFFFFF)


def space_word(f: int, saturate: bool) -> int:
    """$058B5A and its repeats: a float as a signed word, rounding on the last bit out.
    The displacement form saturates an exponent above 14; the yaw and pitch forms do not."""
    d3, d7 = f & 0xFFFFFFFF, f & 0xFFFFFFFF
    if _sx32(d7) < 0:
        if ((d7 >> 16) + 1) & 0xFFFF == 0:
            return _sx16((0xFFFF if d3 & 0x8000 else 0) | 1)
        return 0
    shift = _sx16(14 - (d7 >> 16))
    if saturate and shift < 0:
        return -0x8000 if d3 & 0x8000 else 0x7FFF
    placed = (_sx16(d3) << 2) & 0xFFFFFFFF
    out, carry = ccp._asr32(placed, shift & 0xFFFF)
    if carry:
        out = (out & 0xFFFF0000) | ((out + 1) & 0xFFFF)
    return _sx16(out)


def space_fixed(f: int) -> int:
    """$0589D6 and its repeats: a float as a 32-bit integer, truncated, saturating."""
    d4 = f & 0xFFFFFFFF
    if _sx32(d4) < 0:
        return -1 if d4 & 0x8000 else 0
    shift = _sx16(0x1D - (d4 >> 16))
    if shift >= 0:
        placed = (((d4 * 2) & 0xFFFF) << 16) & 0xFFFFFFFF
        return _sx32(ccp._asr32(placed, shift)[0])
    if shift + 1 == 0:
        m = _sx16(d4) << 2
        placed = m << 16
        if -0x80000000 <= placed < 0x80000000:
            return _sx32(placed & 0xFFFC0000)
    return 0x7FFFFFFF if not d4 & 0x8000 else -0x80000000


def damped(t: Any, rate: int, damping: int) -> int:
    """The rate is multiplied by the damping unless ``rate - $FF000000`` is negative."""
    if not ((rate - 0xFF000000) & 0xFFFFFFFF) & 0x80000000:
        return t.mul(rate, damping)
    return rate


def model_space(ram: bytes) -> dict[str, Any]:
    """One pass of the space routine $05872E in free flight ($790E = 0), from ``ram``."""
    t = ccp.Tables(ram)
    _check(u16(ram, OCCUPANCY) == 2, "model_space runs in space only")
    _check(u16(ram, SCRIPTED) == 0, "the scripted flight is not modelled")
    _check(u16(ram, ccp.REPLAY) == 0, "the stick replay path is not modelled")
    base = ccp.CRAFT_TABLE
    p = lambda off: u32(ram, base + off)  # noqa: E731
    pw = lambda off: s16(ram, base + off)  # noqa: E731
    st = ram[STICK]
    # Turn rate $7970: right tested first, as on a Body.
    r = damped(t, u32(ram, ccp.TURN_RATE), p(4))
    if st & 8:
        r = ccp.fadd(p(8), r)
    elif st & 4:
        r = ccp.fadd(neg_m(p(8)), r)
    # Pitch rate $7974: the up bit adds the acceleration, the down bit subtracts it.
    q = damped(t, u32(ram, PITCH_RATE), p(4))
    if st & 1:
        q = ccp.fadd(p(8), q)
    elif st & 2:
        q = ccp.fadd(neg_m(p(8)), q)
    # Speed: (V + throttle x gain) x lag x range / (range + 65536).
    thrust = t.mul(u32(ram, ccp.THROTTLE), p(0x1C))
    v = t.mul(ccp.fadd(u32(ram, ccp.SPEED), thrust), p(0x14))
    rng = u32(ram, RANGE)
    near = fsub_log(t, rng, ccp.fadd(0x00101000, rng))
    v = t.mul(v, near)
    # 32 gamma, and the panel's speed.
    s = ccp.fadd(0x000A1000, fsquare(t, v))
    g = space_word(fsqrt(t, s), saturate=True)
    if _sx16(g) > 0xBC:
        panel = (0x2FF77FC6 - space_fixed(fsub_log(t, 0x002617FC, s))) & 0xFFFFFFFF
    elif _sx16(g) > 0x20:
        inner = ccp.fadd(neg_m(fsub_log(t, 0x004511FA, s)), 0x003B11FA)
        panel = space_fixed(fsqrt(t, inner)) & 0xFFFFFFFF
    else:
        magnitude = v if not v & 0x8000 else neg_m(v)
        panel = space_fixed(t.mul(magnitude, 0x001817FC)) & 0xFFFFFFFF
    # Displacement along the frame's attitude, a word per axis.
    cp, sp = u32(ram, ccp.COS_PITCH), u32(ram, ccp.SIN_PITCH)
    cy, sy = u32(ram, ccp.COS_YAW), u32(ram, ccp.SIN_YAW)
    dz = space_word(t.mul(t.mul(cp, cy), v), saturate=True)
    dx = space_word(t.mul(t.mul(cp, sy), v), saturate=True)
    dy = space_word(t.mul(sp, v), saturate=True)
    sx = (u32(ram, SPACE_X) + dx) & 0xFFFFFFFF
    sy_ = (u32(ram, SPACE_Y) + dy) & 0xFFFFFFFF
    sz = (u32(ram, SPACE_Z) + dz) & 0xFFFFFFFF
    yaw = (u16(ram, ccp.YAW) + space_word(r, saturate=False)) & 0xFFFF
    four = (q + ((pw(0x0E) & 0xFFFF) << 16)) & 0xFFFFFFFF
    pitch = (space_word(four, saturate=False) + 0x200) & 0xFFFF
    return {
        "turnRate": r, "pitchRate": q, "speed": v, "dilation": g & 0xFFFF, "panelSpeed": _sx32(panel),
        "spaceX": sx, "spaceY": sy_, "spaceZ": sz, "yaw": yaw, "pitch": pitch, "roll": 0, "contact": 0,
        "dx": dx, "dy": dy, "dz": dz,
    }


def observed_space(ram: bytes) -> dict[str, Any]:
    return {
        "turnRate": u32(ram, ccp.TURN_RATE), "pitchRate": u32(ram, PITCH_RATE), "speed": u32(ram, ccp.SPEED),
        "dilation": u16(ram, DILATION), "panelSpeed": s32(ram, ccp.PANEL_SPEED),
        "spaceX": u32(ram, SPACE_X), "spaceY": u32(ram, SPACE_Y), "spaceZ": u32(ram, SPACE_Z),
        "yaw": u16(ram, ccp.YAW), "pitch": u16(ram, ccp.PITCH), "roll": u16(ram, ccp.ROLL),
        "contact": u16(ram, ccp.CONTACT),
    }


def model_swing(ram: bytes) -> dict[str, Any] | None:
    """$057F18: while $7B0C is set, the pitch swings 16 a pass, and nothing else moves, until
    (pitch + $80) & $3FF passes $300. Past it, the rest of the craft pass runs with no stick,
    which returns None here: that pass is the common craft pass."""
    d1 = (u16(ram, ccp.PITCH) + 0x80) & 0x3FF
    if d1 > 0x300:
        return None
    step = 0x10 if d1 > 0x180 else -0x10
    return {"pitch": (u16(ram, ccp.PITCH) + step) & 0xFFFF}


def int_float(value_: int) -> int:
    """$04BDD8: a signed long as a float. The exponent is the highest set bit, the mantissa
    the next eleven bits, truncated, with the sign on the mantissa. Nought is $FFF01000."""
    signed = _sx32(value_)
    magnitude = abs(signed)
    if magnitude == 0:
        return 0xFFF01000
    e = magnitude.bit_length() - 1
    mantissa = ((magnitude << 12) >> e) & 0xFFFE
    return ((e & 0xFFFF) << 16) | ((-mantissa if signed < 0 else mantissa) & 0xFFFF)


OCTANTS = 0x04EAF2  # eight words: an offset, bit 15 set where the table angle is negated
_PROGRAM: bytes | None = None


def program_word(address: int) -> int:
    """A word of program code, which the stop windows do not save, from the pinned RAM."""
    global _PROGRAM
    if _PROGRAM is None:
        _PROGRAM = ccp.FIRST_WORLD.read_bytes()
    return u16(_PROGRAM, address)
ARCTAN = 0x063002  # bytes inside the exponent table's page, indexed by a ratio word


def atan2(t: Any, d0: int, d1: int) -> int:
    """$04EA48: the angle, 1,024 a turn, of the float pair (d0, d1)."""
    ram = t.ram
    d7 = 0
    if d0 & 0x8000:
        d7 += 4
        d0 = neg_m(d0)
    if d1 & 0x8000:
        d7 += 8
        d1 = neg_m(d1)
    q = fsub_log(t, d0, d1)
    if not q & 0x80000000:
        d7 += 2
        q = fsub_log(t, 0x00001000, q)
    q = (q + 0x80000) & 0xFFFFFFFF
    index = space_word(q, saturate=True)
    angle = ram[0x060000 + ((index + 0x3002) & 0xFFFF)]
    offset = program_word(OCTANTS + d7)
    if offset & 0x8000:
        angle = -angle
    return (angle + offset) & 0x3FF


def model_landing(ram: bytes, a0: int) -> dict[str, Any]:
    """$059268 up to the Body switch: the sub-craft point on Body ``a0`` as X and Z. The
    frame runs it after that frame's space pass, so ``ram`` is the state the pass left."""
    t = ccp.Tables(ram)
    sx, sy, sz = u32(ram, SPACE_X), u32(ram, SPACE_Y), u32(ram, SPACE_Z)
    bx, bz = u32(ram, 0x5F40 + a0), u32(ram, 0x5FC0 + a0)
    lon = atan2(t, int_float(sx - bx), int_float(sz - bz)) ^ 0x200
    word = ((lon - u16(ram, 0x62EA + a0)) << 6) & 0xFFFF
    # $058F64 then masks the high words of X and Z to twelve bits.
    x = ((_sx16(word) >> 4) & 0x0FFF) << 16
    ratio = (fsub_log(t, int_float(sy), u32(ram, 0x6040 + a0)) + 0x80000) & 0xFFFFFFFF
    if not ratio & 0x80000000:
        lat = 0x200 if ratio & 0x8000 else 0
    else:
        lat = atan2(t, fsqrt(t, ccp.fadd(0x00001000, neg_m(fsquare(t, ratio)))), ratio)
    word = ((lat - 0x100) << 7) & 0xFFFF
    z = ((_sx16(word) >> 4) & 0x0FFF) << 16
    turn = atan2(t, int_float(bx), int_float(bz)) ^ 0x200
    return {"body": a0, "longitude": lon, "latitude": lat, "x": x, "z": z, "y": 0x01800000,
            "terminator": turn, "spaceX": bx, "spaceY": 0x40, "spaceZ": bz}


def view_matrix(t: Any, roll: int, pitch: int, yaw: int) -> list[int]:
    """$055F60 then $045710: the view rotation at $42C20, nine floats, from the camera words
    $7A9E, $7AA0 and $7AA2 (the pose copy's roll, pitch and yaw)."""
    sr, cr = t.sine(roll), t.sine(roll + 0x100)
    sp, cp = t.sine(pitch), t.sine(pitch + 0x100)
    sy, cy = t.sine(yaw), t.sine(yaw + 0x100)
    mul, add = t.mul, ccp.fadd
    return [
        mul(cp, sy), sp, mul(cp, cy),
        add(mul(mul(sr, sp), sy), mul(cr, cy)),
        neg_m(mul(sr, cp)),
        add(neg_m(mul(cr, sy)), mul(mul(sr, sp), cy)),
        add(mul(sr, cy), neg_m(mul(mul(cr, sp), sy))),
        mul(cr, cp),
        neg_m(add(mul(sr, sy), mul(mul(cr, sp), cy))),
    ]


def body_range(t: Any, matrix: list[int], body: tuple[int, int, int], craft: tuple[int, int, int]) -> tuple[list[int], int]:
    """$052DE8-$052E8C: a Body's offset rotated by the view ($05668A), and its length. The
    rotated offset is answered as the words at $840(a0), $5C0(a0) and $340(a0)."""
    d = [int_float((b - c) & 0xFFFFFFFF) for b, c in zip(body, craft)]
    rows = []
    for row in range(3):
        m = matrix[row * 3:row * 3 + 3]
        rows.append(ccp.fadd(ccp.fadd(t.mul(d[0], m[0]), t.mul(d[1], m[1])), t.mul(d[2], m[2])))
    # $05668A stores the rows at $840(a0), $340(a0) and $5C0(a0); the length sums $840, $5C0, $340.
    stored = [rows[0], rows[2], rows[1]]
    a, b, c = (fsquare(t, v) for v in stored)
    return stored, fsqrt(t, ccp.fadd(ccp.fadd(a, b), c))


def model_nearest(ram: bytes) -> dict[str, Any]:
    """$052DB0: every Body's range from the craft, and the nearest, as the frame after a space
    pass leaves them. Bodies whose Y word is negative are not in the scene and are skipped."""
    t = ccp.Tables(ram)
    matrix = view_matrix(t, u16(ram, 0x7A9E), u16(ram, 0x7AA0), u16(ram, 0x7AA2))
    craft = (u32(ram, SPACE_X), u32(ram, SPACE_Y), u32(ram, SPACE_Z))
    best, nearest, ranges = 0x00201000, None, {}
    for a0 in range(u32(ram, 0x7C0E), -1, -4):
        y = u32(ram, 0x626A + a0)
        if y & 0x80000000:
            continue
        rows, rng = body_range(t, matrix, (u32(ram, 0x5F40 + a0), y, u32(ram, 0x5FC0 + a0)), craft)
        ranges[a0] = {"rows": rows, "range": rng}
        if ((rng - best) & 0xFFFFFFFF) & 0x80000000:
            best, nearest = rng, a0
    return {"nearest": nearest, "range": best, "bodies": ranges}


def model_space_frame(ram: bytes) -> dict[str, Any]:
    """A frame in space after its pass: the pose copy puts the attitude in the camera words,
    $052DB0 takes every range and the nearest Body, and then either counts $7B0A down or,
    once it is nought, raises the arrival when the range's exponent is more than 7 below the
    nearest Body's $6040 exponent (docs/research/damocles-space-flight.md)."""
    moved = model_space(ram)
    state = _with(ram, {
        SPACE_X: (4, moved["spaceX"]), SPACE_Y: (4, moved["spaceY"]), SPACE_Z: (4, moved["spaceZ"]),
        0x7A9E: (2, moved["roll"]), 0x7AA0: (2, moved["pitch"]), 0x7AA2: (2, moved["yaw"]),
    })
    near = model_nearest(state)
    wait = u16(ram, ARRIVAL_WAIT)
    arrive = False
    if wait:
        wait -= 1
    elif near["nearest"] is not None:
        gap = _sx16((near["range"] >> 16) - (u32(ram, 0x6040 + near["nearest"]) >> 16))
        arrive = gap < -7
    return {"pass": moved, "state": state, "nearest": near["nearest"], "range": near["range"],
            "wait": wait, "arrive": arrive}


LAUNCH_SPEED_HIGH = 0xF000  # $055852: the speed's exponent word, effectively zero
ENTRY_SPEED_HIGH = 0x0010  # $05588A
ENTRY_THROTTLE_HIGH = 0x000E  # $055884
ENTRY_PITCH = 0x01FF  # $055890
SPACE_COMPARED = ("turnRate", "pitchRate", "speed", "dilation", "panelSpeed", "spaceX", "spaceY", "spaceZ", "yaw", "pitch", "roll", "contact")


def _with(ram: bytes, writes: dict[int, tuple[int, int]]) -> bytes:
    image = bytearray(ram)
    for address, (width, value_) in writes.items():
        image[address:address + width] = (value_ & ((1 << (8 * width)) - 1)).to_bytes(width, "big")
    return bytes(image)


def analyse(stops: list[bytes], case: dict[str, Any]) -> dict[str, Any]:
    """Replay every pass. A stop's pokes are applied to its image first, except the key
    mailbox, which the dispatcher has already read in that frame."""
    written: dict[int, list[tuple[int, bytes]]] = {}
    for stop, lines in case["inputs"].items():
        written.setdefault(int(stop), []).extend(ccp._pokes(lines))
    rows, counts, mismatches = [], {}, []
    for index, (before, after) in enumerate(zip(stops, stops[1:])):
        pokes = [(a, b) for a, b in written.get(index, []) if a != MAILBOX]
        if pokes:
            image = bytearray(before)
            for address, data in pokes:
                image[address:address + len(data)] = data
            before = bytes(image)
        occ, occ_after = u16(before, OCCUPANCY), u16(after, OCCUPANCY)
        launched = u16(before, POST_LAUNCH) == 0 and u16(after, POST_LAUNCH) != 0
        kind, bad, detail = None, [], {}
        if occ == 2 and occ_after == 2:
            kind = "space"
            frame = model_space_frame(before)
            model, seen = dict(frame["pass"]), observed_space(after)
            model.update(nearest=frame["nearest"], range=frame["range"], wait=frame["wait"], arrive=frame["arrive"])
            seen.update(nearest=u32(after, NEAREST), range=u32(after, RANGE), wait=u16(after, ARRIVAL_WAIT), arrive=False)
            bad = [k for k in (*SPACE_COMPARED, "nearest", "range", "wait", "arrive") if model[k] != seen[k]]
            detail = {k: [model[k], seen[k]] for k in bad}
        elif occ == 0 and u16(before, POST_LAUNCH) != 0 and (swing := model_swing(before)) is not None:
            kind = "swing"
            unchanged = ("x", "y", "z", "yaw", "roll", "speed", "turnRate", "contact")
            seen_b, seen_a = ccp.observed(before), ccp.observed(after)
            bad = [k for k in unchanged if seen_b[k] != seen_a[k]]
            if swing["pitch"] != seen_a["pitch"]:
                bad.append("pitch")
            detail = {k: [seen_b.get(k, swing.get(k)), seen_a[k]] for k in bad}
        elif occ == 0 and occ_after in (0, 2):
            swung = u16(before, POST_LAUNCH) != 0
            image = _with(before, {POST_LAUNCH: (2, 0), STICK: (1, 0)}) if swung else before
            kind = "swung-pass" if swung else "pass"
            # $055868 returns to $05948C without drawing, so the entry pass shares a frame too.
            if occ_after == 0 and u16(after, ccp.FRAMES_DRAWN) == u16(before, ccp.FRAMES_DRAWN):
                kind = "refused"
            else:
                model = ccp.model_pass(image)
                seen = ccp.observed(after)
                if model.get("landing"):
                    kind += "-landing"
                else:
                    for key_ in ("x", "z"):
                        model[key_] &= 0x0FFFFFFF
                    if launched:
                        kind += "+launch"
                        model["speed"] = (LAUNCH_SPEED_HIGH << 16) | (model["speed"] & 0xFFFF)
                    if occ_after == 2:
                        kind += "+entry"
                        model["speed"] = (ENTRY_SPEED_HIGH << 16) | (model["speed"] & 0xFFFF)
                        model["pitch"] = ENTRY_PITCH
                    compared = [k for k in ccp.COMPARED if not (occ_after == 2 and k in ("panelSpeed",))]
                    bad = [k for k in compared if model[k] != seen[k]]
                    detail = {k: [model[k], seen[k]] for k in bad}
                    if occ_after == 2:
                        thr = u32(after, ccp.THROTTLE)
                        if thr >> 16 != ENTRY_THROTTLE_HIGH:
                            bad.append("throttle")
        elif occ == 2 and occ_after == 0:
            kind = "arrival"
            frame = model_space_frame(before)
            model = model_landing(frame["state"], frame["nearest"])
            if not frame["arrive"]:
                bad.append("arrive")
            seen = {"longitude": u16(after, 0x7A1E), "latitude": u16(after, 0x7A22), "x": u32(after, ccp.X),
                    "z": u32(after, ccp.Z), "y": u32(after, ccp.Y), "terminator": u16(after, 0x79BE),
                    "spaceX": u32(after, SPACE_X), "spaceY": u32(after, SPACE_Y), "spaceZ": u32(after, SPACE_Z),
                    "body": u32(after, DESTINATION)}
            bad += [k for k in seen if model[k] != seen[k]]
            detail = {k: [model[k], seen[k]] for k in seen}
        else:
            kind = f"on foot or boarding, not compared ({occ}->{occ_after})"
        counts.setdefault(kind, [0, 0])
        counts[kind][0] += 1
        if kind == "arrival":
            rows.append({"stop": index, "kind": "arrival-detail", "fields": detail})
        if bad:
            mismatches.append({"stop": index, "kind": kind, "fields": detail})
        else:
            counts[kind][1] += 1
        rows.append({"stop": index, "kind": kind, **summary_row(before)})
    # What each Esc did: the handler runs in the frame after the stop that wrote the key.
    escapes = []
    for stop, lines in case["inputs"].items():
        if (MAILBOX, bytes([ccp.SCANCODES["esc"]])) in ccp._pokes(lines) and int(stop) + 1 < len(stops):
            before, after = stops[int(stop)], stops[int(stop) + 1]
            escapes.append({
                "stop": int(stop),
                "occupancy": u16(before, OCCUPANCY), "contact": u16(before, ccp.CONTACT),
                "slot": u16(before, ccp.SLOT),
                "launched": u16(after, POST_LAUNCH) != 0,
                "throttle": f"${u32(after, ccp.THROTTLE):08X}",
                "message": u16(after, 0x7BA0) != 0 and u16(before, 0x7BA0) == 0,
                "messagePointer": f"${u32(after, 0x7B98):08X}",
            })
    counts = {k: v for k, v in counts.items()}
    return {"counts": {k: ({"passes": v[0]} if "not compared" in k else {"passes": v[0], "matched": v[1]})
                       for k, v in counts.items()},
            "escapes": escapes,
            "mismatchCount": len(mismatches), "mismatches": mismatches[:30], "rows": rows}


def decode() -> int:
    ram = ccp.FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(ram).hexdigest() == ccp.FIRST_WORLD_SHA256, "pinned first-world RAM hash mismatch")
    report: dict[str, Any] = {"windows": {}}
    windows = {**STATIC_WINDOWS, "view-matrix": (0x045710, 0x045914), "view-trig": (0x055F60, 0x056072),
               "rotate": (0x05668A, 0x0568E0), "atan2": (0x04EA48, 0x04EB02), "landing-point": (0x04E936, 0x04EA48),
               "arctan-table": (0x063002, 0x063104), "int-float": (0x04BDD4, 0x04BF00)}
    for name, (start, end) in windows.items():
        report["windows"][name] = {"range": f"${start:06X}-${end:06X}", "sha256": hashlib.sha256(ram[start:end]).hexdigest()}
    for address, (hexwords, meaning) in CODE_FACTS.items():
        got = ram[address:address + len(hexwords) // 2].hex()
        _check(got == hexwords, f"${address:06X}: {got} is not {hexwords} ({meaning})")
    report["codeFacts"] = {f"${a:06X}": m for a, (_, m) in CODE_FACTS.items()}
    report["octants"] = [f"${u16(ram, OCTANTS + 2 * i):04X}" for i in range(8)]
    report["pastLogTable"] = f"${u16(ram, 0x066000):04X}"
    # The launch gate: +$1A of each slot, 100 or more to launch.
    report["launchCapable"] = [slot for slot in range(ccp.SLOTS) if s16(ram, ccp.CRAFT_TABLE + slot * 32 + 0x1A) >= 100]
    base = ccp.CRAFT_TABLE
    report["spaceParameters"] = {
        "turnAndPitchDamping+4": f"${u32(ram, base + 4):08X}", "turnAndPitchAcceleration+8": f"${u32(ram, base + 8):08X}",
        "pitchScaleExponent+E": s16(ram, base + 0x0E), "speedLag+14": f"${u32(ram, base + 0x14):08X}",
        "thrustGain+1C": f"${u32(ram, base + 0x1C):08X}",
    }
    # The code is the same in every memstate, and so are the Body positions, extents and the
    # word after the log table.
    identical, bodies, absent = [], None, {}
    for path in ccp._memstates():
        other = hatari_memstate_ram(path.read_bytes())
        for name, (start, end) in windows.items():
            diff = [a for a in range(start, end) if other[a] != ram[a]]
            _check(not diff, f"{path.name}: {name} differs at {[hex(a) for a in diff[:4]]}")
        _check(u16(other, 0x066000) == 0xFFF0, f"{path.name}: $066000 is not $FFF0")
        # Body 29 (the comet, #538) moves, and a Y word of $80000000 takes a Body out of the
        # scene; every other position and every extent is the same in every memstate.
        table = [(a0, s32(other, 0x5F40 + a0), s32(other, 0x5FC0 + a0), u32(other, 0x6040 + a0))
                 for a0 in range(0, 0x78, 4)]
        fixed = [row for row in table if row[0] != 29 * 4]
        if bodies is None:
            bodies = table
        _check(fixed == [row for row in bodies if row[0] != 29 * 4], f"{path.name}: the Body table differs")
        hidden = [a0 // 4 for a0 in range(0, 0x78, 4) if u32(other, 0x626A + a0) & 0x80000000]
        if hidden:
            absent[path.name] = hidden
        identical.append(path.name)
    report["memstatesIdentical"] = identical
    report["bodiesOutOfScene"] = absent
    report["bodies"] = [
        {"body": a0 // 4, "offset": a0, "x": x, "z": z, "extent": f"${e:08X}", "extentValue": value(e)}
        for a0, x, z, e in bodies or []
    ]
    print(json.dumps(report, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("decode")
    tr = sub.add_parser("trace")
    tr.add_argument("--roms", type=Path)
    tr.add_argument("--case", choices=sorted(CASES), required=True)
    tr.add_argument("--settle", type=float, default=2.0)
    an = sub.add_parser("dump")
    an.add_argument("--run", type=Path, required=True)
    ay = sub.add_parser("analyse")
    ay.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "trace":
            run = run_case(args.roms, args.case, args.settle)
            print(run)
            return 0
        if args.command == "dump":
            run = args.run if args.run.is_absolute() else WORK_ROOT / args.run
            for i, s in enumerate(load_stops(run)):
                print(i, json.dumps(summary_row(s)))
            return 0
        if args.command == "analyse":
            run = args.run if args.run.is_absolute() else WORK_ROOT / args.run
            meta = json.loads((run / "meta.json").read_text(encoding="utf-8"))
            result = analyse(load_stops(run), CASES[meta["case"]])
            result["meta"] = meta
            result["run"] = run.name
            (run / "trace.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            print(json.dumps({k: v for k, v in result.items() if k not in ("rows", "meta")}, indent=2))
            return 0
        return decode()
    except (ProbeError, LabError) as error:
        print(f"space-flight-probe: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
