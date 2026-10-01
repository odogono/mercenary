"""Open a .blend asset and export its game binary: blender -b --python fresh_export.py -- BLEND MGEO"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402
from _boot import blender_io, bpy, contract, mgeo  # noqa: E402

blend, target = _boot.args()
bpy.ops.wm.open_mainfile(filepath=blend)
_boot.register()
collection = blender_io.asset_collection()
sidecar = _boot.read_json(os.path.join(os.path.dirname(blend), "sidecar.json"))
asset, diagnostics = blender_io.validate(collection, sidecar)
if any(d.severity == "error" for d in diagnostics):
    raise contract.Rejected(diagnostics)
_boot.write_bytes(target, mgeo.encode(asset))
