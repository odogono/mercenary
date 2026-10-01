# Semantic diff: damocles:structure-01484e

## plan

- face f28 added: [v3 v2 v1 v0] #00cccc ($8094), record 0, last in face order — same boundary as removed f0, winding reversed
- face f0 removed: [v0 v1 v2 v3] #00cccc ($8094), record 0

## Review notes

- Drawn geometry changed (plan) but walking geometry walk:combined, walk:combined-closed did not. It is separate on purpose; edit it explicitly if the walkable shape should follow.
- Game bounds in the sidecar (bounds, proximityBox) are unchanged by this geometry edit.
