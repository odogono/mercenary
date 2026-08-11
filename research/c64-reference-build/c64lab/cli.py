from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .core import LabError
from .laboratory import capture, doctor, observe, reproduce, verify


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="C64 Reference Build research laboratory")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor_parser = subparsers.add_parser("doctor", help="validate the Reference Build and toolchain")
    doctor_parser.add_argument("--prg", required=True, type=Path)

    capture_parser = subparsers.add_parser("capture", help="capture a canonical checkpoint")
    capture_parser.add_argument("--prg", required=True, type=Path)
    capture_parser.add_argument("--checkpoint", required=True, choices=("post-unpack", "interactive"))

    observe_parser = subparsers.add_parser("observe", help="validate and run an observation scenario")
    observe_parser.add_argument("--prg", required=True, type=Path)
    observe_parser.add_argument("--scenario", required=True, type=Path)

    verify_parser = subparsers.add_parser("verify", help="verify a run manifest and its artifacts")
    verify_parser.add_argument("--run", required=True, type=Path)

    reproduce_parser = subparsers.add_parser("reproduce", help="compare two clean post-unpack captures")
    reproduce_parser.add_argument("--prg", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        if arguments.command == "doctor":
            result = doctor(arguments.prg)
            result.pop("viceFeatures", None)
        elif arguments.command == "capture":
            run_directory, manifest = capture(arguments.prg, arguments.checkpoint)
            result = {"status": "captured", "run": str(run_directory), "manifest": manifest}
        elif arguments.command == "observe":
            run_directory, manifest = observe(arguments.prg, arguments.scenario)
            result = {"status": "observed", "run": str(run_directory), "scenario": manifest["scenario"]["name"], "manifest": manifest}
        elif arguments.command == "verify":
            manifest = verify(arguments.run)
            result = {"status": "verified", "run": str(arguments.run), "runId": manifest["runId"]}
        else:
            result = reproduce(arguments.prg)
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0
