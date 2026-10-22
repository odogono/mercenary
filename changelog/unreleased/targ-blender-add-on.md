---
type: feat
scope: targ
section: added
---
**Targ objects and structures can be edited and authored in Blender.** The
add-on in `tools/blender/` opens and saves the Geometry Assets in
`assets/targ/`, keeping each asset's Sidecar and Change Ledger, and creates new
Authored Assets. A structure's Distant Structure is its own collection.
`bun tools/blender.ts` opens Blender with the add-on loaded (#865).
