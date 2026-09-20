# Damocles Vehicle Keys: a carried requirement, not a permanent unlock

Working-Authority Evidence for
[#404](https://github.com/odogono/mercenary/issues/404), recovered 2026-09-20.
[The arrival-routes note](damocles-arrival-routes.md#the-board-gate) recovered the
board gate at `$054310`–`$054338` and its final test, `tst.b $7272(a0)`, but left
one behavioural question open: is that byte a permanent unlock the player earns
once, or does it track what the player is carrying?

**It tracks the Carried Stack.** The gate's byte is not a private array at all:
`$7272 + slot × 4` is the same address as `$6FAA + (slot + 178) × 4`, the
association-A handling byte of the craft's paired key object. Bit 7 of that byte
is the object's carried bit, set by the take and cleared by the drop. Dropping
`KEY- V.I.P. LIMO` revokes the right to board the `V.I.P. LIMO` immediately, and
taking it back restores it. The same holds for `EAGLE NINE S E`.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits
factual recovery, not translation of the Working Authority into application code.
Raw RAM, native listings, probe results and screenshots stay ignored under
`research/damocles-st/work/` (see [the research boundary](damocles-gap.md)); only
decoded facts and hashes are recorded here.

## Evidence identity

Static recovery reads the pinned first-world capture
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`, with
Capstone's M68K 68000 big-endian decoder in the laboratory virtual environment.

Runtime evidence comes from the tracked
[vehicle-key gate probe](../../research/damocles-st/scripts/vehicle-key-gate-probe.py),
SHA-256 `40374b315edf45574be9d59cc6f27440bc7fcb659257e261662aec3d2ac42e3d`, which
replays ordinary take, drop and board inputs from tracked memstates. `lab doctor`
passed on 2026-09-20: ST with 1 MiB, Hatari 2.6.1 (binary SHA-256
`05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`), Python
3.13.15, and the STX/TOS identities in
[`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Memstate | SHA-256 |
| --- | --- |
| `snapshots/left-limo.sav` | `5d0ac4653d9209e6426aac3e04a3fb6671dd13694030f3d977eb6eda1d990c1a` |
| `snapshots/eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| `snapshots/interior-window.sav` | `a11254db81c2552be6b73c6d4e8f654e740a1c46553193a2aa28e78f7ba54dd6` |
| `snapshots/rehosted/vesta-parliament-4-6.sav` | `35a8a020599dfac92fa0f5d7bd46a4e18550342477c00bd88168deac99c0ce47` |

The Vesta pose must be the rehosted container: the capture came from an
IPF-capable Hatari build and the pinned build refuses the original, which is what
[`memstate-rehost.py`](../../research/damocles-st/scripts/memstate-rehost.py)
exists to fix. The probe now says so in its error rather than hanging.

Nothing is injected. Walking is the joystick-1 softcopy byte at `$79C2` the
laboratory already uses, take, drop and board are real key events, and every
sample is a `savebin` taken while the machine is stopped. The one breakpoint the
`interior-board` case can arm is observational: its callback saves memory windows
and continues, and it writes nothing into the guest.

```sh
research/damocles-st/lab doctor --roms /path/to/roms
python3 research/damocles-st/scripts/vehicle-key-gate-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/vehicle-key-gate-probe.py --case drop-board
python3 research/damocles-st/scripts/vehicle-key-gate-probe.py \
    --case interior-board --breakpoint region
```

## The gate's byte is the paired key's own carried bit

The gate's addressing settles the question before any replay does.
`$054318` loads `a0` from the selection longword `$7B46`, which is the resident
slot times four, so `$054332`'s `tst.b $7272(a0)` reads `$7272 + slot × 4`. The
per-object association-A handling byte lives at `$6FAA + slot × 4` — that is the
byte [the pickup note](damocles-limo-key-pickup.md#the-ordinary-take-is-native)
watches as slot 183's `$7284` longword. And

```text
$7272 + slot × 4  ==  $6FAA + (slot + 178) × 4
```

exactly, because `$7272 − $6FAA = $2C8 = 178 × 4`. The offset 178 is the
`key slot = vehicle slot + 178` relation [the V.I.P. limo note](damocles-vip-limo.md)
already recovered. So the board gate reads **the handling byte of the craft's own
key object**, and `$054332` is the only instruction in `$40000`–`$80000` that
uses the `$7272` displacement form. The array was never a separate thing.

Bit 7 of that byte has exactly one setter and three clearers in the same range:

| Address | Instruction | Path |
| --- | --- | --- |
| `$0542A4` | `bset.b #$7, $6faa(a0)` | the ordinary take |
| `$05467C` | `bclr.b #$7, $6faa(a0)` | the ordinary drop |
| `$04CB00` | `bclr.b #$7, $6faa(a0)` | the remove-from-Carried-Stack helper `$04CAF0` |
| `$04CB74` | `bclr.b #$7, $6faa(a0)` | a caller of that helper, via `$7A5C` |

`$051A96`–`$051A9E` is a read, not a write: a Damocles Script conditional that
tests the same bit for the object indexed by `$7C3E`, which is consistent with
the bit meaning *carried* rather than *unlocked*. `$055206` and `$055244` also
set it, inside the routine at `$0551A0` that rebuilds the Carried Stack at `$61CE` and
`$61CC` from a stored list — a restore path, though its caller was not traced — it sets the bit for exactly the slots it puts back in the Carried
Stack, so it preserves the invariant rather than granting anything.

Crucially, the drop's `bclr` at `$05467C` sits **before** the placement split at
`$0546A0`, so both the support-placement path and the direct-placement path clear
it. [The drops note](damocles-limo-key-drops.md#direct-placement-and-support-placement-are-different-paths)
distinguishes those two insertion paths; the key bit does not.

## The invariant across every tracked memstate

Reading all 256 resident slots in all 32 tracked memstates, bit 7 of
`$6FAA + slot × 4` is set for exactly the slots in the Carried Stack at
`$61CE`/`$61CC` — with **one** exception, recorded below. For the four craft
whose paired key slot is populated, this reduces to a clean table:

| Pose group | Carried Stack | Slot 1 `DART II` | Slot 3 `EAGLE NINE S E` | Slot 5 `V.I.P. LIMO` | Slot 7 `INTERSTELLARSHIP` |
| --- | --- | --- | --- | --- | --- |
| `eris-spaceport-onfoot`, `interior-window` | empty | `$04` | `$04` | `$04` | `$08` |
| `left-limo`, `boarded-limo`, `boarded-car` | `183` | `$04` | `$04` | **`$84`** | `$08` |
| the other 27 poses | `151, 181, 183, …` | `$04` | **`$84`** | **`$84`** | `$08` |

Slot 1's key would be resident slot 179 and slot 4's slot 182; neither is ever in
a Carried Stack and neither byte is ever set. Slot 7's `$08` is a different
class of byte and is never set, which is why the INTERSTELLARSHIP is refused for
its own reason — the chooser answers it from the slot number alone.

**The exception.** In all 27 of those poses, resident slot 38 has bit 7 set
while not being in the Carried Stack. The fan guide lead below places a
`Door Key "I"` at Dion 03/03, and [the guide resident list](damocles-guide-resident-list.md)
records slot 38 as DION `03-03` Key **I**. Its association B is unchanged at
`$10030033` and its coordinates are its authored ones, so it was never taken by
the path at `$0542A4`, which also writes `$78` into association B. No writer that
produces this state was found. It is recorded here as unresolved. It does not
affect the craft answer — slot 38 is below 178, so no board gate ever reads it —
but it is the reason the memstate correlation alone is not proof, and why the
replays below were run.

## The decisive replays

`left-limo` restores the player standing on the `V.I.P. LIMO` (resident slot 5)
on the Eris surface, with `KEY- V.I.P. LIMO` (resident slot 183) carried.

| Run | Case | Inputs | Result |
| --- | --- | --- | --- |
| `vehicle-key-carried-board-20260920T154305Z-fc6f9dbb` | `carried-board` | `B` | **boards**: `$7A8E` 1 → 0, `$7AB0` `$FFFF` → `$0005`, gate byte `$84` throughout |
| `vehicle-key-drop-board-20260920T154315Z-37d97d2b` | `drop-board` | step back, drop, step in, `B` | **refused**: gate byte `$84` → **`$04`** on the drop, Carried Stack 1 → 0, `$7A8E` stays 1, and the message row presents system string **3**, `VEHICLE KEY REQUIRED` |
| `vehicle-key-drop-retake-board-20260920T154334Z-3b9f2d87` | `drop-retake-board` | step back, drop, take, step in, `B` | **boards again**: byte `$84` → `$04` → `$84`, then `$7AB0` → `$0005` |
| `vehicle-key-interior-drop-20260920T154355Z-c64fea88` | `interior-drop` | the tracked pickup route, take, drop indoors | gate byte `$04` → `$84` on the take and back to **`$04`** on the drop, inside Capital Spaceport **region 1** |

The step back matters and is not cosmetic: standing on the craft puts it inside
the drop's nearby-support distance, where the handler compares the dropped
object's support requirement against the craft's own support rank and refuses
silently. Walking off first sends the drop down the direct-placement path.

**Both insertion paths clear the bit.** `drop-board` drops on the bound exterior
surface (`$7B34` = `$C000`, region 5); `interior-drop` drops inside Capital
Spaceport region 1 (`$7B34` = `$8000`), the interior path that searches the
association-list root for a matching insertion group. The byte reads `$04` after
each. That is the distinction #404 asked to be run on both sides, and it makes no
difference.

The refusal message was identified two ways: the message gate `$7BA0` reads
`$FFFF` while the pointer `$7B98` walks the 50-byte record at `$072DC4`, which is
table entry 3 of the system-string table at `$070000` (entry 4 begins at
`$072DF6`); and the screenshot at that moment shows `VEHICLE KEY REQUIRED` on the
Damocles Message Row with the inventory reading `EMPTY`.

### The second craft

`vesta-parliament-4-6` restores the player 194 source units from
`EAGLE NINE S E` (resident slot 3) with a Carried Stack of `151, 181, 183`. That
distance is inside the gate's reach and outside the drop's nearby-support
distance, so no walking is needed to reach the direct-placement path.

| Run | Case | Result |
| --- | --- | --- |
| `vehicle-key-eagle-carried-board-20260920T154502Z-87f98d86` | `eagle-carried-board` | **boards**: `$7AB0` `$FFFF` → `$0003` with the gate byte at `$84` |
| `vehicle-key-eagle-drop-board-20260920T154511Z-c819baa3` | `eagle-drop-board` | two drops release `151` then `181`; the gate byte goes `$84` → **`$04`** on the second, and `B` is **refused** with system string **3** |

Two details of that run are evidence in their own right. The drop releases the
head of the Carried Stack, so reaching slot 181 required dropping `151` first,
and the gate byte did not change until `181` itself left — the bit belongs to the
key object, not to the act of dropping. And the refusal screenshot shows
`KEY- V.I.P. LIMO` still in the inventory: carrying one craft's key does not open
another's, which is the pairing rule observed rather than assumed.

Getting the message out of this pose needed care that is worth recording. Once
the keys are on the ground they become the nearest drawn object, so the gate
reads *them* as the selection and refuses at `$05431E` for slot rather than at
`$054332` for the key — silently. Stepping off the dropped keys first is what
lets the key test run at all.

## The two guards before the key test

### The region flag at `$054310` — exercised, by an ordinary route

`btst #$E,$7B34` is expressed on a byte address, so the tested bit is bit 6 of
that byte, matching the reading in
[the drops note](damocles-limo-key-drops.md#direct-placement-and-support-placement-are-different-paths).
It is clear whenever the player is inside a structure region: `interior-window`
and every capture taken inside Capital Spaceport region 1 read `$7B34` = `$8000`.

`interior-board` walks the tracked pickup route, takes the key and drops it, so
the dropped key lies at the player's feet — a selection at distance exponent 5,
well inside the gate's reach — and then presses `B` eight times.

| Run | Breakpoint | Hit |
| --- | --- | --- |
| `vehicle-key-interior-board-20260920T153451Z-a880e4ee` | `$054302`, gate entry | **yes** — captured `$7B42` = 5, `$7B46` = slot 183, `$7B34` = `$8000` |
| `vehicle-key-interior-board-20260920T154003Z-0ab3c302` | `$054310`, the region test | **yes** — captured the same state at the guard itself |
| `vehicle-key-interior-board-20260920T154140Z-4ea76bd5` | `$054318`, past the region test | **no**, across eight presses |

So the gate is entered from an ordinary press, reaches the region test with the
reach and selection tests passed, and never gets past it. Pressing `B` indoors is
the named ordinary route that exercises `$054310`, and it refuses **silently** —
no message, no sound, no state change.

One probe lesson is recorded so it is not re-derived: a second `:once` breakpoint
armed over the command FIFO while another is live was not seen to take. Arming a
single breakpoint per run, repeating rather than `:once` for the ones that must
catch any pass, is what made these three runs meaningful. The first attempts,
with three `:once` breakpoints armed together, produced a false negative at
`$054310`.

### The VOID staging body at `$05432A` — reachable state, unreachable guard

`cmpi.w #$78,$7AA8` names body-table index 30, VOID. Across the 32 tracked
memstates the body selector is never `$78`, and exactly one instruction in
`$40000`–`$80000` writes that literal: `$050FF8`, `move.w #$78,$7AA8`.

That instruction sits in the **death** routine. `$050F0E` is called each frame
from `$058EBA` and `$0594E6` and is driven by the state word `$7A64`: a hit sets
`$7A64` = `$8000` and raises the message in `$7A7C`; 500 frames later `$050F8C`
sets `$7A64` = 1; the next entry falls through to `$050F9E`, which sets
`$7AA8` = `$78` and then raises system string **33**, whose text is
`YOU'RE A BIT DEAD - TO QUIT OR LOAD PRESS HELP`. From `$051016` it loops on its
own key read at `$05547A`, acting only on scancode `$62` (Help) and exiting only
when `$7A64` leaves 1.

So the state is ordinarily reachable — dying is an ordinary route — but **the
guard is not ordinarily exercisable**: the same routine that sets `$7AA8` = `$78`
takes the keyboard, and the main dispatcher at `$0555B8` that routes `B` to the
board gate never runs again while it holds. The identical `$78` tests in the take
handler at `$054204` and the drop handler at `$054524` are unreachable for the
same reason. This is recorded as recovered from instructions and unreachable on
ordinary routes; no state was poked to manufacture a route, and no runtime
capture of the death state was taken for this note.

## The secondary source, as a lead

<http://mercenarysite.free.fr/damocles.htm> was used only to aim the replays,
per [ADR 0042](../adr/0042-fly-a-system-without-play.md)'s 2026-09-19 amendment,
which cuts both ways: a value that entered through a secondary source was
mislabelled authored when it had in fact come from the machine, and the fix was
to check rather than to trust the label.
Nothing below is citable and nothing is labelled recovered on its word.

| Lead | What this project's tooling found |
| --- | --- |
| "VIP Limo (car): Capital City Spaceport, 07/08 …; key inside building" | **Consistent.** Slot 183 in region 1 of Structure 74 was already recovered independently; this note adds that carrying it is what the gate tests. |
| "Eagle-9SE (spaceship) … key in basement of State President's Office at 09/08" | **Pairing confirmed by capture**, location not tested. Dropping resident slot 181 is what turns slot 3's gate byte to `$04`. The building it is authored in was not visited. |
| "Dart II (no key required)" | **Consistent with instructions, not with a capture.** The refusal chooser at `$0542E2` boards slot 1 without reading any state. DART II is 3455 cells from every tracked pose, so no replay reached it. |
| Which key opens which craft, generally | **Aimed the replays.** The `key slot = vehicle slot + 178` relation this project recovered is the general form; the guide lists instances of it. |
| The "J key" bypassing object-stacking rules | **Untested here.** It resembles the `tst.b $7046` bypass at `$0545AC` that [#316](damocles-carry-capacity.md) recovered. Recorded as a lead only. |

The guide says nothing about whether a key must be carried, which is the question
#404 asked. The secondary source could not have answered it either way.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus reproduced runtime observation):

- `$7272 + slot × 4` and `$6FAA + (slot + 178) × 4` are the same address, and
  `$054332` is the only use of the `$7272` form.
- Bit 7 of that byte is the key object's carried bit: set by the take at
  `$0542A4`, cleared by the drop at `$05467C` on both insertion paths, and
  cleared by the remove-from-stack helper at `$04CB00`.
- Dropping `KEY- V.I.P. LIMO` refuses the subsequent board with system string 3,
  `VEHICLE KEY REQUIRED`; re-taking it restores the board.
- The same holds for `EAGLE NINE S E` and its key at resident slot 181, and
  carrying a different craft's key does not substitute.
- Dropping inside Capital Spaceport region 1 and dropping on the bound exterior
  surface clear the bit identically.
- `$054310`'s region-flag guard is exercised by pressing `B` indoors and refuses
  silently.

**Derived from instructions, not reproduced at runtime**:

- `$05432A`'s VOID guard, and the same test in the take and drop handlers. The
  death routine's chain `$050F0E` → `$050F9E` → `$051016` is read, not replayed.
- DART II boarding without a key.
- The save-restore routine at `$0551A0` re-establishing the bit for restored
  Carried Stack entries.

**Unresolved**:

- Resident slot 38 (`Door Key "I"`, Dion 03-03) carries bit 7 set in the 27
  progressed poses without being in the Carried Stack, and no writer producing
  that state was found. Until it is explained, "bit 7 means carried" is an
  invariant with one unexplained counterexample rather than a closed rule.
- Whether any craft's key bit can be set by an authored Damocles Script. None was
  found, but the script bank was not exhaustively decoded for writes to the
  association arrays.

## Recommendation for the Gameplay Session

Stated in the vocabulary of [`CONTEXT.md`](../../CONTEXT.md), for whoever
implements the boarding admission contract:

- **A Vehicle Key is not a permanent unlock and should not be modelled as one.**
  Boarding a craft should be admitted when the craft's paired key object is in
  the Carried Stack, and refused the moment it is not. There is no separate
  "unlocked" fact to store, in Session State or in a Save Snapshot, and storing
  one would drift from the Working Authority the first time a player drops a key.
- **Ask the Carried Stack, do not mirror it.** The Reference Build has exactly
  one fact here, shared between Object Residence and the board gate. A session
  that keeps a second copy has to keep them in step across take, drop, stack
  rotation and restore; the original does not, because there is nothing to keep
  in step.
- **The pairing is by identity, not by class.** Each craft admits its own key
  object; carrying another craft's key is refused with the same message. The
  Reference Build expresses that as a fixed slot offset, which is an encoding
  detail — a session should carry the pairing as data on the craft.
- **Refusals are not uniform, and two of them are silent.** Out of reach, a
  non-craft selection and the indoor region flag each refuse with no output at
  all; a missing key refuses with the Damocles Message Row reading
  `VEHICLE KEY REQUIRED`; the INTERSTELLARSHIP refuses with its own message
  regardless of any key. A contract that only models "allowed / key required"
  will be wrong for three of the five.
- **Occupancy gates the gate.** Boarding is refused outright while already
  aboard.

`CONTEXT.md` has no term for the key itself. **Vehicle Key** and the admission
rule are a gap for `/domain-modeling` to resolve before the contract is written;
this note deliberately does not coin one.

No application behaviour and no live-save behaviour was changed by this research.
