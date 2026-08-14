"""Decode the Reference Build's craft parameter blocks and control-loop rules.

Walking and flying are one control loop in the Reference Build. Which craft the
player is in only changes a sixteen-byte parameter block copied into a live block
at ``$BEA0`` on boarding, and walking is itself one of those blocks. Recovered
from our own Reference Build; the Reference Disassembly was read only to locate
the routines (ADR 0014). See ``notes/decode/flight.md``.

Engine shape, as disassembled and confirmed against our own image:

* The block table is eleven blocks, not eight. Eight craft, then walking, a crash
  tumble, and the parachute descent — the run ends exactly where the first
  control routine's code begins, which is what pins the count.
* Pairs are the engine's own sixteen-bit float: a mantissa byte carrying an
  implicit leading one, then a byte holding the value's sign in bit 0 and the
  exponent in the remaining bits, two places up. One power of two is ``$04``.
  Nothing in the payload keeps that encoding — every pair leaves here as a real
  number, which is ADR 0015's rule applied to arithmetic instead of addresses.
* Yaw and speed are both first-order filters but not the same one. Yaw damps then
  takes its input; speed takes its input then damps.
* Take-off and landing are mode changes rather than inputs: crossing an altitude
  band in either direction switches the flying flag and reinstalls a block, and
  whether a touchdown was a landing or a crash is two magnitude tests.

The throttle ladder is the one part not read from a code site. The digit keys
reach the throttle through a keyboard table and a bit shuffle whose incoming
carry comes from outside the routine, so rather than guess at it this module
carries the ladder our own frozen trace TR-9024 measured — ten notches one
exponent step apart — and asserts it against the saturation limit the code does
state.
"""

from __future__ import annotations

from typing import Any

from .core import require as _require


FLIGHT_SCHEMA_VERSION = 2

#: The parameter block table, and the live block one is copied into on boarding.
BLOCK_TABLE_BASE = 0x9DAD
BLOCK_LENGTH = 16
LIVE_BLOCK_BASE = 0xBEA0
#: Eight craft, then walking, the crash tumble, and the parachute descent.
CRAFT_BLOCK_COUNT = 8
BLOCK_COUNT = 11
#: Names for the three blocks the engine installs itself, in table order.
MODE_BLOCK_NAMES = ("walking", "tumble", "descent")
#: Where the walking block's copied run starts: past the craft, past the handler.
WALKING_BLOCK_SOURCE = BLOCK_TABLE_BASE + CRAFT_BLOCK_COUNT * BLOCK_LENGTH + 2

#: Control routines, and the names the payload carries in place of addresses.
CONTROL_STANDARD = 0x9F17
CONTROL_SINKING = 0x9EFD
CONTROL_SLOT7 = 0x9E5D
CONTROL_TUMBLE = 0x9EBE
CONTROL_DESCENT = 0x9E66
HANDLER_NAMES = {
    CONTROL_STANDARD: "standard",
    CONTROL_SINKING: "sinking",
    CONTROL_SLOT7: "slot7",
    CONTROL_TUMBLE: "tumble",
    CONTROL_DESCENT: "descent",
}

#: Sites the decoder reads its rules from, each asserted before it is trusted.
YAW_DAMPING_SITE = 0x9F26
YAW_AUTHORITY_SITE = 0x9F39
YAW_NEGATE_SITE = 0x9F52
LEFT_MASK_SITE = 0x9F33
RIGHT_MASK_SITE = 0x9F46
PITCH_DOWN_MASK_SITE = 0x9F5A
PITCH_UP_MASK_SITE = 0x9F70
PITCH_STEP_SITE = 0x9F63
PITCH_WRAP_SITE = 0x9F6C
THROTTLE_SITE = 0x9F86
POWERAMP_CRAFT_SITE = 0x9F91
POWERAMP_THROTTLE_SITE = 0x9F96
THROTTLE_GAIN_SITE = 0x9F9C
SPEED_DAMPING_SITE = 0x9FAF
SINKING_PITCH_ZERO_SITE = 0x9EFF
SINKING_ALTITUDE_SITE = 0x9F02
TAKEOFF_SPEED_SITE = 0xA028
LIFT_EXPONENT_SITE = 0xA047
LIFT_MANTISSA_SITE = 0xA06B
CEILING_SITE = 0xA04D
POWERAMP_CEILING_SITE = 0xA05B
CEILING_CLIMB_SITE = 0xA069
GROUND_BAND_SITE = 0xA096
CRASH_RATE_SITE = 0xA09E
CRASH_PITCH_SITE = 0xA0AD
TOUCHDOWN_GROUND_SITE = 0xA0BA
TOUCHDOWN_PITCH_MASK_SITE = 0xA0C2
WALKING_COPY_COUNT_SITE = 0xA0CC
WALKING_COPY_SOURCE_SITE = 0xA0CE
PITCH_LEVEL_SITE = 0xA030
ROLL_COUPLING_SITE = 0xA11B
THROTTLE_SATURATION_SITE = 0xB4A7

#: The throttle byte the loop reads, which is asserted at ``THROTTLE_SITE``. The
#: rest of the state this loop drives — the flying flag at ``$7F``, yaw velocity
#: at ``$22``, speed at ``$26``, the poweramp flag at ``$29DC`` — is named in
#: ``notes/decode/flight.md`` rather than here, since nothing reads it back.
THROTTLE_STATE = 0xEC

#: The throttle ladder, as measured by our own frozen trace TR-9024.
THROTTLE_NOTCH_COUNT = 10
THROTTLE_LOWEST_EXPONENT_BYTE = 0x14
THROTTLE_HIGHEST_EXPONENT_BYTE = 0x38

#: One power of two in an exponent byte, and one turn in the ten-bit angles.
EXPONENT_STEP = 4
ANGLE_UNITS_PER_TURN = 1024


def decode_float(mantissa: int, exponent: int) -> float:
    """Read one engine float: a mantissa byte and an exponent-and-sign byte.

    The mantissa carries an implicit leading one, so it spans ``[1, 2)``. The
    exponent byte holds the value's sign in bit 0 and the exponent two places up,
    which a signed shift recovers in one step.
    """
    signed = exponent - 0x100 if exponent >= 0x80 else exponent
    magnitude = (1.0 + mantissa / 256.0) * 2.0 ** (signed >> 2)
    return -magnitude if exponent & 0x01 else magnitude


def encode_float(value: float) -> tuple[int, int]:
    """Round-trip partner for :func:`decode_float`, for tests and cross-checks."""
    _require(value != 0.0, "The engine float format has no zero")
    sign = 0x01 if value < 0 else 0x00
    magnitude = abs(value)
    exponent = 0
    while magnitude >= 2.0:
        magnitude /= 2.0
        exponent += 1
    while magnitude < 1.0:
        magnitude *= 2.0
        exponent -= 1
    mantissa = int(round((magnitude - 1.0) * 256.0))
    if mantissa == 256:  # rounding carried past the implicit one
        mantissa = 0
        exponent += 1
    _require(-32 <= exponent <= 30, f"Exponent {exponent} is outside the engine's range")
    return mantissa, ((exponent << 2) & 0xFC) | sign


def decode_roll_scale(coupling: int) -> float:
    """The roll-to-yaw coupling byte as a real multiplier.

    The engine adds the byte to a value's exponent, so with bit 7 clear it is a
    power of two. With bit 7 set the engine uses the byte as the exponent
    outright, which is next to nothing — carried as zero, like every other
    encoding this module keeps out of the payload.
    """
    if coupling & 0x80:
        return 0.0
    return 2.0 ** (coupling >> 2)


def _magnitude_threshold(compared: int) -> float:
    """A ``cmp`` against a sign-flipped exponent byte, as a real magnitude.

    The loop compares magnitudes by exclusive-oring the exponent byte with ``$80``
    so an unsigned compare orders signed exponents, so undoing that recovers the
    exponent the threshold stands for.
    """
    return decode_float(0, compared ^ 0x80)


def _require_engine(ram: bytes) -> None:
    """Confirm the control loop is the one these rules were read from."""
    _require(len(ram) == 65536, "Flight decode requires a 64 KiB physical RAM image")
    _require(
        BLOCK_TABLE_BASE + BLOCK_COUNT * BLOCK_LENGTH == CONTROL_SLOT7,
        "The block table does not end where the first control routine begins",
    )
    checks = (
        (CONTROL_STANDARD, (0xA5, 0xCA), "the standard control routine does not begin as read"),
        (CONTROL_SINKING, (0xA9, 0x00), "the sinking control routine does not begin as read"),
        (CONTROL_SLOT7, (0x4C,), "slot 7's control routine does not hand off"),
        (CONTROL_TUMBLE, (0xA5, 0x76), "the tumble routine does not begin by reading altitude"),
        (YAW_DAMPING_SITE, (0xAE, 0xA2, 0xBE), "yaw damping is not read from the live block"),
        (YAW_AUTHORITY_SITE, (0xAE, 0xA4, 0xBE), "yaw authority is not read from the live block"),
        (YAW_NEGATE_SITE, (0xC8,), "turning right does not negate the authority"),
        (LEFT_MASK_SITE, (0xA9,), "the left input is not an immediate mask"),
        (RIGHT_MASK_SITE, (0xA9,), "the right input is not an immediate mask"),
        (PITCH_DOWN_MASK_SITE, (0xA9,), "the nose-down input is not an immediate mask"),
        (PITCH_UP_MASK_SITE, (0xA9,), "the nose-up input is not an immediate mask"),
        (PITCH_STEP_SITE, (0x6D, 0xA6, 0xBE), "the pitch step is not read from the live block"),
        (PITCH_WRAP_SITE, (0x29,), "pitch is not masked to a wrap"),
        (THROTTLE_SITE, (0xA6, THROTTLE_STATE), "the loop does not read the throttle"),
        (POWERAMP_CRAFT_SITE, (0xC0,), "the poweramp bonus does not test an immediate craft id"),
        (POWERAMP_THROTTLE_SITE, (0x69,), "the poweramp bonus is not an immediate add"),
        (THROTTLE_GAIN_SITE, (0xAE, 0xAE, 0xBE), "throttle gain is not read from the live block"),
        (SPEED_DAMPING_SITE, (0xAE, 0xAA, 0xBE), "speed damping is not read from the live block"),
        (SINKING_PITCH_ZERO_SITE, (0x8D, 0xA6, 0xBE), "the sinking routine does not clear the pitch step"),
        (SINKING_ALTITUDE_SITE, (0xA9,), "the sinking routine does not pin an immediate altitude"),
        (TAKEOFF_SPEED_SITE, (0xC9,), "the take-off gate is not an immediate compare"),
        (LIFT_EXPONENT_SITE, (0xAC, 0xA9, 0xBE), "the lift exponent is not read from the live block"),
        (LIFT_MANTISSA_SITE, (0xAE, 0xA8, 0xBE), "the lift mantissa is not read from the live block"),
        (CEILING_SITE, (0xAD, 0xAD, 0xBE), "the ceiling is not read from the live block"),
        (POWERAMP_CEILING_SITE, (0xA9,), "the poweramp ceiling is not an immediate"),
        (CEILING_CLIMB_SITE, (0xA0,), "the ceiling does not replace the climb exponent"),
        (GROUND_BAND_SITE, (0xC9,), "the ground band is not an immediate compare"),
        (CRASH_RATE_SITE, (0xC9,), "the descent-rate test is not an immediate compare"),
        (CRASH_PITCH_SITE, (0xC9,), "the touchdown pitch test is not an immediate compare"),
        (TOUCHDOWN_GROUND_SITE, (0xA9,), "touchdown does not set an immediate ground altitude"),
        (TOUCHDOWN_PITCH_MASK_SITE, (0x29,), "touchdown does not mask the pitch"),
        (WALKING_COPY_COUNT_SITE, (0xA2,), "touchdown does not copy an immediate count"),
        (WALKING_COPY_SOURCE_SITE, (0xBD,), "touchdown does not copy from an absolute source"),
        (PITCH_LEVEL_SITE, (0xA9,), "level pitch is not an immediate"),
        (ROLL_COUPLING_SITE, (0xAD, 0xA7, 0xBE), "roll coupling is not read from the live block"),
        (THROTTLE_SATURATION_SITE, (0xC9,), "the throttle limit is not an immediate compare"),
    )
    for address, expected, complaint in checks:
        found = tuple(ram[address:address + len(expected)])
        _require(found == expected, f"Reference Build {complaint}")

    source = ram[WALKING_COPY_SOURCE_SITE + 1] | (ram[WALKING_COPY_SOURCE_SITE + 2] << 8)
    _require(
        source == WALKING_BLOCK_SOURCE,
        "Touchdown does not install the walking block from where the table puts it",
    )


def _block(ram: bytes, index: int) -> dict[str, Any]:
    base = BLOCK_TABLE_BASE + index * BLOCK_LENGTH
    raw = ram[base:base + BLOCK_LENGTH]
    handler = raw[0] | (raw[1] << 8)
    name = HANDLER_NAMES.get(handler)
    _require(
        name is not None,
        f"Block {index} dispatches through unnamed routine ${handler:04X}",
    )
    record: dict[str, Any] = {
        "index": index,
        "handler": name,
        "yawDamping": decode_float(raw[2], raw[3]),
        "yawAuthority": decode_float(raw[4], raw[5]),
        "pitchStep": raw[6],
        "rollCoupling": decode_roll_scale(raw[7]),
        "liftFactor": decode_float(raw[8], raw[9]),
        "speedDamping": decode_float(raw[10], raw[11]),
        "ceiling": raw[13],
        "throttleGain": decode_float(raw[14], raw[15]),
    }
    if index >= CRAFT_BLOCK_COUNT:
        record["mode"] = MODE_BLOCK_NAMES[index - CRAFT_BLOCK_COUNT]
    if name == "tumble":
        # This handler reads the same offsets as plain bytes instead of floats.
        record["tumble"] = {
            "altitudeDrop": raw[2],
            "rollStep": raw[3],
            "pitchStep": raw[4],
            "yawStep": raw[5],
        }
    if name in ("standard", "sinking"):
        # Only these two run the filters, so only they have to hold factors that
        # damp. The tumble and descent blocks reuse the same offsets as plain
        # bytes, and theirs decode as floats that mean nothing.
        for field in ("speedDamping", "yawDamping"):
            _require(
                0.0 < record[field] < 1.0,
                f"Block {index} {field} {record[field]} is not a damping factor",
            )
    return record


def _throttle_ladder() -> list[float]:
    step = (THROTTLE_HIGHEST_EXPONENT_BYTE - THROTTLE_LOWEST_EXPONENT_BYTE) // (
        THROTTLE_NOTCH_COUNT - 1
    )
    _require(
        step == EXPONENT_STEP,
        "The measured throttle ladder does not step one power of two per notch",
    )
    return [
        decode_float(0, THROTTLE_LOWEST_EXPONENT_BYTE + notch * EXPONENT_STEP)
        for notch in range(THROTTLE_NOTCH_COUNT)
    ]


def _rules(ram: bytes) -> dict[str, Any]:
    pitch_wrap = (ram[PITCH_WRAP_SITE + 1] + 1) << 8
    _require(
        pitch_wrap == ANGLE_UNITS_PER_TURN,
        "Pitch does not wrap to the turn the sine routine uses",
    )
    ladder = _throttle_ladder()
    # Unlike the loop's magnitude tests this one compares the exponent byte as it
    # stands, so it is read straight rather than through the sign flip.
    saturation = decode_float(0, ram[THROTTLE_SATURATION_SITE + 1])
    _require(
        saturation > ladder[-1],
        "The throttle ladder's top notch is not below the engine's limit",
    )
    return {
        "angleUnitsPerTurn": ANGLE_UNITS_PER_TURN,
        "levelPitch": ram[PITCH_LEVEL_SITE + 1] << 8,
        "groundAltitude": ram[TOUCHDOWN_GROUND_SITE + 1],
        "groundBand": ram[GROUND_BAND_SITE + 1],
        "takeoffSpeed": _magnitude_threshold(ram[TAKEOFF_SPEED_SITE + 1]),
        "crashDescentRate": _magnitude_threshold(ram[CRASH_RATE_SITE + 1]),
        "crashPitch": ram[CRASH_PITCH_SITE + 1] << 2,
        "ceilingClimbScale": decode_float(0, ram[CEILING_CLIMB_SITE + 1]),
        "ceilingUnit": 1 << 16,
        "throttleNotches": ladder,
        "throttleLimit": saturation,
        "poweramp": {
            "craft": ram[POWERAMP_CRAFT_SITE + 1],
            "throttleScale": decode_float(0, ram[POWERAMP_THROTTLE_SITE + 1]),
            "ceiling": ram[POWERAMP_CEILING_SITE + 1],
        },
        "walkingBlock": CRAFT_BLOCK_COUNT,
    }


def live_block_matches_walking(ram: bytes) -> bool:
    """Whether the live block carries the walking dynamics, as on foot it must.

    Touchdown installs offsets 2 to 11 of the walking block, so in a capture taken
    on foot the live block has to agree with the table. It is a free check on the
    extraction, using bytes the geometry loader already guarantees are conditioned.
    """
    count = ram[WALKING_COPY_COUNT_SITE + 1] + 1
    source = WALKING_BLOCK_SOURCE
    return ram[LIVE_BLOCK_BASE + 2:LIVE_BLOCK_BASE + 2 + count] == ram[source:source + count]


def decode_flight(ram: bytes) -> dict[str, Any]:
    """Read every parameter block and every rule the control loop applies."""
    _require_engine(ram)
    blocks = [_block(ram, index) for index in range(BLOCK_COUNT)]
    handlers = sorted({block["handler"] for block in blocks})
    _require(
        blocks[CRAFT_BLOCK_COUNT]["handler"] == "standard",
        "The walking block does not dispatch through the standard control routine",
    )
    _require(
        live_block_matches_walking(ram),
        "The capture's live block does not carry the walking dynamics it should on foot",
    )
    return {
        "schemaVersion": FLIGHT_SCHEMA_VERSION,
        "blocks": blocks,
        "rules": _rules(ram),
        "counts": {
            "flightBlocks": len(blocks),
            "flightCraft": CRAFT_BLOCK_COUNT,
            "flightHandlers": len(handlers),
        },
    }
