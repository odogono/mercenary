"""What ordinary Blender glTF import/export keeps of the contract, without the add-on (#671).

    blender -b --factory-startup --python scripts/standard_gltf.py -- SLUG...

Two paths per fixture, each measured against the recovered contract by position, since the
standard path carries no identities to measure by:

    S1  the canonical GLB → stock import → stock export → our reader
    S2  the add-on's .blend scene → stock export → stock import

Writes out/standard/SLUG.json and prints one Markdown row per fixture and path.
"""

import collections
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402
from _boot import OUT, bpy, contract, glb  # noqa: E402

EXPORT = dict(
    export_format="GLB",
    export_extras=True,
    export_attributes=True,
    use_mesh_edges=True,
    use_mesh_vertices=True,
    export_yup=True,
    export_apply=False,
    use_visible=False,
)


def game(co):
    # Stock import applies the canonical root's Z mirror and its own Y-up swap; undo both.
    return (round(co[0]), round(co[2]), round(co[1]))


def cyclic(loop):
    """Order-sensitive, start-insensitive key for a polygon given by positions."""
    k = min(range(len(loop)), key=lambda i: loop[i])
    return tuple(loop[k:] + loop[:k])


def measure(asset, meshes):
    """Compare stock-imported meshes (by part name) with the contract, by position."""
    out = collections.Counter()
    for part in asset["parts"]:
        mesh_obj = meshes.get(part["id"])
        co = {v["id"]: tuple(v["co"]) for v in part["vertices"]}
        out["contract faces"] += len(part["faces"])
        out["contract lines"] += len(part["lines"])
        out["contract vertices"] += len(part["vertices"])
        coincident = sum(c - 1 for c in collections.Counter(co.values()).values() if c > 1)
        out["contract coincident extra vertices"] += coincident
        if mesh_obj is None:
            out["parts missing"] += 1
            continue
        obj, world = mesh_obj
        mesh = obj.data
        positions = [game(world @ v.co) for v in mesh.vertices]
        out["imported vertices"] += len(mesh.vertices)
        out["imported coincident extra vertices"] += sum(c - 1 for c in collections.Counter(positions).values() if c > 1)
        polygons = collections.Counter(cyclic([positions[i] for i in p.vertices]) for p in mesh.polygons)
        out["imported polygons"] += len(mesh.polygons)
        out["imported triangles"] += sum(1 for p in mesh.polygons if len(p.vertices) == 3)
        for f in part["faces"]:
            loop = [co[i] for i in f["loop"]]
            if polygons[cyclic(loop)] > 0:
                polygons[cyclic(loop)] -= 1
                out["faces kept as polygons, same winding"] += 1
            elif polygons[cyclic(loop[::-1])] > 0:
                polygons[cyclic(loop[::-1])] -= 1
                out["faces kept as polygons, reversed"] += 1
        edges = {frozenset((positions[e.vertices[0]], positions[e.vertices[1]])): e.is_loose for e in mesh.edges}
        for l in part["lines"]:
            ends = [co.get(e) for e in l["ends"]]
            if None in ends:
                ends = [co.get(e) or tuple(next(x["display"] for x in part["externals"] if x["id"] == e) or (0, 0, 0)) for e in l["ends"]]
            key = frozenset(ends)
            if key in edges:
                out["lines present as an edge"] += 1
                if edges[key]:
                    out["lines distinguishable (loose edge)"] += 1
        names = {a.name for a in mesh.attributes}
        out["identity attributes kept"] += int(any(n.lstrip("_").startswith("mc_vid") or n.upper().startswith("_MC") for n in names))
        keyed = [m for m in mesh.materials if m is not None and m.get("mc_key")]
        out["materials with game colour (extras)"] += len(keyed)
        out["imported materials"] += len([m for m in mesh.materials if m is not None])
    return out


def mesh_objects():
    return {o.name.split(".")[0]: (o, o.matrix_world) for o in bpy.data.objects if o.type == "MESH"}


def stock_import(path):
    _boot.empty_scene()
    bpy.ops.import_scene.gltf(filepath=path)
    # glTF import names objects by node name; the canonical GLB names nodes by part identity.
    return mesh_objects()


def try_decode(path):
    with open(path, "rb") as handle:
        data = handle.read()
    try:
        glb.decode(data)
        return "accepted"
    except contract.Rejected as rejected:
        return rejected.diagnostics[0].message.split(":")[0]


def run(slug):
    assets = os.path.join(OUT, "assets", slug)
    work = os.path.join(OUT, "standard", slug)
    os.makedirs(work, exist_ok=True)
    asset = _boot.read_json(os.path.join(assets, "recovered.contract.json"))
    result = {}
    # S1
    s1 = measure(asset, stock_import(os.path.join(assets, "asset.glb")))
    s1_out = os.path.join(work, "s1-stock-export.glb")
    bpy.ops.export_scene.gltf(filepath=s1_out, **EXPORT)
    result["S1"] = dict(s1, **{"our reader on the stock export": try_decode(s1_out)})
    # S2
    bpy.ops.wm.open_mainfile(filepath=os.path.join(assets, "asset.blend"))
    for obj in bpy.data.objects:
        obj.hide_set(False)
    s2_out = os.path.join(work, "s2-stock-export.glb")
    bpy.ops.export_scene.gltf(filepath=s2_out, **EXPORT)
    with open(s2_out, "rb") as handle:
        document, _ = glb.parse(handle.read())
    exported_attributes = sorted({k for m in document["meshes"] for p in m["primitives"] for k in p["attributes"] if k.startswith("_")})
    s2 = measure(asset, stock_import(s2_out))
    result["S2"] = dict(s2, **{"custom attributes exported": ", ".join(exported_attributes) or "none", "our reader on the stock export": try_decode(s2_out)})
    with open(os.path.join(OUT, "standard", f"{slug}.json"), "w", encoding="utf-8") as handle:
        handle.write(contract.canonical_json(result))
    return result


results = {slug: run(slug) for slug in _boot.args()}
lines = [
    "# Standard Blender glTF import/export",
    "",
    f"{bpy.app.version_string}, stock `io_scene_gltf2`, no add-on involved. Measured by position against the recovered contract.",
    "",
    "- **S1**: the canonical GLB → stock import → stock export.",
    "- **S2**: the add-on's `.blend` scene → stock export → stock import.",
    "",
    "| Fixture | Path | Polygons kept / source faces | Imported triangles | Vertices source → imported | Lines kept as loose edges | Identity attributes | Game colours in material extras | Our reader on the stock export |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
]
for slug, result in results.items():
    for path, r in result.items():
        lines.append(
            f"| {slug} | {path} | {r.get('faces kept as polygons, same winding', 0)} / {r['contract faces']} | {r.get('imported triangles', 0)} | "
            f"{r['contract vertices']} → {r.get('imported vertices', 0)} | {r.get('lines distinguishable (loose edge)', 0)} / {r['contract lines']} | "
            f"{'kept' if r.get('identity attributes kept') else 'lost'} | {r.get('materials with game colour (extras)', 0)} of {r.get('imported materials', 0)} | {r['our reader on the stock export']} |"
        )
with open(os.path.join(OUT, "standard-report.md"), "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines) + "\n")
print("\n".join(lines))
