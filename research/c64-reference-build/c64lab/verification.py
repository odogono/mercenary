from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable

from .core import LabError


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_ROOT = REPOSITORY_ROOT / "verification" / "schemas"


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LabError(f"Could not read verification JSON from {path}: {error}") from error
    _require(isinstance(value, dict), f"Verification document must be an object: {path}")
    return value


def _documents(root: Path, directory: str) -> list[tuple[Path, dict[str, Any]]]:
    path = root / directory
    if not path.exists():
        return []
    return [(item, _load_json(item)) for item in sorted(path.glob("*.json"))]


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def case_graph_digest(cases: Iterable[dict[str, Any]]) -> str:
    graph = [
        {
            "id": case["id"],
            "version": case["version"],
            "digest": canonical_digest(case),
            "dependencies": case.get("dependencies", {}),
        }
        for case in sorted(cases, key=lambda item: item["id"])
    ]
    return canonical_digest(graph)


def result_fingerprint(case: dict[str, Any], plan: dict[str, Any]) -> str:
    candidate = plan["candidate"]
    return canonical_digest(
        {
            "caseDigest": canonical_digest(case),
            "appBuildDigest": candidate["appBuildDigest"],
            "contentSetDigest": candidate["contentSetDigest"],
            "evidenceDigest": plan["evidenceDigest"],
            "protocolDigest": plan["protocolDigest"],
            "toolDigest": plan["toolDigest"],
            "environmentDigest": plan["environmentDigest"],
            "referenceMac": plan["referenceMac"],
        }
    )


def _validate_schema(value: dict[str, Any], schema_name: str, path: Path) -> None:
    try:
        from jsonschema import Draft202012Validator
    except ImportError as error:
        raise LabError("Verification schema validation requires jsonschema==4.26.0; create the documented laboratory virtual environment") from error
    schema = _load_json(SCHEMA_ROOT / schema_name)
    errors = sorted(Draft202012Validator(schema).iter_errors(value), key=lambda item: list(item.path))
    if errors:
        location = "/".join(str(part) for part in errors[0].path) or "<root>"
        raise LabError(f"Verification schema validation failed for {path} at {location}: {errors[0].message}")


def _detect_cycle(cases: dict[str, dict[str, Any]]) -> None:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(case_id: str) -> None:
        if case_id in visited:
            return
        _require(case_id not in visiting, f"Behavior Case dependency cycle includes {case_id}")
        visiting.add(case_id)
        for dependency in cases[case_id]["dependencies"]["caseIds"]:
            _require(dependency in cases, f"Behavior Case {case_id} references missing dependency {dependency}")
            visit(dependency)
        visiting.remove(case_id)
        visited.add(case_id)

    for case_id in sorted(cases):
        visit(case_id)


def _validate_restricted_manifest(value: dict[str, Any]) -> None:
    if value.get("lane") != "restricted":
        return

    forbidden_key = re.compile(r"(?:path|sha256|artifacthash)", re.IGNORECASE)

    def walk(item: Any, context: str) -> None:
        if isinstance(item, dict):
            for key, nested in item.items():
                _require(not forbidden_key.search(key), f"Restricted manifest contains unsafe restricted field {context}/{key}")
                walk(nested, f"{context}/{key}")
        elif isinstance(item, list):
            for index, nested in enumerate(item):
                walk(nested, f"{context}/{index}")
        elif isinstance(item, str):
            _require(not item.startswith(("/", "../", "~/")), f"Restricted manifest contains unsafe restricted path at {context}")

    walk(value, "manifest")


def validate_verification(root: Path) -> dict[str, Any]:
    schema_by_directory = {
        "cases": "behavior-case.schema.json",
        "plans": "verification-plan.schema.json",
        "results": "verification-result.schema.json",
        "runs": "verification-manifest.schema.json",
        "approvals": "verification-approval.schema.json",
        "departures": "departure-record.schema.json",
        "reports": "conformance-report.schema.json",
    }
    loaded: dict[str, list[dict[str, Any]]] = {}
    for directory, schema_name in schema_by_directory.items():
        values = []
        for path, value in _documents(root, directory):
            _validate_schema(value, schema_name, path)
            if directory == "runs":
                _validate_restricted_manifest(value)
            values.append(value)
        loaded[directory] = values

    cases: dict[str, dict[str, Any]] = {}
    aliases: set[str] = set()
    for case in loaded["cases"]:
        case_id = case["id"]
        _require(case_id not in cases, f"Duplicate Behavior Case {case_id}")
        _require(not aliases.intersection(case["aliases"]), f"Duplicate Behavior Case alias in {case_id}")
        aliases.update(case["aliases"])
        scopes = set(case["claimScopes"])
        if "fidelity" in scopes:
            _require("fidelity" in case, f"Behavior Case {case_id} requires fidelity fields")
        else:
            _require("fidelity" not in case, f"Release-only Behavior Case {case_id} must not define fidelity fields")
        cases[case_id] = case
    _require(bool(cases), "Verification root must contain Behavior Cases")
    _detect_cycle(cases)

    def index_unique(directory: str) -> dict[str, dict[str, Any]]:
        indexed: dict[str, dict[str, Any]] = {}
        for item in loaded[directory]:
            _require(item["id"] not in indexed, f"Duplicate verification record {item['id']}")
            indexed[item["id"]] = item
        return indexed

    plans = index_unique("plans")
    results = index_unique("results")
    departures = index_unique("departures")
    approvals = index_unique("approvals")
    manifests = index_unique("runs")
    for result in results.values():
        _require(result["caseId"] in cases, f"Verification result {result['id']} references missing case {result['caseId']}")
        _require(result["evidenceManifestId"] in manifests, f"Verification result {result['id']} references missing manifest {result['evidenceManifestId']}")
        manifest = manifests[result["evidenceManifestId"]]
        _require(
            result["runId"] == manifest["runId"] and result["id"] in manifest["resultIds"],
            f"Verification result {result['id']} does not match its manifest run lineage",
        )
        _require(manifest["planId"] in plans, f"Verification manifest {manifest['id']} references missing plan {manifest['planId']}")
        _require(manifest["planDigest"] == canonical_digest(plans[manifest["planId"]]), f"Verification manifest {manifest['id']} references the wrong plan digest")
        if result["outcome"] == "departed":
            _require("departureId" in result, f"Departed result {result['id']} requires a Departure Record")
            _require(result["departureId"] in departures, f"Result {result['id']} references missing Departure Record")
        for approval_id in result["approvalIds"]:
            _require(approval_id in approvals, f"Result {result['id']} references missing approval {approval_id}")
    for departure in departures.values():
        for affected in departure["affectedCases"]:
            _require(affected["id"] in cases, f"Departure Record {departure['id']} references missing case {affected['id']}")
            _require("fidelity" in cases[affected["id"]]["claimScopes"], f"Departure Record {departure['id']} cannot cover a release-only case")
        for approval_id in departure["approvalIds"]:
            _require(approval_id in approvals, f"Departure Record {departure['id']} references missing approval {approval_id}")
    approval_targets = {("result", item_id): item for item_id, item in results.items()}
    approval_targets.update({("departure", item_id): item for item_id, item in departures.items()})
    for approval in approvals.values():
        target = approval_targets.get((approval["targetType"], approval["targetId"]))
        _require(target is not None, f"Approval {approval['id']} references a missing target")
        _require(approval["targetVersion"] == target.get("version", 1), f"Approval {approval['id']} targets the wrong version")
        _require(approval["targetDigest"] == canonical_digest(target), f"Approval {approval['id']} targets the wrong digest")
    return {**loaded, "caseById": cases}


def _applicable(case: dict[str, Any], plan: dict[str, Any]) -> bool:
    return plan["tier"] in case["executionTiers"] and plan["candidate"]["kind"] in case["applicability"]["candidateKinds"]


def _approval_valid(approval: dict[str, Any], target_type: str, target: dict[str, Any]) -> bool:
    return (
        approval["targetType"] == target_type
        and approval["targetId"] == target["id"]
        and approval["targetVersion"] == target.get("version", 1)
        and approval["targetDigest"] == canonical_digest(target)
        and approval["decision"] == "approved"
    )


def _departure_valid(departure: dict[str, Any], case: dict[str, Any], approvals: dict[str, dict[str, Any]]) -> bool:
    affected = {item["id"]: item["version"] for item in departure["affectedCases"]}
    return (
        departure["status"] == "accepted"
        and affected.get(case["id"]) == case["version"]
        and bool(departure["approvalIds"])
        and all(
            approval_id in approvals and _approval_valid(approvals[approval_id], "departure", departure)
            for approval_id in departure["approvalIds"]
        )
    )


def aggregate_verification(root: Path, plan_path: Path) -> dict[str, Any]:
    documents = validate_verification(root)
    plan = _load_json(plan_path)
    _validate_schema(plan, "verification-plan.schema.json", plan_path)
    cases = documents["caseById"]
    selected = {case_id: case for case_id, case in cases.items() if _applicable(case, plan)}
    _require(plan["caseGraphDigest"] == case_graph_digest(cases.values()), "Verification plan case graph digest is stale")

    manifests = {item["id"]: item for item in documents["runs"]}
    approvals = {item["id"]: item for item in documents["approvals"]}
    departures = {item["id"]: item for item in documents["departures"]}
    results_by_case: dict[str, list[dict[str, Any]]] = {}
    for result in documents["results"]:
        results_by_case.setdefault(result["caseId"], []).append(result)

    report_results: dict[str, dict[str, Any]] = {}
    diagnostics: list[dict[str, Any]] = []
    any_missing_evidence = False
    for case_id, case in sorted(selected.items()):
        expected = result_fingerprint(case, plan)
        candidate_results = sorted(results_by_case.get(case_id, []), key=lambda item: item["id"])
        stale_ids: list[str] = []
        usable: list[dict[str, Any]] = []
        for result in candidate_results:
            manifest = manifests[result["evidenceManifestId"]]
            if not manifest["evidenceAvailable"]:
                stale_ids.append(result["id"])
            elif result["caseVersion"] != case["version"] or result["dependencyFingerprint"] != expected:
                stale_ids.append(result["id"])
            else:
                usable.append(result)
        if not usable:
            any_missing_evidence = any(
                not manifests[result["evidenceManifestId"]]["evidenceAvailable"]
                for result in candidate_results
            ) or any_missing_evidence
            report_results[case_id] = {"outcome": "not-run", "staleResultIds": stale_ids}
            continue
        result = usable[-1]
        outcome = result["outcome"]
        manifest = manifests[result["evidenceManifestId"]]
        if plan["tier"] == "release-candidate" and "fidelity" in case["claimScopes"] and manifest["lane"] != "restricted":
            outcome = "blocked"
        case_diagnostics = list(result["diagnostics"])
        if case["verification"]["oracleDiagnosticRequired"]:
            oracle = [item for item in case_diagnostics if item["kind"] == "cpu-metal-oracle" and item["captured"]]
            if not oracle:
                outcome = "blocked"
        if case["verificationArea"] == "compatibility":
            covered = set(result.get("coveredMacOSMajors", []))
            if not set(plan["candidate"]["advertisedMacOSMajors"]) <= covered:
                outcome = "blocked"
        if case["reviewRequired"]:
            approved = any(
                approval_id in approvals and _approval_valid(approvals[approval_id], "result", result)
                for approval_id in result["approvalIds"]
            )
            if not approved:
                outcome = "blocked"
        if outcome == "departed":
            departure = departures.get(result.get("departureId", ""))
            if departure is None or not _departure_valid(departure, case, approvals):
                outcome = "blocked"
        diagnostics.extend({"caseId": case_id, **item} for item in case_diagnostics)
        report_results[case_id] = {
            "outcome": outcome,
            "resultId": result["id"],
            "reusedFromRun": result["runId"],
            "staleResultIds": stale_ids,
        }

    # A failed or absent prerequisite blocks its dependants even if a stale standalone result exists.
    changed = True
    while changed:
        changed = False
        for case_id, case in selected.items():
            dependency_outcomes = [report_results[item]["outcome"] for item in case["dependencies"]["caseIds"] if item in selected]
            if any(outcome not in {"pass", "departed"} for outcome in dependency_outcomes) and report_results[case_id]["outcome"] != "blocked":
                report_results[case_id]["outcome"] = "blocked"
                changed = True

    fidelity_fail = False
    fidelity_block = plan["candidate"]["kind"] != "official" or plan["tier"] != "release-candidate"
    readiness_fail = False
    readiness_block = False
    for case_id, case in selected.items():
        outcome = report_results[case_id]["outcome"]
        scopes = set(case["claimScopes"])
        if "fidelity" in scopes:
            fidelity = case["fidelity"]
            if outcome == "fail":
                fidelity_fail = True
            elif outcome in {"blocked", "not-run"}:
                fidelity_block = True
            elif outcome == "pass" and case["status"] == "provisional" and fidelity["materiality"] == "material":
                fidelity_block = True
        if "release-readiness" in scopes:
            if outcome in {"fail", "departed"}:
                readiness_fail = True
            elif outcome in {"blocked", "not-run"}:
                readiness_block = True

    fidelity_verdict = "nonconformant" if fidelity_fail else "blocked" if fidelity_block else "conformant"
    readiness_verdict = "not-ready" if readiness_fail else "blocked" if readiness_block else "ready"
    report = {
        "schemaVersion": 1,
        "id": "CR-" + canonical_digest({"plan": plan, "results": report_results})[:12],
        "planId": plan["id"],
        "planDigest": canonical_digest(plan),
        "candidate": plan["candidate"],
        "caseGraphDigest": plan["caseGraphDigest"],
        "fidelityVerdict": fidelity_verdict,
        "releaseReadinessVerdict": readiness_verdict,
        "releaseEligible": fidelity_verdict == "conformant" and readiness_verdict == "ready",
        "reproducibility": "historical-only" if any_missing_evidence else "current",
        "caseResults": report_results,
        "diagnostics": diagnostics,
    }
    _validate_schema(report, "conformance-report.schema.json", Path("<generated report>"))
    return report


def render_report(report: dict[str, Any]) -> str:
    lines = [
        f"# Conformance Report {report['id']}",
        "",
        f"- Fidelity Conformance: **{report['fidelityVerdict']}**",
        f"- Release Readiness: **{report['releaseReadinessVerdict']}**",
        f"- Release Eligible: **{'yes' if report['releaseEligible'] else 'no'}**",
        f"- Reproducibility: **{report['reproducibility']}**",
        "",
        "## Behavior Cases",
        "",
        "| Case | Outcome | Result | Lineage |",
        "| --- | --- | --- | --- |",
    ]
    for case_id, result in sorted(report["caseResults"].items()):
        lines.append(
            f"| {case_id} | {result['outcome']} | {result.get('resultId', '—')} | {result.get('reusedFromRun', '—')} |"
        )
    if report["diagnostics"]:
        lines.extend(["", "## Diagnostics", ""])
        for diagnostic in report["diagnostics"]:
            agreement = diagnostic.get("agreement")
            detail = "agreement" if agreement is True else "disagreement" if agreement is False else "captured"
            lines.append(f"- {diagnostic['caseId']} / {diagnostic['kind']}: {detail} — {diagnostic.get('summary', '')}".rstrip())
    return "\n".join(lines) + "\n"
