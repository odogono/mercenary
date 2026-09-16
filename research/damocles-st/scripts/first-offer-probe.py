#!/usr/bin/env python3
"""Execute the original Damocles first-offer handlers at controlled checkpoints.

Research instrumentation for #287, not a script interpreter or payload writer.
Interrupts and host scheduling are held while the actual 68000 handlers execute.
See docs/research/damocles-first-offer.md for the deliberately bounded claim.
All generated debugger scripts, RAM and results stay in ignored work/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError, file_hash, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    WORK_ROOT, _fifo_send, _run_id, load_configuration, resolve_images,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

# Native return checkpoints, recovered from the pinned image. A wrong path
# times out instead of running a downstream mission consequence.
SKIP, JUMP, RESET, MESSAGE, RECORD, KEY_CLEAR, GATED = (
    0x51A38, 0x519F4, 0x519EC, 0x519E0, 0x51ABC, 0x51C7E, 0x51970,
)
FIELDS = {
    "pc": (0x781E, 4), "counter": (0x7B9C, 2), "keyWord": (0x7B60, 2),
    "gate": (0x7BA0, 2), "messagePointer": (0x7B98, 4),
    "displayTimer": (0x523B8, 2), "messageInterval": (0x70102, 2),
    "soundVector": (0x4BF54, 4), "soundCountdown": (0x7A78, 2),
    "soundGuard": (0x7A0C, 2), "laterSoundGuard": (0x7C0C, 2),
    "alternateSoundPath": (0x33F68, 2), "reward": (0x7C4A, 6),
}


# Fingerprints from the attested first-world capture cited in the research note.
CODE_WINDOWS = (
    (0x5193E, 0x51ABE, "9dbcfcbdc3b3e0f7a6ce1c65e544a0b85e0f35f28ba420db527184d000d90b25"),
    (0x51C74, 0x51C80, "35816c812a18c2fbc7468009d6f805862c99570d7ed75d525095d52f7cdcc4e2"),
    (0x54848, 0x54884, "a78724afcc36e687e34c68e6b10dcf5f89d7b4a4fc03d8dc12dfca70c9e20caf"),
    (0x70650, 0x709C0, "b65c288bcd26d674cf98022ccea6bbdab445c545f9ec8fb99ed984506ecc102f"),
)


def cases() -> list[dict]:
    rows = []
    for ticks in (499, 500):
        for label, key, misses, target in (
            ("none", 0xFF, 3, 0x70818 if ticks < 500 else 0x70830),
            ("X", 0x2D, 3, 0x70818 if ticks < 500 else 0x70830),
            ("Y", 0x15, 0, 0x709AA), ("O", 0x18, 1, 0x709AA),
            ("N", 0x31, 2, 0x70830),
        ):
            match = key in (0x15, 0x18, 0x31)
            rows.append(dict(
                name=f"poll-{ticks}-{label}", pc=0x70818, ticks=ticks, key=key,
                stops=[SKIP] * misses + [JUMP if match or ticks < 500 else SKIP],
                expectedPc=target, expectedRequests=int(match),
            ))
    for label, key in (("none", 0xFF), ("X", 0x2D), ("Y", 0x15), ("O", 0x18), ("N", 0x31)):
        rows.append(dict(name=f"at-wait-500-{label}", pc=0x7082A, ticks=500,
                         key=key, stops=[SKIP], expectedPc=0x70830, expectedRequests=0))
    rows.extend([
        dict(name="Y-after-Y-check-500", pc=0x7081E, ticks=500, key=0x15,
             stops=[SKIP, SKIP, SKIP], expectedPc=0x70830, expectedRequests=0),
        dict(name="Y-after-Y-check-499", pc=0x7081E, ticks=499, key=0x15,
             stops=[SKIP, SKIP, JUMP, JUMP], expectedPc=0x709AA, expectedRequests=1),
        dict(name="entry-and-message-gate", pc=0x707DC, ticks=499, key=0x15,
             stops=[RECORD, KEY_CLEAR, MESSAGE, GATED, GATED],
             expectedPc=0x70816, expectedRequests=0),
        dict(name="message-completed", pc=0x70816, ticks=499, key=0x15,
             stops=[RESET, JUMP], expectedPc=0x709AA, expectedRequests=1),
        dict(name="sound-suppressed", pc=0x70818, ticks=499, key=0x15,
             guard=1, stops=[JUMP], expectedPc=0x709AA, expectedRequests=1),
    ])
    return rows


def poke(address: int, value: int, size: int = 2) -> str:
    return f"w ${address:x} " + " ".join(f"${byte:02x}" for byte in value.to_bytes(size, "big"))


def capture(path: Path) -> str:
    return f"savebin {path} 0 $100000"


def write_commands(path: Path, commands: list[str]) -> None:
    path.write_text("\n".join(commands) + "\n", encoding="utf-8")


def prepare(run: Path, rows: list[dict]) -> None:
    write_commands(run / "boot.txt", ["c"])
    # A persistent trace breakpoint logs EVERY sound request, including unexpected
    # ones. The counter is not reset between cases; results verify its total.
    write_commands(run / "start.txt", [
        capture(run / "baseline.ram"), "r",
        "b pc = $54848 :trace",
        f"parse {run}/case-0-0.txt",
    ])
    for index, case in enumerate(rows):
        for step in range(len(case["stops"]) + 1):
            commands = ["setopt hex"]
            if step == 0:
                commands += [
                    "r SR=$2700",  # Keep counter/input fixed between dispatches.
                    poke(0x781E, case["pc"], 4), poke(0x7B9C, case["ticks"]),
                    poke(0x7B60, case["key"]), poke(0x7BA0, 0),
                    poke(0x7B96, 0), poke(0x7A88, 0),
                    poke(0x7A0C, case.get("guard", 0)),
                    poke(0x7C0C, 0), poke(0x33F68, 0),
                    poke(0x4BF54, 0x51E86, 4), poke(0x7A78, 0),
                    poke(0x7C4A, 0, 6),
                ]
            commands.append(capture(run / f"{case['name']}-{step}.ram"))
            if step == len(case["stops"]):
                commands.append(f"parse {run}/case-{index + 1}-0.txt"
                                if index + 1 < len(rows) else "quit")
            else:
                commands += [
                    f"b pc = ${case['stops'][step]:x} :once :quiet :file {run}/case-{index}-{step + 1}.txt",
                    "r PC=$5193e", "c",
                ]
            write_commands(run / f"case-{index}-{step}.txt", commands)


def read_state(path: Path) -> dict:
    ram = path.read_bytes()
    if len(ram) != 0x100000:
        raise LabError(f"Incomplete RAM capture: {path}")
    return {name: int.from_bytes(ram[address:address + size], "big")
            for name, (address, size) in FIELDS.items()}


def verify(rows: list[dict], run: Path) -> list[dict]:
    results = []
    for case in rows:
        states = [read_state(run / f"{case['name']}-{step}.ram")
                  for step in range(len(case["stops"]) + 1)]
        end = states[-1]
        if end["pc"] != case["expectedPc"]:
            raise LabError(f"{case['name']}: unexpected handoff {end['pc']:#x}")
        if case["name"] == "entry-and-message-gate":
            if [s["pc"] for s in states] != [0x707DC, 0x707E6, 0x707E8, 0x70816, 0x70816, 0x70816]:
                raise LabError("Prompt/gate sequence changed")
            if not (states[1]["reward"] == 0x001000000000
                    and all(s["keyWord"] == 0xFF for s in states[2:])
                    and all(s["counter"] == 499 for s in states)
                    and all(s["gate"] == 1 for s in states[3:])
                    and end["messagePointer"] == 0x707EA
                    and end["displayTimer"] == end["messageInterval"]):
                raise LabError("Reward, key reset, message or gate observation changed")
        elif case["name"] == "message-completed":
            if states[1]["pc"] != 0x70818 or end["counter"] != 0 or end["keyWord"] != 0x15:
                raise LabError("Reset-wait changed the pending key or failed to clear counter")
        elif end["counter"] != case["ticks"] or end["keyWord"] != case["key"]:
            raise LabError(f"{case['name']}: counter/input did not remain stable")
        armed = case["expectedRequests"] and not case.get("guard", 0)
        if end["soundVector"] != (0x4C556 if armed else 0x51E86):
            raise LabError(f"{case['name']}: unexpected sound vector")
        if end["soundCountdown"] != (3 if armed else 0):
            raise LabError(f"{case['name']}: unexpected sound countdown")
        results.append({"case": case, "states": states})
    # Trace action prints one condition per match. Start commands themselves
    # include only 'b pc', so they cannot count as a matching trace condition.
    log = (run / "hatari.log").read_text()
    requests = log.count("\tpc = $54848 :trace\n")
    expected = sum(row["expectedRequests"] for row in rows)
    if requests != expected:
        raise LabError(f"Expected {expected} sound requests; observed {requests}")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    args = parser.parse_args()
    authority, config = load_configuration()
    program, tos = resolve_images(authority, args.roms.resolve())
    program_info = validate_image(program, authority["programImage"], label="Working Authority STX")
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    snapshot = args.snapshot.resolve(strict=True)
    hatari, toolchain = discover_toolchain(config)
    run = WORK_ROOT / _run_id("first-offer")
    run.mkdir(parents=True)
    rows = cases()
    prepare(run, rows)
    command = build_hatari_command(
        hatari_binary=hatari, tos=tos, disk_a=program,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=run / "boot.txt", fast_forward=True, statusbar=False,
        cmd_fifo=run / "cmd.fifo", extra_args=["--memstate", str(snapshot)],
    )
    with (run / "hatari.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                   env=os.environ | headless_env())
        try:
            deadline = time.monotonic() + 10
            while not (run / "cmd.fifo").exists():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise LabError(f"Hatari did not create FIFO; inspect {run}")
                time.sleep(0.02)
            with (run / "cmd.fifo").open("w", encoding="utf-8") as fifo:
                time.sleep(3)  # Allow --memstate to finish restoring.
                _fifo_send(fifo, [f"hatari-debug parse {run}/start.txt"])
                if process.wait(timeout=35) != 0:
                    raise LabError(f"Hatari failed; inspect {run}")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            (run / "cmd.fifo").unlink(missing_ok=True)
    results = verify(rows, run)
    # Unchanged native/script windows prove that the probe edited state, not code.
    baseline = (run / "baseline.ram").read_bytes()
    for start, end, digest in CODE_WINDOWS:
        if hashlib.sha256(baseline[start:end]).hexdigest() != digest:
            raise LabError("Snapshot code differs from the attested Working Authority")
    for path in run.glob("*.ram"):
        ram = path.read_bytes()
        for start, end, _ in CODE_WINDOWS:
            if ram[start:end] != baseline[start:end]:
                raise LabError(f"Program bytes changed: {path}")
    report = {
        "programSha256": program_info["hashes"]["sha256"],
        "tosSha256": tos_info["hashes"]["sha256"],
        "snapshotSha256": file_hash(snapshot), "toolchain": toolchain.as_dict(),
        "probeSha256": file_hash(Path(__file__)),
        "scope": "Original handlers; debugger-controlled counter/input and dispatch; no audio output",
        "results": results,
        "artifacts": {path.name: file_hash(path) for path in sorted(run.iterdir()) if path.is_file()},
    }
    (run / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Verified {len(rows)} cases; evidence: {run}")


if __name__ == "__main__":
    try:
        main()
    except (LabError, OSError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"error: {error}") from error
