#!/usr/bin/env python3
"""Execute the original Damocles take and drop handlers at controlled checkpoints.

Research instrumentation for #316, not a gameplay port or a payload writer. The
native handlers `$0541F0` (take) and `$054520` (drop) run on the real 68000 with
interrupts held, from state the debugger set up, so each case isolates one gate:
capacity, a handling class, a special carried item or a refusal word.

Every case runs in its own emulator, booted from the pinned on-foot checkpoint, so
no case can inherit another's effects. All of the handler's exits are armed at once
and the one that fires names the branch it took.

These are instruction checkpoints, not ordinary-route observations: the walk, the
input path and the scene pass that normally writes the selection are all bypassed.
See docs/research/damocles-carry-capacity.md for the deliberately bounded claim.
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

TAKE, DROP, GIVE = 0x0541F0, 0x054520, 0x0541E0
# Every exit the two handlers have. A case runs in its own emulator, so all five
# can be armed at once and the one that fires names the branch the handler took.
EXITS = {
    0x0541EE: "take-returns", 0x054512: "drop-returns",
    0x054808: "refusal-message", 0x0545D4: "support-rank-passed",
    0x052C9C: "accepted",
}
# The system-string helper is entered with the refusal's index in d1, so a case
# that stops there names the message without presenting or reading any game text.
REFUSAL_REGISTER = "D1"

ASSOC_A, ASSOC_B = 0x6FA8, 0x73A8

WORDS = {
    "capacity": 0x7A04, "count": 0x61CC, "store": 0x61CA, "gauge": 0x787C,
    "gaugeDrawn": 0x527CA, "scroll": 0x4DDD0, "body": 0x7AA8, "range": 0x7B42,
    "messageGate": 0x7BA0, "displayTimer": 0x523B8, "scriptFlags": 0x7BD8,
    "soundCountdown": 0x7A78, "soundGuard": 0x7A0C, "tradeSlot": 0x795C,
    "room": 0x7AFC, "structure": 0x7AF0, "panelDirty": 0x7A8A, "hazard": 0x7A7C,
    "hazardArmed": 0x7A64, "onFoot": 0x7A8E, "interior": 0x7AAE, "contact": 0x7ACA,
}
LONGS = {
    "selection": 0x7B46, "scriptPc": 0x781E, "messagePointer": 0x7B98,
    "labelPointer": 0x4DDCC, "soundVector": 0x4BF54,
}

# The system-string word table, used only to name a presented message by index.
# No record is read: a presented message is original game text.
STRING_TABLE = 0x070000

# Fingerprints from the attested first-world capture cited in the research note.
CODE_WINDOWS = (
    (0x0541F0, 0x0542E0, "e6139be6700a08ff7676ca198aae6808fb2dc9138b29f7b9fe73b3ee63762298"),
    (0x054520, 0x054744, "32ff685b20f7b7a98476499f89b540abbef26150df2adfb297e2016e631d8f5e"),
    (0x04DC40, 0x04DD60, "33650f51804d734e2fe29461d5d8503719d1d70e0ca71bfe42aa760025a83b43"),
)

FILLER = (30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51)

BRIEFCASE, ANTIGRAV_A, ANTIGRAV_B, DOOR_KEY = 108, 157, 158, 39
ORDINARY, CRAFT, SILENT, TABLE = 160, 7, 156, 114


def carried(count: int, head: int | None = None, extra: tuple[int, ...] = ()) -> list[int]:
    """A Carried Stack of `count` entries; the original pushes at the head."""
    stack = ([head] if head is not None else []) + list(extra)
    stack += [slot for slot in FILLER if slot not in stack][: count - len(stack)]
    if len(stack) != count:
        raise LabError(f"Cannot build a Carried Stack of {count}")
    return stack


def cases() -> list[dict]:
    rows: list[dict] = []

    def take(name: str, **kw) -> None:
        rows.append({"name": name, "steps": [dict(entry=TAKE, **kw)]})

    def drop(name: str, **kw) -> None:
        rows.append({"name": name, "steps": [dict(entry=DROP, **kw)]})

    # Capacity. The handler compares carried count with capacity for equality.
    take("capacity-empty", select=ORDINARY, stack=[])
    take("capacity-nine", select=ORDINARY, stack=carried(9))
    take("capacity-full", select=ORDINARY, stack=carried(10))
    take("capacity-over", select=ORDINARY, stack=carried(11), capacity=10)
    take("capacity-twenty-nineteen", select=ORDINARY, stack=carried(19), capacity=20)
    take("capacity-twenty-full", select=ORDINARY, stack=carried(20), capacity=20)

    # Handling classes.
    take("class-silent", select=SILENT, stack=[])
    take("class-message", select=CRAFT, stack=[])
    take("class-support", select=TABLE, stack=[])

    # ANTIGRAV overrides the message refusal, and only that one.
    take("antigrav-a-craft", select=CRAFT, stack=[ANTIGRAV_A])
    take("antigrav-b-craft", select=CRAFT, stack=[ANTIGRAV_B])
    take("antigrav-both-craft", select=CRAFT, stack=[ANTIGRAV_A, ANTIGRAV_B])
    take("antigrav-listed-not-carried", select=CRAFT, stack=[ANTIGRAV_A], clearCarriedBits=True)
    take("antigrav-a-silent", select=SILENT, stack=[ANTIGRAV_A])
    take("slot-zero-flag", select=SILENT, stack=[], slotZero=True)

    # BRIEFCASE.
    take("briefcase-take", select=BRIEFCASE, stack=[])
    take("briefcase-take-with-store", select=BRIEFCASE, stack=carried(4),
         store=(201, 202, 203))
    take("briefcase-take-when-full", select=BRIEFCASE, stack=carried(10))
    drop("briefcase-drop-other-item", stack=carried(12, head=30, extra=(BRIEFCASE,)),
         capacity=20)
    drop("briefcase-drop-exact", stack=carried(10, head=BRIEFCASE), capacity=20)
    drop("briefcase-drop-overflow", stack=carried(15, head=BRIEFCASE), capacity=20)
    # The helper returns at once when the message gate is already raised, so the
    # same drop runs to its end and the completed Carried Stack is observable.
    drop("briefcase-drop-overflow-complete", stack=carried(15, head=BRIEFCASE), capacity=20,
         gate=1, exits=(0x0541EE, 0x054512, 0x052C9C))
    # The state briefcase-drop-overflow leaves behind, poked back in and taken:
    # the nine that stayed on the Carried Stack and the five the case put away.
    take("briefcase-retake-after-overflow", select=BRIEFCASE,
         stack=carried(15, head=BRIEFCASE)[1:10], store=tuple(carried(15, head=BRIEFCASE)[10:]))

    # The Damocles Script gift path enters past every gate except capacity.
    rows.append({"name": "script-give-craft", "steps": [dict(entry=GIVE, d0=CRAFT, stack=[])]})
    rows.append({"name": "script-give-when-full",
                 "steps": [dict(entry=GIVE, d0=ORDINARY, stack=carried(10))]})

    # Refusal words shared by both handlers.
    take("gate-out-of-range", select=ORDINARY, stack=[], rangeWord=9)
    take("gate-no-selection", select=0, stack=[])
    take("gate-void-body", select=ORDINARY, stack=[], body=0x78)
    take("gate-label-scrolling", select=ORDINARY, stack=[], scroll=0x10)
    drop("drop-gate-label-scrolling", stack=carried(1), scroll=0x10)
    drop("drop-gate-empty-stack", stack=[])

    # The monetary take check, which is conditioned on the selection, not handling.
    take("trade-affordable", select=ORDINARY, stack=[], tradeSlot=ORDINARY, room=9,
         price=0x000000100000)
    take("trade-unaffordable", select=ORDINARY, stack=[], tradeSlot=ORDINARY, room=9,
         price=0x000009000000)
    take("trade-other-room", select=ORDINARY, stack=[], tradeSlot=ORDINARY, room=0x0B,
         price=0x000000100000)

    # Drop placement rank: the dropped object demands, the selection supplies.
    drop("drop-direct", stack=carried(1))
    drop("drop-rank-refused", stack=carried(1), select=183, rangeWord=0)
    drop("drop-rank-met", stack=carried(1), select=TABLE, rangeWord=0)
    drop("drop-rank-bypassed", stack=[30, DOOR_KEY], select=183, rangeWord=0)
    return rows


def poke(address: int, value: int, size: int = 2) -> str:
    return f"w ${address:x} " + " ".join(
        f"${byte:02x}" for byte in (value & (1 << 8 * size) - 1).to_bytes(size, "big"))


def step_commands(step: dict, run: Path) -> list[str]:
    commands = ["r SR=$2700",
                poke(WORDS["range"], step.get("rangeWord", 0)),
                poke(LONGS["selection"], step.get("select", 0) * 4, 4),
                poke(WORDS["scroll"], step.get("scroll", 0))]
    if not step.get("inherit"):
        stack = step.get("stack", [])
        commands += [
            poke(WORDS["capacity"], step.get("capacity", 10)),
            poke(WORDS["count"], len(stack)),
            poke(WORDS["store"], len(step.get("store", ()))),
            poke(WORDS["body"], step.get("body", 0x2C)),
            poke(WORDS["tradeSlot"], step.get("tradeSlot", 0)),
            poke(WORDS["room"], step.get("room", 0x0B)),
            poke(WORDS["gauge"], 0), poke(WORDS["gaugeDrawn"], 0),
            poke(WORDS["messageGate"], step.get("gate", 0)),
        ]
        for index, slot in enumerate(stack):
            commands.append(poke(0x61CE + index, slot, 1))
            if not step.get("clearCarriedBits"):
                commands.append(poke(ASSOC_A + slot * 4 + 2, 0x80 | _class(slot), 1))
        for index, slot in enumerate(step.get("store", ())):
            commands.append(poke(0x61D8 + index, slot, 1))
        if step.get("slotZero"):
            commands.append(poke(ASSOC_A + 2, 0x90, 1))
        if "price" in step:
            commands.append(poke(0x7956, step["price"], 6))
    # Push the sentinel the handler returns into, then enter it.
    if "d0" in step:
        commands.append(f"r D0=${step['d0']:x}")
    commands.append(f"r PC=${step['entry']:x}")
    return commands


# Authored handling bytes of the slots the probe puts on a Carried Stack. Taking
# an object sets bit 7 of this byte; the probe sets the same bit for the entries
# it places directly, so a restored stack is indistinguishable from a taken one.
_HANDLING = {
    7: 0x20, 39: 0x05, 108: 0x04, 114: 0x0F, 156: 0x10, 157: 0x04, 158: 0x04,
    160: 0x05, 183: 0x04, 201: 0x0F, 202: 0x0F, 203: 0x0F,
    30: 0x05, 31: 0x05, 32: 0x05, 33: 0x05, 34: 0x05, 35: 0x05, 36: 0x05, 37: 0x05,
    38: 0x05, 40: 0x05, 41: 0x05, 43: 0x05, 44: 0x04, 45: 0x04, 46: 0x04, 47: 0x04,
    48: 0x04, 49: 0x04, 50: 0x04, 51: 0x04,
}


def _class(slot: int) -> int:
    if slot not in _HANDLING:
        raise LabError(f"Slot {slot} has no recorded handling byte")
    return _HANDLING[slot]


def case_scripts(run: Path, index: int, case: dict) -> Path:
    """Write one debugger script per step and return the first one."""
    for number, step in enumerate(case["steps"]):
        name = f"{case['name']}-{number}"
        commands = ["setopt hex"] + step_commands(step, run) + [
            f"savebin {run}/{name}-before.ram 0 $100000"]
        commands += [
            f"b pc = ${address:x} :once :quiet :file {run}/case-{index:03d}-out-{number}.txt"
            for address in step.get("exits", EXITS)]
        commands.append("c")
        (run / f"case-{index:03d}-step-{number}.txt").write_text(
            "\n".join(commands) + "\n", encoding="utf-8")
        following = (f"parse {run}/case-{index:03d}-step-{number + 1}.txt"
                     if number + 1 < len(case["steps"]) else "quit")
        (run / f"case-{index:03d}-out-{number}.txt").write_text(
            "\n".join(["r", f"savebin {run}/{name}-after.ram 0 $100000", following]) + "\n",
            encoding="utf-8")
    return run / f"case-{index:03d}-step-0.txt"


def read_state(path: Path) -> dict:
    ram = path.read_bytes()
    if len(ram) != 0x100000:
        raise LabError(f"Incomplete RAM capture: {path}")
    state = {name: int.from_bytes(ram[a:a + 2], "big") for name, a in WORDS.items()}
    state |= {name: int.from_bytes(ram[a:a + 4], "big") for name, a in LONGS.items()}
    state["stack"] = list(ram[0x61CE:0x61CE + 20])
    state["money"] = ram[0x7C42:0x7C48].hex()
    state["price"] = ram[0x7956:0x795C].hex()
    state["handling"] = {
        str(slot): ram[ASSOC_A + slot * 4 + 2]
        for slot in sorted({0, BRIEFCASE, ANTIGRAV_A, ANTIGRAV_B, DOOR_KEY,
                            ORDINARY, CRAFT, SILENT, TABLE, 183} | set(FILLER))
    }
    for slot in (ORDINARY, CRAFT, SILENT, BRIEFCASE):
        state[f"association-{slot}"] = int.from_bytes(ram[ASSOC_B + slot * 4:][:4], "big")
    # The system-string helper stores the table word over the low half of the
    # table address it built, so a presented message names its own index.
    state["stringIndex"] = next(
        (index for index in range(64)
         if STRING_TABLE | int.from_bytes(ram[STRING_TABLE + index * 2:][:2], "big")
         == state["messagePointer"]), None)
    return state


def exit_taken(log: str) -> str | None:
    """The debugger names the stopped PC when a breakpoint drops it into the UI."""
    for line in reversed(log.splitlines()):
        if line.startswith("CPU=$"):
            return EXITS.get(int(line[5:].split(",")[0], 16))
    return None


def refusal_index(log: str) -> int | None:
    for line in reversed(log.splitlines()):
        fields = line.split()
        if fields[:1] == ["D0"] and REFUSAL_REGISTER in fields:
            return int(fields[fields.index(REFUSAL_REGISTER) + 1], 16) & 0xFFFF
    return None


def verify(rows: list[dict], run: Path) -> list[dict]:
    results = []
    for index, case in enumerate(rows):
        steps = []
        log = (run / f"case-{index:03d}.log").read_text(encoding="utf-8", errors="replace")
        for number, step in enumerate(case["steps"]):
            name = f"{case['name']}-{number}"
            before, after = (read_state(run / f"{name}-{when}.ram")
                             for when in ("before", "after"))
            reached = exit_taken(log)
            steps.append({"entry": f"${step['entry']:06x}", "exit": reached,
                          "refusalIndex": refusal_index(log)
                          if reached == "refusal-message" else None,
                          "before": before, "after": after})
        results.append({"case": case["name"], "steps": steps})
    return results


def _drive(run: Path, index: int, command: list[str], fifo: Path, first: Path,
           done: Path, timeout: float) -> None:
    with (run / f"case-{index:03d}.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                   env=os.environ | headless_env())
        try:
            deadline = time.monotonic() + 20
            while not fifo.exists():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise LabError("Hatari did not create its command FIFO")
                time.sleep(0.02)
            with fifo.open("w", encoding="utf-8") as pipe:
                time.sleep(3)  # Allow --memstate to finish restoring.
                _fifo_send(pipe, [f"hatari-debug parse {first}"])
                # The debugger's own `quit` does not return from a breakpoint
                # script, so the case is finished when its last whole-machine
                # capture is complete and the emulator is then stopped here.
                deadline = time.monotonic() + timeout
                while not (done.exists() and done.stat().st_size == 0x100000):
                    if process.poll() is not None:
                        raise LabError("Hatari exited before the capture was written")
                    if time.monotonic() >= deadline:
                        raise LabError("Case did not reach a handler exit")
                    time.sleep(0.05)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            fifo.unlink(missing_ok=True)


def run_case(*, run: Path, index: int, case: dict, hatari: Path, tos: Path,
             program: Path, config: dict, snapshot: Path, timeout: float,
             attempts: int = 3) -> None:
    """One emulator per case: a case can neither inherit nor leak machine state.

    Breakpoints do not survive the memstate restore, so the case script is sent
    through the command FIFO once the machine is up, exactly as the ordinary
    route probes do. A FIFO that the emulator closes before the script arrives
    is a host-scheduling failure rather than an observation, and is retried.
    """
    first = case_scripts(run, index, case)
    done = run / f"{case['name']}-{len(case['steps']) - 1}-after.ram"
    done.unlink(missing_ok=True)
    boot = run / f"boot-{index:03d}.txt"
    boot.write_text("c\n", encoding="utf-8")
    fifo = run / f"cmd-{index:03d}.fifo"
    command = build_hatari_command(
        hatari_binary=hatari, tos=tos, disk_a=program,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=boot, fast_forward=True, statusbar=False, cmd_fifo=fifo,
        extra_args=["--memstate", str(snapshot)],
    )
    for attempt in range(attempts):
        try:
            _drive(run, index, command, fifo, first, done, timeout)
            return
        except (LabError, BrokenPipeError, subprocess.TimeoutExpired) as error:
            if attempt + 1 == attempts:
                raise LabError(f"{case['name']}: {error}; inspect {run}") from error
            time.sleep(1.0)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path,
                        default=LAB_ROOT / "snapshots/eris-spaceport-onfoot.sav")
    parser.add_argument("--case", action="append", default=None,
                        help="Run only the named case; repeatable.")
    parser.add_argument("--timeout", type=float, default=90.0)
    args = parser.parse_args()
    authority, config = load_configuration()
    program, tos = resolve_images(authority, args.roms.resolve())
    program_info = validate_image(program, authority["programImage"], label="Working Authority STX")
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    snapshot = args.snapshot.resolve(strict=True)
    hatari, toolchain = discover_toolchain(config)
    run = WORK_ROOT / _run_id("carry-capacity")
    run.mkdir(parents=True)
    rows = [row for row in cases() if not args.case or row["name"] in args.case]
    if not rows:
        raise LabError("No case matched --case")
    for index, case in enumerate(rows):
        run_case(run=run, index=index, case=case, hatari=hatari, tos=tos, program=program,
                 config=config, snapshot=snapshot, timeout=args.timeout)
        print(f"  {case['name']}")
    results = verify(rows, run)
    reference = (run / f"{rows[0]['name']}-0-before.ram").read_bytes()
    for start, end, digest in CODE_WINDOWS:
        if hashlib.sha256(reference[start:end]).hexdigest() != digest:
            raise LabError("Snapshot code differs from the attested Working Authority")
    for path in sorted(run.glob("*.ram")):
        ram = path.read_bytes()
        for start, end, _ in CODE_WINDOWS:
            if ram[start:end] != reference[start:end]:
                raise LabError(f"Program bytes changed: {path}")
    report = {
        "programSha256": program_info["hashes"]["sha256"],
        "tosSha256": tos_info["hashes"]["sha256"],
        "snapshotSha256": file_hash(snapshot), "toolchain": toolchain.as_dict(),
        "probeSha256": file_hash(Path(__file__)),
        "handlerSha256": hashlib.sha256(reference[0x0541F0:0x054744]).hexdigest(),
        "scope": "Original handlers at debugger checkpoints; no walk, input path or scene pass",
        "results": results,
        "artifacts": {path.name: file_hash(path) for path in sorted(run.iterdir())
                      if path.is_file() and path.suffix != ".ram"},
    }
    (run / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Ran {sum(len(row['steps']) for row in rows)} checkpoints; evidence: {run}")


if __name__ == "__main__":
    try:
        main()
    except (LabError, OSError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"error: {error}") from error
