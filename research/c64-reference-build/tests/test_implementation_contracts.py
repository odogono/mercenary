from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = LAB_ROOT.parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError  # noqa: E402
from c64lab.implementation_contracts import (  # noqa: E402
    domain_digest,
    mcj_bytes,
    parse_mcj_bytes,
    validate_implementation_contracts,
    validate_resource_graph,
    validate_safe_diagnostic,
)


class MercenaryCanonicalJSONTests(unittest.TestCase):
    def test_encodes_sorted_closed_integer_json(self) -> None:
        value = {"z": -9223372036854775808, "a": [True, None, "é", 0]}

        self.assertEqual(
            mcj_bytes(value),
            b'{"a":[true,null,"\xc3\xa9",0],"z":-9223372036854775808}',
        )

    def test_rejects_float_values(self) -> None:
        with self.assertRaisesRegex(LabError, "floating-point"):
            mcj_bytes({"value": 1.0})

    def test_rejects_integers_outside_int64(self) -> None:
        with self.assertRaisesRegex(LabError, "Int64"):
            mcj_bytes({"value": 9223372036854775808})

    def test_rejects_strings_over_the_profile_limit(self) -> None:
        with self.assertRaisesRegex(LabError, "string limit"):
            mcj_bytes({"value": "x" * (1024 * 1024 + 1)})

    def test_preflight_rejects_duplicate_keys_and_noncanonical_bytes(self) -> None:
        with self.assertRaisesRegex(LabError, "duplicate key"):
            parse_mcj_bytes(b'{"a":1,"a":2}')
        with self.assertRaisesRegex(LabError, "not canonical MCJ-1"):
            parse_mcj_bytes(b'{ "a": 1 }')


class DomainDigestTests(unittest.TestCase):
    def test_separates_digest_families(self) -> None:
        content = b"same bytes"

        member = domain_digest("member", content)
        package = domain_digest("package", content)

        self.assertNotEqual(member, package)
        self.assertEqual(
            member,
            hashlib.sha256(b"mercenary/member/v1\0" + content).hexdigest(),
        )

    def test_rejects_unknown_digest_family(self) -> None:
        with self.assertRaisesRegex(LabError, "digest family"):
            domain_digest("made-up", b"payload")


class DiagnosticTests(unittest.TestCase):
    def test_accepts_allowlisted_diagnostic_fields(self) -> None:
        validate_safe_diagnostic(
            {
                "schemaMajor": 1,
                "schemaMinor": 0,
                "code": "package.member-limit",
                "severity": "error",
                "safeContentSetId": "org.example.synthetic",
                "safeModuleId": "org.example.synthetic.rules",
                "safeContext": {"limit": 4096, "actual": 4097},
            }
        )

    def test_rejects_paths_payloads_and_hashes(self) -> None:
        for forbidden in ("path", "payload", "sha256"):
            with self.subTest(forbidden=forbidden):
                with self.assertRaisesRegex(LabError, "unsafe diagnostic"):
                    validate_safe_diagnostic(
                        {
                            "schemaMajor": 1,
                            "schemaMinor": 0,
                            "code": "package.rejected",
                            "severity": "error",
                            forbidden: "secret",
                        }
                    )


class ResourceGraphTests(unittest.TestCase):
    def test_rejects_duplicate_records_and_dangling_edges(self) -> None:
        duplicate = {
            "records": [{"id": "same"}, {"id": "same"}],
            "referenceEdges": [],
        }
        with self.assertRaisesRegex(LabError, "duplicate record"):
            validate_resource_graph(duplicate)

        dangling = {
            "records": [{"id": "source"}],
            "referenceEdges": [{"source": "source", "target": "missing"}],
        }
        with self.assertRaisesRegex(LabError, "dangling reference"):
            validate_resource_graph(dangling)


class ContractBundleTests(unittest.TestCase):
    def test_repository_contract_bundle_is_complete_and_valid(self) -> None:
        result = validate_implementation_contracts(REPOSITORY_ROOT / "implementation-contracts")

        self.assertGreaterEqual(result["jsonSchemas"], 10)
        self.assertGreaterEqual(result["cddlFiles"], 5)
        self.assertGreaterEqual(result["positiveVectors"], 4)
        self.assertGreaterEqual(result["negativeVectors"], 8)
        self.assertGreaterEqual(result["maliciousFixtures"], 14)
        self.assertGreaterEqual(result["fuzzTargets"], 10)
        self.assertEqual(result["schemaMajor"], 1)
        self.assertEqual(result["schemaMinor"], 0)


if __name__ == "__main__":
    unittest.main()
