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

**Talk Script**:
A game-logic program written by this project in NorthTalk, driving play through the World Port. It is maintained source rather than a re-extraction: a Talk Script may replace a Benson Script's role without reproducing its behaviour, and the Benson Script remains the reference it was written against.
_Avoid_: NorthTalk script, Benson Script (for a rewrite), mod

**World Event**:
A completed change in play that the Gameplay Session announces to Talk Scripts, with named subjects, even when a later change undoes it; temporary bookkeeping within an operation is not a World Event. Surface Region events reach only the region's owning Talk Script, while other World Events are broadcast; Talk Scripts wait for these changes rather than polling the world.
_Avoid_: PresentationEvent (that drives presentation, not logic), trigger, notification

**Step**:
One frame of play, or one operation outside a frame such as a Take, a key of Player Input or a console move. A step's World Events are delivered to Talk Scripts, and what those reactions change is delivered in turn, before the step returns, so a Save never holds unfinished reactions.
_Avoid_: tick (for an operation outside a frame), settle call

**Reaction Budget**:
The limit on Talk execution fuel and delivered World Events that one step's reactions share. A step that exhausts it stops the Gameplay Session rather than deferring the rest; it is not a Faction Reaction.
_Avoid_: timeout, frame budget

**Player Input**:
A key press no Binding takes, passed to Talk Scripts by name (`"Y"`, `"Q"`) as a message. Controls never reach a Talk Script. Player Input goes to the Input Owner, or to every Talk Script when there is none. It is not a World Event: it isn't a change in play.
_Avoid_: key event, keystroke, World Event (for a key press)

**Input Owner**:
The Talk Script Run whose prompt is the latest one showing or shown and whose Run hasn't ended. It alone receives Player Input; when its Run ends, the input passes back to the prompt before it.
_Avoid_: focus, key owner

**Benson Message**:
One complete occurrence of text composed by Benson-governed play, retained whole for occurrence tracking and the transcript independently of which of its characters currently occupy the Benson Display. Repeated identical text is a distinct occurrence; shell notices and visible cell fragments are not Benson Messages.
_Avoid_: Shell notice, message fragment, console output

**Benson Display**:
The Gameplay Session's persistent row of exactly 23 character cells through which Benson Messages move from right to left in the Reference Build's recovered 50 Hz bursts and `$E1` pauses. It is one shared display shown by both Benson Panel Renditions and the communications strip; Arrival Narration and Browser Shell notices may cover those surfaces but never alter its cells.
_Avoid_: Message ticker, visible Benson Message, narration line, shell notice

**Damocles Display**:
The persistent 48-cell message row of a Damocles Gameplay Session, over which a new message scrolls and whose last contents remain until another message replaces them. It remains visible when no message is holding script execution and is distinct from Targ's Benson Display. A message longer than the row is shown 48 cells at a time, and a document body a Read shows is drawn in the row's second colour, the panel's light blue, rather than the green of every other message.
_Avoid_: Benson Display (for Damocles), message gate, shell notice

**Craft Parameter Block**:
The set of values that makes one craft handle as it does—its control routine and its rates, limits, and gains—re-extracted into the Data Payload as plain numbers and selected by the craft the player currently occupies; a landed craft taxis on a block of its own, while a player on foot runs a separate fixed-step mover rather than this loop (ADR 0016).
_Avoid_: Flight profile, craft config, tuning block, vehicle stats

**Mover**:
One of the two movement routines the Reference Build has, selected by Occupancy: the control loop a craft is flown by, running over its Craft Parameter Block, or the fixed step and fixed turn a player takes on foot. Underground it is always the on-foot one, whatever the surface would have selected. There are two because the original has two, so a third would be a departure rather than a port (ADR 0016).
_Avoid_: Movement system, physics, character controller, integrator

**Gameplay Session**:
The single owner of one play session's Session State, through which every change to it passes; it implements the World Port on that state rather than keeping a second copy, and hands out a Session Snapshot for anything that draws.
_Avoid_: Game manager, world state, controller, store

**Location**:
Which space the player occupies — the surface, or one identified Room. The surface is a Location in its own right and not a Room.
_Avoid_: Position, place, level, zone

**Room**:
One enclosed underground space, with its own wireframe, its own local coordinates and its own openings, shown on its own — the Reference Build draws one Room at a time rather than a neighbourhood. The surface is not a Room.
_Avoid_: Level, chamber, interior, zone, area

**Occupancy**:
What the player is currently inside, being either on foot or aboard one identified resident object that admits them — in Targ always a craft, in Damocles a craft or a seatable object.
_Avoid_: Vehicle state, mount, mode

**Vehicle Key**:
The resident object a Damocles craft demands before it admits the player. Each craft has its own, which need not be named for it; the craft admits the player only while its Vehicle Key is in the Carried Stack, and boarding does not consume it.
_Avoid_: Unlock, craft key, permission, key flag

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

**Line Colour**:
The colour a scene draws a Targ object's uncoloured lines and faces in: the Indoor Scene's wireframe colour in a Room, white Ink on the surface. A Targ object may also carry authored colours, which replace it primitive by primitive.
_Avoid_: Room palette, default colour, object palette

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
The explicit seam through which a Benson Script reaches the engine, comprising the named engine state it may read and write and the effects it may ask the host to perform. Live play no longer has one: Talk Scripts use the World Port, and only the test oracle keeps a Host Callout, for its interpreter tests (#924).
_Avoid_: Script API, engine hooks, bridge

**World Port**:
The named operations through which a Talk Script reads and changes the world — what is carried and where objects lie, the player's Room and craft, credits, an object's armed or fixed state, the ending, and the ships sent — implemented by the Gameplay Session on its own state. It replaces the Host Callout for Talk Scripts; names are translated to slots on the Talk side, so the session never sees Talk vocabulary.
_Avoid_: world API, Host Callout (for Talk Scripts), bridge

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
The browser-owned experience surrounding the Game Surface, including the page, its canvas, the Controls Page, settings, and host feedback.
_Avoid_: Web UI, page chrome, wrapper

**Frame Planner**:
A Title's account of what one view contains and the order in which it is painted, governed by that Title's recovered visibility, geometry and palette rules.
_Avoid_: Shared scene planner, renderer, Gameplay Session

**Frame Description**:
One Title-planned view's ordered polygons, lines and points, with their projection, colours and sources, shared by its Authentic and Enhanced presentations. It describes the view alone, independently of the Gameplay Session and the instrument panel.
_Avoid_: Session Snapshot, scene graph, screen capture, Frame Planner

**Presentation Preset**:
The Browser Shell's named choice between Authentic presentation, which retains the accepted Reference Build appearance, and Enhanced presentation, which admits explicitly authored visual additions without changing Game Semantics. The settings page labels it PRESENTATION in every Title.
_Avoid_: Graphics mode, theme, sky toggle, sky preset

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

**Damocles Starfield**:
The Damocles Working Authority's own stars: one recovered list of 1,600 screen-space stars that the frame loop scrolls by yaw and pitch, shears by roll in flight, and plots one ST pixel each before the sky Bodies. It is drawn by night, on a Body with no atmosphere, and always in space. It is a scrolled band of pixels, not a sphere of directions, and it names no star.
_Avoid_: Star Sphere, Flyover Backdrop, star catalogue, sky dome

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

**Wish**:
A Damocles BOOK page's action, granted when the player reads the page while carrying the MAGIC CRYSTAL, which every Wish consumes. Two pages are the cheapest ways to save ERIS; the others give an object, credits, more time, colour, a hint or a refusal. A Wish is not an Ending: what follows is an ordinary Damocles Script and play carries on.
_Avoid_: Spell, BOOK ending, magic

**Destroyed Body**:
A Damocles Body marked as destroyed by the endgame: absent from the sky, Atlas and arrival scan, with objects associated to it removed from play. A player standing on it enters the Damocles Death State.
_Avoid_: Removed Body, missing Body

**Detonator**:
One of the four disguised Damocles switches, the SIDEBOARD, CUPBOARD, HI-FI and WASHBASIN, whose panels read NOVA TRIGGER 1 to 4. Opened at the head of the Carried Stack, Next switches it on and Previous off. The switch stays on when the object is put down, and when all four are on the NOVABOMB destroys the Body it rests on, wherever that is, or the player's own Body and the player if it is carried.
_Avoid_: Trigger, nova switch, fuse

**Timed Detonator**:
The Damocles object that arms the EXPLOSIVEs, and a separate thing from the four Detonators. Opened at the head of the Carried Stack, its panel takes a keypad digit as the charge and Next and Previous as the fuse, in 5-second steps up to 595 seconds. Read arms the EXPLOSIVE then at the head of the Carried Stack, and Read again on that EXPLOSIVE disarms it. While one is armed the panel counts its fuse down and takes no other key. When the fuse runs out the EXPLOSIVE goes off, clearing what lies within its reach, and the reach doubles with each step of the charge. Carried, it kills the player; placed, it kills a player within its reach. A small blast that catches the NOVAGEN SAFE opens the safe rather than clearing it, and a full-charge blast that clears seven more EXPLOSIVEs destroys the Body.
_Avoid_: Detonator, bomb timer

**Unravelling**:
The Damocles endgame that follows the AUTHORS COMPUTER's destruction, with DION or in a blast: every Body in turn, from DAMOCLES down to DIALIS, is destroyed a debris lifetime apart, and the 30th destruction reports the demise of the whole System. A player standing on a Body when its turn comes dies with it; only a player in space sees it through.
_Avoid_: Collapse, universe end, apocalypse

**Primary**:
The optional Body that another Body is grouped under in a System's drawn hierarchy; absence means the grouping is not established, not that the Body stands alone. It names how a System organises its Bodies for presentation and naming, and asserts no revolution: in Damocles the recovered System is static apart from its comet, so a Body's Primary is not something it goes round.
_Avoid_: Parent, centre, star, inferred Primary, orbit, revolution

**Body Rotation**:
The rate at which a Body turns about its own axis, together with the **Body Day** it implies — the time for one full turn. It is the only motion a recovered System may attribute to a Body that is not the Body moving: it turns the Body's surface frame under a System frame that stays put, so a sun or moon crossing a surface sky is the observer's own Body turning. A Body Day is a duration, not a clock the game shows.
_Avoid_: Orbital period, revolution, day/night cycle, spin rate, phase

**Body Time**:
Local solar time at an observer on a Body, scaled to a 24-hour face whatever the Body Day's real length: 12:00 is when the sun stands over the observer's longitude, and 00:00 is opposite it. Its reading changes as the observer travels east or west.
_Avoid_: Body Day, Impact Clock, panel clock

**Island**:
One authored landmass on a Body in the Flyover, optionally carrying one canonical surface patch; neither a Damocles Place whose recovered kind is `ISLAND` nor a recovered Damocles Island is an Island in this sense.
_Avoid_: Continent, surface map, Damocles place, Damocles Island, level

**Range**:
Which scale band a view occupies, determining what is presented without changing the view's continuous Pose. The Flyover has three, named relative to a Camera's nearest Body — Orbital, Coastal or Surface. The Atlas has five — System, Body, Coastal, Settlement and Street — of which System is the whole Gamma System and the other four are bands within one Body rather than a hierarchy, because Damocles Islands and Settlements do not nest.
_Avoid_: Level of detail, zoom level, scene, mode

**Flyover**:
The shell-owned internal development surface in which a free Camera moves through a System for rendering inspection without a Gameplay Session; it is neither the Game Surface nor a fidelity claim.
_Avoid_: Free-flight mode, spectator mode, Gameplay Session, game viewer

**Atlas**:
The shell-owned sessionless map surface presenting the Gamma System and its Bodies top-down, continuously across its Ranges from the whole System down to structure footprints, drawing only recovered content or content explicitly labelled derived or authored, and showing what is not recovered as a gap. It can select an Atlas Pin and request Atlas Travel without owning play. It is neither the Game Surface nor a fidelity claim.
_Avoid_: Map mode, Game Surface, Flyover, Catalogue marker map, world map

**Atlas Pin**:
One selected point on a Body's surface, independent of the player's position.
_Avoid_: Location, player marker, waypoint collection

**Atlas Travel**:
An authored exploration action that moves the player and any occupied object to an Atlas Pin within the same Gameplay Session, without a journey or passage of game time.
_Avoid_: Vehicle travel, recovered travel, new session

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
The device-independent held request sampled by a Mover on each simulation step — turning, pitching, walking, strafing and running — distinct from persistent state and from a one-shot Semantic Action.
_Avoid_: Key state, held Semantic Action, control event

**Strafe**:
A sidestep on foot, perpendicular to the heading at the walk step, which neither original has. It belongs to the on-foot Mover rather than making a third one: it meets every refusal, gate and trigger that walking does, running scales it, and walking and strafing together go no faster than walking alone. It is offered only when the player opts into it.
_Avoid_: Sidestep, lateral walk, slide

**Semantic Action**:
A device-independent one-shot player command whose availability, conflicts, ordering, rate limits, and outcomes are governed by Behavior Cases.
_Avoid_: Movement Intent, key press, button press, scan code

**Head Command**:
One of the four Damocles Semantic Actions — Open, Read, Next, Previous — that the Reference Build binds to the numeric keypad's Enter, `*`, `+` and `-`. Only Open acts on the object at the head of the Carried Stack: on most objects it does nothing, and on one of the documents it opens that document on the Benson Panel's centre box. Read, Next and Previous act on the document already open, whatever the head has rotated to since, and only dropping the open object closes it. On a Detonator's panel Next and Previous switch it on and off, and Read does nothing. The AUTHORS COMPUTER opens only while the player is seated on the AUTHOR'S CHAIR; on its panel the keypad digits pick a parameter, Next and Previous step its value, and Read destroys the numbered Body in parameter 4. On the Timed Detonator's panel a digit sets the charge, Next and Previous step the fuse, and Read arms the EXPLOSIVE at the head or disarms the one armed. The NOVAGEN SAFE opens only after a small blast has caught it.
_Avoid_: Keypad command, object command, document controls, read key

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
A named set of device-specific Bindings that maps physical controls to Movement Intent and Semantic Actions.
_Avoid_: Keymap, input profile

**Binding**:
One physical control that a Control Profile maps to a Movement Intent or a Semantic Action, holding in every Occupancy or in only one.
_Avoid_: Key mapping, shortcut, hotkey

**Controls Page**:
The System Menu page that lists the active Control Profile's Bindings for the current Title, grouped by Occupancy, with the Occupancy the player is in marked.
_Avoid_: Keymap screen, help overlay, key reference, controls help

**Accommodation**:
An optional Web Adaptation that improves access through equivalent input or redundant presentation without changing Game Semantics or player-relevant timing.
_Avoid_: Assist mode, accessibility mode

**Extension**:
An opt-in gameplay addition that the original never had and that may change what the player can do or see, off in faithful play and never carried by a Save; unlike an Accommodation it is not equivalent input. Strafe and Free Look are Extensions, and so is Targ's run.
_Avoid_: Modernization, enhancement, mod, Departure

**Extended Controls**:
The one player setting that turns on the Strafe and Free Look Extensions together. It is a Browser Shell preference, not Session State, so turning it on or off leaves every Save as it would have been.
_Avoid_: Modern controls, FPS mode, advanced controls

**Free Look**:
Tilting the Pose's pitch up and down on foot, which neither original allows, within a fixed limit and at a fixed rate; the view stays where it is left. Everything that reads the Pose follows it, picking included. The pitch returns to level on boarding, on leaving, on a Location change, at the Arrival, and when Extended Controls is turned off. A Save never carries it, so a loaded Save starts level. Aboard, pitch is the craft's own attitude and Free Look does not apply.
_Avoid_: Mouse look, camera look, head tilt

**Display Composition**:
A validated arrangement of the world view, status information, and prompts within the Game Surface that preserves their governed information and behaviour.
_Avoid_: Layout mode, aspect mode

**Benson Panel**:
The instrument-panel Display Composition beneath the world view, presenting the Gameplay Session's readouts without changing play. Targ's uses recovered ST presentation over authored C64 readout adapters (ADR 0072); the actual Damocles Gameplay Session uses recovered artwork and title-specific writers, with remaining authored or unsupported readouts identified (ADR 0071).
_Avoid_: HUD, status bar, dashboard, cockpit

**Panel Rendition**:
Which visual treatment the Benson Panel wears — Targ or Damocles — changing chrome and typography without changing the gameplay data beneath. The authored Damocles treatment dressing Targ and Flyover's fallback remain presentation-only choices; the actual Damocles Gameplay Session's recovered panel is governed separately by ADR 0071.
_Avoid_: Skin, theme, variant, panel mode

**Navigation Readout**:
The wide navigation window of the Benson Panel's lower row, which the Reference Build prints as three digits an axis. It is one window showing one of two readouts according to where the player is: the Body Coordinate Readout within a Body, the System Coordinate Readout in space. Which of the two it is currently showing is part of what the window means, so naming a value from it without naming its mode says nothing.
_Avoid_: The coordinates, nav window, position display

**Body Coordinate Readout**:
The Navigation Readout's mode within a Body, naming the player's position on that Body as a Body Coordinate Step an axis: one step is four Surface Cells, a Body spans 1024 steps an axis, and each step prints rescaled from 1024 to 1000. The Damocles Panel Rendition computes it; Targ's stands at nought, having no Body behind it.
_Avoid_: Planet coordinates, moon coordinates, world coordinates, nav digits, System Coordinate Readout

**System Coordinate Readout**:
The Navigation Readout's mode in space, naming the player's own position in the System as a signed coarse cell an axis, x then y then z, each printed as an unsigned magnitude with a negative axis marked in red and a magnitude past 99 as `**`. The cell is `$10000` engine units — the high word of the position longword, an arithmetic floor — which is far larger than the spacing of a Body cluster, so neighbouring Bodies read alike and a reading names a neighbourhood rather than a place. It describes the observer and never a Body: a Body read from below the System's plane reports a negative y though the Body itself lies on it.
_Avoid_: Body Coordinate Readout, Body coordinates, planet coordinates, system position

**Body Coordinate Step**:
The unit of the Body Coordinate Readout, and unrelated to the System Coordinate Readout's cell, which counts a different frame: `$40000` surface-grid units, which is four Surface Cells, so a 16-cell workspace spans four steps. A Body's surface is 1024 steps an axis, the same 1024-step turn the yaw word counts, and the z axis carries a fixed quarter-turn bias.
_Avoid_: Body cell, coarse cell, planet unit

**Cell Readout**:
The navigation window beside the Navigation Readout, naming the player's Island-Local Cell two digits an axis, a negative axis marked in red and a magnitude past 99 printed as `**`. It is the readout that moves as the player walks, and it is distinct from the Body Coordinate Readout beside it whatever the original's own documentation calls either window. Because it is island-local it names a location only with the island it was read on.
_Avoid_: Grid reference, city coordinates, location coordinates, tile readout, Body Coordinate

**Impact Clock**:
The Damocles Panel Rendition's `HH-MM-SS` window counting down to the comet's arrival and then up past zero, spending one second every fifty VBLs, or every two hundred once a Wish has granted MORE TIME, and rolling whole days separately. A fresh game is given `04-19-20` of it on the title screen, and the original's scripted arrival has spent an hour and a half of that before the player first stands on Eris. It is Damocles's alone: the Targ rendition's clock is the Targ Orrery's local time.
_Avoid_: Countdown, comet timer, deadline clock, session clock

**System Menu**:
The Browser Shell overlay opened with Escape that pauses stepping and owns the settings page, the Controls Page and the Save chooser; shell chrome, never part of the Game Surface.
_Avoid_: Pause menu, options screen, main menu

**Title Logo**:
A Title's small mark at the head of every System Menu page, recovered from that Title's own release; until it is recovered, the Title's name in its own typeface stands in for it (ADR 0063).
_Avoid_: Wordmark, title screen, branding, Destination Mark

**Shell Console**:
The Browser Shell's slide-down development command line, reaching the Gameplay Session's own actions and the stores that own each preference, Save, and adjustable presentation value rather than the state behind them; it admits development changes to play, which is why its commands are never part of a trace (ADR 0028). Atlas Travel is a separate authored exploration action (ADR 0050).
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

**Land/Sea Answer**:
Where a position on a Body stands against the Damocles Island nearest it, in three values: `core` inside that island's authored inner box, `land` elsewhere on it, and `sea` off it. It is one query, not three rules: the coast a player cannot walk across, the refusal to leave a craft over water, and the colour the ground plane is drawn in are the same answer read by three consumers. It is measured against one island — the nearest — so it never merges two, and a Body carrying only a coastline-less record answers `core` everywhere, having no coast.
_Avoid_: Land test, water check, coastline collision, Damocles Island

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
One recovered post-plan component of a Damocles Model, allocated its own attachment slot counting down from `$03FC`, whose control word is its Attachment Constructor. While the Pose is inside that attachment's Proximity Box, each moving leaf advances one model unit per tick until it stands eight units inside its outer edge; outside the box the leaves return and re-close. The leaves stay in the region queue for the whole motion, and a region naming the slot is selectable only while the attachment's latch reads fully open. The latch settles on the tick the leaves reach an endpoint, or on the tick after it, as the constructor's path compares its edge. Capital Spaceport's `$4200` two-leaf X entrance and STATE OFFICE's `$8200` two-leaf Z entrance are two members of one family, not two mechanisms.
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

**Enclosed Region**:
A recovered Damocles structure region the engine marks as shut off from outside: while the player is in one, none of the outdoor world is drawn, and it receives no Sunlight. A region not so marked shows the outdoor world through its openings and is lit as outdoors is.
_Avoid_: Interior, Room (for Damocles), windowless room

**Floor Table**:
The twelve bytes in a scaled Surface Structure's alias record naming which structure each of its levels binds, zero where a level has no floor. The level indexes it; the storey pitch in the same record gives that floor its height. Level 0's entry is the ground bind.
_Avoid_: Storey list, floor map, level index

**Floor**:
One level, 0 to 10, of a Surface Structure that its Floor Table binds to a structure. Inside a structure the player stands on exactly one Floor, at a height that Floor and the storey pitch fix.
_Avoid_: Level (bare), storey, basement

**Floor Label**:
The character a Damocles Lift shows for a Floor: `G` for Floor 0, `B` for Floor 10, the digit otherwise. It is a label, not a position: Floor 10 is the highest Floor in the structure's coordinates. The game draws it as wall text on the structure beside each lift car, and on some landings, showing the Floor the lift is at or passing.
_Avoid_: Basement, floor number

**Wall Text**:
Vector text a Surface Structure's own record places on one of its faces. The game draws it straight after that face whenever a region draws the face. It is literal text, a Floor Label, or a live token such as a door key letter. Font 4 is an alien script that draws as font 3 while the player carries READING GLASSES or RED HERRING.
_Avoid_: Sign, decal, building-detail text

**Damocles Lift**:
A structure region whose flags mark it as a lift, where a player on foot changes Floor by key. It reaches only the Floors its Floor Table binds, and refuses every other Floor and the one its Floor Label already shows. It rides in the order B, G, 1 … 9, so Floor 10 lies just below Floor 0 on the ride, though it is the highest Floor in the structure's coordinates. Mercenary III's lift is the same mechanism, and the two Titles share its rules.
_Avoid_: Elevator, Lift Journey, lift object, lift attachment

**Structure Workspace**:
The single bound current-cell Damocles Instance whose plan, attachments and regions the Working Authority holds live. Region selection, the selected-region ±11 eye clamp and plan drawing apply only while the Pose is in the central half of that cell on both axes; attachment motion is deliberately broader and may finish re-closing that instance's leaves outside it.
_Avoid_: Active structure, current building, bound model

**Entrance Latch** (historical):
The #237 Gameplay Session boolean that opened Capital Spaceport's Entrance Attachment on first entry to the Proximity Box and never cleared. Recovered motion uses the live RAM latch `$5E3D` (`$00` closed, `$01` moving, `$FF` fully open) and re-closes outside the box; the session stores that progress as open units and the latch, not this sticky flag.
_Avoid_: Doorway state, proximity state

**Plan Refusal** (historical):
The #237 authored post-Mover test against vertical plan segments and the closed Entrance Attachment. Recovered pushback is a selected-region XZ AABB clamp after the Mover, with neighbour handoff on a shared face; it is not Wall Contact.
_Avoid_: Wall Contact, collision system, Mover

**Damocles Catalogue**:
The read-only collection of recovered Damocles Models, Instances, Places, visual variants, and their evidence, including explicit gaps in recovery; the Damocles Gameplay Session reads it as Data Payload but it is not that session.
_Avoid_: Gameplay Session, Damocles world, level data

**Dion Catalogue**:
The read-only, sessionless collection of Mercenary III's recovered Bodies, placements, objects, Floors and shared geometry across the whole original world (ADR 0061), independently versioned from playable content and never a Gameplay Session. Selected records may be promoted into the Dion Data Payload through a bounded export (ADR 0065); Catalogue coverage does not establish gameplay reachability, and Dion records are not evidence for Damocles or from it.
_Avoid_: Dion world payload, Damocles Catalogue (for MIII), map data

**Coverage Ledger**:
The generated, validated account of every census reference a Catalogue must represent and every Geometry Identity it requires, with each identity's owner, decoder path, recovery state and preview evidence. Required geometry that is still missing keeps the Catalogue incomplete. A ledger count is recomputed from its records, never written by hand.
_Avoid_: Coverage report, checklist, Change Ledger

**Repeating Field**:
A structure group the original replicates across a Body by rule rather than by authored cells, as MIDAS fills its 256-cell workspace from one seed and selects cells modulo 16. Its workspace count is not a count of physical places, and its occurrences are computed for a Body Coordinate rather than listed.
_Avoid_: 256 buildings, tiled city, Settlement

**Damocles Script**:
A program from Damocles's successor 16-bit bytecode VM Confirmed in the Working Authority, distinct from a Benson Script and from the C64 Benson encoding (ADR 0015).
_Avoid_: Benson Script (for Damocles), game script, ST bytecode dump

**Location Trigger**:
A Damocles Script trigger that a structure group's location table fires when the eye enters a region: the table's entry names a cell, a region (or any indoor one) and a Floor, and the walk runs only when the region is reselected, not on a Floor change or a lift arrival. It is distinct from the triggers a pickup or a landing fires, and it shares their launcher, arming and one-shot rule.
_Avoid_: Room trigger, zone event, area script

**Key Latch**:
Damocles's `$7B61`: the make code of the last key the input poll read, whatever that key then did. A Damocles Script's `(OK?)` prompt clears it before asking and then compares it with Y, O and N once a frame, without consuming it, so a key pressed while the question scrolls in still answers it.
_Avoid_: Answer, key press event, pending key

**Damocles Death State**:
Where a zap leaves the Damocles player: the main loop stops, the view fades to black, the Body reads VOID, and only restoring a Save leaves it; a Save made in it restores into it (ADR 0055).
_Avoid_: Game over, respawn, lives

**Filled Presentation**:
Damocles's filled-polygon, palette-driven world view Confirmed in Working-Authority Evidence; the Game Surface mode of the Damocles Gameplay Session, distinct from Targ's wireframe line-list Game Surface (ADR 0019, ADR 0043).
_Avoid_: Wireframe view, remastered graphics, Departure Record

**Cast Shadow**:
The Enhanced-presentation darkening of a Filled Presentation face standing between DIALIS, where the sky draws it, and another face, with an edge as crisp as the polygon edges beside it, which the player may switch off; Authentic presentation never draws one. Only **Sunlight** casts one, so there is none by night or with DIALIS destroyed.
_Avoid_: Shading, ambient occlusion, lighting toggle

**Sunlight**:
The Enhanced-presentation direct light that DIALIS alone gives a Damocles Body's surface: it comes from where the sky draws DIALIS, it is present only by day and while DIALIS stands above the horizon, it fades in over DIALIS's first two degrees of elevation, and it is absent while DIALIS is a Destroyed Body and inside an Enclosed Region. No other Body gives light. A face Sunlight does not reach shows its recovered colour unchanged; Sunlight only brightens.
_Avoid_: Sun direction, daylight (the terminator's answer), moonlight, lighting
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

**Surface Region**:
A building's place in play: its extent, and an approach around it. The building's placement names the region and the Talk Script that answers for it, and that script alone hears the player come near, arrive, leave and go away, and objects come to lie there or be taken.
_Avoid_: Zone, area, trigger volume, Location (which is the surface as a whole)

**Structure Reach**:
Which Surface Cells contribute Surface Structures to the view: only the occupied Surface Cell, as in the Reference Build, or the whole surface as Enhanced presentation.
_Avoid_: Building reach, draw distance, render radius

**Distant Structure**:
A Surface Structure shown from a Surface Cell other than the one the player occupies, subdued so it reads behind the occupied cell's structure.
_Avoid_: Background building, far model, level of detail

**Geometry Identity**:
A stable, Research Provenance-backed identity for an entity in the World Geometry Dataset that remains valid when its interpretation or name changes.
_Avoid_: Object name, canonical name

**Geometry Asset**:
The editable geometry of one payload record — a Damocles Model, a Targ object model, Surface Cell or Room — as polygon loops, explicit lines and vertices that each keep a stable identity, with its drawn and walking forms held apart. It carries geometry and visual attributes only, and is linked to exactly one Asset Sidecar.
_Avoid_: Mesh file, Blender file, model file, GLB

**Asset Sidecar**:
The reviewable record of everything about a Geometry Asset that is not geometry — placements, game rules, bounds, evidence and bindings — naming the geometry it binds by identity rather than by position.
_Avoid_: Metadata file, manifest, Catalogue (for the sidecar)

**Recovered Baseline**:
A Geometry Asset and Asset Sidecar exactly as re-extraction from the Data Payload yields them. A fresh one is recovered beside an edited asset for comparison and never replaces it.
_Avoid_: Original, golden copy, source asset

**Recovery Correction**:
An authored change that brings a Geometry Asset closer to Authoritative Evidence than its Recovered Baseline, recorded together with that evidence.
_Avoid_: Fix, patch, Creative Change

**Creative Change**:
An authored change that deliberately departs from recovered geometry.
_Avoid_: Mod, Extension, Departure, Recovery Correction

**Authored Asset**:
A Geometry Asset with no Recovered Baseline, created for the modern port rather than recovered from a game; everything in it is a Creative Change.
_Avoid_: Custom model, new model, mod

**Targ Asset Browser**:
The sessionless page that lists every Targ object model and structure as the game draws it (recovered, edited or authored) with its Geometry Identity and placements, so an author can find what to edit. It is not a Catalogue: it carries no Coverage Ledger or evidence.
_Avoid_: Targ Catalogue, model list

**Change Ledger**:
The per-asset record classifying every authored change, by element identity, as a Recovery Correction or a Creative Change; an authored change it does not classify fails review.
_Avoid_: Changelog, edit history

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

**Road Piece**:
What one road cell of a Damocles Settlement draws on the ground: the ground record chosen for the cell by its class from the Settlement's six selectors, turned by the cell's orientation, unless a placement in the Settlement's own stream replaced it. A Road Piece is the cell's surface; the run it lies on is the network.
_Avoid_: Road tile, road mesh, road segment, road model

**Selected Piece**:
The ground record a road cell's class chose from its Settlement's six selectors, whether or not a placement later replaced it. Recovered for every road cell, captured or not.
_Avoid_: Default piece, road type, piece name

**Drawn Record**:
The ground record a road cell actually draws, resolved for that cell alone — its orientation and scene joins applied, and any placement replacement taken — which may differ from its Selected Piece. Two cells sharing a Selected Piece may draw different geometry, so one cell's Drawn Record never stands in for another's.
_Avoid_: Override, drawn piece, resolved model, road geometry

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
