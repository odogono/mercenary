from __future__ import annotations

import re
from pathlib import Path

from .core import LabError


def render_capture_script(prefix: str) -> str:
    if re.fullmatch(r"[a-z0-9-]+", prefix) is None:
        raise LabError("Capture prefix must contain only lowercase letters, numbers, and hyphens")
    return (
        "bank ram\n"
        f'bsave "{prefix}.ram" 0 $0000 $ffff\n'
        "bank cpu\n"
        f'bsave "{prefix}.cpu" 0 $0000 $ffff\n'
        "registers\n"
        f'screenshot "{prefix}.png" 2\n'
        "; Keep loadbasic's transient media outside retained snapshots.\n"
        "detach 1\n"
        f'dump "{prefix}.vsf"\n'
        "quit\n"
    )


def render_checkpoint_script(address: int, prg: Path, *, condition: str | None = None) -> str:
    if not 0 <= address <= 0xFFFF:
        raise LabError(f"Checkpoint address is outside C64 memory: {address}")
    prg_path = str(prg.resolve())
    if '"' in prg_path or "\n" in prg_path or "\r" in prg_path:
        raise LabError("Reference Build path contains a quote or newline and cannot be used in a monitor command")
    if condition is not None and ("\n" in condition or "\r" in condition or ";" in condition):
        raise LabError("Checkpoint condition contains a command separator")
    break_command = f"break exec ${address:04x}"
    if condition:
        break_command += f" if {condition}"
    return (
        "; Load the exact PRG after a clean KERNAL/BASIC boot.\n"
        f'loadbasic "{prg_path}" 0\n'
        f"{break_command}\n"
        'command 1 "playback \\"capture.mon\\""\n'
        "g $0820\n"
    )


def render_event_history_prepare_script(hotkey_file: Path) -> str:
    hotkey_path = str(hotkey_file.resolve())
    if '"' in hotkey_path or "\n" in hotkey_path or "\r" in hotkey_path:
        raise LabError("Event-history hotkey path contains a quote or newline")
    return (
        f'resset "HotkeyFile" "{hotkey_path}"\n'
        'resset "EventStartMode" "0"\n'
        'resset "EventImageInclude" "0"\n'
        "x\n"
    )


def build_capture_command(
    *,
    vice_binary: Path,
    prg: Path,
    run_directory: Path,
    monitor_script: Path,
    machine_model: str,
    seed: int,
    cycle_limit: int,
) -> list[str]:
    if cycle_limit <= 0:
        raise LabError("VICE cycle limit must be positive")
    return [
        str(vice_binary),
        "-default",
        "-model",
        machine_model,
        "-seed",
        str(seed),
        "+sound",
        "-warp",
        "-limitcycles",
        str(cycle_limit),
        "-initbreak",
        "ready",
        "-chdir",
        str(run_directory.resolve()),
        "-dumpconfig",
        str((run_directory / "effective.vicerc").resolve()),
        "-moncommands",
        str(monitor_script.resolve()),
        "-monlog",
        "-monlogname",
        "monitor.log",
    ]


def build_event_history_replay_command(
    *,
    vice_binary: Path,
    run_directory: Path,
    monitor_address: str,
    start_snapshot: Path,
    end_snapshot: Path,
    prepare_script: Path,
    machine_model: str,
    seed: int,
) -> list[str]:
    start = start_snapshot.resolve()
    end = end_snapshot.resolve()
    if start.parent != end.parent:
        raise LabError("Event-history snapshots must share the same restricted directory")
    if start == end:
        raise LabError("Event-history replay needs distinct start and end snapshots")
    if re.fullmatch(r"ip4://127\.0\.0\.1:[1-9][0-9]{0,4}", monitor_address) is None:
        raise LabError("Event-history replay monitor must use an explicit IPv4 loopback port")
    port = int(monitor_address.rsplit(":", 1)[1])
    if port > 65535:
        raise LabError("Event-history replay monitor port is invalid")
    if not isinstance(seed, int) or seed < 0:
        raise LabError("Event-history replay seed must be a non-negative integer")
    run = run_directory.resolve()
    return [
        str(vice_binary),
        "-default",
        "-model",
        machine_model,
        "-seed",
        str(seed),
        "-sounddev",
        "dummy",
        "-sound",
        "-speed",
        "100",
        "-binarymonitor",
        "-binarymonitoraddress",
        monitor_address,
        "-eventsnapshotdir",
        str(start.parent),
        "-eventstartsnapshot",
        start.name,
        "-eventendsnapshot",
        end.name,
        "-dumpconfig",
        str(run / "effective.vicerc"),
        "-logfile",
        str(run / "vice.log"),
        "-initbreak",
        "ready",
        "-moncommands",
        str(prepare_script.resolve()),
    ]


_REGISTER_LINE = re.compile(
    r"^\.?(?:;)(?P<pc>[0-9a-f]{4})\s+"
    r"(?P<a>[0-9a-f]{2})\s+(?P<x>[0-9a-f]{2})\s+(?P<y>[0-9a-f]{2})\s+"
    r"(?P<sp>[0-9a-f]{2})\s+(?P<port00>[0-9a-f]{2})\s+(?P<port01>[0-9a-f]{2})\s+"
    r"(?P<flags>[01]{8})\s+(?P<line>\d+)\s+(?P<cycle>\d+)\s+(?P<stopwatch>\d+)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def parse_register_log(log: str) -> dict[str, int | str]:
    match = _REGISTER_LINE.search(log)
    if match is None:
        raise LabError("Monitor log does not contain a parseable register capture")
    values = match.groupdict()
    return {
        "PC": int(values["pc"], 16),
        "A": int(values["a"], 16),
        "X": int(values["x"], 16),
        "Y": int(values["y"], 16),
        "SP": int(values["sp"], 16),
        "port00": int(values["port00"], 16),
        "port01": int(values["port01"], 16),
        "flags": values["flags"],
        "rasterLine": int(values["line"]),
        "rasterCycle": int(values["cycle"]),
        "stopwatch": int(values["stopwatch"]),
    }
