# Promote bounded Dion Catalogue content through an explicit export

Accepted, 2026-10-02, for [D2 / #704](https://github.com/odogono/mercenary/issues/704). Play receives a reviewed, explicitly exported subset of the Dion Catalogue through the playable Data Payload. It does not load Catalogue documents at runtime. This preserves the independent inspection boundary in [ADR 0061](0061-admit-a-sessionless-dion-catalogue-under-the-dion-path.md) while allowing recovered content to support the [accepted TOURCRAFT slice](../research/mercenary-iii-tourcraft-milestone-review.md).

## Decision

- A versioned promotion manifest names the selected original references, Geometry Identities, variants, placements, transforms and dependency closure. It distinguishes geometry available for drawing from the services, residents and interactions admitted into play. Catalogue coverage alone never establishes gameplay reachability.
- The export reads validated Catalogue recovery records and writes only the bounded playable documents. Preserve record hashes and source provenance; keep recovered, derived and authored values distinguishable. Required unrecovered content blocks completion, with no invented stand-ins or Damocles data substituted for Dion evidence.
- The initial gameplay state has one coherent pinned capture. Immutable geometry may come from the Catalogue's different capture, provided both pin the same Mercenary III program image and the manifest retains each record's capture/source identity and digest. Validate original references, variants, binding compatibility and all cross-document dependencies. Mutable residences, model selections and service state come from the gameplay evidence, not an inspection capture's incidental state. Do not weaken the existing same-capture check into an unrestricted mixed-source loader or give different captures a fabricated common identity.
- Play owns a deterministic `contentSha256` over the manifest and every served playable document, including promoted geometry and presentation dependencies, in a documented fixed order. Verify the admitted bytes and each required record; a lazy loader must not omit dependencies from identity or admit unverified content into a restored session. Catalogue-only records and exports do not affect that identity. Changes to selected content do.
- Catalogue and play keep independent schemas, kinds, loaders and storage behavior. The Catalogue remains sessionless, does not read playable documents and never reads or writes Saves or Session Resume. The export is the only new dependency between the two document collections.

## Considered options

Direct runtime Catalogue loading would couple inspection exports, capture selection and whole-world coverage to play and Save compatibility. Re-exporting the entire Catalogue would also admit content beyond the selected journey. Copying records manually without a manifest would lose reproducible dependency and provenance checks. The bounded export instead makes promotion reviewable and repeatable while preserving runtime isolation.

## Consequences

The Catalogue contract and glossary distinguish export-time promotion from runtime independence. The existing six-document playable loader remains unchanged in this decision-only change; the promotion implementation must introduce strict admission for the manifest and selected content, with per-record provenance where appropriate. Save schema 1 is not silently compatible with the expanded snapshot/content: D2 requires a versioned, allowlisted taxi-Save migration, validated by restored futures. Unknown identities remain refused.

Damocles code must be assessed for reuse wherever appropriate, under ADR 0043 and the D2 review. This ADR changes the data-promotion boundary; it does not authorize a generic cross-title Gameplay Session, a universal boarding mechanism or copying original program code. A consequential new shared-mechanism boundary needs its own recorded decision.

The [I3 implementation contract](../dion-tourcraft-content-contract.md) records the bounded exporter, eager loader, exact served-byte identity and presentation comparisons. [ADR 0067](0067-share-numeric-sky-helpers-with-dion-owned-presentation-data.md) records the shared numeric sky boundary. Production flight and Save migration remain I4 responsibilities.
