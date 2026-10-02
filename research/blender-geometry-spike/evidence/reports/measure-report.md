# Size and load/decode time

Blender 5.2.2 LTS wrote the candidates; Bun 1.4.2 read them.

## Fixtures

KiB raw / KiB gzip -9. "Payload JSON" is the record as the payload stores it (canonical JSON). Both candidates ship the sidecar JSON alongside their geometry. The `.blend` is saved uncompressed.

| Fixture | Payload JSON | Sidecar JSON | MGEO | GLB | .blend |
| --- | --- | --- | --- | --- | --- |
| targ-object-model-1700 | 1.2 / 0.2 | 0.5 / 0.3 | 0.7 / 0.3 | 3.0 / 0.9 | 487 / 85 |
| targ-surface-cell-1 | 3.5 / 0.4 | 0.6 / 0.3 | 1.2 / 0.4 | 4.3 / 1.2 | 532 / 88 |
| targ-room-0 | 2.8 / 0.5 | 2.7 / 0.7 | 1.0 / 0.3 | 3.3 / 1.0 | 487 / 85 |
| damocles-object-03f774 | 3.4 / 0.6 | 1.2 / 0.6 | 0.6 / 0.3 | 4.3 / 1.2 | 577 / 91 |
| damocles-atropos-ground-02064a-00 | 2.2 / 0.7 | 1.6 / 0.7 | 0.3 / 0.2 | 3.6 / 1.0 | 509 / 87 |
| damocles-structure-01484e | 236 / 12 | 27 / 2.5 | 36 / 3.8 | 102 / 8.8 | 1313 / 131 |
| damocles-interior-0303d6 | 54 / 2.7 | 8.6 / 1.5 | 7.9 / 1.1 | 26 / 2.9 | 883 / 105 |
| damocles-ground-021de0-06-54 | 24 / 2.0 | 1.9 / 0.8 | 4.0 / 1.3 | 11 / 2.4 | 676 / 97 |

Median time to a parsed record (Damocles: through the Catalogue Model reader). "Decode" is the geometry alone; "to record" adds the sidecar parse, reference checks and composition.

| Fixture | JSON to record | MGEO decode | MGEO to record | GLB decode | GLB to record |
| --- | --- | --- | --- | --- | --- |
| targ-object-model-1700 | 2 µs | 3 µs | 10 µs | 7 µs | 13 µs |
| targ-surface-cell-1 | 5 µs | 5 µs | 16 µs | 11 µs | 23 µs |
| targ-room-0 | 4 µs | 4 µs | 28 µs | 8 µs | 31 µs |
| damocles-object-03f774 | 6 µs | 4 µs | 21 µs | 9 µs | 26 µs |
| damocles-atropos-ground-02064a-00 | 4 µs | 2 µs | 19 µs | 7 µs | 24 µs |
| damocles-structure-01484e | 405 µs | 129 µs | 835 µs | 266 µs | 944 µs |
| damocles-interior-0303d6 | 92 µs | 37 µs | 228 µs | 68 µs | 260 µs |
| damocles-ground-021de0-06-54 | 42 µs | 17 µs | 93 µs | 32 µs | 110 µs |

## Damocles corpus (1713 Models)

All times below are medians (five warm-ups, at least fifteen samples). Load includes geometry decoding, sidecar parsing, composition and the existing Model reader. Full checks also include geometry structure, the canonical sidecar hash and every reference; prevalidated load omits these checks, representing an unchanged asset checked at build time. Production loading is unchanged.

| | Raw / gzip -9 (sum of per-file sizes) | Load, full checks | Load, prevalidated |
| --- | --- | --- | --- |
| Payload JSON model files | 38.9 MiB / 2.9 MiB | 75 ms | — |
| MGEO + sidecar JSON | 16.6 MiB / 2.9 MiB (geometry 5.3 MiB / 1.3 MiB) | 195 ms | 120 ms |
| GLB + sidecar JSON | 29.6 MiB / 4.8 MiB (geometry 18.3 MiB / 3.1 MiB) | 221 ms | 145 ms |

Sidecar: 11.3 MiB / 1.7 MiB. Only 18 positional attachmentFace references enter the table. Record and reference sizes below serialize each field independently (their indentation differs from its nesting in the complete sidecar, and their gzip sizes cannot be added).

| Sidecar field | Raw / gzip -9 |
| --- | --- |
| Record | 9.8 MiB / 1.4 MiB |
| Positional reference table | 6.8 KiB / 39 KiB |

Isolated stages over the same corpus, starting with parsed geometry and sidecars except for the JSON parse row. Composition includes the existing Model reader; separately timed stages need not sum to total load.

| Stage | Time |
| --- | --- |
| Sidecar JSON parse | 13 ms |
| Canonical sidecar hash | 36 ms |
| Inline and positional reference checks | 11 ms |
| Composition to parsed Models | 71 ms |
