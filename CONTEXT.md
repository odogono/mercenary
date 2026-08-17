# Mercenary Remake

This context defines the shared language for recreating Novagen's *Mercenary: Escape from Targ* as a browser game, with a native macOS implementation serving as its Trace Oracle until the browser reaches the opening loop (see ADR 0019).

Terms marked **(historical)** describe the frozen verification-era records (see ADR 0014). They remain accurate for reading those records but no new records of their kind are created.

## Language

**Data Payload**:
The single gitignored collection of game data re-extracted from the Reference Build by this project's own tooling, loaded by the app at runtime and kept out of Git.
_Avoid_: Asset folder, resources, ROM data

**Benson Script**:
An original game-logic program from the Reference Build's in-game interpreter, re-extracted into the Data Payload in a structurally preserved re-encoding of its bytecode, and executed by this project's own interpreter through the Host Callout.
_Avoid_: Game script, event code, AI logic, bytecode dump

**Craft Parameter Block**:
The set of values that makes one craft handle as it does—its control routine and its rates, limits, and gains—re-extracted into the Data Payload as plain numbers and selected by the craft the player currently occupies; a landed craft taxis on a block of its own, while a player on foot runs a separate fixed-step mover rather than this loop (ADR 0016).
_Avoid_: Flight profile, craft config, tuning block, vehicle stats

**Gameplay Session**:
The single owner of one play session's Session State, through which every change to it passes; it presents the Host Callout's view of that state rather than keeping a second copy, and hands out a Session Snapshot for anything that draws.
_Avoid_: Game manager, world state, controller, store

**Location**:
Which space the player occupies — the surface, or one identified Room. The surface is a Location in its own right and not a Room.
_Avoid_: Position, place, level, zone

**Occupancy**:
What the player is currently inside, being either on foot or aboard one identified craft.
_Avoid_: Vehicle state, mount, mode

**Object Residence**:
Where one object currently is: somewhere on the surface, in a Room, carried by the player, or out of the world; and, when it has been moved from where the Data Payload placed it, the place it was left.
_Avoid_: Object position, inventory flag, room membership

**Session Snapshot**:
One consistent description of a Gameplay Session at a single moment, complete enough to draw from and to compare against another, which every renderer consumes instead of reading the session's parts.
_Avoid_: View model, game state, render state

**Doorway**:
One opening belonging to a single Room, carrying the Room Link it leads along, whatever it demands before it opens, and where in the destination it puts the player; two Rooms that face each other have a Doorway each rather than sharing one.
_Avoid_: Portal, door, exit, connection

**Room Link**:
The directed connection a Doorway leads along, from the Room that owns the Doorway to one destination — another Room, or the surface. A Room Link in one direction implies nothing about the other direction.
_Avoid_: Edge, adjacency, neighbour, two-way link

**Rewired Room**:
A Room whose Doorway leads somewhere chosen on arrival rather than somewhere fixed, from a set of alternatives the Room carries; which alternative applies is decided either at random or by the Room the player arrived from.
_Avoid_: Teleporter, dynamic exit, patched room

**Host Callout**:
The explicit seam through which a Benson Script reaches the engine, comprising the named engine state it may read and write and the effects it may ask the host to perform; it is the only path between game logic and the rest of the app, and the boundary an eventual scripting layer replaces.
_Avoid_: Script API, engine hooks, bridge

**Reference Disassembly**:
The community-maintained annotated disassembly of the Reference Build, consumed as unlicensed reference documentation only — read for structure and locations, never copied into code or the Data Payload.
_Avoid_: Source code, upstream, dependency

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

**Web Adaptation**:
A separable browser-platform accommodation—such as key bindings, canvas sizing, frame pacing, or payload delivery—that leaves the preserved semantic baseline unchanged.
_Avoid_: Browser hack, web tweak, responsive mode

**Browser Shell**:
The browser-owned experience surrounding the Game Surface, including the page, its canvas, controls help, settings, and host feedback.
_Avoid_: Web UI, page chrome, wrapper

**Trace Oracle**:
The macOS implementation together with the deterministic traces it emits, held as the equivalence authority that the canonical browser implementation must reproduce (ADR 0019).
_Avoid_: Golden master, reference app, source of truth

**Game Semantics**:
The fidelity-governed rules and state transitions that determine outcomes and meaningful future state from Semantic Actions and time, independently of the Native Shell and Mac Adaptations.
_Avoid_: Game logic, gameplay layer

**Semantic Action**:
A device-independent player intent whose availability, conflicts, ordering, rate limits, and outcomes are governed by Behavior Cases.
_Avoid_: Key press, button press, scan code

**Semantic Mode**:
An evidence-backed Game Semantics state class that determines which Semantic Actions are available, how they conflict, which transitions they cause, and their timing, independently of device bindings and Geometry Identity.
_Avoid_: Control scheme, vehicle identity, input mode

**Handler-Equivalence Class**:
A class of enterable Geometry Identities that share every parameter affecting their Semantic Action surface, conflicts, rate limits, and timing, so one member's proof stands for the whole class.
_Avoid_: Vehicle type, craft class, ship model

**Object-Conditioned Predicate**:
A fidelity-governed rule whose outcome depends on which Geometry Identity is involved, as distinct from the mode-neutral rules that hold whatever the player is interacting with.
_Avoid_: Object rule, per-object logic

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

**Content Set** (historical):
The complete immutable definition selected for a playable experience, resolved and validated before a session begins.
_Avoid_: Content pack, campaign, resource bundle

**Execution Environment** (historical):
The exact digest-bound combination of Content Set ancestry, resolved content, Lua release and security policy, host ABI, schema versions, and host-policy version required to execute a session or load its state.
_Avoid_: Compatible environment, runtime profile

**Content Overlay** (historical):
A versioned layer that names one exact Content Set ancestry and explicitly adds, replaces, or removes definitions before a new Content Set is resolved.
_Avoid_: Patch, DLC, load order

**Mod** (historical):
An untrusted, locally sideloaded Content Overlay whose resolved experience is outside the official Fidelity Contract conformance claim.
_Avoid_: Plugin, official expansion

**Session State**:
The complete set of mutable, future-affecting Game Semantics values for one play session.
_Avoid_: Save file, runtime snapshot, game data

**Transition Log** (historical):
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

**Fidelity Contract** (historical):
The versioned policy that defines how the Faithful Remake demonstrates observable equivalence to the evidence-derived baseline, including governed exceptions.
_Avoid_: Pixel-perfect clone, feels-the-same promise

**Behavior Case** (historical):
A versioned executable scenario with explicit Fidelity Conformance and/or Release Readiness claim scopes, dependencies, initial state, actions, expected observables, and Acceptance Envelopes. Fidelity-scoped cases additionally carry the evidence and classification required by the Fidelity Contract.
_Avoid_: Test case, MAS scenario, CSM scenario, anecdote

**Verification Run** (historical):
One execution of a Verification Plan in a recorded public or restricted environment, producing immutable results and a sanitized manifest.
_Avoid_: Test run, evidence session

**Conformance Report** (historical):
The immutable public-safe aggregation for one exact application build and Content Set, reporting Fidelity Conformance, Release Readiness, evidence lineage, diagnostics, and Release Eligibility.
_Avoid_: Test report, certification

**Release Eligibility** (historical):
The derived state in which an exact candidate is both conformant and release-ready with every required human approval already recorded; publication remains a separate maintainer action.
_Avoid_: Release approval, automatic publication

**Reference Mac** (historical):
The named Mac used for protected visual and characteristic-feel comparisons, with its actual hardware, operating system, display, settings, build, content, and tool metadata captured per Verification Run.
_Avoid_: Supported Mac, golden machine

**Behavior Catalogue** (historical):
The complete evidence-backed index of player-observable Reference Build content and behaviour, including its coverage and explicitly bounded uncertainties.
_Avoid_: Feature list, walkthrough

**Catalogue Entry** (historical):
One stable player-observable content or behaviour identity in the Behavior Catalogue, independent of its current interpretation or domain classification.
_Avoid_: Behavior Case, reference fact

**Acceptance Envelope** (historical):
The evidence-backed bounds within which an observable may vary without changing the preserved game.
_Avoid_: Close enough, tolerance guess

**Repairable Artifact** (historical):
A reproducible C64 hardware or software effect demonstrated not to have material player impact and therefore eligible for a governed repair.
_Avoid_: Obvious bug, free fix

**Departure Record** (historical):
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

**Reconstructed Payload** (historical):
An immutable dataset or content artifact derived from Restricted Material for use by the Independent Implementation, governed separately from application code.
_Avoid_: Asset dump, extracted ROM data
