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
from .benson import decode_benson
from .flight import decode_flight
from .interaction import decode_interaction
from .underground import decode_underground
from .text import decode_text


PAYLOAD_SCHEMA_VERSION = 4
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

    A room's ``portals`` are the commands whose linked byte names another room. The
    Reference Build packs a room link and a behaviour into that one byte and the
    dataset does not claim to know which is which, so both readings travel and the
    app decides — the uncertainty is carried rather than resolved here.
    """
    # A room names its record by identity rather than carrying it, and several
    # rooms share one record, so the commands are looked up rather than inlined.
    records = {record["geometryIdentity"]: record for record in underground.get("records", [])}
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
        portals = [
            {
                "linked": command["linkedRoomOrBehaviour"],
                "plane": command["plane"],
                "xMiddle": command["xMiddle"],
                "zMiddle": command["zMiddle"],
            }
            for command in records.get(room.get("record"), {}).get("commands", [])
        ]
        rooms.append(
            {
                "room": room["roomId"],
                "vertices": vertices,
                "edges": edges,
                "bounds": {"min": list(bounds["min"]), "max": list(bounds["max"])},
                "hasPortal": bool(room.get("hasPortal")),
                "portals": portals,
            }
        )
    _require(bool(rooms), "The underground dataset carries no rooms")
    return {"schemaVersion": PAYLOAD_SCHEMA_VERSION, "rooms": rooms}


def render_room_map_svg(rooms: list[dict[str, Any]]) -> tuple[str, dict[str, int]]:
    """A checking map: every room's plan, its doorways, and where its links go.

    Rooms have no shared coordinate space — the Reference Build draws one at a time
    from its own points — so there is no floor plan of the underground to draw. What
    there is instead is each room's own plan, laid out in a grid, with its links
    written on it, which is what makes a topology mistake visible.

    A link's target is drawn differently when the target does not link back. All of
    them land on real room ids and most reciprocate, which is the evidence that the
    byte really is a room link rather than the behaviour it might equally have been;
    the one-way ones are the cases worth looking at.
    """
    links = {room["room"]: [portal["linked"] for portal in room["portals"]] for room in rooms}
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
        f'<text x="{pad}" y="43" font-size="11">{total} links, {total - one_way} reciprocal, '
        f'{one_way} one-way &#183; a green doorway links both ways, an orange one does not</text>',
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
        for order, portal in enumerate(room["portals"]):
            target = portal["linked"]
            mutual = target in known and room["room"] in links[target]
            # The doorway's own position within the room, in middle bytes.
            x, y = place(portal["xMiddle"] << 8, portal["zMiddle"] << 8)
            parts.append(
                f'<rect class="{"d" if mutual else "o"}" x="{x - 2.5:.1f}" y="{y - 2.5:.1f}" width="5" height="5"/>'
            )
            parts.append(
                f'<text class="lk" x="{pad + (order % 4) * 30}" y="{tile - 16 - (order // 4) * 11}" '
                f'fill="{"#5ad18a" if mutual else "#e0913f"}">{target:02X}</text>'
            )
        parts.append("</g>")

    parts.append("</svg>")
    counts = {"rooms": len(rooms), "links": total, "oneWayLinks": one_way}
    return "\n".join(parts), counts


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
