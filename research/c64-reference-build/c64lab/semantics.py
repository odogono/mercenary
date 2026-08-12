from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any

from .core import LabError


PAL_LINES_PER_FRAME = 312
PAL_CYCLES_PER_LINE = 63
MAX_EVENT_HISTORY_DURATION_MS = 60_000


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def semantic_boundary_address(observation_map: Mapping[str, Any], boundary_id: str) -> int:
    boundaries = observation_map.get("boundaries", [])
    _require(isinstance(boundaries, list), "Semantic observation map boundaries must be a list")
    matches = [item for item in boundaries if isinstance(item, dict) and item.get("id") == boundary_id]
    _require(len(matches) == 1, f"Semantic observation map has unknown semantic boundary {boundary_id}")
    address = matches[0].get("address")
    _require(isinstance(address, int) and 0 <= address <= 0xFFFF, f"Semantic boundary {boundary_id} has an invalid address")
    return address


def run_phase_aligned_matrix_sequence(client: Any, schedule: Mapping[str, Any]) -> dict[str, Any]:
    """Inject matrix transitions at CPU boundaries and require a semantic handler."""
    scanner_entry = schedule.get("scannerEntryPc")
    row_pc = schedule.get("rowPc")
    handler_pc = schedule.get("handlerPc")
    max_instructions = schedule.get("maxInstructions", 2_000)
    start_at_current = schedule.get("startAtCurrent", False)
    handler_occurrences = schedule.get("handlerOccurrences", 1)
    use_handler_checkpoints = schedule.get("useHandlerCheckpoints", False)
    for name, value in (
        ("scannerEntryPc", scanner_entry),
        ("rowPc", row_pc),
        ("handlerPc", handler_pc),
    ):
        _require(isinstance(value, int) and 0 <= value <= 0xFFFF, f"Phase-aligned schedule has invalid {name}")
    _require(
        isinstance(max_instructions, int) and 1 <= max_instructions <= 100_000,
        "Phase-aligned schedule maxInstructions must be 1..100000",
    )
    _require(isinstance(start_at_current, bool), "Phase-aligned schedule startAtCurrent must be boolean")
    _require(
        isinstance(use_handler_checkpoints, bool),
        "Phase-aligned schedule useHandlerCheckpoints must be boolean",
    )
    _require(
        isinstance(handler_occurrences, int)
        and not isinstance(handler_occurrences, bool)
        and 1 <= handler_occurrences <= 100,
        "Phase-aligned schedule handlerOccurrences must be 1..100",
    )

    def matrix_rows(value: Any, label: str) -> list[int]:
        _require(isinstance(value, list) and len(value) == 16, f"Phase-aligned {label} must contain 16 rows")
        _require(
            all(isinstance(row, int) and 0 <= row <= 0xFF for row in value),
            f"Phase-aligned {label} rows must be eight-bit masks",
        )
        return list(value)

    initial_rows = matrix_rows(schedule.get("initialRows"), "initialRows")
    raw_switches = schedule.get("switches")
    _require(isinstance(raw_switches, list) and bool(raw_switches), "Phase-aligned schedule requires switches")
    switches: list[tuple[int, list[int]]] = []
    for index, switch in enumerate(raw_switches, start=1):
        _require(isinstance(switch, Mapping), f"Phase-aligned switch {index} must be an object")
        before_row = switch.get("beforeRow")
        _require(
            isinstance(before_row, int) and 0 <= before_row <= 0xFF,
            f"Phase-aligned switch {index} has invalid beforeRow",
        )
        switches.append((before_row, matrix_rows(switch.get("rows"), f"switch {index}")))

    neutral = [0] * 16
    boundaries: list[dict[str, Any]] = []
    readbacks: list[list[int]] = []

    def apply_matrix(rows: list[int]) -> None:
        client.keyboard_matrix_set(rows)
        actual = client.keyboard_matrix()
        _require(actual == rows, "Phase-aligned matrix readback did not match the requested rows")
        readbacks.append(actual)

    try:
        client.clear_checkpoints()
        if start_at_current:
            entry_registers = client.registers()
            stopped_pc = entry_registers.get("PC")
        else:
            checkpoint = client.set_checkpoint(scanner_entry)
            stopped_pc = client.resume_until_checkpoint(checkpoint)
            entry_registers = client.registers()
        _require(stopped_pc == scanner_entry, "Phase-aligned input did not reach its scanner-entry boundary")
        boundaries.append({"id": "scanner-entry", "pc": stopped_pc, "registers": entry_registers})
        apply_matrix(initial_rows)

        for index, (before_row, rows) in enumerate(switches, start=1):
            for _ in range(max_instructions):
                pc = client.advance_instructions(1)
                registers = client.registers()
                if pc == row_pc and registers.get("X") == before_row:
                    boundaries.append({
                        "id": f"matrix-switch-{index}",
                        "pc": pc,
                        "registers": registers,
                    })
                    break
            else:
                raise LabError("Phase-aligned input did not reach its matrix-switch boundary")
            apply_matrix(rows)

        for occurrence in range(1, handler_occurrences + 1):
            if use_handler_checkpoints:
                checkpoint = client.set_checkpoint(handler_pc)
                pc = client.resume_until_checkpoint(checkpoint)
                _require(
                    pc == handler_pc,
                    f"Phase-aligned input did not reach semantic-handler occurrence {occurrence}",
                )
                handler_registers = client.registers()
            else:
                for _ in range(max_instructions):
                    pc = client.advance_instructions(1)
                    if pc == handler_pc:
                        handler_registers = client.registers()
                        break
                else:
                    raise LabError(
                        "Phase-aligned input did not reach semantic-handler "
                        f"occurrence {occurrence} of {handler_occurrences}"
                    )
            handler_id = (
                "semantic-handler"
                if handler_occurrences == 1
                else f"semantic-handler-{occurrence}"
            )
            boundaries.append({"id": handler_id, "pc": pc, "registers": handler_registers})
            client.advance_instructions(1)
        return {"boundaries": boundaries, "matrixReadbacks": readbacks}
    finally:
        client.keyboard_matrix_set(neutral)


def run_held_host_key_sequence(
    client: Any,
    *,
    key_symbol: int,
    modifiers: int,
    handler_pc: int,
    occurrences: int,
) -> dict[str, Any]:
    """Hold one VICE host key across exact handler occurrences, then release it."""
    _require(
        isinstance(key_symbol, int) and not isinstance(key_symbol, bool) and 0 <= key_symbol <= 0xFFFFFFFF,
        "Held host-key symbol must fit in 32 bits",
    )
    _require(
        isinstance(modifiers, int) and not isinstance(modifiers, bool) and 0 <= modifiers <= 0x7F,
        "Held host-key modifiers must use VICE's seven defined bits",
    )
    _require(
        isinstance(handler_pc, int) and not isinstance(handler_pc, bool) and 0 <= handler_pc <= 0xFFFF,
        "Held host-key handler PC must fit in 16 bits",
    )
    _require(
        isinstance(occurrences, int) and not isinstance(occurrences, bool) and 1 <= occurrences <= 512,
        "Held host-key occurrences must be 1..512",
    )

    client.clear_checkpoints()
    key_pressed = False
    boundaries: list[dict[str, Any]] = []
    clocks: list[int] = []
    try:
        client.host_key_event(key_symbol, modifiers=modifiers, pressed=True)
        key_pressed = True
        for occurrence in range(1, occurrences + 1):
            checkpoint = client.set_checkpoint(handler_pc)
            stopped_pc = client.resume_until_checkpoint(checkpoint)
            _require(
                stopped_pc == handler_pc,
                f"Held host key did not reach handler occurrence {occurrence}",
            )
            registers = client.registers()
            history = client.cpu_history(1)
            _require(len(history) == 1, "Held host-key handler lacks an absolute CPU clock")
            clock = history[0].get("clock")
            _require(
                isinstance(clock, int) and not isinstance(clock, bool) and clock >= 0,
                "Held host-key handler has an invalid absolute CPU clock",
            )
            if clocks:
                clock_delta = clock - clocks[-1]
                _require(clock_delta > 0, "Held host-key handler clocks must increase")
                prior = boundaries[-1]["registers"]
                position_delta = pal_forward_delta(
                    prior["LIN"], prior["CYC"], registers["LIN"], registers["CYC"]
                )
                frame_cycles = PAL_LINES_PER_FRAME * PAL_CYCLES_PER_LINE
                _require(
                    clock_delta % frame_cycles == position_delta,
                    "Held host-key clock delta disagrees with its PAL position",
                )
            clocks.append(clock)
            boundaries.append({
                "id": f"semantic-handler-{occurrence}",
                "pc": stopped_pc,
                "clock": clock,
                "registers": registers,
            })
            client.advance_instructions(1)
    finally:
        if key_pressed:
            client.host_key_event(key_symbol, modifiers=modifiers, pressed=False)

    intervals = [current - previous for previous, current in zip(clocks, clocks[1:])]
    return {
        "boundaries": boundaries,
        "handlerClocks": clocks,
        "intervalCycles": intervals,
        "minimumIntervalCycles": min(intervals) if intervals else None,
        "maximumIntervalCycles": max(intervals) if intervals else None,
    }


def run_host_key_bursts(
    client: Any,
    *,
    key_symbol: int,
    modifiers: int,
    handler_pc: int,
    occurrences_per_burst: int | list[int],
    bursts: int,
    release_boundary_pc: int,
    observe_final_release: bool = False,
) -> dict[str, Any]:
    """Repeat bounded host-key holds after observing each intervening release."""
    _require(
        isinstance(bursts, int) and not isinstance(bursts, bool) and 1 <= bursts <= 64,
        "Held host-key bursts must be 1..64",
    )
    if isinstance(occurrences_per_burst, list):
        occurrence_schedule = occurrences_per_burst
        _require(
            len(occurrence_schedule) == bursts,
            "Held host-key occurrence schedule must match the burst count",
        )
    else:
        occurrence_schedule = [occurrences_per_burst] * bursts
    _require(
        all(
            isinstance(count, int) and not isinstance(count, bool) and 1 <= count <= 512
            for count in occurrence_schedule
        ),
        "Held host-key occurrences per burst must be 1..512",
    )
    _require(
        sum(occurrence_schedule) <= 512,
        "Held host-key bursts must contain at most 512 total occurrences",
    )
    _require(
        isinstance(release_boundary_pc, int)
        and not isinstance(release_boundary_pc, bool)
        and 0 <= release_boundary_pc <= 0xFFFF,
        "Held host-key release boundary PC must fit in 16 bits",
    )
    _require(
        isinstance(observe_final_release, bool),
        "Held host-key final-release flag must be boolean",
    )

    reports: list[dict[str, Any]] = []
    release_boundaries: list[dict[str, int]] = []
    for burst, occurrence_count in enumerate(occurrence_schedule, start=1):
        reports.append(run_held_host_key_sequence(
            client,
            key_symbol=key_symbol,
            modifiers=modifiers,
            handler_pc=handler_pc,
            occurrences=occurrence_count,
        ))
        if burst == bursts and not observe_final_release:
            continue
        client.clear_checkpoints()
        checkpoint = client.set_checkpoint(release_boundary_pc)
        stopped_pc = client.resume_until_checkpoint(checkpoint)
        _require(
            stopped_pc == release_boundary_pc,
            f"Held host-key release boundary was not reached after burst {burst}",
        )
        release_boundaries.append({"burst": burst, "pc": stopped_pc})
        client.advance_instructions(1)

    return {"bursts": reports, "releaseBoundaries": release_boundaries}


def decode_semantic_observations(memory: Mapping[str, bytes], observation_map: Mapping[str, Any]) -> dict[str, int | bool | str]:
    _require(observation_map.get("schemaVersion") == 1, "Semantic observation map schemaVersion must be 1")
    definitions = observation_map.get("observations")
    _require(isinstance(definitions, list) and bool(definitions), "Semantic observation map must contain observations")
    decoded: dict[str, int | bool | str] = {}
    for definition in definitions:
        _require(isinstance(definition, dict), "Semantic observation definition must be an object")
        observation_id = definition.get("id")
        bank = definition.get("bank")
        address = definition.get("address")
        width = definition.get("width")
        _require(isinstance(observation_id, str) and bool(observation_id), "Semantic observation ID is required")
        _require(observation_id not in decoded, f"Semantic observation map repeats {observation_id}")
        _require(bank in memory, f"Semantic observation {observation_id} references unavailable bank {bank}")
        _require(isinstance(address, int) and address >= 0, f"Semantic observation {observation_id} has an invalid address")
        _require(isinstance(width, int) and 1 <= width <= 8, f"Semantic observation {observation_id} width must be 1..8")
        source = memory[bank]
        _require(address + width <= len(source), f"Semantic observation {observation_id} exceeds bank {bank}")
        endianness = definition.get("endianness", "little")
        _require(endianness in {"little", "big"}, f"Semantic observation {observation_id} has invalid endianness")
        value = int.from_bytes(source[address : address + width], endianness, signed=bool(definition.get("signed", False)))
        mask = definition.get("mask")
        if mask is not None:
            _require(isinstance(mask, int) and mask >= 0, f"Semantic observation {observation_id} has an invalid mask")
            value &= mask
        shift = definition.get("shift", 0)
        _require(isinstance(shift, int) and shift >= 0, f"Semantic observation {observation_id} has an invalid shift")
        value >>= shift

        observation_type = definition.get("type")
        if observation_type == "integer":
            decoded[observation_id] = value
        elif observation_type == "boolean":
            decoded[observation_id] = value != 0
        elif observation_type == "enum":
            values = definition.get("values")
            _require(isinstance(values, dict) and str(value) in values, f"Semantic observation {observation_id} decoded unknown enum value")
            label = values[str(value)]
            _require(isinstance(label, str) and bool(label), f"Semantic observation {observation_id} enum label is invalid")
            decoded[observation_id] = label
        else:
            raise LabError(f"Semantic observation {observation_id} has unknown type {observation_type!r}")
    return decoded


def _assertion_matches(before: Mapping[str, Any], after: Mapping[str, Any], assertion: Mapping[str, Any]) -> bool:
    observation = assertion.get("observation")
    operator = assertion.get("operator")
    _require(isinstance(observation, str) and observation in after, "Semantic assertion references an unknown observation")
    current = after[observation]
    if operator == "equals":
        return current == assertion.get("value")
    if operator == "not-equals":
        return current != assertion.get("value")
    if operator == "unchanged":
        return observation in before and current == before[observation]
    if operator == "changed":
        return observation in before and current != before[observation]
    if operator == "delta":
        prior = before.get(observation)
        return isinstance(prior, int) and not isinstance(prior, bool) and isinstance(current, int) and not isinstance(current, bool) and current - prior == assertion.get("value")
    if operator == "range":
        minimum, maximum = assertion.get("minimum"), assertion.get("maximum")
        return isinstance(current, int) and not isinstance(current, bool) and isinstance(minimum, int) and isinstance(maximum, int) and minimum <= current <= maximum
    if operator == "member":
        values = assertion.get("values")
        return isinstance(values, list) and current in values
    raise LabError(f"Semantic assertion for {observation} has unknown operator {operator!r}")


def assert_semantic_observations(before: Mapping[str, Any], after: Mapping[str, Any], assertions: list[dict[str, Any]]) -> None:
    _require(bool(assertions), "Semantic assertions must be non-empty")
    for assertion in assertions:
        observation = assertion.get("observation", "<unknown>")
        operator = assertion.get("operator", "<unknown>")
        if not _assertion_matches(before, after, assertion):
            raise LabError(f"Semantic observation {observation} failed {operator} assertion")


def classify_semantic_outcome(
    before: Mapping[str, Any],
    after: Mapping[str, Any],
    outcomes: list[dict[str, Any]],
) -> str:
    _require(bool(outcomes), "Semantic outcomes must be non-empty")
    matches: list[str] = []
    for outcome in outcomes:
        outcome_id = outcome.get("id")
        assertions = outcome.get("assertions")
        _require(isinstance(outcome_id, str) and bool(outcome_id), "Semantic outcome ID is required")
        _require(isinstance(assertions, list) and bool(assertions), f"Semantic outcome {outcome_id} needs assertions")
        if all(_assertion_matches(before, after, assertion) for assertion in assertions):
            matches.append(outcome_id)
    _require(len(matches) == 1, f"Semantic observations must classify as exactly one outcome; matched {matches}")
    return matches[0]


def stratified_pal_targets(*, period_cycles: int, trials: int) -> list[dict[str, int]]:
    _require(isinstance(period_cycles, int) and period_cycles > 0, "PAL sampling period must be positive")
    _require(isinstance(trials, int) and trials >= 100, "PAL stochastic sampling requires at least 100 trials")
    targets = [(2 * index + 1) * period_cycles // (2 * trials) for index in range(trials)]
    _require(len(set(targets)) == trials, "PAL sampling period cannot provide distinct phase targets")
    return [
        {
            "trial": index + 1,
            "phaseCycle": phase,
            "rasterLine": (phase // PAL_CYCLES_PER_LINE) % PAL_LINES_PER_FRAME,
            "rasterCycle": phase % PAL_CYCLES_PER_LINE,
        }
        for index, phase in enumerate(targets)
    ]


def validate_pal_phase_coverage(
    targets: list[Mapping[str, int]],
    actuals: list[Mapping[str, int]],
    *,
    period_cycles: int,
    maximum_overshoot_cycles: int = 8,
) -> None:
    _require(len(targets) >= 100 and len(actuals) == len(targets), "PAL phase coverage is incomplete")
    phases: list[int] = []
    for target, actual in zip(targets, actuals, strict=True):
        requested = target.get("phaseCycle")
        elapsed = actual.get("elapsedCycles")
        _require(isinstance(requested, int) and isinstance(elapsed, int), "PAL phase coverage lacks cycle boundaries")
        _require(requested <= elapsed <= requested + maximum_overshoot_cycles, "PAL phase coverage exceeded its instruction-boundary tolerance")
        phases.append(elapsed % period_cycles)
    _require(len(set(phases)) == len(phases), "PAL phase coverage contains duplicate actual phases")


def pal_forward_delta(previous_line: int, previous_cycle: int, current_line: int, current_cycle: int) -> int:
    frame_cycles = PAL_LINES_PER_FRAME * PAL_CYCLES_PER_LINE
    previous = previous_line * PAL_CYCLES_PER_LINE + previous_cycle
    current = current_line * PAL_CYCLES_PER_LINE + current_cycle
    return (current - previous) % frame_cycles


def summarize_pal_cadence(timeline: list[Mapping[str, Any]]) -> dict[str, Any]:
    """Validate and summarize exact wait-boundary cadence without payload data."""
    boundary_items = [
        (index, item) for index, item in enumerate(timeline) if item.get("type") == "wait_boundary"
    ]
    _require(len(boundary_items) >= 2, "PAL cadence requires at least two wait boundaries")
    first_boundary_index = boundary_items[0][0]
    triggers = [
        item for item in timeline[:first_boundary_index] if item.get("type") == "joystick_state"
    ]
    _require(bool(triggers), "PAL cadence requires an input trigger before its first boundary")
    ordered = [triggers[-1], *[item for _, item in boundary_items]]
    frame_cycles = PAL_LINES_PER_FRAME * PAL_CYCLES_PER_LINE
    deltas: list[int] = []
    for pair_index, (previous, current) in enumerate(zip(ordered, ordered[1:])):
        fields = (
            previous.get("cpuClock"),
            previous.get("rasterLine"),
            previous.get("rasterCycle"),
            current.get("cpuClock"),
            current.get("rasterLine"),
            current.get("rasterCycle"),
        )
        _require(
            all(isinstance(value, int) and not isinstance(value, bool) for value in fields),
            "PAL cadence boundary lacks integer clock or raster fields",
        )
        previous_clock, previous_line, previous_cycle, current_clock, current_line, current_cycle = fields
        _require(0 <= previous_line < PAL_LINES_PER_FRAME and 0 <= current_line < PAL_LINES_PER_FRAME,
                 "PAL cadence boundary has an invalid raster line")
        _require(0 <= previous_cycle < PAL_CYCLES_PER_LINE and 0 <= current_cycle < PAL_CYCLES_PER_LINE,
                 "PAL cadence boundary has an invalid raster cycle")
        clock_delta = current_clock - previous_clock
        _require(clock_delta > 0, "PAL cadence absolute clocks must increase")
        position_delta = pal_forward_delta(previous_line, previous_cycle, current_line, current_cycle)
        if pair_index > 0:
            _require(
                clock_delta % frame_cycles == position_delta,
                "PAL cadence clock delta disagrees with its PAL position",
            )
        deltas.append(clock_delta)

    intervals = deltas[1:]
    return {
        "boundaryCount": len(boundary_items),
        "firstResponseCycles": deltas[0],
        "intervalCycles": intervals,
        "minimumIntervalCycles": min(intervals),
        "maximumIntervalCycles": max(intervals),
    }


def validate_event_history_capture(request: Mapping[str, Any]) -> None:
    _require(request.get("schemaVersion") == 1, "Event-history capture schemaVersion must be 1")
    _require(isinstance(request.get("vicePid"), int) and request["vicePid"] > 0, "Event-history capture needs an exact VICE PID")
    digest = request.get("viceExecutableSha256")
    _require(isinstance(digest, str) and len(digest) == 64 and all(character in "0123456789abcdef" for character in digest), "Event-history capture needs a VICE executable SHA-256")
    _require(request.get("windowOwner") == "x64sc", "Event-history capture must target the x64sc window owner")
    _require(request.get("windowTitle") == "VICE (C64SC)", "Event-history capture must target the VICE main window")
    duration = request.get("durationMilliseconds")
    _require(isinstance(duration, int) and 0 < duration <= MAX_EVENT_HISTORY_DURATION_MS, "Event-history capture duration is unbounded")
    history = request.get("eventHistory")
    _require(isinstance(history, dict), "Event-history capture needs VICE history snapshots")
    start_path, end_path = history.get("startSnapshotPath"), history.get("endSnapshotPath")
    _require(isinstance(start_path, str) and bool(start_path) and isinstance(end_path, str) and bool(end_path), "Event-history capture needs snapshot paths")
    _require(start_path != end_path, "Event-history capture needs distinct snapshots")
    hotkey_path = history.get("hotkeyFilePath")
    hotkey_digest = history.get("hotkeyFileSha256")
    _require(isinstance(hotkey_path, str) and bool(hotkey_path), "Event-history capture needs a pinned hotkey file")
    _require(
        isinstance(hotkey_digest, str)
        and len(hotkey_digest) == 64
        and all(character in "0123456789abcdef" for character in hotkey_digest),
        "Event-history capture needs a hotkey file SHA-256",
    )
    events = request.get("events")
    _require(isinstance(events, list) and 0 < len(events) <= 512, "Event-history capture needs 1...512 key events")
    held: set[int] = set()
    prior_time = -1
    for event in events:
        _require(isinstance(event, dict), "Event-history key event must be an object")
        at = event.get("atMilliseconds")
        event_type = event.get("type")
        key_code = event.get("keyCode")
        _require(isinstance(at, int) and prior_time <= at <= duration, "Event-history key events must be ordered and bounded")
        _require(event_type in {"key-down", "key-up"}, "Event-history key event type is invalid")
        _require(isinstance(key_code, int) and 0 <= key_code <= 0x7F, "Event-history key code is invalid")
        modifiers = event.get("modifiers", [])
        _require(
            isinstance(modifiers, list)
            and len(modifiers) == len(set(modifiers))
            and all(modifier in {"command", "control", "option", "shift"} for modifier in modifiers),
            "Event-history key modifiers are invalid",
        )
        if event_type == "key-down":
            _require(key_code not in held, f"Event-history key {key_code} is pressed twice")
            held.add(key_code)
        else:
            _require(key_code in held, f"Event-history key {key_code} is released without a press")
            held.remove(key_code)
        prior_time = at
    _require(not held, f"Event-history keys must be released: {sorted(held)}")


def validate_event_history_replay(
    vice_log: str,
    expected: Mapping[str, int | bool | str],
    actual: Mapping[str, int | bool | str],
) -> None:
    restore_marker = "Unit 8: RESET (For undump)."
    _require(restore_marker in vice_log, "Event-history replay did not restore its start snapshot")
    _require("Error reading start snapshot" not in vice_log, "Event-history replay could not read its start snapshot")
    after_restore = vice_log.split(restore_marker, 1)[1]
    _require(
        "Main CPU: RESET." not in after_restore,
        "Event-history playback raced the VICE startup reset; trigger playback only after initialization",
    )
    _require(bool(expected), "Event-history replay needs expected typed observations")
    _require(dict(actual) == dict(expected), "Event-history replay typed observations diverged from the recorded end state")


def validate_event_history_proof(
    capture_report: Mapping[str, Any],
    replay_reports: list[Mapping[str, Any]],
) -> dict[str, Any]:
    """Validate two cold replays without retaining restricted paths or logs."""
    _require(capture_report.get("schemaVersion") == 1, "Event-history capture report schemaVersion must be 1")
    _require(capture_report.get("accessibilityTrusted") is True, "Event-history capture lacked Accessibility permission")
    digest_fields = ("viceExecutableSha256", "driverExecutableSha256")
    for field in digest_fields:
        value = capture_report.get(field)
        _require(isinstance(value, str) and len(value) == 64 and all(character in "0123456789abcdef" for character in value), f"Event-history capture report has invalid {field}")
    recorded_config = capture_report.get("effectiveConfigSha256")
    _require(isinstance(recorded_config, str) and len(recorded_config) == 64 and all(character in "0123456789abcdef" for character in recorded_config), "Event-history capture report lacks its recording configuration identity")
    recorded_input_setup = capture_report.get("inputSetupSha256")
    _require(isinstance(recorded_input_setup, str) and len(recorded_input_setup) == 64 and all(character in "0123456789abcdef" for character in recorded_input_setup), "Event-history capture report lacks its input setup identity")
    history = capture_report.get("eventHistory")
    _require(isinstance(history, Mapping), "Event-history capture report lacks history identities")
    for field in ("startSnapshotSha256", "endSnapshotSha256", "hotkeyFileSha256"):
        value = history.get(field)
        _require(isinstance(value, str) and len(value) == 64 and all(character in "0123456789abcdef" for character in value), f"Event-history capture report has invalid {field}")
    _require(history["startSnapshotSha256"] != history["endSnapshotSha256"], "Event-history capture start and end snapshots must be distinct")

    duration = capture_report.get("durationMilliseconds")
    events = capture_report.get("events")
    _require(isinstance(duration, int) and 0 < duration <= MAX_EVENT_HISTORY_DURATION_MS, "Event-history capture report duration is unbounded")
    _require(isinstance(events, list) and bool(events), "Event-history capture report lacks events")
    held: set[int] = set()
    previous_actual = -1
    for event in events:
        _require(isinstance(event, Mapping), "Event-history captured event must be an object")
        requested, actual = event.get("atMilliseconds"), event.get("actualMilliseconds")
        event_type, key_code = event.get("type"), event.get("keyCode")
        _require(isinstance(requested, int) and isinstance(actual, int) and requested <= actual <= duration, "Event-history actual event timing is outside its bounded request")
        _require(actual >= previous_actual, "Event-history actual event timing is unordered")
        _require(isinstance(key_code, int) and 0 <= key_code <= 0x7F, "Event-history captured key code is invalid")
        if event_type == "key-down":
            _require(key_code not in held, f"Event-history captured key {key_code} is pressed twice")
            held.add(key_code)
        elif event_type == "key-up":
            _require(key_code in held, f"Event-history captured key {key_code} is released without a press")
            held.remove(key_code)
        else:
            raise LabError("Event-history captured event type is invalid")
        previous_actual = actual
    _require(not held, f"Event-history captured keys must be released: {sorted(held)}")
    focus_checks = capture_report.get("focusChecks")
    _require(isinstance(focus_checks, int) and focus_checks >= len(events) + 2, "Event-history capture did not check focus at every boundary")

    _require(len(replay_reports) == 2, "Event-history proof requires exactly two independent cold starts")
    cold_start_ids = [report.get("coldStartId") for report in replay_reports]
    _require(all(isinstance(value, str) and bool(value) for value in cold_start_ids) and len(set(cold_start_ids)) == 2, "Event-history proof requires two independent cold starts")
    recorded_end = capture_report.get("typedObservations")
    _require(isinstance(recorded_end, Mapping) and bool(recorded_end), "Event-history proof requires the recorded typed end state")
    expected = dict(recorded_end)
    recorded_start = capture_report.get("typedStartObservations", {})
    _require(isinstance(recorded_start, Mapping), "Event-history proof recorded typed start state must be an object")
    expected_assertions = capture_report.get("expectedAssertions")
    _require(isinstance(expected_assertions, list) and bool(expected_assertions), "Event-history proof requires declared semantic assertions")
    assert_semantic_observations(recorded_start, expected, expected_assertions)
    config_digest: str | None = None
    for report in replay_reports:
        _require(report.get("viceExecutableSha256") == capture_report["viceExecutableSha256"], "Event-history replay VICE executable identity diverged")
        _require(report.get("startSnapshotSha256") == history["startSnapshotSha256"], "Event-history replay start snapshot identity diverged")
        current_config = report.get("effectiveConfigSha256")
        _require(isinstance(current_config, str) and len(current_config) == 64 and all(character in "0123456789abcdef" for character in current_config), "Event-history replay lacks an effective configuration identity")
        _require(current_config == recorded_config, "Event-history replay diverged from the recording configuration")
        _require(report.get("inputSetupSha256") == recorded_input_setup, "Event-history replay input setup diverged")
        if config_digest is None:
            config_digest = current_config
        _require(current_config == config_digest, "Event-history replay effective configurations diverged")
        observations = report.get("typedObservations")
        _require(isinstance(observations, Mapping) and bool(observations), "Event-history replay lacks typed observations")
        vice_log = report.get("viceLog")
        _require(isinstance(vice_log, str), "Event-history replay lacks its VICE log")
        validate_event_history_replay(vice_log, expected, observations)

    assert config_digest is not None
    normalized = {
        "viceExecutableSha256": capture_report["viceExecutableSha256"],
        "driverExecutableSha256": capture_report["driverExecutableSha256"],
        "hotkeyFileSha256": history["hotkeyFileSha256"],
        "startSnapshotSha256": history["startSnapshotSha256"],
        "effectiveConfigSha256": config_digest,
        "inputSetupSha256": recorded_input_setup,
        "typedObservations": expected,
        "expectedAssertions": expected_assertions,
    }
    normalized_digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"replays": 2, "typedObservations": expected, "normalizedDigest": normalized_digest}
