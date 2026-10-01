"""The add-on's operators and sidebar panel. Imported only inside Blender."""

import json
import os

import bmesh
import bpy
from bpy.props import IntProperty, StringProperty
from bpy_extras.io_utils import ExportHelper, ImportHelper

from . import blender_io, contract, glb, mgeo

DIAGNOSTICS_TEXT = "Mercenary diagnostics"


def _blend_directory():
    return os.path.dirname(bpy.data.filepath) if bpy.data.filepath else os.getcwd()


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


def read_geometry(path):
    with open(path, "rb") as handle:
        data = handle.read()
    if path.endswith(".glb"):
        return glb.decode(data)
    if path.endswith(".mgeo"):
        return mgeo.decode(data)
    return json.loads(data)


def export_checked(collection, sidecar):
    """The contract, or Rejected with every error: the one gate both exporters go through."""
    asset, diagnostics = blender_io.validate(collection, sidecar)
    if any(d.severity == "error" for d in diagnostics):
        raise contract.Rejected(diagnostics)
    return asset, diagnostics


class MERCENARY_OT_import(bpy.types.Operator, ImportHelper):
    """Import a Mercenary geometry asset (.glb, .mgeo or contract .json) with its sidecar"""

    bl_idname = "mercenary.import_asset"
    bl_label = "Import Mercenary Asset"
    filter_glob: StringProperty(default="*.glb;*.mgeo;*.json", options={"HIDDEN"})
    sidecar: StringProperty(name="Sidecar", description="Sidecar JSON; defaults to sidecar.json beside the file", default="")

    def execute(self, context):
        try:
            asset = read_geometry(self.filepath)
        except contract.Rejected as rejected:
            _report(self, rejected.diagnostics)
            return {"CANCELLED"}
        sidecar = self.sidecar or os.path.join(os.path.dirname(self.filepath), "sidecar.json")
        blender_io.import_asset(asset, os.path.abspath(sidecar) if os.path.exists(sidecar) else None)
        return {"FINISHED"}


class _AssetOperator:
    @classmethod
    def poll(cls, context):
        return blender_io.asset_collection(context.object) is not None

    def sidecar(self, collection):
        try:
            return blender_io.load_sidecar(collection, _blend_directory())
        except OSError as error:
            self.report({"WARNING"}, f"sidecar not readable ({error}); references are not checked")
            return None


class MERCENARY_OT_validate(bpy.types.Operator, _AssetOperator):
    """Report everything a game reader would refuse, without exporting"""

    bl_idname = "mercenary.validate"
    bl_label = "Validate"

    def execute(self, context):
        collection = blender_io.asset_collection(context.object)
        _, diagnostics = blender_io.validate(collection, self.sidecar(collection))
        errors = _report(self, diagnostics)
        if not errors:
            self.report({"INFO"}, f"{collection['mc_asset']}: valid")
        return {"FINISHED"}


class _Exporter(_AssetOperator, ExportHelper):
    def execute(self, context):
        collection = blender_io.asset_collection(context.object)
        try:
            asset, diagnostics = export_checked(collection, self.sidecar(collection))
        except contract.Rejected as rejected:
            _report(self, rejected.diagnostics)
            return {"CANCELLED"}
        with open(self.filepath, "wb") as handle:
            handle.write(self.encode(asset))
        _report(self, diagnostics)
        self.report({"INFO"}, f"wrote {self.filepath}")
        return {"FINISHED"}


class MERCENARY_OT_export_mgeo(bpy.types.Operator, _Exporter):
    """Export the game binary (.mgeo) for the .blend candidate"""

    bl_idname = "mercenary.export_mgeo"
    bl_label = "Export Game Binary (.mgeo)"
    filename_ext = ".mgeo"
    filter_glob: StringProperty(default="*.mgeo", options={"HIDDEN"})

    def encode(self, asset):
        return mgeo.encode(asset)


class MERCENARY_OT_export_glb(bpy.types.Operator, _Exporter):
    """Export the canonical GLB with the MERCENARY_geometry extension"""

    bl_idname = "mercenary.export_glb"
    bl_label = "Export Canonical GLB"
    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb", options={"HIDDEN"})

    def encode(self, asset):
        return glb.encode(asset)


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
        obj = context.object
        model = obj.get("mc_colour_model")
        if model == "none":
            self.report({"ERROR"}, "this part carries no colours")
            return {"CANCELLED"}
        colour = (
            {"ink": self.ink, "kind": "ink"}
            if model == "ink"
            else {"colour": self.colour.lower(), "kind": "palette", "source": self.source, **({"day": self.day.lower()} if self.day else {})}
        )
        if model == "palette" and not contract.COLOUR_PATTERN.match(colour["colour"]):
            self.report({"ERROR"}, "colour must be #rrggbb")
            return {"CANCELLED"}
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
            if not edge.select or not (edge[lid] > 0 or edge.is_wire):
                continue
            if edge[lid] == 0:
                # Colouring a wire edge says it is a line.
                edge[lid] = following
                following += 1
            edge[lcolour] = slot + 1
        bmesh.update_edit_mesh(obj.data)
        return {"FINISHED"}


class MERCENARY_OT_mark_lines(bpy.types.Operator, _AssetOperator):
    """Mark or unmark the selected edges as explicit lines (a line may lie on a face edge)"""

    bl_idname = "mercenary.mark_lines"
    bl_label = "Mark Lines"
    bl_options = {"REGISTER", "UNDO"}
    clear: bpy.props.BoolProperty(name="Clear", default=False)

    def execute(self, context):
        obj = context.object
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
        collection = blender_io.asset_collection(context.object)
        if collection is None:
            layout.label(text="Select a part of an imported asset")
            return
        layout.label(text=collection["mc_asset"])
        layout.label(text=f"Part: {context.object.get('mc_part', '—')} ({context.object.get('mc_role', '—')})")
        layout.operator(MERCENARY_OT_validate.bl_idname, icon="CHECKMARK")
        column = layout.column(align=True)
        column.operator(MERCENARY_OT_snap.bl_idname)
        column.operator(MERCENARY_OT_set_colour.bl_idname)
        row = column.row(align=True)
        row.operator(MERCENARY_OT_mark_lines.bl_idname, text="Mark Lines").clear = False
        row.operator(MERCENARY_OT_mark_lines.bl_idname, text="Clear Lines").clear = True
        column = layout.column(align=True)
        column.operator(MERCENARY_OT_export_mgeo.bl_idname, icon="EXPORT")
        column.operator(MERCENARY_OT_export_glb.bl_idname, icon="EXPORT")


CLASSES = (
    MERCENARY_OT_import,
    MERCENARY_OT_validate,
    MERCENARY_OT_export_mgeo,
    MERCENARY_OT_export_glb,
    MERCENARY_OT_snap,
    MERCENARY_OT_set_colour,
    MERCENARY_OT_mark_lines,
    MERCENARY_PT_panel,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
