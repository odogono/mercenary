"""Mercenary geometry (#671 spike): import, validate and export game geometry assets.

Editing uses ordinary Blender tools. The add-on only moves assets in and out and says what a
game reader would refuse. Sidebar ▸ Mercenary in the 3D Viewport.
"""

bl_info = {
    "name": "Mercenary geometry (spike)",
    "author": "Mercenary remake",
    "version": (0, 1, 0),
    "blender": (5, 2, 0),
    "location": "View3D ▸ Sidebar ▸ Mercenary",
    "description": "Import, validate and export Mercenary geometry assets (#671 feasibility spike)",
    "category": "Import-Export",
}

try:
    import bpy  # noqa: F401
except ImportError:  # plain Python: contract, mgeo, glb and triangulate work without Blender
    bpy = None

if bpy is not None:
    from .addon import register, unregister  # noqa: F401
