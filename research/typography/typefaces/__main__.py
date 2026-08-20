from __future__ import annotations

import argparse
import json
from pathlib import Path

from .core import TypographyError
from .exporter import export_typefaces


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export verified Mercenary and Damocles web typefaces"
    )
    parser.add_argument("--mercenary-run", required=True, type=Path)
    parser.add_argument("--damocles-run-a", required=True, type=Path)
    parser.add_argument("--damocles-run-b", required=True, type=Path)
    parser.add_argument("--payload", required=True, type=Path)
    arguments = parser.parse_args()
    try:
        result = export_typefaces(
            arguments.mercenary_run,
            arguments.damocles_run_a,
            arguments.damocles_run_b,
            arguments.payload,
        )
    except TypographyError as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
