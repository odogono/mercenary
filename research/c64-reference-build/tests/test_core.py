from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import (  # noqa: E402
    LabError,
    compare_reproducible_runs,
    parse_vice_version,
    validate_prg,
    validate_run_manifest,
    validate_scenario,
    verify_run_artifacts,
)


class PrgValidationTests(unittest.TestCase):
    def test_accepts_a_matching_prg_and_reports_load_range(self) -> None:
        content = b"\x01\x08payload"
        expected = {
            "size": len(content),
            "loadAddress": 0x0801,
            "endAddress": 0x0801 + len(content) - 3,
            "hashes": {
                "sha256": hashlib.sha256(content).hexdigest(),
                "sha1": hashlib.sha1(content).hexdigest(),
                "md5": hashlib.md5(content).hexdigest(),
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.prg"
            path.write_bytes(content)

            actual = validate_prg(path, expected)

        self.assertEqual(actual["loadAddress"], 0x0801)
        self.assertEqual(actual["endAddress"], expected["endAddress"])
        self.assertEqual(actual["hashes"], expected["hashes"])

    def test_rejects_a_missing_prg(self) -> None:
        with self.assertRaisesRegex(LabError, "does not exist"):
            validate_prg(Path("/definitely/missing.prg"), {})

    def test_rejects_an_altered_prg_before_emulator_launch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wrong.prg"
            path.write_bytes(b"\x01\x08wrong")
            expected = {"size": 7, "hashes": {"sha256": "0" * 64}}

            with self.assertRaisesRegex(LabError, "size|sha256"):
                validate_prg(path, expected)


class VersionTests(unittest.TestCase):
    def test_parses_vice_version_output(self) -> None:
        self.assertEqual(parse_vice_version("VICE 3.10\n"), (3, 10, 0))
        self.assertEqual(parse_vice_version("x64sc (VICE 3.9.1)"), (3, 9, 1))

    def test_rejects_unrecognizable_version_output(self) -> None:
        with self.assertRaisesRegex(LabError, "VICE version"):
            parse_vice_version("unknown emulator")


class ScenarioValidationTests(unittest.TestCase):
    def test_accepts_bounded_port_two_input(self) -> None:
        scenario = {
            "schemaVersion": 1,
            "name": "smoke",
            "checkpoint": "interactive",
            "actions": [
                {"type": "wait_pc", "address": 0x1234},
                {"type": "key", "petscii": "Y"},
                {"type": "joystick", "port": 2, "value": 16, "durationInstructions": 5000},
                {"type": "capture", "artifacts": ["ram", "registers"]},
            ],
        }

        validate_scenario(scenario, cycle_limit=10000)

    def test_rejects_joystick_on_the_wrong_port(self) -> None:
        scenario = {
            "schemaVersion": 1,
            "name": "wrong-port",
            "checkpoint": "interactive",
            "actions": [{"type": "joystick", "port": 1, "value": 1, "durationInstructions": 1}],
        }
        with self.assertRaisesRegex(LabError, "port 2"):
            validate_scenario(scenario, cycle_limit=100)

    def test_rejects_a_scenario_over_the_cycle_budget(self) -> None:
        scenario = {
            "schemaVersion": 1,
            "name": "unbounded",
            "checkpoint": "interactive",
            "actions": [{"type": "wait_instructions", "instructions": 101}],
        }
        with self.assertRaisesRegex(LabError, "cycle limit"):
            validate_scenario(scenario, cycle_limit=100)


class ManifestTests(unittest.TestCase):
    def _manifest(self, artifact_hash: str = "a" * 64) -> dict:
        return {
            "schemaVersion": 1,
            "runId": "run-one",
            "createdAt": "2026-08-11T12:00:00Z",
            "build": {"sha256": "b" * 64},
            "toolchain": {"viceVersion": "3.10"},
            "machine": {"model": "c64pal", "seed": 1, "configSha256": "c" * 64},
            "scenario": {"name": "post-unpack", "sha256": "d" * 64},
            "checkpoint": {"name": "post-unpack", "pc": 0x01E6, "registers": {"PC": 0x01E6}},
            "artifacts": [{"role": "ram", "path": "post-unpack.ram", "size": 65536, "sha256": artifact_hash}],
        }

    def test_validates_and_verifies_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            data = b"ram"
            (run / "post-unpack.ram").write_bytes(data)
            manifest = self._manifest(hashlib.sha256(data).hexdigest())
            manifest["artifacts"][0]["size"] = len(data)

            validate_run_manifest(manifest)
            verify_run_artifacts(run, manifest)

    def test_rejects_an_artifact_that_escaped_the_run_directory(self) -> None:
        manifest = self._manifest()
        manifest["artifacts"][0]["path"] = "../outside.ram"
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(LabError, "inside the run directory"):
                verify_run_artifacts(Path(directory), manifest)

    def test_compares_only_normalized_reproducibility_evidence(self) -> None:
        first = self._manifest()
        second = json.loads(json.dumps(first))
        second["runId"] = "run-two"
        second["createdAt"] = "2026-08-11T12:01:00Z"

        compare_reproducible_runs(first, second)

        second["checkpoint"]["registers"]["PC"] = 0x2000
        with self.assertRaisesRegex(LabError, "not reproducible"):
            compare_reproducible_runs(first, second)


if __name__ == "__main__":
    unittest.main()
