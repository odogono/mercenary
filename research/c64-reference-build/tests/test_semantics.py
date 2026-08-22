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
    run_host_key_bursts,
    run_held_host_key_sequence,
    run_phase_aligned_matrix_sequence,
    semantic_boundary_address,
    summarize_pal_cadence,
    stratified_pal_targets,
    validate_event_history_capture,
    validate_event_history_proof,
    validate_event_history_replay,
    validate_pal_phase_coverage,
)


class FakePhaseMonitor:
    def __init__(self, steps: list[tuple[int, dict[str, int]]]):
        self.steps = iter(steps)
        self.current = {"PC": 0x1000, "X": 0, "LIN": 1, "CYC": 2}
        self.matrix_writes: list[list[int]] = []
        self.checkpoint_address = 0
        self.resume_count = 0
        self.resume_results: list[dict[str, int]] = []

    def clear_checkpoints(self) -> list[int]:
        return []

    def set_checkpoint(self, address: int) -> int:
        self.checkpoint_address = address
        return 1

    def resume_until_checkpoint(self, checkpoint: int) -> int:
        self.resume_count += 1
        self.current = (
            self.resume_results.pop(0)
            if self.resume_results
            else {"PC": self.checkpoint_address, "X": 0, "LIN": 10, "CYC": 11}
        )
        return self.checkpoint_address

    def registers(self) -> dict[str, int]:
        return dict(self.current)

    def keyboard_matrix_set(self, rows: list[int]) -> None:
        self.matrix_writes.append(list(rows))

    def keyboard_matrix(self) -> list[int]:
        return list(self.matrix_writes[-1])

    def advance_instructions(self, count: int) -> int:
        pc, registers = next(self.steps)
        self.current = dict(registers)
        return pc


class PhaseAlignedMatrixTests(unittest.TestCase):
    def test_records_exact_boundaries_and_requires_the_semantic_handler(self) -> None:
        neutral = [0] * 16
        command = [0, 32, *([0] * 14)]
        modifier = [*([0] * 7), 4, *([0] * 8)]
        monitor = FakePhaseMonitor([
            (0x2000, {"PC": 0x2000, "X": 2, "LIN": 20, "CYC": 21}),
            (0x2000, {"PC": 0x2000, "X": 7, "LIN": 22, "CYC": 23}),
            (0x3000, {"PC": 0x3000, "X": 7, "LIN": 24, "CYC": 25}),
            (0x3001, {"PC": 0x3001, "X": 7, "LIN": 24, "CYC": 27}),
        ])

        report = run_phase_aligned_matrix_sequence(monitor, {
            "scannerEntryPc": 0x1000,
            "rowPc": 0x2000,
            "handlerPc": 0x3000,
            "initialRows": command,
            "switches": [
                {"beforeRow": 2, "rows": neutral},
                {"beforeRow": 7, "rows": modifier},
            ],
            "maxInstructions": 10,
        })

        self.assertEqual([item["id"] for item in report["boundaries"]], [
            "scanner-entry", "matrix-switch-1", "matrix-switch-2", "semantic-handler",
        ])
        self.assertEqual(report["boundaries"][-1]["registers"]["LIN"], 24)
        self.assertEqual(monitor.matrix_writes, [command, neutral, modifier, neutral])

    def test_neutralizes_the_matrix_when_a_boundary_is_not_reached(self) -> None:
        monitor = FakePhaseMonitor([
            (0x2222, {"PC": 0x2222, "X": 1, "LIN": 1, "CYC": 1}),
            (0x2222, {"PC": 0x2222, "X": 1, "LIN": 1, "CYC": 2}),
        ])

        with self.assertRaisesRegex(LabError, "matrix-switch boundary"):
            run_phase_aligned_matrix_sequence(monitor, {
                "scannerEntryPc": 0x1000,
                "rowPc": 0x2000,
                "handlerPc": 0x3000,
                "initialRows": [1] + [0] * 15,
                "switches": [{"beforeRow": 2, "rows": [0] * 16}],
                "maxInstructions": 2,
            })

        self.assertEqual(monitor.matrix_writes[-1], [0] * 16)

    def test_rejects_a_matrix_readback_mismatch(self) -> None:
        class MismatchedReadbackMonitor(FakePhaseMonitor):
            def keyboard_matrix(self) -> list[int]:
                return [0] * 16

        monitor = MismatchedReadbackMonitor([])
        with self.assertRaisesRegex(LabError, "matrix readback"):
            run_phase_aligned_matrix_sequence(monitor, {
                "scannerEntryPc": 0x1000,
                "rowPc": 0x2000,
                "handlerPc": 0x3000,
                "initialRows": [1] + [0] * 15,
                "switches": [{"beforeRow": 2, "rows": [0] * 16}],
            })

        self.assertEqual(monitor.matrix_writes[-1], [0] * 16)

    def test_can_chain_from_an_already_stopped_scanner_entry(self) -> None:
        monitor = FakePhaseMonitor([
            (0x2000, {"PC": 0x2000, "X": 2, "LIN": 20, "CYC": 21}),
            (0x3000, {"PC": 0x3000, "X": 2, "LIN": 21, "CYC": 22}),
            (0x3001, {"PC": 0x3001, "X": 2, "LIN": 21, "CYC": 24}),
        ])

        run_phase_aligned_matrix_sequence(monitor, {
            "scannerEntryPc": 0x1000,
            "startAtCurrent": True,
            "rowPc": 0x2000,
            "handlerPc": 0x3000,
            "initialRows": [1] + [0] * 15,
            "switches": [{"beforeRow": 2, "rows": [0] * 16}],
        })

        self.assertEqual(monitor.resume_count, 0)

    def test_requires_multiple_held_handler_occurrences(self) -> None:
        held = [1] + [0] * 15
        monitor = FakePhaseMonitor([
            (0x2000, {"PC": 0x2000, "X": 2, "LIN": 20, "CYC": 21}),
            (0x3000, {"PC": 0x3000, "X": 2, "LIN": 21, "CYC": 22}),
            (0x3001, {"PC": 0x3001, "X": 2, "LIN": 21, "CYC": 24}),
            (0x3000, {"PC": 0x3000, "X": 2, "LIN": 25, "CYC": 30}),
            (0x3001, {"PC": 0x3001, "X": 2, "LIN": 25, "CYC": 32}),
        ])

        report = run_phase_aligned_matrix_sequence(monitor, {
            "scannerEntryPc": 0x1000,
            "rowPc": 0x2000,
            "handlerPc": 0x3000,
            "handlerOccurrences": 2,
            "initialRows": held,
            "switches": [{"beforeRow": 2, "rows": held}],
        })

        self.assertEqual(
            [item["id"] for item in report["boundaries"][-2:]],
            ["semantic-handler-1", "semantic-handler-2"],
        )

    def test_can_use_checkpoints_between_held_handler_occurrences(self) -> None:
        held = [1] + [0] * 15
        monitor = FakePhaseMonitor([
            (0x2000, {"PC": 0x2000, "X": 2, "LIN": 20, "CYC": 21}),
            (0x3001, {"PC": 0x3001, "X": 2, "LIN": 21, "CYC": 24}),
            (0x3001, {"PC": 0x3001, "X": 2, "LIN": 25, "CYC": 32}),
        ])
        monitor.resume_results = [
            {"PC": 0x1000, "X": 0, "LIN": 10, "CYC": 11},
            {"PC": 0x3000, "X": 2, "LIN": 21, "CYC": 22},
            {"PC": 0x3000, "X": 2, "LIN": 25, "CYC": 30},
        ]

        report = run_phase_aligned_matrix_sequence(monitor, {
            "scannerEntryPc": 0x1000,
            "rowPc": 0x2000,
            "handlerPc": 0x3000,
            "handlerOccurrences": 2,
            "useHandlerCheckpoints": True,
            "initialRows": held,
            "switches": [{"beforeRow": 2, "rows": held}],
        })

        self.assertEqual(monitor.resume_count, 3)
        self.assertEqual(report["boundaries"][-1]["registers"]["LIN"], 25)


class FakeHeldKeyMonitor:
    def __init__(self, hits: list[tuple[int, int, int]]):
        self.hits = iter(hits)
        self.current = {"PC": 0, "LIN": 0, "CYC": 0}
        self.clock = 0
        self.checkpoint = 0
        self.host_events: list[tuple[int, int, bool]] = []

    def clear_checkpoints(self) -> list[int]:
        return []

    def host_key_event(self, key_symbol: int, *, modifiers: int, pressed: bool) -> None:
        self.host_events.append((key_symbol, modifiers, pressed))

    def set_checkpoint(self, address: int) -> int:
        self.checkpoint = address
        return 1

    def resume_until_checkpoint(self, checkpoint: int) -> int:
        self.clock, line, cycle = next(self.hits)
        self.current = {"PC": self.checkpoint, "LIN": line, "CYC": cycle}
        return self.checkpoint

    def registers(self) -> dict[str, int]:
        return dict(self.current)

    def cpu_history(self, count: int) -> list[dict[str, object]]:
        return [{"clock": self.clock, "registers": {"PC": self.current["PC"]}}]

    def advance_instructions(self, count: int) -> int:
        self.current["PC"] += count
        return self.current["PC"]


class HeldHostKeyTests(unittest.TestCase):
    def test_records_exact_handler_cadence_and_releases_the_key(self) -> None:
        monitor = FakeHeldKeyMonitor([
            (1_000, 10, 5),
            (1_100, 11, 42),
            (1_220, 13, 36),
        ])

        report = run_held_host_key_sequence(
            monitor,
            key_symbol=45,
            modifiers=0,
            handler_pc=0x3000,
            occurrences=3,
        )

        self.assertEqual(report["handlerClocks"], [1_000, 1_100, 1_220])
        self.assertEqual(report["intervalCycles"], [100, 120])
        self.assertEqual(monitor.host_events, [(45, 0, True), (45, 0, False)])

    def test_releases_the_key_when_a_handler_is_not_reached(self) -> None:
        monitor = FakeHeldKeyMonitor([])

        with self.assertRaises(StopIteration):
            run_held_host_key_sequence(
                monitor,
                key_symbol=43,
                modifiers=0,
                handler_pc=0x3000,
                occurrences=2,
            )

        self.assertEqual(monitor.host_events[-1], (43, 0, False))

    def test_allows_a_bounded_saturation_probe_longer_than_one_hundred_occurrences(self) -> None:
        frame_cycles = 312 * 63
        monitor = FakeHeldKeyMonitor([
            (1_000 + occurrence * frame_cycles, 10, 5)
            for occurrence in range(101)
        ])

        report = run_held_host_key_sequence(
            monitor,
            key_symbol=45,
            modifiers=0,
            handler_pc=0x3000,
            occurrences=101,
        )

        self.assertEqual(len(report["handlerClocks"]), 101)
        self.assertEqual(monitor.host_events[-1], (45, 0, False))

    def test_repeats_bounded_holds_after_an_observed_release_boundary(self) -> None:
        frame_cycles = 312 * 63
        monitor = FakeHeldKeyMonitor([
            (1_000, 10, 5),
            (1_000 + frame_cycles, 10, 5),
            (1_000 + 2 * frame_cycles, 10, 5),
            (1_000 + 3 * frame_cycles, 10, 5),
            (1_000 + 4 * frame_cycles, 10, 5),
        ])

        report = run_host_key_bursts(
            monitor,
            key_symbol=45,
            modifiers=0,
            handler_pc=0x3000,
            occurrences_per_burst=2,
            bursts=2,
            release_boundary_pc=0x1000,
        )

        self.assertEqual(len(report["bursts"]), 2)
        self.assertEqual(
            monitor.host_events,
            [(45, 0, True), (45, 0, False), (45, 0, True), (45, 0, False)],
        )
        self.assertEqual(report["releaseBoundaries"], [{"burst": 1, "pc": 0x1000}])

    def test_accepts_a_per_burst_occurrence_schedule(self) -> None:
        frame_cycles = 312 * 63
        monitor = FakeHeldKeyMonitor([
            (1_000 + occurrence * frame_cycles, 10, 5)
            for occurrence in range(4)
        ])

        report = run_host_key_bursts(
            monitor,
            key_symbol=45,
            modifiers=0,
            handler_pc=0x3000,
            occurrences_per_burst=[2, 1],
            bursts=2,
            release_boundary_pc=0x1000,
        )

        self.assertEqual([len(item["handlerClocks"]) for item in report["bursts"]], [2, 1])

    def test_can_observe_release_after_the_final_burst(self) -> None:
        frame_cycles = 312 * 63
        monitor = FakeHeldKeyMonitor([
            (1_000 + occurrence * frame_cycles, 10, 5)
            for occurrence in range(2)
        ])

        report = run_host_key_bursts(
            monitor,
            key_symbol=45,
            modifiers=0,
            handler_pc=0x3000,
            occurrences_per_burst=1,
            bursts=1,
            release_boundary_pc=0x1000,
            observe_final_release=True,
        )

        self.assertEqual(report["releaseBoundaries"], [{"burst": 1, "pc": 0x1000}])


class SemanticObservationTests(unittest.TestCase):
    def test_resolves_an_opaque_semantic_boundary(self) -> None:
        observation_map = {
            "schemaVersion": 2,
            "observations": [{"id": "mode", "type": "integer", "bank": "ram", "address": 1, "width": 1}],
            "boundaries": [{"id": "input-sampled", "address": 0x2345}],
        }

        self.assertEqual(semantic_boundary_address(observation_map, "input-sampled"), 0x2345)
        with self.assertRaisesRegex(LabError, "unknown semantic boundary"):
            semantic_boundary_address(observation_map, "missing")
    def test_decodes_integer_boolean_and_enum_observations(self) -> None:
        memory = {"ram": bytes.fromhex("00 34 12 04 02")}
        observation_map = {
            "schemaVersion": 2,
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

    def test_decodes_a_flag_table_as_one_cell_list_observation(self) -> None:
        # A destroyed bit per cell: the observation is the list of cells that
        # carry it, so one string compares against the browser's own.
        memory = {"ram": bytes.fromhex("80 00 A0 40 80")}
        observation_map = {
            "schemaVersion": 2,
            "observations": [
                {"id": "destroyed-cells", "type": "maskedCells", "bank": "ram", "address": 0, "count": 5, "mask": 0x80},
            ],
        }

        self.assertEqual(
            decode_semantic_observations(memory, observation_map),
            {"destroyed-cells": "00,02,04"},
        )

    def test_decodes_an_untouched_flag_table_as_an_empty_cell_list(self) -> None:
        memory = {"ram": bytes.fromhex("00 40 20")}
        observation_map = {
            "schemaVersion": 2,
            "observations": [
                {"id": "destroyed-cells", "type": "maskedCells", "bank": "ram", "address": 0, "count": 3, "mask": 0x80},
            ],
        }

        self.assertEqual(decode_semantic_observations(memory, observation_map), {"destroyed-cells": ""})

    def test_rejects_a_flag_table_that_runs_past_its_bank(self) -> None:
        memory = {"ram": bytes.fromhex("80 00")}
        observation_map = {
            "schemaVersion": 2,
            "observations": [
                {"id": "destroyed-cells", "type": "maskedCells", "bank": "ram", "address": 0, "count": 4, "mask": 0x80},
            ],
        }

        with self.assertRaisesRegex(LabError, "exceeds bank"):
            decode_semantic_observations(memory, observation_map)

    def test_rejects_an_observation_map_from_the_previous_schema(self) -> None:
        memory = {"ram": bytes.fromhex("01")}
        observation_map = {
            "schemaVersion": 1,
            "observations": [
                {"id": "moving", "type": "boolean", "bank": "ram", "address": 0, "width": 1},
            ],
        }

        with self.assertRaisesRegex(LabError, "schemaVersion must be 2"):
            decode_semantic_observations(memory, observation_map)

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

    def test_accepts_interrupt_entry_but_rejects_more_than_one_pal_line_of_overshoot(self) -> None:
        targets = stratified_pal_targets(period_cycles=20_000, trials=100)
        actuals = [{"elapsedCycles": target["phaseCycle"]} for target in targets]
        actuals[10] = {"elapsedCycles": targets[10]["phaseCycle"] + 42}
        validate_pal_phase_coverage(targets, actuals, period_cycles=20_000)

        actuals[10] = {"elapsedCycles": targets[10]["phaseCycle"] + 64}
        with self.assertRaisesRegex(LabError, "instruction-boundary tolerance"):
            validate_pal_phase_coverage(targets, actuals, period_cycles=20_000)

    def test_summarizes_exact_pal_cadence_from_absolute_clock_boundaries(self) -> None:
        timeline = [
            {"type": "joystick_state", "cpuClock": 100, "rasterLine": 0, "rasterCycle": 10},
            {"type": "wait_boundary", "cpuClock": 150, "rasterLine": 0, "rasterCycle": 60},
            {"type": "wait_boundary", "cpuClock": 170, "rasterLine": 1, "rasterCycle": 17},
            {"type": "wait_boundary", "cpuClock": 19_826, "rasterLine": 1, "rasterCycle": 17},
        ]

        self.assertEqual(summarize_pal_cadence(timeline), {
            "boundaryCount": 3,
            "firstResponseCycles": 50,
            "intervalCycles": [20, 19_656],
            "minimumIntervalCycles": 20,
            "maximumIntervalCycles": 19_656,
        })

    def test_rejects_a_clock_delta_that_disagrees_with_pal_position(self) -> None:
        with self.assertRaisesRegex(LabError, "PAL position"):
            summarize_pal_cadence([
                {"type": "joystick_state", "cpuClock": 100, "rasterLine": 0, "rasterCycle": 10},
                {"type": "wait_boundary", "cpuClock": 151, "rasterLine": 0, "rasterCycle": 60},
                {"type": "wait_boundary", "cpuClock": 170, "rasterLine": 1, "rasterCycle": 17},
            ])


class EventHistorySafetyTests(unittest.TestCase):
    def test_accepts_two_identity_bound_typed_replays(self) -> None:
        capture = {
            "schemaVersion": 1,
            "accessibilityTrusted": True,
            "viceExecutableSha256": "a" * 64,
            "driverExecutableSha256": "b" * 64,
            "effectiveConfigSha256": "f" * 64,
            "inputSetupSha256": "1" * 64,
            "focusChecks": 4,
            "durationMilliseconds": 1200,
            "typedObservations": {"mode": "SM-0001", "x": 10},
            "expectedAssertions": [
                {"observation": "mode", "operator": "equals", "value": "SM-0001"},
                {"observation": "x", "operator": "equals", "value": 10},
            ],
            "events": [
                {"atMilliseconds": 200, "actualMilliseconds": 203, "type": "key-down", "keyCode": 36, "modifiers": []},
                {"atMilliseconds": 700, "actualMilliseconds": 704, "type": "key-up", "keyCode": 36, "modifiers": []},
            ],
            "eventHistory": {
                "startSnapshotSha256": "c" * 64,
                "endSnapshotSha256": "d" * 64,
                "hotkeyFileSha256": "e" * 64,
            },
        }
        replay = {
            "viceExecutableSha256": "a" * 64,
            "effectiveConfigSha256": "f" * 64,
            "inputSetupSha256": "1" * 64,
            "startSnapshotSha256": "c" * 64,
            "viceLog": "Main CPU: RESET.\nUnit 8: RESET (For undump).\n",
            "typedObservations": {"mode": "SM-0001", "x": 10},
        }

        summary = validate_event_history_proof(capture, [
            {**replay, "coldStartId": "cold-1"},
            {**replay, "coldStartId": "cold-2"},
        ])

        self.assertEqual(summary["replays"], 2)
        self.assertEqual(summary["typedObservations"], {"mode": "SM-0001", "x": 10})
        self.assertEqual(len(summary["normalizedDigest"]), 64)

    def test_rejects_reused_or_identity_divergent_replays(self) -> None:
        capture = {
            "schemaVersion": 1,
            "accessibilityTrusted": True,
            "viceExecutableSha256": "a" * 64,
            "driverExecutableSha256": "b" * 64,
            "effectiveConfigSha256": "f" * 64,
            "inputSetupSha256": "1" * 64,
            "focusChecks": 4,
            "durationMilliseconds": 100,
            "typedObservations": {"mode": "SM-0001"},
            "expectedAssertions": [{"observation": "mode", "operator": "equals", "value": "SM-0001"}],
            "events": [
                {"atMilliseconds": 10, "actualMilliseconds": 11, "type": "key-down", "keyCode": 0, "modifiers": []},
                {"atMilliseconds": 20, "actualMilliseconds": 21, "type": "key-up", "keyCode": 0, "modifiers": []},
            ],
            "eventHistory": {"startSnapshotSha256": "c" * 64, "endSnapshotSha256": "d" * 64, "hotkeyFileSha256": "e" * 64},
        }
        replay = {
            "coldStartId": "same",
            "viceExecutableSha256": "a" * 64,
            "effectiveConfigSha256": "f" * 64,
            "inputSetupSha256": "1" * 64,
            "startSnapshotSha256": "c" * 64,
            "viceLog": "Main CPU: RESET.\nUnit 8: RESET (For undump).\n",
            "typedObservations": {"mode": "SM-0001"},
        }
        with self.assertRaisesRegex(LabError, "independent cold starts"):
            validate_event_history_proof(capture, [replay, replay])
        with self.assertRaisesRegex(LabError, "VICE executable"):
            validate_event_history_proof(capture, [replay, {**replay, "coldStartId": "other", "viceExecutableSha256": "9" * 64}])
        with self.assertRaisesRegex(LabError, "recording configuration"):
            validate_event_history_proof(capture, [
                {**replay, "coldStartId": "cold-1", "effectiveConfigSha256": "9" * 64},
                {**replay, "coldStartId": "cold-2", "effectiveConfigSha256": "9" * 64},
            ])
        with self.assertRaisesRegex(LabError, "input setup"):
            validate_event_history_proof(capture, [
                {**replay, "coldStartId": "cold-1", "inputSetupSha256": "9" * 64},
                {**replay, "coldStartId": "cold-2", "inputSetupSha256": "9" * 64},
            ])

    def test_rejects_proof_without_the_recorded_typed_end_state(self) -> None:
        capture = {
            "schemaVersion": 1,
            "accessibilityTrusted": True,
            "viceExecutableSha256": "a" * 64,
            "driverExecutableSha256": "b" * 64,
            "effectiveConfigSha256": "f" * 64,
            "inputSetupSha256": "1" * 64,
            "focusChecks": 4,
            "durationMilliseconds": 100,
            "events": [
                {"atMilliseconds": 10, "actualMilliseconds": 11, "type": "key-down", "keyCode": 0, "modifiers": []},
                {"atMilliseconds": 20, "actualMilliseconds": 21, "type": "key-up", "keyCode": 0, "modifiers": []},
            ],
            "eventHistory": {"startSnapshotSha256": "c" * 64, "endSnapshotSha256": "d" * 64, "hotkeyFileSha256": "e" * 64},
        }
        replay = {
            "viceExecutableSha256": "a" * 64,
            "effectiveConfigSha256": "f" * 64,
            "startSnapshotSha256": "c" * 64,
            "inputSetupSha256": "1" * 64,
            "viceLog": "Main CPU: RESET.\nUnit 8: RESET (For undump).\n",
            "typedObservations": {"mode": "SM-0001"},
        }

        with self.assertRaisesRegex(LabError, "recorded typed end state"):
            validate_event_history_proof(capture, [{**replay, "coldStartId": "cold-1"}, {**replay, "coldStartId": "cold-2"}])

    def test_rejects_reproducible_history_with_the_wrong_semantic_result(self) -> None:
        capture = {
            "schemaVersion": 1,
            "accessibilityTrusted": True,
            "viceExecutableSha256": "a" * 64,
            "driverExecutableSha256": "b" * 64,
            "effectiveConfigSha256": "f" * 64,
            "inputSetupSha256": "1" * 64,
            "focusChecks": 4,
            "durationMilliseconds": 100,
            "typedObservations": {"command": "plain-return"},
            "expectedAssertions": [{"observation": "command", "operator": "equals", "value": "pause"}],
            "events": [
                {"atMilliseconds": 10, "actualMilliseconds": 11, "type": "key-down", "keyCode": 0, "modifiers": []},
                {"atMilliseconds": 20, "actualMilliseconds": 21, "type": "key-up", "keyCode": 0, "modifiers": []},
            ],
            "eventHistory": {"startSnapshotSha256": "c" * 64, "endSnapshotSha256": "d" * 64, "hotkeyFileSha256": "e" * 64},
        }
        replay = {
            "viceExecutableSha256": "a" * 64,
            "effectiveConfigSha256": "f" * 64,
            "inputSetupSha256": "1" * 64,
            "startSnapshotSha256": "c" * 64,
            "viceLog": "Main CPU: RESET.\nUnit 8: RESET (For undump).\n",
            "typedObservations": {"command": "plain-return"},
        }

        with self.assertRaisesRegex(LabError, "failed equals assertion"):
            validate_event_history_proof(capture, [{**replay, "coldStartId": "cold-1"}, {**replay, "coldStartId": "cold-2"}])

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
