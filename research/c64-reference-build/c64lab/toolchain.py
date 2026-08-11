from __future__ import annotations

import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .core import LabError, file_hash, parse_vice_version


@dataclass(frozen=True)
class ToolchainInfo:
    viceVersion: str
    viceVersionSource: str
    viceBinarySha256: str
    viceFeaturesSha256: str
    pythonVersion: str

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


def parse_homebrew_vice_version(output: str) -> tuple[int, int, int]:
    match = re.search(r"\bvice\s+(\d+)\.(\d+)(?:\.(\d+))?(?:_\d+)?\b", output, re.IGNORECASE)
    if match is None:
        raise LabError(f"Could not parse Homebrew VICE version from output: {output.strip()!r}")
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


def discover_toolchain(config: dict[str, Any]) -> tuple[Path, ToolchainInfo, str]:
    vice_name = config.get("viceBinary", "x64sc")
    vice_location = shutil.which(vice_name)
    if vice_location is None:
        raise LabError(f"VICE executable {vice_name!r} was not found; run brew bundle with the laboratory Brewfile")
    vice_binary = Path(vice_location).resolve()

    version_result = _run([str(vice_binary), "-version"])
    version_output = version_result.stdout + version_result.stderr
    version_source = "x64sc -version"
    try:
        version = parse_vice_version(version_output)
    except LabError:
        brew = shutil.which("brew")
        if brew is None:
            raise LabError("VICE did not report its version and Homebrew is unavailable for fallback identification")
        brew_result = _run([brew, "list", "--versions", "vice"])
        if brew_result.returncode != 0:
            raise LabError("VICE did not report its version and Homebrew could not identify the installed formula")
        version = parse_homebrew_vice_version(brew_result.stdout + brew_result.stderr)
        version_source = "brew list --versions vice (x64sc -version failed)"

    minimum = config["minimumViceVersion"]
    if not version_at_least(version, minimum):
        raise LabError(f"VICE {format_version(version)} is below the required version {minimum}")

    minimum_python = tuple(int(part) for part in config["minimumPythonVersion"].split("."))
    if sys.version_info[: len(minimum_python)] < minimum_python:
        raise LabError(
            f"Python {sys.version_info.major}.{sys.version_info.minor} is below the required "
            f"version {config['minimumPythonVersion']}"
        )

    features_result = _run([str(vice_binary), "-features"])
    features = features_result.stdout + features_result.stderr
    if features_result.returncode != 0 or "Compile time options:" not in features:
        raise LabError("VICE feature smoke test failed")

    features_digest = __import__("hashlib").sha256(features.encode("utf-8")).hexdigest()
    info = ToolchainInfo(
        viceVersion=format_version(version),
        viceVersionSource=version_source,
        viceBinarySha256=file_hash(vice_binary),
        viceFeaturesSha256=features_digest,
        pythonVersion=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    )
    return vice_binary, info, features
