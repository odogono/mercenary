from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import subprocess
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .core import LabError, file_hash
from .laboratory import WORK_ROOT, capture, load_configuration
from .monitor import MonitorClient, MonitorProtocolError
from .semantics import (
    assert_semantic_observations,
    classify_semantic_outcome,
    decode_semantic_observations,
    pal_forward_delta,
    semantic_boundary_address,
    stratified_pal_targets,
    validate_pal_phase_coverage,
)
from .toolchain import discover_toolchain
from .verification import REPOSITORY_ROOT, validate_verification


CATALOGUE_VERSION = "catalogue-v1"
LAB_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_ROOT = LAB_ROOT / "schemas"
CATALOGUE_ID = re.compile(r"CAT-[0-9]{4}")
CASE_ID = re.compile(r"BC-[0-9]{4}")
UNCERTAINTY_ID = re.compile(r"UNC-[0-9]{4}")
TRACE_ID = re.compile(r"TR-[0-9]{4}")
EVIDENCE_ID = re.compile(r"EV-[0-9a-f]{16}")
SHA256 = re.compile(r"[0-9a-f]{64}")
SEMANTIC_MODE_ID = re.compile(r"SM-[0-9]{4}")
SEMANTIC_OBLIGATION_ID = re.compile(r"SO-[0-9]{4}")

REQUIRED_DOMAINS = {
    "audio",
    "controls",
    "economy",
    "endings",
    "inventory",
    "mechanics",
    "messages",
    "missions",
    "movement",
    "nondeterminism",
    "objects",
    "progression",
    "quirks",
    "saves",
    "timing",
    "vehicles",
    "visuals",
    "world",
}
REQUIRED_DIMENSIONS = {"audio", "content", "controls", "nondeterminism", "outcome", "saves", "state", "timing", "visuals"}
STATUSES = {"verified", "provisional"}
CLASSIFICATIONS = {
    "required-behavior",
    "preserved-quirk",
    "repairable-artifact",
    "mac-adaptation",
    "excluded-crack-artifact",
}
CASE_METADATA = (
    "Version",
    "Status",
    "Classification",
    "Materiality",
    "Crack sensitivity",
    "Fidelity dimensions",
    "Evidence version",
    "Research Provenance",
)
CASE_SECTIONS = (
    "Initial state",
    "Semantic actions",
    "Expected observables",
    "Acceptance Envelopes",
    "Verification",
    "Characteristic-feel review",
    "Departures",
)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LabError(f"Could not read catalogue JSON from {path}: {error}") from error
    _require(isinstance(value, dict), f"Catalogue document must be an object: {path}")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _validate_schema(document: dict[str, Any], schema_name: str) -> None:
    try:
        from jsonschema import Draft202012Validator
    except ImportError as error:
        raise LabError("Catalogue schema validation requires jsonschema==4.26.0; create the documented laboratory virtual environment") from error
    schema = _load_json(SCHEMA_ROOT / schema_name)
    errors = sorted(Draft202012Validator(schema).iter_errors(document), key=lambda item: list(item.path))
    if errors:
        location = "/".join(str(part) for part in errors[0].path) or "<root>"
        raise LabError(f"Catalogue schema validation failed for {schema_name} at {location}: {errors[0].message}")


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _validate_restricted_pointer(value: Any, context: str) -> Path:
    _require(isinstance(value, str) and bool(re.fullmatch(r"[A-Za-z0-9._/-]+", value)), f"{context} must use a safe restricted pointer")
    pointer = Path(value)
    _require(not pointer.is_absolute() and ".." not in pointer.parts, f"{context} must use a safe restricted pointer")
    return pointer


def catalogue_digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def validate_semantic_coverage(
    coverage: dict[str, Any],
    catalogue_subject_digest: str,
    evidence: dict[str, dict[str, Any]],
    case_ids: set[str],
) -> None:
    _validate_schema(coverage, "catalogue-semantic-coverage.schema.json")
    _require(coverage.get("catalogueSubjectDigest") == catalogue_subject_digest, "Semantic coverage targets a stale catalogue subject digest")
    modes = {item["id"]: item for item in coverage["modes"]}
    _require(len(modes) == len(coverage["modes"]), "Semantic coverage repeats a Semantic Mode")
    for mode_id, mode in modes.items():
        _require(bool(SEMANTIC_MODE_ID.fullmatch(mode_id)), f"Semantic coverage mode {mode_id} has an invalid ID")
        _require(mode["status"] == "verified", f"Semantic coverage mode {mode_id} is unresolved")
        _validate_semantic_links(mode, evidence, case_ids, f"Semantic Mode {mode_id}")
    obligations = {item["id"]: item for item in coverage["obligations"]}
    _require(len(obligations) == len(coverage["obligations"]), "Semantic coverage repeats an obligation")
    kinds = {"action", "conflict", "rate-limit", "interaction-precondition", "interaction-boundary", "stochastic-branch"}
    for obligation_id, obligation in obligations.items():
        _require(bool(SEMANTIC_OBLIGATION_ID.fullmatch(obligation_id)), f"Semantic obligation {obligation_id} has an invalid ID")
        _require(obligation["kind"] in kinds, f"Semantic obligation {obligation_id} has an invalid kind")
        _require(all(mode_id in modes for mode_id in obligation["modeIds"]), f"Semantic obligation {obligation_id} references an unknown Semantic Mode")
        _require(obligation["status"] == "verified", f"Semantic obligation {obligation_id} is unresolved")
        minimum = 100 if obligation["kind"] == "stochastic-branch" else 2
        _require(obligation["minimumProofRuns"] >= minimum, f"Semantic obligation {obligation_id} has too few required proof runs")
        _require(obligation["completedProofRuns"] >= obligation["minimumProofRuns"], f"Semantic obligation {obligation_id} has incomplete proof runs")
        if obligation["kind"] == "stochastic-branch":
            legal = set(obligation["legalOutcomeIds"])
            observed = set(obligation["observedOutcomeIds"])
            _require(observed <= legal, f"Semantic obligation {obligation_id} observed an illegal outcome")
            _require(legal <= observed, f"Semantic obligation {obligation_id} has unobserved legal outcomes")
        _validate_semantic_links(obligation, evidence, case_ids, f"Semantic obligation {obligation_id}")
        _require(
            len(set(obligation["evidenceIds"])) >= obligation["minimumProofRuns"],
            f"Semantic obligation {obligation_id} lacks distinct proof evidence for every required run",
        )

    scope = coverage["scope"]
    required_case_ids = {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"}
    declared_case_ids = set(scope["behaviorCaseIds"])
    _require(
        declared_case_ids == required_case_ids,
        "Semantic coverage scope must declare exactly the UNC-0001 Behavior Cases",
    )
    declared_kinds = set(scope["obligationKinds"])
    _require(
        declared_kinds == kinds,
        "Semantic coverage scope must declare every UNC-0001 obligation kind",
    )
    covered_case_ids = {
        case_id
        for item in [*coverage["modes"], *coverage["obligations"]]
        for case_id in item["behaviorCaseIds"]
    }
    missing_case_ids = sorted(declared_case_ids - covered_case_ids)
    _require(
        not missing_case_ids,
        f"Semantic coverage does not cover Behavior Cases: {', '.join(missing_case_ids)}",
    )
    covered_kinds = {item["kind"] for item in coverage["obligations"]}
    missing_kinds = sorted(declared_kinds - covered_kinds)
    _require(
        not missing_kinds,
        f"Semantic coverage does not cover obligation kinds: {', '.join(missing_kinds)}",
    )
    referenced_mode_ids = {mode_id for item in coverage["obligations"] for mode_id in item["modeIds"]}
    unused_mode_ids = sorted(set(modes) - referenced_mode_ids)
    _require(
        not unused_mode_ids,
        f"Semantic coverage has modes without obligations: {', '.join(unused_mode_ids)}",
    )


def _validate_semantic_links(item: dict[str, Any], evidence: dict[str, dict[str, Any]], case_ids: set[str], context: str) -> None:
    _require(all(case_id in case_ids for case_id in item["behaviorCaseIds"]), f"{context} references an unknown Behavior Case")
    for evidence_id in item["evidenceIds"]:
        record = evidence.get(evidence_id)
        _require(record is not None, f"{context} references unknown evidence")
        _require(record.get("mode") == "proof", f"{context} must use proof evidence")
        _require(record.get("traceId") in item["traceIds"], f"{context} evidence does not match its proof traces")


def validate_catalogue_trace(trace: dict[str, Any], cycle_limit: int) -> None:
    _validate_schema(trace, "catalogue-trace.schema.json")
    _require(trace.get("schemaVersion") == 1, "Catalogue trace schemaVersion must be 1")
    _require(isinstance(trace.get("id"), str) and bool(TRACE_ID.fullmatch(trace["id"])), "Catalogue trace ID must match TR-0001")
    _require(isinstance(trace.get("version"), int) and trace["version"] > 0, "Catalogue trace version must be positive")
    _require(isinstance(trace.get("title"), str) and bool(trace["title"]), "Catalogue trace title is required")
    mode = trace.get("mode")
    _require(mode in {"probe", "proof"}, "Catalogue trace mode must be probe or proof")
    branches = trace.get("branches")
    _require(isinstance(branches, list) and bool(branches), "Catalogue trace branches must be non-empty")

    seen_branches: dict[str, set[str]] = {}
    total_budget = 0
    for branch_index, branch in enumerate(branches):
        _require(isinstance(branch, dict), f"Catalogue trace branch {branch_index} must be an object")
        branch_id = branch.get("id")
        _require(isinstance(branch_id, str) and bool(re.fullmatch(r"[a-z0-9-]+", branch_id)), f"Catalogue trace branch {branch_index} has an invalid ID")
        _require(branch_id not in seen_branches, f"Catalogue trace repeats branch {branch_id}")
        source = branch.get("from")
        _require(isinstance(source, dict), f"Catalogue trace branch {branch_id} needs a source")
        if "checkpoint" in source:
            _require(source == {"checkpoint": "interactive"}, f"Catalogue trace branch {branch_id} must start at the interactive checkpoint")
        elif "saveMedia" in source:
            _require(set(source) == {"saveMedia", "evidenceSnapshot"}, f"Catalogue trace branch {branch_id} save media needs its legally reached evidence snapshot")
            _validate_restricted_pointer(source["saveMedia"], f"Catalogue trace branch {branch_id} saveMedia")
            _validate_restricted_pointer(source["evidenceSnapshot"], f"Catalogue trace branch {branch_id} evidenceSnapshot")
        elif "evidenceSnapshot" in source:
            _require(set(source) == {"evidenceSnapshot"}, f"Catalogue trace branch {branch_id} has an invalid evidence snapshot source")
            _validate_restricted_pointer(source["evidenceSnapshot"], f"Catalogue trace branch {branch_id} evidenceSnapshot")
        elif "branch" in source:
            parent = source.get("branch")
            capture = source.get("capture")
            _require(parent in seen_branches, f"Catalogue trace branch {branch_id} must reference an earlier branch")
            _require(capture in seen_branches[parent], f"Catalogue trace branch {branch_id} references an unknown parent capture")
        else:
            raise LabError(f"Catalogue trace branch {branch_id} has an unsupported source")

        actions = branch.get("actions")
        _require(isinstance(actions, list) and bool(actions), f"Catalogue trace branch {branch_id} actions must be non-empty")
        captures: set[str] = set()
        semantic_captures: set[str] = set()
        semantic_outcome_seen = False
        audio_active = False
        sid_active = False
        disk_attached = False
        joystick_state_value = 0
        for action_index, action in enumerate(actions):
            _require(isinstance(action, dict), f"Catalogue trace action {branch_id}/{action_index} must be an object")
            action_type = action.get("type")
            context = f"Catalogue trace action {branch_id}/{action_index}"
            if action_type == "wait_pc":
                _require(isinstance(action.get("address"), int) and 0 <= action["address"] <= 0xFFFF, f"{context} has an invalid address")
            elif action_type == "wait_boundary":
                boundary = action.get("boundary")
                _require(isinstance(boundary, str) and bool(re.fullmatch(r"[a-z][a-z0-9-]*", boundary)), f"{context} has an invalid semantic boundary")
            elif action_type == "wait_instructions":
                count = action.get("instructions")
                _require(isinstance(count, int) and 0 < count <= cycle_limit, f"{context} has an invalid instruction count")
                total_budget += count
            elif action_type == "wait_frames":
                frames = action.get("frames")
                _require(isinstance(frames, int) and 0 < frames <= 10_000, f"{context} has an invalid frame count")
                total_budget += frames * 19_656
            elif action_type == "wait_memory":
                _validate_memory_location(action, context)
                _require(isinstance(action.get("equalsHex"), str) and bool(re.fullmatch(r"[0-9a-fA-F]+", action["equalsHex"])), f"{context} has invalid expected bytes")
                timeout = action.get("timeoutInstructions")
                _require(isinstance(timeout, int) and timeout > 0, f"{context} needs a positive timeoutInstructions")
                total_budget += timeout
            elif action_type == "key":
                value = action.get("petscii")
                _require(isinstance(value, str), f"{context} PETSCII must be text")
                try:
                    size = len(value.encode("latin-1"))
                except UnicodeEncodeError as error:
                    raise LabError(f"{context} PETSCII is not byte representable") from error
                _require(size <= 255, f"{context} PETSCII exceeds 255 bytes")
            elif action_type == "joystick":
                _require(action.get("port") == 2, f"{context} must use joystick port 2")
                _require(isinstance(action.get("value"), int) and 0 <= action["value"] <= 31, f"{context} has an invalid joystick value")
                duration = action.get("durationInstructions")
                _require(isinstance(duration, int) and duration > 0, f"{context} needs a positive durationInstructions")
                _require(joystick_state_value == 0, f"{context} cannot run a timed joystick action while input is held")
                total_budget += duration
            elif action_type == "joystick_state":
                _require(action.get("port") == 2, f"{context} must use joystick port 2")
                value = action.get("value")
                _require(isinstance(value, int) and 0 <= value <= 31, f"{context} has an invalid joystick value")
                joystick_state_value = value
            elif action_type == "capture":
                name = action.get("name")
                _require(isinstance(name, str) and bool(re.fullmatch(r"[a-z0-9-]+", name)), f"{context} has an invalid capture name")
                _require(name not in captures, f"{context} repeats capture {name}")
                artifacts = action.get("artifacts")
                allowed = {"memory", "registers", "display", "snapshot", "disk", "audio", "sid-events"}
                _require(isinstance(artifacts, list) and bool(artifacts) and set(artifacts) <= allowed, f"{context} requests unknown artifacts")
                _require(len(artifacts) == len(set(artifacts)), f"{context} repeats an artifact")
                if "memory" in artifacts:
                    ranges = action.get("ranges")
                    _require(isinstance(ranges, list) and bool(ranges), f"{context} memory capture needs ranges")
                    for memory_range in ranges:
                        _validate_memory_range(memory_range, context)
                if "snapshot" in artifacts:
                    captures.add(name)
            elif action_type == "semantic_capture":
                name = action.get("name")
                observation_ids = action.get("observationIds")
                _require(isinstance(name, str) and bool(re.fullmatch(r"[a-z0-9-]+", name)), f"{context} has an invalid semantic capture name")
                _require(name not in semantic_captures, f"{context} repeats semantic capture {name}")
                _require(
                    isinstance(observation_ids, list)
                    and bool(observation_ids)
                    and len(observation_ids) == len(set(observation_ids))
                    and all(isinstance(value, str) and bool(re.fullmatch(r"[a-z][a-z0-9-]*", value)) for value in observation_ids),
                    f"{context} has invalid semantic observation IDs",
                )
                semantic_captures.add(name)
            elif action_type == "semantic_assert":
                before, after = action.get("before"), action.get("after")
                _require(before in semantic_captures and after in semantic_captures, f"{context} must reference an earlier semantic capture")
                _validate_semantic_assertions(action.get("assertions"), context)
            elif action_type == "semantic_outcome":
                _require(not semantic_outcome_seen, f"{context} repeats a semantic outcome")
                _require(action.get("capture") in semantic_captures, f"{context} must reference an earlier semantic capture")
                if "before" in action:
                    _require(action["before"] in semantic_captures, f"{context} before must reference an earlier semantic capture")
                outcomes = action.get("outcomes")
                _require(isinstance(outcomes, list) and bool(outcomes), f"{context} needs typed outcomes")
                outcome_ids: set[str] = set()
                for outcome in outcomes:
                    _require(isinstance(outcome, dict), f"{context} outcome must be an object")
                    outcome_id = outcome.get("id")
                    _require(isinstance(outcome_id, str) and bool(re.fullmatch(r"[a-z0-9-]+", outcome_id)), f"{context} has an invalid outcome ID")
                    _require(outcome_id not in outcome_ids, f"{context} repeats outcome {outcome_id}")
                    outcome_ids.add(outcome_id)
                    _validate_semantic_assertions(outcome.get("assertions"), f"{context}/{outcome_id}")
                semantic_outcome_seen = True
            elif action_type == "attach_disk":
                _require(not disk_attached, f"{context} cannot attach a second disk")
                _require(action.get("format") == "d64" and action.get("mode") in {"blank", "evidence"}, f"{context} supports blank or evidence D64 media")
                _require(action.get("access", "read-write") in {"read-write", "read-only"}, f"{context} has an invalid disk access mode")
                if action["mode"] == "evidence":
                    _validate_restricted_pointer(action.get("pointer"), f"{context} evidence D64")
                disk_attached = True
            elif action_type == "detach_disk":
                _require(disk_attached, f"{context} cannot detach without attached media")
                disk_attached = False
            elif action_type in {"audio_start", "audio_stop", "sid_start", "sid_stop"}:
                if action_type == "audio_start":
                    _require(not audio_active, f"{context} audio is already active")
                    audio_active = True
                elif action_type == "audio_stop":
                    _require(audio_active, f"{context} audio is not active")
                    audio_active = False
                elif action_type == "sid_start":
                    _require(not sid_active, f"{context} SID recording is already active")
                    sid_active = True
                else:
                    _require(sid_active, f"{context} SID recording is not active")
                    sid_active = False
            elif action_type == "patch_memory":
                _require(mode == "probe", f"{context} memory injection is allowed only in probe mode")
                _validate_memory_location(action, context)
                _require(isinstance(action.get("bytesHex"), str) and bool(re.fullmatch(r"(?:[0-9a-fA-F]{2})+", action["bytesHex"])), f"{context} bytesHex is invalid")
            else:
                raise LabError(f"{context} has unknown type {action_type!r}")
        _require(not audio_active, f"Catalogue trace branch {branch_id} leaves audio recording active")
        _require(not sid_active, f"Catalogue trace branch {branch_id} leaves SID recording active")
        _require(joystick_state_value == 0, f"Catalogue trace branch {branch_id} leaves joystick input held")
        if "saveMedia" in source:
            first = actions[0]
            _require(
                first.get("type") == "attach_disk" and first.get("mode") == "evidence" and first.get("pointer") == source["saveMedia"],
                f"Catalogue trace branch {branch_id} must attach its save media as the first action",
            )
        seen_branches[branch_id] = captures
    _require(total_budget <= cycle_limit, f"Catalogue trace exceeds cycle limit {cycle_limit}")


def _validate_semantic_assertions(assertions: Any, context: str) -> None:
    _require(isinstance(assertions, list) and bool(assertions), f"{context} needs semantic assertions")
    operators = {"equals", "not-equals", "unchanged", "changed", "delta", "range", "member"}
    for assertion in assertions:
        _require(isinstance(assertion, dict), f"{context} semantic assertion must be an object")
        _require(assertion.get("operator") in operators, f"{context} semantic assertion has an invalid operator")
        _require(isinstance(assertion.get("observation"), str), f"{context} semantic assertion needs an observation")
        operator = assertion["operator"]
        required = {
            "equals": {"operator", "observation", "value"},
            "not-equals": {"operator", "observation", "value"},
            "unchanged": {"operator", "observation"},
            "changed": {"operator", "observation"},
            "delta": {"operator", "observation", "value"},
            "range": {"operator", "observation", "minimum", "maximum"},
            "member": {"operator", "observation", "values"},
        }[operator]
        _require(set(assertion) == required, f"{context} semantic {operator} assertion has invalid fields")
        if operator == "member":
            _require(isinstance(assertion["values"], list) and bool(assertion["values"]), f"{context} semantic member assertion needs values")


def _validate_memory_location(value: dict[str, Any], context: str) -> None:
    _require(value.get("bank") in {"ram", "cpu"}, f"{context} has an invalid memory bank")
    _require(isinstance(value.get("address"), int) and 0 <= value["address"] <= 0xFFFF, f"{context} has an invalid memory address")


def _validate_memory_range(value: Any, context: str) -> None:
    _require(isinstance(value, dict), f"{context} memory range must be an object")
    _require(value.get("bank") in {"ram", "cpu"}, f"{context} memory range has an invalid bank")
    start, end = value.get("start"), value.get("end")
    _require(isinstance(start, int) and isinstance(end, int) and 0 <= start <= end <= 0xFFFF, f"{context} memory range is invalid")


def store_artifact(source: Path, store_root: Path) -> dict[str, Any]:
    _require(source.is_file(), f"Evidence artifact does not exist: {source}")
    digest = file_hash(source)
    relative = Path("sha256") / digest[:2] / digest
    destination = store_root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        _require(destination.stat().st_size == source.stat().st_size and file_hash(destination) == digest, f"Content store collision for {digest}")
    else:
        shutil.copyfile(source, destination)
    return {"sha256": digest, "size": source.stat().st_size, "path": relative.as_posix()}


def verify_artifact_hashes(store_root: Path, hashes: list[str]) -> str:
    items: list[dict[str, Any]] = []
    for digest in sorted(set(hashes)):
        _require(bool(SHA256.fullmatch(digest)), f"Evidence store contains an invalid cited hash {digest!r}")
        path = store_root / "sha256" / digest[:2] / digest
        _require(path.is_file(), f"Evidence store is missing cited artifact {digest}")
        _require(file_hash(path) == digest, f"Evidence store artifact {digest} failed integrity verification")
        items.append({"sha256": digest, "size": path.stat().st_size})
    return catalogue_digest(items)


def build_evidence_record(
    *,
    authority: str,
    build_sha256: str,
    trace: dict[str, Any],
    machine: dict[str, Any],
    toolchain: dict[str, Any],
    artifacts: list[dict[str, Any]],
    decoder_versions: list[str],
    mode: str,
) -> dict[str, Any]:
    _require(authority in {"running-reference-build", "decoded-reference-build"}, "Evidence authority is invalid")
    _require(bool(SHA256.fullmatch(build_sha256)), "Evidence build SHA-256 is invalid")
    _require(mode in {"probe", "proof"}, "Evidence mode must be probe or proof")
    _require(isinstance(trace.get("id"), str) and bool(TRACE_ID.fullmatch(trace["id"])), "Evidence trace ID is invalid")
    _require(isinstance(trace.get("version"), int) and trace["version"] > 0, "Evidence trace version is invalid")
    _require(isinstance(trace.get("sha256"), str) and bool(SHA256.fullmatch(trace["sha256"])), "Evidence trace SHA-256 is invalid")
    for artifact in artifacts:
        _require(bool(SHA256.fullmatch(str(artifact.get("sha256", "")))), "Evidence artifact SHA-256 is invalid")
    body = {
        "schemaVersion": 1,
        "authority": authority,
        "buildSha256": build_sha256,
        "trace": trace,
        "machine": machine,
        "toolchain": toolchain,
        "artifacts": sorted(artifacts, key=lambda item: (item.get("role", ""), item["sha256"])),
        "decoderVersions": sorted(decoder_versions),
        "mode": mode,
        "restriction": "local-restricted",
    }
    return {"id": f"EV-{catalogue_digest(body)[:16]}", **body}


def _ids(items: list[dict[str, Any]], pattern: re.Pattern[str], label: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in items:
        identifier = item.get("id")
        _require(isinstance(identifier, str) and bool(pattern.fullmatch(identifier)), f"{label} IDs must use the neutral format {pattern.pattern.replace('[0-9]{4}', '0001')}")
        _require(identifier not in result, f"Duplicate {label} ID {identifier}")
        result[identifier] = item
    return result


def _validate_behavior_case(path: Path) -> set[str]:
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as error:
        raise LabError(f"Could not read Behavior Case {path}: {error}") from error
    case_id = path.stem
    _require(bool(re.search(rf"^# {re.escape(case_id)}: .+", source, re.MULTILINE)), f"Behavior Case {case_id} heading must contain its stable ID and title")
    metadata: dict[str, str] = {}
    for name in CASE_METADATA:
        match = re.search(rf"^- {re.escape(name)}:\s*(.+)$", source, re.MULTILINE)
        _require(match is not None, f"Behavior Case {case_id} is missing {name}")
        metadata[name] = match.group(1).strip()
    _require(bool(re.fullmatch(r"[1-9][0-9]*", metadata["Version"])), f"Behavior Case {case_id} Version must be positive")
    _require(metadata["Status"] in STATUSES, f"Behavior Case {case_id} must be verified or provisional")
    _require(metadata["Classification"] in CLASSIFICATIONS, f"Behavior Case {case_id} has an invalid Classification")
    _require(metadata["Materiality"] in {"material", "non-material"}, f"Behavior Case {case_id} has invalid Materiality")
    _require(metadata["Crack sensitivity"] in {"retail-corroborated", "crack-sensitive", "not-applicable"}, f"Behavior Case {case_id} has invalid Crack sensitivity")
    dimensions = {value.strip() for value in metadata["Fidelity dimensions"].split(",")}
    _require(bool(dimensions) and dimensions <= REQUIRED_DIMENSIONS, f"Behavior Case {case_id} has invalid Fidelity dimensions")
    evidence_ids = set(re.findall(r"EV-[0-9a-f]{16}", metadata["Evidence version"]))
    _require(bool(evidence_ids), f"Behavior Case {case_id} Evidence version must name stable evidence")
    _require(bool(metadata["Research Provenance"]), f"Behavior Case {case_id} Research Provenance must not be empty")
    for section in CASE_SECTIONS:
        _require(bool(re.search(rf"^## {re.escape(section)}\s*$", source, re.MULTILINE)), f"Behavior Case {case_id} is missing {section}")
    return evidence_ids


def validate_catalogue(root: Path, *, case_root: Path | None = None) -> dict[str, Any]:
    entries_document = _load_json(root / "entries.json")
    uncertainties_document = _load_json(root / "uncertainties.json")
    evidence_document = _load_json(root / "evidence-index.json")
    coverage = _load_json(root / "coverage.json")
    for name, document in (("entries", entries_document), ("uncertainties", uncertainties_document), ("evidence-index", evidence_document), ("coverage", coverage)):
        _require(document.get("schemaVersion") == 1, f"Catalogue {name} schemaVersion must be 1")
    for entry in entries_document.get("entries", []):
        _require(isinstance(entry.get("id"), str) and bool(CATALOGUE_ID.fullmatch(entry["id"])), "Catalogue Entry IDs must use the neutral format CAT-0001")
    for item in evidence_document.get("evidence", []):
        pointer = Path(str(item.get("restrictedPointer", "")))
        _require(not pointer.is_absolute() and ".." not in pointer.parts, f"Evidence {item.get('id')} must use an opaque relative pointer")
    _validate_schema(entries_document, "catalogue-entries.schema.json")
    _validate_schema(uncertainties_document, "catalogue-uncertainties.schema.json")
    _validate_schema(evidence_document, "catalogue-evidence-index.schema.json")
    _validate_schema(coverage, "catalogue-coverage.schema.json")

    entries_list = entries_document.get("entries")
    uncertainty_list = uncertainties_document.get("uncertainties")
    evidence_list = evidence_document.get("evidence")
    _require(isinstance(entries_list, list) and bool(entries_list), "Behavior Catalogue must contain entries")
    _require(isinstance(uncertainty_list, list), "Behavior Catalogue uncertainties must be a list")
    _require(isinstance(evidence_list, list) and bool(evidence_list), "Behavior Catalogue must contain evidence references")
    entries = _ids(entries_list, CATALOGUE_ID, "Catalogue Entry")
    uncertainties = _ids(uncertainty_list, UNCERTAINTY_ID, "uncertainty")
    evidence = _ids(evidence_list, EVIDENCE_ID, "evidence")

    cases_root = root / "cases"
    canonical_root = case_root
    if canonical_root is None and not any(cases_root.glob("BC-*.md")):
        canonical_root = root if any(cases_root.glob("BC-*.json")) else REPOSITORY_ROOT / "verification"
    case_evidence: dict[str, set[str]] = {}
    case_statuses: dict[str, str] = {}
    case_uncertainties: dict[str, set[str]] = {}
    if canonical_root is None:
        case_ids = {path.stem for path in cases_root.glob("BC-*.md")} if cases_root.is_dir() else set()
        for case_id in case_ids:
            _require(bool(CASE_ID.fullmatch(case_id)), f"Behavior Case filename has invalid ID {case_id}")
            case_path = cases_root / f"{case_id}.md"
            case_evidence[case_id] = _validate_behavior_case(case_path)
            source = case_path.read_text(encoding="utf-8")
            status_match = re.search(r"^- Status:\s*(.+)$", source, re.MULTILINE)
            case_statuses[case_id] = status_match.group(1).strip() if status_match is not None else ""
            case_uncertainties[case_id] = set()
    else:
        canonical = validate_verification(canonical_root)["caseById"]
        referenced_case_ids = {
            case_id
            for entry in entries_list
            for case_id in entry.get("behaviorCaseIds", [])
        } | {
            case_id
            for uncertainty in uncertainty_list
            for case_id in uncertainty.get("affectedBehaviorCaseIds", [])
        } | {
            case_id
            for row in coverage.get("domains", [])
            for case_id in row.get("behaviorCaseIds", [])
        } | {
            journey.get("behaviorCaseId")
            for journey in coverage.get("journeys", [])
            if journey.get("behaviorCaseId")
        }
        _require(referenced_case_ids <= canonical.keys(), "Behavior Catalogue references a missing canonical Behavior Case")
        case_ids = referenced_case_ids
        for case_id in case_ids:
            fidelity = canonical[case_id].get("fidelity")
            _require(fidelity is not None, f"Catalogue Behavior Case {case_id} must have fidelity scope")
            case_evidence[case_id] = set(fidelity["evidenceIds"])
            case_statuses[case_id] = canonical[case_id]["status"]
            case_uncertainties[case_id] = set(canonical[case_id]["dependencies"]["uncertaintyIds"])

    trace_hashes: dict[tuple[str, int], str] = {}
    for evidence_id, item in evidence.items():
        _require(item.get("mode") in {"probe", "proof"}, f"Evidence {evidence_id} has an invalid mode")
        _require(bool(SHA256.fullmatch(str(item.get("buildSha256", "")))), f"Evidence {evidence_id} build SHA-256 is invalid")
        hashes = item.get("artifactHashes")
        _require(isinstance(hashes, list) and all(isinstance(value, str) and SHA256.fullmatch(value) for value in hashes), f"Evidence {evidence_id} artifact hashes are invalid")
        _require(item.get("restriction") == "local-restricted", f"Evidence {evidence_id} must remain local-restricted")
        pointer = Path(str(item.get("restrictedPointer", "")))
        _require(not pointer.is_absolute() and ".." not in pointer.parts, f"Evidence {evidence_id} must use an opaque relative pointer")
        trace_key = (item["traceId"], item["traceVersion"])
        prior_hash = trace_hashes.setdefault(trace_key, item["traceSha256"])
        _require(prior_hash == item["traceSha256"], f"Evidence for {trace_key[0]} version {trace_key[1]} has conflicting hashes")

    for case_id, evidence_ids in case_evidence.items():
        _require(evidence_ids <= evidence.keys(), f"Behavior Case {case_id} references unknown evidence")
        if case_statuses[case_id] == "verified":
            _require(not case_uncertainties[case_id], f"Verified Behavior Case {case_id} cannot retain uncertainty links")
            _require(all(evidence[value]["mode"] == "proof" for value in evidence_ids), f"Verified Behavior Case {case_id} cannot rely on probe evidence")

    for uncertainty_id, item in uncertainties.items():
        for field in ("title", "question", "impact", "crackSensitivity", "status"):
            _require(isinstance(item.get(field), str) and bool(item[field]), f"Uncertainty {uncertainty_id} is missing {field}")
        _require(item["status"] in {"open", "resolved"}, f"Uncertainty {uncertainty_id} has an invalid status")
        affected_entries = item.get("affectedEntryIds")
        affected_cases = item.get("affectedBehaviorCaseIds")
        _require(isinstance(affected_entries, list) and all(value in entries for value in affected_entries), f"Uncertainty {uncertainty_id} has an unknown affected entry")
        _require(isinstance(affected_cases, list) and all(value in case_ids for value in affected_cases), f"Uncertainty {uncertainty_id} has an unknown affected Behavior Case")
        attempted = item.get("evidenceAttempted")
        _require(isinstance(attempted, list) and all(value in evidence for value in attempted), f"Uncertainty {uncertainty_id} has unknown attempted evidence")
        if item["status"] == "resolved":
            resolution = item["resolution"]
            resolution_evidence = resolution["evidenceIds"]
            _require(all(value in evidence for value in resolution_evidence), f"Uncertainty {uncertainty_id} resolution references unknown evidence")
            _require(all(evidence[value]["mode"] == "proof" for value in resolution_evidence), f"Uncertainty {uncertainty_id} resolution must use proof evidence")

    for entry_id, item in entries.items():
        _require(isinstance(item.get("version"), int) and item["version"] > 0, f"Catalogue Entry {entry_id} version is invalid")
        _require(item.get("status") in STATUSES, f"Catalogue Entry {entry_id} must be verified or provisional")
        _require(item.get("classification") in CLASSIFICATIONS, f"Catalogue Entry {entry_id} classification is invalid")
        _require(item.get("materiality") in {"material", "non-material"}, f"Catalogue Entry {entry_id} materiality is invalid")
        _require(item.get("crackSensitivity") in {"retail-corroborated", "crack-sensitive", "not-applicable"}, f"Catalogue Entry {entry_id} crack sensitivity is invalid")
        domains = item.get("domains")
        dimensions = item.get("fidelityDimensions")
        _require(isinstance(domains, list) and bool(domains) and set(domains) <= REQUIRED_DOMAINS, f"Catalogue Entry {entry_id} domains are invalid")
        _require(isinstance(dimensions, list) and bool(dimensions) and set(dimensions) <= REQUIRED_DIMENSIONS, f"Catalogue Entry {entry_id} dimensions are invalid")
        evidence_ids = item.get("evidenceIds")
        case_links = item.get("behaviorCaseIds")
        uncertainty_ids = item.get("uncertaintyIds")
        _require(isinstance(evidence_ids, list) and bool(evidence_ids) and all(value in evidence for value in evidence_ids), f"Catalogue Entry {entry_id} has unknown evidence")
        _require(isinstance(case_links, list) and bool(case_links) and all(value in case_ids for value in case_links), f"Catalogue Entry {entry_id} has unknown Behavior Cases")
        _require(isinstance(uncertainty_ids, list) and all(value in uncertainties for value in uncertainty_ids), f"Catalogue Entry {entry_id} has unknown uncertainties")
        if item["status"] == "provisional":
            _require(bool(uncertainty_ids), f"Provisional Catalogue Entry {entry_id} requires a linked uncertainty")
        if item["status"] == "verified":
            _require(not uncertainty_ids, f"Verified Catalogue Entry {entry_id} cannot retain uncertainty links")
            _require(all(evidence[value]["mode"] == "proof" for value in evidence_ids), f"Verified Catalogue Entry {entry_id} cannot rely on probe evidence")

    required_domains = coverage.get("requiredDomains")
    required_dimensions = coverage.get("requiredDimensions")
    _require(isinstance(required_domains, list) and set(required_domains) == REQUIRED_DOMAINS, "Coverage must declare every required catalogue domain")
    _require(isinstance(required_dimensions, list) and set(required_dimensions) == REQUIRED_DIMENSIONS, "Coverage must declare every required fidelity dimension")
    inventory_sources = coverage.get("inventorySources")
    _require(isinstance(inventory_sources, list) and bool(inventory_sources), "Coverage needs at least one inventory source")
    for source in inventory_sources:
        _require(source.get("status") == "closed", f"Inventory source {source.get('id')} is not closed")
        _require(all(value in evidence for value in source.get("evidenceIds", [])), f"Inventory source {source.get('id')} has unknown evidence")
    domain_rows = coverage.get("domains")
    _require(isinstance(domain_rows, list), "Coverage domains must be a list")
    rows = {row.get("domain"): row for row in domain_rows}
    _require(set(rows) == REQUIRED_DOMAINS, "Coverage must contain exactly one row for every required domain")
    for domain, row in rows.items():
        _require(row.get("status") == "complete", f"Coverage domain {domain} is not complete")
        _require(bool(row.get("entryIds")) and all(value in entries for value in row["entryIds"]), f"Coverage domain {domain} has invalid entries")
        _require(bool(row.get("behaviorCaseIds")) and all(value in case_ids for value in row["behaviorCaseIds"]), f"Coverage domain {domain} has invalid Behavior Cases")
        _require(all(value in uncertainties for value in row.get("uncertaintyIds", [])), f"Coverage domain {domain} has invalid uncertainties")
    journeys = coverage.get("journeys")
    _require(isinstance(journeys, list) and bool(journeys), "Coverage requires material journey cases")
    for journey in journeys:
        _require(journey.get("behaviorCaseId") in case_ids, "Coverage journey references an unknown Behavior Case")
        _require(journey.get("kind") == "material-route", "Coverage journey kind must be material-route")
        _require(journey.get("status") in STATUSES, "Coverage journey must be verified or provisional")

    catalogue_subject = {
        "entries": entries_document,
        "uncertainties": uncertainties_document,
        "evidence": evidence_document,
        "coverage": coverage,
    }
    semantic_path = root / "semantic-coverage.json"
    unc_0001 = uncertainties.get("UNC-0001")
    if unc_0001 is not None and unc_0001["status"] == "resolved":
        _require(semantic_path.is_file(), "Resolved UNC-0001 requires semantic-coverage.json")
    semantic_coverage: dict[str, Any] | None = None
    if semantic_path.is_file():
        semantic_coverage = _load_json(semantic_path)
        validate_semantic_coverage(semantic_coverage, catalogue_digest(catalogue_subject), evidence, case_ids)
    documents = dict(catalogue_subject)
    if semantic_coverage is not None:
        documents["semanticCoverage"] = semantic_coverage
    return {
        "documents": documents,
        "caseIds": sorted(case_ids),
        "digest": catalogue_digest(documents),
        "counts": {
            "entries": len(entries),
            "behaviorCases": len(case_ids),
            "uncertainties": len(uncertainties),
            "evidence": len(evidence),
            "domains": len(rows),
            "journeys": len(journeys),
            **(
                {"semanticModes": len(semantic_coverage["modes"]), "semanticObligations": len(semantic_coverage["obligations"])}
                if semantic_coverage is not None
                else {}
            ),
        },
    }


def wilson_interval(successes: int, trials: int, *, z: float = 1.96) -> tuple[float, float]:
    _require(isinstance(successes, int) and isinstance(trials, int) and 0 <= successes <= trials and trials > 0, "Wilson interval needs 0 <= successes <= trials")
    proportion = successes / trials
    denominator = 1 + z * z / trials
    centre = (proportion + z * z / (2 * trials)) / denominator
    margin = z * math.sqrt(proportion * (1 - proportion) / trials + z * z / (4 * trials * trials)) / denominator
    return centre - margin, centre + margin


def review_catalogue(root: Path, domain: str, reviewer: str, decision: str) -> dict[str, Any]:
    verified = validate_catalogue(root)
    _require(domain in REQUIRED_DOMAINS or domain in {"material-journeys", "audiovisual", "saves", "uncertainties"}, f"Cannot review unknown catalogue domain {domain}")
    _require(isinstance(reviewer, str) and bool(reviewer.strip()), "Catalogue reviewer is required")
    _require(decision in {"approved", "rejected"}, "Catalogue review decision must be approved or rejected")
    review = {
        "schemaVersion": 1,
        "catalogueDigest": verified["digest"],
        "subject": domain,
        "reviewer": reviewer,
        "reviewedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "decision": decision,
    }
    path = root / "reviews" / f"{domain}.json"
    _write_json(path, review)
    return {"status": "reviewed", "review": str(path), "decision": decision}


def _review_status(root: Path, digest: str) -> dict[str, Any]:
    required = REQUIRED_DOMAINS | {"material-journeys", "audiovisual", "saves", "uncertainties"}
    approvals: list[dict[str, Any]] = []
    for subject in sorted(required):
        path = root / "reviews" / f"{subject}.json"
        if not path.is_file():
            continue
        review = _load_json(path)
        if review.get("catalogueDigest") == digest and review.get("decision") == "approved":
            approvals.append({key: review[key] for key in ("subject", "reviewer", "reviewedAt", "decision")})
    return {
        "decision": "approved" if len(approvals) == len(required) else "pending",
        "approvedSubjects": approvals,
        "requiredSubjects": sorted(required),
    }


def validate_redacted_summary(summary: dict[str, Any]) -> None:
    allowed = {
        "schemaVersion",
        "qualification",
        "catalogueVersion",
        "catalogueDigest",
        "counts",
        "samplingPolicy",
        "coverage",
        "review",
        "restrictedEvidence",
    }
    unexpected = set(summary) - allowed
    _require(not unexpected, f"Redacted catalogue baseline contains fields that are not allowlisted: {sorted(unexpected)!r}")
    forbidden = {"messageText", "audioBytes", "rawHex", "memory", "runtimeAddress", "screenshot", "wav", "sidEvents", "saveImage"}

    def scan(value: Any) -> None:
        if isinstance(value, dict):
            blocked = forbidden & set(value)
            _require(not blocked, f"Redacted catalogue baseline contains payload fields that are not allowlisted: {sorted(blocked)!r}")
            for nested in value.values():
                scan(nested)
        elif isinstance(value, list):
            for nested in value:
                scan(nested)

    scan(summary)


def summarize_catalogue(root: Path, output: Path) -> dict[str, Any]:
    verified = validate_catalogue(root)
    coverage = verified["documents"]["coverage"]
    summary = {
        "schemaVersion": 1,
        "qualification": "Exact supplied Reference Build; plausibly crack-affected behavior remains provisional pending retail corroboration.",
        "catalogueVersion": CATALOGUE_VERSION,
        "catalogueDigest": verified["digest"],
        "counts": verified["counts"],
        "samplingPolicy": {"deterministicColdStarts": 2, "stochasticMinimumTrials": 100, "interval": "wilson-95"},
        "coverage": {
            "requiredDomains": len(coverage["requiredDomains"]),
            "requiredDimensions": len(coverage["requiredDimensions"]),
            "inventorySourcesClosed": all(item["status"] == "closed" for item in coverage["inventorySources"]),
            "result": "complete",
        },
        "review": _review_status(root, verified["digest"]),
        "restrictedEvidence": {"store": "local-content-addressed", "pointerScheme": "sha256"},
    }
    validate_redacted_summary(summary)
    _write_json(output, summary)
    return {"status": "summarized", "output": str(output), "summary": summary}


def _require_restricted_path(path: Path) -> Path:
    resolved = path.resolve()
    allowed_roots = ((LAB_ROOT / "work").resolve(), (LAB_ROOT.parents[1] / "restricted").resolve())
    _require(any(resolved.is_relative_to(root) for root in allowed_roots), "Catalogue bundles and evidence must remain under ignored work/ or restricted/ storage")
    return resolved


def build_catalogue(source_root: Path, evidence_store: Path, geometry: Path, output: Path) -> dict[str, Any]:
    verified = validate_catalogue(source_root)
    _require(evidence_store.is_dir(), f"Catalogue evidence store does not exist: {evidence_store}")
    output_root = _require_restricted_path(output)
    _require(not output_root.exists(), f"Catalogue output already exists: {output_root}")

    if geometry.is_dir():
        geometry_document = _load_json(geometry / "manifest.json")
    else:
        geometry_document = _load_json(geometry)
    geometry_digest = geometry_document.get("coreDigest")
    _require(isinstance(geometry_digest, str) and bool(SHA256.fullmatch(geometry_digest)), "Geometry input does not expose a valid coreDigest")

    output_root.mkdir(parents=True)
    filenames = ["entries.json", "uncertainties.json", "evidence-index.json", "coverage.json"]
    if (source_root / "semantic-coverage.json").is_file():
        filenames.append("semantic-coverage.json")
    for filename in filenames:
        shutil.copyfile(source_root / filename, output_root / filename)
    if any((source_root / "cases").glob("BC-*.md")):
        shutil.copytree(source_root / "cases", output_root / "cases")
    else:
        (output_root / "cases").mkdir()
        for case_id in verified["caseIds"]:
            shutil.copyfile(REPOSITORY_ROOT / "verification" / "cases" / f"{case_id}.json", output_root / "cases" / f"{case_id}.json")
    cited_hashes = [
        digest
        for item in verified["documents"]["evidence"]["evidence"]
        for digest in item["artifactHashes"]
    ]
    manifest = {
        "schemaVersion": 1,
        "catalogueVersion": CATALOGUE_VERSION,
        "catalogueDigest": verified["digest"],
        "geometryCoreDigest": geometry_digest,
        "counts": verified["counts"],
        "evidenceStore": "local-content-addressed",
        "evidenceStoreDigest": verify_artifact_hashes(evidence_store, cited_hashes),
    }
    _write_json(output_root / "manifest.json", manifest)
    validate_catalogue(output_root)
    return {"status": "built", "catalogue": str(output_root), "manifest": manifest}
def verify_catalogue(root: Path) -> dict[str, Any]:
    verified = validate_catalogue(root)
    manifest_path = root / "manifest.json"
    if manifest_path.is_file():
        manifest = _load_json(manifest_path)
        _require(manifest.get("catalogueDigest") == verified["digest"], "Catalogue manifest digest does not match its documents")
        _require(manifest.get("counts") == verified["counts"], "Catalogue manifest counts do not match its documents")
    return {
        "status": "verified",
        "catalogue": str(root),
        "catalogueDigest": verified["digest"],
        "counts": verified["counts"],
    }


def validate_trace_set(trace_set: dict[str, Any]) -> None:
    _validate_schema(trace_set, "catalogue-trace-set.schema.json")
    _require(trace_set.get("schemaVersion") == 1, "Catalogue trace set schemaVersion must be 1")
    traces = trace_set.get("traces")
    _require(isinstance(traces, list) and bool(traces), "Catalogue trace set must contain traces")
    for index, item in enumerate(traces):
        _require(isinstance(item, dict), f"Catalogue trace set item {index} must be an object")
        _require(isinstance(item.get("path"), str) and bool(item["path"]), f"Catalogue trace set item {index} needs a path")
        kind = item.get("kind")
        _require(kind in {"deterministic", "stochastic"}, f"Catalogue trace set item {index} has an invalid kind")
        repetitions = item.get("repetitions")
        minimum = 2 if kind == "deterministic" else 100
        _require(isinstance(repetitions, int) and repetitions >= minimum, f"Catalogue {kind} trace needs at least {minimum} repetitions")
        if kind == "stochastic":
            outcomes = item.get("legalOutcomes")
            _require(isinstance(outcomes, list) and bool(outcomes) and len(outcomes) == len(set(outcomes)), f"Catalogue stochastic trace {index} needs unique legal outcomes")
            schedule = item.get("schedule")
            _require(isinstance(schedule, dict) and schedule.get("kind") == "stratified-pal", f"Catalogue stochastic trace {index} needs a stratified-pal schedule")
            stratified_pal_targets(period_cycles=schedule.get("periodCycles"), trials=repetitions)
            outcome_source = item.get("outcomeSource")
            _require(outcome_source in {"typed", "artifact-hash"}, f"Catalogue stochastic trace {index} needs a typed or artifact-hash outcome source")
            if outcome_source == "artifact-hash":
                _require(isinstance(item.get("outcomeArtifactRole"), str) and isinstance(item.get("outcomeHashes"), dict), f"Catalogue stochastic trace {index} needs artifact outcome mapping")


def summarize_sample_outcomes(observed: list[str], legal_outcomes: list[str]) -> dict[str, Any]:
    _require(len(observed) >= 100, "Stochastic catalogue samples require at least 100 trials")
    _require(bool(legal_outcomes) and len(legal_outcomes) == len(set(legal_outcomes)), "Stochastic legal outcomes must be unique")
    _require(set(observed) <= set(legal_outcomes), "Stochastic sample produced an outcome outside the decoded legal set")
    counts = {outcome: observed.count(outcome) for outcome in legal_outcomes}
    return {
        "trials": len(observed),
        "outcomes": [
            {
                "outcome": outcome,
                "count": count,
                "wilson95": list(wilson_interval(count, len(observed))),
                "observed": count > 0,
            }
            for outcome, count in counts.items()
        ],
        "missingDecodedOutcomes": [outcome for outcome, count in counts.items() if count == 0],
    }


def normalized_sample_digest(records: list[dict[str, Any]]) -> str:
    ignored_roles = {"effective-config", "timeline", "vice-log"}
    normalized: list[dict[str, Any]] = []
    for record in records:
        artifacts = [
            {"role": item["role"], "size": item.get("size"), "sha256": item["sha256"]}
            for item in record["artifacts"]
            if item["role"] not in ignored_roles and not item["role"].endswith(":snapshot")
        ]
        normalized.append({"branch": record["trace"]["branch"], "artifacts": sorted(artifacts, key=lambda item: item["role"])})
    return catalogue_digest(sorted(normalized, key=lambda item: item["branch"]))


def sample_catalogue(prg: Path, trace_set_path: Path, observation_map_path: Path | None = None) -> dict[str, Any]:
    trace_set = _load_json(trace_set_path)
    validate_trace_set(trace_set)
    reports: list[dict[str, Any]] = []
    for item in trace_set["traces"]:
        trace_path = (trace_set_path.parent / item["path"]).resolve()
        _require(trace_path.is_file(), f"Catalogue sample trace does not exist: {item['path']}")
        if item["kind"] == "stochastic":
            targets = stratified_pal_targets(period_cycles=item["schedule"]["periodCycles"], trials=item["repetitions"])
            runs = [run_catalogue_trace(prg, trace_path, observation_map_path, phase_target=target) for target in targets]
        else:
            runs = [run_catalogue_trace(prg, trace_path, observation_map_path) for _ in range(item["repetitions"])]
        if item["kind"] == "deterministic":
            digests = [normalized_sample_digest(run["evidence"]) for run in runs]
            _require(len(set(digests)) == 1, f"Deterministic catalogue trace {item['path']} did not reproduce")
            reports.append(
                {
                    "trace": item["path"],
                    "kind": "deterministic",
                    "repetitions": len(runs),
                    "result": "equal",
                    "normalizedDigest": digests[0],
                    "evidenceIds": [[record["id"] for record in run["evidence"]] for run in runs],
                }
            )
        else:
            if item["outcomeSource"] == "typed":
                observed = []
                for run in runs:
                    outcomes = run["typedOutcomes"]
                    _require(len(outcomes) == 1, f"Stochastic catalogue trace {item['path']} must produce exactly one typed outcome")
                    observed.append(outcomes[0])
            else:
                role = item.get("outcomeArtifactRole")
                mapping = item.get("outcomeHashes")
                _require(isinstance(role, str) and isinstance(mapping, dict), f"Stochastic catalogue trace {item['path']} needs an outcomeArtifactRole and outcomeHashes")
                observed = []
                for run in runs:
                    matches = [artifact["sha256"] for record in run["evidence"] for artifact in record["artifacts"] if artifact["role"] == role]
                    _require(len(matches) == 1 and matches[0] in mapping, f"Stochastic catalogue trace {item['path']} produced an unclassified outcome artifact")
                    observed.append(mapping[matches[0]])
            actuals = [run["palPhases"][0] for run in runs if len(run["palPhases"]) == 1]
            _require(len(actuals) == len(targets), f"Stochastic catalogue trace {item['path']} did not record one PAL boundary per trial")
            validate_pal_phase_coverage(targets, actuals, period_cycles=item["schedule"]["periodCycles"])
            reports.append({
                "trace": item["path"],
                "kind": "stochastic",
                "phaseCoverage": [{"target": target, "actual": actual} for target, actual in zip(targets, actuals, strict=True)],
                **summarize_sample_outcomes(observed, item["legalOutcomes"]),
            })
    report = {
        "schemaVersion": 1,
        "traceSetSha256": file_hash(trace_set_path),
        "buildSha256": _load_json(LAB_ROOT / "config" / "reference-build.json")["hashes"]["sha256"],
        "reports": reports,
    }
    output_root = WORK_ROOT / f"catalogue-sample-{uuid.uuid4().hex[:8]}"
    output_root.mkdir(parents=True)
    _write_json(output_root / "report.json", report)
    return {"status": "sampled", "report": str(output_root / "report.json"), "summary": report}


def run_catalogue_trace(
    prg: Path,
    trace_path: Path,
    observation_map_path: Path | None = None,
    *,
    phase_target: dict[str, int] | None = None,
) -> dict[str, Any]:
    trace = _load_json(trace_path)
    _, config = load_configuration()
    validate_catalogue_trace(trace, config["cycleLimit"])
    uses_semantics = any(
        action["type"].startswith("semantic_") or action["type"] == "wait_boundary"
        for branch in trace["branches"]
        for action in branch["actions"]
    )
    observation_map: dict[str, Any] | None = None
    if uses_semantics:
        _require(observation_map_path is not None, "Typed catalogue traces require --observation-map")
        restricted_map_path = _require_restricted_path(observation_map_path)
        observation_map = _load_json(restricted_map_path)
        _validate_schema(observation_map, "semantic-observation-map.schema.json")
    source_root, source_manifest = capture(prg, "interactive")
    source_snapshot = source_root / "interactive.vsf"
    vice_binary, toolchain, _ = discover_toolchain(config)
    evidence_store = LAB_ROOT.parents[1] / "restricted" / "behavior-catalogue" / "evidence"
    evidence_store.mkdir(parents=True, exist_ok=True)
    run_root = WORK_ROOT / f"catalogue-{trace['id'].lower()}-{uuid.uuid4().hex[:8]}"
    run_root.mkdir(parents=True)
    snapshot_sources: dict[tuple[str, str], Path] = {}
    evidence_records: list[dict[str, Any]] = []
    typed_outcomes: list[str] = []
    pal_phases: list[dict[str, int]] = []
    trace_sha256 = file_hash(trace_path)

    for branch in trace["branches"]:
        source = branch["from"]
        if "checkpoint" in source:
            branch_snapshot = source_snapshot
        elif "branch" in source:
            branch_snapshot = snapshot_sources[(source["branch"], source["capture"])]
        else:
            pointer = _validate_restricted_pointer(source["evidenceSnapshot"], "Evidence snapshot")
            branch_snapshot = evidence_store / pointer
            _require(branch_snapshot.is_file(), f"Evidence snapshot does not exist: {pointer}")
        outcome_branch = any(action["type"] == "semantic_outcome" for action in branch["actions"])
        record, snapshots, outcome, actual_phase = _run_trace_branch(
            vice_binary=vice_binary,
            toolchain=toolchain.as_dict(),
            config=config,
            build=source_manifest["build"],
            trace=trace,
            trace_sha256=trace_sha256,
            branch=branch,
            source_snapshot=branch_snapshot,
            run_root=run_root,
            evidence_store=evidence_store,
            observation_map=observation_map,
            phase_target=phase_target if outcome_branch else None,
        )
        evidence_records.append(record)
        if outcome is not None:
            typed_outcomes.append(outcome)
        if actual_phase is not None:
            pal_phases.append(actual_phase)
        snapshot_sources.update({(branch["id"], name): path for name, path in snapshots.items()})

    manifest = {
        "schemaVersion": 1,
        "traceId": trace["id"],
        "traceVersion": trace["version"],
        "traceSha256": trace_sha256,
        "sourceRunId": source_manifest["runId"],
        "mode": trace["mode"],
        "evidenceIds": [record["id"] for record in evidence_records],
    }
    _write_json(run_root / "manifest.json", manifest)
    return {"status": "captured", "run": str(run_root), "manifest": manifest, "evidence": evidence_records, "typedOutcomes": typed_outcomes, "palPhases": pal_phases}


def _run_trace_branch(
    *,
    vice_binary: Path,
    toolchain: dict[str, Any],
    config: dict[str, Any],
    build: dict[str, Any],
    trace: dict[str, Any],
    trace_sha256: str,
    branch: dict[str, Any],
    source_snapshot: Path,
    run_root: Path,
    evidence_store: Path,
    observation_map: dict[str, Any] | None,
    phase_target: dict[str, int] | None,
) -> tuple[dict[str, Any], dict[str, Path], str | None, dict[str, int] | None]:
    branch_root = run_root / branch["id"]
    branch_root.mkdir()
    resume_script = branch_root / "resume.mon"
    resume_script.write_text(f'undump "{source_snapshot.resolve()}"\nx\n', encoding="utf-8")
    branch_log = branch_root / "vice.log"
    effective_config = branch_root / "effective.vicerc"
    audio_requested = any(action["type"].startswith("audio_") for action in branch["actions"])
    sid_requested = any(action["type"].startswith("sid_") for action in branch["actions"])
    disk_action = next((action for action in branch["actions"] if action["type"] == "attach_disk"), None)
    disk_path: Path | None = None
    command = [
        str(vice_binary),
        "-default",
        "-model",
        config["machineModel"],
        "-seed",
        str(config["seed"]),
        "-limitcycles",
        str(config["cycleLimit"]),
        "-chdir",
        str(branch_root.resolve()),
        "-dumpconfig",
        str(effective_config.resolve()),
        "-moncommands",
        str(resume_script.resolve()),
        "-binarymonitor",
        "-binarymonitoraddress",
        config["binaryMonitorAddress"],
    ]
    if audio_requested or sid_requested:
        command.extend(("-sound", "+warp", "-speed", "100"))
        if sid_requested:
            command.extend(("-sounddev", "dump", "-soundarg", str((branch_root / "sid-events.log").resolve())))
        if audio_requested:
            command.extend(("-soundrecdev", "wav", "-soundrecarg", str((branch_root / "audio.wav").resolve())))
    else:
        command.extend(("+sound", "-warp"))
    if disk_action is not None:
        _require(branch["actions"][0] is disk_action, f"Catalogue trace branch {branch['id']} must attach D64 media as its first action")
        disk_path = branch_root / "save.d64"
        if disk_action["mode"] == "blank":
            c1541 = vice_binary.with_name("c1541")
            result = subprocess.run(
                [str(c1541), "-format", "CATALOGUE,08", "d64", str(disk_path)],
                check=False,
                capture_output=True,
                text=True,
                timeout=20,
            )
            if result.returncode != 0:
                raise LabError(f"c1541 could not create disposable D64 media: {result.stdout}{result.stderr}")
        else:
            pointer = _validate_restricted_pointer(disk_action.get("pointer"), "Evidence D64")
            source_disk = evidence_store / pointer
            _require(source_disk.is_file(), f"Evidence D64 does not exist: {pointer}")
            shutil.copyfile(source_disk, disk_path)
        access_flag = "-attach8ro" if disk_action.get("access") == "read-only" else "-attach8rw"
        command.extend(("-8", str(disk_path.resolve()), access_flag))

    host, port_text = config["binaryMonitorAddress"].removeprefix("ip4://").split(":", 1)
    process: subprocess.Popen[str] | None = None
    timeline: list[dict[str, Any]] = []
    artifacts: list[dict[str, Any]] = []
    snapshots: dict[str, Path] = {}
    client_instruction_count = 0
    semantic_captures: dict[str, dict[str, int | bool | str]] = {}
    semantic_outcome: str | None = None
    actual_phase: dict[str, int] | None = None
    try:
        with branch_log.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, text=True)
            with MonitorClient.connect(host, int(port_text), timeout=15) as client:
                client.clear_checkpoints()
                if any(action["type"] in {"joystick", "joystick_state"} for action in branch["actions"]):
                    client.configure_joyport_simulation()
                if sid_requested:
                    client.set_resource("SoundDeviceName", "dump")
                    client.set_resource("SoundDeviceArg", str((branch_root / "sid-events.log").resolve()))
                if audio_requested:
                    client.set_resource("SoundRecordDeviceName", "wav")
                    client.set_resource("SoundRecordDeviceArg", str((branch_root / "audio.wav").resolve()))
                if audio_requested or sid_requested:
                    client.set_resource("Sound", "1")
                banks = client.banks()
                _require("ram" in banks and "cpu" in banks, "VICE catalogue trace requires ram and cpu banks")
                if phase_target is not None:
                    advanced, actual_phase = _advance_to_pal_phase(client, phase_target["phaseCycle"])
                    client_instruction_count += advanced
                    timeline.append({"actionIndex": -1, "type": "stratified-pal", "target": phase_target, "actual": actual_phase, "advancedInstructions": advanced, "clientInstructionCount": client_instruction_count})
                for index, action in enumerate(branch["actions"]):
                    action_type = action["type"]
                    advanced = 0
                    if action_type == "wait_pc":
                        checkpoint_number = client.set_execution_checkpoint(action["address"])
                        stopped_pc = client.resume_until_checkpoint(checkpoint_number)
                        _require(stopped_pc == action["address"], f"Catalogue trace wait_pc stopped at ${stopped_pc:04X}, expected ${action['address']:04X}")
                    elif action_type == "wait_boundary":
                        _require(observation_map is not None, "Semantic boundary requires an observation map")
                        address = semantic_boundary_address(observation_map, action["boundary"])
                        checkpoint_number = client.set_execution_checkpoint(address)
                        stopped_pc = client.resume_until_checkpoint(checkpoint_number)
                        _require(stopped_pc == address, f"Catalogue trace wait_boundary stopped at an unexpected execution boundary")
                    elif action_type == "wait_instructions":
                        advanced = _advance(client, action["instructions"])
                    elif action_type == "wait_frames":
                        advanced = _advance_frames(client, action["frames"])
                    elif action_type == "wait_memory":
                        advanced = _wait_memory(client, banks[action["bank"]], action)
                    elif action_type == "key":
                        client.keyboard_feed(action["petscii"])
                    elif action_type == "joystick":
                        client.joyport_set(action["value"])
                        advanced = _advance(client, action["durationInstructions"])
                        client.joyport_set(0)
                    elif action_type == "joystick_state":
                        client.joyport_set(action["value"])
                    elif action_type == "patch_memory":
                        client.set_memory(banks[action["bank"]], action["address"], bytes.fromhex(action["bytesHex"]))
                    elif action_type == "capture":
                        capture_artifacts, capture_snapshots = _capture_trace_artifacts(client, banks, branch_root, branch["id"], action)
                        artifacts.extend(capture_artifacts)
                        snapshots.update(capture_snapshots)
                    elif action_type == "semantic_capture":
                        _require(observation_map is not None, "Semantic capture requires an observation map")
                        observations = _capture_semantic_observations(client, banks, observation_map, action["observationIds"])
                        semantic_captures[action["name"]] = observations
                        path = branch_root / f"{action['name']}-semantic.json"
                        _write_json(path, observations)
                        artifacts.append({"role": f"{branch['id']}:{action['name']}:semantic", "source": path})
                    elif action_type == "semantic_assert":
                        assert_semantic_observations(semantic_captures[action["before"]], semantic_captures[action["after"]], action["assertions"])
                    elif action_type == "semantic_outcome":
                        before = semantic_captures[action["before"]] if "before" in action else {}
                        semantic_outcome = classify_semantic_outcome(before, semantic_captures[action["capture"]], action["outcomes"])
                    elif action_type in {"attach_disk", "detach_disk", "audio_start", "audio_stop", "sid_start", "sid_stop"}:
                        pass
                    client_instruction_count += advanced
                    registers = client.registers()
                    timeline.append(
                        {
                            "actionIndex": index,
                            "type": action_type,
                            "semanticAction": action.get("semanticAction"),
                            "advancedInstructions": advanced,
                            "clientInstructionCount": client_instruction_count,
                            "rasterLine": registers.get("LIN"),
                            "rasterCycle": registers.get("CYC"),
                            "pc": registers.get("PC"),
                        }
                    )
                client.quit()
            return_code = process.wait(timeout=20)
            if return_code != 0:
                raise LabError(f"VICE catalogue branch {branch['id']} exited with status {return_code}")
    except (MonitorProtocolError, OSError, subprocess.TimeoutExpired) as error:
        raise LabError(f"VICE catalogue branch {branch['id']} failed: {error}; incomplete run retained at {branch_root}") from error
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    _write_json(branch_root / "timeline.json", timeline)
    if audio_requested:
        wav_path = branch_root / "audio.wav"
        _require(wav_path.is_file() and wav_path.stat().st_size >= 44 and wav_path.read_bytes()[:4] == b"RIFF", f"Catalogue audio branch {branch['id']} did not finalize a valid WAV")
    if sid_requested:
        _require((branch_root / "sid-events.log").is_file(), f"Catalogue audio branch {branch['id']} did not create a SID event log")
    for role, path in (
        ("timeline", branch_root / "timeline.json"),
        ("effective-config", effective_config),
        ("vice-log", branch_log),
        ("audio-wav", branch_root / "audio.wav"),
        ("sid-events", branch_root / "sid-events.log"),
        ("d64", disk_path),
    ):
        if path is not None and path.is_file():
            artifacts.append({"role": role, "source": path})
    stored: list[dict[str, Any]] = []
    for artifact in artifacts:
        stored_artifact = store_artifact(artifact["source"], evidence_store)
        stored.append({"role": artifact["role"], **stored_artifact})
    record = build_evidence_record(
        authority="running-reference-build",
        build_sha256=build["hashes"]["sha256"],
        trace={"id": trace["id"], "version": trace["version"], "sha256": trace_sha256, "branch": branch["id"]},
        machine={"model": config["machineModel"], "seed": config["seed"], "effectiveConfigSha256": file_hash(effective_config)},
        toolchain=toolchain,
        artifacts=stored,
        decoder_versions=[CATALOGUE_VERSION],
        mode=trace["mode"],
    )
    _write_json(evidence_store / "records" / f"{record['id']}.json", record)
    return record, snapshots, semantic_outcome, actual_phase


def _capture_semantic_observations(
    client: MonitorClient,
    banks: dict[str, int],
    observation_map: dict[str, Any],
    observation_ids: list[str],
) -> dict[str, int | bool | str]:
    definitions = {item["id"]: item for item in observation_map["observations"]}
    _require(all(observation_id in definitions for observation_id in observation_ids), "Semantic capture references an unknown observation")
    selected = [definitions[observation_id] for observation_id in observation_ids]
    memory: dict[str, bytearray] = {}
    for definition in selected:
        bank = definition["bank"]
        _require(bank in banks, f"Semantic observation bank {bank} is unavailable")
        target = memory.setdefault(bank, bytearray(0x10000))
        start = definition["address"]
        end = start + definition["width"] - 1
        target[start : end + 1] = client.memory(banks[bank], start, end)
    return decode_semantic_observations({bank: bytes(value) for bank, value in memory.items()}, {"schemaVersion": 1, "observations": selected})


def _advance_to_pal_phase(client: MonitorClient, target_cycles: int) -> tuple[int, dict[str, int]]:
    _require(isinstance(target_cycles, int) and target_cycles >= 0, "PAL phase target must be non-negative")
    registers = client.registers()
    previous_line, previous_cycle = registers.get("LIN"), registers.get("CYC")
    _require(isinstance(previous_line, int) and isinstance(previous_cycle, int), "VICE does not expose PAL raster position")
    elapsed_cycles = 0
    advanced = 0
    maximum_instructions = max(1_000, target_cycles + 1_000)
    while elapsed_cycles < target_cycles and advanced < maximum_instructions:
        client.advance_instructions(1)
        advanced += 1
        registers = client.registers()
        current_line, current_cycle = registers.get("LIN"), registers.get("CYC")
        _require(isinstance(current_line, int) and isinstance(current_cycle, int), "VICE stopped exposing PAL raster position")
        elapsed_cycles += pal_forward_delta(previous_line, previous_cycle, current_line, current_cycle)
        previous_line, previous_cycle = current_line, current_cycle
    _require(elapsed_cycles >= target_cycles, "VICE could not reach the requested PAL phase within its instruction budget")
    return advanced, {
        "elapsedCycles": elapsed_cycles,
        "rasterLine": previous_line,
        "rasterCycle": previous_cycle,
        "clientInstructions": advanced,
    }


def _advance(client: MonitorClient, instructions: int) -> int:
    remaining = instructions
    while remaining:
        chunk = min(remaining, 0xFFFF)
        client.advance_instructions(chunk)
        remaining -= chunk
    return instructions


def _advance_frames(client: MonitorClient, frames: int) -> int:
    registers = client.registers()
    previous = registers.get("LIN")
    _require(isinstance(previous, int), "VICE does not expose the LIN raster register required for frame waits")
    completed = 0
    instructions = 0
    while completed < frames:
        client.advance_instructions(64)
        instructions += 64
        current = client.registers().get("LIN")
        _require(isinstance(current, int), "VICE stopped exposing the LIN raster register")
        if current < previous:
            completed += 1
        previous = current
    return instructions


def _wait_memory(client: MonitorClient, bank_id: int, action: dict[str, Any]) -> int:
    expected = bytes.fromhex(action["equalsHex"])
    instructions = 0
    while instructions <= action["timeoutInstructions"]:
        actual = client.memory(bank_id, action["address"], action["address"] + len(expected) - 1)
        if actual == expected:
            return instructions
        step = min(64, action["timeoutInstructions"] - instructions)
        if step <= 0:
            break
        client.advance_instructions(step)
        instructions += step
    raise LabError(f"Catalogue memory wait timed out at ${action['address']:04X}")


def _capture_trace_artifacts(
    client: MonitorClient,
    banks: dict[str, int],
    branch_root: Path,
    branch_id: str,
    action: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Path]]:
    name = action["name"]
    artifacts: list[dict[str, Any]] = []
    snapshots: dict[str, Path] = {}
    requested = set(action["artifacts"])
    if "registers" in requested:
        path = branch_root / f"{name}-registers.json"
        _write_json(path, client.registers())
        artifacts.append({"role": f"{branch_id}:{name}:registers", "source": path})
    if "display" in requested:
        path = branch_root / f"{name}.display"
        path.write_bytes(client.display())
        artifacts.append({"role": f"{branch_id}:{name}:display", "source": path})
    if "snapshot" in requested:
        path = branch_root / f"{name}.vsf"
        client.dump_snapshot(path)
        artifacts.append({"role": f"{branch_id}:{name}:snapshot", "source": path})
        snapshots[name] = path
    if "memory" in requested:
        for index, memory_range in enumerate(action["ranges"]):
            path = branch_root / f"{name}-memory-{index}.bin"
            path.write_bytes(client.memory(banks[memory_range["bank"]], memory_range["start"], memory_range["end"]))
            artifacts.append({"role": f"{branch_id}:{name}:memory:{index}", "source": path})
    return artifacts, snapshots
