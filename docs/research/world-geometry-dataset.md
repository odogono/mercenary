# World Geometry Dataset

Research and executable evidence for [issue #7](https://github.com/odogono/mercenary/issues/7).

## Contract

The extractor follows the initialized physical-RAM pointer tables established
by the C64 geometry research. It refuses post-unpack captures, CPU-visible ROM
views, altered artifacts, the wrong Reference Build hash, and a runtime state
without the conditioned `$007F=$3F` marker.

The generated restricted bundle contains `manifest.json`, `provenance.json`,
`objects.json`, `surface.json`, and `underground.json`. Each document conforms
to a Draft 2020-12 schema. An optional `curation.json` is hashed separately and
does not affect the core geometry digest.

Canonical values remain integers in their Reference Build widths and units:

- object coordinates retain biased source bytes, exact local displacements,
  signed and unsigned 24-bit positions, initial orientation bytes, bounds,
  membership, state, and point-versus-wireframe visibility rules;
- surface data retains shared structures, line operations, rotated inputs,
  synthetic-index relationships, all 256 cell expansions, both road segments,
  bounds, and the altitude LOD table; and
- underground data retains overlapping records, all raw commands and uncertain
  behaviour bytes, the complete 16-entry primitive lookup, boundary geometry,
  all 192 room expansions, portal relationships, and bounds.

Every source definition includes raw bytes and its runtime span. Every derived
vertex and edge has a Geometry Identity and provenance references. Verification
rejects duplicate identities, broken references, escaped paths, schema or hash
mismatches, and any record that cannot reconstruct its original bytes.

## Reproducibility and evidence

`geometry reproduce` performs two clean, conditioned C64 starts and extracts a
bundle from each. The core digest canonicalizes the four data documents while
excluding the volatile run ID, output paths, timestamps, Curated Names,
renders, and reviews. All other captured source identity remains significant.

The aggregate evidence contract is exact: 64 object slots, 55 object models,
256 surface cells, 98 surface structures, 135 first and 136 second road
segments, 192 room IDs, 174 unique room records, and 427 commands. A mismatch
is a hard failure rather than a tolerance.

`geometry compare` starts the Reference Build again, re-extracts the four
deterministically selected subjects, compares their full normalized geometry
digests, and writes paired SVGs plus a local HTML report. The subjects are the
lowest qualifying road-and-structure cell, portal room, verified enterable
vehicle, and fixed object slot `$3F`. The report and VICE corroboration remain
ignored Restricted Material. `geometry review` records the maintainer's
approval or rejection; unresolved mismatches block the issue and require
focused research, not a Departure Record.

## Curated Names

The optional overlay lives in ignored restricted storage. It associates a
Geometry Identity with a preferred name, a `verified` or `candidate` status,
and evidence references. `verified` requires Authoritative Evidence. Names do
not replace identities and their digest is kept separate, so editorial changes
cannot change the core dataset identity.

## Publication boundary

Exact geometry, raw bytes, Curated Names, screenshots, SVGs, HTML reports, and
run logs remain under `research/c64-reference-build/work/` or `restricted/`.
Only schemas, tooling, synthetic tests, documentation, and an allowlisted
baseline summary belong in Git. `geometry summarize` emits only versions,
digests, aggregate counts, pass/fail statuses, reviewer metadata, and opaque
restricted-evidence pointers after all four comparisons are approved.

This boundary implements ADRs 0002 and 0004. Repository privacy does not permit
the exact dataset to enter Git history.
