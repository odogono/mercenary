#!/usr/bin/env python3
"""Vehicle Key board-gate probe (#404).

Answers whether the board gate's key byte at ``$7272 + slot * 4`` is a
permanent unlock or a carried requirement, by replaying ordinary take, drop
and board inputs and reading the byte and the resulting message.

Static recovery shows the gate's byte is not a private array: ``$7272 + slot*4``
is exactly ``$6FAA + (slot + 178) * 4``, the association-A handling byte of the
paired key resident. So the question is whether bit 7 of that byte survives a
drop.

Cases (``left-limo`` poses stand the player on the V.I.P. LIMO, slot 5, with
``KEY- V.I.P. LIMO`` resident slot 183 carried)

  ``carried-board``       Positive control. Press ``B`` with the key carried.
  ``drop-board``          Step back onto open ground, drop the key, press ``B``.
  ``drop-retake-board``   The same, then retake the key before pressing ``B``.
  ``interior-drop``       From the arrival pose, walk the tracked pickup route
                          into Capital Spaceport region 1, take the key and
                          drop it there, reading the gate byte after the
                          interior insertion path.
  ``indoor-board``        From the interior pose, whose region flag word
                          ``$7B34`` is ``$8000`` (bit 14 clear), press ``B`` to
                          exercise the gate's first guard. ``--breakpoint``
                          arms two observational breakpoints that show the gate
                          is entered and that the region test refuses it.
  ``interior-board``      The same route as ``interior-drop``, then press ``B``
                          beside the dropped key. Indoors the selection is
                          inside the gate's reach, so the refusal that fires is
                          the region-flag guard rather than the reach test.
  ``eagle-carried-board`` Second craft. From the rehosted Vesta pose
                          (scripts/memstate-rehost.py), press ``B`` beside
                          ``EAGLE NINE S E`` (slot 3) with its key carried.
  ``eagle-drop-board``    The same, after dropping the Carried Stack down past
                          ``KEY- EAGLE NINE S E`` (resident slot 181).

Nothing is injected: movement is the joystick-1 softcopy byte the laboratory
already uses, take, drop and board are real key events, and every sample is a
``savebin`` taken while the machine is stopped.

Usage (from the repository root):

  python3 research/damocles-st/scripts/vehicle-key-gate-probe.py --roms /path/to/roms
  python3 research/damocles-st/scripts/vehicle-key-gate-probe.py --case drop-board

See docs/research/damocles-vehicle-key-gate.md for the recovered rule.
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

SCAN_RSHIFT, SCAN_UP, SCAN_DOWN, SCAN_B = 0x36, 0x48, 0x50, 0x30

WINDOWS = (("low", 0x006000, 0x2000), ("panel", 0x04DD80, 0x0080))

# Slot 5 is V.I.P. LIMO and slot 3 EAGLE NINE S E; 183 and 181 are their paired
# keys under the recovered ``key slot = vehicle slot + 178`` relation.
WATCH = (3, 5, 7, 181, 183)
CRAFT = (1, 3, 4, 5, 7)

# The system-string table the gate's refusal chooser indexes (damocles-strings).
STRING_TABLE = 0x070000


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


def _board(t: float) -> list[dict]:
    return [
        {"t": t, "kind": "keydown", "scan": SCAN_B},
        {"t": t + 0.15, "kind": "keyup", "scan": SCAN_B},
    ]


def _board_repeat(t: float, count: int, gap: float = 0.7) -> list[dict]:
    """Press ``B`` several times. The live selection alternates between the craft
    and a nearby building, and only a frame that has the craft selected reaches
    the gate's key test at all; the others are refused for range."""
    actions: list[dict] = []
    for index in range(count):
        actions += _board(t + index * gap)
    return actions


def _route_actions() -> tuple[list[dict], float]:
    """The tracked walk into the Capital Spaceport room, anchored on its first step."""
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


# Cases are (snapshot name, action builder).
# The board gate's entry, its region-flag test (reached only when the reach
# test passed) and the first instruction past that test.
GATE_ENTRY = 0x54302
GATE_REGION_TEST = 0x54310
GATE_PAST_REGION = 0x54318


def build_case(name: str, back: float, breakpoint_enabled: bool) -> tuple[str, list[dict]]:
    if name == "carried-board":
        actions = [{"t": 1.0, "kind": "sample"}]
        actions += _board(1.6)
        actions += [{"t": 3.0, "kind": "sample", "shot": True}, {"t": 5.0, "kind": "sample"}]
        return "left-limo.sav", actions
    if name in ("drop-board", "drop-retake-board"):
        # Step back off the craft so the drop takes the direct-placement path
        # (the nearby-support path needs a selection within distance exponent 6).
        actions = [
            {"t": 1.0, "kind": "sample"},
            {"t": 1.2, "kind": "stick", "byte": 0x02},
            {"t": 1.2 + back, "kind": "stick", "byte": 0x00},
            {"t": 2.0 + back, "kind": "sample"},
        ]
        drop_at = 2.4 + back
        actions += _drop(drop_at)
        actions.append({"t": drop_at + 2.2, "kind": "sample", "shot": True})
        cursor = drop_at + 2.6
        if name == "drop-retake-board":
            actions += _take(cursor)
            actions.append({"t": cursor + 2.2, "kind": "sample"})
            cursor += 2.6
        # Walk back onto the craft so the board press is inside the gate's reach.
        actions += [
            {"t": cursor, "kind": "stick", "byte": 0x01},
            {"t": cursor + back, "kind": "stick", "byte": 0x00},
        ]
        cursor += back + 0.6
        actions.append({"t": cursor - 0.2, "kind": "sample"})
        actions += _board(cursor)
        actions += [
            {"t": cursor + 0.8, "kind": "sample", "shot": True},
            {"t": cursor + 2.5, "kind": "sample"},
            {"t": cursor + 5.0, "kind": "sample"},
        ]
        return "left-limo.sav", actions
    if name == "interior-board":
        # Walk the tracked pickup route, take the key and drop it again so it
        # lies at the player's feet: that puts a selection well inside the
        # gate's reach while still indoors, where $7B34 bit 14 is clear.
        actions, take_at = _route_actions()
        actions += _take(take_at)
        actions += _drop(take_at + 3.0)
        actions.append({"t": take_at + 6.0, "kind": "sample"})
        if breakpoint_enabled:
            # One breakpoint per run: a second ``:once`` breakpoint armed over
            # the FIFO while the first is live was not seen to take.
            label, address = {
                "entry": ("gate-entry", GATE_ENTRY),
                "region": ("region-test", GATE_REGION_TEST),
                "past": ("past-region", GATE_PAST_REGION),
            }[breakpoint_enabled]
            actions.append(
                {"t": take_at + 6.4, "kind": "breakpoint", "label": label,
                 "expr": f"pc = ${address:x}", "repeat": label != "gate-entry"}
            )
        actions += _board_repeat(take_at + 7.6, 8)
        actions.append({"t": take_at + 14.0, "kind": "sample", "shot": True})
        return "eris-spaceport-onfoot.sav", actions
    if name == "interior-drop":
        actions, take_at = _route_actions()
        actions += _take(take_at)
        actions += _drop(take_at + 3.0)
        for offset in (0.45, 2.6, 6.0, 10.0):
            actions.append({"t": take_at + offset, "kind": "sample", "shot": offset == 6.0})
        return "eris-spaceport-onfoot.sav", actions
    if name == "indoor-board":
        actions = []
        if breakpoint_enabled:
            actions += [
                {"t": 0.3, "kind": "breakpoint", "label": "gate-entry",
                 "expr": f"pc = ${GATE_ENTRY:x}"},
                {"t": 0.6, "kind": "breakpoint", "label": "region-test",
                 "expr": f"pc = ${GATE_REGION_TEST:x}"},
                {"t": 0.9, "kind": "breakpoint", "label": "past-region",
                 "expr": f"pc = ${GATE_PAST_REGION:x}"},
            ]
        actions.append({"t": 1.4, "kind": "sample"})
        actions += _board_repeat(2.0, 8)
        actions += [{"t": 8.6, "kind": "sample", "shot": True}, {"t": 10.5, "kind": "sample"}]
        return "interior-window.sav", actions
    if name in ("eagle-carried-board", "eagle-drop-board"):
        # EAGLE NINE S E sits 194 source units away in this pose: inside the
        # gate's reach and outside the drop's nearby-support distance, so the
        # drop takes the direct-placement path without any walking.
        actions = [{"t": 1.0, "kind": "sample"}]
        cursor = 1.6
        if name == "eagle-drop-board":
            # The drop releases the head of the Carried Stack, so reach the
            # craft's own key by dropping the entries stacked above it.
            for _ in range(2):
                actions += _drop(cursor)
                actions.append({"t": cursor + 2.6, "kind": "sample"})
                cursor += 3.6
        if name == "eagle-drop-board":
            # Step off the dropped keys: they now lie at the player's feet and
            # are the nearest drawn object, so the gate reads them as the
            # selection and refuses for slot rather than for the key byte.
            actions += [
                {"t": cursor, "kind": "stick", "byte": 0x01},
                {"t": cursor + 0.8, "kind": "stick", "byte": 0x00},
                {"t": cursor + 1.4, "kind": "sample"},
            ]
            cursor += 1.8
        presses = 1 if name == "eagle-carried-board" else 6
        actions += _board_repeat(cursor, presses)
        if presses > 1:
            # Sample after every press: only the press that lands with the
            # craft selected reaches the key test, and the message it raises
            # lasts 200 display frames from that frame alone.
            for index in range(presses):
                actions.append(
                    {"t": cursor + index * 0.7 + 0.4, "kind": "sample", "shot": True}
                )
        last = cursor + (presses - 1) * 0.7
        actions += [
            {"t": last + 0.8, "kind": "sample", "shot": True},
            {"t": last + 1.8, "kind": "sample", "shot": True},
            {"t": last + 3.2, "kind": "sample"},
        ]
        return "rehosted/vesta-parliament-4-6.sav", actions
    raise LabError(f"unknown case: {name}")


CASES = (
    "carried-board",
    "drop-board",
    "drop-retake-board",
    "interior-drop",
    "indoor-board",
    "interior-board",
    "eagle-carried-board",
    "eagle-drop-board",
)


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
        "carriedStack": list(low[0x61CE - lb : 0x61CE - lb + 8]),
        "onFoot": _u16(low, lb, 0x7A8E),
        "aboard": f"0x{_u16(low, lb, 0x7AB0):04x}",
        "body": f"0x{_u16(low, lb, 0x7AA8):04x}",
        "region": _u16(low, lb, 0x7AFC),
        "regionFlags": f"0x{_u16(low, lb, 0x7B34):04x}",
        "placementMode": _u16(low, lb, 0x7AAE),
        "playerX": _s32(low, lb, 0x7AB2),
        "playerY": _s32(low, lb, 0x7AB6),
        "playerZ": _s32(low, lb, 0x7ABA),
        "selection": f"0x{_u32(low, lb, 0x7B46):08x}",
        "selectionSlot": _u32(low, lb, 0x7B46) // 4,
        "selectionExponent": _u16(low, lb, 0x7B42),
        "panelScroll": f"0x{_u16(panel, pb, 0x4DDD0):04x}",
        "messageGate": f"0x{_u16(low, lb, 0x7BA0):04x}",
        "messagePointer": f"0x{_u32(low, lb, 0x7B98):08x}",
        # The gate's own input, one byte per craft slot.
        "gateKeyBytes": {str(s): f"0x{low[0x7272 - lb + s * 4]:02x}" for s in CRAFT},
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


def run_case(
    name: str, roms_root: Path | None, settle: float, back: float, breakpoint_enabled: bool
) -> dict:
    snapshot_name, raw_actions = build_case(name, back, breakpoint_enabled)
    snapshot = LAB_ROOT / "snapshots" / snapshot_name
    actions = sorted(raw_actions, key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1))

    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    if not snapshot.is_file():
        raise LabError(f"Snapshot not found: {snapshot}")

    run_directory = WORK_ROOT / _run_id(f"vehicle-key-{name}")
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
        extra_args=["--memstate", str(snapshot.resolve())],
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
        if process.poll() is not None:
            raise LabError(
                f"Hatari exited before the run started (code {process.returncode}); "
                f"see {run_directory / 'hatari.log'}. A memstate captured by an "
                "IPF-capable build needs scripts/memstate-rehost.py first."
            )
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
                        f"savebin {run_directory}/{action['label']}-low.bin $6000 $2000\n"
                        f"savebin {run_directory}/{action['label']}-panel.bin $4dd80 $80\nc\n",
                        encoding="utf-8",
                    )
                    _fifo_send(
                        handle,
                        [
                            "hatari-stop",
                            "hatari-debug setopt hex",
                            f"hatari-debug b {action['expr']}"
                            f"{'' if action.get('repeat') else ' :once'}"
                            f" :quiet :file {callback}",
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

    result = {
        "case": name,
        "runId": run_directory.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "memstate": {"path": str(snapshot), "sha256": _sha256(snapshot)},
        "route": {"path": str(ROUTE), "sha256": _sha256(ROUTE)},
        "probeSha256": _sha256(Path(__file__)),
        "settleSeconds": settle,
        "stepBackSeconds": back,
        "inputs": [a for a in actions if a["kind"] != "sample"],
        "watchedSlots": list(WATCH),
        "toolchain": dataclasses.asdict(toolchain)
        if dataclasses.is_dataclass(toolchain)
        else {k: str(v) for k, v in vars(toolchain).items()},
        "samples": decoded,
        "breakpoint": breakpoint_enabled,
        "breakpointsHit": sorted(
            path.name[: -len("-low.bin")] for path in run_directory.glob("*-low.bin")
            if not path.name.startswith("sample")
        ),
    }
    (run_directory / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def _report(result: dict) -> None:
    print(f"{result['case']}: {result['runId']}")
    for sample in result["samples"]:
        if "missing" in sample:
            print(f"    t+{sample['offset']:6.2f}s  windows missing: {sample['missing']}")
            continue
        state = sample["state"]
        print(
            f"    t+{sample['offset']:6.2f}s  onFoot={state['onFoot']} aboard={state['aboard']}"
            f" carried={state['carriedCount']}{state['carriedStack'][:3]}"
            f" sel=slot {state['selectionSlot']}/exp {state['selectionExponent']}"
            f" key5={state['gateKeyBytes']['5']} key3={state['gateKeyBytes']['3']}"
            f" msg={state['messageGate']}@{state['messagePointer']}"
            f" regFlags={state['regionFlags']}"
        )
    if result.get("breakpoint"):
        print(f"    breakpoints hit: {result['breakpointsHit'] or 'none'}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--roms", type=Path, default=None, help="Restricted Material root")
    parser.add_argument("--case", choices=CASES, action="append", default=None)
    parser.add_argument("--settle", type=float, default=2.0)
    parser.add_argument("--back", type=float, default=1.5,
                        help="seconds of backward walk before the drop")
    parser.add_argument("--breakpoint", choices=("entry", "region", "past"), default=None,
                        help="arm one observational breakpoint inside the board gate")
    args = parser.parse_args(argv)
    try:
        for name in args.case or list(CASES):
            _report(run_case(name, args.roms, args.settle, args.back, args.breakpoint))
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
