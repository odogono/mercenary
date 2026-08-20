from __future__ import annotations

from io import BytesIO

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from .core import Glyph, bitmap_contours, contours_bitmap, require


UNITS_PER_PIXEL = 128
UNITS_PER_EM = 1024
DETERMINISTIC_TIMESTAMP = 2_082_844_800


def _glyph_name(character: str) -> str:
    return f"uni{ord(character):04X}"


def _outline(glyph: Glyph):
    pen = TTGlyphPen(None)
    glyph_height = len(glyph.rows)
    for x, y, width, height in bitmap_contours(glyph):
        left = x * UNITS_PER_PIXEL
        right = (x + width) * UNITS_PER_PIXEL
        top = (glyph_height - y) * UNITS_PER_PIXEL
        bottom = (glyph_height - y - height) * UNITS_PER_PIXEL
        pen.moveTo((left, bottom))
        pen.lineTo((right, bottom))
        pen.lineTo((right, top))
        pen.lineTo((left, top))
        pen.closePath()
    return pen.glyph()


def build_woff2(family: str, glyphs: dict[str, Glyph]) -> bytes:
    glyph_order = [".notdef", *(_glyph_name(character) for character in glyphs)]
    outlines = {".notdef": TTGlyphPen(None).glyph()}
    outlines.update({_glyph_name(character): _outline(glyph) for character, glyph in glyphs.items()})
    metrics = {".notdef": (6 * UNITS_PER_PIXEL, 0)}
    metrics.update(
        {
            _glyph_name(character): (glyph.advance * UNITS_PER_PIXEL, 0)
            for character, glyph in glyphs.items()
        }
    )

    builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap({ord(character): _glyph_name(character) for character in glyphs})
    builder.setupGlyf(outlines)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=UNITS_PER_EM, descent=0)
    builder.setupNameTable(
        {
            "familyName": family,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"Mercenary/{family}/1",
            "fullName": f"{family} Regular",
            "psName": family.replace(" ", "") + "-Regular",
            "version": "Version 1.000",
        }
    )
    cap_height = max(len(glyph.rows) for glyph in glyphs.values()) * UNITS_PER_PIXEL
    builder.setupOS2(
        sTypoAscender=UNITS_PER_EM,
        sTypoDescender=0,
        sTypoLineGap=0,
        usWinAscent=UNITS_PER_EM,
        usWinDescent=0,
        sxHeight=cap_height,
        sCapHeight=cap_height,
        usWeightClass=400,
        fsSelection=0x40,
    )
    builder.setupPost(keepGlyphNames=False)
    builder.setupMaxp()
    font = builder.font
    font.recalcTimestamp = False
    font["head"].created = DETERMINISTIC_TIMESTAMP
    font["head"].modified = DETERMINISTIC_TIMESTAMP
    font.flavor = "woff2"
    output = BytesIO()
    font.save(output, reorderTables=True)
    return output.getvalue()


def validate_source_roundtrips(font_bytes: bytes, glyphs: dict[str, Glyph]) -> None:
    """Decode every extracted outline and require the exact source bitmap."""
    with TTFont(BytesIO(font_bytes)) as font:
        cmap = font.getBestCmap()
        glyf = font["glyf"]
        for character, glyph in glyphs.items():
            if not glyph.source:
                continue
            coordinates, endpoints, _ = glyf[cmap[ord(character)]].getCoordinates(glyf)
            start = 0
            contours: list[tuple[int, int, int, int]] = []
            for endpoint in endpoints:
                points = coordinates[start : endpoint + 1]
                require(len(points) == 4, f"Generated {character!r} contour is not square")
                left = min(point[0] for point in points)
                right = max(point[0] for point in points)
                bottom = min(point[1] for point in points)
                top = max(point[1] for point in points)
                require(
                    all(value % UNITS_PER_PIXEL == 0 for value in (left, right, bottom, top)),
                    f"Generated {character!r} contour leaves the font grid",
                )
                contours.append(
                    (
                        left // UNITS_PER_PIXEL,
                        len(glyph.rows) - top // UNITS_PER_PIXEL,
                        (right - left) // UNITS_PER_PIXEL,
                        (top - bottom) // UNITS_PER_PIXEL,
                    )
                )
                start = endpoint + 1
            decoded = contours_bitmap(
                contours,
                width=glyph.width,
                height=len(glyph.rows),
            )
            require(decoded == glyph.rows, f"Generated {character!r} outline changed its source bitmap")
