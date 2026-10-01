"""MGEO v1: the minimal deterministic game binary the `.blend` candidate exports (#671).

It keeps source polygons as loops, not triangles, and every identity the contract carries, so a
reader can rebuild the contract exactly. Little-endian throughout; tables are in first-use order,
which is deterministic because export order is. No timestamps, no padding that could vary.

    "MGEO" u16 version u16 0  sha256[32] (sidecar)
    strings:  u32 n, n × (u32 length, utf-8)
    u32 asset-string  u8 title (0 targ, 1 damocles)
    colours:  u32 n, n × (u8 kind; ink: u32 ink | palette: u32 source, u32 rgb, u8 has-day, u32 day-rgb)
    scenes:   u32 n, n × (u16 count, count × u32 slot)
    parts:    u32 n, n × part
    part:     u32 id-string  u8 role  u8 colour-model
              u32 n vertices × (u32 id, i32 x y z, u8 kind; rotated: i32 input x y z)
              u32 n externals × (u32 id, u8 workspace, u32 slot, u8 has-display, i32 x y z)
              u32 n faces × (u32 id, u8 flags, u32 record, u32 colour, u32 scene, u32 n, n × u32 vertex-index)
              u32 n lines × (u32 id, u8 flags, u32 record, u32 colour, u32 scene, u32 a, u32 b)
    flags:    1 double-sided, 2 record, 4 scene slots, 8 closing repeat, 16 colour
    a line end below the vertex count is a vertex index; otherwise vertex-count + external index.
"""

from __future__ import annotations

import struct

from .contract import CONTRACT_FORMAT, CONTRACT_VERSION, Rejected, Diagnostic, colour_from_key, colour_key

MAGIC = b"MGEO"
VERSION = 1
ROLES = ["attachment", "detail", "display", "glyph", "plan", "walk", "wireframe"]
COLOUR_MODELS = ["ink", "none", "palette"]
TITLES = ["targ", "damocles"]
DOUBLE, RECORD, SCENE, CLOSING, COLOUR = 1, 2, 4, 8, 16


class _Table:
    def __init__(self):
        self.items = []
        self.index = {}

    def add(self, key):
        if key not in self.index:
            self.index[key] = len(self.items)
            self.items.append(key)
        return self.index[key]


def _rgb(hex_colour: str) -> int:
    return int(hex_colour[1:], 16)


def encode(asset) -> bytes:
    strings, colours, scenes = _Table(), _Table(), _Table()
    body = bytearray()
    w = body.extend

    def u8(v):
        w(struct.pack("<B", v))

    def u32(v):
        w(struct.pack("<I", v))

    def i32(v):
        w(struct.pack("<i", v))

    u32(strings.add(asset["asset"]))
    u8(TITLES.index(asset["title"]))
    parts = bytearray()
    for part in asset["parts"]:
        p = bytearray()
        pw = p.extend
        pw(struct.pack("<IBB", strings.add(part["id"]), ROLES.index(part["role"]), COLOUR_MODELS.index(part["colourModel"])))
        vertex_index = {v["id"]: i for i, v in enumerate(part["vertices"])}
        point_index = dict(vertex_index)
        for k, x in enumerate(part["externals"]):
            point_index[x["id"]] = len(part["vertices"]) + k
        pw(struct.pack("<I", len(part["vertices"])))
        for v in part["vertices"]:
            runtime = v.get("runtime")
            pw(struct.pack("<Iiii", v["id"], *v["co"]))
            pw(struct.pack("<B", 1 if runtime else 0))
            if runtime:
                pw(struct.pack("<iii", *runtime["input"]))
        pw(struct.pack("<I", len(part["externals"])))
        for x in part["externals"]:
            display = x["display"]
            pw(struct.pack("<IBIB", x["id"], 0, x["slot"], 0 if display is None else 1))
            pw(struct.pack("<iii", *(display or (0, 0, 0))))

        def primitive(item, extra_flags):
            flags = extra_flags
            record = item.get("record")
            scene = item.get("sceneSlots")
            colour = item.get("colour")
            if record is not None:
                flags |= RECORD
            if scene is not None:
                flags |= SCENE
            if colour is not None:
                flags |= COLOUR
            pw(
                struct.pack(
                    "<IBIII",
                    item["id"],
                    flags,
                    record if record is not None else 0,
                    colours.add(colour_key(colour)) if colour is not None else 0,
                    scenes.add(tuple(scene)) if scene is not None else 0,
                )
            )

        pw(struct.pack("<I", len(part["faces"])))
        for f in part["faces"]:
            primitive(f, (DOUBLE if f.get("doubleSided") else 0) | (CLOSING if f.get("closingRepeat") else 0))
            pw(struct.pack("<I", len(f["loop"])))
            pw(struct.pack(f"<{len(f['loop'])}I", *(vertex_index[i] for i in f["loop"])))
        pw(struct.pack("<I", len(part["lines"])))
        for l in part["lines"]:
            primitive(l, 0)
            pw(struct.pack("<II", point_index[l["ends"][0]], point_index[l["ends"][1]]))
        parts.extend(p)

    out = bytearray(MAGIC)
    out.extend(struct.pack("<HH", VERSION, 0))
    out.extend(bytes.fromhex(asset["sidecarSha256"]))
    out.extend(struct.pack("<I", len(strings.items)))
    for s in strings.items:
        data = s.encode("utf-8")
        out.extend(struct.pack("<I", len(data)))
        out.extend(data)
    out.extend(body)
    out.extend(struct.pack("<I", len(colours.items)))
    for key in colours.items:
        if key[0] == "ink":
            out.extend(struct.pack("<BI", 0, key[1]))
        else:
            out.extend(struct.pack("<BIIBI", 1, key[1], _rgb(key[2]), 1 if key[3] else 0, _rgb(key[3]) if key[3] else 0))
    out.extend(struct.pack("<I", len(scenes.items)))
    for slots in scenes.items:
        out.extend(struct.pack("<H", len(slots)))
        out.extend(struct.pack(f"<{len(slots)}I", *slots))
    out.extend(struct.pack("<I", len(asset["parts"])))
    out.extend(parts)
    return bytes(out)


class _Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.at = 0

    def take(self, fmt):
        size = struct.calcsize(fmt)
        if self.at + size > len(self.data):
            raise Rejected([Diagnostic("error", "mgeo", f"truncated at byte {self.at}")])
        values = struct.unpack_from(fmt, self.data, self.at)
        self.at += size
        return values


def decode(data: bytes):
    """Rebuild the contract document from MGEO bytes, refusing anything malformed."""
    r = _Reader(data)
    if data[:4] != MAGIC:
        raise Rejected([Diagnostic("error", "mgeo", "not an MGEO file")])
    r.at = 4
    version, _ = r.take("<HH")
    if version != VERSION:
        raise Rejected([Diagnostic("error", "mgeo", f"version {version}, expected {VERSION}")])
    sidecar = data[r.at : r.at + 32].hex()
    r.at += 32
    (n,) = r.take("<I")
    strings = []
    for _ in range(n):
        (length,) = r.take("<I")
        strings.append(data[r.at : r.at + length].decode("utf-8"))
        r.at += length
    asset_index, title = r.take("<IB")
    # The colour and scene tables follow the parts' strings but precede the parts.
    (n,) = r.take("<I")
    colours = []
    for _ in range(n):
        (kind,) = r.take("<B")
        if kind == 0:
            colours.append(colour_from_key(("ink", r.take("<I")[0])))
        else:
            source, rgb, has_day, day = r.take("<IIBI")
            colours.append(colour_from_key(("palette", source, f"#{rgb:06x}", f"#{day:06x}" if has_day else "")))
    (n,) = r.take("<I")
    scenes = []
    for _ in range(n):
        (count,) = r.take("<H")
        scenes.append(list(r.take(f"<{count}I")))
    (n,) = r.take("<I")
    parts = []
    for _ in range(n):
        sid, role, model = r.take("<IBB")
        (nv,) = r.take("<I")
        vertices = []
        for _ in range(nv):
            vid, x, y, z, kind = r.take("<IiiiB")
            v = {"co": [x, y, z], "id": vid}
            if kind == 1:
                v["runtime"] = {"input": list(r.take("<iii")), "kind": "rotated-input"}
            vertices.append(v)
        (nx,) = r.take("<I")
        externals = []
        for _ in range(nx):
            xid, _workspace, slot, has_display = r.take("<IBIB")
            display = list(r.take("<iii"))
            externals.append({"display": display if has_display else None, "id": xid, "slot": slot, "workspace": "road"})
        points = [v["id"] for v in vertices] + [x["id"] for x in externals]

        def primitive():
            pid, flags, record, colour, scene = r.take("<IBIII")
            item = {"id": pid}
            if flags & COLOUR:
                item["colour"] = colours[colour]
            if flags & RECORD:
                item["record"] = record
            if flags & SCENE:
                item["sceneSlots"] = scenes[scene]
            return item, flags

        (nf,) = r.take("<I")
        faces = []
        for _ in range(nf):
            face, flags = primitive()
            (count,) = r.take("<I")
            face["loop"] = [vertices[i]["id"] for i in r.take(f"<{count}I")]
            if flags & DOUBLE:
                face["doubleSided"] = True
            if flags & CLOSING:
                face["closingRepeat"] = True
            faces.append(face)
        (nl,) = r.take("<I")
        lines = []
        for _ in range(nl):
            line, _flags = primitive()
            a, b = r.take("<II")
            line["ends"] = [points[a], points[b]]
            lines.append(line)
        parts.append(
            {
                "colourModel": COLOUR_MODELS[model],
                "externals": externals,
                "faces": faces,
                "id": strings[sid],
                "lines": lines,
                "role": ROLES[role],
                "vertices": vertices,
            }
        )
    if r.at != len(data):
        raise Rejected([Diagnostic("error", "mgeo", f"{len(data) - r.at} trailing bytes")])
    return {
        "asset": strings[asset_index],
        "format": CONTRACT_FORMAT,
        "parts": parts,
        "sidecarSha256": sidecar,
        "title": TITLES[title],
        "version": CONTRACT_VERSION,
    }
