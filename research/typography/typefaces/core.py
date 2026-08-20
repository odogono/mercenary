from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Literal

from PIL import Image


class TypographyError(RuntimeError):
    """A user-actionable extraction or validation failure."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise TypographyError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_sha256(value: object, context: str) -> str:
    require(
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value),
        f"{context} needs a sha256",
    )
    return value


@dataclass(frozen=True)
class Glyph:
    width: int
    rows: tuple[int, ...]
    advance: int
    source: bool

    def __post_init__(self) -> None:
        require(0 < self.width <= 8, f"Glyph width must be 1-8, got {self.width}")
        require(0 < len(self.rows) <= 8, f"Glyph height must be 1-8, got {len(self.rows)}")
        require(self.advance >= self.width, "Glyph advance must contain its bitmap")
        require(
            all(isinstance(row, int) and 0 <= row < (1 << self.width) for row in self.rows),
            "Glyph row exceeds its bitmap width",
        )


@dataclass(frozen=True)
class GlyphSample:
    character: str
    x: int
    y: int
    width: int
    height: int
    foreground: tuple[int, int, int]


CHARACTER_REPERTOIRE = tuple(chr(code) for code in range(0x20, 0x7F)) + (
    "°",
    "·",
    "—",
    "…",
)

MERCENARY_FONT_START = 0x7800
MERCENARY_FONT_END = 0x8000


def _mercenary_character_codes() -> dict[str, int]:
    codes = {" ": 0x20}
    codes.update({str(digit): 0x10 + digit for digit in range(10)})
    codes.update({chr(ord("A") + index): 0x41 + index for index in range(26)})
    codes.update({character: 0x0A + index for index, character in enumerate("*+,-./")})
    codes.update({character: 0x1A + index for index, character in enumerate(":;<=>")})
    return codes


def extract_mercenary_glyphs(ram: bytes) -> tuple[dict[str, Glyph], bytes]:
    require(len(ram) == 65536, f"Mercenary font extraction needs 64 KiB physical RAM, got {len(ram)} bytes")
    source = ram[MERCENARY_FONT_START:MERCENARY_FONT_END]
    require(len(source) == 2048, "Mercenary font table is not exactly 2,048 bytes")
    glyphs: dict[str, Glyph] = {}
    for character, code in _mercenary_character_codes().items():
        start = code * 8
        glyphs[character] = Glyph(
            width=8,
            rows=tuple(source[start : start + 8]),
            advance=8,
            source=True,
        )
    return glyphs, source


def _artifact_entry(manifest: dict[str, Any], role: str) -> dict[str, Any]:
    require(manifest.get("schemaVersion") == 1, "Source run manifest schemaVersion must be 1")
    require(isinstance(manifest.get("runId"), str) and bool(manifest["runId"]), "Source run manifest needs a runId")
    artifacts = manifest.get("artifacts")
    require(isinstance(artifacts, list), "Source run manifest artifacts must be a list")
    matches = [artifact for artifact in artifacts if isinstance(artifact, dict) and artifact.get("role") == role]
    require(len(matches) == 1, f"Source run must register exactly one {role!r} artifact")
    return matches[0]


def verified_run_manifest(
    run: Path, *, laboratory: Literal["c64", "damocles"]
) -> dict[str, Any]:
    manifest_path = run / "manifest.json"
    require(manifest_path.is_file(), f"Source run has no manifest.json: {run}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise TypographyError(f"Could not read source run manifest {manifest_path}: {error}") from error
    require(isinstance(manifest, dict), "Source run manifest must be an object")
    require(manifest.get("schemaVersion") == 1, "Source run manifest schemaVersion must be 1")
    required_fields = (
        "runId",
        "createdAt",
        "toolchain",
        "machine",
        "scenario",
        "checkpoint",
        "artifacts",
        "build" if laboratory == "c64" else "authority",
    )
    for field in required_fields:
        require(field in manifest, f"Source run manifest is missing {field}")
    require(
        isinstance(manifest["runId"], str) and bool(manifest["runId"]),
        "Source run manifest runId is invalid",
    )
    require(
        isinstance(manifest["createdAt"], str) and bool(manifest["createdAt"]),
        "Source run manifest createdAt is invalid",
    )
    for field in required_fields[2:6]:
        require(isinstance(manifest[field], dict), f"Source run manifest {field} must be an object")
    authority_field = "build" if laboratory == "c64" else "authority"
    require(
        isinstance(manifest[authority_field], dict),
        f"Source run manifest {authority_field} must be an object",
    )
    artifacts = manifest["artifacts"]
    require(isinstance(artifacts, list), "Source run manifest artifacts must be a list")
    root = run.resolve()
    for index, artifact in enumerate(artifacts):
        require(isinstance(artifact, dict), f"Source run artifact {index} must be an object")
        role = artifact.get("role")
        path_text = artifact.get("path")
        size = artifact.get("size")
        require(isinstance(role, str) and bool(role), f"Source run artifact {index} needs a role")
        require(isinstance(path_text, str) and bool(path_text), f"Source run artifact {index} needs a path")
        require(
            isinstance(size, int) and not isinstance(size, bool) and size >= 0,
            f"Source run artifact {index} needs a size",
        )
        digest = require_sha256(artifact.get("sha256"), f"Source run artifact {index}")
        path = (run / path_text).resolve()
        require(path.is_relative_to(root), f"Source run artifact escapes its run directory: {path_text}")
        require(path.is_file(), f"Source run artifact is missing: {path_text}")
        content = path.read_bytes()
        require(len(content) == size, f"Source run artifact {path_text} must be {size} bytes, got {len(content)}")
        require(
            sha256(content) == digest,
            f"Source run artifact {path_text} sha256 mismatch",
        )
    return manifest


def verified_artifact(
    run: Path,
    *,
    role: str,
    size: int | None = None,
    manifest: dict[str, Any] | None = None,
) -> tuple[Path, dict[str, str]]:
    if manifest is None:
        manifest_path = run / "manifest.json"
        require(manifest_path.is_file(), f"Source run has no manifest.json: {run}")
        try:
            loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise TypographyError(f"Could not read source run manifest {manifest_path}: {error}") from error
        require(isinstance(loaded, dict), "Source run manifest must be an object")
        manifest = loaded
    artifact = _artifact_entry(manifest, role)
    path_text = artifact.get("path")
    digest = artifact.get("sha256")
    registered_size = artifact.get("size")
    require(isinstance(path_text, str) and bool(path_text), f"Source {role} artifact needs a path")
    digest = require_sha256(digest, f"Source {role} artifact")
    require(isinstance(registered_size, int) and registered_size > 0, f"Source {role} artifact needs a size")
    if size is not None:
        require(registered_size == size, f"Source {role} artifact size must be {size}, got {registered_size}")
    root = run.resolve()
    path = (run / path_text).resolve()
    require(path.is_relative_to(root), f"Source {role} artifact escapes its run directory")
    require(path.is_file(), f"Source {role} artifact is missing: {path}")
    content = path.read_bytes()
    require(len(content) == registered_size, f"Source {role} bytes must be {registered_size}, got {len(content)}")
    actual_digest = sha256(content)
    require(actual_digest == digest, f"Source {role} sha256 mismatch: expected {digest}, got {actual_digest}")
    return path, {"runId": manifest["runId"], "artifactSha256": actual_digest}


def segment_samples(
    image: Image.Image,
    samples: Iterable[GlyphSample],
    *,
    advance: int,
    origin: tuple[int, int] = (0, 0),
    pixel_scale: int = 1,
) -> dict[str, Glyph]:
    require(pixel_scale > 0, "Logical pixel scale must be positive")
    rgb = image.convert("RGB")
    glyphs: dict[str, Glyph] = {}
    for sample in samples:
        require(len(sample.character) == 1, "Glyph samples must name one character")
        rows: list[int] = []
        for logical_y in range(sample.height):
            row = 0
            for logical_x in range(sample.width):
                x = origin[0] + (sample.x + logical_x) * pixel_scale
                y = origin[1] + (sample.y + logical_y) * pixel_scale
                require(
                    x + pixel_scale <= rgb.width and y + pixel_scale <= rgb.height,
                    "Glyph sample leaves its display",
                )
                block = {
                    rgb.getpixel((x + dx, y + dy))
                    for dx in range(pixel_scale)
                    for dy in range(pixel_scale)
                }
                require(len(block) == 1, "Display scaling block is not one logical pixel")
                if sample.foreground in block:
                    row |= 1 << (sample.width - logical_x - 1)
            rows.append(row)
        glyph = Glyph(width=sample.width, rows=tuple(rows), advance=advance, source=True)
        previous = glyphs.get(sample.character)
        require(previous is None or previous == glyph, f"Damocles samples disagree for {sample.character!r}")
        glyphs[sample.character] = glyph
    return glyphs


def require_matching_damocles_glyphs(first: dict[str, Glyph], second: dict[str, Glyph]) -> dict[str, Glyph]:
    require(first == second, "Damocles glyphs differ between independent cold captures")
    require(bool(first), "Damocles captures yielded no interface glyphs")
    return first


def bitmap_contours(glyph: Glyph) -> tuple[tuple[int, int, int, int], ...]:
    contours: list[tuple[int, int, int, int]] = []
    for y, row in enumerate(glyph.rows):
        for x in range(glyph.width):
            if row & (1 << (glyph.width - x - 1)):
                contours.append((x, y, 1, 1))
    return tuple(contours)


def contours_bitmap(
    contours: Iterable[tuple[int, int, int, int]], *, width: int, height: int
) -> tuple[int, ...]:
    rows = [0] * height
    for x, y, contour_width, contour_height in contours:
        require(contour_width == 1 and contour_height == 1, "Only square logical-pixel contours can be decoded")
        require(0 <= x < width and 0 <= y < height, "Contour leaves its logical bitmap")
        rows[y] |= 1 << (width - x - 1)
    return tuple(rows)


_PATTERNS = {
    " ": "00000/00000/00000/00000/00000/00000/00000",
    "0": "01110/10001/10011/10101/11001/10001/01110",
    "1": "00100/01100/00100/00100/00100/00100/01110",
    "2": "01110/10001/00001/00010/00100/01000/11111",
    "3": "11110/00001/00001/01110/00001/00001/11110",
    "4": "00010/00110/01010/10010/11111/00010/00010",
    "5": "11111/10000/10000/11110/00001/00001/11110",
    "6": "01110/10000/10000/11110/10001/10001/01110",
    "7": "11111/00001/00010/00100/01000/01000/01000",
    "8": "01110/10001/10001/01110/10001/10001/01110",
    "9": "01110/10001/10001/01111/00001/00001/01110",
    "A": "01110/10001/10001/11111/10001/10001/10001",
    "B": "11110/10001/10001/11110/10001/10001/11110",
    "C": "01111/10000/10000/10000/10000/10000/01111",
    "D": "11110/10001/10001/10001/10001/10001/11110",
    "E": "11111/10000/10000/11110/10000/10000/11111",
    "F": "11111/10000/10000/11110/10000/10000/10000",
    "G": "01111/10000/10000/10111/10001/10001/01111",
    "H": "10001/10001/10001/11111/10001/10001/10001",
    "I": "01110/00100/00100/00100/00100/00100/01110",
    "J": "00111/00010/00010/00010/10010/10010/01100",
    "K": "10001/10010/10100/11000/10100/10010/10001",
    "L": "10000/10000/10000/10000/10000/10000/11111",
    "M": "10001/11011/10101/10101/10001/10001/10001",
    "N": "10001/11001/10101/10011/10001/10001/10001",
    "O": "01110/10001/10001/10001/10001/10001/01110",
    "P": "11110/10001/10001/11110/10000/10000/10000",
    "Q": "01110/10001/10001/10001/10101/10010/01101",
    "R": "11110/10001/10001/11110/10100/10010/10001",
    "S": "01111/10000/10000/01110/00001/00001/11110",
    "T": "11111/00100/00100/00100/00100/00100/00100",
    "U": "10001/10001/10001/10001/10001/10001/01110",
    "V": "10001/10001/10001/10001/10001/01010/00100",
    "W": "10001/10001/10001/10101/10101/10101/01010",
    "X": "10001/10001/01010/00100/01010/10001/10001",
    "Y": "10001/10001/01010/00100/00100/00100/00100",
    "Z": "11111/00001/00010/00100/01000/10000/11111",
    "!": "00100/00100/00100/00100/00100/00000/00100",
    '"': "01010/01010/01010/00000/00000/00000/00000",
    "#": "01010/11111/01010/01010/11111/01010/00000",
    "$": "00100/01111/10100/01110/00101/11110/00100",
    "%": "11001/11010/00100/01000/10110/00110/00000",
    "&": "01100/10010/10100/01000/10101/10010/01101",
    "'": "00100/00100/01000/00000/00000/00000/00000",
    "(": "00010/00100/01000/01000/01000/00100/00010",
    ")": "01000/00100/00010/00010/00010/00100/01000",
    "*": "00000/10101/01110/11111/01110/10101/00000",
    "+": "00000/00100/00100/11111/00100/00100/00000",
    ",": "00000/00000/00000/00000/00100/00100/01000",
    "-": "00000/00000/00000/11111/00000/00000/00000",
    ".": "00000/00000/00000/00000/00000/00100/00100",
    "/": "00001/00010/00100/01000/10000/00000/00000",
    ":": "00000/00100/00100/00000/00100/00100/00000",
    ";": "00000/00100/00100/00000/00100/00100/01000",
    "<": "00010/00100/01000/10000/01000/00100/00010",
    "=": "00000/11111/00000/11111/00000/00000/00000",
    ">": "01000/00100/00010/00001/00010/00100/01000",
    "?": "01110/10001/00001/00010/00100/00000/00100",
    "@": "01110/10001/10111/10101/10111/10000/01110",
    "[": "01110/01000/01000/01000/01000/01000/01110",
    "\\": "10000/01000/00100/00010/00001/00000/00000",
    "]": "01110/00010/00010/00010/00010/00010/01110",
    "^": "00100/01010/10001/00000/00000/00000/00000",
    "_": "00000/00000/00000/00000/00000/00000/11111",
    "`": "01000/00100/00010/00000/00000/00000/00000",
    "{": "00010/00100/00100/01000/00100/00100/00010",
    "|": "00100/00100/00100/00100/00100/00100/00100",
    "}": "01000/00100/00100/00010/00100/00100/01000",
    "~": "00000/00000/01001/10110/00000/00000/00000",
    "°": "01110/10001/10001/01110/00000/00000/00000",
    "·": "00000/00000/00000/00100/00000/00000/00000",
    "—": "00000/00000/00000/11111/00000/00000/00000",
    "…": "00000/00000/00000/00000/00000/10101/10101",
}

_LOWERCASE_PATTERNS = {
    "a": "00000/00000/01110/00001/01111/10001/01111",
    "b": "10000/10000/10110/11001/10001/10001/11110",
    "c": "00000/00000/01111/10000/10000/10000/01111",
    "d": "00001/00001/01101/10011/10001/10001/01111",
    "e": "00000/00000/01110/10001/11111/10000/01111",
    "f": "00110/01000/01000/11100/01000/01000/01000",
    "g": "00000/01111/10001/01111/00001/10001/01110",
    "h": "10000/10000/10110/11001/10001/10001/10001",
    "i": "00100/00000/01100/00100/00100/00100/01110",
    "j": "00010/00000/00110/00010/00010/10010/01100",
    "k": "10000/10000/10010/10100/11000/10100/10010",
    "l": "01100/00100/00100/00100/00100/00100/01110",
    "m": "00000/00000/11010/10101/10101/10101/10101",
    "n": "00000/00000/10110/11001/10001/10001/10001",
    "o": "00000/00000/01110/10001/10001/10001/01110",
    "p": "00000/11110/10001/11110/10000/10000/10000",
    "q": "00000/01111/10001/01111/00001/00001/00001",
    "r": "00000/00000/10110/11001/10000/10000/10000",
    "s": "00000/00000/01111/10000/01110/00001/11110",
    "t": "01000/01000/11100/01000/01000/01001/00110",
    "u": "00000/00000/10001/10001/10001/10011/01101",
    "v": "00000/00000/10001/10001/10001/01010/00100",
    "w": "00000/00000/10001/10001/10101/10101/01010",
    "x": "00000/00000/10001/01010/00100/01010/10001",
    "y": "00000/10001/10001/01111/00001/10001/01110",
    "z": "00000/00000/11111/00010/00100/01000/11111",
}

_PATTERNS_5 = {
    " ": "00000/00000/00000/00000/00000",
    "0": "01110/10001/10101/10001/01110",
    "1": "00100/01100/00100/00100/01110",
    "2": "01110/10001/00010/00100/11111",
    "3": "11110/00001/00110/00001/11110",
    "4": "10010/10010/11111/00010/00010",
    "5": "11111/10000/11110/00001/11110",
    "6": "01110/10000/11110/10001/01110",
    "7": "11111/00001/00010/00100/00100",
    "8": "01110/10001/01110/10001/01110",
    "9": "01110/10001/01111/00001/01110",
    "A": "01110/10001/11111/10001/10001",
    "B": "11110/10001/11110/10001/11110",
    "C": "01111/10000/10000/10000/01111",
    "D": "11110/10001/10001/10001/11110",
    "E": "11111/10000/11110/10000/11111",
    "F": "11111/10000/11110/10000/10000",
    "G": "01111/10000/10111/10001/01111",
    "H": "10001/10001/11111/10001/10001",
    "I": "01110/00100/00100/00100/01110",
    "J": "00111/00010/00010/10010/01100",
    "K": "10010/10100/11000/10100/10010",
    "L": "10000/10000/10000/10000/11111",
    "M": "10001/11011/10101/10001/10001",
    "N": "10001/11001/10101/10011/10001",
    "O": "01110/10001/10001/10001/01110",
    "P": "11110/10001/11110/10000/10000",
    "Q": "01110/10001/10101/10010/01101",
    "R": "11110/10001/11110/10100/10010",
    "S": "01111/10000/01110/00001/11110",
    "T": "11111/00100/00100/00100/00100",
    "U": "10001/10001/10001/10001/01110",
    "V": "10001/10001/10001/01010/00100",
    "W": "10001/10001/10101/11011/10001",
    "X": "10001/01010/00100/01010/10001",
    "Y": "10001/01010/00100/00100/00100",
    "Z": "11111/00010/00100/01000/11111",
    "!": "00100/00100/00100/00000/00100",
    '"': "01010/01010/00000/00000/00000",
    "'": "00100/00100/00000/00000/00000",
    "+": "00000/00100/11111/00100/00000",
    ",": "00000/00000/00000/00100/01000",
    "-": "00000/00000/11111/00000/00000",
    ".": "00000/00000/00000/00000/00100",
    "/": "00001/00010/00100/01000/10000",
    ":": "00000/00100/00000/00100/00000",
    ";": "00000/00100/00000/00100/01000",
    "=": "00000/11111/00000/11111/00000",
    "?": "01110/00001/00110/00000/00100",
    "_": "00000/00000/00000/00000/11111",
    "|": "00100/00100/00100/00100/00100",
    "°": "01110/10001/01110/00000/00000",
    "·": "00000/00000/00100/00000/00000",
    "—": "00000/00000/11111/00000/00000",
    "…": "00000/00000/00000/00000/10101",
}


def _synthetic_glyph(character: str, *, width: int, height: int, advance: int) -> Glyph:
    lowercase_pattern = _LOWERCASE_PATTERNS.get(character)
    if lowercase_pattern is not None:
        source_rows = tuple(int(row, 2) for row in lowercase_pattern.split("/"))
        if height == 5:
            source_rows = source_rows[-5:]
        pattern = None
    else:
        pattern = _PATTERNS_5.get(character) if height == 5 else None
    if pattern is None:
        if lowercase_pattern is None:
            pattern = _PATTERNS.get(character, _PATTERNS["?"])
            source_rows = tuple(int(row, 2) for row in pattern.split("/"))
            if height == 5:
                source_rows = tuple(source_rows[index] for index in (0, 1, 3, 5, 6))
    else:
        source_rows = tuple(int(row, 2) for row in pattern.split("/"))
    require(width >= 5, "Synthesized face needs a grid at least five pixels wide")
    shift = (width - 5) // 2
    if height == 8:
        source_rows = (0, *source_rows)
    elif height != 5:
        require(height == 7, "Synthesized face height must be 5, 7, or 8 pixels")
    return Glyph(width=width, rows=tuple(row << shift for row in source_rows), advance=advance, source=False)


def complete_glyphs(source: dict[str, Glyph], *, width: int, height: int, advance: int) -> dict[str, Glyph]:
    return {
        character: (
            source[character]
            if character in source
            else _synthetic_glyph(character, width=width, height=height, advance=advance)
        )
        for character in CHARACTER_REPERTOIRE
    }


DAMOCLES_INTERFACE_SAMPLES = (
    GlyphSample("E", 17, 162, 5, 5, (0, 0, 0)),
    GlyphSample("R", 23, 162, 5, 5, (0, 0, 0)),
    GlyphSample("I", 30, 162, 3, 5, (0, 0, 0)),
    GlyphSample("S", 35, 162, 5, 5, (0, 0, 0)),
    GlyphSample("M", 247, 162, 5, 5, (0, 0, 0)),
    GlyphSample("P", 253, 162, 5, 5, (0, 0, 0)),
    GlyphSample("T", 259, 162, 5, 5, (0, 0, 0)),
    GlyphSample("Y", 265, 162, 5, 5, (0, 0, 0)),
    GlyphSample("0", 78, 162, 3, 5, (0, 0, 0)),
    GlyphSample("1", 38, 173, 1, 5, (0, 0, 0)),
    GlyphSample("2", 52, 173, 3, 5, (0, 0, 0)),
    GlyphSample("6", 41, 173, 3, 5, (0, 0, 0)),
    GlyphSample("7", 73, 173, 3, 5, (0, 0, 0)),
    GlyphSample("8", 56, 173, 3, 5, (0, 0, 0)),
    GlyphSample("9", 232, 173, 3, 5, (0, 0, 0)),
    GlyphSample("+", 72, 162, 3, 5, (0, 0, 0)),
    GlyphSample("-", 46, 173, 4, 5, (0, 0, 0)),
)

_DAMOCLES_ADVANCE_PAIRS = (("E", "R"), ("M", "P"), ("P", "T"), ("T", "Y"))


def damocles_monospaced_advance(samples: Iterable[GlyphSample]) -> int:
    """Derive cell advance from consecutive full-width glyphs in observed labels."""
    sample_list = tuple(samples)
    by_character = {sample.character: sample for sample in sample_list}
    expected_characters = {sample.character for sample in DAMOCLES_INTERFACE_SAMPLES}
    require(
        len(by_character) == len(sample_list)
        and set(by_character) == expected_characters,
        "Damocles advance evidence must contain every interface sample once",
    )
    advances: set[int] = set()
    for first, second in _DAMOCLES_ADVANCE_PAIRS:
        require(
            first in by_character and second in by_character,
            "Damocles advance evidence is missing a measured pair",
        )
        advances.add(by_character[second].x - by_character[first].x)
    require(
        len(advances) == 1,
        "Damocles interface samples do not have one monospaced advance",
    )
    advance = advances.pop()
    require(advance > 0, "Damocles interface advance must be positive")
    return advance


def extract_damocles_interface(image: Image.Image) -> dict[str, Glyph]:
    require(image.size == (832, 552), f"Damocles display must be 832x552, got {image.size}")
    glyphs = segment_samples(
        image,
        DAMOCLES_INTERFACE_SAMPLES,
        advance=damocles_monospaced_advance(DAMOCLES_INTERFACE_SAMPLES),
        origin=(96, 56),
        pixel_scale=2,
    )
    require(
        all(any(glyph.rows) for glyph in glyphs.values()),
        "Damocles display has a blank interface glyph sample",
    )
    return glyphs
