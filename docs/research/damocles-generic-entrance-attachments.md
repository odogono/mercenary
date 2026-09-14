# Damocles structure-active selection and generic Entrance Attachments

[#242](https://github.com/odogono/mercenary/issues/242) asks which Damocles
Instance owns the on-foot structure workspace, how the Working Authority's
post-plan Entrance Attachment family behaves beyond Structure 74, and what
slot `$0200` means in four complete selectors. This note answers those questions
from the pinned Atari ST RAM and the Working Disassembly. It is
Working-Authority Evidence, not Authoritative Evidence.

This is research only. It does not translate ST routines into play
([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)), and it
does not change Structure 74's already recovered behaviour in
[the entrance-motion note](damocles-spaceport-entrance-motion.md).

## Sources and limits

All addresses are ST physical RAM addresses. RAM, captures and the Working
Disassembly remain ignored Restricted Material under
`research/damocles-st/work/`; only decoded facts and hashes are recorded here
([ADR 0039](../adr/0039-admit-the-damocles-catalogue-before-playable-integration.md),
[research boundary](damocles-gap.md)).

| Artifact                                                     | SHA-256                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Working Authority STX                                        | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| `observe-first-world-20260818T101117Z-010b9ad3/observed.ram` | `0f2dd8c5bd5c25003f2b29986529cffe4cf8f710a80a4a1fa86ece08d744229b` |
| `research/damocles-st/work/geometry-code.txt`                | `7bdfd0b9125f92ecc22282c2b3056e126ca0e3c6b93f0ab0981b2683dffaf340` |

The two cold first-world RAMs are byte-identical over every code, structure and
workspace range cited below. No runtime capture visits Eris cells `$52`, `$9A`
or `$D8`; the consequence of that gap for slot `$0200` is explicit below.

## Structure-active selection

### One current-cell instance owns the workspace — Confirmed

Surface-cell selection at `$54CBC..$54E3F` reads the current cell's four-byte
placement, selects its structure slot into `$7AF0`, and writes that same
placement's scaled local origin to `$7AF2/$7AF4`. `$59D70..$5A30D` then binds
that structure's plan, post-plan attachments and regions into the single
workspace. The attachment handler and region code do not iterate neighbouring
Damocles Instances. They consume this bound structure and its local Pose at
`$79A8/$79B0`.

The selected level word `$7B02` is copied from the current level selector
`$7AA4` before `$55B8E..$55BFF` binds the structure. `$7AA4` is the same
level-selector field established independently by the resident association
consumer at `$52CDC..$52D41`; it is not a structure slot or a position
coordinate ([resident-object findings](damocles-resident-objects.md)). A
negative `$7B02` means there is no active structure workspace: binding,
region scanning, attachment motion and plan drawing all return early. Both
cold surface captures hold `$7AA4 = $7B02 = $0000`.

| Range            | Decoded role                                   | SHA-256                                                            |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `$52CDC..$52D41` | resident structure/level association           | `46158686e82a668f4d36e137a94341b10ac6d4f76a88959a695ecca1bb12720d` |
| `$54CBC..$54E3F` | current-cell placement and structure selection | `76c1b56f4cfd8d60e531219dffb5ea15542e81618a86edf2d46654e9bb2d4601` |
| `$55B8E..$55BFF` | level gate and selected-structure bind         | `8febb14c400fdfc6c691d84e3931926716793ac2f5a73ec553145ea5ce27523f` |
| `$59D70..$5A30D` | plan, attachment and region workspace bind     | `78a6741c6b481f278506a5cfa3b2ee076a144ac9c9621dfa3c8cce69620d9aae` |

### `$7AF6` is the central-half-of-cell gate — Confirmed

`$5A64A..$5A666` subtracts `$4000` from the low word of world X at `$7A2E`
and from the low word of world Z at `$7A36`, ORs the two results, and stores the
word at `$7AF6`. The result is non-negative exactly when **both** unsigned low
words are in `$4000..$BFFF`; `$C000` is excluded. In 16.16 surface-grid terms,
that is the central half of the current cell on each axis:

```text
fractional X in [0.25, 0.75) and fractional Z in [0.25, 0.75)
```

Every other fractional position makes `$7AF6` negative. This is independent of
the selected model's footprint. The first-world Pose has low words X `$70B1`
and Z `$6C2D`, so `$7AF6 = $3CBD`, non-negative.

The region scanner `$5A30E` requires both `$7B02` and `$7AF6` non-negative.
The post-Mover region handoff/clamp at `$5A64A` recomputes `$7AF6`; when either
gate is negative it sets fallback flags `$7B34 = $C000` and does not clamp.
Therefore region selection, the selected-region ±11 clamp and plan drawing
apply only to the current-cell instance while the Pose is in this central
square.

The attachment handler is deliberately broader. `$5AA3C` checks `$7B02` but
not `$7AF6`, and iterates only the attachments bound for the current-cell
instance. It can therefore finish re-closing that instance's leaves after the
Pose leaves the central square. It never updates attachments belonging to
another instance.

| Range            | Decoded role                                  | SHA-256                                                            |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `$5943C..$595BB` | on-foot substep wrapper                       | `c580d12038ad9c26a05dd822794f1da5933b39a087ac04a0193ac08e552d7dd0` |
| `$5A30E..$5A385` | region and attachment-slot gate               | `9b22a2c4cacfb51c0d8b3eafdf38951ab17e2b78df0dc9ad44777297f6ef94b7` |
| `$5A64A..$5A72D` | active-square test, handoff and clamp wrapper | `97ca607e5c9907a5401a4ccdd768daf19fdac1161a252de7e992d472c4ad156e` |
| `$5AA3C..$5AD51` | generic attachment motion handler             | `cd936e76d64a368856ff04e411221d249cfa4beeafc82b38e6b47533ec508cdb` |

## Generic Entrance Attachment family

### Record and constructor — Confirmed

The post-plan binder `$59E94..$5A24D` allocates attachment slots downward by
four bytes from `$03FC`. The fixed Entrance Attachment record consumed by the
constructor is:

1. a control word;
2. four signed words for the closed plan rectangle
   `(x0, z0, x1, z1)`, transformed by the structure's signed X/Z scales;
3. three panel-surface words and a fourth attachment render/control word;
4. four signed words for the Proximity Box
   `(xMin, xMax, zMin, zMax)`, transformed by the same scales.

The Proximity Box is tested lower-inclusive and upper-exclusive. The first
post-plan controls observed across the resident surface records use six base
constructor modes, plus `$40F0` and `$82F0` variants whose low byte is resolved
through live selector state before the same geometry constructors:

| Control | Leaves | Motion and bind-inset axis | Moving edge(s)                 |
| ------- | -----: | -------------------------- | ------------------------------ |
| `$4000` |      1 | X                          | high-X edge moves toward low X |
| `$4100` |      1 | X                          | low-X edge moves toward high X |
| `$4200` |      2 | X                          | midpoint edges move outward    |
| `$8000` |      1 | Z                          | high-Z edge moves toward low Z |
| `$8100` |      1 | Z                          | low-Z edge moves toward high Z |
| `$8200` |      2 | Z                          | midpoint edges move outward    |

The control-word sign selects the axis everywhere: non-negative means X;
negative means Z. Bit 9 selects the two-leaf constructor. For a one-leaf
record, bit 8 selects which edge retreats. The two-leaf paths split the closed
rectangle at its midpoint on the selected axis. The same sign controls the
region binder's ±11 inset at `$5A2C0..$5A2DD`, so the inset axis and leaf-motion
axis agree for a real attachment slot.

This is not Structure 74-only. For example, Structure 4's record at `$F000`
is another `$4200` two-leaf X Entrance Attachment with raw closed rectangle
X −15–15, Z −80–−76 and Proximity Box X −30–30, Z −150–−10
(26-byte record SHA-256
`f43c2812aa8fabc60558d0df2efaab5aa7ac3ad7397007eaf33eb4e768f65b6e`).
Structure 9's record at `$F952` is `$8200`, the perpendicular two-leaf Z form,
with raw closed rectangle X 13–17, Z 140–220 and Proximity Box X −200–120,
Z 110–250 (SHA-256
`c5c36a83694da027aa83be603e6b6b26557c3c57cefab5700522a9745c6f0e01`).
These are decoded record facts, not claims that either unnamed structure has
been visited in play.

The constructor range has SHA-256
`4726cdaabe8391234a6c232515034c9a4c1d0a4166627d03d14ad2981e6091fb`.
The region-inset range has SHA-256
`53f21745f60933a04233fcd12b65f940d9d87dbd53dc8600f72a885e741a28bb`.

### Latch, endpoint and re-close — Confirmed generically

For an attachment allocated at `slot`, the live control word begins at
`$5A40 + slot`; its low byte at `$5A41 + slot` is the latch:

| Latch | Meaning    |
| ----- | ---------- |
| `$00` | closed     |
| `$01` | moving     |
| `$FF` | fully open |

Inside the Proximity Box, each moving edge advances one model unit per handler
tick. A one-leaf record stops eight units short of the opposite closed edge. A
two-leaf record stops each inner edge eight units inside its corresponding
outer edge. The handler then writes `$FF`. Outside the box, any nonzero latch
takes the inverse interpolation back to the original closed edge or midpoint
and finally clears to `$00`. Thus the live latch, endpoint and re-close rule
recovered for Structure 74 are properties of all six base constructor modes,
not a Capital Spaceport special case.

Low-byte selector variants and the handler's additional live-condition path
are not named here. Their geometry follows the constructors above, but the
game-state predicate selecting open versus close remains unresolved. No
implementation should infer that predicate from `$F0`.

## Structure 75 at Eris STATE OFFICE

[#243](https://github.com/odogono/mercenary/issues/243) applies the family to
the Working Authority's **STATE OFFICE** at cell `$89` (`09-08`). Damocles
Instance `eris-surface-89` selects `structure-014ad2`, an alias whose header
points to Structure 76's plan at `$014AEC` while retaining Structure 75's
identity, scale 1/1, palette 26 and building-detail slot 43.

The first post-plan record is at `$014C46..$014C5F`:

| Field                  | Recovered value                            |
| ---------------------- | ------------------------------------------ |
| Control word           | `$8200`                                    |
| Closed rectangle       | X 293–297, Z −160–−40                      |
| Proximity Box          | X 100–500, Z −200–0                        |
| Constructor            | two-leaf Z; midpoint edges start at Z −100 |
| Runtime slot           | `$03FC`                                    |
| Fully-open inner edges | Z −152 and −48 (outer ±8)                  |
| Doorway-strip region   | flags `$03FD`, X 290–300, Z −160–−40       |
| Region gate / inset    | `attachmentLatch`; Z ±11                   |

The 26-byte record has SHA-256
`6432275567adcf5780332fea385df1f33429f4876fe7a4b1529cbf63e4be808c`
in both pinned cold first-world RAMs. Its control sign, bit 9, slot allocation
and region flags therefore select the generic two-leaf Z path; no Structure
75-specific latch or X-motion assumption is needed.

Structure 75 has three more two-leaf Entrance Attachments in slots `$03F8`,
`$03F4` and `$03F0`. Their 26-byte record SHA-256 values are respectively
`b6098474a0f05ad342aa81a50f43595162554aab3182044e3ccc4307589c60a5`,
`9946a18ea783b51d6a62ff3a9baeab8a014c2eb52e9b9c528a10346970f0ddab`
and
`f7a8bd056691dacbe3ae013179880e08c106d6cab7dd843daeda922a1f99c259`.
The first two are `$8200` Z constructors and the last is a `$4200` X
constructor. They are retained as independent per-slot records; the proving
walk uses the `$03FC` STATE OFFICE entrance.

## Slot `$0200` on the shared complete selector

`structure-00ff04`, `structure-010152`, `structure-010164` and
`structure-010176` are scaled aliases of the same plan/region record beginning
at `$FF04`; it contains no post-plan attachment. Its second region has flags
`$8200` and is a thin strip immediately beyond the central region:

| Model              | X/Z scale | Region 2 scaled raw X | Region 2 scaled raw Z | Eris Instances                            |
| ------------------ | --------- | --------------------- | --------------------- | ----------------------------------------- |
| `structure-00ff04` | 1/1       | −40–40                | −100–−90              | none                                      |
| `structure-010152` | 2/1       | −80–80                | −100–−90              | cell `$52` (`02-05`)                      |
| `structure-010164` | 2/2       | −80–80                | −200–−180             | none                                      |
| `structure-010176` | 1/1       | −40–40                | −100–−90              | cells `$9A` (`10-09`) and `$D8` (`08-13`) |

The shared record `$FF04..$10013` has SHA-256
`386fcda56a8fc0a3486ea9ba0f03ac38c409cf36bbd50087eeef46e966c76c88`;
its region tail `$FF6A..$10013` has SHA-256
`e14f17ab2450bfc67ba8fd23cea3b05d241b0e03ae99b8f70a98143da6d53f9c`.

`$0200` is a reserved **unconditional passage sentinel**, not an attachment
slot for this record. The scanner at `$5A366..$5A386` explicitly exempts
`$0200` from the negative-latch requirement, so region 2 is selectable without
an attachment mesh or an open endpoint. This differs from Structure 74's
`$03FC`, which is gated until its real latch is negative.

There is a quirk in the binder: `$5A2C0..$5A2DD` does not exempt `$0200`.
It still tests the word at `$5A40 + $0200 = $5C40` to choose the ±11 inset
axis. Both cold captures contain `$0000` there (two-byte SHA-256
`96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7`),
which would inset X, yielding runtime X −29–29 for the 1/1 aliases and
−69–69 for the 2/1 and 2/2 aliases.

That value is not record-owned. `$5A40 + slot` is also a shared projected
geometry workspace written by `$570CC..$572B5` (range SHA-256
`66b5911e2316683400045eaa5351d323dae6b9de4055e8f34324c7aa4647d942`).
The structure binder clears only the descending attachment slots it allocates,
starting at `$03FC`; binding this no-attachment record clears `$03FC` and does
not rewrite `$0200`. The answer to the global-workspace question is therefore:
**yes, `$5C40` is globally writable scratch; no, this structure bind does not
rewrite it into a per-structure latch.**

Whether `$5C40` is still non-negative at the actual binds for Eris cells `$52`,
`$9A` and `$D8` is **Unresolved**. The capture/scenario search for those three
cells returned no run, and both available RAMs are bound to Structure 74 at
cell `$87`. The X-inset values above are the result for the captured zero word,
not a claimed natural-walk observation. A targeted entry capture must record
`$5C40`, `$B23C` region workspace and `$7AF0/$7B5C` immediately after bind.

## Catalogue schema consequence

Catalogue schema 6's current `structureSelection` is insufficient for generic
Entrance Attachments. It retains region flags and, only for Structure 74, a
closed mesh. Those values cannot distinguish one leaf from two, recover the
motion/inset axis and moving side, test the Proximity Box, or preserve the
live-latch relationship. The schema should gain:

- raw `controlWord` plus a normalized constructor
  (`leafCount`, `motionAxis`, and one-leaf moving side);
- scaled `proximityBox`;
- the attachment slot referenced by a gated region;
- an explicit region-gate kind distinguishing `none`, `attachmentLatch` and
  the unconditional `$0200` sentinel;
- an explicit resolved region inset axis when it is safe to claim one.

The one-unit tick, eight-unit endpoint and `$00/$01/$FF` latch meanings are
family semantics and need not be repeated in every record. Closed mesh plus
raw flags alone does **not** suffice. Because schema 6 is already emitted and
validated, adding required contract fields should be a successor schema rather
than silently changing the meaning of version 6. The `$0200` case must not be
materialized as a fictitious Entrance Attachment.

## Probe log

The issue and comments were read with:

```sh
gh issue view 242 --repo odogono/mercenary \
  --json number,title,body,comments,labels,state,url
```

The two RAMs were passed independently through
`damocleslab.catalogue.extract`; the probe printed the five named selectors'
source ranges, scales, region flags/bounds and attachment presence, then
compared `$5C40`, `$7AF0`, `$7AF6`, `$7B02`, `$7B34`, `$7B5C`, `$7AA4`,
`$7A2E` and `$7A36`. A second read-only probe grouped every model whose first
post-plan word was nonzero and decoded the fixed 26-byte records whose
rectangle, colour family and Proximity Box validated. A third probe selected
all Eris Instances of the four `$FF04` aliases. Hashes were computed directly
from the RAM byte ranges named in this note with Python `hashlib.sha256`.

The failed coverage probe searched all tracked scenarios/manifests for cells
`$52`, `$9A`, `$D8` and NAV labels `02-05`, `10-09`, `08-13`; it found no
runtime scenario. No ST code was copied, translated or tracked.

## Status

| Claim                                                                                                             | Status     | Evidence                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `$7AF6 >= 0` exactly in the central half-open 50% of both current-cell axes                                       | Confirmed  | `$5A650..$5A666`; first-world state words                                     |
| `$7B02` is the copied level selector; negative means no active structure workspace                                | Confirmed  | `$59468..$59482`, `$55B8E..$55C00`, `$52CDC..$52D41`                          |
| Region scan and clamp operate only on the bound current-cell instance and active square                           | Confirmed  | `$54CBC..$54E3F`, `$5A30E..$5A72D`                                            |
| `$5AA3C` updates only bound-instance attachments but can re-close outside the active square                       | Confirmed  | `$59562..$59586`, `$5AA3C..$5AD51`                                            |
| Control sign selects X/Z for constructor motion and region inset; bits 9/8 select leaf count/side                 | Confirmed  | `$59FE2..$5A202`, `$5A2C0..$5A2DD`, `$5AA3C..$5AD51`                          |
| Generic latch is `$00` closed, `$01` moving, `$FF` open; endpoint is outer ±8 and retreat re-closes               | Confirmed  | `$5AAA0..$5AD4E`                                                              |
| `$0200` regions are unconditional and have no attachment mesh                                                     | Confirmed  | shared `$FF04` record, `$5A366..$5A386`                                       |
| `$5C40` is global scratch and is not rewritten by the no-attachment structure bind                                | Confirmed  | `$570CC..$572B5`, `$59E94..$5A24E`; both RAMs                                 |
| Structure 75's STATE OFFICE entrance is `$8200`, two-leaf Z, slot `$03FC`, with an `attachmentLatch` Z-inset gate | Confirmed  | `$14C46..$14C5F`; both RAMs                                                   |
| Natural Eris `$0200` bind always uses X inset                                                                     | Unresolved | no `$52/$9A/$D8` runtime capture; captured `$5C40` is zero only at cell `$87` |
| Meaning of `$40F0/$82F0` live selector predicates                                                                 | Unresolved | constructor decoded; selecting game-state predicate not traced                |
| Schema 6 closed mesh plus flags is sufficient                                                                     | Disproved  | constructor, Proximity Box, gate and scratch-dependent inset facts are absent |
