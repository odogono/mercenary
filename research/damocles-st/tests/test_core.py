from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import (  # noqa: E402
    LabError,
    compare_reproducible_runs,
    extract_stable_ram,
    parse_ram_ranges,
    parse_register_log,
    stable_registers,
    validate_image,
    validate_run_manifest,
    validate_scenario,
    verify_run_artifacts,
)
from damocleslab.runtime import render_dump_script, render_title_capture_script, render_vbl_wait_script  # noqa: E402
from damocleslab.toolchain import parse_hatari_version  # noqa: E402


def _hashes(data: bytes) -> dict[str, str]:
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "sha1": hashlib.sha1(data).hexdigest(),
        "md5": hashlib.md5(data).hexdigest(),
    }


class ImageValidationTests(unittest.TestCase):
    def test_accepts_a_matching_image(self) -> None:
        content = b"STX-FAKE"
        expected = {"size": len(content), "hashes": _hashes(content)}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "disk.stx"
            path.write_bytes(content)
            actual = validate_image(path, expected, label="Working Authority STX")
        self.assertEqual(actual["size"], len(content))
        self.assertEqual(actual["hashes"], expected["hashes"])

    def test_rejects_a_hash_mismatch_before_emulator_launch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "disk.stx"
            path.write_bytes(b"wrong")
            expected = {"size": 5, "hashes": {"sha256": "0" * 64}}
            with self.assertRaisesRegex(LabError, "sha256"):
                validate_image(path, expected, label="Working Authority STX")


class RegisterParseTests(unittest.TestCase):
    def test_parses_hatari_register_block(self) -> None:
        text = (
            "  D0 0000002F   D1 00000001\n"
            "  A5 0003BCD8   A6 00068A82   A7 0006AB60\n"
            "CPU=$68582, VBL=2568\n"
            "00068582 d582                     addx.l d2,d2\n"
        )
        registers = parse_register_log(text)
        self.assertEqual(registers["PC"], 0x68582)
        self.assertEqual(registers["A6"], 0x68A82)
        self.assertEqual(stable_registers({**registers, "D5": 47, "D6": 1, "D7": 1})["A6"], 0x68A82)


class ScenarioValidationTests(unittest.TestCase):
    def test_accepts_title_smoke_shape(self) -> None:
        validate_scenario(
            {
                "schemaVersion": 1,
                "name": "title-smoke",
                "checkpoint": "title-screen",
                "actions": [
                    {"type": "keypress", "key": 57},
                    {"type": "wait_vbls", "count": 200},
                    {"type": "capture", "artifacts": ["display"]},
                ],
            }
        )

    def test_accepts_checked_in_first_world_scenario(self) -> None:
        path = Path(__file__).resolve().parents[1] / "scenarios" / "first-world.json"
        validate_scenario(json.loads(path.read_text(encoding="utf-8")))

    def test_rejects_missing_capture(self) -> None:
        with self.assertRaisesRegex(LabError, "exactly one capture"):
            validate_scenario(
                {
                    "schemaVersion": 1,
                    "name": "bad",
                    "checkpoint": "title-screen",
                    "actions": [{"type": "keypress", "key": 57}],
                }
            )


class ManifestTests(unittest.TestCase):
    def test_verify_and_compare_normalized_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            payload = b"stable-ram"
            (run / "norm.ram").write_bytes(payload)
            (run / "regs.json").write_text('{"A5": 1}\n', encoding="utf-8")
            (run / "screen.png").write_bytes(b"png")
            manifest = {
                "schemaVersion": 1,
                "runId": "r1",
                "createdAt": "2026-08-18T00:00:00Z",
                "authority": {"logicalName": "wa", "programSha256": "a" * 64},
                "toolchain": {"hatariVersion": "2.6.1", "pythonVersion": "3.13.0"},
                "machine": {"model": "st", "memsizeMiB": 1, "tosSha256": "b" * 64},
                "scenario": {"name": "title-screen"},
                "checkpoint": {"name": "title-screen", "pc": 427394},
                "artifacts": [
                    {
                        "role": "normalized-ram",
                        "path": "norm.ram",
                        "size": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    },
                    {
                        "role": "registers-stable",
                        "path": "regs.json",
                        "size": (run / "regs.json").stat().st_size,
                        "sha256": hashlib.sha256((run / "regs.json").read_bytes()).hexdigest(),
                    },
                    {
                        "role": "display",
                        "path": "screen.png",
                        "size": 3,
                        "sha256": hashlib.sha256(b"png").hexdigest(),
                    },
                ],
            }
            validate_run_manifest(manifest)
            verify_run_artifacts(run, manifest)
            compare_reproducible_runs(manifest, json.loads(json.dumps(manifest)))


class StableRamTests(unittest.TestCase):
    def test_extracts_named_ranges(self) -> None:
        data = bytes(range(256)) * (0x100000 // 256)
        ranges = parse_ram_ranges([["0x10", "0x14"], ["0x20", "0x22"]], label="stableRamRanges")
        extracted = extract_stable_ram(data, ranges)
        self.assertEqual(extracted, data[0x10:0x14] + data[0x20:0x22])


class RuntimeScriptTests(unittest.TestCase):
    def test_renders_pc_then_vbl_chain(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            dump = Path(directory) / "dump.txt"
            wait = Path(directory) / "wait.txt"
            dump.write_text("r\n", encoding="utf-8")
            script = render_title_capture_script(next_script=wait, pc=0x68582)
            self.assertIn("pc = $68582", script)
            self.assertIn("c\n", script)
            wait_script = render_vbl_wait_script(dump_script=dump, extra_vbls=1400)
            self.assertIn("VBL+1400", wait_script)
            dump_script = render_dump_script(run_directory=Path(directory), prefix="title-screen")
            self.assertIn("savebin", dump_script)
            self.assertIn("screenshot", dump_script)


class VersionTests(unittest.TestCase):
    def test_parses_hatari_version(self) -> None:
        self.assertEqual(parse_hatari_version("Hatari v2.6.1 - the Atari ST"), (2, 6, 1))


if __name__ == "__main__":
    unittest.main()
