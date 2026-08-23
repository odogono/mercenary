"""Decode native mechanics that participate in Mercenary's endgame.

The Benson decoder owns progression logic.  This module covers the native
engine predicates and consequences which those scripts depend on: dropping,
weapons and their targets, hostile-craft capture, the orbital-region predicate,
and the multi-phase terminal renderer.  Every value is read from the project's
own Reference Build and guarded by the surrounding instruction shape so a
different binary fails instead of silently inheriting these conclusions.
"""

from __future__ import annotations

from typing import Any

from .core import require as _require
from .flight import decode_float
from .prng import RANDOM_ROUTINE, RANDOM_STATE, RANDOM_VALUE, decode_reference_prng


ENDGAME_SCHEMA_VERSION = 8

# Drop key dispatch and native inventory mutation.
DROP_DISPATCH = 0xB33F
DROP_ROUTINE = 0x98FE
OBJECT_FLAGS_BASE = 0x29C0
DROP_EXEMPTION_FLAGS_SITE = 0x29F8
DROP_INVENTORY_SITE = 0x9907
DROP_CARRIED_MASK_SITE = 0x9913
SINK_OVERRIDE_SITE = 0x980B
ANTIGRAV_OVERRIDE_SITE = 0x9817

# Fire, projectile update, world damage, and hostile-craft behavior.
FIRE_CALL_SITE = 0x85E1
FIRE_ROUTINE = 0x886A
PROJECTILE_UPDATE = 0x8690
HOSTILE_ROUTINE = 0x8921

# Site state, faction counters, and the reaction the commit path dispatches.
# The 256-byte city table holds, per surface cell, a destroyed bit, a faction
# or neutral bit, and a low reaction id; the sites below are the committing
# path that reads it after a shot has already set the destroyed bit.
# How a shot's speed is set. The engine holds direction components as a
# mantissa and an exponent, and converts one to fixed point by a self-modifying
# variable shift; the "direction offset" the fire routine adds is an exponent
# offset, so it chooses the scale rather than turning anything.
FIXED_POINT_CONVERT = 0x84A7
FIXED_POINT_OCTAVE_SITE = 0x84AA
FIXED_POINT_LIMIT_SITE = 0x84AC
FIXED_POINT_SELF_MODIFY_SITE = 0x84B5
FIXED_POINT_NORMALISE_SITE = 0x84BD
FIXED_POINT_CHAIN = 0x84C3
FIXED_POINT_CHAIN_STEP = (0x4A, 0x66, 0x06)
ANGLE_EXPONENT_TABLE_SITE = 0x842B
ANGLE_MANTISSA_TABLE_SITE = 0x842F
FIRE_VECTOR_SITE = 0x8895

# The hit test a shot runs each frame, and the collision helper both object
# families share.
SHOT_ALTITUDE_GATE = 0x871D
SHOT_ALTITUDE_LIMIT_SITE = 0x8727
SHOT_CELL_BOUND_SITE = 0x8741
SHOT_CELL_FORM_SITE = 0x874B
IMPACT_SOUND_SITE = 0x876C
COMMIT_CELL_GATE = 0x87A4
OBJECT_HIT_HELPER = 0x8833
OBJECT_HIT_CUBE_SITE = 0x8840
OBJECT_HIT_SOUND_SITE = 0x8849
OBJECT_HIT_CLEARS_ATTACK_SITE = 0x884E
OBJECT_HIT_REMOVES_TARGET_SITE = 0x885A
# The cube test compares the two bytes above the least significant one, so the
# size it is given counts in units of 256 rather than in world units.
OBJECT_HIT_CUBE_COMPARE = 0x99D5

SITE_TABLE = 0x2B00
SITE_TABLE_LENGTH = 0x100
SITE_COMMIT_READ = 0x87AA
RESTORATION_TEST_SITE = 0x87AF
SITE_CHANGE_TEST_SITE = 0x87C1
NEUTRAL_TEST_SITE = 0x87CA
FACTION_STEP_SITE = 0x87D2
PALYAR_COUNTER_SITE = 0x87EB
MECHANOID_COUNTER_SITE = 0x87DD
THRESHOLD_SITE = 0x87EE
REACTION_SELECT_SITE = 0x8800
REACTION_WIPE_SITE = 0x880A
REACTION_DISPATCH_SITE = 0x8812
RESTORATION_SITE = 0x8816

# The hired Interstellar Ship's arrival: called every frame from the main loop,
# ahead of the branch that would otherwise skip it while the player is indoors.
SHIP_DELIVERY_CALL_SITE = 0x855F
SHIP_DELIVERY_ROUTINE = 0x8634
SHIP_DELIVERY_STATE = 0xBEFF
SHIP_DELIVERY_DESCEND = 0x863B
SHIP_DELIVERY_SHIFT_SITE = 0x8646
SHIP_DELIVERY_LAND_SITE = 0x865B
SHIP_DELIVERY_INITIALISE = 0x8664

# Object component tables, as `c64lab/geometry.py` reads them. The descent
# writes through these at the ship's own slot, which is what fixes the slot.
SHIP_DELIVERY_COMPONENTS = {
    "x": (0x2880, 0x2480, 0x2540),
    "y": (0x28C0, 0x24C0, 0x2580),
    "z": (0x2900, 0x2500, 0x25C0),
}
SHIP_DELIVERY_ROOM_TABLE = 0x2940

# The shared predicate used by flying, landing, and the orbital-region mover.
ORBITAL_PREDICATE = 0xA13D
ORBITAL_CALL_SITES = (0xA01F, 0xA0E6, 0xA1DA)

# gameComplete dispatch and its later terminal-presentation transition.
ENDING_DISPATCH = 0xAA69
ENDING_COMPLETE_SITE = 0xAC44

# Slot-7's terminal-only Interstellar Ship Field.
FIELD_ENTRY = 0xAA73
FIELD_LOOP = 0xAA95
FIELD_UPDATE = 0xAAF2
FIELD_RESPAWN = 0xABBD
FIELD_COLOUR_STATE = 0xAC0A
FIELD_COLOUR_TABLE = 0xAC0C
FIELD_COLOUR_STEP = 0xAC1C
FIELD_POINT_COUNT_SITE = 0xAC4A
FIELD_RANDOM_CALLS = (0xABBF, 0xABC4, 0xABC8, 0xABDC, 0xABE1, 0xABE5, 0xABF9)

FIELD_COMPONENT_STORAGE = {
    "x": {"mantissaBase": 0x0100, "exponentBase": 0x0140},
    "y": {"mantissaBase": 0x0180, "exponentBase": 0x02C0},
    "z": {"mantissaBase": 0x0340, "exponentBase": 0x0380},
}
FIELD_SCREEN_STORAGE = {
    "current": {"xBase": 0x0680, "yBase": 0x06C0},
    "prior": {"xBase": 0x0400, "yBase": 0x0480},
}


def _instruction_edges(instructions: list[dict[str, Any]], index: int) -> list[int]:
    instruction = instructions[index]
    operation = instruction.get("op")
    if operation == "ret":
        return []
    if operation == "jmp":
        return [instruction["target"]]

    edges = [index + 1] if index + 1 < len(instructions) else []
    if operation == "call":
        edges.append(instruction["target"])
    taken = instruction.get("onTaken")
    if isinstance(taken, dict):
        edges.append(taken["target"])
    return edges


def _reachable_instructions(instructions: list[dict[str, Any]], entry: int) -> set[int]:
    pending = [entry]
    reached: set[int] = set()
    while pending:
        index = pending.pop()
        _require(0 <= index < len(instructions), f"Benson control flow leaves the decoded instruction table at {index}")
        if index in reached:
            continue
        reached.add(index)
        pending.extend(_instruction_edges(instructions, index))
    return reached


def census_terminal_dispatches(benson: dict[str, Any]) -> dict[str, Any]:
    """Prove which Benson entry points can reach a terminal engine dispatch.

    Calls add both their target and their return continuation to the reachability
    graph. This is deliberately an over-approximation: if no second script can
    reach ``gameComplete`` even then, a hidden Defeat cannot be lost behind call
    stack details.
    """
    scripts = benson.get("scripts")
    instructions = benson.get("instructions")
    counts = benson.get("counts")
    _require(isinstance(scripts, list) and len(scripts) == 51, "Terminal census requires all 51 Benson entries")
    _require(isinstance(instructions, list) and instructions, "Terminal census requires the decoded Benson instructions")
    _require(isinstance(counts, dict) and counts.get("unreachableBytes") == 8, "Terminal census requires the guarded eight-byte unreachable census")
    _require([script.get("id") for script in scripts] == list(range(51)), "Terminal census requires ordered Benson script identities")

    terminal_instructions = [
        index
        for index, instruction in enumerate(instructions)
        if instruction.get("op") == "stor" and instruction.get("symbol") == "gameComplete"
    ]
    _require(len(terminal_instructions) == 1, "Terminal census does not contain exactly one gameComplete store")
    terminal = terminal_instructions[0]
    value = instructions[terminal].get("value")
    _require(value == 1, "Terminal dispatch value is not the decoded Escape phase")

    owners = [
        script["id"]
        for script in scripts
        if terminal in _reachable_instructions(instructions, script["entry"])
    ]
    _require(owners == [7], "Terminal dispatch is reachable from something other than exactly script 7")

    def called_wait(index: int, complaint: str) -> int:
        _require(0 <= index < len(instructions), complaint)
        call = instructions[index]
        _require(call.get("op") == "call" and isinstance(call.get("target"), int), complaint)
        target = call["target"]
        _require(0 <= target and target + 2 < len(instructions), complaint)
        counter, wait, returned = instructions[target:target + 3]
        _require(counter.get("op") == "cfr" and wait.get("op") == "wfr" and returned.get("op") == "ret", complaint)
        branch = wait.get("onTaken")
        _require(isinstance(branch, dict) and branch.get("kind") == "jmp" and branch.get("target") == target + 1, complaint)
        ticks = wait.get("ticks")
        _require(isinstance(ticks, int) and ticks > 0, complaint)
        return ticks

    reached = _reachable_instructions(instructions, terminal)
    initial_wait = called_wait(terminal + 1, "Terminal script does not begin with its guarded wait helper")
    interval = instructions[terminal + 2] if terminal + 2 < len(instructions) else {}
    _require(
        interval.get("op") == "stor" and interval.get("symbol") == "messageInterval" and interval.get("value") == 150,
        "Terminal script does not install its decoded message interval",
    )
    optional_flags = [
        instruction
        for index, instruction in enumerate(instructions)
        if index in reached and instruction.get("op") == "tstf" and instruction.get("mask") == 0x20
    ]
    _require(len(optional_flags) == 1, "Terminal script does not contain exactly one optional epilogue flag branch")

    sound_pairs = [
        index
        for index in range(len(instructions) - 2)
        if index in reached
        and instructions[index] == {"op": "sound", "symbol": "voice1.control", "value": 0}
        and instructions[index + 1] == {"op": "sound", "symbol": "voice2.control", "value": 0}
        and instructions[index + 2].get("op") == "jmp"
    ]
    _require(len(sound_pairs) == 1, "Terminal script does not contain exactly one repeating SID-control tail")
    sound_index = sound_pairs[0]
    pre_loop_call = sound_index - 3
    repeat_call = sound_index - 2
    _require(
        instructions[sound_index - 1].get("op") == "msg"
        and instructions[sound_index + 2].get("target") == repeat_call,
        "Terminal SID-control tail does not repeat from its terminal label wait",
    )
    pre_loop_wait = called_wait(pre_loop_call, "Terminal script does not wait before its repeating label")
    repeat_wait = called_wait(repeat_call, "Terminal script does not wait inside its repeating label loop")
    _require(
        instructions[pre_loop_call].get("target") == instructions[repeat_call].get("target"),
        "Terminal pre-loop and repeating waits do not share one helper",
    )

    return {
        "dispatches": [{"script": 7, "instruction": terminal, "value": value}],
        "endingIdentities": ["escape"],
        "defeatDispatches": 0,
        "unreachableCodeBytes": counts["unreachableBytes"],
        "endingScriptLoop": {
            "script": 7,
            "initialWaitTicks": initial_wait,
            "messageInterval": interval["value"],
            "optionalEpilogueFlagMask": 0x20,
            "preLoopWaitTicks": pre_loop_wait,
            "repeat": {
                "waitTicks": repeat_wait,
                "messageInstructions": 1,
                "sidControlRequests": [
                    {"symbol": instructions[sound_index]["symbol"], "value": instructions[sound_index]["value"]},
                    {"symbol": instructions[sound_index + 1]["symbol"], "value": instructions[sound_index + 1]["value"]},
                ],
            },
        },
    }


def _ship_delivery_slot(ram: bytes) -> int:
    """The slot every initialisation store addresses, or a failure if they disagree.

    The routine never names a slot: it names sixteen-bit addresses inside the
    object component tables, and the slot is their common offset.  Deriving it
    rather than asserting it is what makes the decode fail loudly on a build
    that delivers a different craft.
    """
    stores = {
        0x8666: SHIP_DELIVERY_COMPONENTS["y"][2],
        0x866E: SHIP_DELIVERY_ROOM_TABLE,
        0x8671: SHIP_DELIVERY_COMPONENTS["y"][1],
        0x8674: SHIP_DELIVERY_COMPONENTS["y"][0],
        0x8677: SHIP_DELIVERY_COMPONENTS["x"][0],
        0x867A: SHIP_DELIVERY_COMPONENTS["z"][0],
        0x867F: SHIP_DELIVERY_COMPONENTS["x"][2],
        0x8682: SHIP_DELIVERY_COMPONENTS["z"][2],
        0x8687: SHIP_DELIVERY_COMPONENTS["x"][1],
        0x868C: SHIP_DELIVERY_COMPONENTS["z"][1],
    }
    slots = set()
    for site, base in stores.items():
        _check(ram, site, (0x8D,), f"ship delivery does not store through ${site:04X}")
        target = ram[site + 1] | (ram[site + 2] << 8)
        _require(target >= base, f"Reference Build ship delivery writes below ${base:04X}")
        slots.add(target - base)
    _require(len(slots) == 1, f"Reference Build ship delivery writes across slots {sorted(slots)}")
    return slots.pop()


def _frames_to_land(altitude: int, shift: int) -> int:
    """How many frames the decoded decay takes to reach the ground.

    Run rather than measured, so it moves with the shift count and the seed
    instead of having to be maintained alongside them.
    """
    frames = 0
    while altitude:
        altitude -= (altitude >> shift) + 1
        frames += 1
        _require(frames < 1_000_000, "Ship descent does not reach the ground")
    return frames


def _decode_ship_delivery(ram: bytes) -> dict[str, Any]:
    """Read where the hired ship goes, how fast, and when it has arrived."""
    slot = _ship_delivery_slot(ram)
    descending = ram[SHIP_DELIVERY_INITIALISE + 1]
    _require(descending and not descending & 0x80, "Ship delivery does not descend on a positive state")

    # Every component is stored from an immediate, so the destination is read
    # out of the loads rather than assumed.
    _check(ram, 0x867D, (0xA9,), "ship delivery does not load an immediate X/Z high byte")
    _check(ram, 0x8685, (0xA9,), "ship delivery does not load an immediate X middle byte")
    _check(ram, 0x868A, (0xA9,), "ship delivery does not load an immediate Z middle byte")
    cell_byte = ram[0x867E]
    x_middle = ram[0x8686]
    z_middle = ram[0x868B]
    zeroed = ram[SHIP_DELIVERY_INITIALISE + 9]
    _require(zeroed == 0, "Ship delivery does not clear its low components")

    return {
        "slot": slot,
        "cadence": "every-frame",
        "callSite": SHIP_DELIVERY_CALL_SITE,
        "inactiveValue": 0,
        "acceptedMask": 0x80,
        "descendingValue": descending,
        "initialisation": {
            "room": zeroed,
            "x": (cell_byte << 16) | (x_middle << 8) | zeroed,
            "y": (descending << 16) | (zeroed << 8) | zeroed,
            "z": (cell_byte << 16) | (z_middle << 8) | zeroed,
        },
        "descent": {
            "axis": "y",
            "widthBits": 16,
            "lowByteHeldAt": zeroed,
            "shift": ram[SHIP_DELIVERY_SHIFT_SITE + 1],
            "extraSubtraction": 1,
        },
        "landing": {
            "predicate": "sixteen-bit-zero",
            "cell": [cell_byte, cell_byte],
            "clearsState": True,
            "framesToLand": _frames_to_land(
                (descending << 8) | zeroed,
                ram[SHIP_DELIVERY_SHIFT_SITE + 1],
            ),
        },
    }


def _decode_shot_speed(ram: bytes, direction_offset: int) -> dict[str, Any]:
    """Read the speed a shot carries from the conversion that sets it.

    The engine's direction components are a mantissa holding `1 + m/256` and an
    exponent counting a fixed number of units to a power of two. Converting one
    to fixed point shifts a normalised sixteen-bit value right by the distance
    left in a chain of shift pairs, so adding a constant to the exponent first
    multiplies the result by two for every octave that constant is worth. A
    component of magnitude one therefore converts to exactly that scale, which
    is the speed a shot leaves with along each axis.
    """
    octave_units = 1 << len([
        site for site in (FIXED_POINT_OCTAVE_SITE, FIXED_POINT_OCTAVE_SITE + 1)
        if ram[site] == 0x4A
    ])
    chain_pairs = ram[FIXED_POINT_LIMIT_SITE + 1]
    _require(
        all(
            tuple(ram[FIXED_POINT_CHAIN + step * 3:FIXED_POINT_CHAIN + step * 3 + 3])
            == FIXED_POINT_CHAIN_STEP
            for step in range(chain_pairs)
        ),
        "Fixed-point conversion does not shift by a chain of identical steps",
    )
    _require(
        direction_offset % octave_units == 0,
        "Fire's direction offset is not a whole number of octaves",
    )
    octaves = direction_offset // octave_units
    _require(
        0 < octaves < chain_pairs,
        "Fire's direction offset does not select a representable scale",
    )
    return {
        "exponentUnitsPerOctave": octave_units,
        "speedPerFrame": 1 << octaves,
    }


def _decode_site_table(ram: bytes) -> dict[str, Any]:
    """Read the city table's initial state and the reaction census it implies.

    Every mask, counter, script and threshold below is read from the operands of
    the guarded commit path rather than restated here, and the census is derived
    by scanning the table rather than transcribed, so a different binary or a
    played capture fails instead of inheriting these conclusions.
    """
    destroyed_mask = ram[0x8763 + 1]
    low_id_mask = ram[REACTION_SELECT_SITE + 4]
    dispatch_base = ram[REACTION_SELECT_SITE + 8]
    wipe_mask = ram[REACTION_WIPE_SITE + 4]
    restoration_keep_mask = ram[RESTORATION_SITE + 4]
    neutral_mask_address = ram[NEUTRAL_TEST_SITE + 4] | (ram[NEUTRAL_TEST_SITE + 5] << 8)
    neutral_mask = ram[neutral_mask_address]
    # The faction test shifts the byte left and reads the resulting sign, so it
    # tests the bit immediately below the destroyed bit.
    mechanoid_mask = destroyed_mask >> 1

    restoration_slot = (
        ram[RESTORATION_TEST_SITE + 1] | (ram[RESTORATION_TEST_SITE + 2] << 8)
    ) - OBJECT_FLAGS_BASE

    palyar_counter = ram[PALYAR_COUNTER_SITE + 1] | (ram[PALYAR_COUNTER_SITE + 2] << 8)
    mechanoid_counter = ram[MECHANOID_COUNTER_SITE + 1] | (ram[MECHANOID_COUNTER_SITE + 2] << 8)
    _require(
        palyar_counter != mechanoid_counter,
        "Faction counters share one address",
    )
    for site, counter, complaint in (
        (PALYAR_COUNTER_SITE - 6, palyar_counter, "second"),
        (MECHANOID_COUNTER_SITE - 6, mechanoid_counter, "first"),
    ):
        decremented = ram[site + 1] | (ram[site + 2] << 8)
        _require(
            decremented == counter,
            f"Faction step increments and decrements different {complaint} counters",
        )
    _require(
        (ram[THRESHOLD_SITE + 3] | (ram[THRESHOLD_SITE + 4] << 8)) == mechanoid_counter
        and (ram[THRESHOLD_SITE + 6] | (ram[THRESHOLD_SITE + 7] << 8)) == palyar_counter,
        "Faction threshold does not compare the counters the faction step keeps",
    )

    _require(
        wipe_mask == 0xFF ^ low_id_mask,
        "Reaction dispatch does not wipe exactly the low id it consumed",
    )
    _require(
        restoration_keep_mask == 0xFF ^ destroyed_mask,
        "Restoration does not clear exactly the destroyed bit",
    )
    _require(
        destroyed_mask | mechanoid_mask | neutral_mask | low_id_mask == 0xFF
        and destroyed_mask & mechanoid_mask == 0
        and neutral_mask & (destroyed_mask | mechanoid_mask | low_id_mask) == 0,
        "City table masks do not partition a byte",
    )
    _require(
        dispatch_base & low_id_mask == 0,
        "Reaction script base overlaps the low id it is combined with",
    )

    table = list(ram[SITE_TABLE:SITE_TABLE + SITE_TABLE_LENGTH])
    _require(
        len(table) == SITE_TABLE_LENGTH,
        "City table is not 256 bytes",
    )
    _require(
        not any(byte & destroyed_mask for byte in table),
        "City table already carries destroyed sites, so this capture is not an initial state",
    )

    cells_by_low_id: dict[int, list[int]] = {}
    for cell, byte in enumerate(table):
        cells_by_low_id.setdefault(byte & low_id_mask, []).append(cell)

    neutral = [cell for cell, byte in enumerate(table) if byte & neutral_mask]
    mechanoid = [
        cell
        for cell, byte in enumerate(table)
        if byte & mechanoid_mask and not byte & neutral_mask
    ]
    palyar = [
        cell
        for cell, byte in enumerate(table)
        if not byte & mechanoid_mask and not byte & neutral_mask
    ]
    _require(
        len(neutral) + len(mechanoid) + len(palyar) == SITE_TABLE_LENGTH,
        "City table cells do not partition into neutral and the two factions",
    )
    _require(
        all(not table[cell] & low_id_mask for cell in neutral),
        "A neutral cell carries a reaction id it can never dispatch",
    )
    _require(
        1 not in cells_by_low_id,
        "City table uses a reaction id the dispatch table does not reach",
    )

    reactions = [
        {
            "cells": sorted(cells),
            "lowId": low_id,
            "script": dispatch_base | low_id,
        }
        for low_id, cells in sorted(cells_by_low_id.items())
        if low_id
    ]

    return {
        "altitudeMidByteLimit": ram[SHOT_ALTITUDE_LIMIT_SITE + 1],
        "cellDepthAxisIsHighNibble": True,
        "impactSound": ram[IMPACT_SOUND_SITE + 1],
        "requiresPlayerCell": True,
        "initialTable": table,
        "lowIdMask": low_id_mask,
        "mechanoidMask": mechanoid_mask,
        "neutralMask": neutral_mask,
        "reactionDispatchBase": dispatch_base,
        "reactionWipeMask": wipe_mask,
        "restorationKeepMask": restoration_keep_mask,
        "restorationSlot": restoration_slot,
        "alreadyDestroyedIsInert": True,
        "initialCounts": {
            "mechanoid": len(mechanoid),
            "neutral": len(neutral),
            "palyar": len(palyar),
        },
        "reactions": reactions,
        "factionObjective": {
            "comparison": "mechanoid-minus-palyar",
            "palyarScript": ram[THRESHOLD_SITE + 1],
            "mechanoidScript": ram[THRESHOLD_SITE + 13],
            "threshold": ram[THRESHOLD_SITE + 15],
            "negativeOnesComplement": True,
        },
    }


def _check(ram: bytes, address: int, expected: tuple[int, ...], complaint: str) -> None:
    found = tuple(ram[address:address + len(expected)])
    _require(found == expected, f"Reference Build {complaint}")


def _require_engine(ram: bytes) -> None:
    _require(len(ram) == 65536, "Endgame decode requires a 64 KiB physical RAM image")
    checks = (
        (DROP_DISPATCH, (0xC0,), "drop key dispatch does not compare the saved key"),
        (DROP_DISPATCH + 2, (0xD0, 0x06), "drop key dispatch does not isolate one action"),
        (DROP_DISPATCH + 7, (0x4C, 0xFE, 0x98), "drop key dispatch does not enter the drop routine"),
        (DROP_ROUTINE, (0xAD, 0xF8, 0x29), "drop does not test its carried-object exemption"),
        (DROP_INVENTORY_SITE, (0xA6, 0xEB, 0xF0), "drop does not reject an empty inventory"),
        (DROP_INVENTORY_SITE + 4, (0xC6, 0xEB, 0xBC, 0xB0, 0xBE), "drop does not select the inventory tail"),
        (DROP_CARRIED_MASK_SITE, (0x29,), "drop does not clear an immediate carried mask"),
        (SINK_OVERRIDE_SITE, (0xAD, 0xEF, 0x29), "take does not read the Sink override"),
        (ANTIGRAV_OVERRIDE_SITE, (0xAD, 0xDB, 0x29), "take does not read the Antigrav override"),
        (0x9915, (0x99, 0xC0, 0x29), "drop does not persist the changed object flags"),
        (0x991B, (0xA5, 0xCD, 0x99, 0x40, 0x29), "drop does not copy the current room"),
        (0x9920, (0xA5, 0x72, 0x99, 0x80, 0x28), "drop does not copy the current position"),
        (SHIP_DELIVERY_CALL_SITE, (0x20, 0x34, 0x86), "frame loop does not call the ship delivery every frame"),
        (SHIP_DELIVERY_CALL_SITE + 3, (0xA5, 0xA8), "ship delivery is not called ahead of the underground branch"),
        (SHIP_DELIVERY_ROUTINE, (0xAD, 0xFF, 0xBE), "ship delivery does not read its state byte"),
        (SHIP_DELIVERY_ROUTINE + 3, (0xF0,), "ship delivery does not return when no ship is coming"),
        (SHIP_DELIVERY_ROUTINE + 5, (0x30,), "ship delivery does not branch on the accepted bit"),
        (SHIP_DELIVERY_DESCEND, (0xAD, 0x87, 0x25, 0x85, 0x09, 0xA8), "ship descent does not read its altitude high byte"),
        (SHIP_DELIVERY_DESCEND + 6, (0xAD, 0xC7, 0x24, 0x85, 0x08), "ship descent does not read its altitude middle byte"),
        (SHIP_DELIVERY_SHIFT_SITE, (0xA2,), "ship descent does not load an immediate shift count"),
        (SHIP_DELIVERY_SHIFT_SITE + 2, (0x46, 0x09, 0x66, 0x08, 0xCA, 0xD0, 0xF9), "ship descent does not shift its altitude right"),
        (SHIP_DELIVERY_SHIFT_SITE + 9, (0x18, 0xE5, 0x08), "ship descent does not subtract with the carry deliberately clear"),
        (SHIP_DELIVERY_SHIFT_SITE + 12, (0x8D, 0xC7, 0x24, 0x98, 0xE5, 0x09), "ship descent does not complete a sixteen-bit subtraction"),
        (SHIP_DELIVERY_LAND_SITE, (0x0D, 0xC7, 0x24, 0xD0), "ship descent does not test both altitude bytes for zero"),
        (SHIP_DELIVERY_LAND_SITE + 5, (0x8D, 0xFF, 0xBE, 0x60), "ship descent does not clear its state on landing"),
        (SHIP_DELIVERY_INITIALISE, (0xA9,), "ship delivery does not load an immediate descent altitude"),
        (SHIP_DELIVERY_INITIALISE + 2, (0x8D, 0x87, 0x25), "ship delivery does not seed the altitude high byte"),
        (SHIP_DELIVERY_INITIALISE + 5, (0x8D, 0xFF, 0xBE), "ship delivery does not mark itself descending"),
        (SHIP_DELIVERY_INITIALISE + 8, (0xA9, 0x00), "ship delivery does not zero the components it clears"),
        (FIRE_CALL_SITE, (0xA9,), "frame loop does not load a fire direction offset"),
        (FIRE_CALL_SITE + 2, (0x20, 0x6A, 0x88), "frame loop does not call the fire routine"),
        (FIRE_ROUTINE, (0x85, 0x09, 0xA5, 0x81), "fire does not save its offset and read the action latch"),
        (FIRE_ROUTINE + 7, (0xA5, 0xA9, 0x30), "fire does not reject the walking mover"),
        (FIRE_ROUTINE + 11, (0xA5, 0xF4, 0xD0), "fire does not wait for the current impact effect"),
        (FIRE_ROUTINE + 15, (0xA0,), "fire does not select an immediate effect slot"),
        (FIRE_ROUTINE + 22, (0xA9,), "fire does not select an immediate sound effect"),
        (FIRE_ROUTINE + 24, (0x20,), "fire does not request the sound it selected"),
        (FIRE_ROUTINE + 32, (0xA9,), "fire does not load an immediate lifecycle"),
        (PROJECTILE_UPDATE, (0xA2, 0x0F, 0xBD, 0xA3, 0xBD), "projectile update does not scan the effect table"),
        (0x8701, (0xE0,), "projectile update does not identify an immediate player-shot slot"),
        (0x872E, (0xC9,), "site hit does not compare an X-axis lower bound"),
        (0x8732, (0xC9,), "site hit does not compare an X-axis upper bound"),
        (0x8739, (0xC9,), "site hit does not compare a Z-axis lower bound"),
        (0x873D, (0xC9,), "site hit does not compare a Z-axis upper bound"),
        (0x875E, (0xB9, 0x00, 0x2B), "site hit does not read the destroyed-block table"),
        (0x8763, (0x09,), "site hit does not set an immediate destroyed mask"),
        (0x8768, (0xA9,), "site hit does not start an immediate impact lifecycle"),
        (0x8782, (0xA0,), "projectile collision does not select its first object target"),
        (0x878E, (0xA0,), "projectile collision does not select its second object target"),
        (0x8789, (0xA2,), "first object target does not select an immediate message"),
        (0x8795, (0xA9,), "second object target does not select an immediate Benson script"),
        (HOSTILE_ROUTINE, (0xAD, 0xF8, 0xBE), "hostile craft does not read attackingShip"),
        (HOSTILE_ROUTINE + 6, (0xA5, 0xCA), "hostile craft does not test the surface/room state"),
        (0x893E, (0xA2,), "hostile craft does not select an immediate inbound slot"),
        (0x894A, (0xA9,), "hostile craft does not set an immediate inbound lifecycle"),
        (0x897C, (0xA9, 0x00, 0x8D, 0xF8, 0xBE), "hostile capture does not clear attackingShip"),
        (0x8986, (0xA9, 0x09, 0x85, 0xA9), "hostile capture does not install an immediate mover"),
        (0x898D, (0xA9, 0xFF, 0x8D, 0x4E, 0x29, 0x8D, 0x4F, 0x29), "hostile capture does not remove both hostile slots"),
        (FIXED_POINT_CONVERT, (0x98, 0x30), "fixed-point conversion does not branch on an underflowing exponent"),
        (FIXED_POINT_OCTAVE_SITE, (0x4A, 0x4A), "fixed-point conversion does not shift its exponent to an octave count"),
        (FIXED_POINT_LIMIT_SITE, (0xC9,), "fixed-point conversion does not bound its shift selector"),
        (FIXED_POINT_SELF_MODIFY_SITE, (0x8D, 0xC2, 0x84), "fixed-point conversion does not write its own branch displacement"),
        (FIXED_POINT_NORMALISE_SITE, (0x38, 0x6A, 0x66, 0x06), "fixed-point conversion does not insert an implicit leading one"),
        (ANGLE_EXPONENT_TABLE_SITE, (0x1D,), "angle lookup does not read an exponent table"),
        (ANGLE_MANTISSA_TABLE_SITE, (0xBD,), "angle lookup does not read a mantissa table"),
        (FIRE_VECTOR_SITE, (0x18, 0x65, 0x09, 0xA8, 0x20, 0xA7, 0x84), "fire does not add its direction offset to an exponent before converting"),
        (SHOT_ALTITUDE_GATE, (0xBD, 0x80, 0x25, 0x30), "site hit does not branch on the shot's altitude sign"),
        (SHOT_ALTITUDE_LIMIT_SITE, (0xC9,), "site hit does not compare an immediate altitude ceiling"),
        (SHOT_CELL_BOUND_SITE, (0xBD, 0x40, 0x25, 0x1D, 0xC0, 0x25, 0x29, 0xF0), "site hit does not bound both cell axes to the city"),
        (SHOT_CELL_FORM_SITE, (0xBD, 0xC0, 0x25, 0x0A, 0x0A, 0x0A, 0x0A), "site hit does not shift the depth axis into the high nibble of its cell"),
        (SHOT_CELL_FORM_SITE + 9, (0xBD, 0x40, 0x25, 0x29, 0x0F, 0x05), "site hit does not take the across axis as the low nibble of its cell"),
        (IMPACT_SOUND_SITE, (0xA9,), "site hit does not select an immediate impact sound"),
        (COMMIT_CELL_GATE, (0xA4, 0xB7, 0xC4, 0xF5, 0xD0), "site commit does not require the struck cell to be the player's own"),
        (OBJECT_HIT_HELPER, (0x86, 0x0A, 0x84, 0x0B, 0x38), "object collision does not default to a miss"),
        (OBJECT_HIT_HELPER + 5, (0xB9, 0x40, 0x29, 0xD0), "object collision does not require its target on the surface"),
        (OBJECT_HIT_CUBE_SITE, (0xA2,), "object collision does not select an immediate cube size"),
        (OBJECT_HIT_SOUND_SITE, (0xA9,), "object collision does not select an immediate sound"),
        (OBJECT_HIT_CLEARS_ATTACK_SITE, (0xA9, 0x00, 0x8D, 0xF8, 0xBE), "object collision does not clear attackingShip"),
        (OBJECT_HIT_REMOVES_TARGET_SITE, (0xA9, 0xFF, 0x99, 0x40, 0x29), "object collision does not put its target out of the world"),
        (OBJECT_HIT_CUBE_COMPARE, (0x38, 0x8A, 0xE5, 0x08, 0x98, 0xE5, 0x09), "object collision does not compare its cube above the low byte"),
        (SITE_COMMIT_READ, (0xB9, 0x00, 0x2B, 0x85), "site commit does not save the struck cell's table byte"),
        (RESTORATION_TEST_SITE, (0xAD,), "site commit does not read a restoration override's flags"),
        (RESTORATION_TEST_SITE + 3, (0x30,), "site commit does not branch to restoration while that object is carried"),
        (SITE_CHANGE_TEST_SITE, (0xA5, 0xFB, 0xA4, 0xF5), "site commit does not reload the pre-impact byte and cell"),
        (SITE_CHANGE_TEST_SITE + 4, (0x59, 0x00, 0x2B, 0x10), "site commit does not return when the destroyed bit did not change"),
        (NEUTRAL_TEST_SITE, (0xB9, 0x00, 0x2B, 0x2C), "site commit does not test a neutral bit held in data"),
        (NEUTRAL_TEST_SITE + 6, (0xD0,), "site commit does not return for a neutral cell"),
        (FACTION_STEP_SITE, (0x0A, 0x10), "faction step does not shift the table byte to test its faction bit"),
        (FACTION_STEP_SITE + 3, (0xB0,), "faction step does not branch on the prior destroyed bit"),
        (MECHANOID_COUNTER_SITE - 6, (0xCE,), "faction step does not decrement its first counter on the inverse transition"),
        (MECHANOID_COUNTER_SITE, (0xEE,), "faction step does not increment its first counter"),
        (PALYAR_COUNTER_SITE - 6, (0xCE,), "faction step does not decrement its second counter on the inverse transition"),
        (PALYAR_COUNTER_SITE, (0xEE,), "faction step does not increment its second counter"),
        (THRESHOLD_SITE, (0xA2,), "faction threshold does not load an immediate default script"),
        (THRESHOLD_SITE + 2, (0xAD,), "faction threshold does not read its first counter"),
        (THRESHOLD_SITE + 5, (0xED,), "faction threshold does not subtract its second counter"),
        (THRESHOLD_SITE + 8, (0x10, 0x04), "faction threshold does not branch on the sign of that difference"),
        (THRESHOLD_SITE + 10, (0x49, 0xFF), "faction threshold does not complement a negative difference"),
        (THRESHOLD_SITE + 12, (0xA2,), "faction threshold does not load an immediate opposing script"),
        (THRESHOLD_SITE + 14, (0xC9,), "faction threshold is not an immediate comparison"),
        (THRESHOLD_SITE + 16, (0xB0,), "faction threshold does not dispatch its script once reached"),
        (REACTION_SELECT_SITE, (0xB9, 0x00, 0x2B, 0x29), "reaction select does not mask a low id out of the table byte"),
        (REACTION_SELECT_SITE + 5, (0xF0,), "reaction select does not return when a cell has no reaction"),
        (REACTION_SELECT_SITE + 7, (0x09,), "reaction select does not add an immediate script base"),
        (REACTION_SELECT_SITE + 9, (0xAA,), "reaction select does not hold its script id in X"),
        (REACTION_WIPE_SITE, (0xB9, 0x00, 0x2B, 0x29), "reaction dispatch does not mask the table byte again"),
        (REACTION_WIPE_SITE + 5, (0x99, 0x00, 0x2B), "reaction dispatch does not write the masked byte back"),
        (REACTION_DISPATCH_SITE, (0x8A, 0x4C), "reaction dispatch does not enter Benson with its script id"),
        (RESTORATION_SITE, (0xA5, 0xFB, 0x08, 0x29), "restoration does not mask the pre-impact byte behind saved flags"),
        (RESTORATION_SITE + 5, (0x99, 0x00, 0x2B, 0x28, 0x10), "restoration does not store the cleared byte and resume on the saved sign"),
        (ORBITAL_PREDICATE, (0xA5, 0x74, 0xC9), "orbital predicate does not compare the X cell"),
        (0xA143, (0xA5, 0x7A, 0xC9), "orbital predicate does not compare the Z cell"),
        (0xA149, (0xA5, 0x73, 0x38, 0xE9), "orbital X-axis lower bound is not an immediate subtraction"),
        (0xA14E, (0xC9,), "orbital X-axis width is not an immediate comparison"),
        (0xA152, (0xA5, 0x79, 0x38, 0xE9), "orbital Z-axis lower bound is not an immediate subtraction"),
        (0xA157, (0xC9,), "orbital Z-axis width is not an immediate comparison"),
        (0xA15B, (0xA5, 0x76, 0xC9), "orbital altitude floor is not an immediate comparison"),
        (0xA161, (0x18, 0x60, 0x38, 0x60), "orbital predicate does not return clear on success and set on failure"),
        (ENDING_DISPATCH, (0xAD, 0xFE, 0xBE, 0xD0), "terminal renderer does not dispatch on gameComplete"),
        (ENDING_COMPLETE_SITE, (0xA9, 0xFF, 0x8D, 0xFE, 0xBE), "terminal presentation does not advance to its completed phase"),
        (FIELD_ENTRY, (0xA9, 0x70, 0x85, 0xC7), "Interstellar Ship Field entry does not install its screen bank"),
        (0xAA77, (0x20, 0x26, 0xAC), "Interstellar Ship Field entry does not apply its first colour"),
        (0xAA7A, (0xAE, 0x4A, 0xAC, 0xA9, 0x01), "Interstellar Ship Field entry does not load its point bound and priming value"),
        (0xAA7F, (0x9D, 0x80, 0x03), "Interstellar Ship Field depth exponent storage identity changed"),
        (0xAA82, (0x9D, 0xC0, 0x06), "Interstellar Ship Field vertical screen storage identity changed"),
        (0xAA85, (0x9D, 0x80, 0x06), "Interstellar Ship Field horizontal screen storage identity changed"),
        (0xAA8F, (0x20, 0xA1, 0xB1), "Interstellar Ship Field no longer clears the screen once on entry"),
        (0xAA92, (0x4C, 0xF2, 0xAA), "Interstellar Ship Field entry does not update before its first visible loop"),
        (FIELD_LOOP, (0x20, 0xB2, 0x8A), "Interstellar Ship Field loop does not step Benson before input"),
        (0xAA98, (0x20, 0xFE, 0xB2), "Interstellar Ship Field loop does not sample input after Benson"),
        (0xAA9B, (0x20, 0x1C, 0xAC), "Interstellar Ship Field loop does not advance colour after input"),
        (0xAA9E, (0xAD, 0x12, 0xD0, 0xC9, 0xE0, 0xD0, 0xF9), "Interstellar Ship Field raster wait changed"),
        (0xAAAA, (0xBC, 0x80, 0x04), "Interstellar Ship Field erase pass does not read prior vertical positions"),
        (0xAAB2, (0xBD, 0x00, 0x04), "Interstellar Ship Field erase pass does not read prior horizontal positions"),
        (0xAACF, (0xBC, 0xC0, 0x06), "Interstellar Ship Field draw pass does not read current vertical positions"),
        (0xAAD7, (0xBD, 0x80, 0x06), "Interstellar Ship Field draw pass does not read current horizontal positions"),
        (FIELD_UPDATE, (0xAE, 0x4A, 0xAC), "Interstellar Ship Field update does not scan the guarded point bound"),
        (0xAAF7, (0xBD, 0x00, 0x01), "Interstellar Ship Field X mantissa storage identity changed"),
        (0xAAFC, (0xBD, 0x40, 0x01), "Interstellar Ship Field X exponent storage identity changed"),
        (0xAB01, (0xBD, 0x80, 0x01), "Interstellar Ship Field Y mantissa storage identity changed"),
        (0xAB06, (0xBD, 0xC0, 0x02), "Interstellar Ship Field Y exponent storage identity changed"),
        (0xAB0B, (0xBD, 0x40, 0x03), "Interstellar Ship Field Z mantissa storage identity changed"),
        (0xAB10, (0xBD, 0x80, 0x03), "Interstellar Ship Field Z exponent storage identity changed"),
        (0xAB15, (0xBD, 0x80, 0x06, 0x9D, 0x00, 0x04), "Interstellar Ship Field update does not preserve prior horizontal positions"),
        (0xAB1B, (0xBD, 0xC0, 0x06, 0x9D, 0x80, 0x04), "Interstellar Ship Field update does not preserve prior vertical positions"),
        (0xAB29, (0xAE, 0x4E, 0xAC, 0xAC, 0x4F, 0xAC), "Interstellar Ship Field update does not load its depth delta"),
        (0xAB2F, (0x20, 0x8B, 0x83, 0x98, 0x4A, 0xB0), "Interstellar Ship Field depth update or negative-depth branch changed"),
        (0xAB46, (0x20, 0x34, 0x83, 0x20, 0x77, 0x84, 0xB0), "Interstellar Ship Field horizontal projection conversion changed"),
        (0xAB4E, (0x69, 0x50, 0xC9, 0xA0, 0xB0), "Interstellar Ship Field horizontal projection bound changed"),
        (0xAB62, (0x20, 0x34, 0x83, 0x20, 0x77, 0x84, 0xB0), "Interstellar Ship Field vertical projection conversion changed"),
        (0xAB6A, (0x69, 0x44, 0xC9, 0x88, 0xB0), "Interstellar Ship Field vertical projection bound changed"),
        (0xAB70, (0xA6, 0x19, 0x9D, 0xC0, 0x06), "Interstellar Ship Field projected vertical storage changed"),
        (0xAB77, (0x9D, 0x80, 0x06), "Interstellar Ship Field projected horizontal storage changed"),
        (0xAB7C, (0x9D, 0x40, 0x03), "Interstellar Ship Field updated Z mantissa storage changed"),
        (0xAB81, (0x9D, 0x80, 0x03), "Interstellar Ship Field updated Z exponent storage changed"),
        (0xAB97, (0xAD, 0xFE, 0xBE, 0x10), "Interstellar Ship Field terminal phase sign branch changed"),
        (0xAB9C, (0xC0, 0x25, 0xF0), "Interstellar Ship Field mature-motion stop changed"),
        (0xABA0, (0xAE, 0x50, 0xAC, 0xAC, 0x51, 0xAC), "Interstellar Ship Field acceleration multiplier storage changed"),
        (0xABA6, (0xA9, 0x00, 0x8D, 0x51, 0xAC), "Interstellar Ship Field acceleration transition changed"),
        (0xABAB, (0x20, 0xFA, 0x82), "Interstellar Ship Field acceleration multiply changed"),
        (0xABAE, (0x8E, 0x4E, 0xAC, 0x8C, 0x4F, 0xAC), "Interstellar Ship Field accelerated depth delta storage changed"),
        (0xABB4, (0xCE, 0x52, 0xAC), "Interstellar Ship Field acceleration side state changed"),
        (0xABB7, (0xAD, 0x52, 0xAC), "Interstellar Ship Field acceleration side byte read changed"),
        (0xABCB, (0x2D, 0x4B, 0xAC, 0x38, 0xED, 0x4C, 0xAC), "Interstellar Ship Field X random range changed"),
        (0xABD2, (0x20, 0x10, 0x85, 0x99, 0x00, 0x01), "Interstellar Ship Field X respawn storage changed"),
        (0xABE8, (0x2D, 0x4B, 0xAC, 0x38, 0xED, 0x4C, 0xAC), "Interstellar Ship Field Y random range changed"),
        (0xABEF, (0x20, 0x10, 0x85, 0x99, 0x80, 0x01), "Interstellar Ship Field Y respawn storage changed"),
        (0xABF6, (0x99, 0xC0, 0x02), "Interstellar Ship Field Y respawn exponent storage changed"),
        (0xABF9, (0x20, 0xEF, 0xAD, 0x99, 0x40, 0x03), "Interstellar Ship Field Z random draw or storage changed"),
        (0xABFF, (0xAD, 0x4D, 0xAC, 0x99, 0x80, 0x03), "Interstellar Ship Field Z respawn exponent storage changed"),
        (FIELD_COLOUR_STEP, (0xCE, 0x0A, 0xAC, 0xD0), "Interstellar Ship Field colour delay changed"),
        (0xAC21, (0xA9, 0x03, 0x8D, 0x0A, 0xAC), "Interstellar Ship Field repeated colour cadence changed"),
        (0xAC26, (0xAE, 0x0B, 0xAC), "Interstellar Ship Field colour index storage changed"),
        (0xAC29, (0xBD, 0x0C, 0xAC, 0x85, 0xA3), "Interstellar Ship Field line-colour read changed"),
        (0xAC2E, (0xBC, 0x0D, 0xAC, 0x85, 0xA4), "Interstellar Ship Field screen-colour register quirk changed"),
        (0xAC35, (0x20, 0x4F, 0xBB), "Interstellar Ship Field screen-colour application changed"),
        (0xAC3A, (0xE0, 0x0E, 0xF0, 0x06), "Interstellar Ship Field colour sequence completion branch changed"),
        (0xAC3E, (0xE8, 0xE8, 0x8E, 0x0B, 0xAC), "Interstellar Ship Field colour index stride changed"),
    )
    for address, expected, complaint in checks:
        _check(ram, address, expected, complaint)
    for address in ORBITAL_CALL_SITES:
        _check(ram, address, (0x20, 0x3D, 0xA1), f"orbital predicate is not called at ${address:04X}")
    for address in FIELD_RANDOM_CALLS:
        _check(ram, address, (0x20, RANDOM_ROUTINE & 0xFF, RANDOM_ROUTINE >> 8), "Interstellar Ship Field does not make seven shared random draws")
    _require(ram[FIELD_POINT_COUNT_SITE] == 20, "Interstellar Ship Field does not contain 21 stable point slots")
    _require(
        tuple(ram[FIELD_POINT_COUNT_SITE + 1:FIELD_POINT_COUNT_SITE + 4]) == (0x3F, 0x20, 0x38),
        "Interstellar Ship Field respawn coordinate bounds changed",
    )
    _require(ram[FIELD_COLOUR_STATE] == 96 and ram[FIELD_COLOUR_STATE + 1] == 0, "Interstellar Ship Field colour state is not initialized to the decoded entry delay and first pair")
    _require(all(value & 0x0F == 0 for value in ram[FIELD_COLOUR_TABLE:FIELD_COLOUR_TABLE + 16]), "Interstellar Ship Field colour entries are not screen-matrix colour bytes")
    random_calls = sum(
        ram[address:address + 3] == bytes((0x20, RANDOM_ROUTINE & 0xFF, RANDOM_ROUTINE >> 8))
        for address in range(FIELD_RESPAWN, FIELD_COLOUR_STATE - 2)
    )
    _require(random_calls == len(FIELD_RANDOM_CALLS), "Interstellar Ship Field respawn does not contain exactly seven shared random draws")


def _decode_interstellar_ship_field(ram: bytes) -> dict[str, Any]:
    point_count = ram[FIELD_POINT_COUNT_SITE] + 1
    random_mask = ram[FIELD_POINT_COUNT_SITE + 1]
    random_offset = ram[FIELD_POINT_COUNT_SITE + 2]
    z_exponent = ram[FIELD_POINT_COUNT_SITE + 3]
    depth_delta = decode_float(ram[FIELD_POINT_COUNT_SITE + 4], ram[FIELD_POINT_COUNT_SITE + 5])
    first_multiplier = decode_float(ram[FIELD_POINT_COUNT_SITE + 6], ram[FIELD_POINT_COUNT_SITE + 7])
    later_multiplier = decode_float(ram[FIELD_POINT_COUNT_SITE + 6], 0)
    initial_delay = ram[FIELD_COLOUR_STATE]
    repeated_delay = ram[FIELD_COLOUR_STEP + 6]

    events = []
    for pair in range(8):
        line_raw = ram[FIELD_COLOUR_TABLE + pair * 2]
        screen_raw = ram[FIELD_COLOUR_TABLE + pair * 2 + 1]
        loop = 0 if pair == 0 else initial_delay + (pair - 1) * repeated_delay
        events.append({
            "loop": loop,
            "lineColour": line_raw >> 4,
            "screenColour": screen_raw >> 4,
            "phaseWrite": 255 if pair == 7 else None,
        })

    storage = {
        "components": FIELD_COMPONENT_STORAGE,
        "screenPositions": FIELD_SCREEN_STORAGE,
        "slotsPerArray": point_count,
    }
    return {
        "pointSlots": {"first": 0, "last": point_count - 1, "count": point_count, "identity": "stable-index"},
        "storage": storage,
        "initialization": {
            "stages": [
                {
                    "name": "entry-priming",
                    "writes": ["z-exponent=1", "current-x=1", "current-y=1"],
                    "screenClear": "once",
                },
                {
                    "name": "first-update",
                    "result": "all-slots-respawn-and-project",
                    "reason": "primed-negative-depth",
                    "priorXYComponents": "ignored",
                },
                {"name": "first-visible-loop", "result": "all-slots-visible"},
            ],
        },
        "motion": {
            "phaseBranch": "sign",
            "provenPhaseValues": [0, 1, ram[ENDING_COMPLETE_SITE + 1]],
            "scriptedPhaseDepthDelta": depth_delta,
            "maturePhaseFirstMultiplier": first_multiplier,
            "maturePhaseLaterMultiplier": later_multiplier,
            "maturePhaseStopsAtExponent": ram[0xAB9D],
            "accelerationSideStateAddress": 0xAC52,
            "accelerationSideByteEffect": "decremented-and-loaded-without-control-flow-use",
        },
        "projection": {
            "horizontal": {"centre": ram[0xAB4F], "range": [0, ram[0xAB51]]},
            "vertical": {"centre": ram[0xAB6B], "range": [0, ram[0xAB6D]]},
            "invalidity": [
                "negative-depth",
                "horizontal-conversion-overflow",
                "horizontal-out-of-bounds",
                "vertical-conversion-overflow",
                "vertical-out-of-bounds",
            ],
        },
        "respawn": {
            "lifetime": "none",
            "trigger": "invalid-depth-or-projection",
            "randomDraws": len(FIELD_RANDOM_CALLS),
            "carryIn": "set-by-invalidity-branch",
            "replacesComponents": ["x", "y", "z"],
            "x": {
                "draws": [1, 2, 3],
                "highMask": random_mask,
                "highOffset": -random_offset,
                "range": [-(random_offset << 16), ((random_mask - random_offset + 1) << 16) - 1],
            },
            "y": {
                "draws": [4, 5, 6],
                "highMask": random_mask,
                "highOffset": -random_offset,
                "range": [-(random_offset << 16), ((random_mask - random_offset + 1) << 16) - 1],
                "discardedLowDraw": 4,
                "conversionLowSource": "x-draw-1-residue",
            },
            "z": {
                "draw": 7,
                "exponent": z_exponent,
                "range": [int(decode_float(0, z_exponent)), int(decode_float(0xFF, z_exponent))],
                "step": int(decode_float(1, z_exponent) - decode_float(0, z_exponent)),
            },
            "generator": decode_reference_prng(ram),
        },
        "loopOrder": [
            "benson-step",
            "input-sample",
            "colour-step",
            "raster-wait",
            "erase-prior-points",
            "draw-current-points",
            "update-project-respawn",
        ],
        "colours": {
            "entryDelayLoops": initial_delay,
            "repeatedDelayLoops": repeated_delay,
            "events": events,
            "completedPhaseLoop": events[-1]["loop"],
            "repeatFinalEveryLoops": repeated_delay,
            "storageQuirk": "second-pair-byte-is-loaded-into-y-while-first-byte-is-also-stored-as-sky",
        },
        "continuationState": [
            {"name": "terminalPhase", "addresses": [0xBEFE]},
            {"name": "pointComponents", "storage": FIELD_COMPONENT_STORAGE, "slots": point_count},
            {"name": "currentScreenPositions", "storage": FIELD_SCREEN_STORAGE["current"], "slots": point_count},
            {"name": "priorScreenPositions", "storage": FIELD_SCREEN_STORAGE["prior"], "slots": point_count},
            {"name": "colourState", "addresses": [FIELD_COLOUR_STATE, FIELD_COLOUR_STATE + 1]},
            {"name": "motionState", "addresses": [0xAC4E, 0xAC4F, 0xAC50, 0xAC51]},
            {"name": "accelerationSideByte", "addresses": [0xAC52], "semanticContinuation": False},
            {"name": "sharedPrngState", "addresses": [RANDOM_VALUE, RANDOM_STATE]},
        ],
    }


def decode_endgame(ram: bytes) -> dict[str, Any]:
    """Read the native endgame rules after asserting their instruction shapes."""
    _require_engine(ram)

    drop_key = ram[DROP_DISPATCH + 1]
    carried_mask = ram[DROP_CARRIED_MASK_SITE + 1] ^ 0xFF
    carried_exemption_slot = DROP_EXEMPTION_FLAGS_SITE - OBJECT_FLAGS_BASE
    sink_slot = (ram[SINK_OVERRIDE_SITE + 1] | (ram[SINK_OVERRIDE_SITE + 2] << 8)) - OBJECT_FLAGS_BASE
    antigrav_slot = (ram[ANTIGRAV_OVERRIDE_SITE + 1] | (ram[ANTIGRAV_OVERRIDE_SITE + 2] << 8)) - OBJECT_FLAGS_BASE

    fire_slot = ram[FIRE_ROUTINE + 16]
    target_slots = [ram[0x8782 + 1], ram[0x878E + 1]]
    axis_window = [ram[0x872E + 1], ram[0x8732 + 1]]
    _require(axis_window[0] < axis_window[1], "Site-destruction axis window is empty")
    _require(ram[0x8739 + 1] == axis_window[0] and ram[0x873D + 1] == axis_window[1], "Site-destruction axes use different windows")

    orbital_lower = ram[0xA149 + 4]
    orbital_width = ram[0xA14E + 1]
    _require(ram[0xA152 + 4] == orbital_lower, "Orbital axes use different lower bounds")
    _require(ram[0xA157 + 1] == orbital_width, "Orbital axes use different widths")

    return {
        "schemaVersion": ENDGAME_SCHEMA_VERSION,
        "controls": {
            "takeOverrides": {
                "sinkSlot": sink_slot,
                "antigravSlot": antigrav_slot,
            },
            "drop": {
                "keyCode": drop_key,
                "inventorySelection": "last-in-first-out",
                "emptyInventory": "no-op",
                "carriedMask": carried_mask,
                "carriedExemptionSlot": carried_exemption_slot,
                "requiresCarriedExemptionOrFlightState": True,
                "copiesCurrentRoomAndPosition": True,
            }
        },
        "combat": {
            "fire": {
                "inputActiveValue": 0,
                "walkingMoverProhibited": True,
                "effectSlot": fire_slot,
                "lifecycleFrames": ram[FIRE_ROUTINE + 33],
                "directionOffset": ram[FIRE_CALL_SITE + 1],
                "oneActiveShot": True,
                "sound": ram[FIRE_ROUTINE + 23],
                **_decode_shot_speed(ram, ram[FIRE_CALL_SITE + 1]),
            },
            "siteDestruction": {
                "projectileSlot": ram[0x8701 + 1],
                "axisWindow": axis_window,
                "destroyedMask": ram[0x8763 + 1],
                "impactFrames": ram[0x8768 + 1],
                **_decode_site_table(ram),
            },
            "objectHits": {
                "targetSlots": target_slots,
                "firstTargetMessage": ram[0x8789 + 1],
                "secondTargetScript": ram[0x8795 + 1],
                "cubeSize": ram[OBJECT_HIT_CUBE_SITE + 1],
                "cubeUnit": 0x100,
                "sound": ram[OBJECT_HIT_SOUND_SITE + 1],
                "clearsAttackState": True,
                "removesTarget": True,
                "surfaceTargetsOnly": True,
            },
            "hostileCraft": {
                "enabledByAttackingShip": True,
                "surfaceOnly": True,
                "inboundSlot": ram[0x893E + 1],
                "attackingSlot": target_slots[0],
                "inboundLifecycleFrames": ram[0x894A + 1],
                "captureClearsAttackingShip": True,
                "captureMover": ram[0x8986 + 1],
                "captureRemovesSlots": [ram[0x898D + 3] - 0x40, ram[0x898D + 6] - 0x40],
            },
        },
        "shipDelivery": _decode_ship_delivery(ram),
        "orbitalTransition": {
            "cell": [ram[ORBITAL_PREDICATE + 3], ram[0xA143 + 3]],
            "axisMiddleByteWindow": [orbital_lower, orbital_lower + orbital_width],
            "minimumAltitudeByte": ram[0xA15B + 3],
            "successCarry": "clear",
            "callSites": list(ORBITAL_CALL_SITES),
        },
        "endingPresentation": {
            "activeValue": 0,
            "scriptedValue": 1,
            "completedValue": ram[ENDING_COMPLETE_SITE + 1],
            "dispatch": "nonzero-enters-terminal-presentation",
            "interstellarShipField": _decode_interstellar_ship_field(ram),
        },
        "counts": {
            "orbitalCallSites": len(ORBITAL_CALL_SITES),
            "objectHitTargets": len(target_slots),
            "interstellarShipFieldPoints": ram[FIELD_POINT_COUNT_SITE] + 1,
        },
    }
