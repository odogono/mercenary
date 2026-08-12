from __future__ import annotations

import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.cli import main
from c64lab.verification import (
    aggregate_verification,
    canonical_digest,
    case_graph_digest,
    render_report,
    result_fingerprint,
    validate_verification,
)


SHA_A = "a" * 64
SHA_B = "b" * 64
SHA_C = "c" * 64
SHA_D = "d" * 64
SHA_E = "e" * 64


def _write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _case(case_id: str = "BC-0001", **overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "schemaVersion": 1,
        "id": case_id,
        "version": 1,
        "title": "Movement remains deterministic",
        "status": "verified",
        "aliases": [],
        "claimScopes": ["fidelity", "release-readiness"],
        "verificationArea": "semantics",
        "executionTiers": ["public-ci", "release-candidate"],
        "dependencies": {"caseIds": [], "uncertaintyIds": [], "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"]},
        "applicability": {"candidateKinds": ["official"]},
        "initialState": "A fresh deterministic session.",
        "actions": "Apply a fixed sequence of Semantic Actions.",
        "expectedObservables": "Committed state and outcomes are exact.",
        "acceptanceEnvelopes": "Exact semantic equality.",
        "verification": {"method": "deterministic trace", "oracleDiagnosticRequired": False},
        "reviewRequired": False,
        "fidelity": {
            "classification": "required-behavior",
            "materiality": "material",
            "crackSensitivity": "not-applicable",
            "dimensions": ["state", "outcome"],
            "evidenceIds": ["EV-aaaaaaaaaaaaaaaa"],
            "researchProvenance": "Public-safe evidence reference.",
            "departureIds": [],
        },
    }
    value.update(overrides)
    return value


def _plan(cases: list[dict[str, object]], **overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "schemaVersion": 1,
        "id": "VP-0001",
        "version": 1,
        "tier": "release-candidate",
        "candidate": {
            "kind": "official",
            "appBuildDigest": SHA_A,
            "contentSetDigest": SHA_B,
            "advertisedMacOSMajors": [14, 15, 26],
        },
        "caseGraphDigest": case_graph_digest(cases),
        "evidenceDigest": SHA_C,
        "protocolDigest": SHA_D,
        "toolDigest": SHA_E,
        "environmentDigest": SHA_A,
        "referenceMac": {"name": "reference-mac", "metadataDigest": SHA_A},
    }
    value.update(overrides)
    return value


def _result(case: dict[str, object], plan: dict[str, object], outcome: str = "pass", **overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "schemaVersion": 1,
        "id": f"VR-{case['id'][3:]}",
        "caseId": case["id"],
        "caseVersion": case["version"],
        "runId": "RUN-0001",
        "outcome": outcome,
        "dependencyFingerprint": result_fingerprint(case, plan),
        "approvalIds": [],
        "diagnostics": [],
        "evidenceManifestId": "VM-0001",
    }
    value.update(overrides)
    return value


def _manifest(*, available: bool = True, lane: str = "restricted") -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "id": "VM-0001",
        "runId": "RUN-0001",
        "planId": "VP-0001",
        "lane": lane,
        "startedAt": "2026-08-12T12:00:00Z",
        "completedAt": "2026-08-12T12:01:00Z",
        "planDigest": SHA_A,
        "environment": {"name": "reference-mac", "metadataDigest": SHA_A},
        "toolVersions": ["verification-v1"],
        "restrictedEvidenceIds": ["EV-aaaaaaaaaaaaaaaa"] if lane == "restricted" else [],
        "evidenceAvailable": available,
        "resultIds": ["VR-0001"],
    }


class VerificationSchemaTests(unittest.TestCase):
    def test_release_only_case_rejects_fidelity_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = _case(claimScopes=["release-readiness"])
            _write(root / "cases" / "BC-0001.json", case)

            with self.assertRaisesRegex(LabError, "must not define fidelity"):
                validate_verification(root)

    def test_fidelity_case_requires_fidelity_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = _case()
            case.pop("fidelity")
            _write(root / "cases" / "BC-0001.json", case)

            with self.assertRaisesRegex(LabError, "requires fidelity"):
                validate_verification(root)

    def test_rejects_unknown_fields_and_malformed_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = _case(case_id="case-one", surprise=True)
            _write(root / "cases" / "case-one.json", case)

            with self.assertRaisesRegex(LabError, "schema validation"):
                validate_verification(root)

    def test_rejects_missing_dependencies_and_cycles(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = _case("BC-0001", dependencies={"caseIds": ["BC-0002"], "uncertaintyIds": [], "evidenceIds": []})
            second = _case("BC-0002", dependencies={"caseIds": ["BC-0001"], "uncertaintyIds": [], "evidenceIds": []})
            _write(root / "cases" / "BC-0001.json", first)
            _write(root / "cases" / "BC-0002.json", second)

            with self.assertRaisesRegex(LabError, "cycle"):
                validate_verification(root)

    def test_restricted_manifest_rejects_paths_and_raw_artifact_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _write(root / "cases" / "BC-0001.json", _case())
            manifest = _manifest()
            manifest["restrictedPath"] = "/private/reference.prg"
            _write(root / "runs" / "VM-0001.json", manifest)

            with self.assertRaisesRegex(LabError, "schema validation|unsafe restricted"):
                validate_verification(root)

    def test_rejects_result_manifest_lineage_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = _case()
            plan = _plan([case])
            result = _result(case, plan)
            manifest = _manifest()
            manifest["runId"] = "RUN-0002"
            _write(root / "cases" / "BC-0001.json", case)
            _write(root / "results" / "VR-0001.json", result)
            _write(root / "runs" / "VM-0001.json", manifest)

            with self.assertRaisesRegex(LabError, "run lineage"):
                validate_verification(root)


class VerificationAggregationTests(unittest.TestCase):
    def _repository(
        self,
        root: Path,
        cases: list[dict[str, object]],
        plan: dict[str, object],
        results: list[dict[str, object]],
        *,
        manifest: dict[str, object] | None = None,
        approvals: list[dict[str, object]] | None = None,
        departures: list[dict[str, object]] | None = None,
    ) -> None:
        for case in cases:
            _write(root / "cases" / f"{case['id']}.json", case)
        _write(root / "plans" / "VP-0001.json", plan)
        for result in results:
            _write(root / "results" / f"{result['id']}.json", result)
        run_manifest = dict(manifest or _manifest())
        run_manifest["planId"] = plan["id"]
        run_manifest["planDigest"] = canonical_digest(plan)
        _write(root / "runs" / "VM-0001.json", run_manifest)
        for approval in approvals or []:
            _write(root / "approvals" / f"{approval['id']}.json", approval)
        for departure in departures or []:
            _write(root / "departures" / f"{departure['id']}.json", departure)

    def test_all_passing_scopes_make_release_eligible(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            plan = _plan(cases)
            self._repository(root, cases, plan, [_result(cases[0], plan)])

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["fidelityVerdict"], "conformant")
            self.assertEqual(report["releaseReadinessVerdict"], "ready")
            self.assertTrue(report["releaseEligible"])

    def test_graph_derived_selection_reports_missing_case_as_not_run(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case("BC-0001"), _case("BC-0002")]
            plan = _plan(cases)
            self._repository(root, cases, plan, [_result(cases[0], plan)])

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["caseResults"]["BC-0002"]["outcome"], "not-run")
            self.assertEqual(report["fidelityVerdict"], "blocked")
            self.assertFalse(report["releaseEligible"])

    def test_changed_fingerprint_prevents_reuse(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            old_plan = _plan(cases)
            changed_plan = _plan(cases, toolDigest=SHA_B)
            stale_result = _result(cases[0], old_plan)
            self._repository(root, cases, changed_plan, [stale_result])

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["caseResults"]["BC-0001"]["outcome"], "not-run")
            self.assertEqual(report["caseResults"]["BC-0001"]["staleResultIds"], ["VR-0001"])

    def test_changed_reference_mac_identity_prevents_reuse(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            old_plan = _plan(cases)
            changed_plan = _plan(cases, referenceMac={"name": "replacement-mac", "metadataDigest": SHA_B})
            self._repository(root, cases, changed_plan, [_result(cases[0], old_plan)])

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["caseResults"]["BC-0001"]["outcome"], "not-run")

    def test_host_compatibility_requires_every_advertised_macos_major(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            compatibility = _case(claimScopes=["release-readiness"], verificationArea="compatibility")
            compatibility.pop("fidelity")
            cases = [compatibility]
            plan = _plan(cases)
            partial = _result(compatibility, plan, coveredMacOSMajors=[14, 15])
            self._repository(root, cases, plan, [partial])

            blocked = aggregate_verification(root, root / "plans" / "VP-0001.json")
            self.assertEqual(blocked["caseResults"]["BC-0001"]["outcome"], "blocked")

            complete = _result(compatibility, plan, coveredMacOSMajors=[14, 15, 26])
            _write(root / "results" / "VR-0001.json", complete)
            report = aggregate_verification(root, root / "plans" / "VP-0001.json")
            self.assertEqual(report["releaseReadinessVerdict"], "ready")

    def test_provisional_material_pass_blocks_only_fidelity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case(status="provisional")]
            plan = _plan(cases)
            self._repository(root, cases, plan, [_result(cases[0], plan)])

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["caseResults"]["BC-0001"]["outcome"], "pass")
            self.assertEqual(report["fidelityVerdict"], "blocked")
            self.assertEqual(report["releaseReadinessVerdict"], "ready")

    def test_public_lane_cannot_supply_release_candidate_fidelity_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            plan = _plan(cases)
            self._repository(root, cases, plan, [_result(cases[0], plan)], manifest=_manifest(lane="public"))

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["caseResults"]["BC-0001"]["outcome"], "blocked")
            self.assertEqual(report["fidelityVerdict"], "blocked")

    def test_public_ci_report_cannot_establish_release_eligibility(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = _case(executionTiers=["public-ci", "release-candidate"])
            cases = [case]
            plan = _plan(cases, tier="public-ci")
            self._repository(root, cases, plan, [_result(case, plan)], manifest=_manifest(lane="public"))

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["fidelityVerdict"], "blocked")
            self.assertFalse(report["releaseEligible"])

    def test_departure_satisfies_fidelity_but_not_release_readiness(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            plan = _plan(cases)
            departure = {
                "schemaVersion": 1,
                "id": "DR-0001",
                "version": 1,
                "status": "accepted",
                "affectedCases": [{"id": "BC-0001", "version": 1}],
                "evidenceVersion": "EV-aaaaaaaaaaaaaaaa",
                "constraint": "The baseline cannot be published.",
                "observedMismatch": "A substitute differs.",
                "materiality": "material",
                "researchProvenance": "Public-safe pointer.",
                "alternatives": "Retain or replace the baseline.",
                "leastDivergentChoice": "Use the closest cleared substitute.",
                "playerImpact": "Presentation differs; state does not.",
                "verification": "Run the affected visual scenario.",
                "publicRationale": "Publication constraint.",
                "revalidation": "Reopen when evidence or clearance changes.",
                "approvalIds": ["AP-0001"],
            }
            departure_digest = canonical_digest(departure)
            approval = {
                "schemaVersion": 1,
                "id": "AP-0001",
                "targetType": "departure",
                "targetId": "DR-0001",
                "targetVersion": 1,
                "targetDigest": departure_digest,
                "maintainer": "odogono",
                "timestamp": "2026-08-12T12:02:00Z",
                "decision": "approved",
            }
            result = _result(cases[0], plan, outcome="departed", departureId="DR-0001")
            self._repository(root, cases, plan, [result], approvals=[approval], departures=[departure])

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["fidelityVerdict"], "conformant")
            self.assertEqual(report["releaseReadinessVerdict"], "not-ready")

    def test_oracle_capture_is_required_but_disagreement_is_non_blocking(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            visual = _case(verification={"method": "visual comparison", "oracleDiagnosticRequired": True})
            cases = [visual]
            plan = _plan(cases)
            missing = _result(visual, plan)
            self._repository(root, cases, plan, [missing])
            blocked = aggregate_verification(root, root / "plans" / "VP-0001.json")
            self.assertEqual(blocked["caseResults"]["BC-0001"]["outcome"], "blocked")

            disagreement = _result(
                visual,
                plan,
                diagnostics=[{"kind": "cpu-metal-oracle", "captured": True, "agreement": False, "summary": "Primitive mismatch disclosed."}],
            )
            _write(root / "results" / "VR-0001.json", disagreement)
            report = aggregate_verification(root, root / "plans" / "VP-0001.json")
            self.assertTrue(report["releaseEligible"])
            self.assertFalse(report["diagnostics"][0]["agreement"])

    def test_lost_restricted_evidence_is_historical_and_not_reusable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            plan = _plan(cases)
            self._repository(root, cases, plan, [_result(cases[0], plan)], manifest=_manifest(available=False))

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["caseResults"]["BC-0001"]["outcome"], "not-run")
            self.assertEqual(report["reproducibility"], "historical-only")

    def test_lost_superseded_evidence_does_not_taint_a_current_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            plan = _plan(cases)
            old = _result(cases[0], plan)
            old["id"] = "VR-0000"
            old["runId"] = "RUN-0000"
            old["evidenceManifestId"] = "VM-0000"
            current = _result(cases[0], plan)
            unavailable = _manifest(available=False)
            unavailable.update({"id": "VM-0000", "runId": "RUN-0000", "planDigest": canonical_digest(plan), "resultIds": ["VR-0000"]})
            self._repository(root, cases, plan, [old, current])
            _write(root / "runs" / "VM-0000.json", unavailable)

            report = aggregate_verification(root, root / "plans" / "VP-0001.json")

            self.assertEqual(report["caseResults"]["BC-0001"]["outcome"], "pass")
            self.assertEqual(report["reproducibility"], "current")
            self.assertTrue(report["releaseEligible"])

    def test_digest_and_markdown_rendering_are_deterministic(self) -> None:
        value = {"b": [2, 1], "a": "value"}
        self.assertEqual(canonical_digest(value), canonical_digest({"a": "value", "b": [2, 1]}))
        report = {
            "id": "CR-0001",
            "fidelityVerdict": "conformant",
            "releaseReadinessVerdict": "ready",
            "releaseEligible": True,
            "reproducibility": "current",
            "caseResults": {"BC-0001": {"outcome": "pass", "resultId": "VR-0001", "reusedFromRun": "RUN-0001"}},
            "diagnostics": [],
        }
        self.assertEqual(render_report(report), render_report(report))
        self.assertIn("# Conformance Report CR-0001", render_report(report))

    def test_cli_validates_aggregates_and_renders_without_committing_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [_case()]
            plan = _plan(cases)
            self._repository(root, cases, plan, [_result(cases[0], plan)])
            report_path = root / "reports" / "candidate.json"
            markdown_path = root / "work" / "candidate.md"

            with redirect_stdout(StringIO()):
                self.assertEqual(main(["verification", "validate", "--root", str(root)]), 0)
                self.assertEqual(
                    main(["verification", "aggregate", "--root", str(root), "--plan", str(root / "plans" / "VP-0001.json"), "--output", str(report_path)]),
                    0,
                )
                self.assertEqual(main(["verification", "render", "--report", str(report_path), "--output", str(markdown_path)]), 0)

            self.assertTrue(report_path.is_file())
            self.assertIn("Fidelity Conformance", markdown_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
