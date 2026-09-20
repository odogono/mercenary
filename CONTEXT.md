# Mercenary Remake

This context defines the shared language for recreating Novagen's _Mercenary: Escape from Targ_ as a browser game. The browser implementation is canonical; the accepted macOS implementation is frozen at `trace-oracle-last-good` as the Trace Oracle (see ADR 0019).

Terms marked **(historical)** name concepts retained only for reading frozen project records. They remain accurate for those records but are not used for new implementation work; ADR 0014 governs the verification-era terms among them.

## Language

**Data Payload**:
The single collection of game data re-extracted from the Reference Build by this project's own tooling, loaded by the app at runtime and tracked in this private repository (ADR 0029).
_Avoid_: Asset folder, resources, ROM data

**Benson Script**:
An original game-logic program from the Reference Build's in-game interpreter, re-extracted into the Data Payload in a structurally preserved re-encoding of its bytecode, and executed by this project's own interpreter through the Host Callout.
_Avoid_: Game script, event code, AI logic, bytecode dump

**Benson Message**:
One complete occurrence of text composed by Benson-governed play, retained whole for occurrence tracking and the transcript independently of which of its characters currently occupy the Benson Display. Repeated identical text is a distinct occurrence; shell notices and visible cell fragments are not Benson Messages.
_Avoid_: Shell notice, message fragment, console output

**Benson Display**:
The Gameplay Session's persistent row of exactly 23 character cells through which Benson Messages move from right to left in the Reference Build's recovered 50 Hz bursts and `$E1` pauses. It is one shared display shown by both Benson Panel Renditions and the communications strip; Arrival Narration and Browser Shell notices may cover those surfaces but never alter its cells.
_Avoid_: Message ticker, visible Benson Message, narration line, shell notice

**Damocles Display**:
The persistent 48-cell message row of a Damocles Gameplay Session, over which a new message scrolls and whose last contents remain until another message replaces them. It remains visible when no message is holding script execution and is distinct from Targ's Benson Display.
_Avoid_: Benson Display (for Damocles), message gate, shell notice

**Craft Parameter Block**:
The set of values that makes one craft handle as it does—its control routine and its rates, limits, and gains—re-extracted into the Data Payload as plain numbers and selected by the craft the player currently occupies; a landed craft taxis on a block of its own, while a player on foot runs a separate fixed-step mover rather than this loop (ADR 0016).
_Avoid_: Flight profile, craft config, tuning block, vehicle stats

**Mover**:
One of the two movement routines the Reference Build has, selected by Occupancy: the control loop a craft is flown by, running over its Craft Parameter Block, or the fixed step and fixed turn a player takes on foot. Underground it is always the on-foot one, whatever the surface would have selected. There are two because the original has two, so a third would be a departure rather than a port (ADR 0016).
_Avoid_: Movement system, physics, character controller, integrator

**Gameplay Session**:
The single owner of one play session's Session State, through which every change to it passes; it presents the Host Callout's view of that state rather than keeping a second copy, and hands out a Session Snapshot for anything that draws.
_Avoid_: Game manager, world state, controller, store

**Location**:
Which space the player occupies — the surface, or one identified Room. The surface is a Location in its own right and not a Room.
_Avoid_: Position, place, level, zone

**Room**:
One enclosed underground space, with its own wireframe, its own local coordinates and its own openings, shown on its own — the Reference Build draws one Room at a time rather than a neighbourhood. The surface is not a Room.
_Avoid_: Level, chamber, interior, zone, area

**Occupancy**:
What the player is currently inside, being either on foot or aboard one identified craft.
_Avoid_: Vehicle state, mount, mode

**Object Residence**:
Where one object currently is: on a surface, in an interior, carried by the player, or out of the world, including the place it was left after being moved. In Targ an interior is a Room; in Damocles a placed object belongs to a Body and, where applicable, a structure region, independently of which Body or structure the player currently occupies.
_Avoid_: Object position, inventory flag, room membership

**Carried Stack**:
The ordered objects the player carries, most recently acquired first; its head is the object the panel names and the one a Drop removes. The player chooses that object by rotating the stack, so the next Drop is not a function of acquisition order.
_Avoid_: Ordered inventory, carry order, inventory list

**Session Snapshot**:
One consistent presentation-facing description of a Gameplay Session at a single moment, complete enough to draw from and to compare against another, which every renderer consumes instead of reading the session's parts; it is not the restore-complete Save Snapshot.
_Avoid_: View model, game state, render state, Save Snapshot

**Save**:
A player-created record kept by the Browser Shell, containing one Save Snapshot together with the identity needed to decide whether it can be restored into the current game.
_Avoid_: Save file, checkpoint, autosave

**Session Resume**:
The Browser Shell's automatically maintained record of the current Gameplay Session, one per Title, retained until New Game so that returning in the same browser can continue play. It has at most one active browser-page owner, is not a player-created Save, and never occupies or overwrites a Save slot.
_Avoid_: Autosave, Save, recovery slot, checkpoint

**Save Snapshot**:
The complete serializable description of one Gameplay Session's Session State at a single moment, sufficient to restore the same playable moment and deterministic future behaviour.
_Avoid_: Session Snapshot, runtime snapshot, game data

**Doorway**:
One opening belonging to a single Room, carrying the Room Link it leads along, whatever it demands before it opens, and where in the destination it puts the player; two Rooms that face each other have a Doorway each rather than sharing one.
_Avoid_: Portal, door, exit, connection

**Room Link**:
The directed connection a Doorway leads along, from the Room that owns the Doorway to one destination — another Room, or out of the underground to the Colony Craft. A Room Link in one direction implies nothing about the other direction.
_Avoid_: Edge, adjacency, neighbour, two-way link

**Rewired Room**:
A Room whose Doorway leads somewhere chosen on arrival rather than somewhere fixed, from a set of alternatives the Room carries; which alternative applies is decided either at random or by the Room the player arrived from.
_Avoid_: Teleporter, dynamic exit, patched room

**Colony Craft**:
The vessel high above the middle of the surface, and the destination of the one Doorway that leads out of the underground rather than to another Room. Reaching it remains part of Targ's play and never loads Damocles.
_Avoid_: Orbital station, mothership, the surface, Damocles transition

**Wall Contact**:
The state of having been pushed back inside a Room by its own bounds on the current frame, counted per axis; it is the precondition for taking a Doorway, not merely a consequence of arriving at one.
_Avoid_: Collision, blocked, wall hit

**Step Interlock**:
The number of walking steps that must pass after arriving somewhere before another Doorway can be taken; it counts only while the player is walking, so it cannot be spent by standing still.
_Avoid_: Cooldown, debounce, timer

**Room Transition**:
The interval after arriving in a Rewired Room during which no Doorway can be taken and the border shows a colour from the transition ramp; ordinary arrivals have none.
_Avoid_: Fade, loading, teleport delay

**Lift Journey**:
The travel interval between a surface entrance and its Room. During descent the destination Room can already govern Benson Scripts and Object Residence before the visible scene changes, while the recovered camera, split, palette, and sound phases continue until arrival.
_Avoid_: Elevator animation, Room Transition, instant teleport

**Indoor Scene**:
How the Room the player is in looks at this moment — its two backdrop colours, the colour its wireframe is drawn in, and whether it is dark — which depends on play rather than on the Room alone.
_Avoid_: Room palette, lighting, theme

**PresentationEvent**:
Something that happened in a Gameplay Session which only presentation should answer — a tone, a script effect, a touchdown, an arrival, Wall Contact, or a world flip — while Session State remains the session's own.
_Avoid_: sound event, UI notification, side effect

**Sound Cue**:
One player-observable audible occurrence whose identity, association, and timing are independent of browser synthesis and which never changes Session State.
_Avoid_: audio event, sound effect file, gameplay trigger

**Flipped World**:
The state in which the world is mirrored left for right, entered and left by arriving in one particular Room; the mirror applies to the view and to the controls together, so the player steers mirrored as well as seeing mirrored.
_Avoid_: Inverted, reversed room, mirror mode

**Host Callout**:
The explicit seam through which a Benson Script reaches the engine, comprising the named engine state it may read and write and the effects it may ask the host to perform; it is the only path between game logic and the rest of the app, and the boundary an eventual scripting layer replaces.
_Avoid_: Script API, engine hooks, bridge

**Reference Disassembly**:
The community-maintained annotated disassembly of the Reference Build, consumed as unlicensed reference documentation only — read for structure and locations, never copied into code or the Data Payload.
_Avoid_: Source code, upstream, dependency

**Reference Build**:
The Commodore 64 edition of _Mercenary: Escape from Targ_, used as the authority for the original world's data and game behaviour.
_Avoid_: Canonical ROM, original version

**Faithful Remake**:
A recreation evaluated by the Fidelity Contract that preserves the Reference Build's world, geometry, mechanics, progression, economy, encounters, and wireframe visual language, except for necessary least-divergent alternatives accepted through public Departure Records, while fitting naturally into the Browser Shell.
_Avoid_: Port, remaster, emulator

**Mac Adaptation (historical)**:
A separable macOS-platform accommodation—such as input, display scaling, windowing, audio plumbing, or save handling—that remained within the applicable Acceptance Envelopes and did not alter the preserved semantic baseline.
_Avoid_: Gameplay improvement, modernization

**Game Surface**:
The game-owned presentation region containing the world view, status information, prompts, and gameplay feedback whose observable behaviour is governed by the Fidelity Contract.
_Avoid_: Viewport, game UI

**Native Shell (historical)**:
The macOS-owned experience that surrounded the Game Surface, including windows, menus, settings, help, file interaction, and host feedback.
_Avoid_: Host UI, Mac shell

**Web Adaptation**:
A separable browser-platform accommodation—such as key bindings, canvas sizing, frame pacing, or payload delivery—that leaves the preserved semantic baseline unchanged.
_Avoid_: Browser hack, web tweak, responsive mode

**Browser Shell**:
The browser-owned experience surrounding the Game Surface, including the page, its canvas, controls help, settings, and host feedback.
_Avoid_: Web UI, page chrome, wrapper

**Presentation Preset**:
The Browser Shell's named choice between Authentic presentation, which retains the accepted Reference Build appearance, and Enhanced presentation, which admits explicitly authored visual additions without changing Game Semantics.
_Avoid_: Graphics mode, theme, sky toggle

**Targ Orrery**:
The deterministic Enhanced-presentation model of Targ's sun, two moons, twilight and night, advancing with presentation elapsed time supplied either by a Gameplay Session or by the sessionless Flyover unless the Shell Console applies a presentation-only local-time adjustment; its twilight includes an authored horizon-to-zenith colour change that follows the world's horizon.
_Avoid_: World clock, day/night system, recovered sky

**Star Sphere**:
The fixed seeded arrangement of stars belonging to the Targ Orrery, seen turning at the sidereal rate rather than regenerated from frame to frame.
_Avoid_: Random stars, particle field, Flyover Backdrop, space backdrop

**Flyover Backdrop**:
The fixed procedural star field shared by every Flyover as inspection dressing in System space, carrying no claim about any System's recovered sky or Body roster.
_Avoid_: Star Sphere, recovered sky, Body roster, random stars

**Interstellar Ship Field**:
The Reference Build's 21-point respawning visual field shown by the Interstellar Ship's handler during the Escape terminal presentation, distinct from ordinary flight and the authored Targ Star Sphere.
_Avoid_: Star Sphere, general particle system, ordinary-flight starfield

**Arrival**:
The authored opening presentation the Browser Shell plays over the held opening Benson Script before active play — star field, descent and crash — recreated by eye from the original releases because the Reference Build's own intro was stripped from the artifact it was cracked from. It is presentation only: never Session State, absent from the Save Snapshot, and skippable to a game identical to the one watching it reaches (ADR 0032).
_Avoid_: Intro cutscene, attract mode, title sequence, Ending

**Arrival Field**:
The authored star field, and the planet growing out of it, that the Arrival's space segment is seen against — distinct from the Targ Star Sphere, the Interstellar Ship Field, and ordinary flight.
_Avoid_: Star Sphere, Interstellar Ship Field, ordinary-flight starfield, space backdrop

**Arrival Narration**:
The Arrival's own message sequence, authored into the Browser Shell and quoted from the original releases because it belongs to the stripped part of the intro and is in no Data Payload. It borrows the message line as a shell notice does and is not a Benson Message: it never reaches the interpreter, the Host Callout, or the message transcript (ADR 0032).
_Avoid_: Benson Message, intro script, opening text

**Departure**:
The authored, shell-owned opening in which the player chooses a Destination — a deep-space star field carrying a carousel of Destinations, and after commitment one seamless journey to the chosen system and world, ending exactly where the Arrival begins. Presentation only: never Session State, absent from the Save Snapshot, played under both Presentation Presets, and skippable to a game identical to the one watching it reaches (ADR 0040).
_Avoid_: Title screen, main menu, game select, launcher, Arrival

**Destination**:
One playable experience a Departure can commit to, named by its system, its world, and where the player will land; only Destinations that exist are offered, a Save belongs to exactly one, and which Destinations exist says nothing about how their content is composed. Every Destination belongs to exactly one Title.
_Avoid_: Title, game, campaign, Content Overlay, level

**Title**:
One original release of the series together with its official expansions, owning one or more Destinations, one of which is its default. Each Title has exactly one address in the Browser Shell, keeps its own Saves and its own Session Resume, and is the unit whose content is loaded when a Destination is committed (ADR 0041).
_Avoid_: Game, app, product, Destination, Content Set

**System**:
One celestial setting containing Bodies and the relationships among them, independent of the Titles and Destinations that refer to it; more than one Title may share a System.
_Avoid_: Title, Destination, world, star map

**Body**:
One physical member of a System whose known identity and placement come from that System's authority, without implying that its type, dimensions, Primary or motion are known.
_Avoid_: World, planet, place, sphere

**Primary**:
The optional Body that another Body is established to revolve around; absence means the relationship is not established, not that the Body revolves around nothing.
_Avoid_: Parent, centre, star, inferred Primary

**Island**:
One authored landmass on a Body in the Flyover, optionally carrying one canonical surface patch; neither a Damocles Place whose recovered kind is `ISLAND` nor a recovered Damocles Island is an Island in this sense.
_Avoid_: Continent, surface map, Damocles place, Damocles Island, level

**Range**:
Which of the Flyover's three scale bands a Camera occupies relative to its nearest Body — Orbital, Coastal or Surface — determining how that Body is presented without changing the Camera's continuous Pose.
_Avoid_: Level of detail, zoom level, scene, mode

**Flyover**:
The shell-owned internal development surface in which a free Camera moves through a System for rendering inspection without a Gameplay Session; it is neither the Game Surface nor a fidelity claim.
_Avoid_: Free-flight mode, spectator mode, Gameplay Session, game viewer

**Trace Oracle**:
The accepted macOS implementation frozen at the annotated `trace-oracle-last-good` tag, together with the deterministic traces it regenerates, held as the tagged equivalence authority that the canonical browser implementation must reproduce rather than as a live implementation (ADR 0019).
_Avoid_: Golden master, reference app, source of truth

**Golden Trace**:
One deterministic, full-precision record of a run the maintainer has accepted, emitted by the Trace Oracle for the canonical implementation to reproduce. Derived from the Data Payload, and tracked beside it so a divergence reads as a diff (ADR 0029).
_Avoid_: Snapshot, baseline, fixture, expected output

**Trace Scenario**:
A named, reviewable description of one run a Golden Trace is emitted from: which emitter, what inputs, and the state it starts in.
_Avoid_: Test case, trace config, run spec

**Replay Gate**:
The check one ported module must pass before the next is ported: it drives the module from a Golden Trace's recorded inputs and requires every asserted value to equal the recorded one exactly. It compares parsed values rather than file bytes, because two languages spell the same number differently and a byte comparison would fail on spelling rather than on behaviour. A module whose gate is not green is not ported.
_Avoid_: Byte comparison, snapshot test, golden master test, regression test

**Game Semantics**:
The fidelity-governed rules and state transitions that determine outcomes and meaningful future state from Semantic Actions and time, independently of the Browser Shell and Web Adaptations.
_Avoid_: Game logic, gameplay layer

**Mission**:
A Benson-script-driven assignment offered by one of Targ's factions, comprising an offer, one or more Objectives, and a resulting reward or world-state consequence. A Mission is never accepted or declined: there is no such state to hold. It is the durable relationship between a briefing, its Objective predicates, and the consequences the Benson Scripts author, and its progress is legible only in what those scripts already own — Object Residence and flags, credits, engine flags, and Ship Delivery. Hearing a briefing commits the player to nothing, and the two factions' Missions are not exclusive of each other.
_Avoid_: Quest, job, Objective, accepted Mission, Mission flag

**Objective**:
One condition within a Mission, such as acquiring, delivering, or destroying something, whose satisfaction advances that Mission.
_Avoid_: Mission, task, goal

**Site**:
One cell of the city the player can destroy from the air, belonging to the Palyar, occupied by the Mechanoids, or neutral between them; a Site is the unit both factions count, so the surface's other structures are not Sites.
_Avoid_: Building, target, structure, block

**Site Ledger**:
The mutable record of what has become of every Site — which are destroyed, and which have already spent their Faction Reaction — carried in a Gameplay Session and in its Save Snapshot rather than recomputed from the world, because play changes it in both directions.
_Avoid_: Destroyed list, damage map, destroyedBlocks, world state

**Faction Reaction**:
The Benson Script one Site dispatches when it is destroyed, chosen by that Site rather than by the faction that owned it; most Sites share one of two generic reactions, and a Site spends its reaction the first time it dispatches, so a Site restored and destroyed again reacts only once.
_Avoid_: Consequence, retaliation, alarm, script trigger

**Gratitude Threshold**:
The point at which one faction's lead in destroyed Sites is large enough that the other faction thanks the player, dispatching its own Benson Script in place of that Site's Faction Reaction; it is reached at most once in a Gameplay Session, whichever faction reaches it first.
_Avoid_: Reputation, faction score, reward tier, standing

**Attack State**:
Whether a hostile craft is presently hunting the player, set by the Benson Scripts and cleared by the encounter ending in either side's favour; it is a single condition rather than a count, so a second attacker cannot be pending behind the first.
_Avoid_: Aggro, alert level, combat mode, attackingShip

**Effect Slot**:
One of the fixed places a Gameplay Session keeps something that lives for a set number of frames and then goes — a shot in flight, the mark of an impact, a hostile craft on its way in. There are a fixed number of them, so what a slot holds is also the answer to whether another can begin.
_Avoid_: Particle, entity, spawn, effect list

**Player Projectile**:
The single shot the player has in flight, fired only from a craft and only on the surface, which ends by striking something, leaving the world, or outliving its frames; a second cannot be fired while the first is still flying.
_Avoid_: Bullet, laser, ammunition, weapon

**Hostile Projectile**:
The shot a hostile craft aims at the player, which ends the same three ways as a Player Projectile and, if it arrives, costs the player their craft or knocks them down on foot — never the Gameplay Session.
_Avoid_: Enemy fire, damage, hit points

**Ship Delivery**:
The state of the Interstellar Ship having been hired and being on its way, from the moment the hire is paid for until the craft has come to rest on the surface. It advances on its own while the player does anything else, and it ends only by the ship arriving; nothing the player does cancels it or hurries it.
_Avoid_: Ship inbound flag, delivery timer, hired Boolean, ETA

**Ending**:
A terminal resolution of a Gameplay Session recognised by the Reference Build, being either an Escape or a Defeat.
_Avoid_: Outcome, game-over state, win state

**Escape**:
A successful Ending in which the player satisfies one decoded route's craft and world-state requirements and leaves Targ.
_Avoid_: Win, victory, orbital transition

**Defeat**:
An unsuccessful Ending produced by a terminal failure recognised by the Reference Build.
_Avoid_: Loss, Game Over, failure state

**Ending Phase**:
How far an Ending's own presentation has got: absent throughout active play, entered the moment the Ending is produced, and advanced once more by the terminal presentation as it matures. It says nothing about which Ending was reached, and an Ending is not resolved twice by advancing it.
_Avoid_: gameComplete, win phase, game-over flag, Ending

**Movement Intent**:
The device-independent held request sampled by a Mover on each simulation step — turning, pitching, walking and running — distinct from persistent state and from a one-shot Semantic Action.
_Avoid_: Key state, held Semantic Action, control event

**Semantic Action**:
A device-independent one-shot player command whose availability, conflicts, ordering, rate limits, and outcomes are governed by Behavior Cases.
_Avoid_: Movement Intent, key press, button press, scan code

**Semantic Mode**:
An evidence-backed Game Semantics state class that determines which Semantic Actions are available, how they conflict, which transitions they cause, and their timing, independently of device bindings and Geometry Identity.
_Avoid_: Control scheme, vehicle identity, input mode

**Handler-Equivalence Class**:
A class of enterable Geometry Identities that share every parameter affecting their Semantic Action surface, conflicts, rate limits, and timing, so one member's proof stands for the whole class.
_Avoid_: Vehicle type, craft class, ship model

**Object-Conditioned Predicate**:
A fidelity-governed rule whose outcome depends on which Geometry Identity is involved, as distinct from the mode-neutral rules that hold whatever the player is interacting with.
_Avoid_: Object rule, per-object logic

**Residence-Conditioned Effect**:
A player-observable behavior selected by one or more objects' Object Residence — carried, in the current Room, in a specified Room, or out of the world — independent of how that Residence was reached. This is a deliberately narrower audit term than Object-Conditioned Predicate.
_Avoid_: Equipment effect, inventory perk, pickup effect

**Control Profile**:
A named set of device-specific bindings that maps physical controls to Movement Intent and Semantic Actions.
_Avoid_: Keymap, input profile

**Accommodation**:
An optional Web Adaptation that improves access through equivalent input or redundant presentation without changing Game Semantics or player-relevant timing.
_Avoid_: Assist mode, accessibility mode

**Display Composition**:
A validated arrangement of the world view, status information, and prompts within the Game Surface that preserves their governed information and behaviour.
_Avoid_: Layout mode, aspect mode

**Benson Panel**:
The authored instrument-panel Display Composition drawn under the world view, presenting the Session Snapshot and the Targ Orrery's authored local time without changing play; hand-recreated presentation rather than recovered behaviour (ADR 0027).
_Avoid_: HUD, status bar, dashboard, cockpit

**Panel Rendition**:
Which visual treatment the Benson Panel wears — Targ or Damocles — changing chrome and typography only, never the gameplay data beneath; the Damocles treatment stays inside ADR 0021's presentation-only exception.
_Avoid_: Skin, theme, variant, panel mode

**Navigation Readout**:
The wide navigation window of the Benson Panel's lower row, which the Reference Build prints as three digits an axis. It is one window showing one of two readouts according to where the player is: the Body Coordinate Readout within a Body, the System Coordinate Readout in space. Which of the two it is currently showing is part of what the window means, so naming a value from it without naming its mode says nothing.
_Avoid_: The coordinates, nav window, position display

**Body Coordinate Readout**:
The Navigation Readout's mode within a Body, naming the player's position on that Body as a Body Coordinate Step an axis: one step is four Surface Cells, a Body spans 1024 steps an axis, and each step prints rescaled from 1024 to 1000. The Damocles Panel Rendition computes it; Targ's stands at nought, having no Body behind it.
_Avoid_: Planet coordinates, moon coordinates, world coordinates, nav digits, System Coordinate Readout

**System Coordinate Readout**:
The Navigation Readout's mode in space, naming the player's own position in the System as a signed coarse cell an axis, x then y then z, each printed as an unsigned magnitude with a negative axis marked in red. Its cell is far larger than the spacing of a Body cluster, so neighbouring Bodies read alike and a reading names a neighbourhood rather than a place. It describes the observer and never a Body: a Body read from below the System's plane reports a negative y though the Body itself lies on it.
_Avoid_: Body Coordinate Readout, Body coordinates, planet coordinates, system position

**Body Coordinate Step**:
The unit of the Body Coordinate Readout, and unrelated to the System Coordinate Readout's much larger cell: `$40000` surface-grid units, which is four Surface Cells, so a 16-cell workspace spans four steps. A Body's surface is 1024 steps an axis, the same 1024-step turn the yaw word counts, and the z axis carries a fixed quarter-turn bias.
_Avoid_: Body cell, coarse cell, planet unit

**Cell Readout**:
The navigation window beside the Navigation Readout, naming the player's Island-Local Cell two digits an axis, a negative axis marked in red and a magnitude past 99 printed as `**`. It is the readout that moves as the player walks, and it is distinct from the Body Coordinate Readout beside it whatever the original's own documentation calls either window. Because it is island-local it names a location only with the island it was read on.
_Avoid_: Grid reference, city coordinates, location coordinates, tile readout, Body Coordinate

**Impact Clock**:
The Damocles Panel Rendition's `HH-MM-SS` window counting what is left before the comet arrives, kept as minus the remaining seconds and spending one of them every twenty VBLs, so a real second costs two and a half of its own. A fresh game is given `04-19-20` of it on the title screen, and the original's scripted arrival has spent an hour and a half of that before the player first stands on Eris. It is Damocles's alone: the Targ rendition's clock is the Targ Orrery's local time, which is not a deadline and does not run out.
_Avoid_: Countdown, comet timer, deadline clock, session clock

**System Menu**:
The Browser Shell overlay opened with Escape that pauses stepping and owns the settings page and the Save chooser; shell chrome, never part of the Game Surface.
_Avoid_: Pause menu, options screen, main menu

**Shell Console**:
The Browser Shell's slide-down development command line, reaching the Gameplay Session's own actions and the stores that own each preference, Save, and adjustable presentation value rather than the state behind them; alone among Browser Shell surfaces it may write play rather than only presenting it, which is why its commands are never part of a trace (ADR 0028).
_Avoid_: Cheat console, terminal, dev overlay

**Initial Release**:
The complete _Mercenary: Escape from Targ_ experience delivered by this effort, with extension seams for _The Second City_ but without that expansion's content; Damocles is out of Initial Release scope and waits until after _The Second City_ (ADR 0021).
_Avoid_: Mercenary 1, base game, Damocles, multi-title release

**The Second City**:
The Commodore 64 expansion of _Mercenary: Escape from Targ_, and the only expansion this remake's Initial Release leaves a Content Overlay seam for.
_Avoid_: Mercenary 2, Damocles, mission disk

**Damocles**:
Novagen's 16-bit sequel (_Mercenary II_), set in the Gamma System after the player has left Targ; not a Content Overlay and not _The Second City_; a Title of this one multi-title Independent Implementation, playable at its own path with no ordering relative to _The Second City_ (ADR 0021, ADR 0043).
_Avoid_: Mercenary 2 (for The Second City), expansion, mission disk, second Independent Implementation

**Gamma System**:
Damocles's multi-body setting as Confirmed in Working-Authority Evidence: a named celestial roster (including DAMOCLES and VOID), packed place labels, and object catalogues — not Targ Location as surface-or-Room.
_Avoid_: Targ world, Location (for Damocles bodies), solar system pack

**Damocles Model**:
One reusable geometric definition recovered from the Working Authority, independent of its name and of the places where it appears. Alternate visual forms remain separately evidenced. Catalogue record families (object, surface assembly, building detail) do not by themselves establish exterior or interior use; building detail can serve both.
_Avoid_: Object instance, Surface Structure

**Damocles Instance**:
One identified occurrence of a Damocles Model in the world, with its own recovered location and orientation; an unknown location is not a placement at the origin.
_Avoid_: Model, mesh

**Damocles Place**:
One named location in Damocles that may contain multiple instances and interiors; a place name alone establishes neither its position nor its contents.
_Avoid_: Model, building shape

**Damocles Island**:
One landmass on a Body in Damocles, recovered as a closed coastline outline placed at its own origin in Body Coordinates and painted in its own land colour. It is not the authored Flyover Island, and it is not the Structure Workspace it selects: an island carries no name of its own, may bind no workspace at all, and a Body may carry many. A Body's surface outside every island is sea in that Body's own base colour.
_Avoid_: Island (for the Flyover sense), continent, landmass patch, workspace, Settlement

**Settlement**:
One named inhabited grouping on a Body, recovered as the named area a Structure Workspace publishes together with the Damocles Places in it. A Settlement may lie on a Damocles Island and does not require one — most Bodies carry a Settlement with no island under it — and an island may carry no Settlement. Whether a given recovered area name names a Settlement or the island it sits on is not established by the name alone.
_Avoid_: City, base, town, Damocles Island, Structure Workspace, area

**Body Coordinate**:
A position on a Body's surface, measured in Surface Cells from that Body's own origin. The surface is 4096 cells an axis and wraps on both, so two Body Coordinates far apart in number may be neighbours, and no Body Coordinate is outside the surface. It is the only address that identifies a location on a Body on its own.
_Avoid_: World coordinate, absolute position, Island-Local Cell, Body Coordinate Step

**Island-Local Cell**:
A Surface Cell counted from a Damocles Island's origin rather than from the Body's, which is what the Cell Readout prints and what a Damocles Place's cell names. It is signed and unbounded, coinciding with the bound Structure Workspace's own cell only while the position is inside that 16-cell window. An Island-Local Cell names a location only together with the island it is local to: the same label on two islands is two different places.
_Avoid_: Surface Cell, cell reference, grid reference, Body Coordinate

**Entrance Attachment**:
One recovered post-plan component of a Damocles Model, allocated its own attachment slot counting down from `$03FC`, whose control word is its Attachment Constructor. While the Pose is inside that attachment's Proximity Box, each moving leaf advances one model unit per tick until it stands eight units inside its outer edge; outside the box the leaves return and re-close. The leaves stay in the region queue for the whole motion, and a region naming the slot is selectable only at the fully-open endpoint. Capital Spaceport's `$4200` two-leaf X entrance and STATE OFFICE's `$8200` two-leaf Z entrance are two members of one family, not two mechanisms.
_Avoid_: Doorway, detail door face, Entrance Latch, spaceport door

**Attachment Constructor**:
The recovered reading of an Entrance Attachment's control word: its sign selects the motion and region-inset axis (X or Z), bit 9 selects one or two leaves, and bit 8 selects which side a single leaf moves from. It names how the closed rectangle becomes leaves; it is not the live latch that says where they currently stand.
_Avoid_: Door type, control flags, attachment kind

**Proximity Box**:
The recovered lower-inclusive, upper-exclusive model-local X/Z bounds carried by each Entrance Attachment and tested by the Working Authority against the Pose; Capital Spaceport's entrance carries X 1200–1600, Z −1200–−200, and STATE OFFICE's carries X 100–500, Z −200–0.
_Avoid_: Trigger radius, doorway bounds, collision box

**Region Gate**:
What a recovered structure region requires before it can be selected: nothing, a named attachment slot's fully-open latch, or the reserved `$0200` unconditional passage. The gate is read from the region's own flags; a passage carries no attachment and no open endpoint.
_Avoid_: Door flag, region mask, collision layer

**Floor Table**:
The twelve bytes in a scaled Surface Structure's alias record naming which structure each of its levels binds, zero where a level has no floor. The level indexes it; the storey pitch in the same record gives that floor its height. Level 0's entry is the ground bind.
_Avoid_: Storey list, floor map, level index

**Structure Workspace**:
The single bound current-cell Damocles Instance whose plan, attachments and regions the Working Authority holds live. Region selection, the selected-region ±11 eye clamp and plan drawing apply only while the Pose is in the central half of that cell on both axes; attachment motion is deliberately broader and may finish re-closing that instance's leaves outside it.
_Avoid_: Active structure, current building, bound model

**Entrance Latch** (historical):
The #237 Gameplay Session boolean that opened Capital Spaceport's Entrance Attachment on first entry to the Proximity Box and never cleared. Recovered motion uses the live RAM latch `$5E3D` (`$00` closed, `$01` moving, `$FF` fully open) and re-closes outside the box; the session stores that progress as open units, not this sticky flag.
_Avoid_: Doorway state, proximity state

**Plan Refusal** (historical):
The #237 authored post-Mover test against vertical plan segments and the closed Entrance Attachment. Recovered pushback is a selected-region XZ AABB clamp after the Mover, with neighbour handoff on a shared face; it is not Wall Contact.
_Avoid_: Wall Contact, collision system, Mover

**Damocles Catalogue**:
The read-only collection of recovered Damocles Models, Instances, Places, visual variants, and their evidence, including explicit gaps in recovery; the Damocles Gameplay Session reads it as Data Payload but it is not that session.
_Avoid_: Gameplay Session, Damocles world, level data

**Damocles Script**:
A program from Damocles's successor 16-bit bytecode VM Confirmed in the Working Authority, distinct from a Benson Script and from the C64 Benson encoding (ADR 0015).
_Avoid_: Benson Script (for Damocles), game script, ST bytecode dump

**Filled Presentation**:
Damocles's filled-polygon, palette-driven world view Confirmed in Working-Authority Evidence; the Game Surface mode of the Damocles Gameplay Session, distinct from Targ's wireframe line-list Game Surface (ADR 0019, ADR 0043).
_Avoid_: Wireframe view, remastered graphics, Departure Record

**Cast Shadow**:
The Enhanced-presentation darkening of a Filled Presentation face standing between the authored sun and another face, drawn with either a soft or a hard edge at the player's choice; Authentic presentation never draws one.
_Avoid_: Shading, ambient occlusion, lighting toggle

**Working Authority**:
The Damocles Atari ST program image, together with its pinned laboratory machine and TOS configuration, used as the authority for Damocles research; distinct from the C64 Reference Build.
_Avoid_: Reference Build (for Damocles), canonical ST ROM

**Working-Authority Evidence**:
Behaviour observed in the running Working Authority, or data decoded directly from it; when Damocles sources disagree, this outranks manuals and other 16-bit editions for that research programme, and is not Authoritative Evidence.
_Avoid_: Authoritative Evidence (for Damocles), port behaviour, manual intent

**Working Disassembly**:
Targeted, question-driven disassembly of the Working Authority's unpacked program image, produced by this project for one named research question; its text and any analysis project are untracked Restricted Material, and only the decoded facts enter tracked research notes with Research Provenance. Read for structure, never copied or translated (ADR 0002); not the community C64 Reference Disassembly.
_Avoid_: Reference Disassembly (for Damocles), source code, disassembly snapshot, MDDClone

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
_Avoid_: Save, Save Snapshot, runtime snapshot, game data

**Transition Log** (historical):
The authoritative ordered history of committed Game Semantics outcomes from which Session State is derived.
_Avoid_: Input recording, debug log, event telemetry

**Independent Implementation**:
New application code written without incorporating or mechanically translating the Reference Build's or Working Authority's program code, intended to support public distribution; this programme's destination is one multi-title Independent Implementation that can host _Escape from Targ_ and later Damocles (ADR 0021), not a separate Damocles remake body.
_Avoid_: Source port, ROM wrapper, second Independent Implementation (for Damocles)

**World Geometry Dataset**:
A lossless, provenance-backed representation of the Reference Build's object models, vertices, edges, instances, transforms, coordinate systems, layouts, bounds, identities, and visibility rules.
_Avoid_: Mesh dump, model pack

**Surface Cell**:
One addressed region of the surface, used as the unit for placing a Surface Structure and accounting for any Site there.
_Avoid_: Grid cell, tile

**Surface Structure**:
One reusable wireframe definition placed in one or more Surface Cells, distinct from Map Lines and from movable object geometry.
_Avoid_: Building, model, cell geometry

**Structure Reach**:
Which Surface Cells contribute Surface Structures to the view: only the occupied Surface Cell, as in the Reference Build, or the whole surface as Enhanced presentation.
_Avoid_: Building reach, draw distance, render radius

**Distant Structure**:
A Surface Structure shown from a Surface Cell other than the one the player occupies, subdued so it reads behind the occupied cell's structure.
_Avoid_: Background building, far model, level of detail

**Geometry Identity**:
A stable, Research Provenance-backed identity for an entity in the World Geometry Dataset that remains valid when its interpretation or name changes.
_Avoid_: Object name, canonical name

**Pose**:
Where a Camera is and how it is turned at one moment — a position, a heading, a pitch and a roll — named on its own so a single view can be asked for, recorded and compared without a session behind it.
_Avoid_: Position, viewpoint, snapshot, camera state

**Camera**:
What turns the world into a view for one Pose, together with its near limit and any explicitly imposed far limit.
_Avoid_: View, eye, transform, matrix

**Reference Viewport**:
The Reference Build's own 160×136 logical projection and 320×136 physical-pixel geometry — its centre and the fact that each logical horizontal coordinate is two pixels wide — mapped into the rendered frame. Ordinary and Distant Structure lines are clipped to the output frame's border before screen coordinates narrow to binary32; Far Points retain their separate rule.
_Avoid_: Screen size, resolution, canvas, aspect ratio, camera frustum, Game Surface

**Ink**:
Which of the wireframe's two drawing passes a line belongs to, dim or bright; the Reference Build splits a structure's edges between them and the difference is part of the visual language rather than a shading effect.
_Avoid_: Colour, brightness, shade, layer

**Screen Line**:
One world segment after projection: two screen coordinates and the Ink it is drawn in. It says what to draw and nothing about how to draw it.
_Avoid_: Edge, stroke, vector, polyline

**Far Point**:
An object outside its detailed reach whose distant form is one point rather than its wireframe; at or above the eye it remains eligible at any range, while below the eye it remains eligible only within Horizon Distance.
_Avoid_: Dot, sprite, level of detail, billboard

**Horizon Distance**:
The altitude-derived reach across Surface Cells within which Map Lines are selected and a below-eye Far Point remains visible; at high altitude it encompasses the whole surface.
_Avoid_: Far plane, draw distance, view distance

**Road Workspace**:
The occupied Surface Cell's road endpoints made available to its Surface Structure, allowing structure lines to continue to the junctions those roads reach.
_Avoid_: Deferred vertices, synthetic geometry, road mesh

**Map Lines**:
The surface's roads and runways, selected for a position and an altitude from the Reference Build's own tables rather than from the structures standing near the player.
_Avoid_: Roads, terrain, ground detail, map overlay

**Visibility Selector**:
What decides which of the world's geometry is worth projecting for one Pose, before anything is projected: the selected Surface Structures, the Map Lines for where the player is, and the objects present — or, underground, one Room and the things standing in it.
_Avoid_: Culler, frustum culling, scene graph, filter

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
