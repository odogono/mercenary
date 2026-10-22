"""Mercenary geometry: import, validate and export the Targ Geometry Assets in assets/targ/
(ADR 0081).

Editing uses ordinary Blender tools. The add-on only moves geometry in and out and says what the
game's loader would refuse. Sidebar ▸ Mercenary in the 3D Viewport. See tools/blender/README.md.
"""

bl_info = {
    "name": "Mercenary geometry",
    "author": "Mercenary remake",
    "version": (1, 0, 0),
    "blender": (5, 2, 0),
    "location": "View3D ▸ Sidebar ▸ Mercenary",
    "description": "Import, validate and export Targ Geometry Assets in assets/targ",
    "category": "Import-Export",
}

try:
    import bpy  # noqa: F401
except ImportError:  # plain Python: contract and targ_asset work without Blender
    bpy = None

if bpy is not None:
    from .addon import register, unregister  # noqa: F401
