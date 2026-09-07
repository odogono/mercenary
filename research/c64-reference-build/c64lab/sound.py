"""Guard and decode the Reference Build's bounded SID programs.

The browser payload intentionally contains programs and control rules, not WAV
material.  Addresses in this module identify the configured Reference Build;
the values written to ``sound.json`` are always read from its captured RAM.
"""

from __future__ import annotations

from typing import Any

from .core import LabError, require as _require

SOUND_SCHEMA_VERSION = 2

INITIAL_REGISTERS = bytes(
    [
        0x80, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x80, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x08, 0x04, 0x00, 0xF0,
        0x00, 0x00, 0x00, 0x0F,
    ]
)

ONE_SHOT_TABLE = bytes(
    [
        0x59, 0x09, 0x09, 0x41, 0x09, 0x0E, 0x0A, 0x81,
        0x12, 0x09, 0x09, 0x81, 0x06, 0x0B, 0x0B, 0x81,
        0x16, 0x0B, 0x0B, 0x81, 0x04, 0x09, 0x09, 0x81,
        0x0E, 0x0B, 0x0B, 0x81, 0x0E, 0xCA, 0x0A, 0x41,
        0x0F, 0xCA, 0x0A, 0x41, 0x00, 0x00, 0x00, 0x81,
        0x50, 0xDF, 0xAC, 0x80, 0x30, 0x3F, 0x0F, 0x80,
        0x00, 0x00, 0x40, 0x41,
    ]
)

LIFT_PROFILES = bytes(
    [
        0xA8, 0x09, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x50, 0x05, 0x00, 0x08, 0x10, 0x00, 0xA0,
        0xA8, 0x09, 0x00, 0x08, 0x00, 0x00, 0x00,
        0xE4, 0x05, 0x00, 0x08, 0x10, 0x00, 0xA0,
    ]
)

_GUARDS: tuple[tuple[int, bytes, str], ...] = (
    (0xB910, bytes([0xA2, 0x18, 0xBD, 0x21, 0xB9, 0x9D, 0x00, 0xD4, 0xCA, 0x10, 0xF7, 0xA9, 0x41, 0x8D, 0x12, 0xD4, 0x60]), "SID initialisation"),
    (0xB93A, bytes([0x8E, 0x85, 0xB9, 0x8C, 0x86, 0xB9, 0xAA, 0xA0, 0x07, 0xD0, 0x1C]), "voice-two dispatch"),
    (0xB958, bytes([0x8C, 0x86, 0xB9, 0x8E, 0x85, 0xB9, 0xAA, 0xA0, 0x00, 0xA9, 0x00, 0x99, 0x04, 0xD4]), "one-shot dispatch"),
    (0xB966, bytes([0xBD, 0x87, 0xB9, 0x99, 0x01, 0xD4, 0xBD, 0x88, 0xB9, 0x99, 0x05, 0xD4, 0xBD, 0x89, 0xB9, 0x99, 0x06, 0xD4, 0xBD, 0x8A, 0xB9, 0x99, 0x04, 0xD4]), "one-shot dispatch"),
    (0xAF3A, bytes([0xA0, 0x1B, 0xD0, 0x02, 0xA0, 0x0D, 0xA2, 0x0D, 0xB9, 0x52, 0xAF, 0x9D, 0x00, 0xD4, 0x88, 0xCA, 0xD0, 0xF6, 0xA9, 0x15, 0x8D, 0x0B, 0xD4, 0x60]), "lift profiles"),
    (0x8DCB, bytes([0xA2, 0x00, 0x8E, 0x0F, 0xD4]), "Benson display stop"),
    (0x8DEE, bytes([0x29, 0x3F, 0xC9, 0x20, 0xD0, 0x02, 0xA9, 0xD0, 0x18, 0x69, 0x30, 0x8D, 0x0F, 0xD4]), "Benson display modulation"),
    (0xB5D8, bytes([0xA5, 0xA8, 0xD0, 0x41, 0xA5, 0xA9, 0xC9, 0x0A, 0xF0, 0x3B]), "craft modulation"),
    (0xB5E2, bytes([0xA5, 0x27, 0x10, 0x04, 0xA9, 0x00, 0xF0, 0x0D, 0x38, 0xE9, 0x0C, 0xF0, 0x02, 0x10, 0x02, 0xA9, 0x04, 0x0A, 0x0A, 0x09, 0x08]), "craft modulation"),
    (0xB5F8, bytes([0x29, 0xF0, 0x85, 0x06, 0xA5, 0x26, 0x4A, 0x4A, 0x4A, 0x4A, 0x05, 0x06, 0x8D, 0xAB, 0xB9, 0x8D, 0x08, 0xD4]), "craft modulation"),
    (0xB60A, bytes([0x68, 0xCD, 0xAD, 0xB9, 0xF0, 0x0D, 0x8D, 0xAD, 0xB9, 0x8D, 0x0D, 0xD4, 0x90, 0x05, 0xA9, 0x24, 0x20, 0x3A, 0xB9]), "craft modulation"),
    (0xBB2F, bytes([0xA0, 0x00, 0x84, 0xCA, 0x8C, 0x0B, 0xD4, 0x60]), "lift stop"),
    (0xB43E, bytes([0x20, 0x4D, 0xB9, 0x86, 0xCD]), "lift start ding and destination"),
    (0xB476, bytes([0xA9, 0x30, 0x20, 0x3A, 0xB9]), "lift start voice-two program"),
    (0xBA84, bytes([0xB9, 0xA5, 0xBB, 0x8D, 0x08, 0xD4]), "descending lift pitch"),
    (0xBAE6, bytes([0xB9, 0xA5, 0xBB, 0x8D, 0x08, 0xD4]), "ascending lift pitch"),
)


def _guard(ram: bytes, address: int, expected: bytes, label: str) -> None:
    _require(
        ram[address:address + len(expected)] == expected,
        f"Reference Build {label} guard changed at ${address:04X}",
    )


def decode_sound(ram: bytes) -> dict[str, Any]:
    """Decode the complete bounded SID document from a conditioned RAM image."""

    _require(len(ram) == 65536, "Sound decode requires exactly 64 KiB of physical RAM")
    for address, expected, label in _GUARDS:
        _guard(ram, address, expected, label)

    raw_initial = ram[0xB921:0xB93A]
    table = ram[0xB987:0xB9BB]
    lift = ram[0xAF52:0xAF6E]
    _require(raw_initial == INITIAL_REGISTERS, "Reference Build initial SID register table changed")
    _require(table == ONE_SHOT_TABLE, "Reference Build one-shot SID table changed")
    _require(lift == LIFT_PROFILES, "Reference Build lift SID profiles changed")

    initial = list(raw_initial)
    # The routine applies the table and then immediately overwrites voice 3's
    # control register.  Consumers need the effective state, not the stale
    # intermediate byte held in the table.
    initial[18] = 0x41
    one_shots = [
        {
            "selector": offset,
            "frequencyHigh": table[offset],
            "attackDecay": table[offset + 1],
            "sustainRelease": table[offset + 2],
            "control": table[offset + 3],
        }
        for offset in range(0, len(table), 4)
    ]
    supported_controls = {0x41, 0x80, 0x81}
    _require(
        {program["control"] for program in one_shots} <= supported_controls,
        "Reference Build one-shot table requires an unsupported SID control mode",
    )

    profiles = []
    for index, entry in enumerate(("af3e", "af3a")):
        registers = list(lift[index * 14:(index + 1) * 14])
        profiles.append({
            "entry": entry,
            "registers": registers,
            "startControl": 0x15,
        })

    return {
        "schemaVersion": SOUND_SCHEMA_VERSION,
        "counts": {
            "initialRegisters": len(initial),
            "liftProfiles": len(profiles),
            "oneShotPrograms": len(one_shots),
            "voices": 3,
        },
        "sid": {
            "clockHz": 985248,
            "model": "6581",
            "registerCount": 25,
            "supportedControls": [0x00, 0x04, 0x10, 0x15, 0x41, 0x80, 0x81],
            "voiceStride": 7,
        },
        "initialRegisters": initial,
        "oneShots": one_shots,
        "liftProfiles": profiles,
        "liftJourney": {
            "dingSelector": 0,
            "programSelector": 0x30,
            "pitchHighRegister": 8,
            "controlRegister": 11,
            "stoppedValue": 0,
        },
        "craft": {
            "programSelector": 36,
            "frequencyHighRegister": 8,
            "sustainReleaseRegister": 13,
            "undergroundSuppresses": True,
            "walkingCraftId": 10,
            "speedHighShift": 4,
            "throttleSubtract": 12,
            "throttleFloor": 4,
            "sustainReleaseOr": 8,
        },
        "bensonDisplay": {
            "voice": 3,
            "frequencyHighRegister": 15,
            "controlRegister": 18,
            "control": 0x41,
            "characterMask": 0x3F,
            "spaceCode": 0x20,
            "spaceFrequencyHigh": 0xD0,
            "frequencyHighBias": 0x30,
            "stopFrequencyHigh": 0,
        },
        "stopRules": {
            "oneShotControlRegister": 4,
            "secondVoiceControlRegister": 11,
            "liftControlRegister": 11,
            "bensonDisplayFrequencyHighRegister": 15,
            "stoppedValue": 0,
        },
    }


__all__ = [
    "INITIAL_REGISTERS",
    "LIFT_PROFILES",
    "ONE_SHOT_TABLE",
    "SOUND_SCHEMA_VERSION",
    "decode_sound",
]
