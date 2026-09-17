#!/usr/bin/env python3
"""Object selection and take-range probe (#303).

The take handler recovered by #298 tests two words before it does anything:
``$7B46``, the selected object, and ``$7B42``, the measure it refuses above 8.
This probe observes both while the original program runs ordinary gameplay, so
the rule behind them can be stated in units the Gameplay Session can reproduce.

Three cases run in separate Hatari processes:

``approach``   walk the tracked pickup route with no take input, sampling the
               selection words, the eye position, the candidate lists and the
               resident arrays all the way in. Every sample ranks every slot by
               distance, so the selection rule is observed against the whole
               field rather than inferred from one winner.
``boundary``   walk the same route and press take once, at a route time given
               by ``--take-at``. The sample immediately before the press
               records the measure the handler is about to test; the samples
               after it record whether the take happened. Several runs at
               different times put success and silent refusal on the same
               scale.
``aboard``     boot the boarded-limo snapshot and sample the same words while
               the player occupies a craft, with one take attempt, so the
               on-foot and aboard cases can be compared.

Each sample is a ``savebin`` of three small windows while the emulator is
stopped; nothing is written back into the guest, so these are ordinary
gameplay observations. Every sample also carries a ``derived`` block computed
from that sample's own numbers — the distance to each candidate and the
exponent of that distance — which is arithmetic over observed values, not a
second observation. Captures and RAM stay in the ignored run directory
(docs/research/damocles-gap.md); only decoded facts belong in tracked notes.

Usage (from the repository root):

  python3 research/damocles-st/scripts/object-selection-probe.py \
      --roms /path/to/roms [--case approach] [--take-at 27.5]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
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
ABOARD_SNAPSHOT = LAB_ROOT / "snapshots" / "boarded-limo.sav"

# ST scancodes. Take is Right Shift + Up, exactly as the recorded route held it.
SCAN_RSHIFT = 0x36
SCAN_UP = 0x48

# Windows saved at every sample.
#   low    the resident arrays, the eye position and the selection words
#   lists  the room object list the interior renderer assembles at $B21C
#   panel  the inventory label, which shows whether a take landed
WINDOWS = (
    ("low", 0x006000, 0x2000),
    ("lists", 0x00B200, 0x0100),
    ("panel", 0x04DD80, 0x0080),
)

KEY_SLOT = 183  # KEY- V.I.P. LIMO (docs/research/damocles-vip-limo.md)
LIMO_SLOT = 5  # V.I.P. LIMO
RESIDENT_LIST = 0x7D19  # surface residents of the current body, count at $7B4E
ROOM_LIST = 0x00B21C  # objects the interior renderer collected for this room

# Resident array bases, one four-byte record per slot.
X_BASE, Y_BASE, Z_BASE = 0x63A8, 0x67A8, 0x6BA8
ASSOC_A, ASSOC_B = 0x6FA8, 0x73A8


def _take(t: float) -> list[dict]:
    return [
        {"t": t, "kind": "keydown", "scan": SCAN_RSHIFT},
        {"t": t + 0.55, "kind": "keydown", "scan": SCAN_UP},
        {"t": t + 0.70, "kind": "keyup", "scan": SCAN_UP},
        {"t": t + 1.00, "kind": "keyup", "scan": SCAN_RSHIFT},
    ]


# Sample offsets are route times in seconds, measured from the first walking
# segment. The route reaches the room at about 27 s and stands still from 29 s.
APPROACH_SAMPLES = [6.0, 12.0, 20.0, 24.0, 26.0, 27.0, 27.6, 28.2, 28.7, 29.2, 30.0, 32.7, 35.0]


def _u16(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 2], "big")


def _s32(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 4], "big", signed=True)


def _u32(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 4], "big")


def _slot_record(low: bytes, lb: int, slot: int) -> dict:
    return {
        "slot": slot,
        "position": [_s32(low, lb, base + slot * 4) for base in (X_BASE, Y_BASE, Z_BASE)],
        "associationA": f"0x{_u32(low, lb, ASSOC_A + slot * 4):08x}",
        "associationB": f"0x{_u32(low, lb, ASSOC_B + slot * 4):08x}",
    }


def _exponent(distance: float) -> int | None:
    """The binary exponent the native float carries in its high word."""
    if distance <= 0:
        return None
    return int(math.floor(math.log2(distance)))


def _decode(sample: dict[str, bytes]) -> dict:
    low, lists, panel = sample["low"], sample["lists"], sample["panel"]
    lb, sb, pb = 0x006000, 0x00B200, 0x04DD80

    selected = _u32(low, lb, 0x7B46)
    eye = [_s32(low, lb, address) for address in (0x7A92, 0x7A30, 0x7A9A)]
    origin = [_s32(low, lb, address) for address in (0x799A, 0x799E, 0x79A2)]
    resident_count = _u16(low, lb, 0x7B4E)
    resident_list = list(low[RESIDENT_LIST - lb : RESIDENT_LIST - lb + resident_count])
    room_list = []
    for byte in lists[ROOM_LIST - sb : ROOM_LIST - sb + 32]:
        if byte == 0:
            break
        room_list.append(byte)

    ranked = []
    for slot in range(1, 256):
        position = [_s32(low, lb, base + slot * 4) for base in (X_BASE, Y_BASE, Z_BASE)]
        distance = math.dist(position, eye)
        ranked.append(
            {
                "slot": slot,
                "distanceFromEye": round(distance, 1),
                "distanceExponent": _exponent(distance),
                "associationByte": low[ASSOC_A + slot * 4 + 2 - lb],
                "inResidentList": slot in resident_list,
                "inRoomList": slot in room_list,
            }
        )
    ranked.sort(key=lambda c: c["distanceFromEye"])
    listed = [c for c in ranked if c["inResidentList"] or c["inRoomList"]]
    nearest = listed[0] if listed else None
    selected_slot = selected // 4
    chosen = next((c for c in ranked if c["slot"] == selected_slot), None)

    state = {
        "selectionMeasure": _u16(low, lb, 0x7B42),
        "selectionMantissa": _u16(low, lb, 0x7B44),
        "selectionKey": f"0x{_u32(low, lb, 0x7B42):08x}",
        "selectedObject": f"0x{selected:08x}",
        "selectedSlot": selected_slot,
        "lastDrawnObject": f"0x{_u32(low, lb, 0x7B3E):08x}",
        "eye": eye,
        "queueOrigin": origin,
        "residentListCount": resident_count,
        "residentList": resident_list,
        "roomList": room_list,
        "walkFlag": _u16(low, lb, 0x7A8E),
        "occupiedCraft": f"0x{_u16(low, lb, 0x7A90):04x}",
        "bodySelector": f"0x{_u16(low, lb, 0x7AA8):04x}",
        "cellSelector": f"0x{_u16(low, lb, 0x7B5C):04x}",
        "inventoryCount": _u16(low, lb, 0x61CC),
        "inventorySlots": list(low[0x61CE - lb : 0x61CE - lb + 8]),
        "panelPointer": f"0x{_u32(panel, pb, 0x4DDBC):08x}",
        "keySlot": _slot_record(low, lb, KEY_SLOT),
        "limoSlot": _slot_record(low, lb, LIMO_SLOT),
    }
    state["derived"] = {
        "nearestListed": listed[:6],
        "nearestAnySlot": ranked[:6],
        "selectedDistance": chosen["distanceFromEye"] if chosen else None,
        "selectedExponent": chosen["distanceExponent"] if chosen else None,
        # The mantissa the native float carries is distance / 2**exponent in
        # twelfths of a bit, so 4096 <= mantissa < 8192 for any nonzero value.
        "selectedMantissa": (
            round(chosen["distanceFromEye"] / 2 ** chosen["distanceExponent"] * 4096)
            if chosen and chosen["distanceExponent"] is not None
            else None
        ),
        "measureMatchesSelectedExponent": bool(
            chosen is not None and chosen["distanceExponent"] == state["selectionMeasure"]
        ),
        "selectedIsNearestListed": bool(nearest is not None and nearest["slot"] == selected_slot),
        "withinTakeRange": state["selectionMeasure"] <= 8,
    }
    return state


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _route_actions(route: dict) -> tuple[list[dict], float]:
    """Route stick pokes and keys on one timeline anchored at the first walk."""
    starts: list[float] = []
    cursor = 0.0
    for segment in route["segments"]:
        starts.append(cursor)
        cursor += segment["seconds"]
    first = next(i for i, s in enumerate(route["segments"]) if s["rawByte"] and s["seconds"] > 0)
    anchor = starts[first]

    actions = [
        {"t": starts[i] - anchor, "kind": "stick", "byte": route["segments"][i]["rawByte"]}
        for i in range(first, len(route["segments"]))
    ]
    for event in route["keyboardEvents"]:
        if event["t"] >= anchor:
            actions.append(
                {"t": event["t"] - anchor, "kind": event["type"], "scan": event["stScancode"] & 0x7F}
            )
    return actions, route["takeAtSeconds"] - anchor


def _sample(handle, run_directory: Path, index: int, offset: float) -> dict:
    """Stop the machine, save the observation windows, and continue."""
    paths = {}
    commands = ["hatari-stop", "hatari-debug setopt hex"]
    for label, base, length in WINDOWS:
        path = run_directory / f"sample{index:02d}-{label}.bin"
        paths[label] = path
        commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
    commands.append(f"hatari-debug screenshot {run_directory}/sample{index:02d}.png")
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


def _plan(name: str, route: dict, take_at: float | None) -> tuple[list[dict], float | None, float]:
    """Build one case's action timeline and report where the take lands."""
    if name == "aboard":
        actions: list[dict] = []
        press = 8.0
        for offset in (2.0, 5.0, 7.95, 10.0, 13.0):
            actions.append({"t": offset, "kind": "sample", "offset": offset})
        actions.extend(_take(press))
        actions.sort(key=lambda a: a["t"])
        return actions, press, 16.0

    actions, route_take_at = _route_actions(route)
    if name == "approach":
        for offset in APPROACH_SAMPLES:
            actions.append({"t": offset, "kind": "sample", "offset": offset})
        press = None
        end = max(APPROACH_SAMPLES) + 1.0
    else:
        press = route_take_at if take_at is None else take_at
        # The handler runs on the Up keydown at press + 0.55; sample just
        # before it, then after the response has had time to start and finish.
        for offset in (press + 0.50, press + 2.5, press + 8.0, press + 22.0):
            actions.append({"t": offset, "kind": "sample", "offset": round(offset, 3)})
        actions.extend(_take(press))
        end = press + 24.0
    actions.sort(key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1))
    return actions, press, end


def run_case(name: str, roms_root: Path | None, settle: float, take_at: float | None) -> dict:
    route = json.loads(ROUTE.read_text(encoding="utf-8"))
    actions, press, _end = _plan(name, route, take_at)

    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    if name == "aboard":
        memstate = ABOARD_SNAPSHOT.resolve()
    else:
        memstate = (LAB_ROOT.parent.parent / route["memstate"]).resolve()
    if not memstate.is_file():
        raise LabError(f"Snapshot not found: {memstate}")

    run_directory = WORK_ROOT / _run_id(f"object-selection-{name}")
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
                    samples.append(_sample(handle, run_directory, len(samples), action["offset"]))
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

    result = {
        "case": name,
        "runId": run_directory.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "route": {"path": str(ROUTE), "sha256": _sha256(ROUTE)},
        "takeAt": round(press, 3) if press is not None else None,
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
        "samples": _decode_samples(samples),
    }
    (run_directory / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def _report(result: dict) -> None:
    print(f"{result['case']}: {result['runId']} (take at {result['takeAt']})")
    for sample in result["samples"]:
        if "state" not in sample:
            print(f"  t+{sample['offset']:6.2f}s  MISSING {sample['missing']}")
            continue
        state = sample["state"]
        derived = state["derived"]
        print(
            f"  t+{sample['offset']:6.2f}s  measure={state['selectionMeasure']:3d} "
            f"slot={state['selectedSlot']:3d} inv={state['inventoryCount']} "
            f"dist={derived['selectedDistance']} exp={derived['selectedExponent']} "
            f"mantissa={derived['selectedMantissa']}/{state['selectionMantissa']} "
            f"match={derived['measureMatchesSelectedExponent']} "
            f"nearest={derived['selectedIsNearestListed']}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--case", choices=("approach", "boundary", "aboard"), action="append")
    parser.add_argument(
        "--take-at",
        type=float,
        action="append",
        metavar="SECONDS",
        help="route time for the boundary case's take; repeatable",
    )
    parser.add_argument("--settle", type=float, default=6.0)
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args(argv)

    names = args.case or ["approach"]
    for _ in range(args.repeat):
        for name in names:
            times = args.take_at if (name == "boundary" and args.take_at) else [None]
            for take_at in times:
                _report(run_case(name, args.roms, args.settle, take_at))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(2)
