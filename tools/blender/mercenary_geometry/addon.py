"""The add-on's operators and sidebar panel. Imported only inside Blender."""

import os

import bmesh
import bpy
from bpy.props import EnumProperty, IntProperty, StringProperty
from bpy_extras.io_utils import ImportHelper

from . import blender_io, contract, targ_asset

DIAGNOSTICS_TEXT = "Mercenary diagnostics"


def _report(operator, diagnostics):
    text = bpy.data.texts.get(DIAGNOSTICS_TEXT) or bpy.data.texts.new(DIAGNOSTICS_TEXT)
    text.clear()
    text.write("\n".join(str(d) for d in diagnostics) or "No problems found.\n")
    errors = [d for d in diagnostics if d.severity == "error"]
    for d in diagnostics[:8]:
        operator.report({"ERROR" if d.severity == "error" else "WARNING"}, str(d))
    if len(diagnostics) > 8:
        operator.report({"INFO"}, f"{len(diagnostics)} diagnostics; all of them are in the '{DIAGNOSTICS_TEXT}' text")
    return errors


def open_asset(relative):
    """Import an `assets/targ/` file by its path relative to that directory, select its visible
    part and frame it in every 3D view."""
    collection = blender_io.import_asset(targ_asset.read(relative), relative)
    shown = [o for o in collection.all_objects if o.visible_get()]
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj in shown)
    if shown:
        bpy.context.view_layer.objects.active = shown[0]
    frame(collection)
    return collection


def frame(collection):
    """Look at the asset's own geometry in every 3D view; nothing to do in background mode."""
    size = max(collection.get("mc_extent", 0), 256) * blender_io.DISPLAY_SCALE
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            view = area.spaces.active
            view.clip_start, view.clip_end = size / 1000, size * 100
            view.region_3d.view_location = (0, 0, 0)
            view.region_3d.view_distance = size * 2


class MERCENARY_OT_import(bpy.types.Operator, ImportHelper):
    """Import a Targ Geometry Asset from assets/targ/objects or assets/targ/structures"""

    bl_idname = "mercenary.import_asset"
    bl_label = "Import Mercenary Asset"
    filter_glob: StringProperty(default="*.json", options={"HIDDEN"})

    def invoke(self, context, event):
        try:
            self.filepath = os.path.join(targ_asset.repository_root(), targ_asset.ASSETS, "")
        except contract.Rejected:
            pass
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        try:
            open_asset(targ_asset.relative_path(self.filepath))
        except contract.Rejected as rejected:
            _report(self, rejected.diagnostics)
            return {"CANCELLED"}
        return {"FINISHED"}


class MERCENARY_OT_new_authored(bpy.types.Operator):
    """Create an Authored Asset in assets/targ with an empty wireframe, and open it"""

    bl_idname = "mercenary.new_authored"
    bl_label = "New Authored Asset"
    kind: EnumProperty(name="Kind", items=(("objects", "Object", "A Targ object model"), ("structures", "Structure", "A Surface Structure")))
    slug: StringProperty(name="Slug", description="Lowercase and hyphenated: the asset is authored:<slug>", default="")

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)

    def execute(self, context):
        try:
            relative = targ_asset.new_authored(self.kind, self.slug)
            open_asset(relative)
        except contract.Rejected as rejected:
            _report(self, rejected.diagnostics)
            return {"CANCELLED"}
        self.report({"INFO"}, f"wrote assets/targ/{relative}; write its placements in the sidecar by hand")
        return {"FINISHED"}


class _AssetOperator:
    @classmethod
    def poll(cls, context):
        return blender_io.asset_collection(context.object) is not None


class MERCENARY_OT_validate(bpy.types.Operator, _AssetOperator):
    """Report everything that stops this asset being exported, without writing it"""

    bl_idname = "mercenary.validate"
    bl_label = "Validate"

    def execute(self, context):
        collection = blender_io.asset_collection(context.object)
        try:
            _, diagnostics = blender_io.validate(collection)
        except (contract.Rejected, OSError) as problem:
            diagnostics = problem.diagnostics if isinstance(problem, contract.Rejected) else [contract.Diagnostic("error", collection["mc_path"], str(problem))]
        errors = _report(self, diagnostics)
        if not errors:
            self.report({"INFO"}, f"{collection['mc_asset']}: valid")
        return {"FINISHED"}


class MERCENARY_OT_export(bpy.types.Operator, _AssetOperator):
    """Write the geometry back to the assets/targ file it came from; the sidecar and ledger are kept"""

    bl_idname = "mercenary.export_asset"
    bl_label = "Export"

    def execute(self, context):
        collection = blender_io.asset_collection(context.object)
        try:
            path, diagnostics = blender_io.export(collection)
        except contract.Rejected as rejected:
            _report(self, rejected.diagnostics)
            return {"CANCELLED"}
        except OSError as problem:
            self.report({"ERROR"}, str(problem))
            return {"CANCELLED"}
        _report(self, diagnostics)
        self.report({"INFO"}, f"wrote {path}")
        return {"FINISHED"}


def _edit_part(context):
    """The active part, its attributes in place: a mesh in the Distant Structure collection
    becomes the distant part the first time it is marked or coloured."""
    blender_io.prepare_distant(context.object)
    return context.object


class MERCENARY_OT_reset_transform(bpy.types.Operator, _AssetOperator):
    """Put the selected parts back where the asset shows them, undoing any Object Mode move"""

    bl_idname = "mercenary.reset_display_transform"
    bl_label = "Reset Display Transform"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        for obj in context.selected_objects or [context.object]:
            collection = blender_io.asset_collection(obj)
            if collection is not None and obj.get("mc_part") is not None:
                obj.matrix_world = blender_io.display_matrix(collection)
        return {"FINISHED"}


class MERCENARY_OT_snap(bpy.types.Operator, _AssetOperator):
    """Round the selected vertices to whole game units"""

    bl_idname = "mercenary.snap_game_units"
    bl_label = "Snap to Game Units"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        mesh = bmesh.from_edit_mesh(context.object.data)
        for v in mesh.verts:
            if v.select:
                v.co = [round(c) for c in v.co]
        bmesh.update_edit_mesh(context.object.data)
        return {"FINISHED"}


class MERCENARY_OT_set_colour(bpy.types.Operator, _AssetOperator):
    """Give the selected faces, and selected edges marked as lines, one game colour"""

    bl_idname = "mercenary.set_colour"
    bl_label = "Set Game Colour"
    bl_options = {"REGISTER", "UNDO"}
    source: IntProperty(name="Source word", description="The record's colour word, e.g. 0x0654", min=0)
    colour: StringProperty(name="Colour", description="#rrggbb the word resolves to (night half for $80xx)", default="#888888")
    day: StringProperty(name="Day colour", description="Optional #rrggbb day half", default="")
    ink: IntProperty(name="Ink", description="Targ Ink, 0 or 1", min=0, max=1)

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)

    def execute(self, context):
        obj = _edit_part(context)
        model = obj.get("mc_colour_model")
        if model == "none":
            self.report({"ERROR"}, "this part carries no colours")
            return {"CANCELLED"}
        fixed = contract.colour_optional(blender_io.asset_collection(obj).get("mc_title"), model)
        if model == "ink":
            colour = {"ink": self.ink, "kind": "ink"}
        elif fixed:
            # A Targ colour is fixed: no colour word for a Floor to rebind, and no day half.
            colour = {"colour": self.colour.lower(), "kind": "palette"}
        else:
            colour = {"colour": self.colour.lower(), "kind": "palette", "source": self.source, **({"day": self.day.lower()} if self.day else {})}
        if model == "palette" and not contract.COLOUR_PATTERN.match(colour["colour"]):
            self.report({"ERROR"}, "colour must be #rrggbb")
            return {"CANCELLED"}
        _apply_colour(obj, colour)
        return {"FINISHED"}

    def draw(self, context):
        obj = context.object
        model = obj.get("mc_colour_model")
        layout = self.layout
        if model == "ink":
            layout.prop(self, "ink")
            return
        layout.prop(self, "colour")
        if not contract.colour_optional(blender_io.asset_collection(obj).get("mc_title"), model):
            layout.prop(self, "source")
            layout.prop(self, "day")


class MERCENARY_OT_clear_colour(bpy.types.Operator, _AssetOperator):
    """Take the selected faces and lines back to uncoloured, drawn in the scene's Line Colour"""

    bl_idname = "mercenary.clear_colour"
    bl_label = "Clear Game Colour"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        obj = _edit_part(context)
        model = obj.get("mc_colour_model")
        if not contract.colour_optional(blender_io.asset_collection(obj).get("mc_title"), model):
            self.report({"ERROR"}, "every primitive of this part carries a colour")
            return {"CANCELLED"}
        _apply_colour(obj, None)
        return {"FINISHED"}


def _apply_colour(obj, colour):
    """Give the selected faces, and selected edges marked as lines, one colour; None uncolours
    them. Colouring a wire edge marks it as a line; uncolouring one leaves it unmarked."""
    material = blender_io.material_for(colour)
    if material.name not in obj.data.materials:
        obj.data.materials.append(material)
    slot = list(obj.data.materials).index(material)
    mesh = bmesh.from_edit_mesh(obj.data)
    lcolour = mesh.edges.layers.int.get("mc_lcolour")
    lid = mesh.edges.layers.int.get("mc_lid")
    for face in mesh.faces:
        if face.select:
            face.material_index = slot
    following = max((e[lid] for e in mesh.edges), default=0) + 1
    for edge in mesh.edges:
        if colour is None:
            if edge.select and edge[lid] > 0:
                edge[lcolour] = 0
            continue
        if not edge.select or not (edge[lid] > 0 or edge.is_wire):
            continue
        if edge[lid] == 0:
            # Colouring a wire edge says it is a line.
            edge[lid] = following
            following += 1
        edge[lcolour] = slot + 1
    bmesh.update_edit_mesh(obj.data)


class MERCENARY_OT_mark_lines(bpy.types.Operator, _AssetOperator):
    """Mark or unmark the selected edges as explicit lines (a line may lie on a face edge)"""

    bl_idname = "mercenary.mark_lines"
    bl_label = "Mark Lines"
    bl_options = {"REGISTER", "UNDO"}
    clear: bpy.props.BoolProperty(name="Clear", default=False)

    def execute(self, context):
        obj = _edit_part(context)
        mesh = bmesh.from_edit_mesh(obj.data)
        lid = mesh.edges.layers.int.get("mc_lid")
        used = {e[lid] for e in mesh.edges if e[lid] > 0}
        following = max(used, default=0) + 1
        for edge in mesh.edges:
            if not edge.select:
                continue
            if self.clear:
                edge[lid] = 0
            elif edge[lid] == 0:
                # Marked now, numbered on export: zero plus wire would also do for a loose edge.
                edge[lid] = following
                following += 1
        bmesh.update_edit_mesh(obj.data)
        return {"FINISHED"}


class MERCENARY_PT_panel(bpy.types.Panel):
    bl_label = "Mercenary"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Mercenary"

    def draw(self, context):
        layout = self.layout
        layout.operator(MERCENARY_OT_import.bl_idname, icon="IMPORT")
        layout.operator(MERCENARY_OT_new_authored.bl_idname, icon="ADD")
        collection = blender_io.asset_collection(context.object)
        if collection is None:
            layout.label(text="Select a part of an imported asset")
            return
        layout.label(text=collection["mc_asset"])
        layout.label(text=f"Part: {context.object.get('mc_part', '—')} ({context.object.get('mc_role', '—')})")
        layout.operator(MERCENARY_OT_validate.bl_idname, icon="CHECKMARK")
        column = layout.column(align=True)
        column.operator(MERCENARY_OT_snap.bl_idname)
        column.operator(MERCENARY_OT_reset_transform.bl_idname)
        column.operator(MERCENARY_OT_set_colour.bl_idname)
        column.operator(MERCENARY_OT_clear_colour.bl_idname)
        row = column.row(align=True)
        row.operator(MERCENARY_OT_mark_lines.bl_idname, text="Mark Lines").clear = False
        row.operator(MERCENARY_OT_mark_lines.bl_idname, text="Clear Lines").clear = True
        layout.operator(MERCENARY_OT_export.bl_idname, icon="EXPORT")


CLASSES = (
    MERCENARY_OT_import,
    MERCENARY_OT_new_authored,
    MERCENARY_OT_validate,
    MERCENARY_OT_export,
    MERCENARY_OT_reset_transform,
    MERCENARY_OT_snap,
    MERCENARY_OT_set_colour,
    MERCENARY_OT_clear_colour,
    MERCENARY_OT_mark_lines,
    MERCENARY_PT_panel,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
