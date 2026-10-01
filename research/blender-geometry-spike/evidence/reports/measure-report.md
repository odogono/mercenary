# Size and load/decode time

Blender 5.2.2 LTS wrote the candidates; Bun 1.4.2 read them.

## Fixtures

KiB raw / KiB gzip -9. "Payload JSON" is the record as the payload stores it (canonical JSON). Both candidates ship the sidecar JSON alongside their geometry. The `.blend` is saved uncompressed.

| Fixture | Payload JSON | Sidecar JSON | MGEO | GLB | .blend |
| --- | --- | --- | --- | --- | --- |
| targ-object-model-1700 | 1.2 / 0.2 | 0.5 / 0.3 | 0.7 / 0.3 | 3.0 / 1.0 | 487 / 84 |
| targ-surface-cell-1 | 3.5 / 0.4 | 0.6 / 0.3 | 1.2 / 0.4 | 4.3 / 1.2 | 532 / 88 |
| targ-room-0 | 2.8 / 0.5 | 2.7 / 0.7 | 1.0 / 0.3 | 3.3 / 1.0 | 487 / 85 |
| damocles-object-03f774 | 3.4 / 0.6 | 1.2 / 0.6 | 0.6 / 0.3 | 4.3 / 1.2 | 577 / 91 |
| damocles-atropos-ground-02064a-00 | 2.2 / 0.7 | 1.6 / 0.7 | 0.3 / 0.2 | 3.6 / 1.0 | 509 / 87 |
| damocles-structure-01484e | 236 / 12 | 72 / 4.4 | 36 / 3.8 | 102 / 8.8 | 1313 / 131 |
| damocles-interior-0303d6 | 54 / 2.7 | 45 / 3.1 | 7.9 / 1.2 | 26 / 2.9 | 883 / 105 |
| damocles-ground-021de0-06-54 | 24 / 2.0 | 1.9 / 0.8 | 4.0 / 1.3 | 11 / 2.4 | 676 / 97 |

Median time to a parsed record (Damocles: through the Catalogue Model reader). "Decode" is the geometry alone; "to record" adds the sidecar parse, reference checks and composition.

| Fixture | JSON to record | MGEO decode | MGEO to record | GLB decode | GLB to record |
| --- | --- | --- | --- | --- | --- |
| targ-object-model-1700 | 2 µs | 3 µs | 10 µs | 7 µs | 13 µs |
| targ-surface-cell-1 | 5 µs | 5 µs | 16 µs | 11 µs | 22 µs |
| targ-room-0 | 4 µs | 4 µs | 27 µs | 8 µs | 30 µs |
| damocles-object-03f774 | 6 µs | 4 µs | 21 µs | 9 µs | 25 µs |
| damocles-atropos-ground-02064a-00 | 4 µs | 2 µs | 19 µs | 7 µs | 22 µs |
| damocles-structure-01484e | 410 µs | 127 µs | 1.05 ms | 267 µs | 1.15 ms |
| damocles-interior-0303d6 | 92 µs | 35 µs | 380 µs | 70 µs | 401 µs |
| damocles-ground-021de0-06-54 | 44 µs | 17 µs | 91 µs | 33 µs | 112 µs |

## Damocles corpus (1713 Models)

| | Raw / gzip -9 (sum of per-file sizes) | Load to parsed Models |
| --- | --- | --- |
| Payload JSON model files | 38.9 MiB / 2.9 MiB | 90 ms |
| MGEO + sidecar JSON | 34.1 MiB / 3.7 MiB (geometry 5.3 MiB / 1.3 MiB) | 306 ms |
| GLB + sidecar JSON | 47.1 MiB / 5.5 MiB (geometry 18.3 MiB / 3.1 MiB) | 350 ms |
