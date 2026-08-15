# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Carry the underground rooms into the Data Payload and render them. All 192 rooms
  were already being decoded into the verified dataset — points, edges, bounds, and
  the commands that link one room to another — and then thrown away, because
  `payload export` never wrote them out. So the app has never been able to see
  underground. `rooms.json` now carries them, `World` builds them into wireframes,
  and `--inspect-rooms` puts every one on a contact sheet with `--inspect-room N`
  for a single chamber.
  Rooms come from the dataset rather than from a capture, like the surface and the
  objects do, because their geometry is table data and not runtime state. Each room
  is a closed point space of its own: the Reference Build expands a room's drawing
  commands into points before it draws anything, so a room's edge indices mean
  nothing outside it, and the export asserts as much rather than trusting it.
  A room's links are carried without being resolved. The Reference Build packs a
  room link and a behaviour into the same byte and the decode does not claim to know
  which is which, so both readings travel and the uncertainty stays visible.
  Most rooms are uniform 4096 × 1024 × 4096 chambers and the ones that decode to a
  sliver are the corridors connecting them — a corridor is a chamber with one axis
  collapsed, so both shapes come out of the same decode with nothing wrong.
  `notes/decode/underground.md` carries the room structure and the lift.
- Go underground. Decode the lift — the only thing that writes the underground flag —
  and walk its five entrances into the Data Payload as `underground.json`, then draw
  the room the player is in instead of the surface. Underground the on-foot mover runs
  whatever the player is standing in, which is what the Reference Build's own dispatch
  does, so the correction that landed with it is what made this straightforward.
  **The elevator coordinates cross-check settles.** Our image's two destination tables
  give `9:6`, `9:5`, `3:0`, `11:13` and `3:15` for sites one to five; site six lands
  off the grid and site eight reads into the second table, so five is what bounds the
  count. That is five of the six coordinates the community list carries, and the
  missing `3:4` is absent from the lift table rather than misread — the documented
  list covers elevators *and hangars*, and a hangar is entered by the separate box
  test, so `3:4` is most likely a hangar.
  The site turns out to be the room id: arriving hands it straight to the room setup,
  which keys the room pointer tables with it, so site one arrives in room one.
  The lift's conditions are read (`$B404`): on foot, and standing on its pad — middle
  bytes `$70` to `$73` on both axes, a small square near the middle of the cell, which
  is exactly where surfacing puts the player back down. The app now asks for all of
  that. `$B3F6` resolves the final step: it compares the keyboard result with `$0E`,
  the Reference Build's `E` key, before entering the handler containing `$B404`, so
  `E` now invokes the lift and the former `G` adaptation no longer does.
  The indoor presentation is resolved too. `$AFC3` branches on the underground flag
  to the clear at `$B197`, which fills the bitmap with `$AA`; room setup takes its
  background and foreground indices from bytes 3 and 4 of that room record. Schema 5
  carries those per-room colours, and both renderers now draw 320 scaled columns,
  foreground first and then alternating foreground/background across the Game Surface.
  The sRGB mapping is the complete palette captured from the same local VICE used by
  the reference evidence. The remaining judgment is the maintainer's manual fidelity
  playthrough; lift animation and additional sound reconstruction remain out of scope.
  `--render-frame --room N` renders from inside a room.
- Map the rooms for checking. `lab geometry rooms-svg` draws all 192 as one sheet:
  each room's plan seen from above in its own coordinates, its doorways placed where
  the commands put them, and the rooms each doorway leads to written on the tile.
  Rooms share no coordinate space — the Reference Build draws one at a time from its
  own points — so there is no floor plan of the underground to draw; a grid of plans
  is what there is, and a corridor reads as a line.
  It settles what the link byte is. All 481 links land on real room ids, none is a
  self-link, and 398 of them reciprocate, which a behaviour byte would not do. The
  map draws the 83 that do not link back in a different colour, since those are the
  ones worth looking at.
- Lay the underground out as a place. `lab geometry rooms-plan-svg` walks a layout
  out of the doorways rather than reading one, which is possible because every
  doorway sits on a wall: a door on the east wall can only lead east. Corner doors
  are settled by the room on the other side, whose own door back has to face it.
  Only a doorway the other room answers places anything, and that choice is
  measured rather than assumed — laying out on one-way links too gives 62 collisions
  against 52 and a largest joined group of 19 against 25, which is itself evidence
  that a one-way link is not a shared wall.
  Each room is placed at its own width and depth, and the two halves of a shared
  doorway are butted together, which fixes both axes at once: the far room's wall
  meets the near room's and slides along until the doors line up. So a corridor lays
  out as a corridor, and a chamber as a chamber.
  Drawing them true rather than as one square each is what makes the layout hold
  together, by a wide margin — 42 groups against 57, a largest joined group of 38
  against 25, and 5 overlaps against 52. The residue was almost entirely corridors
  folded back on themselves for want of their real length. The five rooms that still
  want ground already taken are named on the map rather than explained away.

### Fixed

- Walk on foot the way the Reference Build does, which is not through the control
  loop at all. `MOVE` (`$A165`) dispatches: with the underground flag set, or with
  the craft byte's top bit set — which is what being on foot means — control goes to
  a separate routine at `$A18B`, and only otherwise does it `jmp ($BEA0)` into the
  live block. That routine walks by a fixed step held at `$AA/$AB` and turns by a
  fixed number of angle units held at `$AC`, with no velocity, no damping, no
  throttle and no vertical term. So the block after the eight craft is not the
  on-foot walk: it is the block touchdown installs so a *landed craft taxis*, which
  is why the touchdown copy exists, and it is named `grounded` now. ADR 0016 carries
  the correction; the eleven-block table, the touchdown copy and the two filter
  shapes all stand.
  The numbers were nearly right by accident, which is why playing it never caught
  this — the block's yaw authority is 16 angle units and the real on-foot turn step
  is also 16, so turning was exact, and its settled speed was 85.3 units per frame
  against a real step of 80. They are exact now.
  Three things fall away with it. The on-foot walk no longer borrows a throttle notch
  it never had, so `walkNotch` and `runNotch` are gone and running is an explicit
  `runMultiplier` on a decoded step, honest about being a Mac Adaptation since the
  Reference Build had no run. The "a walker could take off" guard is gone, because
  the real reason a walker cannot leave the ground is that the routine has no
  vertical term. And the keyboard adaptation that made the on-foot throttle follow
  the key is gone, because there is no on-foot throttle.

### Added

- Fly the craft. Decode the Reference Build's control loop and its Craft Parameter
  Blocks, and run walking and flying through one loop as the original did (issue
  #45, fifth step; ADR 0016). The Dominion Dart now takes off, climbs, banks into
  its turns and lands, on rates re-extracted from the Reference Build rather than
  tuned by hand.
  The gating decode was the engine's sixteen-bit float: a mantissa byte with an
  implicit leading one, then a byte holding the sign in bit 0 and the exponent two
  places up, so one power of two is `$04` and `FP_MUL` can add the exponent bytes
  whole — the sign bits exclusive-or in bit 0 and the carry lands in a scratch bit
  that gets cleared. The format dies in `c64lab`: `flight.json` carries plain real
  numbers and the app never sees the encoding, which is ADR 0015's rule applied to
  arithmetic instead of addresses.
  The read corrected three things the scoping note had guessed at. The block table
  is eleven blocks and not eight — after the craft come walking, a crash tumble and
  the parachute descent, and the run ends exactly where the first control routine's
  code begins, which is what pins the count. Walking is one of those blocks and
  dispatches through the same routine five of the craft use, so it was never a
  capture-only variant. And the two filters are not the same shape: yaw damps and
  then takes its input, while speed takes its input and then damps, which is why
  their fixed points differ. All six offsets the note left open are pinned: a pitch
  step, a roll coupling that banks a craft into its turn, a lift factor, an
  altitude ceiling, and one offset that every block sets alike and nothing reads.
  Take-off and landing turn out to be modes rather than inputs, and there are no
  keys for them: the vertical step is skipped until speed reaches a threshold, so a
  craft has to make a take-off run, and crossing back down through the altitude
  band lands it — or crashes it, on either too much descent rate or too much
  nose-down pitch, which puts the player out of the craft. The Dart's ceiling rises
  when a poweramp is fitted, and the poweramp doubles its throttle rather than
  adding four to it as the note had read. Throttle is ten notches each twice the
  last, with `-` and `=` halving and doubling, refused rather than clamped at the
  engine's own limit.
  Adds `c64lab/flight.py` with per-site opcode assertions and a float round-trip,
  `flight.json` in the Data Payload, `CraftParameterBlock`, `FlightModel`,
  `ControlLoop` and `FlightMode` in MercenaryKit, a `flight` section in
  `settings.json`, and `--flight-trace` for flying a craft without a window. The
  new extraction reproduces the frozen UNC-0002 ledger byte for byte on all eight
  craft, which is the closest thing to a second opinion available.
  The filters are solved for an arbitrary timestep rather than iterated, so they
  agree with the original at its own frame rate and stay smooth at 60.
- Bank the view with the craft. `Camera` gains a roll term, and the horizon fill,
  which both renderers now share, leans with it and changes sides when pitch
  carries the view over the vertical — the Reference Build's pitch wraps rather
  than clamping, so a craft really can be flown over the top. `--render-frame`
  gains `--roll`.

### Changed

- Pace the control loop at 20 frames a second rather than the 5 the Reference Build
  ran at, which is the single knob that fixes both how fast a craft turns and how
  long it takes to get there: the Dart's turn goes from 28 to 112 degrees a second
  and its build-up from 3.1 seconds to 0.8. Walking is held where it was by dropping
  its notch two rungs, so only the craft get quicker. A scale alone would have
  raised the rate and left the lag.
- Start the throttle keys part way up the ladder. The decoded ladder is ten notches
  each twice the last, so it spans 512 to 1 and its bottom rungs are imperceptible
  whatever the overall speed — pressing `1` moved the Dart at a fortieth of walking
  pace. `flight.throttleFloorNotch` is the notch the lowest key selects, defaulting
  to the third, so all ten keys do something and the top rungs are shared rather
  than run off the end. It maps keys to notches and changes nothing about the
  decoded ladder. A pleasing consequence: the two lowest keys are below the take-off
  speed, so they taxi, and the take-off run is real from the third key up.
- Movement is the cursor keys alone, as the original's stick was: `W`, `A`, `S` and
  `D` are gone. Up and down walk while on foot and pitch while aboard, and aboard
  they read as a stick rather than a camera, so pushing up puts the nose down.
  `Space` shuts the throttle aboard a craft, and goes on skipping the message on
  foot, where there is no throttle to shut.
- Walking runs on the walking Craft Parameter Block instead of its own tuned
  constants, which changes how it feels: its turn is about a quarter of the old
  rate and its speed has a short run-up where it had none (ADR 0016). `WalkLimits`
  is gone; what is tunable now is the frame rate the decoded parameters are paced
  at and per-axis scales, in `settings.json`. On foot the eye sits at the Reference
  Build's own ground altitude rather than the 128 chosen for the walkabout, with a
  setting to put it back.

### Fixed

- Draw the rotating structures at their real width. A rotated structure's X and Z
  displacements are a signed **×64** per byte, not ×16: `SETUP_STRUCTURE_POINTERS`
  hands the source byte to `BIT24_TO_FP` as the *high* byte of a twenty-four bit
  value — its normalisation counter starts at `$18`, which is bit 24 — so the float
  it gets back is the byte shifted left sixteen, and subtracting `$28` from the
  exponent byte takes ten powers of two off it rather than four. The visible
  consequence was the rotating inverted pyramid at cell 8:8, four times too narrow
  in X and Z while its independently stored Y byte kept its correct ×256 units, so
  it drew as a tall spike instead of a squat pyramid. Its height was never wrong;
  the two axes either side of it were. The corrected displacement is a quarter of
  the middle-byte unit the surface's own world points sit in, which is what a
  sub-cell offset should be. Reading the float format for flight is what settled
  it; `notes/decode/geometry-render-fidelity.md` carries the correction.
- Stop drawing a craft the player is sitting in. Boarding took the craft out of the
  world in the script host's object rooms, but the renderer read the payload's
  static room byte, so the Dart went on being drawn beside the player who was
  flying it. The visibility pass now takes the slots the game has taken out of the
  world, which is live state rather than payload data.
- Put the craft back when the player steps out. Boarding removed it from the world
  and nothing ever undid that, so leaving would have lost it for good. `L` now
  leaves a grounded craft, which restores it to the surface and lets it be boarded
  again.
- Take the craft's heading from its orientation in the unit that orientation is
  written in. Boarding read the object tables' orientation byte as though it
  counted 1024 to a turn like the control loop's angles; those bytes count 256, so
  a boarded craft faced a quarter of the way round from where it was pointing.
- Say what the player is in. The status strip now shows the craft, and while
  aboard, altitude, throttle notch, and whether the craft is flying or grounded —
  none of which had any indication before.
- Bank the right way. The world turns *against* a rolling craft, so a right bank
  has to lift the right of the horizon; it was dropping it, which made a turn read
  as a turn the other way. The ground fill and the wireframe now lean together.
- Sit the player in the craft facing the way it points. A craft's nose runs along
  decreasing Z when its orientation byte is zero, while a heading of zero looks
  along increasing Z, so boarding put the player in back to front.
- Spin the rotating structures smoothly. The Reference Build advanced a structure's
  phase in whole steps once per geometry frame, which at 60 frames a second is a
  stutter rather than a spin. The rate is still the decoded one; letting the phase
  run continuously between its steps is a Mac presentation adaptation, in the same
  spirit as drawing the one-cell ring of structures.
- Stop treating a script's clear of the engine's running flag as the end of that
  script. The Reference Build's step loop never consulted that flag — only its
  start did — so clearing it means "I may be interrupted now", and several scripts
  keep running afterwards. The opening's ending was being swallowed as a result:
  boarding the Dart jumps into the craft's own description, which clears the flag
  as its third instruction and then says "THIS CRAFT BELONGED TO THE PALYAR
  COMMANDER'S BROTHER-IN-LAW / HE IS NOT TOO PLEASED" before the game proper
  begins with "PALYAR SHIP ATTACKING". A script now ends where it actually ends: a
  return with nothing to return to. Also correct the on-foot value of the
  boarded-craft byte, which is `$80` rather than zero, because slot zero is a real
  ship.

### Added

- Run the Reference Build's own game logic: decode all 51 Benson Scripts and add a
  Swift interpreter behind the Host Callout seam (issue #45, second step; ADR
  0015). The opening now plays in the app because script 00 is running — the crash
  sequence, a random landing verdict, the full status report, and the craft-sale
  argument, on a scrolling message line whose pace blocks the script as the
  original's did. Pressing Y buys the Dominion Dart and the balance falls from
  9000 to 4000 credits through the same ten's-complement BCD add the Reference
  Build used; pressing anything else takes the "IT WILL BE A LONG WALK" branch;
  either way the script parks on the craft test that a later step will satisfy.
  This answers the question the text-table step left open: the intro text has no
  table entry because it is inlined into the scripts themselves.
  Scripts are re-encoded rather than copied (ADR 0015), with every machine address
  and key code resolved to a named symbol at export, so the app never handles a
  C64 address and an unnamed one fails the export. Adds `c64lab/benson.py` with
  per-opcode width assertions and interpreter fingerprints checked in memory,
  `lab benson decode`, `benson.json` in the Data Payload, `BensonProgram`,
  `BensonHostState`, `BensonMachine`, `BensonSession`, and `MessageTicker` in
  MercenaryKit, and `--benson-trace` for checking a script without a window.
  Our own extraction found six scripts the Reference Disassembly had not resolved,
  cutting unreachable script bytes from 146 to 8, and established that `wfr` waits
  count seconds rather than video frames.
- Read the app's tuned values from `settings.json` at the repository root, so
  judging feel means playing and editing rather than editing and rebuilding: the
  message line's reading hold and reveal rate, and the script timing scale and
  instruction budget. Every field has a default, so the file may name only what it
  changes, and a missing file is simply the defaults; a malformed one is reported
  rather than silently ignored, which would otherwise leave a tuning session
  running the old values. `MERCENARY_SETTINGS` points at an alternative file, and
  `--benson-trace` honours the same settings so a trace matches what the app does.
- Resolve the text engine's digit glyphs: character codes `$00`-`$09` are `0`-`9`,
  which the numeric-field emitter settles by storing unpacked BCD nibbles straight
  into the character stream. Fixes the missing "5" in "PRICE 5OOO CREDITS" and
  leaves `$0E` and `$6D` as the only unresolved codes.
- Decode the Reference Build's current-cell surface-structure selection, while
  keeping the immediate one-cell ring visible in the Mac presentation to avoid
  whole buildings popping at cell boundaries. Add `--inspect-structures` with a
  deterministic contact sheet and report for all 98 unique structures, retain
  their stable Geometry Identities at runtime, and report edges whose endpoints
  belong to the shared road-point workspace rather than silently dropping them.
  Correct the surface edge decoder: a zero marker switches the remainder of the
  record from packed nibbles to full-width endpoint pairs, fixing buildings such
  as Novabill's house at 03:08, and require geometry decoder 3 so stale payloads
  are rejected.
- Render the complete opening scene at cell 8:8 (issue #51): start the app
  facing the airstrip, Dart, crashed spacecraft, and deterministically rotating
  inverted pyramid; preserve every surface vertex and edge in Data Payload
  schema 4; and add pinned-time headless captures for animation comparisons.
  Correct object-model coordinates to signed two's-complement values, fixing
  the severely stretched spacecraft produced by the previous offset-binary
  interpretation, and require geometry decoder 2 so stale datasets cannot
  silently restore the distortion.
- Decode the Reference Build's two road-table slots as full, zero-width runs,
  preserve all 256 lookup entries in Data Payload schema 3, reproduce the
  altitude/current-structure/fixed-map selection rules, and add a verified
  `geometry roads-svg` exporter. The current 271 table entries collapse to 32
  unique undirected lines; cell 8:8's parallel lines remain separate airstrip
  structure geometry. Use the supplied Atari ST reference's sampled `#60A0E0`
  sky and `#008000` ground, with true black ink and no synthetic horizon stroke.
- Add a geometry debug mode (`--inspect-objects`, `--inspect-object`,
  `--inspect-cell`) that renders a subject in isolation with its decoded numbers,
  plus a contact sheet of all 64 objects on one page. Canonical framing by
  default; `--in-situ` for the game-accurate view.

### Fixed

- Correct the rotating surface-structure transform used by the inverted pyramid
  at 8:8: its X/Z source bytes are exponent-scaled by 16 while Y remains scaled
  by 256. Advance its phase at the measured completed-geometry-frame cadence of
  about 5 Hz, rather than the 50 Hz PAL display rate that made it sixteen times
  too wide and spin ten times too fast.
- Replace the guessed 124-pixel camera focal length with the Reference Build's
  decoded projection: FOCUS `$18` yields `64 X/Z`, while the Y pipeline's extra
  exponent step yields `128 Y/Z`. Restore the VIC-II multicolour pixel aspect:
  the 160 logical X positions occupy a 320-pixel display, making the physical
  X and Y focal lengths equal instead of rendering models half-width and overly
  tall. This pins apparent size in projection tests and calibrates the cell 8:8
  opening to a neutral-horizon pose 12,000 world units from its scene focus at
  the decoded `$0080` eye height. Treat a zero road-altitude extent as the
  Reference Build's no-roads sentinel, hiding the road network below Y=2048;
  higher extents continue to select the complete clipped surrounding square.
- Carry the Reference Build's presentation rules through to the app, which the
  payload exporter had been discarding: the object detail cube and far-point
  representation, the road altitude table, structure rotation data, and the
  transform contract (introduced in payload schema 2 and retained by schema 3).
  Apply model-local orientation for the
  rotatable slots, derive the projection from the original's 160x136 frustum
  instead of an invented field of view, and stop drawing instances parked outside
  the world. Fix a grid-key aliasing bug where a negative column resolved to the
  previous row and duplicated that cell's geometry at the world edges.
  Road selection and scene colours were subsequently resolved by the schema-3
  work above.

- Decode the dictionary-compressed text tables and put a message line in the app
  (issue #45, first step): 64 messages and 159 distinct words recovered from our
  own Reference Build, composed by reproducing the emitter's spacing rule, and
  rendered on screen with `[` / `]` to page through the set. Adds `c64lab/text.py`
  with structural guards on the emitter, `text.json` to the Data Payload via
  `lab payload export --run`, `TextTable` in MercenaryKit, and
  `notes/decode/text-tables.md`. Three character codes are left unresolved rather
  than guessed, and the intro/comms text block is deferred because it is addressed
  by a mechanism this step did not identify.
- Release held keys when the app loses focus, so a key-up delivered while
  inactive cannot leave the player turning forever.
- Deliver M1, the surface walkabout (issue #44): a macOS app that loads the Data
  Payload and lets you walk around Targ in a wireframe presentation. Adds
  the `app/` Swift package — `MercenaryKit` (payload decoding, world building,
  projection, and a pure deterministic `GameCore`) and `Mercenary` (window,
  input, Canvas renderer) — plus `lab payload export`, which rewrites a verified
  World Geometry Dataset into the runtime payload shape without decoding anything
  new. Includes headless `--render-frame` capture for fidelity spot-checks from a
  machine that cannot open a window, and `notes/decode/surface-geometry.md`
  recording the world frame, the 410 deferred runtime-rotated edges, and the
  object-grounding judgement.
- Verify the enterable-object inventory and its Handler-Equivalence Class
  assignment for UNC-0002 (issue #28), unblocking UNC-0001's exhaustive Semantic
  Mode inventory. The inventory is closed by decoded dispatch reachability and
  corroborated by typed live-block observations from two reproduced cold runs of
  new proof trace TR-9028. The decoded partition is singleton and the dispatch
  handler count is published as the candidate coarsening, so UNC-0001 must prove
  its matrix once per member rather than the two classes previously assumed.
- Add `catalogue/object-semantics-coverage.json` with a closed eight-family
  Object-Conditioned Predicate ledger, its Draft 2020-12 schema, machine-checked
  UNC-0002 responsibility sets, and a resolution gate requiring every family and
  class to be verified. All eight families remain `open`; UNC-0002 stays open.
- Add the `lab object-semantics decode|verify|corroborate|attest` workflow, a
  verified BC-0041, ADR 0013 for the class-key projection, and Handler-Equivalence
  Class and Object-Conditioned Predicate to the shared language. Exact mappings,
  per-field ledgers, and corroboration reports remain Restricted Material cited by
  Evidence ID and artifact hash.
- Add `lab catalogue review-status`, which fails when a recorded maintainer
  approval is stale, unapproved, or missing. All 21 approvals recorded in #38 were
  already stale, because #39 moved the catalogue digest without any command
  reporting it.
- Record the maintainer's digest-bound approval of all four World Geometry
  Dataset comparisons and all 21 Behavior Catalogue review subjects; resolve
  the non-material geometry-review bookkeeping uncertainty while preserving
  the eight material evidence uncertainties as downstream work.
- Define the normative Product and Technical Implementation Specification for
  issue #13, including MCJ-1 package JSON, deterministic-CBOR runtime contracts,
  exact identities and signatures, bounded Lua/XPC execution, migration,
  diagnostics, author tooling, fuzz gates, and candidate-release evidence.
- Add 14 Draft 2020-12 schemas, six CDDL contract families, closed version
  registries, 25 positive/negative golden vectors, and `lab implementation
  validate`; add Execution Environment to the shared language and record ADR
  0012 for the production encoding boundary.
- Define the normative Verification System for issue #12 with scoped Behavior
  Cases, immutable results, public/restricted manifests, dependency-aware reuse,
  digest-bound approvals and departures, dual conformance/readiness verdicts,
  and derived Release Eligibility.
- Add schema-validated `lab verification validate`, `aggregate`, and `render`
  workflows; migrate BC-0001 through BC-0021 to canonical JSON; promote the
  MAS/CSM scenarios as BC-0022 through BC-0036; and add focused renderer,
  compatibility, fuzzing, and dependency-review cases through BC-0040.
- Define the normative Content and State Model for issue #11, including exact
  Content Set and linear Content Overlay resolution, typed ResourceGraph
  relationships, deterministic Lua 5.5.1 Mods in a sandboxed XPC simulation
  service, authoritative Transition Logs, exact-bound saves, audited migration,
  and ADRs 0008–0009.
- Add Content Set, Content Overlay, Mod, Session State, and Transition Log to the
  shared language, and extend the native, macOS, fidelity, and publication
  contracts with the resulting boundaries.
- Define the accepted macOS experience contract, Native Shell and Game Surface
  boundary, Mac Adaptation review scenarios, and a synthetic SwiftUI/Core
  Graphics prototype with tested display, input, accessibility, feedback, and
  save interactions for issue #9.
- Add the public-safe Behavior Catalogue model, neutral Catalogue Entries,
  evidence-linked Behavior Cases, closed coverage and uncertainty indexes, and
  ADR 0005 for issue #8.
- Add schema-validated `lab catalogue` run, build, verify, sample, review, and
  summarize workflows with branch traces, content-addressed restricted evidence,
  PAL timing, probe enforcement, WAV/SID capture, and writable D64 support.
- Add a reproducible, schema-validated World Geometry Dataset extractor with
  exact object, surface, road, underground, provenance, expansion, bounds,
  curation, comparison, review, and redacted-summary workflows for issue #7.
- Add Geometry Identity and Curated Name to the project language while keeping
  exact reconstructed payloads and comparison media in ignored restricted
  storage.
- Define a private-by-default publication policy for solo research and
  implementation, with a maintainer checklist and qualified-review gate for
  Reconstructed Payloads and other sensitive material.
- Define the versioned Fidelity Contract for observable equivalence, evidence-linked
  Behavior Cases, Acceptance Envelopes, Preserved Quirks, Mac Adaptations, and
  publicly governed Departure Records.
- Add normative Behavior Case and Departure Record templates, including
  crack-sensitive evidence handling, comparative wireframe review, semantic
  input/save rules, and nondeterministic verification requirements.
- Establish the provenance-safe C64 Reference Build laboratory for issue #2.
- Add repeatable VICE environment checks, checkpoint captures, binary-monitor
  observations, artifact verification, and two-run reproduction through the
  `research/c64-reference-build/lab` CLI.
- Record the qualified ABC/1001 crack identity, boot and unpacking path,
  normalized post-unpack and interactive evidence, schemas, scenarios, labels,
  segment metadata, and primary-source VICE research.
- Ignore supplied ROM inputs and generated research artifacts so no PRG, RAM
  dump, snapshot, screenshot, or reconstructed payload is published.

### Changed

- Pivot the project to a private-first playable artifact (ADR 0014). The
  verification-era apparatus — Behavior Cases, Acceptance Envelopes, Evidence
  records, Conformance Reports, and the uncertainty ledger — is frozen as
  history and extended by nothing; the maintainer playing the remake beside the
  Reference Build becomes the fidelity judge, with a modernised-feel bar. Game
  data moves to a single gitignored Data Payload re-extracted by this project's
  own tooling; the community Reference Disassembly is consumed as unlicensed
  reference documentation only. Game logic will run as original Benson Scripts
  under a native interpreter behind a host-callout seam sized for a later Lua
  rewrite. Add Data Payload, Benson Script, and Reference Disassembly to the
  shared language and mark the claim-era terms historical.
