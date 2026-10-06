# Unify Mercenary titles in one Independent Implementation

Working-Authority Evidence from the Damocles ST programme (#79–#81, #85–#86) shows Damocles is not a Content Overlay on Targ and is not shippable by stretching today's live types alone, but the product destination is still one app that can host _Escape from Targ_, later Damocles, and—as aspiration only—the wider series. This ADR therefore supersedes ADR 0020's choice to keep Damocles permanently outside the remake's engine: the right shape is **one multi-title Independent Implementation** (one Gameplay Session authority, one Data Payload family, one Game Surface that can present wireframe Targ and filled Damocles), not a second Independent Implementation and not MDDClone or mechanical translation of ST/Amiga code (ADR 0002). Damocles implementation still waits until after _The Second City_; until then only research and non-loaded session/schema sketches are allowed, with one presentation-only exception: verified interface typography may be offered by the shared Browser Shell without opening any Damocles Game Surface or Game Semantics work.

## Status

The early implementation restriction is partially superseded by [ADR 0039](0039-admit-the-damocles-catalogue-before-playable-integration.md), which admits the read-only Damocles Catalogue and its separate extracted data now, and by [ADR 0042](0042-fly-a-system-without-play.md), which admits the shell-owned Flyover's read-only Gamma System inspection. Playable integration retained the sequencing below until [ADR 0043](0043-admit-damocles-play-alongside-the-second-city.md) removed it.

_(Status note, 2026-09-11: [ADR 0043](0043-admit-damocles-play-alongside-the-second-city.md) supersedes the sequencing below. Damocles play is admitted now, with no ordering relative to *The Second City*; the one-implementation decision, ADR 0002 and the Working-Authority stance stand.)_

Accepted. Supersedes the architecture and “outside this remake's engine” product stance of ADR 0020. Sequencing after _The Second City_, single-context research notes, ADR 0002, and the ban on live Damocles payload / filled Game Surface / `CONTEXT-MAP` split _before_ that seam are unchanged.

## Considered Options

- Second Independent Implementation for Damocles (separate remake body or split context).
- Keep ADR 0020: Damocles forever outside this engine; research archive only, or remake shape undecided.
- Stretch via Content Overlay or Colony Craft continuity into one Targ-shaped session.
- MDDClone or mechanical translation of Working Authority / Amiga code.
- One multi-title Independent Implementation after _The Second City_, with non-loaded unified sketches allowed now.

The last option is taken. A second Independent Implementation matches neither the single-app product goal nor the desire to share session, payload family, and Game Surface; ADR 0020's research-phase isolation remains correct for _now_ but is the wrong long-term architecture.

## Consequences

- **#82 verdict:** reject “second Independent Implementation”; affirm Damocles in programme scope inside one multi-title Independent Implementation after _The Second City_.
- Non-loaded sketches under `docs/research/` (and related research trees) may name future multi-title Gameplay Session seams; they must not be loaded by the app and must not alter `MercenaryKit`, the Targ Data Payload, or the browser-pivot critical path.
- Live Damocles payload, filled Game Surface on the shipping path, and `CONTEXT-MAP.md` remain out of scope until after _The Second City_, except for the narrow read-only Catalogue and Flyover admissions in ADRs 0039 and 0042. The provenance-bound Damocles interface typeface remains the only other early Browser Shell exception; none of these makes the current Gameplay Session multi-title.
- Whole-series aspiration is non-binding; this ADR binds Damocles only. _The Second City_ remains the Content Overlay seam for Initial Release; whether that overlay story later flattens into “titles” is deferred.
- Reference Build stays the C64 edition of _Escape from Targ_. Damocles facts remain Working-Authority Evidence, not Authoritative Evidence.
- Colony Craft escape still does not load Damocles; fiction continuity is not session continuity until an explicit multi-title design says otherwise.
