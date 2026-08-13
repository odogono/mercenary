from __future__ import annotations

import hashlib
import html
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

from .core import LabError, verify_run_artifacts


DECODER_VERSION = 3
LAB_ROOT = Path(__file__).resolve().parents[1]
WORK_ROOT = LAB_ROOT / "work"
REPOSITORY_ROOT = LAB_ROOT.parents[1]
RESTRICTED_ROOT = REPOSITORY_ROOT / "restricted"
SCHEMA_ROOT = LAB_ROOT / "schemas"
GEOMETRY_FILES = ("provenance.json", "objects.json", "surface.json", "underground.json")
ATARI_ST_GROUND_HEX = "#008000"


def signed24(value: int) -> int:
    if not 0 <= value <= 0xFFFFFF:
        raise LabError(f"24-bit value is out of range: {value}")
    return value - 0x1000000 if value & 0x800000 else value


def signed8(value: int) -> int:
    if not 0 <= value <= 0xFF:
        raise LabError(f"8-bit value is out of range: {value}")
    return value - 0x100 if value & 0x80 else value


def decode_high_altitude_map(ram: bytes) -> dict[str, Any]:
    """Decode the fixed map used once the camera's Y high byte reaches $20."""
    address = 0x902A
    point_start = ram[address]
    point_count = 0x40 - point_start
    cursor = address + 1
    packed_points = list(ram[cursor : cursor + point_count])
    cursor += point_count
    line_end_index = ram[cursor]
    cursor += 1
    line_count = line_end_index - 2
    _need(ram, cursor + line_count * 2, "high-altitude surface map")
    points_by_index = {point_start + index: packed for index, packed in enumerate(packed_points)}
    segments = []
    for slot in range(line_count):
        start_index, end_index = ram[cursor], ram[cursor + 1]
        cursor += 2
        if start_index not in points_by_index or end_index not in points_by_index:
            raise LabError("High-altitude map line references an unknown packed point")
        start, end = points_by_index[start_index], points_by_index[end_index]
        segments.append(
            {
                "slot": slot,
                "startPacked": start,
                "endPacked": end,
                "startGrid": [start & 0x0F, start >> 4],
                "endGrid": [end & 0x0F, end >> 4],
            }
        )
    return {
        "runtimeSpan": [address, cursor - 1],
        "rawHex": ram[address:cursor].hex(),
        "pointStartIndex": point_start,
        "packedPoints": packed_points,
        "segments": segments,
    }


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def core_dataset_digest(documents: dict[str, Any]) -> str:
    normalized = json.loads(json.dumps(documents))
    normalized.get("provenance", {}).get("source", {}).pop("runId", None)
    return canonical_digest(normalized)


def encode_object_model(model: dict[str, Any]) -> bytes:
    vertices = model["vertices"]
    if not 1 <= len(vertices) <= 256:
        raise LabError("Object model vertex count is outside the byte encoding")
    encoded = bytearray([len(vertices) - 1])
    for vertex in vertices:
        normalized = vertex["normalized"]
        if len(normalized) != 3 or any(component % 16 for component in normalized):
            raise LabError("Object model normalized coordinates are not exact sixteenth-byte displacements")
        raw = [(component >> 4) & 0xFF for component in normalized]
        if any(not -0x80 <= component >> 4 <= 0x7F for component in normalized):
            raise LabError("Object model normalized coordinate cannot be represented by a signed byte")
        encoded.extend(raw)
    edges = model["edges"]
    if not 1 <= len(edges) <= 128:
        raise LabError("Object model edge count is outside the record encoding")
    wide = model["edgeEncoding"] == "wide"
    encoded.append((0x80 if wide else 0) | (len(edges) - 1))
    for edge in edges:
        start, end = edge["start"], edge["end"]
        if wide:
            if not 0 <= start <= 0xFF or not 0 <= end <= 0xFF:
                raise LabError("Wide object edge index does not fit in a byte")
            encoded.extend((start, end))
        else:
            if not 0 <= start <= 0x0F or not 0 <= end <= 0x0F:
                raise LabError("Packed object edge index does not fit in a nibble")
            encoded.append((start << 4) | end)
    return bytes(encoded)


def encode_surface_structure(structure: dict[str, Any]) -> bytes:
    points, lines = structure["points"], structure["lines"]
    encoded = bytearray(
        [len(points) - 1, len(lines) - 1, structure["whiteBlackSplitIndex"], structure["rotatedPointDescriptor"]]
    )
    if structure["rotatedPointDescriptor"]:
        encoded.extend(structure["rotationCenter"])
    full_width = False
    for line in lines:
        start, end = line["start"], line["end"]
        if not full_width and len(bytes.fromhex(line["rawHex"])) == 1:
            if not 0 <= start <= 0x0F or not 0 <= end <= 0x0F:
                raise LabError("Packed surface edge index does not fit in a nibble")
            encoded.append((start << 4) | end)
        else:
            if not 0 <= start <= 0xFF or not 0 <= end <= 0xFF:
                raise LabError("Full-width surface edge index does not fit in a byte")
            if not full_width:
                encoded.append(0)
                full_width = True
            encoded.extend((start, end))
    for point in points:
        if point["kind"] == "rotated":
            encoded.extend(point["rotationInput"])
            continue
        height = point["heightCode"]
        encoded.extend(
            (
                point["quantizedX"] | ((height >> 2) << 6),
                point["quantizedZ"] | ((height & 0x03) << 6),
            )
        )
        if height == 15:
            if point["extendedHeight"] is None:
                raise LabError("Escaped surface height is missing its extension byte")
            encoded.append(point["extendedHeight"])
    return bytes(encoded)


def encode_room_record(room: dict[str, Any]) -> bytes:
    encoded = bytearray(room["header"])
    for command in room["commands"]:
        encoded.extend((command["opcode"], command["linkedRoomOrBehaviour"], command["xMiddle"], command["zMiddle"]))
    encoded.append(room["terminator"])
    return bytes(encoded)


def _need(data: bytes, end: int, context: str) -> None:
    if end > len(data):
        raise LabError(f"Truncated {context}: need {end} bytes, have {len(data)}")


def decode_object_model(data: bytes, *, address: int) -> dict[str, Any]:
    _need(data, 1, f"object model at ${address:04X}")
    vertex_count = data[0] + 1
    position = 1
    _need(data, position + vertex_count * 3 + 1, f"object model at ${address:04X}")
    vertices: list[dict[str, Any]] = []
    for index in range(vertex_count):
        raw = data[position : position + 3]
        position += 3
        vertices.append(
            {
                "geometryIdentity": f"object-model:{address:04x}:vertex:{index:02x}",
                "raw": list(raw),
                "normalized": [signed8(component) << 4 for component in raw],
                "provenanceRefs": [f"span:{address + position - 3:04x}-{address + position - 1:04x}"],
            }
        )
    edge_header = data[position]
    position += 1
    edge_count = (edge_header & 0x7F) + 1
    wide = bool(edge_header & 0x80)
    edge_width = 2 if wide else 1
    _need(data, position + edge_count * edge_width, f"object model at ${address:04X}")
    edges: list[dict[str, Any]] = []
    for edge_index in range(edge_count):
        raw = data[position : position + edge_width]
        position += edge_width
        if wide:
            start, end = raw
        else:
            start, end = raw[0] >> 4, raw[0] & 0x0F
        if start >= vertex_count or end >= vertex_count:
            raise LabError(
                f"Object model at ${address:04X} edge index {start}->{end} exceeds vertex count {vertex_count}"
            )
        edges.append(
            {
                "geometryIdentity": f"object-model:{address:04x}:edge:{edge_index:02x}",
                "start": start,
                "end": end,
                "rawHex": raw.hex(),
                "provenanceRefs": [f"span:{address:04x}-{address + position - 1:04x}"],
            }
        )
    consumed = data[:position]
    result = {
        "geometryIdentity": f"object-model:{address:04x}",
        "runtimeAddress": address,
        "runtimeSpan": [address, address + position - 1],
        "rawHex": consumed.hex(),
        "vertexCount": vertex_count,
        "vertices": vertices,
        "edgeEncoding": "wide" if wide else "packed",
        "edgeCount": edge_count,
        "edges": edges,
        "reconstructedHex": "",
        "decoderVersion": DECODER_VERSION,
        "uncertainties": [],
    }
    result["reconstructedHex"] = encode_object_model(result).hex()
    return result


def decode_surface_structure(data: bytes, *, address: int) -> dict[str, Any]:
    _need(data, 4, f"surface structure at ${address:04X}")
    highest_point, highest_line, colour_split, rotated_descriptor = data[:4]
    point_count = highest_point + 1
    line_count = highest_line + 1
    position = 4
    rotation_center: list[int] | None = None
    if rotated_descriptor:
        _need(data, position + 2, f"surface rotation centre at ${address:04X}")
        rotation_center = [data[position], data[position + 1]]
        position += 2

    lines: list[dict[str, Any]] = []
    full_width = False
    for line_index in range(line_count):
        _need(data, position + 1, f"surface line at ${address:04X}")
        if full_width or data[position] == 0:
            marker_width = 0 if full_width else 1
            _need(data, position + marker_width + 2, f"wide surface line at ${address:04X}")
            raw = data[position : position + marker_width + 2]
            start, end = raw[marker_width], raw[marker_width + 1]
            position += marker_width + 2
            full_width = True
        else:
            raw = data[position : position + 1]
            start, end = raw[0] >> 4, raw[0] & 0x0F
            position += 1
        lines.append(
            {
                "geometryIdentity": f"surface-structure:{address:04x}:edge:{line_index:02x}",
                "start": start,
                "end": end,
                "rawHex": raw.hex(),
                "provenanceRefs": [f"span:{address:04x}-{address + position - 1:04x}"],
            }
        )

    rotated_count = (rotated_descriptor & 0x0F) + 1 if rotated_descriptor else 0
    points: list[dict[str, Any]] = []
    for index in range(point_count):
        width = 3 if index < rotated_count else 2
        _need(data, position + width, f"surface point at ${address:04X}")
        raw = data[position : position + width]
        position += width
        if index < rotated_count:
            points.append(
                {
                    "geometryIdentity": f"surface-structure:{address:04x}:point:{index:02x}",
                    "kind": "rotated",
                    "rawHex": raw.hex(),
                    "rotationInput": list(raw),
                    "rotated": True,
                    "provenanceRefs": [f"span:{address + position - width:04x}-{address + position - 1:04x}"],
                }
            )
            continue
        qx, qz = raw
        height_code = ((qx >> 6) << 2) | (qz >> 6)
        extended_height: int | None = None
        if height_code == 15:
            _need(data, position + 1, f"extended surface height at ${address:04X}")
            extended_height = data[position]
            position += 1
            raw += bytes([extended_height])
        points.append(
            {
                "geometryIdentity": f"surface-structure:{address:04x}:point:{index:02x}",
                "kind": "quantized",
                "rawHex": raw.hex(),
                "quantizedX": qx & 0x3F,
                "quantizedZ": qz & 0x3F,
                "heightCode": height_code,
                "extendedHeight": extended_height,
                "rotated": index < rotated_count,
                "provenanceRefs": [f"span:{address + position - len(raw):04x}-{address + position - 1:04x}"],
            }
        )
    consumed = data[:position]
    result = {
        "geometryIdentity": f"surface-structure:{address:04x}",
        "runtimeAddress": address,
        "runtimeSpan": [address, address + position - 1],
        "rawHex": consumed.hex(),
        "pointCount": point_count,
        "lineCount": line_count,
        "whiteBlackSplitIndex": colour_split,
        "rotatedPointDescriptor": rotated_descriptor,
        "rotationCenter": rotation_center,
        "lines": lines,
        "points": points,
        "externalPointIndices": sorted({index for line in lines for index in (line["start"], line["end"]) if index >= point_count}),
        "reconstructedHex": "",
        "decoderVersion": DECODER_VERSION,
        "uncertainties": (["rotated-descriptor-high-nibble"] if rotated_descriptor & 0xF0 else []),
    }
    result["reconstructedHex"] = encode_surface_structure(result).hex()
    return result


def decode_room_record(data: bytes, *, address: int) -> dict[str, Any]:
    _need(data, 6, f"underground room at ${address:04X}")
    header = list(data[:5])
    position = 5
    commands: list[dict[str, Any]] = []
    terminator: int | None = None
    while terminator is None:
        _need(data, position + 1, f"underground room command at ${address:04X}")
        opcode = data[position]
        if opcode in (0, 0x80):
            terminator = opcode
            position += 1
            break
        _need(data, position + 4, f"underground room command at ${address:04X}")
        raw = data[position : position + 4]
        position += 4
        commands.append(
            {
                "geometryIdentity": f"room-record:{address:04x}:command:{len(commands):02x}",
                "opcode": opcode,
                "primitiveIndex": opcode & 0x0F,
                "plane": "zy" if opcode & 0x80 else "xy",
                "linkedRoomOrBehaviour": raw[1],
                "xMiddle": raw[2],
                "zMiddle": raw[3],
                "rawHex": raw.hex(),
                "provenanceRefs": [f"span:{address:04x}-{address + position - 1:04x}"],
                "uncertainties": ["opcode-high-bits", "linked-room-or-behaviour"],
            }
        )
    consumed = data[:position]
    result = {
        "geometryIdentity": f"room-record:{address:04x}",
        "runtimeAddress": address,
        "runtimeSpan": [address, address + position - 1],
        "rawHex": consumed.hex(),
        "header": header,
        "commands": commands,
        "terminator": terminator,
        "reconstructedHex": "",
        "decoderVersion": DECODER_VERSION,
        "uncertainties": [],
    }
    result["reconstructedHex"] = encode_room_record(result).hex()
    return result


def decode_primitive_templates(ram: bytes) -> list[dict[str, Any]]:
    _need(ram, 0x933A, "underground primitive tables")
    templates: list[dict[str, Any]] = []
    # The lookup indexes all sixteen low-nibble values.  The disassembly labels
    # fifteen offset bytes, but index $F deliberately reads the contiguous
    # byte at $933A, matching the runtime's unbounded indexed load.
    for index in range(16):
        offset = ram[0x932B + index]
        position = 0x928A + offset
        vertices: list[list[int]] = []
        start = position
        while True:
            _need(ram, position + 1, f"underground primitive {index}")
            if ram[position] == 0xFF:
                position += 1
                break
            _need(ram, position + 2, f"underground primitive {index}")
            vertices.append([ram[position], ram[position + 1]])
            position += 2
        templates.append(
            {
                "geometryIdentity": f"room-primitive:{index:02x}",
                "primitiveIndex": index,
                "runtimeAddress": start,
                "runtimeSpan": [start, position - 1],
                "rawHex": ram[start:position].hex(),
                "vertices": vertices,
                "edges": [
                    {
                        "geometryIdentity": f"room-primitive:{index:02x}:edge:{edge:02x}",
                        "indices": [edge, edge + 1],
                        "provenanceRefs": [f"span:{start:04x}-{position - 1:04x}"],
                    }
                    for edge in range(max(0, len(vertices) - 1))
                ],
                "provenanceRefs": [f"span:{start:04x}-{position - 1:04x}"],
            }
        )
    return templates


def expand_room(room: dict[str, Any], templates: list[dict[str, Any]], *, expansion_identity: str | None = None) -> dict[str, Any]:
    prefix = expansion_identity or room["geometryIdentity"]
    x_extent = (room["header"][0] & 0x7F) << 8
    y_extent = (room["header"][1] & 0x07) << 8
    z_extent = (room["header"][2] & 0x7F) << 8
    boundary = [
        [x_extent, y_extent, z_extent],
        [x_extent, y_extent, 0],
        [0, y_extent, 0],
        [0, y_extent, z_extent],
        [x_extent, 0, z_extent],
        [x_extent, 0, 0],
        [0, 0, 0],
        [0, 0, z_extent],
    ]
    vertices = [
        {
            "geometryIdentity": f"{prefix}:vertex:{index:02x}",
            "position": point,
            "provenanceRefs": [room["geometryIdentity"]],
        }
        for index, point in enumerate(boundary)
    ]
    boundary_edges = [(0, 1), (1, 2), (2, 3), (3, 0), (0, 4), (1, 5), (2, 6), (3, 7), (4, 5), (5, 6), (6, 7), (7, 4)]
    edges = [
        {
            "geometryIdentity": f"{prefix}:edge:{index:02x}",
            "indices": list(pair),
            "provenanceRefs": [room["geometryIdentity"]],
        }
        for index, pair in enumerate(boundary_edges)
    ]
    by_index = {template["primitiveIndex"]: template for template in templates}
    for command_index, command in enumerate(room["commands"]):
        template = by_index[command["primitiveIndex"]]
        first = len(vertices)
        for local_index, (horizontal, vertical) in enumerate(template["vertices"]):
            if command["plane"] == "xy":
                position = [(command["xMiddle"] << 8) | horizontal, vertical, command["zMiddle"] << 8]
            else:
                position = [command["xMiddle"] << 8, vertical, (command["zMiddle"] << 8) | horizontal]
            vertices.append(
                {
                    "geometryIdentity": f"{prefix}:command:{command_index:02x}:vertex:{local_index:02x}",
                    "position": position,
                    "provenanceRefs": [command["geometryIdentity"], template["geometryIdentity"]],
                }
            )
        for local_index in range(max(0, len(template["vertices"]) - 1)):
            edges.append(
                {
                    "geometryIdentity": f"{prefix}:edge:{len(edges):02x}",
                    "indices": [first + local_index, first + local_index + 1],
                    "provenanceRefs": [command["geometryIdentity"], template["geometryIdentity"]],
                }
            )
    positions = [vertex["position"] for vertex in vertices]
    bounds = {
        "min": [min(point[axis] for point in positions) for axis in range(3)],
        "max": [max(point[axis] for point in positions) for axis in range(3)],
    }
    return {"vertices": vertices, "edges": edges, "bounds": bounds}


def validate_curation(curation: dict[str, Any], identities: Iterable[str]) -> None:
    if curation.get("schemaVersion") != 1 or not isinstance(curation.get("names"), list):
        raise LabError("Curated Name overlay must have schemaVersion 1 and a names array")
    known = set(identities)
    seen: set[str] = set()
    for entry in curation["names"]:
        identity = entry.get("geometryIdentity")
        if identity not in known:
            raise LabError(f"Curated Name references unknown Geometry Identity {identity!r}")
        if identity in seen:
            raise LabError(f"Curated Name repeats Geometry Identity {identity!r}")
        seen.add(identity)
        if entry.get("status") not in {"verified", "candidate"}:
            raise LabError(f"Curated Name {identity!r} has an invalid status")
        if entry.get("kind") not in {"vehicle", "object", "surface", "room"}:
            raise LabError(f"Curated Name {identity!r} has an invalid entity kind")
        evidence = entry.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise LabError(f"Curated Name {identity!r} requires evidence")
        if entry["status"] == "verified" and not any(item.get("authority") == "authoritative" for item in evidence):
            raise LabError(f"Verified Curated Name {identity!r} requires Authoritative Evidence")


def select_comparison_subjects(dataset: dict[str, Any]) -> dict[str, str]:
    surfaces = [cell for cell in dataset["surface"]["cells"] if cell.get("hasStructure") and cell.get("roadCount", 0) > 0]
    rooms = [room for room in dataset["underground"]["rooms"] if room.get("hasPortal") and room.get("edgeCount", 0) > 0]
    vehicles = [
        instance
        for instance in dataset["objects"]["instances"]
        if instance.get("rotatable")
        and instance.get("curatedName", {}).get("status") == "verified"
        and instance.get("curatedName", {}).get("kind") == "vehicle"
    ]
    orbitals = [instance for instance in dataset["objects"]["instances"] if instance["slot"] == 0x3F]
    if not surfaces:
        raise LabError("No surface cell satisfies the road-and-structure comparison rule")
    if not rooms:
        raise LabError("No underground room satisfies the portal comparison rule")
    if not vehicles:
        raise LabError("No rotatable vehicle has a verified Curated Name")
    if len(orbitals) != 1:
        raise LabError("Object slot $3F is missing or duplicated")
    surface = min(surfaces, key=lambda cell: cell["cell"])
    room = min(rooms, key=lambda item: item["roomId"])
    vehicle = min(vehicles, key=lambda instance: instance["slot"])
    orbital = orbitals[0]
    return {
        "surface": surface["geometryIdentity"],
        "underground": room["geometryIdentity"],
        "vehicle": vehicle["geometryIdentity"],
        "orbital": orbital["geometryIdentity"],
    }


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LabError(f"Could not read JSON from {path}: {error}") from error
    if not isinstance(value, dict):
        raise LabError(f"Expected a JSON object in {path}")
    return value


def load_geometry_source(run_directory: Path, *, expected_build_sha256: str | None = None) -> tuple[bytes, dict[str, Any]]:
    manifest = load_json(run_directory / "manifest.json")
    verify_run_artifacts(run_directory, manifest)
    checkpoint = manifest.get("checkpoint", {})
    if checkpoint.get("name") != "interactive" or checkpoint.get("address") != 0x8477:
        raise LabError("World Geometry Dataset extraction requires the conditioned interactive checkpoint at $8477")
    build_sha256 = manifest.get("build", {}).get("hashes", {}).get("sha256")
    if expected_build_sha256 is not None and build_sha256 != expected_build_sha256:
        raise LabError("Geometry capture Reference Build hash does not match the configured Reference Build")
    ram_artifacts = [artifact for artifact in manifest["artifacts"] if artifact.get("role") == "ram"]
    if len(ram_artifacts) != 1:
        raise LabError("Geometry capture must contain exactly one physical-RAM artifact")
    artifact = ram_artifacts[0]
    if artifact.get("size") != 65536:
        raise LabError("Geometry capture physical RAM must contain exactly 64 KiB")
    path = (run_directory.resolve() / artifact["path"]).resolve()
    if not path.is_relative_to(run_directory.resolve()):
        raise LabError("Geometry RAM artifact path must remain inside the run directory")
    ram = path.read_bytes()
    if ram[0x7F] != 0x3F:
        raise LabError("Geometry capture does not contain the initialized runtime state marker $007F=$3F")
    return ram, {
        "runId": manifest["runId"],
        "buildSha256": build_sha256,
        "ramSha256": artifact["sha256"],
        "toolchain": manifest["toolchain"],
        "machine": manifest["machine"],
        "checkpoint": checkpoint,
    }


def _bounds(points: list[list[int]]) -> dict[str, list[int]]:
    if not points:
        return {"min": [0, 0, 0], "max": [0, 0, 0]}
    return {
        "min": [min(point[axis] for point in points) for axis in range(3)],
        "max": [max(point[axis] for point in points) for axis in range(3)],
    }


def _read24(ram: bytes, low: int, middle: int, high: int, slot: int) -> tuple[int, list[int]]:
    raw = [ram[low + slot], ram[middle + slot], ram[high + slot]]
    value = raw[0] | raw[1] << 8 | raw[2] << 16
    return value, raw


def _surface_middle(code: int) -> int:
    if code == 0:
        return 0
    if code == 0x3F:
        return 0xFF
    return code + 0x60


def _surface_y(height_code: int, extended: int | None) -> tuple[int, int]:
    if height_code != 15 or extended is None:
        return 0, height_code
    if extended < 0x80:
        return 0, extended
    accumulator = height_code
    value = extended
    for _ in range(3):
        carry = bool(value & 0x80)
        value = (value << 1) & 0xFF
        accumulator = ((accumulator << 1) | int(carry)) & 0xFF
    return value, accumulator & 0x07


def _expand_surface_structure(structure: dict[str, Any], cell: int) -> dict[str, Any]:
    cell_x = cell & 0x0F
    cell_z = cell >> 4
    vertices: list[dict[str, Any]] = []
    for point in structure["points"]:
        if point["kind"] == "rotated":
            vertices.append(
                {
                    "geometryIdentity": f"surface-cell:{cell:02x}:{point['geometryIdentity'].split(':')[-1]}",
                    "kind": "rotated-input",
                    "rotationInput": point["rotationInput"],
                    "provenanceRefs": [point["geometryIdentity"]],
                }
            )
            continue
        x_middle = _surface_middle(point["quantizedX"])
        z_middle = _surface_middle(point["quantizedZ"])
        y_low, y_middle = _surface_y(point["heightCode"], point["extendedHeight"])
        vertices.append(
            {
                "geometryIdentity": f"surface-cell:{cell:02x}:{point['geometryIdentity'].split(':')[-1]}",
                "kind": "world-point",
                "position": [(cell_x << 16) | (x_middle << 8), y_low | (y_middle << 8), (cell_z << 16) | (z_middle << 8)],
                "provenanceRefs": [point["geometryIdentity"]],
            }
        )
    world_points = [vertex["position"] for vertex in vertices if vertex["kind"] == "world-point"]
    return {
        "vertices": vertices,
        "edges": [
            {
                "geometryIdentity": f"surface-cell:{cell:02x}:edge:{index:02x}",
                "indices": [edge["start"], edge["end"]],
                "operation": "white" if index <= structure["whiteBlackSplitIndex"] else "black",
                "provenanceRefs": [structure["geometryIdentity"]],
            }
            for index, edge in enumerate(structure["lines"])
        ],
        "bounds": _bounds(world_points),
        "rotatedPointDescriptor": structure["rotatedPointDescriptor"],
    }


def _span_entry(ram: bytes, start: int, end: int, role: str) -> dict[str, Any]:
    raw = ram[start : end + 1]
    return {
        "provenanceId": f"span:{start:04x}-{end:04x}",
        "role": role,
        "runtimeSpan": [start, end],
        "rawHex": raw.hex(),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def build_dataset(ram: bytes, source: dict[str, Any], curation: dict[str, Any] | None = None) -> dict[str, Any]:
    if len(ram) != 65536:
        raise LabError("World Geometry Dataset input must contain exactly 64 KiB")

    object_slots: dict[int, list[int]] = {}
    for slot in range(64):
        pointer = ram[0x2800 + slot] | ram[0x2840 + slot] << 8
        object_slots.setdefault(pointer, []).append(slot)
    models: list[dict[str, Any]] = []
    for pointer in sorted(object_slots):
        model = decode_object_model(ram[pointer:], address=pointer)
        model["pointerSlots"] = object_slots[pointer]
        model["localBounds"] = _bounds([vertex["normalized"] for vertex in model["vertices"]])
        model["provenanceRefs"] = [f"span:{model['runtimeSpan'][0]:04x}-{model['runtimeSpan'][1]:04x}"]
        models.append(model)
    models_by_pointer = {model["runtimeAddress"]: model for model in models}
    instances: list[dict[str, Any]] = []
    for slot in range(64):
        pointer = ram[0x2800 + slot] | ram[0x2840 + slot] << 8
        x_unsigned, x_raw = _read24(ram, 0x2880, 0x2480, 0x2540, slot)
        y_unsigned, y_raw = _read24(ram, 0x28C0, 0x24C0, 0x2580, slot)
        z_unsigned, z_raw = _read24(ram, 0x2900, 0x2500, 0x25C0, slot)
        position = [signed24(x_unsigned), signed24(y_unsigned), signed24(z_unsigned)]
        local = models_by_pointer[pointer]["localBounds"]
        orientation = [ram[0x800A + slot], ram[0x801A + slot], ram[0x802A + slot]] if slot < 16 else None
        instances.append(
            {
                "geometryIdentity": f"object-instance:{slot:02x}",
                "slot": slot,
                "model": f"object-model:{pointer:04x}",
                "modelPointer": pointer,
                "positionRaw": {"x": x_raw, "y": y_raw, "z": z_raw},
                "positionUnsigned24": [x_unsigned, y_unsigned, z_unsigned],
                "positionSigned24": position,
                "orientationBytes": orientation,
                "rotatable": slot < 16,
                "roomMembership": ram[0x2940 + slot],
                "stateFlags": ram[0x29C0 + slot],
                "unrotatedWorldBounds": {
                    "min": [position[axis] + local["min"][axis] for axis in range(3)],
                    "max": [position[axis] + local["max"][axis] for axis in range(3)],
                },
                "visibility": {"detailCubePerAxis": 0x010000, "farRepresentation": "point"},
                "provenanceRefs": ["span:2800-287f", "span:2480-29ff", "span:800a-8039"],
                "uncertainties": (["semantic-identity"] if slot == 0x3F else []),
            }
        )

    structure_slots: dict[int, list[int]] = {}
    for cell in range(256):
        pointer = ram[0x2600 + cell] | ram[0x2700 + cell] << 8
        structure_slots.setdefault(pointer, []).append(cell)
    structures: list[dict[str, Any]] = []
    for pointer in sorted(structure_slots):
        structure = decode_surface_structure(ram[pointer:], address=pointer)
        structure["pointerCells"] = structure_slots[pointer]
        structure["provenanceRefs"] = [f"span:{structure['runtimeSpan'][0]:04x}-{structure['runtimeSpan'][1]:04x}"]
        structures.append(structure)
    structures_by_pointer = {structure["runtimeAddress"]: structure for structure in structures}
    cells: list[dict[str, Any]] = []
    first_roads = second_roads = 0
    for cell in range(256):
        pointer = ram[0x2600 + cell] | ram[0x2700 + cell] << 8
        road_pairs = []
        for index, (start_base, end_base) in enumerate(((0x2C00, 0x2D00), (0x2E00, 0x2F00))):
            start, end = ram[start_base + cell], ram[end_base + cell]
            if start:
                if index == 0:
                    first_roads += 1
                else:
                    second_roads += 1
                road_pairs.append(
                    {
                        "segment": index,
                        "startPacked": start,
                        "endPacked": end,
                        "startGrid": [start & 0x0F, start >> 4],
                        "endGrid": [end & 0x0F, end >> 4],
                    }
                )
        structure = structures_by_pointer[pointer]
        cells.append(
            {
                "geometryIdentity": f"surface-cell:{cell:02x}",
                "cell": cell,
                "grid": [cell & 0x0F, cell >> 4],
                "structure": structure["geometryIdentity"],
                "structurePointer": pointer,
                "structureFlags": ram[0x2B00 + cell],
                "hasStructure": cell != 0,
                "roadCount": len(road_pairs),
                "roads": road_pairs,
                "expanded": _expand_surface_structure(structure, cell),
                "visibility": {"roadAltitudeLookupRef": "surface-road-altitude-lookup", "cellSelection": "high-position-nibbles"},
                "provenanceRefs": ["span:2600-27ff", "span:2a00-2fff"],
            }
        )

    room_slots: dict[int, list[int]] = {}
    for room_id in range(192):
        pointer = ram[0x2300 + room_id] | ram[0x23C0 + room_id] << 8
        room_slots.setdefault(pointer, []).append(room_id)
    templates = decode_primitive_templates(ram)
    room_records: list[dict[str, Any]] = []
    for pointer in sorted(room_slots):
        record = decode_room_record(ram[pointer:], address=pointer)
        record["pointerRoomIds"] = room_slots[pointer]
        record["provenanceRefs"] = [f"span:{record['runtimeSpan'][0]:04x}-{record['runtimeSpan'][1]:04x}"]
        room_records.append(record)
    for record in room_records:
        record["overlapsWith"] = [
            other["geometryIdentity"]
            for other in room_records
            if other is not record
            and record["runtimeSpan"][0] <= other["runtimeSpan"][1]
            and other["runtimeSpan"][0] <= record["runtimeSpan"][1]
        ]
    records_by_pointer = {record["runtimeAddress"]: record for record in room_records}
    rooms: list[dict[str, Any]] = []
    for room_id in range(192):
        pointer = ram[0x2300 + room_id] | ram[0x23C0 + room_id] << 8
        record = records_by_pointer[pointer]
        expanded = expand_room(record, templates, expansion_identity=f"room:{room_id:02x}")
        rooms.append(
            {
                "geometryIdentity": f"room:{room_id:02x}",
                "roomId": room_id,
                "record": record["geometryIdentity"],
                "recordPointer": pointer,
                "hasPortal": any(command["linkedRoomOrBehaviour"] != 0 for command in record["commands"]),
                "edgeCount": len(expanded["edges"]),
                "expanded": expanded,
                "provenanceRefs": ["span:2300-247f", record["geometryIdentity"]],
            }
        )

    high_altitude_map = decode_high_altitude_map(ram)
    high_altitude_map["provenanceRefs"] = [
        f"span:{high_altitude_map['runtimeSpan'][0]:04x}-{high_altitude_map['runtimeSpan'][1]:04x}"
    ]
    provenance_entries = [
        _span_entry(ram, model["runtimeSpan"][0], model["runtimeSpan"][1], "object-model") for model in models
    ] + [
        _span_entry(ram, structure["runtimeSpan"][0], structure["runtimeSpan"][1], "surface-structure")
        for structure in structures
    ] + [
        _span_entry(ram, record["runtimeSpan"][0], record["runtimeSpan"][1], "underground-room")
        for record in room_records
    ] + [
        _span_entry(ram, template["runtimeSpan"][0], template["runtimeSpan"][1], "underground-primitive")
        for template in templates
    ] + [
        _span_entry(ram, start, end, role)
        for start, end, role in (
            (0x2300, 0x247F, "underground-pointer-tables"),
            (0x2480, 0x29FF, "object-instance-tables"),
            (0x2600, 0x27FF, "surface-pointer-tables"),
            (0x2800, 0x287F, "object-pointer-tables"),
            (0x2A00, 0x2FFF, "surface-metadata-tables"),
            (0x800A, 0x8039, "object-orientation-tables"),
            (0x902A, high_altitude_map["runtimeSpan"][1], "surface-high-altitude-map"),
        )
    ]
    provenance_entries = list({entry["provenanceId"]: entry for entry in provenance_entries}.values())
    provenance = {
        "schemaVersion": 1,
        "decoderVersion": DECODER_VERSION,
        "source": source,
        "entries": provenance_entries,
        "bridge": "hashed Reference Build -> conditioned initialized physical RAM -> runtime pointers -> normalized records",
    }
    objects = {
        "schemaVersion": 1,
        "models": models,
        "instances": instances,
        "transformContract": {
            "localCoordinate": "(rawByte - $80) << 4",
            "position": "signed two's-complement 24-bit XYZ",
            "orientation": {"slots": [0, 15], "axisOrder": ["z", "x", "y"], "representation": "Reference Build angle bytes"},
            "cameraPipeline": ["camera-relative-translation", "object-local-orientation", "camera-matrix", "perspective", "clip", "ordered-line-draw"],
        },
    }
    surface = {
        "schemaVersion": 1,
        "structures": structures,
        "cells": cells,
        "roadAltitudeLookup": {"runtimeSpan": [0x2A00, 0x2AFF], "rawHex": ram[0x2A00:0x2B00].hex()},
        "highAltitudeMap": high_altitude_map,
        "counts": {"firstRoadSegments": first_roads, "secondRoadSegments": second_roads},
        "transformContract": {
            "cell": "((zHigh & $0F) << 4) | (xHigh & $0F)",
            "quantizedMiddleByte": {"0": 0, "1..62": "code + $60", "63": 255},
            "height": "four high bits with $0F extension",
            "cameraPipeline": ["world-point", "camera-relative-translation", "camera-matrix", "perspective", "clip", "ordered-line-draw"],
        },
    }
    underground = {
        "schemaVersion": 1,
        "primitiveTemplates": templates,
        "records": room_records,
        "rooms": rooms,
        "transformContract": {
            "positiveOpcodePlane": "xy",
            "negativeOpcodePlane": "zy",
            "placement": "command xMiddle/zMiddle plus primitive low-byte coordinates",
            "cameraPipeline": ["room-expansion", "camera-relative-translation", "camera-yaw", "perspective", "clip", "ordered-line-draw"],
        },
    }
    identities = {
        item["geometryIdentity"]
        for family in (models, instances, structures, templates, room_records, rooms)
        for item in family
    }
    curation_digest = None
    if curation is not None:
        validate_curation(curation, identities)
        curation_digest = canonical_digest(curation)
    documents = {"provenance": provenance, "objects": objects, "surface": surface, "underground": underground}
    counts = {
        "objectSlots": len(instances),
        "objectModels": len(models),
        "surfaceCells": len(cells),
        "surfaceStructures": len(structures),
        "firstRoadSegments": first_roads,
        "secondRoadSegments": second_roads,
        "roomIds": len(rooms),
        "roomRecords": len(room_records),
        "roomCommands": sum(len(record["commands"]) for record in room_records),
    }
    expected = {
        "objectSlots": 64,
        "objectModels": 55,
        "surfaceCells": 256,
        "surfaceStructures": 98,
        "firstRoadSegments": 135,
        "secondRoadSegments": 136,
        "roomIds": 192,
        "roomRecords": 174,
        "roomCommands": 427,
    }
    if counts != expected:
        raise LabError(f"World Geometry Dataset aggregate counts differ from the evidence contract: {counts!r}")
    return {"documents": documents, "counts": counts, "coreDigest": core_dataset_digest(documents), "curation": curation, "curationDigest": curation_digest}


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _require_restricted_output(path: Path) -> Path:
    resolved = path.resolve()
    if not (resolved.is_relative_to(WORK_ROOT.resolve()) or resolved.is_relative_to(RESTRICTED_ROOT.resolve())):
        raise LabError(f"Exact World Geometry Dataset output must remain under ignored work/ or restricted/: {path}")
    return resolved


def write_dataset(bundle: dict[str, Any], output: Path) -> dict[str, Any]:
    root = _require_restricted_output(output)
    if root.exists():
        raise LabError(f"World Geometry Dataset output already exists: {root}")
    root.mkdir(parents=True)
    file_entries = []
    for name, document in bundle["documents"].items():
        filename = f"{name}.json"
        path = root / filename
        _write_json(path, document)
        file_entries.append({"role": name, "path": filename, "size": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    if bundle["curation"] is not None:
        _write_json(root / "curation.json", bundle["curation"])
        path = root / "curation.json"
        file_entries.append({"role": "curation", "path": "curation.json", "size": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    manifest = {
        "schemaVersion": 1,
        "datasetId": f"world-geometry-{bundle['coreDigest'][:16]}",
        "decoderVersion": DECODER_VERSION,
        "coreDigest": bundle["coreDigest"],
        "curationDigest": bundle["curationDigest"],
        "counts": bundle["counts"],
        "files": file_entries,
        "publicationStatus": "restricted",
    }
    _write_json(root / "manifest.json", manifest)
    return manifest


def _validate_schema(document: dict[str, Any], schema_name: str) -> None:
    try:
        from jsonschema import Draft202012Validator
    except ImportError as error:
        raise LabError("Geometry schema validation requires jsonschema==4.26.0; create the documented laboratory virtual environment") from error
    schema = load_json(SCHEMA_ROOT / schema_name)
    errors = sorted(Draft202012Validator(schema).iter_errors(document), key=lambda item: list(item.path))
    if errors:
        raise LabError(f"{schema_name} validation failed: {errors[0].message}")


def validate_references(documents: dict[str, Any]) -> None:
    identities: set[str] = set()
    references: list[tuple[str, str]] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            identity = value.get("geometryIdentity")
            if isinstance(identity, str):
                if identity in identities:
                    raise LabError(f"World Geometry Dataset contains duplicate Geometry Identity {identity!r}")
                identities.add(identity)
            provenance_refs = value.get("provenanceRefs")
            if isinstance(provenance_refs, list):
                references.extend((identity or "anonymous", reference) for reference in provenance_refs)
            for nested in value.values():
                walk(nested)
        elif isinstance(value, list):
            for nested in value:
                walk(nested)

    walk({name: document for name, document in documents.items() if name != "provenance"})
    entries = documents["provenance"]["entries"]
    provenance_ids = {entry["provenanceId"] for entry in entries}
    spans = [tuple(entry["runtimeSpan"]) for entry in entries]
    for owner, reference in references:
        if reference in identities or reference in provenance_ids:
            continue
        if isinstance(reference, str) and reference.startswith("span:"):
            try:
                start_text, end_text = reference[5:].split("-", 1)
                start, end = int(start_text, 16), int(end_text, 16)
            except (ValueError, TypeError):
                pass
            else:
                if any(container_start <= start <= end <= container_end for container_start, container_end in spans):
                    continue
        raise LabError(f"Geometry Identity {owner!r} has unknown provenance reference {reference!r}")


def validate_source_overlaps(entries: list[dict[str, Any]]) -> None:
    seen: set[str] = set()
    for entry in entries:
        provenance_id = entry["provenanceId"]
        if provenance_id in seen:
            raise LabError(f"World Geometry Dataset repeats provenance entry {provenance_id!r}")
        seen.add(provenance_id)
        start, end = entry["runtimeSpan"]
        raw = bytes.fromhex(entry["rawHex"])
        if len(raw) != end - start + 1:
            raise LabError(f"Provenance span length mismatch: {provenance_id}")
    for index, first in enumerate(entries):
        first_start, first_end = first["runtimeSpan"]
        first_raw = bytes.fromhex(first["rawHex"])
        for second in entries[index + 1 :]:
            second_start, second_end = second["runtimeSpan"]
            overlap_start, overlap_end = max(first_start, second_start), min(first_end, second_end)
            if overlap_start > overlap_end:
                continue
            first_slice = first_raw[overlap_start - first_start : overlap_end - first_start + 1]
            second_raw = bytes.fromhex(second["rawHex"])
            second_slice = second_raw[overlap_start - second_start : overlap_end - second_start + 1]
            if first_slice != second_slice:
                raise LabError(f"Conflicting overlapping provenance spans: {first['provenanceId']} and {second['provenanceId']}")


def verify_dataset(root: Path) -> dict[str, Any]:
    root = _require_restricted_output(root)
    manifest = load_json(root / "manifest.json")
    _validate_schema(manifest, "geometry-manifest.schema.json")
    documents: dict[str, Any] = {}
    for entry in manifest["files"]:
        path = (root / entry["path"]).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise LabError(f"Geometry dataset artifact is missing or escaped its directory: {entry['path']}")
        data = path.read_bytes()
        if len(data) != entry["size"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise LabError(f"Geometry dataset artifact hash mismatch: {entry['path']}")
        if entry["role"] in {"provenance", "objects", "surface", "underground"}:
            document = json.loads(data)
            _validate_schema(document, f"geometry-{entry['role']}.schema.json")
            documents[entry["role"]] = document
    if set(documents) != {"provenance", "objects", "surface", "underground"}:
        raise LabError("Geometry dataset is missing one or more core documents")
    validate_references(documents)
    validate_source_overlaps(documents["provenance"]["entries"])
    if core_dataset_digest(documents) != manifest["coreDigest"]:
        raise LabError("Geometry dataset core digest mismatch")
    for model in documents["objects"]["models"]:
        if model["rawHex"] != encode_object_model(model).hex() or model["reconstructedHex"] != encode_object_model(model).hex():
            raise LabError(f"Object model inverse reconstruction mismatch: {model['geometryIdentity']}")
    for structure in documents["surface"]["structures"]:
        if structure["rawHex"] != encode_surface_structure(structure).hex() or structure["reconstructedHex"] != encode_surface_structure(structure).hex():
            raise LabError(f"Surface structure inverse reconstruction mismatch: {structure['geometryIdentity']}")
    for room in documents["underground"]["records"]:
        if room["rawHex"] != encode_room_record(room).hex() or room["reconstructedHex"] != encode_room_record(room).hex():
            raise LabError(f"Underground room inverse reconstruction mismatch: {room['geometryIdentity']}")
    return {"manifest": manifest, "documents": documents}


def extract_geometry(run_directory: Path, *, curation_path: Path | None = None, output: Path | None = None) -> dict[str, Any]:
    from .laboratory import load_configuration

    reference, _ = load_configuration()
    expected = reference["hashes"]["sha256"]
    ram, source = load_geometry_source(run_directory, expected_build_sha256=expected)
    curation = load_json(curation_path) if curation_path is not None else None
    bundle = build_dataset(ram, source, curation)
    destination = output or (WORK_ROOT / f"geometry-{source['runId']}-{bundle['coreDigest'][:8]}")
    manifest = write_dataset(bundle, destination)
    verify_dataset(destination)
    return {"status": "extracted", "dataset": str(destination.resolve()), "manifest": manifest}


def reproduce_geometry(prg: Path, *, curation_path: Path | None = None) -> dict[str, Any]:
    from .laboratory import capture, load_configuration

    reference, _ = load_configuration()
    curation = load_json(curation_path) if curation_path is not None else None
    runs = [capture(prg, "interactive") for _ in range(2)]
    results = []
    for run_directory, _ in runs:
        ram, source = load_geometry_source(run_directory, expected_build_sha256=reference["hashes"]["sha256"])
        bundle = build_dataset(ram, source, curation)
        destination = WORK_ROOT / f"geometry-{source['runId']}-{bundle['coreDigest'][:8]}"
        manifest = write_dataset(bundle, destination)
        verify_dataset(destination)
        results.append({"run": run_directory.name, "dataset": destination.name, "manifest": manifest})
    if results[0]["manifest"]["coreDigest"] != results[1]["manifest"]["coreDigest"]:
        raise LabError("Independent initialized captures produced different World Geometry Dataset digests")
    summary = {
        "schemaVersion": 1,
        "status": "reproducible",
        "coreDigest": results[0]["manifest"]["coreDigest"],
        "curationDigest": results[0]["manifest"]["curationDigest"],
        "runs": results,
    }
    _write_json(WORK_ROOT / "latest-geometry-reproduction.json", summary)
    return summary


def _apply_curation(documents: dict[str, Any], curation: dict[str, Any] | None) -> None:
    if curation is None:
        return
    entries = {entry["geometryIdentity"]: entry for entry in curation["names"]}
    for family in ("models", "instances"):
        for item in documents["objects"][family]:
            if item["geometryIdentity"] in entries:
                item["curatedName"] = entries[item["geometryIdentity"]]
    for item in documents["surface"]["cells"]:
        if item["geometryIdentity"] in entries:
            item["curatedName"] = entries[item["geometryIdentity"]]
    for item in documents["underground"]["rooms"]:
        if item["geometryIdentity"] in entries:
            item["curatedName"] = entries[item["geometryIdentity"]]


def _comparison_geometry(documents: dict[str, Any], identity: str) -> dict[str, Any]:
    if identity.startswith("surface-cell:"):
        item = next(cell for cell in documents["surface"]["cells"] if cell["geometryIdentity"] == identity)
        return item["expanded"]
    if identity.startswith("room:"):
        item = next(room for room in documents["underground"]["rooms"] if room["geometryIdentity"] == identity)
        return item["expanded"]
    instance = next(item for item in documents["objects"]["instances"] if item["geometryIdentity"] == identity)
    model = next(item for item in documents["objects"]["models"] if item["geometryIdentity"] == instance["model"])
    return {
        "vertices": [
            {"geometryIdentity": vertex["geometryIdentity"], "position": vertex["normalized"]}
            for vertex in model["vertices"]
        ],
        "edges": [
            {"geometryIdentity": f"{model['geometryIdentity']}:edge:{index:02x}", "indices": [edge["start"], edge["end"]]}
            for index, edge in enumerate(model["edges"])
        ],
        "bounds": model["localBounds"],
        "instancePose": {"positionSigned24": instance["positionSigned24"], "orientationBytes": instance["orientationBytes"]},
    }


def _svg(geometry: dict[str, Any], title: str) -> str:
    points = [vertex.get("position") for vertex in geometry["vertices"]]
    valid = [point for point in points if isinstance(point, list) and len(point) == 3]
    if not valid:
        raise LabError(f"Comparison geometry {title} has no directly renderable points")
    axes = (0, 2) if any(point[2] != valid[0][2] for point in valid[1:]) else (0, 1)
    min_x, max_x = min(point[axes[0]] for point in valid), max(point[axes[0]] for point in valid)
    min_y, max_y = min(point[axes[1]] for point in valid), max(point[axes[1]] for point in valid)
    scale = min(520 / max(1, max_x - min_x), 320 / max(1, max_y - min_y))
    projected: list[tuple[float, float] | None] = []
    for point in points:
        if not isinstance(point, list) or len(point) != 3:
            projected.append(None)
        else:
            projected.append((40 + (point[axes[0]] - min_x) * scale, 360 - (point[axes[1]] - min_y) * scale))
    lines = []
    for edge in geometry["edges"]:
        start, end = edge["indices"]
        if start >= len(projected) or end >= len(projected) or projected[start] is None or projected[end] is None:
            continue
        x1, y1 = projected[start]
        x2, y2 = projected[end]
        operation = edge.get("operation", "white")
        colour = "#ffcc66" if operation == "black" else "#f5f5f5"
        lines.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" stroke="{colour}" stroke-width="1"/>')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">'
        '<rect width="600" height="400" fill="#111827"/>'
        f'<text x="20" y="24" fill="#d1d5db" font-family="monospace" font-size="14">{title}</text>'
        + "".join(lines)
        + "</svg>\n"
    )


def render_road_network_svg(
    surface: dict[str, Any], *, dataset_id: str, core_digest: str
) -> tuple[str, dict[str, int]]:
    """Render all unique undirected lines from the four road tables."""
    sources: dict[tuple[tuple[int, int], tuple[int, int]], list[tuple[int, int]]] = {}
    source_entries = 0
    for cell in sorted(surface["cells"], key=lambda item: item["cell"]):
        for road in sorted(cell.get("roads", []), key=lambda item: item["segment"]):
            source_entries += 1
            start, end = tuple(road["startGrid"]), tuple(road["endGrid"])
            key = (start, end) if start <= end else (end, start)
            sources.setdefault(key, []).append((cell["cell"], road["segment"]))

    metadata = html.escape(
        json.dumps(
            {
                "schemaVersion": 1,
                "datasetId": dataset_id,
                "coreDigest": core_digest,
                "sourceEntries": source_entries,
                "uniqueLines": len(sources),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
    )
    grid = []
    for coordinate in range(17):
        grid.append(
            f'<line x1="{coordinate}" y1="0" x2="{coordinate}" y2="16" '
            'stroke-width="0.5" vector-effect="non-scaling-stroke"/>'
        )
        grid.append(
            f'<line x1="0" y1="{coordinate}" x2="16" y2="{coordinate}" '
            'stroke-width="0.5" vector-effect="non-scaling-stroke"/>'
        )
    labels = []
    for coordinate in range(16):
        labels.append(f'<text x="{coordinate + 0.5}" y="-0.18">{coordinate:X}</text>')
        labels.append(f'<text x="-0.28" y="{coordinate + 0.56}">{coordinate:X}</text>')
    roads = []
    for (start, end), contributions in sorted(sources.items()):
        source_text = " ".join(f"{cell:02X}:{slot}" for cell, slot in sorted(contributions))
        roads.append(
            f'<line class="road" x1="{start[0] + 0.5}" y1="{start[1] + 0.5}" '
            f'x2="{end[0] + 0.5}" y2="{end[1] + 0.5}" data-sources="{source_text}" '
            'stroke-width="1" vector-effect="non-scaling-stroke"/>'
        )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="-1 -1 18 18" '
        f'data-dataset-id="{html.escape(dataset_id)}" data-core-digest="{html.escape(core_digest)}">'
        f'<metadata>{metadata}</metadata><rect x="-1" y="-1" width="18" height="18" fill="{ATARI_ST_GROUND_HEX}"/>'
        '<g class="grid" stroke="#000" stroke-opacity="0.16">'
        + "".join(grid)
        + '</g><g class="labels" fill="#000" fill-opacity="0.55" font-family="monospace" font-size="0.28" text-anchor="middle">'
        + "".join(labels)
        + '</g><g class="roads" stroke="#000">'
        + "".join(roads)
        + "</g></svg>\n"
    )
    return svg, {"sourceEntries": source_entries, "uniqueLines": len(sources)}


def export_road_network_svg(dataset_root: Path, output: Path) -> dict[str, Any]:
    verified = verify_dataset(dataset_root)
    destination = _require_restricted_output(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    manifest = verified["manifest"]
    svg, counts = render_road_network_svg(
        verified["documents"]["surface"], dataset_id=manifest["datasetId"], core_digest=manifest["coreDigest"]
    )
    destination.write_text(svg, encoding="utf-8")
    return {
        "status": "exported",
        "output": str(destination),
        "datasetId": manifest["datasetId"],
        "coreDigest": manifest["coreDigest"],
        **counts,
    }


def compare_geometry(prg: Path, dataset_root: Path) -> dict[str, Any]:
    from .laboratory import capture, load_configuration

    stored = verify_dataset(dataset_root)
    curation_path = dataset_root / "curation.json"
    curation = load_json(curation_path) if curation_path.is_file() else None
    if curation is None:
        raise LabError("Representative vehicle selection requires the optional restricted Curated Name overlay")
    _apply_curation(stored["documents"], curation)
    subjects = select_comparison_subjects(stored["documents"])

    reference, _ = load_configuration()
    run_directory, _ = capture(prg, "interactive")
    ram, source = load_geometry_source(run_directory, expected_build_sha256=reference["hashes"]["sha256"])
    fresh_bundle = build_dataset(ram, source, curation)
    fresh_documents = fresh_bundle["documents"]
    _apply_curation(fresh_documents, curation)
    if fresh_bundle["coreDigest"] != stored["manifest"]["coreDigest"]:
        raise LabError("Fresh Reference Build capture differs from the stored World Geometry Dataset")

    comparison_root = _require_restricted_output(dataset_root / "comparisons")
    comparison_root.mkdir(exist_ok=False)
    screenshot = run_directory / "interactive.png"
    if screenshot.is_file():
        shutil.copy2(screenshot, comparison_root / "reference-build.png")
    comparisons = []
    html_sections = []
    for role, identity in subjects.items():
        expected = _comparison_geometry(stored["documents"], identity)
        actual = _comparison_geometry(fresh_documents, identity)
        expected_digest, actual_digest = canonical_digest(expected), canonical_digest(actual)
        result = "pass" if expected_digest == actual_digest else "fail"
        if result != "pass":
            raise LabError(f"Reference Build geometry mismatch for {role}: {identity}")
        dataset_svg = f"{role}-dataset.svg"
        reference_svg = f"{role}-reference.svg"
        (comparison_root / dataset_svg).write_text(_svg(expected, f"Dataset — {role} — {identity}"), encoding="utf-8")
        (comparison_root / reference_svg).write_text(_svg(actual, f"Fresh initialized RAM — {role} — {identity}"), encoding="utf-8")
        comparisons.append(
            {
                "role": role,
                "geometryIdentity": identity,
                "setupMethod": "conditioned-initialized-runtime-capture",
                "datasetGeometryDigest": expected_digest,
                "referenceGeometryDigest": actual_digest,
                "automatedResult": result,
                "datasetRender": dataset_svg,
                "referenceRender": reference_svg,
            }
        )
        html_sections.append(f'<h2>{role}: {identity}</h2><div><img src="{dataset_svg}"><img src="{reference_svg}"></div>')
    manifest = {
        "schemaVersion": 1,
        "datasetId": stored["manifest"]["datasetId"],
        "coreDigest": stored["manifest"]["coreDigest"],
        "referenceRunId": source["runId"],
        "referenceRamSha256": source["ramSha256"],
        "comparisons": comparisons,
    }
    _write_json(comparison_root / "comparisons.json", manifest)
    (comparison_root / "index.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>World Geometry comparisons</title><style>body{background:#0b1020;color:#eee;font-family:sans-serif}img{max-width:48%;margin:1%}</style>'
        + "".join(html_sections),
        encoding="utf-8",
    )
    return {"status": "compared", "comparisons": str(comparison_root), "manifest": manifest}


def review_comparisons(comparison_root: Path, reviewer: str, decision: str) -> dict[str, Any]:
    root = _require_restricted_output(comparison_root)
    comparisons = load_json(root / "comparisons.json")
    if decision == "approved" and any(item["automatedResult"] != "pass" for item in comparisons["comparisons"]):
        raise LabError("A maintainer cannot approve comparisons with failed automated geometry checks")
    review = {
        "schemaVersion": 1,
        "datasetId": comparisons["datasetId"],
        "coreDigest": comparisons["coreDigest"],
        "reviewer": reviewer,
        "reviewedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "decision": decision,
        "scenarios": [{"role": item["role"], "geometryIdentity": item["geometryIdentity"], "decision": decision} for item in comparisons["comparisons"]],
    }
    _write_json(root / "review.json", review)
    return {"status": "reviewed", "review": str(root / "review.json"), "decision": decision}


def validate_redacted_summary(summary: dict[str, Any]) -> None:
    allowed = {
        "schemaVersion",
        "qualification",
        "decoderVersion",
        "datasetId",
        "coreDigest",
        "curationDigest",
        "counts",
        "reproduction",
        "comparisons",
        "review",
        "restrictedEvidence",
    }
    unexpected = set(summary) - allowed
    if unexpected:
        raise LabError(f"Redacted geometry baseline contains fields that are not allowlisted: {sorted(unexpected)!r}")
    forbidden = {"rawHex", "position", "preferredName", "runtimeAddress", "runtimeSpan", "referenceRamSha256"}

    def scan(value: Any) -> None:
        if isinstance(value, dict):
            blocked = forbidden & set(value)
            if blocked:
                raise LabError(f"Redacted geometry baseline contains payload fields that are not allowlisted: {sorted(blocked)!r}")
            for nested in value.values():
                scan(nested)
        elif isinstance(value, list):
            for nested in value:
                scan(nested)

    scan(summary)


def summarize_geometry(dataset_root: Path, comparison_root: Path, review_path: Path, output: Path) -> dict[str, Any]:
    dataset = verify_dataset(dataset_root)["manifest"]
    comparisons = load_json(comparison_root / "comparisons.json")
    review = load_json(review_path)
    if dataset["coreDigest"] != comparisons["coreDigest"] or dataset["coreDigest"] != review["coreDigest"]:
        raise LabError("Geometry baseline inputs refer to different datasets")
    if review.get("decision") != "approved" or len(review.get("scenarios", [])) != 4:
        raise LabError("Redacted geometry baseline requires approval of all four comparisons")
    summary = {
        "schemaVersion": 1,
        "qualification": "Exact supplied Reference Build; potentially crack-affected identities remain provisional.",
        "decoderVersion": dataset["decoderVersion"],
        "datasetId": dataset["datasetId"],
        "coreDigest": dataset["coreDigest"],
        "curationDigest": dataset["curationDigest"],
        "counts": dataset["counts"],
        "reproduction": {"coldStarts": 2, "result": "equal"},
        "comparisons": [{"role": item["role"], "result": item["automatedResult"]} for item in comparisons["comparisons"]],
        "review": {"reviewer": review["reviewer"], "reviewedAt": review["reviewedAt"], "decision": review["decision"]},
        "restrictedEvidence": {"dataset": dataset["datasetId"], "comparisonBundle": "local-restricted"},
    }
    validate_redacted_summary(summary)
    _write_json(output, summary)
    return {"status": "summarized", "output": str(output), "summary": summary}
