from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any


class LabError(RuntimeError):
    """A user-actionable laboratory validation or execution failure."""


def file_hash(path: Path, algorithm: str = "sha256") -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def validate_image(path: Path, expected: dict[str, Any], *, label: str) -> dict[str, Any]:
    if not path.is_file():
        raise LabError(f"{label} does not exist or is not a file: {path}")

    size = path.stat().st_size
    if "size" in expected and size != expected["size"]:
        raise LabError(f"{label} size mismatch: expected {expected['size']}, got {size}")

    actual_hashes = {
        algorithm: file_hash(path, algorithm)
        for algorithm in ("sha256", "sha1", "md5")
    }
    for algorithm, expected_digest in expected.get("hashes", {}).items():
        if actual_hashes.get(algorithm) != expected_digest.lower():
            raise LabError(
                f"{label} {algorithm} mismatch: expected {expected_digest}, "
                f"got {actual_hashes.get(algorithm, 'unsupported')}"
            )

    return {
        "path": str(path.resolve()),
        "size": size,
        "hashes": actual_hashes,
    }


def parse_hex_int(value: str, *, label: str) -> int:
    require(isinstance(value, str), f"{label} must be a hex string")
    parsed = int(value, 0)
    require(0 <= parsed <= 0x100000, f"{label} outside 1 MiB ST RAM: {value}")
    return parsed


def parse_ram_ranges(ranges: list[Any], *, label: str) -> list[tuple[int, int]]:
    parsed: list[tuple[int, int]] = []
    require(isinstance(ranges, list) and bool(ranges), f"{label} must be a non-empty list")
    for index, item in enumerate(ranges):
        require(isinstance(item, list) and len(item) == 2, f"{label}[{index}] must be [start, end]")
        start = parse_hex_int(item[0], label=f"{label}[{index}].start")
        end = parse_hex_int(item[1], label=f"{label}[{index}].end")
        require(start < end, f"{label}[{index}] start must be below end")
        parsed.append((start, end))
    return parsed


def extract_stable_ram(data: bytes, ranges: list[tuple[int, int]]) -> bytes:
    require(len(data) == 0x100000, f"RAM dump must be exactly 1 MiB, got {len(data)}")
    return b"".join(data[start:end] for start, end in ranges)


def parse_register_log(text: str) -> dict[str, Any]:
    registers: dict[str, Any] = {}
    for match in re.finditer(r"\b([DA][0-7]|USP|ISP|SR)=?\s*([0-9A-Fa-f]{4,8})\b", text):
        name, value = match.groups()
        registers[name.upper()] = int(value, 16)
    # Hatari prints "  D0 xxxxxxxx   D1 ..." without '='
    for match in re.finditer(r"\b([DA][0-7])\s+([0-9A-Fa-f]{8})\b", text):
        name, value = match.groups()
        registers[name.upper()] = int(value, 16)
    pc_match = re.search(r"^(?:CPU=\$)?([0-9A-Fa-f]{6,8})\s+[0-9A-Fa-f]{2,4}", text, re.MULTILINE)
    if pc_match is None:
        pc_match = re.search(r"CPU=\$([0-9A-Fa-f]+)", text)
    if pc_match is not None:
        registers["PC"] = int(pc_match.group(1), 16)
    require("PC" in registers, "Could not parse PC from Hatari register log")
    return registers


def validate_scenario(scenario: dict[str, Any]) -> None:
    require(scenario.get("schemaVersion") == 1, "Scenario schemaVersion must be 1")
    require(isinstance(scenario.get("name"), str) and bool(scenario["name"]), "Scenario name is required")
    require(
        scenario.get("checkpoint") == "title-screen",
        "Scenario checkpoint must be title-screen",
    )
    actions = scenario.get("actions")
    require(isinstance(actions, list) and bool(actions), "Scenario actions must be a non-empty list")
    allowed = {"wait_vbls", "keypress", "capture"}
    capture_count = 0
    for index, action in enumerate(actions):
        require(isinstance(action, dict), f"Scenario action {index} must be an object")
        action_type = action.get("type")
        require(action_type in allowed, f"Scenario action {index} has unknown type {action_type!r}")
        if action_type == "wait_vbls":
            count = action.get("count")
            require(isinstance(count, int) and 0 < count <= 100000, f"Scenario action {index} wait_vbls invalid")
        elif action_type == "keypress":
            key = action.get("key")
            require(isinstance(key, (str, int)), f"Scenario action {index} keypress key invalid")
            if isinstance(key, str):
                require(bool(key) and len(key) <= 32, f"Scenario action {index} key text invalid")
            else:
                require(0 <= key <= 127, f"Scenario action {index} scancode invalid")
        elif action_type == "capture":
            capture_count += 1
            artifacts = action.get("artifacts")
            require(isinstance(artifacts, list) and bool(artifacts), f"Scenario action {index} capture empty")
            require(set(artifacts) <= {"ram", "registers", "display"}, f"Scenario action {index} unknown artifact")
    require(capture_count == 1, "Observation scenarios must contain exactly one capture action")


def validate_run_manifest(manifest: dict[str, Any]) -> None:
    require(manifest.get("schemaVersion") == 1, "Run manifest schemaVersion must be 1")
    for field in ("runId", "createdAt", "authority", "toolchain", "machine", "scenario", "checkpoint", "artifacts"):
        require(field in manifest, f"Run manifest is missing {field}")
    require(isinstance(manifest["artifacts"], list), "Run manifest artifacts must be a list")
    for index, artifact in enumerate(manifest["artifacts"]):
        require(isinstance(artifact, dict), f"Run artifact {index} must be an object")
        for field in ("role", "path", "size", "sha256"):
            require(field in artifact, f"Run artifact {index} is missing {field}")
        require(isinstance(artifact["size"], int) and artifact["size"] >= 0, f"Run artifact {index} size invalid")
        require(
            isinstance(artifact["sha256"], str) and bool(re.fullmatch(r"[0-9a-f]{64}", artifact["sha256"])),
            f"Run artifact {index} sha256 invalid",
        )


def verify_run_artifacts(run_directory: Path, manifest: dict[str, Any]) -> None:
    validate_run_manifest(manifest)
    root = run_directory.resolve()
    for artifact in manifest["artifacts"]:
        artifact_path = (root / artifact["path"]).resolve()
        if not artifact_path.is_relative_to(root):
            raise LabError(f"Artifact path must remain inside the run directory: {artifact['path']}")
        if not artifact_path.is_file():
            raise LabError(f"Artifact is missing: {artifact['path']}")
        if artifact_path.stat().st_size != artifact["size"]:
            raise LabError(f"Artifact size mismatch: {artifact['path']}")
        if file_hash(artifact_path) != artifact["sha256"]:
            raise LabError(f"Artifact sha256 mismatch: {artifact['path']}")


def _normalized_run(manifest: dict[str, Any]) -> dict[str, Any]:
    artifacts = sorted(
        (
            {
                "role": artifact["role"],
                "size": artifact["size"],
                "sha256": artifact["sha256"],
            }
            for artifact in manifest["artifacts"]
            if artifact["role"] in {"normalized-ram", "registers-stable", "display"}
        ),
        key=lambda item: item["role"],
    )
    return {
        "authority": manifest["authority"],
        "toolchain": {
            "hatariVersion": manifest["toolchain"]["hatariVersion"],
            "pythonVersion": manifest["toolchain"]["pythonVersion"],
        },
        "machine": {
            "model": manifest["machine"]["model"],
            "memsizeMiB": manifest["machine"]["memsizeMiB"],
            "tosSha256": manifest["machine"]["tosSha256"],
        },
        "checkpoint": {
            "name": manifest["checkpoint"]["name"],
            "pc": manifest["checkpoint"]["pc"],
        },
        "artifacts": artifacts,
    }


def compare_reproducible_runs(first: dict[str, Any], second: dict[str, Any]) -> None:
    validate_run_manifest(first)
    validate_run_manifest(second)
    if _normalized_run(first) != _normalized_run(second):
        raise LabError("Runs are not reproducible: normalized evidence differs")


def stable_registers(registers: dict[str, Any]) -> dict[str, int]:
    """Registers that remain equal across cold starts at the title-screen PC."""
    keys = ("A5", "A6", "A7", "D5", "D6", "D7")
    stable: dict[str, int] = {}
    for key in keys:
        if key in registers:
            stable[key] = int(registers[key])
    require(len(stable) == len(keys), "Stable register set is incomplete")
    return stable
