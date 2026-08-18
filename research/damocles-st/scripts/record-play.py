#!/usr/bin/env python3
"""Record and replay a Damocles stick sequence (#79 doorway recon).

record:
  Launches one interactive Hatari (real window, --joy1 keys, fast-forward off,
  empty parse script so it never sits in the debugger) and, while you play,
  samples the joystick-1 direction soft-copy $79C2 at ~8 Hz over the command
  FIFO, printing a live readout of the direction it detects.

  Durations are host wall-clock: Damocles installs its own VBL handler and never
  ticks the TOS frame clock ($0466 stays constant), so there is no usable guest
  counter. Recording is realtime, so seconds map to VBLs at the PAL rate.

  Output: work/<run>/stick-sequence.json — segments {rawByte, dirs, seconds,
  vbls} plus the raw samples. Idle (byte 0) segments are kept; replay trims
  leading/trailing idle.

replay:
  Boots headless, presses Space, waits for the world, then reproduces the
  recorded segments with a VBL-breakpoint chain: each step pokes $79C2 and arms
  `b VBL="VBL+N"` to run the next step. Frame-accurate regardless of
  fast-forward, and no host stop/cont polling. Captures observed.png/.ram at the
  end.

snapshot:
  Boots headless, plays through the automatic intro under fast-forward, and
  saves an on-foot Eris-spaceport save-state (statesave). record --memstate and
  replay then boot straight into it, skipping the ~3-minute intro.

Usage (from repo root):
  python3 research/damocles-st/scripts/record-play.py snapshot
  python3 research/damocles-st/scripts/record-play.py record --memstate research/damocles-st/snapshots/eris-spaceport-onfoot.sav
  python3 research/damocles-st/scripts/record-play.py record --seconds 120 --headless   # plumbing smoke test
  python3 research/damocles-st/scripts/record-play.py replay --sequence <path-to-stick-sequence.json>
"""

from __future__ import annotations

import argparse
import json
import os
import re
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
from damocleslab.runtime import (  # noqa: E402
    build_hatari_command,
    headless_env,
    render_title_capture_script,
    render_vbl_wait_script,
)
from damocleslab.toolchain import discover_toolchain  # noqa: E402

# Damocles installs its own VBL handler and does not tick the TOS frame clock
# ($0466), so we cannot rely on a guest counter. Recording runs realtime with
# fast-forward off, so host wall-clock maps directly to VBLs at the PAL rate;
# replay converts seconds -> real VBLs for a frame-accurate breakpoint chain.
VBL_RATE = 50.0  # PAL "st" model
BIT_NAMES = [(0x01, "up"), (0x02, "down"), (0x04, "left"), (0x08, "right"), (0x80, "fire")]
KEY_DOWN_RE = re.compile(r"key down: sym=(\d+) scan=(\d+) mod=0x([0-9a-f]+) name='([^']*)'", re.I)
KEY_UP_RE = re.compile(r"key up: sym=(\d+) scan=(\d+) mod=0x([0-9a-f]+) name='([^']*)'", re.I)
KEY_MAP_RE = re.compile(r"key map: sym=0x([0-9a-f]+) to ST-scan=0x([0-9a-f]+)", re.I)


def _dirs(byte: int) -> list[str]:
    return [name for bit, name in BIT_NAMES if byte & bit]


def _boot_scripts(run_directory: Path, config: dict) -> tuple[Path, Path]:
    ready_log = run_directory / "observe-title.log"
    if ready_log.exists():
        ready_log.unlink()
    pc = config["checkpoints"]["title-screen"]["pc"]
    extra_vbls = int(config["checkpoints"]["title-screen"].get("extraVbls", 1400))
    on_title = run_directory / "observe-on-title.txt"
    wait_script = run_directory / "observe-wait-vbl.txt"
    parse_script = run_directory / "observe-boot.txt"
    on_title.write_text(f"logfile {ready_log.resolve()}\nr\nc\n", encoding="utf-8")
    wait_script.write_text(render_vbl_wait_script(dump_script=on_title, extra_vbls=extra_vbls), encoding="utf-8")
    parse_script.write_text(render_title_capture_script(next_script=wait_script, pc=pc), encoding="utf-8")
    return parse_script, ready_log


def _wait_for(path: Path, process: subprocess.Popen, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if path.is_file() and path.stat().st_size > 0:
            return True
        if process.poll() is not None:
            return False
        time.sleep(0.05)
    return False


def _launch(command: list[str], log_path: Path, env: dict) -> subprocess.Popen:
    log = log_path.open("w", encoding="utf-8")
    return subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env)


def _read_uint(path: Path) -> int | None:
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if not raw:
        return None
    return int.from_bytes(raw, "big")


def _drain_key_trace(
    path: Path,
    *,
    offset: int,
    now: float,
    pending_down: dict[int, dict],
    sym_to_st: dict[int, int],
    events: list[dict],
) -> int:
    """Consume new Hatari keymap trace lines and timestamp mapped ST keys.

    Hatari emits a host ``key down`` line followed by its ``key map`` line.
    Releases only contain the host symbol, so retain the learned symbol→ST
    mapping. Joystick-mapped cursor keys do not emit a guest key-map event and
    therefore remain represented solely by the $79C2 stick samples.
    """
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            fh.seek(offset)
            lines = fh.readlines()
            offset = fh.tell()
    except OSError:
        return offset

    for line in lines:
        if match := KEY_DOWN_RE.search(line):
            sym = int(match.group(1))
            pending_down[sym] = {
                "t": now,
                "hostSym": sym,
                "hostScan": int(match.group(2)),
                "modifiers": int(match.group(3), 16),
                "name": match.group(4),
            }
            continue
        if match := KEY_MAP_RE.search(line):
            sym = int(match.group(1), 16)
            st_scan = int(match.group(2), 16)
            sym_to_st[sym] = st_scan
            event = pending_down.pop(sym, {"t": now, "hostSym": sym, "name": ""})
            events.append({**event, "type": "keydown", "stScancode": st_scan})
            continue
        if match := KEY_UP_RE.search(line):
            sym = int(match.group(1))
            if sym in sym_to_st:
                events.append(
                    {
                        "t": now,
                        "type": "keyup",
                        "hostSym": sym,
                        "hostScan": int(match.group(2)),
                        "modifiers": int(match.group(3), 16),
                        "name": match.group(4),
                        "stScancode": sym_to_st[sym] | 0x80,
                    }
                )
    return offset


def record(
    seconds: float,
    headless: bool,
    memstate: Path | None = None,
    snapshot_out: Path | None = None,
) -> int:
    authority, config = load_configuration()
    root = resolve_roms_root(None)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    run_id = _run_id("stick-record")
    run_directory = WORK_ROOT / run_id
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()
    # No title breakpoint chain: you press Space yourself, and leading idle is
    # trimmed at replay. An empty parse script keeps Hatari out of the debugger
    # so the real window comes up immediately.
    parse_script = run_directory / "play.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    key_trace = run_directory / "keymap.trace"

    extra_args = [
        "--trace",
        "keymap",
        "--trace-file",
        str(key_trace.resolve()),
        "--msg-repeat",
    ]
    if memstate is not None:
        if not memstate.is_file():
            raise LabError(f"Snapshot not found: {memstate}")
        extra_args += ["--memstate", str(memstate.resolve())]

    command = build_hatari_command(
        hatari_binary=hatari_binary,
        tos=tos_path,
        disk_a=program_path,
        machine_model=config["machineModel"],
        memsize_mib=config["memsizeMiB"],
        parse_script=parse_script,
        fast_forward=False,
        statusbar=True,
        cmd_fifo=fifo,
        joy_keys_port=1,
        extra_args=extra_args,
    )
    env = os.environ.copy()
    if headless:
        env.update(headless_env())
    else:
        env.pop("SDL_VIDEODRIVER", None)
        env.pop("SDL_AUDIODRIVER", None)

    joy_bin = run_directory / "sample-joy.bin"
    samples: list[dict] = []
    keyboard_events: list[dict] = []
    trace_offset = 0
    pending_key_down: dict[int, dict] = {}
    sym_to_st: dict[int, int] = {}
    start = time.monotonic()
    result: dict = {
        "runId": run_id,
        "mode": "record",
        "toolchain": toolchain.as_dict(),
        "softcopy": f"${JOYSTICK1_SOFTCOPY:04X}",
        "vblRate": VBL_RATE,
        "memstate": str(memstate) if memstate is not None else None,
    }
    print("Launching interactive Damocles (window, joy1 keys, fast-forward off).", file=sys.stderr)
    if memstate is not None:
        print(f"Booting from snapshot {memstate} — you should already be on foot.", file=sys.stderr)
    process = _launch(command, run_directory / "hatari-observe.log", env)
    try:
        for _ in range(200):
            if fifo.exists() or process.poll() is not None:
                break
            time.sleep(0.05)
        if not fifo.exists():
            raise LabError("Hatari did not create the command FIFO")

        if memstate is not None:
            print("READY. You are on foot at the spaceport — steer with the arrow", file=sys.stderr)
            print("keys (Right Ctrl = fire, R = run) into a building.", file=sys.stderr)
        else:
            print("READY. In the Hatari window: wait for the title, press Space, then", file=sys.stderr)
            print("steer with the arrow keys (Right Ctrl = fire) into a building.", file=sys.stderr)
        print("Watch the live readout below — it should match your key presses.", file=sys.stderr)
        print("Press Ctrl-C here when you have the shot you want.\n", file=sys.stderr)
        if headless:
            # Plumbing smoke test: auto-press Space so the world loads unattended.
            with fifo.open("w", encoding="utf-8") as fh:
                _fifo_send(fh, ["hatari-event keypress 57"])

        start = time.monotonic()
        last_byte: int | None = None
        with fifo.open("w", encoding="utf-8") as fh:
            while time.monotonic() - start < seconds:
                if process.poll() is not None:
                    break
                _fifo_send(
                    fh,
                    [
                        "hatari-stop",
                        f"hatari-debug savebin {joy_bin.resolve()} ${JOYSTICK1_SOFTCOPY:x} 1",
                        "hatari-cont",
                    ],
                )
                time.sleep(0.02)
                byte = _read_uint(joy_bin)
                now = round(time.monotonic() - start, 3)
                old_event_count = len(keyboard_events)
                trace_offset = _drain_key_trace(
                    key_trace,
                    offset=trace_offset,
                    now=now,
                    pending_down=pending_key_down,
                    sym_to_st=sym_to_st,
                    events=keyboard_events,
                )
                if not headless:
                    for event in keyboard_events[old_event_count:]:
                        print(
                            f"[{event['t']:6.1f}s] key {event['type']:<7} "
                            f"{event.get('name') or '?'} (ST ${event['stScancode']:02X})",
                            file=sys.stderr,
                        )
                if byte is not None:
                    samples.append({"t": now, "byte": byte})
                    if byte != last_byte and not headless:
                        label = "+".join(_dirs(byte)) or "idle"
                        print(f"[{now:6.1f}s] {label:<20} (${byte:02X})", file=sys.stderr)
                        last_byte = byte
                time.sleep(0.05)
    except KeyboardInterrupt:
        print("\nstopping recording…", file=sys.stderr)
    finally:
        snapshot_saved = False
        if process.poll() is None:
            try:
                with fifo.open("w", encoding="utf-8") as fh:
                    if snapshot_out is not None:
                        # Save the exact end state (e.g. at the window) so it can
                        # be booted directly for observation — no walk replay.
                        snapshot_out.parent.mkdir(parents=True, exist_ok=True)
                        _fifo_send(
                            fh,
                            [
                                "hatari-stop",
                                f"hatari-debug statesave {snapshot_out.resolve()}",
                                "hatari-cont",
                            ],
                        )
                        deadline = time.time() + 15
                        while time.time() < deadline:
                            if snapshot_out.is_file() and snapshot_out.stat().st_size > 0:
                                snapshot_saved = True
                                break
                            time.sleep(0.1)
                    _fifo_send(fh, ["hatari-debug quit"])
            except OSError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        trace_offset = _drain_key_trace(
            key_trace,
            offset=trace_offset,
            now=round(time.monotonic() - start, 3),
            pending_down=pending_key_down,
            sym_to_st=sym_to_st,
            events=keyboard_events,
        )
        if fifo.exists():
            try:
                fifo.unlink()
            except OSError:
                pass

    # Merge consecutive equal-byte samples into segments. Duration is the host
    # wall-clock span to the next segment; VBLs = seconds * PAL rate.
    segments: list[dict] = []
    if samples:
        seg_start = samples[0]
        for prev, nxt in zip(samples, samples[1:] + [None]):
            if nxt is None or nxt["byte"] != seg_start["byte"]:
                end_t = nxt["t"] if nxt is not None else prev["t"]
                seconds = max(0.0, round(end_t - seg_start["t"], 3))
                segments.append(
                    {
                        "rawByte": seg_start["byte"],
                        "dirs": _dirs(seg_start["byte"]),
                        "seconds": seconds,
                        "vbls": int(round(seconds * VBL_RATE)),
                    }
                )
                if nxt is not None:
                    seg_start = nxt
    result["sampleCount"] = len(samples)
    result["segments"] = segments
    # Human-facing compact step list (non-idle only)
    result["steps"] = [
        {"dirs": s["dirs"], "seconds": s["seconds"], "vbls": s["vbls"]}
        for s in segments
        if s["rawByte"] != 0 and s["vbls"] > 0
    ]
    result["samples"] = samples
    result["keyboardEvents"] = keyboard_events
    result["keyTrace"] = str(key_trace)
    if snapshot_out is not None:
        result["snapshotOut"] = str(snapshot_out)
        result["snapshotSaved"] = snapshot_saved
    result["createdAt"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    out = run_directory / "stick-sequence.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    summary = {k: result[k] for k in ("runId", "sampleCount", "steps")}
    print(json.dumps(summary, indent=2))
    print(f"wrote {out}", file=sys.stderr)
    if snapshot_out is not None:
        if snapshot_saved:
            print(f"saved end-state snapshot -> {snapshot_out}", file=sys.stderr)
        else:
            print("WARNING: end-state snapshot was not written", file=sys.stderr)
    return 0 if samples else 2


def snapshot(out_path: Path, space_wait: float) -> int:
    """Create an on-foot Damocles save-state at the Eris spaceport.

    Boots headless under fast-forward, presses Space, and waits while the
    automatic intro flies in and disembarks the player, then `statesave`s the
    emulation snapshot. Both `record --memstate` and `replay` can then boot
    straight into it, skipping the ~3-minute intro.
    """
    authority, config = load_configuration()
    root = resolve_roms_root(None)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    run_id = _run_id("snapshot")
    run_directory = WORK_ROOT / run_id
    run_directory.mkdir(parents=True, exist_ok=True)
    out_path = out_path.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
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
        fast_forward=True,
        statusbar=True,
        cmd_fifo=fifo,
    )
    env = os.environ.copy()
    env.update(headless_env())

    dump_parent = run_directory.resolve()
    process = _launch(command, run_directory / "hatari-observe.log", env)
    try:
        for _ in range(200):
            if fifo.exists() or process.poll() is not None:
                break
            time.sleep(0.05)
        if not fifo.exists():
            raise LabError("Hatari did not create the command FIFO")
        with fifo.open("w", encoding="utf-8") as fh:
            _fifo_send(fh, ["hatari-event keypress 57"])
            time.sleep(space_wait)
            _fifo_send(
                fh,
                [
                    "hatari-stop",
                    f"hatari-debug screenshot {dump_parent}/onfoot.png",
                    f"hatari-debug statesave {out_path}",
                    "hatari-cont",
                ],
            )
            deadline = time.time() + 30
            while time.time() < deadline:
                if out_path.is_file() and out_path.stat().st_size > 0:
                    break
                time.sleep(0.1)
            _fifo_send(fh, ["hatari-debug quit"])
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

    ok = out_path.is_file() and out_path.stat().st_size > 0
    print(
        json.dumps(
            {
                "runId": run_id,
                "snapshot": str(out_path),
                "bytes": out_path.stat().st_size if ok else 0,
                "onfootPng": str(run_directory / "onfoot.png"),
            },
            indent=2,
        )
    )
    if ok:
        print(f"Verify the pose: {run_directory / 'onfoot.png'}", file=sys.stderr)
    return 0 if ok else 2


def _impossible(byte: int) -> bool:
    # The real stick can't set up+down or left+right at once, and never sets the
    # undefined bits 0x10/0x20/0x40. Such values are Damocles loader noise
    # written to $79C2 before the player has control.
    return (byte & 0x03) == 0x03 or (byte & 0x0C) == 0x0C or (byte & 0x70) != 0


def build_timeline(
    segments: list[dict], keyboard_events: list[dict], scale: float = 1.0
) -> tuple[list[dict], float] | None:
    """Interleave stick and keyboard actions onto one host-relative timeline.

    Damocles opens with a ~3-minute automatic intro (the ship arriving and
    landing) during which the game itself writes flight values to $79C2; on-foot
    control only begins afterwards. So we anchor t=0 at the player's first Space
    press (which starts the game / skips the briefing) and replay:

    - every keyboard event from the anchor on (the Space taps that advance the
      intro, plus in-world keys like R for run), and
    - stick pokes *only* for the on-foot segments (after the last loader/flight
      "impossible" $79C2 byte), so we never fight the intro's own writes.

    The long gap between the last Space and the first walk is preserved as dead
    time, letting the intro play out to the spaceport before we steer. Returns
    the sorted action list and the end time (seconds), scaled by ``scale``.
    """
    starts: list[float] = []
    cursor = 0.0
    for seg in segments:
        starts.append(cursor)
        cursor += seg["seconds"]

    def _active(seg: dict) -> bool:
        return seg["seconds"] > 0 and seg["rawByte"] != 0 and not _impossible(seg["rawByte"])

    last_bad = max(
        (i for i, s in enumerate(segments) if s["seconds"] > 0 and _impossible(s["rawByte"])),
        default=-1,
    )
    first = next((i for i in range(last_bad + 1, len(segments)) if _active(segments[i])), None)
    if first is None:
        return None
    last = max(i for i in range(last_bad + 1, len(segments)) if _active(segments[i]))

    # Choose the timeline anchor (t=0):
    #  - Intro flow: the first Space press that precedes the walk, so the ~3-min
    #    intro is reproduced (pre-game junk like an idle Shift is excluded).
    #  - Snapshot flow: no such Space, so anchor at the first walk but pull the
    #    anchor back to include in-world keys (e.g. R for run) pressed in the few
    #    seconds just before the first move.
    real_start = starts[first]
    pre_spaces = [
        e["t"]
        for e in keyboard_events
        if e["type"] == "keydown" and e.get("name") == "Space" and e["t"] <= real_start + 0.5
    ]
    if pre_spaces:
        anchor = min(pre_spaces)
    else:
        pre_keys = [
            e["t"]
            for e in keyboard_events
            if real_start - 10.0 <= e["t"] <= real_start + 0.5
        ]
        anchor = min([real_start, *pre_keys])

    actions: list[dict] = []
    for i in range(first, last + 1):
        seg = segments[i]
        byte = 0 if _impossible(seg["rawByte"]) else seg["rawByte"]
        actions.append({"t": (starts[i] - anchor) * scale, "kind": "stick", "byte": byte})
    for event in keyboard_events:
        if event["t"] < anchor - 0.01:
            continue
        actions.append(
            {
                "t": (event["t"] - anchor) * scale,
                "kind": event["type"],
                "scan": event["stScancode"] & 0x7F,
                "name": event.get("name", ""),
            }
        )
    actions.sort(key=lambda a: (a["t"], 0 if a["kind"] == "stick" else 1))
    end_t = (starts[last] + segments[last]["seconds"] - anchor) * scale
    return actions, end_t


def replay(
    sequence_path: Path,
    scale: float = 1.0,
    world_load_wait: float = 2.0,
    memstate: Path | None = None,
) -> int:
    data = json.loads(sequence_path.read_text(encoding="utf-8"))
    segments = data.get("segments") or []
    if not segments:
        raise LabError("Sequence has no segments to replay")
    built = build_timeline(segments, data.get("keyboardEvents") or [], scale)
    if built is None:
        raise LabError("Sequence has no active (non-idle) movement to replay")
    actions, end_t = built

    # A snapshot given explicitly wins; otherwise reuse the one the sequence was
    # recorded from. Booting on-foot skips the title/intro entirely.
    if memstate is None and data.get("memstate"):
        memstate = Path(data["memstate"])
    if memstate is not None and not memstate.is_file():
        raise LabError(f"Snapshot not found: {memstate}")

    authority, config = load_configuration()
    root = resolve_roms_root(None)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)

    run_id = _run_id("stick-replay")
    run_directory = WORK_ROOT / run_id
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    if fifo.exists():
        fifo.unlink()

    # Realtime (fast-forward off) so host-second hold durations map to the same
    # ~50 VBL/s the sequence was recorded at; keyboard events replay via
    # hatari-event, stick via debugger pokes to $79C2.
    if memstate is not None:
        # Boot straight into the on-foot snapshot: no title breakpoint, just
        # continue after the state loads.
        parse_script = run_directory / "play.txt"
        parse_script.write_text("c\n", encoding="utf-8")
        ready_log = None
        extra_args = ["--memstate", str(memstate.resolve())]
    else:
        parse_script, ready_log = _boot_scripts(run_directory, config)
        extra_args = None

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
        extra_args=extra_args,
    )
    env = os.environ.copy()
    env.update(headless_env())

    joy = JOYSTICK1_SOFTCOPY
    dump_parent = run_directory.resolve()
    result: dict = {
        "runId": run_id,
        "mode": "replay",
        "source": str(sequence_path),
        "scale": scale,
        "actionCount": len(actions),
        "keyEvents": [a for a in actions if a["kind"] != "stick"],
        "memstate": str(memstate) if memstate is not None else None,
    }
    process = _launch(command, run_directory / "hatari-observe.log", env)
    try:
        if ready_log is not None:
            if not _wait_for(ready_log, process, int(config.get("hostTimeoutSeconds", 240))):
                raise LabError("Hatari did not reach the title screen")
        for _ in range(50):
            if fifo.exists():
                break
            time.sleep(0.05)
        if not fifo.exists():
            raise LabError("Hatari did not create the command FIFO")

        # Keep the FIFO writer open for the whole run: if we close it, Hatari
        # busy-loops on read() and floods the log with EAGAIN errors. The
        # timeline itself begins with the recorded Space press(es) that start
        # the game, so we do not inject Space separately.
        with fifo.open("w", encoding="utf-8") as fh:
            # Give the title (or snapshot) a moment to settle before the timeline.
            time.sleep(max(world_load_wait, 4.0) if memstate is not None else world_load_wait)
            t0 = time.monotonic()
            for action in actions:
                delay = action["t"] - (time.monotonic() - t0)
                if delay > 0:
                    time.sleep(delay)
                if action["kind"] == "stick":
                    _fifo_send(
                        fh,
                        [
                            "hatari-stop",
                            "hatari-debug setopt hex",
                            f"hatari-debug w ${joy:x} {action['byte']:02x}",
                            "hatari-cont",
                        ],
                    )
                elif action["kind"] == "keydown":
                    _fifo_send(fh, [f"hatari-event keydown {action['scan']}"])
                elif action["kind"] == "keyup":
                    _fifo_send(fh, [f"hatari-event keyup {action['scan']}"])
            # Let the final move settle, release the stick, then capture + quit.
            tail = end_t - (time.monotonic() - t0)
            time.sleep(max(0.5, tail))
            _fifo_send(
                fh,
                [
                    "hatari-stop",
                    "hatari-debug setopt hex",
                    f"hatari-debug w ${joy:x} 00",
                    f"hatari-debug logfile {dump_parent}/observed.registers.log",
                    "hatari-debug r",
                    f"hatari-debug savebin {dump_parent}/observed.ram 0 $100000",
                    f"hatari-debug screenshot {dump_parent}/observed.png",
                    "hatari-debug quit",
                ],
            )
            _wait_for(run_directory / "observed.png", process, 30)
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

    png = run_directory / "observed.png"
    result["capturedPng"] = png.is_file()
    result["observedPng"] = str(png)
    result["createdAt"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    (run_directory / "stick-replay.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, indent=2))
    return 0 if png.is_file() else 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)
    snap = sub.add_parser("snapshot", help="create an on-foot spaceport save-state")
    snap.add_argument(
        "--out",
        type=Path,
        default=LAB_ROOT / "snapshots" / "eris-spaceport-onfoot.sav",
        help="where to write the .sav snapshot",
    )
    snap.add_argument(
        "--space-wait",
        type=float,
        default=60.0,
        help="seconds (fast-forwarded) to let the intro land and disembark",
    )
    rec = sub.add_parser("record", help="record a live stick sequence")
    rec.add_argument("--seconds", type=float, default=300.0)
    rec.add_argument("--headless", action="store_true", help="dummy video (plumbing smoke test only)")
    rec.add_argument(
        "--memstate",
        type=Path,
        default=None,
        help="boot from an on-foot snapshot so you record only the walk",
    )
    rec.add_argument(
        "--snapshot-out",
        type=Path,
        default=None,
        help="on Ctrl-C, save a save-state of the end pose (e.g. at the window)",
    )
    rep = sub.add_parser("replay", help="replay a recorded sequence headlessly")
    rep.add_argument("--sequence", required=True, type=Path)
    rep.add_argument(
        "--memstate",
        type=Path,
        default=None,
        help="boot from a snapshot (default: the one the sequence was recorded with)",
    )
    rep.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="multiply the whole timeline's tempo (calibrate overshoot; e.g. 0.95)",
    )
    rep.add_argument(
        "--world-load-wait",
        type=float,
        default=2.0,
        help="settle delay after the title is ready before the timeline starts",
    )
    args = parser.parse_args(argv)
    if args.mode == "snapshot":
        return snapshot(args.out, args.space_wait)
    if args.mode == "record":
        return record(args.seconds, args.headless, args.memstate, args.snapshot_out)
    return replay(args.sequence, args.scale, args.world_load_wait, args.memstate)


if __name__ == "__main__":
    raise SystemExit(main())
