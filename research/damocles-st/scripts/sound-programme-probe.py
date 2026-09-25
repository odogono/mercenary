#!/usr/bin/env python3
"""Damocles sound programme probe (#514).

#508 recovered and heard the door tone, the door burst and the shared effect.
This probe covers the rest of the sound driver and every PSG write outside it:
docs/research/damocles-sound-programmes.md is the note it supports.

``decode`` reads the pinned first-world RAM without Hatari. It hashes every
window the note quotes, checks the byte sequences each decoded register write,
table and arming site rests on, decodes the music player's three voice
streams, and raises if anything differs.

``record --case NAME`` boots one memstate with sound on, pokes ``$FFFF820A``
to $02 for the PAL field rate (as lift-sound-probe.py does), arms a Hatari
``:trace`` breakpoint on the entry of every sound programme, starts Hatari's
own WAV capture, and then plays the case's steps: key events, joystick
softcopy writes and, where a case says so, pokes. A trace breakpoint does not
stop the machine; each hit is a line in Hatari's log, so the result names the
programmes that actually ran, in order. Every step is bracketed by a read of
Hatari's ``VBL`` counter, so each step and each trace hit has an emulated time
on the recording's own clock.

Cases whose event the port's sessions can reach are driven as ordinary input
from a tracked or rehosted memstate. Cases marked ``intervention`` poke state
to reach the event (the hazard warning, the Geiger counter, the ghettoblaster,
an explosive's deadline); the pokes are listed in the case and in
``result.json``. ``arm-*`` cases write a programme's entry into its vector
directly. They hear the programme, not its event, and the note says so.

``analyse <mono.wav>`` measures a recording: per VBL the level, the dominant
frequency and the spectral flatness, and per sounding segment its onset,
length, peak, pitch and decay rate.

Run from the repository root:

  research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py decode
  research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py record --roms roms --case limo
  research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py analyse <mono.wav>

What this establishes: Hatari 2.6.1's audible output for the program's own
register writes on the emulated timeline, and which programme wrote them.
What it does not: the analogue output of a real ST (see lift-sound-probe.py),
or that an intervention's state is one ordinary play reaches.

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import JOYSTICK1_SOFTCOPY, LabError, file_hash, format_hatari_key, validate_image  # noqa: E402
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

_spec = importlib.util.spec_from_file_location("lift_sound_probe", Path(__file__).with_name("lift-sound-probe.py"))
lsp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lsp)

SNAPSHOTS = LAB_ROOT / "snapshots"
FIRST_WORLD = WORK_ROOT / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"
YM_CLOCK = 2_000_000
RATE = 48000


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


# --- the programmes ----------------------------------------------------------

# Every entry that writes the PSG, keyed by address. ``vector`` is the vector
# it is armed in (None: called directly, or outside the driver).
PROGRAMMES: dict[int, dict[str, Any]] = {
    0x04BF5C: {"name": "spell", "vector": 0x04BF54},
    0x04BFE2: {"name": "spell step", "vector": 0x04BF54},
    0x04C016: {"name": "splash", "vector": 0x04BF54},
    0x04C09C: {"name": "splash step", "vector": 0x04BF54},
    0x04C0B4: {"name": "transporter", "vector": 0x04BF54},
    0x04C13A: {"name": "transporter step", "vector": 0x04BF54},
    0x04C16E: {"name": "hazard alarm", "vector": 0x04BF58},
    0x04C1C0: {"name": "hazard alarm step", "vector": 0x04BF58},
    0x04C1EE: {"name": "channel C off", "vector": 0x04BF58},
    0x04C220: {"name": "channel C restore", "vector": 0x04BF58},
    0x04C2B8: {"name": "door burst", "vector": 0x04BF58},
    0x04C37A: {"name": "door tone", "vector": 0x04BF58},
    0x04C470: {"name": "bump", "vector": 0x04BF54},
    0x04C556: {"name": "shared effect", "vector": 0x04BF54},
    0x04C5A8: {"name": "blast", "vector": 0x04BF54},
    0x04C610: {"name": "shot", "vector": 0x04BF54},
    0x04C630: {"name": "thud", "vector": 0x04BF54},
    0x04C652: {"name": "zap", "vector": 0x04BF54},
    0x04C6B2: {"name": "geiger click", "vector": None},
    0x04C700: {"name": "blown up", "vector": 0x04BF54},
    0x051274: {"name": "descent drone start", "vector": None},
    0x05142E: {"name": "descent drone end", "vector": None},
    0x0523DC: {"name": "message end", "vector": None},
    0x034020: {"name": "music start", "vector": None},
    0x034390: {"name": "music stop", "vector": None},
    0x0508BC: {"name": "sound reset", "vector": None},
}
# Continuations run every VBL; tracing them would flood the log. The
# message tone at $052402 runs every VBL too, so its end is traced instead.
TRACED = [a for a, p in PROGRAMMES.items() if "step" not in p["name"]]

# The note's static windows: (start, end exclusive).
WINDOWS = {
    "spell": (0x04BF5C, 0x04C016),
    "splash": (0x04C016, 0x04C0B4),
    "transporter": (0x04C0B4, 0x04C16E),
    "hazard alarm and table": (0x04C16E, 0x04C1EE),
    "channel C off": (0x04C1EE, 0x04C220),
    "bump and its stream reader": (0x04C470, 0x04C556),
    "noise family": (0x04C5A8, 0x04C652),
    "zap": (0x04C652, 0x04C6B2),
    "geiger click": (0x04C6B2, 0x04C700),
    "blown up": (0x04C700, 0x04C722),
    "geiger rate": (0x04C814, 0x04C8D2),
    "geiger tick": (0x051D26, 0x051D74),
    "explosive fuse": (0x04D69C, 0x04D762),
    "explosive deadline": (0x04DAC6, 0x04DAF8),
    "explosive blast": (0x04CB60, 0x04CBDA),
    "switches": (0x04D420, 0x04D4D0),
    "book pages": (0x04D7F0, 0x04D90E),
    "shots and enemy ship": (0x050B28, 0x050BC4),
    "attack ship": (0x050D80, 0x050E0A),
    "hazard ticker": (0x050F0E, 0x050FA6),
    "descent drone": (0x051274, 0x05146E),
    "new game": (0x051052, 0x051226),
    "descent": (0x05872E, 0x0587D8),
    "message tone": (0x052402, 0x05246C),
    "message end": (0x0523BE, 0x052402),
    "hazard evaluator": (0x0543FA, 0x05449C),
    "grounding": (0x057CF2, 0x057D64),
    "transport": (0x059184, 0x059268),
    "wall": (0x059586, 0x0595A4),
    "refused move": (0x059740, 0x05976A),
    "music gate": (0x0594A4, 0x0594D2),
    "sound reset": (0x0508BC, 0x050905),
    "music player": (0x033F68, 0x034416),
    "music voices": (0x03441E, 0x034FB0),
    "music instruments": (0x034FB0, 0x0350C8),
    "bump stream": (0x008702, 0x008714),
}

# Byte sequences the decode rests on: address -> (hex, meaning).
FACTS: dict[int, tuple[str, str]] = {
    # vectors, and who arms them
    0x04D850: ("23fc0004bf5c0004bf54", "book page 1 arms the spell"),
    0x04D902: ("23fc0004bf5c0004bf54", "book pages 2-7 arm the spell"),
    0x04D8E4: ("23fc0004c4700004bf54", "book page 8 arms the bump"),
    0x04D7F4: ("4a387126", "book: MAGIC CRYSTAL carried ($7126)"),
    0x0547F2: ("0c3800837856", "book: slot $83 (BOOK)"),
    0x057D56: ("23fc0004c0160004bf54", "grounding on sea arms the splash"),
    0x057D42: ("23fc0004c5a80004bf54", "grounding on land arms the blast"),
    0x057D32: ("c13878a6", "grounding: sea test $78A6 & $794A"),
    0x05925A: ("23fc0004c0b40004bf54", "transport arms the transporter"),
    0x0591AE: ("323c0014", "transport: string 20"),
    0x050F4C: ("23fc0004c16e0004bf58", "hazard ticker arms the alarm"),
    0x050F76: ("0c4001f4", "hazard: 500 VBLs to death"),
    0x050F34: ("23fc0004c1ee0004bf58", "hazard sheltered: channel C off"),
    0x050F82: ("23fc0004c1ee0004bf58", "hazard death: channel C off"),
    0x054464: ("23fc0004c1ee0004bf58", "hazard cleared: channel C off"),
    0x05448A: ("23fc0004c1ee0004bf58", "hazard replaced: channel C off"),
    0x059760: ("23fc0004c4700004bf54", "a refused move arms the bump"),
    0x059750: ("31fcfff07bac", "a refused move: throttle back"),
    0x04DAE4: ("23fc0004c5a80004bf54", "explosive deadline arms the blast"),
    0x04DAEE: ("31fcffff7834", "explosive deadline: particle burst"),
    0x050BBA: ("23fc0004c6100004bf54", "the player's shot"),
    0x050B50: ("23fc0004c6100004bf54", "enemy ship destroyed"),
    0x050B62: ("7231", "enemy ship destroyed: string $31"),
    0x050DD8: ("23fc0004c6300004bf54", "the attack ship fires"),
    0x059594: ("31fc00037a7823fc0004c6300004bf54", "on foot into a wall"),
    0x05958A: ("0c7901000005a646", "wall: the region clamp's flag"),
    0x050E00: ("23fc0004c6520004bf54", "zapped"),
    0x04CB9C: ("23fc0004c7000004bf54", "blown up: carried explosive"),
    0x04CBBC: ("23fc0004c7000004bf54", "blown up: too close"),
    0x04CB8E: ("7222", "blown up: string 34"),
    0x04CBAE: ("7223", "blown up: string 35"),
    0x051D62: ("4eb90004c6b2", "the tick calls the geiger click"),
    0x04C814: ("4a3871fe", "geiger rate: GEIGER COUNTER carried ($71FE)"),
    0x04C81C: ("083800077875", "geiger rate: switched on ($7875 bit 7)"),
    0x04C83E: ("41f8028c", "geiger rate: distance to NOVABOMB (slot 163)"),
    0x04C6FC: ("6000feee", "the click ends in the disarming tail"),
    0x04D448: ("31fcffff7a62", "switch bit 1 (GHETTOBLASTER) on"),
    0x04D4C4: ("42787a62", "GHETTOBLASTER off"),
    0x0594A4: ("4a787a6267184a38718e6a12", "music gate: $7A62 and GHETTOBLASTER carried"),
    0x0594B8: ("33fc010000033f68", "music start request"),
    0x0594CA: ("33fc000100033f68", "music stop request"),
    0x051DFE: ("4a7900033f686708", "VBL: music replaces both vectors"),
    0x051E06: ("4eb900033f6a6010", "VBL: call the music player"),
    0x033F6A: ("4a3900033f686b0001166700041a600000a6", "player: play / stop / start by $33F68's high byte"),
    0x03432E: ("11fc0006880011f9000000018802", "player: noise period from address $000001"),
    0x034024: ("1e3900033f7c0207fff700070001", "player: channel A noise on, tone off"),
    0x034042: ("1e3900033f7c0207fffd00070010", "player: channel B tone on, noise off"),
    0x034060: ("1e3900033f7c0207fffb00070020", "player: channel C tone on, noise off"),
    0x052424: ("6100ff26d241", "message tone: period = character x 2"),
    0x052446: ("11fc0008880011fc000c8802", "message tone: channel A level 12"),
    0x05127C: ("31fc04007bee31fc04807bf0", "drone: B period $400, C period $480"),
    0x05129C: ("11fc00f88802", "drone: mixer $F8"),
    0x05136E: ("58787bee58787bf0", "drone: both periods +4 a step"),
    0x051198: ("610000da", "new game starts the drone"),
    0x05120E: ("61000130", "new game steps the drone"),
    0x0587D0: ("4eb900051340", "descent steps the drone"),
    0x058798: ("4eb90005142e", "descent ends the drone"),
    0x0510D0: ("31fc0001790e", "new game: descent state 1"),
    0x0588BC: ("2638797a", "flight: speed $797A"),
    0x04C256: ("2638797a20036b42", "idle engine: only while $797A >= 0"),
    # tables
    0x04C1DC: ("0202030304040207020f030380000004c1dc", "alarm levels, loop"),
    0x008702: ("0ff00fe00fd00fc20fb00fa00f500f40ffff", "bump periods, loop"),
    0x0508F8: ("0100010001001fda0010000000", "reset register table"),
}


def _seq(ram: bytes, start: int, limit: int = 5000) -> dict[str, Any]:
    """Decode one music voice stream (see the note's grammar)."""
    events: list[dict[str, Any]] = []
    vol = pit = None
    a, vbls, seen = start, 0, set()
    for _ in range(limit):
        c = ram[a]
        if c == 0:
            vol, a = ram[a + 1], a + 2
        elif c == 1:
            pit, a = ram[a + 1], a + 2
        elif c == 2:
            target = int.from_bytes(ram[a + 1 : a + 4], "big")
            events.append({"jump": target})
            if target in seen:
                break
            seen.add(target)
            a = target
        else:
            period = int.from_bytes(ram[a + 1 : a + 3], "big")
            events.append({"vbls": c - 2, "period": period, "vol": vol, "pit": pit})
            vbls += c - 2
            a += 3
    notes = [e for e in events if "vbls" in e]
    loop = next(i for i, e in enumerate(events) if "jump" in e)
    first = [e for e in events[:loop] if "vbls" in e]
    return {
        "start": f"${start:06X}",
        "loopVbls": sum(e["vbls"] for e in first),
        "notes": len(first),
        "periods": sorted({e["period"] for e in first if e["period"] < 0x8000}),
        "rests": sum(1 for e in first if e["period"] >= 0x8000),
        "instruments": sorted({(e["vol"], e["pit"]) for e in first}, key=str),
        "sha256": hashlib.sha256(json.dumps(first, sort_keys=True).encode()).hexdigest(),
        "_all": notes,
    }


def decode() -> int:
    _check(FIRST_WORLD.is_file(), f"pinned first-world RAM not found: {FIRST_WORLD}")
    ram = FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(ram).hexdigest() == FIRST_WORLD_SHA256, "first-world RAM hash")
    for address, (hexbytes, meaning) in FACTS.items():
        found = ram[address : address + len(hexbytes) // 2].hex()
        _check(found == hexbytes, f"${address:06X} ({meaning}): {found} != {hexbytes}")
    windows = {
        name: {"range": f"${start:06X}-${end - 1:06X}", "sha256": hashlib.sha256(ram[start:end]).hexdigest()}
        for name, (start, end) in WINDOWS.items()
    }
    voices = {f"voice{i}": _seq(ram, a) for i, a in enumerate((0x03441E, 0x03489C, 0x034D90), 1)}
    for v in voices.values():
        _check(v["loopVbls"] == 3328, f"{v['start']}: loop of {v['loopVbls']} VBLs, not 3328")
        del v["_all"]
    _check(voices["voice1"]["instruments"] == [(None, None)], "voice 1 sets an instrument")
    # Voice 2 picks its first pitch table only at its 417th note, 8 VBLs before its loop ends.
    a, notes, vbls = 0x03489C, 0, 0
    while ram[a] != 1:
        if ram[a] == 0:
            a += 2
            continue
        vbls, notes, a = vbls + ram[a] - 2, notes + 1, a + 3
    _check((notes, vbls, ram[a + 1]) == (417, 3320, 1), f"voice 2's first pitch table: note {notes}, VBL {vbls}")
    voices["voice2"]["firstPitchTable"] = {"note": notes, "vbl": vbls, "address": f"${a:06X}"}
    print(json.dumps({"windows": windows, "facts": len(FACTS), "voices": voices}, indent=2, default=str))
    return 0


# --- record ----------------------------------------------------------------

HELP, SPACE = 0x62, 0x39
DIGIT = {n: 0x01 + n for n in range(1, 10)}
FIRE = 0x80  # joystick-1 softcopy bit 7, which the shot launch $050B96 tests


def _u16(ram: bytes, a: int) -> int:
    return int.from_bytes(ram[a : a + 2], "big")


def _u32(ram: bytes, a: int) -> int:
    return int.from_bytes(ram[a : a + 4], "big")


def _w(a: int, value: int, size: int) -> tuple[int, str]:
    return a, f"{value & ((1 << (8 * size)) - 1):0{2 * size}x}"


# Live interventions: each reads the stopped machine's $6000-$7FFF and
# returns the writes to make before it continues. Addresses are the note's.
NOVABOMB = 163 * 4  # slot 163: X at $63A8, Y at $67A8, Z at $6BA8, body at $73A8


def geiger(ram: bytes, distance: int) -> list[tuple[int, str]]:
    """GEIGER COUNTER (slot 149) carried and switched on; NOVABOMB beside the player."""
    return [
        _w(0x71FE, ram[0x71FE] | 0x80, 1),  # $6FAA + 4*149: carried
        _w(0x7875, ram[0x7875] | 0x80, 1),  # switch bit 7 on
        _w(0x73A8 + NOVABOMB, ram[0x7AA9], 1),  # on the player's body
        _w(0x63A8 + NOVABOMB, _u32(ram, 0x7AB2) + distance, 4),
        _w(0x67A8 + NOVABOMB, 0, 4),
        _w(0x6BA8 + NOVABOMB, _u32(ram, 0x7ABA), 4),
    ]


def explosive(ram: bytes, seconds: int, carried: bool) -> list[tuple[int, str]]:
    """EXPLOSIVE slot 75 armed as $04D73E arms it, due in ``seconds``."""
    writes = [
        _w(0x7A5C, 0x012C, 4),  # the armed explosive, slot x 4 ($7A5C long, $7A5E word)
        _w(0x7A54, 1, 2),
        _w(0x7868, _u16(ram, 0x793E) + seconds, 2),  # the deadline against the Impact Clock
    ]
    if carried:
        writes.append(_w(0x6FAA + 0x012C, ram[0x6FAA + 0x012C] | 0x80, 1))
    return writes


def hazard(ram: bytes, code: int) -> list[tuple[int, str]]:
    """A pending environment warning, as $0543FA leaves it."""
    return [_w(0x7A7C, code, 2), _w(0x7A64, 2, 2)]


def music(ram: bytes, on: bool) -> list[tuple[int, str]]:
    """GHETTOBLASTER (slot 121) carried, and its switch ($7A62) on or off."""
    return [_w(0x718E, ram[0x718E] | 0x80, 1), _w(0x7A62, 0xFFFF if on else 0, 2)]


def arm(vector: int, entry: int) -> Any:
    """Arm ``entry`` in ``vector`` as every caller does: $7A78 <- 3, then the vector."""
    return lambda ram: [_w(0x7A78, 3, 2), _w(vector, entry, 4)]


LIVE = {
    "geiger-near": lambda ram: geiger(ram, 0x40),
    "geiger-mid": lambda ram: geiger(ram, 0x800),
    "geiger-far": lambda ram: geiger(ram, 0x8000),
    "explosive-dropped": lambda ram: explosive(ram, 3, False),
    "explosive-carried": lambda ram: explosive(ram, 3, True),
    "hazard-cold": lambda ram: hazard(ram, 4),
    "music-on": lambda ram: music(ram, True),
    "music-off": lambda ram: music(ram, False),
    **{f"arm-{entry:06x}": arm(PROGRAMMES[entry]["vector"], entry)
       for entry in (0x04BF5C, 0x04C016, 0x04C0B4, 0x04C470, 0x04C5A8, 0x04C610, 0x04C630, 0x04C652, 0x04C700, 0x04C16E)},
}


def _wait(seconds: float) -> dict[str, Any]:
    return {"type": "wait", "seconds": seconds}


def _live(name: str) -> dict[str, Any]:
    return {"type": "live", "compute": name}


def _arm_case(entries: list[int]) -> dict[str, Any]:
    steps: list[dict[str, Any]] = [_wait(2.0)]
    for entry in entries:
        steps += [_live(f"arm-{entry:06x}"), _wait(6.0 if entry != 0x04C700 else 20.0)]
    return {
        "snapshot": "eris-spaceport-onfoot.sav",
        "intervention": "each programme is written into its vector; its event is not reached",
        "about": "arm " + ", ".join(f"${e:06X} ({PROGRAMMES[e]['name']})" for e in entries) + " in turn, 6 s apart",
        "steps": steps,
    }


CASES: dict[str, dict[str, Any]] = {
    "limo": {
        "snapshot": "boarded-limo.sav",
        "about": "boarded V.I.P. LIMO: speed key 4 drives it into the building ahead; fire; Help opens the pause message",
        "steps": [
            _wait(2.0),
            {"type": "key", "code": DIGIT[4], "label": "speed 4"},
            _wait(10.0),
            {"type": "joy", "byte": FIRE, "hold": 0.15, "label": "fire"},
            _wait(3.0),
            {"type": "key", "code": HELP, "label": "help"},
            _wait(6.0),
            {"type": "key", "code": SPACE, "label": "return to game"},
            _wait(2.0),
        ],
    },
    "transporter": {
        "snapshot": "rehosted/eris-transporter-11-8.sav",
        "about": "on foot beside the Eris transporter (slot 69): walk forward into the cube",
        "steps": [_wait(2.0), {"type": "stick", "byte": 0x01, "seconds": 8.0, "label": "walk forward"}, _wait(6.0)],
    },
    "lift-wall": {
        "snapshot": "rehosted/eris-lift.sav",
        "about": "on foot in the State Office lift car: walk forward, then back, into its walls",
        "steps": [
            _wait(2.0),
            {"type": "stick", "byte": 0x01, "seconds": 4.0, "label": "walk forward"},
            _wait(1.0),
            {"type": "stick", "byte": 0x02, "seconds": 4.0, "label": "walk back"},
            _wait(2.0),
        ],
    },
    "hazard": {
        "snapshot": "eris-spaceport-onfoot.sav",
        "intervention": "writes the warning $0543FA would leave after a drop: $7A7C = 4 (TOO COLD), $7A64 = 2",
        "about": "the hazard ticker $050F0E from a pending warning, through the ten seconds to death",
        "steps": [_wait(2.0), _live("hazard-cold"), _wait(16.0), {"type": "key", "code": HELP, "label": "help"}, _wait(4.0)],
    },
    "geiger": {
        "snapshot": "eris-spaceport-onfoot.sav",
        "intervention": "GEIGER COUNTER carried and switched on; NOVABOMB moved beside the player at three distances",
        "about": "the Geiger tick $051D26 and click $04C6B2 at 64, 2048 and 32768 units from the NOVABOMB",
        "steps": [_wait(2.0), _live("geiger-near"), _wait(8.0), _live("geiger-mid"), _wait(8.0), _live("geiger-far"), _wait(10.0)],
    },
    "explosive-dropped": {
        "snapshot": "eris-spaceport-onfoot.sav",
        "intervention": "EXPLOSIVE slot 75 armed with a 3 s deadline, where it lies",
        "about": "the per-second deadline $04DACC detonating an explosive the player does not carry",
        "steps": [_wait(2.0), _live("explosive-dropped"), _wait(24.0)],
    },
    "explosive-carried": {
        "snapshot": "eris-spaceport-onfoot.sav",
        "intervention": "EXPLOSIVE slot 75 armed with a 3 s deadline and marked carried",
        "about": "the deadline detonating an explosive the player carries",
        "steps": [_wait(2.0), _live("explosive-carried"), _wait(24.0)],
    },
    "music": {
        "snapshot": "eris-spaceport-onfoot.sav",
        "intervention": "GHETTOBLASTER marked carried and its switch $7A62 set, as keypad + on it would",
        "about": "the music player $033F6A for one full 3328-VBL loop and a little more, then switched off",
        "steps": [_wait(2.0), _live("music-on"), _wait(72.0), _live("music-off"), _wait(4.0)],
    },
    "music-after-thud": {
        "snapshot": "eris-spaceport-onfoot.sav",
        "intervention": "the thud armed directly, then the GHETTOBLASTER switched on as in the music case",
        "about": "voice 1's channel A under an envelope that shape 9 has left at zero",
        "steps": [_wait(2.0), _live("arm-04c630"), _wait(3.0), _live("music-on"), _wait(8.0), _live("music-off"), _wait(2.0)],
    },
    "arm-b": _arm_case([0x04BF5C, 0x04C016, 0x04C0B4, 0x04C470, 0x04C5A8, 0x04C610, 0x04C630, 0x04C652, 0x04C700]),
    "boot": {
        "snapshot": None,
        "about": "cold boot from TOS: the loader and title, Space, the New Game descent and landing",
        "steps": [
            _wait(75.0),
            {"type": "sync"},
            {"type": "key", "code": SPACE, "label": "space on the title"},
            _wait(90.0),
        ],
    },
}


_VALUE = re.compile(r"^= .*#(-?\d+)")
_TRACE = re.compile(r"^(\d+)\. CPU breakpoint condition\(s\) matched (\d+) times")


def _vbl(fifo) -> None:
    _fifo_send(fifo, ["hatari-stop", "hatari-debug setopt hex", "hatari-debug e VBL", "hatari-cont"])
    time.sleep(0.3)


def record(roms: Path | None, case_name: str, freq: int, mixing: str, settle: float) -> int:
    _check(case_name in CASES, f"unknown case {case_name!r}; known: {', '.join(CASES)}")
    case = CASES[case_name]
    run = WORK_ROOT / _run_id(f"sound-{case_name}")
    run.mkdir(parents=True)
    snapshot = SNAPSHOTS / case["snapshot"] if case.get("snapshot") else None
    _check(snapshot is None or snapshot.is_file(), f"snapshot not found: {snapshot}")
    sox = shutil.which("sox")
    _check(sox is not None, "sox not found")

    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    meta: dict[str, Any] = {
        "programSha256": validate_image(program, authority["programImage"], label="Working Authority STX")["hashes"]["sha256"],
        "tosSha256": validate_image(tos, authority["tosImage"], label="TOS image")["hashes"]["sha256"],
    }
    hatari, toolchain = discover_toolchain(config)
    meta["toolchain"] = toolchain.as_dict()

    capture = run / "capture.wav"
    config_file = run / "sound.cfg"
    config_file.write_text(f"[Sound]\nszYMCaptureFileName = {capture.resolve()}\n", encoding="utf-8")
    fifo_path = run / "cmd.fifo"
    parse = run / "parse.txt"
    parse.write_text("c\n", encoding="utf-8")
    extra = ["--memstate", str(snapshot.resolve())] if snapshot else []
    base = build_hatari_command(
        hatari_binary=hatari,
        tos=tos,
        disk_a=program,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse,
        fast_forward=False,
        statusbar=False,
        cmd_fifo=fifo_path,
        extra_args=extra,
    )
    command = lsp._sound_command(base, freq, mixing, config_file, True)
    env = os.environ.copy()
    env.update(headless_env())
    marks: list[dict[str, Any]] = []
    t0 = time.monotonic()
    error = None
    log_path = run / "hatari.log"

    def mark(what: str, **extra: Any) -> None:
        marks.append({"hostSeconds": round(time.monotonic() - t0, 3), "event": what, **extra})
        _vbl(fifo)

    with log_path.open("w", encoding="utf-8") as log:
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
                lsp._counters(fifo, run, 0)
                time.sleep(0.6)
                lsp._counters(fifo, run, 1)
                _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${lsp.SYNC_MODE & 0xFFFFFF:x} 02", "hatari-cont"])
                time.sleep(0.5)
                lsp._counters(fifo, run, 2)
                time.sleep(1.0)
                lsp._counters(fifo, run, 3)
                traces = ["hatari-stop"] + [f"hatari-debug b pc = ${a:x} :trace" for a in TRACED] + ["hatari-cont"]
                _fifo_send(fifo, traces)
                time.sleep(0.5)
                _fifo_send(fifo, ["hatari-shortcut recsound"])
                mark("recsound on")
                for step in case["steps"]:
                    kind = step["type"]
                    if kind == "wait":
                        time.sleep(step["seconds"])
                    elif kind == "key":
                        code = format_hatari_key(step["code"])
                        mark("keydown", label=step.get("label"), code=step["code"])
                        _fifo_send(fifo, [f"hatari-event keydown {code}"])
                        time.sleep(step.get("hold", 0.12))
                        _fifo_send(fifo, [f"hatari-event keyup {code}"])
                    elif kind == "joy":
                        mark("joystick", label=step.get("label"), byte=step["byte"])
                        _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {step['byte']:02x}", "hatari-cont"])
                        time.sleep(step.get("hold", 0.15))
                        _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} 00", "hatari-cont"])
                    elif kind == "stick":
                        mark("stick", label=step.get("label"), byte=step["byte"])
                        _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {step['byte']:02x}", "hatari-cont"])
                        time.sleep(step["seconds"])
                        _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} 00", "hatari-cont"])
                        mark("stick released")
                    elif kind == "sync":
                        _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${lsp.SYNC_MODE & 0xFFFFFF:x} 02", "hatari-cont"])
                        mark("sync mode $02 poked again")
                    elif kind == "live":
                        window = run / f"live-{len(marks)}.bin"
                        # Hatari stops reading the FIFO if it sits stopped with nothing
                        # queued, so the read and the writes are two round trips.
                        _fifo_send(fifo, ["hatari-stop", f"hatari-debug savebin {window.resolve()} $6000 $2000", "hatari-cont"])
                        for _ in range(100):
                            if window.is_file() and window.stat().st_size == 0x2000:
                                break
                            time.sleep(0.05)
                        _check(window.is_file() and window.stat().st_size == 0x2000, f"no live window {window}")
                        ram = bytes(0x6000) + window.read_bytes()
                        writes = LIVE[step["compute"]](ram)
                        lines = [f"hatari-debug w ${a:x} {' '.join(h[i:i+2] for i in range(0, len(h), 2))}" for a, h in writes]
                        _fifo_send(fifo, ["hatari-stop"] + lines + ["hatari-cont"])
                        mark("live", label=step["compute"], writes=[[f"${a:06X}", h] for a, h in writes])
                    elif kind == "poke":
                        mark("poke", address=f"${step['address']:06X}", bytes=step["bytes"])
                        _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${step['address']:x} {' '.join(step['bytes'][i:i+2] for i in range(0, len(step['bytes']), 2))}", "hatari-cont"])
                    elif kind == "pokes":
                        mark("pokes", label=step.get("label"), pokes=[[f"${p['address']:06X}", p["bytes"]] for p in step["pokes"]])
                        lines = ["hatari-stop"] + [
                            f"hatari-debug w ${p['address']:x} {' '.join(p['bytes'][i:i+2] for i in range(0, len(p['bytes']), 2))}" for p in step["pokes"]
                        ] + ["hatari-cont"]
                        _fifo_send(fifo, lines)
                    else:
                        raise LabError(f"unknown step {kind}")
                    _check(process.poll() is None, f"Hatari exited during step {step}")
                mark("recsound off")
                _fifo_send(fifo, ["hatari-shortcut recsound"])
                time.sleep(1.0)
                lsp._counters(fifo, run, 4)
                time.sleep(1.0)
                lsp._counters(fifo, run, 5)
                _fifo_send(fifo, ["hatari-shortcut quit"])
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    pass
        except BrokenPipeError:
            error = "Hatari closed the command FIFO"
        except LabError as failure:
            error = str(failure)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()

    # The log interleaves the counter reads (_counters: three per sample,
    # four samples), then one VBL read per mark, with the trace hits.
    lines = log_path.read_text(errors="replace").splitlines()
    values: list[int] = []
    hits: list[dict[str, Any]] = []
    for line in lines:
        m = _VALUE.match(line)
        if m:
            values.append(int(m.group(1)))
            continue
        t = _TRACE.search(line)
        if t:
            index = int(t.group(1)) - 1
            hits.append({"after": len(values), "programme": f"${TRACED[index]:06X}", "name": PROGRAMMES[TRACED[index]]["name"], "count": int(t.group(2))})
    field_rate = None
    try:
        field_rate = lsp._field_rate(run, 4)
    except LabError as failure:
        error = error or str(failure)
    # Six more counter reads (two samples) follow the marks.
    mark_vbls = values[12:-6]
    end_rate = None
    if len(values) >= 18:
        v = values[-6:]
        fields = v[3] - v[0]
        cycles = ((v[4] & 0xFFFFFFFF) - v[5] - ((v[1] & 0xFFFFFFFF) - v[2])) % (1 << 32)
        end_rate = {"fields": fields, "cycles": cycles, "cyclesPerField": cycles / fields if fields else None}
    for i, m in enumerate(marks):
        m["vbl"] = mark_vbls[i] if i < len(mark_vbls) else None
    start_vbl = marks[0]["vbl"] if marks else None
    for h in hits:
        # A hit printed after the k-th mark's read lies between marks k and k+1.
        k = h.pop("after") - 12 - 1
        h["afterMark"] = marks[k]["event"] + (f" {marks[k].get('label')}" if marks[k].get("label") else "") if 0 <= k < len(marks) else None
        h["afterMarkVbl"] = marks[k]["vbl"] - start_vbl if 0 <= k < len(marks) and start_vbl is not None and marks[k]["vbl"] is not None else None
    for m in marks:
        if m.get("vbl") is not None and start_vbl is not None:
            m["recordingSeconds"] = round((m["vbl"] - start_vbl) / lsp.PAL_HZ, 3)
    measured = end_rate["cyclesPerField"] if end_rate else None
    if measured != lsp.PAL_CYCLES:
        error = error or f"not at the PAL field rate when recording stopped: {measured} cycles per field"

    wavs: dict[str, Any] = {}
    analysis = None
    mono = run / f"{case_name}-mono-48k.wav"
    if error is None:
        _check(capture.is_file() and capture.stat().st_size > 44, f"no WAV capture at {capture}")
        wavs["capture"] = {"path": str(capture), "sha256": file_hash(capture)}
        subprocess.run([sox, str(capture), "-c", "1", "-r", str(RATE), "-b", "16", str(mono)], check=True)
        wavs["mono"] = {"path": str(mono), "sha256": file_hash(mono)}
        analysis = analyse(mono)
    result = {
        "schemaVersion": 1,
        "case": case_name,
        "about": case["about"],
        "intervention": case.get("intervention", False),
        "steps": case["steps"],
        "marks": marks,
        "traceHits": hits,
        "fieldRate": field_rate,
        "fieldRateAtEnd": end_rate,
        "command": command,
        "wavs": wavs,
        "analysis": analysis,
        "error": error,
        "meta": meta,
        "snapshot": case.get("snapshot"),
        "snapshotSha256": file_hash(snapshot) if snapshot else None,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    (run / "result.json").write_text(json.dumps(result, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"run": str(run), "marks": marks, "traceHits": hits, "wavs": wavs, "error": error}, indent=1, default=str))
    if analysis:
        print_segments(analysis)
    if error:
        raise LabError(error)
    return 0


# --- analyse ---------------------------------------------------------------


def _flatness(power: list[float]) -> float:
    vals = [p for p in power[1:] if p > 0]
    if not vals:
        return 0.0
    geo = math.exp(sum(math.log(p) for p in vals) / len(vals))
    return geo / (sum(vals) / len(vals))


def _peak_hz(power: list[float], rate: int, size: int, lo: float = 20.0) -> float:
    k0 = max(1, int(lo * size / rate))
    k = max(range(k0, len(power) - 1), key=lambda i: power[i])
    # Parabolic interpolation on the log power.
    a, b, c = (math.log(max(power[k + d], 1e-30)) for d in (-1, 0, 1))
    shift = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) else 0.0
    return (k + shift) * rate / size


def analyse(path: Path, vbl_hz: float = lsp.PAL_HZ, floor_db: float = -60.0) -> dict[str, Any]:
    samples, rate = lsp.read_mono(path)
    hop = rate / vbl_hz
    count = int(len(samples) / hop)
    frames = []
    for i in range(count):
        a, b = int(i * hop), int((i + 1) * hop)
        chunk = samples[a:b]
        mean = sum(chunk) / len(chunk)
        rms = math.sqrt(sum((v - mean) ** 2 for v in chunk) / len(chunk))
        frames.append(lsp.db(rms))
    segments = []
    i = 0
    while i < count:
        if frames[i] < floor_db:
            i += 1
            continue
        j = i
        quiet = 0
        while j < count and quiet < 3:
            quiet = quiet + 1 if frames[j] < floor_db else 0
            j += 1
        end = j - quiet
        a, b = int(i * hop), int(end * hop)
        size = 1 << max(10, min(16, int(math.log2(max(b - a, 1024)))))
        power = lsp.power_spectrum(samples[a : min(b, a + size)], size)
        first = [frames[k] for k in range(i, min(end, i + 5))]
        peak = max(frames[i:end])
        peak_at = i + frames[i:end].index(peak)
        tail = [(k, frames[k]) for k in range(peak_at, end) if frames[k] > floor_db]
        slope = None
        if len(tail) >= 4:
            n = len(tail)
            mx = sum(k for k, _ in tail) / n
            my = sum(v for _, v in tail) / n
            den = sum((k - mx) ** 2 for k, _ in tail)
            slope = sum((k - mx) * (v - my) for k, v in tail) / den * vbl_hz if den else None
        segments.append(
            {
                "startSeconds": round(i / vbl_hz, 3),
                "startVbl": i,
                "vbls": end - i,
                "peakDb": round(peak, 1),
                "firstVblsDb": [round(v, 1) for v in first],
                "peakHz": round(_peak_hz(power, rate, size), 1),
                "flatness": round(_flatness(power), 3),
                "decayDbPerSecond": round(slope, 1) if slope is not None else None,
            }
        )
        i = j
    return {"path": str(path), "sha256": file_hash(path), "vblHz": vbl_hz, "floorDb": floor_db, "vbls": count, "segments": segments, "levels": [round(v, 1) for v in frames]}


def print_segments(analysis: dict[str, Any]) -> None:
    for s in analysis["segments"]:
        print(f"{s['startSeconds']:8.3f}s  VBL {s['startVbl']:5d}  {s['vbls']:5d} VBLs  peak {s['peakDb']:6.1f} dB  "
              f"{s['peakHz']:8.1f} Hz  flat {s['flatness']:.3f}  decay {s['decayDbPerSecond']}  first {s['firstVblsDb']}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("decode")
    rec = sub.add_parser("record")
    rec.add_argument("--roms", type=Path)
    rec.add_argument("--case", required=True)
    rec.add_argument("--freq", type=int, default=48000)
    rec.add_argument("--ym-mixing", default="model")
    rec.add_argument("--settle", type=float, default=3.0)
    ana = sub.add_parser("analyse")
    ana.add_argument("wav", type=Path)
    ana.add_argument("--floor-db", type=float, default=-60.0)
    args = parser.parse_args()
    try:
        if args.command == "decode":
            return decode()
        if args.command == "record":
            return record(args.roms, args.case, args.freq, args.ym_mixing, args.settle)
        analysis = analyse(args.wav, floor_db=args.floor_db)
        print_segments(analysis)
        return 0
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
