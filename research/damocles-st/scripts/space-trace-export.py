#!/usr/bin/env python3
"""Export the traced Damocles launch and space flights as Golden Traces for the port (#566).

The space-flight runs of #558 stop at the start of every craft pass and save low RAM, the panel
and the tables. They stay ignored Restricted Material under `research/damocles-st/work/`. This
reads four of them and writes, for each case, only the program words the launch, the swing, the
space entry, the space pass and the range scan read and write -- the craft words, the space
words, the stick, the key the stop wrote, the attitude sines and the Body table -- to
`traces/damocles/space/<case>.json`, which ADR 0029 tracks. No program code or table is copied.

    PYTHONPATH=research/damocles-st python3 research/damocles-st/scripts/space-trace-export.py \\
        --work <work dir>...

Each `--work` is searched for the run directories named below, so a run recorded in another
checkout can be read in place.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("space_flight_probe", HERE / "space-flight-probe.py")
probe = importlib.util.module_from_spec(_spec)
sys.modules["space_flight_probe"] = probe
_spec.loader.exec_module(probe)
ccp = probe.ccp

ROOT = HERE.parents[2]
OUT = ROOT / "traces" / "damocles" / "space"

RUNS = {
    "launch": "space-flight-launch-20260928T094428Z-b53db7cd",
    "steer": "space-flight-steer-20260928T094551Z-6a3cd78e",
    "return": "space-flight-return-20260928T094617Z-e6b4b79c",
    "cross": "space-flight-cross-20260928T094644Z-a1cc495e",
}

# name: (address, kind), kind "w" an unsigned word, "l" a signed long, "u" an unsigned long.
WORDS = {
    "x": (ccp.X, "l"), "y": (ccp.Y, "l"), "z": (ccp.Z, "l"),
    "pitch": (ccp.PITCH, "w"), "yaw": (ccp.YAW, "w"), "roll": (ccp.ROLL, "w"),
    "contact": (ccp.CONTACT, "w"), "supported": (ccp.SUPPORTED, "w"),
    "supportLevel": (ccp.SUPPORT_LEVEL, "w"),
    "turnRate": (ccp.TURN_RATE, "u"), "speed": (ccp.SPEED, "u"), "throttle": (ccp.THROTTLE, "u"),
    "occupancy": (probe.OCCUPANCY, "w"), "slot": (ccp.SLOT, "w"), "frame": (ccp.FRAMES_DRAWN, "w"),
    "swing": (probe.POST_LAUNCH, "w"), "hold": (probe.ARRIVAL_WAIT, "w"),
    "arrival": (probe.ARRIVAL, "w"), "nearest": (probe.NEAREST, "u"),
    "destination": (probe.DESTINATION, "u"), "range": (probe.RANGE, "u"),
    "pitchRate": (probe.PITCH_RATE, "u"), "dilation": (probe.DILATION, "w"),
    "spaceX": (probe.SPACE_X, "l"), "spaceY": (probe.SPACE_Y, "l"), "spaceZ": (probe.SPACE_Z, "l"),
    "altitude": (ccp.ALTITUDE, "u"), "poseY": (0x7A30, "l"),
    # The landing point's longitude $7A1E and latitude $7A22, and the terminator word $79BE
    # the landing writes (#567).
    "longitude": (0x7A1E, "w"), "latitude": (0x7A22, "w"), "terminator": (0x79BE, "w"),
}
# The frame's attitude sines $7AD6-$7AE5: cos and sin of pitch, then of yaw.
SINES = (ccp.COS_PITCH, ccp.SIN_PITCH, ccp.COS_YAW, ccp.SIN_YAW)
# The Body table the range scan walks, from the offset at $7C0E down to 0.
BODY_X, BODY_Y, BODY_Z, BODY_EXTENT = 0x5F40, 0x626A, 0x5FC0, 0x6040
LAST_BODY = 0x7C0E
# Every Body's rotation accumulator, which the landing reads for its destination (#567). It
# moves every VBL, so it is carried only on the stop before a landing.
BODY_TURN = 0x62EA


def words(ram: bytes) -> dict:
    out = {}
    for name, (address, kind) in WORDS.items():
        if kind == "w":
            out[name] = struct.unpack_from(">H", ram, address)[0]
        elif kind == "l":
            out[name] = struct.unpack_from(">i", ram, address)[0]
        else:
            out[name] = struct.unpack_from(">I", ram, address)[0]
    out["sines"] = [struct.unpack_from(">I", ram, a)[0] for a in SINES]
    out["panelSpeed"] = struct.unpack_from(">i", ram, ccp.PANEL_SPEED)[0]
    out["stick"] = ram[ccp.STICK]
    return out


def bodies(ram: bytes) -> list[list[int]]:
    last = struct.unpack_from(">I", ram, LAST_BODY)[0]
    return [[struct.unpack_from(">i", ram, BODY_X + a0)[0], struct.unpack_from(">i", ram, BODY_Y + a0)[0],
             struct.unpack_from(">i", ram, BODY_Z + a0)[0], struct.unpack_from(">I", ram, BODY_EXTENT + a0)[0]]
            for a0 in range(0, last + 4, 4)]


def turns(ram: bytes) -> list[int]:
    last = struct.unpack_from(">I", ram, LAST_BODY)[0]
    return [struct.unpack_from(">I", ram, BODY_TURN + a0)[0] for a0 in range(0, last + 4, 4)]


def find(works: list[Path], name: str) -> Path:
    for work in works:
        if (work / name).is_dir():
            return work / name
    raise SystemExit(f"run {name} is in none of the --work directories")


def export(case: str, run: Path) -> dict:
    """Every stop, with the stop script's stick pokes applied as the probe's analysis applies
    them. A key written to the mailbox is recorded as `key`: its handler runs after that
    stop's pass, so its words appear at the next stop."""
    spec = probe.CASES[case]
    written: dict[int, list[tuple[int, bytes]]] = {}
    for stop, lines in spec["inputs"].items():
        written.setdefault(int(stop), []).extend(ccp._pokes(lines))
    stops, tables = [], []
    loaded = probe.load_stops(run)
    for index, raw in enumerate(loaded):
        ram = bytearray(raw)
        key = None
        for address, data in written.get(index, []):
            if address == ccp.MAILBOX:
                key = data[0]
                continue
            if address != ccp.STICK:
                raise SystemExit(f"{case} stop {index} pokes ${address:X}, which the export does not carry")
            ram[address:address + len(data)] = data
        stop = words(bytes(ram))
        stop["key"] = key
        table = bodies(bytes(ram))
        if table not in tables:
            tables.append(table)
        stop["bodies"] = tables.index(table)
        after = loaded[index + 1] if index + 1 < len(loaded) else None
        if after is not None and stop["occupancy"] == 2 and struct.unpack_from(">H", after, probe.OCCUPANCY)[0] == 0:
            stop["turns"] = turns(bytes(ram))
        stops.append(stop)
    return {"bodyTables": tables, "case": case, "run": run.name, "stops": stops}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--work", type=Path, action="append", required=True)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for case, name in RUNS.items():
        document = export(case, find(args.work, name))
        (OUT / f"{case}.json").write_text(json.dumps(document, sort_keys=True, separators=(",", ":")) + "\n")
    for path in sorted(OUT.glob("*.json")):
        print(path.name, hashlib.sha256(path.read_bytes()).hexdigest()[:16], path.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
