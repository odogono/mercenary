#!/usr/bin/env python3
"""Limo-key pickup probe (#298).

Replays the tracked walk route into the Capital Spaceport room, supplies the
ordinary take input at a fixed point on that timeline, and samples the machine
state that the pickup path writes: the inventory list, resident slot 183, the
Damocles Script program counter and return stack, the script trigger byte
table, the message gate and the script wait counter.

Eight cases run in separate Hatari processes from the same snapshot:

``control``           walk the route, stand beside the key, press nothing.
``take``              one ordinary take input.
``take-repeat``       a take, a second take while the response is running, and
                      a third after it has finished.
``take-drop``         a take, then the drop input, then a second take.
``midresponse-drop``  drop and re-pick while the initial response is running.
``reverse-surface``   reverse the walk, then drop and re-pick outside.
``surface-leave-return``  leave the surface drop cell and return to re-pick.
``take-save-resume``  a take, an emulator state save partway through the
                      response, and that state resumed in a second process.

Each sample is a ``savebin`` of three small windows while the emulator is
stopped. Joystick softcopy writes supply movement input; no player-position,
object-association or script-state fields are injected. These are gameplay
observations rather than forced placement state. Captures, listings and
RAM stay in the ignored run directory (docs/research/damocles-gap.md); only
decoded facts belong in tracked notes.

Usage (from the repository root):

  python3 research/damocles-st/scripts/limo-key-pickup-probe.py \
      --roms /path/to/roms [--case take] [--repeat 1]

``--tick-rate SECONDS`` instead measures the script wait counter at $7B9C
against the machine's VBL count, which is what turns the recovered wait
threshold into a frame count.
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

from damocleslab.core import JOYSTICK1_SOFTCOPY, LabError, validate_image  # noqa: E402
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

ROUTE = LAB_ROOT / "scenarios" / "limo-key-pickup-route.json"

# ST scancodes. Take is Right Shift + Up and drop is Right Shift + Down; the
# shift hold is reproduced exactly as the original route recorded it.
SCAN_RSHIFT = 0x36
SCAN_UP = 0x48
SCAN_DOWN = 0x50

# Windows saved at every sample. Offsets inside them are decoded below.
WINDOWS = (
    ("low", 0x006000, 0x2000),
    ("panel", 0x04DD80, 0x0080),
    ("timer", 0x0523B0, 0x0010),
)

# Damocles resident slot 183 is KEY- V.I.P. LIMO (docs/research/damocles-vip-limo.md).
KEY_SLOT = 183


def _take(t: float) -> list[dict]:
    return [
        {"t": t, "kind": "keydown", "scan": SCAN_RSHIFT},
        {"t": t + 0.55, "kind": "keydown", "scan": SCAN_UP},
        {"t": t + 0.70, "kind": "keyup", "scan": SCAN_UP},
        {"t": t + 1.00, "kind": "keyup", "scan": SCAN_RSHIFT},
    ]


def _drop(t: float) -> list[dict]:
    return [
        {"t": t, "kind": "keydown", "scan": SCAN_RSHIFT},
        {"t": t + 0.55, "kind": "keydown", "scan": SCAN_DOWN},
        {"t": t + 0.70, "kind": "keyup", "scan": SCAN_DOWN},
        {"t": t + 1.00, "kind": "keyup", "scan": SCAN_RSHIFT},
    ]


# Case timings are relative to the take point on the route timeline.
CASES: dict[str, dict] = {
    "control": {
        "inputs": [],
        "samples": [0.2, 2.0, 6.0, 12.0, 20.0],
    },
    "take": {
        "inputs": _take(0.0),
        "samples": [0.2, 1.4, 2.0, 3.0, 4.0, 6.0, 9.0, 12.0, 16.0, 20.0, 26.0],
    },
    "take-repeat": {
        "inputs": _take(0.0) + _take(4.0) + _take(24.0),
        "samples": [1.4, 3.0, 5.4, 9.0, 16.0, 23.0, 25.4, 27.0, 30.0],
    },
    "take-drop": {
        "inputs": _take(0.0) + _drop(24.0) + _take(28.0),
        "samples": [1.4, 12.0, 23.0, 25.4, 27.0, 29.4, 31.0, 34.0],
    },
    # Movement inputs are built from the route by _reverse_surface_case.
    "reverse-surface": {"inputs": _take(0.0)},
    "surface-leave-return": {"inputs": _take(0.0)},
    "midresponse-drop": {
        "inputs": _take(0.0) + _drop(3.0) + _take(6.0),
        "samples": [1.4, 2.5, 4.4, 5.5, 7.4, 10.0, 16.0, 24.0],
    },
    # Emulator state is saved while the response is still presenting messages,
    # then a second process boots from that state and is sampled again. Damocles
    # has no in-game save here, so this measures whether the interaction is
    # resumable from a whole-machine snapshot rather than a game save.
    "take-save-resume": {
        "inputs": _take(0.0),
        "samples": [1.4, 6.0],
        "stateSaveAt": 6.5,
        "resumeSamples": [1.0, 4.0, 8.0, 12.0, 18.0, 24.0],
    },
}


def _reverse_surface_case(route: dict, *, leave_return: bool = False) -> dict:
    """Replay the successful #312 route candidate; samples establish actual location.

    Host timing drifts, so reversing inputs does not itself prove a surface arrival.
    The initial idle segment is omitted, as in the pinned exploratory run.
    """
    inputs = _take(0.0)
    cursor = 24.0
    for segment in reversed(route["segments"][1:]):
        bits = segment["rawByte"]
        reversed_bits = (
            ((bits & 1) << 1)
            | ((bits & 2) >> 1)
            | ((bits & 4) << 1)
            | ((bits & 8) >> 1)
        )
        inputs.append({"t": cursor, "kind": "stick", "byte": reversed_bits})
        cursor += segment["seconds"]
    inputs.append({"t": cursor, "kind": "stick", "byte": 0})
    inputs.extend(_drop(cursor + 2))
    if leave_return:
        inputs.extend([
            {"t": cursor + 5, "kind": "stick", "byte": 2},
            {"t": cursor + 105, "kind": "stick", "byte": 0},
            {"t": cursor + 108, "kind": "stick", "byte": 1},
            {"t": cursor + 208, "kind": "stick", "byte": 0},
        ])
        inputs.extend(_take(cursor + 212))
        return {
            "inputs": inputs,
            "samples": [1.4, 23] + [
                cursor + offset
                for offset in [3.4, 25, 65, 106, 130, 170, 209, 213.4]
            ],
        }
    inputs.extend(_take(cursor + 6))
    return {
        "inputs": inputs,
        "samples": [
            1.4, 23, *range(26, int(cursor), 5),
            cursor + 1, cursor + 3.4, cursor + 7.4,
        ],
    }


def _u16(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 2], "big")


def _u32(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 4], "big")


def _decode(sample: dict[str, bytes]) -> dict:
    low, panel, timer = sample["low"], sample["panel"], sample["timer"]
    lb, pb, tb = 0x006000, 0x04DD80, 0x0523B0
    slot = KEY_SLOT * 4
    inventory_count = _u16(low, lb, 0x61CC)
    return {
        "inventoryCount": inventory_count,
        "inventorySlots": list(low[0x61CE - lb : 0x61CE - lb + 8]),
        "panelPointer": f"0x{_u32(panel, pb, 0x4DDBC):08x}",
        "panelBusy": f"0x{_u16(panel, pb, 0x4DDD0):04x}",
        "keySlotAssociationA": f"0x{_u32(low, lb, 0x6FA8 + slot):08x}",
        "keySlotAssociationB": f"0x{_u32(low, lb, 0x73A8 + slot):08x}",
        "keySlotX": f"0x{_u32(low, lb, 0x63A8 + slot):08x}",
        "keySlotY": f"0x{_u32(low, lb, 0x67A8 + slot):08x}",
        "eyeX": _u32(low, lb, 0x7A92),
        "eyeY": _u32(low, lb, 0x7A96),
        "eyeZ": _u32(low, lb, 0x7A9A),
        "region": _u16(low, lb, 0x7AFC),
        "regionFlags": _u16(low, lb, 0x7B34),
        "body": _u16(low, lb, 0x7AA8),
        "level": _u16(low, lb, 0x7B02),
        "cell": _u16(low, lb, 0x7B5C),
        "structureSlot": _u16(low, lb, 0x7AF0),
        "placementMode": _u16(low, lb, 0x7AAE),
        "groundContact": _u16(low, lb, 0x7ACA),
        "soundGuard": _u16(low, lb, 0x7A0C),
        "keySlotZ": f"0x{_u32(low, lb, 0x6BA8 + slot):08x}",
        "scriptPc": f"0x{_u32(low, lb, 0x781E):08x}",
        "scriptStack": f"0x{_u32(low, lb, 0x6266):08x}",
        "pendingScript": f"0x{_u16(low, lb, 0x7A88):04x}",
        "triggerBytes": list(low[0x7CB4 - lb : 0x7CB4 - lb + 8]),
        "scriptFlags": f"0x{_u16(low, lb, 0x7BD8):04x}",
        "messagePointer": f"0x{_u32(low, lb, 0x7B98):08x}",
        "messageGate": f"0x{_u16(low, lb, 0x7BA0):04x}",
        "messageResume": f"0x{_u16(low, lb, 0x7B96):04x}",
        "waitCounter": _u16(low, lb, 0x7B9C),
        "timerGate": f"0x{_u16(low, lb, 0x7A26):04x}",
        "displayTimer": f"0x{_u16(timer, tb, 0x523B8):04x}",
        "displayFlag": f"0x{_u16(timer, tb, 0x523BC):04x}",
        "targetObject": f"0x{_u32(low, lb, 0x7B46):08x}",
        "targetRange": _u16(low, lb, 0x7B42),
        "walkFlag": _u16(low, lb, 0x7A8E),
        "occupiedCraft": f"0x{_u16(low, lb, 0x7A90):04x}",
        "scriptKey": f"0x{_u16(low, lb, 0x7B60):04x}",
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _timeline(route: dict, case: dict) -> tuple[list[dict], float]:
    """Interleave route stick pokes, route keys and case inputs on one timeline.

    Anchored at the first walking segment, exactly as the recorded route was
    replayed when the original pickup capture was made.
    """
    starts: list[float] = []
    cursor = 0.0
    for segment in route["segments"]:
        starts.append(cursor)
        cursor += segment["seconds"]
    first = next(i for i, s in enumerate(route["segments"]) if s["rawByte"] and s["seconds"] > 0)
    anchor = starts[first]
    take_at = route["takeAtSeconds"] - anchor

    actions = [
        {"t": starts[i] - anchor, "kind": "stick", "byte": route["segments"][i]["rawByte"]}
        for i in range(first, len(route["segments"]))
    ]
    for event in route["keyboardEvents"]:
        if event["t"] >= anchor:
            actions.append(
                {"t": event["t"] - anchor, "kind": event["type"], "scan": event["stScancode"] & 0x7F}
            )
    for action in case["inputs"]:
        actions.append({**action, "t": take_at + action["t"]})
    for offset in case["samples"]:
        actions.append({"t": take_at + offset, "kind": "sample", "offset": offset})
    if "stateSaveAt" in case:
        actions.append(
            {"t": take_at + case["stateSaveAt"], "kind": "statesave", "offset": case["stateSaveAt"]}
        )
    actions.sort(key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1))
    return actions, take_at


def _sample(handle, run_directory: Path, prefix: str, index: int, offset: float) -> dict:
    """Stop the machine, save the observation windows, and continue."""
    paths = {}
    commands = ["hatari-stop", "hatari-debug setopt hex"]
    for label, base, length in WINDOWS:
        path = run_directory / f"{prefix}{index:02d}-{label}.bin"
        paths[label] = path
        commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
    commands.append(f"hatari-debug screenshot {run_directory}/{prefix}{index:02d}.png")
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
        hashes = {label: _sha256(path) for label, path in sample["paths"].items()}
        decoded.append({"offset": sample["offset"], "sha256": hashes, "state": _decode(blobs)})
    return decoded


def _launch(command: list[str], log: Path, env: dict) -> subprocess.Popen:
    return subprocess.Popen(command, stdout=log.open("wb"), stderr=subprocess.STDOUT, env=env)


def _wait_for_fifo(fifo: Path) -> None:
    for _ in range(100):
        if fifo.exists():
            return
        time.sleep(0.05)
    raise LabError("Hatari did not create the command FIFO")


def _resume_run(
    *,
    hatari_binary: Path,
    tos_path: Path,
    program_path: Path,
    config: dict,
    env: dict,
    run_directory: Path,
    saved_state: Path,
    offsets: list[float],
    settle: float,
) -> list[dict]:
    """Boot a fresh emulator from the mid-response state and sample it again."""
    fifo = run_directory / "resume.fifo"
    if fifo.exists():
        fifo.unlink()
    parse_script = run_directory / "resume-play.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=False,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=["--memstate", str(saved_state.resolve())],
    )
    samples: list[dict] = []
    process = _launch(command, run_directory / "hatari-resume.log", env)
    try:
        _wait_for_fifo(fifo)
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            t0 = time.monotonic()
            for offset in offsets:
                delay = offset - (time.monotonic() - t0)
                if delay > 0:
                    time.sleep(delay)
                samples.append(_sample(handle, run_directory, "resume", len(samples), offset))
            _fifo_send(handle, ["hatari-stop", "hatari-debug quit"])
            time.sleep(1.0)
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
    return _decode_samples(samples)


def run_case(name: str, roms_root: Path | None, settle: float) -> dict:
    case = CASES[name]
    route = json.loads(ROUTE.read_text(encoding="utf-8"))
    if name in ("reverse-surface", "surface-leave-return"):
        case = _reverse_surface_case(route, leave_return=name == "surface-leave-return")
    actions, take_at = _timeline(route, case)

    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    memstate = (LAB_ROOT.parent.parent / route["memstate"]).resolve()
    if not memstate.is_file():
        raise LabError(f"Snapshot not found: {memstate}")

    run_directory = WORK_ROOT / _run_id(f"limo-key-{name}")
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
        fast_forward=False,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=["--memstate", str(memstate)],
    )
    env = os.environ.copy()
    env.update(headless_env())

    samples: list[dict] = []
    process = _launch(command, run_directory / "hatari.log", env)
    try:
        _wait_for_fifo(fifo)
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            t0 = time.monotonic()
            for action in actions:
                delay = action["t"] - (time.monotonic() - t0)
                if delay > 0:
                    time.sleep(delay)
                kind = action["kind"]
                if kind == "stick":
                    _fifo_send(
                        handle,
                        [
                            "hatari-stop",
                            "hatari-debug setopt hex",
                            f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {action['byte']:02x}",
                            "hatari-cont",
                        ],
                    )
                elif kind in ("keydown", "keyup"):
                    _fifo_send(handle, [f"hatari-event {kind} {action['scan']}"])
                elif kind == "sample":
                    samples.append(
                        _sample(handle, run_directory, "sample", len(samples), action["offset"])
                    )
                elif kind == "statesave":
                    _fifo_send(
                        handle,
                        [
                            "hatari-stop",
                            f"hatari-debug statesave {run_directory}/midscript.sav",
                            "hatari-cont",
                        ],
                    )
                    time.sleep(0.5)
            _fifo_send(
                handle,
                [
                    "hatari-stop",
                    "hatari-debug setopt hex",
                    f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} 00",
                    f"hatari-debug savebin {run_directory}/observed.ram 0 $100000",
                    f"hatari-debug screenshot {run_directory}/observed.png",
                    "hatari-debug quit",
                ],
            )
            for _ in range(300):
                if (run_directory / "observed.png").is_file():
                    break
                time.sleep(0.1)
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

    decoded = _decode_samples(samples)

    resume: list[dict] = []
    saved_state = run_directory / "midscript.sav"
    if case.get("resumeSamples") and saved_state.is_file():
        resume = _resume_run(
            hatari_binary=hatari_binary,
            tos_path=tos_path,
            program_path=program_path,
            config=config,
            env=env,
            run_directory=run_directory,
            saved_state=saved_state,
            offsets=case["resumeSamples"],
            settle=settle,
        )

    result = {
        "case": name,
        "runId": run_directory.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "route": {"path": str(ROUTE), "sha256": _sha256(ROUTE), "takeAt": round(take_at, 3)},
        "inputs": case["inputs"],
        "settleSeconds": settle,
        "toolchain": toolchain.as_dict(),
        "images": {
            "program": _sha256(program_path),
            "tos": _sha256(tos_path),
            "memstate": _sha256(memstate),
        },
        "probeSha256": _sha256(Path(__file__).resolve()),
        "observedRam": _sha256(run_directory / "observed.ram")
        if (run_directory / "observed.ram").is_file()
        else None,
        "samples": decoded,
        "midscriptState": _sha256(saved_state) if saved_state.is_file() else None,
        "resumeSamples": resume,
    }
    (run_directory / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def measure_tick_rate(roms_root: Path | None, seconds: int) -> dict:
    """Measure the script wait counter $7B9C against the machine's VBL count.

    The recovered response's only timing constant is a 200-count wait, so the
    unit that counter advances in has to be established before the wait can be
    stated in seconds. The snapshot is parked in the idle script, where nothing
    resets the counter, and both the counter and Hatari's own VBL count are read
    at two stops with the emulator running at normal speed in between.
    """
    route = json.loads(ROUTE.read_text(encoding="utf-8"))
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    memstate = (LAB_ROOT.parent.parent / route["memstate"]).resolve()

    run_directory = WORK_ROOT / _run_id("limo-key-tick-rate")
    run_directory.mkdir(parents=True, exist_ok=True)
    parse_script = run_directory / "measure.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=False,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=["--memstate", str(memstate)],
    )
    env = os.environ.copy()
    env.update(headless_env())
    process = _launch(command, run_directory / "hatari.log", env)
    elapsed = 0.0
    try:
        _wait_for_fifo(fifo)
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(6.0)
            _fifo_send(
                handle,
                [
                    "hatari-stop",
                    "hatari-debug setopt hex",
                    "hatari-debug e VBL",
                    f"hatari-debug savebin {run_directory}/counter-a.bin $7b9c 2",
                    "hatari-cont",
                ],
            )
            time.sleep(0.5)
            mark = time.monotonic()
            time.sleep(seconds)
            elapsed = time.monotonic() - mark
            _fifo_send(
                handle,
                [
                    "hatari-stop",
                    "hatari-debug e VBL",
                    f"hatari-debug savebin {run_directory}/counter-b.bin $7b9c 2",
                    "hatari-debug quit",
                ],
            )
            time.sleep(1.5)
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

    before_path = run_directory / "counter-a.bin"
    after_path = run_directory / "counter-b.bin"
    if not (before_path.is_file() and after_path.is_file()):
        raise LabError("The counter measurement did not produce both samples")
    # `e VBL` prints to Hatari's own output rather than the debugger logfile.
    log_text = (run_directory / "hatari.log").read_text(encoding="utf-8", errors="replace")
    vbls = [int(match) for match in re.findall(r"^= .*#(\d+) \(dec\)", log_text, re.M)]
    if len(vbls) < 2:
        raise LabError("The register log did not record two VBL counts")
    before = int.from_bytes(before_path.read_bytes(), "big")
    later = int.from_bytes(after_path.read_bytes(), "big")
    ticks = (later - before) & 0xFFFF
    frames = vbls[-1] - vbls[0]
    result = {
        "runId": run_directory.name,
        "hostSeconds": round(elapsed, 3),
        "counterBefore": before,
        "counterAfter": later,
        "ticks": ticks,
        "vbls": frames,
        "ticksPerVbl": round(ticks / frames, 4) if frames else None,
        "vblsPerHostSecond": round(frames / elapsed, 3) if elapsed else None,
        "toolchain": toolchain.as_dict(),
        "probeSha256": _sha256(Path(__file__).resolve()),
    }
    (run_directory / "tick-rate.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def _picked_up(result: dict) -> bool:
    return any(
        sample.get("state", {}).get("inventoryCount", 0) > 0 for sample in result["samples"]
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--case", choices=sorted(CASES), action="append")
    parser.add_argument("--settle", type=float, default=6.0)
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--tick-rate", type=int, default=0, metavar="SECONDS")
    args = parser.parse_args(argv)

    if args.tick_rate:
        measured = measure_tick_rate(args.roms, args.tick_rate)
        print(
            f"tick rate: {measured['ticks']} counter ticks over {measured['vbls']} VBLs "
            f"({measured['ticksPerVbl']} per VBL, {measured['vblsPerHostSecond']} VBL/s) "
            f"— {measured['runId']}"
        )
        return 0

    names = args.case or list(CASES)
    for _ in range(args.repeat):
        for name in names:
            # The route stops the player at a slightly different distance on
            # every run, and the take is refused outright when the selected
            # object is out of range, so a case that needs the pickup is
            # retried rather than reported as a result.
            for attempt in range(1, args.attempts + 1):
                result = run_case(name, args.roms, args.settle)
                result["attempt"] = attempt
                if not CASES[name].get("inputs") or _picked_up(result):
                    break
                print(f"{result['case']}: {result['runId']} refused the take, retrying")
            print(f"{result['case']}: {result['runId']}")
            for sample in result["samples"] + [
                {**s, "offset": s["offset"], "resumed": True} for s in result["resumeSamples"]
            ]:
                if "state" in sample:
                    state = sample["state"]
                    mark = "resume t+" if sample.get("resumed") else "      t+"
                    print(
                        f"  {mark}{sample['offset']:5.1f}s  inv={state['inventoryCount']} "
                        f"pc={state['scriptPc']} gate={state['messageGate']} "
                        f"wait={state['waitCounter']:5d} trig={state['triggerBytes'][:4]} "
                        f"flags={state['scriptFlags']} assocA={state['keySlotAssociationA']}"
                    )
                else:
                    print(f"      t+{sample['offset']:5.1f}s  MISSING {sample['missing']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(2)
