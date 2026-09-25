#!/usr/bin/env python3
"""Pin surface-sky frames at chosen Body turns, and check the sky-Body closed form (#528).

On a Body's surface the ST draws the other members of the Body's cluster in the
sky (``$0530C8..$0531BC``) as lit discs split by a terminator ellipse. The
draw path is decoded in ``docs/research/damocles-sky-bodies.md``. This probe
provides the oracle frames and the check.

``capture``
    Boot a memstate, freeze the current Body's rotation (``$00835C + sel`` := 0)
    and set its accumulator (``$0062EA + sel``) so that the sky longitude latch
    ``$042C6C`` lands on each requested value in turn. After each poke let the
    game draw for a moment, then stop and take the whole 1 MiB of RAM and a
    screenshot. Each frame is static, because nothing but the turn moves the
    sky, so the RAM and the screenshot describe the same picture.

``check``
    For every frame of a capture run, evaluate the closed form in
    ``predict()`` on the RAM, draw the predicted sky Bodies, and compare them
    pixel-for-pixel against the screenshot's sky rows. Reports the per-Body
    centre, radius and the mismatch count, and writes a side-by-side contact
    sheet per frame.

``predict``
    Evaluate the closed form on one memstate or RAM dump and print it.

Usage (from the repository root):

  python3 research/damocles-st/scripts/sky-body-probe.py capture \\
      --snapshot research/damocles-st/snapshots/rehosted/metis-transporter.sav \\
      --longitudes 0,64,128,192,256,320,384,448,512,576,640,704,768,832,896,960
  python3 research/damocles-st/scripts/sky-body-probe.py check \\
      --run research/damocles-st/work/sky-body-<id>
  python3 research/damocles-st/scripts/sky-body-probe.py predict \\
      --ram research/damocles-st/snapshots/rehosted/theon.sav
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))

from damocleslab.catalogue import hatari_memstate_ram  # noqa: E402
from damocleslab.core import LabError, validate_image  # noqa: E402
from damocleslab.laboratory import (  # noqa: E402
    _fifo_send,
    _run_id,
    load_configuration,
    resolve_images,
    resolve_roms_root,
)
from damocleslab.runtime import build_hatari_command, headless_env  # noqa: E402
from damocleslab.toolchain import discover_toolchain  # noqa: E402

REPO = LAB_ROOT.parents[1]
WORK_ROOT = LAB_ROOT / "work"

NAMES = (
    "DIALIS", "ICARUS", "MIDAS", "ACHERON", "DION", "ATROPOS", "CLOTHO",
    "LACHESIS", "GAEA", "CRONUS", "CYCLOPES", "ERIS", "SOLON", "THEON",
    "VESTA", "METIS", "LUCAN", "LOGOS", "AURORA", "TRITON", "PAN", "THALIA",
    "JUNO", "BACCHUS", "JASON", "TOLOSA", "PERSEUS", "MENTOR", "SAPPHIRE",
    "DAMOCLES", "VOID",
)

# Body arrays, one longword a slot at `index * 4` (damocles-gamma-system.md).
BODY_X, BODY_Z, BODY_SIZE, BODY_COLOUR, BODY_Y = 0x5F40, 0x5FC0, 0x6040, 0x60C0, 0x626A
PHASE_ACCUMULATOR, PHASE_DERIVED = 0x62EA, 0x835C
DRAW_LIST = 0x7918          # long pointer to the current Body's selector list
SELECTOR_ALIAS = 0x7AA6     # long, `index * 4` of the Body stood on
VIEWER = (0x799A, 0x799E, 0x79A2)  # System position of the eye, X/Y/Z longs
STEP_X, STEP_Z = 0x7A1E, 0x7A22
SKY_LONGITUDE, SKY_LATITUDE = 0x42C6C, 0x42C70
VIEW_MATRIX = 0x42C20       # 3x3 packed floats, rows depth / x / y
FOCAL = 0x7964              # packed float added (as a log) to x/z and y/z
CLIP_ROWS = 0x42C74         # $44 on foot (horizon row), else $88
PALETTE_SLOTS = 0x7C18      # long pointer to 16 words of 0RGB
DAY_FLAG, SHADOW_SLOT = 0x7A4E, 0x7AEA
INTERRUPT_GATE = 0x7A26

SCREEN_WIDTH, VIEW_ROWS = 320, 136
CENTRE_X, CENTRE_Y = 160, 68
ASPECT = 0x1B00 / 0x2000    # $45A0C: half-widths are divided by 0.84375


def s16(value: int) -> int:
    return value - 0x10000 if value & 0x8000 else value


def u16(ram: bytes, address: int) -> int:
    return struct.unpack_from(">H", ram, address)[0]


def s32(ram: bytes, address: int) -> int:
    return struct.unpack_from(">i", ram, address)[0]


def packed(ram: bytes, address: int) -> float:
    """The engine's float: signed word exponent, signed word mantissa with 1.0 = $1000."""
    exponent, mantissa = struct.unpack_from(">hh", ram, address)
    return mantissa / 4096 * 2.0 ** exponent


def sine(angle: int) -> float:
    """The 1024-step table at $64000: entry i is sin((i + 1/2) * 2pi / 1024)."""
    return math.sin((angle % 1024 + 0.5) * 2 * math.pi / 1024)


def read_ram(path: Path) -> bytes:
    data = path.read_bytes()
    return hatari_memstate_ram(data) if path.suffix == ".sav" else data


def draw_list(ram: bytes) -> list[int]:
    pointer = s32(ram, DRAW_LIST)
    selectors = []
    while ram[pointer] != 0xFF:
        selectors.append(ram[pointer])
        pointer += 1
    return selectors


def view_matrix(ram: bytes) -> list[list[float]]:
    """$045710 from the eye angles roll $7A9E, pitch $7AA0, yaw $7AA2 (via $055F60)."""
    sr, cr = sine(u16(ram, 0x7A9E)), sine(u16(ram, 0x7A9E) + 0x100)
    sp, cp = sine(u16(ram, 0x7AA0)), sine(u16(ram, 0x7AA0) + 0x100)
    sy, cy = sine(u16(ram, 0x7AA2)), sine(u16(ram, 0x7AA2) + 0x100)
    return [
        [cp * sy, sp, cp * cy],
        [sr * sp * sy + cr * cy, -sr * cp, sr * sp * cy - cr * sy],
        [sr * cy - cr * sp * sy, cr * cp, -(cr * sp * cy + sr * sy)],
    ]


def celestial_matrix(ram: bytes) -> list[list[float]]:
    """$04529C: M = V * R(lon, lat), rows depth / screen-x / screen-y."""
    lon, lat = u16(ram, SKY_LONGITUDE), u16(ram, SKY_LATITUDE)
    sl, cl = sine(lon), sine(lon + 0x100)
    sp, cp = sine(lat), sine(lat + 0x100)
    rotation = [
        [cl, 0.0, -sl],
        [-sl * sp, cp, -cl * sp],
        [sl * cp, sp, cl * cp],
    ]
    view = view_matrix(ram)
    return [[sum(view[i][k] * rotation[k][j] for k in range(3)) for j in range(3)]
            for i in range(3)]


def palette(ram: bytes) -> list[int]:
    base = s32(ram, PALETTE_SLOTS)
    return [u16(ram, base + 2 * i) for i in range(16)]


def predict(ram: bytes) -> dict:
    """The closed form for every Body on the current draw list.

    For each listed selector: the System-frame offset of the Body's centre
    from the eye, rotated by the celestial matrix into (depth, x, y); a
    perspective divide by depth with focal length F = 2**exponent($7964);
    radius = size / depth (no focal term); lit fraction from the XZ phase
    angle at the Body between the eye and DIALIS.
    """
    matrix = celestial_matrix(ram)
    focal = packed(ram, FOCAL) if s32(ram, FOCAL) & 0xFFFF else 2.0 ** s16(u16(ram, FOCAL))
    eye = [s32(ram, a) for a in VIEWER]
    slots = palette(ram)
    shadow_slot = u16(ram, SHADOW_SLOT) // 4
    bodies = []
    for selector in draw_list(ram):
        index = selector // 4
        if s32(ram, BODY_Y + selector) < 0:
            continue
        offset = [s32(ram, BODY_X + selector) - eye[0],
                  s32(ram, BODY_Y + selector) - eye[1],
                  s32(ram, BODY_Z + selector) - eye[2]]
        depth, x, y = (sum(matrix[i][k] * offset[k] for k in range(3)) for i in range(3))
        raw = s32(ram, BODY_SIZE + selector)
        size = s16(raw & 0xFFFF) / 4096 * 2.0 ** (raw >> 16)
        colour = u16(ram, BODY_COLOUR + selector + 2)  # low word, $0592B0
        entry = {
            "index": index,
            "name": NAMES[index],
            "depth": depth,
            "colour": f"${colour:03x}" if colour < 0x8000 else f"${colour:04x}",
        }
        if depth <= 0:
            entry["drawn"] = False
            entry["why"] = "behind the eye"
            bodies.append(entry)
            continue
        sx = CENTRE_X - focal * x / depth
        sy = CENTRE_Y + focal * y / depth
        radius = size / depth
        entry.update({"x": sx, "y": sy, "radius": radius})
        if index == 0:
            entry["phase"] = 1.0
        elif colour & 0x8000:
            # $04FBF2: two double-sided $777 triangles from a tail tip at 1.25x the
            # comet's centre (Y 0; ERIS's X/Z/4 instead of its own when $7A82 is set)
            # to head points +-250 in Y and in X; the head disc is size/depth.
            ref = (s32(ram, BODY_X + 0x2C), s32(ram, BODY_Z + 0x2C)) if u16(ram, 0x7A82) \
                else (s32(ram, BODY_X + selector), s32(ram, BODY_Z + selector))
            tip = [s32(ram, BODY_X + selector) + (ref[0] >> 2) - eye[0], -eye[1],
                   s32(ram, BODY_Z + selector) + (ref[1] >> 2) - eye[2]]
            td, tx, ty = (sum(matrix[i][k] * tip[k] for k in range(3)) for i in range(3))
            entry["drawn"] = "comet path ($04FBF2)"
            entry["tail"] = {"x": CENTRE_X - focal * tx / td, "y": CENTRE_Y + focal * ty / td,
                             "depth": td}
            bodies.append(entry)
            continue
        else:
            # $04FD44: unit XZ vectors at the Body towards the eye and towards DIALIS.
            bx, bz = s32(ram, BODY_X + selector), s32(ram, BODY_Z + selector)
            vx, vz = eye[0] - bx, eye[2] - bz
            ux, uz = -bx, -bz
            vl, ul = math.hypot(vx, vz), math.hypot(ux, uz)
            cos_phase = (vx * ux + vz * uz) / (vl * ul)
            cross = (vx * uz - vz * ux) / (vl * ul)
            entry["phase"] = cos_phase
            entry["cross"] = cross
        entry["litColour"] = f"${colour & 0xFFF:03x}"
        entry["shadowColour"] = f"${slots[shadow_slot] & 0xFFF:03x}"
        bodies.append(entry)
    return {
        "longitude": u16(ram, SKY_LONGITUDE),
        "latitude": u16(ram, SKY_LATITUDE),
        "focal": focal,
        "clipRows": u16(ram, CLIP_ROWS),
        "day": u16(ram, DAY_FLAG) != 0,
        "shadowSlot": shadow_slot,
        "palette": [f"${value:03x}" if value < 0x8000 else "free" for value in slots],
        "bodies": bodies,
    }


def raster(prediction: dict) -> dict[tuple[int, int], tuple[str, str, str]]:
    """Rasterise the predicted discs the way $45916 does.

    Returns {(x, y): (body, part, colour)} after overdraw in list order. Row y
    runs over [cy - r, cy + r] clipped to [0, clipRows); the half-width is
    w = trunc(sqrt(r^2 - dy^2) / 0.84375); the row splits at
    x_t = cx + trunc(w * c) + 1 with c = cos(phase), negated when the XZ cross
    product is non-negative; [cx - w, x_t) takes the first colour and
    [x_t, cx + w] the second. The lit colour is first when the cross product
    is negative and second otherwise.
    """
    pixels: dict[tuple[int, int], tuple[str, str, str]] = {}
    rows = prediction["clipRows"]
    for body in prediction["bodies"]:
        if "radius" not in body or body.get("drawn") not in (None, True):
            continue
        cx, cy = math.floor(body["x"] + 0.5), math.floor(body["y"] + 0.5)  # $056BD8 rounds
        r = int(body["radius"])
        cross = body.get("cross", -1.0)
        # $04FEB4: C = round(cos * 2^15), saturated to a signed word; $04FF3E..$04FF4A
        # complement it (NOT, i.e. -C - 1) and swap the colours when cross >= 0.
        term = max(-0x8000, min(0x7FFF, math.floor(body.get("phase", 1.0) * 0x8000 + 0.5)))
        parts = [("lit", body["litColour"]), ("dark", body["shadowColour"])]
        if cross >= 0:
            parts.reverse()
            term = ~term
        for dy in range(-r, r + 1):
            y = cy + dy
            if not 0 <= y < rows:
                continue
            w = int(math.sqrt(max(0.0, body["radius"] ** 2 - dy * dy)) / ASPECT)
            split = cx + ((w * term) >> 15) + 1  # $045A52..$045A60
            for x in range(max(0, cx - w), min(SCREEN_WIDTH, cx + w)):
                part, colour = parts[0] if x < split else parts[1]
                pixels[(x, y)] = (body["name"], part, colour)
    return pixels


# --------------------------------------------------------------------- capture


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def poke(address: int, value: int, size: int = 4) -> str:
    body = " ".join(f"{byte:02x}"
                    for byte in (value & ((1 << 8 * size) - 1)).to_bytes(size, "big"))
    return f"hatari-debug w ${address:x} {body}"


def capture(snapshot: Path, roms_root: Path | None, longitudes: list[int], *,
            settle: float, hold: float, press_first: int | None,
            boot_per_frame: bool = True) -> Path:
    authority, config = load_configuration()
    root = resolve_roms_root(roms_root)
    program_path, tos_path = resolve_images(authority, root)
    validate_image(program_path, authority["programImage"], label="Working Authority STX")
    validate_image(tos_path, authority["tosImage"], label="TOS image")
    hatari_binary, toolchain = discover_toolchain(config)
    ram0 = read_ram(snapshot)
    selector = s32(ram0, SELECTOR_ALIAS)
    step_x = u16(ram0, STEP_X)

    run_directory = WORK_ROOT / _run_id("sky-body")
    run_directory.mkdir(parents=True, exist_ok=True)
    fifo = run_directory / "cmd.fifo"
    parse_script = run_directory / "play.txt"
    parse_script.write_text("c\n", encoding="utf-8")
    command = build_hatari_command(
        hatari_binary=hatari_binary, tos=tos_path, disk_a=program_path,
        machine_model=config["machineModel"], memsize_mib=config["memsizeMiB"],
        parse_script=parse_script, fast_forward=False, statusbar=False,
        cmd_fifo=fifo, extra_args=["--memstate", str(snapshot.resolve())],
    )
    env = os.environ.copy()
    env.update(headless_env())
    frames = []
    # Airless Bodies suffocate the player a few seconds after the restore, and
    # the death fade ruins every later frame, so by default each frame gets
    # its own boot.
    batches = [[longitude] for longitude in longitudes] if boot_per_frame else [longitudes]
    for batch in batches:
        if fifo.exists():
            fifo.unlink()
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                   stdout=(run_directory / "hatari.log").open("ab"),
                                   stderr=subprocess.STDOUT, env=env)
        try:
            for _ in range(200):
                if fifo.exists() or process.poll() is not None:
                    break
                time.sleep(0.05)
            if process.poll() is not None or not fifo.exists():
                raise LabError("Hatari exited before creating the command FIFO "
                               "(a memstate the pinned build cannot restore?)")
            with fifo.open("w", encoding="utf-8") as handle:
                time.sleep(settle)
                if press_first is not None:
                    code = f"{press_first:02d}"
                    _fifo_send(handle, [f"hatari-event keydown {code}"])
                    time.sleep(0.15)
                    _fifo_send(handle, [f"hatari-event keyup {code}"])
                    time.sleep(0.3)
                for longitude in batch:
                    turn = ((longitude - step_x) & 0x3FF) << 16
                    _fifo_send(handle, ["hatari-stop", "hatari-debug setopt hex",
                                        poke(PHASE_DERIVED + selector, 0),
                                        poke(PHASE_ACCUMULATOR + selector, turn),
                                        poke(INTERRUPT_GATE, 0, 2),
                                        "hatari-cont"])
                    time.sleep(hold)
                    prefix = f"lon{longitude:04d}"
                    ram_path = run_directory / f"{prefix}.ram"
                    shot_path = run_directory / f"{prefix}.png"
                    _fifo_send(handle, ["hatari-stop", "hatari-debug setopt hex",
                                        f"hatari-debug savebin {ram_path} $0 $100000",
                                        f"hatari-debug screenshot {shot_path}",
                                        "hatari-cont"])
                    for _ in range(60):
                        if ram_path.is_file() and ram_path.stat().st_size == 0x100000 \
                                and shot_path.is_file():
                            break
                        time.sleep(0.1)
                    else:
                        raise LabError(f"frame {prefix} was not written")
                    time.sleep(0.2)
                    ram = ram_path.read_bytes()
                    frames.append({
                        "prefix": prefix,
                        "requestedLongitude": longitude,
                        "longitude": u16(ram, SKY_LONGITUDE),
                        "latitude": u16(ram, SKY_LATITUDE),
                        "accumulator": f"0x{s32(ram, PHASE_ACCUMULATOR + selector) & 0xFFFFFFFF:08x}",
                        "sha256": {"ram": _sha256(ram_path), "display": _sha256(shot_path)},
                    })
                    print(f"{prefix}: $042C6C = {frames[-1]['longitude']}", flush=True)
                _fifo_send(handle, ["hatari-stop"])
                time.sleep(0.3)
        finally:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
    result = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "snapshot": {"path": str(snapshot), "sha256": _sha256(snapshot)},
        "probe": {"path": str(Path(__file__).resolve().relative_to(REPO)),
                  "sha256": _sha256(Path(__file__).resolve())},
        "toolchain": toolchain,
        "selector": f"0x{selector:02x}",
        "body": NAMES[selector // 4],
        "stepX": step_x,
        "frames": frames,
    }
    (run_directory / "result.json").write_text(json.dumps(result, indent=1, default=str) + "\n",
                                                encoding="utf-8")
    print(run_directory)
    return run_directory


# ----------------------------------------------------------------------- check


def st_rgb(colour: str) -> tuple[int, int, int]:
    """Hatari's screenshot maps each 3-bit ST level v to 34 * v."""
    value = int(colour[1:], 16)
    return tuple(((value >> shift) & 7) * 34 for shift in (8, 4, 0))


def screenshot_pixels(path: Path) -> tuple[int, int, bytes]:
    size = subprocess.run(["magick", "identify", "-format", "%w %h", str(path)],
                          check=True, capture_output=True, text=True).stdout.split()
    raw = subprocess.run(["magick", str(path), "-depth", "8", "rgb:-"],
                         check=True, capture_output=True).stdout
    return int(size[0]), int(size[1]), raw


# Hatari 2.6.1 screenshots of this machine: 2x pixels, 96 px left border and
# 58 px (29 ST lines) top border (832x552 overall).
SHOT_SCALE, SHOT_LEFT, SHOT_TOP = 2, 96, 58


def compare(prediction: dict, shot_path: Path) -> list[dict]:
    """Per listed Body: predicted pixels that agree, that something else covers,
    that show the sky instead, and screen pixels of its lit colour it missed."""
    width, _height, raw = screenshot_pixels(shot_path)

    def at(x: int, y: int) -> tuple[int, int, int]:
        offset = 3 * ((SHOT_TOP + y * SHOT_SCALE) * width + SHOT_LEFT + x * SHOT_SCALE)
        return tuple(raw[offset:offset + 3])

    sky = st_rgb(prediction["palette"][8]) if prediction["palette"][8] != "free" else None
    predicted = raster(prediction)
    rows = []
    for body in prediction["bodies"]:
        if "radius" not in body or body.get("drawn") not in (None, True):
            continue
        mine = {xy: v for xy, v in predicted.items() if v[0] == body["name"]}
        tally = {"agree": 0, "covered": 0, "sky": 0, "wrongPart": 0, "missed": 0}
        for (x, y), (_name, part, colour) in mine.items():
            seen = at(x, y)
            if seen == st_rgb(colour):
                tally["agree"] += 1
            elif seen == sky or seen == (0, 0, 0):
                tally["sky"] += 1
            elif seen in (st_rgb(body["litColour"]), st_rgb(body["shadowColour"])):
                tally["wrongPart"] += 1
            else:
                tally["covered"] += 1
        if mine:
            lit = st_rgb(body["litColour"])
            xs = [x for x, _ in mine]
            ys = [y for _, y in mine]
            for y in range(max(0, min(ys) - 3), min(prediction["clipRows"], max(ys) + 4)):
                for x in range(max(0, min(xs) - 3), min(SCREEN_WIDTH, max(xs) + 4)):
                    if (x, y) not in predicted and at(x, y) == lit:
                        tally["missed"] += 1
        rows.append({"name": body["name"], "x": round(body["x"], 2),
                     "y": round(body["y"], 2), "radius": round(body["radius"], 2),
                     "phase": round(body.get("phase", 1.0), 3),
                     "predicted": len(mine), **tally})
    return rows


def check(run_directory: Path) -> None:
    result = json.loads((run_directory / "result.json").read_text(encoding="utf-8"))
    summary = []
    for frame in result["frames"]:
        ram = (run_directory / f"{frame['prefix']}.ram").read_bytes()
        prediction = predict(ram)
        shot = run_directory / f"{frame['prefix']}.png"
        # A frame is only an oracle if the game drew the poked turn and is still
        # playing: the latch must equal the request, the pause gate must be clear,
        # and the sky slot's colour must be on screen (death fades the palette).
        width, _height, raw = screenshot_pixels(shot)
        sky = st_rgb(prediction["palette"][8]) if prediction["palette"][8] != "free" else None
        sky_seen = sky is not None and any(
            tuple(raw[3 * ((SHOT_TOP + y * SHOT_SCALE) * width + SHOT_LEFT + x * SHOT_SCALE):][:3]) == sky
            for y in range(0, prediction["clipRows"], 2) for x in range(0, SCREEN_WIDTH, 2))
        reasons = []
        if prediction["longitude"] != frame["requestedLongitude"]:
            reasons.append("stale latch")
        if u16(ram, INTERRUPT_GATE):
            reasons.append("paused")
        if not sky_seen:
            reasons.append("sky colour absent")
        rows = compare(prediction, shot) if not reasons else []
        summary.append({"frame": frame["prefix"], "longitude": prediction["longitude"],
                        "day": prediction["day"], "valid": not reasons,
                        "invalidBecause": reasons, "bodies": rows})
        print(f"{frame['prefix']} lon {prediction['longitude']:4d} "
              f"{'day' if prediction['day'] else 'night'}"
              + (f"  INVALID: {', '.join(reasons)}" if reasons else ""))
        for row in rows:
            print("   " + " ".join(f"{k}={v}" for k, v in row.items()))
    (run_directory / "check.json").write_text(json.dumps(summary, indent=1) + "\n",
                                               encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    cap = sub.add_parser("capture")
    cap.add_argument("--snapshot", type=Path, required=True)
    cap.add_argument("--roms", type=Path, default=None)
    cap.add_argument("--longitudes", required=True,
                     help="comma-separated $042C6C targets, 0..1023")
    cap.add_argument("--settle", type=float, default=4.0)
    cap.add_argument("--hold", type=float, default=1.0,
                     help="host seconds to let the game draw after each poke")
    cap.add_argument("--press-first", type=lambda v: int(v, 0), default=None)
    cap.add_argument("--one-boot", action="store_true",
                     help="take every frame from one boot (faster; unsafe on airless Bodies)")
    chk = sub.add_parser("check")
    chk.add_argument("--run", type=Path, required=True)
    pre = sub.add_parser("predict")
    pre.add_argument("--ram", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "capture":
        capture(args.snapshot, args.roms, [int(v) for v in args.longitudes.split(",")],
                settle=args.settle, hold=args.hold, press_first=args.press_first,
                boot_per_frame=not args.one_boot)
    elif args.command == "check":
        check(args.run)
    else:
        print(json.dumps(predict(read_ram(args.ram)), indent=1))


if __name__ == "__main__":
    main()
