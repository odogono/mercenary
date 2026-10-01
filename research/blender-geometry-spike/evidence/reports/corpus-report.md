# Corpus round trip

Blender 5.2.2 LTS. Every Damocles Model the contract represents went through the add-on: import, save `.blend`, reopen in a new process, export, compare with the recovered contract and validate against its sidecar.

| | Models | Exact |
| --- | --- | --- |
| Recovered → composed back to the payload file (TypeScript) | 1713 | all |
| Not representable by the spike contract (mesh fields `alternates`, `texts`, `articulation`) | 53 | — |
| Blender import → save → reopen → export | 1713 | 1713 |
| …with Edit Mode entered and left on every part first | 1713 | 1713 |
| Targ object models / Rooms composed back exactly | 55/55 / 192/192 | |
