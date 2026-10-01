# Semantic diff: damocles:structure-01484e

## variant:combined

- vertex v0 moved (840, 0, -760) → (840, 300, -760)
- vertex v1 moved (840, 0, -600) → (840, 300, -600)

## Review notes

- Drawn geometry changed (variant:combined) but walking geometry walk:combined, walk:combined-closed did not. It is separate on purpose; edit it explicitly if the walkable shape should follow.
- Game bounds in the sidecar (bounds, proximityBox) are unchanged by this geometry edit.
- variant:combined moved 2 vertices; 5 vertices of variant:interior-layout shared those positions at baseline and did not move. Variants are separately evidenced forms, so nothing propagates.
- variant:combined moved 2 vertices; 5 vertices of walk:combined shared those positions at baseline and did not move. Variants are separately evidenced forms, so nothing propagates.
- variant:combined moved 2 vertices; 5 vertices of variant:combined-closed shared those positions at baseline and did not move. Variants are separately evidenced forms, so nothing propagates.
- variant:combined moved 2 vertices; 5 vertices of walk:combined-closed shared those positions at baseline and did not move. Variants are separately evidenced forms, so nothing propagates.
- variant:combined moved 2 vertices; 5 vertices of plan shared those positions at baseline and did not move. Variants are separately evidenced forms, so nothing propagates.
