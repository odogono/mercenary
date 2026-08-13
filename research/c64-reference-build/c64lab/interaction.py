"""Decode the Reference Build's take-and-board rules.

Standing next to something and pressing a key is one routine in the Reference
Build, shared by taking an object and boarding a craft. It runs inside the draw
loop, once per object, after the camera-relative difference has been computed —
so the player can only reach what is currently being drawn, and the rules below
are all the routine consults. Recovered from our own Reference Build; the
Reference Disassembly was read only to locate the routine (ADR 0014).

Engine shape, as disassembled and confirmed against our own image:

* The key is compared against two codes, take first and board second, in the same
  six-bit space the scanner reduces the keyboard to.
* Range is a per-axis cube rather than a radius, and it is compared against the
  difference's upper two bytes — so a threshold of one means 256 world units on
  every axis. Take is tighter than board.
* Taking consults the object's own flag byte: one bit fixes an object in place,
  another makes it too heavy to lift, and two global overrides in the object
  tables lift both restrictions. A successful take sets a carried bit, appends to
  a bounded inventory, and moves the object out of the world.
* Boarding additionally requires that the player is on foot and that the object is
  one of the low slots reserved for craft, then plays the craft's description,
  which for some objects starts a Benson Script rather than a message.
"""

from __future__ import annotations

from typing import Any

from .core import LabError


INTERACTION_SCHEMA_VERSION = 1

#: The shared routine, reached once per object from the draw loop.
TAKE_OR_BOARD = 0x97FA
#: Sites the decoder reads its rules from, each asserted before it is trusted.
TAKE_KEY_SITE = 0x97FC
TAKE_RANGE_SITE = 0x9800
FIXED_MASK_SITE = 0x9813
HEAVY_MASK_SITE = 0x981F
INVENTORY_LIMIT_SITE = 0x9827
CARRIED_MASK_SITE = 0x9834
TOO_HEAVY_MESSAGE_SITE = 0x9848
BOARD_KEY_SITE = 0x984F
CRAFT_SLOT_BOUND_SITE = 0x9859
BOARD_RANGE_SITE = 0x985D
DESCRIPTION_MASK_SITE = 0x98B1

#: Global capability overrides, which lift the fixed and too-heavy restrictions
#: for as long as the player holds whatever grants them.
SINK_OVERRIDE = 0x29EF
ANTIGRAV_OVERRIDE = 0x29DB

#: The distance check discards the low byte of each axis difference, so a range
#: threshold counts whole steps of this many world units.
RANGE_UNIT = 256

#: Object slot removed from the world, whether taken or boarded.
REMOVED_FROM_WORLD = 0xFF


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def _require_engine(ram: bytes) -> None:
    """Confirm the interaction routine is the one these rules were read from."""
    _require(len(ram) == 65536, "Interaction decode requires a 64 KiB physical RAM image")
    checks = (
        (TAKE_OR_BOARD, (0xA5, 0xB8), "take and board do not begin by reading the saved key"),
        (TAKE_KEY_SITE, (0xC9,), "take does not compare an immediate key code"),
        (TAKE_RANGE_SITE, (0xA2,), "take does not pass an immediate range"),
        (0x9804, (0x20,), "take does not call the distance check"),
        (FIXED_MASK_SITE, (0x29,), "take does not mask the object flags for a fixed object"),
        (HEAVY_MASK_SITE, (0x29,), "take does not mask the object flags for weight"),
        (INVENTORY_LIMIT_SITE, (0xE0,), "take does not bound the inventory"),
        (CARRIED_MASK_SITE, (0x09,), "take does not set a carried bit in the object flags"),
        (TOO_HEAVY_MESSAGE_SITE, (0xA2,), "the too-heavy path does not select an immediate message"),
        (BOARD_KEY_SITE, (0xC9,), "board does not compare an immediate key code"),
        (CRAFT_SLOT_BOUND_SITE, (0xC9,), "board does not bound the craft slots"),
        (BOARD_RANGE_SITE, (0xA2,), "board does not pass an immediate range"),
        (DESCRIPTION_MASK_SITE, (0x29,), "the description path does not mask the object flags"),
    )
    for address, expected, complaint in checks:
        found = tuple(ram[address:address + len(expected)])
        _require(found == expected, f"Reference Build {complaint}")


def decode_interaction(ram: bytes) -> dict[str, Any]:
    """Read every rule the take-and-board routine applies."""
    _require_engine(ram)
    rules = {
        "takeKey": ram[TAKE_KEY_SITE + 1],
        "boardKey": ram[BOARD_KEY_SITE + 1],
        "takeRange": ram[TAKE_RANGE_SITE + 1],
        "boardRange": ram[BOARD_RANGE_SITE + 1],
        "rangeUnit": RANGE_UNIT,
        "craftSlotBound": ram[CRAFT_SLOT_BOUND_SITE + 1],
        "inventoryLimit": ram[INVENTORY_LIMIT_SITE + 1] - 1,
        "fixedMask": ram[FIXED_MASK_SITE + 1],
        "heavyMask": ram[HEAVY_MASK_SITE + 1],
        "carriedMask": ram[CARRIED_MASK_SITE + 1],
        "descriptionMask": ram[DESCRIPTION_MASK_SITE + 1],
        "tooHeavyMessage": ram[TOO_HEAVY_MESSAGE_SITE + 1],
        "removedFromWorld": REMOVED_FROM_WORLD,
    }
    _require(
        rules["takeRange"] > 0 and rules["boardRange"] >= rules["takeRange"],
        "Interaction ranges are not the expected take-tighter-than-board pair",
    )
    _require(
        rules["inventoryLimit"] > 0 and rules["craftSlotBound"] > 0,
        "Interaction limits decode as empty",
    )
    for name in ("fixedMask", "heavyMask", "carriedMask", "descriptionMask"):
        _require(rules[name] != 0, f"Interaction {name} decodes as no bits at all")
    _require(
        rules["takeKey"] != rules["boardKey"],
        "Take and board decode to the same key code",
    )
    return {
        "schemaVersion": INTERACTION_SCHEMA_VERSION,
        **rules,
        "counts": {
            "rules": len(rules),
            "craftSlots": rules["craftSlotBound"],
        },
    }
