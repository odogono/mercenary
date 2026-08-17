# Derive Session State from committed transitions

**Superseded by ADR 0018.** This was a verification-era decision serving the
apparatus ADR 0014 froze, and it was never implemented. Session State is owned
directly by one Gameplay Session, with the Host Callout's variables projected from
it rather than derived from a log.

Session State will be derived from an authoritative Transition Log of versioned committed outcomes rather than from an opaque mutable snapshot or a replay of historical inputs through current rules. Every successful save compacts prior history into a validated State Origin linked to its previous digest; this keeps saves bounded and migrations auditable while preserving exact future-affecting state, at the cost of explicit transition schemas, projection validation, and migration tooling.
