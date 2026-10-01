"""The GLB candidate (#671): a standard glTF 2.0 binary that any viewer draws, carrying the
contract's polygon loops, lines, identities and colours in a `MERCENARY_geometry` extension.

Standard content is derived display: one shared POSITION accessor per part holding the part's
vertices then its external endpoints, triangles per colour and sidedness, lines per colour, and
a points primitive for vertices nothing else names. The extension is the source of truth; a
reader that finds it missing refuses the file rather than guessing polygons from triangles.

Coordinates are the payload's integer game units, stored as float32 (exact below 2^24). The root
node mirrors Z so standard viewers show the model with the handedness the catalogue viewer uses;
the extension's data is never mirrored.
"""

from __future__ import annotations

import json
import struct

from .contract import CONTRACT_FORMAT, CONTRACT_VERSION, Diagnostic, Rejected, colour_from_key, colour_key
from .triangulate import triangulate

EXTENSION = "MERCENARY_geometry"
EXACT_LIMIT = 1 << 24
FLOAT, UINT = 5126, 5125
DOUBLE, RECORD, SCENE, CLOSING, COLOUR = 1, 2, 4, 8, 16


def _linear(channel: int) -> float:
    c = channel / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _base_colour(colour):
    if colour is None:
        return [0.6, 0.6, 0.6, 1.0]
    if colour["kind"] == "ink":
        return [1.0, 1.0, 1.0, 1.0] if colour["ink"] == 0 else [0.05, 0.05, 0.05, 1.0]
    h = colour["colour"]
    return [round(_linear(int(h[k : k + 2], 16)), 6) for k in (1, 3, 5)] + [1.0]


class _Buffer:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def accessor(self, kind, component, values, count, target=None, bounds=False):
        while len(self.data) % 4:
            self.data.append(0)
        fmt = "f" if component == FLOAT else "I"
        packed = struct.pack(f"<{len(values)}{fmt}", *values)
        view = {"buffer": 0, "byteLength": len(packed), "byteOffset": len(self.data)}
        if target is not None:
            view["target"] = target
        self.views.append(view)
        self.data.extend(packed)
        accessor = {"bufferView": len(self.views) - 1, "componentType": component, "count": count, "type": kind}
        if bounds:
            accessor["min"] = [min(values[k::3]) for k in range(3)]
            accessor["max"] = [max(values[k::3]) for k in range(3)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def scalars(self, values):
        return self.accessor("SCALAR", UINT, list(values), len(values)) if values else None


def encode(asset) -> bytes:
    buffer = _Buffer()
    colours, scenes, materials = {}, {}, {}
    colour_list, scene_list, material_list = [], [], []

    def colour_index(colour):
        key = colour_key(colour)
        if key not in colours:
            colours[key] = len(colour_list)
            colour_list.append(colour_from_key(key))
        return colours[key]

    def scene_index(slots):
        key = tuple(slots)
        if key not in scenes:
            scenes[key] = len(scene_list)
            scene_list.append(list(slots))
        return scenes[key]

    def material(colour, double_sided):
        key = (colour_key(colour), double_sided)
        if key not in materials:
            name = "none" if colour is None else (f"ink {colour['ink']}" if colour["kind"] == "ink" else f"{colour['colour']} ${colour['source']:04X}")
            materials[key] = len(material_list)
            material_list.append(
                {
                    "doubleSided": double_sided,
                    "name": name + (" double" if double_sided else ""),
                    "pbrMetallicRoughness": {"baseColorFactor": _base_colour(colour), "metallicFactor": 0, "roughnessFactor": 1},
                }
            )
        return materials[key]

    meshes, nodes = [], []
    for part in asset["parts"]:
        vertices = part["vertices"]
        externals = part["externals"]
        index = {v["id"]: k for k, v in enumerate(vertices)}
        for k, x in enumerate(externals):
            index[x["id"]] = len(vertices) + k
        coords = []
        for v in vertices:
            coords.extend(v["co"])
        for x in externals:
            coords.extend(x["display"] or (0, 0, 0))
        if any(abs(c) >= EXACT_LIMIT for c in coords):
            raise Rejected([Diagnostic("error", part["id"], "a coordinate is beyond float32's exact integers")])
        position = buffer.accessor("VEC3", FLOAT, [float(c) for c in coords], len(coords) // 3, 34962, bounds=True) if coords else None
        points = [tuple(v["co"]) for v in vertices]
        groups, line_groups = {}, {}
        for f in part["faces"]:
            groups.setdefault((colour_key(f.get("colour")), bool(f.get("doubleSided"))), (f.get("colour"), [])) [1].extend(
                triangulate(points, [index[i] for i in f["loop"]])
            )
        for l in part["lines"]:
            if any(x["display"] is None for x in externals if x["id"] in l["ends"]):
                continue
            line_groups.setdefault(colour_key(l.get("colour")), (l.get("colour"), []))[1].extend(index[e] for e in l["ends"])
        primitives = []
        for (key, double_sided), (colour, triangles) in groups.items():
            if triangles:
                primitives.append({"attributes": {"POSITION": position}, "indices": buffer.accessor("SCALAR", UINT, triangles, len(triangles), 34963), "material": material(colour, double_sided), "mode": 4})
        for key, (colour, ends) in line_groups.items():
            primitives.append({"attributes": {"POSITION": position}, "indices": buffer.accessor("SCALAR", UINT, ends, len(ends), 34963), "material": material(colour, False), "mode": 1})
        used = {index[i] for f in part["faces"] for i in f["loop"]} | {index[e] for l in part["lines"] for e in l["ends"]}
        loose = [k for k in range(len(vertices)) if k not in used]
        if loose or not primitives:
            if position is not None and (loose or vertices):
                primitives.append({"attributes": {"POSITION": position}, "indices": buffer.accessor("SCALAR", UINT, loose or list(range(len(vertices))), len(loose or vertices), 34963), "mode": 0})

        def flags(item, extra):
            value = extra
            for field, bit in (("record", RECORD), ("sceneSlots", SCENE), ("colour", COLOUR)):
                if item.get(field) is not None:
                    value |= bit
            return value

        faces = part["faces"]
        lines = part["lines"]
        extension = {
            "colourModel": part["colourModel"],
            "externals": [{"display": x["display"], "id": x["id"], "slot": x["slot"], "workspace": x["workspace"]} for x in externals],
            "faces": {
                "colours": buffer.scalars([colour_index(f["colour"]) if f.get("colour") else 0 for f in faces]),
                "count": len(faces),
                "flags": buffer.scalars([flags(f, (DOUBLE if f.get("doubleSided") else 0) | (CLOSING if f.get("closingRepeat") else 0)) for f in faces]),
                "ids": buffer.scalars([f["id"] for f in faces]),
                "loopLengths": buffer.scalars([len(f["loop"]) for f in faces]),
                "loopVertices": buffer.scalars([index[i] for f in faces for i in f["loop"]]),
                "records": buffer.scalars([f.get("record") or 0 for f in faces]),
                "scenes": buffer.scalars([scene_index(f["sceneSlots"]) if f.get("sceneSlots") is not None else 0 for f in faces]),
            },
            "lines": {
                "colours": buffer.scalars([colour_index(l["colour"]) if l.get("colour") else 0 for l in lines]),
                "count": len(lines),
                "ends": buffer.scalars([index[e] for l in lines for e in l["ends"]]),
                "flags": buffer.scalars([flags(l, 0) for l in lines]),
                "ids": buffer.scalars([l["id"] for l in lines]),
                "records": buffer.scalars([l.get("record") or 0 for l in lines]),
                "scenes": buffer.scalars([scene_index(l["sceneSlots"]) if l.get("sceneSlots") is not None else 0 for l in lines]),
            },
            "part": part["id"],
            "position": position,
            "role": part["role"],
            "runtime": [{"index": k, "input": v["runtime"]["input"], "kind": v["runtime"]["kind"]} for k, v in enumerate(vertices) if v.get("runtime")],
            "vertexCount": len(vertices),
            "vertexIds": buffer.scalars([v["id"] for v in vertices]),
        }
        meshes.append({"extensions": {EXTENSION: extension}, "name": part["id"], "primitives": primitives})
        nodes.append({"mesh": len(meshes) - 1, "name": part["id"]})
    root = {"children": list(range(1, len(nodes) + 1)), "name": asset["asset"], "scale": [1, 1, -1]}
    document = {
        "accessors": buffer.accessors,
        "asset": {"generator": "mercenary-geometry-spike", "version": "2.0"},
        "bufferViews": buffer.views,
        "buffers": [{"byteLength": len(buffer.data)}],
        "extensions": {
            EXTENSION: {
                "asset": asset["asset"],
                "colours": colour_list,
                "format": CONTRACT_FORMAT,
                "sceneSets": scene_list,
                "sidecarSha256": asset["sidecarSha256"],
                "title": asset["title"],
                "version": CONTRACT_VERSION,
            }
        },
        "extensionsUsed": [EXTENSION],
        "materials": material_list,
        "meshes": meshes,
        "nodes": [root] + nodes,
        "scene": 0,
        "scenes": [{"nodes": [0]}],
    }
    if not material_list:
        del document["materials"]
    text = json.dumps(document, sort_keys=True, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    while len(buffer.data) % 4:
        buffer.data.append(0)
    total = 12 + 8 + len(text) + 8 + len(buffer.data)
    return (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(text), b"JSON")
        + text
        + struct.pack("<I4s", len(buffer.data), b"BIN\x00")
        + bytes(buffer.data)
    )


def parse(data: bytes):
    """The glTF JSON and binary chunk of a GLB."""
    if len(data) < 20 or data[:4] != b"glTF":
        raise Rejected([Diagnostic("error", "glb", "not a GLB file")])
    _, version, total = struct.unpack_from("<4sII", data, 0)
    if version != 2 or total != len(data):
        raise Rejected([Diagnostic("error", "glb", "malformed GLB header")])
    length, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON":
        raise Rejected([Diagnostic("error", "glb", "first chunk is not JSON")])
    document = json.loads(data[20 : 20 + length])
    binary = b""
    at = 20 + length
    if at < len(data):
        blength, bkind = struct.unpack_from("<I4s", data, at)
        if bkind == b"BIN\x00":
            binary = data[at + 8 : at + 8 + blength]
    return document, binary


def decode(data: bytes):
    """Rebuild the contract from the extension; refuse a GLB that lost it."""
    document, binary = parse(data)
    root = (document.get("extensions") or {}).get(EXTENSION)
    if root is None:
        raise Rejected(
            [
                Diagnostic(
                    "error",
                    "glb",
                    f"no {EXTENSION} extension: polygon boundaries, identities and game colours were lost "
                    "(typically by a standard glTF export). Re-import the canonical GLB with the Mercenary add-on.",
                )
            ]
        )

    def read(index, component=UINT):
        if index is None:
            return []
        accessor = document["accessors"][index]
        view = document["bufferViews"][accessor["bufferView"]]
        width = {"SCALAR": 1, "VEC3": 3}[accessor["type"]]
        count = accessor["count"] * width
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return list(struct.unpack_from(f"<{count}{'f' if component == FLOAT else 'I'}", binary, start))

    parts = []
    for mesh in document["meshes"]:
        ext = (mesh.get("extensions") or {}).get(EXTENSION)
        if ext is None:
            raise Rejected([Diagnostic("error", mesh.get("name", "mesh"), f"mesh has no {EXTENSION} extension")])
        coords = read(ext["position"], FLOAT)
        if any(c != int(c) for c in coords):
            raise Rejected([Diagnostic("error", ext["part"], "POSITION holds a non-integer coordinate")])
        coords = [int(c) for c in coords]
        ids = read(ext["vertexIds"])
        vertices = [{"co": coords[3 * k : 3 * k + 3], "id": ids[k]} for k in range(ext["vertexCount"])]
        for item in ext["runtime"]:
            vertices[item["index"]]["runtime"] = {"input": item["input"], "kind": item["kind"]}
        externals = ext["externals"]
        points = [v["id"] for v in vertices] + [x["id"] for x in externals]

        def primitives(block, extra):
            count = block["count"]
            ids_, flags, records, colours, scenes = (read(block[k]) for k in ("ids", "flags", "records", "colours", "scenes"))
            out = []
            for k in range(count):
                item = {"id": ids_[k]}
                if flags[k] & COLOUR:
                    item["colour"] = dict(root["colours"][colours[k]])
                if flags[k] & RECORD:
                    item["record"] = records[k]
                if flags[k] & SCENE:
                    item["sceneSlots"] = list(root["sceneSets"][scenes[k]])
                extra(item, flags[k], k)
                out.append(item)
            return out

        lengths = read(ext["faces"]["loopLengths"])
        loop_vertices = read(ext["faces"]["loopVertices"])
        offsets = [sum(lengths[:k]) for k in range(len(lengths))]

        def face_extra(item, flags, k):
            item["loop"] = [vertices[i]["id"] for i in loop_vertices[offsets[k] : offsets[k] + lengths[k]]]
            if flags & DOUBLE:
                item["doubleSided"] = True
            if flags & CLOSING:
                item["closingRepeat"] = True

        ends = read(ext["lines"]["ends"])

        def line_extra(item, flags, k):
            item["ends"] = [points[ends[2 * k]], points[ends[2 * k + 1]]]

        parts.append(
            {
                "colourModel": ext["colourModel"],
                "externals": externals,
                "faces": primitives(ext["faces"], face_extra),
                "id": ext["part"],
                "lines": primitives(ext["lines"], line_extra),
                "role": ext["role"],
                "vertices": vertices,
            }
        )
    return {
        "asset": root["asset"],
        "format": root["format"],
        "parts": parts,
        "sidecarSha256": root["sidecarSha256"],
        "title": root["title"],
        "version": root["version"],
    }
