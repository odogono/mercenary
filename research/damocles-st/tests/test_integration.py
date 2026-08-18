from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = LAB_ROOT.parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.core import LabError  # noqa: E402
from damocleslab.laboratory import doctor, reproduce  # noqa: E402


def _roms_ready() -> bool:
    authority = LAB_ROOT / "config" / "working-authority.json"
    if not authority.is_file():
        return False
    import json

    config = json.loads(authority.read_text(encoding="utf-8"))
    roms = REPO_ROOT / "roms"
    stx = roms / config["programImage"]["relativePath"]
    tos = roms / config["tosImage"]["relativePath"]
    return stx.is_file() and tos.is_file()


@unittest.skipUnless(os.environ.get("DAMOCLAB_INTEGRATION") == "1" or _roms_ready(), "Restricted Material or Hatari missing")
class IntegrationTests(unittest.TestCase):
    def test_doctor_accepts_working_authority(self) -> None:
        try:
            report = doctor()
        except LabError as error:
            if "Hatari executable" in str(error):
                self.skipTest(str(error))
            raise
        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["authority"]["authority"], "working-authority")

    def test_reproduce_matches_normalized_title_screen_evidence(self) -> None:
        if os.environ.get("DAMOCLAB_INTEGRATION") != "1":
            self.skipTest("Set DAMOCLAB_INTEGRATION=1 to launch Hatari twice")
        result = reproduce()
        self.assertEqual(result["status"], "reproducible")
        self.assertEqual(result["evidenceClass"], "working-authority-evidence")


if __name__ == "__main__":
    unittest.main()
