# Untouched round trip

Blender 5.2.2 LTS. Each Blender step ran in its own process.

- **A exact / B exact**: the contract decoded from the final export equals the recovered baseline (coordinates, winding and loop start, polygon boundaries, explicit lines and their direction, coincident-but-distinct vertices, identities, colours, sidedness, records, scene slots, runtime inputs and external endpoints).
- **record**: that contract and the sidecar compose to the payload record byte for byte (canonical JSON).
- **deterministic**: A — two exports in one session and an export after reopening are identical bytes; B — the adopted GLB, its import/export and the re-import/export are identical bytes.

| Fixture | A exact | A record | A deterministic | B exact | B record | B deterministic |
| --- | --- | --- | --- | --- | --- | --- |
| targ-object-model-1700 | yes | yes | yes | yes | yes | yes |
| targ-surface-cell-1 | yes | yes | yes | yes | yes | yes |
| targ-room-0 | yes | yes | yes | yes | yes | yes |
| damocles-object-03f774 | yes | yes | yes | yes | yes | yes |
| damocles-atropos-ground-02064a-00 | yes | yes | yes | yes | yes | yes |
| damocles-structure-01484e | yes | yes | yes | yes | yes | yes |
| damocles-interior-0303d6 | yes | yes | yes | yes | yes | yes |
| damocles-ground-021de0-06-54 | yes | yes | yes | yes | yes | yes |
