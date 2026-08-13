"""Decode the enterable-object inventory and its handler-equivalence classes.

This module owns the UNC-0002 side of the enterable boundary. It enumerates the
enterable object slots from the Reference Build's own entry dispatch, reads each
accepted slot's parameter block, and projects that block onto the fields that
affect UNC-0001's mode-neutral responsibilities. The projection is the class key:
two slots share a Handler-Equivalence Class only when their projected blocks are
identical.

It is deliberately separate from ``geometry`` so that behavioural interpretation
never enters the World Geometry Dataset's ``coreDigest``, and separate from
``semantic-coverage.json`` so that UNC-0001's frozen responsibility sets stay
frozen. Every exact decoded value stays in the restricted mapping artifact; the
public manifest carries only counts, class IDs, digests, and the completeness
argument.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .core import OBJECT_SEMANTICS_DECODER_VERSION as DECODER_VERSION
from .core import LabError, file_hash
from .geometry import RESTRICTED_ROOT, WORK_ROOT, canonical_digest, load_geometry_source

# Entry dispatch. The comparison immediately below the dispatch entry bounds the
# enterable slot range; the block table is copied verbatim into the live block.
ENTRY_SLOT_BOUND_SITE = 0x9859
ENTRY_SLOT_BOUND_OPCODE = (0xC9, 0xB0)  # CMP #imm ; BCS reject
BLOCK_TABLE_BASE = 0x9DAD
BLOCK_LENGTH = 16
BLOCK_COPY_ROUTINE = 0x9D99
LIVE_BLOCK_BASE = 0xBEA0
HANDLER_INDIRECT_SITE = 0xA178

# Per-offset disposition of the parameter block against UNC-0001's responsibilities.
# ``key`` offsets are consumed by locomotion action-surface, rate-limit or timing
# code and therefore participate in the class key. ``inert`` offsets are consumed
# nowhere in the dispatched handlers and are excluded from the key.
BLOCK_FIELD_LEDGER: tuple[dict[str, Any], ...] = (
    {"offset": 0, "role": "key", "responsibility": "action-surface", "consumer": "handler-pointer-low"},
    {"offset": 1, "role": "key", "responsibility": "action-surface", "consumer": "handler-pointer-high"},
    {"offset": 2, "role": "key", "responsibility": "rate-limits", "consumer": "primary-axis-rate"},
    {"offset": 3, "role": "key", "responsibility": "rate-limits", "consumer": "primary-axis-rate"},
    {"offset": 4, "role": "key", "responsibility": "rate-limits", "consumer": "secondary-axis-rate"},
    {"offset": 5, "role": "key", "responsibility": "rate-limits", "consumer": "secondary-axis-rate"},
    {"offset": 6, "role": "key", "responsibility": "rate-limits", "consumer": "rotation-rate"},
    {"offset": 7, "role": "key", "responsibility": "rate-limits", "consumer": "translation-bias"},
    {"offset": 8, "role": "key", "responsibility": "rate-limits", "consumer": "auxiliary-rate"},
    {"offset": 9, "role": "key", "responsibility": "action-surface", "consumer": "capability-gate"},
    {"offset": 10, "role": "key", "responsibility": "rate-limits", "consumer": "auxiliary-axis-rate"},
    {"offset": 11, "role": "key", "responsibility": "rate-limits", "consumer": "auxiliary-axis-rate"},
    {"offset": 12, "role": "inert", "responsibility": None, "consumer": None},
    {"offset": 13, "role": "key", "responsibility": "pal-timing", "consumer": "sustain-limit"},
    {"offset": 14, "role": "key", "responsibility": "rate-limits", "consumer": "trim-rate"},
    {"offset": 15, "role": "key", "responsibility": "rate-limits", "consumer": "trim-rate"},
)

COMPLETENESS_ARGUMENT = (
    "The enterable inventory is closed by the Reference Build's own entry dispatch: a single "
    "immediate comparison bounds the accepted slot range and every larger slot index takes the "
    "reject branch before any state is read, so no reachable input can enter an object outside "
    "the enumerated set. Each accepted slot selects one fixed-length parameter block, and the "
    "block is copied verbatim into the live block that the locomotion handler is dispatched "
    "through, so the slot-to-block relation is total and single-valued. The class key is the "
    "projection of that block onto the offsets consumed by action-surface, rate-limit and "
    "PAL-timing code; the single offset consumed by no dispatched handler is excluded as inert. "
    "Because every enumerated slot projects to a distinct key, the partition is currently "
    "singleton: no coarser partition is provable until specific rate magnitudes are shown inert "
    "to UNC-0001's responsibilities. The dispatch handler count records the coarsest partition "
    "that the dispatch structure alone would support."
)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _require_restricted_output(path: Path) -> Path:
    resolved = path.resolve()
    _require(
        resolved.is_relative_to(WORK_ROOT.resolve()) or resolved.is_relative_to(RESTRICTED_ROOT.resolve()),
        f"Exact object semantics output must remain under ignored work/ or restricted/: {path}",
    )
    return resolved


def enterable_slot_bound(ram: bytes) -> int:
    """Read the enterable slot bound from the entry dispatch itself."""
    compare_opcode, reject_opcode = ENTRY_SLOT_BOUND_OPCODE
    _require(
        ram[ENTRY_SLOT_BOUND_SITE] == compare_opcode and ram[ENTRY_SLOT_BOUND_SITE + 2] == reject_opcode,
        "Entry dispatch does not bound the enterable slot range where expected",
    )
    bound = ram[ENTRY_SLOT_BOUND_SITE + 1]
    _require(1 <= bound <= 0x40, "Entry dispatch enterable slot bound is outside the object slot space")
    return bound


def _require_block_dispatch(ram: bytes) -> None:
    """Confirm the block is copied to the live block and dispatched indirectly through it."""
    _require(
        ram[BLOCK_COPY_ROUTINE:BLOCK_COPY_ROUTINE + 4] == bytes((0x0A, 0x0A, 0x0A, 0x0A)),
        "Parameter block selection does not scale the slot index by the block length",
    )
    low, high = LIVE_BLOCK_BASE & 0xFF, LIVE_BLOCK_BASE >> 8
    _require(
        ram[HANDLER_INDIRECT_SITE:HANDLER_INDIRECT_SITE + 3] == bytes((0x6C, low, high)),
        "Locomotion is not dispatched indirectly through the live parameter block",
    )


def decode_enterable_inventory(ram: bytes) -> dict[str, Any]:
    """Decode the enterable inventory, its parameter blocks, and the class partition."""
    _require(len(ram) == 65536, "Object semantics decode requires a 64 KiB physical RAM image")
    _require_block_dispatch(ram)
    bound = enterable_slot_bound(ram)

    key_offsets = tuple(field["offset"] for field in BLOCK_FIELD_LEDGER if field["role"] == "key")
    inert_offsets = tuple(field["offset"] for field in BLOCK_FIELD_LEDGER if field["role"] == "inert")
    _require(
        len(BLOCK_FIELD_LEDGER) == BLOCK_LENGTH and len(key_offsets) + len(inert_offsets) == BLOCK_LENGTH,
        "Parameter block field ledger must dispose of every block offset exactly once",
    )

    members: list[dict[str, Any]] = []
    keys: dict[tuple[int, ...], str] = {}
    handlers: set[int] = set()
    for slot in range(bound):
        start = BLOCK_TABLE_BASE + slot * BLOCK_LENGTH
        block = ram[start:start + BLOCK_LENGTH]
        _require(len(block) == BLOCK_LENGTH, f"Parameter block for slot {slot:02x} is truncated")
        handler = block[0] | block[1] << 8
        handlers.add(handler)
        key = tuple(block[offset] for offset in key_offsets)
        class_id = keys.setdefault(key, f"HEC-{len(keys) + 1:04d}")
        members.append(
            {
                "geometryIdentity": f"object-instance:{slot:02x}",
                "slot": slot,
                "classId": class_id,
                "handlerAddress": handler,
                "parameterBlock": list(block),
                "classKey": list(key),
                "stateFlags": ram[0x29C0 + slot],
                "roomMembership": ram[0x2940 + slot],
            }
        )

    classes = [
        {
            "id": class_id,
            "classKey": list(key),
            "handlerAddress": key[0] | key[1] << 8,
            "memberSlots": [member["slot"] for member in members if member["classId"] == class_id],
        }
        for key, class_id in keys.items()
    ]
    classes.sort(key=lambda item: item["id"])

    mapping = {
        "schemaVersion": 1,
        "decoderVersion": DECODER_VERSION,
        "uncertaintyId": "UNC-0002",
        "restriction": "local-restricted",
        "inventory": {
            "method": "decoded-dispatch-reachability",
            "slotBound": bound,
            "memberCount": len(members),
            "classCount": len(classes),
            "dispatchHandlerCount": len(handlers),
            "blockTableBase": BLOCK_TABLE_BASE,
            "blockLength": BLOCK_LENGTH,
            "liveBlockBase": LIVE_BLOCK_BASE,
        },
        "fieldLedger": [dict(field) for field in BLOCK_FIELD_LEDGER],
        "classKeyOffsets": list(key_offsets),
        "inertOffsets": list(inert_offsets),
        "classes": classes,
        "members": members,
        "completenessArgument": COMPLETENESS_ARGUMENT,
    }
    mapping["contentDigest"] = mapping_content_digest(mapping)
    return mapping


def mapping_content_digest(mapping: dict[str, Any]) -> str:
    """Digest a mapping's decoded content, excluding the capture it was decoded from.

    Two independent decodes of two different interactive captures of the same
    Reference Build must agree on this digest, so it is safe to publish as a
    reproducibility check. The file's own SHA-256 cannot serve that purpose
    because it also covers the source run identifiers.
    """
    subject = {key: value for key, value in mapping.items() if key not in {"contentDigest", "source"}}
    return canonical_digest(subject)


def public_summary(mapping: dict[str, Any]) -> dict[str, Any]:
    """Project a decoded mapping onto the public-safe counts and identifiers."""
    inventory = mapping["inventory"]
    return {
        "classIds": [item["id"] for item in mapping["classes"]],
        "classCount": inventory["classCount"],
        "memberCount": inventory["memberCount"],
        "dispatchHandlerCount": inventory["dispatchHandlerCount"],
        "mappingContentDigest": mapping["contentDigest"],
        "completenessArgument": mapping["completenessArgument"],
    }


def validate_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    """Re-check a decoded mapping's internal consistency and its digest."""
    for field in ("schemaVersion", "decoderVersion", "inventory", "classes", "members", "contentDigest"):
        _require(field in mapping, f"Object semantics mapping is missing {field}")
    _require(mapping["schemaVersion"] == 1, "Object semantics mapping schemaVersion must be 1")
    _require(mapping["uncertaintyId"] == "UNC-0002", "Object semantics mapping must target UNC-0002")
    _require(mapping["restriction"] == "local-restricted", "Object semantics mapping must remain local-restricted")

    inventory = mapping["inventory"]
    members = mapping["members"]
    classes = {item["id"]: item for item in mapping["classes"]}
    _require(len(classes) == len(mapping["classes"]), "Object semantics mapping repeats a class ID")
    _require(inventory["memberCount"] == len(members), "Object semantics mapping member count is inconsistent")
    _require(inventory["classCount"] == len(classes), "Object semantics mapping class count is inconsistent")
    _require(
        inventory["slotBound"] == len(members),
        "Object semantics mapping must enumerate every slot below the decoded bound",
    )
    _require(
        {member["slot"] for member in members} == set(range(inventory["slotBound"])),
        "Object semantics mapping must enumerate a contiguous enterable slot range",
    )
    # The handler address occupies class-key offsets, so distinct handlers always imply
    # distinct classes; only the reported count can drift from the decoded members.
    _require(
        inventory["dispatchHandlerCount"] == len({member["handlerAddress"] for member in members}),
        "Object semantics mapping dispatch handler count is inconsistent",
    )

    key_offsets = mapping["classKeyOffsets"]
    _require(
        sorted(key_offsets + mapping["inertOffsets"]) == list(range(inventory["blockLength"])),
        "Object semantics mapping field ledger must dispose of every block offset exactly once",
    )
    for member in members:
        _require(
            member["geometryIdentity"] == f"object-instance:{member['slot']:02x}",
            f"Object semantics mapping slot {member['slot']} has a mismatched Geometry Identity",
        )
        _require(member["classId"] in classes, f"Object semantics mapping slot {member['slot']} names an unknown class")
        expected = [member["parameterBlock"][offset] for offset in key_offsets]
        _require(
            member["classKey"] == expected,
            f"Object semantics mapping slot {member['slot']} class key does not project its parameter block",
        )
        _require(
            classes[member["classId"]]["classKey"] == member["classKey"],
            f"Object semantics mapping slot {member['slot']} disagrees with its class key",
        )
    for class_id, item in classes.items():
        slots = sorted(member["slot"] for member in members if member["classId"] == class_id)
        _require(sorted(item["memberSlots"]) == slots, f"Object semantics class {class_id} has stale membership")
        _require(bool(slots), f"Object semantics class {class_id} has no members")

    _require(
        mapping_content_digest(mapping) == mapping["contentDigest"],
        "Object semantics mapping content digest does not match its content",
    )
    return {"status": "verified", **public_summary(mapping)}


def decode_object_semantics(run_directory: Path, output: Path) -> dict[str, Any]:
    """Decode an interactive capture into a restricted enterable mapping artifact."""
    resolved = _require_restricted_output(output)
    ram, provenance = load_geometry_source(run_directory)
    mapping = decode_enterable_inventory(ram)
    mapping["source"] = {
        "runId": provenance["runId"],
        "buildSha256": provenance["buildSha256"],
        "ramSha256": provenance["ramSha256"],
    }
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(mapping, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"status": "decoded", "mapping": str(output), **public_summary(mapping)}


# The typed observations that carry the live parameter block, and the byte window of
# the decoded block each one projects. The observation IDs are opaque; the addresses
# behind them live only in the restricted observation map.
LIVE_BLOCK_OBSERVATIONS = (
    ("enterable-block-handler", 0, 2),
    ("enterable-block-rates-low", 2, 8),
    ("enterable-block-rates-high", 10, 6),
)
SLOT_OBSERVATION = "craft-mode-class"
WALKING_OBSERVATION = "walking-mode"


def _little(block: list[int], start: int, length: int) -> int:
    return int.from_bytes(bytes(block[start:start + length]), "little")


def corroborate_observations(mapping: dict[str, Any], observed: dict[str, Any]) -> dict[str, Any]:
    """Check one reached runtime state's typed observations against the decoded mapping.

    The tracked trace deliberately carries no decoded constants, so the tie between the
    decoded slot-to-block relation and what the runtime actually loads is made here,
    against restricted typed observations. Only the class identifier and the match
    verdict are public-safe.
    """
    _require(
        observed.get(WALKING_OBSERVATION) is False,
        "Object semantics corroboration requires a reached enterable state, not a walking state",
    )
    slot = observed.get(SLOT_OBSERVATION)
    _require(
        isinstance(slot, int) and not isinstance(slot, bool),
        "Reached enterable state did not observe an integer enterable selector",
    )
    member = {item["slot"]: item for item in mapping["members"]}.get(slot)
    _require(
        member is not None,
        "Reached enterable state names a slot outside the decoded enterable inventory",
    )
    for observation_id, start, length in LIVE_BLOCK_OBSERVATIONS:
        _require(observation_id in observed, f"Reached enterable state is missing observation {observation_id}")
        _require(
            observed[observation_id] == _little(member["parameterBlock"], start, length),
            f"Live parameter block observation {observation_id} does not match the decoded block "
            f"for class {member['classId']}",
        )
    return {
        "classId": member["classId"],
        "geometryIdentity": member["geometryIdentity"],
        "liveBlockMatchesDecodedBlock": True,
    }


def corroborate_object_semantics(mapping_path: Path, run_directory: Path, output: Path) -> dict[str, Any]:
    """Corroborate a decoded mapping against every enterable state a trace run reached."""
    resolved = _require_restricted_output(output)
    mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    validate_mapping(mapping)
    manifest = json.loads((run_directory / "manifest.json").read_text(encoding="utf-8"))
    store = RESTRICTED_ROOT / "behavior-catalogue" / "evidence"
    corroborations: list[dict[str, Any]] = []
    for evidence_id in manifest["evidenceIds"]:
        record = json.loads((store / "records" / f"{evidence_id}.json").read_text(encoding="utf-8"))
        branch = record["trace"].get("branch")
        _require(bool(branch), f"Evidence {evidence_id} does not name the trace branch it proved")
        semantic = [item for item in record["artifacts"] if str(item["role"]).endswith(":semantic")]
        _require(bool(semantic), f"Evidence {evidence_id} recorded no typed semantic capture")
        for artifact in sorted(semantic, key=lambda item: item["role"]):
            path = store / artifact["path"]
            _require(path.is_file(), f"Evidence store is missing typed capture {artifact['sha256']}")
            observed = json.loads(path.read_text(encoding="utf-8"))
            corroborations.append(
                {
                    "evidenceId": evidence_id,
                    "branchId": branch,
                    "captureRole": artifact["role"],
                    **corroborate_observations(mapping, observed),
                }
            )
    _require(bool(corroborations), "Object semantics corroboration found no typed capture in the run")
    report = {
        "schemaVersion": 1,
        "decoderVersion": DECODER_VERSION,
        "restriction": "local-restricted",
        "mappingContentDigest": mapping["contentDigest"],
        "traceId": manifest["traceId"],
        "traceVersion": manifest["traceVersion"],
        "traceSha256": manifest["traceSha256"],
        "evidenceIds": sorted(manifest["evidenceIds"]),
        "corroborations": corroborations,
    }
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    corroborated = sorted({item["classId"] for item in corroborations})
    return {
        "status": "corroborated",
        "report": str(output),
        "corroboratedClassIds": corroborated,
        "corroboratedClassCount": len(corroborated),
        "mappingContentDigest": mapping["contentDigest"],
    }


def attest_object_semantics(mapping_path: Path, run_directory: Path, report_path: Path) -> dict[str, Any]:
    """Mint the decoded mapping's Evidence record through the catalogue machinery.

    The mapping and its corroboration report become content-addressed artifacts of one
    ``decoded-reference-build`` proof record bound to the trace that corroborated it, so
    the public manifest can cite an Evidence ID and an artifact hash rather than
    restating any decoded value. Imported lazily because the catalogue validator reads
    this module's decoder identity.
    """
    from .catalogue import build_evidence_record, store_artifact

    mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    validate_mapping(mapping)
    report = json.loads(report_path.read_text(encoding="utf-8"))
    _require(
        report.get("mappingContentDigest") == mapping["contentDigest"],
        "Object semantics corroboration report does not target this mapping",
    )

    manifest = json.loads((run_directory / "manifest.json").read_text(encoding="utf-8"))
    _require(
        report.get("traceId") == manifest["traceId"] and report.get("traceSha256") == manifest["traceSha256"],
        "Object semantics corroboration report does not match the cited trace run",
    )
    store = RESTRICTED_ROOT / "behavior-catalogue" / "evidence"
    witness = json.loads((store / "records" / f"{manifest['evidenceIds'][0]}.json").read_text(encoding="utf-8"))

    artifacts = [
        {"role": "object-semantics:mapping", **store_artifact(mapping_path, store)},
        {"role": "object-semantics:corroboration", **store_artifact(report_path, store)},
    ]
    record = build_evidence_record(
        authority="decoded-reference-build",
        build_sha256=witness["buildSha256"],
        trace={"id": manifest["traceId"], "version": manifest["traceVersion"], "sha256": manifest["traceSha256"]},
        machine=witness["machine"],
        toolchain=witness["toolchain"],
        artifacts=artifacts,
        decoder_versions=["catalogue-v1", DECODER_VERSION],
        mode="proof",
    )
    destination = store / "records" / f"{record['id']}.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    index_entry = {
        "id": record["id"],
        "authority": record["authority"],
        "buildSha256": record["buildSha256"],
        "traceId": manifest["traceId"],
        "traceVersion": manifest["traceVersion"],
        "traceSha256": manifest["traceSha256"],
        "decoderVersions": record["decoderVersions"],
        "artifactHashes": sorted(item["sha256"] for item in record["artifacts"]),
        "restriction": "local-restricted",
        "restrictedPointer": f"evidence/records/{record['id']}.json",
        "mode": "proof",
    }
    return {
        "status": "attested",
        "evidenceId": record["id"],
        "mappingArtifactSha256": file_hash(mapping_path),
        "mappingContentDigest": mapping["contentDigest"],
        "indexEntry": index_entry,
    }


def verify_object_semantics(mapping_path: Path) -> dict[str, Any]:
    """Validate a previously decoded restricted mapping artifact."""
    _require_restricted_output(mapping_path)
    try:
        mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LabError(f"Could not read object semantics mapping from {mapping_path}: {error}") from error
    _require(isinstance(mapping, dict), f"Expected a JSON object in {mapping_path}")
    return {**validate_mapping(mapping), "mapping": str(mapping_path)}
