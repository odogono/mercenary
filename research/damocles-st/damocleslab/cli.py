from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .core import LabError
from .laboratory import capture, doctor, observe, reproduce, verify


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Damocles ST Working Authority research laboratory")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor_parser = subparsers.add_parser("doctor", help="validate the Working Authority images and toolchain")
    doctor_parser.add_argument("--roms", type=Path, help="roms root (default: <repo>/roms)")

    capture_parser = subparsers.add_parser("capture", help="capture a canonical checkpoint")
    capture_parser.add_argument("--roms", type=Path)
    capture_parser.add_argument("--checkpoint", default="title-screen", choices=("title-screen",))

    observe_parser = subparsers.add_parser("observe", help="validate and run an observation scenario")
    observe_parser.add_argument("--roms", type=Path)
    observe_parser.add_argument("--scenario", required=True, type=Path)

    verify_parser = subparsers.add_parser("verify", help="verify a run manifest and its artifacts")
    verify_parser.add_argument("--run", required=True, type=Path)

    reproduce_parser = subparsers.add_parser("reproduce", help="compare two clean title-screen captures")
    reproduce_parser.add_argument("--roms", type=Path)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "doctor":
            result = doctor(roms_root=args.roms)
        elif args.command == "capture":
            run_directory, manifest = capture(checkpoint=args.checkpoint, roms_root=args.roms)
            result = {"run": str(run_directory), "manifest": manifest}
        elif args.command == "observe":
            run_directory, manifest = observe(args.scenario, roms_root=args.roms)
            result = {"run": str(run_directory), "manifest": manifest}
        elif args.command == "verify":
            result = verify(args.run)
        elif args.command == "reproduce":
            result = reproduce(roms_root=args.roms)
        else:
            parser.error(f"Unknown command {args.command}")
            return 2
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
