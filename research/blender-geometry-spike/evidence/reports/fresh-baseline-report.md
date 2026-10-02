# Fresh-baseline comparison: damocles-object-03f774

Recovery changes 1 · recovery corrections 0 · creative changes 2 · converged 1 · conflicts 1 · unclassified 1

## Recovery changes from re-extraction (1)

The fresh baseline differs from the one the asset was adopted from, and the asset never touched these elements. Adopting them is a deliberate edit; nothing was written.

- `variant:record/v0`: [-60,0,-10] → [-60,0,-12]

## Creative changes authored in the asset (2)

Deliberate departures from the recovered geometry.

- `variant:record/f5`: {"colour":{"colour":"#664422","kind":"palette","source":801},"loop":[10,9,3,4]} → absent — side face rebuilt as f7
- `variant:record/f7`: absent → {"colour":{"colour":"#664422","kind":"palette","source":801},"loop":[9,3,4,10]} — rebuilt side face

## Converged (1)



- `variant:record/v6`: re-extraction now recovers what the asset authored ([-60,30,-10]); the ledger entry can retire

## Conflicts (1)

Both re-extraction and the asset changed these elements, differently. Resolve by hand.

- `variant:record/f0`: adopted {"colour":{"colour":"#ccaa88","kind":"palette","source":1620},"loop":[6,7,8,9,10,11]}, fresh {"colour":{"colour":"#aa8866","kind":"palette","source":1347},"loop":[6,7,8,9,10,11]}, edited {"colour":{"colour":"#664422","kind":"palette","source":801},"loop":[6,7,8,9,10,11]}

## Unclassified changes (1)

Authored changes with no ledger entry, or corrections without evidence. A review should refuse these.

- `variant:record/l0`: absent → {"colour":{"colour":"#ccaa88","kind":"palette","source":1620},"ends":[0,3]}

## Asset files

`baseline` into an asset directory: refused (error: refusing to write a baseline into /Users/alex/.t3/worktrees/mercenary/t3code-3bafbab3/research/blender-geometry-spike/out/fresh/asset: it holds or lies inside an edited asset, and assets are never overwritten).

Every file of the edited asset is byte-identical after re-extraction: yes.

| File | SHA-256 before | after |
| --- | --- | --- |
| asset.blend | 2f008f7766e52756… | 2f008f7766e52756… |
| asset.glb | b10091ae972f9853… | b10091ae972f9853… |
| ledger.json | 0e5b40cec3fc12a9… | 0e5b40cec3fc12a9… |
| recovered.contract.json | 4f796c173b6fee8f… | 4f796c173b6fee8f… |
| sidecar.json | 976ac19d9772f5ab… | 976ac19d9772f5ab… |

The edited asset's .glb and a fresh export of its .blend agree: yes.
