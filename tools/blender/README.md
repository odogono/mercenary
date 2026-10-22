# Mercenary geometry add-on for Blender

Edits the Targ objects and structures in `assets/targ/`, and authors new ones
([ADR 0081](../../docs/adr/0081-share-one-geometry-asset-format-and-edit-it-in-blender.md)). The add-on
moves geometry in and out of Blender. It does not touch an asset's Sidecar or Change Ledger, which
are written by hand. It targets **Blender 5.2 LTS**.

| Path                               | What                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `mercenary_geometry/contract.py`   | The Geometry Asset contract: canonical JSON, the sidecar hash, and the structural checks of `web/src/geometry/compose.ts` |
| `mercenary_geometry/targ_asset.py` | The `assets/targ/` file rules from `web/src/geometry/targAssets.ts`, and _New Authored Asset_                             |
| `mercenary_geometry/blender_io.py` | Converts an asset to and from a Blender scene; documents the `mc_*` mesh attributes                                       |
| `mercenary_geometry/addon.py`      | The operators and the _Sidebar ▸ Mercenary_ panel                                                                         |
| `tests/`                           | The Python tests and the headless cases that `web/test/blender-roundtrip.test.ts` runs                                    |

`contract.py` and `targ_asset.py` are plain Python and work without Blender.

## Open Blender

From `web/`:

```sh
bun run blender                                         # the add-on, ready to import or create
bun run blender ../assets/targ/objects/<name>.json      # and that asset, imported
```

The command runs Blender from `BLENDER`, or `blender` on `PATH`. Assets are read from and written to
the checkout the command was run in.

To install the add-on by hand instead, zip `mercenary_geometry/` and choose _Edit ▸ Preferences ▸
Add-ons ▸ Install from Disk_. Then set `MERCENARY_ROOT` to the checkout before starting Blender. It
is not packaged as a Blender extension, because an extension manifest must declare a licence.

## Edit a recovered model

1. From `web/`, run `bun tools/targ-assets.ts adopt <identity>`, for example
   `targ:object-model:1700` or `targ:surface-cell:54`. This writes
   `assets/targ/{objects,structures}/<name>.json` from its Recovered Baseline. Blender never reads
   the payload.
2. Open the file in Blender.
3. Edit the mesh in Edit Mode with ordinary tools (G, X, F). Then use the _Sidebar ▸ Mercenary_
   helpers:
   - _Snap to Game Units_: after a free move.
   - _Mark Lines_ and _Clear Lines_: set whether a selected edge is a line.
   - _Set Game Colour_: inks a structure's selected lines.
4. _Validate_ lists everything that would stop the export. All of it is also written to the
   _Mercenary diagnostics_ text.
5. _Export_ writes the geometry back to the file it came from. It re-reads the Sidecar and Change
   Ledger from disk, so any hand edits to them are kept.
6. Classify every change in the Change Ledger, then run `bun run check`.

The panel shows only for the part objects of an imported asset. Object transforms must stay
identity: edit in Edit Mode. Points whose positions the runtime computes refuse to move:

- **Rotated inputs.** Change their `mc_input` attribute instead.
- **Road Workspace endpoints.** The road table places them.

## Author a new model

1. In _Sidebar ▸ Mercenary_, choose _New Authored Asset_, then pick _Object_ or _Structure_ and a
   slug, such as `radio-mast`. This writes `assets/targ/<kind>/authored-<slug>.json` with an empty
   wireframe and opens it. It never overwrites a file.
2. Draw the wireframe, mark its edges as lines, and _Export_.
3. Write the placements into the Sidecar by hand. Until you do, `bun run check` refuses the asset.
   - An object's placements are Targ object instances without their `model`.
   - A structure's placements are the Surface Cells it occupies: `{ "cell": <index> }`.
   - A structure's Structure Reach is the Sidecar's `reach`, either `all` or `cell`.

## Distant Structures

A structure's collection always holds a _Distant Structure_ child collection. A mesh in it is the
part the structure draws as a Distant Structure instead of its wireframe. The child collection may
hold at most one mesh.

- **Add one:** draw a new mesh in the collection, or duplicate the wireframe (Shift D) and move the
  copy in (M). Mark and ink its lines like any other.
- **Remove one:** delete the mesh.

Objects have no Distant Structure. No other part can be added or removed.

## Tests

`web/test/blender-roundtrip.test.ts` runs Blender headless against a scratch copy of every Targ
Recovered Baseline. Every one must come back byte-identical. It then exercises an edit, a new
Authored Asset, and adding and removing a Distant Structure, and runs `tests/test_*.py` in
Blender's Python. It skips with a warning when Blender 5.2 is missing, as it is in CI:

```sh
cd web && bun test test/blender-roundtrip.test.ts     # BLENDER=/path/to/blender to override
```

The plain-Python tests also run without Blender:
`python3 -m unittest discover -s tools/blender/tests -p 'test_*.py'`.
