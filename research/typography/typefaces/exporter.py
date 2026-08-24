from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from PIL import Image

from .core import (
    Glyph,
    TypographyError,
    complete_glyphs,
    extract_damocles_interface,
    extract_mercenary_glyphs,
    require,
    require_sha256,
    require_matching_damocles_glyphs,
    sha256,
    verified_artifact,
    verified_run_manifest,
)
from .font import build_woff2, validate_source_roundtrips
from .review import build_review_sheet


FACE_PATHS = {
    "mercenary": "fonts/mercenary.woff2",
    "damocles": "fonts/damocles.woff2",
}
DATA_PAYLOAD_ROOT = Path(__file__).resolve().parents[3] / "payload"
SOURCE_SCENARIO_SHA256 = {
    "interactive": "2748b0cdeda192f450b49e12bb288ec2e54271b381a53a5e40d680b6ab7ab20d",
    "first-world": "e5383458e6db10cbf5d02f44ae26f8192daeb76559a947e564f9058f8582f96e",
}


def _manifest(
    run: Path,
    *,
    scenario: str,
    laboratory: Literal["c64", "damocles"],
) -> dict[str, Any]:
    value = verified_run_manifest(run, laboratory=laboratory)
    path = run / "manifest.json"
    observed = value.get("scenario")
    require(isinstance(observed, dict), f"Source run manifest needs a scenario: {path}")
    require(
        observed.get("name") == scenario,
        f"Source run must use the {scenario!r} scenario: {path}",
    )
    digest = require_sha256(observed.get("sha256"), f"Source scenario in {path}")
    require(
        digest == SOURCE_SCENARIO_SHA256[scenario],
        f"Source run must use the registered {scenario} scenario: {path}",
    )
    checkpoint = value["checkpoint"]
    expected_checkpoint = "interactive" if laboratory == "c64" else "title-screen"
    require(
        checkpoint.get("name") == expected_checkpoint,
        f"Source run must use the {expected_checkpoint!r} cold checkpoint: {path}",
    )
    return value


def _damocles_authority(manifest: dict[str, Any]) -> dict[str, str]:
    authority = manifest.get("authority")
    require(isinstance(authority, dict), "Damocles source run needs Working Authority identity")
    require(
        authority.get("authority") == "working-authority",
        "Damocles source run must name the working-authority",
    )
    identity: dict[str, str] = {}
    for field in ("programSha256", "tosSha256"):
        digest = require_sha256(authority.get(field), f"Damocles source authority {field}")
        identity[field] = digest
    return identity


def _face_document(
    face_id: str,
    family: str,
    path: str,
    font: bytes,
    glyphs: dict[str, Glyph],
) -> dict[str, Any]:
    source_count = sum(glyph.source for glyph in glyphs.values())
    return {
        "id": face_id,
        "family": family,
        "path": path,
        "sha256": sha256(font),
        "sourceGlyphCount": source_count,
        "synthesizedGlyphCount": len(glyphs) - source_count,
    }


def _payload_manifest(
    payload: Path,
    generated: dict[str, bytes],
    typography: dict[str, Any],
) -> bytes:
    path = payload / "manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise TypographyError(f"Could not read Data Payload manifest {path}: {error}") from error
    require(isinstance(manifest, dict), "Data Payload manifest must be an object")
    files = manifest.get("files")
    require(isinstance(files, list), "Data Payload manifest files must be a list")
    for index, item in enumerate(files):
        require(isinstance(item, dict), f"Data Payload manifest files[{index}] must be an object")
        require(
            isinstance(item.get("path"), str) and bool(item["path"]),
            f"Data Payload manifest files[{index}] needs a path",
        )
        require(
            isinstance(item.get("size"), int) and item["size"] >= 0,
            f"Data Payload manifest files[{index}] needs a size",
        )
        require_sha256(item.get("sha256"), f"Data Payload manifest files[{index}]")
    generated_paths = set(generated)
    kept = [
        item
        for item in files
        if item.get("path") not in generated_paths
    ]
    kept.extend(
        {"path": name, "sha256": sha256(content), "size": len(content)}
        for name, content in generated.items()
    )
    manifest["files"] = sorted(kept, key=lambda item: str(item.get("path", "")))
    manifest["typography"] = typography
    return (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()


def export_typefaces(
    mercenary_run: Path,
    damocles_run_a: Path,
    damocles_run_b: Path,
    payload: Path,
) -> dict[str, str]:
    """Validate all evidence, build both faces, then replace the payload outputs."""
    require(
        payload.resolve() == DATA_PAYLOAD_ROOT.resolve(),
        f"Typography output must be the repository Data Payload: {DATA_PAYLOAD_ROOT}",
    )
    require(
        damocles_run_a.resolve() != damocles_run_b.resolve(),
        "Damocles glyph evidence must come from two independent cold runs",
    )
    mercenary_manifest = _manifest(
        mercenary_run, scenario="interactive", laboratory="c64"
    )
    damocles_manifest_a = _manifest(
        damocles_run_a, scenario="first-world", laboratory="damocles"
    )
    damocles_manifest_b = _manifest(
        damocles_run_b, scenario="first-world", laboratory="damocles"
    )
    require(
        damocles_manifest_a["runId"] != damocles_manifest_b["runId"],
        "Damocles cold runs must have a distinct runId",
    )
    require(
        damocles_manifest_a["scenario"]["sha256"]
        == damocles_manifest_b["scenario"]["sha256"],
        "Damocles cold runs must use the identical first-world scenario",
    )
    damocles_authority = _damocles_authority(damocles_manifest_a)
    require(
        damocles_authority == _damocles_authority(damocles_manifest_b),
        "Damocles cold runs must use the identical Working Authority",
    )

    mercenary_path, mercenary_identity = verified_artifact(
        mercenary_run, role="ram", size=65536, manifest=mercenary_manifest
    )
    damocles_path_a, damocles_identity_a = verified_artifact(
        damocles_run_a, role="observed-display", manifest=damocles_manifest_a
    )
    damocles_path_b, damocles_identity_b = verified_artifact(
        damocles_run_b, role="observed-display", manifest=damocles_manifest_b
    )

    mercenary_source, font_table = extract_mercenary_glyphs(mercenary_path.read_bytes())
    try:
        with Image.open(damocles_path_a) as image:
            damocles_a = extract_damocles_interface(image)
        with Image.open(damocles_path_b) as image:
            damocles_b = extract_damocles_interface(image)
    except OSError as error:
        raise TypographyError(f"Could not decode a Damocles display capture: {error}") from error
    damocles_source = require_matching_damocles_glyphs(damocles_a, damocles_b)

    mercenary_glyphs = complete_glyphs(
        mercenary_source, width=8, height=8, advance=8
    )
    damocles_glyphs = complete_glyphs(
        damocles_source, width=5, height=5, advance=6
    )
    fonts = {
        "mercenary": build_woff2("Mercenary Pixel", mercenary_glyphs),
        "damocles": build_woff2("Damocles Interface", damocles_glyphs),
    }
    validate_source_roundtrips(fonts["mercenary"], mercenary_glyphs)
    validate_source_roundtrips(fonts["damocles"], damocles_glyphs)
    typography = {
        "schemaVersion": 1,
        "defaultFace": "mercenary",
        "faces": {
            face_id: _face_document(
                face_id,
                "Mercenary Pixel" if face_id == "mercenary" else "Damocles Interface",
                FACE_PATHS[face_id],
                fonts[face_id],
                mercenary_glyphs if face_id == "mercenary" else damocles_glyphs,
            )
            for face_id in ("mercenary", "damocles")
        },
        "sources": {
            "mercenary": {
                **mercenary_identity,
                "fontTableSha256": sha256(font_table),
                "scenarioSha256": mercenary_manifest["scenario"]["sha256"],
            },
            "damocles": [
                {
                    **damocles_identity_a,
                    **damocles_authority,
                    "scenarioSha256": damocles_manifest_a["scenario"]["sha256"],
                },
                {
                    **damocles_identity_b,
                    **damocles_authority,
                    "scenarioSha256": damocles_manifest_b["scenario"]["sha256"],
                },
            ],
        },
        "toolchain": {
            "fonttools": "4.63.0",
            "Brotli": "1.2.0",
        },
    }
    typography_bytes = (json.dumps(typography, indent=2, sort_keys=True) + "\n").encode()
    generated = {
        FACE_PATHS["mercenary"]: fonts["mercenary"],
        FACE_PATHS["damocles"]: fonts["damocles"],
        "typography-review-damocles.png": build_review_sheet((damocles_glyphs,)),
        "typography-review.png": build_review_sheet(
            (mercenary_glyphs, damocles_glyphs)
        ),
        "typography.json": typography_bytes,
    }
    manifest_bytes = _payload_manifest(payload, generated, typography)

    fonts_directory = payload / "fonts"
    fonts_directory.mkdir(parents=True, exist_ok=True)
    for name, content in generated.items():
        path = payload / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    (payload / "manifest.json").write_bytes(manifest_bytes)
    return {name: sha256(content) for name, content in sorted(generated.items())}
