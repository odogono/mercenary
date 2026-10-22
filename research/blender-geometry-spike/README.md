# Blender geometry workflow spike (#671)

A feasibility spike comparing two ways of editing game geometry in Blender. Findings and the
recommendation are in [docs/research/blender-geometry-workflows.md](../../docs/research/blender-geometry-workflows.md).

- **A — `.blend` sources**: the asset is a `.blend`; the add-on exports a deterministic game
  binary, MGEO, that keeps source polygons.
- **B — canonical GLB**: the asset is a glTF 2.0 binary whose `MERCENARY_geometry` extension
  carries polygon loops, lines, identities and game colours; the add-on imports and exports it.

Both carry the same contract, and both link to the same reviewable sidecar JSON. Nothing here is
imported by the live game, the Catalogue reader or the extractor.

**Frozen.** ADR 0081 chose canonical JSON, and the add-on moved to
[`tools/blender/`](../../tools/blender/README.md) without MGEO or GLB (#865). This directory is the
record of the spike: `run-all.sh`, the scripts and the Python format tests last ran at commit
`c2223304`, and need that commit checked out. The goldens in `evidence/golden` are still read by
`web/test/geometry-spike.test.ts`.

Recorded with **Blender 5.2.2 LTS** (hash `d13f752e3b9c`, built 2026-09-15) and Bun 1.4.2 on macOS
arm64.

## Layout

| Path | What |
| --- | --- |
| `mercenary_geometry/` | The Blender add-on. `contract.py`, `mgeo.py`, `glb.py` and `triangulate.py` are plain Python; `blender_io.py` and `addon.py` need Blender |
| `scripts/` | Headless Blender drivers: round trip (`step.py`), edits (`edits.py`), stock glTF (`standard_gltf.py`), corpus |
| `tests/` | `unittest` for the format writers against `evidence/golden` |
| `evidence/` | Committed results: reports, every edit's diagnostics, semantic diff and before/after preview, and golden files |
| `out/` | Everything generated (ignored) |
| `../../web/src/geometrySpike/` | Contract, baseline recovery, composition, readers for both candidates, semantic diff |
| `../../web/tools/geometry-spike/` | The commands below, and previews through the existing renderers |
| `../../web/test/geometry-spike.test.ts` | TypeScript tests |

## Commands

Everything, from a clean `out/`, then copy the results into `evidence/` (about three minutes):

```sh
cd web && bun install && cd ..
research/blender-geometry-spike/run-all.sh          # BLENDER=/path/to/blender to override
```

Separately, from `web/`:

```sh
bun tools/geometry-spike/roundtrip.ts     # untouched round trip, both candidates, every fixture
bun tools/geometry-spike/edits.ts         # the Blender edit cases, diffs and previews
bun tools/geometry-spike/freshness.ts     # fresh-baseline comparison against an edited asset
bun tools/geometry-spike/measure.ts       # size and load/decode time
bun tools/geometry-spike/cli.ts baseline  # recover a fresh baseline (refuses asset directories)
bun tools/geometry-spike/cli.ts diff BEFORE AFTER --sidecar SIDECAR
bun tools/geometry-spike/cli.ts compare ASSET_DIR FRESH_DIR EDITED_GEOMETRY
bun test test/geometry-spike.test.ts
```

And the Python format tests: `cd research/blender-geometry-spike && python3 -m unittest discover -s tests`.

## Editing by hand

Install the add-on from this checkout: zip `mercenary_geometry/` and use *Edit ▸ Preferences ▸
Add-ons ▸ Install from Disk*. Alternatively, run Blender with
`--python-expr "import sys; sys.path.insert(0, '<this directory>'); import mercenary_geometry; mercenary_geometry.register()"`.
The add-on is not packaged as a Blender extension, because an extension manifest must declare a
licence.

- **A**: open `out/assets/<fixture>/asset.blend`. Edit. Then use *Sidebar ▸ Mercenary ▸ Validate*,
  followed by *Export Game Binary (.mgeo)*.
- **B**: *Sidebar ▸ Mercenary ▸ Import Mercenary Asset* on `asset.glb`. Do not use *File ▸ Import ▸
  glTF*: it triangulates and drops the extension, and the reader refuses what it exports. Edit.
  Then use *Validate*, followed by *Export Canonical GLB*.

Use ordinary tools: G, X, F, material slot *Assign*. For a line, select its edge and use *Set
Game Colour*, which also marks a wire edge as a line; *Mark Lines* and *Clear Lines* do just that.
Use *Snap to Game Units* after a free move. Identities ride in `mc_*` mesh attributes, which are
documented in `blender_io.py`. To change a rotated input, use *Mesh ▸ Set Attribute* on `mc_input`.
To give a rebuilt face its record, set `mc_record` to the record + 1.
