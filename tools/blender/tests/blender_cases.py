"""Headless Blender cases for web/test/blender-roundtrip.test.ts, against the `assets/targ/` of
the MERCENARY_ROOT checkout the test prepares:

    blender -b --factory-startup --python-exit-code 1 --python blender_cases.py -- CASE [PATH]

    unit                 the plain-Python tests, inside Blender's Python
    roundtrip            import and export every asset untouched; each must come back byte-identical
    edit PATH            move vertex 0 of the wireframe by +256 x, through the operators
    authored             create authored:probe and authored:probe-tower, draw a line in each
    distant-add PATH     draw a Distant Structure for a structure
    distant-remove PATH  delete a structure's Distant Structure
    transform PATH       move a part in Object Mode, export, reset it, export again

The last line printed is `RESULT <json>`.
"""

import json
import os
import sys
import unittest

import bpy

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))

import mercenary_geometry  # noqa: E402
from mercenary_geometry import addon, blender_io  # noqa: E402
from mercenary_geometry import targ_asset as T  # noqa: E402

mercenary_geometry.register()


def empty_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def activate(obj):
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = obj
    obj.hide_set(False)
    for other in bpy.context.view_layer.objects:
        other.select_set(other == obj)


def export(collection):
    """Through the operator, as an author would. Returns its result."""
    activate(collection.objects[0])
    return list(bpy.ops.mercenary.export_asset())


def draw_line(obj, a, b, ink=None):
    """Two new vertices joined by an edge, marked as a line (and inked) through the operators."""
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    import bmesh

    mesh = bmesh.from_edit_mesh(obj.data)
    # Game (x, y, z) is Blender (x, z, y).
    va, vb = mesh.verts.new((a[0], a[2], a[1])), mesh.verts.new((b[0], b[2], b[1]))
    edge = mesh.edges.new((va, vb))
    for element in (va, vb, edge):
        element.select = True
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mercenary.mark_lines()
    if ink is not None:
        bpy.ops.mercenary.set_colour(ink=ink)
    bpy.ops.object.mode_set(mode="OBJECT")


def every_asset():
    root = os.path.join(T.repository_root(), T.ASSETS)
    for kind in ("objects", "structures"):
        for name in sorted(os.listdir(os.path.join(root, kind))):
            if name.endswith(".json"):
                yield f"{kind}/{name}"


def case_unit(_):
    suite = unittest.defaultTestLoader.discover(HERE, pattern="test_*.py")
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=1).run(suite)
    return {"ok": result.wasSuccessful(), "ran": result.testsRun}


def case_roundtrip(_):
    checked, changed = 0, []
    for relative in every_asset():
        empty_scene()
        path = T.absolute_path(relative)
        with open(path, "rb") as handle:
            before = handle.read()
        collection = addon.open_asset(relative)
        try:
            blender_io.export(collection)
        except Exception as problem:  # noqa: BLE001 - reported per asset
            changed.append({"path": relative, "problem": str(problem)})
            continue
        with open(path, "rb") as handle:
            after = handle.read()
        if after != before:
            changed.append({"path": relative, "problem": "bytes differ"})
            with open(path, "wb") as handle:
                handle.write(before)
        checked += 1
    return {"changed": changed, "checked": checked}


def case_edit(relative):
    empty_scene()
    collection = addon.open_asset(relative)
    obj = collection.objects["wireframe"]
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    import bmesh

    mesh = bmesh.from_edit_mesh(obj.data)
    mesh.verts.ensure_lookup_table()
    vid = mesh.verts.layers.int["mc_vid"]
    vertex = next(v for v in mesh.verts if v[vid] == 1)
    vertex.co.x += 256
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")
    return {"result": export(collection)}


def case_authored(_):
    results = {}
    for kind, slug, ink in (("objects", "probe", None), ("structures", "probe-tower", 1)):
        empty_scene()
        bpy.ops.mercenary.new_authored(kind=kind, slug=slug)
        collection = blender_io.asset_collection(bpy.data.collections[f"MC authored:{slug}"])
        draw_line(collection.objects["wireframe"], (0, 0, 0), (0, 512, 0), ink)
        results[slug] = export(collection)
    return results


def case_distant_add(relative):
    empty_scene()
    collection = addon.open_asset(relative)
    distant = blender_io.distant_collection(collection)
    mesh = bpy.data.meshes.new("distant sketch")
    obj = bpy.data.objects.new("distant sketch", mesh)
    distant.objects.link(obj)
    draw_line(obj, (1024, 0, 1024), (1024, 2048, 1024), 1)
    return {"result": export(collection)}


def case_distant_remove(relative):
    empty_scene()
    collection = addon.open_asset(relative)
    for obj in list(blender_io.distant_collection(collection).objects):
        bpy.data.objects.remove(obj)
    return {"result": export(collection)}


def case_transform(relative):
    empty_scene()
    collection = addon.open_asset(relative)
    obj = collection.objects["wireframe"]
    shown = obj.matrix_world.to_scale()[0]
    obj.location.x += 1
    try:
        refused = export(collection)
    except RuntimeError as problem:  # background mode raises an operator's error report
        refused = ["CANCELLED"] if "Reset Display Transform" in str(problem) else [str(problem)]
    activate(obj)
    bpy.ops.mercenary.reset_display_transform()
    return {"refused": refused, "reset": export(collection), "scale": shown}


CASES = {
    "unit": case_unit,
    "roundtrip": case_roundtrip,
    "edit": case_edit,
    "authored": case_authored,
    "distant-add": case_distant_add,
    "distant-remove": case_distant_remove,
    "transform": case_transform,
}

arguments = sys.argv[sys.argv.index("--") + 1 :]
result = CASES[arguments[0]](arguments[1] if len(arguments) > 1 else None)
print("RESULT " + json.dumps(result))
