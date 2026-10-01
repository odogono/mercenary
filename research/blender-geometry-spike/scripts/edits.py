"""Real Blender edits on the adopted assets, with ordinary operators (#671).

    blender -b --factory-startup --python scripts/edits.py -- CASE CANDIDATE

CANDIDATE is `blend` (open assets/SLUG/asset.blend) or `glb` (import assets/SLUG/asset.glb with the
add-on). Each case selects elements by identity, then edits with the operators the UI binds:
G (transform.translate), X (mesh.delete), F (mesh.edge_face_add), material slot Assign, and the
add-on's Set Game Colour. It saves the edited .blend, then validates and writes the candidate's
export (.mgeo or .glb) when valid, or diagnostics.txt when a reader would refuse it.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402
from _boot import OUT, blender_io, bpy, contract, glb, mgeo  # noqa: E402

import bmesh  # noqa: E402


def open_asset(slug, candidate):
    assets = os.path.join(OUT, "assets", slug)
    if candidate == "blend":
        bpy.ops.wm.open_mainfile(filepath=os.path.join(assets, "asset.blend"))
        _boot.register()
    else:
        _boot.empty_scene()
        with open(os.path.join(assets, "asset.glb"), "rb") as handle:
            blender_io.import_asset(glb.decode(handle.read()), "sidecar.json")
    return blender_io.asset_collection()


def edit(part):
    """Enter Edit Mode on one part with nothing selected; returns its bmesh."""
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    obj = next(o for o in bpy.data.objects if o.get("mc_part") == part)
    obj.hide_set(False)
    for other in bpy.context.view_layer.objects:
        other.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="VERT")
    bpy.ops.mesh.select_all(action="DESELECT")
    return bmesh.from_edit_mesh(obj.data)


def select(bm, vertices=(), faces=(), lines=(), mode="VERT"):
    """Select elements by identity, in the select mode a person would use for them."""
    obj = bpy.context.object
    bpy.context.tool_settings.mesh_select_mode = (mode == "VERT", mode == "EDGE", mode == "FACE")
    bm = bmesh.from_edit_mesh(obj.data)
    vid = bm.verts.layers.int.get("mc_vid")
    fid = bm.faces.layers.int.get("mc_fid")
    lid = bm.edges.layers.int.get("mc_lid")
    # Deselecting a face or edge deselects its vertices too, so only ever select here.
    for element in [*bm.verts, *bm.edges, *bm.faces]:
        element.select_set(False)
    for f in bm.faces:
        if f[fid] - 1 in faces:
            f.select_set(True)
    for e in bm.edges:
        if e[lid] - 1 in lines:
            e.select_set(True)
    for v in bm.verts:
        if v[vid] - 1 in vertices:
            v.select_set(True)
    bm.select_mode = {mode}
    if mode == "VERT":
        bm.select_flush(True)
    bmesh.update_edit_mesh(obj.data)


def game_offset(dx=0, dy=0, dz=0):
    """A translation in game axes, as Blender's G takes it (game Y is Blender Z)."""
    return (dx, dz, dy)


def material_slot(colour_hex):
    obj = bpy.context.object
    for k, material in enumerate(obj.data.materials):
        if material.name.startswith(colour_hex):
            return k
    raise KeyError(colour_hex)


# ── Cases ────────────────────────────────────────────────────────────────────────────────────


def coffin_edits():
    """Move a vertex, recolour the six-sided lid, remove a side face, add it back as a new face
    with the opposite winding, and add a line, colouring it with the add-on."""
    bm = edit("variant:record")
    select(bm, vertices={6})
    bpy.ops.transform.translate(value=game_offset(dy=10))
    select(bm, faces={0}, mode="FACE")
    bpy.context.object.active_material_index = material_slot("#664422")
    bpy.ops.object.material_slot_assign()
    select(bm, faces={5}, mode="FACE")
    bpy.ops.mesh.delete(type="FACE")
    bm = bmesh.from_edit_mesh(bpy.context.object.data)
    select(bm, vertices={3, 4, 9, 10})
    bpy.ops.mesh.edge_face_add()
    select(bm, vertices={0, 3})
    bpy.ops.mesh.edge_face_add()
    bpy.ops.mercenary.set_colour(source=0x0654, colour="#ccaa88")


def coffin_unmarked_edge():
    """Delete a face with Delete ▸ Only Faces, which leaves its one unshared edge behind as a
    wire edge. It is not a line until marked, and a reader must refuse it rather than guess."""
    bm = edit("variant:record")
    select(bm, faces={5}, mode="FACE")
    bpy.ops.mesh.delete(type="ONLY_FACE")


def coffin_uncoloured_line():
    """Add a line, mark it, and forget its colour: a reader must refuse it, naming the line."""
    bm = edit("variant:record")
    select(bm, vertices={0, 3})
    bpy.ops.mesh.edge_face_add()
    bpy.ops.mercenary.mark_lines()


def atropos_remove_line():
    """Remove the explicit line while keeping its coincident-but-distinct face vertices."""
    bm = edit("variant:record")
    select(bm, lines={0}, mode="EDGE")
    bpy.ops.mesh.delete(type="EDGE")


def ground_day_colour():
    """Recolour a day/night face to another day/night palette entry already in the asset."""
    bm = edit("variant:record")
    select(bm, faces={0}, mode="FACE")
    obj = bpy.context.object
    target = next(k for k, m in enumerate(obj.data.materials) if " day " in m.name)
    obj.active_material_index = target
    bpy.ops.object.material_slot_assign()


def spaceport_delete_referenced_face():
    """Delete a plan face that every region queue draws. The reader must refuse, naming each
    region queue entry that loses its face."""
    bm = edit("plan")
    select(bm, faces={0}, mode="FACE")
    bpy.ops.mesh.delete(type="FACE")


def spaceport_rebuild_referenced_face():
    """Delete the same plan face, rebuild it from its vertices (a new face, new identity), and
    give the new face the source record the region queues bind to: the binding is preserved."""
    bm = edit("plan")
    face = next(f for f in bm.faces if f[bm.faces.layers.int.get("mc_fid")] - 1 == 0)
    corner_ids = [v[bm.verts.layers.int.get("mc_vid")] - 1 for v in face.verts]
    record = face[bm.faces.layers.int.get("mc_record")]
    select(bm, faces={0}, mode="FACE")
    bpy.ops.mesh.delete(type="ONLY_FACE")
    bm = bmesh.from_edit_mesh(bpy.context.object.data)
    select(bm, vertices=set(corner_ids))
    bpy.ops.mesh.edge_face_add()
    bm = bmesh.from_edit_mesh(bpy.context.object.data)
    layer = bm.faces.layers.int.get("mc_record")
    for f in bm.faces:
        if f.select:
            f[layer] = record  # the Attribute panel's Set Attribute does the same by hand
    bmesh.update_edit_mesh(bpy.context.object.data)


def spaceport_move_exterior():
    """Move the exterior's entrance-side wall top: display changes, walking geometry and game
    bounds do not, and the diff says so."""
    bm = edit("variant:combined")
    select(bm, vertices={0, 1})
    bpy.ops.transform.translate(value=game_offset(dy=300))


def interior_delete_detail_record():
    """Delete one palette variant's face for a record the detail selection names. The record must
    stay drawable in every palette variant the binding structure may choose."""
    bm = edit("variant:palette-21")
    select(bm, faces={30}, mode="FACE")
    bpy.ops.mesh.delete(type="FACE")


def surface_move_rotated():
    """Drag a runtime-rotated vertex: refused, because its position is computed."""
    bm = edit("wireframe")
    select(bm, vertices={0})
    bpy.ops.transform.translate(value=game_offset(dx=256))


def surface_move_external():
    """Drag a Road Workspace endpoint: refused, because the road table places it."""
    bm = edit("wireframe")
    select(bm, vertices={62})
    bpy.ops.transform.translate(value=game_offset(dz=512))


def surface_move_structure():
    """Raise the structure's roof square and change one rotated input through its attribute."""
    bm = edit("wireframe")
    select(bm, vertices={10, 11, 12, 13})
    bpy.ops.transform.translate(value=game_offset(dy=512))
    layer = bm.verts.layers.float_vector.get("mc_input")
    bm = bmesh.from_edit_mesh(bpy.context.object.data)
    layer = bm.verts.layers.float_vector.get("mc_input")
    vid = bm.verts.layers.int.get("mc_vid")
    for v in bm.verts:
        if v[vid] - 1 == 1:
            v[layer] = (0, 14, 16)
    bmesh.update_edit_mesh(bpy.context.object.data)


def room_move_doorway_frame():
    """Move doorway 0's frame along the wall: the doorway metadata still names the old opening."""
    bm = edit("wireframe")
    select(bm, vertices={8, 9, 10, 11})
    bpy.ops.transform.translate(value=game_offset(dz=-400))


def object_add_remove_lines():
    """Remove one loose edge and add another between existing vertices."""
    bm = edit("wireframe")
    select(bm, lines={0}, mode="EDGE")
    bpy.ops.mesh.delete(type="EDGE")
    bm = bmesh.from_edit_mesh(bpy.context.object.data)
    select(bm, vertices={2, 16})
    bpy.ops.mesh.edge_face_add()
    bpy.ops.mercenary.mark_lines()


CASES = {
    "coffin-edits": ("damocles-object-03f774", coffin_edits),
    "coffin-uncoloured-line": ("damocles-object-03f774", coffin_uncoloured_line),
    "coffin-unmarked-edge": ("damocles-object-03f774", coffin_unmarked_edge),
    "atropos-remove-line": ("damocles-atropos-ground-02064a-00", atropos_remove_line),
    "ground-day-colour": ("damocles-ground-021de0-06-54", ground_day_colour),
    "spaceport-delete-referenced-face": ("damocles-structure-01484e", spaceport_delete_referenced_face),
    "spaceport-rebuild-referenced-face": ("damocles-structure-01484e", spaceport_rebuild_referenced_face),
    "spaceport-move-combined": ("damocles-structure-01484e", spaceport_move_exterior),
    "interior-delete-detail-record": ("damocles-interior-0303d6", interior_delete_detail_record),
    "surface-move-rotated": ("targ-surface-cell-1", surface_move_rotated),
    "surface-move-external": ("targ-surface-cell-1", surface_move_external),
    "surface-move-structure": ("targ-surface-cell-1", surface_move_structure),
    "room-move-doorway-frame": ("targ-room-0", room_move_doorway_frame),
    "object-add-remove-lines": ("targ-object-model-1700", object_add_remove_lines),
}

if __name__ == "__main__":
    case, candidate = _boot.args()
    slug, run = CASES[case]
    collection = open_asset(slug, candidate)
    run()
    bpy.ops.object.mode_set(mode="OBJECT")
    work = os.path.join(OUT, "edits", case)
    os.makedirs(work, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(work, f"edited-{candidate}.blend"), compress=False)
    sidecar = _boot.read_json(os.path.join(OUT, "assets", slug, "sidecar.json"))
    asset, diagnostics = blender_io.validate(blender_io.asset_collection(), sidecar)
    _boot.write_text(os.path.join(work, f"diagnostics-{candidate}.txt"), "".join(f"{d}\n" for d in diagnostics) or "valid\n")
    target = os.path.join(work, "edited.mgeo" if candidate == "blend" else "edited.glb")
    if os.path.exists(target):
        os.remove(target)
    if not any(d.severity == "error" for d in diagnostics):
        _boot.write_bytes(target, mgeo.encode(asset) if candidate == "blend" else glb.encode(asset))
    print(f"{case} {candidate}: {'rejected' if any(d.severity == 'error' for d in diagnostics) else 'exported'}")
    for d in diagnostics[:6]:
        print("  ", d)
