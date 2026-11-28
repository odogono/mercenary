#!/usr/bin/env python3
"""Execute the original Damocles Trading Post routines at controlled checkpoints.

Research instrumentation for #1026, not a gameplay port or a payload writer. The
native cell bind `$054B2E`, the quote `$04E05A`, the trading-room exit `$054F52`
and the take and drop handlers `$0541F0` and `$054520` run on the real 68000 with
interrupts held, from a pose in CHALDEA METROPOLIS whose workspace already holds
MEGA TRADING and the unnamed Trading Posts around it, and from a pose on MENTOR.

Every case runs in its own emulator and is a chain of steps. Each step writes the
few words one routine reads, enters the routine at its own entry and stops at
whichever of that routine's exits it reaches. A later step inherits everything
the earlier ones left behind, so a Sale really is quoted by the bind and the
quote that ran before it.

These are instruction checkpoints, not ordinary-route observations: the walk into
the trading room is replaced by writing the cell words the bind reads and the
region word `$7AFC`. See docs/research/damocles-trading-post-prices.md.
All generated debugger scripts, RAM and results stay in ignored work/.
"""
from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
from damocleslab.core import LabError, file_hash, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    WORK_ROOT, _fifo_send, _run_id, load_configuration, resolve_images,
)
from damocleslab.runtime import build_hatari_command, headless_env, retarget_memstate  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

BIND, QUOTE, LEAVE, TAKE, DROP = 0x054B2E, 0x04E05A, 0x054F52, 0x0541F0, 0x054520
# Each routine's own exits. Only the entered routine's are armed, because the
# take, the drop and the bind all pass through the quote's `rts` on the way.
EXITS = {
    BIND: {0x054BAA: "bound"},
    QUOTE: {0x04E058: "not-quoted", 0x04E130: "quoted"},
    LEAVE: {0x04E130: "quoted"},
    TAKE: {0x0541EE: "take-returns", 0x054808: "refusal-message", 0x052C9C: "accepted"},
    DROP: {0x054512: "drop-returns", 0x054808: "refusal-message", 0x052C9C: "accepted"},
}
NAMES = {BIND: "bind", QUOTE: "quote", LEAVE: "leave-room", TAKE: "take", DROP: "drop"}

ASSOC_A, ASSOC_B = 0x6FA8, 0x73A8
CELL_X, CELL_Z = 0x7A2C, 0x7A34
ROOM, REGION_LIST, SELECTION, RANGE, SCROLL = 0x7AFC, 0x7B0E, 0x7B46, 0x7B42, 0x4DDD0
OFFERED, LAST_OFFERED, BUY_RATE, SELL_RATE = 0x795C, 0x795E, 0x7960, 0x7962
QUOTED, BALANCE, STRUCTURE, CELL = 0x7956, 0x7C42, 0x7AF0, 0x7B5C
COUNT, STACK, MESSAGE_GATE, SCANNER_GATE = 0x61CC, 0x61CE, 0x7BA0, 0x7AF6
# The drop looks its region up in the list `$7B0E` points at and stops at the first
# byte that equals it. The operand of the handler's own `cmpi.w #$9, d0` is such a
# byte, so the trading room is found without writing a list anywhere.
TRADING_ROOM = 9
TRADING_ROOM_LIST = 0x05456D

# Fingerprints of the code the cases execute, recorded from the pinned first-world
# capture (docs/research/damocles-trading-post-prices.md): the quote, the take, the
# drop and the cell bind. Every pose and every capture is held to them.
CODE_WINDOWS = (
    (0x04E05A, 0x04E17E, "eb977e835d0a228a83fde200d0c9744c9dcc695b7aefee5d1873c176fb36726e"),
    (0x0541F0, 0x0542E0, "e6139be6700a08ff7676ca198aae6808fb2dc9138b29f7b9fe73b3ee63762298"),
    (0x054520, 0x054744, "32ff685b20f7b7a98476499f89b540abbef26150df2adfb297e2016e631d8f5e"),
    (0x054B2E, 0x054F7C, "a016fbbae10bf3744023f19e70025dbf265a0118bd0c84fcb03ee543f69df919"),
)


def attested(ram: bytes) -> bool:
    return all(hashlib.sha256(ram[start:end]).hexdigest() == digest
               for start, end, digest in CODE_WINDOWS)

GOLD, HIFI, WELSH_DRESSER, RANK_ZERO_SUPPORT = 155, 86, 89, 108
MEGA_TRADING, EMPTY_POST, THIRD_POST, HOME = (5, 6), (4, 6), (6, 2), (8, 8)
# MENTOR: a post with stock, and the one cell whose scene selector indexes the
# two bytes that follow the last pair of rates.
CHALDEA, MENTOR = "gaea-transporter", "mentor-transporter"
MENTOR_STOCKED, MENTOR_PAST_TABLE = (5, 4), (5, 3)


def credits(amount: str) -> int:
    """`45,000.00` as the six packed-decimal bytes the balance and the quote hold."""
    return int(amount.replace(",", "").replace(".", ""), 16)


def poke(address: int, value: int, size: int = 2) -> str:
    return f"w ${address:x} " + " ".join(
        f"${byte:02x}" for byte in (value & (1 << 8 * size) - 1).to_bytes(size, "big"))


def bind(cell: tuple[int, int], words: dict | None = None, **kw) -> dict:
    return dict(entry=BIND, words={CELL_X: cell[0], CELL_Z: cell[1]} | (words or {}), **kw)


def take(slot: int, **kw) -> dict:
    return dict(entry=TAKE, select=slot, **kw)


def drop(select: int = 0, **kw) -> dict:
    return dict(entry=DROP, select=select, **kw)


def in_room(step: dict) -> dict:
    """The step runs with the player's region word naming the trading room.

    The take and the drop end by calling the region scanner `$05A30E`. Its boxes
    are built by the scene pass, which no checkpoint runs, so here it would test
    the pose against the departed structure's boxes and report the player leaving
    the trading room. `$7AF6` negative is the scanner's own "not over the
    structure" gate: it returns at once and the region word stays as written.
    """
    step.setdefault("words", {}).update({ROOM: TRADING_ROOM, SCANNER_GATE: 0xFFFF})
    step.setdefault("longs", {})[REGION_LIST] = TRADING_ROOM_LIST
    return step


def cases() -> list[dict]:
    rows: list[dict] = []

    def case(name: str, *steps: dict, pose: str = CHALDEA) -> None:
        rows.append({"name": name, "pose": pose, "steps": list(steps)})

    quote = lambda **kw: in_room(dict(entry=QUOTE, **kw))  # noqa: E731
    leave = lambda **kw: dict(entry=LEAVE, **kw)           # noqa: E731

    # The bind: rates from the cell's scene selector, and what the post offers.
    case("bind-mega-trading", bind(MEGA_TRADING))
    case("bind-empty-post", bind(EMPTY_POST))
    case("bind-third-post", bind(THIRD_POST))
    case("bind-ordinary-cell",
         bind(HOME, words={OFFERED: 113, LAST_OFFERED: 113}))

    case("bind-mentor-stocked", bind(MENTOR_STOCKED), pose=MENTOR)
    case("bind-mentor-past-table", bind(MENTOR_PAST_TABLE), pose=MENTOR)

    # The quote: the carried head at the Sell Rate, at two posts.
    case("quote-sell-rate", take(GOLD), bind(EMPTY_POST), quote())
    case("quote-held-while-offering", take(GOLD), bind(MEGA_TRADING), quote())
    case("quote-sell-rate-mega", bind(MEGA_TRADING, balance="54,000.00"),
         in_room(take(HIFI)), in_room(take(GOLD)), quote())

    # The Purchase of a post's own stock.
    case("purchase-unaffordable", bind(MEGA_TRADING), in_room(take(HIFI)))
    case("purchase-refund", bind(MEGA_TRADING, balance="54,000.00"), in_room(take(HIFI)),
         quote(), in_room(drop()))
    case("purchase-leave-no-refund", bind(MEGA_TRADING, balance="54,000.00"),
         in_room(take(HIFI)), leave(), quote())

    # The Sale, and what the object costs to take back.
    case("sale-then-purchase", take(GOLD), bind(EMPTY_POST), quote(), in_room(drop()),
         in_room(take(GOLD)))
    case("sale-leave-requote", take(GOLD), bind(EMPTY_POST), quote(), in_room(drop()),
         leave(), in_room(take(GOLD)), bind(EMPTY_POST))
    case("sale-occupied", take(GOLD), bind(MEGA_TRADING), in_room(drop()))
    case("sale-refused-placement", take(GOLD), bind(EMPTY_POST), quote(),
         in_room(drop(select=RANK_ZERO_SUPPORT)), in_room(drop()), leave(),
         bind(EMPTY_POST), quote(), in_room(drop()))
    return rows


def step_commands(step: dict) -> list[str]:
    commands = ["r SR=$2700", poke(RANGE, 0), poke(SCROLL, 0), poke(MESSAGE_GATE, 0),
                poke(SELECTION, step.get("select", 0) * 4, 4)]
    commands += [poke(address, value) for address, value in step.get("words", {}).items()]
    commands += [poke(address, value, 4) for address, value in step.get("longs", {}).items()]
    if "balance" in step:
        commands.append(poke(BALANCE, credits(step["balance"]), 6))
    commands.append(f"r PC=${step['entry']:x}")
    return commands


def case_scripts(run: Path, index: int, case: dict) -> Path:
    """Write one debugger script per step and return the first one."""
    for number, step in enumerate(case["steps"]):
        name = f"{case['name']}-{number}"
        commands = ["setopt hex"] + step_commands(step) + [
            f"savebin {run}/{name}-before.ram 0 $100000"]
        commands += [
            f"b pc = ${address:x} :once :quiet :file {run}/case-{index:03d}-out-{number}.txt"
            for address in EXITS[step["entry"]]]
        commands.append("c")
        (run / f"case-{index:03d}-step-{number}.txt").write_text(
            "\n".join(commands) + "\n", encoding="utf-8")
        following = (f"parse {run}/case-{index:03d}-step-{number + 1}.txt"
                     if number + 1 < len(case["steps"]) else "quit")
        # The exits this step armed and did not take are removed first, so a later
        # step cannot stop on one of them and be read as this step's result.
        (run / f"case-{index:03d}-out-{number}.txt").write_text(
            "\n".join(["b all", "r", f"savebin {run}/{name}-after.ram 0 $100000",
                       following]) + "\n", encoding="utf-8")
    return run / f"case-{index:03d}-step-0.txt"


def read_state(path: Path) -> dict:
    ram = path.read_bytes()
    if len(ram) != 0x100000:
        raise LabError(f"Incomplete RAM capture: {path}")
    word = lambda address: int.from_bytes(ram[address:address + 2], "big")  # noqa: E731
    count = word(COUNT)
    return {
        "structure": word(STRUCTURE), "cell": word(CELL), "room": word(ROOM),
        "buyRate": word(BUY_RATE), "sellRate": word(SELL_RATE),
        "offered": word(OFFERED), "lastOffered": word(LAST_OFFERED),
        "quote": ram[QUOTED:QUOTED + 6].hex(), "balance": ram[BALANCE:BALANCE + 6].hex(),
        "stack": list(ram[STACK:STACK + count]),
        "residence": {str(slot): {
            "group": ram[ASSOC_A + slot * 4 + 1], "handling": ram[ASSOC_A + slot * 4 + 2],
            "body": ram[ASSOC_B + slot * 4], "insertion": ram[ASSOC_B + slot * 4 + 1],
            "cell": ram[ASSOC_B + slot * 4 + 3]} for slot in (GOLD, HIFI, WELSH_DRESSER)},
    }


def stops(log: str) -> list[tuple[int, int]]:
    """Every exit script's register dump in order: the stopped PC and `d1`.

    Each exit script runs `r` once. Its dump ends with the instruction at the PC
    and a `Next PC:` line, which is what names the exit the routine reached.
    """
    found: list[tuple[int, int]] = []
    lines = log.splitlines()
    d1 = 0
    for index, line in enumerate(lines):
        fields = line.split()
        if fields[:1] == ["D0"] and "D1" in fields:
            d1 = int(fields[fields.index("D1") + 1], 16) & 0xFFFF
        elif line.startswith("Next PC:"):
            found.append((int(lines[index - 1].split()[0], 16), d1))
    return found


def verify(rows: list[dict], run: Path) -> list[dict]:
    results = []
    for index, case in enumerate(rows):
        log = (run / f"case-{index:03d}.log").read_text(encoding="utf-8", errors="replace")
        reached = stops(log)
        if len(reached) != len(case["steps"]):
            raise LabError(f"{case['name']}: {len(reached)} stops for {len(case['steps'])} steps")
        steps = []
        for number, (step, (pc, d1)) in enumerate(zip(case["steps"], reached)):
            name = f"{case['name']}-{number}"
            outcome = EXITS[step["entry"]].get(pc)
            if outcome is None:
                raise LabError(f"{name}: stopped at ${pc:06x}, which is not one of its exits")
            steps.append({
                "routine": NAMES[step["entry"]], "entry": f"${step['entry']:06x}",
                "exit": outcome,
                "refusalIndex": d1 if outcome == "refusal-message" else None,
                "after": read_state(run / f"{name}-after.ram")})
        results.append({"case": case["name"], "pose": case["pose"], "steps": steps})
    return results


def retarget(snapshot: Path, run: Path, pose: str, tos: Path, program: Path) -> Path:
    """A run-local copy of the pose that boots the pinned images, its 1 MiB ST RAM untouched."""
    out = run / f"retargeted-{pose}.sav"
    retarget_memstate(snapshot, out, tos=tos, program=program)
    if hatari_memstate_ram(out.read_bytes()) != hatari_memstate_ram(snapshot.read_bytes()):
        raise LabError("Retargeting the snapshot's image paths changed its RAM")
    return out


def open_fifo(fifo: Path, process: subprocess.Popen, deadline: float):
    """Hatari's command FIFO, opened for writing without waiting on a reader for ever.

    A blocking open waits until some process reads the FIFO, so an emulator that
    made the FIFO and then died would hold the probe past every deadline. The
    open is retried until Hatari is reading, has exited, or the deadline passes.
    """
    while True:
        try:
            descriptor = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK)
        except OSError as error:
            if error.errno not in (errno.ENOENT, errno.ENXIO):
                raise
            if process.poll() is not None or time.monotonic() >= deadline:
                raise LabError("Hatari did not open its command FIFO") from error
            time.sleep(0.02)
            continue
        os.set_blocking(descriptor, True)
        return os.fdopen(descriptor, "w", encoding="utf-8")


def _drive(run: Path, index: int, command: list[str], fifo: Path, first: Path,
           done: Path, timeout: float) -> None:
    with (run / f"case-{index:03d}.log").open("w", encoding="utf-8") as log:
        # After a breakpoint script Hatari enters its debugger prompt; an empty stdin
        # makes that prompt return to emulation instead of waiting on the caller.
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL,
                                   env=os.environ | headless_env())
        try:
            with open_fifo(fifo, process, time.monotonic() + 20) as pipe:
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
                        raise LabError("Case did not reach a routine exit")
                    time.sleep(0.05)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            fifo.unlink(missing_ok=True)


def run_case(*, run: Path, index: int, case: dict, hatari: Path, tos: Path,
             program: Path, config: dict, snapshot: Path, timeout: float,
             attempts: int = 3) -> None:
    """One emulator per case, retried when the host drops the command FIFO."""
    first = case_scripts(run, index, case)
    done = run / f"{case['name']}-{len(case['steps']) - 1}-after.ram"
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
        for stale in run.glob(f"{case['name']}-*.ram"):
            stale.unlink()
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
    parser.add_argument("--snapshots", type=Path, default=LAB_ROOT / "snapshots/rehosted",
                        help="Directory of rehosted poses; each case names the one it boots.")
    parser.add_argument("--case", action="append", default=None,
                        help="Run only the named case; repeatable.")
    parser.add_argument("--timeout", type=float, default=90.0)
    parser.add_argument("--keep-ram", action="store_true",
                        help="Keep the whole-machine captures beside the result.")
    args = parser.parse_args()
    authority, config = load_configuration()
    program, tos = resolve_images(authority, args.roms.resolve())
    program_info = validate_image(program, authority["programImage"], label="Working Authority STX")
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    run = WORK_ROOT / _run_id("trading-post")
    run.mkdir(parents=True)
    rows = [row for row in cases() if not args.case or row["name"] in args.case]
    if not rows:
        raise LabError("No case matched --case")
    sources = {pose: (args.snapshots / f"{pose}.sav").resolve(strict=True)
               for pose in sorted({row["pose"] for row in rows})}
    snapshots = {pose: retarget(source, run, pose, tos, program)
                 for pose, source in sources.items()}
    for source in sources.values():
        if not attested(hatari_memstate_ram(source.read_bytes())):
            raise LabError("Snapshot code differs from the attested Working Authority")
    for index, case in enumerate(rows):
        run_case(run=run, index=index, case=case, hatari=hatari, tos=tos, program=program,
                 config=config, snapshot=snapshots[case["pose"]], timeout=args.timeout)
        print(f"  {case['name']}")
    results = verify(rows, run)
    # Hashed before the optional cleanup, so a result names every capture it read.
    captures = {}
    for path in sorted(run.glob("*.ram")):
        ram = path.read_bytes()
        if not attested(ram):
            raise LabError(f"Program bytes changed: {path}")
        captures[path.name] = hashlib.sha256(ram).hexdigest()
        if not args.keep_ram:
            path.unlink()
    report = {
        "programSha256": program_info["hashes"]["sha256"],
        "tosSha256": tos_info["hashes"]["sha256"],
        "snapshotSha256": {pose: file_hash(source) for pose, source in sources.items()},
        "toolchain": toolchain.as_dict(),
        "probeSha256": file_hash(Path(__file__)),
        "codeSha256": {f"${start:06x}-${end:06x}": digest for start, end, digest in CODE_WINDOWS},
        "scope": "Original routines at debugger checkpoints; no walk, input path or scene pass",
        "results": results,
        "artifacts": dict(sorted((captures | {
            path.name: file_hash(path) for path in run.iterdir()
            if path.is_file() and path.suffix != ".ram"}).items())),
    }
    (run / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"Ran {sum(len(row['steps']) for row in rows)} checkpoints; evidence: {run}")


if __name__ == "__main__":
    try:
        main()
    except (LabError, OSError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"error: {error}") from error
