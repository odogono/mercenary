#!/usr/bin/env python3
"""Damocles Floor Label draw-site probe (#473).

Two halves, both gated: a capture the decode does not reproduce raises.

``decode`` reads every memstate without Hatari. For each capture standing in a
structure it finds the structure the game assembled (the one whose association
root is the live ``$7B0E``), rebuilds the wall-text table ``$059E98`` writes at
``$C8C0`` from that structure's post-plan records and the live placement scale
``$79B6``/``$79B8``, and raises unless the capture's own table matches byte for
byte. It also raises unless both ``$CCA0`` token pointers for ``$80`` and ``$81``
name ``$CD04``, ``$CD04`` holds the label the Floor at ``$7AC4`` prints, and the
Catalogue publishes exactly the table's ``$CD04`` records for that structure.

``live`` boots one rehosted memstate and arms a breakpoint on ``$054098``, the
``$CCA0`` index in the text renderer, with ``d0 < 8``: tokens ``$80`` and ``$81``.
When it fires it saves all RAM and reads the text pointer the renderer pushed,
the draw-list entry that led there and the ``$C8C0`` entry it names. Nothing is
written into the guest. A breakpoint that does not fire raises as *not reached*.

Run from the repository root:

  python3 research/damocles-st/scripts/floor-label-probe.py decode
  python3 research/damocles-st/scripts/floor-label-probe.py live --roms roms --case lift
  python3 research/damocles-st/scripts/floor-label-probe.py live --roms roms --case lift-ride

Generated evidence stays below the laboratory's ignored ``work/`` directory.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import struct
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import (  # noqa: E402
    FLOOR_LABEL_TARGET,
    FONT_FALLBACK,
    Reader,
    append_vector_text,
    authored_entrance_control,
    decode_structure,
    decode_structure_selection,
    entrance_constructor,
    floor_label_token,
    hatari_memstate_ram,
    palette_at,
    read_catalogue,
    read_wall_text,
    s32,
    u32,
    wall_text_placement,
)
from damocleslab.core import LabError, file_hash, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    WORK_ROOT,
    _fifo_send,
    _run_id,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

SNAPSHOTS = LAB_ROOT / "snapshots"
CATALOGUE = LAB_ROOT.parents[1] / "payload" / "damocles" / "catalogue.json"

STRUCTURE_TABLE = 0x4BD0C  # long: base of the structure slot table ($059D74)
ROOT = 0x7B0E  # long: the assembled structure's association-list root
FLOOR = 0x7AC4
PLACEMENT_SCALE = 0x79B6  # two words: X and Z, read by $059D7E/$059D82
WALL_TEXT = 0xC8C0  # 20-byte entries: face byte x 4, then the 18-byte text block
TOKENS = 0xCCA0
DRAW_LIST = 0x8732
TOKEN_INDEX_PC = 0x054098  # movea.l (a0,d0.w),a0: d0 = token x 4 for $80..$98

# The two captures #473 names, and the Floor each must stand on.
REQUIRED = {"damocles.eris.lift": 0, "damocles.vesta.transporter": 10}


def expected_label(floor: int) -> int:
    return ord("G") if floor == 0 else ord("B") if floor == 10 else ord("0") + floor


def post_plan_texts(ram: bytes, record: int) -> list[dict[str, Any]]:
    """Walk the post-plan list the way $059E9E does, keeping each wall text's address."""
    mesh, _ = decode_structure(ram, record, palette_at(ram, 0), hardware(ram), (1, 1), 48)
    reader = Reader(ram, mesh["sourceEnd"] - 2)
    texts = []
    for _ in range(64):
        command = reader.word()
        if command == 0:
            return texts
        if authored_entrance_control(command) is not None:
            leaves = entrance_constructor(command)["leafCount"]
            reader.take(8 + 6 + (2 if leaves == 2 else 0) + 8)
            continue
        if not 1 <= command & 0xFF < 0x10:
            raise LabError(f"unknown post-plan control ${command:04X} in ${record:06X}")
        start = reader.p
        text = read_wall_text(reader, command)
        # The text starts after the 2+8+2+2-byte header that follows the control.
        text["textAddress"] = start + 14
        texts.append(text)
    raise LabError(f"post-plan list terminator missing in ${record:06X}")


def hardware(ram: bytes) -> list[int]:
    return list(struct.unpack_from(">16H", ram, 0x6FD00))


def table_entry(text: dict[str, Any], scale: tuple[int, int]) -> bytes:
    """The 20 bytes $059EB6-$059F3C writes for one wall text."""
    placed = wall_text_placement(text, scale)
    x, y, z = placed["anchor"]
    glyph_x, glyph_y = placed["scale"]
    # The builder stores words, so a coordinate keeps its low sixteen bits.
    return struct.pack(
        ">5HhbbHI", text["face"] * 4, x & 0xFFFF, y & 0xFFFF, z & 0xFFFF, text["flags"],
        placed["advance"], glyph_x, glyph_y, text["colour"], text["textAddress"],
    )


def assembled_structure(ram: bytes) -> tuple[int, int] | None:
    """The (slot, record) whose association root is the live $7B0E, or None."""
    base = u32(ram, STRUCTURE_TABLE)
    root = u32(ram, ROOT)
    found = []
    for slot in range(1, 290):
        record = base + s32(ram, base + slot * 4)
        if not 0x10000 <= record < 0x1E000 or ram[record] & 0x80:
            continue
        try:
            mesh, _ = decode_structure(ram, record, palette_at(ram, 0), hardware(ram), (1, 1), 48)
            selection = decode_structure_selection(ram, mesh, (1, 1), palette_at(ram, 0), hardware(ram))
        except (ValueError, struct.error):
            continue
        if selection["associationRoot"] == root:
            found.append((slot, record))
    if len(found) > 1:
        raise LabError(f"association root ${root:06X} names {len(found)} structures")
    return found[0] if found else None


def published_selection(document: dict, record: int, scale: tuple[int, int]) -> dict | None:
    """The Catalogue's selection for this record at this placement scale, if it publishes one."""
    identity = f"structure-{record:06x}"
    for model in document["models"]:
        if model["kind"] != "structure" or (model["id"] != identity and identity not in model.get("relatedModels", [])):
            continue
        selection = model.get("structureSelection")
        if selection is None or tuple(selection["scale"]) != scale:
            continue
        return selection
    return None


def published_labels(selection: dict) -> list[list]:
    return [[label["face"], label["anchor"], label["scale"], label["font"], label.get("fallback")]
            for label in selection.get("floorLabels", [])]


def geometry(mesh: dict) -> list:
    """A mesh's shape without its colours: vertices, then each face and stroke's indices."""
    return [mesh["vertices"], [face["vertices"] for face in mesh["faces"]],
            [line["vertices"] for line in mesh["lines"]]]


def is_literal(text: dict[str, Any]) -> bool:
    return not text["flags"] & 0x40 and not any(character & 0x80 for character in text["text"])


def table_text(ram: bytes, index: int, font: int | None = None) -> list:
    """Glyphs for the capture's own $C8C0 entry `index`, read through the entry's text pointer.

    Only the capture's bytes go in: the anchor, flags, advance, scales and colour
    the builder stored, and the text wherever its pointer leads.
    """
    entry = WALL_TEXT + index * 20
    face = struct.unpack(">H", ram[entry:entry + 2])[0] // 4
    x, y, z, flags, advance = struct.unpack(">3hHh", ram[entry + 2:entry + 12])
    glyph_x, glyph_y = struct.unpack(">bb", ram[entry + 12:entry + 14])
    colour = struct.unpack(">H", ram[entry + 14:entry + 16])[0]
    pointer = u32(ram, entry + 16)
    text = ram[pointer:ram.index(0, pointer)].decode("ascii")
    vertices, faces, lines = [], [], []
    append_vector_text(ram, text, flags & 0xF if font is None else font, [x, y, z], advance,
                       glyph_x, glyph_y, flags & 0xC0, colour, vertices, faces, lines,
                       palette_at(ram, 0), hardware(ram))
    return [face, text, geometry({"vertices": vertices, "faces": faces, "lines": lines})]


def decode(snapshots: Path) -> int:
    document = read_catalogue(CATALOGUE)
    rows, seen = [], set()
    for path in sorted(snapshots.glob("*.sav")):
        ram = hatari_memstate_ram(path.read_bytes())
        name = path.stem
        for token in (0x80, 0x81):
            pointer = u32(ram, TOKENS + (token & 0x7F) * 4)
            if pointer != FLOOR_LABEL_TARGET:
                raise LabError(f"{name}: token ${token:02X} points at ${pointer:04X}, not $CD04")
        floor = struct.unpack(">h", ram[FLOOR:FLOOR + 2])[0]
        if ram[FLOOR_LABEL_TARGET] != expected_label(floor) or ram[FLOOR_LABEL_TARGET + 1] != 0:
            raise LabError(f"{name}: $CD04 does not hold Floor {floor}'s label")
        assembled = assembled_structure(ram)
        if assembled is None:
            if name in REQUIRED:
                raise LabError(f"not reached: {name} stands in no identifiable structure")
            rows.append({"capture": name, "floor": floor, "structure": None})
            continue
        slot, record = assembled
        scale = struct.unpack(">hh", ram[PLACEMENT_SCALE:PLACEMENT_SCALE + 4])
        texts = post_plan_texts(ram, record)
        predicted = b"".join(table_entry(text, scale) for text in texts) + b"\xff\xff"
        live = ram[WALL_TEXT:WALL_TEXT + len(predicted)]
        if live != predicted:
            raise LabError(f"{name}: $C8C0 {live.hex()} is not the decoded {predicted.hex()}")
        labels = [text for text in texts if floor_label_token(ram, text) is not None]
        drawable = [text for text in labels if not text["flags"] & 0x40]
        literal = [index for index, text in enumerate(texts) if is_literal(text)]
        if name in REQUIRED:
            if floor != REQUIRED[name]:
                raise LabError(f"not reached: {name} stands on Floor {floor}")
            if not drawable:
                raise LabError(f"not reached: {name}'s structure carries no Floor Label")
        selection = published_selection(document, record, scale)
        if (drawable or literal) and selection is None:
            raise LabError(f"{name}: the Catalogue publishes no selection for slot {slot} at scale {scale}")
        if selection is not None:
            published = published_labels(selection)
            expected = []
            for text in drawable:
                placed = wall_text_placement(text, scale)
                font = text["flags"] & 0xF
                expected.append([{"index": text["face"] - 1, "kind": "face"}, placed["anchor"],
                                 placed["scale"], font, FONT_FALLBACK if font == 4 else None])
            if published != expected:
                raise LabError(f"{name}: the Catalogue's labels {published} are not the table's {expected}")
            # Each literal wall text must draw exactly the glyphs the capture's own
            # table entry places, in its font and in the font-3 fallback.
            published_texts = [
                [text["face"]["index"] + 1, text["text"], geometry(text["mesh"]),
                 geometry(text["fallback"]["mesh"]) if "fallback" in text else None]
                for text in selection.get("wallTexts", [])
            ]
            expected_texts = []
            for index in literal:
                face, characters, shape = table_text(ram, index)
                fallback = (table_text(ram, index, FONT_FALLBACK["font"])[2]
                            if texts[index]["flags"] & 0xF == 4 else None)
                expected_texts.append([face, characters, shape, fallback])
            if published_texts != expected_texts:
                raise LabError(f"{name}: the Catalogue's wall text is not what the $C8C0 table places")
        seen.add(name)
        rows.append({
            "capture": name,
            "sha256": file_hash(path),
            "floor": floor,
            "label": chr(ram[FLOOR_LABEL_TARGET]),
            "slot": slot,
            "record": f"${record:06X}",
            "placementScale": list(scale),
            "wallTexts": len(texts),
            "literalWallTexts": [texts[index]["text"].decode("ascii") for index in literal],
            "floorLabels": [
                {"face": text["face"], "token": f"${text['text'][0]:02X}", "font": text["flags"] & 0xF,
                 **wall_text_placement(text, scale)}
                for text in labels
            ],
        })
    missing = set(REQUIRED) - seen
    if missing:
        raise LabError(f"not reached: {sorted(missing)} not found under {snapshots}")
    print(json.dumps(rows, indent=2))
    return 0


# --- live ------------------------------------------------------------------

CASES = {
    # State Office, Floor 0: the label at rest.
    "lift": ("rehosted/eris-lift.sav", None, ord("G")),
    # State Office, riding G -> 2: the label mid-ride, while Floor 0's structure is still bound.
    "lift-ride": ("rehosted/eris-lift.sav", "2", ord("1")),
}
SCANCODES = {"2": 0x03}


def live(roms: Path | None, snapshots: Path, case: str, settle: float) -> int:
    snapshot_name, key, label = CASES[case]
    authority, config = load_configuration()
    program, tos = resolve_images(authority, resolve_roms_root(roms))
    program_info = validate_image(program, authority["programImage"], label="Working Authority STX")
    tos_info = validate_image(tos, authority["tosImage"], label="TOS image")
    hatari, toolchain = discover_toolchain(config)
    snapshot = snapshots / snapshot_name
    if not snapshot.is_file():
        raise LabError(f"snapshot not found: {snapshot}")
    start_ram = hatari_memstate_ram(snapshot.read_bytes())
    start_root = u32(start_ram, ROOT)

    run = WORK_ROOT / _run_id(f"floor-label-{case}")
    run.mkdir(parents=True)
    fifo_path = run / "cmd.fifo"
    parse = run / "play.txt"
    parse.write_text("c\n", encoding="utf-8")
    hit_ram = (run / "hit.ram").resolve()
    on_hit = run / "on-hit.txt"
    on_hit.write_text(f"r\nsavebin {hit_ram} 0 $100000\nscreenshot {(run / 'hit.png').resolve()}\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari, tos=tos, disk_a=program,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse, fast_forward=False, statusbar=False, cmd_fifo=fifo_path,
        extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    log_path = run / "hatari.log"
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, text=True, env=env)
        try:
            for _ in range(300):
                if fifo_path.exists() or process.poll() is not None:
                    break
                time.sleep(0.02)
            if not fifo_path.exists():
                raise LabError(f"Hatari did not create {fifo_path}; status={process.poll()}")
            with fifo_path.open("w", encoding="utf-8") as fifo:
                time.sleep(settle)
                if process.poll() is not None:
                    raise LabError("Hatari exited during restore; is the memstate rehosted?")
                if key is not None:
                    code = f"{SCANCODES[key]:02d}"
                    _fifo_send(fifo, [f"hatari-event keydown {code}"])
                    time.sleep(0.12)
                    _fifo_send(fifo, [f"hatari-event keyup {code}"])
                # One breakpoint per run: the token read while $CD04 shows the label
                # the case is waiting for.
                _fifo_send(fifo, [
                    "hatari-stop",
                    f"hatari-debug b pc = ${TOKEN_INDEX_PC:x} && d0 < 8 && ($cd04).b = ${label:x} "
                    f":once :quiet :file {on_hit.resolve()}",
                    "hatari-cont",
                ])
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if hit_ram.is_file() and hit_ram.stat().st_size == 0x100000:
                        break
                    if process.poll() is not None:
                        break
                    time.sleep(0.1)
                time.sleep(0.5)
                _fifo_send(fifo, ["hatari-stop", "hatari-debug quit"])
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
            if fifo_path.exists():
                fifo_path.unlink()
    if not hit_ram.is_file() or hit_ram.stat().st_size != 0x100000:
        raise LabError(f"not reached: no $80/$81 token was read while $CD04 showed {chr(label)!r}")

    ram = hit_ram.read_bytes()
    registers = re.search(r"A7 ([0-9A-F]{8})", log_path.read_text(encoding="utf-8", errors="replace"))
    if registers is None:
        raise LabError("the breakpoint fired but printed no registers")
    stack = int(registers.group(1), 16)
    text_pointer = u32(ram, stack) - 2  # $05408C pushed a0 past the token pair
    list_pointer = u32(ram, stack + 8)  # $05A7FC pushed a1 past the draw-list entry
    entry = u32(ram, list_pointer - 4)
    if not entry & 0x80000000 or entry & 0x40000000:
        raise LabError(f"draw-list entry ${entry:08X} is not a wall text")
    block = entry & 0x7FFFFFFF
    if (block - WALL_TEXT - 2) % 20:
        raise LabError(f"draw-list entry ${entry:08X} is not a $C8C0 table entry")
    face = struct.unpack(">H", ram[block - 2:block])[0] // 4
    x, y, z, flags, advance = struct.unpack(">3hHh", ram[block:block + 10])
    glyph_x, glyph_y = struct.unpack(">bb", ram[block + 10:block + 12])
    colour = struct.unpack(">H", ram[block + 12:block + 14])[0]
    pointer = u32(ram, block + 14)
    if pointer != text_pointer or ram[pointer] not in (0x80, 0x81) or ram[pointer + 1] != 0:
        raise LabError(f"the renderer read ${text_pointer:06X}, the entry names ${pointer:06X}")
    if ram[FLOOR_LABEL_TARGET] != label:
        raise LabError(f"$CD04 reads {chr(ram[FLOOR_LABEL_TARGET])!r} at the hit")
    floor = struct.unpack(">h", ram[FLOOR:FLOOR + 2])[0]
    destination = struct.unpack(">h", ram[0x788A:0x788C])[0]
    root = u32(ram, ROOT)
    if key is not None and (destination < 0 or root != start_root):
        raise LabError("not reached: the hit is not mid-ride on the starting structure")
    outcome = {
        "label": chr(label),
        "floor": floor,
        "destination": destination,
        "root": f"${root:06X}",
        "startRoot": f"${start_root:06X}",
        "textAddress": f"${pointer:06X}",
        "token": f"${ram[pointer]:02X}",
        "drawListEntry": f"${entry:08X}",
        "wallText": {"queueByte": face, "anchor": [x, y, z], "flags": f"${flags:04X}",
                     "advance": advance, "scale": [glyph_x, glyph_y], "colour": f"${colour:04X}"},
    }
    result = {
        "schemaVersion": 1,
        "case": case,
        "outcome": outcome,
        "authority": {
            "programSha256": program_info["hashes"]["sha256"],
            "tosSha256": tos_info["hashes"]["sha256"],
            "snapshot": snapshot_name,
            "snapshotSha256": file_hash(snapshot),
        },
        "toolchain": toolchain.as_dict(),
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    (run / "result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"run": run.name, "case": case, "outcome": outcome}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--snapshots", type=Path, default=SNAPSHOTS)
    sub = parser.add_subparsers(dest="mode", required=True)
    sub.add_parser("decode")
    live_parser = sub.add_parser("live")
    live_parser.add_argument("--roms", type=Path)
    live_parser.add_argument("--case", choices=tuple(CASES), required=True)
    live_parser.add_argument("--settle-seconds", type=float, default=4.0)
    args = parser.parse_args()
    if args.mode == "decode":
        return decode(args.snapshots)
    return live(args.roms, args.snapshots, args.case, args.settle_seconds)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LabError as failure:
        print(f"error: {failure}", file=sys.stderr)
        raise SystemExit(2) from failure
