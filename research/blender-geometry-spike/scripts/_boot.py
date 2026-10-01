"""Shared start-up for the headless drivers: import the add-on from this checkout and register it."""

import os
import sys

SPIKE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(SPIKE, "out")
if SPIKE not in sys.path:
    sys.path.insert(0, SPIKE)

import bpy  # noqa: E402

import mercenary_geometry  # noqa: E402
from mercenary_geometry import blender_io, contract, glb, mgeo  # noqa: E402,F401


def register():
    try:
        mercenary_geometry.register()
    except ValueError:
        pass  # already registered in this session


def args():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def empty_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    register()


def read_json(path):
    import json

    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_bytes(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(data)


def write_text(path, text):
    write_bytes(path, text.encode("utf-8"))
