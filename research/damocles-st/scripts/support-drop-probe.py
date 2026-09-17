#!/usr/bin/env python3
"""Ordinary-route support placement and multi-object drops on Vesta (#331).

#315 recovered the drop handler's nearby-support branch, its rank comparison,
its model-form gate and its height gate from instructions, and could not reach
any of them on an ordinary route: the only replayable arrival pose had one
takeable resident in reach and an empty Carried Stack.

The `vesta-parliament-4-6` pose has both. Rehosted onto the pinned Hatari build
by ``memstate-rehost.py``, it restores standing in Vesta Parliament (body `$38`,
cell `$64`, region 9, structure 90) carrying three objects, a few thousand
source units from an authored support pair — `SCROLL` slot 153 resting on
`TABLE` slot 202 — and from `PROCESSORS DESK` slot 230, which supplies a lower
support rank than the table does.

Nothing is injected. Walking is the joystick softcopy byte the laboratory
already uses, take, drop and inventory scrolling are real key events, and every
sample is a ``savebin`` taken while the machine is stopped. Results, captures
and screenshots stay in the ignored run directory.

Usage (from the repository root):

  python3 research/damocles-st/scripts/support-drop-probe.py --case inventory
  python3 research/damocles-st/scripts/support-drop-probe.py --case multi-drop
  python3 research/damocles-st/scripts/support-drop-probe.py --case pair-drop \
      --gap 12 --nudge 0.3
  python3 research/damocles-st/scripts/support-drop-probe.py --list

See docs/research/damocles-object-drops.md for the rules these cases test.
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

from damocleslab.core import JOYSTICK1_SOFTCOPY, LabError, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    _fifo_send,
    _run_id,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

WORK_ROOT = LAB_ROOT / "work"
SNAPSHOTS = LAB_ROOT / "snapshots"
SNAPSHOT = SNAPSHOTS / "vesta-parliament-4-6.sav"

SCAN_RSHIFT, SCAN_DOWN = 0x36, 0x50
SCAN_LEFT, SCAN_RIGHT = 0x4B, 0x4D

STICK_FORWARD, STICK_STOP = 0x01, 0x00
STICK_LEFT, STICK_RIGHT = 0x04, 0x08

# Saved at every sample.
WINDOWS = (("low", 0x006000, 0x2000), ("panel", 0x04DD80, 0x0080))

# Residents this route can reach, with the handling-byte fields the drop
# handler reads (bits 0-1 supplied support rank, bits 2-3 required).
#   3   EAGLE NINE S E    $20  supplies 0, requires 0, take refuses with message
#  68   TRANSPORTER a     $20  supplies 0, requires 0, take refuses with message
# 108   BRIEFCASE         $04  supplies 0, requires 1
# 151   DAMOCLES FILE     $85  supplies 1, requires 1, carried at the pose
# 153   SCROLL            $04  supplies 0, requires 1, resting on slot 202
# 181   KEY - EAGLE 9SE   $84  supplies 0, requires 1, carried at the pose
# 183   KEY- V.I.P. LIMO  $84  supplies 0, requires 1, carried at the pose
# 184   KEY- TARG TOURER  $04  supplies 0, requires 1
# 202   TABLE             $0F  supplies 3, requires 3
# 215   BENCH             $00  supplies 0, requires 0
# 225   PROCESSORS CHAIR  $04  supplies 0, requires 1
# 230   PROCESSORS DESK   $0E  supplies 2, requires 3
WATCH = (3, 68, 108, 151, 153, 181, 183, 184, 202, 215, 225, 230)

# The drop handler's silent refusal and its message refusal target.
DROP_SILENT_REFUSAL = 0x54512
DROP_MESSAGE_REFUSAL = 0x54514


def _drop(t: float) -> list[dict]:
    return [
        {"t": t, "kind": "keydown", "scan": SCAN_RSHIFT},
        {"t": t + 0.55, "kind": "keydown", "scan": SCAN_DOWN},
        {"t": t + 0.70, "kind": "keyup", "scan": SCAN_DOWN},
        {"t": t + 1.00, "kind": "keyup", "scan": SCAN_RSHIFT},
    ]


def _scroll(t: float, scan: int) -> list[dict]:
    return [
        {"t": t, "kind": "keydown", "scan": SCAN_RSHIFT},
        {"t": t + 0.55, "kind": "keydown", "scan": scan},
        {"t": t + 0.70, "kind": "keyup", "scan": scan},
        {"t": t + 1.00, "kind": "keyup", "scan": SCAN_RSHIFT},
    ]


def _walk(t: float, seconds: float, byte: int = STICK_FORWARD) -> list[dict]:
    return [
        {"t": t, "kind": "stick", "byte": byte},
        {"t": t + seconds, "kind": "stick", "byte": STICK_STOP},
    ]


def build_case(name: str, approach: float, turn: float, gap: float, rotate: int,
               nudge: float, breakpoint_enabled: bool) -> list[dict]:
    """Every case starts from the restored pose; ``approach`` is walk seconds."""
    actions: list[dict] = []
    if name == "inventory":
        return [{"t": 1.0, "kind": "sample", "shot": True},
                {"t": 4.0, "kind": "sample", "shot": True}]

    if name in ("scroll-right", "scroll-left"):
        scan = SCAN_RIGHT if name == "scroll-right" else SCAN_LEFT
        actions.append({"t": 1.0, "kind": "sample"})
        actions += _scroll(1.5, scan)
        actions.append({"t": 3.2, "kind": "sample", "shot": True})
        actions += _scroll(4.0, scan)
        actions.append({"t": 5.7, "kind": "sample", "shot": True})
        actions += _scroll(6.5, scan)
        actions.append({"t": 8.2, "kind": "sample", "shot": True})
        actions.append({"t": 10.0, "kind": "sample"})
        return actions

    if name == "multi-drop":
        if breakpoint_enabled:
            actions.append({"t": 0.3, "kind": "breakpoint", "label": "refusal",
                            "expr": f"pc = ${DROP_SILENT_REFUSAL:x}"})
        actions.append({"t": 1.0, "kind": "sample"})
        actions += _drop(1.5)
        actions.append({"t": 4.0, "kind": "sample", "shot": True})
        actions += _drop(5.0)
        actions.append({"t": 7.5, "kind": "sample", "shot": True})
        actions += _drop(8.5)
        actions.append({"t": 11.0, "kind": "sample", "shot": True})
        actions += _drop(12.0)
        actions.append({"t": 14.5, "kind": "sample", "shot": True})
        return actions

    if name == "pair-drop":
        # Drop the head, wait ``gap`` seconds for the selection to settle on it,
        # then drop the next object onto it. ``rotate`` presses the inventory
        # scroll first, so the caller chooses which object lands first.
        if breakpoint_enabled:
            actions.append({"t": 0.3, "kind": "breakpoint", "label": "refusal",
                            "expr": f"pc = ${DROP_MESSAGE_REFUSAL:x}"})
        cursor = 1.0
        actions.append({"t": cursor, "kind": "sample"})
        for _ in range(rotate):
            cursor += 0.5
            actions += _scroll(cursor, SCAN_RIGHT)
            cursor += 1.5
        cursor += 0.5
        actions += _drop(cursor)
        cursor += 2.5
        step = max(1.5, gap / 4.0)
        for _ in range(4):
            actions.append({"t": cursor, "kind": "sample"})
            cursor += step
        actions.append({"t": cursor, "kind": "sample", "shot": True})
        cursor += 0.5
        if nudge:
            # A short step so the player no longer stands where the first object
            # landed. Direct placement then writes the new position; a support
            # placement writes the support's. That separates the two paths on an
            # ordinary route, without a breakpoint.
            actions += _walk(cursor, nudge)
            cursor += nudge + 0.5
            actions.append({"t": cursor, "kind": "sample"})
            cursor += 0.5
        actions += _drop(cursor)
        cursor += 3.0
        actions.append({"t": cursor, "kind": "sample", "shot": True})
        actions.append({"t": cursor + 3.0, "kind": "sample"})
        return actions

    if name == "walk":
        # Instrumented approach with no take or drop, used to calibrate the
        # walk seconds the support cases need.
        actions.append({"t": 1.0, "kind": "sample"})
        if turn:
            actions += _walk(1.5, abs(turn), STICK_RIGHT if turn > 0 else STICK_LEFT)
        start = 1.5 + abs(turn) + 0.5
        actions += _walk(start, approach)
        cursor = start
        while cursor < start + approach:
            cursor += 5.0
            actions.append({"t": min(cursor, start + approach), "kind": "sample"})
        actions.append({"t": start + approach + 1.5, "kind": "sample", "shot": True})
        return actions

    raise LabError(f"unknown case: {name}")


CASES = ("inventory", "scroll-right", "scroll-left", "multi-drop", "pair-drop", "walk")


def _u16(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 2], "big")


def _u32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big")


def _s32(data: bytes, base: int, address: int) -> int:
    return int.from_bytes(data[address - base : address - base + 4], "big", signed=True)


def _exponent(distance: int) -> int:
    return distance.bit_length() - 1 if distance > 0 else -1


def decode(blobs: dict[str, bytes]) -> dict:
    low, panel = blobs["low"], blobs["panel"]
    lb, pb = 0x6000, 0x04DD80
    px, py, pz = _s32(low, lb, 0x7AB2), _s32(low, lb, 0x7AB6), _s32(low, lb, 0x7ABA)
    state = {
        "carriedCount": _u16(low, lb, 0x61CC),
        "carriedStack": list(low[0x61CE - lb : 0x61CE - lb + 12]),
        "capacity": _u16(low, lb, 0x7A04),
        "stashedExcess": _u16(low, lb, 0x61CA),
        "panelScroll": f"0x{_u16(panel, pb, 0x4DDD0):04x}",
        "panelPointer": f"0x{_u32(panel, pb, 0x4DDCC):08x}",
        "playerX": px,
        "playerY": py,
        "playerZ": pz,
        "yaw": _u16(low, lb, 0x7AC2),
        "region": _u16(low, lb, 0x7AFC),
        "regionFlags": f"0x{_u16(low, lb, 0x7B34):04x}",
        "structure": _u16(low, lb, 0x7AF0),
        "level": _u16(low, lb, 0x7B02),
        "builderLevel": _u16(low, lb, 0x7AA4),
        "cell": _u16(low, lb, 0x7B5C),
        "body": f"0x{_u16(low, lb, 0x7AA8):04x}",
        "placementMode": _u16(low, lb, 0x7AAE),
        "groundContact": _u16(low, lb, 0x7ACA),
        "onFoot": _u16(low, lb, 0x7A8E),
        "dropGroupByte": low[0x794F - lb],
        "dropClassByte": low[0x7A39 - lb],
        "dropBodyByte": f"0x{low[0x7AC9 - lb]:02x}",
        "dropLevelByte": low[0x7AC5 - lb],
        "builderLevelByte": low[0x7AA5 - lb],
        "dropRegionByte": low[0x7AFD - lb],
        "dropCellByte": low[0x7B5D - lb],
        "selection": f"0x{_u32(low, lb, 0x7B46):08x}",
        "selectionSlot": _u32(low, lb, 0x7B46) // 4,
        "selectionExponent": _u16(low, lb, 0x7B42),
        "supportBypassByte": f"0x{low[0x7046 - lb]:02x}",
        "soldMarker": f"0x{_u16(low, lb, 0x795C):04x}",
        "soundGuard": _u16(low, lb, 0x7A0C),
        "scriptPc": f"0x{_u32(low, lb, 0x781E):08x}",
        "messageGate": f"0x{_u16(low, lb, 0x7BA0):04x}",
        "messagePointer": f"0x{_u32(low, lb, 0x7B98):08x}",
        "residents": {},
    }
    for slot in WATCH:
        offset = slot * 4
        x, y, z = (_s32(low, lb, 0x63A8 + offset), _s32(low, lb, 0x67A8 + offset),
                   _s32(low, lb, 0x6BA8 + offset))
        association_a = _u32(low, lb, 0x6FA8 + offset)
        handling = (association_a >> 8) & 0xFF
        distance = max(abs(x - px), abs(z - pz))
        state["residents"][str(slot)] = {
            "associationA": f"0x{association_a:08x}",
            "associationB": f"0x{_u32(low, lb, 0x73A8 + offset):08x}",
            "handling": f"0x{handling:02x}",
            "supplies": handling & 0x03,
            "requires": (handling >> 2) & 0x03,
            "carried": handling >> 7,
            "x": x, "y": y, "z": z,
            "heading": low[0x77A8 - lb + slot],
            "chebyshev": distance,
            "exponent": _exponent(distance),
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


def run_case(name: str, roms_root: Path | None, settle: float, approach: float,
             turn: float, gap: float, rotate: int, nudge: float,
             breakpoint_enabled: bool) -> dict:
    actions = sorted(
        build_case(name, approach, turn, gap, rotate, nudge, breakpoint_enabled),
        key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1),
    )

    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    if not SNAPSHOT.is_file():
        raise LabError(
            f"Snapshot not found: {SNAPSHOT}. Rehost it first with "
            "research/damocles-st/scripts/memstate-rehost.py"
        )

    run_directory = WORK_ROOT / _run_id(f"support-drop-{name}")
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
                    _fifo_send(handle, [
                        "hatari-stop",
                        "hatari-debug setopt hex",
                        f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {action['byte']:02x}",
                        "hatari-cont",
                    ])
                elif kind in ("keydown", "keyup"):
                    _fifo_send(handle, [f"hatari-event {kind} {action['scan']}"])
                elif kind == "breakpoint":
                    _fifo_send(handle, [
                        "hatari-stop",
                        f"hatari-debug b {action['expr']} :once :quiet",
                        "hatari-cont",
                    ])
                elif kind == "sample":
                    samples.append(_sample(handle, run_directory, len(samples),
                                           action["t"], action.get("shot", False)))
            _fifo_send(handle, ["hatari-stop"])
            time.sleep(0.4)
    finally:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)

    for sample in samples:
        blobs = {label: path.read_bytes() for label, path in sample["paths"].items()}
        missing = [label for label, blob in blobs.items() if not blob]
        if missing:
            raise LabError(f"sample {sample['index']} missing {missing}")
        sample["sha256"] = {label: _sha256(path) for label, path in sample["paths"].items()}
        sample["state"] = decode(blobs)
        sample["paths"] = {label: str(path) for label, path in sample["paths"].items()}

    result = {
        "case": name,
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "runDirectory": str(run_directory),
        "memstate": {"path": str(SNAPSHOT), "sha256": _sha256(SNAPSHOT)},
        "probe": {"path": str(Path(__file__).resolve().relative_to(Path(__file__).resolve().parents[3])),
                  "sha256": _sha256(Path(__file__).resolve())},
        "toolchain": toolchain,
        "approachSeconds": approach,
        "turnSeconds": turn,
        "gapSeconds": gap,
        "rotatePresses": rotate,
        "nudgeSeconds": nudge,
        "actions": actions,
        "samples": samples,
    }
    (run_directory / "result.json").write_text(
        json.dumps(result, indent=1, sort_keys=True, default=str) + "\n", encoding="utf-8")
    return result


def summarise(result: dict) -> None:
    print(f"{result['case']}: {Path(result['runDirectory']).name}")
    for sample in result["samples"]:
        s = sample["state"]
        near = sorted(
            ((v["exponent"], slot) for slot, v in s["residents"].items() if v["carried"] == 0),
        )[:1]
        nearest = f"slot {near[0][1]}/exp {near[0][0]}" if near else "-"
        print(
            f"  t+{sample['offset']:6.2f}s carried={s['carriedCount']} "
            f"stack={s['carriedStack'][:4]} scroll={s['panelScroll']} "
            f"label={s['panelPointer']} sel=slot {s['selectionSlot']}/exp "
            f"{s['selectionExponent']} nearest={nearest} "
            f"pos=({s['playerX']},{s['playerY']},{s['playerZ']}) "
            f"message={s['messageGate']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--case", default="inventory", choices=CASES)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--snapshot", type=Path, default=None,
                        help="memstate to boot; defaults to vesta-parliament-4-6.sav")
    parser.add_argument("--settle", type=float, default=3.0)
    parser.add_argument("--approach", type=float, default=0.0,
                        help="seconds of forward walking before the take or drop")
    parser.add_argument("--turn", type=float, default=0.0,
                        help="seconds of turning first; positive turns right")
    parser.add_argument("--gap", type=float, default=8.0,
                        help="seconds between the two drops of the pair-drop case")
    parser.add_argument("--rotate", type=int, default=0,
                        help="inventory scroll presses before the first drop")
    parser.add_argument("--nudge", type=float, default=0.0,
                        help="seconds of forward walking between the paired drops")
    parser.add_argument("--breakpoint", action="store_true")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.list:
        print("\n".join(CASES))
        return
    if args.snapshot is not None:
        globals()["SNAPSHOT"] = args.snapshot
    result = run_case(args.case, args.roms, args.settle, args.approach,
                      args.turn, args.gap, args.rotate, args.nudge, args.breakpoint)
    if args.json:
        print(json.dumps(result, indent=1, sort_keys=True, default=str))
    else:
        summarise(result)


if __name__ == "__main__":
    main()
