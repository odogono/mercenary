"""Decode and step the Reference Build's shared pseudo-random generator."""

from __future__ import annotations

from typing import Any

from .core import require as _require


RANDOM_ROUTINE = 0xADEF
RANDOM_VALUE = 0xE8
RANDOM_STATE = 0xF3


def _byte(value: int, name: str) -> None:
    _require(
        isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 0xFF,
        f"Reference PRNG {name} must be one machine byte",
    )


def _rotate_right(value: int, carry: int) -> tuple[int, int]:
    return ((carry << 7) | (value >> 1), value & 0x01)


def step_reference_prng(*, value: int, state: int, carry_in: int) -> dict[str, int]:
    """Run one call to the Reference Build generator without hidden CPU state."""
    _byte(value, "value")
    _byte(state, "state")
    _require(
        carry_in in (0, 1) and not isinstance(carry_in, bool),
        "Reference PRNG carry must be zero or one",
    )

    accumulator = value
    carry = carry_in
    for _ in range(3):
        accumulator, carry = _rotate_right(accumulator, carry)
    accumulator ^= value
    accumulator, carry = _rotate_right(accumulator, carry)
    state, carry = _rotate_right(state, carry)
    value, carry = _rotate_right(value, carry)
    return {"output": accumulator, "value": value, "state": state, "carry": carry}


def decode_reference_prng(ram: bytes) -> dict[str, Any]:
    """Guard the shared generator and return its source-independent contract."""
    _require(len(ram) == 65536, "Reference PRNG decode requires a 64 KiB physical RAM image")
    checks = (
        (RANDOM_ROUTINE, (0xA5, RANDOM_VALUE, 0x6A, 0x6A, 0x6A)),
        (RANDOM_ROUTINE + 5, (0x45, RANDOM_VALUE, 0x6A)),
        (RANDOM_ROUTINE + 8, (0x66, RANDOM_STATE)),
        (RANDOM_ROUTINE + 10, (0x66, RANDOM_VALUE, 0x60)),
    )
    for address, expected in checks:
        found = tuple(ram[address:address + len(expected)])
        _require(found == expected, "Reference Build pseudo-random generator fingerprint changed")
    return {
        "routineAddress": RANDOM_ROUTINE,
        "state": {
            "valueAddress": RANDOM_VALUE,
            "stateAddress": RANDOM_STATE,
            "bytes": 2,
        },
        "carryIn": "caller-provided",
        "output": "accumulator",
        "recurrence": "three-rotate-xor-rotate-then-two-state-rotates",
    }
