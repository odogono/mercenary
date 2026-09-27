#!/usr/bin/env python3
"""Export the traced Damocles craft passes as Golden Traces for the port's craft Mover (#556).

The craft-control runs of #549 stop at the start of every pass and save the craft state; the
collision-response runs of #550 sample every VBL. Both stay ignored Restricted Material under
`research/damocles-st/work/`. This reads them and writes, for each case, only the program words
the craft Mover reads and writes -- positions, attitude, floats, the stick, the bound box lists
and the attitude sines the frame's trig routine left -- to `traces/damocles/craft/<case>.json`,
which ADR 0029 tracks. No program code or table is copied.

    python3 research/damocles-st/scripts/craft-trace-export.py --work <work dir>...

Each `--work` is searched for the run directories named below, so a run recorded in another
worktree can be read in place.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import struct
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "craft_control_probe", Path(__file__).resolve().parent / "craft-control-probe.py")
probe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(probe)

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "traces" / "damocles" / "craft"

CRAFT_RUNS = {
    "limo": "craft-control-limo-20260927T101951Z-eff77b09",
    "limo-lifted": "craft-control-limo-lifted-20260927T101954Z-eb81eff9",
    "limo-lifted-fast": "craft-control-limo-lifted-fast-20260927T101957Z-f96ebe2e",
    "eagle": "craft-control-eagle-20260927T103120Z-91691a9d",
    "eagle-slow": "craft-control-eagle-slow-20260927T102003Z-60b4ade0",
    "eagle-land": "craft-control-eagle-land-20260927T102006Z-1d662161",
    "eagle-crash": "craft-control-eagle-crash-20260927T102009Z-394138ce",
    "eagle-high": "craft-control-eagle-high-20260927T102012Z-535b3c45",
    "concord-ceiling": "craft-control-concord-ceiling-20260927T102015Z-a9f973f6",
}
COLLISION_RUNS = {
    "limo-crash": "collision-response-poke-500vbl-20260927T102925Z-baf09896",
    "limo-crash-again": "collision-response-poke-640vbl-then-00071000-at-480-20260927T102809Z-572849a9",
    "limo-crash-reverse": "collision-response-poke-640vbl-then-0007f000-at-480-20260927T102826Z-12d6e000",
}

STATE = 0x7900
WORDS = {
    "x": (0x7AB2, "l"), "y": (0x7AB6, "l"), "z": (0x7ABA, "l"),
    "pitch": (0x7AC0, "w"), "yaw": (0x7AC2, "w"), "roll": (0x7ABE, "w"),
    "contact": (0x7ACA, "w"), "supported": (0x7BC8, "w"), "supportLevel": (0x7B02, "w"),
    "turnRate": (0x7970, "u"), "speed": (0x797A, "u"), "throttle": (0x7BAC, "u"),
    "occupancy": (0x7AAE, "w"), "slot": (0x7AB0, "w"), "frame": (0x7AE8, "w"),
}
# The frame's attitude sines $7AD6-$7AE5 (cos and sin of pitch, then of yaw), the float of -Y
# at $79BA, and the pose copy's Y $7A30: what the pass reads besides the words above.
SINES = (0x7AD6, 0x7ADA, 0x7ADE, 0x7AE2)
ALTITUDE, POSE_Y = 0x79BA, 0x7A30


def _word(block: bytes, address: int, base: int = STATE) -> int:
    return struct.unpack_from(">H", block, address - base)[0]


def _long(block: bytes, address: int, base: int = STATE) -> int:
    return struct.unpack_from(">I", block, address - base)[0]


def _signed(value: int) -> int:
    return value - (1 << 32) if value & 0x80000000 else value


def words(block: bytes) -> dict:
    out = {}
    for name, (address, kind) in WORDS.items():
        if kind == "w":
            out[name] = _word(block, address)
        elif kind == "l":
            out[name] = _signed(_long(block, address))
        else:
            out[name] = _long(block, address)
    out["sines"] = [_long(block, a) for a in SINES]
    out["altitude"] = _long(block, ALTITUDE)
    out["poseY"] = _signed(_long(block, POSE_Y))
    return out


def box_lists(supports: bytes) -> dict:
    """The `$CB88` lists from a save of `$CB7A`-`$CE00`: seven-word, then six-word groups."""
    base = 0xCB7A
    word = lambda a: struct.unpack_from(">H", supports, a - base)[0]
    a = 0xCB88
    lists = {"supports": [], "walls": []}
    for key, size in (("supports", 7), ("walls", 6)):
        while not word(a) & 0x8000:
            lists[key].append([word(a + 2 * i) for i in range(size)])
            a += size * 2
        a += 2
    return lists


def find(works: list[Path], name: str) -> Path:
    for work in works:
        if (work / name).is_dir():
            return work / name
    raise SystemExit(f"run {name} is in none of the --work directories")


def export_craft(case: str, run: Path) -> dict:
    """Every stop, with the stop script's pokes applied as the probe's analysis applies them.

    A poke is seen by that stop's pass, except a key in the mailbox, which the dispatcher
    reads in the next frame. A poked Y leaves `$79BA` and the attitude sines as the pose copy
    wrote them before the poke, so a poked stop is marked and a replay may not derive them.
    """
    spec = probe.CASES[case]
    written: dict[int, list[tuple[int, bytes]]] = {0: probe._pokes(spec.get("first", []))}
    for stop, lines in spec["inputs"].items():
        written.setdefault(stop, []).extend(probe._pokes(lines))
    stops = []
    index = 0
    while (run / f"p{index:04d}-state.bin").is_file():
        state = bytearray((run / f"p{index:04d}-state.bin").read_bytes())
        poked = []
        for address, data in written.get(index, []):
            if address == probe.MAILBOX:
                continue
            state[address - STATE:address - STATE + len(data)] = data
            if address != probe.STICK:
                poked.append(address)
        supports = (run / f"p{index:04d}-supports.bin").read_bytes()
        panel = (run / f"p{index:04d}-panel.bin").read_bytes()
        stop = words(bytes(state))
        stop["panelSpeed"] = _signed(struct.unpack_from(">I", panel, 4)[0])
        stop["stick"] = state[probe.STICK - STATE]
        stop["boxes"] = box_lists(supports)
        stop["poked"] = poked
        if poked:
            # What the previous pass left, before this stop's script overwrote it.
            original = words((run / f"p{index:04d}-state.bin").read_bytes())
            stop["observed"] = {k: original[k] for k in stop if k in original and original[k] != stop[k]}
        stops.append(stop)
        index += 1
    # The bound lists change only with the cell bind, so each distinct pair is kept once.
    lists: list[dict] = []
    for stop in stops:
        if stop["boxes"] not in lists:
            lists.append(stop["boxes"])
        stop["boxes"] = lists.index(stop["boxes"])
    return {
        "boxLists": lists,
        "case": case,
        "kind": "passes",
        "run": run.name,
        "stops": stops,
    }


def export_collision(case: str, run: Path) -> dict:
    """One sample per VBL, kept only where a craft word changed."""
    samples = []
    index = 1
    while (run / f"vbl-{index:03d}.block.bin").is_file():
        block = (run / f"vbl-{index:03d}.block.bin").read_bytes()
        sample = words(block)
        sample["panelSpeed"] = None
        sample["stick"] = block[0x79C2 - STATE]
        sample["vbl"] = index
        samples.append(sample)
        index += 1
    keys = ("x", "y", "z", "pitch", "yaw", "roll", "contact", "turnRate", "speed", "throttle")
    kept = []
    for sample in samples:
        if not kept or any(sample[k] != kept[-1][k] for k in keys):
            kept.append(sample)
    return {"case": case, "kind": "vbl-changes", "run": run.name, "stops": kept}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--work", type=Path, action="append", required=True)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for case, name in CRAFT_RUNS.items():
        document = export_craft(case, find(args.work, name))
        (OUT / f"{case}.json").write_text(json.dumps(document, sort_keys=True, separators=(",", ":")) + "\n")
    for case, name in COLLISION_RUNS.items():
        document = export_collision(case, find(args.work, name))
        (OUT / f"{case}.json").write_text(json.dumps(document, sort_keys=True, separators=(",", ":")) + "\n")
    for path in sorted(OUT.glob("*.json")):
        print(path.name, hashlib.sha256(path.read_bytes()).hexdigest()[:16], path.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
