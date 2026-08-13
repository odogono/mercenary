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


def _require_ignored_output(path: Path) -> Path:
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


def export_payload(dataset: Path, output: Path, run: Path | None = None) -> dict[str, Any]:
    """Write the Data Payload for one verified World Geometry Dataset.

    ``run`` names an interactive capture to decode text from. Geometry travels
    through the dataset, but the text tables are read straight from a capture's
    memory, so they need the original run.
    """
    resolved = _require_ignored_output(output)
    verified = verify_dataset(dataset)
    manifest = verified["manifest"]
    require_current_geometry_decoder(manifest)
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
        "deferredSurfaceEdges": 0,
        "rotatedStructures": sum(cell["rotation"] is not None for cell in surface_document["cells"]),
        "roadTableSegments": sum(len(cell["segments"]) for cell in documents["world.json"]["roadCells"]),
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
