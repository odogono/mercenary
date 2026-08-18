from __future__ import annotations

from pathlib import Path

from .core import LabError


def render_title_capture_script(*, next_script: Path, pc: int) -> str:
    if not 0 <= pc <= 0xFFFFFF:
        raise LabError(f"Checkpoint PC is outside 24-bit address space: {pc:#x}")
    nxt = str(next_script.resolve())
    if '"' in nxt or "\n" in nxt or "\r" in nxt:
        raise LabError("Next script path contains a quote or newline")
    return f"b pc = ${pc:x} :once :quiet :file {nxt}\nc\n"


def render_vbl_wait_script(*, dump_script: Path, extra_vbls: int) -> str:
    if extra_vbls <= 0:
        raise LabError("extraVbls must be positive")
    dump = str(dump_script.resolve())
    if '"' in dump or "\n" in dump or "\r" in dump:
        raise LabError("Dump script path contains a quote or newline")
    return f'b VBL = "VBL+{extra_vbls}" :once :quiet :file {dump}\nc\n'


def render_dump_script(*, run_directory: Path, prefix: str) -> str:
    if any(ch in prefix for ch in "/\\\n\r"):
        raise LabError("Capture prefix is invalid")
    run = str(run_directory.resolve())
    return (
        f"logfile {run}/{prefix}.registers.log\n"
        "r\n"
        f"savebin {run}/{prefix}.ram 0 $100000\n"
        f"screenshot {run}/{prefix}.png\n"
        "quit\n"
    )


def build_hatari_command(
    *,
    hatari_binary: Path,
    tos: Path,
    disk_a: Path,
    machine_model: str,
    memsize_mib: int,
    parse_script: Path,
    fast_forward: bool,
    statusbar: bool,
    cmd_fifo: Path | None = None,
    joy_keys_port: int | None = None,
    extra_args: list[str] | None = None,
) -> list[str]:
    if memsize_mib <= 0:
        raise LabError("Hatari memsize must be positive")
    if joy_keys_port is not None and joy_keys_port not in (0, 1):
        raise LabError("Keyboard-mapped joystick port must be 0 or 1")
    command = [
        str(hatari_binary),
        "--tos",
        str(tos.resolve()),
        "--machine",
        machine_model,
        "--memsize",
        str(memsize_mib),
        "--disk-a",
        str(disk_a.resolve()),
        "--sound",
        "off",
        "--statusbar",
        "true" if statusbar else "false",
        "--drive-led",
        "false",
        "--parse",
        str(parse_script.resolve()),
        "--log-level",
        "fatal",
        "--screenshot-format",
        "png",
        "--crop",
        "true",
    ]
    if joy_keys_port is not None:
        command.extend([f"--joy{joy_keys_port}", "keys"])
    if fast_forward:
        command.extend(["--fast-forward", "true"])
    if cmd_fifo is not None:
        command.extend(["--cmd-fifo", str(cmd_fifo.resolve())])
    if extra_args:
        command.extend(extra_args)
    return command


def headless_env() -> dict[str, str]:
    return {
        "SDL_VIDEODRIVER": "dummy",
        "SDL_AUDIODRIVER": "dummy",
    }
