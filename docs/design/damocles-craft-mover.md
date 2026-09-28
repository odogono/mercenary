# The Damocles craft Mover in play

Implementation note for [#556](https://github.com/odogono/mercenary/issues/556), part of the
[driving and flying map](https://github.com/odogono/mercenary/issues/548), under
[ADR 0051](../adr/0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md). It records
what the port runs aboard, where each rule comes from, and what it does not run. The rules
themselves are in [the craft control note](../research/damocles-craft-control.md) and
[the collision response note](../research/damocles-collision-response.md).

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

Every constant, the craft table, the throttle key table and the exponent and sine tables come
from the Catalogue's `craft` block (#555). The log table is regenerated. The Building detail
boxes come from each detail Model's `boxes` (#556, `docs/research/damocles-catalogue.md`).

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

## Tests

`web/test/damocles-craft.test.ts` replays the Golden Traces under `traces/damocles/craft/`. The
lab script `research/damocles-st/scripts/craft-trace-export.py` exports them from the ignored
runs of #549 and #550. They hold only the craft words, the stick, the bound box lists and the
attitude sines. Every one of the 2,659 passes the research modelled matches word for word, as
do the three refused-move runs and the one bounce that followed a second key press. The pose
copy's float of −Y and the frame-start sines are checked against what the port derives at
every unpoked stop. `web/test/damocles-boarding.test.ts` and `web/e2e/damocles-craft.e2e.ts`
cover the session and the browser.

## Not run, and why

The port has no rule for each of these, so it does not invent one:

- **Space.** When the pre-pass Y reaches `$1F0` × 65,536, the pass has run and the craft is
  held there. The snapshot's `craft.held` reads `space` (#558). The launch swing `$7B0C` and
  the stick replay `$7A0C` are never set.
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
  craft's angle byte. A schema-11 record is migrated rather than refused. Aboard, it is seated
  at the boarding preset (`$054744`), level and in contact, facing the saved heading.
- **Atlas Travel aboard** sets the craft down at the pin, at rest and facing as it was. That is
  authored. Before this, the next pass flew from where the craft had been.

## Carried as Fog

- A wheeled craft driven off a support is predicted to hover at the support's height. The
  Mover does what the decode says, and no route has confirmed it.
- Which way the ST's view banks is not checked against an ST frame. The port banks right on a
  right turn.
- CONCORD III, ATTACK SHIP and AUTHOR'S CHAIR in play.
