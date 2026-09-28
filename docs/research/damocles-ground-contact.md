# Damocles ground contact, the fall, and the gates that read `$7ACA`

Working-Authority Evidence for
[#357](https://github.com/odogono/mercenary/issues/357), recovered 2026-09-26.

The drop handler's direct path refuses while `$7ACA` reads zero, the leave path refuses on
the same test, and the launch handler refuses on the opposite one. `$7ACA` read 63 in every
memstate the [placement class note](damocles-placement-class.md) swept, so none of the
three refusals that need contact had been observed. This note recovers what writes the
word, corrects one source range the [key drops note](damocles-limo-key-drops.md)
mislabelled, and observes the direct-drop refusal on an ordinary route, with a control on
the same route.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual
recovery, not translation of machine code into application code. Raw RAM, native listings,
probe runs and screenshots stay ignored under `research/damocles-st/work/`. Authoritative
Evidence remains bound to the C64 Reference Build; everything here is Working-Authority
Evidence.

## Evidence identity

Static recovery reads the pinned first-world RAM
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, decoded with Capstone
M68K 68000 in the laboratory virtual environment. Writers and readers were found by
disassembling every even address in `$40000`–`$60000` and filtering on the operand, since
`lab xref` misses destination operands.

The runtime observation is the tracked
[`scripts/ground-contact-probe.py`](../../research/damocles-st/scripts/ground-contact-probe.py),
SHA-256 `17fb16d17e207b5918eb49624c060719696623c656336de9782881542b74aa30`, booting the
rehosted Dion pose `snapshots/rehosted/dion-2-3.sav`, SHA-256
`361f5ca00cf2a0220489de25c81a7085e812cff019a1b2f44127f55db3ea2f80`, on the pinned Hatari at
the ordinary frame rate.

```sh
python3 research/damocles-st/scripts/ground-contact-probe.py
```

## What writes `$7ACA`

Every writer in the image:

| Address | Writes | Reached from |
| --- | --- | --- |
| `$0582F8` | 63 | the craft vertical update: clamped to the ground, or an accepted support |
| `$058320` | 0 | the craft vertical update: above the ground with no support |
| `$057D0A` | 63 | the shared landing tail, after a fall or a hard landing |
| `$057D68` | 0 | the fall routine, on every pass |
| `$05934C` | 0 | the arrival support search, with no support, **only when not on foot** |
| `$058C72` | 0 | code after the space entry at `$05872E`; its caller is not traced here |

And every reader:

| Address | Test | Effect |
| --- | --- | --- |
| `$05462A` | zero refuses | the direct-drop gate, unless slot 0's handling byte has bit 7 set (`$054622`) |
| `$0544A8` | zero refuses | the leave path |
| `$055828` | non-zero refuses | the launch handler |
| `$057DEA` | zero tests `$7A30` − `$40` | the wheeled-craft routine, below |
| `$05802C` | non-zero offsets a term by `$20000` | the common craft routine `$057F46` |
| `$0583AA` | non-zero skips a `$7ABE` update | the common craft routine |

**No on-foot code clears it.** The on-foot Mover at `$058CFE`–`$058D7C` never touches
`$7ACA`, and `$05934C` skips the clear when `$7AAE = 1`. The only clears run aboard a craft,
in the fall, or in the space code. On an ordinary route the player on foot is always in
contact, and every refusal the contact gate makes happens aboard.

## The craft vertical update, `$0582AA`–`$05832B`

It runs inside the common craft routine that every flying and wheeled craft enters. `d3` is
the vertical step the routine has just computed.

1. `$7AB6 += d3`.
2. **Below 64**: a step below −100 (`$0582D8`), or a nose-down pitch with `$7AC0 ÷ 4` at or
   above `$A0` (`$0582E8`), goes to the landing handler at `$057CF2`. Otherwise Y clamps to
   63 (`$0582F0`), contact becomes 63 and `$7ABE` clears. A nose-down pitch is then levelled
   to `$1FF`, and a nose-up one is kept only while the forward term in `d1` exceeds `$4FFFF`.
3. **At 64 or above**: the support search. If it finds a support, `$7BC8 := 63`, the low word
   of Y becomes the support's top plus 63, `$7B02` takes the support's level word, and
   contact becomes 63 as in step 2. If not, `$7ACA`, `$7BC8` and `$7B02` all clear
   (`$058320`–`$05832B`).

So `$7ACA` is **"standing on the ground or on a support"**, and 63 is the eye height the
clamp puts the craft at. It is not a distance or a height.

## The support search, `$0583EA`–`$05843B`

It returns "no support" at once when the high word of Y is non-zero, which means no support
is found above 65 535. Otherwise it walks fourteen-byte records from `$CB7A + 14` to a
negative header. A record is accepted when:

- its top word at `+2`, plus 63, minus the eye's Y is between 0 and 128 inclusive; that is,
  the eye is between 65 below the top and 63 above it;
- the X low word lies within `+4`..`+6`, and the Z low word within `+8`..`+10`, unsigned.

The routine returns with `a1` at the record's `+12`, the level word that `$7B02` takes. The
arrival path at `$059324`–`$059358` calls the same search. With a support it stands the
player on it just as the craft update does; without one it clears `$7BC8` and `$7B02`, and
clears `$7ACA` only when the player is not on foot.

## The fall is craft slot 9, not `$057DE6`

The key drops note called `$057DE6`–`$057DFD` the **on-foot unsupported fall**. It is not.
The craft routine table at `$055C80` has one 32-byte entry per craft slot, each opening
with a branch to that slot's control routine, and `$057DE6` is the entry for
**slots 2, 5, 6 and 13**: `99 CHEVY`, `V.I.P. LIMO`, `TARG TOURER` and `22 CV`, the four
wheeled craft, none of them equipped for space in the
[launch table](damocles-arrival-routes.md#launch-is-gated-on-ground-contact-and-on-the-crafts-own-parameters).
It runs the common craft routine and then, while `$7ACA` is zero, subtracts `$40` from
`$7A30`, which is a copy of the Y from before the pass; a negative result goes to the landing
handler. **A wheeled craft that loses contact from below 64 lands**; the flying craft, whose
entries branch straight to `$057F46`, do not. The craft Mover port implements this rule
(`web/src/damocles/craft.ts`).

The on-foot fall is elsewhere:

- The on-foot Mover ends at `$058D68`: while `$7BC8` is set, meaning the player stands on a
  support, it re-runs the support search after the step. If the step has left the support,
  `$058D74` writes the long `$00000009` to `$7AAE`, so the occupancy becomes 0 (aboard) and
  the boarded slot becomes **9**.
- Slot 9's entry at `$055DA0` branches to `$057D64`, and its parameter words are the fall.
  Each pass clears `$7BC8` and `$7ACA` and lowers Y by the long at `+4`, which is **37**.
  Below zero it goes to the landing handler. Otherwise it runs the support search, and a hit
  stands the player on that support (`$0582C0`) and enters the landing tail at `$057D0A`.
  Without a hit it adds `+8` (13) to `$78EE`, whose magnitude less 64 becomes `$7ABE`; `+$A`
  (25) to `$7AC0` and `+$C` (19) to `$7AC2`, both masked to ten bits; and the last on-foot
  step `$79B2`/`$79B4` times the word at `$051D22` (11) to X and Z. The player tumbles and
  carries on in the direction they walked off.
- Slot 9 has no resident, no key and no parameter block beyond these words. It is a Mover
  state, not a craft.

The landing handler `$057CF2` and its tail `$057D0A`–`$057D60` are shared by the fall, the
wheeled craft and a hard craft landing. The tail sets contact 63 and pitch `$1FF`, calls
`$058F64`, `$0560F2` and `$054744`, then branches on the sign of `$78A6 & $794A`. One side
calls the leave path `$05449C`. Both sides then set `$7A78 = 3` and continue at `$051036` with
different pointers in `$04BF54`. **What the player experiences at the bottom of a fall,
survival or otherwise, is not recovered here.**

The route into a fall needs `$7BC8` set on foot. The writers are the craft update and the
arrival search above, and `$05923E`/`$05946E` on the lift and transporter arrival paths.
None of the captures reads `$7BC8` non-zero, and no capture shows a fall.

## Observed on an ordinary route

Two runs of the probe, `ground-contact-20260926T114608Z-5ce010cc` and
`ground-contact-20260926T114814Z-abd602b3`, agree in every field below except the climb
height at which the air drop was pressed. From the Dion pose the player boards
`EAGLE NINE S E` with `B`, drops once on the ground, climbs, and drops again. Nothing is
poked. Markers are `:trace` breakpoints counted from the emulator log between phases.

| Phase | `$7AAE` | Slot | `$7ACA` | Craft Y | Carried | `$054520` | `$05462A` | `$054632` |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Restored | 1 | — | 63 | 63 | 151, 181, 183 | | | |
| Boarded | 0 | 3 | 63 | 63 | 151, 181, 183 | | | |
| Ground drop | 0 | 3 | 63 | 63 | 181, 183 | 1 | 1 | 1 |
| Before the air drop | 0 | 3 | **0** | 5454 / 6143 | 181, 183 | | | |
| Air drop | 0 | 3 | **0** | 10270 / 10469 | 181, 183 | 1 | 1 | **0** |

**An ordinary route produces `$7ACA = 0`.** The craft's own vertical update clears it once
the craft is above 64 with no support under it. It stays clear for three consecutive
samples above 2000 before the air drop is pressed.

**A direct Drop with no contact refuses at `$05462A`.** Both drops enter the handler once
and reach the contact test once. The ground drop passes it, reaching `$054632`, and places
`DAMOCLES FILE` slot 151 at the craft's X/Z with Y 0, which is eye 63 minus 63. The air drop
never reaches `$054632`, and the Carried Stack is unchanged. The other gates before
`$05462A` are the same in both drops. Slot 0's Association A is `$00311004` in every sample,
so its handling byte is `$10`, bit 7 is clear, and the `$054622` bypass is not taken. The
selection exponent at the air drop is 13 or 14, above 6, so the handler takes the direct
path rather than the support path. The refusal is silent: no message is raised.

The ground drop is also the first capture of **a Drop completing aboard**, which the
[boarding admission contract](../design/damocles-boarding-admission.md#aboard) recorded as
untested. The dropped file's Association B reads `$10000032` and Association A `$00020501`.

Two memstates the placement-class sweep did not include confirm the same state from
play. `dion-north-airborne.sav` and `damocles.key-west.sav` both read `$7AAE = 0`, slot 3
and `$7ACA = 0`, at Y 70 084 and 3 043 327. The first also carries three objects, and four
drop chords pressed on it by `support-drop-probe.py --case multi-drop` left the stack
unchanged. That run has no markers, and it is corroboration, not the evidence above.

## The launch handler

`$055822` refuses while `$7AAE` is non-zero or `$7ACA` is non-zero, which is the inverse of
the drop and leave gates: a craft launches only from the air. The
[arrival routes note](damocles-arrival-routes.md#the-departure-chain) already drives the
climb to `$7ACA = 0` and the accepted launch, so this note adds nothing to the launch beyond
naming the writer that lets it pass.

## What this means for the port

1. Ground contact is a property of the Mover, not of the Drop. It is set by standing on the
   ground or on a support, and cleared only by a craft above both, or by the slot-9 fall.
2. On foot the player is always in contact. A port whose on-foot Mover cannot stand on a
   support, and so cannot walk off one, has no on-foot state in which a Drop's contact gate
   could refuse. The fall needs support standing first, and that is movement work.
3. Aboard, contact follows the craft. The port's craft Mover carries `$7ACA` in its own
   state, and the leave, launch and direct-drop gates read it there.
4. The direct-drop refusal is observed only aboard an airborne craft. The port tests it on
   the route the probe runs, a climb that clears contact, not on a fixture that sets it.
5. A Drop completes aboard on the ground, and it places the object as the direct path does,
   one eye height below the craft's eye, with insertion group zero because `$7AAE` is not 1.
   The port admits it on the surface where the craft stands, with the zone still taken
   against the bound structure.
6. `$057DE6` is the wheeled-craft landing test, a craft Mover rule. It is not an on-foot
   behaviour.

## Source ranges

Half-open ranges in the pinned first-world RAM. The first three are the ranges the key drops
note already cited, with the same digests.

| Range | SHA-256 |
| --- | --- |
| `$0582AA`–`$05832C` vertical contact update | `2ea45e8c312d477f5865e032057b525c88f8912ce6716d0f623beb32dbfb6f54` |
| `$0583EA`–`$05843C` support search | `aed65361dbe13fb59d29acdd4c97737ad5634f0d2530a6c1b428a1daa803b82f` |
| `$057DE6`–`$057DFE` wheeled-craft routine | `9fa1f3e044d1e09e2af92fbc7d979d199e3c0340a37b971001ceed22db6cf45c` |
| `$057D64`–`$057DE6` slot-9 fall | `8341ba2fd7f065953a9eeac8f6661ac49431c8020c04681ea3e9a37bc554b703` |
| `$057CF2`–`$057D64` landing handler and tail | `dfb9b335c3e0c6d51c8b85a76ca865c5f5c05598814d1c00657490f5ddd1dcff` |
| `$058CFE`–`$058D7E` on-foot Mover | `77edd98ade467122cd898df5988ff0ddd4ad5ed8b3ec38c38d383b13d476ca0f` |
| `$055C80`–`$055E80` craft routine table, slots 0–15 | `463e1cb0c1e349a112f920e3e61a639b4cb685ee784fbc57f43ed5e6ab6b01de` |
| `$0590AE`–`$059100` region box test the landing handler calls | `ad9539c059aace8642ae7fb69b719473b33bf3ffe5b7ce4643215740f8777ce2` |
| `$059324`–`$05935A` arrival support search | `ef75d655ea63a6951244e9556624c1f17a90ae40b555ed8b708520f83a4f987c` |
| `$054620`–`$054632` direct-drop contact gate | `e7c10c5f9a0bb00db9c9737e9645d52d979ca72040424209381663a1c577fff1` |
| `$05449C`–`$0544B0` leave contact guard | `8d2e4486051a23ea8f680bd247447ee406c0417f1bf7c10e6e242f0baae83d9e` |
| `$055822`–`$055830` launch contact guard | `1186c30785c79ce00ded7da76df8989d3b09b3e8624014ab7e4844c355abc563` |
