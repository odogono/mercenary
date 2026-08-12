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
    catalogue_digest,
    normalized_sample_digest,
    review_catalogue,
    store_artifact,
    summarize_catalogue,
    validate_catalogue,
    validate_catalogue_trace,
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


if __name__ == "__main__":
    unittest.main()
