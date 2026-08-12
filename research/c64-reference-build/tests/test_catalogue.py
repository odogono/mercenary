from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.catalogue import (
    build_evidence_record,
    catalogue_cycle_limit_arguments,
    catalogue_digest,
    normalized_sample_digest,
    review_catalogue,
    run_catalogue_trace,
    select_catalogue_trace_branches,
    store_artifact,
    summarize_registered_event_history,
    summarize_catalogue,
    validate_catalogue,
    validate_catalogue_trace,
    validate_semantic_coverage,
    validate_redacted_summary,
    validate_trace_set,
    verify_artifact_hashes,
    wilson_interval,
)
from c64lab.core import LabError


DOMAINS = [
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
]

DIMENSIONS = ["audio", "content", "controls", "nondeterminism", "outcome", "saves", "state", "timing", "visuals"]


def _unc_0001_scope() -> dict[str, object]:
    return {
        "uncertaintyId": "UNC-0001",
        "behaviorCaseIds": ["BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"],
        "obligationKinds": [
            "action",
            "conflict",
            "rate-limit",
            "interaction-precondition",
            "interaction-boundary",
            "stochastic-branch",
        ],
    }


def _complete_semantic_coverage() -> tuple[dict[str, object], dict[str, dict[str, str]]]:
    deterministic_ids = ["EV-aaaaaaaaaaaaaaaa", "EV-cccccccccccccccc"]
    stochastic_ids = [f"EV-{index:016x}" for index in range(100, 200)]
    deterministic_rows = [
        ("SO-0001", "Action availability", "action", ["BC-0001", "BC-0002"], "TR-0001"),
        ("SO-0002", "Conflicting input", "conflict", ["BC-0001"], "TR-0001"),
        ("SO-0003", "PAL rate limit", "rate-limit", ["BC-0003"], "TR-0001"),
        ("SO-0004", "Interaction precondition", "interaction-precondition", ["BC-0004"], "TR-0001"),
        ("SO-0005", "Interaction boundary", "interaction-boundary", ["BC-0004"], "TR-0001"),
    ]
    coverage: dict[str, object] = {
        "schemaVersion": 1,
        "catalogueSubjectDigest": "d" * 64,
        "scope": _unc_0001_scope(),
        "modes": [{
            "id": "SM-0001",
            "title": "Surface locomotion",
            "behaviorCaseIds": ["BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"],
            "traceIds": ["TR-0001", "TR-0002"],
            "evidenceIds": deterministic_ids,
            "status": "verified",
        }],
        "obligations": [
            *[
                {
                    "id": row_id,
                    "title": title,
                    "kind": kind,
                    "modeIds": ["SM-0001"],
                    "behaviorCaseIds": cases,
                    "traceIds": [trace_id],
                    "evidenceIds": deterministic_ids,
                    "minimumProofRuns": 2,
                    "completedProofRuns": 2,
                    "status": "verified",
                }
                for row_id, title, kind, cases, trace_id in deterministic_rows
            ],
            {
                "id": "SO-0006",
                "title": "Choose a legal arrival branch",
                "kind": "stochastic-branch",
                "modeIds": ["SM-0001"],
                "behaviorCaseIds": ["BC-0018"],
                "traceIds": ["TR-0002"],
                "evidenceIds": stochastic_ids,
                "minimumProofRuns": 100,
                "completedProofRuns": 100,
                "legalOutcomeIds": ["OUT-a", "OUT-b"],
                "observedOutcomeIds": ["OUT-a", "OUT-b"],
                "status": "verified",
            },
        ],
    }
    evidence = {
        **{evidence_id: {"mode": "proof", "traceId": "TR-0001"} for evidence_id in deterministic_ids},
        **{evidence_id: {"mode": "proof", "traceId": "TR-0002"} for evidence_id in stochastic_ids},
    }
    return coverage, evidence


def _entry(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "id": "CAT-0001",
        "version": 1,
        "status": "verified",
        "title": "Semantic movement input",
        "summary": "Directional input changes the player's heading while movement is available.",
        "kind": "behavior",
        "domains": DOMAINS,
        "fidelityDimensions": DIMENSIONS,
        "classification": "required-behavior",
        "materiality": "material",
        "crackSensitivity": "not-applicable",
        "evidenceIds": ["EV-" + "a" * 16],
        "behaviorCaseIds": ["BC-0001"],
        "geometryIdentities": [],
        "uncertaintyIds": [],
    }
    value.update(overrides)
    return value


def _write_catalogue(root: Path, *, entry: dict[str, object] | None = None, uncertainty: dict[str, object] | None = None) -> None:
    (root / "cases").mkdir(parents=True)
    (root / "cases" / "BC-0001.md").write_text(
        """# BC-0001: Semantic movement input

- Version: 1
- Status: verified
- Classification: required-behavior
- Materiality: material
- Crack sensitivity: not-applicable
- Fidelity dimensions: controls, outcome
- Evidence version: EV-aaaaaaaaaaaaaaaa
- Research Provenance: local restricted evidence pointer

## Initial state

Conditioned interactive checkpoint.

## Semantic actions

Apply directional input.

## Expected observables

Heading changes.

## Acceptance Envelopes

No inferred timing envelope.

## Verification

Run TR-0001 twice.

## Characteristic-feel review

Pending human review.

## Departures

None.
""",
        encoding="utf-8",
    )
    (root / "entries.json").write_text(json.dumps({"schemaVersion": 1, "entries": [entry or _entry()]}), encoding="utf-8")
    (root / "uncertainties.json").write_text(
        json.dumps({"schemaVersion": 1, "uncertainties": [] if uncertainty is None else [uncertainty]}), encoding="utf-8"
    )
    (root / "evidence-index.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "evidence": [
                    {
                        "id": "EV-" + "a" * 16,
                        "authority": "running-reference-build",
                        "buildSha256": "f" * 64,
                        "traceId": "TR-0001",
                        "traceVersion": 1,
                        "traceSha256": "b" * 64,
                        "decoderVersions": ["catalogue-v1"],
                        "artifactHashes": ["c" * 64],
                        "restriction": "local-restricted",
                        "restrictedPointer": "sha256/cc/" + "c" * 64,
                        "mode": "proof",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    (root / "coverage.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "requiredDomains": DOMAINS,
                "requiredDimensions": DIMENSIONS,
                "inventorySources": [
                    {"id": "INV-0001", "kind": "decoded-table", "evidenceIds": ["EV-" + "a" * 16], "status": "closed"}
                ],
                "domains": [
                    {"domain": domain, "entryIds": ["CAT-0001"], "behaviorCaseIds": ["BC-0001"], "uncertaintyIds": [], "status": "complete"}
                    for domain in DOMAINS
                ],
                "journeys": [{"behaviorCaseId": "BC-0001", "kind": "material-route", "status": "verified"}],
            }
        ),
        encoding="utf-8",
    )


class TraceContractTests(unittest.TestCase):
    def test_selects_named_trace_branches_in_canonical_trace_order(self) -> None:
        trace = {
            "branches": [
                {"id": "mask-03", "actions": []},
                {"id": "mask-04", "actions": []},
                {"id": "mask-05", "actions": []},
            ]
        }

        selected = select_catalogue_trace_branches(trace, ["mask-05", "mask-03"])

        self.assertEqual([branch["id"] for branch in selected], ["mask-03", "mask-05"])

    def test_rejects_an_unknown_or_repeated_trace_branch_selection(self) -> None:
        trace = {"branches": [{"id": "mask-03", "actions": []}]}

        with self.assertRaisesRegex(LabError, "unknown catalogue trace branch"):
            select_catalogue_trace_branches(trace, ["mask-04"])
        with self.assertRaisesRegex(LabError, "repeats catalogue trace branch"):
            select_catalogue_trace_branches(trace, ["mask-03", "mask-03"])

    def test_rejects_a_selected_branch_without_its_snapshot_source_branch(self) -> None:
        trace = {
            "branches": [
                {"id": "setup", "from": {"checkpoint": "interactive"}, "actions": []},
                {"id": "action", "from": {"branch": "setup", "capture": "ready"}, "actions": []},
            ]
        }

        with self.assertRaisesRegex(LabError, "requires selected source branch setup"):
            select_catalogue_trace_branches(trace, ["action"])

    def test_keeps_cycle_limit_for_cold_checkpoint_branch(self) -> None:
        self.assertEqual(
            catalogue_cycle_limit_arguments(120_000_000, {"checkpoint": "interactive"}),
            ["-limitcycles", "120000000"],
        )

    def test_omits_absolute_cycle_limit_for_restored_evidence_snapshot(self) -> None:
        self.assertEqual(
            catalogue_cycle_limit_arguments(
                120_000_000,
                {"evidenceSnapshot": "sha256/aa/" + "a" * 64},
            ),
            [],
        )

    def test_accepts_a_bounded_joystick_hold_and_release(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0002",
            "version": 1,
            "title": "Observe held input",
            "mode": "proof",
            "branches": [{
                "id": "held-input",
                "from": {"checkpoint": "interactive"},
                "actions": [
                    {"type": "joystick_state", "port": 2, "value": 8, "semanticAction": "turn-right"},
                    {"type": "wait_boundary", "boundary": "input-sampled"},
                    {"type": "wait_instructions", "instructions": 100},
                    {"type": "semantic_capture", "name": "held", "observationIds": ["direction-lines"]},
                    {"type": "joystick_state", "port": 2, "value": 0},
                ],
            }],
        }

        validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_rejects_a_branch_that_leaves_joystick_input_held(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0002",
            "version": 1,
            "title": "Unbounded held input",
            "mode": "proof",
            "branches": [{
                "id": "held-input",
                "from": {"checkpoint": "interactive"},
                "actions": [
                    {"type": "joystick_state", "port": 2, "value": 8, "semanticAction": "turn-right"},
                    {"type": "wait_frames", "frames": 2},
                ],
            }],
        }

        with self.assertRaisesRegex(LabError, "leaves joystick input held"):
            validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_accepts_typed_semantic_capture_assertion_and_outcome_actions(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0002",
            "version": 1,
            "title": "Typed movement trace",
            "mode": "proof",
            "branches": [
                {
                    "id": "move",
                    "from": {"checkpoint": "interactive"},
                    "actions": [
                        {"type": "semantic_capture", "name": "before", "observationIds": ["mode", "heading"]},
                        {"type": "joystick", "port": 2, "value": 8, "durationInstructions": 100, "semanticAction": "turn-right"},
                        {"type": "semantic_capture", "name": "after", "observationIds": ["mode", "heading"]},
                        {
                            "type": "semantic_assert",
                            "before": "before",
                            "after": "after",
                            "assertions": [
                                {"operator": "unchanged", "observation": "mode"},
                                {"operator": "changed", "observation": "heading"},
                            ],
                        },
                        {
                            "type": "semantic_outcome",
                            "capture": "after",
                            "outcomes": [
                                {"id": "turned", "assertions": [{"operator": "changed", "observation": "heading"}]}
                            ],
                        },
                    ],
                }
            ],
        }

        validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_rejects_a_semantic_assertion_that_references_a_later_capture(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0002",
            "version": 1,
            "title": "Invalid typed trace",
            "mode": "proof",
            "branches": [
                {
                    "id": "move",
                    "from": {"checkpoint": "interactive"},
                    "actions": [
                        {
                            "type": "semantic_assert",
                            "before": "before",
                            "after": "after",
                            "assertions": [{"operator": "changed", "observation": "heading"}],
                        },
                        {"type": "semantic_capture", "name": "before", "observationIds": ["heading"]},
                        {"type": "semantic_capture", "name": "after", "observationIds": ["heading"]},
                    ],
                }
            ],
        }

        with self.assertRaisesRegex(LabError, "earlier semantic capture"):
            validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_accepts_a_stratified_pal_stochastic_trace_set(self) -> None:
        validate_trace_set(
            {
                "schemaVersion": 1,
                "traces": [
                    {
                        "path": "traces/TR-0002-stochastic.json",
                        "kind": "stochastic",
                        "repetitions": 100,
                        "schedule": {"kind": "stratified-pal", "periodCycles": 19656},
                        "outcomeSource": "typed",
                        "legalOutcomes": ["none", "encounter"],
                    }
                ],
            }
        )

    def test_accepts_an_event_history_trace_set_with_branch_proofs(self) -> None:
        validate_trace_set(
            {
                "schemaVersion": 1,
                "traces": [
                    {
                        "path": "traces/TR-0006-event-history.json",
                        "kind": "event-history",
                        "repetitions": 2,
                        "evidenceIds": ["EV-aaaaaaaaaaaaaaaa", "EV-bbbbbbbbbbbbbbbb"],
                        "normalizedDigests": {"allowed": "c" * 64, "denied": "d" * 64},
                    }
                ],
            }
        )

    def test_rejects_event_history_sampling_without_branch_proofs(self) -> None:
        with self.assertRaisesRegex(LabError, "Evidence IDs"):
            validate_trace_set(
                {
                    "schemaVersion": 1,
                    "traces": [
                        {
                            "path": "traces/TR-0006-event-history.json",
                            "kind": "event-history",
                            "repetitions": 2,
                            "normalizedDigests": {"allowed": "c" * 64},
                        }
                    ],
                }
            )

    def test_direct_runner_rejects_an_external_event_history_trace(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0006",
            "version": 1,
            "title": "External physical key proof",
            "mode": "proof",
            "branches": [
                {
                    "id": "allowed",
                    "from": {"checkpoint": "interactive"},
                    "actions": [
                        {
                            "type": "event_history",
                            "inputSetupSha256": "a" * 64,
                            "expectedAssertions": [
                                {"observation": "walking-mode", "operator": "equals", "value": True}
                            ],
                        }
                    ],
                }
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "TR-0006.json"
            trace_path.write_text(json.dumps(trace))
            with self.assertRaisesRegex(LabError, "catalogue sample"):
                run_catalogue_trace(Path(directory) / "reference.prg", trace_path)

    def test_rejects_stochastic_sampling_without_a_phase_schedule(self) -> None:
        with self.assertRaisesRegex(LabError, "stratified-pal"):
            validate_trace_set(
                {
                    "schemaVersion": 1,
                    "traces": [
                        {
                            "path": "traces/TR-0002-stochastic.json",
                            "kind": "stochastic",
                            "repetitions": 100,
                            "outcomeSource": "typed",
                            "legalOutcomes": ["none", "encounter"],
                        }
                    ],
                }
            )

    def test_trace_set_rejects_unallowlisted_fields(self) -> None:
        with self.assertRaisesRegex(LabError, "schema validation"):
            validate_trace_set(
                {
                    "schemaVersion": 1,
                    "traces": [{"path": "traces/TR-0001.json", "kind": "deterministic", "repetitions": 2, "payload": "unsafe"}],
                }
            )

    def test_accepts_a_branching_proof_trace_with_multiple_named_captures(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0001",
            "version": 1,
            "title": "Movement trace",
            "mode": "proof",
            "branches": [
                {
                    "id": "start",
                    "from": {"checkpoint": "interactive"},
                    "actions": [
                        {"type": "capture", "name": "before", "artifacts": ["registers", "display", "snapshot"]},
                        {"type": "joystick", "port": 2, "value": 8, "durationInstructions": 100, "semanticAction": "turn-left"},
                        {"type": "capture", "name": "after", "artifacts": ["registers", "memory"], "ranges": [{"bank": "ram", "start": 0, "end": 31}]},
                    ],
                },
                {
                    "id": "alternate",
                    "from": {"branch": "start", "capture": "before"},
                    "actions": [{"type": "wait_frames", "frames": 2}],
                },
            ],
        }

        validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_accepts_write_protected_evidence_d64_media(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0002",
            "version": 1,
            "title": "Write protected save",
            "mode": "proof",
            "branches": [
                {
                    "id": "disk",
                    "from": {"checkpoint": "interactive"},
                    "actions": [
                        {"type": "attach_disk", "format": "d64", "mode": "evidence", "access": "read-only", "pointer": "sha256/aa/disk.d64"},
                        {"type": "wait_frames", "frames": 1},
                        {"type": "detach_disk"},
                    ],
                }
            ],
        }

        validate_catalogue_trace(trace, cycle_limit=120_000_000)

        trace["branches"][0]["actions"][0]["access"] = "immutable"
        with self.assertRaisesRegex(LabError, "access"):
            validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_rejects_memory_injection_in_a_proof_trace(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0001",
            "version": 1,
            "title": "Invalid proof",
            "mode": "proof",
            "branches": [
                {"id": "start", "from": {"checkpoint": "interactive"}, "actions": [{"type": "patch_memory", "bank": "ram", "address": 1, "bytesHex": "ff"}]}
            ],
        }

        with self.assertRaisesRegex(LabError, "probe mode"):
            validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_rejects_a_branch_that_references_a_later_branch(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0001",
            "version": 1,
            "title": "Cyclic trace",
            "mode": "probe",
            "branches": [
                {"id": "first", "from": {"branch": "second", "capture": "state"}, "actions": [{"type": "wait_frames", "frames": 1}]},
                {"id": "second", "from": {"checkpoint": "interactive"}, "actions": [{"type": "capture", "name": "state", "artifacts": ["snapshot"]}]},
            ],
        }

        with self.assertRaisesRegex(LabError, "earlier branch"):
            validate_catalogue_trace(trace, cycle_limit=120_000_000)

    def test_rejects_a_snapshot_pointer_that_could_inject_monitor_commands(self) -> None:
        trace = {
            "schemaVersion": 1,
            "id": "TR-0001",
            "version": 1,
            "title": "Unsafe snapshot",
            "mode": "proof",
            "branches": [
                {
                    "id": "start",
                    "from": {"evidenceSnapshot": "sha256/aa/state.vsf\nx"},
                    "actions": [{"type": "wait_frames", "frames": 1}],
                }
            ],
        }

        with self.assertRaisesRegex(LabError, "safe restricted pointer"):
            validate_catalogue_trace(trace, cycle_limit=120_000_000)


class EvidenceTests(unittest.TestCase):
    def test_content_addressed_store_deduplicates_identical_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "capture.bin"
            source.write_bytes(b"same evidence")

            first = store_artifact(source, root / "store")
            second = store_artifact(source, root / "store")

            self.assertEqual(first, second)
            self.assertTrue((root / "store" / first["path"]).is_file())

    def test_evidence_identity_is_derived_from_immutable_record_content(self) -> None:
        record = build_evidence_record(
            authority="running-reference-build",
            build_sha256="f" * 64,
            trace={"id": "TR-0001", "version": 1, "sha256": "a" * 64},
            machine={"model": "c64", "seed": 12648430},
            toolchain={"viceVersion": "3.10"},
            artifacts=[{"role": "display", "sha256": "b" * 64, "size": 1, "path": "sha256/bb/" + "b" * 64}],
            decoder_versions=["catalogue-v1"],
            mode="proof",
        )

        self.assertRegex(record["id"], r"^EV-[0-9a-f]{16}$")
        self.assertNotIn("createdAt", record)

    def test_artifact_integrity_requires_every_cited_hash_in_the_store(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            digest = "a" * 64
            with self.assertRaisesRegex(LabError, "missing cited artifact"):
                verify_artifact_hashes(root, [digest])


class CatalogueContractTests(unittest.TestCase):
    def test_resolved_uncertainty_requires_an_answer_and_proof_evidence(self) -> None:
        uncertainty = {
            "id": "UNC-0002",
            "title": "Resolved question",
            "question": "What happens?",
            "affectedEntryIds": ["CAT-0001"],
            "affectedBehaviorCaseIds": ["BC-0001"],
            "evidenceAttempted": ["EV-aaaaaaaaaaaaaaaa"],
            "impact": "material",
            "crackSensitivity": "not-applicable",
            "status": "resolved",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root, uncertainty=uncertainty)

            with self.assertRaisesRegex(LabError, "schema validation"):
                validate_catalogue(root)

            uncertainty["resolution"] = {
                "answer": "The evidence-backed transition is exact.",
                "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"],
            }
            (root / "uncertainties.json").write_text(
                json.dumps({"schemaVersion": 1, "uncertainties": [uncertainty]}), encoding="utf-8"
            )
            validate_catalogue(root)

    def test_open_uncertainty_requires_a_next_experiment_and_forbids_resolution(self) -> None:
        uncertainty = {
            "id": "UNC-0002",
            "title": "Open question",
            "question": "What happens?",
            "affectedEntryIds": ["CAT-0001"],
            "affectedBehaviorCaseIds": ["BC-0001"],
            "evidenceAttempted": ["EV-aaaaaaaaaaaaaaaa"],
            "impact": "material",
            "crackSensitivity": "not-applicable",
            "status": "open",
            "resolution": {"answer": "Premature", "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"]},
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root, uncertainty=uncertainty)

            with self.assertRaisesRegex(LabError, "schema validation"):
                validate_catalogue(root)

    def test_resolving_unc_0001_requires_semantic_coverage(self) -> None:
        uncertainty = {
            "id": "UNC-0001",
            "title": "Movement semantics",
            "question": "What are the exact rules?",
            "affectedEntryIds": ["CAT-0001"],
            "affectedBehaviorCaseIds": ["BC-0001"],
            "evidenceAttempted": ["EV-aaaaaaaaaaaaaaaa"],
            "impact": "material",
            "crackSensitivity": "not-applicable",
            "status": "resolved",
            "resolution": {"answer": "Exact evidence-backed rules.", "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"]},
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root, uncertainty=uncertainty)

            with self.assertRaisesRegex(LabError, "semantic-coverage"):
                validate_catalogue(root)

    def test_catalogue_can_resolve_canonical_root_json_behavior_cases(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "catalogue"
            verification_root = Path(directory) / "verification"
            _write_catalogue(root)
            (root / "cases" / "BC-0001.md").unlink()
            (root / "cases").rmdir()
            case = {
                "schemaVersion": 1,
                "id": "BC-0001",
                "version": 1,
                "title": "Semantic movement input",
                "status": "verified",
                "aliases": [],
                "claimScopes": ["fidelity"],
                "verificationArea": "semantics",
                "executionTiers": ["release-candidate"],
                "dependencies": {"caseIds": [], "uncertaintyIds": [], "evidenceIds": ["EV-" + "a" * 16]},
                "applicability": {"candidateKinds": ["official"]},
                "initialState": "Conditioned interactive checkpoint.",
                "actions": "Apply directional input.",
                "expectedObservables": "Heading changes.",
                "acceptanceEnvelopes": "No inferred timing envelope.",
                "verification": {"method": "Run TR-0001 twice.", "oracleDiagnosticRequired": False},
                "reviewRequired": True,
                "fidelity": {
                    "classification": "required-behavior",
                    "materiality": "material",
                    "crackSensitivity": "not-applicable",
                    "dimensions": ["controls", "outcome"],
                    "evidenceIds": ["EV-" + "a" * 16],
                    "researchProvenance": "Local restricted evidence pointer.",
                    "departureIds": [],
                },
            }
            (verification_root / "cases").mkdir(parents=True)
            (verification_root / "cases" / "BC-0001.json").write_text(json.dumps(case), encoding="utf-8")

            verified = validate_catalogue(root, case_root=verification_root)

            self.assertEqual(verified["counts"]["behaviorCases"], 1)

    def test_accepts_a_closed_cross_referenced_catalogue(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root)

            verified = validate_catalogue(root)

            self.assertEqual(verified["counts"]["entries"], 1)
            self.assertEqual(verified["counts"]["domains"], len(DOMAINS))

    def test_rejects_a_behavior_case_that_does_not_follow_the_normative_template(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root)
            (root / "cases" / "BC-0001.md").write_text("# BC-0001: Incomplete\n", encoding="utf-8")

            with self.assertRaisesRegex(LabError, "missing Version"):
                validate_catalogue(root)

    def test_rejects_domain_encoded_or_duplicate_catalogue_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bad = _entry(id="VEHICLE-0001")
            _write_catalogue(root, entry=bad)

            with self.assertRaisesRegex(LabError, "CAT-0001"):
                validate_catalogue(root)

    def test_provisional_entries_require_a_linked_first_class_uncertainty(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root, entry=_entry(status="provisional"))

            with self.assertRaisesRegex(LabError, "linked uncertainty"):
                validate_catalogue(root)

    def test_probe_evidence_cannot_verify_an_entry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root)
            evidence = json.loads((root / "evidence-index.json").read_text(encoding="utf-8"))
            evidence["evidence"][0]["mode"] = "probe"
            (root / "evidence-index.json").write_text(json.dumps(evidence), encoding="utf-8")

            with self.assertRaisesRegex(LabError, "probe evidence"):
                validate_catalogue(root)

    def test_verified_entries_cannot_retain_uncertainty_links(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            uncertainty = {
                "id": "UNC-0001",
                "title": "Pending semantics",
                "question": "What happens?",
                "affectedEntryIds": ["CAT-0001"],
                "affectedBehaviorCaseIds": ["BC-0001"],
                "evidenceAttempted": ["EV-" + "a" * 16],
                "impact": "material",
                "crackSensitivity": "not-applicable",
                "nextExperiment": "Run a proof trace.",
                "status": "open",
            }
            _write_catalogue(root, entry=_entry(uncertaintyIds=["UNC-0001"]), uncertainty=uncertainty)

            with self.assertRaisesRegex(LabError, "cannot retain uncertainty"):
                validate_catalogue(root)

    def test_rejects_conflicting_hashes_for_one_trace_version(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root)
            evidence = json.loads((root / "evidence-index.json").read_text(encoding="utf-8"))
            conflicting = dict(evidence["evidence"][0])
            conflicting["id"] = "EV-" + "b" * 16
            conflicting["traceSha256"] = "d" * 64
            evidence["evidence"].append(conflicting)
            (root / "evidence-index.json").write_text(json.dumps(evidence), encoding="utf-8")

            with self.assertRaisesRegex(LabError, "conflicting hashes"):
                validate_catalogue(root)

    def test_rejects_expression_bearing_fields_in_a_tracked_entry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root, entry=_entry(messageText="restricted wording"))

            with self.assertRaisesRegex(LabError, "schema validation"):
                validate_catalogue(root)

    def test_rejects_an_absolute_restricted_evidence_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root)
            evidence = json.loads((root / "evidence-index.json").read_text(encoding="utf-8"))
            evidence["evidence"][0]["restrictedPointer"] = "/tmp/raw.ram"
            (root / "evidence-index.json").write_text(json.dumps(evidence), encoding="utf-8")

            with self.assertRaisesRegex(LabError, "opaque relative pointer"):
                validate_catalogue(root)

    def test_digest_is_independent_of_document_key_order(self) -> None:
        first = {"entries": [{"id": "CAT-0001", "title": "One"}], "coverage": {"status": "complete"}}
        second = {"coverage": {"status": "complete"}, "entries": [{"title": "One", "id": "CAT-0001"}]}
        self.assertEqual(catalogue_digest(first), catalogue_digest(second))


class SamplingAndReviewTests(unittest.TestCase):
    def test_deterministic_sample_digest_ignores_logs_but_keeps_observables(self) -> None:
        first = [{"trace": {"branch": "a"}, "artifacts": [{"role": "vice-log", "sha256": "a" * 64}, {"role": "a:state:display", "sha256": "b" * 64}]}]
        second = [{"trace": {"branch": "a"}, "artifacts": [{"role": "vice-log", "sha256": "c" * 64}, {"role": "a:state:display", "sha256": "b" * 64}]}]
        self.assertEqual(normalized_sample_digest(first), normalized_sample_digest(second))

    def test_event_history_summary_binds_every_branch_to_matching_proof_evidence(self) -> None:
        trace = {
            "id": "TR-0006",
            "version": 1,
            "branches": [{"id": "allowed"}, {"id": "denied"}],
        }
        item = {
            "path": "traces/TR-0006-event-history.json",
            "kind": "event-history",
            "repetitions": 2,
            "evidenceIds": ["EV-aaaaaaaaaaaaaaaa", "EV-bbbbbbbbbbbbbbbb"],
            "normalizedDigests": {"allowed": "c" * 64, "denied": "d" * 64},
        }
        evidence = {
            "EV-aaaaaaaaaaaaaaaa": {
                "id": "EV-aaaaaaaaaaaaaaaa",
                "traceId": "TR-0006",
                "traceVersion": 1,
                "traceSha256": "e" * 64,
                "branchId": "allowed",
                "mode": "proof",
            },
            "EV-bbbbbbbbbbbbbbbb": {
                "id": "EV-bbbbbbbbbbbbbbbb",
                "traceId": "TR-0006",
                "traceVersion": 1,
                "traceSha256": "e" * 64,
                "branchId": "denied",
                "mode": "proof",
            },
        }

        summary = summarize_registered_event_history(trace, "e" * 64, item, evidence)

        self.assertEqual(summary["result"], "verified")
        self.assertEqual([branch["branch"] for branch in summary["branches"]], ["allowed", "denied"])

    def test_event_history_summary_rejects_trace_hash_drift(self) -> None:
        trace = {"id": "TR-0006", "version": 1, "branches": [{"id": "allowed"}]}
        item = {
            "path": "traces/TR-0006-event-history.json",
            "kind": "event-history",
            "repetitions": 2,
            "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"],
            "normalizedDigests": {"allowed": "c" * 64},
        }
        evidence = {
            "EV-aaaaaaaaaaaaaaaa": {
                "id": "EV-aaaaaaaaaaaaaaaa",
                "traceId": "TR-0006",
                "traceVersion": 1,
                "traceSha256": "f" * 64,
                "branchId": "allowed",
                "mode": "proof",
            }
        }

        with self.assertRaisesRegex(LabError, "trace hash"):
            summarize_registered_event_history(trace, "e" * 64, item, evidence)

    def test_wilson_interval_bounds_a_half_success_rate(self) -> None:
        low, high = wilson_interval(50, 100)
        self.assertAlmostEqual(low, 0.4038, places=4)
        self.assertAlmostEqual(high, 0.5962, places=4)

    def test_domain_review_rejects_an_unknown_domain(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root)
            with self.assertRaisesRegex(LabError, "unknown catalogue domain"):
                review_catalogue(root, "not-a-domain", "maintainer", "approved")

    def test_summary_reports_pending_reviews_without_payload_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write_catalogue(root)
            output = root / "baseline.json"

            summary = summarize_catalogue(root, output)["summary"]

            self.assertEqual(summary["review"]["decision"], "pending")
            self.assertEqual(summary["counts"]["entries"], 1)
            self.assertTrue(output.is_file())

    def test_redacted_summary_rejects_expression_bearing_payloads(self) -> None:
        with self.assertRaisesRegex(LabError, "not allowlisted"):
            validate_redacted_summary({"schemaVersion": 1, "messageText": "restricted wording"})


class SemanticCoverageTests(unittest.TestCase):
    def test_accepts_complete_proof_only_semantic_coverage(self) -> None:
        coverage, evidence = _complete_semantic_coverage()

        validate_semantic_coverage(coverage, "d" * 64, evidence, {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"})

    def test_rejects_semantic_coverage_that_names_an_unregistered_trace(self) -> None:
        coverage, evidence = _complete_semantic_coverage()

        with self.assertRaisesRegex(LabError, "unregistered proof trace.*TR-0002"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                evidence,
                {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"},
                trace_proofs={"TR-0001": {"mode": "proof", "kind": "deterministic", "repetitions": 2}},
            )

    def test_rejects_semantic_coverage_backed_by_a_probe_trace(self) -> None:
        coverage, evidence = _complete_semantic_coverage()

        with self.assertRaisesRegex(LabError, "TR-0001 must be a proof trace"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                evidence,
                {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"},
                trace_proofs={
                    "TR-0001": {"mode": "probe", "kind": "deterministic", "repetitions": 2},
                    "TR-0002": {"mode": "proof", "kind": "stochastic", "repetitions": 100},
                },
            )

    def test_rejects_stochastic_coverage_without_a_typed_stratified_trace(self) -> None:
        coverage, evidence = _complete_semantic_coverage()

        with self.assertRaisesRegex(LabError, "SO-0006 requires typed stratified-pal stochastic traces"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                evidence,
                {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"},
                trace_proofs={
                    "TR-0001": {"mode": "proof", "kind": "deterministic", "repetitions": 2},
                    "TR-0002": {
                        "mode": "proof",
                        "kind": "stochastic",
                        "repetitions": 100,
                        "scheduleKind": "stratified-pal",
                        "outcomeSource": "artifact-hash",
                    },
                },
            )

    def test_rejects_semantic_evidence_for_a_different_registered_trace_version(self) -> None:
        coverage, evidence = _complete_semantic_coverage()
        for record in evidence.values():
            record["traceVersion"] = 1  # type: ignore[assignment]
            record["traceSha256"] = "a" * 64
        evidence["EV-aaaaaaaaaaaaaaaa"]["traceVersion"] = 2  # type: ignore[index]

        with self.assertRaisesRegex(LabError, "evidence does not match registered trace version"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                evidence,
                {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"},
                trace_proofs={
                    "TR-0001": {
                        "mode": "proof", "kind": "deterministic", "repetitions": 2,
                        "version": 1, "sha256": "a" * 64,
                    },
                    "TR-0002": {
                        "mode": "proof", "kind": "stochastic", "repetitions": 100,
                        "scheduleKind": "stratified-pal", "outcomeSource": "typed",
                        "version": 1, "sha256": "a" * 64,
                    },
                },
            )

    def test_rejects_an_uncovered_unc_0001_behavior_case(self) -> None:
        coverage, evidence = _complete_semantic_coverage()
        coverage["modes"][0]["behaviorCaseIds"].remove("BC-0003")  # type: ignore[index]
        coverage["obligations"] = [  # type: ignore[index]
            row for row in coverage["obligations"] if row["kind"] != "rate-limit"  # type: ignore[index]
        ]

        with self.assertRaisesRegex(LabError, "does not cover Behavior Cases.*BC-0003"):
            validate_semantic_coverage(
                coverage, "d" * 64, evidence, {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"}
            )

    def test_rejects_a_missing_unc_0001_obligation_kind(self) -> None:
        coverage, evidence = _complete_semantic_coverage()
        coverage["obligations"] = [  # type: ignore[index]
            row for row in coverage["obligations"] if row["kind"] != "conflict"  # type: ignore[index]
        ]

        with self.assertRaisesRegex(LabError, "does not cover obligation kinds.*conflict"):
            validate_semantic_coverage(
                coverage, "d" * 64, evidence, {"BC-0001", "BC-0002", "BC-0003", "BC-0004", "BC-0018"}
            )

    def test_rejects_self_reported_runs_without_distinct_proof_evidence(self) -> None:
        coverage = {
            "schemaVersion": 1,
            "catalogueSubjectDigest": "d" * 64,
            "scope": _unc_0001_scope(),
            "modes": [{
                "id": "SM-0001", "title": "Surface locomotion", "behaviorCaseIds": ["BC-0001"],
                "traceIds": ["TR-0001"], "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"], "status": "verified",
            }],
            "obligations": [{
                "id": "SO-0001", "title": "Turn", "kind": "action", "modeIds": ["SM-0001"],
                "behaviorCaseIds": ["BC-0001"], "traceIds": ["TR-0001"],
                "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"], "minimumProofRuns": 2,
                "completedProofRuns": 2, "status": "verified",
            }],
        }

        with self.assertRaisesRegex(LabError, "distinct proof evidence"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                {"EV-aaaaaaaaaaaaaaaa": {"mode": "proof", "traceId": "TR-0001"}},
                {"BC-0001"},
            )

    def test_rejects_incomplete_stochastic_trial_counts(self) -> None:
        coverage = {
            "schemaVersion": 1,
            "catalogueSubjectDigest": "d" * 64,
            "scope": _unc_0001_scope(),
            "modes": [
                {
                    "id": "SM-0001",
                    "title": "Surface locomotion",
                    "behaviorCaseIds": ["BC-0018"],
                    "traceIds": ["TR-0002"],
                    "evidenceIds": ["EV-bbbbbbbbbbbbbbbb"],
                    "status": "verified",
                }
            ],
            "obligations": [
                {
                    "id": "SO-0001",
                    "title": "Choose a legal arrival branch",
                    "kind": "stochastic-branch",
                    "modeIds": ["SM-0001"],
                    "behaviorCaseIds": ["BC-0018"],
                    "traceIds": ["TR-0002"],
                    "evidenceIds": ["EV-bbbbbbbbbbbbbbbb"],
                    "minimumProofRuns": 100,
                    "completedProofRuns": 99,
                    "legalOutcomeIds": ["OUT-a"],
                    "observedOutcomeIds": ["OUT-a"],
                    "status": "verified",
                }
            ],
        }

        with self.assertRaisesRegex(LabError, "proof runs"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                {"EV-bbbbbbbbbbbbbbbb": {"mode": "proof", "traceId": "TR-0002"}},
                {"BC-0018"},
            )

    def test_rejects_probe_evidence_for_a_verified_mode(self) -> None:
        coverage = {
            "schemaVersion": 1,
            "catalogueSubjectDigest": "d" * 64,
            "scope": _unc_0001_scope(),
            "modes": [
                {
                    "id": "SM-0001",
                    "title": "Surface locomotion",
                    "behaviorCaseIds": ["BC-0001"],
                    "traceIds": ["TR-0001"],
                    "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"],
                    "status": "verified",
                }
            ],
            "obligations": [
                {
                    "id": "SO-0001",
                    "title": "Turn while on the surface",
                    "kind": "action",
                    "modeIds": ["SM-0001"],
                    "behaviorCaseIds": ["BC-0001"],
                    "traceIds": ["TR-0001"],
                    "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"],
                    "minimumProofRuns": 2,
                    "completedProofRuns": 2,
                    "status": "verified",
                }
            ],
        }

        with self.assertRaisesRegex(LabError, "proof evidence"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                {"EV-aaaaaaaaaaaaaaaa": {"mode": "probe", "traceId": "TR-0001"}},
                {"BC-0001"},
            )

    def test_rejects_a_stochastic_branch_with_an_unobserved_legal_outcome(self) -> None:
        coverage = {
            "schemaVersion": 1,
            "catalogueSubjectDigest": "d" * 64,
            "scope": _unc_0001_scope(),
            "modes": [{
                "id": "SM-0001", "title": "Surface locomotion", "behaviorCaseIds": ["BC-0018"],
                "traceIds": ["TR-0002"], "evidenceIds": ["EV-bbbbbbbbbbbbbbbb"], "status": "verified",
            }],
            "obligations": [{
                "id": "SO-0001", "title": "Choose a legal arrival branch", "kind": "stochastic-branch",
                "modeIds": ["SM-0001"], "behaviorCaseIds": ["BC-0018"], "traceIds": ["TR-0002"],
                "evidenceIds": ["EV-bbbbbbbbbbbbbbbb"], "minimumProofRuns": 100, "completedProofRuns": 100,
                "legalOutcomeIds": ["OUT-a", "OUT-b"], "observedOutcomeIds": ["OUT-a"], "status": "verified",
            }],
        }

        with self.assertRaisesRegex(LabError, "unobserved legal outcomes"):
            validate_semantic_coverage(
                coverage,
                "d" * 64,
                {"EV-bbbbbbbbbbbbbbbb": {"mode": "proof", "traceId": "TR-0002"}},
                {"BC-0018"},
            )


if __name__ == "__main__":
    unittest.main()
