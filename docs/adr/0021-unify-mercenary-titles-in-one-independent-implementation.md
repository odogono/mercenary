# Unify Mercenary titles in one Independent Implementation

Working-Authority Evidence from the Damocles ST programme (#79–#81, #85–#86) shows Damocles is not a Content Overlay on Targ and is not shippable by stretching today's live types alone, but the product destination is still one app that can host *Escape from Targ*, later Damocles, and—as aspiration only—the wider series. This ADR therefore supersedes ADR 0020's choice to keep Damocles permanently outside the remake's engine: the right shape is **one multi-title Independent Implementation** (one Gameplay Session authority, one Data Payload family, one Game Surface that can present wireframe Targ and filled Damocles), not a second Independent Implementation and not MDDClone or mechanical translation of ST/Amiga code (ADR 0002). Damocles implementation still waits until after *The Second City*; until then only research and non-loaded session/schema sketches are allowed.

## Status

Accepted. Supersedes the architecture and “outside this remake's engine” product stance of ADR 0020. Sequencing after *The Second City*, single-context research notes, ADR 0002, and the ban on live Damocles payload / filled Game Surface / `CONTEXT-MAP` split *before* that seam are unchanged.

## Considered Options

- Second Independent Implementation for Damocles (separate remake body or split context).
- Keep ADR 0020: Damocles forever outside this engine; research archive only, or remake shape undecided.
- Stretch via Content Overlay or Colony Craft continuity into one Targ-shaped session.
- MDDClone or mechanical translation of Working Authority / Amiga code.
- One multi-title Independent Implementation after *The Second City*, with non-loaded unified sketches allowed now.

The last option is taken. A second Independent Implementation matches neither the single-app product goal nor the desire to share session, payload family, and Game Surface; ADR 0020's research-phase isolation remains correct for *now* but is the wrong long-term architecture.

## Consequences

- **#82 verdict:** reject “second Independent Implementation”; affirm Damocles in programme scope inside one multi-title Independent Implementation after *The Second City*.
- Non-loaded sketches under `docs/research/` (and related research trees) may name future multi-title Gameplay Session seams; they must not be loaded by the app and must not alter `MercenaryKit`, the Targ Data Payload, or the browser-pivot critical path.
- Live Damocles payload, filled Game Surface on the shipping path, and `CONTEXT-MAP.md` remain out of scope until after *The Second City*.
- Whole-series aspiration is non-binding; this ADR binds Damocles only. *The Second City* remains the Content Overlay seam for Initial Release; whether that overlay story later flattens into “titles” is deferred.
- Reference Build stays the C64 edition of *Escape from Targ*. Damocles facts remain Working-Authority Evidence, not Authoritative Evidence.
- Colony Craft escape still does not load Damocles; fiction continuity is not session continuity until an explicit multi-title design says otherwise.
