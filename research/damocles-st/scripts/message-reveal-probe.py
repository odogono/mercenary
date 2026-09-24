#!/usr/bin/env python3
"""Damocles message reveal probe (#307).

Recovers, at exact VBL granularity, what the native display routine at
``$052402`` does to the panel message row while the message gate ``$7BA0`` is
raised.

Each traced case runs in **two processes**. The first replays a tracked route,
supplies the input the response needs, and saves whole-machine state while the
response is running. The second boots that state, arms one breakpoint, and then
stops on 215 consecutive VBLs, saving at every stop

* the message workspace ``$7B90``-``$7BFF`` (text pointer, gate, row plane
  selector, reveal counter, numeric-field shift, row address, wait counter),
* the display variables embedded in the routine at ``$0523B0``-``$0523BF``
  (glyph carry pointer, sub-cell shift, live duration, default duration, the
  shorten-on-exhaustion flag),
* the panel row's six scanlines in **both** screen buffers.

Splitting the two is not cosmetic: a route stop/continue landing inside a
breakpoint script wedges Hatari's debugger, so the traced process issues no
route commands at all. For the same reason the trace stops on every VBL rather
than skipping ahead -- Hatari's own ``VBL`` variable does not keep step with the
program's frame interrupt across multi-VBL gaps in this scene, and the program's
counters are read back at every stop instead.

Nothing is written into the guest except the route's own joystick soft-copy, so
these are ordinary gameplay observations taken while the emulator is stopped.

Cases:

``reveal``    take the key and trace one whole message of the response frame by
              frame -- whichever one starts after the trace is armed.
``keys``      hold every plausible input down across the whole response and
              sample it at ordinary intervals, to test whether any of them ends
              a message early. This case samples rather than traces: a
              breakpoint chain does not arm under held input in this harness.
``indexed``   stop on the ``$14`` indexed-message handler and record the text
              pointer it publishes, which settles whether that path displays a
              system string record from its first byte.
``clear``     trace the response's final message -- system string slot 50, whose
              record is nothing but spaces -- so a full-width line clear is
              observed rather than inferred.
``system``    replay the tracked no-key boarding route instead, whose refusal
              reaches the native system-string helper at ``$054808``. That
              record is 49 characters, one more than the row holds, so the trace
              catches its second block: the path that both needs a second block
              and raises the shorten flag.

Run from the repository root:

  python3 research/damocles-st/scripts/message-reveal-probe.py --roms /path/to/roms

Captures and decoded rows stay under the laboratory's ignored ``work/``
directory (docs/research/damocles-gap.md). Only counts, offsets and structural
comparisons belong in tracked notes: the row's pixels are game text.
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
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import JOYSTICK1_SOFTCOPY, LabError, format_hatari_key, validate_image  # noqa: E402
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
NO_KEY_ROUTE = LAB_ROOT / "scenarios" / "limo-no-key-route.json"

SCAN_RSHIFT = 0x36
SCAN_UP = 0x48

# Where the routine turns the handler's gate into its own presenting value.
GATE_RAISED_PC = 0x0523CC
# The $14 indexed-message handler, immediately after it publishes the pointer.
INDEXED_PC = 0x051B86

# Sampled windows. The row windows are fixed 1 KiB spans that contain the six
# scanlines of the message row in each of the two screen buffers; which buffer
# a frame drew into is decided from $7BF6 when the sample is decoded.
VARS = (0x007B90, 0x0070)
DISPLAY = (0x0523B0, 0x0010)
ROW_WINDOWS = ((0x06DA00, 0x0400), (0x07DA00, 0x0400))
# Read once in phase one, only to decide whether the route's action landed.
CHECK = (0x006000, 0x2000)

# Geometry read out of the routine. Confirmed, not assumed: the probe checks
# every one of these against what the frames do.
ROW_LINE_BYTES = 0xA0
ROW_LINES = 6
ROW_GROUPS = 18  # 8-byte interleaved groups, $00..$88
ROW_PIXELS = ROW_GROUPS * 16  # 288
SCROLL_PIXELS = 8

# Every stop is one VBL after the last. Hatari's own ``VBL`` debugger variable
# does not keep step with the program's frame interrupt across multi-VBL gaps in
# this scene, so the trace never asks for a gap: the program's counters are the
# clock, and they are read back at every stop.
TRACE_VBLS = 215
FRAMES = list(range(TRACE_VBLS))


def _take(t: float) -> list[dict]:
    return [
        {"t": t, "kind": "keydown", "scan": SCAN_RSHIFT},
        {"t": t + 0.55, "kind": "keydown", "scan": SCAN_UP},
        {"t": t + 0.70, "kind": "keyup", "scan": SCAN_UP},
        {"t": t + 1.00, "kind": "keyup", "scan": SCAN_RSHIFT},
    ]


# Held down for the whole of the ``keys`` case: Space, Return, Escape, Left
# Shift, Control, Left, Right and Undo, with the joystick fire bit held on the
# soft-copy beside them. The take and drop chords are deliberately absent -- they
# would fire the take handler rather than test the message. If Damocles has an
# equivalent of Targ's skip, it is in this set or it is not an input at all.
KEYS_UNDER_TEST = (0x39, 0x1C, 0x01, 0x2A, 0x1D, 0x4B, 0x4D, 0x61)
JOYSTICK_FIRE = 0x80


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _u16(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 2], "big")


def _u32(data: bytes, base: int, address: int) -> int:
    off = address - base
    return int.from_bytes(data[off : off + 4], "big")


def _no_key_timeline(route: dict) -> tuple[list[dict], float]:
    """The no-key route walks to the limo and boards; it supplies its own keys."""
    starts: list[float] = []
    cursor = 0.0
    for segment in route["segments"]:
        starts.append(cursor)
        cursor += segment["seconds"]
    actions = [
        {"t": starts[i], "kind": "stick", "byte": route["segments"][i]["rawByte"]}
        for i in range(len(route["segments"]))
    ]
    for event in route["keyboardEvents"]:
        actions.append(
            {"t": event["t"], "kind": event["type"], "scan": event["stScancode"] & 0x7F}
        )
    actions.sort(key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1))
    return actions, cursor


def _timeline(route: dict) -> tuple[list[dict], float]:
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
    for action in _take(0.0):
        actions.append({**action, "t": take_at + action["t"]})
    actions.sort(key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1))
    return actions, take_at


def _write_chain(run: Path) -> list[Path]:
    """Write the one-stop-per-frame debugger script chain.

    Each script saves the windows for its frame, arms the next stop the right
    number of VBLs ahead, and continues. The last one quits, which is how the
    host knows the trace finished.
    """
    scripts = [run / f"frame-{i:03d}.txt" for i in range(len(FRAMES))]
    for index, frame in enumerate(FRAMES):
        lines = ["setopt hex"]
        for label, (base, length) in (
            ("vars", VARS),
            ("disp", DISPLAY),
            ("rowa", ROW_WINDOWS[0]),
            ("rowb", ROW_WINDOWS[1]),
        ):
            target = run / f"f{index:03d}-{label}.bin"
            lines.append(f"savebin {target.resolve()} ${base:x} ${length:x}")
        if index + 1 < len(FRAMES):
            delta = FRAMES[index + 1] - frame
            lines.append(
                f'b VBL = "VBL+{delta}" :once :quiet :file {scripts[index + 1].resolve()}'
            )
            lines.append("c")
        else:
            lines.append(f"savebin {(run / 'final-vars.bin').resolve()} ${VARS[0]:x} ${VARS[1]:x}")
            lines.append("quit")
        scripts[index].write_text("\n".join((*lines, "")), encoding="utf-8")
    return scripts


def _row_bitmap(window: bytes, window_base: int, row_address: int) -> list[list[int]]:
    """Unpack the six scanlines of the row into 2-bit pixels.

    The routine scrolls and draws planes 0 and 1 only -- bytes 0..3 of each
    eight-byte interleaved group -- so only those two planes are read back.
    """
    rows: list[list[int]] = []
    for line in range(ROW_LINES):
        start = row_address - window_base + line * ROW_LINE_BYTES
        pixels: list[int] = []
        for group in range(ROW_GROUPS):
            off = start + group * 8
            p0 = int.from_bytes(window[off : off + 2], "big")
            p1 = int.from_bytes(window[off + 2 : off + 4], "big")
            for bit in range(15, -1, -1):
                pixels.append(((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1))
        rows.append(pixels)
    return rows


def _decode_frame(run: Path, index: int, frame: int) -> dict[str, Any]:
    paths = {
        label: run / f"f{index:03d}-{label}.bin" for label in ("vars", "disp", "rowa", "rowb")
    }
    missing = [label for label, path in paths.items() if not path.is_file()]
    if missing:
        return {"frame": frame, "missing": missing}
    vars_blob = paths["vars"].read_bytes()
    disp_blob = paths["disp"].read_bytes()
    row_address = _u32(vars_blob, VARS[0], 0x7BF6)
    state = {
        "frame": frame,
        "messagePointer": f"0x{_u32(vars_blob, VARS[0], 0x7B98):08x}",
        "messageGate": f"0x{_u16(vars_blob, VARS[0], 0x7BA0):04x}",
        "rowPlane": _u16(vars_blob, VARS[0], 0x7BA2),
        "revealCounter": _u16(vars_blob, VARS[0], 0x7BE6),
        "waitCounter": _u16(vars_blob, VARS[0], 0x7B9C),
        "numericShift": f"0x{_u16(vars_blob, VARS[0], 0x7BE8):04x}",
        "rowAddress": f"0x{row_address:08x}",
        "glyphCarry": f"0x{_u32(disp_blob, DISPLAY[0], 0x523B2):08x}",
        "subCellShift": _u16(disp_blob, DISPLAY[0], 0x523B6),
        "duration": _u16(disp_blob, DISPLAY[0], 0x523B8),
        "defaultDuration": _u16(disp_blob, DISPLAY[0], 0x523BA),
        "shortenFlag": _u16(disp_blob, DISPLAY[0], 0x523BC),
    }
    bitmaps = {}
    for label, (base, _length) in zip(("rowa", "rowb"), ROW_WINDOWS):
        blob = paths[label].read_bytes()
        address = base + (row_address & 0xFFFF) - (ROW_WINDOWS[0][0] & 0xFFFF)
        bitmaps[label] = _row_bitmap(blob, base, address)
    drawn = "rowa" if (row_address & 0xFFFF0000) == (ROW_WINDOWS[0][0] & 0xFFFF0000) else "rowb"
    other = "rowb" if drawn == "rowa" else "rowa"
    state["drawnBuffer"] = drawn
    state["buffersAgree"] = bitmaps[drawn] == bitmaps[other]
    state["inkPixels"] = sum(1 for line in bitmaps[drawn] for px in line if px)
    return {"state": state, "bitmap": bitmaps[drawn]}


def _compare(previous: list[list[int]] | None, current: list[list[int]]) -> dict[str, Any]:
    """Structural comparison only: no pixel values leave this function."""
    if previous is None:
        return {}
    shifted = all(
        current[y][x] == previous[y][x + SCROLL_PIXELS]
        for y in range(ROW_LINES)
        for x in range(ROW_PIXELS - SCROLL_PIXELS)
    )
    unchanged = current == previous
    entering = sum(
        1
        for y in range(ROW_LINES)
        for x in range(ROW_PIXELS - SCROLL_PIXELS, ROW_PIXELS)
        if current[y][x]
    )
    return {
        "scrolledOneCell": shifted and not unchanged,
        "unchanged": unchanged,
        "enteringInk": entering,
    }


def _wait_for(path: Path, process: subprocess.Popen, seconds: float) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if path.is_file():
            return True
        if process.poll() is not None:
            return path.is_file()
        time.sleep(0.05)
    return False


def _shutdown(process: subprocess.Popen, fifo: Path) -> None:
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


def _boot(
    run: Path,
    config: dict,
    hatari: Path,
    tos: Path,
    program: Path,
    memstate: Path,
    *,
    tag: str = "run",
):
    fifo = run / f"{tag}.fifo"
    if fifo.exists():
        fifo.unlink()
    parse = run / f"{tag}-play.txt"
    parse.write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari,
        tos=tos,
        disk_a=program,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse,
        fast_forward=False,
        statusbar=False,
        cmd_fifo=fifo,
        extra_args=["--memstate", str(memstate.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    log = (run / f"hatari-{tag}.log").open("wb")
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env)
    for _ in range(300):
        if fifo.exists() or process.poll() is not None:
            break
        time.sleep(0.02)
    if not fifo.exists():
        process.kill()
        raise LabError("Hatari did not create the command FIFO")
    return process, fifo


def _replay(
    *,
    run: Path,
    config: dict,
    hatari: Path,
    tos: Path,
    program: Path,
    memstate: Path,
    actions: list[dict],
    save_at: float,
    saved_state: Path,
    settle: float,
) -> None:
    """Walk the route, act, and save whole-machine state at ``save_at``."""
    process, fifo = _boot(run, config, hatari, tos, program, memstate, tag="replay")
    try:
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            t0 = time.monotonic()
            for action in [*actions, {"t": save_at, "kind": "statesave"}]:
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
                    _fifo_send(handle, [f"hatari-event {kind} {format_hatari_key(action['scan'])}"])
                elif kind == "statesave":
                    _fifo_send(
                        handle,
                        [
                            "hatari-stop",
                            "hatari-debug setopt hex",
                            f"hatari-debug savebin {(run / 'replay-check.bin').resolve()} "
                            f"${CHECK[0]:x} ${CHECK[1]:x}",
                            f"hatari-debug statesave {saved_state.resolve()}",
                            "hatari-cont",
                        ],
                    )
                    _wait_for(saved_state, process, 20.0)
            _fifo_send(handle, ["hatari-stop", "hatari-debug quit"])
        process.wait(timeout=20)
    except (subprocess.TimeoutExpired, BrokenPipeError):
        # Hatari quits the moment the chain's last stop runs, which closes the
        # FIFO under the host. The trace is already on disk when that happens.
        pass
    finally:
        _shutdown(process, fifo)


# Seconds from the resumed mid-response state at which the held-input case
# samples. The response has about 18 s left to run at that point.
HOLD_SAMPLES = (0.5, 3.0, 6.0, 9.0, 12.0, 15.0, 18.0, 21.0, 24.0)


def _hold_and_sample(
    *,
    run: Path,
    config: dict,
    hatari: Path,
    tos: Path,
    program: Path,
    saved_state: Path,
    settle: float,
) -> list[dict]:
    """Resume mid-response with every input held, and sample the display state.

    A breakpoint chain does not arm in this harness once inputs are held, so
    this case uses the ordinary stop/savebin/continue sampling the pickup probe
    uses. Second-granularity is enough for what it has to answer: an input that
    ended a message early would move the whole response, not a frame of it.
    """
    process, fifo = _boot(run, config, hatari, tos, program, saved_state, tag="hold")
    samples: list[dict] = []
    try:
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            _fifo_send(
                handle,
                [
                    "hatari-stop",
                    "hatari-debug setopt hex",
                    f"hatari-debug w ${JOYSTICK1_SOFTCOPY:x} {JOYSTICK_FIRE:02x}",
                    "hatari-cont",
                ],
            )
            for scan in KEYS_UNDER_TEST:
                _fifo_send(handle, [f"hatari-event keydown {format_hatari_key(scan)}"])
                time.sleep(0.05)
            t0 = time.monotonic()
            for index, offset in enumerate(HOLD_SAMPLES):
                delay = offset - (time.monotonic() - t0)
                if delay > 0:
                    time.sleep(delay)
                low = run / f"keys-{index:02d}-low.bin"
                disp = run / f"keys-{index:02d}-disp.bin"
                _fifo_send(
                    handle,
                    [
                        "hatari-stop",
                        "hatari-debug setopt hex",
                        f"hatari-debug savebin {low.resolve()} ${CHECK[0]:x} ${CHECK[1]:x}",
                        f"hatari-debug savebin {disp.resolve()} ${DISPLAY[0]:x} ${DISPLAY[1]:x}",
                        "hatari-cont",
                    ],
                )
                time.sleep(0.25)
            _fifo_send(handle, ["hatari-stop", "hatari-debug quit"])
        process.wait(timeout=20)
    except (subprocess.TimeoutExpired, BrokenPipeError):
        pass
    finally:
        _shutdown(process, fifo)

    decoded: list[dict] = []
    for index, offset in enumerate(HOLD_SAMPLES):
        low = run / f"keys-{index:02d}-low.bin"
        disp = run / f"keys-{index:02d}-disp.bin"
        if not (low.is_file() and disp.is_file()):
            continue
        lb, db = low.read_bytes(), disp.read_bytes()
        decoded.append(
            {
                "offset": offset,
                "messageGate": f"0x{_u16(lb, CHECK[0], 0x7BA0):04x}",
                "messagePointer": f"0x{_u32(lb, CHECK[0], 0x7B98):08x}",
                "revealCounter": _u16(lb, CHECK[0], 0x7BE6),
                "waitCounter": _u16(lb, CHECK[0], 0x7B9C),
                "scriptFlags": f"0x{_u16(lb, CHECK[0], 0x7BD8):04x}",
                "scriptPc": f"0x{_u32(lb, CHECK[0], 0x781E):08x}",
                "inventoryCount": _u16(lb, CHECK[0], 0x61CC),
                "duration": _u16(db, DISPLAY[0], 0x523B8),
                "shortenFlag": _u16(db, DISPLAY[0], 0x523BC),
                "sha256": {"low": _sha256(low), "display": _sha256(disp)},
            }
        )
    return decoded


def run_case(name: str, roms_root: Path | None, settle: float) -> dict:
    route_path = NO_KEY_ROUTE if name == "system" else ROUTE
    route = json.loads(route_path.read_text(encoding="utf-8"))
    actions, take_at = (
        _no_key_timeline(route) if name == "system" else _timeline(route)
    )

    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program, tos = resolve_images(authority, root)
    validate_image(program, authority["programImage"], label="Working Authority STX")
    validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    memstate = (LAB_ROOT.parent.parent / route["memstate"]).resolve()
    if not memstate.is_file():
        raise LabError(f"Snapshot not found: {memstate}")

    run = WORK_ROOT / _run_id(f"message-reveal-{name}")
    run.mkdir(parents=True, exist_ok=True)

    # Where phase one stops and hands over, and what phase two has to do before
    # the message it traces can happen at all.
    if name == "system":
        # The no-key route's own boarding key is held back for phase two, so the
        # refusal message is raised in the traced process rather than before it.
        board = [e for e in actions if e["kind"] in ("keydown", "keyup") and e["scan"] == 0x30]
        actions = [a for a in actions if a not in board]
        save_at = take_at
        # The refusal's record is 49 characters, so
        # the trace catches its *second* block -- $0523CC is also where a block
        # restart raises the gate again -- which is the block that shows both the
        # over-length behaviour and the shorten flag.
        pre_events = board
    else:
        # Saved while the response's first message is still presenting, so the
        # traced process starts clean and the second message is seconds away.
        save_at = take_at + 2.0
        pre_events = []

    if name == "system":
        scripts = _write_chain(run)
        sentinel = run / "final-vars.bin"
        arm = f'hatari-debug b pc = ${GATE_RAISED_PC:x} :once :quiet :file {scripts[0].resolve()}'
    elif name == "clear":
        scripts = _write_chain(run)
        handoff = run / "clear-arm.txt"
        handoff.write_text(
            "\n".join(
                (
                    "setopt hex",
                    f'b VBL = "VBL+1" :once :quiet :file {scripts[0].resolve()}',
                    "c",
                    "",
                )
            ),
            encoding="utf-8",
        )
        sentinel = run / "final-vars.bin"
        arm = f'hatari-debug b pc = ${INDEXED_PC:x} :once :quiet :file {handoff.resolve()}'
    elif name == "keys":
        sentinel = run / "keys-05-low.bin"
        arm = None
    elif name == "indexed":
        script = run / "indexed.txt"
        script.write_text(
            "\n".join(
                (
                    "setopt hex",
                    f"savebin {(run / 'indexed-vars.bin').resolve()} ${VARS[0]:x} ${VARS[1]:x}",
                    f"savebin {(run / 'indexed-disp.bin').resolve()} "
                    f"${DISPLAY[0]:x} ${DISPLAY[1]:x}",
                    "quit",
                    "",
                )
            ),
            encoding="utf-8",
        )
        sentinel = run / "indexed-vars.bin"
        arm = f'hatari-debug b pc = ${INDEXED_PC:x} :once :quiet :file {script.resolve()}'
    else:
        scripts = _write_chain(run)
        sentinel = run / "final-vars.bin"
        arm = f'hatari-debug b pc = ${GATE_RAISED_PC:x} :once :quiet :file {scripts[0].resolve()}'

    first_stop = run / {
        "indexed": "indexed-vars.bin",
        "keys": "keys-00-low.bin",
    }.get(name, "f000-vars.bin")
    saved_state = run / "midresponse.sav"

    # Phase one replays the route and saves whole-machine state while the
    # response is running. Phase two boots that state in a fresh process and
    # does nothing but arm the trace, so no route command can ever land inside
    # a breakpoint script.
    _replay(
        run=run,
        config=config,
        hatari=hatari,
        tos=tos,
        program=program,
        memstate=memstate,
        actions=actions,
        save_at=save_at,
        saved_state=saved_state,
        settle=settle,
    )
    # The route's action either landed or it did not, and phase two is only
    # worth booting if it did: a message gate that never rises is the same
    # symptom as a wedged trace and should not be waited out as one.
    check = run / "replay-check.bin"
    responded = False
    if check.is_file():
        blob = check.read_bytes()
        if name == "system":
            responded = True  # the refusal is raised in phase two, not phase one

        else:
            responded = _u16(blob, CHECK[0], 0x61CC) > 0 and _u16(blob, CHECK[0], 0x7BA0) != 0
    if not saved_state.is_file() or not responded:
        result_stub = {"case": name, "runId": run.name, "reached": False}
        (run / "result.json").write_text(
            json.dumps(result_stub, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return result_stub

    if name == "keys":
        samples = _hold_and_sample(
            run=run,
            config=config,
            hatari=hatari,
            tos=tos,
            program=program,
            saved_state=saved_state,
            settle=settle,
        )
        result = {
            "case": name,
            "runId": run.name,
            "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "route": {
                "path": str(route_path),
                "sha256": _sha256(route_path),
                "takeAt": round(take_at, 3),
            },
            "heldScancodes": list(KEYS_UNDER_TEST),
            "heldJoystickByte": JOYSTICK_FIRE,
            "toolchain": toolchain.as_dict(),
            "images": {
                "program": _sha256(program),
                "tos": _sha256(tos),
                "memstate": _sha256(memstate),
            },
            "probeSha256": _sha256(Path(__file__).resolve()),
            "reached": bool(samples),
            "samples": samples,
        }
        (run / "result.json").write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return result

    process, fifo = _boot(run, config, hatari, tos, program, saved_state, tag="trace")
    try:
        with fifo.open("w", encoding="utf-8") as handle:
            time.sleep(settle)
            _fifo_send(handle, ["hatari-stop", arm, "hatari-cont"])
            for event in pre_events:
                _fifo_send(handle, [f"hatari-event {event['kind']} {format_hatari_key(event['scan'])}"])
                time.sleep(0.1)
            started = _wait_for(first_stop, process, 60.0 if name == "clear" else 30.0)
            reached = _wait_for(sentinel, process, 300.0) if started else False
            if not reached:
                _fifo_send(handle, ["hatari-stop", "hatari-debug quit"])
        process.wait(timeout=20)
    except (subprocess.TimeoutExpired, BrokenPipeError):
        # Hatari quits the moment the chain's last stop runs, which closes the
        # FIFO under the host. The trace is already on disk when that happens.
        pass
    finally:
        _shutdown(process, fifo)

    result: dict[str, Any] = {
        "case": name,
        "runId": run.name,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "route": {
            "path": str(route_path),
            "sha256": _sha256(route_path),
            "takeAt": round(take_at, 3),
        },
        "toolchain": toolchain.as_dict(),
        "images": {
            "program": _sha256(program),
            "tos": _sha256(tos),
            "memstate": _sha256(memstate),
        },
        "probeSha256": _sha256(Path(__file__).resolve()),
        "reached": sentinel.is_file(),
    }

    if name == "indexed":
        if sentinel.is_file():
            blob = sentinel.read_bytes()
            disp = (run / "indexed-disp.bin").read_bytes()
            result["indexed"] = {
                "messagePointer": f"0x{_u32(blob, VARS[0], 0x7B98):08x}",
                "messageGate": f"0x{_u16(blob, VARS[0], 0x7BA0):04x}",
                "duration": _u16(disp, DISPLAY[0], 0x523B8),
                "shortenFlag": _u16(disp, DISPLAY[0], 0x523BC),
            }
    else:
        frames: list[dict] = []
        previous: list[list[int]] | None = None
        previous_frame: int | None = None
        for index, frame in enumerate(FRAMES):
            decoded = _decode_frame(run, index, frame)
            if "state" not in decoded:
                frames.append(decoded)
                continue
            entry = dict(decoded["state"])
            if previous_frame is not None and frame - previous_frame == 1:
                entry.update(_compare(previous, decoded["bitmap"]))
            frames.append(entry)
            previous = decoded["bitmap"]
            previous_frame = frame
        result["frames"] = frames

    (run / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roms", type=Path, default=None)
    parser.add_argument(
        "--case", choices=("reveal", "keys", "indexed", "clear", "system"), default=None
    )
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--settle", type=float, default=3.0)
    args = parser.parse_args(argv)

    names = [args.case] if args.case else ["reveal", "keys", "indexed", "clear", "system"]
    results = []
    for name in names:
        for attempt in range(1, args.attempts + 1):
            result = run_case(name, args.roms, args.settle)
            if result["reached"]:
                break
            print(f"{name}: attempt {attempt} did not reach the message; retrying", file=sys.stderr)
        results.append(result)
        print(json.dumps({k: v for k, v in result.items() if k != "frames"}, indent=2))
        if "frames" in result:
            for entry in result["frames"]:
                print(json.dumps(entry, sort_keys=True))
    return 0 if all(r["reached"] for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
