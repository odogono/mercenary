"""Decode fixed-screen effects selected by object residence.

The browser consumes semantic viewport coordinates and a bitmap mask.  The
values below are addresses in the configured Reference Build, not replacement
artwork: every exported value is read from RAM after its instruction shape has
been guarded.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .core import LabError, require as _require

OBJECT_EFFECTS_SCHEMA_VERSION = 1

_OBJECT_FLAGS = 0x29C0
_VIC_LEFT_BORDER = 24
_VIC_TOP_BORDER = 50
_SPRITE_WIDTH = 24
_SPRITE_HEIGHT = 21

_GUARDS: tuple[tuple[int, bytes, str], ...] = (
    (
        0x8167,
        bytes.fromhex(
            "a9008d12d08d1bd0a9018d19d08d1ad08d17d08d1dd0"
            "a9a08d00d0a90f8d27d0a9748d01d0"
        ),
        "sprite setup",
    ),
    (0x91DD, bytes.fromhex("a9018d27d0"), "Room colour"),
    (0x9374, bytes.fromhex("a900aee8291002a9018d15d0"), "visibility"),
    (0xB23C, bytes.fromhex("a90f8d27d060"), "surface colour"),
)

_NATIVE_CENSUS_GUARDS: tuple[tuple[str, int, bytes], ...] = (
    ("native:photon:91f2", 0x91F2, bytes.fromhex("a910201a94f01120")),
    ("native:anti-time-bomb:87af", 0x87AF, bytes.fromhex("add829306220ac96")),
    ("native:metal-detector:b53d", 0xB53D, bytes.fromhex("a5caf00160adda29")),
    ("native:antigrav:9817", 0x9817, bytes.fromhex("addb293007bdc029")),
    (
        "native:poweramp:9f8a-a050",
        0x9F8A,
        bytes.fromhex("acdc291009a4a9c001d00318"),
    ),
    ("native:sights:9374", 0x9374, bytes.fromhex("a900aee8291002a9")),
    ("native:door-keys:9493", 0x9493, bytes.fromhex("a509290fc9089006")),
    ("native:skeleton-key:948e", 0x948E, bytes.fromhex("adf029300ea50929")),
    ("native:kitchen-sink:980b", 0x980B, bytes.fromhex("adef293013bdc029")),
    ("native:pyramid:98fe", 0x98FE, bytes.fromhex("adf8293004a57ff0")),
    ("native:pass-lift:b430", 0xB430, bytes.fromhex("e005d00aadee2930")),
)

_NATIVE_CENSUS_CONTINUATION_GUARDS: tuple[tuple[str, int, bytes], ...] = (
    (
        "native:poweramp:9f8a-a050",
        0xA050,
        bytes.fromhex("aedc291008a6a9e001d002a95a"),
    ),
)

_EXPECTED_DELIVERIES = (
    ("palyar", 136, 29),
    ("palyar", 155, 42),
    ("palyar", 162, 38),
    ("palyar", 163, 44),
    ("palyar", 165, 41),
    ("palyar", 173, 31),
    ("palyar", 147, 34),
    ("palyar", 146, 35),
    ("palyar", 144, 43),
    ("palyar", 170, 45),
    ("palyar", 154, 12),
    ("mechanoid", 70, 29),
    ("mechanoid", 50, 31),
    ("mechanoid", 48, 34),
    ("mechanoid", 34, 35),
    ("mechanoid", 18, 43),
)

_EXPECTED_BENSON_RESIDENCE_INSTRUCTIONS: dict[int, dict[str, Any]] = {
    264: {
        "branchOn": False,
        "onTaken": {"kind": "jmp", "target": 270},
        "op": "inrm",
    },
    265: {
        "branchOn": False,
        "onTaken": {"kind": "jmp", "target": 270},
        "op": "tsti",
    },
    382: {
        "branchOn": False,
        "onTaken": {"kind": "jmp", "target": 385},
        "op": "tsti",
    },
    383: {
        "branchOn": False,
        "onTaken": {"kind": "jmp", "target": 385},
        "op": "inrm",
    },
    388: {
        "branchOn": False,
        "onTaken": {"kind": "jmp", "target": 391},
        "op": "inrm",
    },
    402: {
        "branchOn": True,
        "onTaken": {"kind": "jmp", "target": 406},
        "op": "inrm",
    },
    418: {
        "branchOn": False,
        "onTaken": {"kind": "jmp", "target": 423},
        "op": "tsti",
    },
    432: {
        "branchOn": True,
        "onTaken": {"kind": "jmp", "target": 414},
        "op": "tsti",
    },
    487: {
        "branchOn": True,
        "onTaken": {"kind": "jmp", "target": 392},
        "op": "inrm",
    },
}


def _guard(ram: bytes, address: int, expected: bytes, label: str) -> None:
    _require(
        ram[address : address + len(expected)] == expected,
        f"Reference Build {label} guard changed at ${address:04X}",
    )


def _instruction_matches(
    instructions: list[Any], index: int, op: str, **fields: int
) -> bool:
    item = instructions[index] if index < len(instructions) else None
    return isinstance(item, dict) and item.get("op") == op and all(
        item.get(name) == value for name, value in fields.items()
    )


def _decode_deliveries(instructions: list[Any]) -> tuple[tuple[str, int, int], ...]:
    discovered: list[tuple[str, int, int]] = []
    for index in range(len(instructions) - 1):
        first, second = instructions[index : index + 2]
        if not (
            isinstance(first, dict)
            and isinstance(second, dict)
            and first.get("op") == "loadi"
            and first.get("register") == 14
            and second.get("op") == "loadi"
            and second.get("register") == 15
        ):
            continue
        targets = {
            item.get("target")
            for item in instructions[index + 2 : index + 7]
            if isinstance(item, dict) and item.get("op") == "jmp"
        }
        slot, room = first.get("value"), second.get("value")
        if slot == 12 and room == 102:
            continue
        if 381 in targets:
            discovered.append(("palyar", room, slot))
        elif 398 in targets:
            discovered.append(("mechanoid", room, slot))
    _require(
        len(discovered) == len(_EXPECTED_DELIVERIES)
        and set(discovered) == set(_EXPECTED_DELIVERIES),
        "Residence census no longer finds all 16 Benson deliveries",
    )
    return _EXPECTED_DELIVERIES


def _guard_benson_residence_instructions(instructions: list[Any]) -> None:
    discovered = {
        index: instruction
        for index, instruction in enumerate(instructions)
        if isinstance(instruction, dict)
        and instruction.get("op") in {"inrm", "tsti"}
    }
    _require(
        set(discovered) == set(_EXPECTED_BENSON_RESIDENCE_INSTRUCTIONS),
        "Residence census Benson predicate inventory changed",
    )
    for index, expected in _EXPECTED_BENSON_RESIDENCE_INSTRUCTIONS.items():
        _require(
            discovered[index] == expected,
            f"Residence census Benson predicate instruction {index} changed",
        )


def decode_object_effects(ram: bytes) -> dict[str, Any]:
    """Recover the Reference Build's Sights sprite as browser payload data."""

    _require(
        len(ram) == 65536,
        "Object-effects decode requires exactly 64 KiB of physical RAM",
    )
    for address, expected, label in _GUARDS:
        _guard(ram, address, expected, label)

    # LDX absolute in the per-frame visibility test names the functional object
    # slot.  The adjacent duplicate-name object is therefore not special-cased.
    flag_address = ram[0x9377] | (ram[0x9378] << 8)
    slot = flag_address - _OBJECT_FLAGS
    _require(0 <= slot < 64, "Reference Build Sights object slot is out of range")

    # VIC bank selection, gameplay screen base, and its sprite-zero pointer lead
    # to the mask.  Reading this path also guards against silently decoding a
    # coincidental run of bytes at a hard-coded artwork address.
    _require(ram[0x8140] == 0xA9 and ram[0x8142:0x8145] == b"\x8d\x00\xdd", "Reference Build VIC bank setup changed")
    dd00 = ram[0x8141]
    bank = (3 - (dd00 & 0x03)) * 0x4000
    d018 = ram[0x00C7]
    _require(d018 == 0x70, "Reference Build gameplay screen selector changed")
    screen = bank + ((d018 >> 4) & 0x0F) * 0x400
    pointer = ram[screen + 0x3F8]
    _require(pointer == 0xD9, "Reference Build Sights sprite pointer changed")
    sprite_address = bank + pointer * 64
    bitmap = ram[sprite_address : sprite_address + 63]
    _require(
        bitmap == bytes.fromhex("ff00ff" + "00" * 60),
        "Reference Build Sights sprite mask changed",
    )
    rows = [int.from_bytes(bitmap[index : index + 3], "big") for index in range(0, 63, 3)]

    x = ram[0x817E]
    y = ram[0x8188]
    surface_colour = ram[0xB23D]
    room_colour = ram[0x91DE]
    _require(surface_colour <= 15 and room_colour <= 15, "Sights colour is not a C64 palette index")

    return {
        "schemaVersion": OBJECT_EFFECTS_SCHEMA_VERSION,
        "counts": {
            "effects": 1,
            "sightsPixels": sum(row.bit_count() for row in rows),
        },
        "sights": {
            "slot": slot,
            "width": _SPRITE_WIDTH,
            "height": _SPRITE_HEIGHT,
            "bitmapRows": rows,
            "origin": [x - _VIC_LEFT_BORDER, y - _VIC_TOP_BORDER],
            "pixelScale": [2, 2],
            "colours": {"surface": surface_colour, "room": room_colour},
        },
    }


def decode_residence_effect_census(
    ram: bytes, benson: dict[str, Any]
) -> dict[str, Any]:
    """Census guarded native reads and decoded Benson Residence predicates."""

    _require(len(ram) == 65536, "Residence census requires exactly 64 KiB of physical RAM")
    native_sites: list[str] = []
    for key, address, expected in _NATIVE_CENSUS_GUARDS:
        _guard(ram, address, expected, f"census {key}")
        native_sites.append(key)
    for key, address, expected in _NATIVE_CENSUS_CONTINUATION_GUARDS:
        _guard(ram, address, expected, f"census {key}")

    instructions = benson.get("instructions")
    _require(isinstance(instructions, list), "Residence census requires decoded Benson instructions")
    benson_sites: list[str] = []

    _require(
        _instruction_matches(instructions, 262, "loadi", register=14, value=30)
        and _instruction_matches(instructions, 263, "loadi", register=15, value=16)
        and _instruction_matches(instructions, 264, "inrm")
        and _instruction_matches(instructions, 265, "tsti"),
        "Residence census lost the Benson Antenna predicate",
    )
    benson_sites.append("benson:antenna:script-2")
    _guard_benson_residence_instructions(instructions)

    benson_sites.extend(
        f"benson:delivery:{faction}:{room}:{slot}"
        for faction, room, slot in _decode_deliveries(instructions)
    )

    _require(
        _instruction_matches(instructions, 400, "loadi", register=14, value=12)
        and _instruction_matches(instructions, 401, "loadi", register=15, value=102)
        and _instruction_matches(instructions, 402, "inrm"),
        "Residence census lost the Captured Mechanoid predicate",
    )
    benson_sites.append("benson:captured-mechanoid:room-102")
    _require(
        _instruction_matches(instructions, 412, "loadi", register=14, value=25)
        and _instruction_matches(instructions, 418, "tsti")
        and _instruction_matches(instructions, 432, "tsti"),
        "Residence census lost the Novadrive predicates",
    )
    benson_sites.append("benson:novadrive:script-7")
    _require(
        _instruction_matches(instructions, 485, "loadi", register=14, value=46)
        and _instruction_matches(instructions, 486, "loadi", register=15, value=80)
        and _instruction_matches(instructions, 487, "inrm"),
        "Residence census lost the Pass reward predicate",
    )
    benson_sites.append("benson:pass-reward:script-10")

    subject = {"nativeSites": native_sites, "bensonSites": benson_sites}
    digest = hashlib.sha256(
        json.dumps(subject, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {**subject, "digest": digest}


__all__ = [
    "OBJECT_EFFECTS_SCHEMA_VERSION",
    "decode_object_effects",
    "decode_residence_effect_census",
]
