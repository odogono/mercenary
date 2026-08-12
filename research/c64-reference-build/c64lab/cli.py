from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .core import LabError
from .laboratory import capture, doctor, observe, reproduce, verify
from .geometry import (
    compare_geometry,
    extract_geometry,
    reproduce_geometry,
    review_comparisons,
    summarize_geometry,
    verify_dataset,
)
from .catalogue import (
    build_catalogue,
    review_catalogue,
    run_catalogue_trace,
    sample_catalogue,
    summarize_catalogue,
    verify_catalogue,
)
from .verification import aggregate_verification, render_report, validate_verification
from .implementation_contracts import validate_implementation_contracts
from .semantics import validate_event_history_proof


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="C64 Reference Build research laboratory")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor_parser = subparsers.add_parser("doctor", help="validate the Reference Build and toolchain")
    doctor_parser.add_argument("--prg", required=True, type=Path)

    capture_parser = subparsers.add_parser("capture", help="capture a canonical checkpoint")
    capture_parser.add_argument("--prg", required=True, type=Path)
    capture_parser.add_argument("--checkpoint", required=True, choices=("post-unpack", "interactive"))

    observe_parser = subparsers.add_parser("observe", help="validate and run an observation scenario")
    observe_parser.add_argument("--prg", required=True, type=Path)
    observe_parser.add_argument("--scenario", required=True, type=Path)

    verify_parser = subparsers.add_parser("verify", help="verify a run manifest and its artifacts")
    verify_parser.add_argument("--run", required=True, type=Path)

    reproduce_parser = subparsers.add_parser("reproduce", help="compare two clean post-unpack captures")
    reproduce_parser.add_argument("--prg", required=True, type=Path)

    geometry_parser = subparsers.add_parser("geometry", help="extract and validate the World Geometry Dataset")
    geometry_commands = geometry_parser.add_subparsers(dest="geometry_command", required=True)

    geometry_extract = geometry_commands.add_parser("extract", help="extract a dataset from an interactive capture")
    geometry_extract.add_argument("--run", required=True, type=Path)
    geometry_extract.add_argument("--curation", type=Path)
    geometry_extract.add_argument("--output", type=Path)

    geometry_verify = geometry_commands.add_parser("verify", help="verify a generated dataset bundle")
    geometry_verify.add_argument("--dataset", required=True, type=Path)

    geometry_reproduce = geometry_commands.add_parser("reproduce", help="compare datasets from two clean initialized captures")
    geometry_reproduce.add_argument("--prg", required=True, type=Path)
    geometry_reproduce.add_argument("--curation", type=Path)

    geometry_compare = geometry_commands.add_parser("compare", help="compare representative geometry with a fresh Reference Build capture")
    geometry_compare.add_argument("--prg", required=True, type=Path)
    geometry_compare.add_argument("--dataset", required=True, type=Path)

    geometry_review = geometry_commands.add_parser("review", help="record a maintainer comparison decision")
    geometry_review.add_argument("--comparisons", required=True, type=Path)
    geometry_review.add_argument("--reviewer", required=True)
    geometry_review.add_argument("--decision", required=True, choices=("approved", "rejected"))

    geometry_summarize = geometry_commands.add_parser("summarize", help="write an allowlisted redacted evidence baseline")
    geometry_summarize.add_argument("--dataset", required=True, type=Path)
    geometry_summarize.add_argument("--comparisons", required=True, type=Path)
    geometry_summarize.add_argument("--review", required=True, type=Path)
    geometry_summarize.add_argument("--output", required=True, type=Path)

    catalogue_parser = subparsers.add_parser("catalogue", help="build and validate the player-observable Behavior Catalogue")
    catalogue_commands = catalogue_parser.add_subparsers(dest="catalogue_command", required=True)

    catalogue_run = catalogue_commands.add_parser("run", help="run one provenance-backed catalogue trace")
    catalogue_run.add_argument("--prg", required=True, type=Path)
    catalogue_run.add_argument("--trace", required=True, type=Path)
    catalogue_run.add_argument("--observation-map", type=Path)
    catalogue_run.add_argument("--branch", action="append", dest="branches")

    catalogue_build = catalogue_commands.add_parser("build", help="assemble a restricted catalogue bundle")
    catalogue_build.add_argument("--entries", required=True, type=Path)
    catalogue_build.add_argument("--evidence-store", required=True, type=Path)
    catalogue_build.add_argument("--geometry", required=True, type=Path)
    catalogue_build.add_argument("--output", required=True, type=Path)

    catalogue_verify = catalogue_commands.add_parser("verify", help="verify a Behavior Catalogue")
    catalogue_verify.add_argument("--catalogue", required=True, type=Path)

    catalogue_sample = catalogue_commands.add_parser("sample", help="validate and run deterministic or stochastic trace samples")
    catalogue_sample.add_argument("--prg", required=True, type=Path)
    catalogue_sample.add_argument("--trace-set", required=True, type=Path)
    catalogue_sample.add_argument("--observation-map", type=Path)

    catalogue_history = catalogue_commands.add_parser("verify-history", help="verify two typed VICE event-history replays")
    catalogue_history.add_argument("--capture-report", required=True, type=Path)
    catalogue_history.add_argument("--replay-report", required=True, action="append", type=Path)

    catalogue_review = catalogue_commands.add_parser("review", help="record a maintainer catalogue review")
    catalogue_review.add_argument("--catalogue", required=True, type=Path)
    catalogue_review.add_argument("--domain", required=True)
    catalogue_review.add_argument("--reviewer", required=True)
    catalogue_review.add_argument("--decision", required=True, choices=("approved", "rejected"))

    catalogue_summarize = catalogue_commands.add_parser("summarize", help="write an allowlisted catalogue baseline")
    catalogue_summarize.add_argument("--catalogue", required=True, type=Path)
    catalogue_summarize.add_argument("--reviews", required=True, type=Path)
    catalogue_summarize.add_argument("--output", required=True, type=Path)

    verification_parser = subparsers.add_parser("verification", help="validate and aggregate verification evidence")
    verification_commands = verification_parser.add_subparsers(dest="verification_command", required=True)

    verification_validate = verification_commands.add_parser("validate", help="validate verification records and their dependency graph")
    verification_validate.add_argument("--root", required=True, type=Path)

    verification_aggregate = verification_commands.add_parser("aggregate", help="generate an immutable aggregate Conformance Report")
    verification_aggregate.add_argument("--root", required=True, type=Path)
    verification_aggregate.add_argument("--plan", required=True, type=Path)
    verification_aggregate.add_argument("--output", required=True, type=Path)

    verification_render = verification_commands.add_parser("render", help="render a Conformance Report as deterministic Markdown")
    verification_render.add_argument("--report", required=True, type=Path)
    verification_render.add_argument("--output", required=True, type=Path)

    implementation_parser = subparsers.add_parser("implementation", help="validate production implementation contracts")
    implementation_commands = implementation_parser.add_subparsers(dest="implementation_command", required=True)
    implementation_validate = implementation_commands.add_parser("validate", help="validate schemas, CDDL, and golden vectors")
    implementation_validate.add_argument("--root", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        if arguments.command == "doctor":
            result = doctor(arguments.prg)
            result.pop("viceFeatures", None)
        elif arguments.command == "capture":
            run_directory, manifest = capture(arguments.prg, arguments.checkpoint)
            result = {"status": "captured", "run": str(run_directory), "manifest": manifest}
        elif arguments.command == "observe":
            run_directory, manifest = observe(arguments.prg, arguments.scenario)
            result = {"status": "observed", "run": str(run_directory), "scenario": manifest["scenario"]["name"], "manifest": manifest}
        elif arguments.command == "verify":
            manifest = verify(arguments.run)
            result = {"status": "verified", "run": str(arguments.run), "runId": manifest["runId"]}
        elif arguments.command == "reproduce":
            result = reproduce(arguments.prg)
        elif arguments.command == "geometry":
            if arguments.geometry_command == "extract":
                result = extract_geometry(arguments.run, curation_path=arguments.curation, output=arguments.output)
            elif arguments.geometry_command == "verify":
                verified = verify_dataset(arguments.dataset)
                result = {"status": "verified", "dataset": str(arguments.dataset), "manifest": verified["manifest"]}
            elif arguments.geometry_command == "reproduce":
                result = reproduce_geometry(arguments.prg, curation_path=arguments.curation)
            elif arguments.geometry_command == "compare":
                result = compare_geometry(arguments.prg, arguments.dataset)
            elif arguments.geometry_command == "review":
                result = review_comparisons(arguments.comparisons, arguments.reviewer, arguments.decision)
            else:
                result = summarize_geometry(arguments.dataset, arguments.comparisons, arguments.review, arguments.output)
        elif arguments.command == "implementation":
            result = {"status": "verified", **validate_implementation_contracts(arguments.root)}
        elif arguments.command == "verification":
            if arguments.verification_command == "validate":
                documents = validate_verification(arguments.root)
                result = {"status": "verified", "cases": len(documents["cases"])}
            elif arguments.verification_command == "aggregate":
                report = aggregate_verification(arguments.root, arguments.plan)
                arguments.output.parent.mkdir(parents=True, exist_ok=True)
                arguments.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
                result = {"status": "aggregated", "report": str(arguments.output), "reportId": report["id"]}
            else:
                try:
                    report = json.loads(arguments.report.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError) as error:
                    raise LabError(f"Could not read Conformance Report from {arguments.report}: {error}") from error
                arguments.output.parent.mkdir(parents=True, exist_ok=True)
                arguments.output.write_text(render_report(report), encoding="utf-8")
                result = {"status": "rendered", "output": str(arguments.output)}
        elif arguments.catalogue_command == "build":
            result = build_catalogue(arguments.entries, arguments.evidence_store, arguments.geometry, arguments.output)
        elif arguments.catalogue_command == "verify":
            result = verify_catalogue(arguments.catalogue)
        elif arguments.catalogue_command == "review":
            result = review_catalogue(arguments.catalogue, arguments.domain, arguments.reviewer, arguments.decision)
        elif arguments.catalogue_command == "summarize":
            if arguments.reviews.resolve() != (arguments.catalogue / "reviews").resolve():
                raise LabError("Catalogue --reviews must name the catalogue's reviews directory")
            result = summarize_catalogue(arguments.catalogue, arguments.output)
        elif arguments.catalogue_command == "sample":
            result = sample_catalogue(arguments.prg, arguments.trace_set, arguments.observation_map)
        elif arguments.catalogue_command == "verify-history":
            try:
                capture_report = json.loads(arguments.capture_report.read_text(encoding="utf-8"))
                replay_reports = [json.loads(path.read_text(encoding="utf-8")) for path in arguments.replay_report]
            except (OSError, json.JSONDecodeError) as error:
                raise LabError(f"Could not read event-history proof report: {error}") from error
            result = {"status": "verified", **validate_event_history_proof(capture_report, replay_reports)}
        else:
            result = run_catalogue_trace(
                arguments.prg,
                arguments.trace,
                arguments.observation_map,
                branch_ids=arguments.branches,
            )
    except LabError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0
