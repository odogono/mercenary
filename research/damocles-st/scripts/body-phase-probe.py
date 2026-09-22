#!/usr/bin/env python3
"""Watch the per-Body phase accumulators turn, and try to stop them (#439).

#439 asks whether the 32-slot phase-rate table at ``$0082DC`` is each Body's
**axial rotation rate** — so that a sun and moons sweeping a surface sky are the
observer's own Body turning over a System whose centres never move — and whether
any Body centre other than DAMOCLES is ever written.

The desk trace answers the "what reads it" half (see
``docs/research/damocles-gamma-system.md``). This probe answers the observable
half on a real machine:

``rate``
    Sample the 32 accumulators at ``$0062EA`` alongside the interrupt counter at
    ``$051D96``, and check that every slot advanced by exactly its derived rate
    at ``$00835C`` times the number of interrupts that elapsed. Also records the
    sky longitude latch ``$042C6C``, the sub-stellar longitude ``$0079BE``, and
    the day/night flag ``$007A4E`` beside a screenshot per sample.

``spin`` / ``freeze`` / ``jump``
    Controlled perturbation of the current Body's own entries. ``spin`` pokes
    the derived rate up so a slow Body turns in seconds, ``freeze`` pokes it to
    zero, and ``jump`` adds a quarter turn to the accumulator once. Each records
    screenshots and the latch either side of the poke.

``stasis``
    Hash the X/Y/Z body-centre arrays at the start and the end of a long run and
    report which slots differ. Only DAMOCLES may.

``void``
    Boot a pose whose selector is already the VOID sentinel ``$78``, record the
    view, and report whether slot 30's accumulator advances and whether anything
    consumes it.

Nothing is injected except where a case says so. Every sample is a ``savebin``
taken while the machine is stopped.

Usage (from the repository root):

  python3 research/damocles-st/scripts/body-phase-probe.py --case rate \\
      --snapshot research/damocles-st/snapshots/eris-spaceport-onfoot.sav
  python3 research/damocles-st/scripts/body-phase-probe.py --case spin
  python3 research/damocles-st/scripts/body-phase-probe.py --case freeze
  python3 research/damocles-st/scripts/body-phase-probe.py --case jump
  python3 research/damocles-st/scripts/body-phase-probe.py --case stasis --samples 24
  python3 research/damocles-st/scripts/body-phase-probe.py --case void \\
      --snapshot research/damocles-st/snapshots/rehosted/midas.sav

See docs/research/damocles-gamma-system.md for the claims these runs support.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    _fifo_send,
    _run_id,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

REPO = LAB_ROOT.parents[1]
WORK_ROOT = LAB_ROOT / "work"
SNAPSHOTS = LAB_ROOT / "snapshots"
DEFAULT_SNAPSHOT = SNAPSHOTS / "eris-spaceport-onfoot.sav"

# Body records, one longword a slot, addressed by the same `index * 4` selector
# the name roster uses (docs/research/damocles-gamma-system.md).
BODY_X, BODY_Z, BODY_EXTENT = 0x005F40, 0x005FC0, 0x006040
BODY_APPEARANCE, BODY_Y = 0x0060C0, 0x00626A
PHASE_ACCUMULATOR = 0x0062EA            # integrated at $051E4E once per interrupt
PHASE_SOURCE, PHASE_DERIVED = 0x0082DC, 0x00835C  # source, and source >> 6
SLOTS = 32

SUBSOLAR = 0x0079BE      # atan2 of the Body's own centre, written at $04EA30
STEP_X, STEP_Z = 0x007A1E, 0x007A22  # the panel's own location readout steps
DAY_FLAG = 0x007A4E      # set by the terminator test at $050562
BODY_SELECTOR = 0x007AA8  # low word of the `index * 4` selector alias at $7AA6
OCCUPANCY = 0x007AAE     # 1 on foot, 0 boarded, 2 in space
INTERRUPT_GATE = 0x007A26  # non-zero skips the accumulate at $051E4E
WAIT_COUNTER = 0x007B9C   # the script wait counter, already Confirmed as one per VBL
SURFACE_X, SURFACE_Z = 0x007AB2, 0x007ABA  # body-local position the sky reads

SKY_LONGITUDE = 0x042C6C  # step_x + accumulator, masked to ten bits
SKY_LATITUDE = 0x042C70   # step_z, no accumulator
INTERRUPT_COUNTER = 0x051D96  # `addq.l #$1` in the same handler as the accumulate

TURN = 1 << 26           # accumulator units a full turn: ten bits at bit 16
ANGLE_UNITS = 1 << 10    # the engine's own circle
PAL_VBL_HZ = 50.0

WINDOWS = (
    ("low", 0x005F00, 0x2600),      # body records, phase tables, $79xx-$7Bxx
    ("counter", 0x051D80, 0x0020),  # the interrupt counter
    ("sky", 0x042C00, 0x0080),      # the sky longitude/latitude latch
)

NAMES = (
    "DIALIS", "ICARUS", "MIDAS", "ACHERON", "DION", "ATROPOS", "CLOTHO",
    "LACHESIS", "GAEA", "CRONUS", "CYCLOPES", "ERIS", "SOLON", "THEON",
    "VESTA", "METIS", "LUCAN", "LOGOS", "AURORA", "TRITON", "PAN", "THALIA",
    "JUNO", "BACCHUS", "JASON", "TOLOSA", "PERSEUS", "MENTOR", "SAPPHIRE",
    "DAMOCLES", "VOID",
)

QUARTER_TURN = TURN // 4
SPIN_DERIVED = 0x00010624  # VOID's own derived rate: one turn every 1000 interrupts


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _window(blobs: dict[str, bytes], address: int) -> tuple[bytes, int]:
    for label, base, length in WINDOWS:
        if base <= address < base + length:
            return blobs[label], base
    raise LabError(f"no sampled window covers ${address:06x}")


def _u16(blobs: dict[str, bytes], address: int) -> int:
    data, base = _window(blobs, address)
    return int.from_bytes(data[address - base : address - base + 2], "big")


def _u32(blobs: dict[str, bytes], address: int) -> int:
    data, base = _window(blobs, address)
    return int.from_bytes(data[address - base : address - base + 4], "big")


def _s32(blobs: dict[str, bytes], address: int) -> int:
    data, base = _window(blobs, address)
    return int.from_bytes(data[address - base : address - base + 4], "big", signed=True)


def _array(blobs: dict[str, bytes], address: int) -> bytes:
    data, base = _window(blobs, address)
    return data[address - base : address - base + SLOTS * 4]


def _longs(blob: bytes, *, signed: bool = False) -> list[int]:
    fmt = ">i" if signed else ">I"
    return [struct.unpack_from(fmt, blob, index * 4)[0] for index in range(SLOTS)]


def name_of(slot: int) -> str:
    return NAMES[slot] if slot < len(NAMES) else f"slot-{slot}"


def decode(blobs: dict[str, bytes]) -> dict:
    """One machine state: the phase tables, the sky latch, and the body records."""
    selector = _u16(blobs, BODY_SELECTOR)
    return {
        "interrupts": _u32(blobs, INTERRUPT_COUNTER),
        "waitCounter": _u16(blobs, WAIT_COUNTER),
        "selector": f"0x{selector:04x}",
        "bodyIndex": selector // 4 if selector % 4 == 0 else None,
        "bodyName": name_of(selector // 4) if selector % 4 == 0 else None,
        "occupancy": _u16(blobs, OCCUPANCY),
        "interruptGate": _u16(blobs, INTERRUPT_GATE),
        "accumulators": _longs(_array(blobs, PHASE_ACCUMULATOR)),
        "derived": _longs(_array(blobs, PHASE_DERIVED)),
        "source": _longs(_array(blobs, PHASE_SOURCE)),
        "centreX": _longs(_array(blobs, BODY_X), signed=True),
        "centreY": _longs(_array(blobs, BODY_Y), signed=True),
        "centreZ": _longs(_array(blobs, BODY_Z), signed=True),
        "skyLongitude": _u16(blobs, SKY_LONGITUDE),
        "skyLatitude": _u16(blobs, SKY_LATITUDE),
        "subsolar": _u16(blobs, SUBSOLAR),
        "dayFlag": f"0x{_u16(blobs, DAY_FLAG):04x}",
        "stepX": _u16(blobs, STEP_X),
        "stepZ": _u16(blobs, STEP_Z),
        "surfaceX": _s32(blobs, SURFACE_X),
        "surfaceZ": _s32(blobs, SURFACE_Z),
        "centreHashes": {
            axis: hashlib.sha256(_array(blobs, address)).hexdigest()
            for axis, address in (("x", BODY_X), ("y", BODY_Y), ("z", BODY_Z))
        },
    }


def phase_angle(accumulator: int) -> int:
    """The ten bits the sky transform reads, at bit 16 of the accumulator."""
    return (accumulator >> 16) & (ANGLE_UNITS - 1)


def poke(address: int, value: int, size: int = 4) -> str:
    body = " ".join(f"{byte:02x}"
                    for byte in (value & ((1 << 8 * size) - 1)).to_bytes(size, "big"))
    return f"hatari-debug w ${address:x} {body}"


class Machine:
    """One booted Hatari, stopped and continued around every read and poke."""

    def __init__(self, handle, run_directory: Path):
        self.handle = handle
        self.run_directory = run_directory
        self.samples = 0

    def sample(self, *, shot: bool = True, label: str | None = None) -> dict:
        index = self.samples
        self.samples += 1
        prefix = label or f"sample{index:03d}"
        paths = {}
        commands = ["hatari-stop", "hatari-debug setopt hex"]
        for window, base, length in WINDOWS:
            path = self.run_directory / f"{prefix}-{window}.bin"
            paths[window] = path
            commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
        shot_path = None
        if shot:
            shot_path = self.run_directory / f"{prefix}.png"
            commands.append(f"hatari-debug screenshot {shot_path}")
        commands.append("hatari-cont")
        _fifo_send(self.handle, commands)
        time.sleep(0.22)
        blobs = {}
        for window, path in paths.items():
            data = b""
            for _ in range(10):
                if path.is_file():
                    data = path.read_bytes()
                if data:
                    break
                time.sleep(0.05)
            if not data:
                raise LabError(f"sample {prefix} read nothing for window {window}")
            blobs[window] = data
        state = decode(blobs)
        state["prefix"] = prefix
        state["sha256"] = {window: _sha256(path) for window, path in paths.items()}
        if shot_path is not None and shot_path.is_file():
            state["display"] = shot_path.name
            state["sha256"]["display"] = _sha256(shot_path)
        return state

    def poke(self, *commands: str) -> None:
        _fifo_send(self.handle, ["hatari-stop", "hatari-debug setopt hex",
                                 *commands, "hatari-cont"])
        time.sleep(0.2)

    def press(self, scan: int, hold: float = 0.15) -> None:
        # Hatari reads a one-character argument as ASCII and anything longer as
        # an ST scancode, so a single-digit scancode has to be zero-padded.
        code = f"{scan:02d}"
        _fifo_send(self.handle, [f"hatari-event keydown {code}"])
        time.sleep(hold)
        _fifo_send(self.handle, [f"hatari-event keyup {code}"])
        time.sleep(0.2)

    def fast_forward(self, enabled: bool) -> None:
        _fifo_send(self.handle, [
            "hatari-stop",
            f"hatari-debug setopt --fast-forward {'on' if enabled else 'off'}",
            "hatari-cont",
        ])
        time.sleep(0.2)


def rate_rows(first: dict, last: dict) -> list[dict]:
    """Per slot: did the accumulator advance by derived x elapsed interrupts?"""
    elapsed = (last["interrupts"] - first["interrupts"]) & 0xFFFFFFFF
    rows = []
    for slot in range(SLOTS):
        derived = last["derived"][slot]
        moved = (last["accumulators"][slot] - first["accumulators"][slot]) & 0xFFFFFFFF
        predicted = (derived * elapsed) & 0xFFFFFFFF
        rows.append({
            "slot": slot,
            "name": name_of(slot),
            "source": f"0x{last['source'][slot]:08x}",
            "derived": f"0x{derived:08x}",
            "observed": f"0x{moved:08x}",
            "predicted": f"0x{predicted:08x}",
            "matches": moved == predicted,
            "interruptsPerTurn": None if not derived else TURN / derived,
            "secondsPerTurn": None if not derived else TURN / derived / PAL_VBL_HZ,
        })
    return rows


def sample_series(machine: Machine, *, samples: int, interval: float,
                  label: str = "sample", unpause: int | None = None) -> list[dict]:
    """Sample `samples` times, holding the game out of its own pause.

    `$7A26` gates the whole interrupt body at `$051E26`, so a paused machine
    advances no accumulator and no counter. Several restored poses come back
    paused, and the game re-pauses itself on some events, so when `unpause` is
    given the loop presses that scancode again whenever it sees the gate set —
    which is what `$0555C8` does for any key that is not Return.
    """
    series = []
    for index in range(samples):
        if index:
            time.sleep(interval)
        state = machine.sample(label=f"{label}{index:03d}")
        if unpause is not None and state["interruptGate"]:
            machine.press(unpause)
            state = machine.sample(label=f"{label}{index:03d}")
        series.append(state)
    return series


def case_rate(machine: Machine, *, samples: int, interval: float,
              unpause: int | None = None) -> dict:
    series = sample_series(machine, samples=samples, interval=interval, unpause=unpause)
    first, last = series[0], series[-1]
    return {
        "series": series,
        "elapsedInterrupts": (last["interrupts"] - first["interrupts"]) & 0xFFFFFFFF,
        "elapsedWaitCounter": (last["waitCounter"] - first["waitCounter"]) & 0xFFFF,
        "rows": rate_rows(first, last),
    }


def case_perturb(machine: Machine, *, kind: str, samples: int,
                 interval: float, unpause: int | None = None) -> dict:
    before = sample_series(machine, samples=max(2, samples // 2), interval=interval,
                           label="before", unpause=unpause)
    index = before[-1]["bodyIndex"]
    if index is None:
        raise LabError(f"selector {before[-1]['selector']} is not a body slot")
    selector = index * 4
    if kind == "spin":
        commands = [poke(PHASE_DERIVED + selector, SPIN_DERIVED)]
    elif kind == "freeze":
        commands = [poke(PHASE_DERIVED + selector, 0)]
    elif kind == "jump":
        moved = (before[-1]["accumulators"][index] + QUARTER_TURN) & 0xFFFFFFFF
        commands = [poke(PHASE_ACCUMULATOR + selector, moved)]
    else:
        raise LabError(f"unknown perturbation {kind}")
    machine.poke(*commands)
    after = sample_series(machine, samples=max(2, samples // 2), interval=interval,
                          label="after", unpause=unpause)
    return {
        "kind": kind,
        "body": {"index": index, "name": name_of(index), "selector": f"0x{selector:02x}"},
        "poke": commands,
        "before": before,
        "after": after,
        "skyLongitudeBefore": [state["skyLongitude"] for state in before],
        "skyLongitudeAfter": [state["skyLongitude"] for state in after],
    }


def case_stasis(machine: Machine, *, samples: int, interval: float,
                unpause: int | None = None) -> dict:
    series = sample_series(machine, samples=samples, interval=interval, label="stasis",
                           unpause=unpause)
    first, last = series[0], series[-1]
    moved = []
    for slot in range(SLOTS):
        changes = {
            axis: (first[f"centre{axis.upper()}"][slot], last[f"centre{axis.upper()}"][slot])
            for axis in ("x", "y", "z")
        }
        differing = {axis: pair for axis, pair in changes.items() if pair[0] != pair[1]}
        if differing:
            moved.append({"slot": slot, "name": name_of(slot),
                          "changed": {axis: {"first": pair[0], "last": pair[1]}
                                      for axis, pair in differing.items()}})
    return {
        "series": series,
        "elapsedInterrupts": (last["interrupts"] - first["interrupts"]) & 0xFFFFFFFF,
        "hashesFirst": first["centreHashes"],
        "hashesLast": last["centreHashes"],
        "moved": moved,
    }


def case_void(machine: Machine, *, samples: int, interval: float,
              unpause: int | None = None) -> dict:
    series = sample_series(machine, samples=samples, interval=interval, label="void",
                           unpause=unpause)
    first, last = series[0], series[-1]
    elapsed = (last["interrupts"] - first["interrupts"]) & 0xFFFFFFFF
    slot = 30
    derived = last["derived"][slot]
    moved = (last["accumulators"][slot] - first["accumulators"][slot]) & 0xFFFFFFFF
    return {
        "series": series,
        "elapsedInterrupts": elapsed,
        "selector": last["selector"],
        "voidSlot": {
            "slot": slot,
            "name": name_of(slot),
            "derived": f"0x{derived:08x}",
            "observed": f"0x{moved:08x}",
            "predicted": f"0x{(derived * elapsed) & 0xFFFFFFFF:08x}",
            "matches": moved == ((derived * elapsed) & 0xFFFFFFFF),
            "angleFirst": phase_angle(first["accumulators"][slot]),
            "angleLast": phase_angle(last["accumulators"][slot]),
        },
        "skyLongitude": [state["skyLongitude"] for state in series],
        "skyLatitude": [state["skyLatitude"] for state in series],
    }


def run(case: str, snapshot: Path, roms_root: Path | None, *, samples: int,
        interval: float, settle: float, fast_forward: bool,
        press_first: int | None = None) -> dict:
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    if not snapshot.is_file():
        raise LabError(
            f"Snapshot not found: {snapshot}. Restricted Material is not committed; "
            "capture or rehost it first (scripts/memstate-rehost.py)."
        )

    run_directory = WORK_ROOT / _run_id(f"body-phase-{case}")
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    parse_script = run_directory / "play.txt"
    parse_script.write_text("c\n", encoding="utf-8")

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=fast_forward,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())

    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "case": case,
        "runDirectory": str(run_directory),
        "snapshot": {"path": str(snapshot), "sha256": _sha256(snapshot)},
        "probe": {
            "path": str(Path(__file__).resolve().relative_to(REPO)),
            "sha256": _sha256(Path(__file__).resolve()),
        },
        "toolchain": toolchain,
        "fastForward": fast_forward,
        "samples": samples,
        "intervalSeconds": interval,
        "addresses": {
            "phaseSource": f"0x{PHASE_SOURCE:06x}",
            "phaseDerived": f"0x{PHASE_DERIVED:06x}",
            "phaseAccumulator": f"0x{PHASE_ACCUMULATOR:06x}",
            "interruptCounter": f"0x{INTERRUPT_COUNTER:06x}",
            "skyLongitude": f"0x{SKY_LONGITUDE:06x}",
            "subsolar": f"0x{SUBSOLAR:06x}",
        },
    }
    process = subprocess.Popen(
        command,
        stdout=(run_directory / "hatari.log").open("wb"),
        stderr=subprocess.STDOUT,
        env=env,
    )
    try:
        for _ in range(200):
            if fifo.exists():
                break
            time.sleep(0.05)
        else:
            raise LabError("Hatari did not create the command FIFO")
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            machine = Machine(handle, run_directory)
            if press_first is not None:
                # Several poses restore with the game's own pause flag set
                # ($7A26 = 1, the Return-key pause at $0555BE). Any other key
                # clears it at $0555C8, so press one rather than poke the flag.
                machine.press(press_first)
                result["pressedFirst"] = f"0x{press_first:02x}"
            if case == "rate":
                result["rate"] = case_rate(machine, samples=samples, interval=interval,
                                           unpause=press_first)
            elif case in ("spin", "freeze", "jump"):
                result["perturbation"] = case_perturb(
                    machine, kind=case, samples=samples, interval=interval,
                    unpause=press_first)
            elif case == "stasis":
                result["stasis"] = case_stasis(machine, samples=samples, interval=interval,
                                               unpause=press_first)
            elif case == "void":
                result["void"] = case_void(machine, samples=samples, interval=interval,
                                           unpause=press_first)
            else:
                raise LabError(f"unknown case {case}")
            _fifo_send(handle, ["hatari-stop"])
            time.sleep(0.4)
    finally:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)

    (run_directory / "result.json").write_text(
        json.dumps(result, indent=1, sort_keys=True, default=str) + "\n", encoding="utf-8")
    return result


def summarise(result: dict) -> None:
    print(f"case {result['case']}  run {Path(result['runDirectory']).name}")
    rate = result.get("rate")
    if rate:
        print(f"elapsed interrupts: {rate['elapsedInterrupts']} "
              f"($7B9C low word advanced {rate['elapsedWaitCounter']})")
        print(f"{'slot':>4} {'name':<9} {'derived':>10} {'observed':>10} "
              f"{'predicted':>10} {'ok':>3} {'vbl/turn':>12} {'s/turn':>10}")
        for row in rate["rows"]:
            turn = "" if row["interruptsPerTurn"] is None else f"{row['interruptsPerTurn']:.1f}"
            seconds = "" if row["secondsPerTurn"] is None else f"{row['secondsPerTurn']:.1f}"
            print(f"{row['slot']:>4} {row['name']:<9} {row['derived']:>10} "
                  f"{row['observed']:>10} {row['predicted']:>10} "
                  f"{'yes' if row['matches'] else 'NO':>3} {turn:>12} {seconds:>10}")
        mismatched = [row["name"] for row in rate["rows"] if not row["matches"]]
        print(f"mismatched slots: {mismatched or 'none'}")
    perturbation = result.get("perturbation")
    if perturbation:
        body = perturbation["body"]
        print(f"perturbed {body['name']} (slot {body['index']}, selector {body['selector']})")
        print(f"poke: {perturbation['poke']}")
        print(f"sky longitude before: {perturbation['skyLongitudeBefore']}")
        print(f"sky longitude after:  {perturbation['skyLongitudeAfter']}")
    stasis = result.get("stasis")
    if stasis:
        print(f"elapsed interrupts: {stasis['elapsedInterrupts']}")
        print(f"centre hashes first: {stasis['hashesFirst']}")
        print(f"centre hashes last:  {stasis['hashesLast']}")
        if not stasis["moved"]:
            print("no body centre changed")
        for entry in stasis["moved"]:
            print(f"moved: {entry['name']} (slot {entry['slot']}) {entry['changed']}")
    void = result.get("void")
    if void:
        slot = void["voidSlot"]
        print(f"selector {void['selector']}, elapsed interrupts {void['elapsedInterrupts']}")
        print(f"VOID accumulator observed {slot['observed']} predicted {slot['predicted']} "
              f"({'matches' if slot['matches'] else 'MISMATCH'})")
        print(f"VOID phase angle {slot['angleFirst']} -> {slot['angleLast']} of {ANGLE_UNITS}")
        print(f"sky longitude across the run: {void['skyLongitude']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--case", required=True,
                        choices=["rate", "spin", "freeze", "jump", "stasis", "void"])
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT,
                        help="memstate to boot; defaults to eris-spaceport-onfoot.sav")
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--interval", type=float, default=1.0,
                        help="host seconds between samples")
    parser.add_argument("--settle", type=float, default=4.0)
    parser.add_argument("--ordinary-rate", action="store_true",
                        help="run without fast-forward, at the PAL frame rate")
    parser.add_argument("--press-first", type=lambda v: int(v, 0), default=None,
                        metavar="SCANCODE",
                        help="press this ST scancode before sampling; clears a "
                             "restored pause flag ($7A26) without poking memory")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    result = run(args.case, args.snapshot, args.roms, samples=args.samples,
                 interval=args.interval, settle=args.settle,
                 fast_forward=not args.ordinary_rate,
                 press_first=args.press_first)
    if args.json:
        print(json.dumps(result, indent=1, sort_keys=True, default=str))
    else:
        summarise(result)


if __name__ == "__main__":
    main()
