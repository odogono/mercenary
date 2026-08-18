#!/usr/bin/env python3
"""Interactive Hatari play session for Damocles doorway recon (#79).

Launches the pinned Working Authority STX with:
  - real window (no SDL dummy drivers)
  - --joy1 keys (cursor arrows + Right Ctrl fire)
  - fast-forward off (so doorway timing is human-scale)
  - no cmd-fifo / no auto-quit

Controls (Hatari joy1 keys):
  Up / Down / Left / Right  — stick
  Right Ctrl                — fire

Game start: wait for title, press Space, wait for the outdoor ERIS view
(NAV often shows 07-08 at Capital City Spaceport). Walk into a building
entrance (dark opening), then look for a window with exterior beyond.

When inside with an outward window visible, note roughly:
  - heading (compass) and NAV digits
  - whether you turned L/R before walking in
  - anything on the message bar

Then tell the lab agent; we will pin a reproduce scenario from your path.

Run from repo root:
  python3 research/damocles-st/scripts/play-interactive.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.toolchain import discover_toolchain  # noqa: E402


def main() -> int:
    authority, config = load_configuration()
    root = resolve_roms_root(None)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, _ = discover_toolchain(config)

    # Empty parse script: Hatari requires --parse in our usual contract, but
    # interactive play should not auto-breakpoint or quit.
    work = LAB_ROOT / "work"
    work.mkdir(parents=True, exist_ok=True)
    parse_script = work / "play-interactive-empty.txt"
    parse_script.write_text("c\n", encoding="utf-8")

    command = [
        str(hatari_binary),
        "--tos",
        str(tos_path.resolve()),
        "--machine",
        str(config["machineModel"]),
        "--memsize",
        str(config["memsizeMiB"]),
        "--disk-a",
        str(program_path.resolve()),
        "--sound",
        "off",
        "--statusbar",
        "false",
        "--drive-led",
        "false",
        "--joy1",
        "keys",
        "--fast-forward",
        "false",
        "--parse",
        str(parse_script.resolve()),
        "--screenshot-format",
        "png",
        "--crop",
        "true",
    ]

    env = os.environ.copy()
    # Ensure we are not inheriting headless dummy drivers from a prior lab shell.
    env.pop("SDL_VIDEODRIVER", None)
    env.pop("SDL_AUDIODRIVER", None)

    print("Launching interactive Damocles (joy1 keys, fast-forward off).", file=sys.stderr)
    print("Title → Space → outdoor ERIS → walk into a doorway → look out a window.", file=sys.stderr)
    print(" ", " ".join(command), file=sys.stderr)
    return subprocess.call(command, env=env)


if __name__ == "__main__":
    raise SystemExit(main())
