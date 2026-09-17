#!/usr/bin/env python3
"""Display-mode and VBL-rate probe (#305).

Recovers the display configuration the Working Authority runs in — Shifter
resolution, sync mode (50 Hz PAL or 60 Hz NTSC) and the resulting frame period —
and answers whether any of that changes while the program runs.

The instrument is a pair of Hatari *change* watchpoints on the two Shifter
registers that select the mode:

``$FFFF8260``  resolution (0 low, 1 medium, 2 high)
``$FFFF820A``  sync mode (bit 1 set = 50 Hz, clear = 60 Hz)

``b (addr).b ! (addr).b :trace`` reports every change of the byte at ``addr``
from the value it held when the breakpoint was set, without stopping the
machine, so one armed run covers a whole session from power-on and names the
program counter of whatever changed it.

Frame period is measured in *emulated cycles*, not host seconds: the host rate
is a property of this laboratory's scheduling and tells us nothing about the
original. ``CycleCounter`` and ``VBL`` are read at two stops, and the cycles
per frame that falls out identifies the mode exactly — an ST Shifter runs
512 cycles x 313 lines = 160256 cycles per frame at 50 Hz and
508 cycles x 263 lines = 133604 at 60 Hz.

Cases:

``boot``        cold boot from the Working Authority STX with both watchpoints
                armed before the first instruction, through the title screen and
                the load of the first world, then a register sample and a cycle
                measurement. ``--country`` is passed to EmuTOS, which is what
                chooses the machine's sync mode.
``scene``       the same sample and measurement taken from a pinned gameplay
                snapshot, with the watchpoints armed for the whole run.
``sync-poke``   a control: measure, write ``$02`` to ``$FFFF820A`` from the
                debugger, measure again. It shows the register is the quantity
                that sets the rate and that the program does not put it back.
``tos``         the same machine with no floppy, left at the TOS desktop, where
                ``_hz_200`` is still running and the field rate can be read off
                in real hertz. Damocles takes the machine over and stops that
                counter, so this is where the seconds per frame for a given sync
                mode are measured; it transfers to gameplay because the program
                never changes the sync mode.

Nothing is written into the guest except in ``sync-poke``, which says so.
Captures and RAM stay in the ignored run directory
(docs/research/damocles-gap.md); only decoded facts belong in tracked notes.

Usage (from the repository root):

  python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms
  python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms \
      --case boot --country uk
  python3 research/damocles-st/scripts/display-mode-probe.py --roms /path/to/roms \
      --case scene --snapshot interior-window
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import UTC, datetime
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

# Shifter registers. Addresses are the 32-bit forms the debugger takes.
SYNC_MODE = 0xFFFF820A
RESOLUTION = 0xFFFF8260

# The whole video/palette register file, saved as one window per sample.
IO_WINDOW = (0xFF8200, 0x80)

# TOS's `_hz_200` counter. The MFP's Timer C runs it at exactly 200 Hz from
# the MFP's own 2.4576 MHz clock, which the Shifter's sync mode does not
# touch, so counting frames against it gives the field rate in real hertz
# without having to assume a CPU clock.
HZ200_WINDOW = (0x0004B8, 0x08)

# Registers the static scan looks for in the resident image. The video base
# and palette are included as positive controls: the program demonstrably
# writes both, so a scan that finds them and not the mode registers is a scan
# that would have found the mode registers.
SCAN_TARGETS = {
    0x820A: "sync-mode",
    0x8260: "resolution",
    0x8201: "video-base-high",
    0x8203: "video-base-mid",
    0x8240: "palette-base",
}

# ST Shifter frame periods in CPU cycles, from the line length and line count
# each sync mode selects. These are the discriminator the measurement lands on.
FRAME_CYCLES = {
    160256: {"hertz": 50, "standard": "PAL", "lines": 313, "cyclesPerLine": 512},
    133604: {"hertz": 60, "standard": "NTSC", "lines": 263, "cyclesPerLine": 508},
    112224: {"hertz": 71, "standard": "mono", "lines": 501, "cyclesPerLine": 224},
}

# Tolerance on the measured mean, in cycles per frame. Stops are taken while the
# machine is halted at an arbitrary point inside a frame, so a measurement over
# N frames carries up to one frame's worth of error spread over N.
FRAME_CYCLE_TOLERANCE = 64

# The first title-loop hit, from lab.json's title-screen checkpoint.
TITLE_PC = 0x68582
SCAN_SPACE = 57


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _arm() -> list[str]:
    """Debugger commands that arm the two Shifter change watchpoints."""
    return [
        f"b (${SYNC_MODE:x}).b ! (${SYNC_MODE:x}).b :trace :lock",
        f"b (${RESOLUTION:x}).b ! (${RESOLUTION:x}).b :trace :lock",
    ]


def _launch(command: list[str], log: Path, env: dict) -> subprocess.Popen:
    return subprocess.Popen(command, stdout=log.open("wb"), stderr=subprocess.STDOUT, env=env)


def _wait_for_fifo(fifo: Path) -> None:
    for _ in range(200):
        if fifo.exists():
            return
        time.sleep(0.05)
    raise LabError("Hatari did not create the command FIFO")


def _mode_of(io: bytes) -> dict:
    """Decode the sample's Shifter registers.

    Both registers read back with their unimplemented bits set on this hardware,
    so the decoded fields are masked rather than compared whole.
    """
    resolution = io[(RESOLUTION & 0xFFFFFF) - IO_WINDOW[0]]
    sync = io[(SYNC_MODE & 0xFFFFFF) - IO_WINDOW[0]]
    return {
        "resolutionByte": f"0x{resolution:02x}",
        "resolution": resolution & 0x03,
        "resolutionName": {0: "low", 1: "medium", 2: "high"}.get(resolution & 0x03, "reserved"),
        "syncByte": f"0x{sync:02x}",
        "syncExternal": bool(sync & 0x01),
        "syncHertz": 50 if sync & 0x02 else 60,
        "videoBase": f"0x{io[0x01] << 16 | io[0x03] << 8:06x}",
    }


def _absolute_references(data: bytes, targets: dict[int, str]) -> dict[str, list[dict]]:
    """Every 68000 instruction word in `data` that names one of `targets`.

    Three encodings reach an I/O register: absolute short in a source effective
    address (mode 7 reg 0, the low six bits of the opcode), absolute short in a
    MOVE destination (mode and register fields swapped into bits 6-11), and a
    32-bit absolute long constant anywhere. Some hits are coincidental data, so
    the opcode word is reported for triage rather than filtered away. Addresses
    only; no disassembly text (docs/research/damocles-gap.md).
    """
    found: dict[str, list[dict]] = {name: [] for name in targets.values()}

    def word(offset: int) -> int:
        return int.from_bytes(data[offset : offset + 2], "big")

    for offset in range(0, len(data) - 8, 2):
        opcode = word(offset)
        short = word(offset + 2)
        if (opcode & 0x3F) == 0x38 and short in targets:
            found[targets[short]].append(
                {"addressHex": f"0x{offset:06x}", "opcodeWord": f"0x{opcode:04x}", "addressing": "source-short"}
            )
        if (opcode >> 12) in (1, 2, 3) and ((opcode >> 6) & 7) == 7 and ((opcode >> 9) & 7) == 0:
            source_mode, source_register = (opcode >> 3) & 7, opcode & 7
            extension = 0
            if source_mode == 7 and source_register == 0:
                extension = 1
            elif source_mode == 7 and source_register == 1:
                extension = 2
            elif source_mode == 7 and source_register == 4:
                extension = 2 if (opcode >> 12) == 2 else 1
            elif source_mode in (5, 6):
                extension = 1
            destination = word(offset + 2 + 2 * extension)
            if destination in targets:
                found[targets[destination]].append(
                    {
                        "addressHex": f"0x{offset:06x}",
                        "opcodeWord": f"0x{opcode:04x}",
                        "addressing": "destination-short",
                    }
                )
        long = int.from_bytes(data[offset : offset + 4], "big")
        if (long >> 24) in (0x00, 0xFF) and (long & 0xFFFF) in targets and (long & 0x00FF0000) == 0x00FF0000:
            found[targets[long & 0xFFFF]].append(
                {"addressHex": f"0x{offset:06x}", "opcodeWord": f"0x{long:08x}", "addressing": "absolute-long"}
            )
    return found


def _measurement(marks: list[dict]) -> dict:
    """Turn two (VBL, CycleCounter, FrameCycles) stops into cycles per frame.

    Subtracting FrameCycles at each stop removes the partial frame each stop
    lands in, so the remainder spans whole frames and the mean is exact. The
    counter is the low 32 bits of Hatari's global cycle count and wraps roughly
    every nine emulated minutes, so the difference is taken modulo 2^32.
    """
    first, last = marks[0], marks[-1]
    frames = last["vbl"] - first["vbl"]
    if frames <= 0:
        raise LabError("The measurement did not advance the VBL count")
    span = ((last["cycles"] - last["frameCycles"]) - (first["cycles"] - first["frameCycles"])) % (1 << 32)
    per_frame = span / frames
    matched = None
    for cycles, mode in FRAME_CYCLES.items():
        if abs(per_frame - cycles) <= FRAME_CYCLE_TOLERANCE:
            matched = {"nominalCyclesPerFrame": cycles, **mode}
            break
    hertz = None
    if first["hz200"] is not None and last["hz200"] is not None:
        ticks = (last["hz200"] - first["hz200"]) % (1 << 32)
        if ticks > 0:
            hertz = round(200.0 * frames / ticks, 3)
    return {
        "frames": frames,
        "cycles": span,
        "cyclesPerFrame": round(per_frame, 2),
        "hz200Ticks": None if first["hz200"] is None else (last["hz200"] - first["hz200"]) % (1 << 32),
        "measuredHertz": hertz,
        "identified": matched,
    }


_VALUE = re.compile(r"^= .*#(-?\d+)")


def _values(log_text: str) -> list[int]:
    """`e <variable>` prints to Hatari's own output, not the debugger logfile."""
    return [int(match.group(1)) for match in (_VALUE.match(line) for line in log_text.splitlines()) if match]


_TRACE = re.compile(r"^\s*\$((?:ff)?ff82[0-9a-f]{2}) = \$([0-9a-f]+)", re.I)
_TRACE_PC = re.compile(r"^CPU=\$([0-9a-f]+)", re.I)


def _watchpoint_trace(log_text: str) -> list[dict]:
    """Every reported change of either watched register, with the PC that did it."""
    changes: list[dict] = []
    pending: dict | None = None
    for line in log_text.splitlines():
        hit = _TRACE.match(line)
        if hit:
            pending = {"address": f"0x{hit.group(1).lower()}", "value": f"0x{hit.group(2).lower()}"}
            changes.append(pending)
            continue
        where = _TRACE_PC.match(line)
        if where and pending is not None:
            pending["pc"] = f"0x{where.group(1).lower()}"
            pending = None
    return changes


def _sample(handle, run_directory: Path, prefix: str, index: int) -> tuple[Path, Path]:
    path = run_directory / f"{prefix}{index:02d}-io.bin"
    ticks = run_directory / f"{prefix}{index:02d}-hz200.bin"
    _fifo_send(
        handle,
        [
            "hatari-stop",
            "hatari-debug setopt hex",
            "hatari-debug e VBL",
            "hatari-debug e CycleCounter",
            "hatari-debug e FrameCycles",
            f"hatari-debug savebin {path} ${IO_WINDOW[0]:x} ${IO_WINDOW[1]:x}",
            f"hatari-debug savebin {ticks} ${HZ200_WINDOW[0]:x} ${HZ200_WINDOW[1]:x}",
            f"hatari-debug screenshot {run_directory}/{prefix}{index:02d}.png",
            "hatari-cont",
        ],
    )
    time.sleep(0.4)
    return path, ticks


def _session(
    *,
    name: str,
    country: str | None,
    memstate: Path | None,
    roms_root: Path | None,
    settle: float,
    measure_seconds: float,
    boot_wait_vbls: int,
    poke_sync: bool,
    floppy: bool = True,
) -> dict:
    authority, config = load_configuration()
    program_path, tos_path = resolve_images(authority, resolve_roms_root(roms_root))
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    run_directory = WORK_ROOT / _run_id(f"display-mode-{name}")
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()

    # Watchpoints are armed in the --parse script so they cover the machine from
    # its first instruction; with --memstate they are re-armed over the FIFO
    # instead, because loading a saved state discards the breakpoint list.
    parse_script = run_directory / "arm.txt"
    armed_at_boot = memstate is None
    cold_game_boot = memstate is None and floppy
    lines = list(_arm()) if armed_at_boot else []
    title_marker = run_directory / "title-hit.png"
    if cold_game_boot:
        # lab.json's title-screen checkpoint, used here only as a rendezvous: the
        # host has to know the loader has finished before it presses Space.
        title_script = run_directory / "title.txt"
        title_script.write_text(f"screenshot {title_marker}\nc\n", encoding="utf-8")
        lines.append(f"b pc = ${TITLE_PC:x} :once :quiet :file {title_script}")
    parse_script.write_text("\n".join(lines + ["c", ""]), encoding="utf-8")

    extra: list[str] = []
    if country:
        extra.extend(["--country", country])
    if memstate is not None:
        extra.extend(["--memstate", str(memstate.resolve())])

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=memstate is None,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=extra,
    )
    if not floppy:
        index = command.index("--disk-a")
        del command[index : index + 2]

    env = os.environ.copy()
    env.update(headless_env())

    samples: list[tuple[Path, Path]] = []
    pokes: list[dict] = []
    process = _launch(command, run_directory / "hatari.log", env)
    try:
        _wait_for_fifo(fifo)
        with fifo.open("w", encoding="utf-8") as handle:
            if not armed_at_boot:
                _fifo_send(handle, ["hatari-stop"] + [f"hatari-debug {c}" for c in _arm()] + ["hatari-cont"])
            time.sleep(settle)
            if cold_game_boot:
                # Cold boot: wait for the title-loop rendezvous, press Space
                # once, then wait out the world load, as the tracked first-world
                # scenario does.
                for _ in range(2400):
                    if title_marker.is_file():
                        break
                    time.sleep(0.1)
                else:
                    raise LabError("The title loop was never reached")
                time.sleep(4.0)
                _fifo_send(handle, [f"hatari-event keypress {SCAN_SPACE}"])
                time.sleep(boot_wait_vbls / 850.0)
            samples.append(_sample(handle, run_directory, "sample", 0))
            time.sleep(measure_seconds)
            samples.append(_sample(handle, run_directory, "sample", 1))
            if poke_sync:
                _fifo_send(
                    handle,
                    [
                        "hatari-stop",
                        f"hatari-debug w ${SYNC_MODE:x} 02",
                        "hatari-cont",
                    ],
                )
                pokes.append({"address": f"0x{SYNC_MODE:x}", "value": "0x02"})
                time.sleep(1.0)
                samples.append(_sample(handle, run_directory, "sample", 2))
                time.sleep(measure_seconds)
                samples.append(_sample(handle, run_directory, "sample", 3))
            _fifo_send(
                handle,
                [
                    "hatari-stop",
                    f"hatari-debug savebin {run_directory}/observed.ram 0 $100000",
                    "hatari-debug quit",
                ],
            )
            time.sleep(3.0)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if fifo.exists():
            try:
                fifo.unlink()
            except OSError:
                pass

    log_text = (run_directory / "hatari.log").read_text(encoding="utf-8", errors="replace")
    numbers = _values(log_text)
    if len(numbers) < 3 * len(samples):
        raise LabError(f"Expected {3 * len(samples)} counter reads, parsed {len(numbers)}")
    marks = []
    for index, (_, ticks) in enumerate(samples):
        hz200 = int.from_bytes(ticks.read_bytes()[2:6], "big") if ticks.is_file() else None
        marks.append(
            {
                "vbl": numbers[index * 3],
                "cycles": numbers[index * 3 + 1] & 0xFFFFFFFF,
                "frameCycles": numbers[index * 3 + 2],
                "hz200": hz200,
            }
        )

    decoded = []
    for index, (path, ticks) in enumerate(samples):
        if not path.is_file():
            raise LabError(f"Sample {index} did not produce a register window")
        decoded.append(
            {
                "index": index,
                "sha256": _sha256(path),
                "hz200Sha256": _sha256(ticks) if ticks.is_file() else None,
                "counters": marks[index],
                "shifter": _mode_of(path.read_bytes()),
            }
        )

    ram = run_directory / "observed.ram"
    references = (
        _absolute_references(ram.read_bytes(), SCAN_TARGETS) if ram.is_file() else None
    )

    measurements = [{"span": "0-1", **_measurement(marks[0:2])}]
    if poke_sync and len(marks) >= 4:
        measurements.append({"span": "2-3", **_measurement(marks[2:4])})

    return {
        "case": name,
        "runId": run_directory.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "country": country,
        "memstate": str(memstate) if memstate else None,
        "memstateSha256": _sha256(memstate) if memstate else None,
        "watchpointsArmedFromPowerOn": armed_at_boot,
        "pokes": pokes,
        "toolchain": toolchain.as_dict(),
        "images": {"program": _sha256(program_path), "tos": _sha256(tos_path)},
        "probeSha256": _sha256(Path(__file__).resolve()),
        "samples": decoded,
        "measurements": measurements,
        "shifterChanges": _watchpoint_trace(log_text),
        "observedRamSha256": _sha256(ram) if ram.is_file() else None,
        "absoluteReferences": references,
        "runDirectory": str(run_directory),
    }


def _write(result: dict) -> dict:
    run_directory = Path(result["runDirectory"])
    (run_directory / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--roms", type=Path, help="roms root (default: <repo>/roms)")
    parser.add_argument("--case", default="scene", choices=("boot", "scene", "sync-poke", "tos"))
    parser.add_argument("--country", help="EmuTOS country code, which selects the machine's sync mode")
    parser.add_argument("--snapshot", default="eris-spaceport-onfoot", help="snapshot stem under snapshots/")
    parser.add_argument("--settle", type=float, default=6.0, help="seconds to let the machine settle")
    parser.add_argument("--measure", type=float, default=30.0, help="seconds between the two counter stops")
    parser.add_argument("--boot-wait-vbls", type=int, default=90000, help="VBLs to wait for the world load")
    parser.add_argument(
        "--scan-ram",
        type=Path,
        help="scan an existing 1 MiB RAM dump for Shifter references and exit, running no emulator",
    )
    args = parser.parse_args(argv)

    if args.scan_ram is not None:
        data = args.scan_ram.read_bytes()
        if len(data) != 0x100000:
            raise LabError(f"RAM dump must be exactly 1 MiB, got {len(data)}")
        print(
            json.dumps(
                {
                    "sourceRam": {"path": str(args.scan_ram), "sha256": _sha256(args.scan_ram)},
                    "probeSha256": _sha256(Path(__file__).resolve()),
                    "absoluteReferences": _absolute_references(data, SCAN_TARGETS),
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    memstate: Path | None = None
    if args.case not in ("boot", "tos"):
        memstate = LAB_ROOT / "snapshots" / f"{args.snapshot}.sav"
        if not memstate.is_file():
            raise LabError(f"Snapshot not found: {memstate}")

    name = args.case if args.case in ("boot", "tos") else f"{args.case}-{args.snapshot}"
    if args.country:
        name = f"{name}-{args.country}"

    result = _write(
        _session(
            name=name,
            country=args.country,
            memstate=memstate,
            roms_root=args.roms,
            settle=args.settle,
            measure_seconds=args.measure,
            boot_wait_vbls=args.boot_wait_vbls,
            poke_sync=args.case == "sync-poke",
            floppy=args.case != "tos",
        )
    )
    print(json.dumps({k: v for k, v in result.items() if k != "samples"}, indent=2, sort_keys=True))
    print(json.dumps(result["samples"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
