#!/usr/bin/env python3
"""General object drop and residence probe (#315).

Reproduces the ordinary-route take and drop gates that apply to every resident
object, not only to `KEY- V.I.P. LIMO`. Each case boots the tracked
`eris-spaceport-onfoot` memstate, replays ordinary joystick and keyboard input,
and samples low memory while the emulator is stopped.

Cases
  ``take-refusal``   From the arrival pose the nearest drawn object is the
                     INTERSTELLARSHIP (resident slot 7). Its handling byte has
                     bit 5 set, so an ordinary take is refused through the
                     refusal-message branch. The case records that the Carried
                     Stack, the inventory-label scroll counter and the script
                     are untouched.
  ``empty-drop``     A drop with an empty Carried Stack, from the same pose,
                     with the ship still inside the nearby-support distance.
                     The refusal is silent and reaches the drop handler's plain
                     ``rts``.
  ``scroll-refusal`` Take the key on the tracked pickup route and press drop
                     0.2 s later, inside the window the take opens on the
                     inventory-label scroll counter. The drop is refused.
  ``scroll-control`` The same take with the drop 3 s later, outside that
                     window, which places the key.

``--breakpoint`` additionally arms one observational breakpoint on the refusal
instruction of the handler under test. Its callback only saves memory windows
and continues; it writes nothing into the guest. Samples scheduled after a
breakpoint callback have been seen to go missing, so the default is off and the
breakpoint cases are run separately.

Nothing is injected: movement is the joystick softcopy byte the laboratory
already uses, take and drop are real key events, and every sample is a
``savebin`` taken while the machine is stopped. Results, captures and
screenshots stay in the ignored run directory (docs/research/damocles-gap.md).

Usage (from the repository root):

  python3 research/damocles-st/scripts/object-drop-probe.py --roms /path/to/roms
  python3 research/damocles-st/scripts/object-drop-probe.py --case scroll-refusal
  python3 research/damocles-st/scripts/object-drop-probe.py --case take-refusal \
      --breakpoint

See docs/research/damocles-object-drops.md for the recovered rules, the pinned
runs and the location-coverage blockers these cases do not close.
"""

from __future__ import annotations

import argparse
import dataclasses
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
SNAPSHOT = LAB_ROOT / "snapshots" / "eris-spaceport-onfoot.sav"

SCAN_RSHIFT, SCAN_UP, SCAN_DOWN = 0x36, 0x48, 0x50

# Saved at every sample. Offsets inside them are decoded below.
WINDOWS = (("low", 0x006000, 0x2000), ("panel", 0x04DD80, 0x0080))

# Residents watched by every case. Slot 7 is INTERSTELLARSHIP, slot 5 is
# V.I.P. LIMO and slot 183 is KEY- V.I.P. LIMO (docs/research/damocles-vip-limo.md).
WATCH = (5, 7, 183)

# The drop handler's silent refusal and the take handler's refusal-message
# branch, both recovered from the pinned first-world RAM.
DROP_SILENT_REFUSAL = 0x54512
TAKE_MESSAGE_REFUSAL = 0x542DA


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


def _route_actions() -> tuple[list[dict], float]:
    """The tracked walk into the room, anchored on its first walking segment."""
    route = json.loads(ROUTE.read_text(encoding="utf-8"))
    starts, cursor = [], 0.0
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


def _take_then_drop(gap: float, breakpoint_enabled: bool) -> list[dict]:
    """Take the key, then press drop ``gap`` seconds after the take input."""
    actions, take_at = _route_actions()
    if breakpoint_enabled:
        actions.append(
            {"t": take_at - 4.0, "kind": "breakpoint", "label": "refusal",
             "expr": f"pc = ${DROP_SILENT_REFUSAL:x}"}
        )
    actions += [
        {"t": take_at, "kind": "keydown", "scan": SCAN_RSHIFT},
        {"t": take_at + 0.55, "kind": "keydown", "scan": SCAN_UP},
        {"t": take_at + 0.70, "kind": "keyup", "scan": SCAN_UP},
        {"t": take_at + 0.70 + gap, "kind": "keydown", "scan": SCAN_DOWN},
        {"t": take_at + 0.85 + gap, "kind": "keyup", "scan": SCAN_DOWN},
        {"t": take_at + 1.10 + gap, "kind": "keyup", "scan": SCAN_RSHIFT},
    ]
    for offset in (0.45, 2.2, 5.0, 9.0, 16.0):
        actions.append({"t": take_at + offset, "kind": "sample", "shot": offset == 5.0})
    return actions


def build_case(name: str, breakpoint_enabled: bool) -> list[dict]:
    if name == "take-refusal":
        actions: list[dict] = []
        if breakpoint_enabled:
            actions.append({"t": 0.3, "kind": "breakpoint", "label": "refusal",
                            "expr": f"pc = ${TAKE_MESSAGE_REFUSAL:x}"})
        actions.append({"t": 1.0, "kind": "sample"})
        actions += _take(1.6)
        for t in (3.2, 5.0, 8.0):
            actions.append({"t": t, "kind": "sample", "shot": t == 3.2})
        return actions
    if name == "empty-drop":
        actions = []
        if breakpoint_enabled:
            actions.append({"t": 0.3, "kind": "breakpoint", "label": "refusal",
                            "expr": f"pc = ${DROP_SILENT_REFUSAL:x}"})
        actions.append({"t": 1.0, "kind": "sample"})
        actions += _drop(1.5)
        for t in (4.0, 7.0):
            actions.append({"t": t, "kind": "sample", "shot": t == 7.0})
        return actions
    if name == "scroll-refusal":
        return _take_then_drop(0.20, breakpoint_enabled)
    if name == "scroll-control":
        return _take_then_drop(3.00, breakpoint_enabled)
    raise LabError(f"unknown case: {name}")


CASES = ("take-refusal", "empty-drop", "scroll-refusal", "scroll-control")


def _u16(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 2], "big")


def _u32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big")


def _s32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big", signed=True)


def decode(blobs: dict[str, bytes]) -> dict:
    low, panel = blobs["low"], blobs["panel"]
    lb, pb = 0x6000, 0x04DD80
    state = {
        "carriedCount": _u16(low, lb, 0x61CC),
        "carriedStack": list(low[0x61CE - lb : 0x61CE - lb + 12]),
        "capacity": _u16(low, lb, 0x7A04),
        "stashedExcess": _u16(low, lb, 0x61CA),
        "panelScroll": f"0x{_u16(panel, pb, 0x4DDD0):04x}",
        "panelPointer": f"0x{_u32(panel, pb, 0x4DDCC):08x}",
        "playerX": _s32(low, lb, 0x7AB2),
        "playerY": _s32(low, lb, 0x7AB6),
        "playerZ": _s32(low, lb, 0x7ABA),
        "yaw": _u16(low, lb, 0x7AC2),
        "region": _u16(low, lb, 0x7AFC),
        "regionFlags": f"0x{_u16(low, lb, 0x7B34):04x}",
        "structure": _u16(low, lb, 0x7AF0),
        "level": _u16(low, lb, 0x7B02),
        "cell": _u16(low, lb, 0x7B5C),
        "body": f"0x{_u16(low, lb, 0x7AA8):04x}",
        "placementMode": _u16(low, lb, 0x7AAE),
        "groundContact": _u16(low, lb, 0x7ACA),
        "onFoot": _u16(low, lb, 0x7A8E),
        "dropGroupByte": low[0x794F - lb],
        "dropClassByte": low[0x7A39 - lb],
        "dropBodyByte": f"0x{low[0x7AC9 - lb]:02x}",
        "dropLevelByte": low[0x7AC5 - lb],
        "dropRegionByte": low[0x7AFD - lb],
        "dropCellByte": low[0x7B5D - lb],
        "selection": f"0x{_u32(low, lb, 0x7B46):08x}",
        "selectionSlot": _u32(low, lb, 0x7B46) // 4,
        "selectionExponent": _u16(low, lb, 0x7B42),
        "soldMarker": f"0x{_u16(low, lb, 0x795C):04x}",
        "soundGuard": _u16(low, lb, 0x7A0C),
        "scriptPc": f"0x{_u32(low, lb, 0x781E):08x}",
        "messageGate": f"0x{_u16(low, lb, 0x7BA0):04x}",
        "messagePointer": f"0x{_u32(low, lb, 0x7B98):08x}",
        "triggerBytes": list(low[0x7CB4 - lb : 0x7CB4 - lb + 8]),
        "residents": {},
    }
    for slot in WATCH:
        offset = slot * 4
        state["residents"][str(slot)] = {
            "associationA": f"0x{_u32(low, lb, 0x6FA8 + offset):08x}",
            "associationB": f"0x{_u32(low, lb, 0x73A8 + offset):08x}",
            "x": _s32(low, lb, 0x63A8 + offset),
            "y": _s32(low, lb, 0x67A8 + offset),
            "z": _s32(low, lb, 0x6BA8 + offset),
            "heading": low[0x77A8 - lb + slot],
        }
    return state


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sample(handle, run_directory: Path, index: int, offset: float, shot: bool) -> dict:
    paths = {}
    commands = ["hatari-stop", "hatari-debug setopt hex"]
    for label, base, length in WINDOWS:
        path = run_directory / f"sample{index:02d}-{label}.bin"
        paths[label] = path
        commands.append(f"hatari-debug savebin {path} ${base:x} ${length:x}")
    if shot:
        commands.append(f"hatari-debug screenshot {run_directory}/sample{index:02d}.png")
    commands.append("hatari-cont")
    _fifo_send(handle, commands)
    time.sleep(0.25)
    return {"index": index, "offset": offset, "paths": paths}


def _decode_pair(low: Path, panel: Path) -> dict:
    return {
        "sha256": {"low": _sha256(low), "panel": _sha256(panel)},
        "state": decode({"low": low.read_bytes(), "panel": panel.read_bytes()}),
    }


def run_case(name: str, roms_root: Path | None, settle: float, breakpoint_enabled: bool) -> dict:
    actions = sorted(
        build_case(name, breakpoint_enabled),
        key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1),
    )

    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    if not SNAPSHOT.is_file():
        raise LabError(f"Snapshot not found: {SNAPSHOT}")

    run_directory = WORK_ROOT / _run_id(f"object-drop-{name}")
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
        extra_args=["--memstate", str(SNAPSHOT.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())

    samples: list[dict] = []
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
            started = time.monotonic()
            for action in actions:
                delay = action["t"] - (time.monotonic() - started)
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
                        _sample(
                            handle,
                            run_directory,
                            len(samples),
                            action["t"],
                            action.get("shot", False),
                        )
                    )
                elif kind == "breakpoint":
                    callback = run_directory / f"{action['label']}.txt"
                    callback.write_text(
                        "\n".join(
                            [
                                f"savebin {run_directory}/{action['label']}-low.bin $6000 $2000",
                                f"savebin {run_directory}/{action['label']}-panel.bin $4dd80 $80",
                                "c",
                            ]
                        )
                        + "\n",
                        encoding="utf-8",
                    )
                    _fifo_send(
                        handle,
                        [
                            "hatari-stop",
                            "hatari-debug setopt hex",
                            f"hatari-debug b {action['expr']} :once :quiet :file {callback}",
                            "hatari-cont",
                        ],
                    )
                    time.sleep(0.3)
            _fifo_send(
                handle,
                [
                    "hatari-stop",
                    "hatari-debug setopt hex",
                    f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} 00",
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

    decoded = []
    for sample in samples:
        missing = [label for label, path in sample["paths"].items() if not path.is_file()]
        if missing:
            decoded.append({"offset": sample["offset"], "missing": missing})
            continue
        decoded.append({"offset": sample["offset"], **_decode_pair(*sample["paths"].values())})

    captures = {}
    for low in sorted(run_directory.glob("*-low.bin")):
        if low.name.startswith("sample"):
            continue
        panel = low.with_name(low.name.replace("-low.bin", "-panel.bin"))
        if panel.is_file():
            captures[low.name[: -len("-low.bin")]] = _decode_pair(low, panel)

    result = {
        "case": name,
        "runId": run_directory.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "route": {"path": str(ROUTE), "sha256": _sha256(ROUTE)},
        "memstate": {"path": str(SNAPSHOT), "sha256": _sha256(SNAPSHOT)},
        "probeSha256": _sha256(Path(__file__)),
        "breakpoint": breakpoint_enabled,
        "settleSeconds": settle,
        "inputs": [a for a in actions if a["kind"] != "sample"],
        "watchedSlots": list(WATCH),
        "toolchain": dataclasses.asdict(toolchain)
        if dataclasses.is_dataclass(toolchain)
        else {k: str(v) for k, v in vars(toolchain).items()},
        "samples": decoded,
        "captures": captures,
    }
    (run_directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def _report(result: dict) -> None:
    print(f"{result['case']}: {result['runId']}")
    for sample in result["samples"]:
        if "missing" in sample:
            print(f"        t+{sample['offset']:6.2f}s  windows missing: {sample['missing']}")
            continue
        state = sample["state"]
        print(
            f"        t+{sample['offset']:6.2f}s  carried={state['carriedCount']}"
            f" scroll={state['panelScroll']}"
            f" selection=slot {state['selectionSlot']}/exp {state['selectionExponent']}"
            f" region={state['region']}"
            f" key183 B={state['residents']['183']['associationB']}"
            f" message={state['messageGate']}"
        )
    for label, capture in result["captures"].items():
        state = capture["state"]
        print(
            f"        capture {label}: carried={state['carriedCount']}"
            f" scroll={state['panelScroll']}"
            f" selection=slot {state['selectionSlot']}/exp {state['selectionExponent']}"
            f" body={state['body']} contact={state['groundContact']}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--roms", type=Path, default=None, help="Restricted Material root")
    parser.add_argument("--case", choices=CASES, action="append", default=None)
    parser.add_argument("--settle", type=float, default=2.0)
    parser.add_argument("--breakpoint", action="store_true",
                        help="arm the refusal breakpoint for this case")
    args = parser.parse_args(argv)
    try:
        for name in args.case or list(CASES):
            _report(run_case(name, args.roms, args.settle, args.breakpoint))
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
