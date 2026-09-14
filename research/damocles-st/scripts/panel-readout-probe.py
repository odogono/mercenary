#!/usr/bin/env python3
"""Damocles impact-clock and navigation readout probe (#208).

Each observation starts from a pinned save state, captures all ST RAM and the
display, applies one controlled input, and captures again at an exact VBL
breakpoint.  Generated evidence remains below the laboratory's ignored work/
directory.

Run from the repository root:

  python3 research/damocles-st/scripts/panel-readout-probe.py \
    --roms /path/to/roms --snapshots /path/to/snapshots clock --vbls 250
  python3 research/damocles-st/scripts/panel-readout-probe.py \
    --roms /path/to/roms --snapshots /path/to/snapshots navigation --vbls 1000
  python3 research/damocles-st/scripts/panel-readout-probe.py \
    --roms /path/to/roms --snapshots /path/to/snapshots velocity --key 4

Use ``compare`` after reading the panel values from the PNGs.  It searches for
source and formatted representations without assuming that a display buffer is
the authoritative cell, and only reports addresses that actually changed:

  python3 research/damocles-st/scripts/panel-readout-probe.py compare \
    RUN/before.ram RUN/after.ram --before 02-29-13 --after 02-24-26

  python3 research/damocles-st/scripts/panel-readout-probe.py poke \
    --address 0x793c --bytes fffff1f0 --vbls 50

The tracked output is this procedure and the resulting research note, never the
RAM images, screenshots, save states, or Working Disassembly.
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
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError, file_hash, validate_image  # noqa: E402
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

RAM_BYTES = 0x100000
STICK = 0x79C2
UP = 0x01
CAMERA_X = 0x7A92
CAMERA_Z = 0x7A9A
NUMBER_SCANCODES = {1: 2, 4: 5, 9: 10}
DEFAULT_SNAPSHOT_ROOT = LAB_ROOT / "snapshots"
SNAPSHOTS = {
    "clock": "eris-spaceport-onfoot.sav",
    "navigation": "eris-spaceport-onfoot.sav",
    "velocity": "boarded-limo.sav",
    "poke": "eris-spaceport-onfoot.sav",
}


def _wait_for(
    path: Path, process: subprocess.Popen[str], seconds: float, size: int | None = None
) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if path.is_file() and (size is None or path.stat().st_size == size):
            return
        if process.poll() is not None:
            break
        time.sleep(0.02)
    raise LabError(f"Timed out waiting for {path}; process status={process.poll()}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _camera(ram: bytes) -> dict[str, int]:
    return {
        "x": int.from_bytes(ram[CAMERA_X : CAMERA_X + 4], "big", signed=True),
        "z": int.from_bytes(ram[CAMERA_Z : CAMERA_Z + 4], "big", signed=True),
    }


def _capture_commands(run: Path, prefix: str) -> list[str]:
    return [
        "setopt hex",
        f"savebin {(run / f'{prefix}.ram').resolve()} 0 ${RAM_BYTES:x}",
        f"screenshot {(run / f'{prefix}.png').resolve()}",
    ]


def _observe(
    *,
    mode: str,
    roms: Path,
    snapshot_root: Path,
    settle_seconds: float,
    vbls: int,
    key: int | None,
    poke_address: int | None = None,
    poke_bytes: bytes | None = None,
    boarded: bool = False,
) -> tuple[Path, dict[str, Any]]:
    authority, config = load_configuration()
    root = resolve_roms_root(roms)
    program, tos = resolve_images(authority, root)
    program_info = validate_image(
        program, authority["programImage"], label="Working Authority STX"
    )
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)

    snapshot_name = SNAPSHOTS["velocity"] if mode == "poke" and boarded else SNAPSHOTS[mode]
    snapshot = snapshot_root / snapshot_name
    if not snapshot.is_file():
        raise LabError(f"Snapshot not found: {snapshot}")

    if mode == "poke":
        assert poke_address is not None and poke_bytes is not None
        suffix = f"{poke_address:x}-{poke_bytes.hex()}-{vbls}vbl"
    elif key is None:
        suffix = f"{vbls}vbl"
    else:
        suffix = f"key{key}-{vbls}vbl"
    run = WORK_ROOT / _run_id(f"panel-{mode}-{suffix}")
    run.mkdir(parents=True)
    fifo_path = run / "cmd.fifo"
    parse = run / "play.txt"
    endpoint = run / "endpoint.txt"
    parse.write_text("c\n", encoding="utf-8")
    endpoint.write_text(
        "\n".join(
            (
                "setopt hex",
                f"savebin {(run / 'after.ram').resolve()} 0 ${RAM_BYTES:x}",
                f"w ${STICK:x} 00",
                f"logfile {(run / 'after.registers.log').resolve()}",
                "r",
                "c",
                "",
            )
        ),
        encoding="utf-8",
    )
    command = build_hatari_command(
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
    env = os.environ.copy()
    env.update(headless_env())
    before_path = run / "before.ram"
    after_path = run / "after.ram"
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env
        )
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            if not fifo_path.exists():
                raise LabError(f"Hatari did not create {fifo_path}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle_seconds)
                _fifo_send(
                    fifo,
                    [
                        "hatari-stop",
                        "hatari-debug setopt hex",
                        *[
                            f"hatari-debug {command}"
                            for command in _capture_commands(run, "before")
                        ],
                        f"hatari-debug logfile {(run / 'before.registers.log').resolve()}",
                        "hatari-debug r",
                        "hatari-cont",
                    ],
                )
                _wait_for(before_path, process, 15, RAM_BYTES)

                if mode == "navigation":
                    _fifo_send(
                        fifo,
                        [
                            "hatari-stop",
                            f"hatari-debug w ${STICK:x} {UP:02x}",
                            (
                                f'hatari-debug b VBL = "VBL+{vbls}" :once :quiet '
                                f":file {endpoint.resolve()}"
                            ),
                            "hatari-cont",
                        ],
                    )
                elif mode == "velocity":
                    assert key is not None
                    scan = NUMBER_SCANCODES[key]
                    # Number keys only take if the game loop is running.
                    _fifo_send(fifo, [f"hatari-event keydown {scan}"])
                    time.sleep(0.12)
                    _fifo_send(fifo, [f"hatari-event keyup {scan + 128}"])
                    time.sleep(max(1.2, vbls / 50.0))
                    _fifo_send(
                        fifo,
                        [
                            "hatari-stop",
                            *[
                                f"hatari-debug {command}"
                                for command in _capture_commands(run, "after")
                            ],
                            "hatari-debug quit",
                        ],
                    )
                elif mode == "poke":
                    assert poke_address is not None and poke_bytes is not None
                    payload = " ".join(f"{byte:02x}" for byte in poke_bytes)
                    _fifo_send(
                        fifo,
                        [
                            "hatari-stop",
                            f"hatari-debug w ${poke_address:x} {payload}",
                            (
                                f'hatari-debug b VBL = "VBL+{vbls}" :once :quiet '
                                f":file {endpoint.resolve()}"
                            ),
                            "hatari-cont",
                        ],
                    )
                else:
                    _fifo_send(
                        fifo,
                        [
                            "hatari-stop",
                            (
                                f'hatari-debug b VBL = "VBL+{vbls}" :once :quiet '
                                f":file {endpoint.resolve()}"
                            ),
                            "hatari-cont",
                        ],
                    )
                if mode == "velocity":
                    _wait_for(after_path, process, 20, RAM_BYTES)
                    _wait_for(run / "after.png", process, 10)
                else:
                    _wait_for(after_path, process, max(25, vbls / 20 + 25), RAM_BYTES)
                    # A VBL breakpoint can land while Damocles is redrawing its
                    # single display buffer. Preserve the exact-VBL RAM above, then
                    # let drawing settle before taking the human-readable PNG.
                    time.sleep(0.35)
                    _fifo_send(
                        fifo,
                        [
                            "hatari-stop",
                            f"hatari-debug screenshot {(run / 'after.png').resolve()}",
                            "hatari-debug quit",
                        ],
                    )
                    _wait_for(run / "after.png", process, 10)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if fifo_path.exists():
                fifo_path.unlink()

    before = before_path.read_bytes()
    after = after_path.read_bytes()
    changed = [address for address, pair in enumerate(zip(before, after)) if pair[0] != pair[1]]
    result: dict[str, Any] = {
        "schemaVersion": 1,
        "mode": mode,
        "vbls": vbls,
        "key": key,
        "pokeAddress": None if poke_address is None else f"${poke_address:06X}",
        "pokeBytes": None if poke_bytes is None else poke_bytes.hex(),
        "changedByteCount": len(changed),
        "changedLowRamAddresses": [
            f"${address:06X}" for address in changed if address < 0x10000
        ],
        "cameraBefore": _camera(before),
        "cameraAfter": _camera(after),
        "artifacts": {
            name: {"path": path.name, "sha256": _sha256(path)}
            for name, path in (
                ("beforeRam", before_path),
                ("afterRam", after_path),
                ("beforeDisplay", run / "before.png"),
                ("afterDisplay", run / "after.png"),
            )
        },
        "authority": {
            "programSha256": program_info["hashes"]["sha256"],
            "tosSha256": tos_info["hashes"]["sha256"],
            "snapshotSha256": file_hash(snapshot),
        },
        "toolchain": toolchain.as_dict(),
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    (run / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return run, result


def _digit_groups(text: str) -> list[int]:
    groups = [int(group) for group in re.findall(r"\d+", text)]
    if not groups:
        raise LabError(f"Readout must contain decimal digit groups: {text!r}")
    return groups


def _encodings(text: str) -> dict[str, bytes]:
    digits = "".join(character for character in text if character.isdigit())
    groups = _digit_groups(text)
    encodings: dict[str, bytes] = {
        "ascii-exact": text.encode("ascii"),
        "ascii-digits": digits.encode("ascii"),
    }
    if len(digits) % 2 == 0:
        encodings["packed-bcd"] = bytes(
            int(digits[index : index + 2], 16) for index in range(0, len(digits), 2)
        )
    for index, value in enumerate(groups):
        for size in (2, 4):
            if value < 1 << (size * 8):
                encodings[f"group-{index}-be{size * 8}"] = value.to_bytes(size, "big")
                encodings[f"group-{index}-le{size * 8}"] = value.to_bytes(size, "little")
    if len(groups) == 3 and all(group < 60 for group in groups[1:]):
        total = groups[0] * 3600 + groups[1] * 60 + groups[2]
        encodings["hms-seconds-be32"] = total.to_bytes(4, "big")
        encodings["hms-seconds-le32"] = total.to_bytes(4, "little")
    return encodings


def _matches(data: bytes, pattern: bytes) -> set[int]:
    found: set[int] = set()
    start = 0
    while True:
        address = data.find(pattern, start)
        if address < 0:
            return found
        found.add(address)
        start = address + 1


def _compare(before_path: Path, after_path: Path, before_text: str, after_text: str) -> int:
    before, after = before_path.read_bytes(), after_path.read_bytes()
    if len(before) != len(after):
        raise LabError("RAM captures differ in size")
    left, right = _encodings(before_text), _encodings(after_text)
    names = sorted(set(left) & set(right))
    report: list[dict[str, Any]] = []
    for name in names:
        if left[name] == right[name] or len(left[name]) < 3:
            continue
        before_addresses = _matches(before, left[name])
        after_addresses = _matches(after, right[name])
        same_addresses = sorted(
            address
            for address in before_addresses & after_addresses
            if before[address : address + len(left[name])]
            != after[address : address + len(right[name])]
        )
        if same_addresses:
            report.append(
                {
                    "encoding": name,
                    "beforeHex": left[name].hex(),
                    "afterHex": right[name].hex(),
                    "addresses": [f"${address:06X}" for address in same_addresses],
                }
            )
    print(json.dumps(report, indent=2))
    return 0


def _changes(before_path: Path, after_path: Path, start: int, end: int) -> int:
    before, after = before_path.read_bytes(), after_path.read_bytes()
    if len(before) != len(after):
        raise LabError("RAM captures differ in size")
    if start < 0 or end <= start or end > len(before):
        raise LabError("Change window is outside the RAM captures")
    changed_words = sorted(
        {
            address & ~1
            for address in range(start, end)
            if before[address] != after[address]
        }
    )
    report = [
        {
            "address": f"${address:06X}",
            "beforeHex": before[address : address + 4].hex(),
            "afterHex": after[address : address + 4].hex(),
            "beforeU16": int.from_bytes(before[address : address + 2], "big"),
            "afterU16": int.from_bytes(after[address : address + 2], "big"),
            "beforeU32": int.from_bytes(before[address : address + 4], "big"),
            "afterU32": int.from_bytes(after[address : address + 4], "big"),
        }
        for address in changed_words
    ]
    print(json.dumps(report, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path)
    parser.add_argument("--snapshots", type=Path, default=DEFAULT_SNAPSHOT_ROOT)
    parser.add_argument("--settle-seconds", type=float, default=3.0)
    subparsers = parser.add_subparsers(dest="mode", required=True)
    for name, default_vbls in (("clock", 250), ("navigation", 1000)):
        command = subparsers.add_parser(name)
        command.add_argument("--vbls", type=int, default=default_vbls)
    velocity = subparsers.add_parser("velocity")
    velocity.add_argument("--key", type=int, choices=tuple(NUMBER_SCANCODES), required=True)
    velocity.add_argument("--vbls", type=int, default=100)
    poke = subparsers.add_parser("poke")
    poke.add_argument("--address", type=lambda value: int(value, 0), required=True)
    poke.add_argument("--bytes", dest="poke_hex", required=True)
    poke.add_argument("--vbls", type=int, default=50)
    poke.add_argument(
        "--boarded",
        action="store_true",
        help="boot boarded-limo.sav instead of the on-foot snapshot",
    )
    compare = subparsers.add_parser("compare")
    compare.add_argument("before_ram", type=Path)
    compare.add_argument("after_ram", type=Path)
    compare.add_argument("--before", required=True)
    compare.add_argument("--after", required=True)
    changes = subparsers.add_parser("changes")
    changes.add_argument("before_ram", type=Path)
    changes.add_argument("after_ram", type=Path)
    changes.add_argument("--start", type=lambda value: int(value, 0), default=0x7000)
    changes.add_argument("--end", type=lambda value: int(value, 0), default=0x8000)
    args = parser.parse_args()

    if args.mode == "compare":
        return _compare(args.before_ram, args.after_ram, args.before, args.after)
    if args.mode == "changes":
        return _changes(args.before_ram, args.after_ram, args.start, args.end)
    if args.vbls <= 0:
        parser.error("--vbls must be positive")
    poke_bytes = None
    poke_address = None
    boarded = False
    if args.mode == "poke":
        poke_address = args.address
        boarded = args.boarded
        try:
            poke_bytes = bytes.fromhex(args.poke_hex)
        except ValueError as error:
            parser.error(f"invalid --bytes: {error}")
    run, result = _observe(
        mode=args.mode,
        roms=args.roms,
        snapshot_root=args.snapshots,
        settle_seconds=args.settle_seconds,
        vbls=args.vbls,
        key=args.key if args.mode == "velocity" else None,
        poke_address=poke_address,
        poke_bytes=poke_bytes,
        boarded=boarded,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    print(f"run {run}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error
