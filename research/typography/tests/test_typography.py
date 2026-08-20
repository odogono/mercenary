from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

TYPOGRAPHY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TYPOGRAPHY_ROOT))

from typefaces.core import (  # noqa: E402
    CHARACTER_REPERTOIRE,
    DAMOCLES_INTERFACE_SAMPLES,
    Glyph,
    GlyphSample,
    TypographyError,
    bitmap_contours,
    complete_glyphs,
    contours_bitmap,
    extract_mercenary_glyphs,
    require_matching_damocles_glyphs,
    segment_samples,
    verified_artifact,
)
from typefaces.exporter import SOURCE_SCENARIO_SHA256, export_typefaces  # noqa: E402
from typefaces.font import UNITS_PER_PIXEL, build_woff2  # noqa: E402
from typefaces.review import (  # noqa: E402
    REVIEW_CELL_SIZE,
    REVIEW_COLUMNS,
    REVIEW_SOURCE_BORDER,
    REVIEW_SYNTHESIZED_BORDER,
    build_review_sheet,
)


class SourceRunTests(unittest.TestCase):
    def test_accepts_only_a_registered_artifact_with_matching_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            content = b"conditioned evidence"
            (run / "memory.bin").write_bytes(content)
            (run / "manifest.json").write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "runId": "synthetic-run",
                        "artifacts": [
                            {
                                "path": "memory.bin",
                                "role": "ram",
                                "size": len(content),
                                "sha256": hashlib.sha256(content).hexdigest(),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            artifact, identity = verified_artifact(run, role="ram", size=len(content))

            self.assertEqual(artifact.read_bytes(), content)
            self.assertEqual(identity["runId"], "synthetic-run")
            self.assertEqual(identity["artifactSha256"], hashlib.sha256(content).hexdigest())

    def test_rejects_changed_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            (run / "memory.bin").write_bytes(b"changed")
            (run / "manifest.json").write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "runId": "synthetic-run",
                        "artifacts": [
                            {
                                "path": "memory.bin",
                                "role": "ram",
                                "size": 7,
                                "sha256": "0" * 64,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(TypographyError, "sha256"):
                verified_artifact(run, role="ram", size=7)


class MercenaryExtractionTests(unittest.TestCase):
    def test_reads_the_complete_2048_byte_font_and_maps_text_glyphs(self) -> None:
        ram = bytearray(65536)
        for code in range(256):
            start = 0x7800 + code * 8
            ram[start : start + 8] = bytes([code]) * 8

        glyphs, source = extract_mercenary_glyphs(bytes(ram))

        self.assertEqual(source, bytes(ram[0x7800:0x8000]))
        self.assertEqual(len(source), 2048)
        self.assertEqual(glyphs["A"].rows, (0x41,) * 8)
        self.assertEqual(glyphs["Z"].rows, (0x5A,) * 8)
        self.assertEqual(glyphs["0"].rows, (0x10,) * 8)
        self.assertNotIn("a", glyphs)
        self.assertNotIn("?", glyphs)

    def test_excludes_noisy_non_text_slots_from_the_source_face(self) -> None:
        ram = bytearray(65536)
        ram[0x7800 + 0x21 * 8 : 0x7800 + 0x22 * 8] = bytes.fromhex(
            "33ff00183c667e66"
        )
        ram[0x7800 + 0x1F * 8 : 0x7800 + 0x20 * 8] = bytes.fromhex(
            "003c660c18001855"
        )

        source, _ = extract_mercenary_glyphs(bytes(ram))
        complete = complete_glyphs(source, width=8, height=8, advance=8)

        self.assertNotIn("a", source)
        self.assertNotIn("?", source)
        self.assertFalse(complete["a"].source)
        self.assertFalse(complete["?"].source)
        self.assertEqual(complete["a"].rows[0], 0)
        self.assertNotEqual(complete["?"].rows[-1], 0x55)

        from fontTools.ttLib import TTFont

        with TTFont(BytesIO(build_woff2("Mercenary Regression", complete))) as font:
            cmap = font.getBestCmap()
            glyf = font["glyf"]
            self.assertLess(glyf[cmap[ord("a")]].yMax, 1024)
            coordinates, endpoints, _ = glyf[cmap[ord("?")]].getCoordinates(glyf)
            start = 0
            bottom_row_contours = 0
            for endpoint in endpoints:
                points = coordinates[start : endpoint + 1]
                if min(point[1] for point in points) == 0:
                    bottom_row_contours += 1
                start = endpoint + 1
            self.assertEqual(bottom_row_contours, 1)

    def test_rejects_anything_other_than_physical_c64_ram(self) -> None:
        with self.assertRaisesRegex(TypographyError, "64 KiB"):
            extract_mercenary_glyphs(bytes(1024))


class DamoclesSegmentationTests(unittest.TestCase):
    @staticmethod
    def _capture(rows: tuple[int, ...], *, changed: bool = False) -> Image.Image:
        image = Image.new("RGB", (12, 8), (10, 20, 30))
        foreground = (200, 210, 220)
        pixels = image.load()
        for y, row in enumerate(rows):
            for x in range(5):
                if row & (1 << (4 - x)):
                    pixels[x + 2, y + 1] = foreground
        if changed:
            pixels[2, 1] = foreground if pixels[2, 1] != foreground else (10, 20, 30)
        return image

    def test_segments_known_interface_cells_and_requires_cold_runs_to_agree(self) -> None:
        rows = (0b10101, 0b01010, 0b11111, 0b01010, 0b10101)
        sample = GlyphSample("X", x=2, y=1, width=5, height=5, foreground=(200, 210, 220))

        first = segment_samples(self._capture(rows), (sample,), advance=6)
        second = segment_samples(self._capture(rows), (sample,), advance=6)

        self.assertEqual(first["X"], Glyph(width=5, rows=rows, advance=6, source=True))
        self.assertEqual(require_matching_damocles_glyphs(first, second), first)

    def test_rejects_a_pixel_that_differs_between_cold_runs(self) -> None:
        rows = (0b10101, 0b01010, 0b11111, 0b01010, 0b10101)
        sample = GlyphSample("X", x=2, y=1, width=5, height=5, foreground=(200, 210, 220))
        first = segment_samples(self._capture(rows), (sample,), advance=6)
        changed = segment_samples(self._capture(rows, changed=True), (sample,), advance=6)

        with self.assertRaisesRegex(TypographyError, "cold captures"):
            require_matching_damocles_glyphs(first, changed)

    def test_derives_the_monospaced_advance_from_observed_cell_positions(self) -> None:
        from typefaces.core import damocles_monospaced_advance

        self.assertEqual(damocles_monospaced_advance(DAMOCLES_INTERFACE_SAMPLES), 6)


class GlyphCompletionTests(unittest.TestCase):
    def test_fills_the_declared_repertoire_and_preserves_source_glyphs(self) -> None:
        source = {"A": Glyph(width=3, rows=(0b010, 0b101, 0b111, 0b101, 0b101), advance=6, source=True)}

        complete = complete_glyphs(source, width=5, height=5, advance=6)

        self.assertEqual(set(complete), set(CHARACTER_REPERTOIRE))
        self.assertEqual(complete["A"], source["A"])
        self.assertFalse(complete["B"].source)
        self.assertFalse(complete["…"].source)
        self.assertTrue(all(len(glyph.rows) == 5 for glyph in complete.values()))
        self.assertEqual(complete[" "].rows, (0, 0, 0, 0, 0))
        self.assertNotEqual(complete["#"].rows, complete["?"].rows)

    def test_authors_lowercase_as_distinct_glyphs(self) -> None:
        complete = complete_glyphs({}, width=8, height=8, advance=8)

        self.assertNotEqual(complete["a"].rows, complete["A"].rows)
        self.assertNotEqual(complete["g"].rows, complete["G"].rows)
        self.assertTrue(all(glyph.rows[0] == 0 for character, glyph in complete.items() if character.islower()))

    def test_square_contours_round_trip_to_the_logical_bitmap(self) -> None:
        glyph = Glyph(
            width=5,
            rows=(0b11110, 0b10001, 0b11110, 0b10100, 0b10011),
            advance=6,
            source=True,
        )

        contours = bitmap_contours(glyph)

        self.assertEqual(contours_bitmap(contours, width=5, height=5), glyph.rows)


class FontBuildTests(unittest.TestCase):
    def test_woff2_build_is_deterministic_and_carries_the_complete_cmap(self) -> None:
        glyphs = complete_glyphs({}, width=5, height=5, advance=6)

        first = build_woff2("Test Pixel", glyphs)
        second = build_woff2("Test Pixel", glyphs)

        self.assertEqual(first, second)
        self.assertTrue(first.startswith(b"wOF2"))

        from fontTools.ttLib import TTFont

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.woff2"
            path.write_bytes(first)
            with TTFont(path) as font:
                cmap = font.getBestCmap()
                self.assertEqual(set(cmap), {ord(character) for character in CHARACTER_REPERTOIRE})

    def test_every_source_outline_round_trips_from_the_generated_font(self) -> None:
        source = {
            "A": Glyph(width=5, rows=(0b01110, 0b10001, 0b11111, 0b10001, 0b10001), advance=6, source=True),
            "R": Glyph(width=5, rows=(0b11110, 0b10001, 0b11110, 0b10100, 0b10010), advance=6, source=True),
        }
        font_bytes = build_woff2(
            "Round Trip",
            complete_glyphs(source, width=5, height=5, advance=6),
        )

        from fontTools.ttLib import TTFont

        with TTFont(BytesIO(font_bytes)) as font:
            cmap = font.getBestCmap()
            glyf = font["glyf"]
            for character, glyph in source.items():
                coordinates, endpoints, _ = glyf[cmap[ord(character)]].getCoordinates(glyf)
                start = 0
                contours = []
                for endpoint in endpoints:
                    points = coordinates[start : endpoint + 1]
                    left = min(point[0] for point in points)
                    right = max(point[0] for point in points)
                    bottom = min(point[1] for point in points)
                    top = max(point[1] for point in points)
                    contours.append(
                        (
                            left // UNITS_PER_PIXEL,
                            len(glyph.rows) - top // UNITS_PER_PIXEL,
                            (right - left) // UNITS_PER_PIXEL,
                            (top - bottom) // UNITS_PER_PIXEL,
                        )
                    )
                    start = endpoint + 1
                self.assertEqual(
                    contours_bitmap(contours, width=glyph.width, height=len(glyph.rows)),
                    glyph.rows,
                )

    def test_five_row_face_uses_its_declared_baseline_and_cap_height(self) -> None:
        glyphs = complete_glyphs({}, width=5, height=5, advance=6)

        font_bytes = build_woff2("Five Row", glyphs)

        from fontTools.ttLib import TTFont

        with TTFont(BytesIO(font_bytes)) as font:
            cmap = font.getBestCmap()
            glyph = font["glyf"][cmap[ord("A")]]
            self.assertEqual(glyph.yMin, 0)
            self.assertEqual(glyph.yMax, 5 * UNITS_PER_PIXEL)
            self.assertEqual(font["OS/2"].sCapHeight, 5 * UNITS_PER_PIXEL)


class ReviewSheetTests(unittest.TestCase):
    def test_is_deterministic_and_distinguishes_source_from_synthesized_glyphs(self) -> None:
        source = {
            "A": Glyph(
                width=8,
                rows=(0, 0x7E, 0x66, 0x66, 0x7E, 0x66, 0x66, 0),
                advance=8,
                source=True,
            )
        }
        mercenary = complete_glyphs(source, width=8, height=8, advance=8)
        damocles = complete_glyphs({}, width=5, height=5, advance=6)

        first = build_review_sheet((mercenary, damocles))
        second = build_review_sheet((mercenary, damocles))

        self.assertEqual(first, second)
        self.assertTrue(first.startswith(b"\x89PNG\r\n\x1a\n"))
        with Image.open(BytesIO(first)) as image:
            rows = (len(CHARACTER_REPERTOIRE) + REVIEW_COLUMNS - 1) // REVIEW_COLUMNS
            self.assertEqual(
                image.size,
                (REVIEW_COLUMNS * REVIEW_CELL_SIZE, rows * REVIEW_CELL_SIZE * 2),
            )
            a_index = CHARACTER_REPERTOIRE.index("A")
            b_index = CHARACTER_REPERTOIRE.index("B")
            self.assertEqual(
                image.getpixel(
                    (
                        (a_index % REVIEW_COLUMNS) * REVIEW_CELL_SIZE,
                        (a_index // REVIEW_COLUMNS) * REVIEW_CELL_SIZE,
                    )
                ),
                REVIEW_SOURCE_BORDER,
            )
            self.assertEqual(
                image.getpixel(
                    (
                        (b_index % REVIEW_COLUMNS) * REVIEW_CELL_SIZE,
                        (b_index // REVIEW_COLUMNS) * REVIEW_CELL_SIZE,
                    )
                ),
                REVIEW_SYNTHESIZED_BORDER,
            )


class ExportTests(unittest.TestCase):
    @staticmethod
    def _export(
        mercenary: Path,
        damocles_a: Path,
        damocles_b: Path,
        payload: Path,
    ) -> dict[str, str]:
        with patch("typefaces.exporter.DATA_PAYLOAD_ROOT", payload):
            return export_typefaces(mercenary, damocles_a, damocles_b, payload)

    @staticmethod
    def _run(
        root: Path,
        name: str,
        *,
        role: str,
        artifact_name: str,
        content: bytes,
        scenario: str,
        scenario_digest: str | None = None,
        run_id: str | None = None,
    ) -> Path:
        run = root / name
        run.mkdir()
        (run / artifact_name).write_bytes(content)
        (run / "manifest.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "runId": run_id or name,
                    "createdAt": "2026-08-20T00:00:00Z",
                    "scenario": {
                        "name": scenario,
                        "sha256": scenario_digest or SOURCE_SCENARIO_SHA256[scenario],
                    },
                    "toolchain": {},
                    "machine": {},
                    "checkpoint": {
                        "name": "title-screen" if scenario == "first-world" else "interactive"
                    },
                    **(
                        {
                            "authority": {
                                "authority": "working-authority",
                                "programSha256": "3" * 64,
                                "tosSha256": "4" * 64,
                            }
                        }
                        if scenario == "first-world"
                        else {"build": {}}
                    ),
                    "artifacts": [
                        {
                            "path": artifact_name,
                            "role": role,
                            "size": len(content),
                            "sha256": hashlib.sha256(content).hexdigest(),
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        return run

    @staticmethod
    def _damocles_capture() -> bytes:
        image = Image.new("RGB", (832, 552), (255, 255, 255))
        pixels = image.load()
        for sample in DAMOCLES_INTERFACE_SAMPLES:
            left = 96 + sample.x * 2
            top = 56 + sample.y * 2
            for y in range(top, top + 2):
                for x in range(left, left + 2):
                    pixels[x, y] = sample.foreground
        with tempfile.NamedTemporaryFile(suffix=".png") as file:
            image.save(file.name)
            return Path(file.name).read_bytes()

    @classmethod
    def _source_runs(cls, root: Path) -> tuple[Path, Path, Path]:
        ram = bytes(65536)
        mercenary = cls._run(
            root,
            "mercenary-run",
            role="ram",
            artifact_name="interactive.ram",
            content=ram,
            scenario="interactive",
        )
        capture = cls._damocles_capture()
        damocles_a = cls._run(
            root,
            "damocles-a",
            role="observed-display",
            artifact_name="observed.png",
            content=capture,
            scenario="first-world",
        )
        damocles_b = cls._run(
            root,
            "damocles-b",
            role="observed-display",
            artifact_name="observed.png",
            content=capture,
            scenario="first-world",
        )
        return mercenary, damocles_a, damocles_b

    @staticmethod
    def _payload(root: Path) -> Path:
        payload = root / "payload"
        payload.mkdir()
        (payload / "manifest.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 8,
                    "files": [{"path": "world.json", "size": 2, "sha256": "2" * 64}],
                }
            ),
            encoding="utf-8",
        )
        return payload

    def test_rejects_an_incomplete_laboratory_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mercenary, damocles_a, damocles_b = self._source_runs(root)
            manifest_path = mercenary / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            del manifest["createdAt"]
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            with self.assertRaisesRegex(TypographyError, "missing createdAt"):
                self._export(mercenary, damocles_a, damocles_b, self._payload(root))

    def test_rejects_corruption_in_an_unselected_registered_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mercenary, damocles_a, damocles_b = self._source_runs(root)
            extra = mercenary / "extra.bin"
            extra.write_bytes(b"before")
            manifest_path = mercenary / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["artifacts"].append(
                {
                    "role": "extra",
                    "path": "extra.bin",
                    "size": 6,
                    "sha256": hashlib.sha256(b"before").hexdigest(),
                }
            )
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            extra.write_bytes(b"broken")

            with self.assertRaisesRegex(TypographyError, "extra.bin sha256 mismatch"):
                self._export(mercenary, damocles_a, damocles_b, self._payload(root))

    def test_rejects_copied_damocles_run_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mercenary, damocles_a, damocles_b = self._source_runs(root)
            first_manifest = json.loads((damocles_a / "manifest.json").read_text(encoding="utf-8"))
            second_path = damocles_b / "manifest.json"
            second_manifest = json.loads(second_path.read_text(encoding="utf-8"))
            second_manifest["runId"] = first_manifest["runId"]
            second_path.write_text(json.dumps(second_manifest), encoding="utf-8")

            with self.assertRaisesRegex(TypographyError, "distinct runId"):
                self._export(mercenary, damocles_a, damocles_b, self._payload(root))

    def test_rejects_an_unregistered_source_scenario_digest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mercenary, damocles_a, damocles_b = self._source_runs(root)
            for run in (damocles_a, damocles_b):
                manifest_path = run / "manifest.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest["scenario"]["sha256"] = "f" * 64
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            with self.assertRaisesRegex(TypographyError, "registered first-world scenario"):
                self._export(mercenary, damocles_a, damocles_b, self._payload(root))

    def test_rejects_a_payload_destination_outside_the_repository_payload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(TypographyError, "repository Data Payload"):
                export_typefaces(
                    root / "missing-mercenary",
                    root / "missing-damocles-a",
                    root / "missing-damocles-b",
                    root / "outside",
                )

    def test_exports_repeatable_fonts_metadata_and_payload_manifest_entries(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ram = bytearray(65536)
            for code in range(256):
                ram[0x7800 + code * 8 : 0x7808 + code * 8] = bytes([code]) * 8
            mercenary = self._run(
                root,
                "mercenary-run",
                role="ram",
                artifact_name="interactive.ram",
                content=bytes(ram),
                scenario="interactive",
            )
            capture = self._damocles_capture()
            damocles_a = self._run(
                root,
                "damocles-a",
                role="observed-display",
                artifact_name="observed.png",
                content=capture,
                scenario="first-world",
            )
            damocles_b = self._run(
                root,
                "damocles-b",
                role="observed-display",
                artifact_name="observed.png",
                content=capture,
                scenario="first-world",
            )
            payload = root / "payload"
            payload.mkdir()
            (payload / "manifest.json").write_text(
                json.dumps({"schemaVersion": 8, "files": [{"path": "world.json", "size": 2, "sha256": "2" * 64}]}),
                encoding="utf-8",
            )

            first = self._export(mercenary, damocles_a, damocles_b, payload)
            first_manifest = (payload / "manifest.json").read_bytes()
            second = self._export(mercenary, damocles_a, damocles_b, payload)

            self.assertEqual(first, second)
            self.assertEqual((payload / "manifest.json").read_bytes(), first_manifest)
            metadata = json.loads((payload / "typography.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["schemaVersion"], 1)
            self.assertEqual(metadata["defaultFace"], "mercenary")
            self.assertEqual(set(metadata["faces"]), {"mercenary", "damocles"})
            self.assertEqual(metadata["sources"]["damocles"][0]["runId"], "damocles-a")
            self.assertEqual(
                metadata["faces"]["damocles"]["sourceGlyphCount"],
                len(DAMOCLES_INTERFACE_SAMPLES),
            )
            payload_manifest = json.loads(
                (payload / "manifest.json").read_text(encoding="utf-8")
            )
            files = payload_manifest["files"]
            self.assertEqual(
                [item["path"] for item in files],
                [
                    "fonts/damocles.woff2",
                    "fonts/mercenary.woff2",
                    "typography-review-damocles.png",
                    "typography-review.png",
                    "typography.json",
                    "world.json",
                ],
            )
            self.assertEqual(payload_manifest["typography"], metadata)
            self.assertTrue((payload / "fonts/mercenary.woff2").read_bytes().startswith(b"wOF2"))
            damocles_review = payload / "typography-review-damocles.png"
            self.assertTrue(damocles_review.read_bytes().startswith(b"\x89PNG"))
            with Image.open(damocles_review) as image:
                rows = (len(CHARACTER_REPERTOIRE) + REVIEW_COLUMNS - 1) // REVIEW_COLUMNS
                self.assertEqual(
                    image.size,
                    (REVIEW_COLUMNS * REVIEW_CELL_SIZE, rows * REVIEW_CELL_SIZE),
                )
            self.assertTrue((payload / "typography-review.png").read_bytes().startswith(b"\x89PNG"))

    def test_rejects_same_cold_capture_identity_twice(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = self._run(
                root,
                "same-run",
                role="observed-display",
                artifact_name="observed.png",
                content=self._damocles_capture(),
                scenario="first-world",
            )
            with self.assertRaisesRegex(TypographyError, "independent"):
                self._export(run, run, run, root / "payload")

    def test_rejects_a_cold_run_with_a_changed_scenario_digest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            capture = self._damocles_capture()
            mercenary = self._run(
                root,
                "mercenary",
                role="ram",
                artifact_name="interactive.ram",
                content=bytes(65536),
                scenario="interactive",
            )
            first = self._run(
                root,
                "first",
                role="observed-display",
                artifact_name="observed.png",
                content=capture,
                scenario="first-world",
            )
            second = self._run(
                root,
                "second",
                role="observed-display",
                artifact_name="observed.png",
                content=capture,
                scenario="first-world",
                scenario_digest="2" * 64,
            )
            with self.assertRaisesRegex(TypographyError, "registered first-world"):
                self._export(mercenary, first, second, root / "payload")


if __name__ == "__main__":
    unittest.main()
