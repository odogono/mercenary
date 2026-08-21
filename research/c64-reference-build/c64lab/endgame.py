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


ENDGAME_SCHEMA_VERSION = 1

# Drop key dispatch and native inventory mutation.
DROP_DISPATCH = 0xB33F
DROP_ROUTINE = 0x98FE
OBJECT_FLAGS_BASE = 0x29C0
DROP_EXEMPTION_FLAGS_SITE = 0x29F8
DROP_INVENTORY_SITE = 0x9907
DROP_CARRIED_MASK_SITE = 0x9913

# Fire, projectile update, world damage, and hostile-craft behavior.
FIRE_CALL_SITE = 0x85E1
FIRE_ROUTINE = 0x886A
PROJECTILE_UPDATE = 0x8690
HOSTILE_ROUTINE = 0x8921

# The shared predicate used by flying, landing, and the orbital-region mover.
ORBITAL_PREDICATE = 0xA13D
ORBITAL_CALL_SITES = (0xA01F, 0xA0E6, 0xA1DA)

# gameComplete dispatch and its later terminal-presentation transition.
ENDING_DISPATCH = 0xAA69
ENDING_COMPLETE_SITE = 0xAC44


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

    return {
        "dispatches": [{"script": 7, "instruction": terminal, "value": value}],
        "endingIdentities": ["escape"],
        "defeatDispatches": 0,
        "unreachableCodeBytes": counts["unreachableBytes"],
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
        (0x9915, (0x99, 0xC0, 0x29), "drop does not persist the changed object flags"),
        (0x991B, (0xA5, 0xCD, 0x99, 0x40, 0x29), "drop does not copy the current room"),
        (0x9920, (0xA5, 0x72, 0x99, 0x80, 0x28), "drop does not copy the current position"),
        (FIRE_CALL_SITE, (0xA9,), "frame loop does not load a fire direction offset"),
        (FIRE_CALL_SITE + 2, (0x20, 0x6A, 0x88), "frame loop does not call the fire routine"),
        (FIRE_ROUTINE, (0x85, 0x09, 0xA5, 0x81), "fire does not save its offset and read the action latch"),
        (FIRE_ROUTINE + 7, (0xA5, 0xA9, 0x30), "fire does not reject the walking mover"),
        (FIRE_ROUTINE + 11, (0xA5, 0xF4, 0xD0), "fire does not wait for the current impact effect"),
        (FIRE_ROUTINE + 15, (0xA0,), "fire does not select an immediate effect slot"),
        (FIRE_ROUTINE + 22, (0xA9,), "fire does not select an immediate sound effect"),
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
    )
    for address, expected, complaint in checks:
        _check(ram, address, expected, complaint)
    for address in ORBITAL_CALL_SITES:
        _check(ram, address, (0x20, 0x3D, 0xA1), f"orbital predicate is not called at ${address:04X}")


def decode_endgame(ram: bytes) -> dict[str, Any]:
    """Read the native endgame rules after asserting their instruction shapes."""
    _require_engine(ram)

    drop_key = ram[DROP_DISPATCH + 1]
    carried_mask = ram[DROP_CARRIED_MASK_SITE + 1] ^ 0xFF
    carried_exemption_slot = DROP_EXEMPTION_FLAGS_SITE - OBJECT_FLAGS_BASE

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
            },
            "siteDestruction": {
                "projectileSlot": ram[0x8701 + 1],
                "axisWindow": axis_window,
                "destroyedMask": ram[0x8763 + 1],
                "impactFrames": ram[0x8768 + 1],
            },
            "objectHits": {
                "targetSlots": target_slots,
                "firstTargetMessage": ram[0x8789 + 1],
                "secondTargetScript": ram[0x8795 + 1],
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
        },
        "counts": {
            "orbitalCallSites": len(ORBITAL_CALL_SITES),
            "objectHitTargets": len(target_slots),
        },
    }
