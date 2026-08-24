from __future__ import annotations

from io import BytesIO
from typing import Iterable

from PIL import Image, ImageDraw

from .core import CHARACTER_REPERTOIRE, Glyph, require


REVIEW_COLUMNS = 16
REVIEW_PIXEL_SCALE = 4
REVIEW_CELL_PADDING = 4
REVIEW_CELL_SIZE = 8 * REVIEW_PIXEL_SCALE + 2 * REVIEW_CELL_PADDING
REVIEW_BACKGROUND = (8, 12, 20)
REVIEW_INK = (240, 244, 248)
REVIEW_SOURCE_BORDER = (64, 176, 255)
REVIEW_SYNTHESIZED_BORDER = (255, 176, 64)


def build_review_sheet(faces: Iterable[dict[str, Glyph]]) -> bytes:
    """Render complete faces in repertoire order for human review."""
    face_list = tuple(faces)
    require(bool(face_list), "Typography review sheet needs at least one face")
    required = set(CHARACTER_REPERTOIRE)
    for face in face_list:
        require(set(face) == required, "Typography review face must contain the complete repertoire")

    rows = (len(CHARACTER_REPERTOIRE) + REVIEW_COLUMNS - 1) // REVIEW_COLUMNS
    panel_height = rows * REVIEW_CELL_SIZE
    image = Image.new(
        "RGB",
        (REVIEW_COLUMNS * REVIEW_CELL_SIZE, panel_height * len(face_list)),
        REVIEW_BACKGROUND,
    )
    draw = ImageDraw.Draw(image)
    for face_index, face in enumerate(face_list):
        panel_top = face_index * panel_height
        for glyph_index, character in enumerate(CHARACTER_REPERTOIRE):
            glyph = face[character]
            left = (glyph_index % REVIEW_COLUMNS) * REVIEW_CELL_SIZE
            top = panel_top + (glyph_index // REVIEW_COLUMNS) * REVIEW_CELL_SIZE
            border = REVIEW_SOURCE_BORDER if glyph.source else REVIEW_SYNTHESIZED_BORDER
            draw.rectangle(
                (left, top, left + REVIEW_CELL_SIZE - 1, top + REVIEW_CELL_SIZE - 1),
                outline=border,
            )
            glyph_left = left + REVIEW_CELL_PADDING + (8 - glyph.width) * REVIEW_PIXEL_SCALE // 2
            glyph_top = top + REVIEW_CELL_PADDING + (8 - len(glyph.rows)) * REVIEW_PIXEL_SCALE // 2
            for y, row in enumerate(glyph.rows):
                for x in range(glyph.width):
                    if row & (1 << (glyph.width - x - 1)):
                        pixel_left = glyph_left + x * REVIEW_PIXEL_SCALE
                        pixel_top = glyph_top + y * REVIEW_PIXEL_SCALE
                        draw.rectangle(
                            (
                                pixel_left,
                                pixel_top,
                                pixel_left + REVIEW_PIXEL_SCALE - 1,
                                pixel_top + REVIEW_PIXEL_SCALE - 1,
                            ),
                            fill=REVIEW_INK,
                        )

    output = BytesIO()
    image.save(output, format="PNG", compress_level=9, optimize=False)
    return output.getvalue()
