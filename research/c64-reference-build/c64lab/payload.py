"""Export a World Geometry Dataset into the app's Data Payload.

This is plumbing, not decoding: it reads a dataset produced by ``geometry.py``
and rewrites it in the compact shape the macOS app loads at runtime (ADR 0014).
Provenance references, raw ROM hex, and reconstruction round-trip fields are
dropped — the app needs coordinates and topology, not an audit trail.

The Data Payload is never tracked, so output is confined to ignored storage.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .core import LabError, file_hash
from .geometry import (
    DECODER_VERSION as GEOMETRY_DECODER_VERSION,
    RESTRICTED_ROOT,
    WORK_ROOT,
    load_geometry_source,
    load_json,
    verify_dataset,
)
from .navigation import lock_for
from .benson import decode_benson
from .flight import decode_flight
from .interaction import decode_interaction
from .underground import decode_underground
from .text import decode_text


PAYLOAD_SCHEMA_VERSION = 6
PAYLOAD_ROOT = Path(__file__).resolve().parents[3] / "payload"
CELLS_PER_AXIS = 16
CELL_SIZE = 0x10000

#: Vertical axis facts established from the dataset, recorded so the app does not
#: have to rediscover them. Surface points are absolute: Y is up and ground level
#: is exactly zero (two thirds of surface vertices sit there, and structures rise
#: from it in quantised steps). Model vertices are centred on their own bounding
#: cube in the same Y-up frame, so an instance position alone does not say where
#: the model's base belongs; the app grounds models on load.
VERTICAL_CONVENTION = {
    "axis": "y",
    "surface": "absolute-ground-at-zero",
    "models": "centred-on-instance",
    "groundLevel": 0,
}

INK_CODES = {"white": 0, "black": 1}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LabError(message)


def require_ignored_output(path: Path) -> Path:
    resolved = path.resolve()
    allowed = (PAYLOAD_ROOT.resolve(), WORK_ROOT.resolve(), RESTRICTED_ROOT.resolve())
    _require(
        any(resolved == root or resolved.is_relative_to(root) for root in allowed),
        f"Data Payload output must remain under ignored payload/, work/, or restricted/ storage: {path}",
    )
    return resolved


def require_current_geometry_decoder(manifest: dict[str, Any]) -> None:
    found = manifest.get("decoderVersion")
    _require(
        found == GEOMETRY_DECODER_VERSION,
        f"World Geometry Dataset uses decoder {found}; "
        f"re-extract it with decoder {GEOMETRY_DECODER_VERSION}",
    )


def build_world(surface: dict[str, Any]) -> dict[str, Any]:
    """Collect grid metadata, bounds, and table-faithful surface map lines."""
    low = [None, None, None]
    high = [None, None, None]
    for cell in surface["cells"]:
        expanded = cell.get("expanded")
        if not expanded:
            continue
        bounds = expanded["bounds"]
        for axis in range(3):
            minimum, maximum = bounds["min"][axis], bounds["max"][axis]
            low[axis] = minimum if low[axis] is None else min(low[axis], minimum)
            high[axis] = maximum if high[axis] is None else max(high[axis], maximum)
    _require(all(value is not None for value in low), "Surface dataset expanded no cell bounds")

    road_cells = build_road_cells(surface)
    lookup = surface.get("roadAltitudeLookup", {})
    raw = lookup.get("rawHex", "")
    _require(len(raw) % 2 == 0, "Road altitude lookup hex is malformed")

    return {
        "schemaVersion": PAYLOAD_SCHEMA_VERSION,
        "grid": {"cellsPerAxis": CELLS_PER_AXIS, "cellSize": CELL_SIZE},
        "bounds": {"min": low, "max": high},
        "verticalConvention": dict(VERTICAL_CONVENTION),
        # The Reference Build selects how far road geometry extends through this
        # table; without it every road draws at full length from any altitude.
        "roadAltitudeLookup": list(bytes.fromhex(raw)),
        "transformContract": surface.get("transformContract", {}),
        "roadCells": road_cells,
        "highAltitudeMap": [
            {"slot": index, "from": line["startGrid"], "to": line["endGrid"]}
            for index, line in enumerate(surface.get("highAltitudeMap", {}).get("segments", []))
        ],
    }


def build_road_cells(surface: dict[str, Any]) -> list[dict[str, Any]]:
    """Preserve the four tables as two optional full runs per lookup cell."""
    result = []
    for cell in sorted(surface["cells"], key=lambda item: item["cell"]):
        segments = [
            {"slot": road["segment"], "from": list(road["startGrid"]), "to": list(road["endGrid"])}
            for road in sorted(cell.get("roads", []), key=lambda item: item["segment"])
        ]
        _require(len(segments) <= 2, f"Road table cell {cell['cell']} has more than two segments")
        _require(len({item["slot"] for item in segments}) == len(segments), f"Road table cell {cell['cell']} repeats a slot")
        result.append({"cell": cell["cell"], "segments": segments})
    return result


def build_rooms(underground: dict[str, Any]) -> dict[str, Any]:
    """The underground rooms, already expanded, as render-ready wireframes.

    The rooms come out of the verified dataset like the surface and the objects do,
    not from a live capture, because their geometry is table data rather than
    runtime state. Each room is a closed index space of its own: the Reference Build
    expands a room's drawing commands into points before drawing anything, and the
    dataset has already done that, so this only has to carry the result across.

    A **Doorway** is one opening belonging to one Room, and its **Room Link** is the
    directed destination it names. Both travel here already resolved: the decoder has
    settled the destination, the lock class, and where the player arrives, so the app
    never sees a raw opcode. Doorways are written out per Room rather than per record
    even though nineteen Rooms share one record, because a Doorway belongs to a Room
    and the duplication is cheaper than making the app resolve the sharing.

    Every Room Link is directed and one-way links are real: nothing here pairs a
    Doorway with a Doorway in the other direction, and no reverse link is invented.
    """
    # A room names its record by identity rather than carrying it, and several
    # rooms share one record, so the commands are looked up rather than inlined.
    records = {record["geometryIdentity"]: record for record in underground.get("records", [])}
    rules = underground.get("navigationRules")
    _require(
        isinstance(rules, dict) and "lockBoundary" in rules,
        "The underground dataset carries no navigation rules; re-extract it",
    )
    rooms: list[dict[str, Any]] = []
    for room in underground["rooms"]:
        expanded = room.get("expanded")
        if not expanded:
            continue
        vertices = [list(vertex["position"]) for vertex in expanded["vertices"]]
        edges = [list(edge["indices"]) for edge in expanded["edges"]]
        for start, end in edges:
            _require(
                0 <= start < len(vertices) and 0 <= end < len(vertices),
                f"Room {room['roomId']} has an edge outside its own point space",
            )
        bounds = expanded["bounds"]
        record_identity = room.get("record")
        record = records.get(record_identity)
        _require(
            record is not None,
            f"Room {room['roomId']} names a missing record {record_identity}",
        )
        header = record.get("header")
        _require(
            isinstance(header, list) and len(header) >= 5,
            f"Room {room['roomId']} record has a malformed header",
        )
        background, foreground = header[3], header[4]
        _require(
            isinstance(background, int) and isinstance(foreground, int)
            and 0 <= background <= 15 and 0 <= foreground <= 15,
            f"Room {room['roomId']} palette is outside the C64 colour range",
        )
        doorways = []
        for index, command in enumerate(record.get("commands", [])):
            _require(
                isinstance(command.get("destination"), dict) and "arrival" in command,
                f"Room {room['roomId']} doorway {index} has no resolved destination; re-extract the dataset",
            )
            doorways.append(
                {
                    "index": index,
                    "shape": command["primitiveIndex"],
                    "plane": command["plane"],
                    "position": {"x": command["xMiddle"] << 8, "z": command["zMiddle"] << 8},
                    "destination": dict(command["destination"]),
                    "arrivalCommandIndex": command["arrivalCommandIndex"],
                    "arrival": dict(command["arrival"]) if command["arrival"] else None,
                    "arrivalWithinDestination": bool(command["arrivalWithinDestination"]),
                    "lock": lock_for(command["primitiveIndex"], rules),
                }
            )
        special = record.get("specialSetup")
        rooms.append(
            {
                "room": room["roomId"],
                "vertices": vertices,
                "edges": edges,
                "bounds": {"min": list(bounds["min"]), "max": list(bounds["max"])},
                "palette": {"background": background, "foreground": foreground},
                "dark": bool(record.get("dark")),
                "entry": dict(record["entry"]) if record.get("entry") else None,
                "specialSetup": (
                    {
                        "selector": special["selector"],
                        "alternates": [
                            {"room": alternate["room"], "arrivalCommandIndex": alternate["arrivalCommandIndex"]}
                            for alternate in special["alternates"]
                        ],
                    }
                    if special
                    else None
                ),
                "doorways": doorways,
            }
        )
    _require(bool(rooms), "The underground dataset carries no rooms")
    return {
        "schemaVersion": PAYLOAD_SCHEMA_VERSION,
        "doorwayRules": _doorway_rules(rules),
        "rooms": rooms,
    }


#: The navigation rules the app needs, which is not everything the decode records:
#: the dataset keeps the site prose and the masks it used to read the fields, and
#: only the values that govern behaviour travel.
_DOORWAY_RULE_FIELDS = (
    "depthHalfWindow",
    "alongWallBias",
    "headingRounding",
    "lockBoundary",
    "keySlotBias",
    "skeletonKeySlot",
    "photonEmitterSlot",
    "lockedMessage",
    "darkMessage",
    "lineColour",
    "cooldownFrames",
    "worldFlipCooldownFrames",
    "randomRoom",
    "worldFlipRoom",
)


def _doorway_rules(rules: dict[str, Any]) -> dict[str, Any]:
    """Traversal constants, every one an immediate read out of the Reference Build.

    ``lineColour`` is the odd one here and belongs to no Doorway: it is the third of
    the three colours darkness clears, and there is no per-Room source for it — every
    Room setup stores the same immediate — so it rides with the rules rather than
    pretending to be part of a Room's palette.
    """
    missing = [name for name in _DOORWAY_RULE_FIELDS if name not in rules]
    _require(not missing, f"The dataset's navigation rules are missing {missing!r}")
    return {name: rules[name] for name in _DOORWAY_RULE_FIELDS}


def render_room_map_svg(rooms: list[dict[str, Any]]) -> tuple[str, dict[str, int]]:
    """A checking map: every room's plan, its doorways, and where its links go.

    Rooms have no shared coordinate space — the Reference Build draws one at a time
    from its own points — so there is no floor plan of the underground to draw. What
    there is instead is each room's own plan, laid out in a grid, with its links
    written on it, which is what makes a topology mistake visible.

    A Doorway is drawn differently when the room it leads to has no Doorway back.
    These counts are per Doorway, not per link: two openings between the same pair of
    rooms are two Doorways and one Room Link, and the single Doorway onto the surface
    is counted here but is not a Room Link at all. The payload manifest counts links
    instead, which is why its one-way total is the smaller of the two.
    """
    links = {room["room"]: [_link_target(door) for door in room["doorways"]] for room in rooms}
    known = set(links)

    columns = 12
    tile, pad, header = 150, 12, 78
    width = columns * tile
    rows = (len(rooms) + columns - 1) // columns
    height = header + rows * tile

    one_way = sum(
        1
        for source, targets in links.items()
        for target in targets
        if not (target in known and source in links[target])
    )
    total = sum(len(value) for value in links.values())
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#0d0f14"/>',
        '<style>text{font-family:ui-monospace,monospace;fill:#8fa4c0}'
        '.id{fill:#e8eef7;font-size:13px}.lk{font-size:9px}'
        '.w{stroke:#cfe0f5;stroke-width:1.2;fill:none}'
        '.d{fill:#5ad18a}.o{fill:#e0913f}</style>',
        f'<text class="id" x="{pad}" y="24">underground rooms: {len(rooms)}</text>',
        f'<text x="{pad}" y="43" font-size="11">{total} doorways, {total - one_way} answered, '
        f'{one_way} unanswered &#183; a green doorway leads to a room with a doorway '
        f'back, an orange one does not</text>',
        f'<text x="{pad}" y="60" font-size="11">each tile is one room seen from above in its own '
        f'coordinates, so a corridor reads as a line; labels are the rooms linked to</text>',
    ]
    for index, room in enumerate(sorted(rooms, key=lambda entry: entry["room"])):
        column, row = index % columns, index // columns
        left, top = column * tile, header + row * tile
        parts.append(f'<g transform="translate({left},{top})">')
        parts.append(f'<rect x="0.5" y="0.5" width="{tile - 1}" height="{tile - 1}" fill="none" stroke="#1e2532"/>')

        low, high = room["bounds"]["min"], room["bounds"]["max"]
        span_x = max(1, high[0] - low[0])
        span_z = max(1, high[2] - low[2])
        inner = tile - 2 * pad - 16

        def place(x: float, z: float) -> tuple[float, float]:
            return (
                pad + (x - low[0]) / span_x * inner,
                pad + 16 + (z - low[2]) / span_z * inner,
            )

        # The plan is the wireframe seen from above, so a corridor reads as a line.
        for start, end in room["edges"]:
            a, b = room["vertices"][start], room["vertices"][end]
            x1, y1 = place(a[0], a[2])
            x2, y2 = place(b[0], b[2])
            parts.append(f'<line class="w" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')

        parts.append(f'<text class="id" x="{pad}" y="13">{room["room"]:02X}</text>')
        for order, door in enumerate(room["doorways"]):
            target = _link_target(door)
            mutual = target in known and room["room"] in links[target]
            # The doorway's own position within the room.
            x, y = place(door["position"]["x"], door["position"]["z"])
            parts.append(
                f'<rect class="{"d" if mutual else "o"}" x="{x - 2.5:.1f}" y="{y - 2.5:.1f}" width="5" height="5"/>'
            )
            parts.append(
                f'<text class="lk" x="{pad + (order % 4) * 30}" y="{tile - 16 - (order // 4) * 11}" '
                f'fill="{"#5ad18a" if mutual else "#e0913f"}">{target:02X}</text>'
            )
        parts.append("</g>")

    parts.append("</svg>")
    counts = {"rooms": len(rooms), "doorways": total, "unansweredDoorways": one_way}
    return "\n".join(parts), counts


def _link_target(door: dict[str, Any]) -> int:
    """A Doorway's destination as a room id, with the surface reading as zero.

    Only the checking maps use this. They draw the underground as rooms and links,
    and the one Doorway that leads outside has no tile to point at, so it keeps the
    id the Reference Build itself uses for the surface.
    """
    return int(door["destination"].get("room", 0))


#: Which way a doorway on each wall leads, in room steps.
_WALL_STEPS = {"west": (-1, 0), "east": (1, 0), "north": (0, -1), "south": (0, 1)}
_OPPOSITE = {"west": "east", "east": "west", "north": "south", "south": "north"}


def _doorways(room: dict[str, Any]) -> list[tuple[str, int]]:
    """Which wall each of a room's doorways is on, and where it leads.

    Every doorway in our image sits on a wall rather than inside the room, which is
    what makes a layout derivable at all: a door on the east wall can only lead to
    the room to the east. A few sit on a corner and are on two walls at once; those
    are left for the caller to break, since the room on the other side knows.
    """
    high = room["bounds"]["max"]
    found: list[tuple[str, int]] = []
    for door in room["doorways"]:
        x, z = door["position"]["x"], door["position"]["z"]
        walls = []
        if x == 0:
            walls.append("west")
        if x == high[0]:
            walls.append("east")
        if z == 0:
            walls.append("north")
        if z == high[2]:
            walls.append("south")
        for wall in walls:
            found.append((wall, _link_target(door)))
    return found


def _lay_out(rooms: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Place the rooms by butting their shared doorways together.

    A doorway sits on a wall, so the room it leads to is on the other side of that
    wall — and the two rooms' doorways are the same doorway, so they have to line up.
    That fixes both axes at once: the far room's wall touches the near room's, and it
    slides along until the doors meet. Rooms keep their own width and depth, so a
    corridor lays out as a corridor.

    The rooms are not one connected whole, so this is done once per group. Where a
    room would overlap one already placed the first stands and the overlap is
    counted, since a wrong reading should be a number and not a quiet correction.
    """
    doors = {room["room"]: _doorways(room) for room in rooms}
    by_id = {room["room"]: room for room in rooms}
    ways = {
        room["room"]: [
            (wall, _link_target(door), door["position"]["x"], door["position"]["z"])
            for door in room["doorways"]
            for wall, target in [(w, t) for w, t in _doorways(room) if t == _link_target(door)][:1]
        ]
        for room in rooms
    }
    placed: dict[int, tuple[int, float, float]] = {}
    overlaps = 0
    group = 0

    def extent(identifier: int) -> tuple[float, float]:
        bounds = by_id[identifier]["bounds"]
        return (
            max(1.0, bounds["max"][0] - bounds["min"][0]),
            max(1.0, bounds["max"][2] - bounds["min"][2]),
        )

    for start_room in sorted(by_id):
        if start_room in placed:
            continue
        placed[start_room] = (group, 0.0, 0.0)
        here: list[tuple[float, float, float, float]] = [(0.0, 0.0, *extent(start_room))]
        queue = [start_room]
        while queue:
            current = queue.pop(0)
            _, x, y = placed[current]
            width, depth = extent(current)
            for wall, target, door_x, door_z in ways.get(current, []):
                if target not in by_id or target in placed:
                    continue
                # Only a doorway the far room answers is a shared wall; a one-way link
                # need not be adjacency at all, and the lift is one.
                back = [
                    (w, bx, bz) for w, t, bx, bz in ways.get(target, [])
                    if t == current and w == _OPPOSITE[wall]
                ]
                if not back:
                    continue
                _, back_x, back_z = back[0]
                far_width, far_depth = extent(target)
                if wall == "east":
                    at = (x + width, y + door_z - back_z)
                elif wall == "west":
                    at = (x - far_width, y + door_z - back_z)
                elif wall == "south":
                    at = (x + door_x - back_x, y + depth)
                else:
                    at = (x + door_x - back_x, y - far_depth)
                box = (at[0], at[1], far_width, far_depth)
                if any(
                    box[0] < other[0] + other[2] - 1 and other[0] < box[0] + box[2] - 1
                    and box[1] < other[1] + other[3] - 1 and other[1] < box[1] + box[3] - 1
                    for other in here
                ):
                    overlaps += 1
                    continue
                here.append(box)
                placed[target] = (group, at[0], at[1])
                queue.append(target)
        group += 1

    laid = [
        {"room": room, "group": placed[room["room"]][0], "at": placed[room["room"]][1:]}
        for room in rooms
    ]
    return laid, overlaps


def render_room_plan_svg(rooms: list[dict[str, Any]]) -> tuple[str, dict[str, int]]:
    """The rooms laid out as they join, drawn at the size they actually are.

    Rooms carry no coordinates, so the layout is walked out of the doorways: each one
    says which wall it is on, which says where the room it leads to lies, and the two
    halves of a shared doorway have to meet. What comes out is not one map — the rooms
    are not all joined — so each connected group is drawn as its own block.
    """
    laid, overlaps = _lay_out(rooms)
    doors = {entry["room"]["room"]: _doorways(entry["room"]) for entry in laid}
    links = {room["room"]: [_link_target(door) for door in room["doorways"]] for room in rooms}
    known = set(links)

    groups: dict[int, list[dict[str, Any]]] = {}
    for entry in laid:
        groups.setdefault(entry["group"], []).append(entry)
    order = sorted(groups, key=lambda key: (-len(groups[key]), key))

    scale = 1 / 90
    gap, header, limit = 26, 100, 1150

    def size(entry: dict[str, Any]) -> tuple[float, float]:
        bounds = entry["room"]["bounds"]
        return (
            max(1.0, bounds["max"][0] - bounds["min"][0]) * scale,
            max(1.0, bounds["max"][2] - bounds["min"][2]) * scale,
        )

    blocks = []
    cursor_x, cursor_y, row_height, widest = gap, header, 0.0, 0.0
    for key in order:
        entries = groups[key]
        lows_x = min(entry["at"][0] * scale for entry in entries)
        lows_y = min(entry["at"][1] * scale for entry in entries)
        highs_x = max(entry["at"][0] * scale + size(entry)[0] for entry in entries)
        highs_y = max(entry["at"][1] * scale + size(entry)[1] for entry in entries)
        width, height = highs_x - lows_x, highs_y - lows_y + 14
        if cursor_x + width > limit and cursor_x > gap:
            cursor_x, cursor_y = gap, cursor_y + row_height + gap
            row_height = 0.0
        blocks.append((key, cursor_x - lows_x, cursor_y + 14 - lows_y, width))
        cursor_x += width + gap
        row_height = max(row_height, height)
        widest = max(widest, cursor_x)
    total_height = cursor_y + row_height + gap

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{widest:.0f}" height="{total_height:.0f}" '
        f'viewBox="0 0 {widest:.0f} {total_height:.0f}">',
        '<rect width="100%" height="100%" fill="#0d0f14"/>',
        '<style>text{font-family:ui-monospace,monospace;fill:#8fa4c0}'
        '.id{fill:#e8eef7;font-size:13px}.n{font-size:7px;fill:#9fb2c9}'
        '.r{stroke:#cfe0f5;stroke-width:0.9;fill:#161d28}'
        '.d{stroke:#5ad18a;stroke-width:2}.o{stroke:#e0913f;stroke-width:2}</style>',
        f'<text class="id" x="{gap}" y="26">the underground, laid out by its doorways</text>',
        f'<text x="{gap}" y="45" font-size="11">{len(rooms)} rooms in {len(groups)} groups that do '
        f'not join &#183; a green doorway leads both ways, an orange one only outward</text>',
        f'<text x="{gap}" y="62" font-size="11">north is up, and every room is drawn its own width '
        f'and depth, so a corridor lays out as a corridor</text>',
        f'<text x="{gap}" y="79" font-size="11">shared doorways are butted together, which fixes '
        f'both axes at once; {overlaps} rooms would have overlapped one already placed and were '
        f'left where they are</text>',
    ]

    for key, origin_x, origin_y, width in blocks:
        entries = groups[key]
        left_edge = origin_x + min(entry["at"][0] * scale for entry in entries)
        top_edge = origin_y + min(entry["at"][1] * scale for entry in entries)
        caption = f'group {key} &#183; {len(entries)} rooms' if width >= 120 else f'{key}&#183;{len(entries)}'
        parts.append(f'<text x="{left_edge:.0f}" y="{top_edge - 4:.0f}" font-size="9">{caption}</text>')
        for entry in entries:
            identifier = entry["room"]["room"]
            box_width, box_depth = size(entry)
            left = origin_x + entry["at"][0] * scale
            top = origin_y + entry["at"][1] * scale
            parts.append(
                f'<rect class="r" x="{left:.1f}" y="{top:.1f}" '
                f'width="{box_width:.1f}" height="{box_depth:.1f}"/>'
            )
            if box_width > 22 and box_depth > 14:
                parts.append(
                    f'<text class="n" x="{left + 3:.0f}" y="{top + 10:.0f}">{identifier:02X}</text>'
                )
            for wall, target in doors.get(identifier, []):
                mutual = target in known and identifier in links[target]
                style = "d" if mutual else "o"
                run = min(7.0, max(2.0, (box_depth if wall in ("west", "east") else box_width) / 3))
                mid_x, mid_y = left + box_width / 2, top + box_depth / 2
                edge = {
                    "west": (left, mid_y - run, left, mid_y + run),
                    "east": (left + box_width, mid_y - run, left + box_width, mid_y + run),
                    "north": (mid_x - run, top, mid_x + run, top),
                    "south": (mid_x - run, top + box_depth, mid_x + run, top + box_depth),
                }[wall]
                parts.append(
                    f'<line class="{style}" x1="{edge[0]:.1f}" y1="{edge[1]:.1f}" '
                    f'x2="{edge[2]:.1f}" y2="{edge[3]:.1f}"/>'
                )
    parts.append("</svg>")
    counts = {
        "rooms": len(rooms),
        "groups": len(groups),
        "largestGroup": max(len(value) for value in groups.values()),
        "overlaps": overlaps,
    }
    return "\n".join(parts), counts


def export_room_plan_svg(dataset_root: Path, output: Path) -> dict[str, Any]:
    """Write the laid-out map beside the other restricted outputs."""
    verified = verify_dataset(dataset_root)
    destination = require_ignored_output(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    rooms = build_rooms(verified["documents"]["underground"])["rooms"]
    svg, counts = render_room_plan_svg(rooms)
    destination.write_text(svg, encoding="utf-8")
    return {"status": "exported", "output": str(destination), **counts}


def export_room_map_svg(dataset_root: Path, output: Path) -> dict[str, Any]:
    """Write the room map beside the other restricted outputs."""
    verified = verify_dataset(dataset_root)
    destination = require_ignored_output(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    rooms = build_rooms(verified["documents"]["underground"])["rooms"]
    svg, counts = render_room_map_svg(rooms)
    destination.write_text(svg, encoding="utf-8")
    return {"status": "exported", "output": str(destination), **counts}


def build_surface(surface: dict[str, Any]) -> dict[str, Any]:
    """Preserve each cell's complete point index space and edge topology."""
    structures = {structure["geometryIdentity"]: structure for structure in surface.get("structures", [])}
    cells: list[dict[str, Any]] = []
    for cell in surface["cells"]:
        expanded = cell.get("expanded")
        if not expanded:
            continue
        vertices: list[dict[str, Any]] = []
        for vertex in expanded["vertices"]:
            if vertex["kind"] == "world-point":
                vertices.append({"kind": "world-point", "position": list(vertex["position"])})
            elif vertex["kind"] == "rotated-input":
                vertices.append({"kind": "rotated-input", "rotationInput": list(vertex["rotationInput"])})
            else:
                raise LabError(f"Surface vertex has an unknown kind {vertex['kind']!r}")

        edges: list[list[int]] = []
        for edge in expanded["edges"]:
            start, end = edge["indices"]
            ink = INK_CODES.get(edge["operation"])
            _require(ink is not None, f"Surface edge has an unknown ink operation {edge['operation']!r}")
            edges.append([start, end, ink])

        structure = structures.get(cell.get("structure"))
        descriptor = structure.get("rotatedPointDescriptor", 0) if structure else 0
        rotation = None
        if descriptor:
            center = structure.get("rotationCenter")
            _require(isinstance(center, list) and len(center) == 2, "Rotated structure has no two-axis center")
            rotation = {"descriptor": descriptor, "center": list(center)}

        cells.append(
            {
                "cell": cell["cell"],
                "grid": list(cell["grid"]),
                "structure": cell.get("structure"),
                "vertices": vertices,
                "edges": edges,
                "rotation": rotation,
            }
        )
    return {"schemaVersion": PAYLOAD_SCHEMA_VERSION, "cells": cells}


def build_objects(objects: dict[str, Any]) -> dict[str, Any]:
    """Reduce models to vertex/edge lists and instances to placements."""
    models = [
        {
            "id": model["geometryIdentity"],
            "vertices": [list(vertex["normalized"]) for vertex in model["vertices"]],
            "edges": [[edge["start"], edge["end"]] for edge in model["edges"]],
        }
        for model in objects["models"]
    ]
    known = {model["id"] for model in models}

    instances: list[dict[str, Any]] = []
    for instance in objects["instances"]:
        _require(
            instance["model"] in known,
            f"Object instance {instance['geometryIdentity']} references unknown model {instance['model']}",
        )
        position = list(instance["positionSigned24"])
        instances.append(
            {
                "slot": instance["slot"],
                "id": instance["geometryIdentity"],
                "model": instance["model"],
                "position": position,
                "orientation": instance["orientationBytes"],
                "room": instance["roomMembership"],
                "stateFlags": instance["stateFlags"],
                "rotatable": instance["rotatable"],
                "placement": "surface" if instance["roomMembership"] == 0 else "room",
                # Beyond this cube per axis the Reference Build draws the object as
                # a single projected point instead of its wireframe.
                "visibility": instance["visibility"],
            }
        )
    return {"schemaVersion": PAYLOAD_SCHEMA_VERSION, "models": models, "instances": instances}


#: Documents decoded from a capture rather than from the geometry dataset. Each
#: reports its own counts, so they are prefixed to keep one document's totals
#: from colliding with another's as more of them arrive.
CAPTURE_DOCUMENTS = ("text.json", "benson.json", "interaction.json", "flight.json", "underground.json")


def capture_counts(documents: dict[str, Any]) -> dict[str, int]:
    """Prefix each capture-decoded document's counts with its own name."""
    return {
        f"{name.removesuffix('.json')}.{key}": value
        for name in CAPTURE_DOCUMENTS
        if name in documents
        for key, value in documents[name]["counts"].items()
    }


#: What the Reference Build's own underground adds up to, asserted on every export.
#:
#: ``oneWayRoomLinks`` is the number the issue put at 83. Our own image says 82
#: Room-to-Room links go unanswered, plus the single Doorway to the surface, for
#: which reciprocity is undefined because the surface is not a Room. Both readings
#: are defensible and the two are counted apart here so the number does not depend
#: on which one a reader has in mind. Fifty-seven of the 82 come from the one record
#: nineteen Rooms share, which is why this looks like a decode fault and is not one.
ROOM_LINK_CONTRACT = {
    "doorways": 481,
    "lockedDoorways": 53,
    "darkRooms": 20,
    "roomLinks": 478,
    "oneWayRoomLinks": 82,
    "surfaceDoorways": 1,
    "unresolvedArrivals": 1,
}


def _room_link_counts(rooms: list[dict[str, Any]]) -> dict[str, int]:
    """What the exported Doorways add up to, recorded in the payload manifest.

    ``oneWayRoomLinks`` counts distinct Room-to-Room links whose destination does
    not link back. The one Doorway that leads to the surface is counted on its own
    instead: reciprocity is a relation between two Rooms, and the surface is not a
    Room, so folding it in would make the number depend on a definition rather than
    on the data.
    """
    targets: dict[int, set[int]] = {}
    surface = 0
    for room in rooms:
        for door in room["doorways"]:
            if "room" in door["destination"]:
                targets.setdefault(room["room"], set()).add(door["destination"]["room"])
            else:
                surface += 1
    links = {(source, target) for source, group in targets.items() for target in group}
    return {
        "doorways": sum(len(room["doorways"]) for room in rooms),
        "lockedDoorways": sum(1 for room in rooms for door in room["doorways"] if door["lock"]),
        "darkRooms": sum(1 for room in rooms if room["dark"]),
        "roomLinks": len(links),
        "oneWayRoomLinks": sum(1 for source, target in links if source not in targets.get(target, ())),
        "surfaceDoorways": surface,
        "unresolvedArrivals": sum(
            1 for room in rooms for door in room["doorways"] if not door["arrivalWithinDestination"]
        ),
    }


def export_payload(dataset: Path, output: Path, run: Path | None = None) -> dict[str, Any]:
    """Write the Data Payload for one verified World Geometry Dataset.

    ``run`` names an interactive capture to decode text from. Geometry travels
    through the dataset, but the text tables are read straight from a capture's
    memory, so they need the original run.
    """
    resolved = require_ignored_output(output)
    verified = verify_dataset(dataset)
    manifest = verified["manifest"]
    require_current_geometry_decoder(manifest)
    surface = load_json(dataset / "surface.json")
    objects = load_json(dataset / "objects.json")
    underground = load_json(dataset / "underground.json")

    documents = {
        "world.json": build_world(surface),
        "surface.json": build_surface(surface),
        "objects.json": build_objects(objects),
        "rooms.json": build_rooms(underground),
    }
    if run is not None:
        ram, _ = load_geometry_source(run)
        documents["text.json"] = decode_text(ram)
        documents["benson.json"] = decode_benson(ram)
        documents["interaction.json"] = decode_interaction(ram)
        documents["flight.json"] = decode_flight(ram)
        documents["underground.json"] = decode_underground(ram)
    resolved.mkdir(parents=True, exist_ok=True)
    files: list[dict[str, Any]] = []
    for name, document in documents.items():
        path = resolved / name
        path.write_text(json.dumps(document, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
        files.append({"path": name, "sha256": file_hash(path), "size": path.stat().st_size})

    links = _room_link_counts(documents["rooms.json"]["rooms"])
    _require(
        links == ROOM_LINK_CONTRACT,
        f"Exported Doorways differ from the evidence contract: {links!r}",
    )
    surface_document = documents["surface.json"]
    counts = {
        "cells": len(surface_document["cells"]),
        "surfaceVertices": sum(len(cell["vertices"]) for cell in surface_document["cells"]),
        "surfaceEdges": sum(len(cell["edges"]) for cell in surface_document["cells"]),
        "deferredSurfaceEdges": 0,
        "rotatedStructures": sum(cell["rotation"] is not None for cell in surface_document["cells"]),
        "roadTableSegments": sum(len(cell["segments"]) for cell in documents["world.json"]["roadCells"]),
        "models": len(documents["objects.json"]["models"]),
        "instances": len(documents["objects.json"]["instances"]),
        "rooms": len(documents["rooms.json"]["rooms"]),
        "roomEdges": sum(len(room["edges"]) for room in documents["rooms.json"]["rooms"]),
        **links,
        **capture_counts(documents),
    }
    payload_manifest = {
        "schemaVersion": PAYLOAD_SCHEMA_VERSION,
        "sourceDatasetId": manifest["datasetId"],
        "sourceCoreDigest": manifest["coreDigest"],
        "decoderVersion": manifest["decoderVersion"],
        "counts": counts,
        "files": sorted(files, key=lambda item: item["path"]),
    }
    (resolved / "manifest.json").write_text(
        json.dumps(payload_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return {"status": "exported", "payload": str(output), "counts": counts}
