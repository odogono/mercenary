from __future__ import annotations

import sys
import unittest
from pathlib import Path


LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from c64lab.core import LabError
from c64lab.semantics import (
    assert_semantic_observations,
    classify_semantic_outcome,
    decode_semantic_observations,
    pal_forward_delta,
    semantic_boundary_address,
    stratified_pal_targets,
    validate_event_history_capture,
    validate_event_history_replay,
    validate_pal_phase_coverage,
)


class SemanticObservationTests(unittest.TestCase):
    def test_resolves_an_opaque_semantic_boundary(self) -> None:
        observation_map = {
            "schemaVersion": 1,
            "observations": [{"id": "mode", "type": "integer", "bank": "ram", "address": 1, "width": 1}],
            "boundaries": [{"id": "input-sampled", "address": 0x2345}],
        }

        self.assertEqual(semantic_boundary_address(observation_map, "input-sampled"), 0x2345)
        with self.assertRaisesRegex(LabError, "unknown semantic boundary"):
            semantic_boundary_address(observation_map, "missing")
    def test_decodes_integer_boolean_and_enum_observations(self) -> None:
        memory = {"ram": bytes.fromhex("00 34 12 04 02")}
        observation_map = {
            "schemaVersion": 1,
            "observations": [
                {"id": "position", "type": "integer", "bank": "ram", "address": 1, "width": 2, "endianness": "little"},
                {"id": "moving", "type": "boolean", "bank": "ram", "address": 3, "width": 1, "mask": 4, "shift": 2},
                {
                    "id": "mode",
                    "type": "enum",
                    "bank": "ram",
                    "address": 4,
                    "width": 1,
                    "values": {"1": "SM-0001", "2": "SM-0002"},
                },
            ],
        }

        self.assertEqual(
            decode_semantic_observations(memory, observation_map),
            {"position": 0x1234, "moving": True, "mode": "SM-0002"},
        )

    def test_applies_mask_shift_and_signed_decoding_before_asserting(self) -> None:
        before = {"speed": -2, "heading": 4, "mode": "SM-0001"}
        after = {"speed": -1, "heading": 6, "mode": "SM-0001"}

        assert_semantic_observations(
            before,
            after,
            [
                {"operator": "equals", "observation": "speed", "value": -1},
                {"operator": "not-equals", "observation": "heading", "value": 4},
                {"operator": "unchanged", "observation": "mode"},
                {"operator": "changed", "observation": "heading"},
                {"operator": "delta", "observation": "heading", "value": 2},
                {"operator": "range", "observation": "speed", "minimum": -2, "maximum": 0},
                {"operator": "member", "observation": "mode", "values": ["SM-0001", "SM-0002"]},
            ],
        )

    def test_rejects_a_failed_assertion_with_public_safe_identifiers(self) -> None:
        with self.assertRaisesRegex(LabError, "heading.*delta"):
            assert_semantic_observations(
                {"heading": 4},
                {"heading": 5},
                [{"operator": "delta", "observation": "heading", "value": 2}],
            )

    def test_classifies_exactly_one_typed_outcome(self) -> None:
        outcomes = [
            {"id": "unchanged", "assertions": [{"operator": "equals", "observation": "encounter", "value": 0}]},
            {"id": "arrived", "assertions": [{"operator": "equals", "observation": "encounter", "value": 1}]},
        ]

        self.assertEqual(classify_semantic_outcome({}, {"encounter": 1}, outcomes), "arrived")

        with self.assertRaisesRegex(LabError, "exactly one"):
            classify_semantic_outcome({}, {"encounter": 2}, outcomes)

    def test_classifies_transition_outcomes_against_before_and_after_captures(self) -> None:
        outcomes = [
            {"id": "moved", "assertions": [{"operator": "changed", "observation": "x"}]},
            {"id": "still", "assertions": [{"operator": "unchanged", "observation": "x"}]},
        ]

        self.assertEqual(classify_semantic_outcome({"x": 10}, {"x": 12}, outcomes), "moved")


class PalSamplingTests(unittest.TestCase):
    def test_counts_pal_cycles_across_a_frame_wrap(self) -> None:
        self.assertEqual(pal_forward_delta(311, 61, 0, 2), 4)

    def test_stratifies_midpoints_across_the_decoded_period(self) -> None:
        targets = stratified_pal_targets(period_cycles=19_656, trials=100)

        self.assertEqual(len(targets), 100)
        self.assertEqual(len({item["phaseCycle"] for item in targets}), 100)
        self.assertGreater(targets[0]["phaseCycle"], 0)
        self.assertLess(targets[-1]["phaseCycle"], 19_656)
        self.assertEqual(targets[0]["rasterCycle"], targets[0]["phaseCycle"] % 63)
        self.assertEqual(targets[0]["rasterLine"], targets[0]["phaseCycle"] // 63)

    def test_rejects_a_period_too_small_for_distinct_phase_trials(self) -> None:
        with self.assertRaisesRegex(LabError, "distinct"):
            stratified_pal_targets(period_cycles=10, trials=100)

    def test_rejects_duplicate_or_excessively_late_actual_pal_phases(self) -> None:
        targets = stratified_pal_targets(period_cycles=20_000, trials=100)
        actuals = [{"elapsedCycles": target["phaseCycle"] + 2} for target in targets]
        validate_pal_phase_coverage(targets, actuals, period_cycles=20_000)

        actuals[-1] = {"elapsedCycles": actuals[0]["elapsedCycles"]}
        with self.assertRaisesRegex(LabError, "phase coverage"):
            validate_pal_phase_coverage(targets, actuals, period_cycles=20_000)


class EventHistorySafetyTests(unittest.TestCase):
    def test_accepts_typed_replay_after_the_only_startup_reset(self) -> None:
        validate_event_history_replay(
            "Main CPU: RESET.\nMonitor playback command: x\nUnit 8: RESET (For undump).\n",
            {"mode": "SM-0001", "x": 10},
            {"mode": "SM-0001", "x": 10},
        )

    def test_rejects_early_cli_playback_reset_and_typed_divergence(self) -> None:
        with self.assertRaisesRegex(LabError, "startup reset"):
            validate_event_history_replay(
                "Unit 8: RESET (For undump).\nMain CPU: RESET.\n",
                {"mode": "SM-0001"},
                {"mode": "SM-0001"},
            )
        with self.assertRaisesRegex(LabError, "typed observations"):
            validate_event_history_replay(
                "Main CPU: RESET.\nUnit 8: RESET (For undump).\n",
                {"mode": "SM-0001"},
                {"mode": "SM-0002"},
            )

    def test_accepts_a_bounded_capture_for_the_exact_vice_process(self) -> None:
        validate_event_history_capture(
            {
                "schemaVersion": 1,
                "vicePid": 123,
                "viceExecutableSha256": "a" * 64,
                "windowOwner": "x64sc",
                "windowTitle": "VICE (C64SC)",
                "durationMilliseconds": 2500,
                "eventHistory": {
                    "startSnapshotPath": "/tmp/start.vsf",
                    "endSnapshotPath": "/tmp/end.vsf",
                    "hotkeyFilePath": "/tmp/history.vhk",
                    "hotkeyFileSha256": "b" * 64,
                },
                "events": [
                    {"atMilliseconds": 100, "type": "key-down", "keyCode": 0},
                    {"atMilliseconds": 1100, "type": "key-up", "keyCode": 0},
                ],
            }
        )

    def test_rejects_unbounded_or_unbalanced_key_events(self) -> None:
        request = {
            "schemaVersion": 1,
            "vicePid": 123,
            "viceExecutableSha256": "a" * 64,
            "windowOwner": "x64sc",
            "windowTitle": "VICE (C64SC)",
            "durationMilliseconds": 2500,
            "eventHistory": {
                "startSnapshotPath": "/tmp/start.vsf",
                "endSnapshotPath": "/tmp/end.vsf",
                "hotkeyFilePath": "/tmp/history.vhk",
                "hotkeyFileSha256": "b" * 64,
            },
            "events": [{"atMilliseconds": 100, "type": "key-down", "keyCode": 0}],
        }

        with self.assertRaisesRegex(LabError, "released"):
            validate_event_history_capture(request)

    def test_rejects_event_history_that_could_overwrite_one_snapshot_twice(self) -> None:
        request = {
            "schemaVersion": 1,
            "vicePid": 123,
            "viceExecutableSha256": "a" * 64,
            "windowOwner": "x64sc",
            "windowTitle": "VICE (C64SC)",
            "durationMilliseconds": 100,
            "eventHistory": {
                "startSnapshotPath": "/tmp/same.vsf",
                "endSnapshotPath": "/tmp/same.vsf",
                "hotkeyFilePath": "/tmp/history.vhk",
                "hotkeyFileSha256": "b" * 64,
            },
            "events": [
                {"atMilliseconds": 10, "type": "key-down", "keyCode": 0},
                {"atMilliseconds": 20, "type": "key-up", "keyCode": 0},
            ],
        }

        with self.assertRaisesRegex(LabError, "distinct snapshots"):
            validate_event_history_capture(request)

    def test_rejects_a_modal_or_unpinned_history_hotkey_map(self) -> None:
        request = {
            "schemaVersion": 1,
            "vicePid": 123,
            "viceExecutableSha256": "a" * 64,
            "windowOwner": "x64sc",
            "windowTitle": "VICE Error",
            "durationMilliseconds": 100,
            "eventHistory": {
                "startSnapshotPath": "/tmp/start.vsf",
                "endSnapshotPath": "/tmp/end.vsf",
                "hotkeyFilePath": "/tmp/history.vhk",
                "hotkeyFileSha256": "not-a-digest",
            },
            "events": [
                {"atMilliseconds": 10, "type": "key-down", "keyCode": 0},
                {"atMilliseconds": 20, "type": "key-up", "keyCode": 0},
            ],
        }

        with self.assertRaisesRegex(LabError, "main window"):
            validate_event_history_capture(request)


if __name__ == "__main__":
    unittest.main()
