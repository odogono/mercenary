#!/usr/bin/env python3
"""Ground-extent slot and route-list reconstruction check (#281).

Rebuilds, from a run's captured RAM alone, the scene slots the renderer
allocates for ground extents and the deduplicated edge list that names them,
then compares the reconstruction against the live workspaces the same capture
holds. It reads nothing but the pinned RAM, so it is a deterministic check on
the reading recorded in `docs/research/damocles-eris-ground.md`, not a probe.

What it reconstructs:

  own-cell seeds  `$05493E` reads the longword at `$1E000 + cell * 4`, rotates
                  it by the cell transform at `$7B04`, and lays its four bytes
                  down as `$5E40 + $FC`, `+$F8`, `+$F4`, `+$F0`.
  route list      `$054888` picks a (2r+1) square cell window centred on the
                  camera cell, clamped to the `$7BB2` x `$7BB4` grid, with r
                  from `$7B62`. `$05499E` walks that window, collects each
                  cell's two packed corner words without repeats into a list
                  based at `$84DC`, and `$0549D2` assigns each unseen corner
                  byte a slot counting down from `$F0`, writing the byte to
                  `$5E40 + slot` and rewriting the list word as a slot pair.

Invalid-reference checks: every slot a live list word names must be four-byte
aligned, lie in `[$7B56, $FC]`, and carry a nonzero corner byte whose nybbles
land on the grid. A cell's ground extent routinely reaches past the scanned
window, so a corner is not required to be a window cell. The reserved
`$F8`/`$FC` pair is allowed to read zero, which is how an unused own-cell pair
is spelled. A capture taken at radius zero has no route list at all: `$84DC`
still holds raw corner bytes and only the own cell's `$F0`/`$F4` pair is drawn.

Run from the repo root:
  python3 research/damocles-st/scripts/ground-extent-check.py \
    --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d

Output is a JSON report on stdout; the exit status is nonzero if any check
fails. Findings are Working-Authority Evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

# Live workspaces the renderer keeps for the outdoor scene.
CELL = 0x7B5C  # current cell index, (z << 4) | x
TRANSFORM = 0x7B04  # cell transform, drives the $05493E rotation
OWN_CELL_GATE = 0x7B5D  # zero means the own-cell seeds are cleared instead
CAMERA_X = 0x7A2C  # camera cell x
CAMERA_Z = 0x7A34  # camera cell z
GRID_X = 0x7BB2  # grid width in cells
GRID_Z = 0x7BB4  # grid height in cells
RADIUS = 0x7B62  # cached window radius, from the $00915A altitude table
LOWEST_SLOT = 0x7B56  # lowest slot the allocator handed out
LIST_END = 0x7B58  # one past the last edge-list word
LIST_BASE = 0x84DC  # edge list; the first longword is the own cell's
SEED_TABLE = 0x1E000  # 256 authored corner longwords, one per cell
SLOT_SEEDS = 0x5E40  # corner byte for slot s lives at SLOT_SEEDS + s
FIRST_SLOT = 0xF0  # own cell takes $F0..$FC; neighbours count down from $EC


class CheckError(Exception):
    pass


class Ram:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def byte(self, address: int) -> int:
        return self.data[address]

    def word(self, address: int) -> int:
        return struct.unpack_from(">H", self.data, address)[0]

    def signed_word(self, address: int) -> int:
        return struct.unpack_from(">h", self.data, address)[0]

    def long(self, address: int) -> int:
        return struct.unpack_from(">I", self.data, address)[0]


def rotate_own_cell(seed: int, transform: int) -> dict[int, int]:
    """Reproduce $054950-$05497C: rotate the cell longword, then lay its four
    bytes down as slots $FC, $F8, $F4 and $F0 in that order."""

    def swap(value: int) -> int:
        return ((value << 16) | (value >> 16)) & 0xFFFFFFFF

    def ror_low_word(value: int) -> int:
        low = value & 0xFFFF
        return (value & 0xFFFF0000) | ((low >> 8) | ((low & 0xFF) << 8))

    value = seed
    if not transform & 0x4:
        value = swap(value)
    if transform & 0x2:
        value = ror_low_word(value)
    if transform & 0x1:
        value = swap(ror_low_word(swap(value)))
    seeds = {}
    for slot in (0xFC, 0xF8, 0xF4, 0xF0):
        seeds[slot] = (value >> 24) & 0xFF
        value = ((value << 8) | (value >> 24)) & 0xFFFFFFFF
    return seeds


def window(camera: int, grid: int, radius: int) -> tuple[int, int] | None:
    """Reproduce one axis of $054888. Returns (start, count), or None for the
    abort at $5488DA that leaves the route list unbuilt."""
    side = 2 * radius + 1
    position = camera - radius
    if position >= 0:
        if position >= grid:
            return None
        return position, min(grid - position, side)
    count = position + side
    if count <= 0:
        return None
    return 0, min(count, grid)


def build_route_list(ram: Ram, *, cell: int, transform: int, x0: int, columns: int,
                     z0: int, rows: int) -> dict:
    """Reproduce $05499E and $0549D2 over the chosen window."""
    own = ram.long(SEED_TABLE + 4 * cell)
    # $05494E writes the unrotated own-cell longword as the first two list
    # words, so the dedup search at $054A52 already holds them.
    words = [(own >> 16) & 0xFFFF, own & 0xFFFF]
    if not rows or not columns:
        # $05497E: a zero radius skips the whole route list. $84DC keeps the raw
        # own-cell corner bytes, unrewritten, and only the own cell's $F0/$F4
        # pair is drawn, at $054B02.
        return {"words": words, "seeds": rotate_own_cell(own, transform),
                "lowest": FIRST_SLOT, "built": False}
    for row in range(rows):
        for column in range(columns):
            index = ((z0 + row) << 4) | (x0 + column)
            value = ram.long(SEED_TABLE + 4 * index)
            for word in (value & 0xFFFF, (value >> 16) & 0xFFFF):
                if word and word not in words:
                    words.append(word)

    own_seeds = rotate_own_cell(own, transform)
    slot_of = {seed: slot for slot, seed in own_seeds.items() if seed}
    seeds = dict(own_seeds)
    next_slot = FIRST_SLOT
    pairs = []
    for word in words:
        if not word:
            pairs.append(0)
            continue
        assigned = []
        for corner in ((word >> 8) & 0xFF, word & 0xFF):
            if corner not in slot_of:
                next_slot -= 4
                slot_of[corner] = next_slot
                seeds[next_slot] = corner
            assigned.append(slot_of[corner])
        pairs.append((assigned[0] << 8) | assigned[1])
    return {"words": pairs, "seeds": seeds, "lowest": next_slot, "built": True}


def check(ram: Ram) -> dict:
    cell = ram.word(CELL)
    transform = ram.word(TRANSFORM)
    # $054896 subtracts the radius and tests with bpl, so the camera cell is
    # read signed: a camera off the negative edge of the grid aborts the build.
    camera = (ram.signed_word(CAMERA_X), ram.signed_word(CAMERA_Z))
    grid = (ram.word(GRID_X), ram.word(GRID_Z))
    radius = ram.byte(RADIUS)
    if not ram.byte(OWN_CELL_GATE):
        raise CheckError(
            f"$7B5D is zero in this capture: the own-cell seeds are cleared at "
            f"$054930 and there is no ground-extent list to check"
        )

    span_x = window(camera[0], grid[0], radius)
    span_z = window(camera[1], grid[1], radius)
    aborted = span_x is None or span_z is None
    x0, columns = span_x or (0, 0)
    z0, rows = span_z or (0, 0)
    if aborted or not radius:
        # $5488DA zeroes the radius when the camera window misses the grid, and
        # $05497E tests that radius rather than the window, so either way the
        # route list is left unbuilt.
        columns = rows = 0

    rebuilt = build_route_list(ram, cell=cell, transform=transform,
                               x0=x0, columns=columns, z0=z0, rows=rows)

    end = ram.long(LIST_END) & 0xFFFFFF
    live_words = [ram.word(address) for address in range(LIST_BASE, end, 2)]
    live_lowest = ram.word(LOWEST_SLOT)

    checks = []

    def record(name: str, ok: bool, detail: str) -> None:
        checks.append({"check": name, "pass": bool(ok), "detail": detail})

    record(
        "own-cell-seeds",
        all(ram.byte(SLOT_SEEDS + slot) == seed
            for slot, seed in rotate_own_cell(ram.long(SEED_TABLE + 4 * cell), transform).items()),
        "rotated $1E000 cell longword matches the live $5E40 bytes for $F0-$FC",
    )
    record(
        "route-list-words",
        live_words == rebuilt["words"],
        f"reconstructed {len(rebuilt['words'])} slot-pair words against "
        f"{len(live_words)} live words at ${LIST_BASE:04X}-${end:04X}",
    )
    record(
        "lowest-slot",
        live_lowest == rebuilt["lowest"],
        f"live $7B56 = ${live_lowest:02X}, reconstructed ${rebuilt['lowest']:02X}",
    )
    record(
        "slot-seed-bytes",
        all(ram.byte(SLOT_SEEDS + slot) == seed for slot, seed in rebuilt["seeds"].items()),
        f"every one of {len(rebuilt['seeds'])} allocated slots carries its "
        f"reconstructed corner byte at $5E40 + slot",
    )

    # Invalid-reference checks over the live list, independent of the rebuild.
    # They only apply once $0549D2 has rewritten the list into slot pairs; with
    # the route list unbuilt, $84DC still holds raw corner bytes.
    invalid = []
    for address in range(LIST_BASE, end, 2) if rebuilt["built"] else ():
        word = ram.word(address)
        if not word:
            continue
        for slot in ((word >> 8) & 0xFF, word & 0xFF):
            if slot % 4:
                invalid.append(f"${address:04X} names unaligned slot ${slot:02X}")
                continue
            if not live_lowest <= slot <= 0xFC:
                invalid.append(f"${address:04X} names slot ${slot:02X} outside "
                               f"${live_lowest:02X}-$FC")
                continue
            corner = ram.byte(SLOT_SEEDS + slot)
            if not corner and slot not in (0xF8, 0xFC):
                invalid.append(f"slot ${slot:02X} has a zero corner byte")
                continue
            # A corner byte names a world grid corner, not a window cell: a
            # cell's ground extent routinely reaches past the scanned window,
            # which is why $F0 in the pinned capture reads (11,8) for a window
            # ending at x = 10. It must still land on the grid.
            x, z = corner & 0xF, corner >> 4
            if not (x < grid[0] and z < grid[1]):
                invalid.append(f"slot ${slot:02X} corner ({x},{z}) is off the "
                               f"{grid[0]}x{grid[1]} grid")
    record("invalid-references", not invalid, "; ".join(invalid) or
           ("every live list slot is aligned, in range, and names an on-grid corner"
            if rebuilt["built"] else
            "route list unbuilt at this radius; $84DC holds raw corner bytes"))

    return {
        "schemaVersion": 1,
        "evidenceClass": "working-authority-evidence",
        "scene": {
            "cell": f"0x{cell:02x}",
            "transform": f"0x{transform:04x}",
            "cameraCell": {"x": camera[0], "z": camera[1]},
            "grid": {"x": grid[0], "z": grid[1]},
            "radius": radius,
            "routeList": "built" if rebuilt["built"] else
                         ("unbuilt: camera window misses the grid" if aborted
                          else "unbuilt: radius zero"),
            "window": ({"x": [x0, x0 + columns - 1], "z": [z0, z0 + rows - 1]}
                       if rebuilt["built"] else None),
        },
        "slots": {
            "lowest": f"0x{live_lowest:02x}",
            "allocated": len(rebuilt["seeds"]),
            "edges": sum(1 for word in live_words if word),
        },
        "checks": checks,
        "pass": all(entry["pass"] for entry in checks),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", required=True, type=Path,
                        help="observation run directory holding the captured RAM")
    parser.add_argument("--prefix", default="observed",
                        help="capture prefix inside the run (default: observed)")
    arguments = parser.parse_args(argv)

    path = arguments.run / f"{arguments.prefix}.ram"
    if not path.is_file():
        print(f"no captured RAM at {path}", file=sys.stderr)
        return 2
    data = path.read_bytes()
    if len(data) < 0x100000:
        print(f"{path} is {len(data)} bytes; a full ST RAM capture is expected",
              file=sys.stderr)
        return 2

    try:
        report = check(Ram(data))
    except CheckError as error:
        print(json.dumps({"schemaVersion": 1, "pass": False, "error": str(error)},
                         indent=2, sort_keys=True))
        return 1
    report["sourceRam"] = {
        "path": str(path),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
