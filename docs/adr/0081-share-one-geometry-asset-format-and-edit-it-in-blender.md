# Share one Geometry Asset format across the games and edit it in Blender

Accepted, 2026-10-22, for [#861](https://github.com/odogono/mercenary/issues/861). Targ, Damocles
and Mercenary III will share one model format: the Geometry Asset contract from the Blender spike
(#671), stored as canonical, key-sorted JSON with an Asset Sidecar. The contract has polygon loops,
explicit lines, stable vertex, face and line identities, colours and parts. A project add-on in
`tools/blender/` imports and exports it. Following the owner direction recorded in
[blender-geometry-workflows](../research/blender-geometry-workflows.md), GLB and `.blend` are
exchange and preview forms only, never canonical.

- **The Data Payload stays pure extractor output.** Edited and Authored Assets are tracked under
  `assets/<game>/`. An asset replaces the payload model that has the same Geometry Identity. An
  asset with no matching payload model is an Authored Asset, and its identity is in the `authored:`
  namespace. At first the extractors keep their game-specific formats, and the loader turns them
  into Recovered Baselines. Each extractor moves to the shared format later, starting with Targ.
- **The original engine limits do not apply.** Targ models may have faces and colour. Authentic and
  enhanced modes draw them the same way, because enhanced mode is only about rendering, not about
  content.
- **An edit cannot drift silently.** `bun run check` fails when a Recovered Baseline changes beneath
  an edited asset, until someone re-reviews that asset's Change Ledger.

Rejected: a canonical GLB or `.blend`. Both were larger and slower than JSON, and harder to review
as a diff. A `.blend` is also opaque and tied to Blender's release cycle.
