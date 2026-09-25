# How fast a Damocles door moves

Working-Authority Evidence for [#498](https://github.com/odogono/mercenary/issues/498),
recovered 2026-09-24. Authoritative Evidence remains bound to the C64 Reference Build.
This note records decoded ST facts only and does not translate the program into a new
model ([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM,
captures and traces stay ignored Restricted Material under `research/damocles-st/work/`;
only addresses, decoded facts and hashes are recorded here.

## Decision

**No door has a speed of its own.** Every Entrance Attachment moves its edge **one unit
per substep**. All twelve motion paths of the attachment animation `$05AA3C` (six
constructor modes, each opening and closing) load the same step, `move.l #1,d4`, and
nothing else in the routine writes `d4`. The constructor, the span, the control word and
the record do not set a rate.

What differs between doors is how far they travel. An opening edge stops eight units short
of the far closed edge (one leaf) or eight units inside its outer edge (two leaves). The
travel is therefore:

```text
travel = span - 8          one leaf
travel = span / 2 - 8      two leaves, each half from the midpoint
```

The Catalogue already publishes it. Each attachment's closed `mesh`, `leafCount` and
`motionAxis` give it, and the port reads it as `attachmentOpenLimit`. There is nothing new
to publish.

A door reaches its endpoint on substep `travel`. The **latch** changes one substep later,
at `travel + 1`: an opening door writes `$FF` and a closing door clears to `$00`. That is
the substep the next step would overshoot the endpoint and is clamped instead
(`cmp`/`bpl` after each `add.w d4`/`sub.w d4`).

| Door | Structure slots | Travel | ST latch change | #472 measured |
| --- | --- | ---: | ---: | --- |
| State Office lift `$3F4` | 76, 78, 79 (Floors 0, 1–2, 10) | 32 | substep 33 | about 30 VBLs |
| Vesta transporter lift `$3FC` | 90–93 (Structure 70's Floors) | 82 | substep 83 | about 80 VBLs |
| Capital Spaceport `$3FC` | 74 | 92 | substep 93 | 132 VBLs at 8 substeps per 11-VBL frame |

So the three timings #498 compared are one rate. #472's VBL figures were read against a
frame loop that ran one substep per VBL while frames took 5–8 VBLs. The Structure 74
figure was taken where frames took 11 VBLs and the substep clamp held them to 8
([the entrance-motion note](damocles-spaceport-entrance-motion.md#attachment-vertices-after-5aa3c--confirmed)).
The rate per VBL varies with frame cost, and the rate per substep does not.

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Attachment animation `$05AA3C`–`$05AD51` | `cd936e76d64a368856ff04e411221d249cfa4beeafc82b38e6b47533ec508cdb` |
| Traces | #472's `lift-ride-probe.py live` runs: eight State Office, four Vesta |
| Probe | [`research/damocles-st/scripts/door-speed-probe.py`](../../research/damocles-st/scripts/door-speed-probe.py) |

The handler hash is the one [the generic attachments note](damocles-generic-entrance-attachments.md)
quotes. `door-speed-probe.py decode` finds the same bytes in all 61 memstates under
`snapshots/` and `snapshots/rehosted/`, so no capture patches the step.

## The step, statically

The routine loads the step into `d4` at twelve places, one per path:

| Step load | Path |
| --- | --- |
| `$05AACC`, `$05AAF4` | close, one leaf, X (bit 8 set, clear) |
| `$05AB22`, `$05AB4A` | close, one leaf, Z (bit 8 set, clear) |
| `$05AB86`, `$05ABCA` | close, two leaves, X, Z: both inner edges to the midpoint |
| `$05AC2A`, `$05AC54` | open, one leaf, X (bit 8 set, clear) |
| `$05AC84`, `$05ACAE` | open, one leaf, Z (bit 8 set, clear) |
| `$05ACE6`, `$05AD26` | open, two leaves, X, Z: inner edges out to outer ± 8 |

Each is `283C 0000 0001`, `move.l #1,d4`, followed by `add.w d4` or `sub.w d4` on the
moving edge. Capstone finds no other instruction in `$05AA3C`–`$05AD51` with `d4` as its
destination. The endpoint insets are `subq.w #8`/`addq.w #8` at `$05AC24`, `$05AC4E`,
`$05AC7E` and `$05ACA8` (one leaf), and `addq.w #8,d0; subq.w #8,d3` at `$05ACE2` and
`$05AD22` (two leaves). The frame loop calls the routine once per substep
(`$059570`, `bsr $5aa3c`), and a frame runs `clamp($51D22, 4, 8)` substeps
([#472](damocles-lift-ride.md#why-the-step-is-25-vbls-substeps)).

The close paths only return a door to where it was built: `$1E40`/`$1E42` for one leaf,
the midpoint of the two outer edges for two. They use the same one-unit step.

## The step, in the traces

#472's traces record, at every VBL, the frame counter `$7AE8`, the VBLs the last frame
took (`$51D22`), the latch and the ride's step countdown `$788E`. From these,
`door-speed-probe.py trace` counts exactly how many substeps each ride's door took to
close from fully open:

- The door starts moving in the frame the key is first seen in, so the count takes every
  substep of that frame and of each frame up to the one the latch clears in.
- The countdown only runs once the latch has cleared ([#471](damocles-lift-control.md#stepping)),
  so the countdown at the first stop with the latch clear says how many of that frame's
  substeps came after the clear.

For G → 1 in the State Office: frames 2997–3000 ran 7 substeps each (28), and the
latch cleared with the countdown at 23, two substeps before the end of frame 3001's seven.
That gives 28 + 5 = **33**.

| Case | Rides | Close from fully open, substeps |
| --- | --- | --- |
| State Office, eight runs | G → 1, 1 → 2, 2 → B, B → G in each | 33 in all 32 |
| Vesta, four runs | 2 → G in each (B → 2 starts from a door still opening) | 83 in all four |

The probe raises unless every count is the door's Catalogue travel plus one. Frames in
these rides took 5, 7 and 8 VBLs, and the count held at each.

A whole ride in substeps is `travel + 1` for the door, then 25 for each label step and
25 more to arrive. G → 1 in the State Office is 33 + 25 + 25 = **83 substeps**. #472
stamped the arrival at VBL 80–81 because the admission frame's substeps all run in one
burst, ahead of the VBLs they stand for.

## For the port

The port moved every door at 92 / 2.64 units per second, the Structure 74 trace read in
seconds. It now moves each door one unit per tick in the frame loop, after the ride's
step, as `$059562`–`$059570` orders them. A tick is a VBL, the stand-in the ride already
uses for a substep ([#472](damocles-lift-ride.md#for-470s-ride-presentation-task-476)).
Each door's time is its own travel:

| Door | Port, ticks | ST |
| --- | ---: | --- |
| State Office lift `$3F4` closes | 32 | 33 substeps, about 30 VBLs |
| G → 1 ride, key to arrival | 82 | 83 substeps, VBL 80–81 |
| Vesta lift `$3FC` | 82 | 83 substeps, about 80 VBLs |
| Capital Spaceport `$3FC` | 92 | 93 substeps; 132 VBLs where frames took 11 |

Two known differences remain:

- **The latch substep.** The port keeps only how far each door is open, not the latch, so
  it counts a door shut or open on the tick it reaches its endpoint, one tick before
  the ST's latch changes. The ride therefore starts counting one tick early, and a
  latched region frees one tick early.
- **Frame cost.** The ST runs 4–8 substeps a frame whatever the frame took, so a door
  is slower in VBLs where frames take more than 8. That is the Structure 74 figure's
  2.64 s. The port does not model frame cost and runs one substep per VBL.

## Runs

```sh
python3 research/damocles-st/scripts/door-speed-probe.py decode
python3 research/damocles-st/scripts/door-speed-probe.py trace --case eris --run research/damocles-st/work/lift-ride-eris-<run>
python3 research/damocles-st/scripts/door-speed-probe.py trace --case vesta --run research/damocles-st/work/lift-ride-vesta-<run>
```

`trace` reads the `trace.json` that
[`lift-ride-probe.py live`](../../research/damocles-st/scripts/lift-ride-probe.py) writes.
It needs no Hatari of its own.

## What this does not settle

- **Opening, exactly.** Opening has no countdown to mark the substep its latch sets, so
  the traces bound it by frame: every opening fits `travel + 1` within its first and last
  frames. The static decode is the same step either way.
- **Frames faster than 4 VBLs**, where substeps outrun VBLs, were not observed.
