"""Edited and Authored Targ Geometry Assets under `assets/targ/` (ADR 0081), in Python.

Mirrors the rules of web/src/geometry/targAssets.ts that decide whether a file may be written:
its folder, name, identity namespace and sidecar link. What needs the payload (a missing
Recovered Baseline, slot and cell clashes, staleness) stays with `bun tools/targ-assets.ts check`.

The add-on only ever replaces a file's geometry. The Asset Sidecar and Change Ledger are written
by hand, so an export re-reads them from disk rather than keeping a copy that could go stale.
Pure Python, no bpy.
"""

from __future__ import annotations

import json
import os
import re

from . import contract as C

ASSET_FILE_FORMAT = "mercenary-targ-asset"
SIDECAR_FORMAT = "mercenary-geometry-sidecar"
ASSETS = os.path.join("assets", "targ")
FAMILY = {"objects": "targ-object-model", "structures": "targ-surface-cell"}
AUTHORED = re.compile(r"^authored:[\da-z]+(?:-[\da-z]+)*$")
SLUG = re.compile(r"^[\da-z]+(?:-[\da-z]+)*$")
ROOT_MARKER = "trace-scenarios.json"


def repository_root(start=None):
    """The checkout the add-on edits: MERCENARY_ROOT, else the one this add-on was loaded from."""
    if os.environ.get("MERCENARY_ROOT"):
        return os.path.abspath(os.environ["MERCENARY_ROOT"])
    directory = os.path.abspath(start or os.path.dirname(__file__))
    while not os.path.exists(os.path.join(directory, ROOT_MARKER)):
        parent = os.path.dirname(directory)
        if parent == directory:
            raise C.Rejected([C.Diagnostic("error", "root", "cannot find the repository; launch Blender with `bun run blender` from web/ or set MERCENARY_ROOT")])
        directory = parent
    return directory


def asset_file_name(identity):
    """The file name an identity is stored under: `targ:object:model:1700` → `object-model-1700.json`."""
    return (identity[len("targ:"):] if identity.startswith("targ:") else identity).replace(":", "-") + ".json"


def relative_path(path, root=None):
    """`objects/<name>.json` or `structures/<name>.json` for a file under the root's assets/targ."""
    assets = os.path.join(root or repository_root(), ASSETS)
    relative = os.path.relpath(os.path.abspath(path), assets).replace(os.sep, "/")
    if not re.fullmatch(r"(objects|structures)/[^/]+\.json", relative):
        raise C.Rejected([C.Diagnostic("error", "path", f"{path} is not assets/targ/objects/<name>.json or assets/targ/structures/<name>.json")])
    return relative


def absolute_path(relative, root=None):
    return os.path.join(root or repository_root(), ASSETS, *relative.split("/"))


def kind_of(relative):
    return relative.split("/")[0]


def check_file(relative, value):
    """Every reason the add-on may not write this file, as diagnostics. Warnings are what
    `bun tools/targ-assets.ts check` will still refuse but the author finishes by hand."""
    out = []

    def error(site, message):
        out.append(C.Diagnostic("error", site, message))

    def warning(site, message):
        out.append(C.Diagnostic("warning", site, message))

    kind = kind_of(relative)
    if not isinstance(value, dict) or value.get("format") != ASSET_FILE_FORMAT:
        error("format", f"format should be {ASSET_FILE_FORMAT}")
        return out
    asset, ledger, sidecar = value.get("asset"), value.get("ledger"), value.get("sidecar")
    if not isinstance(asset, dict) or asset.get("format") != C.CONTRACT_FORMAT or asset.get("title") != "targ":
        error("asset", f"asset should be a targ {C.CONTRACT_FORMAT}")
        return out
    if not isinstance(sidecar, dict) or sidecar.get("family") != FAMILY[kind]:
        error("sidecar", f"a {kind} sidecar's family is {FAMILY[kind]}")
        return out
    if not isinstance(ledger, dict) or not isinstance(ledger.get("changes"), list):
        error("ledger", "needs a ledger with its changes")
    identity = asset.get("asset", "")
    if asset_file_name(identity) != relative.split("/")[1]:
        error("asset", f"{identity} is stored as {asset_file_name(identity)}")
    if asset.get("sidecarSha256") != C.sidecar_sha256(sidecar):
        error("sidecarSha256", "geometry is linked to a different sidecar; re-export it")
    out += [d for d in C.check_asset(asset, sidecar) if d.severity == "error"]
    if identity.startswith("authored:"):
        if not AUTHORED.match(identity):
            error("asset", "an Authored Asset is authored:<lowercase-hyphenated-slug>")
        if (isinstance(ledger, dict) and "baseline" in ledger) or "source" in sidecar:
            error("asset", "an Authored Asset has no Recovered Baseline")
        if not sidecar.get("placements"):
            warning("sidecar.placements", "an Authored Asset is placed through its sidecar placements; write them by hand")
    else:
        if not identity.startswith("targ:"):
            error("asset", "an identity is targ:… for an edit or authored:… for new")
        if isinstance(ledger, dict) and not isinstance(ledger.get("baseline"), str):
            error("ledger.baseline", "an edit names the Recovered Baseline its ledger reviewed")
        if "placements" in sidecar:
            error("sidecar.placements", "an edit keeps its payload placement; only Authored Assets place")
    if kind == "objects" and "reach" in sidecar:
        error("sidecar.reach", "only a structure has a Structure Reach")
    if sidecar.get("reach", "all") not in ("all", "cell"):
        error("sidecar.reach", 'reach is "all" or "cell"')
    if kind == "objects" and any(p["role"] != "wireframe" for p in asset["parts"]):
        error("asset.parts", "a Targ object has only its wireframe part")
    return out


def read(relative, root=None):
    """The parsed file, refused with every error the add-on cannot work around."""
    with open(absolute_path(relative, root), encoding="utf-8") as handle:
        try:
            value = json.load(handle)
        except ValueError as problem:
            raise C.Rejected([C.Diagnostic("error", relative, f"not JSON ({problem})")])
    diagnostics = check_file(relative, value)
    if any(d.severity == "error" for d in diagnostics):
        raise C.Rejected(diagnostics)
    return value


def with_parts(relative, parts, identity, root=None):
    """The file on disk with its geometry replaced by `parts`, relinked to the sidecar on disk,
    and every diagnostic. Refuses a file that no longer holds `identity`."""
    path = absolute_path(relative, root)
    with open(path, encoding="utf-8") as handle:
        value = json.load(handle)
    if value.get("asset", {}).get("asset") != identity:
        raise C.Rejected([C.Diagnostic("error", relative, f"now holds {value.get('asset', {}).get('asset')}, not {identity}; re-import it")])
    sidecar = value["sidecar"]
    value["asset"] = {**value["asset"], "parts": parts, "sidecarSha256": C.sidecar_sha256(sidecar)}
    return value, check_file(relative, value)


def write(relative, value, root=None):
    path = absolute_path(relative, root)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(C.canonical_json(value))
    return path


def wireframe(colour_model):
    return {"colourModel": colour_model, "externals": [], "faces": [], "id": "wireframe", "lines": [], "role": "wireframe", "vertices": []}


def new_authored(kind, slug, root=None):
    """Write a new Authored Asset with an empty wireframe and no placements, and return its
    relative path. Never overwrites."""
    if kind not in FAMILY:
        raise C.Rejected([C.Diagnostic("error", "kind", "an Authored Asset is one of objects or structures")])
    if not SLUG.match(slug):
        raise C.Rejected([C.Diagnostic("error", "slug", "a slug is lowercase letters and digits, hyphenated: beacon, radio-mast")])
    identity = f"authored:{slug}"
    relative = f"{kind}/{asset_file_name(identity)}"
    if os.path.exists(absolute_path(relative, root)):
        raise C.Rejected([C.Diagnostic("error", relative, "already exists; an asset is never overwritten")])
    # Objects are drawn in the Room-level palette; structures in Targ Inks.
    record = (
        {"edges": {"$edges": "wireframe"}, "id": identity, "vertices": {"$vertices": "wireframe"}}
        if kind == "objects"
        else {"vertices": {"$surfaceVertices": "wireframe"}, "edges": {"$surfaceEdges": "wireframe"}}
    )
    sidecar = {
        "asset": identity,
        "family": FAMILY[kind],
        "format": SIDECAR_FORMAT,
        "placements": [],
        "record": record,
        "references": [],
        "title": "targ",
        "version": 2,
    }
    asset = {
        "asset": identity,
        "format": C.CONTRACT_FORMAT,
        "parts": [wireframe("none" if kind == "objects" else "ink")],
        "sidecarSha256": C.sidecar_sha256(sidecar),
        "title": "targ",
        "version": C.CONTRACT_VERSION,
    }
    write(relative, {"asset": asset, "format": ASSET_FILE_FORMAT, "ledger": {"changes": []}, "sidecar": sidecar}, root)
    return relative
