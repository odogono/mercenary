"""How a Doorway is traversed and how a Room is set up, read from our own image.

Everything here is an immediate operand or a table address lifted out of the
conditioned RAM image and asserted against an opcode fingerprint first, in the
same shape as the other engine-constant decoders. The Reference Disassembly
located these routines; none of the values below were taken from it.

Three routines matter:

``$9437`` decides whether the player just walked through a Doorway. It walks the
current Room's commands looking for one the player is standing in and facing,
then consults the lock. Its ordered tests are recorded rather than reduced to a
window, because the sign games it plays with ``EOR $09`` mean the accepted region
depends on the command's plane bit, and a window written out here would be a
second interpretation to keep in step with the one the app implements.

``$90BE`` sets a Room up on arrival: it patches the two special Room families,
places the player in the destination Doorway, and applies the Room's palette and
darkness.

``$9353`` is the world flip, reached only from the special-setup path.

The one value that is not a Doorway rule at all is ``lineColour``. It rides here
because it is the third of the three colours darkness zeroes, and because there
is no per-Room source for it: every Room setup stores the same immediate.
"""

from __future__ import annotations

from typing import Any

from .core import require


#: Object instance state flags, one byte per slot. Bit 7 means the player holds it.
STATE_FLAGS_BASE = 0x29C0

#: The door-collision routine, and the sites its rules are read from.
DOORWAY_ROUTINE = 0x9437
LOCKED_MESSAGE_SITE = 0x9430
COMMAND_READ_SITE = 0x943F
TERMINATOR_TEST_SITE = 0x9443
PLANE_TEST_SITE = 0x944D
DEPTH_WINDOW_SITE = 0x945D
ALONG_WALL_WINDOW_SITE = 0x9478
HEADING_ROUNDING_SITE = 0x9484
SKELETON_KEY_SITE = 0x948E
LOCK_NIBBLE_SITE = 0x9493
LOCK_BOUNDARY_SITE = 0x9497
KEY_TABLE_SITE = 0x949B
ARRIVAL_INDEX_SITE = 0x94C6

#: Room setup: the patch for special records, then placement.
ROOM_SETUP_ROUTINE = 0x90BE
SPECIAL_SETUP_TEST_SITE = 0x9106
RANDOM_ROOM_TEST_SITE = 0x910A
RANDOM_SELECTOR_SITE = 0x910E
PREVIOUS_ROOM_TEST_SITE = 0x9119
PAIR_SPLICE_SITE = 0x912F
COOLDOWN_SITE = 0x913D
WORLD_FLIP_TEST_SITE = 0x9141
ARRIVAL_PLACEMENT_SITE = 0x9148
ARRIVAL_LOW_BYTE_SITE = 0x915A

#: Darkness, and the colour it clears that no Room carries.
DARK_COMMAND_TEST_SITE = 0x91EE
PHOTON_SEARCH_SITE = 0x91F2
DARK_COLOUR_CLEAR_SITE = 0x91FE
DARK_MESSAGE_SITE = 0x9206
LINE_COLOUR_SITE = 0x9399
CARRIED_SEARCH_ROUTINE = 0x941A
ROOM_PRESENCE_ROUTINE = 0x9425

#: The world flip, and the longer transition it installs.
WORLD_FLIP_ROUTINE = 0x9353
WORLD_FLIP_PARITY_FLAG = 0xF1
WORLD_FLIP_COOLDOWN_SITE = 0x936F

#: The command byte's fields. Bit 7 is the plane, the low nibble is the door
#: shape and its lock class at once, and bits 4-6 index the destination Room's
#: own command list to say which Doorway the player arrives in.
PLANE_MASK = 0x80
SHAPE_MASK = 0x0F
ARRIVAL_INDEX_MASK = 0x70
ARRIVAL_INDEX_SHIFT = 4

#: The two record shapes the special-setup families use. Both are asserted at
#: extraction rather than trusted: the record region tiles exactly, so a wrong
#: pair count would silently read a neighbour's header.
SPECIAL_PAIRS_RANDOM = 8
SPECIAL_PAIRS_PREVIOUS = 2

#: The ordered tests ``$9437`` applies, recorded as prose because the accepted
#: region is plane-dependent and belongs to the app rather than to this decode.
DOORWAY_PREDICATE = (
    "cooldown $F0 must be zero; "
    "then per command, in record order: the player's X plus the plane bit must "
    "share the command's X byte as its high byte; the Z low byte less the depth "
    "half-window, sign-corrected by the command's plane bit, must be negative; "
    "the player's Z plus the complemented plane bit must share the command's Z "
    "byte; the X low byte less the along-wall bias, sign-corrected the same way, "
    "must be non-negative; and the rounded heading's low bit must face the wall. "
    "The shape nibble then gates the lock."
)

#: How arrival is placed once a Doorway is taken, from $9148-$9160.
ARRIVAL_CONTRACT = (
    "read the destination Room's command at the arrival index; its X and Z bytes "
    "become the high bytes of the player's position, and its own plane bit "
    "becomes the low bytes: Z low takes the plane bit, X low takes its "
    "complement. Altitude is not written."
)


def _immediate(ram: bytes, site: int, opcode: int, complaint: str) -> int:
    require(ram[site] == opcode, f"Reference Build {complaint}")
    return ram[site + 1]


def require_navigation(ram: bytes) -> None:
    """Confirm the traversal and Room-setup routines are the ones read here."""
    require(len(ram) == 65536, "Navigation decode requires a 64 KiB physical RAM image")
    checks = (
        (DOORWAY_ROUTINE, (0xA5, 0xF0, 0xD0), "door collision does not begin at the transition cooldown"),
        (LOCKED_MESSAGE_SITE, (0xA2, 0x00, 0x20), "a refused Doorway does not play an immediate message"),
        (COMMAND_READ_SITE, (0xB1, 0x1B, 0x85, 0x09), "door collision does not keep the command byte"),
        (TERMINATOR_TEST_SITE, (0x0A, 0xF0), "door collision does not end on a shifted terminator"),
        (PLANE_TEST_SITE, (0x29, PLANE_MASK), "door collision does not test the command's plane bit"),
        (DEPTH_WINDOW_SITE, (0x38, 0xE9), "door collision does not subtract a depth window"),
        (ALONG_WALL_WINDOW_SITE, (0x38, 0xE9), "door collision does not subtract an along-wall bias"),
        (HEADING_ROUNDING_SITE, (0x69,), "door collision does not round the heading by an immediate"),
        (SKELETON_KEY_SITE, (0xAD,), "door collision does not read a skeleton key from an address"),
        (LOCK_NIBBLE_SITE, (0xA5, 0x09, 0x29, SHAPE_MASK), "door collision does not mask the shape nibble"),
        (LOCK_BOUNDARY_SITE, (0xC9,), "door collision does not compare the shape against an immediate"),
        (KEY_TABLE_SITE, (0xAA, 0xBD), "door collision does not index a key table by the shape nibble"),
        (ARRIVAL_INDEX_SITE, (0xA5, 0x09, 0x4A, 0x4A, 0x29, 0x1C, 0x18, 0x69), "door collision does not fold the command's middle bits into a record offset"),
        (ROOM_SETUP_ROUTINE, (0xA6, 0x08, 0xD0), "Room setup does not begin at the target Room"),
        (SPECIAL_SETUP_TEST_SITE, (0xB1, 0x1B, 0x10), "Room setup does not branch on the special-setup header bit"),
        (RANDOM_ROOM_TEST_SITE, (0xE0,), "Room setup does not compare an immediate random Room"),
        (RANDOM_SELECTOR_SITE, (0x20, 0xEF, 0xAD, 0x29), "the random Room does not mask a random selector"),
        (PREVIOUS_ROOM_TEST_SITE, (0xA5, 0xCD, 0xA0), "Room setup does not test the previous Room against a pair table"),
        (PAIR_SPLICE_SITE, (0xA0, 0x05, 0xB1, 0x1B, 0x29, 0x8F), "Room setup does not splice a pair into the command's middle bits"),
        (COOLDOWN_SITE, (0xA9,), "Room setup does not install an immediate transition cooldown"),
        (WORLD_FLIP_TEST_SITE, (0xE0,), "Room setup does not compare an immediate world-flip Room"),
        (ARRIVAL_PLACEMENT_SITE, (0xA4, 0x09, 0x86, 0xCD, 0xB1, 0x1B, 0x85, 0x73), "Room setup does not place the player from the arrival offset"),
        (ARRIVAL_LOW_BYTE_SITE, (0x29, PLANE_MASK, 0x85, 0x78, 0x49, PLANE_MASK, 0x85, 0x72), "Room setup does not derive the arrival low bytes from the plane bit"),
        (DARK_COMMAND_TEST_SITE, (0xC9, PLANE_MASK), "Room setup does not test a bare plane byte for darkness"),
        (PHOTON_SEARCH_SITE, (0xA9,), "darkness does not search for an immediate object"),
        (DARK_COLOUR_CLEAR_SITE, (0xA9, 0x00, 0x85, 0xC2, 0x85, 0xC4, 0x85, 0xC5), "darkness does not clear all three Room colours"),
        (DARK_MESSAGE_SITE, (0xA9,), "darkness does not queue an immediate message"),
        (LINE_COLOUR_SITE, (0xA9,), "Room setup does not store an immediate line colour"),
        (WORLD_FLIP_ROUTINE, (0xA5, WORLD_FLIP_PARITY_FLAG, 0x49, 0x01, 0x85, WORLD_FLIP_PARITY_FLAG), "the world flip does not toggle a parity flag"),
        (WORLD_FLIP_COOLDOWN_SITE, (0xA9,), "the world flip does not install its own cooldown"),
    )
    for address, expected, complaint in checks:
        found = tuple(ram[address : address + len(expected)])
        require(found == expected, f"Reference Build {complaint}")

    require(
        ram[WORLD_FLIP_TEST_SITE + 4] == 0x20,
        "Reference Build the world-flip Room does not call a routine",
    )
    flip = ram[WORLD_FLIP_TEST_SITE + 5] | (ram[WORLD_FLIP_TEST_SITE + 6] << 8)
    require(
        flip == WORLD_FLIP_ROUTINE,
        f"The world-flip Room calls ${flip:04X} rather than the flip at ${WORLD_FLIP_ROUTINE:04X}",
    )
    for site, routine, complaint in (
        (PHOTON_SEARCH_SITE + 2, CARRIED_SEARCH_ROUTINE, "carried inventory"),
        (PHOTON_SEARCH_SITE + 7, ROOM_PRESENCE_ROUTINE, "objects present in the Room"),
    ):
        require(ram[site] == 0x20, f"Reference Build darkness does not call the {complaint} search")
        target = ram[site + 1] | (ram[site + 2] << 8)
        require(
            target == routine,
            f"Darkness searches ${target:04X} rather than the {complaint} routine at ${routine:04X}",
        )


def decode_navigation_rules(ram: bytes) -> dict[str, Any]:
    """The immediates and table slots that govern Doorway traversal."""
    require_navigation(ram)
    key_table = ram[KEY_TABLE_SITE + 2] | (ram[KEY_TABLE_SITE + 3] << 8)
    skeleton = ram[SKELETON_KEY_SITE + 1] | (ram[SKELETON_KEY_SITE + 2] << 8)
    for address, what in ((key_table, "key table"), (skeleton, "skeleton key")):
        require(
            STATE_FLAGS_BASE <= address < STATE_FLAGS_BASE + 64,
            f"The {what} at ${address:04X} is outside the object state flags",
        )
    # The table is indexed by the raw shape nibble, so the slot a lock wants is
    # the nibble plus however far the table's base sits past slot zero.
    key_slot_bias = key_table - STATE_FLAGS_BASE
    lock_boundary = _immediate(ram, LOCK_BOUNDARY_SITE, 0xC9, "door collision does not compare an immediate lock boundary")
    require(
        key_slot_bias + SHAPE_MASK < 64,
        "The key table's highest lock class would index past the object state flags",
    )
    return {
        "predicate": DOORWAY_PREDICATE,
        "arrivalContract": ARRIVAL_CONTRACT,
        "planeMask": PLANE_MASK,
        "shapeMask": SHAPE_MASK,
        "arrivalIndexMask": ARRIVAL_INDEX_MASK,
        "depthHalfWindow": _immediate(ram, DEPTH_WINDOW_SITE + 1, 0xE9, "door collision does not subtract an immediate depth window"),
        "alongWallBias": _immediate(ram, ALONG_WALL_WINDOW_SITE + 1, 0xE9, "door collision does not subtract an immediate along-wall bias"),
        "headingRounding": _immediate(ram, HEADING_ROUNDING_SITE, 0x69, "door collision does not round the heading by an immediate"),
        "arrivalOffsetBias": _immediate(ram, ARRIVAL_INDEX_SITE + 7, 0x69, "door collision does not bias the arrival offset by an immediate"),
        "lockBoundary": lock_boundary,
        "keySlotBias": key_slot_bias,
        "skeletonKeySlot": skeleton - STATE_FLAGS_BASE,
        "photonEmitterSlot": _immediate(ram, PHOTON_SEARCH_SITE, 0xA9, "darkness does not search for an immediate object"),
        "lockedMessage": _immediate(ram, LOCKED_MESSAGE_SITE, 0xA2, "a refused Doorway does not play an immediate message"),
        "darkMessage": _immediate(ram, DARK_MESSAGE_SITE, 0xA9, "darkness does not queue an immediate message"),
        "lineColour": _immediate(ram, LINE_COLOUR_SITE, 0xA9, "Room setup does not store an immediate line colour"),
        "cooldownFrames": _immediate(ram, COOLDOWN_SITE, 0xA9, "Room setup does not install an immediate transition cooldown"),
        "worldFlipCooldownFrames": _immediate(ram, WORLD_FLIP_COOLDOWN_SITE, 0xA9, "the world flip does not install an immediate cooldown"),
        "randomRoom": _immediate(ram, RANDOM_ROOM_TEST_SITE, 0xE0, "Room setup does not compare an immediate random Room"),
        "worldFlipRoom": _immediate(ram, WORLD_FLIP_TEST_SITE, 0xE0, "Room setup does not compare an immediate world-flip Room"),
        "randomSelectorMask": _immediate(ram, RANDOM_SELECTOR_SITE + 3, 0x29, "the random Room does not mask an immediate random selector"),
        "pairTableOffset": _immediate(ram, PREVIOUS_ROOM_TEST_SITE + 2, 0xA0, "Room setup does not read the pair table from an immediate offset"),
    }


def lock_for(shape: int, rules: dict[str, Any]) -> dict[str, int] | None:
    """The lock a Doorway's shape nibble carries, if it carries one."""
    if shape < rules["lockBoundary"]:
        return None
    return {"class": shape, "requiresObject": shape + rules["keySlotBias"]}
