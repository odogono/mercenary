"""The #671 geometry contract in Python: canonical JSON, hashing and structural validation.

Mirrors web/src/geometrySpike/contract.ts and compose.ts `checkAsset`. Pure Python, no bpy, so
the same checks run inside Blender and from a plain interpreter.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass

CONTRACT_FORMAT = "mercenary-geometry-asset"
CONTRACT_VERSION = 1
COLOUR_PATTERN = re.compile(r"^#[0-9a-f]{6}$")


def canonical_json(value) -> str:
    """Sorted keys, two-space indent, trailing newline: byte-identical to the TS canonicalJson."""
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sidecar_sha256(sidecar) -> str:
    return sha256_text(canonical_json(sidecar))


@dataclass(frozen=True)
class Diagnostic:
    severity: str  # "error" | "warning"
    site: str
    message: str

    def __str__(self) -> str:
        return f"{self.severity}: {self.site}: {self.message}"


class Rejected(Exception):
    def __init__(self, diagnostics):
        self.diagnostics = list(diagnostics)
        super().__init__("\n".join(str(d) for d in self.diagnostics if d.severity == "error"))


def _parts_matching(asset, name):
    if name == "variant:*":
        return [p for p in asset["parts"] if p["role"] == "display"]
    return [p for p in asset["parts"] if p["id"] == name]


def reference_sites(record):
    """Mirror references.ts: derive every queue/text/label/detail binding's diagnostic site."""
    model = record.get("model", {})
    selection = model.get("structureSelection", {})
    entries = []
    for key in ("wallTexts", "floorLabels"):
        entries.extend((f"structureSelection.{key}[{i}].face", item["face"])
                       for i, item in enumerate(selection.get(key, [])))
    for r, region in enumerate(selection.get("regions", [])):
        entries.extend((f"structureSelection.regions[{r}].queue[{q}]", entry)
                       for q, entry in enumerate(region["queue"]))
    for site, entry in entries:
        if entry["kind"] == "face":
            yield site, {"kind": "record", "part": "plan", "record": entry["index"]}, None
        elif entry["kind"] == "attachmentFace":
            index = entry["index"]
            yield site, None, index.get("$ref") if isinstance(index, dict) else None
    for g, group in enumerate(model.get("detailSelection", [])):
        lists = [(f"detailSelection[{g}].boxes[{b}].records", box["records"])
                 for b, box in enumerate(group["boxes"])]
        lists.append((f"detailSelection[{g}].default", group["default"]))
        for site, records in lists:
            for i, record in enumerate(records):
                yield f"{site}[{i}]", {"kind": "record", "part": "variant:*", "record": record}, None


def _resolves(asset, target) -> bool:
    parts = _parts_matching(asset, target["part"])
    if not parts:
        return False
    for part in parts:
        if target["kind"] == "record":
            record = target["record"]
            if not any(f.get("record") == record for f in part["faces"]) and not any(
                l.get("record") == record for l in part["lines"]
            ):
                return False
        elif not any(f["id"] == target["id"] for f in part["faces"]):
            return False
    return True


def check_asset(asset, sidecar=None):
    """Every structural and reference error a reader would refuse, as actionable diagnostics."""
    out = []

    def error(site, message):
        out.append(Diagnostic("error", site, message))

    if asset.get("format") != CONTRACT_FORMAT or asset.get("version") != CONTRACT_VERSION:
        error("asset", f"not a {CONTRACT_FORMAT} v{CONTRACT_VERSION} document")
        return out
    seen_parts = set()
    for part in asset["parts"]:
        pid = part["id"]
        if pid in seen_parts:
            error(pid, "duplicate part identity")
        seen_parts.add(pid)
        points = {}
        for v in part["vertices"]:
            if v["id"] in points:
                error(f"{pid}/v{v['id']}", "duplicate vertex identity")
            points[v["id"]] = "vertex"
            if not all(isinstance(c, int) for c in v["co"]):
                error(f"{pid}/v{v['id']}", f"non-integer coordinate {v['co']}; game units are integers")
        for x in part["externals"]:
            if x["id"] in points:
                error(f"{pid}/x{x['id']}", "external endpoint reuses a vertex identity")
            points[x["id"]] = "external"
        ids = set()
        for f in part["faces"]:
            site = f"{pid}/f{f['id']}"
            if f["id"] in ids:
                error(site, "duplicate face identity")
            ids.add(f["id"])
            if len(f["loop"]) < 3:
                error(site, "a face needs at least three vertices")
            if len(set(f["loop"])) != len(f["loop"]):
                error(site, "face repeats a vertex")
            for vid in f["loop"]:
                if points.get(vid) != "vertex":
                    error(site, f"names v{vid}, which is not a vertex of this part")
            _colour_check(part, f.get("colour"), site, error)
        ids = set()
        for l in part["lines"]:
            site = f"{pid}/l{l['id']}"
            if l["id"] in ids:
                error(site, "duplicate line identity")
            ids.add(l["id"])
            if l["ends"][0] == l["ends"][1]:
                error(site, "line ends on its own start")
            for vid in l["ends"]:
                if vid not in points:
                    error(site, f"names {vid}, which is neither a vertex nor an external endpoint")
            _colour_check(part, l.get("colour"), site, error)
    if sidecar is not None:
        if sidecar.get("version") != 2:
            error("version", "needs sidecar version 2; recover the baseline again with the current tools")
            return out
        if sidecar.get("asset") != asset["asset"]:
            error("asset", f"geometry is {asset['asset']} but sidecar is {sidecar.get('asset')}")
        resolved = {}
        for site, target, index in reference_sites(sidecar["record"]):
            reference = None
            if target is None:
                if type(index) is not int or not 0 <= index < len(sidecar["references"]):
                    error(site, "attachmentFace needs a valid $ref table index; restore or remap its index in the sidecar.")
                    continue
                reference = sidecar["references"][index]
                target = reference["target"]
            key = json.dumps(target, sort_keys=True)
            if key not in resolved:
                resolved[key] = _resolves(asset, target)
            baseline_unresolved = (
                target["record"] in sidecar.get("unresolvedRecords", {}).get(target["part"], [])
                if target["kind"] == "record" else reference.get("baselineResolved") is False
            )
            if not resolved[key] and not baseline_unresolved:
                what = (f"source record {target['record']} in {target['part']}" if target["kind"] == "record"
                        else f"face {target['id']} in {target['part']}")
                remedy = ("change the inline index or record number at this site in the sidecar" if target["kind"] == "record"
                          else f"remap ref {index} in the sidecar to an existing target")
                error(site, f"references {what}, which no longer exists. Restore a primitive carrying it, or {remedy}.")
    return out


def _colour_check(part, colour, site, error):
    model = part["colourModel"]
    if model == "none":
        if colour is not None:
            error(site, "this part carries no colours")
        return
    if colour is None or colour.get("kind") != model:
        error(site, f"needs a {model} colour")
        return
    if model == "palette" and not COLOUR_PATTERN.match(colour["colour"]):
        error(site, f"colour {colour['colour']} is not #rrggbb")


def require_valid(asset, sidecar=None):
    diagnostics = check_asset(asset, sidecar)
    if any(d.severity == "error" for d in diagnostics):
        raise Rejected(diagnostics)
    return diagnostics


def colour_key(colour):
    """A hashable, ordered identity for a colour, used to build deterministic colour tables."""
    if colour is None:
        return ("none",)
    if colour["kind"] == "ink":
        return ("ink", colour["ink"])
    return ("palette", colour["source"], colour["colour"], colour.get("day") or "")


def colour_from_key(key):
    if key[0] == "none":
        return None
    if key[0] == "ink":
        return {"ink": key[1], "kind": "ink"}
    colour = {"colour": key[2], "kind": "palette", "source": key[1]}
    if key[3]:
        colour["day"] = key[3]
    return colour
