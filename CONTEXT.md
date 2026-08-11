# Mercenary Remake

This context defines the shared language for recreating Novagen's *Mercenary: Escape from Targ* as a native macOS game.

## Language

**Reference Build**:
The Commodore 64 edition of *Mercenary: Escape from Targ*, used as the authority for the original world's data and game behaviour.
_Avoid_: Canonical ROM, original version

**Faithful Remake**:
A recreation evaluated by the Fidelity Contract that preserves the Reference Build's world, geometry, mechanics, progression, economy, encounters, and wireframe visual language, except for necessary least-divergent alternatives accepted through public Departure Records, while fitting naturally into macOS.
_Avoid_: Port, remaster, emulator

**Mac Adaptation**:
A separable host-platform accommodation—such as input, display scaling, windowing, audio plumbing, or save handling—that remains within the applicable Acceptance Envelopes and does not alter the preserved semantic baseline.
_Avoid_: Gameplay improvement, modernization

**Game Surface**:
The game-owned presentation region containing the world view, status information, prompts, and gameplay feedback whose observable behaviour is governed by the Fidelity Contract.
_Avoid_: Viewport, game UI

**Native Shell**:
The macOS-owned experience surrounding the Game Surface, including windows, menus, settings, help, file interaction, and host feedback.
_Avoid_: Host UI, Mac shell

**Game Semantics**:
The fidelity-governed rules and state transitions that determine outcomes and meaningful future state from Semantic Actions and time, independently of the Native Shell and Mac Adaptations.
_Avoid_: Game logic, gameplay layer

**Semantic Action**:
A device-independent player intent whose availability, conflicts, ordering, rate limits, and outcomes are governed by Behavior Cases.
_Avoid_: Key press, button press, scan code

**Control Profile**:
A named set of device-specific bindings that maps physical controls to Semantic Actions.
_Avoid_: Keymap, input profile

**Accommodation**:
An optional Mac Adaptation that improves access through equivalent input or redundant presentation without changing Game Semantics or player-relevant timing.
_Avoid_: Assist mode, accessibility mode

**Display Composition**:
A validated arrangement of the world view, status information, and prompts within the Game Surface that preserves their governed information and behaviour.
_Avoid_: Layout mode, aspect mode

**Initial Release**:
The complete *Mercenary: Escape from Targ* experience delivered by this effort, with extension seams for *The Second City* but without that expansion's content.
_Avoid_: Mercenary 1, base game

**Content Set**:
The complete immutable definition selected for a playable experience, resolved and validated before a session begins.
_Avoid_: Content pack, campaign, resource bundle

**Content Overlay**:
A versioned layer that names one exact Content Set ancestry and explicitly adds, replaces, or removes definitions before a new Content Set is resolved.
_Avoid_: Patch, DLC, load order

**Mod**:
An untrusted, locally sideloaded Content Overlay whose resolved experience is outside the official Fidelity Contract conformance claim.
_Avoid_: Plugin, official expansion

**Session State**:
The complete set of mutable, future-affecting Game Semantics values for one play session.
_Avoid_: Save file, runtime snapshot, game data

**Transition Log**:
The authoritative ordered history of committed Game Semantics outcomes from which Session State is derived.
_Avoid_: Input recording, debug log, event telemetry

**Independent Implementation**:
New native application code written without incorporating or mechanically translating the Reference Build's program code, intended to support public distribution.
_Avoid_: Source port, ROM wrapper

**World Geometry Dataset**:
A lossless, provenance-backed representation of the Reference Build's object models, vertices, edges, instances, transforms, coordinate systems, layouts, bounds, identities, and visibility rules.
_Avoid_: Mesh dump, model pack

**Geometry Identity**:
A stable, Research Provenance-backed identity for an entity in the World Geometry Dataset that remains valid when its interpretation or name changes.
_Avoid_: Object name, canonical name

**Curated Name**:
A human game-world label attached to a Geometry Identity, marked verified when supported by Authoritative Evidence and candidate when its interpretation remains uncertain.
_Avoid_: Canonical identity, definitive name

**Preserved Quirk**:
Reference Build behaviour retained because it materially affects play or has been explicitly curated as part of the game's characteristic identity.
_Avoid_: Bug compatibility

**Fidelity Contract**:
The versioned policy that defines how the Faithful Remake demonstrates observable equivalence to the evidence-derived baseline, including governed exceptions.
_Avoid_: Pixel-perfect clone, feels-the-same promise

**Behavior Case**:
An evidence-linked statement of initial state, player actions, expected observables, and Acceptance Envelopes used to evaluate one fidelity obligation.
_Avoid_: Test case, anecdote

**Behavior Catalogue**:
The complete evidence-backed index of player-observable Reference Build content and behaviour, including its coverage and explicitly bounded uncertainties.
_Avoid_: Feature list, walkthrough

**Catalogue Entry**:
One stable player-observable content or behaviour identity in the Behavior Catalogue, independent of its current interpretation or domain classification.
_Avoid_: Behavior Case, reference fact

**Acceptance Envelope**:
The evidence-backed bounds within which an observable may vary without changing the preserved game.
_Avoid_: Close enough, tolerance guess

**Repairable Artifact**:
A reproducible C64 hardware or software effect demonstrated not to have material player impact and therefore eligible for a governed repair.
_Avoid_: Obvious bug, free fix

**Departure Record**:
A public, versioned decision accepting a necessary least-divergent mismatch from one or more Behavior Cases while retaining the original evidence-derived expectations.
_Avoid_: Exception note, silent improvement

**Authoritative Evidence**:
Behaviour observed in the running Reference Build or data decoded directly from it; when sources disagree, this evidence outranks manuals and other platform editions.
_Avoid_: Port behaviour, manual intent

**Research Provenance**:
The trace from a recovered fact or datum to ROM offsets, runtime addresses, source hashes, observations, and the interpretation used to reconstruct it.
_Avoid_: Extraction notes, reverse-engineering log

**Restricted Material**:
Original or expression-bearing Reference Build inputs, captured artifacts, or derived content withheld from publication unless expressly cleared for the intended use.
_Avoid_: Private asset, secret content

**Reconstructed Payload**:
An immutable dataset or content artifact derived from Restricted Material for use by the Independent Implementation, governed separately from application code.
_Avoid_: Asset dump, extracted ROM data
