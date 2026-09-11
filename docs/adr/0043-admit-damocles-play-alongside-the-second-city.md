# Admit Damocles play alongside The Second City

Accepted, 2026-09-11. ADR 0021 chose one multi-title Independent Implementation and sequenced Damocles play after _The Second City_; ADRs 0039, 0040, 0041 and 0042 each repeated that sequencing while admitting narrower read-only exceptions. This ADR removes the sequencing. A Damocles Gameplay Session may be built now, and there is **no ordering** between Damocles and _The Second City_: each proceeds on its own evidence and its own path, and neither waits for the other. Everything else in ADR 0021 stands: one Independent Implementation, no mechanical translation of the Working Authority or MDDClone (ADR 0002), the Working Authority as Damocles's authority, and no `CONTEXT-MAP` split.

The gate was placed when Damocles was a research programme with no data the app could load. That is no longer the position. The Damocles Catalogue (ADR 0039) holds 539 Damocles Models and 318 Damocles Instances with filled geometry and resolved colours; the Eris first-world workspace is mapped to its cell grid; the on-foot start pose, the walk-or-boarded state words, and the control bindings are Working-Authority Evidence; the Flyover (ADR 0042) has already proved a sessionless filled renderer and a `/damocles/debug` document. Holding play behind _The Second City_ now sequences finished research behind unstarted work for no gain, and the one seam _The Second City_ was meant to exercise first, the Content Overlay, is not one Damocles uses.

**Shape.** The Damocles Gameplay Session is a sibling of Targ's, not a generalisation of it. Targ's `GameplaySession`, `World` and `SessionSnapshot` are shaped by the Reference Build: Rooms, lifts, Benson, Object Residence, a 24-bit wrapping surface. Damocles has Bodies, cells, Filled Presentation and a script VM of its own. Forcing one type over both would put the unresolved title's shape onto the shipping one. Instead the Browser Shell names the little it needs from any Title in one interface, and each Title implements it; Targ adapts to the interface when convenient, and its Golden Traces do not move. The two Titles share pure seams only: the movement Intent, the panel view model, the view-space Camera transform, the polygon triangulator.

**Fidelity rule for Damocles.** Damocles facts remain Working-Authority Evidence and never Authoritative Evidence. A value the app uses is one of three kinds and says which: **recovered** from the Working Authority with Research Provenance, **derived** mechanically from recovered values, or **authored** by this project because the original's value is not yet decoded. Recovered data lives in the Data Payload under `payload/damocles/`; derived and authored values live in versioned, strictly validated documents outside `payload/`, in the manner of the Flyover documents, tagged per value. An authored value is a placeholder with a research issue behind it, not a claim. Where geometry is unrecovered the app draws nothing and counts the gap; it does not invent a stand-in. Acceptance is by unit tests over the recovered data and by deterministic screenshots reviewed by the maintainer (ADR 0011); no Golden Trace or Fidelity Contract claim is made for Damocles until a Damocles trace discipline is decided on its own terms.

**First slice.** `/damocles` starts Damocles's one Destination as ADR 0041 specifies: on foot at Eris Capital Spaceport at the recovered start pose, with the Damocles Panel Rendition reading the recovered body name and cell, walking among the Catalogue's exteriors in Filled Presentation. It loads only Damocles's Data Payload and keeps its own Session Resume (ADR 0041). Interiors, boarding, the impact clock, the navigation coordinates, Damocles Scripts, Damocles Saves and a Departure carousel entry follow as their evidence arrives. The Flyover stays sessionless and separate (ADR 0042).

## Considered Options

- Keep the gate: Damocles play after _The Second City_.
- Reorder: Damocles first, _The Second City_ deferred until Damocles reaches a milestone.
- Drop _The Second City_ from scope.
- Generalise Targ's Gameplay Session and World into interfaces both Titles implement.
- Remove the ordering, build a sibling Damocles Gameplay Session behind a small Title interface, and govern Damocles values by tagged provenance.

The last option is taken. Keeping the gate sequences finished research behind unstarted work. Reordering creates the mirror-image problem. Dropping _The Second City_ is a product decision nobody has asked for and would unpick ADRs 0040 and 0041 for no Damocles benefit. Generalising the live Targ types puts an unresolved title's shape on the shipping path, which is what the earlier isolation was rightly protecting.

## Consequences

- ADR 0021's sequencing clause is superseded. Its status notes, and those on ADRs 0039, 0040, 0041 and 0042 that repeat "after _The Second City_", are amended to point here.
- **Damocles** in the glossary loses "after _The Second City_". **Filled Presentation** becomes a live Game Surface mode for Damocles exteriors rather than a future one. **Damocles Catalogue** remains read-only and distinct from the Gameplay Session.
- A `TitleRuntime` seam enters the Browser Shell. Targ is not required to adopt it in the first slice.
- `web/damocles/` holds authored Damocles presentation documents, outside `payload/`, with per-value provenance.
- Publication is unchanged: the dev server is localhost-only and no deploy exists (ADR 0019, #67). Restricted Material stays ignored (ADR 0029, ADR 0039).
- Research follow-ups for every authored placeholder are filed as children of the implementation map (#195).
