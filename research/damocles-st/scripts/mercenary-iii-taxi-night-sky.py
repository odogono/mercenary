#!/usr/bin/env python3
"""Research-only MIII night probe for #646; original inputs/outputs remain restricted.

capture cold-boots the three pinned local media/tools; R4 B0 is optional acceleration.
inspect checks MIII-specific bounded data and optionally its exposed star pixels.
No original bytes are embedded. This is evidence tooling, not runtime code.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

STARS = 0x5D8C0
COUNT = 1868
PINS = {
    "disk": "4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c",
    "tos": "154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5",
    "hatari": "05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a",
    "baseline": "dfe11736b08e21d278cb77436960ce9c64b8da11dfff4bd0947dbdea7a0f3dee",
}
RANGES = {
    "day": (0x50B10, 0x50B64, "42c3dd432135c7891fa9067e78f95222b8ee686313b97a10f7026ab3e6f040aa"),
    "stars": (0x50B66, 0x50C2A, "d4b595101b231ca4ea5fd502c4ceee35bd3ac35b40ba822e524db1f4337486d6"),
    "star-data": (STARS, 0x5FDF0, "e4b802d6035968f5665010fecf40b1c1a3a55a60fcee3d18e39eee5af6da5377"),
    "star-colours": (0x50D26, 0x50D66, "627e3d0951c7494791038ded098c5ad3150d0c3e6a08fc0038253331b26f42ad"),
    "island": (0x571A8, 0x576A0, "0de518fd77b7e24f9109f8116e8cac291642644c3906b2aee778f2e0f33265f2"),
    "metis": (0x631C8, 0x631D4, "90f48465ed74853e964fb7bf0688de84fde37807d702d949846656612d302ea2"),
    "surface": (0x632F4, 0x63310, "2bf88175379adab249434a31988c65941498a660eab525b204f7a0641ddbb9b8"),
}

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)

def u16(data: bytes, address: int) -> int:
    return int.from_bytes(data[address:address + 2], "big")

def u32(data: bytes, address: int) -> int:
    return int.from_bytes(data[address:address + 4], "big")

def signed16(value: int) -> int:
    return value - 65536 if value & 32768 else value

def inspect(args: argparse.Namespace) -> dict:
    data = args.ram.read_bytes()
    check(len(data) == 0x100000, "Expected a full 1 MiB RAM capture")
    for name, (start, end, pin) in RANGES.items():
        check(hashlib.sha256(data[start:end]).hexdigest() == pin, f"MIII {name} source mismatch")
    stars = [(u16(data, a), u16(data, a + 2))
             for a in range(STARS + 2048, STARS + 2048 + 4 * COUNT, 4)]
    check(stars == sorted(stars, key=lambda star: star[0]), "Unsorted star list")
    check(sum(x < 1800 for x, _ in stars) == 1600, "Expected 1,600 stars per turn")
    check(stars[1600:] == [(x + 1800, y) for x, y in stars[:268]], "Invalid yaw wrap duplication")
    check(all(y & 0xC200 == 0 for _, y in stars), "Unexpected packed star flags")
    for yaw in range(1024):
        offset = u16(data, STARS + yaw * 2)
        first = (offset - 2048) // 4
        scroll = (yaw * 2 * 0xE10E) >> 16
        check(offset >= 2048 and offset % 4 == 0 and 0 <= first < COUNT, "Invalid yaw index")
        check(stars[first][0] >= scroll and (first == 0 or stars[first - 1][0] < scroll),
              f"Yaw {yaw}: index does not select the first star")
    check(u16(data, 0x6330A) == 0x8000 and u16(data, 0x6330C) == 0,
          "METIS has unexpected horizon vertices or draw commands")
    phase, longitude, latitude = u32(data, 0x5796), u16(data, 0x42C6C), u16(data, 0x42C70)
    stellar = u16(data, 0x7052)
    expected_day = bool(((((stellar - longitude + 256) & 512) + latitude) & 512))
    summary = {
        "ramSha256": hashlib.sha256(data).hexdigest(), "playerX": f"{u32(data, 0x7146):08X}",
        "metisPhase": f"{phase:08X}", "cachedXStep": u16(data, 0x70B4),
        "longitude": longitude, "latitude": latitude, "substellar": stellar,
        "day": bool(u16(data, 0x70E4)), "ruleDay": expected_day,
        "sky": f"{u16(data, 0x7324):03X}", "starsPerTurn": 1600,
        "wrapStars": 268, "metisHorizonVertices": 0, "metisHorizonCommands": 0,
    }
    if args.screenshot:
        from PIL import Image
        image = Image.open(args.screenshot).convert("RGB")
        check(image.width >= 736 and image.height >= 330, "Screenshot is not the pinned 2x viewport")
        yaw, pitch = u16(data, 0x7136) & 1023, u16(data, 0x7134) & 1023
        scroll = (yaw * 2 * 0xE10E) >> 16
        row_offset = (signed16(((pitch - 0x128) * 4) & 65535) * 0x6CCC) >> 16
        first = (u16(data, STARS + 2 * yaw) - 2048) // 4
        predictions = []
        enabled = data[0x6FDD] == 0 or not u16(data, 0x70E4)
        if enabled:
            for column, packed in stars[first:]:
                x = column - scroll
                if x > 319:
                    break
                y = (packed & 511) - row_offset
                if 0 <= y < u16(data, 0x42C74):
                    colour = u16(data, 0x50D28 + 4 * ((packed >> 10) & 15))
                    rgb = tuple(((colour >> shift) & 7) * 34 for shift in (8, 4, 0))
                    predictions.append(image.getpixel((96 + 2*x, 58 + 2*y)) == rgb)
        summary["starComparison"] = {"enabled": enabled, "predicted": len(predictions),
                                     "matchingPixels": sum(predictions)}
    return summary

def capture(args: argparse.Namespace) -> dict:
    paths = {"disk": args.rom_root / "atarist/Mercenary III.STX",
             "tos": args.rom_root / "atarist/tos/emutos206.img",
             "hatari": args.hatari}
    for name, path in paths.items():
        check(digest(path) == PINS[name], f"Pinned {name} mismatch: {path}")
    if args.baseline:
        check(digest(args.baseline) == PINS["baseline"], "Pinned optional baseline mismatch")
    # All raw RAM, screenshots, logs and generated debugger files stay ignored.
    root = Path("restricted/mercenary-iii-646").resolve()
    root.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix=f"portable-{args.route}-", dir=root))
    check(subprocess.run(["git", "check-ignore", "-q", str(run)], check=False).returncode == 0,
          "Refusing to write Restricted Material outside a git-ignored directory")
    def script(name: str, lines: list[str]) -> Path:
        path = run / f"{name}.ini"
        path.write_text("\n".join(lines) + "\n")
        return path
    def once(condition: str, name: str) -> str:
        return f"b {condition} :trace :once :quiet :file {run}/{name}.ini"
    offsets = [(1296, ["w $56726 $66"]), (3996, ["w $7056 $01"]),
               (4646, ["w $7056 $00"]), (4696, ["w $56726 $30"]),
               (5596, ["w $56726 $4e"])]
    if args.route == "sp":
        offsets.append((5896, ["w $56726 $4e"]))
    offsets += [(6196, ["w $56726 $66"]), (15996, ["w $56726 $26"])]
    steps = {5994 + offset: lines for offset, lines in offsets}
    if not args.baseline:
        steps[5994] = ["w $56726 $72"]
    for vbl in (5994, 11614, 12614, 13724, 15994, 17494, 17834, 17844, 17894, 17994, 22500):
        steps.setdefault(vbl, [])
        steps[vbl] = ["e VBL", f"savebin {run}/v{vbl}.ram 0 $100000",
                      f"screenshot {run}/v{vbl}.png", f"statesave {run}/v{vbl}.sav"] + steps[vbl]
    ordered = sorted(steps.items())
    for i, (vbl, lines) in enumerate(ordered):
        script(f"vbl-{i}", [once("pc = $5a41a", f"step-{i}")])
        tail = [once(f"VBL > {ordered[i+1][0]-1}", f"vbl-{i+1}")] if i+1 < len(ordered) else ["quit"]
        script(f"step-{i}", lines + tail)
    fields = ["m $7146-$7152", "m $70b4-$70ba", "m $5796-$579a", "m $7052-$7054",
              "m $42c6c-$42c76", "m $70e4-$70e6", "m $7324-$7326", "m $70a4-$70ac"]
    script("vbl", ["e $b001", "e VBL", "e CycleCounter"] + fields)
    script("post", ["e $b003", "e VBL", "e CycleCounter"] + fields)
    arm = [
        f"b pc = $53164 && VBL > 17819 && VBL < 17901 :trace :quiet :file {run}/vbl.ini",
        f"b pc = $50b62 && VBL > 17819 && VBL < 17901 :trace :quiet :file {run}/post.ini",
        f"b pc = $50b4c && VBL > 17819 && VBL < 17901 :trace :quiet :file {run}/post.ini",
        once("VBL > 5993", "vbl-0")]
    if args.baseline:
        state = run / "B0.sav"
        shutil.copyfile(args.baseline, state)
        state.with_suffix(".sav.debug").write_text("\n".join(["w $56726 $72"] + arm) + "\n")
        script("restore", [f"stateload {state}"])
        boot = script("boot", [once("VBL = 50", "restore"), "c"])
    else:
        script("opening", ["e $b004", "e VBL", "e CycleCounter", "m $5796-$579a"])
        boot = script("boot", [f"b pc = $59fba :trace :once :quiet :file {run}/opening.ini"] + arm + ["c"])
    config = run / "empty.cfg"
    config.write_text("")
    command = [str(paths["hatari"]), "--configfile", str(config), "--tos", str(paths["tos"]),
               "--machine", "st", "--memsize", "1", "--cpulevel", "0", "--cpuclock", "8",
               "--compatible", "true", "--cpu-exact", "true", "--addr24", "true", "--fpu", "none",
               "--blitter", "false", "--monitor", "rgb", "--video-timing", "ws3", "--timer-d", "false",
               "--fast-boot", "false", "--fastfdc", "false", "--disk-a", str(paths["disk"]),
               "--disk-b", "none", "--drive-b", "false", "--protect-floppy", "on", "--sound", "off",
               "--statusbar", "false", "--drive-led", "false", "--crop", "true",
               "--screenshot-format", "png", "--fast-forward", "true", "--confirm-quit", "false",
               "--alert-level", "fatal", "--log-level", "warn", "--parse", str(boot)]
    (run / "command.json").write_text(json.dumps(command, indent=2) + "\n")
    with (run / "hatari.log").open("w") as log:
        subprocess.run(command, stdout=log, stderr=log, stdin=subprocess.DEVNULL, check=True,
                       timeout=1200, env={**os.environ, "SDL_VIDEODRIVER": "dummy", "SDL_AUDIODRIVER": "dummy"})
    return {"run": str(run), "note": "Labels are minimum requested VBLs; e VBL records actual loop-top capture time."}

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("inspect")
    p.add_argument("--ram", type=Path, required=True)
    p.add_argument("--screenshot", type=Path)
    p = commands.add_parser("capture")
    p.add_argument("--rom-root", type=lambda value: Path(value).resolve(), required=True)
    p.add_argument("--baseline", type=lambda value: Path(value).resolve(),
                   help="Optional pinned R4 NTSC B0 acceleration; default cold-boots local media")
    p.add_argument("--hatari", type=lambda value: Path(value).resolve(),
                   default=Path("/opt/homebrew/Cellar/hatari/2.6.1/Hatari.app/Contents/MacOS/hatari"))
    p.add_argument("--route", choices=("sol", "sp"), required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(args) if args.command == "inspect" else capture(args), indent=2))

if __name__ == "__main__":
    main()
