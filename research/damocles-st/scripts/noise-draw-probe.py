#!/usr/bin/env python3
"""Damocles noise-table draw probe (#582).

#572 found that the pointer ``$7E18`` walks the 2,048-word noise table at
``$77000``, that the main loop's join ``$05948C`` steps it a word a pass, and
that eleven sites draw from it. This probe answers what #572 left open: what
the native sites draw for, and how often the main loop passes on foot.

``decode`` reads the pinned first-world RAM and the memstates without Hatari.
It checks the instruction words each finding rests on, hashes the routines the
note quotes, and sweeps the memstates for the words that gate the draws.

``live`` boots one rehosted memstate, or cold-boots to the title checkpoint
and presses Space for ``new-game``, and arms a chain that stops on every VBL
and saves small RAM windows. A case may write RAM at its first stop, as the
#514 sound probe's interventions do. Host timing decides only which VBL the
Space press lands on. Every stop is checked against the program's own VBL
clock ``$051D98``.

``analyse`` reads the saved stops back. It splits each VBL's pointer movement
into the main loop's steps, counted by the frame counter ``$7AE8``, and the
draws. It raises when a case's movement is not what its decode predicts.

Run from the repository root:

  python3 research/damocles-st/scripts/noise-draw-probe.py decode \
    --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
    --memstates research/damocles-st/snapshots/rehosted
  python3 research/damocles-st/scripts/noise-draw-probe.py live --roms roms --case NAME
  python3 research/damocles-st/scripts/noise-draw-probe.py analyse --trace work/noise-draw-NAME-...

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

POINTER = 0x7E18  # long: the next word of the table, $00077000-$00077FFE
TABLE = 0x77000
TABLE_WORDS = 2048
FRAMES = 0x7AE8  # $0599A0: +1 per rendered frame, i.e. per main-loop pass
FRAME_VBLS = 0x51D22  # $0599B2: VBLs the last frame took
VBL_CLOCK = 0x51D98  # low word of the long $051E34 increments every VBL
BOARDED = 0x7A8E  # the #357 walk flag: 1 on foot, 0 aboard, 2 in the New Game descent
GEIGER_RATE = 0x7A74
SOUND_TICKS = 0x7A78
DEBRIS = 0x7834  # debris frames left; $FFFF = the explosive's blast pending
DEBRIS_COUNT = 0x783E
QUEUE = 0x7A8C  # $04BEEE's destruction queue, slot x 4, negative when empty
QUEUE_GATE = 0x753C  # word: slot 101's body record; $04BEEE runs only when zero
SPACE_SCANCODE = 57
START_POSE = (0x004770B1, 63, 0x00886C2D)  # web/damocles/eris.json start, from eris-spaceport-onfoot
DESCENT_FRAMES = 0x259  # $051206: the descent's last frame

WINDOWS = {
    "lo": (0x7800, 0x7F00),
    "vbl": (0x51D20, 0x51DA0),
}

#: Every site that reads the pointer, with the instruction words the note quotes.
SITES = {
    0x04CCF2: ("20787e18", "debris: particle angle"),
    0x04CD28: ("20787e18", "debris: particle elevation, masked by $7832"),
    0x04CD66: ("20787e18", "debris: particle speed"),
    0x05160C: ("20787e18", "descent streak: colour"),
    0x05162C: ("20787e18", "descent streak: X"),
    0x051652: ("20787e18", "descent streak: Y"),
    0x051672: ("20787e18", "descent streak: depth exponent"),
    0x05169E: ("20787e18", "descent streak: depth mantissa"),
    0x051A60: ("20787e18", "if.random"),
    0x051C2E: ("20787e18", "message.random"),
    0x051D38: ("20787e18", "Geiger tick"),
    0x050ED2: ("20787e18", "zap flash: rotates the words it walks, never moves the pointer"),
}

#: Other instruction words the decode rests on.
FACTS = {
    0x051090: ("21fc000770007e18", "New Game seeds the pointer at $77000"),
    0x05948C: ("3e387e1a5447", "the main loop's join steps the pointer one word without reading it"),
    0x05949E: ("4eb90004beee", "then runs the destruction queue"),
    0x04CCEA: ("3c38783e", "debris: particle count from $783E"),
    0x04CEB8: ("51cefe36", "debris: dbra over the particles"),
    0x04CEBC: ("31fc00407834", "debris lasts 64 frames"),
    0x04CA1C: ("600002b4", "a destroyed object's debris joins the spray at $04CCD2"),
    0x04CA0C: ("31fc03ff7832", "a destroyed object's elevation mask $3FF"),
    0x04CCA0: ("31fc00ff7832", "the blast's elevation mask $FF"),
    0x04CCA6: ("21fcffffd8f07836", "the blast's debris falls"),
    0x04DAEE: ("31fcffff7834", "the explosive's deadline marks the blast pending"),
    0x05950C: ("4eb90004cf4e", "the main loop runs the debris"),
    0x04CF4E: ("6b00fc10", "a pending blast ($7834 negative) runs $04CB60"),
    0x04C9F2: ("b0787aa8", "the player's own craft makes no debris"),
    0x0514CE: ("3a3c004f", "descent: 80 streaks"),
    0x0515AA: ("0c40013f", "descent: a streak off the screen's width is respawned"),
    0x0515F6: ("0c410087", "descent: or off its height"),
    0x0516C6: ("6000fe92", "a respawned streak is projected again"),
    0x0511CA: ("0c7801997ae8", "descent: first leg ends at frame $199"),
    0x051206: ("0c7802597ae8", "descent: second leg ends at frame $259"),
    0x051220: ("4ef90005942e", "then the main loop"),
    0x051D26: ("4a787a78", "Geiger tick: held while $7A78 counts down"),
    0x051D2C: ("4a787a74", "Geiger tick: silent at rate 0"),
    0x05231E: ("6100fa06", "the Timer B handler runs the Geiger tick"),
    0x051DAC: ("6100ff78", "the VBL handler runs the Geiger tick"),
    0x04BEEE: ("4a78753c", "destruction queue: gated by slot 101's body word"),
    0x050ECC: ("203c0000ffff", "zap flash: 65,535 steps"),
    0x050ED6: ("e6d02218", "each rotates a word right by one and reads a long on"),
    0x050F06: ("538066cc", "subq.l / bne: the step count"),
    0x050E0A: ("610000c0", "the zap ($04C652 armed just before) runs the flash"),
}

RANGES = {
    "debris spray $04CCD2-$04CEBC": (0x04CCD2, 0x04CEBC),
    "debris step $04CF4E-$04CFA4": (0x04CF4E, 0x04CFA4),
    "descent $051064-$05122E": (0x051064, 0x05122E),
    "descent streaks $051476-$0516CA": (0x051476, 0x0516CA),
    "message.random $051C2C-$051C74": (0x051C2C, 0x051C74),
    "Geiger tick $051D26-$051D74": (0x051D26, 0x051D74),
    "zap flash $050ECC-$050F0C": (0x050ECC, 0x050F0C),
    "destruction queue $04BEEE-$04BF18": (0x04BEEE, 0x04BF18),
    "main-loop advance $05948C-$05949E": (0x05948C, 0x05949E),
}


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _u16(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 2], "big")


def _u32(ram: bytes, address: int) -> int:
    return int.from_bytes(ram[address : address + 4], "big")


def _w(address: int, value: int, size: int) -> tuple[int, str]:
    return address, f"{value & ((1 << (8 * size)) - 1):0{2 * size}x}"


def decode(run: Path, memstates: Path | None) -> int:
    ram = (run / "observed.ram").read_bytes()
    report: dict[str, Any] = {"sites": {}, "facts": {}, "ranges": {}}
    for address, (word, about) in {**SITES, **FACTS}.items():
        actual = ram[address : address + len(word) // 2].hex()
        _check(actual == word, f"${address:06X} ({about}): {actual} is not {word}")
        (report["sites"] if address in SITES else report["facts"])[f"${address:06X}"] = about
    for name, (start, end) in RANGES.items():
        report["ranges"][name] = hashlib.sha256(ram[start:end]).hexdigest()
    # No other instruction reads or writes the pointer: every `$7e18.w` operand in
    # the program, at every even address, is one of the sites above or the seed.
    readers = []
    for address in range(0x40000, 0x60000, 2):
        if ram[address : address + 4].hex() == "20787e18":
            readers.append(address)
    _check(
        sorted(readers) == sorted(SITES),
        f"pointer readers {[f'${a:06X}' for a in readers]}",
    )
    report["pointerReaders"] = len(readers)
    report["firstWorld"] = {
        "debrisCount": _u16(ram, DEBRIS_COUNT),
        "queue": _u16(ram, QUEUE),
        "queueGate": _u16(ram, QUEUE_GATE),
    }
    if memstates is not None:
        sweep: Counter[str] = Counter()
        for path in sorted(memstates.glob("*.sav")):
            state = hatari_memstate_ram(path.read_bytes())
            key = (
                f"count={_u16(state, DEBRIS_COUNT)} queue={_u16(state, QUEUE):04x} "
                f"gate={_u16(state, QUEUE_GATE):04x} geiger={_u16(state, GEIGER_RATE)} "
                f"debris={_u16(state, DEBRIS)}"
            )
            sweep[key] += 1
            _check(
                hashlib.sha256(state[TABLE : TABLE + 2 * TABLE_WORDS]).digest()
                == hashlib.sha256(ram[TABLE : TABLE + 2 * TABLE_WORDS]).digest(),
                f"{path.name}: the noise table differs",
            )
        report["memstates"] = dict(sweep)
    print(json.dumps(report, indent=2))
    return 0


# Interventions, written at the first stop. Addresses as in sound-programme-probe.py.
NOVABOMB = 163 * 4


def geiger(ram: bytes) -> list[tuple[int, str]]:
    """GEIGER COUNTER (slot 149) carried and on; NOVABOMB 64 units from the player."""
    return [
        _w(0x71FE, ram[0x71FE] | 0x80, 1),
        _w(0x7875, ram[0x7875] | 0x80, 1),
        _w(0x73A8 + NOVABOMB, ram[0x7AA9], 1),
        _w(0x63A8 + NOVABOMB, _u32(ram, 0x7AB2) + 0x40, 4),
        _w(0x67A8 + NOVABOMB, 0, 4),
        _w(0x6BA8 + NOVABOMB, _u32(ram, 0x7ABA), 4),
    ]


def explosive(ram: bytes) -> list[tuple[int, str]]:
    """EXPLOSIVE slot 75 armed as $04D73E arms it, due in two seconds, not carried."""
    return [_w(0x7A5C, 0x012C, 4), _w(0x7A54, 1, 2), _w(0x7868, _u16(ram, 0x793E) + 2, 2)]


# name: (memstate or None for a New Game, stops, intervention)
CASES: dict[str, tuple[str | None, int, Callable[[bytes], list[tuple[int, str]]] | None]] = {
    "eris-spaceport-onfoot": ("rehosted/eris-spaceport-onfoot.sav", 400, None),
    "dion-2-3": ("rehosted/dion-2-3.sav", 400, None),
    "vesta-parliament": ("rehosted/vesta-parliament-4-6.sav", 400, None),
    "gaea-ur-city": ("rehosted/gaea-ur-city-4-2.sav", 400, None),
    "eris-lift": ("rehosted/eris-lift.sav", 400, None),
    "icarus": ("rehosted/icarus.sav", 400, None),
    "geiger": ("rehosted/eris-spaceport-onfoot.sav", 200, geiger),
    "explosive": ("rehosted/eris-spaceport-onfoot.sav", 300, explosive),
    "new-game": (None, 9000, None),
}


def _stop_path(run: Path, index: int, key: str) -> Path:
    return run / f"t{index:04d}-{key}.bin"


def _read_stop(run: Path, index: int) -> dict[str, Any] | None:
    ram = bytearray(0x60000)
    for key, (start, end) in WINDOWS.items():
        path = _stop_path(run, index, key)
        if not path.is_file() or path.stat().st_size != end - start:
            return None
        ram[start:end] = path.read_bytes()
    return {
        "stop": index,
        "vbl": _u16(ram, VBL_CLOCK),
        "pointer": _u32(ram, POINTER),
        "frames": _u16(ram, FRAMES),
        "frameVbls": _u16(ram, FRAME_VBLS),
        "boarded": _u16(ram, BOARDED),
        "geigerRate": _u16(ram, GEIGER_RATE),
        "soundTicks": _u16(ram, SOUND_TICKS),
        "debris": _u16(ram, DEBRIS),
        "pose": (_u32(ram, 0x7AB2), _u32(ram, 0x7AB6), _u32(ram, 0x7ABA)),
    }


def _write_chain(run: Path, stops: int, first_lines: list[str]) -> Path:
    scripts = [run / f"trace-{i:04d}.txt" for i in range(stops)]
    for index, script in enumerate(scripts):
        lines = ["setopt hex"]
        for key, (start, end) in WINDOWS.items():
            lines.append(f"savebin {_stop_path(run, index, key).resolve()} ${start:x} ${end - start:x}")
        if index == 0:
            lines += first_lines
            lines.append(f"savebin {(run / 'first-6000.bin').resolve()} $6000 $2000")
        if index + 1 < stops:
            lines.append(f'b VBL = "VBL+1" :once :quiet :file {scripts[index + 1].resolve()}')
            lines.append("c")
        else:
            lines.append(f"screenshot {(run / 'final.png').resolve()}")
            lines.append("quit")
        script.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return scripts[0]


def live(roms: Path | None, case: str, settle: float, space_delay: float) -> int:
    snapshot_name, stops, intervention = CASES[case]
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    meta: dict[str, Any] = {
        "case": case,
        "recordedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "programSha256": validate_image(program, authority["programImage"], label="Working Authority STX")["hashes"]["sha256"],
        "tosSha256": validate_image(tos, authority["tosImage"], label="TOS image")["hashes"]["sha256"],
    }
    hatari, toolchain = discover_toolchain(config)
    meta["toolchain"] = toolchain.as_dict()
    run = WORK_ROOT / _run_id(f"noise-draw-{case}")
    run.mkdir(parents=True)
    first_lines: list[str] = []
    extra: list[str] = []
    if snapshot_name is not None:
        snapshot = LAB_ROOT / "snapshots" / snapshot_name
        meta["memstate"] = snapshot_name
        if intervention is not None:
            ram = hatari_memstate_ram(snapshot.read_bytes())
            writes = intervention(ram)
            meta["writes"] = [f"${a:06X}={v}" for a, v in writes]
            first_lines = [f"w ${a:x} " + " ".join(f"${v[i:i + 2]}" for i in range(0, len(v), 2)) for a, v in writes]
        entry = _write_chain(run, stops, first_lines)
        parse = run / "parse.txt"
        parse.write_text("c\n", encoding="utf-8")
        extra = ["--memstate", str(snapshot.resolve())]
    else:
        entry = _write_chain(run, stops, [])
        pc = config["checkpoints"]["title-screen"]["pc"]
        title_vbls = int(config["checkpoints"]["title-screen"].get("extraVbls", 1400))
        on_title = run / "on-title.txt"
        on_title.write_text(f'b VBL = "VBL+{title_vbls}" :once :quiet :file {entry.resolve()}\nc\n', encoding="utf-8")
        parse = run / "parse.txt"
        parse.write_text(f"b pc = ${pc:x} :once :quiet :file {on_title.resolve()}\nc\n", encoding="utf-8")
    fifo_path = run / "cmd.fifo"
    command = build_hatari_command(
        hatari_binary=hatari,
        tos=tos,
        disk_a=program,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse,
        fast_forward=snapshot_name is None and bool(config.get("fastForward", True)),
        statusbar=False,
        cmd_fifo=fifo_path,
        extra_args=extra,
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
                if snapshot_name is not None:
                    time.sleep(settle)
                    _check(process.poll() is None, "Hatari exited during restore; is the memstate rehosted?")
                    _fifo_send(fifo, [f'hatari-debug b VBL = "VBL+1" :once :quiet :file {entry.resolve()}'])
                seen, last, pressed = 0, time.monotonic(), snapshot_name is not None
                deadline = 300.0 if snapshot_name is None else 60.0
                while process.poll() is None:
                    while _read_stop(run, seen) is not None:
                        seen, last = seen + 1, time.monotonic()
                    if not pressed and seen > 0 and time.monotonic() - last >= 0:
                        time.sleep(space_delay)
                        _fifo_send(fifo, [f"hatari-event keypress {SPACE_SCANCODE}"])
                        pressed = True
                        meta["spacePressedAfterStop"] = seen
                    _check(time.monotonic() - last < deadline, f"the trace stalled after {seen} stops")
                    time.sleep(0.05)
        except BrokenPipeError:
            pass
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()
    (run / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"run: {run}")
    return analyse(run)


def _steps(a: int, b: int) -> int:
    """Words the pointer moved from ``a`` to ``b``, modulo the table."""
    return ((b - a) // 2) % TABLE_WORDS


def analyse(run: Path) -> int:
    meta = json.loads((run / "meta.json").read_text(encoding="utf-8"))
    trace = []
    while (s := _read_stop(run, len(trace))) is not None:
        trace.append(s)
    _check(len(trace) > 1, f"{run}: no stops")
    # The program's VBL handler, and its clock, start only as New Game loads: a
    # new-game trace is checked from the first stop the clock moves at.
    running = next((i for i, (a, b) in enumerate(zip(trace, trace[1:])) if (b["vbl"] - a["vbl"]) & 0xFFFF == 1), 0)
    for a, b in zip(trace[running:], trace[running + 1 :]):
        _check((b["vbl"] - a["vbl"]) & 0xFFFF == 1, f"stop {b['stop']}: VBL clock moved {(b['vbl'] - a['vbl']) & 0xFFFF}")
    rows = []
    for a, b in zip(trace, trace[1:]):
        frames = ((b["frames"] - a["frames"] + 0x8000) & 0xFFFF) - 0x8000  # New Game clears it
        moved = _steps(a["pointer"], b["pointer"])
        rows.append({"stop": b["stop"], "frames": frames, "moved": moved, "draws": moved - frames, **{k: b[k] for k in ("boarded", "geigerRate", "soundTicks", "debris", "frameVbls")}})
    counted = rows[running:]
    frames = sum(r["frames"] for r in counted)
    moved = sum(r["moved"] for r in counted)
    vbls = len(counted)
    draws = Counter(r["draws"] for r in counted)
    total, drift = 0, Counter()
    for r in counted:
        total += r["draws"]
        drift[total] += 1
    result: dict[str, Any] = {
        **meta,
        "stops": len(trace),
        "vbls": vbls,
        "frames": frames,
        "wordsMoved": moved,
        "vblsPerPass": round(vbls / frames, 3) if frames else None,
        "frameVbls": dict(sorted(Counter(r["frameVbls"] for r in counted if r["frames"]).items())),
        "drawsPerVbl": dict(sorted(draws.items())),
        "drift": dict(sorted(drift.items())),
        "firstPointer": f"${trace[0]['pointer']:06X}",
        "lastPointer": f"${trace[-1]['pointer']:06X}",
    }
    case = meta["case"]
    if case == "new-game":
        # The descent ($0511B2-$05121C) runs before the main loop, until the frame
        # counter reaches $259. It draws five words per streak respawned. The main loop
        # then runs the scripted arrival, a word a pass, until the walk flag is 1.
        seeded = next((i for i, s in enumerate(trace) if s["pointer"] == TABLE), None)
        _check(seeded is not None, "the seed $77000 was never seen")
        unwrapped = [0] * len(trace)
        for i in range(seeded + 1, len(trace)):
            unwrapped[i] = unwrapped[i - 1] + _steps(trace[i - 1]["pointer"], trace[i]["pointer"])
        descent_end = max(i for i in range(seeded, len(trace)) if trace[i]["frames"] <= DESCENT_FRAMES)
        result["seededAtStop"] = seeded
        result["descentEndStop"] = descent_end
        result["descentWords"] = unwrapped[descent_end]
        _check(result["descentWords"] % 5 == 0, f"the descent drew {result['descentWords']} words, not five a respawn")
        result["pointerAfterDescent"] = f"${trace[descent_end]['pointer']:06X}"
        # The arrival lands the ship itself and leaves the player aboard ($7A8E = 0)
        # at the port's start pose. Rest is the first stop the pose never moves from.
        rest = len(trace) - 1
        while rest > descent_end and trace[rest - 1]["pose"] == trace[-1]["pose"]:
            rest -= 1
        _check(len(trace) - rest >= 50, "the ship had not come to rest: run more stops")
        _check(trace[rest]["pose"] == START_POSE, f"the ship rests at {trace[rest]['pose']}, not the start pose")
        arrival = rows[descent_end:rest]
        result["restStop"] = rest
        result["restFrame"] = trace[rest]["frames"]
        result["arrivalVbls"] = rest - descent_end
        result["arrivalPasses"] = sum(r["frames"] for r in arrival)
        result["arrivalDraws"] = sum(r["draws"] for r in arrival)
        result["wordsAtRest"] = unwrapped[rest]
        result["pointerAtRest"] = f"${trace[rest]['pointer']:06X}"
        result["indexAtRest"] = (trace[rest]["pointer"] - TABLE) // 2
        result["boardedAtRest"] = trace[rest]["boarded"]
        # The pointer as a function of the frame counter, for comparing runs.
        (run / "by-frame.json").write_text(
            json.dumps({s["frames"]: s["pointer"] for s in trace[seeded:]}) + "\n", encoding="utf-8"
        )
    elif case == "geiger":
        # Two ticks a VBL ($051DAC and $05231E), a word each, while the rate is set
        # and $7A78 is zero. The rate is set by the first pass after the write.
        live = [r for r in counted if r["geigerRate"] and not r["soundTicks"]]
        ticks = sum(r["draws"] for r in live)
        result["geiger"] = {"vbls": len(live), "draws": ticks, "rate": sorted({r["geigerRate"] for r in live})}
        _check(abs(ticks - 2 * len(live)) <= 2, f"geiger: {ticks} draws in {len(live)} VBLs, not two a VBL")
    elif case == "explosive":
        # One spray of $783E = 64 particles, three words each, in the blast's pass.
        sprays = [r for r in counted if r["draws"] >= 3]
        result["sprays"] = [{"stop": r["stop"], "draws": r["draws"], "debris": r["debris"]} for r in sprays]
        _check([r["draws"] for r in sprays] == [192], f"explosive: sprays {result['sprays']}")
        _check(total - sprays[0]["draws"] in (-1, 0, 1), f"explosive: {total} words off the pass count")
    elif meta.get("writes") is None:
        # The frame counter ($0599A0) and the step ($05948C) sit at different points of
        # the pass, so a VBL can fall between them: the running difference is 0 or +-1.
        _check(set(result["drift"]) <= {-1, 0, 1}, f"{case}: the pointer moved off the pass count: {result['drift']}")
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    (run / "rows.json").write_text(json.dumps(rows) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "toolchain"}, indent=2))
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
    l.add_argument("--space-delay", type=float, default=0.5)
    a = sub.add_parser("analyse")
    a.add_argument("--trace", type=Path, required=True)
    arguments = parser.parse_args()
    try:
        if arguments.command == "decode":
            return decode(arguments.run, arguments.memstates)
        if arguments.command == "live":
            return live(arguments.roms, arguments.case, arguments.settle, arguments.space_delay)
        return analyse(arguments.trace)
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
