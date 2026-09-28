#!/usr/bin/env python3
"""The Damocles starfields: aboard (``$0503FE``), on foot (``$0505B8``) and in space
(``$05067C``) (#578).

All three draw one pixel per star from a static list at ``$5D8C0``. The list opens with
1,024 words, one per yaw step, each the byte offset of that step's first star. The stars
follow as word pairs sorted by x. A star's first word is its x, 1,800 to a turn. Its second
word holds its row in the low bits and its colour index in bits 10–13.

``capture`` extends the #558 ``cross`` case past stop 300, over LACHESIS at night. It pokes
the craft's pitch ``$7AC0`` to reach every pitch gate, then patches the view's roll load to
reach the roll shear, and takes two Hatari screenshots after each change. ``check`` compares
a transcription of the three routines with every screenshot it is given: this probe's own
frames, the #573 frames, or the on-foot frames of #528's ``sky-body-probe.py``
(``lonNNNN.ram`` beside ``lonNNNN.png``).

Run from the repository root:

  python3 research/damocles-st/scripts/starfield-probe.py decode
  python3 research/damocles-st/scripts/starfield-probe.py capture --roms roms
  python3 research/damocles-st/scripts/starfield-probe.py check --run <run-directory> [--run ...]

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("space_flight_probe", HERE / "space-flight-probe.py")
sfp = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
sys.modules["space_flight_probe"] = sfp
_spec.loader.exec_module(sfp)

u16, s16, u32, s32 = sfp.u16, sfp.s16, sfp.u32, sfp.s32
_sx16, _sx32 = sfp._sx16, sfp._sx32

PINNED = HERE.parent / "work" / "observe-first-world-20260818T101013Z-c5a32b7d" / "observed.ram"

STARS = 0x5D8C0  # 1,024 index words, then the stars
STAR_COUNT = 1_600  # stars with x below one turn; the next 268 repeat x 0..319 one turn on
TURN_COLUMNS = 1_800
COLOURS = 0x50778  # 16 longs; the low word is the colour a star index draws in
SLOTS = 0x50738  # 16 longs the routines fill with each colour's palette slot, times 4

CRAFT_PITCH = 0x7AC0
ROLL_LOAD = 0x055F72
ROLL_LOAD_CODE = "32387a9e"  # move.w $7A9E.w,d1
ROLL_TAN = 0x797E  # float: tan roll, written by $055F72..$055FCC
ROLL, PITCH, YAW = 0x7A9E, 0x7AA0, 0x7AA2
ATMOSPHERE = 0x794D  # byte
DAY = 0x7A4E  # word
SKY = 0x7C86
SURFACE_ANSWER = 0x78A6
ON_FOOT = 0x7AAA
OCCUPANCY = 0x7AAE  # 2 in space
SPACE_SKY = 0x001  # $0598CC: slot 8 in space
CLIP_ROW = 0x042C74

# Half-open ranges the note quotes.
RANGES = {
    "zenith": (0x0502BE, 0x0503FE),
    "aboard": (0x0503FE, 0x050562),
    "on-foot": (0x0505B8, 0x05067C),
    "space": (0x05067C, 0x050738),
    "space-frame": (0x0598C8, 0x059900),
    "colours": (0x050778, 0x0507B8),
    "roll-tan": (0x055F60, 0x055FD4),
    "island-draw": (0x056516, 0x0565E4),
    "star-list": (STARS, STARS + 2 * 1_024 + 4 * 1_868),
}

CODE_FACTS = {
    0x050412: ("0c4700c0", "aboard: below pitch $C0 only the zenith pass"),
    0x05041A: ("0c470140", "below $140 the zenith pass, then the main pass"),
    0x050420: ("0c470244", "below $244 the main pass alone"),
    0x050426: ("0c4703bc", "from $3BC the zenith pass; between $244 and $3BC neither"),
    0x050504: ("cafce10e", "x scroll: yaw * 2 * $E10E >> 16, 1,800 columns a turn"),
    0x050516: ("04440128", "pitch offset $128"),
    0x05051E: ("c9fc6ccc", "pitch scale: (pitch - $128) * 4 * $6CCC >> 16"),
    0x05052A: ("363c03ff", "aboard rows wrap at 1,024"),
    0x050650: ("363c01ff", "on foot rows wrap at 512"),
    ROLL_LOAD: (ROLL_LOAD_CODE, "the view trig loads the roll with a four-byte move.w"),
    0x05037A: ("2a3c00000200", "zenith pass: yaw + $200"),
    0x0503B8: ("367c0088", "zenith pass: rows to 136"),
    0x0503EA: ("4440d0464641d24b", "zenith pass: column and row mirrored"),
    0x0505B8: ("4a38794d67064a787a4e66f2", "on foot: nothing by day on a Body with an atmosphere"),
    0x059816: ("4eb9000505b8", "the on-foot branch calls $0505B8"),
    0x05984E: ("4eb9000503fe", "the flight branch calls $0503FE"),
    0x0598CC: ("317c00010010", "in space slot 8 is $001"),
    0x0598FA: ("4eb90005067c", "the space frame calls $05067C"),
    0x0506F6: ("044401c0", "space: pitch offset $1C0"),
    0x05070A: ("363c01ff", "space: rows wrap at 512"),
    0x0560F2: ("4a787a30662e4a7878a66628", "$0560F2 returns early only on the core with Y's high word 0"),
}

# Past stop 300 the craft is flying level over LACHESIS at night (pitch 487, roll 0). Each
# poke is followed by two screenshots. The pitch is the craft's `$7AC0`. This craft's pass
# holds its roll `$7ABE` at 0 (a poke does not take), so the roll is patched into the view
# instead: `$055F72` `move.w $7A9E,d1` becomes `move.w #roll,d1`, the same four bytes, and every
# view term the frame takes from the roll (`$797E`, `$7982`, `$42C08`, `$42C0C`) follows it.
ATTITUDES = (
    (302, {"pitch": 0x0190}),
    (306, {"pitch": 0x0104}),
    (310, {"pitch": 0x0096}),
    (314, {"pitch": 0x03E8}),
    (318, {"pitch": 0x0258}),
    (322, {"pitch": 0x01E7, "roll": 0x0018}),
    (326, {"roll": 0xFFE0}),
    (330, {"roll": 0x0040}),
    (334, {"roll": None}),
)
SHOT_DELAY = 2

SHOT_SCALE, SHOT_LEFT, SHOT_TOP = 2, 96, 58
VIEW_ROWS, VIEW_COLUMNS = 136, 320


def pinned() -> bytes:
    return PINNED.read_bytes()


def sha(data: bytes, span: tuple[int, int]) -> str:
    return hashlib.sha256(data[span[0]:span[1]]).hexdigest()


def star_list(data: bytes) -> tuple[list[int], list[tuple[int, int]]]:
    index = [u16(data, STARS + 2 * step) for step in range(1_024)]
    stars = [(u16(data, a), u16(data, a + 2)) for a in range(STARS + 2_048, STARS + 2_048 + 4 * 1_868, 4)]
    return index, stars


def decode() -> dict[str, Any]:
    data = pinned()
    for address, (hexwords, meaning) in CODE_FACTS.items():
        sfp._check(data[address:address + len(hexwords) // 2].hex() == hexwords, f"${address:06X}: {meaning}")
    index, stars = star_list(data)
    for step, offset in enumerate(index):
        first = (offset - 2_048) // 4
        scroll = (step * 2 * 0xE10E) >> 16
        sfp._check(offset % 4 == 0 and all(x < scroll for x, _ in stars[:first]) and stars[first][0] >= scroll,
                   f"yaw {step}: the index is not the first star at or past column {scroll}")
    sfp._check([x for x, _ in stars] == sorted(x for x, _ in stars), "the star list is not sorted by x")
    sfp._check(sum(1 for x, _ in stars if x < TURN_COLUMNS) == STAR_COUNT, "not 1,600 stars in one turn")
    sfp._check(stars[STAR_COUNT:] == [(x + TURN_COLUMNS, y) for x, y in stars[:len(stars) - STAR_COUNT]],
               "the stars past one turn do not repeat the first ones")
    sfp._check(stars[-1][0] <= 319 + ((1_023 * 2 * 0xE10E) >> 16) < u16(data, STARS + 2_048 + 4 * 1_868),
               "the list does not end past the last column any yaw reads")
    sfp._check(all(y & 0xC200 == 0 for _, y in stars), "a star word uses bit 9, 14 or 15")
    colours = [u16(data, COLOURS + 4 * i + 2) for i in range(16)]
    return {
        "ram": {"path": str(PINNED), "sha256": hashlib.sha256(data).hexdigest()},
        "ranges": {name: {"start": f"${a:06X}", "end": f"${b:06X}", "sha256": sha(data, (a, b))}
                   for name, (a, b) in RANGES.items()},
        "stars": STAR_COUNT,
        "rows": [min(y & 0x3FF for _, y in stars), max(y & 0x3FF for _, y in stars)],
        "colours": [f"${c:03X}" for c in colours],
        "colourCounts": [sum(1 for x, y in stars[:STAR_COUNT] if (y >> 10) & 15 == i) for i in range(16)],
    }


def fixed(f: int) -> int:
    """``$050434``–``$05049C``: the float ``f`` times 65,536 as a long, rounded, saturating."""
    d0 = (f + 0x100000) & 0xFFFFFFFF
    if _sx32(d0) < 0:
        if ((d0 >> 16) + 1) & 0xFFFF == 0:
            return 1 if _sx16(d0) >= 0 else -1
        return 0
    shift = _sx16(29 - (d0 >> 16))
    if shift < 0:
        if shift == -1:
            placed = _sx16(d0) * 4 * 0x10000
            if -2**31 <= placed < 2**31:
                return _sx32(placed & 0xFFFC0000)
        return 0x7FFFFFFF if _sx16(d0) >= 0 else -0x80000000
    placed = _sx32(((d0 * 2) & 0xFFFF) << 16)
    carry = (placed >> (shift - 1)) & 1 if shift > 0 else 0
    return (placed >> shift) + carry


def stars_drawn(data: bytes, ram: bytes) -> list[tuple[int, int, int]]:
    """Every star pixel one frame plots, in plot order: (column, row, colour word).

    ``data`` holds the program (the list and colours), ``ram`` the frame's words.
    """
    index, stars = star_list(data)
    colours = [u16(data, COLOURS + 4 * i + 2) for i in range(16)]
    in_space = u16(ram, OCCUPANCY) == 2
    if not in_space and ram[ATMOSPHERE] != 0 and u16(ram, DAY) != 0:
        return []
    on_foot = u16(ram, SURFACE_ANSWER) == 0 and u16(ram, ON_FOOT) != 0
    yaw, pitch = u16(ram, YAW), u16(ram, PITCH)
    slope = _sx16(fixed(u32(ram, ROLL_TAN)))
    out: list[tuple[int, int, int]] = []

    def run(step: int, level: int, mask: int, limit: int, shear: bool, mirror: bool,
            offset: int = 0x128) -> None:
        step &= 0x3FF
        first = (index[step] - 2_048) // 4
        scroll = (step * 2 * 0xE10E) >> 16
        drop = (_sx16(((level & 0x3FF) - offset) * 4) * 0x6CCC) >> 16
        for x, word in stars[first:]:
            c = 319 - x + scroll
            if c < 0:
                break
            row = ((((slope * (c - 160)) >> 16) if shear else 0) + word) & mask
            row = (row - drop) & 0xFFFF
            if row >= limit:
                continue
            colour = colours[(word >> 10) & 15]
            # $4FF98 plots column d0 from the right: bit (d0 & 7), counted from the right.
            if mirror:
                out.append((c, 135 - row, colour))
            else:
                out.append((319 - c, row, colour))

    if in_space:
        run(yaw, pitch, 0x1FF, 0x88, False, False, 0x1C0)
        return out
    if on_foot:
        run(yaw, pitch, 0x1FF, u16(ram, CLIP_ROW), False, False)
        return out
    p = pitch & 0x3FF
    if p < 0x140 or p >= 0x3BC:
        run(yaw + 0x200, 0x200 - pitch, 0x3FF, 0x88, True, True)
    if 0xC0 <= p < 0x244:
        # $050524: the main pass stops at the clip row, 68 on foot off a core. A chain stop
        # does not save $042C74; aboard it is $88.
        run(yaw, pitch, 0x3FF, u16(ram, CLIP_ROW) or 0x88, True, False)
    return out


def capture(roms: Path | None, settle: float) -> Path:
    case = dict(sfp.CASES["cross"])
    last = max(stop for stop, _ in ATTITUDES) + SHOT_DELAY
    case["stops"] = last + 1
    extra: dict[int, list[str]] = {}
    for stop, words in ATTITUDES:
        lines = extra.setdefault(stop, [])
        if "pitch" in words:
            value = words["pitch"]
            lines.append(f"w ${CRAFT_PITCH:x} ${value >> 8:02x} ${value & 0xFF:02x}")
        if "roll" in words:
            value = words["roll"]
            code = ROLL_LOAD_CODE if value is None else f"323c{value:04x}"  # move.w #roll,d1
            lines.append(f"w ${ROLL_LOAD:x} " + " ".join(f"${code[i:i + 2]}" for i in range(0, 8, 2)))
        for delay in (SHOT_DELAY - 1, SHOT_DELAY):
            extra.setdefault(stop + delay, []).append(f"screenshot {{run}}/shot-{stop + delay:05d}.png")
    extra.setdefault(300, []).append("screenshot {run}/shot-00300.png")
    write_chain = sfp._write_chain

    def with_shots(run: Path, stops: int, first: list[str], inputs: dict[int, list[str]]) -> None:
        lines = {stop: [line.format(run=run.resolve()) for line in lines] for stop, lines in extra.items()}
        write_chain(run, stops, first, sfp._merge(inputs, lines))

    sfp._write_chain = with_shots
    sfp.CASES["starfield"] = case
    return sfp.run_case(roms, "starfield", settle)


def screenshot(path: Path) -> dict[tuple[int, int], tuple[int, int, int]]:
    width = int(subprocess.run(["magick", "identify", "-format", "%w", str(path)],
                               check=True, capture_output=True, text=True).stdout)
    raw = subprocess.run(["magick", str(path), "-depth", "8", "rgb:-"], check=True, capture_output=True).stdout
    pixels = {}
    for row in range(VIEW_ROWS):
        for column in range(VIEW_COLUMNS):
            offset = 3 * ((SHOT_TOP + row * SHOT_SCALE) * width + SHOT_LEFT + column * SHOT_SCALE)
            pixels[(column, row)] = tuple(raw[offset:offset + 3])
    return pixels


def st_rgb(word: int) -> tuple[int, int, int]:
    return tuple(((word >> shift) & 7) * 34 for shift in (8, 4, 0))


def frames(run: Path) -> list[tuple[Path, list[tuple[str, bytes]]]]:
    """Each screenshot with the RAM its frame could have been drawn from.

    A chain stop saves RAM at the craft dispatch, and the screen it shows was drawn in the
    pass before, so its words are the previous stop's. The landing pass is the exception: the
    space frame is drawn, then ``$059268`` lands the craft at the end of it, so its stop reads
    "aboard" while the screen still shows space.
    """
    out = []
    for shot in sorted(run.glob("shot-*.png")):
        stop = int(shot.stem.split("-")[1])
        candidates = []
        for label, k in (("previous stop", stop - 1), ("same stop", stop), ("two stops back", stop - 2)):
            ram = sfp._read_stop(run, k)
            if ram is None:
                continue
            candidates.append((label, ram))
            before = sfp._read_stop(run, k - 1)
            if before is not None and u16(before, OCCUPANCY) == 2 and u16(ram, OCCUPANCY) != 2:
                landing = bytearray(ram)
                landing[OCCUPANCY:OCCUPANCY + 2] = b"\x00\x02"
                candidates.append((f"{label}, drawn before the landing", bytes(landing)))
        if candidates:
            out.append((shot, candidates))
    for shot in sorted(run.glob("lon*.png")):
        ram = shot.with_suffix(".ram")
        if ram.is_file():
            out.append((shot, [("capture", ram.read_bytes())]))
    return out


def compare(data: bytes, shot: Path, ram: bytes) -> dict[str, Any]:
    pixels = screenshot(shot)
    sky = st_rgb(SPACE_SKY if u16(ram, OCCUPANCY) == 2 else u16(ram, SKY))
    final: dict[tuple[int, int], int] = {}
    for column, row, colour in stars_drawn(data, ram):
        final[(column, row)] = colour

    def isolated(point: tuple[int, int]) -> bool:
        column, row = point
        near = ((column - 1, row), (column + 1, row), (column, row - 1), (column, row + 1))
        return all(pixels[n] == sky for n in near if n in pixels)

    # A star pixel is isolated in the sky. Bodies, the ground and structures cover stars, so
    # a predicted star may be hidden, but it may never show the sky.
    lone = {p for p, v in pixels.items() if v != sky and isolated(p)}
    return {
        "predicted": len(final),
        "shown": sum(1 for p, c in final.items() if pixels[p] == st_rgb(c)),
        "showingSky": sum(1 for p in final if pixels[p] == sky),
        "isolated": len(lone),
        "isolatedUnpredicted": len(lone - set(final)),
        "isolatedWrongColour": sum(1 for p in lone & set(final) if pixels[p] != st_rgb(final[p])),
    }


def check(runs: list[Path]) -> dict[str, Any]:
    data = pinned()
    result = []
    for run in runs:
        for shot, candidates in frames(run):
            best = None
            for label, ram in candidates:
                got = compare(data, shot, ram)
                # The words that explain the most lone star pixels with the fewest misses. A wrong
                # sky colour finds no lone pixels at all, so misses alone would favour it.
                score = (got["showingSky"] + got["isolatedUnpredicted"] + got["isolatedWrongColour"]
                         - got["isolated"])
                if best is None or score < best[0]:
                    best = (score, label, ram, got)
            assert best is not None
            _, label, ram, got = best
            result.append({
                "run": run.name,
                "frame": shot.name,
                "wordsFrom": label,
                "roll": u16(ram, ROLL),
                "pitch": u16(ram, PITCH),
                "yaw": u16(ram, YAW),
                "onFoot": u16(ram, SURFACE_ANSWER) == 0 and u16(ram, ON_FOOT) != 0,
                "day": ram[ATMOSPHERE] != 0 and u16(ram, DAY) != 0,
                "sky": f"${u16(ram, SKY):03X}",
                "frameSha256": hashlib.sha256(shot.read_bytes()).hexdigest(),
                **got,
            })
    return {"frames": result}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("decode")
    cap = sub.add_parser("capture")
    cap.add_argument("--roms", type=Path)
    cap.add_argument("--settle", type=float, default=2.0)
    chk = sub.add_parser("check")
    chk.add_argument("--run", type=Path, action="append", required=True)
    args = parser.parse_args()
    if args.command == "decode":
        print(json.dumps(decode(), indent=2))
    elif args.command == "capture":
        run = capture(args.roms, args.settle)
        print(run)
        print(json.dumps(check([run]), indent=2))
    else:
        print(json.dumps(check(args.run), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
