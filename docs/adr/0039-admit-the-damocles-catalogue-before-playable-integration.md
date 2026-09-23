# Admit the Damocles Catalogue before playable integration

Accepted. Partially supersedes ADR 0021's early implementation restriction: the shared browser app may now load a separately versioned Damocles Catalogue and render filled models for read-only inspection before The Second City. This gives players and remake development one usable route into recovered content without requiring a Damocles Gameplay Session; playable integration still follows The Second City. Targ's runtime payload and semantics remain independent.

The catalogue includes objects, structures, interiors, visual variants, evidence, and recovered placements on per-body maps. Its code is independently authored from documented Working-Authority findings, never translated original program code (ADR 0002). Its own extracted data is tracked under `payload/damocles/`, extending ADR 0029's private payload convention to this dataset; original media, RAM, disassembly, and reference captures remain ignored. This is no publication clearance or public deployment decision.

We considered keeping all extraction offline until playable integration, and generalising the live session immediately. The former delays useful inspection and fidelity feedback; the latter couples unresolved research to working Targ play. A dedicated catalogue page and data contract make the narrower capability independently useful.

_(Status note, 2026-09-10: ADR 0042 separately admits the shell-owned Flyover to inspect the recovered Gamma System before playable integration. That is a sibling read-only exception, not an expansion of the Catalogue: the two keep separate pages, documents and presentation contracts.)_

_(Status note, 2026-09-11: ADR 0043 admits Damocles play; "playable integration still follows The Second City" no longer holds. The Catalogue stays read-only and separately versioned, and the Damocles Gameplay Session reads it as its Data Payload.)_

_(Status note, 2026-09-15: Catalogue unique-record totals live in the generated `coverage.census` ledger rather than in this ADR.)_

_(Status note, 2026-09-23: ADR 0048 stores the Catalogue as one shared document and one file per Damocles Model. The data contract is that directory, at schema version 16; #408's per-instance boarding block moved it to 17.)_
