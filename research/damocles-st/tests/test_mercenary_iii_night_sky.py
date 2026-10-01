"""Portable research-tool boundary checks, without original game material."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PROBE = Path(__file__).resolve().parents[1] / "scripts/mercenary-iii-taxi-night-sky.py"


class NightSkyProbeInputs(unittest.TestCase):
    def test_capture_needs_only_supplied_media_not_an_ignored_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "atarist").mkdir()
            (root / "atarist/Mercenary III.STX").write_bytes(b"wrong supplied disk")
            result = subprocess.run(
                [sys.executable, str(PROBE), "capture", "--rom-root", directory,
                 "--route", "sol"], capture_output=True, text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Pinned disk mismatch", result.stderr)
        self.assertNotIn("arguments are required: --baseline", result.stderr)

    def test_inspect_rejects_truncated_ram_before_decoding(self):
        with tempfile.TemporaryDirectory() as directory:
            ram = Path(directory) / "capture.ram"
            ram.write_bytes(b"truncated capture")
            result = subprocess.run(
                [sys.executable, str(PROBE), "inspect", "--ram", str(ram)],
                capture_output=True, text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Expected a full 1 MiB RAM capture", result.stderr)

    def test_inspect_rejects_a_full_sized_capture_from_another_source(self):
        with tempfile.TemporaryDirectory() as directory:
            ram = Path(directory) / "capture.ram"
            ram.write_bytes(bytes(0x100000))
            result = subprocess.run(
                [sys.executable, str(PROBE), "inspect", "--ram", str(ram)],
                capture_output=True, text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("MIII day source mismatch", result.stderr)


if __name__ == "__main__":
    unittest.main()
