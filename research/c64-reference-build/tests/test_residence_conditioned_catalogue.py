from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.catalogue import validate_residence_conditioned_effects
from c64lab.core import LabError
from c64lab.object_effects import decode_residence_effect_census


MATRIX = LAB_ROOT / "catalogue" / "residence-conditioned-effects.json"


class ResidenceConditionedCatalogueTests(unittest.TestCase):
    def matrix(self) -> dict:
        return json.loads(MATRIX.read_text(encoding="utf-8"))

    def test_accepts_the_complete_bound_census(self) -> None:
        result = validate_residence_conditioned_effects(self.matrix())
        self.assertEqual(result["effects"], 31)
        self.assertEqual(result["confirmedMissing"], 2)

    def test_decoder_census_matches_the_matrix_digest(self) -> None:
        ram = bytearray(65536)
        for address, shape in [
            (0x91F2, "a910201a94f01120"),
            (0x87AF, "add829306220ac96"),
            (0xB53D, "a5caf00160adda29"),
            (0x9817, "addb293007bdc029"),
            (0x9F8A, "acdc291009a4a9c001d00318"),
            (0xA050, "aedc291008a6a9e001d002a95a"),
            (0x9374, "a900aee8291002a9"),
            (0x9493, "a509290fc9089006"),
            (0x948E, "adf029300ea50929"),
            (0x980B, "adef293013bdc029"),
            (0x98FE, "adf8293004a57ff0"),
            (0xB430, "e005d00aadee2930"),
        ]:
            raw = bytes.fromhex(shape)
            ram[address : address + len(raw)] = raw
        benson = json.loads((LAB_ROOT.parents[1] / "payload" / "benson.json").read_text(encoding="utf-8"))

        census = decode_residence_effect_census(bytes(ram), benson)

        declared = self.matrix()["census"]
        self.assertEqual(census["nativeSites"], declared["nativeSites"])
        self.assertEqual(census["bensonSites"], declared["bensonSites"])
        self.assertEqual(census["digest"], declared["digest"])

        altered_ram = bytearray(ram)
        altered_ram[0xB53D] = 0
        with self.assertRaisesRegex(LabError, "metal-detector"):
            decode_residence_effect_census(bytes(altered_ram), benson)

        altered_ram = bytearray(ram)
        altered_ram[0xA050] = 0
        with self.assertRaisesRegex(LabError, "poweramp"):
            decode_residence_effect_census(bytes(altered_ram), benson)

        altered_benson = copy.deepcopy(benson)
        altered_benson["instructions"][265]["op"] = "ret"
        with self.assertRaisesRegex(LabError, "Antenna"):
            decode_residence_effect_census(bytes(ram), altered_benson)

        altered_benson = copy.deepcopy(benson)
        altered_benson["instructions"][382]["op"] = "ret"
        with self.assertRaisesRegex(LabError, "predicate inventory"):
            decode_residence_effect_census(bytes(ram), altered_benson)

        altered_benson = copy.deepcopy(benson)
        altered_benson["instructions"].append({"op": "tsti"})
        with self.assertRaisesRegex(LabError, "predicate inventory"):
            decode_residence_effect_census(bytes(ram), altered_benson)

    def test_rejects_an_incomplete_or_stale_census_mapping(self) -> None:
        document = self.matrix()
        document["effects"][0]["censusKeys"] = []
        with self.assertRaises(LabError):
            validate_residence_conditioned_effects(document)

        document = self.matrix()
        document["census"]["nativeSites"].append("native:invented:ffff")
        with self.assertRaisesRegex(LabError, "digest"):
            validate_residence_conditioned_effects(document)

    def test_rejects_duplicate_effects_unknown_evidence_and_missing_dispositions(self) -> None:
        document = self.matrix()
        document["effects"].append(copy.deepcopy(document["effects"][0]))
        with self.assertRaisesRegex(LabError, "repeats"):
            validate_residence_conditioned_effects(document)

        document = self.matrix()
        document["effects"][0]["evidenceIds"] = ["RCE-EV-9999"]
        with self.assertRaisesRegex(LabError, "unknown evidence"):
            validate_residence_conditioned_effects(document)

        document = self.matrix()
        del document["effects"][0]["browserDisposition"]
        with self.assertRaisesRegex(LabError, "schema validation"):
            validate_residence_conditioned_effects(document)


if __name__ == "__main__":
    unittest.main()
