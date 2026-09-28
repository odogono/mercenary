# Damocles landing messages: triggers `$20`–`$3C`

Working-Authority Evidence for [#572](https://github.com/odogono/mercenary/issues/572), recovered
2026-09-28. It follows [#567](https://github.com/odogono/mercenary/issues/567): the landing fires
Damocles Script trigger `body + $1F`, and the port presents nothing for it
([ADR 0052](../adr/0052-land-a-damocles-craft-at-the-recovered-landing-point.md), decision 6).
Authoritative Evidence remains bound to the C64 Reference Build. This note records decoded ST
facts only ([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). RAM, traces and
game text stay ignored Restricted Material. Messages are named here by the ids
`payload/damocles/strings.json` already gives them, and their text is described, not quoted.

## What was found

1. **26 of the 27 landing scripts are one shape: a gazetteer line, shown about one landing in
   three.** Each opens with `if.random $A000`, which jumps straight to the busy clear at `$072CBE`
   when the drawn word is below `$A000`. Otherwise it waits 100 frames, presents one to three
   inline messages and ends on the shared epilogue `$072CAE`. The messages are short histories
   of the Body: who settled it, when, and what is there now.
2. **The trigger is spent even when nothing is shown.** The launcher `$054770` clears bit 7
   before the script runs, so a landing whose draw skips the message disarms that Body's trigger
   for good. The draw is from a fixed 2,048-word table, and 754 of its words are `$A000` or more.
   Averaged over the table, a first landing presents its message with probability
   754/2048 ≈ 0.368.
3. **The draw is a pointer walk that the main loop advances once a pass.** `if.random` reads the
   word at the pointer `$7E18` and steps it on, wrapping inside `$77000`–`$77FFF`. The main loop's
   join `$05948C` steps the same pointer one word a pass without reading it. In 2,800 traced flight
   and space passes the pointer moved exactly one word a pass, except on the landing pass, where it
   moved two.
4. **TOLOSA (`$38`) is sticky because it attacks you on every landing.** It has no random skip. On
   the first landing it sets bit 1 of `$7BD8`, presents two lines, clears the row, waits again and
   presents the attack line. On later landings bit 1 is already set, so it skips to the attack
   line. Either way it then writes `$0001` to bank word `$070104`, the encounter gate that arms the
   attack ship ([moving objects](damocles-moving-objects.md#what-arms-the-encounter)). Clearing
   bit 7 would stop that after one visit, which is why the byte is `$C0`.
5. **DAMOCLES (`$3C`) is not a landing message.** The landing skips it, and its script is the
   deflection ending: messages saying the comet has changed course, a reward credited to record
   `$00F8`, and the State President's congratulations when bit 0 of `$7BD8` is set. It is fired by
   case 5 of the `$7856` dispatcher `$04D7F0`, which also arms the comet's drift `$7A7E` =
   `$FFFFEDCC`. Its `$A0` byte makes it queueable, so the ending waits for a running script
   instead of being lost. That is the only reason bit 5 matters here.
6. **ERIS (`$2A`) is not a landing message either.** The landing skips it, and its script is the
   author's-computer warning (`script42-inline-1..2`), fired from `$04D270`. That happens on keypad
   Enter (`$72`) while slot 101 AUTHORS COMPUTER is at the head of the Carried Stack `$61CE` and
   `$7A90` = `$0E`. The landing's two skips are the two indices in its range that belong to
   something else.
7. **Nothing re-arms a trigger.** `$7CB4` is still named by one instruction, the launcher's `lea`
   ([pickup responses](damocles-pickup-responses.md#repeat-disarm-and-re-arm)). The in-game load
   restores `$6140`–`$7E17` whole, which includes `$7CB4`, `$7BD8` and `$7A88`, so a loaded game
   gets back the arming it saved. It does not restore the pointer `$7E18`, which lies just past the
   copied range.

## Reproduce

| Item | Value |
| --- | --- |
| Pinned first-world RAM | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Landing trace | the #558 `cross` run `space-flight-cross-20260928T094644Z-a1cc495e` ([space flight](damocles-space-flight.md#traces)) |
| Check | `research/damocles-st/scripts/landing-message-check.py` |

```sh
research/damocles-st/.venv/bin/python research/damocles-st/scripts/landing-message-check.py \
  --run research/damocles-st/work/observe-first-world-20260818T101013Z-c5a32b7d \
  --cross research/damocles-st/work/space-flight-cross-20260928T094644Z-a1cc495e \
  --memstates research/damocles-st/snapshots/rehosted
```

The check runs no emulator. It decodes every script `$20`–`$3D` with the lab's Script decoder
(`damocleslab.script`) and names each message by its `strings.json` id. It checks the arming bytes
and 34 instruction facts, hashes the ranges below, sweeps the noise table across a memstate
directory, and replays the `cross` landing from the trace's per-pass `$0`–`$8000` windows. It
prints JSON with no game text and exits nonzero on any mismatch. On 2026-09-28 it passed, and the
noise table was byte-identical in all 62 memstates (28 rehosted, 34 in `snapshots/`).

## The scripts

Each landing trigger reaches its script through the word at `$070080 + 2 × index`. The words match
the table in #572. Durations are 50 Hz display frames. A shown gazetteer takes 100 + 200 per line
+ 50 for the clearing line. A skipped one takes no frames.

| Trigger | Body | Arming | Shape | Messages |
| ---: | --- | --- | --- | --- |
| `$20` | 1 ICARUS | `$80` | gazetteer | `script32-inline-1..2` |
| `$21` | 2 MIDAS | `$80` | gazetteer | `script33-inline-1..3` |
| `$22` | 3 ACHERON | `$80` | gazetteer | `script34-inline-1..2` |
| `$23` | 4 DION | `$80` | gazetteer | `script35-inline-1..3` |
| `$24` | 5 ATROPOS | `$80` | gazetteer | `script36-inline-1..2` |
| `$25` | 6 CLOTHO | `$80` | gazetteer | `script37-inline-1..2` |
| `$26` | 7 LACHESIS | `$80` | gazetteer | `script38-inline-1..3` |
| `$27` | 8 GAEA | `$80` | gazetteer | `script39-inline-1..3` |
| `$28` | 9 CRONUS | `$80` | gazetteer | `script40-inline-1..2` |
| `$29` | 10 CYCLOPES | `$80` | gazetteer | `script41-inline-1..3` |
| `$2A` | 11 ERIS | `$80` | author's computer, not fired by a landing | `script42-inline-1..2` |
| `$2B` | 12 SOLON | `$80` | gazetteer | `script43-inline-1..2` |
| `$2C` | 13 THEON | `$80` | gazetteer | `script44-inline-1..2` |
| `$2D` | 14 VESTA | `$80` | gazetteer | `script45-inline-1..2` |
| `$2E` | 15 METIS | `$80` | gazetteer | `script46-inline-1..2` |
| `$2F` | 16 LUCAN | `$80` | gazetteer | `script47-inline-1..2` |
| `$30` | 17 LOGOS | `$80` | gazetteer | `script48-inline-1` |
| `$31` | 18 AURORA | `$80` | gazetteer | `script49-inline-1` |
| `$32` | 19 TRITON | `$80` | gazetteer | `script50-inline-1` |
| `$33` | 20 PAN | `$80` | gazetteer | `script51-inline-1..2` |
| `$34` | 21 THALIA | `$80` | gazetteer | `script52-inline-1..2` |
| `$35` | 22 JUNO | `$80` | gazetteer | `script53-inline-1` |
| `$36` | 23 BACCHUS | `$80` | gazetteer | `script54-inline-1..2` |
| `$37` | 24 JASON | `$80` | gazetteer | `script55-inline-1..2` |
| `$38` | 25 TOLOSA | `$C0` | the encounter, below | `script56-inline-1..3` |
| `$39` | 26 PERSEUS | `$80` | gazetteer | `script57-inline-1..2` |
| `$3A` | 27 MENTOR | `$80` | gazetteer | `script58-inline-1..2` |
| `$3B` | 28 SAPPHIRE | `$80` | gazetteer | `script59-inline-1` |
| `$3C` | 29 DAMOCLES | `$A0` | the deflection ending, not fired by a landing | `script21-inline-1`, `script60-inline-1..5`, `script16-inline-5..7` |
| `$3D` | — | `$80` | a METIS location trigger, outside the landing's range | `script61-inline-1..4` |

Body numbers are the landing's, `a0 / 4`, and the names are `payload/damocles/system.json`'s.

The strings ids are named for the first script that reaches the record in decimal, so
`script38-inline-1` is trigger `$26`'s first line. Every record the landing scripts present is
already extracted under [#304](https://github.com/odogono/mercenary/issues/304). No string needs
adding.

### The gazetteer shape

```
if.random  $A000 -> $072CBE     ; drawn word < $A000: clear busy, return
call       $072CE0              ; reset.wait, if.wait $0064 (100 frames), return
message    …                    ; one to three inline messages, 200 frames each
jump       $072CAE              ; shared epilogue: 50-frame clearing line, clear busy, return
```

The delay member `$072CE0` is the family's 100-frame one. `$072CBE` is the epilogue's last two
instructions: clear `$0040` in `$7BD8` and return. So the skip path presents nothing and leaves the
display row as it was.

### TOLOSA, `$38`

```
call       $072CE0              ; 100 frames
if.flags   $0002 -> $072AE8     ; visited before: straight to the attack line
flags.set  $0002
message    script56-inline-1
message    script56-inline-2
call       $072D1C              ; the 50-frame clearing line, busy kept
call       $072CE0              ; 100 frames
message    script56-inline-3    ; the attack line
bank.write $0104 $0001          ; the encounter gate $070104
jump       $072CAE
```

A first landing takes 100 + 400 + 50 + 100 + 200 + 50 = 900 frames, and a later one takes
100 + 200 + 50 = 350. Bit 1 of `$7BD8` is written only here. `$072D1C` is the call-shaped
epilogue the [pickup note](damocles-pickup-responses.md#what-each-response-does) records: it has no
busy clear.

## The random draw

`$051A5E`, the `if.random` handler:

```
movea.l $7e18.w, a0             ; the pointer, $00077xxx
move.w  (a0)+, d0               ; the drawn word
andi.w  #$fff, d7 / ori.w #$7000, d7 / move.w d7, $7e1a.w   ; wrap inside $77000-$77FFE
cmp.w   d2, d0                  ; d2 = the operand
bcs.b   $51a2c                  ; below: take the branch
```

`$051A2C` is the shared predicate epilogue that takes the branch
([ISA](damocles-script-isa.md#opcode-encoding-bits-6-and-7-select-the-branch)). So the branch is
taken on an unsigned word below the operand. For the landing scripts that is the skip.

**The table.** `$77000`–`$77FFF` is 4 KiB of noise: all 256 byte values, each 7 to 25 times, with
zeros before it. It was byte-identical in every one of the 62 memstates. Of its 2,048 words, 1,294
are below `$A000` and 754 are not. The Geiger click draws from the same table
([sound programmes](damocles-sound-programmes.md)).

**Who moves the pointer.** New Game seeds it to `$77000` (`$051090`). The main loop's join
`$05948C` steps it one word a pass with no read. Eleven sites draw from it. They are the `if.random`
and `message.random` handlers, the Geiger tick at `$051D38`, and eight native sites at `$04CCF2`,
`$04CD28`, `$04CD66` and `$05160C`–`$05169E`. This note does not decode the native ones. None of
them drew in any traced pass except the landing's `if.random`. The player-hit effect at `$050ECC`
rotates table words in place as it walks. By reading, its 65,535 steps of 4 bytes return every
word to its value except one. None of the 62 memstates shows a changed table.

So the draw at a landing is a function of the passes run and the draws made since New Game. The
original's Save does not carry the pointer, so a loaded game draws from wherever the running
session's pointer happens to be. Across sessions the draw is effectively uniform over the table.

## The `cross` landing, confirmed

The #558 `cross` run lands on LACHESIS from DION with `$26` armed. Read from its per-pass windows:

| Pass | What happens |
| ---: | --- |
| 214 | idle at `$0703FC`, `$26` = `$80`, busy clear, pointer `$077A40` |
| 215 | the landing: `$26` = `$00`, busy set, PC `$072330` (past the `if.random`), pointer `$077A44` |
| 217–251 | the 100-frame wait at `$072CE2`, `$7B9C` rising 3 a pass |
| 252 | PC `$072334`, the first message |
| 253 | gate `$7BA0` set, `$7B98` = `$072336`: `script38-inline-1` scrolls in |

The pointer moved two words on the landing pass, one for the main loop's advance and one for the
draw. The word at `$077A40` is `$3780`, which would have skipped. The word at `$077A42` is
`$C887`, which does not. The message was presented, so the draw read `$077A42`, after the pass's
advance. That is the order the check asserts. The pending word `$7A88` stayed zero throughout.

The 38 passes from landing to message are the 100-frame wait at 3 frames a pass, plus the launch
and return passes. They are not a separate delay.

## Arming, queueing and re-arming

The launcher semantics are unchanged from [#317](damocles-pickup-responses.md#busy-arbitration).
Bit 7 is armed and bit 5 queues while busy. Bit 6 keeps bit 7 set on launch. For the landing range
that means:

- **A landing while a script runs** discards its trigger, and the trigger stays armed. All 26
  gazetteers and TOLOSA have bit 5 clear. A later landing on that Body can still present it.
- **A landing on a Body already landed on** is refused before the busy test. Only TOLOSA runs
  again.
- **`$3C` queues.** Its one firer is the deflection, and the queue keeps the ending from being lost
  behind a message already running.
- **No location fires a landing trigger.** The two table-driven firers, `$054C94` and `$05A6F6`,
  walk the Body's location table at `[$7A68]`, whose entries end in a trigger byte. In the first
  world and all 62 memstates, which hold the tables of the captured Bodies only, those tables name `$03`, `$04`, `$07`–`$0A`, `$0C`, `$0D`,
  `$1C`–`$1F`, `$3D` and `$3F`, and nothing in `$20`–`$3C`. `$3D` is one METIS entry.
- **No code re-arms any byte.** The first world's values come from the loaded image. Each memstate
  holds the disarmed triggers of the Bodies landed on in its history
  ([space flight](damocles-space-flight.md#the-landing-triggers-567)).

## What this means for the port

These are recommendations for the follow-up port ticket, not decisions this note makes. #576
took them, with the on-foot pointer held
([ADR 0053](../adr/0053-present-damocles-landing-messages-from-the-recovered-draw.md)).

1. **Arm the 27 landing triggers and carry them in a Save.** Those are `$20`–`$3B` without `$2A`,
   plus TOLOSA. The Save's trigger table is checked to hold exactly the six pickup triggers
   (`web/src/damocles/save.ts`), so this is a schema bump to 14. Migrating a schema-13 record
   exactly means arming all 27. The #567 port fires into a table without them, so no schema-13
   session has spent one.
2. **Author the gazetteers as one named step list** (ADR 0045), built from the table above:
   `random-skip`, the 100-frame `wait`, the message ids, then `sharedEpilogue()`. Name the script
   ids by trigger, as `damocles.script.slot-38` already is for `$26`. TOLOSA needs three more
   things. It needs a flag step on bit 1 of `$7BD8`, the call-shaped epilogue without the busy
   clear, and the encounter gate `$070104` as script state. The Save should carry the flag and
   the gate, as the original's does. The attack ship itself is a separate ticket. The gate alone
   already lights the panel's second lamp ([panel aboard](damocles-panel-aboard.md)).
3. **Model the draw as the recovered walk, not an invented RNG.** Publish the 2,048-word table
   (a payload block, as the log table is). Seed the pointer at word 0 on New Game, step it once a
   craft pass (ADR 0051), and read one word per `if.random`. This keeps the 754/2048 rate and the
   exact outcome of any traced flight. On foot the port has no pass clock, and the native draws
   are undecoded, so the outcome there is only as exact as the pass count. Carrying the pointer in
   the Save goes beyond the original, which omits it. It makes a restored session deterministic,
   and the ADR should record that.
4. **`$2A` and `$3C` stay out of the landing.** They belong to the author's computer and the
   endgame (#110). The port's `landingTrigger` already skips both.

## Unresolved

- **The eight native draw sites** at `$04CCF2`–`$04CD66` and `$05160C`–`$05169E`: what they draw
  for and when they run. None ran in a traced flight, but on foot and in other modes they may.
- **`$7A90` = `$0E`**, the second condition on `$2A`, and what `$7856` case 5 is in play terms,
  beyond arming the drift and firing `$3C`. Both are for the endgame (#110).
- **Bit 0 of `$7BD8`**, which `$3C` tests before the State President's lines. Its writer was not
  traced.
- **A landing on TOLOSA was not traced.** Its script is decoded from the bank alone. The gate
  write was confirmed by the [moving-objects](damocles-moving-objects.md#runtime-confirmation)
  `attack-armed` case, which injected `$070104` directly.
- **A skipped landing was not traced.** The skip path follows from the decode and from the
  `cross` draw, which went the other way.

## Source ranges

Half-open ranges in the pinned first-world RAM, as the check hashes them. The trigger dispatch
digest is the same as in [the limo-key note](damocles-limo-key-pickup.md).

| Range | SHA-256 |
| --- | --- |
| `$07204C`–`$072CAE` landing scripts | `f41652fee6f8085e829bf320a600049bcb3e9a9c5b5bf468dbe38331dfd70544` |
| `$072CAE`–`$072D2E` epilogues and delays | `fd2865be7a88d724714ba8b3c6c02cb82185070aa85c2ef9e8f39e8e66427278` |
| `$051A5E`–`$051A7E` `if.random` | `db0f6dd56badd52f9766c418d7dbc4732f683f7438ac0770bc40ca7d64338ad5` |
| `$05948C`–`$05949E` main-loop advance | `874dfa0dfc6ffee35ae4cbfffb5cfe391797223f9c83ac40663b4d1584801ef0` |
| `$059280`–`$05929A` landing trigger | `3d9b24a970e20f3e32be4c4bd43c5a80ec4a04484065048f5d0d42e2d0991d2b` |
| `$054764`–`$0547C6` trigger dispatch | `eccc7df9c8c734f5c3758b50c43c56f6a05404dda1bc34e668fad5956f514a61` |
| `$77000`–`$78000` noise table | `7b5e79b4b9981da8357abca3c911d2bcf22a27700c5dafd25348beffe5f15770` |
