# Admit the Damocles Catalogue before playable integration

Accepted. Partially supersedes ADR 0021's early implementation restriction: the shared browser app may now load a separately versioned Damocles Catalogue and render filled models for read-only inspection before The Second City. This gives players and remake development one usable route into recovered content without requiring a Damocles Gameplay Session; playable integration still follows The Second City. Targ's runtime payload and semantics remain independent.

The catalogue includes objects, structures, interiors, visual variants, evidence, and recovered placements on per-body maps. Its code is independently authored from documented Working-Authority findings, never translated original program code (ADR 0002). Its own extracted data is tracked under `payload/damocles/`, extending ADR 0029's private payload convention to this dataset; original media, RAM, disassembly, and reference captures remain ignored. This is no publication clearance or public deployment decision.

We considered keeping all extraction offline until playable integration, and generalising the live session immediately. The former delays useful inspection and fidelity feedback; the latter couples unresolved research to working Targ play. A dedicated catalogue page and data contract make the narrower capability independently useful.
