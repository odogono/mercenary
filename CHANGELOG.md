# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Each released version is tagged `v<version>` and carries a compare link at the
foot of this file. Link references start at 0.20.0; earlier versions were never
tagged, so 0.20.0 compares against the 0.19.9 release commit rather than a tag.

## [Unreleased]

### Added

- **Damocles draws the comet DAMOCLES in the surface sky.** It is two white triangles
  from its head to a tail tip a quarter further from DIALIS, drawn in its draw-list slot
  and cut at the horizon. From a surface it shows as a thin streak, as on the ST. Its
  centre follows the Session's impact clock through #440's waypoint table with the ST's
  own arithmetic, so it moves as the clock runs down and a Save restores it. At #528's
  pinned MIDAS clock the centre is the frames' RAM value exactly, and the head lands on
  the frames' own streak. `system.json` gains a `comet` block with the waypoint table,
  tail shift, head points, polygons and head-disc slots, extracted by
  `damocleslab.system`. The comet is gone once the clock reaches zero, where the ST
  destroys it (#538).

- **The Enhanced preset moves the Damocles sky Bodies smoothly.** The engine turns the
  sky in whole 1/1024-turn steps, and walking reaches it in four-cell steps, so on METIS
  a Body jumps 0.35° every 1.4 seconds. Enhanced presentation now reads the whole
  accumulator and the exact position instead, so the Bodies glide at the same speed and
  never stray more than two steps from where the engine has them. Authentic keeps the
  engine's steps. Day and night still turn on the whole step in both, so play and Saves
  are unchanged.

- **Damocles draws the other Bodies of a cluster in the surface sky.** On METIS by day
  ERIS is a large `#000066` crescent cut flat at the horizon, and VESTA a small `#4488cc`
  one. Each Body on the current Body's draw list is turned through the celestial
  rotation `R(lon, lat)` from the same accumulator the terminator reads, so sunrise and
  the Bodies move together and a Save restores both. The disc is split by #528's vertical
  terminator ellipse. Its unlit part is the sky by day where there is air and black
  otherwise, and the ground and structures cover it. Every listed Body lands where #528's
  pinned frame RAM puts it. Enclosed regions draw no sky Bodies. DAMOCLES's comet path is
  left for #538 (#530).

- **The Damocles Data Payload carries each Body's sky draw list and true size.**
  `payload/damocles/system.json` is now extracted by `damocleslab.system` rather than
  transcribed. Each Body gains `drawList`, the Bodies its sky draws in the engine's order
  from `$00809C`, and `size` and `radius`, the #424 decode and `size / 256` System units
  (#528). A new `sky` block carries the projection scale, eye height, half-width divisor
  and clip rows the sky pass reads. The Atlas and the Flyover now read the published
  radius, which is recovered rather than derived, and say so. DIALIS's list is DIALIS
  alone, not empty as the research first said (#529).

- **The sound board plays every Damocles sound programme.** The port's YM2149 driver
  now holds everything #514 recovered: channel B's spell, splash, transporter, bump,
  blast, shot, thud, zap and blown up, and the Geiger counter's click that cuts them.
  Channel C gains the hazard alarm, its silence and the craft engine, whose level is
  the speed's exponent. Outside the vectors come the per-character message tone and
  the New Game descent drone. The GHETTOBLASTER's music player replaces both vectors
  while it plays, walking a tune `damocleslab.music` extracts into
  `payload/damocles/music.json`; its hi-hat and first bass pass read the capture's TOS
  header at address 0, as the ST's do. The worklet now runs the program's reset
  `$0508BC` at start and on every reset, which leaves channel A's tone on for the
  message tone and is otherwise silent. `/sounds` has a card for each, with a speed
  slider for the engine, three Geiger distances, a message to type and the tune. The
  board's Geiger draws are uniform, where the ST reads a table at `$77000`, and its
  descent paces one step every 3 VBLs from the boot recording. No session asks for any
  of them yet (#521 and #522 are the next).

- **Every Damocles sound programme is recovered and heard.** Beyond #508's door
  tone, burst and shared effect, the ST driver's first vector (channel B) holds
  nine more programmes and its second (channel C) two. The spell is a BOOK page's
  action with the MAGIC CRYSTAL carried. The splash and the blast mark a craft
  reaching the ground over sea or land, and the blast also an explosive's
  deadline. The rest are a transporter hop, a refused boarded move (the bump),
  the player's shot and ENEMY SHIP DESTROYED, a thud on foot against a wall and
  when the attack ship fires, its zap, being blown up, and the hazard alarm with
  its silence at death. The tick #508 left to the timer path is the GEIGER
  COUNTER's click near the NOVABOMB. The idle channel C voice is a craft engine
  whose level is log₂ of the speed. Outside the vectors are the per-character
  message tone on channel A and New Game's falling descent drone on B and C.
  `$033F68`'s "alternate path" is a three-voice music player for the
  GHETTOBLASTER: a tune looping every 3328 VBLs. Its hi-hat voice and the
  first pass of its bass read the TOS ROM header at address 0, so the bass is up
  to 115 cents flat until it first picks a pitch table. A cold boot is silent
  through the loader and title. Each reachable sound was recorded in Hatari at
  50 Hz and matched to its decode, by the event or, where noted, by an
  intervention. The rest were armed directly and are named as not reached.
  New tracked `sound-programme-probe.py`, with presentation follow-ups #521 and
  #522; no application behaviour change (#514).

- **Damocles doors and lifts are heard.** A Damocles presenter now plays the
  session's Sound Cues through the Browser Shell's audio transport. It models the
  ST's YM2149 (tone, noise, envelope, the STF output low-pass) in its own
  AudioWorklet, and runs the driver programmes recovered from the 68000 code on
  a 50 Hz VBL of its own. The door tone `$04C37A` is channel C's buzz gated by
  noise, swelling from level 10 to 13 and falling to a 9-to-5 loop. The burst
  `$04C2B8` is noise stepping 12, 8, 4, 0. The shared effect `$04C556`, which
  takes, drops and the lift's arrival all ask for, is a 1302 Hz tone on channel
  B under a one-second envelope decay. A ride therefore sounds its door, falls
  silent while the label steps, and plays the arrival over the new door. Audio
  starts only on a trusted gesture. It follows the shared mute and volume
  preferences, suspends with the menu or a hidden tab, and is reset when the
  session is replaced or lost, so no tone survives a New Game, a load or a
  takeover. Leaving the title closes it. `data-damocles-audio` publishes the
  presenter's state beside the cue tally. A Playwright pass listens to the
  page's own output, apart from the tally. The research note records the
  programmes and a Hatari recording of the ride that they match (#508).
- **Damocles doors ask for their tones.** Whenever any door starts moving the
  session asks for a `door-start` Sound Cue, and when every door has stopped it
  asks for a `door-stop`. These are the ST's rising and falling edges of `$5A9D8`
  at `$05A9EE`, which arm the door tone `$04C37A` and the noise burst `$04C2B8`.
  The cues come after the ride step, as `$05AA3C` does. A lift ride now asks for
  a start and a stop as the car's door shuts, nothing while the label steps,
  the arrival's request, and a start and a stop as the new Floor's door opens.
  The edges do not test the take cue's guard `$7A0C`. The ST silences them only
  while the player is dead outside a structure region, which the port cannot
  reach. The Save carries whether a door moved on the last pass (`$5A9D9`), so a
  door saved while moving does not ask to start again. That is schema 10, and a
  schema-9 record is refused whole (#499).
- **Damocles Bodies turn through day and night, and the scene follows.** The
  port now runs the ST's terminator at `$050562`. Each Body's rotation
  accumulator advances every VBL by the Body's own rate, and the terminator
  compares the resulting longitude with the Body's sub-stellar longitude
  `$79BE`. By day the sky takes the Body's day word and every scene-palette
  colour takes the palette's day half, the base plus the signed word stored
  before it (`$7A14`). By night both take the base. The one authored blue sky
  is gone: Eris starts at night under its own `$001`, and
  `switch metis-transporter` stands by day under Metis's teal `$355`. The
  Catalogue publishes a `dayColour` beside every colour whose palette halves
  differ, `dayColours` on Floor palettes, and each Body surface's `sky` pair
  and `rotationRate`. Each arrival pose publishes its `bodyTurn` and
  `subStellarLongitude`. All 33 captures agree with the terminator, and the
  published colours match each capture's bound half on both sides of it. The
  page publishes `data-daylight`. The Save carries the turn, which is schema 9,
  and a schema-8 record is refused whole. The Eris presentation document drops
  its `sky` block and gains `start.bodyTurn`, which is schema 8 (#494, #497).
- **A Damocles Floor Label shows the Floor.** Every structure wall text that
  prints the Floor Label now draws the label's character in its own font, right
  after the face it rides on and wherever that face is drawn. That is `G` on
  Floor 0, the digit on Floors 1 to 9 and `B` on Floor 10. The State Office
  lift shows `G`, `1`, `2` and `B` beside each car's doorway. During a ride the
  label steps through each Floor passed before the destination binds. A font-4
  label draws in font 3 while READING GLASSES or RED HERRING is carried. A
  structure with no Floor Label record draws none (#477).
- **A Damocles lift ride plays out as the ST's does.** A Floor key in a lift
  now pins the car's door shut, even with the player standing beside it. Once
  the door is shut, the Floor Label steps one Floor every 25 VBLs through each
  Floor passed: 2 to B shows 1, then G, then B. The player arrives 25 VBLs
  after the label shows the destination. The arrival binds the Floor's
  structure, sets the height and levels the view, and keeps X, Z and the
  heading. It asks for the same sound a take does, and the new Floor's door
  then opens around the player. A key for another bound Floor during a ride
  replaces the destination, and the region holds until the ride arrives.
  Nothing else is drawn: there is no fade and no camera movement. The door
  closes at the port's one attachment rate, about 46 VBLs for the State Office
  car against the ST's 30, because the rate for each door is not decoded. The
  page publishes
  `data-floor-label` and `data-ride-destination`. The Save carries a ride in
  progress and the doorway last crossed, whose door the next ride pins. That
  is schema 8, and a schema-7 record is refused whole (#476).
- **Damocles players can ride a lift between Floors.** On foot in
  a structure region whose flags have bit 13, the recovered keys ask for a
  Floor: `1`–`9` for Floors 1–9, `0` or `B` for Floor 10, and `G` for Floor 0.
  The ST's `Esc` also asks for Floor 0, but the Browser Shell keeps Escape for
  the System Menu. The lift refuses, silently and changing nothing, the Floor
  it is on and any Floor its Floor Table leaves zero, so in the Eris State
  Office only G, 1, 2 and B are reached. Outside a lift car the keys keep their
  ordinary meaning, and `B` still boards. The player arrives on the Floor's
  structure at Floor times storey pitch plus eye height, with X and Z kept. The
  console's `floor N` stays as an instant development shortcut (#475).
- **Damocles players can board and leave craft.** `B` beside a placed craft
  runs the recovered board gate's eight tests in order. Its reach is 1024
  units, twice the Take's. A craft boards while its Vehicle Key is carried,
  and `DART II` boards unkeyed. Without the key, the Damocles Display shows
  `VEHICLE KEY REQUIRED`, and `INTERSTELLARSHIP` shows `SHIP NOT REFITTED FOR
  FURTHER FLIGHT`. Every other refusal is silent. Boarding takes the craft out
  of Object Residence, puts the eye 63 units above where it stood, and faces
  the camera along its recovered heading. Aboard, nothing moves: the craft
  cannot be driven, and Take, Drop, the Body switch and `goto` do nothing. `L`
  levels the view and puts the craft back where the player is leaving it, as a
  direct-placement Drop would. The player is then on foot. `AUTHOR'S CHAIR`
  boards as a seatable object from Authors House's exterior regions (#416).
- **The Damocles Catalogue says what the board gate answers for each
  resident object.** Every resident instance carries a boarding block: whether
  it can be boarded, whether it boards unkeyed, as a seatable object or only
  with its paired object carried, which instance that is, and the system string
  a refusal shows. The extractor reads the gate's own constants from the
  program image rather than restating them. Eleven objects can be boarded: the
  placed craft on Eris, Gaea, Dion, Bacchus and Thalia, and `AUTHOR'S CHAIR`.
  No `SETTEE` can, and `ATTACK SHIP` records why it cannot. Each field says
  whether it is recovered or derived. The Catalogue schema is now 17 (#408).
- **The Atlas draws Road Pieces at the Street Range.** Each captured road
  cell's **Drawn Record**, the ground record it actually draws, is drawn in its
  recovered face colours and face order. That covers pads and aprons a
  placement put there instead of the **Selected Piece**. The Drawn Records
  replace the network's gold centre line, so a Settlement reads like the
  game's view from the air, with its own marking down the middle of the road.
  The swap happens at 0.003 Surface Cells per pixel, where a road is as wide
  as the line. Further out in the Street Range a road is under a pixel wide,
  and swapping there made the map shimmer. The 478 cells on the 20
  image-derived networks have a Selected Piece and no Drawn Record. They keep
  the centre line, and the status line and panel count them rather than
  filling them with another cell's geometry (#460). The centre lines are a
  fixed 2 pixels at every zoom. They were a fifth of a Surface Cell wide, which
  grew past twenty pixels at the Street Range. The Body Range now zooms twice
  as deep, halving its closest Surface Cells per pixel. `CONTEXT.md` gains
  **Road Piece**, **Selected Piece** and **Drawn Record** (#459).

- **The Gamma System does not orbit; its Bodies turn.** The 32-slot rate table
  at `$0082DC`, left semantically Unresolved since #181, is each Body's **Body
  Rotation** — the rate it spins about its own axis. `$04E970` subtracts the
  accumulator to convert a System-frame bearing into a body-local longitude on
  arrival, and the three surface passes add it back to leave that frame; the
  only things that consume the result are the celestial orientation matrix at
  `$04529C` and the day/night terminator at `$050562`, which compares it against
  a sub-stellar longitude derived from the Body's own static centre. Poking the
  rate on ERIS carries the pose from a night starfield into daylight with the
  Body Coordinate Readout unmoved. `docs/research/damocles-gamma-system.md` now
  publishes the day of every slot that has one — 23 s for AURORA, 4,181 s for
  ERIS, none at all for the star DIALIS — and records `VOID`'s fastest-in-table rate as a
  dead one with no reader. Orbit stasis is Confirmed with it: exactly one
  instruction pair in the resident image ever writes a Body centre, and it
  writes DAMOCLES's. `CONTEXT.md` gains **Body Rotation** and rewords **Primary**
  as a drawn hierarchy rather than a revolution (#439).

- **Damocles Settlement road networks reach the Catalogue.**
  `payload/damocles/catalogue.json` gains a `roadNetworks` collection: the structure
  group's run-length extent grid at `$01E000`, classified the way `$04EC30` classifies
  it, as the roads it is. Each entry carries the group's origin and island, its six
  road-piece selectors, every cell on a run with its piece, rotation and the ground
  record the class selected, and the authored runs as the network's lines. The replay is
  self-checking: the same pass writes the `$0083DC` orientation table the ground decoder
  already reads, and it is reproduced byte for byte on all 256 cells of all 22 captured
  groups. Those runs are also what the game draws from the air — the six ground-extent
  edges the pinned capture holds at `$84DC` are exactly the six runs that reach its
  window, and no others. The family is not Eris-only: 21 of the 22 captured groups, over
  20 Bodies, carry a network; Solon Base is the one that carries none, the same way
  fourteen Bodies carry a settlement with no island (#441).

- **The Gamma System's islands reach the Catalogue.** `payload/damocles/catalogue.json`
  gains an `islands` collection carrying all 62 island records across 30 Bodies: each
  record's origin in Body Coordinates, its coastline as signed Island-Local vertex
  pairs *and* the edge words the classifier scans, the authored `extent`, `core` and
  `exclusion` boxes in the order `$0560F2` reads them, its land colour, the structure
  group it binds and that group's area name. A record carries no name of its own, 21 of
  the 62 share one coastline-less stub that answers `core` everywhere — a Body with no
  island is land everywhere, in its own colour — and 33 bind no named area, so an island
  needs no settlement and a settlement needs no island. Every Body also gains
  `bodySurface`: its base colour, and the 4096 × 4096 Surface Cell extent that **wraps on
  both axes**, stated outright so no consumer reads a Body surface as a bounded plane.
  Snow Island and four of Lucan's twelve cross that seam. One coastline definition can
  serve islands on two Bodies: `$06344A` is both Eris's `CAPITAL CITY` and Dion's
  `BIRMINGHAM ISLAND` (#393).

- **Every recovered surface placement now says which island it stands on.** The
  Catalogue's live workspace placements carried `ST surface grid units (body-local
  origin unresolved)`; the origin is resolved, so they carry `Body Coordinates` and name
  the island record the Structure Workspace was built at. `CAPITAL CITY` 09-08 and
  `KEY WEST` 09-08 are body cells (73,136) and (2569,3592) — an Island-Local Cell label
  never identified a location on its own, and now it does not have to. `Damocles Place`
  deliberately gains no island field: a place is a cell in a workspace, and Lucan's
  twelve and Lachesis's ten disprove the one-to-one relation that would imply (#393).

- **Twenty-one live Damocles surface workspaces, up from three.** The arrival-pose
  memstates already held each body's loaded `$00ABDC` window, so #172's remaining
  target list was recoverable without a single new capture: eighteen further
  workspaces across seventeen bodies, plus Gaea's second window. The Catalogue
  gains 731 instances, 409 models and **37 recovered place names** — `PENN COLLEGE`,
  `IDI PALACE OF FUN`, `RESEARCH LABORATORY`, `PAN HADES ADMIN DEPT`,
  `THE TOMB OF SETH` and the rest — with nothing removed. Six of them verify a
  guide lead the location checklist had filed as secondary-source only, and
  Tolosa's currency repository turns out to carry a keyed entrance naming object
  slot 37, which resides on MIDAS, exactly as the guide claimed and without
  taking the guide's word for it. Gaea's third window is `CHALDEA METROPOLIS`,
  which closes the open item the coverage ledger recorded against
  `gaea-transporter`. Twenty-five of the twenty-seven arrival poses are now
  anchored to a recovered origin and admitted by the browser, up from seven
  (#172).

- **`arrival-poses.json` says what environment each pose was captured in.**
  Restoring a pose does not always leave a player standing: fourteen were
  captured while the machine was presenting a ten-second `NO AIR!` countdown, and
  every one of them runs the countdown out on restore — body selector `$0078`,
  VOID, `YOU'RE A BIT DEAD`. Each pose now publishes `captureEnvironment`: the
  message gate `$7BA0`, whether a message was being presented at all, the system
  string the pointer was inside, and whether that amounts to a live hazard
  warning. A lowered gate is not evidence of a safe environment — it falls long
  before the ten seconds are up — so the flag states what the capture shows and
  not a per-body atmosphere rule. **A validated arrival pose is not a survivable
  one**, and the payload no longer leaves that to be assumed (#172, #326).

- **Every Damocles body that carries a resident object now has a validated
  on-foot arrival pose.** Eight captures — ICARUS, ATROPOS, CRONUS, CYCLOPES,
  SOLON, THALIA, TOLOSA and PERSEUS — were flown in play by steered craft
  flight, using the departure machinery recovered earlier under #326, and take
  `payload/damocles/arrival-poses.json` from nineteen poses on fifteen bodies to
  twenty-seven on twenty-three. On all eight the engine's cell word `$7B5C`
  equals the cell the catalogue's statically decoded resident association
  already gave for that body — a live reading meeting a static decode on eight
  bodies, with no shared derivation. None of the eight recovered a workspace
  origin, so all eight publish a null `workspaceOrigin` and are not admitted by
  the browser; the pose gap has simply moved ahead of the workspace gap, which
  is #172's work. The seven bodies still unposed are exactly the seven with no
  resident record, and that remains an open gap rather than a finding about
  them (#326).

- **Rehosted memstate containers are byte-reproducible.** `memstate-rehost.py`
  packed with gzip's default header timestamp, so rehosting one captured
  memstate twice produced two file hashes for the same machine and no
  `memstateSha256` in the pose payload could be re-derived. It now packs with
  `mtime=0`, and a container already in the pinned form is copied through byte
  for byte rather than recompressed, so `eris-spaceport-onfoot` keeps the hash a
  dozen research notes cite. Eighteen published hashes moved once as a result;
  each older value is reproduced exactly by re-gzipping the same stream at the
  original run's timestamp, and every `ramSha256` is unchanged (#326).

- **A Damocles level now names its own structure, statically.** The rule was
  the last thing `$7B0E` was read live for: which structure a floor binds, and
  therefore which association list a resident above ground level resolves in.
  It is a **floor table** in the cell instance's alias record, twelve bytes at
  `+6`, one structure slot per level, zero where the level has no floor.
  `$054DBC` publishes it in `$7C1E`, `$054DC2` takes its first entry as the
  ground bind — which is why a capture inside a building still reports the
  ground structure in `$7AF0` — and the lift at `$055B24`-`$055BD8` indexes it
  by the destination level and assembles that structure. Vesta Parliament reads
  `90, 92, 92, 93, 0, 0, 0, 0, 0, 0, 91`, so its level 10 names slot 91 by
  lookup and not because 91 is one above 90. The structure-group probe now
  derives the bound structure at every level and **raises** when it does not
  reproduce the running game's `$7B0E`; all seven interior captures pass, and
  resolving each resident against its own level's structure closes the last
  three unresolved Dion residents, taking the probe from 36 of 39 to 39 of 39.
  The Catalogue publishes the table as each alias structure model's
  `levelBinding` (#355).

- **A keyed door stays shut until you are carrying its key, and says `LOCKED`
  when you are not.** The generic Entrance Attachment handler's live-condition
  path is recovered: an `$F0` entrance tests bit 7 of the key object's own state
  byte, which the Take sets and the Drop clears, so the predicate is carrying.
  The key it wants is named by the **cell**, not by the structure record — the
  cell's `$7AFB` base plus the entrance's low nybble is the key's object slot,
  and the letter the door prints is the same number. The Catalogue now publishes
  that base as each surface placement's `keyBase`. Four buildings are keyed:
  Authors House to key A, Novagen Office to D, Vesta Parliament to E and
  Hantzens New House to B — the first three agreeing letter for letter with a
  player's item list recovered independently. Eris's own keyed-entrance cells
  install no base, so nothing there changes (#362).

- **A `SHADOWS` row on the settings page chooses the Cast Shadow edge: `OFF`,
  `SOFT` or `HARD`.** Eris's Enhanced shadows were only ever softened by a 3 × 3
  PCF average over a LINEAR compare sampler, and could only be switched off by
  choosing the Authentic sky. The edge is now the player's own preference,
  mirrored by the console's `set shadows` line, defaulting to `SOFT` so nothing
  shipped changes. `HARD` reads the same two shadow maps through a NEAREST
  compare sampler with a single tap, for a crisp edge that suits the Filled
  Presentation's flat faces; whether it becomes the Enhanced default is decided
  by the captures in `docs/research/damocles-cast-shadow-edge.md`. Authentic
  presentation draws no Cast Shadow whatever the row says (#376).

### Changed

- **Damocles Saves and Session Resumes remember the player's Floor. The
  Damocles Save Snapshot goes from schema 6 to 7, so existing Damocles Saves
  and Session Resumes are refused.** The session tracks the Floor the player
  stands on in the bound structure, 0 outside a multi-Floor structure. It binds
  the structure that Floor's Floor Table entry names, so the Eris State Office
  binds slot 78 on Floors 1 and 2 and slot 79 on Floor 10. Until the lift is
  ridden (#475), the development console's `floor N` changes Floor. It acts only
  where the bound structure's Floor Table binds N. It sets Y to N times the
  storey pitch plus the eye height and leaves X and Z alone. Binding another
  structure returns the player to Floor 0. The page publishes the Floor as
  `data-floor`. A Save restores its Floor at the same pose. A record is refused
  whole if its Floor is outside 0–10 or its structure does not bind it. No Floor
  is ever derived from the pose's height, and a schema-6 record is not treated
  as Floor 0 (#474).
- **Damocles Saves and Session Resumes remember whether the player is aboard.
  The Damocles Save Snapshot goes from schema 5 to 6, so existing Damocles
  Saves and Session Resumes are refused.** A Save taken aboard a craft or seatable
  object restores aboard it, at the same seated view, with the craft still out of
  Object Residence. Before this, a Session Resume captured aboard put the player
  on foot beside the craft. A record is refused whole if it names an occupied
  instance that is not in the Catalogue, is not boardable, or is still resident.
  It is also refused if its Occupancy and Object Residence disagree. There is no
  migration, by ADR 0044. A schema-5 record cannot say whether its player was
  aboard, so it is not treated as on foot, and a refused restore leaves the live
  session and the stored Save untouched. Targ's Saves are unaffected (#417).
- **One map: the Catalogue's marker map is the Gamma Atlas now.** The Catalogue drew
  its own pan-and-zoom map of a Body's placements, with its own gesture handling, its
  own scale readout and its own clustering; the Atlas draws the same placements over
  recovered coastlines, Settlement names and road networks, so the Catalogue's copy is
  deleted rather than maintained beside it. Each placed Instance's entry now hands over
  to `/damocles/atlas`, centred on that record's own Body Coordinates one Surface Cell
  across, which is the Street Range on any window — the reader lands among footprints
  with that Instance's own selected, and the Atlas hands the record straight back. The
  Body select and the list of every placement stay, because a list of 372 records on
  Gaea is the one thing a map is not for. `web/src/catalogue/mapView.ts` moves to
  `web/src/atlas/mapView.ts`, the Atlas being its only caller, and the clustering and
  zoom-readout arithmetic only the marker map used goes with it (#415).

### Fixed

- **A Damocles arrival Pose lands on the Floor it was captured on.** A switch to
  a Pose captured above Floor 0 used to bind Floor 0 at the capture's height, so
  `switch vesta-transporter` stood at Y 3233 on G and the lift treated it as G.
  `arrival-poses.json` now publishes each capture's Floor (`$7AA4`), and the
  extractor checks it against `$7AC4` and the eye height. The switch binds that
  Floor's structure. It declines a Floor the structure's Floor Table does not
  bind, and waits with nothing bound until the structure and that Floor are
  read. The Vesta and Eris transporter Poses now land on Floor 10, and the DION,
  GAEA, METIS, LOGOS and PAN transporter Poses on their own Floors (#505).

- **A Damocles Floor above 0 is drawn in the palette its building binds.** The
  port coloured an upper Floor's walls, floor and scene colours through the
  palette of the structure the Floor Table binds. The game uses the palette the
  building's alias record binds: its palette byte, or its per-Floor entry where
  that byte is zero. At Metis DOOBERRYS SOLICITORS on Floor 9, the floor now
  draws `#444444` as on the ST, not slot 58's own `#882222`. Vesta Parliament
  now draws Floor 2 in palette 71 and its other Floors in palette 30. The
  Catalogue publishes each Floor's `paletteIndex` and the colours it resolves
  beside the Floor Table (#493).

- **The Atlas road e2e describes the payload it ships with.** #448 recovered every
  Structure Workspace's network, so the three road tests written for #414 were
  still asserting KEY WEST and MIDAS as gaps, 1 of 5 workspaces on ERIS and 37 runs
  where the Body now has 88. Nothing in the shipped payload reaches a road gap any
  more. The gap path — both notices, the dashed square and the `gap` reading — is
  kept as a guard against a regeneration that loses a group. Its e2e now serve the
  Catalogue with a network taken out, the way such a regression would arrive, and a
  unit test does the same through `readBodySurface`. The shipped state is asserted
  as it is: KEY WEST at 17 runs, and THE MIDAS PROJECT recovered with no road (#450).

- **The Damocles Cell Readout is island-local, and a negative axis is red.** The
  readout prints the player's Island-Local Cell — the Body Coordinate less the
  *selected* island record's origin, the record nearest the player, taken signed
  across the surface wrap — two digits an axis, with a negative axis in red and a
  magnitude past 99 as `**`. It printed `**` for every negative cell before, so it
  blanked the moment the player left the bound 16-cell workspace, which now that
  islands are recovered is most of a Body. Booted at the Working Authority's own
  Capital City reading, body cell (38,136), the panel reads `26-08` with the 26 red
  beside a `008-283` Body Coordinate Readout, as the original does. The Damocles
  Session publishes the selected island beside the cell, because an Island-Local Cell
  names a location only together with the island it is local to; the Structure
  Workspace binding is unchanged. Targ's grid reference and the Flyover dashboard
  share the location readout and carry no sign, so neither changes (#397).

- **The catalogue extractor no longer places a workspace against a fabricated
  origin.** A workspace's origin comes from the world/local camera pair, which is
  only an origin while the workspace is built for the occupied cell; the engine's
  cell word implies the same origin independently. Twenty-five of twenty-seven
  poses agree exactly and two do not, and the extractor now refuses those two
  rather than publishing them. It matters: read without the check, the MIDAS
  capture claims all 256 cells hold one repeated structure at origin
  `−63807,−60502`. MIDAS and DAMOCLES therefore keep an arrival pose and no
  recovered workspace, and MIDAS still holds MAGIC CRYSTAL (#172).

- **Damocles draws what the Working Authority draws: the occupied Surface Cell,
  not the whole workspace.** `planErisFrame` re-emitted all 207 placements of
  the Eris workspace every frame, so buildings and aprons stood where the
  original shows bare ground. It now honours the bound recovered in #370 —
  ground records and Surface Structures from the occupied cell alone, objects
  from anywhere on the Body, because `$052C9C` applies no distance test to
  residents. At the arrival Pose that is 9 placements of 207, and 681 triangles
  where 18,008 were planned before, with the planner at 0.09 ms against 2.2 ms.
  The authored ground fill is unchanged: it is eye-relative and stands in for
  the native horizon slots. `camera.farPlane` stays `authored` — the Working
  Authority has no far plane in the projection sense, so there is nothing
  recovered to replace it with (#373).
- **The Body Coordinate Readout is decoded, and the Damocles Panel Rendition
  prints it.** Each field is the top ten bits of the player's body position —
  `(position >> 18)`, the z axis biased by a quarter turn — rescaled from 1024
  to 1000 for three digits, so one step is four Surface Cells and a Body spans
  1024 steps an axis. The engine's blocks at `$05935A` and `$04E390` establish
  the form, its landing-path inverse at `$04E968` confirms the encoding, and it
  reproduces the pair the Working Authority holds in all twenty-three pinned
  memstates and all six of #208's poke samples. `/damocles` opens on `016-283`
  at the Eris start pose, as the original does, and
  `location-ledger.py poses` now reports the readout and refuses a pose whose
  engine words disagree with its camera longwords (#371).
- **The Damocles ground window is the occupied cell on foot, not the 7 × 7 the
  pinned arrival capture holds.** `docs/research/damocles-eris-ground.md` read
  the wide window as latched from a higher altitude and standing because
  walking never changes the altitude byte. It does stand — until the player
  crosses a cell boundary, where `$054B84` stores `$FF` into the cached radius
  `$7B62` and forces the rebuild at `$054BE0`, which on foot reads `0` from the
  recovered table at `$00915A`. Four capture pairs show the radius drop from 3
  to 0 on the first boundary crossed, and 21 of 23 memstates already hold the
  table's own value for their altitude; the capture the original reading rested
  on is the one anomalous pose in the tree. The silent `$5F28` watch is
  explained too: a radius-zero rebuild allocates no slot to write (#370).

- The Damocles Panel Rendition's lower navigation row now stands in the
  original's order: the wide readout carries the body coordinates the ST prints
  as `016-283`, with the location cell beside it and the altitude last. The
  cell used to occupy the wide body-coordinate window, and the bearing in degrees stood where the altitude
  belongs; the compass tape already reports the bearing. `CONTEXT.md` now names
  both windows — Body Coordinate Readout and Cell Readout — and
  `docs/research/damocles-gamma-system.md` records why the original manual's
  own labels for them are not adopted.
- **The Damocles laboratory's uncited `$7A1C` throttle-toggle constant was
  removed** as unevidenced (#367) — and #371 then found the address genuinely
  is a toggle: the key dispatcher flips it with `eori.w #$ffff, $7a1c.w` at
  `$055714` to pick the sign of the `±3` nudge it applies to the throttle at
  `$7BAC`, and clears it at seven other sites. What was wrong in #367 was the
  reason, not the removal's effect on the readout: `$7A1C` is not the high half
  of a navigation longword, because the readout's words are the 16-bit `$7A1E`
  and `$7A22`. The Body Coordinate Readout's source binding (#208) stands, now
  stated as those two words. Restoring the probe field is left to a throttle
  ticket.

### Added

- `research/damocles-st/scripts/draw-reach-check.py` reports what bounds each
  family of Damocles geometry at one pose, from a capture that already exists —
  no emulator run, nothing written into the guest. Structures draw from the
  occupied cell alone (`$05A744` and `$053CC2` are reachable only from the
  `$0533D4` dispatch, which the object stream falls into on a zero word);
  ground records follow the altitude-indexed cell window; objects follow no
  distance test at all. Three gates raise rather than report, and it passes on
  all 23 memstates and 621 of 706 work-tree RAM images (#370).
- Damocles catalogue schema 14 publishes Capital Spaceport association groups,
  and Eris presentation schema 6 publishes its recovered 50 Hz script timing.
- Damocles play now supports the Capital Spaceport V.I.P. limo key's recovered
  label, pointer and keyboard take, drop, one-shot response, persistent display,
  Carried Stack, Object Residence, and schema-4 Save and Session Resume state.

### Known

- **The Body Coordinate Readout tracks the player, at a scale coarser than a
  Surface Cell.** It is not a per-Body constant, so the panel's `000-000` is a
  temporary placeholder rather than a permanently correct one. The pair is
  invariant across Occupancy and sub-cell motion — five pinned memstates
  spanning on foot, two boarded craft and a structure interior all read the
  same values — but moves over a walk of about two Surface Cells and changes
  greatly between distant regions of one Body. The evidence is supplied visual
  review evidence rather than attested laboratory capture, so the finding is
  Partial; the closed form, the unit and the origin stay Unresolved, as does a
  nearest-Site reading of the window. `docs/research/damocles-gamma-system.md`
  records it, and #371 carries the attested run and the decode (#367).

## [0.20.0] - 2026-09-18

### Added

- **The body-aware Damocles pickup, display and persistence contract is
  decision-complete** (`docs/design/damocles-body-aware-interaction.md`). It
  admits a Body for play iff `arrival-poses.json` gives one of its Poses a
  **recovered workspace origin** — not merely a cell, which every Pose has
  because the cell is read from `$7B5C`; without the anchor a Pose's cell cannot
  be related to any resident placement, which is exactly what a take needs. Four
  Bodies qualify from seven Poses; eleven more carry an implied origin, which is
  a navigation lead and not an anchor. Object Residence stays keyed on parent,
  level and insertion group, because a scene is identified by structure group and
  cell and the parent instance identity already carries both — and it gains the
  storey-pitch inequality as a restore-time check. Every recovered rule is
  implemented and tagged **observed** or **derived**: omitting the unobserved
  model-form and height gates would not leave a hole, it would silently admit
  drops the original refuses. The console body switch names a **Pose id**, is one
  commit, validates before it commits, and materialises residence lazily so the
  Catalogue stays the authority for every object nobody has moved. Capacity,
  carried staging, the draw queue and every special-item consequence are
  recomputed; the Carried Stack order, briefcase overflow store, scroll counter
  and handling bit 7 are stored. The per-Body/object acceptance matrix is
  generated from the payload rather than enumerated, so research deliveries grow
  it without editing the contract.

- **The Damocles Pose names its Body, and save identity pins bytes rather than a
  declared version.** `ErisPose` becomes `Pose` carrying its Catalogue Body id,
  so a standing position cannot be applied to the wrong Body by losing track of
  which one it came from. `erisSchemaVersion` — one Body's presentation schema
  number — becomes `presentationSha256` over every Damocles presentation document
  together; a per-Body set was rejected because identity would then vary by which
  Bodies the player had visited, so two saves of the same game would refuse each
  other. Making that identity mean what it says required the loader to yield each
  document's text alongside its parsed value, so `TitleRuntime` gains a
  `PayloadDocument`. The payoff is that an edit to `eris.json` bumping no declared
  version still refuses a save written before it, which `erisSchemaVersion` could
  not detect.

- **Damocles object placement is observed above ground level, and `$7AC5`/`$7AA5`
  are one quantity.** The drop research recovered two placement paths from
  instructions and could exercise neither above level 0, because every replayable
  pose was outdoors with both level bytes zero — which left the model-form gate,
  the height gate and the `$7AC5`/`$7AA5` identity unsettled and blocking #318.
  The #326 captures put the player *inside* structures at levels 1, 4, 9 and 10
  carrying four objects, and live drops from two of them close it. At level 10
  (`vesta-transporter`) the **direct** path writes every documented field: X and Z
  from the player, Y as eye minus 63, and an Association B of `$38080A64` whose
  level byte is `$0A` — the same value both `$7AC5` and `$7AA5` hold. At level 9
  (`metis-transporter`) `FILOFAX` supplies the rank the carried `KEY - 22 CV`
  requires, so the rank check passes and the **support** path runs: the placed
  object takes the support's X and Z rather than the player's, all four bytes of
  its Association B, and Association A bytes 1 and 3 while keeping its own class
  byte, and its Y is the support's `1350` plus a model maximum of `30` — below the
  player's `1413`, so the height gate accepts. Both gates are therefore reached
  and both accept. **Neither has been observed refusing**: no support in reach at
  any captured pose has a model top above the player's eye or an unadmitted header
  type, so the refusal branches stay recovered-from-instructions only, recorded as
  a bounded observation gap rather than as unrecovered behaviour.

- **Gaea structure group `$0F` is bound to a live workspace: CHALDEA
  METROPOLIS.** The `gaea-transporter` capture restores with `$794E=$0F`,
  `$7A6C=$024AB4` and an `$ABDC` table identical to the static decode — the same
  test that bound group `$07` to UR City. This closes the named-workspace gap
  #324 recorded, and with it the rule that workspace disambiguation precedes
  every Gaea placement claim. Thirteen Gaea residents hang off the record,
  including `KEY - 22 CV` in the very cell the capture stands in and `GOLD` at
  level 10. The gap persisted because group `$0F` is a different 16×16 window of
  Gaea — implied origin `256,768` against UR City's `512,1792` — so no capture
  taken in UR City could ever have bound it.

- **The interior association list is bound per level, not per cell.** `$7B0E`
  identifies whichever structure the game walked: at level 0 the cell's authored
  instance, above level 0 the interior. Vesta cell `$64` is the controlled case —
  `vesta-parliament-4-6` at level 0 binds slot 70 (base 90) with insertion groups
  `01 03 04 05 06 07 12 14`, while `vesta-transporter` at level 10 binds slot 91
  with `05 06 07 08`. Group `$08` is absent below and present above, and it is
  what `TRANSPORTER a · slot 68` names. This is the prerequisite the drop
  research recorded as unreached, and it gates the model-form gate, the height
  gate and the `$7AC5`/`$7AA5` identity. A resident's insertion group resolves in
  the structure bound at the resident's **own** level: across seven captures on
  six bodies, ten residents resolve and none misses, including `KEY - 22 CV`,
  `KEY - BULLET`, `FILOFAX` and Metis's `PROCESSORS CHAIR`/`DESK`. Four structure
  groups are bound for the first time — Gaea `$0F`, Metis `$03`, Logos `$08` and
  Pan `$0C`. `structure-group-probe.py` enforces the rule as a gate rather than
  reporting it. Not recovered: the static rule mapping a level to its structure,
  which is read live from `$7B0E` today.

### Changed

- **Damocles Save Snapshot schema 3 → 4, and existing Damocles Saves and Session
  Resumes are refused.** The record's shape changed — the Pose names its Body and
  `erisSchemaVersion` became `presentationSha256` — so leaving the number at 3
  would have given two different shapes one version. There is no migration, by
  ADR 0026: a schema-3 record, a Pose naming no Body, or a presentation identity
  mismatch is refused whole with its reason, and the live session is untouched.
  Targ's Saves are unaffected. The Carried Stack, display and Damocles Script
  state still to come join schema 4 without a further bump.

### Fixed

- `structure-group-probe.py` treated a capture inside a building above level 0 as
  a failed derivation, because its self-check required the cell instance's
  association root at every level. It now requires that at level 0 only, and
  above it resolves the live `$7B0E` back to its structure slot and reports it.

### Known

- The static decode of Eris structure group `$12` does not reproduce `$ABDC`
  byte 1 for cells `$3C`–`$3F`. All four Eris captures produce identical live
  bytes, so it is a decoder gap rather than gameplay state, and the `$6364`
  replacement scan is not the cause. The gate is left in place and Eris
  memstates are excluded from the probe's standard invocation.

- Damocles on-foot arrival poses now cover **fifteen of the thirty physical
  bodies**, from nineteen captures, up from four bodies. MIDAS, ACHERON, CLOTHO,
  THEON, METIS, LUCAN, LOGOS, PAN, BACCHUS, MENTOR and DAMOCLES are new, and
  DION, GAEA, ERIS and VESTA each gain a second pose at their transporter. The
  arrival cell is now **read** from the engine's own cell word `$7B5C` rather
  than derived from the camera longwords and a workspace origin, so every pose
  publishes a cell: only four bodies have a recovered origin, and derivation
  threw outright on a pose standing in a window the origin does not cover. The
  derivation survives as a cross-check and passes on all seven poses whose body
  has a recovered origin — including two captured far from the capture the
  workspace note was written against, so the origin belongs to the window rather
  than to whoever found it first. `workspaceOrigin` is null where the cell is
  unanchored and `impliedWorkspaceOrigin` always carries what the pose's own
  longwords imply, so an unanchored cell is usable now and anchorable later
  without a guess. **A 16×16 workspace is a window, not a body:** implied origins
  span 0 to 3896 per axis, and `gaea-transporter` implies a Gaea window at
  `256,768` where the Gaea note records `512,1792`. The **transporter ring is
  confirmed from the captures** — eight of the ten slots have a pose standing
  within 603 units of exactly one transporter, next-nearest 22 to 73 million
  units away, and six of those match the catalogue association cell decoded
  statically from the program image. Fifteen bodies remain, none on the ring, and
  all fifteen need the one unsolved part of the route: a flight arrival steered
  onto a chosen body. See `docs/research/damocles-arrival-routes.md` and
  `docs/research/damocles-gamma-system-location-ledger.md`.

- The remaining five Damocles pickup responses are recovered, and with them the
  script system's **busy arbitration**. Slots 181, 151, 95, 101 and 94 launch
  triggers `$05`, `$06`, `$14`, `$0B` and `$3E`, each exercised through the
  program's own object-to-script table walk. Every response is messages, waits
  and a return: three inline messages, a 500-frame wait and a 50-frame clearing
  line for KEY - EAGLE 9SE (1150 frames, 23.00 s); two messages and **no
  clearing line** for DAMOCLES FILE, which leaves its last line on the display
  (400 frames, 8.00 s); two messages and the shared epilogue for AUTHORS
  COMPUTER (450, 9.00 s); one message and the epilogue for MAGIC CRYSTAL (250,
  5.00 s); a 150-frame wait, three messages and the epilogue for CASH REGISTER
  (800, 16.00 s). **None writes any world, object or record state**, so the
  responses need no new Host Callout effect — only a pending-trigger index, two
  more arming bits, a cross-script return stack and the display duration as
  state. A pickup while a script is running is **queued only when bit 5 of its
  arming byte is set** and discarded otherwise; a second queued index replaces
  the first; and a queued response **nests inside the script it interrupted**,
  because the interrupted script clears the busy flag one instruction before it
  returns. All six pickup triggers are one-shot, nothing in the program re-arms
  one, and none of the five objects is reachable by an ordinary route — the
  placements the location ledger records remain the blocker. See
  `docs/research/damocles-pickup-responses.md`.

- Damocles carrying capacity, refusal and special carried items are recovered.
  The Carried Stack is a **rotatable** byte list: a take pushes at the head, a
  drop removes the head, and two rotate actions move the head around it — so the
  object a Drop removes is the one the panel names, **not** necessarily the most
  recently acquired, which contradicts `CONTEXT.md`'s Carried Stack entry and
  needs a glossary amendment. Capacity has **one** comparison, and it is an
  equality against `$7A04`, so a count already above capacity is accepted; the
  word has exactly four references in the whole image and no initialiser. The
  count feeds a **twenty-segment panel gauge**, doubled unless capacity is 20,
  which is why ten objects and twenty objects both read as full. **BRIEFCASE**
  (slot 108) raises capacity to 20 on take and puts it back on drop, and the
  reverse is not a discard: a drop with more than ten carried **stores the
  overflow inside the briefcase**, presents system string 1 and truncates the
  stack, and taking it back merges that store to the tail — an exact round trip,
  reproduced. Taking it is refused at capacity before it can expand. Either
  **ANTIGRAV** (slots 157, 158 — one reference each in the whole image) overrides
  the bit-5 refusal and **nothing else**, which makes all twenty-one craft-class
  objects takeable; carrying both adds nothing, and the override follows the live
  handling bit rather than stack membership. It does **not** override the bit-4
  refusal: that has a separate, earlier bypass keyed on resident slot 0, and the
  fourth test's operand is **self-modified** by the restore path at `$055190`.
  The drop's rank comparison is settled — the dropped object's bits 2–3 demand
  and the support's bits 0–1 supply, which is the opposite way round from the
  payload's field names — and carrying `DOOR KEY A` skips it. Three paths that
  are not the input handler are recovered: a scripted gift that skips every gate
  but capacity, a scripted removal that takes an object out of the world by
  identity, and script opcodes that write and test the handling byte directly.
  `$0543FA` is an environment hazard evaluator conditioned entirely on carried
  objects — `ACME UNIVERSAL` suppresses every warning, two `PRESSURE SUIT`s, two
  cold items and two heat items gate the other three — and it runs on drop but
  **not** on take. Thirty-eight checkpoint cases against the original handlers
  reproduce capacity, every handling class, both ANTIGRAV overrides, the whole
  BRIEFCASE cycle, the shared refusal words and the monetary check. The identity
  of the `$055190` restore path is recorded as a **blocker**: the original's own
  persistence format for the Carried Stack is not recovered. See
  `docs/research/damocles-carry-capacity.md`.

- The general Damocles object drop and residence rules are recovered. The
  handling byte at `$6FAA` is four independent fields, and the drop handler's
  rank comparison is now resolved: bits 2–3 are the support rank the **dropped**
  object requires, bits 0–1 are the rank the **selected** object supplies, and
  the handler refuses unless supplied ≥ required, with zero on either side
  refusing. The nearby-support branch is **not opt-in** — any drawn resident
  within distance exponent 6 (other than slot 74) forces it, so an unsuitable
  neighbour refuses the drop outright instead of falling back to the ground.
  Carrying an object stages it in body VOID (`$78`) with its whole Association B
  cleared, so residence belongs to the body byte a drop writes and never to the
  bound structure. Draw membership is rebuilt from residence at every region
  change and is therefore derived, not saved. Drop always acts on the head of the
  Carried Stack, and a multi-object drop issues one more sound request and queue
  rebuild than a sole-object drop. The Trading Post credits a sale **before** its
  placement checks run, so a refused sale drop has already paid. Two new
  ordinary-route refusals are
  observed for the first time: the inventory-label scroll window refuses a drop
  pressed 0.2 s after a take and permits the same drop 3 s later, and a take
  refused by the handling byte leaves the Carried Stack, the scroll counter and
  the script untouched, moving only the message gate. A quantified blocker
  replaces the previous silence: the only replayable arrival pose has exactly one
  takeable resident in reach, and the Dion, Gaea and Vesta memstates cannot be
  restored at all, so support placement and multi-object ordering remain
  instruction-derived. New probe
  `research/damocles-st/scripts/object-drop-probe.py`; see
  `docs/research/damocles-object-drops.md`.

- The Gamma System location coverage ledger is established. Across 241 resident
  object instances, **210 are takeable**, **34** have a recovered surface
  location and **195** are interior-associated — of which only **two**, both
  Eris keys, have a recovered parent and local placement. Twenty-two of the
  thirty physical bodies carry residents; eight carry none, and no body is
  called unlandable for it. Four bodies now have a **validated on-foot arrival
  pose** — Eris, Dion, Gaea and Vesta — each read from a live capture and each
  independently reproducing the cell its workspace note already records, and all
  four are published in the new `payload/damocles/arrival-poses.json`. All six
  pickup-trigger objects, BRIEFCASE and both ANTIGRAV instances are accounted
  for; five of the six triggers and all three special items are unreachable
  because they have selectors and no parent. One new blocker is named: Gaea
  carries two recovered 16×16 workspaces under the same origin qualifier and
  cell `$17` names a different place in each, so a cell selector is not a place
  identity and 99 CHEVY's island assignment is Unresolved. See
  `docs/research/damocles-gamma-system-location-ledger.md`.

- The Damocles message reveal model is recovered. The routine behind the message
  gate is `$052402`, called once per display frame from the frame interrupt. The
  panel message row is **48 six-pixel character cells** — 288 pixels, six
  scanlines, at scanline 144 — and a record enters it **from the right at eight
  pixels per frame for 36 frames**, which is 4/3 characters a frame; on the 37th
  the finished row is copied into the other screen buffer, and it is then held,
  untouched, until the duration expires. So the recovered 200 frames divide into
  **36 of arrival and 164 of reading hold**, with no departure: the row keeps its
  last message until the next scrolls over it, which is why the limo-key response
  ends by presenting a line of spaces. Character *k* of a record lands in cell
  *k*, so there is no centring and a record's leading spaces are the original's
  own. A record shorter than the row arrives padded with blanks; one longer is
  shown in 48-character blocks. `$0523B8` counts display frames — it advanced in
  exact lockstep with `$7B9C` at all 215 stops of every trace, closing the pickup
  note's open question — except that the native system-string helper's
  `$0523BC` flag cuts a message to 50 frames once its text runs out. **No input
  ends a message early**: a decode of all resident RAM finds fifteen instructions
  naming `$7BA0` and only the routine's own completion lowers it, and the
  response ran unchanged with eight keys and the joystick fire bit held down.
  Damocles has no equivalent of Targ's skip. The reveal is also audible — one
  YM2149 channel A tone per frame, pitched from that frame's character —
  recovered statically, with sound off in the laboratory. The limo-key
  interaction contract's `Reveal` seam takes the recovered shape, and its
  expectation of a revealed-character count is corrected: eight pixels a frame
  through a six-pixel pitch is not cell-granular. New tracked
  `message-reveal-probe.py`; no application behaviour change (#307).

- The Damocles display frame rate is recovered. The Working Authority runs in ST
  low resolution and **never programs the Shifter's sync mode**: a static pass
  over the resident image finds no reference to `$FF820A` or `$FF8260` — while
  finding the video base at `$059984` and the palette base at `$05090C` and
  `$051DA0` as positive controls — and change watchpoints armed from power-on
  through the loader, the title screen and the first world's load report only
  EmuTOS's own two writes at `$E10348` and `$E104F6`. The field rate is
  therefore the machine's, it cannot vary by scene, and on the PAL machine the
  Novagen UK release was sold for it is 50 Hz, measured at 50.053 Hz and 160256
  cycles per field against the 60 Hz laboratory default's 133604. So one display
  frame is 20.0 ms and the recovered 200-frame wait and message durations are
  4.00 s each, correcting the pickup note's laboratory figure of about 3.3 s. A
  debugger poke of `$FFFF820A` mid-session moves the rate and the program never
  writes it back, four pinned scenes read identically, and the derived walk rate
  at 327.68 units per second is re-checked and unchanged. `time.vblHertz` is
  recommended at 50 with provenance `derived` rather than `authored`. Atmospheric
  flight and VOID were not reached and rest on the program-wide argument. New
  tracked `display-mode-probe.py`; no application behaviour change (#305).

- The Damocles object-selection rule and take range gate are recovered. `$7B46`
  and `$7B42` are not an input-path calculation: the scene pass that draws
  objects writes them once per object as a running minimum, so `$7B46` holds the
  nearest drawn object's slot and `$7B42` the binary exponent of its distance
  from the eye, both reset to `$7FFF` at the top of every pass. The measure is
  therefore a distance, computed through the program's own log-table float
  (exponent in the high word, 12-bit mantissa in the low), and the take
  handler's `≤ 8` admits a distance under 512 source units — 1/128 of the
  surface-grid unit the payload's positions already use. Nine runs of the new
  tracked `object-selection-probe.py` bracket the gate at runtime between 281.4
  units taken and 521.4 refused, and two approach runs match the sampled
  exponent and mantissa to the log tables' own granularity. Candidates are the
  current body's surface residents plus the room's own object list; a resident
  in neither is never selected. Selection is identical aboard a craft. The
  carried-object coordinates the pickup research left open are written by the
  scene rebuild at `$052D42`, which parks the whole Carried Stack on a fixed
  column (#303).
- Every resident-slot instance in `payload/damocles/catalogue.json` (schema 13)
  carries `handling`, the interaction byte at `$6FAA + 4*slot` decoded: bit 4
  refuses a take silently, bit 5 diverts it to a refusal message, bit 7 is the
  live carried flag and the low nibble is the drop handler's rank pair —
  `suppliedSupportRank` in bits 0-1 and `requiredSupportRank` in bits 2-3. All 241
  resident slots with a model carry it — 161 ordinary takeable objects, 49
  pieces of furniture, 21 craft that refuse with a message and 10 unlabelled
  slots that refuse silently — and it is null on every other instance (#303).

- The Damocles Script bank's message text is extracted into
  `payload/damocles/strings.json` by the tracked `damocleslab.strings` extractor:
  the whole 64-slot system string table at `$070000` and all 206 inline `$01`
  messages, with per-record source addresses and SHA-256 digests over their
  stored text. Records are ASCII, NUL-terminated and word-aligned, carry no
  formatting code of any kind, and are stored with their padding intact, because
  the pool's centring is a presentation fact #307 still reads. The pool is
  variable-length and packed rather than the fixed 49-character `$32`-stride
  field it looks like: thirteen of its 36 distinct records are shorter and one is
  empty. The limo-key contract's four message ids — `script2-inline-1` to `-3`
  and `system-string-50`, whose 49 characters are all spaces — resolve, and all
  14 indexed `$14` sites name slot 50 with none taking the indirect `$7A42` path.
  `web/src/damocles/strings.ts` validates the document whole on load; no surface
  reads it yet (#304).

- The Damocles Catalogue draws AUTHORS COMPUTER and TELEVISION, whose `$CCA0`
  vector-text tokens were a named `liveText` gap because independent captures
  disagreed about the lettering. `$CD9C`, `$CDCE` and `$CE6A` are not live
  strings but descriptors `[character][NUL][index word][NUL-terminated frame
  script]`: across ten independent captures the script is byte-identical and the
  character is always `script[index]`, so the script is model data and the index
  is a free-running phase like `$7888`. Each object offers eight evenly-spaced
  `text-frame-n` forms — AUTHORS COMPUTER's 12-frame `IPQRQPIMNONM` in font 2 and
  TELEVISION's 697-frame run through all 63 printable font 5 glyphs — and both
  records move from partial to decoded (#279).
- Every `$6000` vector-text record in the census is inventoried by a test. All 41
  set the inline flag and none selects font 4, so the indirect text pointer and
  the state-conditioned font 4 are paths the decoder fails closed on rather than
  forms left to recover, and the ledger no longer presents them as unexplored
  (#279).

- The Damocles Catalogue turns building details 6, 7, 8, 68 and 69 in the
  structure-scaled frame `$053D74` actually uses. `$054D98` installs the placing
  record's X/Z scale bytes at `$539CE`/`$539D2`, `$053B4A` scales the pivot the
  same way and `$053D52` scales each vertex before the turn, so a nonuniform or
  mirrored structure changes the shape of the turn. Each detail keeps one model
  identity and carries a set of sampled `$7888` angles per frame that places it —
  detail 7 covers five frames including 4×2 and −4×−2 — and each of the 11
  placing surface assemblies offers the same angles on its combined form. No
  record is left carrying the `articulated` omission (#278).

- `research/damocles-st/scripts/stx-inventory.py` inventories the Working
  Authority Pasti STX by structure and reconciles it against captured RAM. The
  image holds 164 track records: cylinders 0-79 formatted on both sides, only
  cylinder 0 side 0 readable as ten standard sectors behind an executable boot
  sector, cylinder 1 side 0 the copy-protection track (512 fuzzy-mask bytes, an
  unstable CRC-failing sector and a bogus id with no data record), and 158 raw
  track images the game reads with its own loader. No resident table or bank
  appears verbatim in that payload, so it is packed and the protected sectors
  are not a second, directly readable model bank (#280).
- `docs/research/damocles-disk-loads-and-bank-extents.md` records the disk-load,
  bank-extent and visual-replacement inventory, with its residuals (#280).

### Fixed

- A headless Damocles ST laboratory run could freeze for ever behind a modal
  macOS dialog, leaving an empty run directory and an emulator at 0% CPU. There
  are two causes and `sample <pid>` distinguishes them: an error-level Hatari log
  message opens an alert, which `build_hatari_command` now suppresses with
  `--alert-level fatal` (`--log-level` does not cover it), and AppKit's
  restore-windows prompt blocks the app once it has crash history, which needs
  `defaults write org.hatari-emu.Hatari ApplePersistenceIgnoreState -bool YES`
  once per machine. Both are written up in
  `research/damocles-st/HATARI-RESEARCH.md`.

- The Damocles Catalogue presented object slots 248-255 as fixed model
  identities. They are a world binding: `$055026` consumes the world's
  resident-object stream and at `$05503C` copies one pointer-table entry onto
  the entry's own slot, filling downwards from `$3FC`. Across ten pinned
  captures slots 250-255 land on a different model between Eris, Vesta and
  Gaea, so those records now carry the qualification and name the worlds that
  bind them elsewhere. The extractor raises if a capture repoints a slot below
  the block or at an address the table does not already hold (#280).
- The catalogue's two drop rank fields named their roles the wrong way round.
  The drop handler at `$0545AC`–`$0545D2` reads bits 0-1 of the support as the
  rank it supplies and bits 2-3 of the dropped object as the rank it requires,
  so `objectRank` and `supportRank` are now `suppliedSupportRank` and
  `requiredSupportRank` (Damocles catalogue schema 13). The extracted values are
  unchanged; anyone reading the old names would have inverted the comparison and
  admitted drops the original refuses (#332).
- Articulation about the zero axis turned the wrong way. `$053806` and `$053DB2`
  read Z before X; the catalogue read X before Z, which reversed the turn and
  its truncation for five of the six articulated objects as well as for details
  6 and 7 (#278).

### Changed

- EXPLOSIVE-ARMED! draws its `$CD14` readout as the disarmed `0.00` rather than
  nothing. `$04DAFC` formats that field as `M.SS` from the armed deadline less
  the clock at `$793E`, floored at zero into `$786A`, and every pinned capture
  reads the floor. It is the catalogue's one remaining `liveText` record: the
  running countdown is live mission state and stays a named omission (#279).
- Damocles catalogue schema 10: a mesh's `articulation` record names the `scale`
  frame and `sampledAngle` of the form it belongs to (#278).
- The three Damocles pointer-bank extents are no longer provisional. Each entry
  count is bounded above by the first record's own preamble and below by every
  entry decoding, and each bank is bounded by hundreds of zero bytes and an
  independently recognised follower; the extractor measures all of it and raises
  if a bank reaches its follower. Ten pinned captures agree byte for byte on the
  surface, building-detail, ground and glyph banks, and all 212 unique object
  records decode identically in every captured world (#280).
- The `$DF` attachment branch is accounted for rather than unexamined. `$059F64`
  reads the nine-record `$6364` table and substitutes character `$DF` for an
  entrance label glyph, while `$04ED4A` replays the same table over the rebuilt
  `$ABDC` cell workspace to replace or clear an already-resident surface
  assembly; neither introduces a record. The table is empty in every pinned
  capture, which is now stated as the bound it is (#280).
- Damocles catalogue schema 11: `tables[].extent` carries each bank's measured
  bounds and `models[].worldConditionedSlots` names the slots a world binds
  (#280).

## [0.19.9] - 2026-09-15

### Added

- Damocles ground references `$F0`/`$F4` are now evidenced as preprojected,
  camera-dependent horizon joins rather than neighboring-cell model vertices;
  the Catalogue keeps their local polygon portions and classifies the missing
  horizon points as view-conditioned (#173).
- The Damocles Catalogue proves the 133 first-world cells sharing `$01E790`
  reference one fully decoded intentional empty ground record: `$056634`
  returns on its initial zero command, so the visible green belongs to a
  separate surface/background path rather than a fabricated default-cell quad
  (#173).
- The Damocles Catalogue places Dion's live `$ABDC` workspace (140 surface
  assemblies at `dion-surface-*`, including unnamed cell 2,3) from a Hatari GUI
  memstate without borrowing Gaea Birmingham place names (#173).
- The Damocles Catalogue places Gaea UR City's live `$ABDC` workspace (22
  surface assemblies at `gaea-ur-city-surface-*`, including cell 4,2) from a
  Hatari GUI memstate without replacing Birmingham `gaea-surface-*` identities
  (#173).
- Damocles first-world ground `$7000` records now compose 74 cell-local
  placements through six existing address-based object models; the source
  loader disassembly also corrects the former `$53F76` road-template
  interpretation (#173).

## [0.19.8] - 2026-09-15

### Added

- Building-detail `$60xx` vector text now preserves seven formerly unresolved
  exterior records, including Vesta Parliament's live filled `E` entrance marker
  from token `$91` (#173).
- The Damocles Catalogue places Vesta Politburo City's live `$ABDC` workspace
  (19 surface assemblies including Vesta Parliament at `vesta-surface-64`) from a
  Hatari GUI memstate without replacing Eris ground identities (#173).
- The Damocles Catalogue's per-body Surface placement map zooms and pans: wheel zooms about
  the pointer, drag pans, `+`, `−` and Fit all buttons and the same keys with arrow panning
  work from the keyboard, and a readout states the zoom, the span in surface grid units and
  the grid square. Opening a placement frames its local cluster, so the Eris capital's
  16×16 workspace separates into cells, a lone outlier opens at 8×, and Back keeps the view.
  Coincident pins are never merged; the selected pin stays above overlaps and the note says
  when another placement shares its position (#175).
- Damocles Catalogue recovers Gaea Birmingham Island's authored surface-assembly map and
  seven source place names from the pinned first-world place pool, so 99 CHEVY inspects
  with neighbouring assemblies and no invented place labels (#172).
- Exact-VBL Damocles panel readout probe (`research/damocles-st/scripts/panel-readout-probe.py`)
  for the impact clock, `016-283` digits, and boarded speed field (#208).

### Changed

- Working-Authority notes pin the impact clock at `$793C` (signed remaining seconds) and
  `016-283` at `$7A1C`/`$7A20`; boarded `+ 000 000 NNN` still has no integer RAM cell.

## [0.19.7] - 2026-09-14

### Fixed

- A closed Entrance Attachment fills the opening it covers. Leaves rise to the soffit
  spanning their closed rectangle rather than to the structure's lower wall band, so Eris
  STATE OFFICE's north entrance no longer shows the interior above its closed doors.
  Capital Spaceport and Structure 75's three 110-high doorways are unchanged (#249).

## [0.19.6] - 2026-09-14

### Added

- On foot at Eris STATE OFFICE, Structure 75's `$8200` two-leaf Z entrance opens, admits its
  doorway strip and re-closes from its own recovered Attachment Constructor and Proximity Box,
  on the same generic path Capital Spaceport's `$4200` two-leaf X entrance uses (#243).

### Changed

- On foot at Capital Spaceport, the Entrance Attachment interpolates and re-closes from the
  recovered Proximity Box instead of the sticky Entrance Latch. Eye motion is a selected-region
  AABB clamp (doorway X 1311–1489, region 2 only when fully open) (#238).
- Damocles Catalogue schema 7 carries each Entrance Attachment's control word, Attachment
  Constructor, slot, closed mesh and Proximity Box, and names every region's Region Gate and
  inset axis; `$0200` stays an unconditional passage with no invented attachment.
- `/damocles` binds one Structure Workspace from the current cell and keeps its per-slot
  attachment progress, so region selection and the ±11 eye clamp apply only inside the central
  half-cell while leaves may still re-close outside it. Damocles Save Snapshot is schema 3,
  carrying the bound instance and its per-slot open units; schema 2 is refused. Eris
  presentation schema 5 drops the `spaceportEntrance` special case (#243).

## [0.19.5] - 2026-09-14

### Added

- On foot at Capital Spaceport, Plan Refusal blocks Structure 74's grounded vertical walls
  and the closed Entrance Attachment. The session-owned Entrance Latch opens the doorway on
  first entry to the recovered Proximity Box and stays set for the rest of the session
  (#237).

### Changed

- Eris presentation schema 3 names `spaceportEntrance`. Damocles Save Snapshot v1 is
  unchanged: the latch is not persisted, and a schema-2 Resume identity is refused.

## [0.19.4] - 2026-09-14

### Added

- `/damocles` Enhanced presentation lights Eris structures with the authored sun in
  `web/damocles/eris.json`, hemisphere ambient, and softened directional shadows. Sunlight
  through the spaceport window is an opening by omission, not aperture logic. Authentic stays
  the existing flat frame (#231).

### Changed

- The Eris lighting block now names authored sun and ambient colours and turns shadows on.
  The Damocles boot reads the Presentation Preset on each draw; switching sky in Settings
  republishes the frame without a reload.

## [0.19.3] - 2026-09-12

### Added

- `R` toggles running, on foot, in both Titles. It latches rather than following the key, as the
  Working Authority's run key does, so releasing held keys on a blur or a System Menu leaves it
  on; the latch belongs to the Control Profile, so no Save, Session Resume or trace carries it.
  R does not also answer a Benson poll, for the reason firing does not (#205).
- `/damocles` honours running at all: the Eris on-foot Mover lengthens its step by a new
  `walk.runMultiplier` in `web/damocles/eris.json`.

### Changed

- Shift no longer runs, and is the browser's key again.
- Exact-VBL Working Authority traces replace Eris's authored run factor: `R` changes each
  forward update from `$30` to `$50` (`5/3` times) and the initial north-facing turn from
  `$10` to `$18` (`3/2` times). The browser retains derived seconds-based base rates because
  the original applies quantized, heading-dependent updates on its render/game loop rather
  than once per VBL (#205).
- The run lamp reports the run toggle rather than movement, in both Panel Renditions. It is the
  only feedback a latched key has, and it stays dark aboard a craft, where running moves
  nothing. In the Targ rendition it is the lamp beside SPEED, which until now was the attack
  lamp: Targ has no attack warning, so that lamp never lit and the toggle had no feedback
  there at all (#205).

## [0.19.2] - 2026-09-12

### Fixed

- `/damocles` selects recovered structure region queues and Building-detail face lists by
  viewer position. The spaceport arrival draws 18 plan primitives, the closed two-leaf door
  attachment and the 29-face on-foot detail default (#225).
- The authored structure choice is now `structureFallback`, used only for unavailable
  selectors or unmatched regions. Its spaceport assembly excludes the baked resident key.
- Detail-list decoding aligns odd-addressed face-stream endings to the next word boundary,
  recovering 22 additional detail selectors and three additional structure selectors,
  including the structure at Eris cell `$52`.

### Changed

- Catalogue schema 6 carries region queues, detail list groups and static attachments;
  Eris presentation schema 2 names the fallback explicitly. Inspection variants retain
  their geometry. Door animation, structure-active gates and resident insertion remain
  unimplemented.
- The regenerated payload contains seven complete structure selectors and 44 detail
  selectors. Selection preserves boundary conventions, list order and empty lists, with
  triangulation cached across viewer-position changes. Regression tests cover extraction,
  validation, transformed positions, component order and browser views at the window,
  doorway and inside the spaceport.

## [0.19.1] - 2026-09-12

### Fixed

- `/damocles` no longer shows sky through the Capital Spaceport's window. On foot the Working
  Authority draws every structure's plan walls and its building detail together, and from the
  start pose the detail's default face list leaves the window open, so the interior belongs in
  the walk. The spaceport now draws the catalogue's `combined-closed` variant, named in
  `web/damocles/eris.json` under a new `structures` section with provenance `authored` because
  the original selects faces by viewer position and that selection is not modelled (#223, #225).

### Changed

- The Eris document validator shares the door state and view vocabulary with the catalogue
  parser, and a structure with variants but none of the named view fails the boot instead of
  drawing another variant. The catalogue's `kind` list is a constant too.
- `docs/research/damocles-structure-draw-selection.md` records the draw dispatch, Structure 74's
  twelve regions and their plan queues, and Building detail 88's conditioned face lists; the
  spaceport interior note now says twelve regions rather than eleven.

## [0.19.0] - 2026-09-12

### Added

- `/damocles` mounts the shared Browser Shell host: System Menu, settings, three Title-scoped
  Saves, two-press New Game and the Shell Console. Damocles Saves hold today's Session State
  (pose and elapsed) on `mercenary.browser-shell.damocles.save.v1.slot-N` and share one codec
  with Session Resume; Targ's un-namespaced slots are untouched (ADR 0044, #224).
- The Damocles Shell Console answers `help`, `set`, `save`, `load`, `where` and Eris-cell
  `goto`; Targ-only verbs are refused with a reason. Settings still write the global prefs and
  do not restyle Filled Presentation or the Damocles panel.

### Changed

- Damocles Session Resume uses Web Lock ownership and the one-second checkpoint cadence Targ
  already had, instead of an unlocked five-second write.

## [0.18.1] - 2026-09-12

### Fixed

- `/damocles` draws ground under the whole walk again. A recovered ground record covers only its
  decoded polygons, so filling only the cells without faces left the rest of the spaceport cell as
  sky; the authored fill now runs under the first-world workspace, one unit below the recovered
  faces at `y = 0` so they still draw over it. `ground.extentCells` gives way to
  `ground.fillDropUnits` (#221).

## [0.18.0] - 2026-09-11

### Added

- ADR 0043 admits Damocles play alongside _The Second City_, removing ADR 0021's sequencing.
  Damocles values are governed by tagged provenance (recovered, derived, authored) and the
  glossary's **Damocles** and **Filled Presentation** entries are amended (#196).
- `/damocles` is a Browser Shell document of its own and `/targ` names the existing gameplay
  document (ADR 0041); trailing-slash forms canonicalise. `/damocles` boots a Damocles stub that
  loads none of Targ's payload (#197).
- `web/damocles/eris.json` is the authored Eris presentation document: the recovered start pose,
  grid origin, eye height and outdoor palette beside authored placeholders for heading, turn rate,
  camera, ground plane and sky, each tagged with its provenance (ADR 0043) and read by a strict
  validator (#198).
- The Eris surface is composed from the Damocles Catalogue for play: 84 recovered placements in
  raw units with exterior variants chosen, 11 named places by cell, and 21 placements whose
  geometry is unrecovered drawn as nothing and counted (#199).
- A Damocles Gameplay Session: on foot on Eris with a fixed-step Mover in Damocles units, stepped
  at the shared bound, and a Session Resume of its own under a Damocles key. The Browser Shell
  gains a `TitleRuntime` seam naming what it needs from any Title (ADR 0041, ADR 0043) (#200).
- `/damocles` plays: Eris is drawn in Filled Presentation from the Catalogue's exteriors over an
  authored ground plane, walked with the arrow keys from the recovered start pose, with the
  Damocles Panel Rendition reading ERIS, the cell, an empty inventory and a DAMOCLES badge from
  Damocles's own Session State. The Session Resume is written on suspension and every five
  seconds (#201, #202). Playwright covers the boot, the panel readouts, walking, resume, storage
  isolation from Targ and a malformed document (#203).
- The Damocles Catalogue recovers the per-cell Eris ground, pad and road family at `$01E000` as
  kind `ground` (#206). Structure 100 is named as an empty Eris placeholder rather than a failed
  decode (#207).

- The Damocles Catalogue now preserves all 195 interior-associated resident selector records
  without presenting selectors as Room, floor, or place names. Decoded structure-association
  lists expose their region-to-render-queue insertion keys, and placed residents link directly
  to their parent surface assembly.
- Resident slot 180, `KEY - 99 CHEVY`, is attached to the source-unnamed Eris structure-group
  `$14`, cell `$26` alias instance at recovered local coordinates `(-394, 200, 1846)`. The
  catalogue retains the alias, base structure, and Building detail as separate valid identities.

### Changed

- The Eris camera yaw and instance heading byte are recovered: 1024 units per turn, north at
  `$200`, rising to the right. The start view faces north with the spaceport tower on the right
  (#204).
- `/damocles` draws the recovered grey apron and white pad from the Damocles Catalogue ground
  family. Authored green fill remains only for cells whose ground record has no faces; the
  camera-following plane is omitted (#221).

## [0.17.0] - 2026-09-11

### Changed

- The Damocles Panel Rendition is re-authored on the Atari ST panel's own grid: one unit per ST
  pixel across 320 by 61 of them, with the reference's proportions, 16-colour palette,
  bottom-left bevel lighting and window geometry. The rendition now stands at its true 244-page-
  pixel height under the 1280-pixel world, so the frame stack is sized per rendition.
- Panel lettering sits on the extracted face's pixel grid at eight units a glyph. Compact
  readouts and the NAVIGATION and INVENTORY labels approximate the ST's condensed face by
  narrowing the extracted one to a four-unit advance, as ADR 0027 allows.
- The Damocles horizon and compass draw at 1x on 11-by-20 and 32-by-9 canvases, with the
  reference tick pattern, quarter letters between long ticks, a centre index and a boxed pitch
  reading on a fixed line.
- Cash prints as the Damocles readout does, nine digits in thousands to the cent.
- The duplicate Damocles panel rules in the gameplay page are removed in favour of the shared
  component stylesheet, and its classes no longer collide with the shell's own `.lcd`,
  `.plabel` and `.lamp` rules.
- The Orbital Flyover dashboard grows its navigation block to hold its longer readouts at the
  face's own advance instead of the narrowed dressing.

## [0.16.0] - 2026-09-11

### Added

- The Targ and Gamma debug routes now open a sessionless Orbital Flyover with a System-space
  Camera, deterministic overview and Body-query entry poses, ten geometrically spaced speed
  notches, and frame-rate-independent keyboard flight. Flyover movement is independent of the
  Targ Orrery clock, does not track moving Bodies, and never rewrites the URL.
- A dedicated WebGL2 renderer draws outward-wound Body spheres, a separately seeded 2,048-star
  Flyover Backdrop, adaptive finite depth planes, and black unlit hemispheres. Targ uses its
  emissive sun as the live light source; Gamma uses a Camera-position headlight.
- The Flyover reuses the Browser Shell's Damocles panel component as a trimmed, non-interactive
  navigation display. It reports the System, nearest Body, Orbital Range, speed and
  Body-relative Cartesian position directly from Flyover state without creating or reading a
  Gameplay Session.
- Strict schema-v1 Flyover presentation documents now carry Camera framing, Body-mesh,
  Backdrop and lighting contracts with authored, recovered and derived provenance. Blocking
  diagnostics stop rendering and input after document, WebGL, shader or context-loss failures.
- Deterministic unit and browser coverage exercises the render-document boundary, generated
  geometry and Backdrop, camera controls and entry behavior, nearest-Body selection, runtime
  delta capping, failure handling, shared panel rendering, and four fixed review captures.

### Changed

- Gamma's 29 recovered Bodies now use individually authored colours based on the Damocles
  System presentation instead of a uniform neutral inspection palette.
- ADR 0042 records the Camera Pose as System-space, with Body-relative coordinates derived for
  navigation displays rather than rebasing the Camera when the nearest Body changes.

## [0.15.0] - 2026-09-08

### Added

- The game now opens with the Departure (ADR 0040, #160): deep space, a one-entry carousel
  offering Targ, and on commit a ten-second journey — interstellar run, flyby past Targ's sun and
  two moons drawn from the Targ Orrery, convergence — that hands over on the exact planet-free
  Arrival Field before the `M E R C E N A R Y` title card. Enter, Space or the Commit button
  commit; a Skip control appears for the journey alone and fast-forwards journey and Arrival
  together, reaching the same game watching does. The Departure is presentation only: it gives
  the session no time and records nothing, so a Session Resume bypasses it and a reload from deep
  space returns there. New Game returns to deep space. Reduced motion is honoured automatically
  with a four-second journey. A `departure` block in `settings.json` carries the durations.
- A desktop Damocles catalogue is available directly from the game menu without starting a
  Gameplay Session. It searches and filters 539 resident object, surface-assembly, and
  building-detail models; preserves unresolved records; provides stable model and instance
  links with browser Back support; and maps 110 recovered placements across 18 bodies, including
  76 surface assemblies and 34 resident objects. The pinned first-world Eris workspace retains
  its 11 named places; other-body named places remain unresolved.
- The catalogue viewer presents recovered flat-colour geometry with orbit, zoom, reset,
  wireframe, palette/form selection, provenance, recovery evidence, related geometry, and
  linked instances. Its separately versioned private payload validates source hashes, census
  accounting, geometry references, relationships, and incomplete coverage independently of
  Targ's payload and stored sessions.
- Capital Spaceport Structure 74 now has candidate naming and separate exterior, region-1
  interior, combined, and open/closed door inspection forms. The recovered region queue orders
  all 28 plan faces, identifies its `$FF` entry as the animated entrance-door attachment, and
  places resident slot 183, `KEY- V.I.P. LIMO`, at its recovered room coordinates. Shared key
  geometry, two-character display codes, label anchors, and pickup removal are documented;
  eight formerly unresolved key models are now viewable.
- Resident slot 5, `V.I.P. LIMO`, is now plotted outside Capital Spaceport from its recovered
  Eris coordinates and raw heading, linked to its verified key and named place, and opens at a
  model-specific inspection angle that exposes its complete recovered geometry. A reproducible
  empty-inventory route verifies its `VEHICLE KEY REQUIRED` refusal; matching names and the
  recovered `+178` slot relation link all eight vehicle/key pairs while leaving unknown
  residences unresolved.
- The native Association B surface-resident selector maps 34 resident objects across 18 bodies.
  This places 99 CHEVY on Gaea from its source coordinates and heading while retaining its
  unknown named place and its key's unresolved Eris interior association.

### Fixed

- A Benson Message now rests on the Benson Display through its reading hold and then scrolls
  off the left edge, as in the original, instead of staying on the row. The hold begins at the
  first burst boundary after the last printable character, so padded indexed messages such as
  `HANGER` rest centred and then depart with their trailing padding; a message that has rested
  intact is never snapped back to its reading view. The script continues as soon as the hold
  ends, so pacing is unchanged. Save schema 13 records the display's rested state and the new
  `clearing` phase, and migrates schema 11 and 12 Saves; Arrival Narration keeps its still row.
- Damocles keys now include the twelve body faces previously lost at a misread vector-text
  record. Lettering uses the recovered 3D glyph strokes, rotates with the plate, and is hidden by
  the key from behind; the incorrect HTML font overlay has been removed.
- Correct the catalogue viewer's face orientation and handedness so recovered surfaces render
  without the earlier missing-face artifacts and the Capital Spaceport entrance appears on the
  same side as the Atari ST reference views.
- Select the Spaceport's authored aperture surrounds in exterior and combined inspection forms,
  removing coincident facade polygons that caused z-fighting while retaining a visible interior
  through the window and doorway.

### Changed

- Titles are partitioned under paths (ADR 0041): each Title will have one address and keep its
  own Saves and Session Resume. Design only; the shell reads nothing from the address bar yet.
- The Browser Shell's key router holds the keyboard for whichever opening is presenting —
  carousel, journey or Arrival — rather than for the Arrival alone. The System Menu and the
  Shell Console stay reachable throughout.

## [0.14.0] - 2026-09-07

### Added

- Metal Detector feedback now recolours all 23 Benson Display cells in both panel renditions
  and the communications strip while slot 26 is carried (#166). Readings follow the occupied
  cell's live faction flags and the recovered altitude high-byte boundary; normal text keeps
  its theme colour when the detector is absent, and journeys retain the last reading.
- Reference Lift Journeys now run at 50 Hz through entrances 1–5 and the Colony Craft route in
  both directions. Recovered camera movement, opaque colour bars, scene crossings, and sound
  phases replace instantaneous travel. The altitude instrument holds its reading during travel,
  and the final ascent bar reveals the surface above it as it shrinks downward.
- The research laboratory can capture all supported Reference Lift Journeys with `lab lift
capture`. Decoded tables, captured route timings, regression coverage, and ADR 0037 document
  the Reference behavior and the separate test-only instantaneous mode for frozen replays.

### Fixed

- Correct the shared camera and movement heading convention that mirrored the world. AIRPORT
  lettering now reads correctly, and the city boundary appears on the right at displayed 270°.
  Walking, flight, shots, craft orientation, banking, and the opening view use the recovered
  Reference Build convention while the compass retains the browser's displayed bearings.
- Lift arrival narration now advances consistently across frame sizes, and Save restore
  rejects unreachable Lift Journey phases before they can interrupt play.
- Downward entry to hangar 5 now requires the carried Pass in slot 46. An absent or nearby
  dropped Pass produces `PASS HOLDERS ONLY` without starting travel or lift sound (#166).
- Lift travel preserves the script-facing destination Room independently of the visible scene,
  including Drop during outdoor descent. Repeated lift requests are rejected, ordinary movement
  is replaced, Benson and Ship Delivery continue, and outdoor effects advance while attacker
  handling pauses.

### Changed

- Saves and Session Resume now persist the complete Lift Journey, fractional timing remainder,
  and retained detector colour. Save schema 12 migrates schema-11 headings and turn velocity
  automatically, preserving positions and displayed bearings in Saves and Session Resume.
  Schemas 10 and earlier remain incompatible.

## [0.13.0] - 2026-09-06

### Added

- The Data Payload now carries independently versioned fixed-screen object effects, beginning
  with the Reference Build's decoded Sights sprite. A schema-validated Residence-Conditioned
  Effect matrix and guarded native/Benson census account for all 31 discovered effects without
  claiming that the broader Object-Conditioned Predicate programme or `UNC-0002` is complete.
  The audit confirms Metal Detector feedback and the Pass-controlled lift as the two remaining
  browser omissions and tracks both in #166.

### Fixed

- Carrying the functional Sights object in slot 40 now displays its recovered fixed-screen
  overlay in both Presentation Presets, including Rooms, dark Rooms, and the Escape terminal
  presentation. Slot 39 remains inert, and Pickup, Drop, New Game, Saves, and Session Resume all
  update visibility from the live Carried Stack without adding Session State.

## [0.12.0] - 2026-09-06

### Added

- Enhanced twilight now grades smoothly from the authored horizon colour to the Targ sky colour
  over the first 30 degrees above the world horizon (#116). The gradient follows pitch, roll,
  inversion, mirroring, and viewport scaling behind stars, celestial bodies, ground, and world
  geometry. Full day, full night, Authentic presentation, Rooms, and the Escape terminal retain
  their existing rendering paths.

- The Shell Console now reports Targ local time with `time` and adjusts the presentation clock
  with `time <hour>:<minute>[:<second>]`. One- and two-digit hours are accepted; the Targ Orrery
  and Benson Panel update together without changing Session State, Saves, Game Semantics, or
  trace inputs. The adjustment resets on New Game and Save restoration.

### Fixed

- Enhanced road styling now includes ground-level black road edges embedded in Surface
  Structures at both Structure Reach settings. Roads and runways draw behind nearby and Distant
  Structure Ink instead of changing layer order when the player crosses a Surface Cell boundary.

## [0.11.0] - 2026-09-06

### Added

- Reference audio now plays through a project-owned bounded SID renderer (#118). A guarded
  `sound.json` payload supplies the configured C64 build's one-shot programs, lift phases, craft
  modulation, Benson Display behaviour, and stop controls; ordered Sound Cues are rendered by a
  shared synthesis core in an AudioWorklet without captured samples or a third-party runtime.
  Playback unlocks on the first trusted gesture, remains silent throughout the authored Arrival,
  follows System Menu, focus, visibility, ownership, New Game, and restore lifecycles, and fails
  safely to silence when browser audio is unavailable. Settings now include persistent master
  mute and volume controls. Sixteen isolated native-routine auditions can be rendered offline as
  paired Reference/browser comparisons without playing through the game, and maintainer listening
  accepted the resulting recognisable, reasonably accurate rendition. The implementation does not
  claim chip-exact 6581 emulation or recovered lift duration.

## [0.10.2] - 2026-09-05

### Added

- Enhanced roads and runways now have independent weight and glow controls, defaulting to fine
  lines with glow off. The settings page, `set road-weight` / `set road-glow` console commands,
  and `presentation.roads` tuning block control them separately from structures, objects and
  indoor wireframes. Choices persist across sessions and can be handed back to tuning (#162).

### Fixed

- Enhanced wireframes now have rounded line ends and softer halos. Overlapping lines combine
  their coverage before drawing, eliminating square endpoint protrusions and excessive bright
  buildup at joins and crossings. Existing colours, line-weight levels and Authentic rendering
  are preserved; the shared renderer also applies the correction during Arrival. Glow strength
  and spread now fade with camera distance, remaining full nearby and disappearing farther away,
  independently of line weight. `presentation.glowDistance` tunes the fade range in world units
  (4,096–16,384 by default), including road glow and the moving Arrival Camera (#162).

## [0.10.1] - 2026-09-04

### Added

- Nearby objects can now be taken by clicking or tapping their projected wireframes. Pointer
  targeting uses the same live Residence, visibility, reach, and Interaction rules as keyboard
  Take, scales its hit allowance with the canvas, and is disabled while shell chrome owns input.
  The shared VS Code workspace colours are also tracked for a consistent development workspace.

- The Shell Console now provides `inventory`, `get <object-slot>`, and
  `drop <object-id|name>`. Remote Get bypasses only distance and Location while retaining the
  ordinary fixed, heavy, capacity, and object-state rules; Drop resolves ids and names within the
  Carried Stack and retains airborne restrictions. Console input is displayed in uppercase.

- The Shell Console can now navigate the complete 256-by-256 unsigned surface with
  `goto <x> <z> [height]`, including heights that place a flyable craft in flight and make an
  on-foot player or non-flyable craft fall under the existing Mover. `goto object <slot>` follows
  an object's current Residence to its exact surface or Room coordinates, reports carried and
  removed objects, and reaches both remote lifts and the Colony Craft. New object and Surface
  Structure catalogues document every payload slot, named landmark, lift, and canonical structure
  placement.

### Changed

- `where` is now the Shell Console's sole location-reporting command; the redundant `location`
  command has been removed. Its output now combines Location, grid cell, Occupancy,
  position, and heading/pitch/roll orientation, with position and orientation rounded to three
  decimal places.

- Colony Craft flight and lift handling now uses the rendered top deck as its landing plane,
  preserves orbital altitude when boarding or leaving, and connects the deck to hangar room 8 in
  both directions. Occupied craft can ride either way, leave grounded on the deck or hangar floor,
  retain their landed orientation across reboarding and Saves, and become freely pitchable flight
  as soon as they clear the craft's bounds even below Targ's ordinary take-off speed. On-foot deck
  departures retain their falling tumble. Save schema 10 stores the parked-craft heading and
  refuses schema-9 records rather than inventing it.

- The Targ Benson Panel altitude readout now shows the middle/high altitude bytes rather than the
  viewpoint-offset low byte, and its altitude lamp is red while the player is aboard a craft.
  The Ending browser smoke test now also exercises a room-8 Colony Craft elevator round trip.

- The browser Ending E2E now reaches a console-assisted recovered Escape from a fresh session
  instead of planting Ending Phase 1 into a Save. It completes the opening purchase, uses the
  real Take and Board actions for the Novadrive and Interstellar Ship, rides the
  occupancy-preserving Room-5 lift, answers the launch prompt, and observes Ending Phases 1 and
  255 and the evolving 21-point Interstellar Ship Field. The Shell Console abbreviates only the
  travel between objects, so ADR 0028's boundary remains explicit: this is an integration smoke
  test, not a legal-route proof or a trace.

- Enhanced presentation now renders underground Rooms with the Atari ST-inspired solid-colour
  palette instead of the Reference Build's alternating C64 bitmap columns. Room colour identities,
  white wireframes, and dark-Room behaviour remain intact, while Authentic presentation retains
  the decoded C64 backdrop.

- Surface travel now uses the Reference Build's full unsigned 24-bit axes, wrapping at their
  boundaries instead of stopping at the city edge. The 16-by-16 Surface Structure map repeats at
  the corresponding translated coordinates, while standalone remote objects retain their exact
  positions; this makes the lifts at `81-35` and `136-136` visible and reachable. The Benson Panel
  retains ordinary coordinates through `99-99` and displays `**` beyond them. A craft moved by a
  console teleport also keeps that Residence when the player leaves and boards it again instead
  of returning to its payload origin.

- Ordinary and Distant Structure lines are now clipped to the rendered frame's four borders
  before binary32 narrowing, removing the near-camera streaks without introducing an inset
  top/bottom letterbox and while leaving Far Points unchanged. The Projection Replay Gate
  explicitly retains the frozen unclipped oracle mode.

- Benson Messages now traverse one persistent 23-cell Benson Display from right to left in the
  recovered 25-frame bursts and `$E1` pauses, including the endgame interval of 150. Both Panel
  Renditions and the communications strip show the same cells; complete fitting messages remain
  intact during their reading hold even when the recovered terminator blanks continue through the
  underlying cells. Arrival Narration remains a separate shell-owned overlay but now uses its own
  Benson Display with the same cells, bursts, and right-edge entry; Browser Shell notices remain
  separate. Recovered leading padding stays in the display feed but outside transcript text, and
  active scanout is capped so script acceleration cannot hide the scroll between browser frames.
  The old message reveal-rate setting is gone, Save
  schema 9 stores the display continuation, and schema-8 Saves and Session Resume records are
  refused. Replay Gates alone can select the frozen progressive ticker.

- Geometry decoder 9 resolves `$0E` as `.` and `$6D` as `?`, completing `NO. O-9 ?` and leaving
  no unresolved character codes in the Data Payload. All Golden Traces were re-emitted and
  verified from the frozen Trace Oracle with only its permitted decoder-version pin changed.

### Fixed

- Bank the right way. The world turns _against_ a rolling craft, so a right bank
  has to lift the right of the horizon; it was dropping it, which made a turn read
  as a turn the other way. The ground fill and the wireframe now lean together.

## [0.10.0] - 2026-09-03

### Added

- Enhanced presentation can now show every Surface Structure through a live, persisted
  Structure Reach choice in the System Menu or `set structures` Shell Console command. The
  occupied Surface Cell stays bright while distant bright Ink fades toward `#a0a0a0`; black Ink
  remains black and is drawn over the distant pass. Road Workspace links remain exclusive to the
  occupied cell. Authentic presentation always retains the
  Reference Build's occupied-cell reach. Enhanced Far Points now cover one uniformly scaled
  Reference row—four pixels at the 1280×800 view—while Authentic, Arrival and Escape points keep
  their accepted size. The tuning document still defaults independently to occupied-cell reach.

## [0.9.3] - 2026-09-03

### Changed

- The Palyar commander's related craft (slot 0) now crosses the landscape at
  the Reference Build's constant speed instead of remaining at its payload
  origin. The guarded decoder recovers the outdoor main-loop update as a
  `$0100` Z step per 20 Hz reference frame with `$100000` world wrap, and the
  Gameplay Session pauses it underground just as the original branch does.
  Presentation interpolates the fractional reference frame so the 20 Hz state
  cadence remains exact without producing close-range hold-and-jump jitter on
  a 60 Hz display. Object orientation now follows the Reference Build's six-bit
  turn lookup, making slot 0's `$20` heading face into its positive-Z velocity.

- Extreme nose-down and inverted views no longer lose the ground when the
  tangent-projected horizon lies beyond the renderer's ordinary overdraw. The
  shared Camera ground fill extends its far edge to keep the viewport covered,
  without changing the projection traces at ordinary attitudes.

## [0.9.2] - 2026-09-03

### Changed

- Surface visibility now follows the Reference Build's own selection rules (#150, ADR 0034):
  only the occupied Surface Cell's structure is expanded, below-eye Far Points follow the
  altitude-derived Horizon Distance, and the Camera has no implicit far plane, so the Colony
  Craft remains visible overhead. The occupied cell's Road Workspace now resolves all 478 placed
  point references, carrying 956 structure-edge instances out to their road junctions, while Map
  Line deduplication no longer introduces a low-altitude centre line. The frozen Trace Oracle's
  ring, unconditional Far Points and 320,000-unit far plane are explicit test rules, leaving its
  six projection Golden Traces unchanged; every-cell reach remains reserved for Enhanced
  presentation in #152.

## [0.9.1] - 2026-09-03

### Added

- The game opens in space, and crashes onto Targ (the Arrival). A star field with the panel live
  and its readouts still asterisked, Benson counting down a Novadrive and then reporting the
  failure, Targ growing from a dot to the whole screen, a fall onto the airstrip with the
  altimeter running down from eighty-two thousand, a blackout at impact, and then the crash site
  the game has always begun at. It is an authored recreation rather than a recovered sequence: the
  configured Reference Build is a crack with the intro stripped out, so what is reproduced is the
  original releases' opening, recreated by eye in the mould of ADR 0027's panels and classified as
  an `excluded-crack-artifact` rather than claimed as fidelity (ADR 0032). The commentary is the
  opening Benson Script's own — "CRASH IMMINENT," through the random landing verdict — so nothing
  new is written for the part the payload carries, and the descent's altitudes are anchored to
  those lines rather than to a stopwatch, which makes touchdown coincide with the verdict at any
  pacing. The seventeen lines before it are Arrival Narration: authored shell text quoted from the
  original releases, played through the message line and deliberately not Benson Messages.
  Nothing is Session State and the Save schema is untouched at 8 — the deliberate opposite of
  ADR 0031, whose reasoning does not transfer to a presentation that decides nothing. The opening
  script is started as it always was and simply given no time until the handover, so a Save taken
  while the field is up still restores a game with its opening to play. The Arrival plays under
  both Presentation Presets, because the Reference Build's missing opening is an artifact rather
  than an appearance Authentic should be faithful to. One key skips it, finishing the narration and
  then running the script to the join in the same fixed steps the frame loop would have given it —
  so a skipped opening and a watched one are the same game, which a test asserts by comparing the
  two Save Snapshots rather than by trusting the argument. Its pacing is a settings block of its
  own, defaulting to about the sixty-five seconds the original takes, and deliberately outside the
  settings that identify a Save.

- The Escape presents the Reference Build's terminal sequence, and matures itself (#134). The
  Interstellar Ship Field decoded by #117 has been in the Data Payload consumed by nothing; it is
  now a simulation the Gameplay Session owns and steps, at the Reference Build's fifty loops a
  second accumulated inside the browser's own step. It is Session State rather than an animation
  because the Ending Phase's move from 1 to 255 is written by the field's own colour sequence when
  that sequence reaches its last pair, and because a Save taken during the presentation has to
  continue the field exactly (ADR 0031). Save schema 8 carries that continuation boundary, and — as
  the codec has never had a migration — a version 7 Save is refused rather than guessed at.
  `planFrame` gains a branch beside the dark-Room one: an Ending replaces the world view with the
  21 points on the colour pair in force, identically under either Presentation Preset, because the
  field is recovered behaviour rather than an authored addition and ADR 0025's Targ Star Sphere is
  untouched. The respawns draw from the Reference Build's own carry-sensitive two-byte generator,
  ported to TypeScript and cross-checked against the laboratory's Python by a fixture each side
  re-derives.

- Script 7's terminal tail turned out to need no code: the interpreter already retimes the message
  line from 125 to 150, presents the congratulations, save-status and sequel lines, takes the
  optional flag-`$20` arm, and repeats the label with a zero written to each SID voice, which the
  session already surfaces as PresentationEvents. That behaviour is now pinned by tests rather than
  working by accident, including that the optional arm is a second presentation of one Ending
  rather than a second Ending. The SID writes were deliberately not rerouted into an event shape of
  their own: three frozen session traces pin the existing one.

### Changed

- The Save chooser now checks a Save's exact payload and gameplay-settings identity before
  presenting it as loadable. An incompatible Save is shown as `UNREADABLE` without its old
  location or timestamp, its LOAD action is disabled, and DELETE remains available so the player
  can clear it explicitly; the stored record is left untouched as required by ADR 0026.

- Surface Structures whose white/black split lies beyond their last line now keep black Ink,
  matching `DRAW_STRUCTURE_L96E7` instead of treating `$FF` as all white (#149). Geometry decoder
  8 corrects 86 lines shared by 26 Surface Cells, or 282 cell-edge instances in the Data Payload;
  the payload schema and document shapes are unchanged. Every Golden Trace was re-emitted after
  changing only the decoder compatibility pin in a disposable `trace-oracle-last-good` worktree,
  as allowed by ADR 0033; the frozen tag and its simulation remain untouched. Beyond their payload
  headers, only `banked`, `high-altitude`, `opening-view` and `opening-view-turned` change, and only
  from white to black Ink — `high-altitude`'s six affected lines were absent from #149's predicted
  trace list but follow from the same corrected Surface Structures. The prior trace acceptance
  deliberately retains its old payload digest and is therefore visibly stale pending human
  re-acceptance. Because Saves and the Session Resume contain Save Snapshots bound to the old
  payload identity, decoder-7 records are now rejected rather than migrated.

- An Ending is public domain state rather than a byte a caller compares against constants
  (#134). `CONTEXT.md` gains **Ending Phase** — how far an Ending's own presentation has got, as
  distinct from which Ending was reached — and `web/src/session/ending.ts` spells the pair as one
  discriminated union: active play carries no Ending, an Escape carries one of exactly two Ending
  Phases, and Defeat is a member the Reference Build recognises that nothing here produces. The
  combinations the configured build admits are the type, so "ended at phase 0" and "active at
  phase 255" cannot be written down. `BensonHostState.endingPhase` stays the session's private
  spelling, because the symbol the scripts write through is the Data Payload's `gameComplete` and
  re-spelling it needs a payload re-export; the Session Snapshot now carries the projection
  instead, so what draws an Ending no longer reaches past the Snapshot for the Host Callout's own
  state. The Replay Gate's Boolean `gameComplete` projection is untouched: the frozen Benson
  traces spell it that way and cannot be re-emitted. Presentation of the Ending, and the value
  255, remain the terminal-presentation slice's.

## [0.9.0] - 2026-08-25

### Added

- Browser Session Resume (#146). The Browser Shell now checkpoints the one active Gameplay Session
  into a versioned, exact-decoded `localStorage` snapshot and restores it after a reload or browser
  restart, without consuming or replacing any of the three explicit Save slots. Checkpoints are
  throttled during play and forced at action and lifecycle boundaries; an invalid or incompatible
  snapshot starts fresh and reports the failure through Benson's message line. A two-press NEW GAME
  command clears only the resumable session, preserving Saves and presentation preferences.

  A Web Lock makes one tab the session owner, with cooperative flush-and-takeover through a
  BroadcastChannel so a stale page cannot overwrite newer progress. Browsers without Web Locks keep
  play and manual Saves available while explicitly disabling Session Resume. Completed Benson
  messages, including resume and ownership notices, now also enter the bounded console history.

- Both legal Escape routes and the Colony Craft transition (#133). Benson script 7's dispatcher is
  now reachable by playing: the hired route earns engine flag `$04` through the rental terminal,
  waits out the native 779-frame descent, and launches without the Novadrive, while the recovered
  route boards craft slot 7 in Room 5 and rides the indoor lift to the surface with Occupancy
  intact — the arm at `$B455-$B476` never tested it, and the surfacing transition at
  `$A28E-$A2BA` writes the horizontal pair only, so both the craft and its altitude survive.
  Holding both authorization terms converges on the same write rather than a second Ending, and
  the six decoded refusals — underground, no authorization, wrong craft, no `Y`, leaving before
  the recheck, and a destroyed advert cell `$32` that the Anti Time Bomb can restore — all stay
  playable and resume exactly. The Escape latch is widened from a Boolean to the Ending phase byte
  it always was (0 active, 1 Escape accepted, 255 mature terminal) and renamed `endingPhase`, which
  moves the Save schema to v7 and re-spells the semantic observation id; the Host Callout symbol a
  Benson Script writes it through stays the Data Payload's `gameComplete`, and the frozen Benson
  Golden Traces keep the Trace Oracle's Boolean spelling of the same value. Once the phase is
  nonzero the session freezes the way the Reference Build's terminal loop does, while script 7's
  epilogue keeps ticking. Presentation of that phase, and the value 255, remain M7.5's.

  The `$A13D` box gained its first consumer. A craft that can hold the sixteen-middle-byte square
  while it climbs grounds on the Colony Craft deck at `$40FF3F` with the special transition flag
  `$FA` set; the deck pins pitch level while the predicate holds, walking over the edge installs
  mover 9 and falls home to the ordinary crash resolution, and every other flying frame or lift
  ride clears the flag — the indoor ride writes it from the room that rode up, as `$B455-$B462`
  does, so room 8's ride onto the Colony Craft's own cell is modelled rather than assumed away. The
  one Doorway out of the underground now copies all three arrival coordinates rather than dropping
  the altitude, so it ejects the player at the hull as `$90C0` does. None of it writes
  the Ending phase: the Colony Craft is Targ play. Endgame payload schema 12 exports the decoded
  entry effects, the exit mover, and the slot-7 handler's one phase-0 write, each behind a new byte
  fingerprint, and the control loop reads that write from the document rather than duplicating the
  byte into TypeScript. The semantic observation vocabulary gains `colonyCraftFlag` and the full
  player coordinates the Colony Craft comparisons need. Craft slots 0 and the Poweramp Dart are
  demonstrated into and out of the box; slots 3 and 6 are recorded legally unreachable on current
  evidence rather than synthesized. The frozen Trace Oracle's `craft-7-slot7` scenario is retired:
  it flew the Interstellar Ship through the standard loop, and the Reference Build's own handler
  pins it nose-up and refuses to fly it at all.

- Damocles script catalogue (#128). `lab script` decodes the script bank by reachability from its
  entry table, reaching 497 ops and 98.2% of the code region with nothing undecodable. It resolved
  the bank into two 64-slot pointer tables (strings at `$070000`, script entries at `$070080` — the
  Damocles analogue of the C64 Benson entry table), bytecode, and a string pool.
  `docs/research/damocles-script-catalogue.md` documents every script slot, the system string table,
  and the authoring idioms: the `(OK?)` prompt shape with its Y/O/N scancodes and timeout re-poll,
  the bargaining ladder whose figures are packed decimal, delay-as-subroutine pacing, and the
  suspend-not-block message gate. Script arithmetic is BCD, so a port must reproduce those semantics
  or prove binary equivalent. Two incidental findings: the original shipped cross-title save import
  from _Mercenary I_ and _The Second City_, and the inline-native escape at slots `$08`/`$09` is
  unused anywhere in this bank. The decoder is report-only instrumentation and must never become an
  extractor (ADR 0021).

- Damocles Script dispatch loop decoded by Working Disassembly (#128). The ST laboratory gained
  three research instruments — `export` for addressed, provenance-bound RAM windows, `xref` for the
  68000 instructions that name one absolute address, and a scenario `disassemble` action driving
  Hatari's own disassembler at a world-loaded state. `$051956` proved to be the only instruction in
  the megabyte naming the resident script program counter, leading to the fetch-decode-dispatch loop
  at `$05193E`, a 37-entry self-relative dispatch table at `$051972`, the bit-6/bit-7 branch
  encoding, and a first-pass census of every handler with the interpreter state each one touches.
  That resolves the ISA note's Unresolved dispatch-table item and its unknown Host Callout rows, and
  surfaces opcodes `$08`/`$09` calling 68000 code inline in the script stream — a constraint with no
  Targ analogue. `CONTEXT.md` mints **Working Disassembly**; `docs/research/damocles-gap.md` records
  its rules, keeping listings untracked Restricted Material and only decoded facts in research notes.

### Changed

- The Data Payload and the Golden Traces are tracked (ADR 0029). `/payload/` and `/traces/` were
  gitignored under ADR 0014's publication hedge and ADR 0019's payload-derived clause, which cost
  a per-worktree tax: a fresh `git worktree` had no working test suite until the payload was
  hand-copied or the frozen Swift Trace Oracle was run to regenerate its traces. ADR 0017 already
  makes this repository permanently private and not a candidate for a public source release — a
  public version is a separate repository built fresh, never an export of this history — so the
  ignore rule protected a door that is no longer opened this way, while the ADR 0004
  qualified-review gate that actually governs publication is untouched. `/roms/`, `/restricted/`,
  the laboratory `work/` trees and any built web bundle stay ignored. `c64lab`'s export guard is
  renamed `require_payload_output` and now says what it enforces rather than why.

## [0.8.0] - 2026-08-21

### Added

- Three explicit Browser Shell save slots (#109). Versioned bounded JSON Save Snapshots now
  capture and restore the complete authoritative Gameplay Session, including mover and Object
  Residence state, Room rewiring, Benson interpreter and message progress, fractional timing,
  signed zero, and deterministic random-stream continuation. Exact payload and gameplay-setting
  compatibility, closed decoding, semantic reference validation, atomic replacement, per-slot
  `localStorage`, overwrite and delete confirmation, cross-tab metadata refresh, and shell-only
  feedback keep failed or incompatible loads from disturbing the live session. Unit, Replay Gate,
  and Chromium coverage exercise surface, airborne, and underground reloads; ADR 0026 records the
  browser JSON and explicit-restoration decision.

- Underground navigation Replay Gate (#108). A focused `navigation` adapter reconstructs the
  Trace Oracle's Room, Pose, deterministic seed, and carried Object Residence setup, then grades
  all 1,577 records across the six frozen underground Golden Traces through the real Gameplay
  Session. The gate pins dark-to-lit-to-dark traversal, locked-Doorway refusal and key-assisted
  passage, deterministic Room 114 rewiring, and both Room 127 entry outcomes. Session and
  navigation now share one exact-step replay protocol while retaining separate strict command
  vocabularies; missing evidence, mismatched payload or settings, malformed commands, initial
  setup drift, and any Session Snapshot or PresentationEvent divergence all fail loudly.

## [0.7.0] - 2026-08-20

### Added

- Targ day/night Orrery (#99). The Browser Shell now resolves an Enhanced Presentation Preset
  by default and renders an elapsed-session-driven sun, two phased moons, deterministic Star
  Sphere, and smooth twilight behind outdoor scenes without changing Gameplay Session state,
  world lighting, or Replay Gates. Tracked sky settings control the solar day, latitude,
  obliquity, year, and deterministic stars; the Authentic preset preserves the previous renderer
  and its pinned Chromium pixels. The optional sky pass reuses the existing Camera for roll,
  wrapped pitch, inversion, and Flipped World mirroring, remains suppressed indoors, and restores
  the unchanged scene-pass command sequence after straight-alpha celestial drawing. Pure Orrery,
  projection, settings, renderer, and Chromium coverage pins the orbital model, visual ordering,
  outdoor boundary, and Authentic compatibility; documented dusk and night frames record the
  Enhanced opening-airstrip presentation.

## [0.6.0] - 2026-08-20

### Added

- Extracted Mercenary and Damocles web typefaces (#105). A deterministic research exporter
  validates complete laboratory runs, reproduces source glyphs as grid-aligned WOFF2 outlines,
  and records provenance and hashes in the ignored Data Payload. The Browser Shell now loads and
  verifies both required faces, applies them to user-visible text, and provides a persistent
  Mercenary/Damocles selector that does not leak arrow-key input into gameplay. Typography review
  sheets, independently authored printable-ASCII fallbacks, restricted-output enforcement, and
  cross-browser regression coverage support visual and technical review without tracking extracted
  material.

## [0.5.0] - 2026-08-20

### Added

- Browser opening-loop parity and canonical cutover (#69). The accepted Swift Trace Oracle
  drives the purchased Dart
  from the crash site to lift site 1 at grid 09:06 without injecting boarding, position,
  credits, or Room state, and records the throttle, shutdown, leave-craft, and ride-lift
  Semantic Actions in `session/opening-loop`. The shared TypeScript Session command decoder
  refuses direct board and teleport commands; Bun replays all 6,291 records bit-for-bit while
  earning boarding through the real reach rule. A Playwright-only localhost harness performs
  the same replay in Chromium through `createWalkabout` and the WebGL renderer and checks the
  initial surface, airborne, touchdown, and final Room-1 Indoor Scene milestones. The
  maintainer accepted the browser, Swift, and Reference Build comparison on 2026-08-20; that
  exact merged implementation is preserved by the annotated `trace-oracle-last-good` tag.
  The browser is now canonical at version 0.5.0, the live `app/` source has been retired, and
  the macOS prototype plus frozen implementation-contract records remain as history.

## [0.4.6] - 2026-08-20

### Added

- M4.6 Browser Walkabout (#95). The Browser Shell now loads the Data Payload and tracked
  settings into a live Gameplay Session at the Opening Scene, advances it through a bounded
  60 Hz fixed-step clock, and renders each Session Snapshot through the owned WebGL2 surface.
  The complete browser Control Profile supports held Movement Intent and contextual Semantic
  Actions, releases input across focus suspension, and suppresses repeated actions. The fixed
  Reference Viewport now includes the message, credits and Swift-equivalent status strips;
  surface, lit-Room and dark-Room presentation are covered by Bun tests, while a Playwright
  Chromium gate exercises the real localhost walkabout and attaches its opening frame for
  maintainer review. ADR 0024 records the main-thread session decision and supersedes ADR 0007's
  non-main runtime. Follow-up coverage pins the actual WebGL command order and the complete
  Control Profile; full chord lifecycles and browser-reserved keys pass through untouched.

- The Gameplay Session, behind its own Replay Gate #94. Interaction, DoorwayPredicate, Indoor
  Backdrop lookup, and a mutable `GameplaySession` that projects typed Location / Occupancy /
  Object Residence into a new Host Callout, reconciles script writes, and `advance`s movers,
  scripts, and the message line together. The **session** gate grades `session/opening` and
  `session/opening-walk-to-craft` bit-for-bit; boarding on the walk-to trace is a recorded note,
  not a command the replay injects. Host Callout and interpreter registers are persistent
  values (ADR 0023): every write returns a new `BensonHostState` / `BensonState`, so
  `acrossTheCallout` cannot alias. `BensonSession` and `GameplaySession` remain mutable owners
  that replace those values. With scripts, `nextRandom` comes off persistent `BensonState`;
  without, a session-owned stream with the same seeds as Swift — the dual-stream mix #93 named.
  The payload reader now types `interaction.json` and `underground.json`. The page is still
  throwaway: nothing in `web/src/shell/` is wired to the session (#95).

- The Benson interpreter, behind its own Replay Gate #93. Nine traces, no world: the program,
  the machine, the Host Callout, the session that clocks it, and the message line. The
  **benson** gate grades 44,328 records across those scenarios, including two that end because
  the instruction limit tripped rather than because the script did — `script-0-answered` and
  `script-1-parked` finish on a `stopped` record that **says so**. A silent early stop would
  compare clean against a port that stopped early for a different reason, which is the same
  property the Oracle already encoded when it bounded a parked jump-to-self.
  The session mutates in place and an instruction observer records what `ScriptTrace` records.
  There is no honest way to assemble that from outside: running with a one-instruction budget
  traces a _different_ execution, because the budget stands in for the frame boundary the
  original interpreter had for free. Each record carries what changed (`changes` is the inverse
  of the existing `apply`), so a replay is a pure function of the trace plus the presses and
  writes the header already named.
  Reveal counts Unicode code points, not UTF-16 units and not grapheme clusters. A surrogate
  pair is one character on the message line; a combining mark is not. The first four bytes of
  `nextRandomByte` from the session seed are `[90, 147, 164, 143]`. The machine's own default
  seed is a different constant; mixing the two is a green gate against the wrong stream, and
  the dual-stream session RNG that would make that mix possible is #94.
  The payload reader now types the Benson document and refuses a renamed field by path, and
  the settings seam asserts the `message` and `scripts` blocks the header carried. Gameplay
  session, Interaction, and flying a script from the page are out of scope: a module without
  a passing replay is not ported, and this one now has one.

- The browser implementation's foundation and its first two Replay Gates #90. `web/` is Bun +
  TypeScript strict with `typescript` as its only dependency, `bun test` for the gates and a
  `Bun.serve` dev server that serves the page and the gitignored `/payload/` from the repository
  root. Bun replaces the Vite, npm and Vitest #68 named — one tool covers all three roles, which
  holds ADR 0001's no-general-purpose-engine line tighter than the original scaffold did.
  The **Replay Gate** harness is the reusable part: it locates the payload and traces by walking
  up as `PayloadLocator` does, parses JSON Lines, folds the recorded structural deltas forward,
  and compares parsed values with `Object.is` — bit-for-bit, and never bytes, because Swift and
  JavaScript spell the same `double` differently and a byte comparison would fail on formatting
  rather than on behaviour. A missing Golden Trace or payload **fails** rather than skipping: a
  module without a passing replay is not ported, and a gate that goes green when its evidence is
  absent reports the one thing that cannot be true.
  Ported behind it: `payload` (an async read seam, hand-written per-document validators that
  refuse a renamed field by path rather than coercing it, and the six independent schema-version
  constants), `text`, `orientation` and `world`, with `Inspector`'s row projections — which #68
  put out of scope and the decode gate turns out to need, since the trace records one row per
  object, cell, structure and Room. The **decode** gate replays all 687 records, and the
  **math** gate the 2,147 beneath it.
  The Float32 discipline is the part worth keeping in mind. Geometry is binary32 in the kit, so
  every span in the trace is a binary32 quantity written at full double precision; carrying
  double precision through the port produces a world that is slightly more accurate and does not
  reproduce. Removing a single narrowing point moves `object row 0`'s x span from
  893.78320312500000 to 893.78295898437500, which is what the gate reports.

- A `math` emitter, measuring the arithmetic under every Replay Gate #89, ADR 0022. The kit calls
  five library functions — the sines and cosines in `Projection`, `Orientation`, `World` and
  both movers, `atan` for the reference frustum, `tan` for the horizon, and `pow` in
  `ControlLoop.settle` and the decimal registers — and IEEE 754 pins none of them to a last
  bit. Since ADR 0019 makes a Replay Gate the instrument a ported module is believed on, that
  gate is only as sound as the arithmetic beneath it, so the TypeScript port carries its own
  implementations and the Oracle records what Apple's libm returned. This is bought for error
  locality: a one-bit disagreement in `pow` reached through a flight trace presents as a craft
  that matched for four hundred steps and then drifted, which looks exactly like a misported
  control loop, whereas here it presents as `pow` disagreeing at a named base and exponent
  before any simulation is standing. `math` sits beneath `decode` in the emitter ladder
  because it observes no kit module at all.
  Its domain is bounded deliberately: every angle that reaches these functions in play has
  been through `GameCore.wrap`, `GameCore.wrapPitch` or `Orientation.radians`, so the samples
  sweep two turns either side of zero, add the 256 discrete angles a payload byte can produce,
  the quadrant boundaries, `tan`'s pole and the floats either side of it, the signed zero and
  the denormal floor — and stop. Pinning `sin(1e300)` would oblige the port to reproduce a
  full Payne–Hanek reduction for an angle no wrapper in the kit can return.
  The emitter paid for itself the day it landed, and inverted its own decision. A hand-rolled
  double-double layer was written, reproduced `pow` exactly, and disagreed with libm on 279 of
  the other 1,920 samples by one or two units in the last place — and checking those against
  exact arithmetic showed the hand-rolled value was the correctly rounded one every time.
  Apple's libm is not correctly rounded, so being right is not the same as reproducing it, and
  no principled implementation reproduces a proprietary rounding error. The platform matches
  libm on all 2,147 samples, so the port delegates to it through a named seam and the gate
  becomes a canary: an update that moves a bit turns it red before any simulation is standing.
  Without the emitter those 1-ULP differences would have surfaced first in the `flight` gate,
  as a craft that matched for hundreds of steps and then drifted — where every instinct points
  at the control loop rather than at `sin`.

- Golden trace emitters, making the Swift app the **Trace Oracle** #66. Seven emitters
  write deterministic, full-precision JSON Lines that the browser port must reproduce to be
  believed (ADR 0019): `decode`, `projection`, `flight`, `game-core`, `benson`, `session`
  and `navigation`, regenerated by `--emit-traces` and checked by `--emit-traces --verify`.
  Thirty-six scenarios reproduce byte-for-byte, manifest included.
  A trace header carries only the tuning its own emitter consumes, which is the difference
  between a diff that means something and one that does not. With the whole settings block in
  every header, changing the script time scale reported all thirty-seven files as differing —
  the decode trace included, which reads no setting at all — and reported it as line 1, hiding
  the behavioural divergence in the traces that had genuinely moved. Narrowed, the same edit
  moves eighteen and leaves nineteen byte-identical. The divergence report is windowed on the
  character where two lines first disagree, so a kilobyte-long header difference reads as
  `"timeScale":6` against `"timeScale":7` rather than two identical-looking prefixes.
  The emitters are layered in the port's own dependency order, which is the property that
  makes them useful rather than merely present: each observes only modules at or below its
  own layer, so #68 can turn one replay gate green at a time. That is why the interpreter
  trace has no world behind it and the `game-core` trace has no scripts, and why the
  decoded Craft Parameter Blocks moved out of `--flight-trace`'s report and into the decode
  trace — they are decoded numbers, and the decode gate should be able to check them before
  a mover exists.
  Every record carries the input that was applied at that step. This matters because the
  diagnostics are feedback loops rather than input scripts: the flight circuit corrects
  toward an attitude it reads back off the craft, and the opening rehearsal steers with an
  `atan2` and an alignment threshold. A replay that had to reproduce those drivers would be
  testing this repository's arithmetic, and a driver bug would present as a core
  divergence. Recording the applied input makes a replay a pure function of the trace, and
  each driver now exists once — `FlightCircuit`, `Rehearsal`, `RoomTrace.walk` — shared by
  the printed report and the trace, so the two cannot drift apart.
  Two claims are kept apart rather than conflated. Byte-identity is about this
  implementation: same payload, same settings, same inputs, same bytes. Cross-language
  equivalence is about values: a TypeScript replay parses and compares numbers bit-for-bit,
  because Swift and JavaScript do not spell the same `double` the same way and a byte
  comparison across languages would fail on formatting rather than on behaviour.
  Full precision means seventeen significant digits, integers stay integers, and NaN and
  infinity are refused with an error naming where they were rather than written as `null`.
  `ScreenLine` is `Float`, so a projection trace records binary32 quantities in full
  binary64 precision — `0.10000000149011612` is the value, not noise — and that binds the
  port to narrow at the same boundary. The clock is recorded as an integer step index with
  the accumulated `elapsed` beside it as an _assertion_: every diagnostic accumulates
  `elapsed += 1/60`, the core consumes that value, and a replay keyed off it would diverge
  on the order of its additions rather than on the simulation.
  One `MercenaryKit` change, and only one: an optional per-instruction observer on
  `BensonMachine.run`, threaded through `BensonSession.advance`. There is no honest way to
  assemble an instruction trace from outside — running with a one-instruction budget traces
  a _different_ execution, because the budget stands in for the frame boundary the original
  interpreter had for free. What an instruction read is deliberately not recorded: the
  header carries the whole of the interpreter and host state and each record carries what
  changed, so every value it could have consulted is reconstructible, and which way a test
  branched is the next record's program counter. Recording reads would have meant a second
  description of every opcode, duplicated by anything reproducing the trace, to say what the
  operands already say.
  A parked script spins rather than idles — the Reference Build's scripts end on a jump to
  themselves and the interpreter spends its whole budget on that jump every step — so
  script 1 traced for two minutes was three and a half million records of `jmp 94` and
  388 MB. Traces are bounded by an instruction limit that **says so in a final record**;
  a trace that stopped early silently would compare clean against a port that stopped
  early for a different reason.
  The catalogue carries the maintainer's sign-off as data: the date, the payload digest it was
  given against, and the schema it covers. #66 asks that a trace pin behaviour that has been
  signed off, which makes the acceptance a fact about the repository rather than about a
  conversation — and a perishable one, so a payload re-export or a schema bump makes
  `--emit-traces` report that the acceptance no longer covers what it is emitting instead of
  letting a stale one pass for current. A set with no acceptance says so too.
  The scenario catalogue is `trace-scenarios.json` at the repository root, tracked and
  hand-edited beside `settings.json`, so a diff to it is the visible moment a maintainer
  accepted a new scenario (ADR 0016). Not `verification/`, which ADR 0014 froze. It is read
  as strictly as a command line: an unknown field is refused by name with the nearest real
  one suggested, because a scenario whose `craft` was written `crafts` would otherwise trace
  the default craft and report success.
  Writing a trace is `--trace PATH` on every diagnostic, orthogonal to `--output`: the two
  write different artifacts for different readers and a run may be asked for both, so
  nothing is inferred from a file extension. Every existing printed report and every PNG is
  byte-identical to before this work.
  The navigation scenarios reach the rare states rather than claiming to. Entering Room
  `$7F` from Room `$90` mirrors the world; entering it from Room `$56` does not, because the
  flip sits inside the branch that PQ-0003 skips — which is half that Room's observable
  behaviour, and was found by reading the trace rather than the code.

- Make the underground navigable (#65, PR 3 of 3). Walking into a Doorway now enters
  the Room it leads to, with the locks, entry reactions, darkness, live Room objects,
  rewired Rooms and mirrored world the Reference Build has.
  The traversal gate is implemented in the Reference Build's own order, and two parts
  of it look removable and are not. A Doorway is only looked for on a frame where the
  Room's walls had to push the player back, so walking into a wall _is_ how a door is
  opened and standing in a Doorway turning around does nothing. And the facing test
  accepts square-on to the wall in either direction, including facing away from it,
  which it can afford to because which way the player is pushing is already settled by
  which wall they hit. Both have tests named after the surprise rather than the
  mechanism.
  There are two interlocks and only one is general. The step interlock counts down
  only while the player walks, which is what stops arrival — which places them _inside_
  the Doorway on the far side — from handing them straight back. The transition
  cooldown, the one that also drives a colour ramp, is installed inside the
  special-setup branch that an ordinary Room skips entirely, so most transitions have
  no cooldown at all.
  Twenty-two Rooms rewrite their own first Doorway before it can be used: one picks at
  random from eight destinations, the other twenty-one by the Room the player came
  from, three ways rather than as a match. The third way is that if both stored pairs
  name where the player came from, nothing is rewritten and nothing else in that
  branch runs — which is the whole of PQ-0003, and Room `$7F` has exactly two ways in,
  so it is half that Room's observable behaviour rather than a curiosity.
  All fifty-five Room objects were undrawable and unreachable, because one rule asked
  whether an object's placement was "surface" and no Room object's is. They now get
  full parity with surface objects: same detail cube, same orientation, same collapse
  to a point. The three overlays the renderers took for live object state — hidden
  slots, moved positions, room membership — are replaced by the one `Residence` value
  all three were views of, finishing at the renderer's edge the collapse PR 2 made
  inside the session.
  Darkness is literal: all three colours zeroed, nothing drawn, and _"ITS VERY DARK IN
  HERE"_ (PQ-0004). How a Room looks is now a session fact rather than a property of
  the Room, since it depends on where the photon emitter has got to, and both
  renderers take it off the snapshot so neither decides for itself what dark means.

- `--room-trace`, a deterministic walk through the underground from a named Room along
  a named sequence of legs, reporting every Doorway taken, every wall touched, and
  everything the Rooms said. Four of its scenarios are golden traces, including the
  world flip and its bypass entered from the two Rooms that reach it.

- Containment margins, both interlocks, the wall sound, the transition colour ramp, the
  world-flip input remap and the fixed position that leaves the underground, all read
  from our own image behind opcode fingerprints into `doorwayRules`. Payload schema 6 →
  8, geometry decoder 5 → 7, underground dataset document 2 → 4.

- Identify the destination of the one Doorway that leaves the underground: it is the
  **colony craft**, object slot `$3F`. The Doorway copies a fixed nine-byte position over
  the player's coordinates, and that position is the craft's own — the same surface cell,
  64 units past its hull's x face, `$240` below its underside — while the mover it
  installs is the one the engine installs when the player leaves that object's bounding
  box. Slot `$3F` is the highest thing in the world by two orders of magnitude.
  This answers a question `docs/research/c64-geometry-encoding.md` left open: slot `$3F`
  was recorded as an "orbital-station candidate" pending "an observed encounter or
  authoritative text/behaviour correlation", and a Doorway arriving at its hull is that
  correlation. The remaining 63 slots are untouched by it.
  The Doorway's destination was called `surface` on a guess, and the guess is now
  falsified, so the name goes with it: `destination: {colonyCraft: true}`,
  `colonyCraftArrival`, `colonyCraftSlot`, `colonyCraftDoorways`, and a `Room Link` whose
  definition no longer says "the surface". The export asserts the arrival and the object
  agree — within a cell, and that slot still being the highest thing in the world — so
  this name cannot drift from what it describes the way the last one did.
  We place the player at the craft's cell on the ground rather than at its altitude:
  arriving at the ship is the escape route, which this issue puts out of scope, and the
  mover installed there is one we do not have. That is a known difference, asserted by a
  test that checks the altitude is _not_ adopted rather than left to look like a bug.

- Decode the underground into Doorways and directed Room Links, and resolve
  everything a traversal needs before the app sees it (#65, PR 1 of 3). A `Doorway`
  belongs to one Room and carries the directed `Room Link` it leads along, its lock,
  and where it puts the player; `Portal` is gone from the payload, the app, and the
  glossary. Doorways travel per Room rather than per record even though nineteen Rooms
  share one record, so nothing in the app resolves that sharing.
  The opcode is now fully accounted for, and the field that was missing turned out to
  be the one the navigation work needed most. Bits 4-6 were carried as
  `opcode-high-bits` uncertainty and are the **arrival command index**: they name
  which of the _destination_ Room's own Doorways the player arrives in. The decoder
  resolves that into an absolute arrival position, so no cross-Room index lookup
  happens in the app at all. Altitude is untouched by a room transition, which is what
  the Reference Build does — it never writes one.
  Darkness cost one bit rather than a decode pass: a record's `$80` terminator ends it
  _and_ marks the Room dark, so the twenty dark Rooms were already in our data and
  were being discarded. The photon-emitter gate, the third colour darkness clears, and
  the _"ITS VERY DARK IN HERE"_ message index all travel now. That third colour has no
  per-Room source — every Room setup stores the same immediate — so it rides in
  `doorwayRules` as one global `lineColour` rather than pretending to be part of a
  Room's palette.
  Entry reactions travel as a tagged union, absent or a script or a message, because
  the Reference Build chooses between the two on one header bit and two independent
  fields would let the payload express a state the original cannot reach. `$F7` turned
  out to be a pending message index rather than opaque state, which is what named the
  second arm.
  The 22 special-setup records no longer drop 100 bytes on the floor. Their trailing
  `(room, arrival index)` pair tables are decoded and exported, which turns "the record
  rewrites itself at runtime" from behaviour to emulate into data to read. The table
  comes in two sizes — eight pairs for the random Room and two for the other
  twenty-one — and both are asserted, because the record region tiles exactly and
  reading the wrong count would consume a neighbour's header instead of failing.
  Locks resolve to object slots read out of our own image: the key table is indexed by
  the raw shape nibble, so the seven lock classes want slots `$11..$17`, with `$30` as
  the skeleton key. 53 of the 481 Doorways are locked.
  Two one-way link totals circulate and both are right, so they are now counted apart
  and named for what they measure: 83 unanswered _Doorways_ out of 481 on the checking
  map, and 82 one-way _Room Links_ out of 478 in the payload manifest. The difference
  is the single Doorway onto the surface, for which reciprocity is undefined, and one
  pair of Rooms with two mutual Doorways. Both are asserted on every export.
  `docs/preserved-quirks.md` is new and records the three behaviours a future reader
  would otherwise take for decode faults: the one-way links, the one Doorway that
  lands the player outside the Room it leads to, and the world flip that does not
  happen when you arrive from one particular Room.
  Geometry decoder 4 → 5 and the five core payload schemas 5 → 6. The app restates
  every payload version by hand and this changes six of them at once, so a Python test
  now reads `Payload.swift` and asserts the two sides agree — the alternative was
  finding out from an "unsupported schema" error mid-playthrough.

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
  list covers elevators _and hangars_, and a hangar is entered by the separate box
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

### Changed

- Trace schema 3: an emitter that reads no payload carries no payload identity in its
  header. `math` observes only the platform's elementary functions, so recording which
  extraction its run belonged to would make a payload re-export report that trace as
  differing — the same false signal that narrowing settings per emitter was introduced to
  remove. This is a schema bump rather than a quiet addition because a replay written for
  schema 2 would expect `payload` in every header, even though the change reaches only
  `math`'s own. The other thirty-six traces are byte-identical apart from the version they
  name, and the maintainer's acceptance correctly reports itself as no longer covering what
  is emitted until it is renewed.

- Make one `GameplaySession` the authority for everything that changes during play
  (#65, PR 2 of 3; ADR 0018, superseding ADR 0008). The pose, Location, Occupancy,
  Object Residence, the running script and its host state, and the message line all
  live in one place, and the shell above it keeps no game state at all — it
  translates keys into intents, calls `advance`, and draws the `SessionSnapshot` it
  gets back.
  This started as tidying and turned out to be a defect fix. `GameState.room` and
  `BensonHostState.currentRoom` both held the player's room with different sentinels
  for the surface, and nothing outside a script ever wrote the second one: boarding
  kept its equivalent pair in step only because `Interaction` happened to write both
  halves, while riding the lift wrote the typed room and nothing else. So from the
  moment a player went underground, `inrm` — five uses across the payload's 51
  scripts — compared against a stale zero and answered as though they were still on
  the surface. It had not bitten because the opening loop ends at the Dart, which is
  exactly what PR 3 changes: entry scripts are scripts that fire on room entry.
  The Host Callout's byte-wide variables are therefore projected from the typed state
  on the way in and read back on the way out, rather than stored beside it. Two owners
  kept in step by whoever remembers is a defect generator, not a discipline problem,
  and the same shape had produced four descriptions of where an object is — a
  room-membership map, an inventory set, a carried flag bit, and a dictionary of
  parked-craft positions in the AppKit layer — two of which said the same thing and
  could disagree. Those are one `Residence` value now.
  A script that writes one of those variables moves what it names, because the
  Reference Build has one variable per fact and its engine reads what the script
  wrote. No script in the payload writes either of the two describing the player, so
  nothing observable changes; the only host write the content actually makes is one
  object's room, and that reconciles into its Residence.
  There is no setter for host state any more. Reaching, boarding, leaving and riding
  the lift are methods that move everything or nothing — a setter is what let boarding
  become three statements that could half-happen.
  The Trace Oracle stops being a second implementation. The interactive shell and
  `--benson-trace` each carried their own copy of the reach-attempt-describe sequence,
  `--benson-trace` called a boarding method the live app never called, and the crash
  path that puts a pilot out of a wrecked craft lived only in the shell, so a trace of
  a crash showed the player still flying. Both drive the same session now, and
  `--flight-trace` with them. The frame capture and the inspector are untouched: they
  hold no gameplay state, so there was nothing there to unify.
  `app/traces.sh` is new, and emits the deterministic traces a behaviour-neutral
  change is checked against. Trace output is payload-derived and gitignored per ADR
  0019, so it is regenerated and diffed rather than committed.

- Pivot the remake to a browser-canonical TypeScript implementation (ADR 0019),
  superseding ADR 0001's Apple-native stack. The driver is reach: a URL anyone
  opens is a stronger artifact than a Mac application that has to be downloaded
  and run on the right hardware, which is ADR 0014's own argument applied to the
  platform. It is affordable because the port surface turned out to be small —
  the whole simulation is Foundation-only pure value code, the interactive
  renderer is one short segment-stroking pass, input is already reduced to
  device-independent intents, and the Data Payload is language-neutral JSON — so
  the work is a rewrite of a self-contained core plus a new shell.
  The macOS app becomes the **Trace Oracle**: the reference implementation until
  the browser reproduces the opening loop, with its headless diagnostics emitting
  the deterministic traces the TypeScript modules must reproduce, and human
  side-by-side review still the final arbiter (ADR 0011). At that point canonical
  status flips and the app is archived rather than wrapped. The port starts from
  the snapshot #65 leaves behind, so no browser work begins before it closes.
  ADR 0009 is retired — the Host Callout seam survives, restricted Lua and the
  sandboxed XPC service do not, and the `implementation-contracts/` Lua fixtures
  are frozen as history like the verification apparatus before them.
  Deployment is localhost only until qualified-counsel clearance (ADR 0004): the
  Mac app kept extracted data on one private machine, whereas a hosted browser
  build serves payload-derived data to every visitor. A public URL is still the
  goal, so clearance moves onto the critical path. It stays reachable under ADR
  0017: serving a bundle is an application distribution, which that decision
  leaves to the qualified-review gate, whereas publishing the engine's source is
  the act it forecloses for this history — so the canonical codebase is now
  private source that may yield a public artifact.
  Golden traces and built web bundles join `/payload/` in `.gitignore`. Adds Web
  Adaptation, Browser Shell,
  and Trace Oracle to the shared language, and corrects the Craft Parameter Block
  entry, which still claimed walking and flying share one control loop after ADR
  0016 retracted it.

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

### Fixed

- Two claims in merged documentation, both mine. `docs/preserved-quirks.md` said the
  world flip "complements bit 6 of every live entity's state byte" — it walks the
  carried-inventory list, indexes it with the wrong register, and nothing reads bit 6
  at all, so the write is unobservable and is deliberately not implemented.
  `notes/decode/underground.md` described `$F0` as the re-trigger interlock; it is the
  wrong one of the two and it does not run for ordinary transitions.

- Make every headless command take `--output`, and refuse an invocation it does not
  understand instead of guessing. There were three conventions for saying where to
  write: `--render-frame` took a path as the token after the flag, the contact sheets
  took one as the flag's own value, and the single-subject inspectors took `--out`.
  All three were documented, so none of them was wrong exactly — but the failure mode
  when you mixed them up was silence. `--render-frame --output frame.png` wrote a file
  literally named `--output` into the working directory and reported success;
  `--inspect-room 3 --output r.png` ignored the flag and wrote to the default path;
  and a `--press` operand written `name:seconds` instead of `name@seconds` became "at
  zero seconds" with no complaint, quietly running a different scenario than the one
  asked for. Every one of those looked like it had worked, which is the actual defect
  — the inconsistency was only how you got there.
  So one `--output` everywhere, matching what the lab's own commands already use; a
  named per-command default under `/tmp` when it is left out, printed in the JSON
  summary so nothing lands somewhere unexpected; and strict reading throughout. A
  flag's value must be present, must not be another flag, and must parse as the kind
  of thing the flag wants. A command that claims the invocation rejects any flag it
  does not have, and suggests the nearest one it does, so `--out` now says "did you
  mean --output?" rather than silently doing something else. Usage errors exit 2 and
  print the usage; nothing writes a file on a bad line.
  The reader lives in a new `MercenaryCLI` target rather than in `MercenaryKit`,
  because reading a command line is host tooling and the kit is the surface a browser
  implementation has to reproduce (ADR 0019). Being its own target means it has tests:
  every case in `ArgumentsTests` is one of the mistakes the lenient version accepted.
  Two of `app/traces.sh`'s scenarios were written with the wrong separator and had
  therefore been running something else — "press any key at zero seconds" rather than
  "any at two, `y` at six". They are corrected here, which is what the strict reader
  is for: the same mistake is now a refusal rather than a quiet substitution. It also
  means those traces now exercise a _matched_ key press and a boarding at a non-zero
  time, neither of which any trace had reached before.

- Apply the maintainer's opening-loop playthrough findings. Play now begins at the
  Reference Build's captured X/Z 559104 crash position, in the centre of the wreck,
  rather than at the former staged overview 12,000 units south. Craft that have been
  flown and left now use their live landing position for drawing and boarding instead
  of snapping invisibly back to their immutable payload position. The live overlay
  moves X/Z only, preserving the model's ground-resting Y instead of raising it by
  the player/craft simulation altitude. Leaving also
  restores the captured 128-unit on-foot eye height and keeps it through later
  walking frames; the decoded 63-unit touchdown altitude remains craft-only.
  The lift's tall-box appearance was an extraction defect, not a scale judgment:
  extended surface heights perform one discarded `ASL` before three `ASL`/`ROL`
  pairs. Geometry decoder 4 restores the five lift structures' levels from
  1072/1120/1168 to 96/192/288, and stale decoder-3 payloads are rejected.

- Walk on foot the way the Reference Build does, which is not through the control
  loop at all. `MOVE` (`$A165`) dispatches: with the underground flag set, or with
  the craft byte's top bit set — which is what being on foot means — control goes to
  a separate routine at `$A18B`, and only otherwise does it `jmp ($BEA0)` into the
  live block. That routine walks by a fixed step held at `$AA/$AB` and turns by a
  fixed number of angle units held at `$AC`, with no velocity, no damping, no
  throttle and no vertical term. So the block after the eight craft is not the
  on-foot walk: it is the block touchdown installs so a _landed craft taxis_, which
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

- Draw the rotating structures at their real width. A rotated structure's X and Z
  displacements are a signed **×64** per byte, not ×16: `SETUP_STRUCTURE_POINTERS`
  hands the source byte to `BIT24_TO_FP` as the _high_ byte of a twenty-four bit
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

[Unreleased]: https://github.com/odogono/mercenary/compare/v0.20.0...main
[0.20.0]: https://github.com/odogono/mercenary/compare/c2c6afd...v0.20.0
