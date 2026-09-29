#!/usr/bin/env python3
"""Drive the Damocles endgame on a real machine: the impact, the BOOK's wishes (#622).

Research instrumentation for #622, not a payload writer. The desk decode in
docs/research/damocles-endgame.md says:

- at zero on the Impact Clock, `$051F42` destroys DAMOCLES and ERIS through the
  destruction marker `$04C98E` and fires trigger `$0F`, unless the drift `$7A7E`
  is armed or either body is already gone;
- the destruction marker kills a player standing on the destroyed Body
  (`$04C9F2` → `$04CBAE`: system string `$23`, `$7A64` ← 1);
- a BOOK page read with the MAGIC CRYSTAL carried queues `$7B96` ← `$8000`, and
  the script dispatch head then runs `$04D7F0` on the page index `$7857`.
  Page 3 destroys DAMOCLES and fires `$17`; page 5 arms the drift
  `$FFFFEDCC` and fires `$3C`.

Every case injects, and says what it pokes. The wishes are injected at the
dispatch head's inputs (`$7856`/`$7857`, `$7126` bit 7, `$7B96`), which is
exactly what `$0547F2` leaves after a Read; nothing downstream is poked. The
impact is reached by poking the clock forward to a few seconds before zero,
which the waypoint mover already tolerates (#440's `waypoint` case).

Cases (``--case``):

``impact``   poke the clock to ``--seconds`` before zero and sample past it.
``wish``     inject BOOK page ``--page``, sample, then (``--then-impact``)
             poke the clock and sample past zero.

#626 added the live cases below. They inject carrying (see ``Machine.carry``),
the chair, the computer's loss and an EXPLOSIVE's arming, and say so. Nothing
downstream of the dispatcher or the marker is poked; the keys are the original's.

``switches``   carry the four NOVABOMB detonators (and, ``--bomb-carried``, the
               bomb), then Open and ``+`` each, with a rotate, ``-`` and a drop
               along the way.
``computer``   carry the AUTHORS COMPUTER, Enter off and on the chair (``$7AB0``
               poked to 14 for that key only), then the ``--keys`` list.
``unravel``    clear the computer's Association B ``$753C`` and sample on.
``explosives`` stack ``--count`` EXPLOSIVEs on one spot and arm one at digit 9.

``--space`` climbs out of ``dion-north-airborne`` first (Esc, then key 1).

Usage (from the repository root):

  research/damocles-st/.venv/bin/python research/damocles-st/scripts/endgame-probe.py \\
      --case impact --snapshot research/damocles-st/snapshots/rehosted/dion-2-3.sav
  research/damocles-st/.venv/bin/python research/damocles-st/scripts/endgame-probe.py \\
      --case wish --page 5 --then-impact \\
      --snapshot research/damocles-st/snapshots/rehosted/dion-2-3.sav

Each sample is a full 1 MiB `savebin` and a screenshot, taken stopped, in an
ignored `work/endgame-*` run directory with a `result.json`.
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
    _fifo_send,
    _run_id,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

REPO = LAB_ROOT.parents[1]
WORK_ROOT = LAB_ROOT / "work"

ERIS, DAMOCLES = 11 * 4, 29 * 4
BODY_STATE = 0x626A          # word per Body; bit 15 set = destroyed ($04C9B6)
CLOCK = 0x793C               # signed seconds, minus the time left
DRIFT_ARM = 0x7A7E
IMPACT_FLAG = 0x7A82
DESTROYED = 0x7BEA           # count of destroyed Bodies ($04C9BC)
DEATH = 0x7A64               # 1 once the player is dead (#581)
PLAYER_BODY = 0x7AA8         # the player's Body selector
OCCUPANCY = 0x7AAE
PENDING = 0x7A88             # the queued trigger
SCRIPT_PC = 0x781E
MESSAGE = 0x7B98             # pointer to the message being revealed
GATE = 0x7BA0
PAGE_GATE = 0x7B96
DOCUMENT = 0x7856            # object, then the page index at $7857
CRYSTAL = 0x7126             # bit 7: the MAGIC CRYSTAL carried
PAUSE_GATE = 0x7A26
VBL_CLOCK = 0x51D96          # long, +1 every VBL ($051E34)
STACK_COUNT, STACK = 0x61CC, 0x61CE   # the Carried Stack; $61CE is its head
HANDLING = 0x6FAA            # byte per slot (4 apart); bit 7 = carried
ASSOCIATION = 0x73A8         # Association B, long per slot; byte 0 names the Body
POSITION = (0x63A8, 0x67A8, 0x6BA8)   # X, Y, Z longs per slot
PANEL = 0x785E               # the open object, panel mode, index ($04D288)
SWITCHES = 0x7872            # switch bits; 3-6 are the NOVABOMB's detonators
COMPUTER_OPTION = 0x786C     # AUTHORS COMPUTER option, then value $786E, maximum $7870
COMPUTER_RECORDS = 0x7C8C    # value and maximum per option
UNRAVEL_CURSOR = 0x7A8C      # the Body the unravelling destroys next ($04BF04)
DEBRIS = 0x7834              # debris passes left ($04CEBC = 64, $04CF52 -1 a pass)
BOARDED = 0x7AB0             # the boarded object's slot; the AUTHOR'S CHAIR is 14.
                             # $058F78 copies $7AAE-$7ACD to $7A8E every pass, so
                             # Open's test of $7A90 reads this one pass late
PLAYER = 0x7AA6              # long: the player's Body selector, $7AA8 its low word
ARMING = 0x7CB4              # Script trigger arming bytes, one per trigger
DETONATOR_ARMED = 0x7A54     # 1 while an EXPLOSIVE is armed
DETONATOR_TARGET = 0x7A5C    # long: the armed EXPLOSIVE's slot × 4
BLAST_DIGIT = 0x7866         # TIMED DETONATOR size digit; the radius is $40 << digit
DETONATION_TIME = 0x7868     # the clock's low word at detonation
DRIFT = 0x7A84               # X offset the drift adds to DAMOCLES ($051EFA)
BODY_CENTRE_X = 0x5F40       # long per Body selector
BOMB, AUTHORS_COMPUTER, AUTHORS_CHAIR = 0xA3, 0x65, 0x0E
SIDEBOARD, CUPBOARD, HIFI, WASHBASIN = 0x54, 0x55, 0x56, 0x57
EXPLOSIVES = tuple(range(0x4B, 0x54))
KEY = {"enter": 0x72, "+": 0x4E, "-": 0x4A, "*": 0x66, "left": 0x4B, "right": 0x4D,
       "down": 0x50, "esc": 0x01, "1": 0x02,
       **{f"k{digit}": code for digit, code in zip("7894561230", range(0x67, 0x71))}}

# The code the claims rest on, fingerprinted on the first sample.
CODE_WINDOWS = (
    ("$04C8D2-$04CA20 destruction dispatcher and marker", 0x4C8D2, 0x4CA20),
    ("$04CBAE-$04CBDA death on a destroyed Body", 0x4CBAE, 0x4CBDA),
    ("$04D7F0-$04D8F0 the BOOK's page actions", 0x4D7F0, 0x4D8F0),
    ("$051F42-$051FD0 zero on the clock", 0x51F42, 0x51FD0),
    ("$0547C6-$054808 the deferred Read", 0x547C6, 0x54808),
    ("$04BEEE-$04BF18 the unravelling", 0x4BEEE, 0x4BF18),
    ("$04CA20-$04CAD2 the blast test", 0x4CA20, 0x4CAD2),
    ("$04CAD2-$04CAF0 stacked-explosive planet kill", 0x4CAD2, 0x4CAF0),
    ("$04CAF0-$04CB4C taking an object out of the stack", 0x4CAF0, 0x4CB4C),
    ("$04CB60-$04CBDA an armed EXPLOSIVE going off", 0x4CB60, 0x4CBDA),
    ("$04CBDA-$04CCD2 the blast", 0x4CBDA, 0x4CCD2),
    ("$04CF4E-$04CFA4 the debris pass", 0x4CF4E, 0x4CFA4),
    ("$04D24C-$04D2C4 Open", 0x4D24C, 0x4D2C4),
    ("$04D2C4-$04D3B4 the Open table", 0x4D2C4, 0x4D3B4),
    ("$04D3D2-$04D420 the keypad dispatch", 0x4D3D2, 0x4D420),
    ("$04D420-$04D4D0 switches and the NOVABOMB", 0x4D420, 0x4D4D0),
    ("$04D4D0-$04D5DA AUTHORS COMPUTER keys", 0x4D4D0, 0x4D5DA),
    ("$04D5DA-$04D69C AUTHORS COMPUTER options", 0x4D5DA, 0x4D69C),
    ("$04D69C-$04D762 TIMED DETONATOR keys", 0x4D69C, 0x4D762),
    ("$04D992-$04D9D4 the switch lamp", 0x4D992, 0x4D9D4),
    ("$04DA5A-$04DAB6 AUTHORS COMPUTER display", 0x4DA5A, 0x4DAB6),
    ("$04DACC-$04DAF8 the detonation countdown", 0x4DACC, 0x4DAF8),
    ("$054770-$0547C6 trigger launch", 0x54770, 0x547C6),
    ("$05481A-$054848 system message request", 0x5481A, 0x54848),
)


def poke(address: int, value: int, size: int) -> str:
    body = " ".join(f"{byte:02x}"
                    for byte in (value & ((1 << 8 * size) - 1)).to_bytes(size, "big"))
    return f"hatari-debug w ${address:x} {body}"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _s(ram: bytes, address: int, size: int) -> int:
    return int.from_bytes(ram[address:address + size], "big", signed=True)


def _u(ram: bytes, address: int, size: int) -> int:
    return int.from_bytes(ram[address:address + size], "big")


def _text(ram: bytes, address: int) -> str:
    if not 0 < address < len(ram):
        return ""
    end = ram.index(b"\x00", address, min(len(ram), address + 400))
    return ram[address:end].decode("ascii", errors="replace").strip()


def decode(ram: bytes) -> dict:
    message = _u(ram, MESSAGE, 4)
    return {
        "clock": _s(ram, CLOCK, 4),
        "erisState": f"0x{_u(ram, BODY_STATE + ERIS, 2):04x}",
        "damoclesState": f"0x{_u(ram, BODY_STATE + DAMOCLES, 2):04x}",
        "erisDestroyed": bool(_u(ram, BODY_STATE + ERIS, 2) & 0x8000),
        "damoclesDestroyed": bool(_u(ram, BODY_STATE + DAMOCLES, 2) & 0x8000),
        "destroyedCount": _u(ram, DESTROYED, 2),
        "driftArm": _s(ram, DRIFT_ARM, 4),
        "impactFlag": f"0x{_u(ram, IMPACT_FLAG, 2):04x}",
        "death": _u(ram, DEATH, 2),
        "playerBody": _u(ram, PLAYER_BODY, 2) // 4,
        "occupancy": _u(ram, OCCUPANCY, 2),
        "pending": f"0x{_u(ram, PENDING, 2):04x}",
        "scriptPc": f"0x{_u(ram, SCRIPT_PC, 4):06x}",
        "gate": _u(ram, GATE, 2),
        "pageGate": f"0x{_u(ram, PAGE_GATE, 2):04x}",
        "document": f"0x{_u(ram, DOCUMENT, 2):04x}",
        "crystal": f"0x{_u(ram, CRYSTAL, 1):02x}",
        "pauseGate": _u(ram, PAUSE_GATE, 2),
        "message": f"0x{message:06x}",
        "messageText": _text(ram, message),
        "vbl": _u(ram, VBL_CLOCK, 4),
        "destroyed": [index for index in range(30)
                      if _u(ram, BODY_STATE + 4 * index, 2) & 0x8000],
        "player": f"0x{_u(ram, PLAYER, 4):08x}",
        "stack": [f"0x{slot:02x}" for slot in
                  ram[STACK:STACK + min(_u(ram, STACK_COUNT, 2), 24)]],
        "panel": f"0x{_u(ram, PANEL, 4):08x}",
        "switches": f"0x{_u(ram, SWITCHES, 4):08x}",
        "bomb": f"0x{_u(ram, ASSOCIATION + 4 * BOMB, 4):08x}",
        "computer": f"0x{_u(ram, ASSOCIATION + 4 * AUTHORS_COMPUTER, 4):08x}",
        "computerOption": _u(ram, COMPUTER_OPTION, 1),
        "computerValue": _u(ram, COMPUTER_OPTION + 2, 2),
        "computerMaximum": _u(ram, COMPUTER_OPTION + 4, 2),
        "computerRecords": ram[COMPUTER_RECORDS:COMPUTER_RECORDS + 20].hex(),
        "paletteMask": f"0x{_u(ram, 0x7A50, 2):04x}",
        "panelMask": f"0x{_u(ram, 0x7A52, 2):04x}",
        "view7964": f"0x{_u(ram, 0x7964, 4):08x}",
        "clockLevel": _u(ram, 0x7C1C, 2),
        "boarded": _s(ram, BOARDED, 2),
        "unravelCursor": _s(ram, UNRAVEL_CURSOR, 2),
        "debris": _s(ram, DEBRIS, 2),
        "arming01": f"0x{ram[ARMING + 0x01]:02x}",
        "arming1A": f"0x{ram[ARMING + 0x1A]:02x}",
        "armed": _u(ram, DETONATOR_ARMED, 2),
        "blastDigit": ram[BLAST_DIGIT],
        "drift": _s(ram, DRIFT, 4),
        "damoclesX": _s(ram, BODY_CENTRE_X + DAMOCLES, 4),
        "waitCounter": _u(ram, 0x7B9C, 2),
    }


class Machine:
    """One booted Hatari, stopped and continued around every read and poke."""

    def __init__(self, handle, run: Path):
        self.handle = handle
        self.run = run
        self.count = 0

    def sample(self, label: str) -> dict:
        prefix = f"{self.count:03d}-{label}"
        self.count += 1
        ram_path = self.run / f"{prefix}.ram"
        shot = self.run / f"{prefix}.png"
        _fifo_send(self.handle, [
            "hatari-stop", "hatari-debug setopt hex",
            f"hatari-debug savebin {ram_path} 0 $100000",
            f"hatari-debug screenshot {shot}", "hatari-cont",
        ])
        ram = b""
        for _ in range(120):
            if ram_path.is_file():
                ram = ram_path.read_bytes()
            if len(ram) == 0x100000:
                break
            time.sleep(0.05)
        if len(ram) != 0x100000:
            raise LabError(f"sample {prefix} read {len(ram)} bytes")
        state = decode(ram)
        state["sample"] = prefix
        state["ramSha256"] = _sha256(ram)
        if shot.is_file():
            state["display"] = shot.name
        state["_ram"] = ram
        return state

    def poke(self, *commands: str) -> None:
        _fifo_send(self.handle, ["hatari-stop", "hatari-debug setopt hex",
                                 *commands, "hatari-cont"])
        time.sleep(0.2)

    def carry(self, slots: list[int], ram: bytes) -> dict:
        """Write `slots` as the whole Carried Stack, head first, in the shape a
        taken object has in every memstate: handling bit 7, Association B
        `$7801ii10` (ii = stack position), structure byte `$31`, and the
        stack's X/Y/Z (`$81D5`, ii × `$12C`, `$1831C`). Objects already
        carried follow them, renumbered."""
        count = _u(ram, STACK_COUNT, 2)
        slots = slots + [slot for slot in ram[STACK:STACK + count] if slot not in slots]
        commands = [poke(STACK_COUNT, len(slots), 2)]
        commands += [poke(STACK + index, slot, 1) for index, slot in enumerate(slots)]
        for index, slot in enumerate(slots):
            commands += [
                poke(HANDLING - 1 + 4 * slot, 0x31, 1),
                poke(HANDLING + 4 * slot, ram[HANDLING + 4 * slot] | 0x80, 1),
                poke(ASSOCIATION + 4 * slot, 0x78010010 | index << 8, 4),
                poke(POSITION[0] + 4 * slot, 0x81D5, 4),
                poke(POSITION[1] + 4 * slot, 0x12C * index, 4),
                poke(POSITION[2] + 4 * slot, 0x1831C, 4),
            ]
        self.poke(*commands)
        return {"carried": [f"0x{slot:02x}" for slot in slots]}

    def key(self, name: str, label: str | None = None, wait: float = 0.3) -> dict:
        self.press(KEY[name])
        # Open starts a 64-VBL panel transition, and $04D3D2 ignores every
        # keypad key until $52938 is clear again, so wait it out.
        time.sleep(2.0 if name == "enter" else wait)
        state = self.sample(label or f"key-{name}")
        state["key"] = name
        return state

    def head_to(self, slot: int, rows: list[dict], limit: int = 8) -> None:
        """Rotate the Carried Stack with → until `slot` is at the head."""
        for _ in range(limit):
            state = self.sample("head")
            if state["stack"] and int(state["stack"][0], 16) == slot:
                return
            rows.append(self.key("right", "rotate"))
        raise LabError(f"slot 0x{slot:02x} never reached the head")

    def press(self, scan: int, hold: float = 0.15) -> None:
        code = f"{scan:02d}"
        _fifo_send(self.handle, [f"hatari-event keydown {code}"])
        time.sleep(hold)
        _fifo_send(self.handle, [f"hatari-event keyup {code}"])
        time.sleep(0.2)


def series(machine: Machine, label: str, count: int, interval: float) -> list[dict]:
    rows = []
    for index in range(count):
        if index:
            time.sleep(interval)
        rows.append(machine.sample(f"{label}{index:02d}"))
    return rows


def impact(machine: Machine, seconds: int, count: int, interval: float) -> dict:
    machine.poke(poke(CLOCK, -seconds, 4))
    return {"poked": {"clock": -seconds}, "samples": series(machine, "impact", count, interval)}


def wish(machine: Machine, page: int, count: int, interval: float) -> dict:
    before = machine.sample("wish-before")
    crystal = _u(before["_ram"], CRYSTAL, 1) | 0x80
    pokes = {"$7856": "0x83", "$7857": f"0x{page:02x}", "$7126": f"0x{crystal:02x}",
             "$7B96": "0x8000"}
    machine.poke(poke(DOCUMENT, 0x8300 | page, 2), poke(CRYSTAL, crystal, 1),
                 poke(PAGE_GATE, 0x8000, 2))
    return {"page": page, "poked": pokes, "before": before,
            "samples": series(machine, f"wish{page}-", count, interval)}


def enter_space(machine: Machine) -> dict:
    """From `dion-north-airborne`: Esc climbs into space (#551), key 1 cuts
    the throttle so the clock runs at 32/32 again."""
    machine.press(KEY["esc"])
    rows = []
    for _ in range(40):
        time.sleep(1.0)
        state = machine.sample("climb")
        rows.append(state)
        if state["player"].startswith("0xff") or state["player"].startswith("0x8"):
            break
    else:
        raise LabError("the craft never reached space")
    machine.press(KEY["1"])
    rows.append(machine.sample("space"))
    return {"climb": rows}


def switch_on(machine: Machine, slot: int, rows: list[dict]) -> None:
    machine.head_to(slot, rows)
    rows.append(machine.key("enter", f"open-{slot:02x}"))
    rows.append(machine.key("+", f"on-{slot:02x}"))


def switches(machine: Machine, baseline: dict, args: argparse.Namespace) -> dict:
    """Carry the four detonators and switch each on in turn (Enter, +).

    Along the way: + with no panel open; + twice; - on an open panel whose
    object is no longer at the head; a drop of an open switch."""
    order = [SIDEBOARD, CUPBOARD, HIFI, WASHBASIN]
    slots = ([BOMB] if args.bomb_carried else []) + order
    out = {"carry": machine.carry(slots, baseline["_ram"])}
    rows: list[dict] = [machine.sample("carried")]
    rows.append(machine.key("+", "plus-closed"))
    switch_on(machine, SIDEBOARD, rows)
    rows.append(machine.key("+", "plus-again"))
    rows.append(machine.key("right", "rotate"))
    rows.append(machine.key("-", "minus-rotated"))
    rows.append(machine.key("+", "plus-rotated"))
    switch_on(machine, CUPBOARD, rows)
    rows.append(machine.key("down", "drop-open", wait=4.0))
    switch_on(machine, HIFI, rows)
    switch_on(machine, WASHBASIN, rows)
    rows += series(machine, "after", args.samples, args.interval)
    out["samples"] = rows
    return out


def computer(machine: Machine, baseline: dict, args: argparse.Namespace) -> dict:
    """Carry the AUTHORS COMPUTER, try Enter off the chair, then on it
    (`$7AB0` poked to 14 for that key only), and drive every option."""
    out = {"carry": machine.carry([AUTHORS_COMPUTER], baseline["_ram"])}
    rows = [machine.sample("carried"), machine.key("enter", "enter-unseated")]
    machine.poke(poke(BOARDED, AUTHORS_CHAIR, 2))
    rows.append(machine.sample("seated"))
    rows.append(machine.key("enter", "enter-seated"))
    if not args.stay_seated:
        machine.poke(poke(BOARDED, baseline["boarded"], 2))
        rows.append(machine.sample("unseated"))
    for keys in args.keys.split(","):
        name, _, repeat = keys.partition("x")
        for index in range(int(repeat or 1)):
            rows.append(machine.key(name, f"k-{name}{index}"))
    rows += series(machine, "after", args.samples, args.interval)
    out["samples"] = rows
    return out


def unravel(machine: Machine, args: argparse.Namespace) -> dict:
    """Clear the AUTHORS COMPUTER's Association B, as its destruction does,
    and sample until well past `$1A`."""
    machine.poke(poke(ASSOCIATION + 4 * AUTHORS_COMPUTER, 0, 4))
    rows = []
    previous = None
    for index in range(args.samples):
        if index:
            time.sleep(args.interval)
        state = machine.sample(f"unravel{index:03d}")
        marker = (tuple(state["destroyed"]), state["messageText"], state["death"],
                  state["pending"], state["scriptPc"])
        if marker == previous and index % 10:
            (machine.run / f"{state['sample']}.ram").unlink(missing_ok=True)
            (machine.run / f"{state['sample']}.png").unlink(missing_ok=True)
            state.pop("display", None)
        previous = marker
        state.pop("_ram")
        rows.append(state)
    return {"poked": {"$753C": 0}, "samples": rows}


def explosives(machine: Machine, baseline: dict, args: argparse.Namespace) -> dict:
    """Stack `--count` EXPLOSIVEs on EXPLOSIVE 75's spot, arm 75 with the
    TIMED DETONATOR's size digit 9 and detonate it a few seconds later."""
    ram = baseline["_ram"]
    target = EXPLOSIVES[0]
    commands = []
    for slot in EXPLOSIVES[1:args.count]:
        for base in (ASSOCIATION, *POSITION):
            commands.append(poke(base + 4 * slot, _u(ram, base + 4 * target, 4), 4))
        commands.append(poke(HANDLING - 1 + 4 * slot, ram[HANDLING - 1 + 4 * target], 1))
    clock = _u(ram, CLOCK + 2, 2)
    commands += [poke(DETONATOR_TARGET, target * 4, 4), poke(DETONATOR_ARMED, 1, 2),
                 poke(BLAST_DIGIT, 9, 1), poke(DETONATION_TIME, clock + args.seconds, 2)]
    machine.poke(*commands)
    return {"poked": {"stacked": args.count, "target": f"0x{target:02x}",
                      "digit": 9, "detonationTime": clock + args.seconds},
            "samples": series(machine, "blast", args.samples, args.interval)}


def run(args: argparse.Namespace) -> dict:
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(args.roms))
    validate_image(program, authority["programImage"], label="Working Authority STX")
    validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    snapshot = args.snapshot.resolve(strict=True)
    name = (f"endgame-{args.case}" + (f"{args.page}" if args.case == "wish" else "")
            + ("-bomb" if args.bomb_carried else "") + ("-space" if args.space else ""))
    run_directory = WORK_ROOT / _run_id(name)
    run_directory.mkdir(parents=True)
    fifo = run_directory / "cmd.fifo"
    (run_directory / "play.txt").write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari, tos=tos, disk_a=program,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=run_directory / "play.txt", fast_forward=args.fast_forward,
        statusbar=False, cmd_fifo=fifo, extra_args=["--memstate", str(snapshot)],
    )
    result: dict = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "case": args.case,
        "runDirectory": str(run_directory.relative_to(REPO)),
        "snapshot": {"path": str(snapshot), "sha256": _sha256(snapshot.read_bytes())},
        "probe": {"path": str(Path(__file__).resolve().relative_to(REPO)),
                  "sha256": _sha256(Path(__file__).read_bytes())},
        "toolchain": toolchain.as_dict(),
        "fastForward": args.fast_forward,
    }
    process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                               stdout=(run_directory / "hatari.log").open("wb"),
                               stderr=subprocess.STDOUT, env=os.environ | headless_env())
    try:
        for _ in range(200):
            if fifo.exists():
                break
            if process.poll() is not None:
                raise LabError(f"Hatari exited before the FIFO; inspect {run_directory}")
            time.sleep(0.05)
        else:
            raise LabError("Hatari did not create the command FIFO")
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(args.settle)
            if process.poll() is not None:
                raise LabError(f"Hatari exited during the restore; inspect {run_directory}")
            machine = Machine(handle, run_directory)
            baseline = machine.sample("baseline")
            if baseline["pauseGate"]:
                machine.press(0x39)  # space resumes a paused capture
                baseline = machine.sample("baseline")
            ram = baseline["_ram"]
            result["code"] = {label: _sha256(ram[start:end])
                              for label, start, end in CODE_WINDOWS}
            result["baseline"] = baseline
            if args.space:
                result["space"] = enter_space(machine)
                baseline = machine.sample("space-baseline")
            if args.case == "impact":
                result["impact"] = impact(machine, args.seconds, args.samples, args.interval)
            elif args.case == "switches":
                result["switches"] = switches(machine, baseline, args)
            elif args.case == "computer":
                result["computer"] = computer(machine, baseline, args)
            elif args.case == "unravel":
                result["unravel"] = unravel(machine, args)
            elif args.case == "explosives":
                result["explosives"] = explosives(machine, baseline, args)
            else:
                result["wish"] = wish(machine, args.page, args.samples, args.interval)
                if args.then_impact:
                    result["impact"] = impact(machine, args.seconds, args.samples,
                                              args.interval)
            _fifo_send(handle, ["hatari-debug quit"])
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        fifo.unlink(missing_ok=True)

    def clean(value):  # noqa: ANN001, ANN202
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k != "_ram"}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    result = clean(result)
    (run_directory / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def summarise(result: dict) -> None:
    print(f"run {result['runDirectory']}")
    rows = [("baseline", result["baseline"])]
    if "wish" in result:
        rows += [("wish", s) for s in result["wish"]["samples"]]
    if "impact" in result:
        rows += [("impact", s) for s in result["impact"]["samples"]]
    for case in ("space", "switches", "computer", "unravel", "explosives"):
        if case in result:
            block = result[case]
            rows += [(case, s) for s in block.get("samples", block.get("climb", []))]
    last_text = None
    for phase, s in rows:
        text = s["messageText"] if s["messageText"] != last_text else "…"
        last_text = s["messageText"]
        print(f"{phase:<8} {s['sample']:<14} clock {s['clock']:>7} "
              f"E {s['erisState']} D {s['damoclesState']} n {s['destroyedCount']:>2} "
              f"drift {s['driftArm']:>6} imp {s['impactFlag']} dead {s['death']} "
              f"body {s['playerBody']:>2} pend {s['pending']} pc {s['scriptPc']} "
              f"vbl {s['vbl']} x{s['destroyed']} sw {s['switches']} "
              f"pan {s['panel']} opt {s['computerOption']}:{s['computerValue']} "
              f"cur {s['unravelCursor']} deb {s['debris']} "
              f"| {text[:60]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--case", required=True, choices=(
        "impact", "wish", "switches", "computer", "unravel", "explosives"))
    parser.add_argument("--space", action="store_true",
                        help="climb into space first (dion-north-airborne)")
    parser.add_argument("--bomb-carried", action="store_true",
                        help="switches: carry the NOVABOMB too")
    parser.add_argument("--stay-seated", action="store_true",
                        help="computer: leave $7AB0 at 14 after Enter")
    parser.add_argument("--count", type=int, default=7,
                        help="explosives: EXPLOSIVEs in the stack, the armed one included")
    parser.add_argument("--keys", default="+,-x2,k1,+x8,k2,+,-x2,k0,+x4,k4,+,*",
                        help="computer: comma-separated keys, NAMExN repeats")
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument("--page", type=int, default=5)
    parser.add_argument("--then-impact", action="store_true")
    parser.add_argument("--seconds", type=int, default=4)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--settle", type=float, default=3.0)
    parser.add_argument("--no-fast-forward", dest="fast_forward", action="store_false")
    args = parser.parse_args()
    summarise(run(args))


if __name__ == "__main__":
    try:
        main()
    except (LabError, OSError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"error: {error}") from error
