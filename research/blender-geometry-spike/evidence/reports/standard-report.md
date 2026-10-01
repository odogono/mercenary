# Standard Blender glTF import/export

5.2.2 LTS, stock `io_scene_gltf2`, no add-on involved. Measured by position against the recovered contract.

- **S1**: the canonical GLB → stock import → stock export.
- **S2**: the add-on's `.blend` scene → stock export → stock import.

| Fixture | Path | Polygons kept / source faces | Imported triangles | Vertices source → imported | Lines kept as loose edges | Identity attributes | Game colours in material extras | Our reader on the stock export |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| targ-object-model-1700 | S1 | 0 / 0 | 0 | 18 → 18 | 13 / 13 | lost | 0 of 1 | no MERCENARY_geometry extension |
| targ-object-model-1700 | S2 | 0 / 0 | 0 | 18 → 18 | 13 / 13 | lost | 0 of 0 | no MERCENARY_geometry extension |
| targ-surface-cell-1 | S1 | 0 / 0 | 0 | 20 → 22 | 28 / 28 | lost | 0 of 2 | no MERCENARY_geometry extension |
| targ-surface-cell-1 | S2 | 0 / 0 | 0 | 20 → 22 | 28 / 28 | lost | 1 of 1 | no MERCENARY_geometry extension |
| targ-room-0 | S1 | 0 / 0 | 0 | 20 → 20 | 21 / 21 | lost | 0 of 1 | no MERCENARY_geometry extension |
| targ-room-0 | S2 | 0 / 0 | 0 | 20 → 20 | 21 / 21 | lost | 0 of 0 | no MERCENARY_geometry extension |
| damocles-object-03f774 | S1 | 0 / 7 | 16 | 12 → 30 | 0 / 0 | lost | 0 of 4 | no MERCENARY_geometry extension |
| damocles-object-03f774 | S2 | 0 / 7 | 16 | 12 → 30 | 0 / 0 | lost | 4 of 4 | no MERCENARY_geometry extension |
| damocles-atropos-ground-02064a-00 | S1 | 0 / 1 | 2 | 6 → 6 | 1 / 1 | lost | 0 of 2 | no MERCENARY_geometry extension |
| damocles-atropos-ground-02064a-00 | S2 | 0 / 1 | 2 | 6 → 6 | 0 / 1 | lost | 1 of 1 | no MERCENARY_geometry extension |
| damocles-structure-01484e | S1 | 6 / 465 | 942 | 1080 → 1632 | 18 / 18 | lost | 0 of 160 | no MERCENARY_geometry extension |
| damocles-structure-01484e | S2 | 6 / 465 | 924 | 1080 → 1656 | 18 / 18 | lost | 145 of 145 | no MERCENARY_geometry extension |
| damocles-interior-0303d6 | S1 | 3 / 135 | 276 | 153 → 402 | 0 / 0 | lost | 0 of 30 | no MERCENARY_geometry extension |
| damocles-interior-0303d6 | S2 | 3 / 135 | 267 | 153 → 405 | 0 / 0 | lost | 30 of 30 | no MERCENARY_geometry extension |
| damocles-ground-021de0-06-54 | S1 | 29 / 63 | 105 | 90 → 114 | 2 / 2 | lost | 0 of 9 | no MERCENARY_geometry extension |
| damocles-ground-021de0-06-54 | S2 | 29 / 63 | 105 | 90 → 235 | 2 / 2 | lost | 8 of 8 | no MERCENARY_geometry extension |
