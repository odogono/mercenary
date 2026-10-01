"""One Blender session of the round trip, so save → reopen really crosses a process boundary.

    blender -b --factory-startup --python scripts/step.py -- STEP SLUG

Steps
    blend-create   recovered.contract.json → assets/SLUG/asset.blend          (candidate A, adopt)
    blend-export   asset.blend → roundtrip/SLUG/a-session-N.mgeo             (reopen + export)
    glb-create     recovered.contract.json → assets/SLUG/asset.glb  (pure Python writer, adopt)
    glb-cycle      asset.glb → import → export → roundtrip/SLUG/b-session-N.glb
    glb-recycle    b-session-1.glb → import → export → roundtrip/SLUG/b-session-2.glb
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402
from _boot import OUT, blender_io, bpy, contract, glb, mgeo  # noqa: E402

step, slug, *rest = _boot.args()
assets = os.path.join(OUT, "assets", slug)
work = os.path.join(OUT, "roundtrip", slug)
session = rest[0] if rest else "1"


def export(collection):
    sidecar = _boot.read_json(os.path.join(assets, "sidecar.json"))
    asset, diagnostics = blender_io.validate(collection, sidecar)
    for d in diagnostics:
        print(d)
    if any(d.severity == "error" for d in diagnostics):
        raise contract.Rejected(diagnostics)
    return asset


if step == "blend-create":
    _boot.empty_scene()
    asset = _boot.read_json(os.path.join(assets, "recovered.contract.json"))
    blender_io.import_asset(asset, "sidecar.json")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(assets, "asset.blend"), compress=False)
elif step == "blend-export":
    bpy.ops.wm.open_mainfile(filepath=os.path.join(assets, "asset.blend"))
    _boot.register()
    asset = export(blender_io.asset_collection())
    _boot.write_bytes(os.path.join(work, f"a-session-{session}.mgeo"), mgeo.encode(asset))
    # Twice in one session, too: an export must not depend on anything the first one touched.
    _boot.write_bytes(os.path.join(work, f"a-session-{session}-again.mgeo"), mgeo.encode(export(blender_io.asset_collection())))
elif step == "glb-create":
    asset = _boot.read_json(os.path.join(assets, "recovered.contract.json"))
    _boot.write_bytes(os.path.join(assets, "asset.glb"), glb.encode(asset))
elif step in ("glb-cycle", "glb-recycle"):
    _boot.empty_scene()
    source = os.path.join(assets, "asset.glb") if step == "glb-cycle" else os.path.join(work, "b-session-1.glb")
    with open(source, "rb") as handle:
        asset = glb.decode(handle.read())
    blender_io.import_asset(asset, "sidecar.json")
    out = "b-session-1.glb" if step == "glb-cycle" else "b-session-2.glb"
    _boot.write_bytes(os.path.join(work, out), glb.encode(export(blender_io.asset_collection())))
else:
    raise SystemExit(f"unknown step {step}")
