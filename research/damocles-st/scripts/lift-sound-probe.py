#!/usr/bin/env python3
"""Damocles Lift ride sound probe (#508).

Every earlier probe ran Hatari with ``--sound off``, so nothing the Working
Authority plays was ever heard. The static decode of the sound routines says a
ride on the Eris lift sounds like this (YM2149 at 2 MHz, one write per VBL):

* door start (``$04C37A``, then ``$04C3EA`` per VBL): channel C, tone and noise
  both enabled, noise period 0, tone period alternating $3E8/$41A (about
  125/119 Hz), fixed volumes 10,11,13,13,11,10,9,8,7,6,5 then 9,8,7,6,5 looping
  until the door stops;
* door stop (``$04C2B8``, then ``$04C328``): channel C noise only, noise period
  $1F, volumes 12,8,4,0 on four VBLs;
* silence while the Floor Label steps (25 VBLs per Floor);
* arrival (``$04C556``): channel B tone period $60 (about 1302 Hz), envelope
  period $1F00, shape 9: one decay of about 1.016 s;
* then the door-open start tone and its stop burst.

This probe records what Hatari actually plays and measures it.

``record`` boots the rehosted ``eris-lift`` memstate with sound on, starts
Hatari's WAV capture over the command FIFO (``hatari-shortcut recsound``),
waits, presses each ride key with ``hatari-event`` (key up about 0.12 s
later), records for a fixed time after each key, stops the capture, quits
Hatari cleanly (``--confirm-quit false``), and folds the capture to a mono 48 kHz WAV with sox. It then
runs the analysis and writes ``result.json`` next to the WAVs. The capture
file is named by ``szYMCaptureFileName`` in a ``--configfile``. The lab's
``--sound off`` is replaced by default; Hatari 2.6.1 also lets a later
``--sound`` win (``--append-sound-args`` shows it). ``SDL_AUDIODRIVER=dummy``
still yields a full WAV, because the emulation fills it.

The display rate is the machine's, not the program's (#305,
docs/research/damocles-display-rate.md): Damocles never programs the Shifter,
and the lab's EmuTOS country leaves ``$FFFF820A`` at $00, 60.04 Hz. ``--pal``
(the default) writes $02 there from the debugger once the restore settles, as
display-mode-probe.py's ``sync-poke`` case does, for the 50.05 Hz of the PAL
ST the UK release was sold for; ``--ntsc`` keeps 60 Hz. ``VBL``,
``CycleCounter`` and ``FrameCycles`` are read before and after the poke, and
the measured cycles per field (160256 or 133604) set the analysis grid.

``analyse`` reads a mono WAV. It cuts the file into 20 ms frames only to find
the sounds; each sound is then re-framed on a VBL grid anchored at its first
sample (``--vbl-hz``, default 50.05 Hz), and the door tone's 5-VBL volume-loop
restarts are timed to check it. Per VBL it reports the AC RMS, the RMS in a low band (60-400 Hz),
the arrival band (1250-1360 Hz) and above 2 kHz, a 250 Hz low-passed
zero-crossing fundamental, and what is audible: ``arrival`` (the arrival band
stands 3x above its neighbours), ``buzz`` (a 100-150 Hz fundamental),
``noise`` (low-band energy without one) or ``other``. Per part it gives
long-window spectral peaks, the power fraction on the harmonics of the
strongest low peak, and the fraction above 5 kHz (a bare 125 Hz square puts
about 1% there). The arrival band is also sampled every 50 ms.

``decode`` reads the pinned first-world RAM without Hatari. It hashes the
driver windows the note quotes, checks the tables and the register writes the
decode above rests on byte for byte, and raises if any differs.

Run from the repository root:

  research/damocles-st/.venv/bin/python research/damocles-st/scripts/lift-sound-probe.py decode
  research/damocles-st/.venv/bin/python research/damocles-st/scripts/lift-sound-probe.py record --roms roms
  research/damocles-st/.venv/bin/python research/damocles-st/scripts/lift-sound-probe.py analyse <mono.wav>

What this establishes: the audible output of Hatari 2.6.1's YM emulation for
this program's writes, on the emulated timeline (the WAV is filled by the
emulation, not by the host audio device). What it does not establish: the
analogue output of a real ST (Hatari's mixing model is an approximation;
``--ym-mixing`` is recorded), or which channel produced a sound; a mixed WAV
only shows frequency, level and timing. Host timing decides only which VBL a
key lands on.

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import cmath
import hashlib
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import wave
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError, file_hash, format_hatari_key, validate_image  # noqa: E402
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
SNAPSHOT = "rehosted/eris-lift.sav"
SCANCODES = {"1": 0x02, "2": 0x03, "b": 0x30, "g": 0x22}
FLOORS = {"1": 1, "2": 2, "b": 10, "g": 0}

RATE = 48000
FRAME_SECONDS = 0.020  # coarse segmentation frames; profiles use a VBL grid (VBL_HZ)
YM_CLOCK = 2_000_000
EXPECTED = {
    "doorToneHz": [YM_CLOCK / (16 * 0x3E8), YM_CLOCK / (16 * 0x41A)],
    "arrivalToneHz": YM_CLOCK / (16 * 0x60),
    "arrivalDecaySeconds": 256 * 0x1F00 / YM_CLOCK,
    "doorStartVolumes": [10, 11, 13, 13, 11, 10, 9, 8, 7, 6, 5, "then 9,8,7,6,5 looping"],
    "doorStopVolumes": [12, 8, 4, 0],
    "labelStepVbls": 25,
}


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


# --- decode ----------------------------------------------------------------

FIRST_WORLD = WORK_ROOT / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"
FIRST_WORLD_SHA256 = "b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967"

# The driver windows docs/research/damocles-lift-ride.md#what-the-programmes-play quotes.
DRIVER_WINDOWS = {
    "vector-calls": (0x051DFE, 0x051E1E),
    "tick-holdoff": (0x051D24, 0x051D74),
    "idle-rts": (0x051E86, 0x051E88),
    "restore-and-idle": (0x04C220, 0x04C2B8),
    "door-stop-sound": (0x04C2B8, 0x04C37A),
    "door-start-sound": (0x04C37A, 0x04C43C),
    "door-tables": (0x04C43C, 0x04C470),
    "sound-effect": (0x04C556, 0x04C5A8),
    "effect-tail": (0x04C5EC, 0x04C610),
    "table-walks": (0x04C722, 0x04C75C),
}

# Bytes the presenter's programmes are transcribed from.
DRIVER_FACTS = {
    0x051E0E: ("20790004bf544e9020790004bf584e90", "call $04BF54, then $04BF58"),
    0x051E86: ("4e75", "the idle vector is a bare rts"),
    0x04C37A: ("3e3c0400", "door tone: period $400"),
    0x04C39A: ("0207ffdb", "door tone: channel C tone and noise on"),
    0x04C3B0: ("11fc000a880011fc000f8802", "door tone: C level 15"),
    0x04C3EA: ("11fc0006880011fc00008802", "door tone step: noise period 0"),
    0x04C2B8: ("3e3c0400", "burst: period $400"),
    0x04C2D4: ("11fc0006880011fc001f8802", "burst: noise period $1F"),
    0x04C2E4: ("0207ffdf00070004", "burst: channel C noise on, tone off"),
    0x04C36E: ("23fc0004c2200004bf58", "burst end: re-arm $04C220"),
    0x04C43C: ("000103e80001041a80000004c43c", "door periods: $3E8, $41A, loop"),
    0x04C44A: ("010a010b010d010d010b010a0109010801070106010580000004c456", "door tone levels, loop to $04C456"),
    0x04C466: ("010c0108010401000000", "burst levels, end"),
    0x04C556: ("31fc000f7a78", "effect: $7A78 <- 15"),
    0x04C55C: ("11fc000b880011fc1f00880211fc000c880011fc001f8802", "effect: envelope period $1F00"),
    0x04C574: ("11fc0002880011fc0060880211fc0003880011fc00008802", "effect: tone B period $060"),
    0x04C590: ("0207fffd00070010", "effect: channel B tone on, noise off"),
    0x04C5EC: ("11fc0009880011fc001f880211fc000d880011fc00098802", "tail: B level envelope, shape 9"),
    0x04C604: ("23fc00051e860004bf54", "tail: disarm"),
    0x054870: ("11fc000a7c0611fc000a880011fc00008802", "request: C level 0 at once"),
}


def decode() -> int:
    _check(FIRST_WORLD.is_file(), f"pinned first-world RAM not found: {FIRST_WORLD}")
    ram = FIRST_WORLD.read_bytes()
    _check(hashlib.sha256(ram).hexdigest() == FIRST_WORLD_SHA256, "first-world RAM hash")
    for address, (hexbytes, meaning) in DRIVER_FACTS.items():
        found = ram[address : address + len(hexbytes) // 2].hex()
        _check(found == hexbytes, f"${address:06X} ({meaning}): {found} != {hexbytes}")
    windows = {
        name: {"range": f"${start:06X}-${end - 1:06X}", "sha256": hashlib.sha256(ram[start:end]).hexdigest()}
        for name, (start, end) in DRIVER_WINDOWS.items()
    }
    print(json.dumps({"windows": windows, "driverFacts": len(DRIVER_FACTS)}, indent=2))
    return 0


# --- record ----------------------------------------------------------------


def _sound_command(base: list[str], freq: int, mixing: str, config_file: Path, replace: bool) -> list[str]:
    """Turn the lab's ``--sound off`` command into a sound-on one.

    ``replace`` swaps the pair in place; otherwise the sound options are only
    appended, to test whether Hatari lets a later ``--sound`` win.
    """
    command = list(base)
    extra = ["--configfile", str(config_file.resolve()), "--sound", str(freq), "--ym-mixing", mixing, "--confirm-quit", "false"]
    if replace:
        i = command.index("--sound")
        _check(command[i + 1] == "off", "build_hatari_command no longer passes --sound off")
        del command[i : i + 2]
    return command + extra


SYNC_MODE = 0xFFFF820A
_VALUE = re.compile(r"^= .*#(-?\d+)")


def _counters(fifo, run: Path, index: int) -> None:
    """Print VBL, CycleCounter and FrameCycles into Hatari's output, and save the sync-mode byte."""
    _fifo_send(
        fifo,
        [
            "hatari-stop",
            "hatari-debug setopt hex",
            "hatari-debug e VBL",
            "hatari-debug e CycleCounter",
            "hatari-debug e FrameCycles",
            f"hatari-debug savebin {(run / f'sync-{index}.bin').resolve()} ${SYNC_MODE & 0xFFFFFF:x} 1",
            "hatari-cont",
        ],
    )
    time.sleep(0.4)


def _field_rate(run: Path, count: int) -> dict[str, Any]:
    """Cycles per field between counter samples, whole fields only (as display-mode-probe.py)."""
    numbers = [int(m.group(1)) for m in (_VALUE.match(line) for line in (run / "hatari.log").read_text(errors="replace").splitlines()) if m]
    _check(len(numbers) >= 3 * count, f"expected {3 * count} counter reads, parsed {len(numbers)}")
    marks = [
        {
            "vbl": numbers[3 * i],
            "cycles": numbers[3 * i + 1] & 0xFFFFFFFF,
            "frameCycles": numbers[3 * i + 2],
            "syncMode": (run / f"sync-{i}.bin").read_bytes()[0] if (run / f"sync-{i}.bin").is_file() else None,
        }
        for i in range(count)
    ]
    spans = []
    for a, b in zip(marks, marks[1:]):
        fields = b["vbl"] - a["vbl"]
        cycles = ((b["cycles"] - b["frameCycles"]) - (a["cycles"] - a["frameCycles"])) % (1 << 32)
        spans.append({"fields": fields, "cycles": cycles, "cyclesPerField": cycles / fields if fields else None})
    return {"marks": marks, "spans": spans}


def _tool_version(argv: list[str]) -> str:
    try:
        out = subprocess.run(argv, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as failure:
        return f"unavailable: {failure}"
    return (out.stdout or out.stderr).strip().splitlines()[0] if (out.stdout or out.stderr).strip() else ""


def record(
    roms: Path | None,
    keys: list[str],
    lead: float,
    after_key: float,
    settle: float,
    freq: int,
    mixing: str,
    replace: bool,
    pal: bool,
) -> int:
    for key in keys:
        _check(key in SCANCODES, f"unknown ride key {key!r}")
    run = WORK_ROOT / _run_id("lift-sound-eris")
    run.mkdir(parents=True)
    snapshot = SNAPSHOTS / SNAPSHOT
    _check(snapshot.is_file(), f"snapshot not found: {snapshot}")
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
    meta["sox"] = _tool_version([sox, "--version"])

    capture = run / "capture.wav"
    config_file = run / "sound.cfg"
    config_file.write_text(f"[Sound]\nszYMCaptureFileName = {capture.resolve()}\n", encoding="utf-8")
    fifo_path = run / "cmd.fifo"
    parse = run / "parse.txt"
    parse.write_text("c\n", encoding="utf-8")
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
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    command = _sound_command(base, freq, mixing, config_file, replace)
    env = os.environ.copy()
    env.update(headless_env())
    events: list[dict[str, Any]] = []
    t0 = time.monotonic()

    def mark(what: str, **extra: Any) -> None:
        events.append({"hostSeconds": round(time.monotonic() - t0, 3), "event": what, **extra})

    error = None
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
                # Sample the field rate as restored, set PAL if asked, sample it twice more.
                _counters(fifo, run, 0)
                time.sleep(0.6)
                _counters(fifo, run, 1)
                if pal:
                    _fifo_send(fifo, ["hatari-stop", f"hatari-debug w ${SYNC_MODE & 0xFFFFFF:x} 02", "hatari-cont"])
                    mark("sync mode $02 poked")
                    time.sleep(0.5)
                _counters(fifo, run, 2)
                time.sleep(1.0)
                _counters(fifo, run, 3)
                _fifo_send(fifo, ["hatari-shortcut recsound"])
                mark("recsound on")
                time.sleep(lead)
                for key in keys:
                    code = format_hatari_key(SCANCODES[key])
                    _fifo_send(fifo, [f"hatari-event keydown {code}"])
                    mark("keydown", key=key)
                    time.sleep(0.12)
                    _fifo_send(fifo, [f"hatari-event keyup {code}"])
                    mark("keyup", key=key)
                    time.sleep(after_key)
                    _check(process.poll() is None, f"Hatari exited during the ride for key {key}")
                _fifo_send(fifo, ["hatari-shortcut recsound"])
                mark("recsound off")
                time.sleep(1.0)
                _fifo_send(fifo, ["hatari-shortcut quit"])
                mark("quit sent")
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    pass
        except BrokenPipeError:
            pass
        except LabError as failure:
            error = str(failure)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
                mark("killed")
            else:
                mark("exited", status=process.returncode)
            if fifo_path.exists():
                fifo_path.unlink()

    wavs: dict[str, Any] = {}
    analysis = None
    mono = run / "lift-ride-mono-48k.wav"
    field_rate = None
    if error is None:
        try:
            field_rate = _field_rate(run, 4)
        except LabError as failure:
            error = str(failure)
    vbl_hz = PAL_HZ if pal else NTSC_HZ
    if field_rate and field_rate["spans"][-1]["cyclesPerField"]:
        measured = field_rate["spans"][-1]["cyclesPerField"]
        vbl_hz = CPU_HZ / measured
        if measured not in (PAL_CYCLES, NTSC_CYCLES):
            error = f"{measured} cycles per field is neither 50 nor 60 Hz"
        elif pal and measured != PAL_CYCLES:
            error = f"the sync-mode poke did not take: {measured} cycles per field"
    if error is None:
        _check(capture.is_file() and capture.stat().st_size > 44, f"no WAV capture at {capture}")
        with wave.open(str(capture)) as w:
            wavs["capture"] = {
                "path": str(capture),
                "channels": w.getnchannels(),
                "rate": w.getframerate(),
                "sampleWidth": w.getsampwidth(),
                "seconds": round(w.getnframes() / w.getframerate(), 3),
                "sha256": file_hash(capture),
            }
        sox_argv = [sox, str(capture), "-c", "1", "-r", str(RATE), "-b", "16", str(mono)]
        subprocess.run(sox_argv, check=True)
        meta["soxCommand"] = sox_argv
        wavs["mono"] = {"path": str(mono), "sha256": file_hash(mono)}
        try:
            analysis = analyse(mono, vbl_hz)
        except LabError as failure:
            error = str(failure)
    result = {
        "schemaVersion": 1,
        "case": "eris",
        "keys": keys,
        "floors": [FLOORS[k] for k in keys],
        "hostEvents": events,
        "options": {
            "leadSeconds": lead,
            "afterKeySeconds": after_key,
            "settleSeconds": settle,
            "soundFrequency": freq,
            "ymMixing": mixing,
            "soundArgs": "replaced --sound off" if replace else "appended after --sound off",
            "sdlAudioDriver": env.get("SDL_AUDIODRIVER"),
            "fastForward": False,
            "display": "pal: $FFFF820A <- $02 after the restore" if pal else "ntsc: as restored",
        },
        "command": command,
        "wavs": wavs,
        "fieldRate": field_rate,
        "vblHz": vbl_hz,
        "expected": EXPECTED,
        "analysis": analysis,
        "error": error,
        "meta": meta,
        "snapshot": SNAPSHOT,
        "snapshotSha256": file_hash(snapshot),
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"run": str(run), "wavs": wavs, "error": error}, indent=1))
    if analysis:
        print_report(analysis)
    if error:
        raise LabError(error)
    return 0


# --- analyse ---------------------------------------------------------------


def read_mono(path: Path) -> tuple[list[float], int]:
    with wave.open(str(path)) as w:
        _check(w.getsampwidth() == 2, "expected 16-bit samples")
        channels, rate, n = w.getnchannels(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    values = struct.unpack(f"<{n * channels}h", raw)
    if channels > 1:
        values = [sum(values[i : i + channels]) / channels for i in range(0, len(values), channels)]
    return [v / 32768.0 for v in values], rate


def fft(x: list[complex]) -> list[complex]:
    n = len(x)
    a = list(x)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    size = 2
    while size <= n:
        w = cmath.exp(-2j * math.pi / size)
        half = size // 2
        for start in range(0, n, size):
            wk = 1 + 0j
            for k in range(start, start + half):
                t = wk * a[k + half]
                a[k + half] = a[k] - t
                a[k] = a[k] + t
                wk *= w
        size *= 2
    return a


def power_spectrum(samples: list[float], size: int) -> list[float]:
    n = len(samples)
    mean = sum(samples) / n if n else 0.0
    window = [(samples[i] - mean) * (0.5 - 0.5 * math.cos(2 * math.pi * i / max(n - 1, 1))) for i in range(n)]
    spec = fft([complex(v) for v in window] + [0j] * (size - n))
    return [abs(c) ** 2 for c in spec[: size // 2]]


def lowpass(samples: list[float], rate: int, cutoff: float) -> list[float]:
    """Second-order Butterworth biquad, run forward then backward (zero phase)."""
    w0 = 2 * math.pi * cutoff / rate
    alpha = math.sin(w0) / math.sqrt(2)
    cos = math.cos(w0)
    b0, b1, b2 = (1 - cos) / 2, 1 - cos, (1 - cos) / 2
    a0, a1, a2 = 1 + alpha, -2 * cos, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0

    def run(x: list[float]) -> list[float]:
        y = [0.0] * len(x)
        x1 = x2 = y1 = y2 = 0.0
        for i, v in enumerate(x):
            out = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1, y2, y1 = x1, v, y1, out
            y[i] = out
        return y

    return run(run(samples)[::-1])[::-1]


def crossings_hz(lp: list[float], rate: int) -> float | None:
    """Fundamental from the mean interval between rising zero crossings."""
    mean = sum(lp) / len(lp)
    rises = []
    for i in range(1, len(lp)):
        a, b = lp[i - 1] - mean, lp[i] - mean
        if a < 0 <= b:
            rises.append(i - 1 + (-a) / (b - a))
    if len(rises) < 2:
        return None
    return rate * (len(rises) - 1) / (rises[-1] - rises[0])


def db(value: float) -> float:
    return round(20 * math.log10(value), 1) if value > 0 else -200.0


# Field rates of Hatari's ST (docs/research/damocles-display-rate.md, #305):
# 512 x 313 cycles per field at 50 Hz, 508 x 263 at 60 Hz, 8.021247 MHz CPU.
# ``loop_period`` measures the rate from the door tone as a cross-check.
CPU_HZ = 8021247
PAL_CYCLES = 512 * 313
NTSC_CYCLES = 508 * 263
PAL_HZ = CPU_HZ / PAL_CYCLES
NTSC_HZ = CPU_HZ / NTSC_CYCLES
VBL_HZ = PAL_HZ


def loop_period(samples: list[float], rate: int, start: float, end: float) -> dict[str, Any] | None:
    """Times of the door-start tone's volume-loop restarts (the jump from the loop's last, quietest
    step back up to its first), from an 8 ms RMS window slid every 0.5 ms."""
    width, step = int(0.008 * rate), int(0.0005 * rate)
    a, b = int(start * rate), int(end * rate)
    levels = []
    for i in range(a, b - width, step):
        c = samples[i : i + width]
        m = sum(c) / width
        levels.append((i, 10 * math.log10(max(1e-12, sum((v - m) ** 2 for v in c) / width))))
    lag = width // step
    jumps: list[int] = []
    for k in range(lag, len(levels)):
        if levels[k][1] - levels[k - lag][1] > 8 and (not jumps or levels[k][0] - jumps[-1] > 0.03 * rate):
            jumps.append(levels[k][0])
    if len(jumps) < 2:
        return None
    gaps = [(y - x) / rate * 1000 for x, y in zip(jumps, jumps[1:])]
    mean = sum(gaps) / len(gaps)
    return {"restartsS": [round(j / rate, 4) for j in jumps], "intervalsMs": [round(g, 1) for g in gaps], "vblHzIfFiveVbls": round(5000 / mean, 2)}


def band_rms(spec: list[float], rate: int, size: int, n: int, lo: float, hi: float) -> float:
    """RMS of the signal between lo and hi Hz, from a Hann-windowed power spectrum of n samples."""
    bin_hz = rate / size
    power = sum(spec[max(1, int(lo / bin_hz)) : int(hi / bin_hz) + 1])
    return math.sqrt(2 * power / (n * n * 0.375))


def measure(samples: list[float], lp: list[float], rate: int, a: int, b: int) -> dict[str, Any]:
    chunk = samples[a:b]
    n = len(chunk)
    mean = sum(chunk) / n
    rms = math.sqrt(sum((v - mean) ** 2 for v in chunk) / n)
    size = 1 << (n - 1).bit_length()
    spec = power_spectrum(chunk, size)
    return {
        "rms": rms,
        "dc": mean,
        "f0": crossings_hz(lp[a:b], rate),
        "lowRms": band_rms(spec, rate, size, n, 60, 400),
        "arrivalRms": band_rms(spec, rate, size, n, 1250, 1360),
        "besideRms": math.sqrt(
            band_rms(spec, rate, size, n, 900, 1150) ** 2 + band_rms(spec, rate, size, n, 1450, 1700) ** 2
        ),
        "highRms": band_rms(spec, rate, size, n, 2000, rate / 2),
    }


def flags(m: dict[str, Any], floor: float) -> list[str]:
    """What is audible in one frame: the arrival tone, the door buzz, noise."""
    if m["rms"] < floor:
        return []
    found = []
    if m["arrivalRms"] > floor and m["arrivalRms"] > 3 * m["besideRms"]:
        found.append("arrival")
    f0 = m["f0"]
    if f0 is not None and 100 <= f0 <= 150 and m["lowRms"] > 3 * floor:
        found.append("buzz")
    elif m["lowRms"] > 3 * floor and not ("arrival" in found and m["lowRms"] < 0.05 * m["arrivalRms"]):
        found.append("noise")
    return found or ["other"]


def frame_table(samples: list[float], lp: list[float], rate: int, start: float, hop: float, count: int | None = None) -> list[dict[str, Any]]:
    frames = []
    k = 0
    while count is None or k < count:
        a = int(round(start + k * hop))
        b = int(round(start + (k + 1) * hop))
        if b > len(samples):
            break
        m = measure(samples, lp, rate, a, b)
        m["t"] = round(a / rate, 4)
        frames.append(m)
        k += 1
    return frames


def dominant(samples: list[float], rate: int, start: float, end: float, count: int = 3) -> dict[str, Any]:
    """Long-window peaks, and how much of the power sits on the harmonics of the strongest peak."""
    a, b = int(start * rate), int(end * rate)
    chunk = samples[a:b][: 1 << 16]
    if len(chunk) < 256:
        return {"peaks": []}
    size = max(1 << 15, 1 << (len(chunk) - 1).bit_length())
    spec = power_spectrum(chunk, size)
    total = sum(spec[1:]) or 1e-30
    bin_hz = rate / size
    peaks = [k for k in range(2, len(spec) - 1) if spec[k] >= spec[k - 1] and spec[k] > spec[k + 1] and k * bin_hz >= 30]
    peaks.sort(key=spec.__getitem__, reverse=True)
    out: dict[str, Any] = {
        "peaks": [{"hz": round(k * bin_hz, 1), "fraction": round(spec[k] / total, 4)} for k in peaks[:count]],
        # A bare 125 Hz square puts about 1% of its power above 5 kHz; broadband noise far more.
        "above5kFraction": round(sum(spec[int(5000 / bin_hz) :]) / total, 3),
    }
    if peaks:
        # Harmonic power within +-6 Hz of multiples of each strong low peak (the door tone has two pitches).
        bases = [k * bin_hz for k in peaks[:count] if k * bin_hz < 200] if peaks[0] * bin_hz < 200 else [peaks[0] * bin_hz]
        near = set()
        for f in bases:
            h = f
            while h < rate / 2:
                c = int(round(h / bin_hz))
                near.update(range(max(1, c - int(6 / bin_hz)), c + int(6 / bin_hz) + 1))
                h += f
        out["harmonicFraction"] = round(sum(spec[k] for k in near if k < len(spec)) / total, 3)
        out["harmonicBasesHz"] = [round(f, 1) for f in bases]
    return out


def onset_sample(samples: list[float], rate: int, frame_start: int, threshold: float) -> int:
    """First sample, from one frame before the first loud frame, that leaves the quiet baseline."""
    hop = int(rate * FRAME_SECONDS)
    a = max(0, frame_start - hop)
    base = sum(samples[max(0, a - 480) : a]) / max(1, min(480, a)) if a else samples[0]
    for i in range(a, min(len(samples), frame_start + 2 * hop)):
        if abs(samples[i] - base) > threshold:
            return i
    return frame_start


def step_edge(samples: list[float], rate: int, a: int, b: int, rise_db: float = 10.0) -> int | None:
    """The last sharp level step: 2 ms after it at least ``rise_db`` above the 8 ms before it."""
    before, after, hop = int(0.008 * rate), int(0.002 * rate), int(0.00025 * rate)

    def level(i: int, n: int) -> float:
        c = samples[i : i + n]
        m = sum(c) / n
        return 10 * math.log10(max(1e-12, sum((v - m) ** 2 for v in c) / n))

    # The last step: in a door sound that is the stop burst, whose noise has no
    # silent half-period to delay it (a loop restart's tone can start up to 4 ms late).
    last = None
    i = max(a, before)
    while i < b - after:
        if level(i, after) - level(i - before, before) > rise_db:
            last = i
            i += int(0.010 * rate)
        else:
            i += hop
    if last is None:
        return None
    i = last
    # Refine to the sample: the first one that leaves the preceding 8 ms envelope.
    ref = max(abs(v) for v in samples[i - before : i])
    for j in range(i - hop, i + after):
        if abs(samples[j]) > 2 * ref + 1e-4:
            return j
    return i


def label(fl: list[str]) -> str:
    return "+".join(fl) if fl else "silent"


def analyse(path: Path, vbl_hz: float = VBL_HZ) -> dict[str, Any]:
    samples, rate = read_mono(path)
    _check(rate == RATE, f"expected {RATE} Hz, found {rate}")
    lp = lowpass(samples, rate, 250.0)
    hop = rate * FRAME_SECONDS
    frames = frame_table(samples, lp, rate, 0, hop)
    _check(frames, "the WAV is empty")
    peak_rms = max(f["rms"] for f in frames)
    _check(peak_rms > 1e-4, f"the WAV is silent (peak frame RMS {peak_rms:.2e})")
    floor = max(peak_rms * 10 ** (-50 / 20), 3e-5)
    for f in frames:
        f["flags"] = flags(f, floor)

    # Sounds: stretches of non-silent frames, bridging single silent frames.
    sounds: list[tuple[int, int]] = []
    i = 0
    while i < len(frames):
        if not frames[i]["flags"]:
            i += 1
            continue
        j = i
        while j < len(frames) and (frames[j]["flags"] or (j + 1 < len(frames) and frames[j + 1]["flags"])):
            j += 1
        sounds.append((i, j))
        i = j

    def row(k: int, f: dict[str, Any]) -> dict[str, Any]:
        return {
            "vbl": k,
            "t": f["t"],
            "rmsDb": db(f["rms"]),
            "lowDb": db(f["lowRms"]),
            "arrivalDb": db(f["arrivalRms"]),
            "highDb": db(f["highRms"]),
            "f0": round(f["f0"], 1) if f["f0"] else None,
            "dc": round(f["dc"], 4),
            "what": label(f["flags"]),
        }

    events = []
    for a, b in sounds:
        onset = onset_sample(samples, rate, int(round(a * hop)), floor * 2)
        # Re-frame the sound on a VBL grid anchored at its first sample. A door
        # tone can start on the silent half of its square wave, so its first
        # audible sample lags the VBL by up to half a period; when the sound has
        # a sharp step (the stop burst's volume 12), the grid is phased to it.
        period = rate / vbl_hz
        anchor = onset
        edge = step_edge(samples, rate, onset + int(0.05 * rate), int(round(b * hop)))
        if edge is not None:
            anchor = edge - round((edge - onset) / period) * period
            # Onset detection can be a few samples late or early, never a VBL.
            if anchor > onset + 0.003 * rate:
                anchor -= period
        count = int(math.ceil((b * hop - anchor) / period)) + 2
        grid = frame_table(samples, lp, rate, anchor, period, count)
        for f in grid:
            f["flags"] = flags(f, floor)
        rows = [row(k, f) for k, f in enumerate(grid)]
        seq: list[list[Any]] = []
        for r in rows:
            if seq and seq[-1][0] == r["what"]:
                seq[-1][1] += 1
            else:
                seq.append([r["what"], 1])

        def span(name: str) -> tuple[int, int] | None:
            ks = [r["vbl"] for r in rows if name in r["what"].split("+")]
            return (ks[0], ks[-1] + 1) if ks else None

        parts = {}
        for name in ("buzz", "noise", "arrival", "other"):
            s = span(name)
            if s is None:
                continue
            t0, t1 = anchor / rate + s[0] / vbl_hz, anchor / rate + s[1] / vbl_hz
            parts[name] = {"fromVbl": s[0], "toVbl": s[1], "vbls": sum(1 for r in rows[s[0] : s[1]] if name in r["what"]), "spectrum": dominant(samples, rate, t0, t1)}
        buzz = parts.get("buzz")
        if buzz:
            f0s = [(r["vbl"], r["f0"]) for r in rows if r["what"].endswith("buzz") and r["f0"]]
            even = [f for k, f in f0s if k % 2 == 0]
            odd = [f for k, f in f0s if k % 2 == 1]
            if even and odd:
                buzz["meanF0EvenOddVbls"] = [round(sum(even) / len(even), 1), round(sum(odd) / len(odd), 1)]
        loop = None
        if buzz and buzz["fromVbl"] == 0 and buzz["toVbl"] >= 25:
            loop = loop_period(samples, rate, anchor / rate + 8 / vbl_hz, anchor / rate + buzz["toVbl"] / vbl_hz)
        events.append(
            {
                "onset": round(onset / rate, 4),
                "gridStart": round(anchor / rate, 4),
                "gridPhasedToStepAt": round(edge / rate, 4) if edge is not None else None,
                "doorLoop": loop,
                "end": round(b * FRAME_SECONDS, 3),
                "seconds": round(b * FRAME_SECONDS - onset / rate, 3),
                "peakRmsDb": max(r["rmsDb"] for r in rows),
                "sequence": seq,
                "parts": parts,
                "vbls": rows,
            }
        )

    gaps = [
        {"after": events[k]["end"], "before": events[k + 1]["onset"], "seconds": round(events[k + 1]["onset"] - events[k]["end"], 3)}
        for k in range(len(events) - 1)
    ]

    # The arrival band every 50 ms from each arrival's first arrival frame.
    arrivals = []
    for e in events:
        part = e["parts"].get("arrival")
        if not part:
            continue
        start = int(round((e["gridStart"] + part["fromVbl"] / vbl_hz) * rate))
        env = []
        for step in range(26):
            a = start + int(step * 0.05 * rate)
            m = measure(samples, lp, rate, a, a + int(0.02 * rate))
            env.append({"ms": step * 50, "arrivalDb": db(m["arrivalRms"])})
        top = env[0]["arrivalDb"]
        arrivals.append(
            {
                "t": round(start / rate, 4),
                "vbls": part["vbls"],
                "seconds": round(part["vbls"] / vbl_hz, 3),
                "msToMinus40Db": next((x["ms"] for x in env if x["arrivalDb"] < top - 40), None),
                "envelope": env,
            }
        )

    first = events[0]["onset"] if events else len(samples) / rate
    lead = [f for f in frames if f["t"] + FRAME_SECONDS <= first]
    return {
        "wav": str(path),
        "sha256": file_hash(path),
        "seconds": round(len(samples) / rate, 3),
        "rate": rate,
        "vblHz": vbl_hz,
        "peakFrameRmsDb": db(peak_rms),
        "silenceFloorDb": db(floor),
        "leadInMaxRmsDb": db(max((f["rms"] for f in lead), default=0.0)),
        "silentFramesMaxRmsDb": db(max((f["rms"] for f in frames if not f["flags"]), default=0.0)),
        "events": events,
        "gaps": gaps,
        "arrivals": arrivals,
        "otherFrames": [row(k, f) for k, f in enumerate(frames) if f["flags"] == ["other"]][:40],
    }


def print_report(analysis: dict[str, Any], full: bool = False) -> None:
    print(
        f"{analysis['wav']}: {analysis['seconds']} s, peak {analysis['peakFrameRmsDb']} dBFS, floor {analysis['silenceFloorDb']}, "
        f"lead-in max {analysis['leadInMaxRmsDb']}, silent frames max {analysis['silentFramesMaxRmsDb']}"
    )
    for e in analysis["events"]:
        print(f"event onset {e['onset']:.4f}s for {e['seconds']}s, peak {e['peakRmsDb']} dB; VBL grid from {e['gridStart']} (step at {e['gridPhasedToStepAt']})")
        print(f"  sequence (per VBL) {e['sequence']}")
        if e.get("doorLoop"):
            print(f"  door volume loop {e['doorLoop']}")
        for name, p in e["parts"].items():
            extra = f" f0 even/odd VBLs {p['meanF0EvenOddVbls']}" if "meanF0EvenOddVbls" in p else ""
            print(f"  {name}: VBL {p['fromVbl']}..{p['toVbl']} ({p['vbls']} VBLs){extra} {p['spectrum']}")
        rows = e["vbls"] if full else e["vbls"][:40]
        print("  vbl rmsDb lowDb arrDb highDb f0 dc what")
        for r in rows:
            print(f"  {r['vbl']:3d} {r['rmsDb']:6.1f} {r['lowDb']:6.1f} {r['arrivalDb']:6.1f} {r['highDb']:6.1f} {r['f0']} {r['dc']} {r['what']}")
    for g in analysis["gaps"]:
        print(f"gap {g['after']} -> {g['before']}: {g['seconds']} s")
    for a in analysis["arrivals"]:
        print(f"arrival at {a['t']}: {a['vbls']} VBLs ({a['seconds']} s); -40 dB after {a['msToMinus40Db']} ms")
        print("  " + " ".join(f"{x['ms']}:{x['arrivalDb']}" for x in a["envelope"]))
    if analysis["otherFrames"]:
        print(f"unclassified frames: {analysis['otherFrames']}")



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("decode")
    rec = sub.add_parser("record")
    rec.add_argument("--roms", type=Path)
    rec.add_argument("--keys", default="1,g", help="ride keys in order, comma separated (default 1,g)")
    rec.add_argument("--lead-seconds", type=float, default=1.0)
    rec.add_argument("--after-key-seconds", type=float, default=7.0)
    rec.add_argument("--settle-seconds", type=float, default=4.0)
    rec.add_argument("--sound", type=int, default=RATE)
    rec.add_argument("--ym-mixing", choices=("linear", "table", "model"), default="model")
    mode = rec.add_mutually_exclusive_group()
    mode.add_argument("--pal", dest="pal", action="store_true", default=True, help="poke $FFFF820A <- $02 for 50.05 Hz (default)")
    mode.add_argument("--ntsc", dest="pal", action="store_false", help="keep the restored 60.04 Hz")
    rec.add_argument("--append-sound-args", action="store_true", help="append --sound after --sound off instead of replacing it")
    ana = sub.add_parser("analyse")
    ana.add_argument("wav", type=Path)
    ana.add_argument("--json", action="store_true")
    ana.add_argument("--vbl-hz", type=float, default=VBL_HZ)
    ana.add_argument("--full", action="store_true", help="print every VBL of each sound")
    args = parser.parse_args()
    if args.mode == "decode":
        return decode()
    if args.mode == "analyse":
        analysis = analyse(args.wav, args.vbl_hz)
        if args.json:
            print(json.dumps(analysis, indent=1))
        else:
            print_report(analysis, args.full)
        return 0
    return record(
        args.roms,
        [k for k in args.keys.split(",") if k],
        args.lead_seconds,
        args.after_key_seconds,
        args.settle_seconds,
        args.sound,
        args.ym_mixing,
        not args.append_sound_args,
        args.pal,
    )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
