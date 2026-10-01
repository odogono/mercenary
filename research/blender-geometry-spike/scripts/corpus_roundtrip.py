"""Every swept Damocles contract through Blender: import, save, reopen, export, compare (#671).

    blender -b --factory-startup --python scripts/corpus_roundtrip.py -- import BATCH SIZE
    blender -b --factory-startup --python scripts/corpus_roundtrip.py -- export BATCH [toggle]

`import` loads contracts BATCH*SIZE … into one scene, one collection each, and saves
out/corpus/blend/batch-BATCH.blend. `export` reopens it in a new process, exports every
collection, validates against its sidecar and compares with the contract it came from; with
`toggle` it first enters and leaves Edit Mode on every part. Results go to
out/corpus/blend/batch-BATCH[-toggle].json.
"""

import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _boot  # noqa: E402
from _boot import OUT, blender_io, bpy, contract  # noqa: E402

mode, batch, *rest = _boot.args()
batch = int(batch)
names = sorted(os.path.basename(p).replace(".contract.json", "") for p in glob.glob(os.path.join(OUT, "sweep", "*.contract.json")))
work = os.path.join(OUT, "corpus", "blend")
os.makedirs(work, exist_ok=True)
blend = os.path.join(work, f"batch-{batch}.blend")

if mode == "import":
    size = int(rest[0])
    _boot.empty_scene()
    chosen = names[batch * size : (batch + 1) * size]
    for name in chosen:
        asset = _boot.read_json(os.path.join(OUT, "sweep", f"{name}.contract.json"))
        collection = blender_io.import_asset(asset, collection_name=name)
        collection["mc_source"] = name
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=False)
    print("imported", len(chosen))
else:
    bpy.ops.wm.open_mainfile(filepath=blend)
    _boot.register()
    toggle = "toggle" in rest
    if toggle:
        # Enter and leave Edit Mode on every part, as anyone editing does: BMesh rebuilds the mesh.
        for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
            obj.hide_set(False)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.object.mode_set(mode="OBJECT")
    results = {}
    for collection in [c for c in bpy.data.collections if "mc_source" in c]:
        name = collection["mc_source"]
        expected = _boot.read_json(os.path.join(OUT, "sweep", f"{name}.contract.json"))
        sidecar = _boot.read_json(os.path.join(OUT, "sweep", f"{name}.sidecar.json"))
        asset, diagnostics = blender_io.validate(collection, sidecar)
        errors = [str(d) for d in diagnostics if d.severity == "error"]
        if errors:
            results[name] = {"errors": errors[:3]}
        elif contract.canonical_json(asset) != contract.canonical_json(expected):
            # Name the first part and element kind that differ.
            where = "?"
            for got, want in zip(asset["parts"], expected["parts"]):
                for kind in ("vertices", "externals", "faces", "lines"):
                    if got[kind] != want[kind]:
                        bad = next((i for i, (g, w) in enumerate(zip(got[kind], want[kind])) if g != w), None)
                        where = f"{got['id']} {kind}[{bad}] {json.dumps(got[kind][bad] if bad is not None else len(got[kind]))[:160]} vs {json.dumps(want[kind][bad] if bad is not None else len(want[kind]))[:160]}"
                        break
                if where != "?":
                    break
            results[name] = {"differs": where}
        else:
            results[name] = "exact"
    with open(os.path.join(work, f"batch-{batch}{'-toggle' if toggle else ''}.json"), "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=1, sort_keys=True)
    exact = sum(1 for r in results.values() if r == "exact")
    print(f"batch {batch}{' (edit mode toggled)' if toggle else ''}: {exact}/{len(results)} exact")
