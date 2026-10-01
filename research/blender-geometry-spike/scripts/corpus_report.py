"""Summarise the corpus round trip: python3 scripts/corpus_report.py → out/corpus-report.md"""

import glob
import json
import os
import subprocess

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")


def tally(pattern):
    results = {}
    for path in glob.glob(os.path.join(OUT, "corpus", "blend", pattern)):
        with open(path, encoding="utf-8") as handle:
            results.update(json.load(handle))
    exact = sum(1 for r in results.values() if r == "exact")
    return exact, len(results), {k: v for k, v in results.items() if v != "exact"}


with open(os.path.join(OUT, "sweep-report.json"), encoding="utf-8") as handle:
    sweep = json.load(handle)
version = subprocess.run([os.environ.get("BLENDER", "blender"), "--version"], capture_output=True, text=True).stdout.splitlines()[0]
plain = tally("batch-?.json"), tally("batch-??.json")
exact = plain[0][0] + plain[1][0]
total = plain[0][1] + plain[1][1]
t_exact, t_total, t_bad = tally("batch-*-toggle.json")
unsupported = sum(v["count"] for v in sweep["damocles"]["unsupported"].values())
lines = [
    "# Corpus round trip",
    "",
    f"{version}. Every Damocles Model the contract represents went through the add-on: import, save `.blend`, reopen in a new process, export, compare with the recovered contract and validate against its sidecar.",
    "",
    "| | Models | Exact |",
    "| --- | --- | --- |",
    f"| Recovered → composed back to the payload file (TypeScript) | {sweep['damocles']['composedExactly']} | all |",
    f"| Not representable by the spike contract (mesh fields `alternates`, `texts`, `articulation`) | {unsupported} | — |",
    f"| Blender import → save → reopen → export | {total} | {exact} |",
    f"| …with Edit Mode entered and left on every part first | {t_total} | {t_exact} |",
    f"| Targ object models / Rooms composed back exactly | {sweep['targ']['objectModels']} / {sweep['targ']['rooms']} | |",
    "",
]
with open(os.path.join(OUT, "corpus-report.md"), "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
print("\n".join(lines))
