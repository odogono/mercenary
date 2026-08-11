from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.toolchain import parse_homebrew_vice_version, version_at_least  # noqa: E402


class ToolchainTests(unittest.TestCase):
    def test_parses_homebrew_formula_version(self) -> None:
        self.assertEqual(parse_homebrew_vice_version("vice 3.10\n"), (3, 10, 0))
        self.assertEqual(parse_homebrew_vice_version("vice 3.10_1\n"), (3, 10, 0))

    def test_compares_semantic_numeric_versions(self) -> None:
        self.assertTrue(version_at_least((3, 10, 0), "3.10"))
        self.assertTrue(version_at_least((4, 0, 0), "3.10"))
        self.assertFalse(version_at_least((3, 9, 9), "3.10"))


if __name__ == "__main__":
    unittest.main()
