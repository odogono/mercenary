# Semantic diff: targ:room:0

## wireframe

- vertex v8 moved (4096, 0, 3152) → (4096, 0, 2752)
- vertex v9 moved (4096, 192, 3152) → (4096, 192, 2752)
- vertex v10 moved (4096, 192, 3248) → (4096, 192, 2848)
- vertex v11 moved (4096, 0, 3248) → (4096, 0, 2848)

## Review notes

- Game bounds in the sidecar (bounds) are unchanged by this geometry edit.
- doorway 0 (zy at x 4096, z 3072) is placed by coordinates; these frame vertices stood there at baseline: v8, v9, v10, v11 moved or were removed, and the metadata still names the old opening.
