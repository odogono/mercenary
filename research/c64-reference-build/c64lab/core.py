from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any


class LabError(RuntimeError):
    """A user-actionable laboratory validation or execution failure."""


#: Decoder identity recorded on every UNC-0002 object semantics Evidence record.
#: Declared here so the catalogue validator and the decoder agree without importing
#: one another.
OBJECT_SEMANTICS_DECODER_VERSION = "object-semantics-v1"


def file_hash(path: Path, algorithm: str = "sha256") -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_prg(path: Path, expected: dict[str, Any]) -> dict[str, Any]:
    if not path.is_file():
        raise LabError(f"Reference Build does not exist or is not a file: {path}")

    size = path.stat().st_size
    if "size" in expected and size != expected["size"]:
        raise LabError(f"Reference Build size mismatch: expected {expected['size']}, got {size}")
    if size < 3:
        raise LabError("Reference Build is too short to be a PRG")

    with path.open("rb") as handle:
        header = handle.read(2)
    load_address = int.from_bytes(header, "little")
    if "loadAddress" in expected and load_address != expected["loadAddress"]:
        raise LabError(
            f"Reference Build load address mismatch: expected ${expected['loadAddress']:04X}, "
            f"got ${load_address:04X}"
        )

    end_address = load_address + size - 3
    if end_address > 0xFFFF:
        raise LabError(f"Reference Build extends beyond C64 memory: ${end_address:X}")
    if "endAddress" in expected and end_address != expected["endAddress"]:
        raise LabError(
            f"Reference Build end address mismatch: expected ${expected['endAddress']:04X}, "
            f"got ${end_address:04X}"
        )

    actual_hashes = {
        algorithm: file_hash(path, algorithm)
        for algorithm in ("sha256", "sha1", "md5")
    }
    for algorithm, expected_digest in expected.get("hashes", {}).items():
        if actual_hashes.get(algorithm) != expected_digest.lower():
            raise LabError(
                f"Reference Build {algorithm} mismatch: expected {expected_digest}, "
                f"got {actual_hashes.get(algorithm, 'unsupported')}"
            )

    return {
        "path": str(path.resolve()),
        "size": size,
        "loadAddress": load_address,
        "endAddress": end_address,
        "hashes": actual_hashes,
    }


def parse_vice_version(output: str) -> tuple[int, int, int]:
    match = re.search(r"(?:VICE\s+)?(\d+)\.(\d+)(?:\.(\d+))?", output, re.IGNORECASE)
    if match is None:
        raise LabError(f"Could not parse VICE version from output: {output.strip()!r}")
    return tuple(int(part or 0) for part in match.groups())  # type: ignore[return-value]


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def validate_scenario(scenario: dict[str, Any], cycle_limit: int) -> None:
    _require(scenario.get("schemaVersion") == 1, "Scenario schemaVersion must be 1")
    _require(isinstance(scenario.get("name"), str) and bool(scenario["name"]), "Scenario name is required")
    _require(
        scenario.get("checkpoint") in {"post-unpack", "interactive"},
        "Scenario checkpoint must be post-unpack or interactive",
    )
    actions = scenario.get("actions")
    _require(isinstance(actions, list) and bool(actions), "Scenario actions must be a non-empty list")

    consumed_cycles = 0
    allowed_artifacts = {"ram", "cpu-memory", "registers", "display", "snapshot"}
    for index, action in enumerate(actions):
        _require(isinstance(action, dict), f"Scenario action {index} must be an object")
        action_type = action.get("type")
        if action_type == "wait_pc":
            address = action.get("address")
            _require(isinstance(address, int) and 0 <= address <= 0xFFFF, f"Scenario action {index} has an invalid address")
        elif action_type == "wait_instructions":
            instructions = action.get("instructions")
            _require(
                isinstance(instructions, int) and 0 < instructions <= 65535,
                f"Scenario action {index} instruction count must be 1..65535",
            )
            consumed_cycles += instructions
        elif action_type == "key":
            petscii = action.get("petscii")
            _require(isinstance(petscii, str), f"Scenario action {index} PETSCII must be text")
            _require(len(petscii.encode("latin-1")) <= 255, f"Scenario action {index} PETSCII exceeds 255 bytes")
        elif action_type == "joystick":
            _require(action.get("port") == 2, f"Scenario action {index} must use joystick port 2")
            value = action.get("value")
            duration = action.get("durationInstructions")
            _require(isinstance(value, int) and 0 <= value <= 31, f"Scenario action {index} joystick value must be 0..31")
            _require(
                isinstance(duration, int) and 0 < duration <= 65535,
                f"Scenario action {index} instruction duration must be 1..65535",
            )
            consumed_cycles += duration
        elif action_type == "capture":
            artifacts = action.get("artifacts")
            _require(isinstance(artifacts, list) and bool(artifacts), f"Scenario action {index} capture is empty")
            _require(len(artifacts) == len(set(artifacts)), f"Scenario action {index} repeats an artifact")
            _require(set(artifacts) <= allowed_artifacts, f"Scenario action {index} requests an unknown artifact")
        else:
            raise LabError(f"Scenario action {index} has unknown type {action_type!r}")

    _require(consumed_cycles <= cycle_limit, f"Scenario exceeds cycle limit {cycle_limit}")


def validate_run_manifest(manifest: dict[str, Any]) -> None:
    _require(manifest.get("schemaVersion") == 1, "Run manifest schemaVersion must be 1")
    for field in ("runId", "createdAt", "build", "toolchain", "machine", "scenario", "checkpoint", "artifacts"):
        _require(field in manifest, f"Run manifest is missing {field}")
    _require(isinstance(manifest["runId"], str) and bool(manifest["runId"]), "Run manifest runId is invalid")
    _require(isinstance(manifest["createdAt"], str) and bool(manifest["createdAt"]), "Run manifest createdAt is invalid")
    for field in ("build", "toolchain", "machine", "scenario", "checkpoint"):
        _require(isinstance(manifest[field], dict), f"Run manifest {field} must be an object")
    _require(isinstance(manifest["artifacts"], list), "Run manifest artifacts must be a list")
    for index, artifact in enumerate(manifest["artifacts"]):
        _require(isinstance(artifact, dict), f"Run artifact {index} must be an object")
        for field in ("role", "path", "size", "sha256"):
            _require(field in artifact, f"Run artifact {index} is missing {field}")
        _require(isinstance(artifact["size"], int) and artifact["size"] >= 0, f"Run artifact {index} size is invalid")
        _require(
            isinstance(artifact["sha256"], str) and bool(re.fullmatch(r"[0-9a-f]{64}", artifact["sha256"])),
            f"Run artifact {index} sha256 is invalid",
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
            if artifact["role"] in {"ram", "cpu-memory", "registers", "display"}
        ),
        key=lambda item: item["role"],
    )
    return {
        "build": manifest["build"],
        "toolchain": manifest["toolchain"],
        "machine": manifest["machine"],
        "scenario": manifest["scenario"],
        "checkpoint": manifest["checkpoint"],
        "artifacts": artifacts,
    }


def compare_reproducible_runs(first: dict[str, Any], second: dict[str, Any]) -> None:
    validate_run_manifest(first)
    validate_run_manifest(second)
    if _normalized_run(first) != _normalized_run(second):
        raise LabError("Runs are not reproducible: normalized evidence differs")
