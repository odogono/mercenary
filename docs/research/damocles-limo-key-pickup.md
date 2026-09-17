# Damocles limo-key pickup: recovered trigger and immediate response

Working-Authority Evidence for [#298](https://github.com/odogono/mercenary/issues/298), recovered 2026-09-16. Taking `KEY- V.I.P. LIMO` in the Capital Spaceport room is handled by **native code**, and that native code **launches one Damocles Script** through the same entry table the first offer uses. Five ordinary-gameplay cases replayed from the pinned on-foot checkpoint trace the whole path from the take input to the script's return, including a control run that takes nothing, repeat attempts, a drop and re-pick, and a mid-response emulator-state save and resume.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not translation of the Working Authority into application code. Original captures, RAM, native listings and game text remain ignored Restricted Material under `research/damocles-st/work/`, consistent with the [research boundary](damocles-gap.md); only decoded facts and hashes are recorded here.

## What was already established

The key's identity and initial placement were closed by earlier notes and are used here rather than re-derived: resident slot **183** selects source model `KEY- V.I.P. LIMO` (`object-03e494`), placed in **region 1 of Structure 74** in Eris surface cell `$87`, and paired with craft slot 5 by the exact `key slot = vehicle slot + 178` table relation. See [the Spaceport interior note](damocles-spaceport-interior.md#resident-object-evidenced-inside-the-room) and [the V.I.P. limo note](damocles-vip-limo.md). This note adds the trigger, the response and their boundaries.

## Evidence and method

Static recovery reads bounded windows of the pinned first-world capture `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` (SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`) with Capstone's M68K 68000 big-endian decoder, and re-decodes the script bank with [`damocleslab/script.py`](../../research/damocles-st/damocleslab/script.py).

Runtime evidence comes from the tracked [limo-key pickup probe](../../research/damocles-st/scripts/limo-key-pickup-probe.py), which replays the tracked [pickup route](../../research/damocles-st/scenarios/limo-key-pickup-route.json) from `snapshots/eris-spaceport-onfoot.sav` and supplies the take input itself. Samples are `savebin` windows taken while the emulator is stopped; **nothing is written into the guest**, so unlike the [first-offer probe](damocles-first-offer.md#repeatable-original-runtime-probe) these are ordinary gameplay observations rather than debugger-forced checkpoints.

```sh
research/damocles-st/lab doctor --roms /path/to/roms
python3 research/damocles-st/scripts/limo-key-pickup-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/limo-key-pickup-probe.py --roms /path/to/roms --tick-rate 20
```

## The ordinary take is native

Keyboard dispatch at `$0555B8` reads the scancode word at `$7B5E` and routes ST scancode `$48` (Up) to **`$0541F0`** and `$50` (Down) to **`$054520`**. The recorded original route holds Right Shift while pressing Up; the dispatcher's own comparisons are on the arrow scancode alone, so the shift hold is reproduced from the recording rather than claimed as a decoded requirement.

`$0541F0` refuses before doing anything unless all of these hold:

| Test | Address | Meaning as observed |
|---|---|---|
| `$7B42` ≤ 8 | `$0541F0` | The live selection's range/priority measure. Above 8 the handler returns **silently** — no message, no sound. |
| `$7B46` ≠ 0 | `$0541F8` | A selected object must exist; the value is the resident slot number × 4. |
| slot ≠ 0 | `$054200` | Slot 0 cannot be taken. |
| `$7AA8` ≠ `$78` | `$054204` | A mode word; `$78` blocks the take. Its meaning is unresolved, and it held `$2C` throughout these runs. |
| `$4DDD0` = 0 | `$05420C` | A word in the panel workspace that both the take and the drop handler test. It was zero throughout these runs; no writer was identified, so its meaning is unresolved. |
| bit 4 of `$6FAA`+slot×4 clear | `$05421E` | Per-object association bit; set means not takeable. |
| `$61CC` ≠ `$7A04` | `$054240` | Carried count must be below capacity. Capacity is **10** in the observed captures, raised to 20 on the one special slot `$6C` path at `$05426C`. |

Bit 5 of the same association byte diverts to `$0542DA`, and a failed `$04E158` check at `$054258` diverts to `$0542D4`; both reach the system-string helper at `$054808` with indices `$02` and `$0C`. That helper resolves index × 2 in the word table at `$070000` and raises the message gate `$7BA0` — the same table that holds the `VEHICLE KEY REQUIRED` string in slot 3. The limo key's own association byte is `$04`, so neither refusal applies to it.

On success `$054264`–`$0542D0` performs, in order: insert the slot into the carried list at `$61CE` and bump the count at `$61CC`; call the panel writer `$04DCE4`; `bset #7` on the object's association byte at `$6FAA`+slot×4; call `$0543BE`, which copies the carried count into `$787C`, doubled unless the capacity is 20, and then `$0543D2`; clear the association long at `$73A8`+slot×4 and store `$78` in its top byte; and, while on foot (`$7A8E` = 1), call `$05A30E` to rebuild the room's render queue so the taken object stops being drawn.

Those writes alone would leave association B at `$78000000`, but the sampled value after every pickup is `$78010010`, and the held X/Z values are written by neither this handler nor anything it calls here. Some later pass fills them; which one is unresolved.

## The object-to-script trigger table

`$0543D2` walks a word table at **`$0543EC`** whose entries pair a resident slot in the low byte with a trigger index in the high byte, terminated by a zero word. Six objects have entries:

| Resident slot | Trigger index |
|---:|---:|
| 183 (`KEY- V.I.P. LIMO`) | `$02` |
| 181 | `$05` |
| 151 | `$06` |
| 95 | `$14` |
| 101 | `$0B` |
| 94 | `$3E` |

A match calls **`$054770`** with the trigger index; whether or not it matches, `$0543D2` falls through to the guarded sound request at `$054848` described in [the first-offer note](damocles-first-offer.md#sound-request-is-not-emitted-sound). Only slot 183's mapping is claimed here; the other five are recorded as source facts, not as tested behaviour.

`$054770` is the **middle** of the pending-script launcher `$054764` already described in [the ISA note](damocles-script-isa.md): entering at `$054770` skips the busy test and the `$7A88` clear that the dispatch-loop path performs. It indexes the byte table at `$7CB4` by the trigger index and:

- returns immediately if bit 7 of that byte is clear — the entry has already fired;
- if bit 6 of `$7BD9` is already set (a script is running), stores the index in `$7A88` **only when bit 5 of the trigger byte is set**, and otherwise **discards the trigger**;
- otherwise sets bit 6 of `$7BD9`, clears bit 7 of the trigger byte unless bit 6 of that byte is set, reads the script entry table at `$070080`, pushes the current script PC onto the `$6266`/`$6268` return stack and commits the new PC to `$7820`.

In the pinned capture the byte at `$7CB4 + 2` is `$80`: bit 7 set (armed), bits 6 and 5 clear. So the limo key's trigger is **one-shot**, and a pickup that happens while another script is running is **dropped rather than queued**. The first fact is confirmed at runtime below; the second is read from the handler and was not reproduced through the ordinary route.

## The response is script slot 2

Entry table word `$070084` is `$042A`, so trigger index 2 enters **`$07042A`**, decoded by reachability:

| Address | Recovered operation |
|---|---|
| `$07042A`, `$07045A`, `$070488` | Three `$01` inline messages. Each stores the text pointer at `$7B98`, loads the display timer `$0523B8` from bank word `$070102` (`$00C8`) and raises the gate `$7BA0`, which suspends the interpreter until native code clears it. The gate read `$FFFF` in every sample taken while a message was presenting and `$0000` between messages, so native display code writes a value of its own over the handler's `$0001`. Their text is original material and stays out of this note. |
| `$0704BA` | `$04` call to `$072CF4`, one of the shared delay subroutines at `$072CD6`–`$072D2E` described in [the catalogue](damocles-script-catalogue.md#timed-delays-are-subroutines). |
| `$072CF4` | `$02` reset the wait counter `$7B9C`. |
| `$072CF6` | `$07` compare `$7B9C` against `$00C8` (200) and loop back to itself while below. |
| `$072CFC` | `$05` return. |
| `$0704BE` | `$14` indexed message, operand `$0032`. |
| `$0704C2` | `$11` clear `$0040` in flag word `$7BD8` — the same bit 6 of `$7BD9` the trigger set. |
| `$0704C6` | `$05` return, popping the pushed PC. |

**Correction to the `$14` description.** `$051B5C` doubles the operand and compares it with `$01E0`; **below** that bound the `$7A42` indirection is skipped entirely and the doubled operand indexes the same system string table at `$070000` the native helper uses. Operand `$0032` therefore selects string slot 50, whose record begins at `$0732A6`, and the `$7A42` workspace is not consulted. The decoder's note "string pointer via the `$7A42` table" is only correct for operands of 240 and above.

Script slot 3 — the State President arrival script — ends with the same indexed message through a helper at `$072D1C` that drops the display duration at bank word `$070102` to `$0032` and restores `$00C8` afterwards. String slot 50's record begins with blank padding, and the pickup script uses it with the ordinary `$00C8` duration, which is consistent with it clearing the message line rather than adding a fourth statement.

The interpreter's idle state is `$0703FC`, the jump-to-self the briefing script ends in and the resident PC parks in. A trigger pushes that address; the script's final `$05` pops back to it. That is the response's stable completion point, and it was the PC in every pre-take and post-response sample.

## What the ordinary pickup does, observed

Every case below walked the tracked route from the same checkpoint. Values are read from the sampled windows.

| Observation | Before the take | After |
|---|---|---|
| Carried count `$61CC` / first entry `$61CE` | `0` / — | `1` / `183` |
| Panel text at `$04DDBC` | blank | the key's source label |
| Slot 183 association A `$7284` | `$00120404` | `$00318404` |
| Slot 183 association B `$7684` | `$2C0C0087` | `$78010010` |
| Slot 183 X `$6684` / Z `$6E84` | `$004780E4` / `$0088892D` | `$000081D5` / `$0001831C` |
| Trigger byte `$7CB4 + 2` | `$80` | `$00` |
| Script flags `$7BD8` | `$0000` | `$0040`, cleared again at the end |
| Script PC `$781E` | `$000703FC` | `$07042A` → … → `$000703FC` |
| Return stack `$6268` | `$6266` | `$6264` in the script, `$6262` inside the wait call |

The sampled progression through one response is: each of the three messages raised the gate and held it while its display timer ran — the first was still presenting 1.4 s after the take and had finished by 4.0 s, consistent with the timer's 200 frames — then the wait call reset `$7B9C` and released it at 200, the indexed message presented, `$7BD8` returned to `$0000`, and the PC returned to the idle jump about 20 s after the take. Two independent `take` runs produced the same ordering and the same counter values to within one tick.

**Timing.** `$7B9C` advances exactly **once per VBL**: two measurements of 20 and 40 host seconds from the parked snapshot recorded 1232 ticks over 1232 VBLs and 2432 over 2432. The 200-count wait is therefore 200 display frames — about 3.3 s at the ~61 VBL/s this Hatari configuration ran at. The per-message duration is the separate display timer `$0523B8`, loaded with `$00C8` from bank word `$070102`. Seconds are configuration-dependent; frames are not.

## Proximity, repeats, drop and re-pick

- **Control.** Walking the same route and pressing nothing left the carried count at 0, the trigger byte at `$80`, `$7BD8` at `$0000` and the PC parked at `$0703FC` for the whole sampling window. Standing beside the key, entering the room and the pre-existing script activity do **not** produce the response; the take input does.
- **Silent refusal.** Runs whose walk ended slightly short did nothing at all on the take — no message, no state change, nothing written. Their samples show a selection the handler rejects: twice slot 183 selected (`$7B46` = `$2DC`) with `$7B42` = 10, once craft slot 5 selected at 12, against `$7B42` = 7 in the control run that stopped in range. Samples are taken a second or so after the press rather than at it, so they identify the class of failure rather than the exact instant. `$7B42` ≤ 8 is a real precondition and failing it is silent. The probe retries such a run rather than reporting it as a result.
- **Repeat attempts.** A second take four seconds into the response and a third after it finished changed nothing: the carried count stayed 1, the trigger byte stayed `$00`, `$7BD8` stayed clear and the PC stayed at the idle jump. The one-shot trigger byte is what makes this true; the handler's other refusals are not needed, because the object is no longer resident.
- **Drop and re-pick.** The drop input restored slot 183 to residence — association A back to exactly `$00120404`, carried count back to 0, the panel line blank — at the player's drop position (`$004780F1` / `$008888C4`) rather than the authored placement. Association B came back as `$2C010087`, differing from the authored `$2C0C0087` in the byte the catalogue records as the insertion-group selector (12). Re-picking it restored the held values exactly. **No second response ran**: the PC never left the idle jump and `$7BD8` stayed `$0000`. Two independent `take-drop` runs agreed.

## Save and resume across the response

Damocles exposes no in-game save at this point, so the resumability that matters was measured against a whole-machine state save. The probe saved emulator state 6.5 s after the take, while the third message was still presenting, then booted a second process from that state. The response continued from where it stopped: the wait call ran and released, the indexed message displayed, `$7BD8` returned to `$0000` and the PC returned to `$0703FC`, with the carried count still 1 and the trigger byte still `$00`. No effect was duplicated and none was lost.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus reproduced runtime observation): the take handler and the range gate that refuses silently; the object-to-trigger table and slot 183's index 2; the one-shot trigger byte; script slot 2's address, body and return to the idle jump; the busy flag bit being set by the trigger and cleared by the script; the wait counter's one-tick-per-VBL rate and its 200-frame threshold; the carried-list, panel, association and render-queue writes; repeat, drop and re-pick behaviour; resumability across a whole-machine state save.

**Derived from instructions, not reproduced at runtime**: the busy-path arbitration (queue on trigger-byte bit 5, otherwise discard); the sticky variant on trigger-byte bit 6; the refusal message indices `$02` and `$0C` and the `$04E158` check behind the second; the other five entries of the trigger table.

**Unresolved**: how `$7B46` and `$7B42` are computed each frame, so the "range/priority" measure has no units yet; the meanings of the individual association bits and of the low X/Z values written while an object is held; why the drop path writes insertion-group selector 1 instead of the authored 12; the meanings of `$7AA8` = `$78` and of `$04DDD0`, whose writer was not found; whether the display timer `$0523B8` counts in frames; and the seconds-per-VBL of the original hardware configuration, as distinct from this laboratory's.

## Smallest faithful implementation boundary

The recovered interaction is small and self-contained: **one native take action, one one-shot trigger, one script of three messages, a 200-frame wait, a clearing message and a return to idle.** The recommended boundary is exactly that, ending at the return to the parked script — not the mission the messages describe, not the other five trigger entries, and not the refusal messages beyond keeping the silent out-of-range refusal faithful.

Today's Damocles Gameplay Session (`web/src/damocles/session.ts`) is on foot, carries a `carried: readonly string[]` that is always empty, and feeds a panel whose message line is a static placeholder. The Damocles save record (`web/src/damocles/save.ts`, schema version 3) holds pose, elapsed time and the bound structure only. The Targ session already implements carry/drop, residence and an inventory panel (`web/src/session/index.ts`), but it is Targ's session, and [ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md) keeps the two apart; the recovered Damocles behaviour should not be folded into it. The extracted payload already carries the data side: `payload/damocles/catalogue.json` holds resident instance records including slot 183 with its cell, insertion group and region insertions.

Minimum missing prerequisites, in dependency order:

1. **Resident object instances in the Damocles session** — place catalogue instances in the world with mutable residence, and remove a taken one from the drawn set.
2. **Object selection and a take/drop action** — the session needs the equivalent of `$7B46`/`$7B42` before "the ordinary pickup path" exists at all. Its exact rule is unresolved, so this is the one place a faithful implementation needs either more research or an explicitly labelled interim rule.
3. **A Damocles Carried Stack and the panel inventory label**, saved with the session.
4. **A message queue with frame-counted presentation** and the panel message line, since the response is mostly messages and the script suspends behind the gate.
5. **A Damocles script host** with named steps (per [ADR 0045](../adr/0045-author-scripts-as-named-typescript-steps.md)), an idle/parked state, a return stack, a one-shot trigger table and a frame-tick wait — the first-offer prototype (`web/src/damocles/firstOffer.ts`) is an isolated state machine and is not wired to a session.
6. **A save-schema bump** covering residence, the carried stack, trigger state and script execution position, given the resumability shown above.

All six belong in [#299](https://github.com/odogono/mercenary/issues/299)'s contract, which should decide which of them it carries itself and which become separately bounded work before [#300](https://github.com/odogono/mercenary/issues/300) implements any of it. [The interaction contract](../design/damocles-limo-key-interaction.md) makes that division: it carries items 1 and 3 through 6, and pushes item 2 and the message-text extraction out as blocking prerequisites. Item 2 is the only one whose recovered rule is still missing; it wants its own research rather than an invented substitute trigger, and until it exists the ordinary pickup path cannot be claimed faithful even though everything downstream of it can.

## Evidence identities

All hashes are SHA-256. Laboratory machine: ST, 1 MiB; program and TOS images are checked against [`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Input | Hash |
|---|---|
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| `eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| Tracked route | `b03c447a85b59ec9ce0bec73f0a035e032c8a46b1e7aa62ff22a5148c8951b0d` |
| Tracked probe | `3e6462160fe049db7b0ea4b3c7881669c1b46b458a2053c6d95e6b9c351d7379` |

Source ranges read for this note, hashed in the pinned first-world capture and re-checked byte-identical in a runtime capture from the `take` case:

| Range | Hash |
|---|---|
| Take handler `$0541F0`–`$0542DF` | `e6139be6700a08ff7676ca198aae6808fb2dc9138b29f7b9fe73b3ee63762298` |
| Drop handler `$054520`–`$0545BF` | `487dcd864635b7c377908b5831bc286936d1bfe68ecc417e0d844263bc5aec25` |
| Object-to-trigger table `$0543EC`–`$0543F9` | `5cafa230f63034fc8770841310613246cff2c3849b63bb007904de74a7705ee0` |
| Trigger dispatch `$054764`–`$0547C5` | `eccc7df9c8c734f5c3758b50c43c56f6a05404dda1bc34e668fad5956f514a61` |
| System-string helper `$054808`–`$054847` | `b7e1f6c5222e64d4f671c74d248fbd3a3fb3e8464a06a0f5b6601ec3a8765c4b` |
| Script entry table `$070080`–`$07010F` | `f84eb007aa814e0e5cc20aa9a85e582c60d96e27957d2384dcb9b606d37745eb` |
| Script slot 2 `$07042A`–`$0704C7` | `58c674fbc6af7236013be70684d3ee8b9987e3c5c54ab31baa10067926d41a4e` |
| Wait subroutine `$072CF4`–`$072CFD` | `15207790b530462af2a669105233a2db6b3fe1676007cbcd54ec3b752f11a35a` |

Runs under `research/damocles-st/work/`. Hatari 2.6.1 (binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`), Python 3.13.15. Each run's `result.json` records the case inputs, every sample's decoded state, the window hashes and the toolchain; `tick-rate.json` records the counter and VBL endpoints.

| Run | `result.json` / `tick-rate.json` hash |
|---|---|
| `limo-key-control-20260916T181430Z-634c44bc` | `53ab2673cecf86600b4f2ed9743da16aaf99ce5d6000a89222fb13c5d2c083c9` |
| `limo-key-take-20260916T181531Z-ec3e2634` | `32e297421cb57d3ccdde8f8334f19e31d2ab1bea2789a90ecc98683730e0ddee` |
| `limo-key-take-20260916T182025Z-9f0218c9` | `a8e2aa319ef25dd92f5471b18a75ad59209926b14d861dc5c73d9879403d504d` |
| `limo-key-take-repeat-20260916T181638Z-76e9055b` | `b755a40ec802f7e2fd6867edd78a78a537786674c5a59022fa758c6c05c1c59d` |
| `limo-key-take-drop-20260916T181750Z-cc323244` | `9b836d4b8301a2aab858e507cadfad9269d7595dd1a73154389eb4410f3973fc` |
| `limo-key-take-save-resume-20260916T181905Z-3b351336` | `f19998197d8a9d50d3cd4d0d224eb50db05d2070d8e34453405aba03d9048439` |
| `limo-key-tick-rate-20260916T182133Z-16e12b80` | `454d6984d94d90ba699f44275cc539b16e4328fed1ee8f0e9cd3eb2b6d09e043` |
| `limo-key-tick-rate-20260916T182203Z-5f74ca21` | `95f8bbb3e0afc34215f8612b0d7a3afb7cdaae67900d6faff6dd742d566f4d67` |

The refusals quoted above come from three runs of earlier revisions of the same probe, kept because
the behaviour they record is a finding rather than a failure: `limo-key-take-drop-20260916T173509Z-465ad666`
(`2b5c129de837f728986ce534aa38931cd978f81618ed05dcf39ab356d83a5b4b`) and
`limo-key-take-save-resume-20260916T174247Z-5fb8c321`
(`da78b87478058952a25119714a53baf77cd3a751625355f7fad7dff78f629956`) sampled slot 183 selected at
range 10, and `limo-key-take-repeat-20260916T180416Z-3bf2b196`
(`706a846ecfea9148d272941009904a7f294a6985344749d1a20e508e87d9c913`) sampled craft slot 5 selected at
range 12. Their probe revisions differ from the hash above; the route and the case inputs do not.

### Claim boundary

These are ordinary gameplay observations of the original program running in Hatari, sampled while the emulator is stopped. They do not establish frame-exact input timing: the take input is injected on a host-scheduled timeline, and the walk route ends at a slightly different position on every run. Hatari runs with sound off, so the sound request the pickup path makes is recovered statically and no audible output is observed or claimed. The seconds figures are this configuration's; the frame counts are the recovered quantity. Nothing here is a whole-game equivalence claim.
