from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.prng import (
    RANDOM_ROUTINE,
    RANDOM_STATE,
    RANDOM_VALUE,
    decode_reference_prng,
    step_reference_prng,
)


class DecodeTests(unittest.TestCase):
    @staticmethod
    def image() -> bytes:
        ram = bytearray(65536)
        for address, values in (
            (RANDOM_ROUTINE, (0xA5, RANDOM_VALUE, 0x6A, 0x6A, 0x6A)),
            (RANDOM_ROUTINE + 5, (0x45, RANDOM_VALUE, 0x6A)),
            (RANDOM_ROUTINE + 8, (0x66, RANDOM_STATE)),
            (RANDOM_ROUTINE + 10, (0x66, RANDOM_VALUE, 0x60)),
        ):
            ram[address:address + len(values)] = bytes(values)
        return bytes(ram)

    def test_decodes_the_shared_carry_sensitive_generator(self) -> None:
        contract = decode_reference_prng(self.image())

        self.assertEqual(contract["routineAddress"], RANDOM_ROUTINE)
        self.assertEqual(
            contract["state"],
            {"valueAddress": RANDOM_VALUE, "stateAddress": RANDOM_STATE, "bytes": 2},
        )
        self.assertEqual(contract["carryIn"], "caller-provided")
        self.assertEqual(contract["output"], "accumulator")

    def test_rejects_a_changed_generator_fingerprint(self) -> None:
        ram = bytearray(self.image())
        ram[RANDOM_ROUTINE + 3] = 0xEA

        with self.assertRaisesRegex(LabError, "pseudo-random generator"):
            decode_reference_prng(bytes(ram))


class StepTests(unittest.TestCase):
    def test_steps_the_rotate_xor_recurrence(self) -> None:
        self.assertEqual(
            step_reference_prng(value=0x01, state=0x00, carry_in=0),
            {"output": 0x20, "value": 0x00, "state": 0x80, "carry": 1},
        )

    def test_the_callers_carry_changes_the_output(self) -> None:
        clear = step_reference_prng(value=0, state=0, carry_in=0)
        set_ = step_reference_prng(value=0, state=0, carry_in=1)

        self.assertEqual(clear["output"], 0)
        self.assertEqual(set_["output"], 0x10)

    def test_rejects_values_outside_machine_byte_and_carry_ranges(self) -> None:
        for arguments in (
            {"value": -1, "state": 0, "carry_in": 0},
            {"value": 0, "state": 256, "carry_in": 0},
            {"value": 0, "state": 0, "carry_in": 2},
        ):
            with self.subTest(arguments=arguments):
                with self.assertRaises(LabError):
                    step_reference_prng(**arguments)


class BrowserFixtureTests(unittest.TestCase):
    """Keep the browser's port and this implementation on the same recurrence.

    The browser cannot import this module, so the two agree through a tracked
    fixture instead: the port replays it in `web/test/reference-prng.test.ts`,
    and this re-derives every row. Either side drifting fails its own suite
    rather than surfacing as an unexplained difference in a terminal
    presentation months later.
    """

    def setUp(self) -> None:
        fixture = LAB_ROOT.parents[1] / "web/test/fixtures/referencePrng.json"
        if not fixture.exists():
            self.skipTest("browser PRNG fixture is not present in this checkout")
        self.document = json.loads(fixture.read_text())

    def test_re_derives_every_independent_probe(self) -> None:
        probes = self.document["independent"]
        self.assertGreater(len(probes), 0)
        for probe in probes:
            given = probe["given"]
            with self.subTest(**given):
                self.assertEqual(
                    step_reference_prng(
                        value=given["value"],
                        state=given["state"],
                        carry_in=given["carryIn"],
                    ),
                    probe["then"],
                )

    def test_re_derives_the_chain(self) -> None:
        start = self.document["chain"]["from"]
        value, state, carry = start["value"], start["state"], start["carryIn"]
        for index, expected in enumerate(self.document["chain"]["steps"]):
            with self.subTest(step=index):
                stepped = step_reference_prng(
                    value=value, state=state, carry_in=carry
                )
                self.assertEqual(stepped, expected)
            value, state, carry = (
                stepped["value"],
                stepped["state"],
                stepped["carry"],
            )


if __name__ == "__main__":
    unittest.main()
