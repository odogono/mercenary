"""`assets/targ/` file ⇄ Blender scene.

One collection per asset; one mesh object per part; a structure's distant part sits in its
`Distant Structure` child collection. Polygons are Blender faces with their source
loop order, explicit lines are edges marked with a line identity (a line may lie on a face edge),
and every identity and attribute rides in a named mesh attribute that ordinary Blender editing
carries along. Identities are stored plus one, so the zero Blender gives new elements reads as
"new".

Axes: game (x, y, z) is shown as Blender (x, z, y) — Y up becomes Z up, with the same mirror the
catalogue viewer applies, so a model reads the same way round in both. The swap is its own
inverse. Mesh coordinates stay in game units, so what is exported is exactly what is edited. Every
part object instead carries its asset's display transform: scaled by DISPLAY_SCALE and centred on
the asset, so a model opens at a workable size near the origin rather than hundreds of thousands
of units away. A part must keep that transform; geometry is edited in Edit Mode.

Attributes (all INT unless noted):
    point  mc_vid      vertex or external identity + 1
           mc_kind     0 vertex, 1 rotated input, 2 external with display, 3 external without
           mc_input    FLOAT_VECTOR, a rotated input as the record holds it
           mc_display  FLOAT_VECTOR, the derived display position (game axes) of kinds 1–3
    face   mc_fid      face identity + 1;  mc_record  record + 1
           mc_double   BOOLEAN;  mc_close  BOOLEAN closing repeat;  mc_scene  scene-set + 1
           material_index → a material carrying the game colour
    edge   mc_lid      line identity + 1 (0: not an explicit line unless loose)
           mc_lstart   identity + 1 of the vertex the line starts at
           mc_lrecord  record + 1;  mc_lscene  scene-set + 1;  mc_lcolour  material slot + 1
"""

from __future__ import annotations

import json

import bpy
from mathutils import Matrix

from . import contract as C
from . import targ_asset as T

KIND_VERTEX, KIND_ROTATED, KIND_EXTERNAL, KIND_EXTERNAL_HIDDEN = 0, 1, 2, 3
POINT_INT = ["mc_vid", "mc_kind"]
POINT_VEC = ["mc_input", "mc_display"]
FACE_INT = ["mc_fid", "mc_record", "mc_scene"]
FACE_BOOL = ["mc_double", "mc_close"]
EDGE_INT = ["mc_lid", "mc_lstart", "mc_lrecord", "mc_lscene", "mc_lcolour"]
COORD_TOLERANCE = 1e-3
DISTANT = "distant"
DISTANT_COLLECTION = "Distant Structure"
# A Targ object (100–500 game units) opens about a Blender unit across; a Surface Cell (65,536)
# about 256.
DISPLAY_SCALE = 1 / 256


def swap(co):
    return (co[0], co[2], co[1])


def _linear(channel):
    c = channel / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rgba(hex_colour):
    return [_linear(int(hex_colour[k : k + 2], 16)) for k in (1, 3, 5)] + [1.0]


def material_for(colour):
    """The one material standing for a game colour, created on first use and shared thereafter."""
    key = json.dumps(list(C.colour_key(colour)))
    for material in bpy.data.materials:
        if material.get("mc_key") == key:
            return material
    if colour["kind"] == "ink":
        name, display = f"ink {colour['ink']}", ("#ffffff" if colour["ink"] == 0 else "#202020")
    else:
        name = f"{colour['colour']} ${colour['source']:04X}" + (f" day {colour['day']}" if colour.get("day") else "")
        display = colour["colour"]
    material = bpy.data.materials.new(name)
    material["mc_key"] = key
    material.diffuse_color = _rgba(display)
    tree = getattr(material, "node_tree", None)
    if tree is not None:
        for node in tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Base Color"].default_value = _rgba(display)
    return material


def colour_of(material):
    key = material.get("mc_key") if material is not None else None
    if key is None:
        return None
    return C.colour_from_key(tuple(json.loads(key)))


def import_asset(value, relative):
    """Build the collection for an `assets/targ/` file. Returns it. Never calls Mesh.validate,
    which would merge the coincident faces and drop the closing repeats the contract preserves.

    A structure's collection always holds a `Distant Structure` child collection: a mesh in it
    is the part the structure draws as a Distant Structure, and an empty one means it has none."""
    asset = value["asset"]
    C.require_valid(asset)
    collection = bpy.data.collections.new(f"MC {asset['asset']}")
    bpy.context.scene.collection.children.link(collection)
    collection["mc_asset"] = asset["asset"]
    collection["mc_title"] = asset["title"]
    collection["mc_path"] = relative
    collection["mc_parts"] = json.dumps([p["id"] for p in asset["parts"] if p["role"] != DISTANT])
    collection["mc_centre"], collection["mc_extent"] = _bounds(asset)
    distant = None
    if T.kind_of(relative) == "structures":
        distant = bpy.data.collections.new(DISTANT_COLLECTION)
        distant["mc_distant"] = True
        collection.children.link(distant)
    first_display = next((p["id"] for p in asset["parts"] if p["role"] in ("display", "wireframe")), None)
    for part in asset["parts"]:
        obj = _import_part(part, collection["mc_centre"])
        obj.matrix_world = display_matrix(collection)
        (distant if part["role"] == DISTANT else collection).objects.link(obj)
        if part["id"] != first_display:
            obj.hide_set(True)
    return collection


def _bounds(asset):
    """The middle of the asset's ground plan in whole game units, which the view centres on, and
    its largest extent. Only its own vertices count: a road endpoint may lie cells away."""
    points = [v["co"] for p in asset["parts"] for v in p["vertices"]]
    if not points:
        return [0, 0], 0
    low = [min(p[k] for p in points) for k in range(3)]
    high = [max(p[k] for p in points) for k in range(3)]
    return [round((low[k] + high[k]) / 2) for k in (0, 2)], max(h - l for h, l in zip(high, low))


def display_matrix(collection):
    """Game-unit mesh coordinates → the scaled, centred view of this asset."""
    x, z = collection.get("mc_centre", [0, 0])
    return Matrix.Scale(DISPLAY_SCALE, 4) @ Matrix.Translation((-x, -z, 0))


def has_display_transform(obj, collection):
    expected = display_matrix(collection)
    return all(abs(a - b) <= 1e-5 * max(1.0, abs(b)) for row_a, row_b in zip(obj.matrix_world, expected) for a, b in zip(row_a, row_b))


def _bake(obj, matrix):
    """Apply `matrix` to the mesh itself, in Edit Mode or out of it."""
    if obj.mode == "EDIT":
        import bmesh

        mesh = bmesh.from_edit_mesh(obj.data)
        mesh.transform(matrix)
        bmesh.update_edit_mesh(obj.data)
    else:
        obj.data.transform(matrix)


def prepare_part(obj, pid, role, colour_model):
    """Make an ordinary mesh object a part: add every missing `mc_*` attribute, zero, so all of
    its elements read as new."""
    mesh = obj.data
    for names, kind, domain in ((POINT_INT, "INT", "POINT"), (POINT_VEC, "FLOAT_VECTOR", "POINT"), (FACE_INT, "INT", "FACE"), (FACE_BOOL, "BOOLEAN", "FACE"), (EDGE_INT, "INT", "EDGE")):
        for name in names:
            if mesh.attributes.get(name) is None:
                mesh.attributes.new(name, kind, domain)
    obj["mc_part"] = pid
    obj["mc_role"] = role
    obj["mc_colour_model"] = colour_model
    if "mc_scene_sets" not in obj:
        obj["mc_scene_sets"] = "[]"


def distant_collection(collection):
    return next((c for c in collection.children if c.get("mc_distant")), None)


def prepare_distant(obj):
    """An object in a `Distant Structure` collection is the distant part, however it got there:
    a fresh mesh, or a copy of the wireframe moved in with M."""
    if not any(c.get("mc_distant") for c in obj.users_collection):
        return False
    if obj.type == "MESH" and (obj.get("mc_part") != DISTANT or obj.get("mc_role") != DISTANT):
        collection = asset_collection(obj)
        if obj.get("mc_part") is None and collection is not None:
            # A fresh mesh is taken as drawn: bake its transform into game units.
            display = display_matrix(collection)
            _bake(obj, display.inverted() @ obj.matrix_world)
            obj.matrix_world = display
        prepare_part(obj, DISTANT, DISTANT, "ink")
    return True


def _import_part(part, centre):
    vertices, externals = part["vertices"], part["externals"]
    index = {v["id"]: k for k, v in enumerate(vertices)}
    for k, x in enumerate(externals):
        index[x["id"]] = len(vertices) + k
    # An endpoint with no position on this cell waits at the asset's centre: it only ends lines.
    parked = (centre[0], 0, centre[1])
    coords = [swap(v["co"]) for v in vertices] + [swap(x["display"] or parked) for x in externals]
    faces = [[index[i] for i in f["loop"]] for f in part["faces"]]
    edges = [[index[e] for e in l["ends"]] for l in part["lines"]]
    mesh = bpy.data.meshes.new(part["id"])
    mesh.from_pydata(coords, edges, faces)

    materials = []

    def slot(colour):
        if colour is None:
            return -1
        material = material_for(colour)
        if material.name not in [m.name for m in materials]:
            materials.append(material)
            mesh.materials.append(material)
        return [m.name for m in materials].index(material.name)

    scene_sets = []

    def scene(slots):
        if slots is None:
            return 0
        if list(slots) not in scene_sets:
            scene_sets.append(list(slots))
        return scene_sets.index(list(slots)) + 1

    for name in POINT_INT:
        mesh.attributes.new(name, "INT", "POINT")
    for name in POINT_VEC:
        mesh.attributes.new(name, "FLOAT_VECTOR", "POINT")
    for name in FACE_INT:
        mesh.attributes.new(name, "INT", "FACE")
    for name in FACE_BOOL:
        mesh.attributes.new(name, "BOOLEAN", "FACE")
    for name in EDGE_INT:
        mesh.attributes.new(name, "INT", "EDGE")

    vid, kind, inputs, display = [], [], [], []
    for v in vertices:
        vid.append(v["id"] + 1)
        runtime = v.get("runtime")
        kind.append(KIND_ROTATED if runtime else KIND_VERTEX)
        inputs.extend(runtime["input"] if runtime else (0, 0, 0))
        display.extend(v["co"] if runtime else (0, 0, 0))
    for x in externals:
        vid.append(x["id"] + 1)
        kind.append(KIND_EXTERNAL if x["display"] is not None else KIND_EXTERNAL_HIDDEN)
        inputs.extend((x["slot"], 0, 0))
        display.extend(x["display"] or (0, 0, 0))
    mesh.attributes["mc_vid"].data.foreach_set("value", vid)
    mesh.attributes["mc_kind"].data.foreach_set("value", kind)
    mesh.attributes["mc_input"].data.foreach_set("vector", [float(c) for c in inputs])
    mesh.attributes["mc_display"].data.foreach_set("vector", [float(c) for c in display])

    fid, record, double, close, fscene, material_index = [], [], [], [], [], []
    for f in part["faces"]:
        fid.append(f["id"] + 1)
        record.append(f["record"] + 1 if f.get("record") is not None else 0)
        double.append(bool(f.get("doubleSided")))
        close.append(bool(f.get("closingRepeat")))
        fscene.append(scene(f.get("sceneSlots")))
        material_index.append(max(slot(f.get("colour")), 0))
    mesh.attributes["mc_fid"].data.foreach_set("value", fid)
    mesh.attributes["mc_record"].data.foreach_set("value", record)
    mesh.attributes["mc_double"].data.foreach_set("value", double)
    mesh.attributes["mc_close"].data.foreach_set("value", close)
    mesh.attributes["mc_scene"].data.foreach_set("value", fscene)
    if part["faces"]:
        mesh.polygons.foreach_set("material_index", material_index)

    # A record may draw the same edge twice; each copy keeps its own Blender edge and line.
    by_pair = {}
    for e in mesh.edges:
        by_pair.setdefault(frozenset(e.vertices), []).append(e.index)
    columns = {name: [0] * len(mesh.edges) for name in EDGE_INT}
    for l in part["lines"]:
        e = by_pair[frozenset(index[i] for i in l["ends"])].pop(0)
        columns["mc_lid"][e] = l["id"] + 1
        columns["mc_lstart"][e] = l["ends"][0] + 1
        columns["mc_lrecord"][e] = l["record"] + 1 if l.get("record") is not None else 0
        columns["mc_lscene"][e] = scene(l.get("sceneSlots"))
        columns["mc_lcolour"][e] = slot(l.get("colour")) + 1
    for name, values in columns.items():
        mesh.attributes[name].data.foreach_set("value", values)

    obj = bpy.data.objects.new(part["id"], mesh)
    obj["mc_part"] = part["id"]
    obj["mc_role"] = part["role"]
    obj["mc_colour_model"] = part["colourModel"]
    obj["mc_scene_sets"] = json.dumps(scene_sets)
    return obj


def asset_collection(obj_or_collection=None):
    """The asset collection the given object belongs to, or the only one in the file."""
    if isinstance(obj_or_collection, bpy.types.Collection) and "mc_asset" in obj_or_collection:
        return obj_or_collection
    if obj_or_collection is not None:
        for collection in obj_or_collection.users_collection:
            if "mc_asset" in collection:
                return collection
            if collection.get("mc_distant"):
                for parent in bpy.data.collections:
                    if "mc_asset" in parent and collection.name in parent.children:
                        return parent
    found = [c for c in bpy.data.collections if "mc_asset" in c]
    return found[0] if len(found) == 1 else None


def _values(mesh, name, domain_size, default=0, vector=False):
    attribute = mesh.attributes.get(name)
    if attribute is None:
        return None
    values = [0.0] * (domain_size * (3 if vector else 1))
    attribute.data.foreach_get("vector" if vector else "value", values)
    if vector:
        return [tuple(values[3 * k : 3 * k + 3]) for k in range(domain_size)]
    return list(values)


def export_parts(collection):
    """The parts the collection holds now, and every diagnostic found on the way. Refuses
    nothing itself; callers decide (a Validate shows, an export refuses)."""
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    diagnostics = []

    def error(site, message):
        diagnostics.append(C.Diagnostic("error", site, message))

    def warning(site, message):
        diagnostics.append(C.Diagnostic("warning", site, message))

    order = json.loads(collection["mc_parts"])
    objects = {}
    for obj in collection.objects:
        pid = obj.get("mc_part")
        if pid is None or pid not in order:
            error(obj.name, "is not a part of this asset; delete it, or move it into the Distant Structure collection")
            continue
        if pid in objects:
            error(pid, f"two objects claim this part ({objects[pid].name}, {obj.name}); delete the copy")
            continue
        objects[pid] = obj
    for child in collection.children:
        if not child.get("mc_distant"):
            error(child.name, "is not part of this asset; only the Distant Structure collection belongs here")
    parts = []
    for pid in order:
        obj = objects.get(pid)
        if obj is None:
            error(pid, "part object is missing; restore it (only the Distant Structure may be removed)")
            continue
        parts.append(_export_part(obj, collection, error, warning))
    distant = distant_collection(collection)
    if distant is not None:
        found = list(distant.all_objects)
        if len(found) > 1:
            error(DISTANT_COLLECTION, f"holds {len(found)} objects; join them into one (Ctrl J) or delete the extras")
        elif found:
            obj = found[0]
            if obj.type != "MESH":
                error(obj.name, "the Distant Structure is a mesh")
            elif obj.data.users > 1:
                error(obj.name, "shares its mesh with another object; Object ▸ Relations ▸ Make Single User ▸ Object & Data")
            else:
                prepare_distant(obj)
                parts.append(_export_part(obj, collection, error, warning))
    return parts, diagnostics


def _fresh(ids_in_order, used):
    """Identities for new and duplicated elements: the first holder of an identity keeps it; every
    later one, and every new element, takes the next unused identity in Blender index order."""
    taken = set()
    out = []
    following = max(used, default=-1) + 1
    for value in ids_in_order:
        if value >= 0 and value not in taken:
            taken.add(value)
            out.append(value)
        else:
            out.append(None)
    for k, value in enumerate(out):
        if value is None:
            while following in taken or following in used:
                following += 1
            out[k] = following
            taken.add(following)
            following += 1
    return out


def _export_part(obj, collection, error, warning):
    pid = obj["mc_part"]
    mesh = obj.data
    if not has_display_transform(obj, collection):
        error(pid, "object was moved, rotated or scaled in Object Mode; undo that, or use Mercenary ▸ Reset Display Transform, and edit geometry in Edit Mode")
    if obj.modifiers:
        warning(pid, "modifiers are ignored on export; apply them to change geometry")
    colour_model = obj["mc_colour_model"]
    scene_sets = json.loads(obj.get("mc_scene_sets", "[]"))
    nv, nf, ne = len(mesh.vertices), len(mesh.polygons), len(mesh.edges)
    columns = {}
    for name in POINT_INT:
        columns[name] = _values(mesh, name, nv)
    for name in POINT_VEC:
        columns[name] = _values(mesh, name, nv, vector=True)
    for name in FACE_INT + FACE_BOOL:
        columns[name] = _values(mesh, name, nf)
    for name in EDGE_INT:
        columns[name] = _values(mesh, name, ne)
    missing = [name for name, values in columns.items() if values is None]
    if missing:
        error(pid, f"attributes {', '.join(missing)} were removed; identities cannot be recovered (undo, or re-import)")
        return {"colourModel": colour_model, "externals": [], "faces": [], "id": pid, "lines": [], "role": obj["mc_role"], "vertices": []}

    raw_ids = [int(v) - 1 for v in columns["mc_vid"]]
    ids = _fresh(raw_ids, set(i for i in raw_ids if i >= 0))
    vertices, externals = [], []
    coords = [swap(v.co) for v in mesh.vertices]
    kinds = [int(k) for k in columns["mc_kind"]]
    for k in range(nv):
        co = coords[k]
        site = f"{pid}/v{ids[k]}"
        new = raw_ids[k] < 0 or ids[k] != raw_ids[k]
        if kinds[k] != KIND_VERTEX and new:
            # A duplicate of a runtime or external point is an ordinary new vertex.
            kinds[k] = KIND_VERTEX
        if kinds[k] == KIND_VERTEX:
            rounded = [round(c) for c in co]
            if any(abs(c - r) > COORD_TOLERANCE for c, r in zip(co, rounded)):
                error(site, f"coordinate ({', '.join(f'{c:.3f}' for c in co)}) is not whole game units; use Mercenary ▸ Snap to Game Units")
            vertices.append({"co": [int(r) for r in rounded], "id": ids[k]})
            continue
        display = [int(round(c)) for c in columns["mc_display"][k]]
        if kinds[k] in (KIND_ROTATED, KIND_EXTERNAL) and any(abs(c - d) > 0.5 for c, d in zip(co, display)):
            what = "a rotated input whose position the runtime computes; undo the move and change its mc_input attribute instead" if kinds[k] == KIND_ROTATED else "a Road Workspace endpoint placed by the road table; it cannot be moved here"
            error(site, f"moved, but it is {what}")
        if kinds[k] == KIND_ROTATED:
            vertices.append({"co": display, "id": ids[k], "runtime": {"input": [int(round(c)) for c in columns["mc_input"][k]], "kind": "rotated-input"}})
        else:
            externals.append({"display": display if kinds[k] == KIND_EXTERNAL else None, "id": ids[k], "slot": int(round(columns["mc_input"][k][0])), "workspace": "road"})
    external_points = {ids[k] for k in range(nv) if kinds[k] in (KIND_EXTERNAL, KIND_EXTERNAL_HIDDEN)}

    face_raw = [int(v) - 1 for v in columns["mc_fid"]]
    face_ids = _fresh(face_raw, set(i for i in face_raw if i >= 0))
    faces = []
    for k, polygon in enumerate(mesh.polygons):
        site = f"{pid}/f{face_ids[k]}"
        loop = [ids[i] for i in polygon.vertices]
        if any(i in external_points for i in loop):
            error(site, "a face uses a Road Workspace endpoint; external endpoints only end lines")
        face = {"id": face_ids[k], "loop": loop}
        if colour_model != "none":
            material = mesh.materials[polygon.material_index] if polygon.material_index < len(mesh.materials) else None
            colour = colour_of(material)
            if colour is None or colour["kind"] != colour_model:
                error(site, f"material '{material.name if material else '(none)'}' carries no {colour_model} colour; use Mercenary ▸ Set Game Colour")
            else:
                face["colour"] = colour
        if columns["mc_record"][k] > 0:
            face["record"] = int(columns["mc_record"][k]) - 1
        if columns["mc_scene"][k] > 0:
            face["sceneSlots"] = scene_sets[int(columns["mc_scene"][k]) - 1]
        if columns["mc_double"][k]:
            face["doubleSided"] = True
        if columns["mc_close"][k]:
            face["closingRepeat"] = True
        faces.append(face)

    # A line is an edge marked with a line identity, and nothing else: deleting faces leaves
    # wire edges behind, and a new edge from F may be construction. An unmarked wire edge is
    # refused rather than guessed at.
    line_raw = [int(v) - 1 for v in columns["mc_lid"]]
    is_line = [line_raw[k] >= 0 for k in range(ne)]
    for k, edge in enumerate(mesh.edges):
        if not is_line[k] and edge.is_loose:
            a, b = (ids[i] for i in edge.vertices)
            error(
                f"{pid}/e{a}-{b}",
                f"wire edge v{a}–v{b} is not a line: Mercenary ▸ Mark Lines (then Set Game Colour) to make it one, "
                "or delete it (Delete ▸ Only Faces leaves edges behind; Delete ▸ Faces does not)",
            )
    candidates = [line_raw[k] for k in range(ne) if is_line[k]]
    line_ids = iter(_fresh(candidates, set(i for i in candidates if i >= 0)))
    lines = []
    for k, edge in enumerate(mesh.edges):
        if not is_line[k]:
            continue
        lid = next(line_ids)
        site = f"{pid}/l{lid}"
        a, b = (ids[i] for i in edge.vertices)
        if columns["mc_lstart"][k] - 1 == b:
            a, b = b, a
        line = {"ends": [a, b], "id": lid}
        if colour_model != "none":
            slot = int(columns["mc_lcolour"][k]) - 1
            colour = colour_of(mesh.materials[slot]) if 0 <= slot < len(mesh.materials) else None
            if colour is None or colour["kind"] != colour_model:
                error(site, f"line v{a}–v{b} has no {colour_model} colour; select it and use Mercenary ▸ Set Game Colour")
            else:
                line["colour"] = colour
        if columns["mc_lrecord"][k] > 0:
            line["record"] = int(columns["mc_lrecord"][k]) - 1
        if columns["mc_lscene"][k] > 0:
            line["sceneSlots"] = scene_sets[int(columns["mc_lscene"][k]) - 1]
        lines.append(line)
    for k in range(nv):
        if kinds[k] in (KIND_EXTERNAL, KIND_EXTERNAL_HIDDEN) and not any(ids[k] in l["ends"] for l in lines):
            warning(f"{pid}/x{ids[k]}", "Road Workspace endpoint no longer ends any line; it is dropped")
    externals = [x for x in externals if any(x["id"] in l["ends"] for l in lines)]

    def by_id(items):
        return sorted(items, key=lambda item: item["id"])

    return {
        "colourModel": colour_model,
        "externals": by_id(externals),
        "faces": by_id(faces),
        "id": pid,
        "lines": by_id(lines),
        "role": obj["mc_role"],
        "vertices": by_id(vertices),
    }


def validate(collection):
    """The file the collection would export, and every diagnostic, without writing it."""
    parts, diagnostics = export_parts(collection)
    if any(d.severity == "error" for d in diagnostics):
        return None, diagnostics
    value, file_diagnostics = T.with_parts(collection["mc_path"], parts, collection["mc_asset"])
    return value, diagnostics + file_diagnostics


def export(collection):
    """Write the collection's geometry back to the file it came from. Raises Rejected with every
    error, and writes nothing, when the file would not load."""
    value, diagnostics = validate(collection)
    if any(d.severity == "error" for d in diagnostics):
        raise C.Rejected(diagnostics)
    return T.write(collection["mc_path"], value), diagnostics
