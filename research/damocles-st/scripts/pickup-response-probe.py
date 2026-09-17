#!/usr/bin/env python3
"""Pickup-response probe (#317).

Exercises the five statically identified pickup-trigger mappings that
[#298](docs/research/damocles-limo-key-pickup.md) left as source facts: resident
slots 181, 151, 95, 101 and 94, against slot 183 as the reused control. None of
the five objects has a recovered placement, so none can be reached by an
ordinary walk-and-take route (see the location ledger). The probe therefore
drives the original program's own dispatch instead of inventing a route, in two
modes whose boundaries differ and are reported separately.

``--mode checkpoint`` runs the object-to-script table walk at `$0543D2` — the
routine the native take handler calls once the pickup has been committed — with
only A0 supplied, which is the register the handler leaves holding the resident
slot times four. Interrupts are masked, so each walk is observed as one atomic
step: the trigger it selects, the arming byte it clears, the busy flag it sets,
the script address it commits and the return address it pushes. Consecutive
walks in one case reproduce busy arbitration: queue, discard, re-queue, and the
replacement of a pending index. Nothing but A0, PC and the reset fields is
written.

``--mode timeline`` launches a response the way a trigger queued during a busy
script is launched: the pending-script word `$7A88` is written with the trigger
index and the machine is left to run. The dispatch loop at `$05194C` picks it
up, `$054764` arms and enters the script, and the response then runs under
ordinary interrupts. Samples are `savebin` windows taken while the emulator is
stopped, which is how the whole response's message gating, durations and return
to idle are measured.

Neither mode is an ordinary-route observation, and neither claims one. The
pickup preconditions in the take handler are not exercised here at all.

Usage (from the repository root):

  python3 research/damocles-st/scripts/pickup-response-probe.py --roms /path/to/roms
  python3 research/damocles-st/scripts/pickup-response-probe.py --mode timeline --case run-6

Captures, RAM and listings stay in the ignored run directory
(docs/research/damocles-gap.md); only decoded facts belong in tracked notes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
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

SNAPSHOT = LAB_ROOT / "snapshots" / "eris-spaceport-onfoot.sav"

# Recovered addresses. See docs/research/damocles-limo-key-pickup.md and
# docs/research/damocles-script-isa.md.
TABLE_WALK = 0x0543D2          # take handler's object-to-script table walk
# Two stop addresses the walk passes through in order: the branch that leaves it
# and the guarded sound request it branches to. Consecutive steps alternate
# between them, because Hatari will not re-arm a breakpoint on the address the
# machine is already stopped at and then take it.
TABLE_WALK_STOPS = (0x0543E8, 0x054848)
TRIGGER_ENTRY = 0x054770       # pickup entry to the launcher, past the busy test
TRIGGER_ENTRY_END = 0x0547C4   # its rts
IDLE_PC = 0x0703FC             # the jump-to-self the resident script parks in
TRIGGER_BYTES = 0x7CB4         # 64 one-byte arming records, indexed by trigger
PENDING = 0x7A88               # pending trigger index
FLAGS = 0x7BD8                 # bit 6 of $7BD9 is the script-busy flag

# Slot -> trigger index, read from the table at $0543EC in the pinned capture.
MAPPINGS = {183: 0x02, 181: 0x05, 151: 0x06, 95: 0x14, 101: 0x0B, 94: 0x3E}
# Script entry addresses from the entry table at $070080, for the same indices.
ENTRIES = {0x02: 0x07042A, 0x05: 0x070AEA, 0x06: 0x0705E6, 0x14: 0x0710B6,
           0x0B: 0x070BDE, 0x3E: 0x071E8A}
# Arming bytes as the pinned capture holds them: bit 7 armed, bit 6 sticky,
# bit 5 queue-while-busy.
ARMED = {0x02: 0x80, 0x05: 0xA0, 0x06: 0x80, 0x14: 0x80, 0x0B: 0x80, 0x3E: 0x80}
# A queueable trigger outside the pickup table, used only to show that a second
# queued index replaces the first. It is never released.
OTHER_QUEUEABLE = 0x3C

WINDOWS = (
    ("low", 0x006000, 0x2000),
    ("bank", 0x070100, 0x0010),
    ("timer", 0x0523B0, 0x0010),
)


def _u16(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 2], "big")


def _u32(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 4], "big")


def _decode(blobs: dict[str, bytes]) -> dict:
    low, bank, timer = blobs["low"], blobs["bank"], blobs["timer"]
    lb, bb, tb = 0x006000, 0x070100, 0x0523B0
    return {
        "scriptPc": f"0x{_u32(low, lb, 0x781E):08x}",
        "returnStack": f"0x{_u16(low, lb, 0x6268):04x}",
        "pending": f"0x{_u16(low, lb, PENDING):04x}",
        "flags": f"0x{_u16(low, lb, FLAGS):04x}",
        "messageGate": f"0x{_u16(low, lb, 0x7BA0):04x}",
        "messagePointer": f"0x{_u32(low, lb, 0x7B98):08x}",
        "messageResume": f"0x{_u16(low, lb, 0x7B96):04x}",
        "waitCounter": _u16(low, lb, 0x7B9C),
        "inventoryCount": _u16(low, lb, 0x61CC),
        "triggerBytes": {
            f"0x{index:02x}": f"0x{low[TRIGGER_BYTES - lb + index]:02x}"
            for index in sorted(set(MAPPINGS.values()) | {OTHER_QUEUEABLE})
        },
        "messageInterval": f"0x{_u16(bank, bb, 0x070102):04x}",
        "displayTimer": f"0x{_u16(timer, tb, 0x0523B8):04x}",
        "displayFlag": f"0x{_u16(timer, tb, 0x0523BC):04x}",
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _poke(address: int, value: int, size: int = 2) -> str:
    return f"w ${address:x} " + " ".join(f"${b:02x}" for b in value.to_bytes(size, "big"))


def _reset_commands() -> list[str]:
    """Return the machine to the parked idle state the snapshot arrives in.

    Only the script host's own fields are written: the arming bytes this probe
    disarms, the busy flag, the pending index, the interpreter PC and its return
    stack pointer, the message gate and the wait counter.
    """
    commands = [_poke(TRIGGER_BYTES + index, value, 1) for index, value in ARMED.items()]
    commands.append(_poke(TRIGGER_BYTES + OTHER_QUEUEABLE, 0xA0, 1))
    commands += [
        _poke(FLAGS, 0), _poke(PENDING, 0), _poke(0x781E, IDLE_PC, 4),
        _poke(0x6268, 0x6266), _poke(0x7BA0, 0), _poke(0x7B96, 0), _poke(0x7B9C, 0),
    ]
    return commands


# --------------------------------------------------------------------------
# Checkpoint mode
# --------------------------------------------------------------------------

def _walk(slot: int) -> dict:
    """One object-to-script table walk, entered with A0 = slot x 4."""
    return {"label": f"walk-{slot}", "slot": slot,
            "registers": [f"r A0=${slot * 4:x}"], "pc": TABLE_WALK,
            "stops": TABLE_WALK_STOPS}


def _enter(index: int) -> dict:
    """The pickup entry to the launcher, entered with D1 = trigger index."""
    return {"label": f"enter-{index:#04x}", "trigger": index,
            "registers": [f"r D1=${index:x}"], "pc": TRIGGER_ENTRY,
            "stops": (TRIGGER_ENTRY_END,)}


def checkpoint_cases() -> list[dict]:
    cases: list[dict] = []
    for slot in (183, 181, 151, 95, 101, 94):
        trigger = MAPPINGS[slot]
        cases.append({
            "name": f"map-{slot}",
            "steps": [_walk(slot)],
            # The launch path clears bit 7 only; the queue bit is left alone.
            "expect": [{"pending": 0x0000, "flags": 0x0040, "scriptPc": ENTRIES[trigger],
                        "trigger": {trigger: ARMED[trigger] & 0x7F},
                        "returnStack": 0x6264}],
        })
    cases.append({
        "name": "repeat-151",
        "steps": [_walk(151), _walk(151)],
        "expect": [
            {"pending": 0x0000, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x06: 0x00}},
            {"pending": 0x0000, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x06: 0x00}, "returnStack": 0x6264},
        ],
    })
    cases.append({
        "name": "busy-arbitration",
        "steps": [_walk(151), _walk(181), _walk(95), _walk(94), _walk(181), _walk(151)],
        "expect": [
            {"pending": 0x0000, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x06: 0x00, 0x05: 0xA0, 0x14: 0x80, 0x3E: 0x80}},
            # Queued: bit 5 of the arming byte is set, and the byte stays armed.
            {"pending": 0x0005, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x05: 0xA0}},
            # Discarded: bit 5 clear. The byte stays armed and nothing is queued.
            {"pending": 0x0005, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x14: 0x80}},
            {"pending": 0x0005, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x3E: 0x80}},
            {"pending": 0x0005, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x05: 0xA0}},
            # Already fired: refused before the busy test, so nothing is queued.
            {"pending": 0x0005, "flags": 0x0040, "scriptPc": ENTRIES[0x06],
             "trigger": {0x06: 0x00}},
        ],
    })
    cases.append({
        "name": "pending-replacement",
        "steps": [_walk(151), _walk(181), _enter(OTHER_QUEUEABLE)],
        "expect": [
            {"pending": 0x0000, "flags": 0x0040, "scriptPc": ENTRIES[0x06]},
            {"pending": 0x0005, "flags": 0x0040, "scriptPc": ENTRIES[0x06]},
            {"pending": OTHER_QUEUEABLE, "flags": 0x0040, "scriptPc": ENTRIES[0x06]},
        ],
    })
    return cases


def _stage_name(case: int, step: int) -> str:
    return f"stage-{case:02d}-{step:02d}"


def _prepare_checkpoints(run: Path, cases: list[dict]) -> None:
    previous_stop = None
    (run / "boot.txt").write_text("c\n", encoding="utf-8")
    (run / "start.txt").write_text(
        "setopt hex\n"
        f"savebin {run}/baseline.ram 0 $100000\n"
        f"parse {run}/{_stage_name(0, 0)}.txt\n",
        encoding="utf-8",
    )
    for index, case in enumerate(cases):
        steps = case["steps"]
        for step in range(len(steps) + 1):
            commands = ["setopt hex"]
            if step == 0:
                # Interrupts stay masked for the whole case, so every walk is
                # observed as one atomic step with no interpreter tick between.
                commands.append("r SR=$2700")
                commands += _reset_commands()
            name = f"{case['name']}-{step}"
            for label, base, length in WINDOWS:
                commands.append(f"savebin {run}/{name}-{label}.bin ${base:x} ${length:x}")
            if step == len(steps):
                nxt = (f"parse {run}/{_stage_name(index + 1, 0)}.txt"
                       if index + 1 < len(cases) else "quit")
                commands.append(nxt)
            else:
                action = steps[step]
                stop = next(s for s in action["stops"] if s != previous_stop)
                previous_stop = stop
                commands += [
                    f"b pc = ${stop:x} :once :quiet "
                    f":file {run}/{_stage_name(index, step + 1)}.txt",
                    *action["registers"],
                    f"r PC=${action['pc']:x}",
                    "c",
                ]
            (run / f"{_stage_name(index, step)}.txt").write_text(
                "\n".join(commands) + "\n", encoding="utf-8"
            )


def _read_sample(run: Path, name: str) -> dict:
    blobs = {}
    for label, _, _ in WINDOWS:
        path = run / f"{name}-{label}.bin"
        if not path.is_file():
            raise LabError(f"Missing observation window: {path}")
        blobs[label] = path.read_bytes()
    return _decode(blobs)


def _verify_checkpoints(run: Path, cases: list[dict]) -> list[dict]:
    results = []
    for case in cases:
        states = [_read_sample(run, f"{case['name']}-{step}")
                  for step in range(len(case["steps"]) + 1)]
        first = states[0]
        if first["scriptPc"] != f"0x{IDLE_PC:08x}" or first["flags"] != "0x0000":
            raise LabError(f"{case['name']}: the case did not start parked and idle")
        for step, expect in enumerate(case["expect"], start=1):
            state = states[step]
            for field, value in expect.items():
                if field == "trigger":
                    for index, byte in value.items():
                        seen = state["triggerBytes"][f"0x{index:02x}"]
                        if seen != f"0x{byte:02x}":
                            raise LabError(
                                f"{case['name']} step {step}: trigger {index:#04x} is {seen}, "
                                f"expected 0x{byte:02x}"
                            )
                    continue
                width = 8 if field == "scriptPc" else 4
                if state[field] != f"0x{value:0{width}x}":
                    raise LabError(
                        f"{case['name']} step {step}: {field} is {state[field]}, "
                        f"expected 0x{value:0{width}x}"
                    )
        results.append({"case": case["name"],
                        "steps": [s["label"] for s in case["steps"]],
                        "states": states})
    return results


def run_checkpoints(roms_root: Path | None, settle: float) -> dict:
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    snapshot = SNAPSHOT.resolve(strict=True)

    run = WORK_ROOT / _run_id("pickup-response-checkpoint")
    run.mkdir(parents=True, exist_ok=True)
    cases = checkpoint_cases()
    _prepare_checkpoints(run, cases)

    fifo = run / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    command = build_hatari_command(
        hatari_binary=hatari_binary, tos=tos_path, disk_a=program_path,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=run / "boot.txt", fast_forward=True, statusbar=False,
        cmd_fifo=fifo, extra_args=["--memstate", str(snapshot)],
    )
    env = os.environ | headless_env()
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env)
        try:
            deadline = time.monotonic() + 10
            while not fifo.exists():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise LabError(f"Hatari did not create the FIFO; inspect {run}")
                time.sleep(0.02)
            with fifo.open("w", encoding="utf-8") as handle:
                time.sleep(settle)
                _fifo_send(handle, [f"hatari-debug parse {run}/start.txt"])
                if process.wait(timeout=120) != 0:
                    raise LabError(f"Hatari failed; inspect {run}")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            fifo.unlink(missing_ok=True)

    results = _verify_checkpoints(run, cases)
    report = {
        "mode": "checkpoint",
        "runId": run.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "scope": "Original table walk and launcher at masked interrupts; A0/D1/PC supplied",
        "images": {"program": _sha256(program_path), "tos": _sha256(tos_path),
                   "memstate": _sha256(snapshot)},
        "toolchain": toolchain.as_dict(),
        "probeSha256": _sha256(Path(__file__).resolve()),
        "mappings": {str(slot): f"0x{index:02x}" for slot, index in MAPPINGS.items()},
        "results": results,
        "artifacts": {p.name: _sha256(p) for p in sorted(run.iterdir()) if p.is_file()},
    }
    (run / "result.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n",
                                     encoding="utf-8")
    return report


# --------------------------------------------------------------------------
# Timeline mode
# --------------------------------------------------------------------------

def _run_case(trigger: int, span: float, *, rearm: bool = True) -> dict:
    actions: list[dict] = [{"t": 0.0, "kind": "pending", "trigger": trigger}]
    t = 0.4
    while t < span:
        actions.append({"t": round(t, 2), "kind": "sample"})
        t += 1.5
    if rearm:
        actions.append({"t": round(span + 1.0, 2), "kind": "pending", "trigger": trigger})
        actions.append({"t": round(span + 3.0, 2), "kind": "sample"})
        actions.append({"t": round(span + 6.0, 2), "kind": "sample"})
    return {"actions": actions}


TIMELINE_CASES: dict[str, dict] = {
    # No injection at all: the parked interpreter is sampled for as long as the
    # longest response takes.
    "control": {"actions": [{"t": t, "kind": "sample"} for t in (0.4, 6.0, 14.0, 24.0)]},
    "run-5": _run_case(0x05, 26.0),
    "run-6": _run_case(0x06, 11.0),
    "run-11": _run_case(0x0B, 12.0),
    "run-20": _run_case(0x14, 8.0),
    "run-62": _run_case(0x3E, 18.0),
    # A second trigger written while the first response is running, which is
    # exactly what the busy path's queue does, and then observed being taken up.
    "run-pending": {"actions": sorted(
        [{"t": 0.0, "kind": "pending", "trigger": 0x06},
         {"t": 3.0, "kind": "pending", "trigger": 0x05}]
        + [{"t": round(t, 1), "kind": "sample"} for t in
           [0.4, 2.0, 4.0, 6.0, 8.0, 10.0, 13.0, 16.0, 20.0, 24.0, 28.0, 32.0]],
        key=lambda a: (a["t"], 0 if a["kind"] == "pending" else 1))},
    # Whole-machine state saved partway through a response and resumed in a
    # second process, because Damocles exposes no in-game save here.
    "run-save-resume": {
        "actions": [{"t": 0.0, "kind": "pending", "trigger": 0x3E},
                    {"t": 2.0, "kind": "sample"}, {"t": 5.0, "kind": "sample"},
                    {"t": 5.5, "kind": "statesave"}, {"t": 8.0, "kind": "sample"}],
        "resumeSamples": [1.0, 4.0, 7.0, 10.0, 14.0, 18.0],
    },
}


def _sample(handle, run: Path, prefix: str, index: int, offset: float) -> dict:
    paths = {}
    commands = ["hatari-stop", "hatari-debug setopt hex"]
    for label, base, length in WINDOWS:
        path = run / f"{prefix}{index:02d}-{label}.bin"
        paths[label] = path
        commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
    commands.append("hatari-cont")
    _fifo_send(handle, commands)
    time.sleep(0.25)
    return {"index": index, "offset": offset, "paths": paths}


def _decode_samples(samples: list[dict]) -> list[dict]:
    decoded = []
    for sample in samples:
        missing = [label for label, path in sample["paths"].items() if not path.is_file()]
        if missing:
            decoded.append({"offset": sample["offset"], "missing": missing})
            continue
        blobs = {label: path.read_bytes() for label, path in sample["paths"].items()}
        decoded.append({
            "offset": sample["offset"],
            "sha256": {label: _sha256(path) for label, path in sample["paths"].items()},
            "state": _decode(blobs),
        })
    return decoded


def _launch(command: list[str], log: Path, env: dict) -> subprocess.Popen:
    return subprocess.Popen(command, stdout=log.open("wb"), stderr=subprocess.STDOUT, env=env)


def _wait_for_fifo(fifo: Path) -> None:
    for _ in range(200):
        if fifo.exists():
            return
        time.sleep(0.05)
    raise LabError("Hatari did not create the command FIFO")


def _stop_process(process: subprocess.Popen, fifo: Path) -> None:
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


def _resume_run(*, hatari_binary, tos_path, program_path, config, env, run, state,
                offsets, settle) -> list[dict]:
    fifo = run / "resume.fifo"
    if fifo.exists():
        fifo.unlink()
    parse_script = run / "resume.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari_binary, tos=tos_path, disk_a=program_path,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse_script, fast_forward=False, statusbar=False,
        cmd_fifo=fifo, extra_args=["--memstate", str(state.resolve())],
    )
    samples: list[dict] = []
    process = _launch(command, run / "hatari-resume.log", env)
    try:
        _wait_for_fifo(fifo)
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            t0 = time.monotonic()
            for offset in offsets:
                delay = offset - (time.monotonic() - t0)
                if delay > 0:
                    time.sleep(delay)
                samples.append(_sample(handle, run, "resume", len(samples), offset))
            _fifo_send(handle, ["hatari-stop", "hatari-debug quit"])
            time.sleep(1.0)
    finally:
        _stop_process(process, fifo)
    return _decode_samples(samples)


def run_timeline(name: str, roms_root: Path | None, settle: float) -> dict:
    case = TIMELINE_CASES[name]
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    snapshot = SNAPSHOT.resolve(strict=True)

    run = WORK_ROOT / _run_id(f"pickup-response-{name}")
    run.mkdir(parents=True, exist_ok=True)
    fifo = run / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    (run / "play.txt").write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari_binary, tos=tos_path, disk_a=program_path,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=run / "play.txt", fast_forward=False, statusbar=False,
        cmd_fifo=fifo, extra_args=["--memstate", str(snapshot)],
    )
    env = os.environ | headless_env()
    samples: list[dict] = []
    process = _launch(command, run / "hatari.log", env)
    try:
        _wait_for_fifo(fifo)
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            t0 = time.monotonic()
            for action in case["actions"]:
                delay = action["t"] - (time.monotonic() - t0)
                if delay > 0:
                    time.sleep(delay)
                if action["kind"] == "pending":
                    _fifo_send(handle, [
                        "hatari-stop", "hatari-debug setopt hex",
                        f"hatari-debug {_poke(PENDING, action['trigger'])}",
                        "hatari-cont",
                    ])
                elif action["kind"] == "sample":
                    samples.append(_sample(handle, run, "sample", len(samples), action["t"]))
                elif action["kind"] == "statesave":
                    _fifo_send(handle, [
                        "hatari-stop",
                        f"hatari-debug statesave {run}/midscript.sav",
                        "hatari-cont",
                    ])
                    time.sleep(0.5)
            _fifo_send(handle, [
                "hatari-stop", "hatari-debug setopt hex",
                f"hatari-debug savebin {run}/observed.ram 0 $100000",
                "hatari-debug quit",
            ])
            for _ in range(300):
                if (run / "observed.ram").is_file():
                    break
                time.sleep(0.1)
    finally:
        _stop_process(process, fifo)

    decoded = _decode_samples(samples)
    resume: list[dict] = []
    state = run / "midscript.sav"
    if case.get("resumeSamples") and state.is_file():
        resume = _resume_run(
            hatari_binary=hatari_binary, tos_path=tos_path, program_path=program_path,
            config=config, env=env, run=run, state=state,
            offsets=case["resumeSamples"], settle=settle,
        )

    report = {
        "mode": "timeline",
        "case": name,
        "runId": run.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "scope": "Pending-trigger word written; the launch and the response are the program's own",
        "actions": case["actions"],
        "settleSeconds": settle,
        "images": {"program": _sha256(program_path), "tos": _sha256(tos_path),
                   "memstate": _sha256(snapshot)},
        "toolchain": toolchain.as_dict(),
        "probeSha256": _sha256(Path(__file__).resolve()),
        "observedRam": _sha256(run / "observed.ram") if (run / "observed.ram").is_file() else None,
        "midscriptState": _sha256(state) if state.is_file() else None,
        "samples": decoded,
        "resumeSamples": resume,
    }
    (run / "result.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n",
                                     encoding="utf-8")
    return report


def _print_timeline(report: dict) -> None:
    print(f"{report['case']}: {report['runId']}")
    rows = [(s, False) for s in report["samples"]] + [(s, True) for s in report["resumeSamples"]]
    for sample, resumed in rows:
        if "state" not in sample:
            print(f"      t+{sample['offset']:5.1f}s  MISSING {sample['missing']}")
            continue
        state = sample["state"]
        mark = "resume t+" if resumed else "      t+"
        print(
            f"  {mark}{sample['offset']:5.1f}s  pc={state['scriptPc']} "
            f"flags={state['flags']} gate={state['messageGate']} "
            f"wait={state['waitCounter']:5d} pend={state['pending']} "
            f"dur={state['messageInterval']} timer={state['displayTimer']} "
            f"trig={[state['triggerBytes'][k] for k in sorted(state['triggerBytes'])]}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--mode", choices=("checkpoint", "timeline"), default="checkpoint")
    parser.add_argument("--case", action="append", choices=sorted(TIMELINE_CASES))
    parser.add_argument("--settle", type=float, default=6.0)
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args(argv)

    for _ in range(args.repeat):
        if args.mode == "checkpoint":
            report = run_checkpoints(args.roms, args.settle)
            print(f"checkpoint: verified {len(report['results'])} cases — {report['runId']}")
            for result in report["results"]:
                final = result["states"][-1]
                print(f"  {result['case']:<20} pc={final['scriptPc']} "
                      f"pend={final['pending']} flags={final['flags']}")
        else:
            for name in args.case or list(TIMELINE_CASES):
                _print_timeline(run_timeline(name, args.roms, args.settle))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(2)
