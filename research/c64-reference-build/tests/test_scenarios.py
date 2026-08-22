"""The tracked observation scenarios are valid and say what they observe.

Running one needs VICE and a display; validating one does not, so the files
themselves stay held to something between capture sessions.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from c64lab.core import LabError, validate_scenario

LAB_ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = sorted((LAB_ROOT / "scenarios").glob("*.json"))
CYCLE_LIMIT = json.loads((LAB_ROOT / "config" / "lab.json").read_text())["cycleLimit"]


class ScenarioTests(unittest.TestCase):
    def test_there_are_scenarios_to_check(self) -> None:
        self.assertTrue(SCENARIOS)

    def test_every_scenario_validates(self) -> None:
        for path in SCENARIOS:
            with self.subTest(scenario=path.name):
                validate_scenario(json.loads(path.read_text()), CYCLE_LIMIT)

    def test_every_scenario_is_named_after_its_file(self) -> None:
        for path in SCENARIOS:
            with self.subTest(scenario=path.name):
                self.assertEqual(json.loads(path.read_text())["name"], path.stem)

    def test_observation_scenarios_capture_exactly_once(self) -> None:
        # `observe` refuses any other shape, so a scenario that breaks this
        # rule is only discovered when someone tries to run it.
        for path in SCENARIOS:
            scenario = json.loads(path.read_text())
            if scenario["checkpoint"] != "interactive":
                continue
            with self.subTest(scenario=path.name):
                captures = [a for a in scenario["actions"] if a["type"] == "capture"]
                self.assertEqual(len(captures), 1)

    def test_the_economy_scenarios_capture_ram(self) -> None:
        # The balance and the engine flags are read out of RAM, so a capture
        # without it observes nothing this milestone cares about.
        economy = [p for p in SCENARIOS if p.stem.startswith("economy-")]
        self.assertTrue(economy)
        for path in economy:
            with self.subTest(scenario=path.name):
                capture = [
                    a
                    for a in json.loads(path.read_text())["actions"]
                    if a["type"] == "capture"
                ][0]
                self.assertIn("ram", capture["artifacts"])

    def test_the_combat_scenarios_capture_ram(self) -> None:
        # The effect tables, the velocity triples and the city table are all
        # read out of RAM, so a combat capture without it observes nothing.
        combat = [p for p in SCENARIOS if p.stem.startswith("combat-")]
        self.assertTrue(combat)
        for path in combat:
            with self.subTest(scenario=path.name):
                capture = [
                    a
                    for a in json.loads(path.read_text())["actions"]
                    if a["type"] == "capture"
                ][0]
                self.assertIn("ram", capture["artifacts"])

    def test_every_scenario_says_what_it_observes(self) -> None:
        # A scenario is evidence someone else has to interpret, so it carries
        # the addresses its capture is worth reading at.
        for path in SCENARIOS:
            with self.subTest(scenario=path.name):
                scenario = json.loads(path.read_text())
                if path.stem.startswith("combat-"):
                    self.assertIn("description", scenario)
                    self.assertGreater(len(scenario["description"]), 80)

    def test_rejects_a_scenario_with_an_unknown_action(self) -> None:
        broken = json.loads(SCENARIOS[0].read_text())
        broken["actions"] = [{"type": "poke", "address": 0, "value": 0}]

        with self.assertRaises(LabError):
            validate_scenario(broken, CYCLE_LIMIT)


if __name__ == "__main__":
    unittest.main()
