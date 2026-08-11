# Publication policy

This policy resolves [issue #5](https://github.com/odogono/mercenary/issues/5).
It governs engineering decisions about publication; it is not legal advice or a
release clearance.

The repository remains private during research. One maintainer may perform both
Reference Build research and Independent Implementation work; the project does
not represent this as a personnel clean room. The Independent Implementation
must nevertheless be newly authored from documented functional findings and
must not incorporate or mechanically translate original program code, as
required by [ADR 0002](adr/0002-separate-rom-research-from-implementation.md).

## Private research boundary

Restricted Material stays outside Git in ignored paths. Supplied media belongs
under `roms/`, generated laboratory evidence under
`research/c64-reference-build/work/`, and other restricted work under
`restricted/`. This includes ROMs, disk or tape images, memory dumps, snapshots,
screenshots, disassembly or decompiler output, copied machine code, exact decoded
tables, and uncleared Reconstructed Payloads.

Research Provenance may point to Restricted Material without moving that
material into Git. A private repository, an ignored path, or a provenance record
reduces accidental disclosure; none establishes that publication is permitted.
Analytical notes, hashes, labels, and offsets may remain tracked while the
repository is private, but they are Reference Build-specific research and must
pass qualified review before entering a public repository.

## Publication tiers

### Maintainer-reviewed publication

The following may be candidates for publication after the checklist below:

- independently authored engine code;
- documentation that contains no Restricted Material or Reference Build-specific
  research detail;
- synthetic fixtures and demonstrations; and
- generic research tools that contain no game-specific offsets, labels, hashes,
  payloads, or bypass logic.

Published engine code targets the MIT licence. That licence does not cover
Reconstructed Payloads, third-party material, or trade marks. Until branding is
cleared, public candidates use a neutral identity rather than the original game,
developer, or publisher names and logos.

### Qualified-review publication

Written clearance from qualified intellectual-property counsel is required
before publishing any of the following:

- a Reconstructed Payload, including exact geometry, world data, text, audio,
  artwork, names, or audiovisual presentation;
- Reference Build-specific research, tooling, labels, hashes, offsets,
  screenshots, recordings, or comparison media;
- original names, logos, or other branding;
- a repository export that contains any of the above; or
- the complete Initial Release.

Clearance applies only to the identified item and version, intended use and
publication surface, territories, term, and stated conditions. It does not
silently extend to a changed payload or a later release.

Public issue comments, pull requests, CI logs and artifacts, source archives,
package registries, application bundles, crash reports, screenshots, recordings,
and downloads are publication surfaces under this policy.

## Sensitive-item record

Before qualified review, maintain a compact inventory of every sensitive or
third-party item proposed for publication. Ordinary independently authored
source files do not require individual provenance entries.

| Item and immutable version or hash | Origin | Intended use or surface | Territories | Status | Evidence reference |
| --- | --- | --- | --- | --- | --- |
| `<item>` | original, reconstructed, or third-party | `<where and how it will appear>` | `<territories>` | restricted, pending, cleared, or withdrawn | `<provenance, licence, or counsel record>` |

`cleared` means that the recorded evidence expressly covers the proposed use.
An expired or revoked decision changes the item to `withdrawn`, blocks further
publication, and requires reasonable withdrawal or remediation of affected
downloads before a fresh review.

## Publication checklist

Before making the repository public or distributing any source, media, or build:

1. Identify the exact candidate commit, archive, or application build and every
   publication surface.
2. Inventory its sensitive and third-party items and classify the candidate
   under the two tiers above.
3. Confirm that no ignored input or work artifact is tracked and inspect the
   candidate contents, metadata, logs, and documentation for Restricted Material.
4. Before changing repository visibility, inspect every Git ref and historical
   blob. If Restricted Material was committed, preserve it privately, purge it
   from all public-bound history, and require a clean clone before continuing.
5. Confirm that original source and dependencies have appropriate licences and
   that public-facing names and presentation are neutral or expressly cleared.
6. Obtain and record written qualified-counsel clearance for every
   qualified-review item, including its scope and conditions.
7. Recheck the final candidate against the inventory. Stop when evidence is
   missing, ambiguous, expired, or inconsistent with the candidate.

The checklist is intentionally manual. This policy does not require scanners,
CI gates, separate personnel, or exhaustive file-level provenance.

## Decision scenarios

| Scenario | Decision |
| --- | --- |
| Independently authored engine code uses synthetic fixtures and neutral branding | It may be published after the maintainer checklist under the engine's approved licence. |
| Exact World Geometry Dataset values are proposed without written clearance | Publication is blocked; the data remains Restricted Material. |
| Counsel clears one Reconstructed Payload hash for named uses and territories | Only that immutable payload may be included, and only within the recorded scope. |
| Exact fidelity-critical content cannot be cleared | Retain the original Behavior Case, use a newly authored least-divergent substitute only through an accepted public Departure Record, and obtain clearance for the resulting release. |

Fidelity approval and publication clearance remain independent. A maintainer's
acceptance of a Departure Record never clears material for publication.
