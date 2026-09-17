# Damocles pickup responses: the other five triggers and busy arbitration

Working-Authority Evidence for [#317](https://github.com/odogono/mercenary/issues/317), recovered
2026-09-17. [The limo-key pickup note](damocles-limo-key-pickup.md#the-object-to-script-trigger-table)
recovered a six-entry table that maps a resident slot to a Damocles Script trigger, observed slot
183's response end to end, and recorded the other five entries as source facts only. This note
recovers those five responses — **slot 181 KEY - EAGLE 9SE → trigger 5, slot 151 DAMOCLES FILE →
6, slot 95 MAGIC CRYSTAL → 20, slot 101 AUTHORS COMPUTER → 11, slot 94 CASH REGISTER → 62** — and
the arbitration that decides what happens when a pickup fires while another script is already
running.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not
translation of the Working Authority into application code. Original captures, RAM, native
listings and game text remain ignored Restricted Material under `research/damocles-st/work/`,
consistent with the [research boundary](damocles-gap.md); only decoded facts and hashes are
recorded here.

## The route dependency, stated first

**None of the five objects can be reached by an ordinary walk-and-take route today.** All five are
interior-associated residents whose source structure has not been recovered, so they have
selectors and no parent or local placement. The
[location ledger](damocles-gamma-system-location-ledger.md#pickup-trigger-objects-and-special-items)
records this per object and names the ticket each one waits on; nothing in this note changes that,
and no response below may be presented as reachable play until its object is placed.

| Slot | Object | Trigger | Body | Group / cell / level | Blocked on |
| ---: | --- | ---: | --- | --- | --- |
| 181 | KEY - EAGLE 9SE | `$05` | ERIS | `$12` / `$89` / `$0A` | Eris structure selectors ([#252](https://github.com/odogono/mercenary/issues/252)) at cell `$89` |
| 151 | DAMOCLES FILE | `$06` | ERIS | `$12` / `$89` / `$00` | the same Eris selectors |
| 95 | MAGIC CRYSTAL | `$14` | MIDAS | `$38` / `$EB` / `$00` | no Midas surface workspace ([#172](https://github.com/odogono/mercenary/issues/172)) |
| 101 | AUTHORS COMPUTER | `$0B` | DION | `$02` / `$DE` / `$00` | Dion structure-group map for cell `$DE` |
| 94 | CASH REGISTER | `$3E` | VESTA | `$05` / `$73` / `$01` | Vesta structure-group map for cell `$73` |

What is recovered here is therefore the *response* side: which script each slot launches, what that
script does, when it stops, and how a second pickup is arbitrated. The take handler's own
preconditions — range, capacity, the association bits, the mode words — are unchanged from
[the pickup note](damocles-limo-key-pickup.md#the-ordinary-take-is-native) and are not re-derived.

## Evidence and method

Static recovery reads bounded windows of the pinned first-world capture
`observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` (SHA-256
`b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`) with Capstone's M68K 68000
big-endian decoder, and re-decodes the script bank by reachability with
[`damocleslab/script.py`](../../research/damocles-st/damocleslab/script.py).

Runtime evidence comes from the tracked
[pickup-response probe](../../research/damocles-st/scripts/pickup-response-probe.py), which boots
the pinned on-foot checkpoint `snapshots/eris-spaceport-onfoot.sav` and drives the original
program's own dispatch in two modes. Because no ordinary route reaches these objects, **neither
mode is an ordinary-route observation and neither claims one**.

```sh
python3 research/damocles-st/scripts/pickup-response-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/pickup-response-probe.py --mode timeline --roms /path/to/roms
```

**Checkpoint mode** runs the object-to-script table walk at `$0543D2` — the routine the native take
handler calls once a pickup has been committed — with only `A0` supplied, which is the register the
handler leaves holding the resident slot times four. Interrupts are masked for the whole case, so
each walk is one atomic step and consecutive walks in a case are consecutive pickups with no
interpreter tick between them. Every case starts from the same reset: the six arming bytes, the
busy flag, the pending index, the interpreter PC and its return-stack pointer, the message gate and
the wait counter are written back to the values the snapshot arrives with, and nothing else is
touched. The probe asserts its expectations and fails the run rather than reporting a mismatch; two
independent runs verified all nine cases.

**Timeline mode** launches a response the way the program launches a trigger that was queued during
a busy script: the pending-script word `$7A88` is written with the trigger index and the machine is
left to run under ordinary interrupts. The dispatch loop at `$05194C` picks the word up,
`$054764` arms and enters the script, and the response then runs with nothing held. Samples are
`savebin` windows taken while the emulator is stopped.

## The five mappings, exercised

Feeding each resident slot to the original table walk selects the trigger the table records,
disarms it, sets the busy flag and commits the script entry the entry table at `$070080` names.
Observed in checkpoint mode, one case per slot, with slot 183 replayed as the control:

| Slot | Object | Trigger | Script entry | Arming byte before → after | Busy flag | Return stack |
| ---: | --- | ---: | --- | --- | --- | --- |
| 183 | KEY- V.I.P. LIMO | `$02` | `$07042A` | `$80` → `$00` | set | `$6266` → `$6264` |
| 181 | KEY - EAGLE 9SE | `$05` | `$070AEA` | `$A0` → `$20` | set | `$6266` → `$6264` |
| 151 | DAMOCLES FILE | `$06` | `$0705E6` | `$80` → `$00` | set | `$6266` → `$6264` |
| 95 | MAGIC CRYSTAL | `$14` | `$0710B6` | `$80` → `$00` | set | `$6266` → `$6264` |
| 101 | AUTHORS COMPUTER | `$0B` | `$070BDE` | `$80` → `$00` | set | `$6266` → `$6264` |
| 94 | CASH REGISTER | `$3E` | `$071E8A` | `$80` → `$00` | set | `$6266` → `$6264` |

The launch path clears **bit 7 only**. Trigger 5's byte is `$A0` — armed, with the queue bit set —
so after firing it reads `$20`, not `$00`. Every entry has bit 6 clear, so all six are **one-shot**:
the whole 64-byte table holds exactly one sticky byte, at index `$38`, which is not a pickup
trigger.

## What each response does

Decoded by reachability from the entry the table names, and confirmed instruction by instruction
against the sampled interpreter PC in timeline mode. Message text is original material and stays
out of this note; the records are already extracted under
[#304](https://github.com/odogono/mercenary/issues/304) and carry the ids below in
`payload/damocles/strings.json`. Durations are display frames, which are **50 Hz** on the machine
the original was sold for ([#305](https://github.com/odogono/mercenary/issues/305)).

| Trigger | Object | Steps, in order | Frames | Seconds |
| ---: | --- | --- | ---: | ---: |
| `$05` | KEY - EAGLE 9SE | three inline messages (`script5-inline-1..3`), a 500-frame wait via `$072D08`, then the shared epilogue | 600 + 500 + 50 | 23.00 |
| `$06` | DAMOCLES FILE | two inline messages (`script6-inline-1..2`), clear busy, return | 400 | 8.00 |
| `$0B` | AUTHORS COMPUTER | two inline messages (`script11-inline-1..2`), then the shared epilogue | 400 + 50 | 9.00 |
| `$14` | MAGIC CRYSTAL | one inline message (`script20-inline-1`), then the shared epilogue | 200 + 50 | 5.00 |
| `$3E` | CASH REGISTER | a 150-frame wait via `$072CEA`, three inline messages (`script62-inline-1..3`), then the shared epilogue | 150 + 600 + 50 | 16.00 |

Each inline message stores its text pointer at `$7B98`, loads the display timer `$0523B8` from bank
word `$070102` and raises the gate `$7BA0`, which suspends the interpreter until the native display
routine clears it ([#307](https://github.com/odogono/mercenary/issues/307)). `$070102` holds
`$00C8` — 200 frames — throughout, so every inline message above is a 200-frame presentation.

**The shared epilogue at `$072CAE`** is four instructions: write `$0032` into bank word `$070102`,
present indexed message `$0032` (system string slot 50, the blank-padded record the limo-key
response also ends on), write `$00C8` back into `$070102`, clear `$0040` in `$7BD8` and return. So
the clearing line runs for **50 frames, not 200** — the limo-key response's own inline epilogue at
`$0704BE` uses the ordinary 200-frame duration, and is the exception rather than the rule. This
epilogue is shared by 62 of the bank's scripts, and a call-shaped variant without the flag clear
sits at `$072D1C`.

**Trigger 6 has no clearing line.** It clears the busy flag and returns with its second message
still presenting, and nothing blanks the row afterwards. Under the recovered display model the row
keeps its last record until another message scrolls over it, so the DAMOCLES FILE response leaves
its final line on the Damocles Display indefinitely. That is a recovered behaviour, not an
omission to tidy up.

The waits are the bank's shared delay subroutines — `reset $7B9C`, then loop while it is below the
threshold — from the family at `$072CD6`–`$072D2E` the
[script catalogue](damocles-script-catalogue.md#timed-delays-are-subroutines) records. Trigger 5
uses the 500-frame member, trigger 62 the 150-frame one, and both were observed running: the
counter was sampled at 30, 120, 210, 300, 390 and 480 inside trigger 5's wait and released between
480 and 570.

**No response writes anything else.** None of the five touches a `$7482` record, a `$6FAA`
association, the `$7A42` word table, the counter at `$7BD2`, a bank word other than the display
duration, or any world or object state. Their only durable effects are the ones the launch itself
makes: the arming byte cleared, and the native pickup's own writes to the carried list, the panel,
the association records and the render queue.

## Where each response stops

Every response ends by clearing `$0040` in `$7BD8` and returning, which pops the PC the launcher
pushed. Launched from the parked interpreter, that PC is the idle jump-to-self at `$0703FC`, and
in timeline mode the PC returned there in every case and stayed there:

| Case | Observed progression (PC, sampled) |
| --- | --- |
| `run-5` | `$070B1A` → `$070B44` → `$070B78` → `$072D0A` (wait, counter 30…480) → `$072CB8` (epilogue, duration `$0032`) → `$0703FC` |
| `run-6` | `$070618` → `$07064A` → `$0703FC` |
| `run-11` | `$070C0A` → `$070C38` → `$072CB8` → `$0703FC` |
| `run-20` | `$0710EA` → `$072CBE` → `$0703FC` |
| `run-62` | `$072CEC` (wait, counter 3 → 94) → `$071EC0` → `$071EF2` → `$071F1C` → `$072CB8` → `$0703FC` |
| `control` | `$0703FC` throughout, busy flag `$0000`, gate lowered, no arming byte changed |

The checkpoint cases were verified in two independent runs, and `run-6`, `run-20` and
`run-pending` were each observed twice; the second observation of each reproduced the first sample
for sample.

Bank word `$070102` was sampled at `$0032` while an epilogue's clearing line was in flight and back
at `$00C8` afterwards, in `run-5`, `run-11` and `run-62`. That is the response's stable stopping
point: the parked idle jump, a lowered gate, a clear busy flag, and the display duration restored.

## Repeat, disarm and re-arm

- **Repeat.** A second walk for slot 151 immediately after the first changes nothing: the arming
  byte is already `$00`, so `$054776` refuses on the `bpl` before any other test, and the busy
  flag, the pending word, the PC and the return stack are all untouched.
- **Re-arm.** After `run-6` had finished and parked, the pending word was written with trigger 6
  again. The dispatch loop consumed it and `$054764` cleared it, then refused on the same disarmed
  byte: no script ran. The same was observed in every `run-N` case.
- **No re-arming writer exists.** `$7CB4` is referenced by exactly one instruction in the whole
  native program area, the `lea` at `$054774` inside the launcher. Nothing in the recovered program
  sets an arming bit; the armed values are what the loaded image supplies. The table in the
  Spaceport on-foot checkpoint is byte-identical to the pinned first-world capture, so walking into
  the Spaceport has not consumed any of them.

## Busy arbitration

`$054770` — the entry the pickup uses, past the busy test and the `$7A88` clear that the dispatch
loop performs — arbitrates in this order, and all four outcomes were observed as consecutive
atomic walks inside one masked-interrupt case:

| Pickup while trigger 6's script is running | Outcome | Observed |
| --- | --- | --- |
| slot 181, arming byte `$A0` (bit 5 set) | **queued**: `$7A88` ← `$05` | pending `$0005`; the byte stays `$A0`, so a queued trigger is not disarmed |
| slot 95, arming byte `$80` (bit 5 clear) | **discarded** | pending still `$0005`; byte still `$80`, so a discarded trigger stays armed for a later pickup |
| slot 94, arming byte `$80` | **discarded** | pending still `$0005` |
| slot 181 again | **re-queued**, same index | pending `$0005` |
| slot 151, already fired | **refused before the busy test** | pending still `$0005`; nothing queued |

`$7A88` is one word, and the queue path writes it unconditionally, so a second queueable trigger
**replaces** the first rather than joining a queue. Observed in the `pending-replacement` case:
with `$05` pending, entering `$054770` with trigger index `$3C` — a queueable index outside the
pickup table, used only to make the replacement visible and never released — left `$7A88` holding
`$003C`. Among the six pickup triggers only slot 181's is queueable, so two pickups can never
contend for the pending word through the table alone; one queueable pickup and any other queueable
trigger can.

**A queued response is taken up as soon as the busy flag clears, which is before the running script
returns.** In the `run-pending` case trigger 6 was launched and trigger 5 was made pending partway
through it. Script 6 cleared `$0040` at `$07064A` and, with its `return` at `$07064E` not yet
executed, the dispatch loop launched script 5 and pushed `$07064E` onto the return stack. Script 5
ran to completion — three messages, the 500-frame wait, the epilogue — and its return popped back
into script 6, whose own return then popped to the idle jump. The sampled PCs are
`$070618` → `$07064A` (pending `$0005`) → `$070B1A` → `$070B44` → `$070B78` → `$072D0A` →
`$07064E` → `$0703FC`.

So a pending pickup response **nests one level inside the script it interrupted**, rather than
starting after it. Any implementation whose return stack holds steps of a single script cannot
represent this; the stack holds script-and-step pairs.

## Save and resume across a response

Damocles exposes no in-game save at this point, so resumability was measured against a
whole-machine state save, as it was for the limo key. The probe saved emulator state 5.5 s into
trigger 62's response, while its second message was presenting, and booted a second process from
that state. The response continued from where it stopped: the third message presented, the epilogue
ran with the duration dropping to `$0032` and returning to `$00C8`, the busy flag cleared and the
PC returned to `$0703FC`. No message was repeated and none was lost.

## Minimum Host Callout requirements

Measured against the contract in
[the limo-key interaction design](../design/damocles-limo-key-interaction.md#values-and-interface),
these five responses need **no new effect kind**: nothing they do reaches pose, residence, the
Carried Stack, the world, or any record. `Effect` stays exactly the sound request. What they do
need, and what that contract does not yet carry, is:

1. **A pending trigger index** in `ScriptState` — `$7A88` as `pending: number | null` — with the
   queue-on-bit-5, discard-otherwise, replace-unconditionally rule, and its consumption by the
   frame loop rather than by the trigger itself.
2. **Two more bits per `Trigger`**: queue-while-busy (bit 5) and sticky (bit 6). Slot 181's byte is
   `$A0`, so `armed: boolean` alone cannot express it, and the disarm rule differs between the
   launch path and the queue path.
3. **A cross-script return stack.** `Execution` names one script and a stack of that script's own
   steps; the observed nesting needs `(script, step)` pairs, because a queued response resumes an
   outer script that had not returned.
4. **The display duration as state**, not as a constant per message: the epilogue writes bank word
   `$070102` to `$0032` and back to `$00C8`, and the same indexed record therefore presents for 50
   frames here and 200 frames in the limo-key response.
5. **Five more script identities and their steps**, and eleven more message ids. All eleven inline
   records and the indexed reference are already extracted into `payload/damocles/strings.json`
   with the ids used above, so no new text extraction is needed.
6. **A response that ends without clearing the row** (trigger 6), which the display state must be
   able to represent: a held row that outlives the script that wrote it.

None of this is implementable as reachable play until the placement work above lands. The
dependency is one-directional: the responses are recovered and bounded, the routes are not.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus reproduced runtime observation): all five slot-to-trigger
mappings, through the program's own table walk; the script entry each trigger commits; the arming
byte each launch clears and the bit it leaves alone; the one-shot behaviour of all six pickup
triggers and the refusal of an already-fired trigger before the busy test; each response's
instruction sequence, message count, wait thresholds, shared epilogue and return to the idle jump;
the display-duration excursion to `$0032` and back; the queue, discard, re-queue and replacement
outcomes of busy arbitration; the nesting of a queued response inside the interrupted script;
resumability across a whole-machine state save.

**Derived from instructions, not reproduced at runtime**: that a pickup of these objects reaches
the table walk at all, since no ordinary route reaches any of the five objects — the walk was
entered with the slot register supplied. The take handler's preconditions are therefore not
exercised here, and the sound request the walk falls into is recovered statically, as Hatari runs
with sound off.

**Unresolved**: what the sticky trigger at index `$38` is for, and which of the bank's scripts the
other queueable indices belong to; whether any disk-loaded bank re-arms a trigger, since only the
resident bank has been read.

## Evidence identities

All hashes are SHA-256. Laboratory machine: ST, 1 MiB; program and TOS images are checked against
[`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Input | Hash |
| --- | --- |
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| `eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| Tracked probe | `b9cd4bcd8ceead342a4b63902493574f0fdb2112d0db739f91f711705ad3787a` |

Source ranges read for this note, hashed in the pinned first-world capture. Every code range was
re-checked byte-identical in all fifteen runtime captures taken for this note; the arming table is
machine state rather than code and is hashed as the pinned capture holds it.

| Range | Hash |
| --- | --- |
| Table walk `$0543D2`–`$0543EB` | `7d8b5a358c8e9ce39032c0e675e82c160555e5106a0666eefec13972e52eb0fc` |
| Object-to-trigger table `$0543EC`–`$0543F9` | `5cafa230f63034fc8770841310613246cff2c3849b63bb007904de74a7705ee0` |
| Trigger launcher `$054764`–`$0547C5` | `eccc7df9c8c734f5c3758b50c43c56f6a05404dda1bc34e668fad5956f514a61` |
| Dispatch loop `$05193E`–`$051971` | `86fb9413d85a82dfec9090847fc78eab4a00e68ea85bc2b43f39be400cf7c6c8` |
| Script entry table `$070080`–`$07010F` | `f84eb007aa814e0e5cc20aa9a85e582c60d96e27957d2384dcb9b606d37745eb` |
| Trigger arming table `$7CB4`–`$7CF3` | `610b637e4a4636b305805763b69f838fd498a31c8ca4074286e4b3744664d567` |
| Script slot 5 `$070AEA`–`$070B7F` | `ec1a11ab555b733769a6a067f00a9afa527db3361cfbb232a1ccdbfb76436539` |
| Script slot 6 `$0705E6`–`$07064F` | `8ab87fa9928af5cd226f0ffe3c4795f8115f32afafa04ce96a06441220a0cc5c` |
| Script slot 11 `$070BDE`–`$070C3B` | `515066694c4fe33feb2e58d9bc5be812f4f60e523b400183a0eeccd38c5a1b7a` |
| Script slot 20 `$0710B6`–`$0710ED` | `538a73aaf0544b33b031f7ed0b4e4251c0073265de17a255f8f8bb3e10816d70` |
| Script slot 62 `$071E8A`–`$071F1F` | `375d6275970165fb5abfd86168b39fc2af6df48e700ea3104eb99da998aa15e0` |
| Shared epilogue `$072CAE`–`$072CC3` | `8f79dfeb1c3c6521e17ae2c684fd59ada1a08d5a7c4c2f3d94ca33a7f2793c0c` |
| 150-frame wait `$072CEA`–`$072CF3` | `5c60bbbb1d74c4c2f470c9ab31f7253991bc841ed0dd2fd8f7d0b94fab937570` |
| 500-frame wait `$072D08`–`$072D11` | `8ab4ac74b745a45813d9b65829b802a15a3778c0ab391e61681509b4cad33418` |

Runs under `research/damocles-st/work/`. Hatari 2.6.1 (binary
`05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`), Python 3.13.15. Each run's
`result.json` records the case, every sample's decoded state, the window hashes and the toolchain.

| Run | `result.json` hash |
| --- | --- |
| `pickup-response-checkpoint-20260917T175813Z-e6038fde` | `b56812155fb18ae9d2318bc7d3b27f6143f2a983e45e81f6d6a60249654eafd4` |
| `pickup-response-checkpoint-20260917T180329Z-c6210536` | `08bc2ea228cae524e1caa0bb6da603cadc5c7a52b6c5b1493e76a5f10c772b21` |
| `pickup-response-control-20260917T175825Z-4b4d48da` | `2fce54029021ae60bcfac9fbce780a77e9fa3c129c44c07a4249236c960a7b1c` |
| `pickup-response-run-5-20260917T180028Z-9538c762` | `e45e8d6bc21fd4ad0f8eeff49d08de3e0ea223c335a9a9a43cd4fff810bb85f9` |
| `pickup-response-run-6-20260917T175857Z-6f7bdd67` | `23b37d81f382f619d1f786be442fe0f678a24ca4a6746401931767b5f7d30c73` |
| `pickup-response-run-11-20260917T175956Z-180768b1` | `c822e1194246b6d2d8e5ad40b74a4877466fa5736e90e2556e0ed5f2d04eb174` |
| `pickup-response-run-20-20260917T175933Z-9c4d6379` | `46bfb1cee253e27628b27e614a719858e5024ddc391a07f54eb8a6c6fd67fda5` |
| `pickup-response-run-62-20260917T180109Z-491e90e6` | `eb8812d10ced2fedbe476276eb8503e550a7f0c494d4dadd33803e4ac3a4b6bf` |
| `pickup-response-run-pending-20260917T180148Z-4baf3e10` | `7398db4752d0c3255c3cea2806dc62d4584bc3ce02de17bb0633f89ced42f4ba` |
| `pickup-response-run-save-resume-20260917T180228Z-dbbe1672` | `67d3b9cc0cdb3d632955fb81f748d1054c4cf10f49afe2e161b974f1b933ddc2` |
| `pickup-response-run-20-20260917T180412Z-ba5b41f9` | `f2465d457bf94832bc5f441ae4a687ed089c453e3aa5cceae08ac7048b8747b9` |
| `pickup-response-run-6-20260917T180435Z-4b35b07d` | `a0c341d3edc26a7792398f78270e6e523022df8a49e4d7d3d269e0d0bb22d1bf` |
| `pickup-response-run-pending-20260917T180501Z-e4ba809d` | `cb42c6eb25ac3f551cd7dca67ef9c3c6428a868e2454b1a88fe8e1a0b84a6757` |

### Claim boundary

The checkpoint cases hold interrupts and supply `A0`, `D1` and the PC, so they establish what the
original routines do at those entries, not physical-input timing. The timeline cases write the
pending-trigger word and let the program launch and run the response itself, so they establish the
response's own progression, but the pickup that would have written that word is not performed. No
case walks a route, presses take, or observes an object leaving the world. Hatari runs with sound
off, so the guarded sound request the walk falls into is recovered statically and no audible output
is observed or claimed. Seconds are this configuration's; the frame counts are the recovered
quantity. Nothing here is a whole-game equivalence claim.
