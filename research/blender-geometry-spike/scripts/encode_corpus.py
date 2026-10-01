"""Encode every swept Damocles contract as MGEO and GLB with the add-on's own writers.

    python3 scripts/encode_corpus.py      (plain Python; the writers do not need Blender)

Reads out/sweep/*.contract.json (from `cli.ts sweep`), writes out/corpus/{mgeo,glb}/.
"""

import glob
import os
import sys

SPIKE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SPIKE)

import json  # noqa: E402

from mercenary_geometry import glb, mgeo  # noqa: E402  (package __init__ needs bpy; see below)

for kind in ("mgeo", "glb"):
    os.makedirs(os.path.join(SPIKE, "out", "corpus", kind), exist_ok=True)
for path in sorted(glob.glob(os.path.join(SPIKE, "out", "sweep", "*.contract.json"))):
    name = os.path.basename(path).replace(".contract.json", "")
    with open(path, encoding="utf-8") as handle:
        asset = json.load(handle)
    for kind, module in (("mgeo", mgeo), ("glb", glb)):
        with open(os.path.join(SPIKE, "out", "corpus", kind, f"{name}.{kind}"), "wb") as handle:
            handle.write(module.encode(asset))
print("encoded", len(glob.glob(os.path.join(SPIKE, "out", "corpus", "mgeo", "*"))))
