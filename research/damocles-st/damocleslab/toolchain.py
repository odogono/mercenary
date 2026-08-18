from __future__ import annotations

import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .core import LabError, file_hash


@dataclass(frozen=True)
class ToolchainInfo:
    hatariVersion: str
    hatariVersionSource: str
    hatariBinarySha256: str
    pythonVersion: str

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


def parse_hatari_version(output: str) -> tuple[int, int, int]:
    match = re.search(r"Hatari\s+v?(\d+)\.(\d+)(?:\.(\d+))?", output, re.IGNORECASE)
    if match is None:
        raise LabError(f"Could not parse Hatari version from output: {output.strip()!r}")
    return tuple(int(part or 0) for part in match.groups())  # type: ignore[return-value]


def version_at_least(actual: tuple[int, int, int], minimum: str) -> bool:
    parts = [int(part) for part in minimum.split(".")]
    while len(parts) < 3:
        parts.append(0)
    return actual >= tuple(parts[:3])


def format_version(version: tuple[int, int, int]) -> str:
    if version[2]:
        return ".".join(str(part) for part in version)
    return f"{version[0]}.{version[1]}"


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=False, capture_output=True, text=True, timeout=20)


def resolve_hatari_binary(name: str) -> Path:
    location = shutil.which(name)
    if location is None:
        raise LabError(f"Hatari executable {name!r} was not found; run brew bundle with the laboratory Brewfile")
    binary = Path(location).resolve()
    # Homebrew wraps the macOS app binary in a shell script; prefer the real Mach-O.
    if binary.name == "hatari" and binary.parent.name == "bin":
        app_binary = binary.parent.parent / "Hatari.app" / "Contents" / "MacOS" / "hatari"
        # Cellar layout: .../Cellar/hatari/VERSION/bin/hatari -> ../Hatari.app/...
        cellar_candidate = binary.parent.parent / "Hatari.app" / "Contents" / "MacOS" / "hatari"
        for candidate in (app_binary, cellar_candidate):
            if candidate.is_file():
                return candidate.resolve()
        # Follow script contents when present.
        try:
            text = binary.read_text(encoding="utf-8")
        except OSError:
            text = ""
        match = re.search(r'"([^"]+/Hatari\.app/Contents/MacOS/hatari)"', text)
        if match:
            candidate = Path(match.group(1))
            if candidate.is_file():
                return candidate.resolve()
    return binary


def discover_toolchain(config: dict[str, Any]) -> tuple[Path, ToolchainInfo]:
    hatari_binary = resolve_hatari_binary(config.get("hatariBinary", "hatari"))
    version_result = _run([str(hatari_binary), "--version"])
    version_output = version_result.stdout + version_result.stderr
    version_source = "hatari --version"
    try:
        version = parse_hatari_version(version_output)
    except LabError:
        help_result = _run([str(hatari_binary), "-h"])
        version_output = help_result.stdout + help_result.stderr
        version = parse_hatari_version(version_output)
        version_source = "hatari -h"

    minimum = config["minimumHatariVersion"]
    if not version_at_least(version, minimum):
        raise LabError(f"Hatari {format_version(version)} is below the required version {minimum}")

    minimum_python = tuple(int(part) for part in config["minimumPythonVersion"].split("."))
    if sys.version_info[: len(minimum_python)] < minimum_python:
        raise LabError(
            f"Python {sys.version_info.major}.{sys.version_info.minor} is below the required "
            f"version {config['minimumPythonVersion']}"
        )

    info = ToolchainInfo(
        hatariVersion=format_version(version),
        hatariVersionSource=version_source,
        hatariBinarySha256=file_hash(hatari_binary),
        pythonVersion=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    )
    return hatari_binary, info
