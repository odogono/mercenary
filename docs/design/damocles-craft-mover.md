# The Damocles craft Mover in play

Implementation note for [#556](https://github.com/odogono/mercenary/issues/556), the launch
and space flight of [#566](https://github.com/odogono/mercenary/issues/566) and the landing of
[#567](https://github.com/odogono/mercenary/issues/567), part of the
[driving and flying map](https://github.com/odogono/mercenary/issues/548), under
[ADR 0051](../adr/0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md). It records
what the port runs aboard, where each rule comes from, and what it does not run. The rules
themselves are in [the craft control note](../research/damocles-craft-control.md),
[the collision response note](../research/damocles-collision-response.md) and
[the space flight note](../research/damocles-space-flight.md).

## What runs

`web/src/damocles/craft.ts` is the Mover. It is pure. `DamoclesSession` holds its words and
calls it.

| Port | ST | Source |
| --- | --- | --- |
| `craftPass` | the common craft pass `$057F46`–`$0583E8`, and the wheeled tail `$057DE6` | craft control note |
| `craftFrame` | the aboard frame path `$05970E`–`$05976A`: pass, box test, refusal re-run, space entry test | collision response note |
| landing handler | `$057CF2`: two box tests, Y 63, contact, level pitch, the stop preset `$054744` | craft control note, "Unresolved", decoded here |
| `craftMultiply`, `craftAdd`, `craftFixed`, `craftWord` | the log-table product, `$04BD34`, `$05807A`, `$05837A` | ADR 0051 decision 3 |
| `craftFloat` | `$04BDD4`, which the pose copy `$058F64` uses for `$79BA` = float(−Y) | decoded here |
| `throttleForEntry`, `throttleDown`, `throttleUp` | `$0556AA`–`$0557D4` | decoded here |
| `bindBoxes`, `insideBox`, the support search | `$053AF0`, `$0590AE`, `$0583EA` | collision response note |
| `launch` | the launch handler `$055822` (Esc) | space flight note |
| the swing in `craftFrame` | `$057F18` while `$7B0C` is set | space flight note |
| `enterSpace` | the space entry `$055868` | space flight note |
| `spacePass`, `spaceFrame` | the space pass `$05872E` over slot 0's block, then the frame's range scan `$052DB0`, the hold `$7B0A` and the arrival test `$052FDA` | space flight note |
| `viewMatrix`, `bodyRange` | `$055F60`/`$045710` and the rotation `$05668A` | space flight note |
| `craftDivide`, `craftSquare`, `craftSqrt`, `craftLongFloat`, `spaceWord`, `spaceFixed` | the log-table quotient, square and root, `$04BDD8`, `$058B5A`, `$0589D6` | space flight note |
| `craftAtan2`, `subStellarLongitude` | the octant `atan2` `$04EA48`, and `$04EA02`'s terminator word | space flight note |
| `landingPoint`, `land`, `landingTrigger` | the landing `$059268`: the point `$04E936`, Y `$1800000`, the support search, the trigger `body + $1F` | space flight note, ADR 0052 |
| `turnOnClock` | the one VBL count every Body's accumulator `$62EA` shares (`$051E4E`) | space flight note, "The Body turn clock" |

Every constant, the craft table, the throttle key table and the exponent and sine tables come
from the Catalogue's `craft` block (#555). So do the launch, swing, entry and space pass
constants, the Body table the range scan walks and the space words the first world boots with
(#566). The log table is regenerated, now up to the unnormalised `$2000` a range sum can leave.
The Building detail boxes come from each detail Model's `boxes` (#556,
`docs/research/damocles-catalogue.md`). The space law is `web/src/damocles/space.ts`, from
[the space flight note](../research/damocles-space-flight.md).

- **The pass clock.** The session counts VBL ticks aboard and runs one frame of the Mover on
  every `time.ticksPerPass`-th (4). The count is reset on boarding, and a Save carries it.
- **The stick.** `$79C2` is taken from the Movement Intent: up (nose down) is `pitch < 0`,
  down is `pitch > 0`, left and right follow `turn`.
- **The throttle keys.** The Control Profile sends `1`–`0`, `F1`–`F10`, Space, `-` and `=`
  aboard. The session looks each key's ST scancode up in the published table. Space writes the
  zero and leaves the speed to decay. `-` below 1.0 runs the stop preset. A change asks for the
  key effect `$054848`.
- **The attitude sines.** The ST's trig routine runs once a frame, before the pass. So the
  first pass after boarding reads the on-foot attitude, and a refusal's second pass reads the
  first pass's sines. `CraftState.trig` carries the attitude the sines were taken at.
- **The Pose** is derived from the craft words after every pass: yaw and pitch as the view's
  turns, and roll `$7ABE` as the Camera's bank, positive to the right.
- **Refusal.** The bound structure's boxes are bound at its scale about its intra-cell origin,
  as the cell bind binds them. A refused frame asks for the bump `$04C470`.
- **Touchdown.** After the landing handler, the island answer decides. On land the leave path
  runs and the blast `$04C5A8` is asked for. At sea the player stays aboard under `$04C016`.
  `$794A`, the per-Body mask, is recovered only for Eris (high byte `$FF`), so the port takes
  the island answer unmasked.
- **Leaving** is refused while `$7ACA` is clear. It writes the instance angle byte from
  `yaw >> 2` (`$0544FA`), so the object is drawn facing the way it was driven.
- **The panel.** The speed field prints `$4DFEC` as 4.28 digits, signed by the speed float's
  mantissa. The altitude window prints eye Y ÷ 2²⁰, with `**` past 99 and on Floor 10. It does
  this on foot as well, so an upper Floor now reads a non-zero altitude, as the ST's does.

## Launch and space (#566)

- **The launch key.** The Browser Shell keeps Escape for the System Menu, as it does for the
  lift's Esc, so `Backspace` aboard stands in for the ST's Esc. `launch` refuses silently in
  contact or in space, and below a `+$1A` of 100 presents system string 21, VEHICLE NOT
  EQUIPPED FOR SPACE TRAVEL. Otherwise it sets the swing `$7B0C`, writes the reverse throttle
  and the speed's exponent, and asks for the key effect.
- **The swing.** While `$7B0C` is set, a frame swings the pitch 16 towards `$280` and ends,
  until `(pitch + $80) & $3FF` passes `$300`. After that the common pass runs with the stick
  read as nought. The stop preset and any throttle key that writes clear it; `-` and `=` do not.
- **The space entry.** When the pre-pass Y reaches `$1F0` × 65,536, the pass runs and then
  `enterSpace`: occupancy space, the hold 50, the throttle's and speed's exponent words, the
  pitch `$1FF`, and the space position at the centre of the Body the craft was on, 64 up. The
  range, nearest Body and pitch rate the first space pass reads are what the last flight left.
  The first world's (`$000A137A`, ERIS, nought) come from the Catalogue.
- **In space** one frame every four ticks runs the space pass over slot 0's block, whatever
  the craft, then the range to every Body in the scene, rotated by the view as the ST rotates
  it, and the nearest. The Body table is the Catalogue's, with the comet where the impact clock
  puts it.
- **The Pose in space** keeps the place on the Body where the craft left it, so nothing on the
  surface rebinds. Its heading and pitch are the craft's. The frame draws no ground, island,
  structure or object, only the Bodies from the space position over black, and cuts no disc at
  the horizon (`$042C74 = $88`). Which Bodies the ST draws is read statically: every one in the
  scene, farthest first.
- **The panel in space.** The speed field prints what the space pass leaves in `$4DFEC`, one of
  the three forms of c·v/√(v² + 1024). The altitude window prints `$04DEEE`'s range ÷ 16,384.
  The first lamp stays dark.
- **An arrival** raised by `$052FDA` lands the craft the same frame. DIALIS, offset 0, is never
  arrived at: `$052FD4` skips the test for it, which the note's model leaves out and no trace
  reaches.

## Landing (#567)

[ADR 0052](../adr/0052-land-a-damocles-craft-at-the-recovered-landing-point.md) records the
decisions.

- **The point.** `landingPoint` takes the space position the frame's pass left and the
  destination from the scanned Body table, comet included. X is the longitude less the high word
  of the destination's accumulator, and Z the latitude from Y over the extent, both masked to
  twelve bits as the pose copy masks them. It also returns `$79BE`.
- **The craft.** `land` puts the craft at the point, Y `$1800000`, and keeps every other word the
  pass left, throttle and speed included. The support search runs over the destination's bound
  boxes. It refuses any Y high word but nought, so it finds none, and contact and the support
  words are cleared. Arriving under power climbs back into space.
- **The Body switch.** The session swaps in the destination's surface, drops the bound structure,
  region, Floor, attachments and doorway, and binds again at the point. It clears space and the
  space entry, and drops the occupied object's pre-boarding residence. The destination's turn is
  carried from the Body the craft left along the shared clock (`turnOnClock`). The landing's
  `$79BE` drives the terminator until the next switch. The Carried Stack, Object Residence and
  the Damocles Script carry over.
- **Bodies with no admitted Pose,** such as LACHESIS, are anchored at the Body's own origin, so
  their cell is the Body Coordinate. A Save may name any Body a landing reaches.
- **The trigger** `body + $1F` is fired through `fireTrigger` except on ERIS and DAMOCLES. No
  landing trigger has a script in the port, so it changes nothing and presents nothing.

## Tests

`web/test/damocles-craft.test.ts` replays the Golden Traces under `traces/damocles/craft/`. The
lab script `research/damocles-st/scripts/craft-trace-export.py` exports them from the ignored
runs of #549 and #550. They hold only the craft words, the stick, the bound box lists and the
attitude sines. Every one of the 2,659 passes the research modelled matches word for word, as
do the three refused-move runs and the one bounce that followed a second key press. The pose
copy's float of −Y and the frame-start sines are checked against what the port derives at
every unpoked stop. `web/test/damocles-boarding.test.ts` and `web/e2e/damocles-craft.e2e.ts`
cover the session and the browser.

`web/test/damocles-space.test.ts` replays the Golden Traces under `traces/damocles/space/`,
which `research/damocles-st/scripts/space-trace-export.py` exports from the #558 runs
`launch`, `steer`, `return` and `cross`. They hold the craft words, the space words, the stick,
the key each stop wrote, the attitude sines and the Body table. Every pass matches word for
word: 812 on a Body (the launch, the swing, the swung climb and the flight after the cross's
arrival), the 2,382 space passes with every range, nearest Body and hold, both entries into
space, and the Body each of the two arrivals is raised for. For both arrivals the landing point, the
latitude and longitude words, `$79BE`, the craft words and the space position match too. The
traces carry every Body's accumulator on the stop before each landing (#567).

## Not run, and why

The port has no rule for each of these, so it does not invent one:

- **The landing message.** The landing fires the Body's trigger, but no landing trigger's
  script is in the port, so the trigger does not disarm and nothing is presented (#567).
- **The scripted flight** `$790E` and the stick replay `$7A0C`, on a Body or in space.
- **Time dilation.** In space `$7876` is 32γ and the impact clock gains γ seconds per 50 VBLs
  (#551). The port's clock is a function of elapsed time, so it keeps real time in space.
- **The System Coordinate Readout.** In space the ST's navigation window prints the space
  position's high words (`$04E414`). The port's still prints the Body Coordinate Readout.
- **Slots without a surface pass.** A slot whose entry is not `flying` or `wheeled`, or a
  seatable slot past the sixteen-entry table, is held as `unrecovered`.
- **The landing handler's side effects:** the engine flag `$7C0C`, `$78EE`, and the pause at
  `$051036`. The crash that unseats the player through the replay table `$7A0C`/`$06FD80` is
  still unrecovered, and so is what the `$051036` path does beyond the pause.
- **Camera sway aboard** (`$057EC8`, `$78A6`).
- **The `T` trim toggle** `$7A1C` for AUTHOR'S CHAIR, and the per-frame engine sound vector
  `$04C220`.
- **Doors and lifts aboard.** They keep ticking every VBL, as before. Whether `$05970E` moves
  Entrance Attachments is unrecovered (ADR 0051).
- **The region aboard** is taken afresh after every pass, as boarding already takes it. That is
  authored.
- **Saving aboard (#557).** Damocles Save schema 12 carries the craft words in `craft`: the
  turn rate, speed and throttle as the program's floats, pitch, roll, unmasked yaw, contact, the
  support words, the attitude the frame's sines were taken at, the pass phase, and whether the
  space entry holds the Mover. The position is the Pose's. The panel's speed copy is not
  carried, because every pass and the stop preset leave it the integer of the speed's
  magnitude. A restore draws the Pose from the words and refuses a record whose Pose they
  don't draw. The next pass then matches an uninterrupted run. The Save also carries each left
  craft's angle byte. **A Save in space** (#566) is a later ticket's. Until then it carries the
  words and the Pose the space entry left, flagged, and a restore enters space afresh from the
  Body's centre. The flight since the entry, the launch swing and the space words a flight
  leaves for the next are not carried. A schema-11 record is migrated rather than refused. Aboard, it is seated
  at the boarding preset (`$054744`), level and in contact, facing the saved heading.
- **Atlas Travel aboard** sets the craft down at the pin, at rest and facing as it was. That is
  authored. Before this, the next pass flew from where the craft had been.

## Carried as Fog

- A wheeled craft driven off a support is predicted to hover at the support's height. The
  Mover does what the decode says, and no route has confirmed it.
- Which way the ST's view banks is not checked against an ST frame. The port banks right on a
  right turn.
- CONCORD III, ATTACK SHIP and AUTHOR'S CHAIR in play.
