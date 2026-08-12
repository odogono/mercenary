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
    config_digest: str | None = None
    for report in replay_reports:
        _require(report.get("viceExecutableSha256") == capture_report["viceExecutableSha256"], "Event-history replay VICE executable identity diverged")
        _require(report.get("startSnapshotSha256") == history["startSnapshotSha256"], "Event-history replay start snapshot identity diverged")
        current_config = report.get("effectiveConfigSha256")
        _require(isinstance(current_config, str) and len(current_config) == 64 and all(character in "0123456789abcdef" for character in current_config), "Event-history replay lacks an effective configuration identity")
        _require(current_config == recorded_config, "Event-history replay diverged from the recording configuration")
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
        "typedObservations": expected,
    }
    normalized_digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"replays": 2, "typedObservations": expected, "normalizedDigest": normalized_digest}
