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
    RESTRICTED_ROOT,
    WORK_ROOT,
    load_geometry_source,
    load_json,
    verify_dataset,
)
from .text import decode_text


PAYLOAD_SCHEMA_VERSION = 2
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


def _require_ignored_output(path: Path) -> Path:
    resolved = path.resolve()
    allowed = (PAYLOAD_ROOT.resolve(), WORK_ROOT.resolve(), RESTRICTED_ROOT.resolve())
    _require(
        any(resolved == root or resolved.is_relative_to(root) for root in allowed),
        f"Data Payload output must remain under ignored payload/, work/, or restricted/ storage: {path}",
    )
    return resolved


def build_world(surface: dict[str, Any]) -> dict[str, Any]:
    """Collect grid metadata, world bounds, and the deduplicated road network."""
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

    roads = build_roads(surface)
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
        "roads": roads,
    }


def build_roads(surface: dict[str, Any]) -> list[dict[str, Any]]:
    """Split each road into one piece per cell it crosses.

    The dataset records a road as a single run between two cell centres, listed
    from both ends. Emitting that run verbatim draws a line straight across the
    world; the Reference Build limits how much road is visible by altitude, which
    only works if the run is divided into per-cell pieces that can be culled.
    """
    pieces: dict[tuple[int, ...], dict[str, Any]] = {}
    for cell in surface["cells"]:
        for road in cell.get("roads", []):
            start, end = tuple(road["startGrid"]), tuple(road["endGrid"])
            ordered = (start, end) if start <= end else (end, start)
            axis = 0 if ordered[0][1] == ordered[1][1] else 1
            _require(
                ordered[0][1 - axis] == ordered[1][1 - axis],
                "Road run is neither row-aligned nor column-aligned",
            )
            low_index, high_index = ordered[0][axis], ordered[1][axis]
            for step in range(low_index, high_index):
                a = [ordered[0][0], ordered[0][1]]
                b = [ordered[0][0], ordered[0][1]]
                a[axis], b[axis] = step, step + 1
                key = (*a, *b, road["segment"])
                pieces.setdefault(
                    key,
                    {"from": a, "to": b, "cell": list(a), "segment": road["segment"]},
                )
    return [pieces[key] for key in sorted(pieces)]


def build_surface(surface: dict[str, Any]) -> dict[str, Any]:
    """Flatten each cell into world-space line segments the renderer can draw.

    A minority of structure vertices are rotated at runtime and carry a rotation
    input rather than a position. Those vertices, and any edge touching one, are
    reported as deferred rather than guessed at.
    """
    cells: list[dict[str, Any]] = []
    for cell in surface["cells"]:
        expanded = cell.get("expanded")
        if not expanded:
            continue
        remapped: dict[int, int] = {}
        vertices: list[list[int]] = []
        deferred: list[dict[str, Any]] = []
        for index, vertex in enumerate(expanded["vertices"]):
            if vertex["kind"] == "world-point":
                remapped[index] = len(vertices)
                vertices.append(list(vertex["position"]))
            else:
                # Carried rather than discarded: the rotation input is what a
                # later pass needs to place these points.
                deferred.append({"vertex": index, "rotationInput": list(vertex["rotationInput"])})

        edges: list[list[int]] = []
        deferred_edges = 0
        for edge in expanded["edges"]:
            start, end = edge["indices"]
            if start in remapped and end in remapped:
                ink = INK_CODES.get(edge["operation"])
                _require(ink is not None, f"Surface edge has an unknown ink operation {edge['operation']!r}")
                edges.append([remapped[start], remapped[end], ink])
            else:
                deferred_edges += 1

        cells.append(
            {
                "cell": cell["cell"],
                "grid": list(cell["grid"]),
                "structure": cell.get("structure"),
                "vertices": vertices,
                "edges": edges,
                "deferredVertices": deferred,
                "deferredEdges": deferred_edges,
            }
        )
    structures = [
        {
            "id": structure["geometryIdentity"],
            "rotatedPointDescriptor": structure["rotatedPointDescriptor"],
            "rotationCenter": structure["rotationCenter"],
            "rotatedPointCount": (structure["rotatedPointDescriptor"] & 0x0F) + 1,
        }
        for structure in surface.get("structures", [])
        if structure.get("rotatedPointDescriptor")
    ]
    return {"schemaVersion": PAYLOAD_SCHEMA_VERSION, "cells": cells, "rotatedStructures": structures}


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


def export_payload(dataset: Path, output: Path, run: Path | None = None) -> dict[str, Any]:
    """Write the Data Payload for one verified World Geometry Dataset.

    ``run`` names an interactive capture to decode text from. Geometry travels
    through the dataset, but the text tables are read straight from a capture's
    memory, so they need the original run.
    """
    resolved = _require_ignored_output(output)
    verified = verify_dataset(dataset)
    manifest = verified["manifest"]
    surface = load_json(dataset / "surface.json")
    objects = load_json(dataset / "objects.json")

    documents = {
        "world.json": build_world(surface),
        "surface.json": build_surface(surface),
        "objects.json": build_objects(objects),
    }
    if run is not None:
        ram, _ = load_geometry_source(run)
        documents["text.json"] = decode_text(ram)
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
        "deferredSurfaceEdges": sum(cell["deferredEdges"] for cell in surface_document["cells"]),
        "rotatedStructures": len(surface_document["rotatedStructures"]),
        "roads": len(documents["world.json"]["roads"]),
        "models": len(documents["objects.json"]["models"]),
        "instances": len(documents["objects.json"]["instances"]),
        **(
            {f"text.{key}": value for key, value in documents["text.json"]["counts"].items()}
            if "text.json" in documents
            else {}
        ),
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
