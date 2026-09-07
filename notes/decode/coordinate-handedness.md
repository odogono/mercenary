# Coordinate handedness

The Reference Build's level camera faces decreasing Z at raw yaw zero. The
browser had preserved increasing-Z forward from the frozen Mac implementation,
while retaining the original horizontal projection axis. Those axes form the
wrong handedness: asymmetric ground geometry, including the AIRPORT lettering,
appears reflected.

## Evidence and reproduction

The observations below execute original subroutines from this project's own
unpacked RAM capture:

- File: `research/c64-reference-build/work/mode-history-ff45fd67/ram.bin`
- SHA-256: `318a13bc5ac6b960f3019135d0348b8768894c5e7b03b8a6f2c75167f1f8a424`
- Size: 65,536 bytes.

Run from the repository root, with the optional research dependency
`py65==1.2.0` installed in the selected Python environment:

```sh
python research/c64-reference-build/tools/probe-coordinate-handedness.py \
  --ram research/c64-reference-build/work/mode-history-ff45fd67/ram.bin
```

The harness emits JSON containing the input angles and points, classification,
screen coordinates, rotated floating-point bytes, compass tape state, and RAM
hash. It embeds no machine code. It calls the capture's sine/cosine routines
(`$841F`/`$841E`), matrix setup (`$A320`), signed coordinate conversion (`$8510`),
full point transform (`$A767`), yaw-only transform (`$A979`), and compass update
(`$B809`). It supplies a neutral screen offset and centre `(80,68)` in logical
pixels. Screen coordinates are omitted for rejected points because those bytes
can retain previous values. Point classification is `$6E`, **not** `$64`.

The Reference Disassembly was read only as documentation to locate the routines
and their inputs. The consulted file is
`research/reference-disassembly/snapshot/Mercenary notzed/mercenary_v260411.lst`,
from the snapshot recorded in `research/reference-disassembly/snapshot.json`
(commit `9571e68d80465d73d14afbcd81be6a70a2bf8eee`). No reference implementation
was copied or mechanically translated into the browser.

## Level camera and cardinal directions

The point preparation at `$A5D1`–`$A61E` subtracts camera coordinates from
structure coordinates. The point inputs below are therefore world minus camera,
not an already-negated intermediate.

Level pitch is raw `$0200` (512); level roll is zero. At that pitch and roll,
the full matrix and yaw-only transform agree on all these observations:

| Raw yaw | Degrees | Forward | Right | Forward-right input `(X,Y,Z)` | Logical screen |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | −Z | +X | `(1000,1000,-10000)` | `(87,55)` |
| 256 | 90 | −X | −Z | `(-10000,1000,-1000)` | `(87,55)` |
| 512 | 180 | +Z | −X | `(-1000,1000,10000)` | `(87,55)` |
| 768 | 270 | +X | +Z | `(10000,1000,1000)` | `(87,55)` |

Negating X and Z of each input produces classification `$80` (behind) in both
pipelines. The finite precision of the Reference Build produces integer screen
coordinates; the browser's corresponding smooth projection is `(172.8,55.2)`
in the physical 320-by-136 frame.

Raw pitch zero must not be mistaken for level pitch: at raw yaw zero, the full
matrix with pitch zero sees positive Z, while pitch 512 rejects that ray. Raw
pitch 256 looks upward. Thus a yaw-only experiment alone was insufficient;
the full-matrix experiment at the actual level pitch confirms the convention.

For browser heading `h`, the horizontal basis is consequently:

- right: `(cos(h), 0, -sin(h))`
- forward: `(-sin(h), 0, -cos(h))`

Positive browser pitch remains nose-up, with raw pitch equal to
`512 - pitch * 1024 / (2π)`, wrapped to ten bits. Flight translation already
documents the original pitch cosine in [Flight](flight.md); its level value is
negative, which accounts for the negative horizontal motion. Right input
decreases raw yaw. Camera direction and both Movers must use the same convention.

## Roll

For raw yaw zero, pitch 512, and point `(1000,0,-10000)`, the full matrix gives:

| Raw roll | Logical screen |
| --- | --- |
| 0 | `(87,68)` |
| 64 | `(86,73)` |
| 960 (−64 wrapped) | `(86,63)` |

The browser's positive roll raises the right-hand horizon. Its roll is therefore
the **negative** of the original raw roll in radians. The original flying loop
derives raw roll from signed yaw velocity at `$A119`–`$A129`; decreasing yaw on a
right turn means negative raw roll and positive browser roll. Negating the roll
coupling when adopting raw yaw preserves the existing camera and horizon behavior.

## Opening and model orientation

Startup writes zero to the yaw and pitch low bytes at `$811A` and `$811C`, then
writes 2 to their high bytes at `$8120` and `$8122`. The original opening is thus
raw yaw 512, pitch 512: browser heading π and level pitch zero. Leaving a craft
also resets roll to zero and pitch to 512 at `$98D1`–`$98DE`.

Object-local orientation uses a separate six-bit turn. Its lookup masks with
`$3F` at `$8445`; 64 units make a turn, whereas camera angles use 1024 units.
A model's unrotated nose is −Z. With the corrected camera convention, orientation
zero and heading zero name the same direction; no half-turn is added when
boarding. The regression test checks cardinal six-bit orientations against the
actual transformed model nose.

## Compass and the Atari ST screenshots

Executing `$B809` until its tape settles shows raw yaw controlling the tape
directly. The numeric pattern repeats every 180 degrees: raw yaw 0 and 512 show
the same central zero pattern, and 256 and 768 show the same 90 pattern. The
quadrants are distinguished by colour; the table at `$B895` is red, blue, black,
green for the four raw quadrants. The JSON output includes the glyph pixels and
the settled `$BE`–`$C0` state so this interpretation can be inspected.

This does **not** establish an absolute-number mapping for the Atari ST compass.
The Browser Shell keeps its existing displayed bearings by adding a half turn to
raw yaw: the original opening at raw 512 still displays 0°, and a schema-11 Save
migrated by a half turn retains its displayed bearing. This is an explicit
presentation convention, not a decoded C64 full-turn compass claim.

With that boundary conversion, displayed 270° means raw 90° and faces −X.
The decoded low-Z city boundary appears on the right from `04-01`, matching the
handedness in the user's Atari ST capture. Altitude, sub-cell position, and the
ST capture's `04-00` versus the browser's `04-01` still differ, so the comparison
claims horizontal orientation rather than pixel-identical scenes.

## Browser regression coverage

`web/test/coordinate-handedness.test.ts` first failed on the four original
forward-right rays and Flipped World depth before the production correction.
It also checks the actual AIRPORT geometry at `12-12`, a decoded Map Line viewed
from `04-01`, walking and flight direction, right-turn scene motion, roll, and
craft orientation. The AIRPORT test checks both A-before-T horizontal order and
the A apex above its foot, so rotating a reflected word does not satisfy it.
