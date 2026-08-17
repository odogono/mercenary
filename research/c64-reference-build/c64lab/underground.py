"""Decode the lift, which is the way between the surface and the rooms.

The rooms themselves travel in ``rooms.json``, out of the verified dataset, because
their geometry is table data. What travels here is the runtime half: where the lifts
are, which room each one arrives in, and the rates and thresholds the lift moves by.
Recovered from our own Reference Build; the Reference Disassembly was read only to
locate the routines (ADR 0014). See ``notes/decode/underground.md``.

Engine shape, as disassembled and confirmed against our own image:

* ``PLANET_UNDERGROUND`` at ``$A8`` decides which mover runs, before anything else
  does. Only the lift writes it, from either direction.
* The lift derives the camera's altitude from its own position, then walks it: down
  by one rate per frame, up by another. Crossing a threshold on the way is what
  flips the flag, so entering and leaving are arrivals rather than commands.
* Arriving inside hands the site to the room setup as a **room id** — the same index
  the room pointer tables are keyed by — so site one arrives in room one.
* Arriving outside reads a destination cell from two tables, one per axis, indexed by
  the same site. Our image carries five, which is what bounds the count: past them
  the X table runs into the Z table and the coordinates leave the grid.
"""

from __future__ import annotations

from typing import Any

from .core import require


UNDERGROUND_SCHEMA_VERSION = 2

#: The flag that decides which mover runs, and the routine that walks the lift.
UNDERGROUND_FLAG = 0xA8
LIFT_ROUTINE = 0xA24A
#: The two sites that write the flag, one per direction.
LIFT_SURFACED_SITE = 0xA298
LIFT_SUBMERGED_SITE = 0xA2F3

#: Destination tables, both indexed by the site. The X table's base is one below the
#: first entry because the site counts from one.
ENTRANCE_CELL_X_BASE = 0xB4B6
ENTRANCE_CELL_Z_BASE = 0xB4BE
#: Sites are numbered from one; zero means the surface to the room setup.
FIRST_SITE = 1

#: Sites the decoder reads its rules from, each asserted before it is trusted.
ASCEND_RATE_SITE = 0xA282
DESCEND_RATE_SITE = 0xA2C0
OUTSIDE_THRESHOLD_SITE = 0xA292
INSIDE_THRESHOLD_SITE = 0xA2D4
OUTSIDE_MIDDLE_SITE = 0xA29E
INSIDE_MIDDLE_SITE = 0xA2EB
BOTTOM_CLAMP_SITE = 0xA305
ALTITUDE_WRAP_SITE = 0xA26D
ALTITUDE_WRAP_SUBTRACT_SITE = 0xA273
ENTRANCE_X_LOAD_SITE = 0xA2A6
ENTRANCE_Z_LOAD_SITE = 0xA2AB
ROOM_SETUP_SITE = 0xA2E0
ROOM_SETUP_ROUTINE = 0x90BE

#: What has to be true before a lift will take the player anywhere.
#:
#: On foot, and standing on the lift's pad — a small square near the middle of the
#: cell, tested by shifting the position's middle byte down two and comparing. The
#: search that follows walks the same destination tables backwards to find which site
#: the player is standing in.
TRIGGER_ROUTINE = 0xB404
TRIGGER_ON_FOOT_SITE = 0xB408
TRIGGER_PAD_X_SITE = 0xB410
TRIGGER_PAD_Z_SITE = 0xB418
TRIGGER_PAD_SHIFT = 2
TRIGGER_SEARCH_SITE = 0xB41C
#: Presentation dispatch and setup sites, asserted against our own RAM image.
TRIGGER_KEY_SITE = 0xB3F6
TRIGGER_KEY_CODE = 0x0E
INDOOR_BRANCH_SITE = 0xAFC3
INDOOR_CLEAR_SITE = 0xB197
ROOM_BACKGROUND_STORE_SITE = 0x91DB
ROOM_FOREGROUND_STORE_SITE = 0x91E5
#: Which state each direction starts the lift in.
DESCEND_STATE = 0x80
ASCEND_STATE = 0x01

#: The grid the surface is divided into, which bounds a plausible entrance.
CELLS_PER_AXIS = 16


def require_indoor_presentation(ram: bytes) -> None:
    """Confirm the E dispatch and decoded room-screen routine fingerprints."""
    require(len(ram) == 65536, "Indoor presentation decode requires a 64 KiB RAM image")
    checks = (
        (
            TRIGGER_KEY_SITE,
            (0xC0, TRIGGER_KEY_CODE, 0xF0, 0x03, 0x4C),
            "lift dispatch is not the E-key compare",
        ),
        (
            INDOOR_BRANCH_SITE,
            (0xA5, UNDERGROUND_FLAG, 0xF0, 0x03, 0x4C, 0x97, 0xB1),
            "underground flag does not branch to the indoor clear",
        ),
        (
            INDOOR_CLEAR_SITE,
            (0xA9, 0xAA, 0xA2, 0xF8),
            "indoor clear does not begin with the $AA bitmap fill",
        ),
        (
            ROOM_BACKGROUND_STORE_SITE,
            (0x85, 0xC4),
            "room setup does not load the background palette byte",
        ),
        (
            ROOM_FOREGROUND_STORE_SITE,
            (0x85, 0xC5),
            "room setup does not load the foreground palette byte",
        ),
    )
    for address, expected, complaint in checks:
        require(
            tuple(ram[address:address + len(expected)]) == expected,
            f"Reference Build {complaint}",
        )


def _require_engine(ram: bytes) -> None:
    """Confirm the lift is the one these rules were read from."""
    require(len(ram) == 65536, "Underground decode requires a 64 KiB physical RAM image")
    require_indoor_presentation(ram)
    checks = (
        (LIFT_ROUTINE, (0xA5, 0xCB), "the lift does not begin by reading its own position"),
        (LIFT_SURFACED_SITE, (0x85, UNDERGROUND_FLAG), "surfacing does not clear the underground flag"),
        (LIFT_SUBMERGED_SITE, (0x85, UNDERGROUND_FLAG), "submerging does not set the underground flag"),
        (ASCEND_RATE_SITE, (0x69,), "the lift does not rise by an immediate rate"),
        (DESCEND_RATE_SITE, (0xE9,), "the lift does not fall by an immediate rate"),
        (OUTSIDE_THRESHOLD_SITE, (0xE0,), "surfacing does not test an immediate position"),
        (INSIDE_THRESHOLD_SITE, (0xE0,), "submerging does not test an immediate position"),
        (OUTSIDE_MIDDLE_SITE, (0xA9,), "surfacing does not place the player at an immediate middle"),
        (INSIDE_MIDDLE_SITE, (0xA9,), "submerging does not place the player at an immediate middle"),
        (BOTTOM_CLAMP_SITE, (0xA9,), "the lift's floor is not an immediate"),
        (ALTITUDE_WRAP_SITE, (0xC9,), "the lift's altitude wrap is not an immediate compare"),
        (ALTITUDE_WRAP_SUBTRACT_SITE, (0xE9,), "the lift's altitude wrap does not subtract an immediate"),
        (ENTRANCE_X_LOAD_SITE, (0xBD,), "surfacing does not read its cell from a table"),
        (ENTRANCE_Z_LOAD_SITE, (0xBD,), "surfacing does not read its second axis from a table"),
        (ROOM_SETUP_SITE, (0x20,), "submerging does not call the room setup"),
        (TRIGGER_ROUTINE, (0xA5, UNDERGROUND_FLAG), "the lift's trigger does not begin at the flag"),
        (TRIGGER_ON_FOOT_SITE, (0xA5, 0x7F), "the lift's trigger does not require being on foot"),
        (TRIGGER_PAD_X_SITE, (0xC9,), "the lift's pad is not an immediate compare on one axis"),
        (TRIGGER_PAD_Z_SITE, (0xC9,), "the lift's pad is not an immediate compare on the other"),
        (TRIGGER_SEARCH_SITE, (0xA2,), "the lift's trigger does not search the sites from a bound"),
    )
    for address, expected, complaint in checks:
        found = tuple(ram[address:address + len(expected)])
        require(found == expected, f"Reference Build {complaint}")

    for site, base in ((ENTRANCE_X_LOAD_SITE, ENTRANCE_CELL_X_BASE), (ENTRANCE_Z_LOAD_SITE, ENTRANCE_CELL_Z_BASE)):
        table = ram[site + 1] | (ram[site + 2] << 8)
        require(
            table == base,
            f"Surfacing reads its cell from ${table:04X} rather than ${base:04X}",
        )
    setup = ram[ROOM_SETUP_SITE + 1] | (ram[ROOM_SETUP_SITE + 2] << 8)
    require(
        setup == ROOM_SETUP_ROUTINE,
        f"Submerging calls ${setup:04X} rather than the room setup at ${ROOM_SETUP_ROUTINE:04X}",
    )


def _entrances(ram: bytes) -> list[dict[str, Any]]:
    """Every site whose destination cell is somewhere on the grid.

    Nothing in the ROM states how many there are. What bounds them is that the X
    table is shorter than the index would allow: past the last entrance it runs into
    the Z table and the coordinates leave the grid, so a cell on the grid is the
    test, and it stops at the first site that fails rather than skipping it.
    """
    entrances: list[dict[str, Any]] = []
    site = FIRST_SITE
    while True:
        column = ram[ENTRANCE_CELL_X_BASE + site]
        row = ram[ENTRANCE_CELL_Z_BASE + site]
        if not (column < CELLS_PER_AXIS and row < CELLS_PER_AXIS):
            break
        entrances.append(
            {
                "site": site,
                "cell": [column, row],
                # The site is handed to the room setup as a room id, so they are one
                # and the same number rather than two that happen to agree.
                "room": site,
            }
        )
        site += 1
    require(bool(entrances), "The lift destination table decodes as empty")
    return entrances


def decode_underground(ram: bytes) -> dict[str, Any]:
    """Read the lift's rules and every entrance it serves."""
    _require_engine(ram)
    entrances = _entrances(ram)
    cells = [tuple(entrance["cell"]) for entrance in entrances]
    require(len(set(cells)) == len(cells), "Two lift entrances decode to the same cell")
    return {
        "schemaVersion": UNDERGROUND_SCHEMA_VERSION,
        "entrances": entrances,
        "pad": {
            # The pad is the position's middle byte shifted down two, so one pad
            # value covers four middle bytes: a square the player has to stand in.
            "x": ram[TRIGGER_PAD_X_SITE + 1],
            "z": ram[TRIGGER_PAD_Z_SITE + 1],
            "shift": TRIGGER_PAD_SHIFT,
        },
        "lift": {
            "ascendRate": ram[ASCEND_RATE_SITE + 1],
            "descendRate": ram[DESCEND_RATE_SITE + 1],
            "surfaceAt": ram[OUTSIDE_THRESHOLD_SITE + 1],
            "submergeAt": ram[INSIDE_THRESHOLD_SITE + 1],
            "surfaceMiddle": ram[OUTSIDE_MIDDLE_SITE + 1],
            "submergeMiddle": ram[INSIDE_MIDDLE_SITE + 1],
            "floor": ram[BOTTOM_CLAMP_SITE + 1],
            "altitudeWrap": ram[ALTITUDE_WRAP_SITE + 1],
            "altitudeWrapSubtract": ram[ALTITUDE_WRAP_SUBTRACT_SITE + 1],
        },
        "counts": {"undergroundEntrances": len(entrances)},
    }
