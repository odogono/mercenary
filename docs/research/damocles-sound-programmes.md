# Every Damocles sound programme

Working-Authority Evidence for [#514](https://github.com/odogono/mercenary/issues/514),
recovered 2026-09-25. It follows [#508](https://github.com/odogono/mercenary/issues/508),
which recovered, heard and presented the door tone, the door burst and the shared effect
([the lift ride's sound](damocles-lift-ride.md#sound)). This note covers every other sound
the ST program can make. Authoritative Evidence remains bound to the C64 Reference Build.
This note records decoded ST facts only and does not translate the program into a new
model ([ADR 0002](../adr/0002-separate-rom-research-from-implementation.md)). Captures,
RAM, recordings and listings stay ignored Restricted Material under
`research/damocles-st/work/`; only addresses, decoded facts and hashes are recorded here.

## Decision

The program makes sound in four places, and nowhere else:

1. **The driver's two vectors.** The VBL handler calls `$04BF54` (channel B) and then
   `$04BF58` (channel C) every VBL ([the model](damocles-lift-ride.md#what-the-programmes-play)).
   Beyond the three #508 heard, channel B has nine more programmes and channel C two,
   and #508's idle `$04C250` turns out to be a craft engine.
2. **The Geiger tick.** `$051D26` runs from the VBL and Timer B handlers and calls the
   click `$04C6B2` directly.
3. **Three direct writers outside the vectors.** The per-character message tone on
   channel A (`$052402`, [the reveal](damocles-message-reveal.md#sound)), the New Game
   descent drone on channels B and C (`$051274`/`$051340`), and the cuts and resets.
4. **A three-voice music player** at `$033F6A`. This is the "alternate path" behind
   `$033F68`: it replaces both vectors for as long as a carried GHETTOBLASTER is
   switched on.

There is no XBIOS sound call, no sample playback and no timer-driven digital sound in the
resident image. From power-on through the loader and title to New Game, Hatari's output
stays at the 1-LSB floor ([boot](#heard-in-the-working-authority)).

| Programme | Channel | Sound | Event | Heard |
| --- | --- | --- | --- | --- |
| `$04BF5C` spell | B | 5-VBL tone warble, 4.2 s decay | a BOOK page's action, with the MAGIC CRYSTAL carried (index 1–7) | programme only |
| `$04C016` splash | B | noise stepping its period, 0.85 s decay | a craft reaching the ground over sea | programme only |
| `$04C0B4` transporter | B | tone and noise, alternating low and high, 1.05 s decay | a transporter hop | **event** |
| `$04C470` bump | B | 31 Hz tone, 1.58 s decay | a boarded move refused; BOOK index 8 | **event** |
| `$04C5A8` blast | B | noise, 2.1 s decay | an explosive's deadline; a craft reaching the ground on land | **event** (intervention) |
| `$04C610` shot | B | noise, 0.49 s decay | the player fires; ENEMY SHIP DESTROYED | **event** (fire) |
| `$04C630` thud | B | noise, 0.26 s decay | on foot against a region edge; the attack ship fires | **event** (wall) |
| `$04C652` zap | B | 10.4 kHz tone and noise, 2.1 s decay | the attack ship's shot reaches the player | programme only |
| `$04C700` blown up | B | noise, 4.7 s decay | a carried explosive or NOVABOMB detonates; too close to a blast | **event** (intervention) |
| `$04C6B2` Geiger click | B | 2604 Hz, 8 ms | GEIGER COUNTER carried and on, near the NOVABOMB | **event** (intervention) |
| `$04C16E` alarm | C | 61 Hz tone, 16-VBL level loop | an environment warning's ten seconds | **event** (intervention) |
| `$04C1EE` channel C off | C | silence | death, shelter, a warning cleared or replaced | **event** (intervention) |
| `$04C220`/`$04C250` idle engine | C | 7.8 kHz tone and noise, level = log₂ speed | a craft moving at speed 1 or more | **event** |
| `$052402` message tone | A | character × 2 period, level 12 | every message's scroll-in | **event** |
| `$051274`/`$051340` descent drone | B, C | two falling tones, 122 and 109 Hz down | New Game's descent to Eris | **event** |
| `$033F6A` music | A, B, C | a three-voice tune looping every 66.5 s | GHETTOBLASTER carried and switched on | **event** (intervention) |

*Programme only* means the programme was armed directly and heard, but its event was
not reached ([what was not reached](#what-was-not-reached)). *Intervention* means the event's
state was poked and the program's own path then ran; the pokes are listed with each case.

## Working Authority and evidence

| Item | Value |
| --- | --- |
| Program SHA-256 | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS SHA-256 | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` (EmuTOS 2.06) |
| Hatari | 2.6.1, binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Static source | `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram`, `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| Probe | [`research/damocles-st/scripts/sound-programme-probe.py`](../../research/damocles-st/scripts/sound-programme-probe.py) |

`sound-programme-probe.py decode` hashes the windows below, checks 63 byte sequences
(every register write, table, guard and arming site this note quotes), and decodes the
three music voices, all without Hatari. The sound bank `$04BF5C`–`$04C75F`, the bump
stream and the music code and data are byte-identical in all 61 tracked and rehosted
memstates, so none of them is a runtime buffer.

| Window | SHA-256 |
| --- | --- |
| Spell `$04BF5C`–`$04C015` | `7c722fcd84635dbda75f95078fa8d2df9ad1e5aca1d46866678d284e11dfb1be` |
| Splash `$04C016`–`$04C0B3` | `368301c138dd0f93c75f2444b36db0cba30099e02cd72a57e4d1481d0fc2b550` |
| Transporter `$04C0B4`–`$04C16D` | `1d42d8876de75618cd44c15c8e1985f08ed46f72db7fabafb331799eb914f54d` |
| Alarm and its levels `$04C16E`–`$04C1ED` | `5a641f075b40accf66a33e4c8e567114ffa08e1f671f2ec87836b2ef9e8113c6` |
| Channel C off `$04C1EE`–`$04C21F` | `1b8ba70586359097b529b83e542a1200e4dbb388f4878084298e11c60cae0b7b` |
| Bump and its reader `$04C470`–`$04C555` | `b0db1c203a488d36dc27349ccc5db206dd02cdf1faac0f7faaabdfa8f22c2c92` |
| Blast, shot, thud `$04C5A8`–`$04C651` | `742d22063e71bf342764ad8147ae6932b2a39a6bd03d0a0e6741519293a2539e` |
| Zap `$04C652`–`$04C6B1` | `95f8443d4fa74a32281bd306610c154af630f6c585954218d3b4a9bae21ad084` |
| Geiger click `$04C6B2`–`$04C6FF` | `6b62f4a8fe478cd8cd558575f142490fd7ab225200b8a980c06bc313567eebf8` |
| Blown up `$04C700`–`$04C721` | `aa94578e6b00daf3400adc70e35a2456b704c1e90af468baef93e3fc6db90841` |
| Bump stream `$008702`–`$008713` | `fcc4a36f4886e135ed4a914322d54acc6b7e23117e3cfe54a49eba379c787a47` |
| Geiger rate `$04C814`–`$04C8D1` | `b208c21c06afa16e55dc37a182aa337863067a3bfddc5696eb3766ef311f19ae` |
| Geiger tick `$051D26`–`$051D73` | `14a39ee31750f1c5a88fd4882955be2e04cb58aadbfa56a046bd7a2ecc20b38a` |
| Explosive fuse `$04D69C`–`$04D761` | `b518ebba373bd6194b50c49b986f3d3e8f4a94e05075bda32d9100573a63562b` |
| Explosive deadline `$04DAC6`–`$04DAF7` | `76fee00f70b1d39d8bffecf9c004e85a9e484b3b91453ce336ebb1ec65fd9fba` |
| Explosive blast `$04CB60`–`$04CBD9` | `84359f09f46a16f9f4618f4ed6c6ec4e661094277ecc9586e97d74bbeed47af0` |
| Switches `$04D420`–`$04D4CF` | `bf7ffce3067f363b32abe0dafcee52e42dbe75e0e193b9c95276069714d88714` |
| Book pages `$04D7F0`–`$04D90D` | `e8d9e739a79af7bb40732ac0621336ac02bcb61406441a7bb8f45fd14d0a9111` |
| Shots and enemy ship `$050B28`–`$050BC3` | `330202e8e3d75ffa244cdb1989d4968e9f07d16a7900bf44d07f0a605177b9be` |
| Attack ship `$050D80`–`$050E09` | `7126c0f3c54b49f1b68e74e5b0033fe2415b114cf8a87785a2bab02eb6096afa` |
| Hazard ticker `$050F0E`–`$050FA5` | `545479bdbcb744dbced1d5b09aaf408ed3c1dbdd0072846b23b6bb7199e9af42` |
| Hazard evaluator `$0543FA`–`$05449B` | `ecbaf1d1f192eb48d12b9a6ecd6ee3512edfdb58dfafc32d5f7c6f4050bb79df` |
| New Game `$051052`–`$051225` | `f7ac1f6fcfc14e2087cb27e816b18eb5cff8dca0bb0a9165bdaa1618fa5ab8de` |
| Descent drone `$051274`–`$05146D` | `99f0bdd078d38fa06799131a789da920f9cf7c6876b22c1d01aca3a3d2f5bc79` |
| Descent `$05872E`–`$0587D7` | `900f4fd43614fe57e175e856bd9d43410bf278920d12dffabdd03f4bd75b3bb0` |
| Message tone `$052402`–`$05246B` | `4e24e0aaa633024602b24da50ac4b7507a0f545a6c70dc8cea34b3d3e6b0d67b` |
| Message end `$0523BE`–`$052401` | `f16ad98058094d534966d8f1c8d8c620df3c4f94997d5f6366ca521714f4c440` |
| Grounding `$057CF2`–`$057D63` | `dfb9b335c3e0c6d51c8b85a76ca865c5f5c05598814d1c00657490f5ddd1dcff` |
| Transport `$059184`–`$059267` | `201c89fd796b535d373c22d54a038f22a9247777e53a1f777fdcd2b38f562eca` |
| Wall `$059586`–`$0595A3` | `d079654608125a92ede5c8e377033d74e54373993a80359d4905bc9867e74c18` |
| Refused move `$059740`–`$059769` | `68f975f4bcde268ba4e29d3d5697528586de3783f8e83846256cb48c277557a3` |
| Music gate `$0594A4`–`$0594D1` | `52f69e1a1f4f1d1476f5a7cd836d24e9488fa3ac3e13dac6eeced8fbeed271bc` |
| Sound reset `$0508BC`–`$050904` | `727b7f8a212b2c2da2da720af5d9a795a51c2488fd52ebc05f5612efef4f946a` |
| Music player `$033F68`–`$034415` | `cbff997783b200965346010deea1a84a4d7752b9af4157dd9047f99576ae4364` |
| Music voices `$03441E`–`$034FAF` | `8f7359b24e326e57e74159637e4a0c1caca303616f971461f771bdd3bceac0db` |
| Music instruments `$034FB0`–`$0350C7` | `6c32e6e3c75af232bba9742141a912174a9a08330126d797a89478e2c997ee45` |

**How complete the survey is.** Every even address in `$000800`–`$0FFF00` was
disassembled with Capstone and filtered for the PSG (`$8800`, `$8802`, `$FFFF8800`),
for the shadow `$7C04`, for `$033F68`, and for every address in the bank
`$04BF00`–`$04C7FF`. Every site that names a vector is listed in the tables below. So is
every PSG write outside the bank: `$033F6A`–`$03440E`, `$0508BC`–`$0508EA`,
`$051288`–`$05145C`, `$0523EC`–`$052466`, `$054868`–`$05487C`, `$0559B0`–`$055A12` and
`$055C10`–`$055C72`. The nine `trap #14` and seven `trap #13` matches lie in ASCII
text, so there is no `Dosound` or `Giaccess` call. The scan covers resident code only,
so the loader and title are settled by [listening](#heard-in-the-working-authority)
rather than by decode.

## The driver's rules, completed

- **Channel B programmes replace one another.** Arming writes the vector, and every
  entry rewrites the envelope shape register, which restarts the envelope. So the last
  programme armed is the one heard. A programme that never disarms itself (the spell,
  the splash, the transporter, the bump) keeps writing its registers until something
  replaces it; after its envelope has decayed it is inaudible.
- **The Geiger click is the only interruption from outside.** `$04C6B2` ends in the
  shared tail `$04C5EC`, which disarms `$04BF54`. So a click cuts whatever channel B
  programme is running. `$7A78` is what stops it: while `$7A78` is non-zero,
  `$051D26` decrements it and does not tick. Every arming site writes `$7A78` ← 3, and
  most entries then write their own value: spell `$40`, splash `$0D`, transporter
  `$10`, shared effect `$0F`, blast `$1F`, shot 7, thud 4, zap `$20`, blown up `$47`.
  The bump and the click write none. The count is in ticks, and the tick runs from the
  VBL handler (`$051DAC`, skipped while a palette flash `$51D24` runs) and from the
  Timer B handler (`$05231E`). The Geiger recording's 75 clicks a second shows it runs
  more than once a VBL, and #508's traces saw the shared effect's 15 count out in 8 VBLs.
- **Channel C** holds one of five programmes: the door tone and burst, the alarm, the
  off state, and the restore with its idle engine. A door edge replaces the alarm, and
  the door edges' guard (`$7A64` non-zero with bit 14 of `$7B34` set) is exactly the
  alarm's condition, so no door sound interrupts a running alarm.
- **While the music plays**, `$051DFE` skips both vectors, so an armed programme waits
  and runs, stale, after the music stops. The message tone and `$054848`'s cut are also
  skipped. The Geiger tick is not: a click still writes channel B and copies the shadow
  mixer `$7C04` over the music's mixer. That is read in the listing and was not recorded.

## What each programme plays

YM2149 at 2 MHz: a tone period *P* sounds at 2 MHz / 16*P*, and an envelope period *E*
decays over 256 × *E* / 2 MHz. Shape 9 (and shape 2) decays once and then holds
silence. "Level env" means the channel's amplitude register holds `$1F` (bit 4 set: the
envelope drives it).

| Programme | Writes | Then |
| --- | --- | --- |
| Spell `$04BF5C` | tone B 0; noise 0; mixer `& $FD \| $10` (B tone on, noise off); B level env; `$7A78` ← `$40`; envelope `$8021`, shape 9; `$86F0` ← `$200` | re-arms `$04BFE2`, falls in |
| Spell step `$04BFE2` | *x* ← *x* + `$333`, tone B ← *x* `& $1F1` | never ends |
| Splash `$04C016` | tone B `$AA0` (unused); noise 0; mixer `& $EF \| $02` (B noise on, tone off); B level env; `$7A78` ← `$0D`; envelope `$1A00`, shape 2; `$86DC` ← 0 | re-arms `$04C09C`, falls in |
| Splash step `$04C09C` | byte *n* ← *n* + `$46`, noise period ← *n* (5 bits) | never ends |
| Transporter `$04C0B4` | tone B `$FFF`; noise `$10`; mixer `& $ED` (B tone and noise on); B level env; `$7A78` ← `$10`; envelope `$2021`, shape 9; `$86DC` ← `$F00` | re-arms `$04C13A`, falls in |
| Transporter step `$04C13A` | *x* ← *x* + `$313`, tone B ← *x* `& $118` | never ends |
| Bump `$04C470` | tone B 0; mixer `& $FD \| $10` (B tone on, noise off); B level env; envelope `$3021`, shape 9; stream pointer `$86FE` ← `$8702` | re-arms `$04C4EA`, falls in |
| Bump step `$04C4EA` | next word of the stream: `$FFFF` restarts it (no write that VBL), `$FFFE` turns B off and disarms, anything else is tone B | never ends: the stream holds no `$FFFE` |
| Blast `$04C5A8` | `$7A78` ← `$1F`; envelope `$3FFF`; then the noise tail `$04C5C6`: noise `$1F`, mixer `& $EF \| $02`; then `$04C5EC`: B level env, shape 9 | disarms |
| Shot `$04C610` | `$7A78` ← 7; envelope `$0F00`; noise tail | disarms |
| Thud `$04C630` | `$7A78` ← 4; envelope `$0800`; noise tail | disarms |
| Zap `$04C652` | `$7A78` ← `$20`; envelope `$4000`; tone B `$00C`; noise 5; mixer `& $ED` (B tone and noise on); tail `$04C5EC` | disarms |
| Geiger click `$04C6B2` | envelope `$0040`; tone B `$030`; mixer `& $FD \| $10`; tail `$04C5EC` | disarms |
| Blown up `$04C700` | `$7A78` ← `$47`; envelope `$8F00`; noise tail | disarms |
| Alarm `$04C16E` | tone C `$800`; mixer `& $FB \| $20` (C tone on, noise off); byte walk `$04C1DC`, counter 1 | re-arms `$04C1C0`, falls in |
| Alarm step `$04C1C0` | a level step writes C's level | never ends |
| Channel C off `$04C1EE` | mixer `\| $24` (C tone and noise off); C level 0 | disarms `$04BF58` to the bare `rts` |

| Table | Entries |
| --- | --- |
| Alarm levels `$04C1DC` | (2, 2), (3, 3), (4, 4), (2, 7), (2, 15), (3, 3), then back to `$04C1DC`: 16 VBLs a loop |
| Bump stream `$8702` | `$FF0`, `$FE0`, `$FD0`, `$FC2`, `$FB0`, `$FA0`, `$F50`, `$F40`, `$FFFF`: 9 VBLs a loop |

So:

- **Spell:** a 5-VBL arpeggio, 410, 1302, 312, 651 and 252 Hz, drifting slowly as the
  counter carries, under a 4.20 s decay.
- **Splash:** noise at period 6, 12, 18, 24, 30, 4, 10, … a 16-VBL cycle, under a
  0.85 s decay.
- **Transporter:** one VBL near 460–490 Hz, the next at 5–15 kHz, over noise at 7.8 kHz,
  under a 1.05 s decay.
- **Bump:** a 30.6–32.0 Hz tone falling a little in pitch over each 9-VBL loop, under
  a 1.58 s decay.
- **Blast, shot, thud, blown up:** one noise, 4 kHz, at four decays: 2.10, 0.49, 0.26
  and 4.69 s.
- **Zap:** 10.4 kHz tone and 25 kHz noise, 2.10 s decay.
- **Geiger click:** 2604 Hz for 8.2 ms.
- **Alarm:** 61.0 Hz at levels 2, 3, 4, 7 and 15, over and over, until it is replaced.

## What arms each programme

| Arming site | Programme | Event | Guards |
| --- | --- | --- | --- |
| `$04D84A`, `$04D8FC` | spell | Selecting a page of the **BOOK** (slot 131) with keypad `*` (`$04D776`) shows it as a message. When the **MAGIC CRYSTAL** (slot 95) is carried, `$0547F2` then queues the page's action (`$7B96` ← `$8000`), and once the message ends `$04D7F0` dispatches on the page index. Index 1 swaps the crystal for a CHEESE SANDWICH (the [scripted gift](damocles-carry-capacity.md)), and 2 to 7 each remove the crystal and launch a trigger. 3 destroys DAMOCLES, and 5 arms the comet's drift `$7A7E`. | `$7126` bit 7 (crystal carried); 3 and 5 return silently if ERIS or DAMOCLES is destroyed or `$7A7E` is set; index 0 has no action |
| `$04D8DE` | bump | BOOK index 8: a trigger, the crystal removed | as above |
| `$057D50` | splash | A craft's height falls below the ground (`$057D64` → `$057CF2`). The player is set down on foot, the idle engine is silenced (`$7C0C` ← `$FFFF`), and the display is held by the delay loop `$051036`. | the sea answer: `$78A6 & $794A` negative |
| `$057D3C` | blast | The same, on land, after the leave path `$05449C` | not the sea answer |
| `$059254` | transporter | A hop: a digit key while standing in a transporter (`$0555E4` → `$059184`), or walking into its cube (`$059126`) | a destination: strings 17, 18 or 20 refuse |
| `$05975A` | bump | A boarded move refused: the collision response that throttles back (`$7BAC` ← `$FFF0`) | — |
| `$04DADE` | blast | An armed **EXPLOSIVE** (slots 75–83) reaches its deadline. It is armed through the **TIMED DETONATOR** (slot 145, the object table's only type 3). With its panel up (`$785F` = 3, `$04D69C`), keypad `+`/`−` set the fuse in 5 s steps up to 595 s, and keypad `*` arms the explosive then at the head of the Carried Stack (`$04D6F4`; string 13 when it is not one). The per-second path `$05221A` → `$04DACC` detonates it when `$7868` − the Impact Clock ≤ 0, and starts the particle burst (`$7834` ← −1). | `$7A54` armed |
| `$04CB96` | blown up | The burst's first frame (`$04CF4E` → `$04CB60`) finds the explosive carried: it is removed, and string 34 OOPS! - YOU'VE BLOWN YOURSELF UP | `$6FAA` bit 7 of the explosive |
| `$04CBB6` | blown up | Too close to the blast: string 35, death (`$7A64` ← 1), palette flash. Also reached from `$04D48C`: switch bits 3–6 of `$7872` all on (the objects at slots 84–87), with the NOVABOMB placed and carried (string 34, death) | `$7A7A` zero after the blast test `$04CBDA` |
| `$050BB4` | shot | The player fires (the [slot 8 launch](damocles-moving-objects.md#slot-8--the-shot-the-player-fires)) | boarded, fire bit, `$7BBE` zero, no shot in flight |
| `$050B4A` | shot | The shot hits the attack ship: ENEMY SHIP DESTROYED, palette flash `$AA00` | slot 11 on the same body, within `$400` |
| `$059594` | thud | On foot, the region clamp `$05A5F0` refused a step (`$5A646` = `$100`) | on foot |
| `$050DD2` | thud | The attack ship fires slot 15 | `$070104` set (the TOLOSA briefing), within `$3000` |
| `$050DFA` | zap | Slot 15 reaches the player: YOU'VE BEEN ZAPPED | within `$400` |
| `$051D62` | Geiger click | The tick draws a word from the table at `$77000`, scales it by the rate `$7A74` and counts a click when the scaled draw falls under its counter | `$7A78` zero; no flash |
| `$04C8C4` (rate) | — | The **GEIGER COUNTER** (slot 149) carried and switched on (keypad `+` on it: `$7875` bit 7), on the **NOVABOMB**'s (slot 163) body: with *e* the exponent of the squared distance (the float's `⌊log₂⌋`), rate *r* = max(*e* − 16, 0) + 3, and from 25 up (*r* − 20)². So 3 within about 362 units, and 2 more for each doubling of distance | else rate 0, silent |
| `$050F46` | alarm | The hazard ticker `$050F0E` (every main-loop pass while `$7A64` ≠ 0) starts a pending warning: string `$7A7C` (TOO COLD / TOO HOT / NO AIR), `$7A64` ← `$8000` | bit 14 of `$7B34` set |
| `$050F7C` | channel C off | 500 VBLs later: death, `$7A64` ← 1, string `$7A7C` + 26 | — |
| `$050F2E` | channel C off | A warning paused: bit 14 of `$7B34` clear (`$7A64` ← 2) | — |
| `$05445E`, `$054484` | channel C off | The [hazard evaluator](damocles-carry-capacity.md#carried-object-consequences-that-no-handling-bit-predicts) clears or replaces a running warning | `$7A64` negative |
| `$051464` | restore | The descent drone ends (New Game touchdown) | — |
| `$054358` | restore | Boarding | the [board gate](damocles-board-leave-paths.md) |
| `$0596FE`, `$059896` | restore | The main loop's entry `$05942E` (after New Game and after a load), in its branches for `$7A8E` below and above 1 | — |
| `$055902` | restore | The pause menu's F10 path | — |

`$04C250`'s level is the exponent of the speed float `$797A`
([the float format](damocles-object-selection.md)), at most 15. It sounds only while the
exponent is not negative, a speed of 1 or more. `$0588BC`–`$058928` and
`$05804C`–`$058076` recompute `$797A` in flight. Reaching space sets its high word to
`$0010` (`$05588A`), so the engine is at full level there. Boarding (`$05474C`) and
New Game (`$05113C`) set it below 1.

## Outside the vectors

- **The message tone** (`$052402`, called from the VBL at `$051E1E`) is
  [the reveal's](damocles-message-reveal.md#sound): on each scroll-in frame channel A's
  fine period ← the character × 2, and its level ← 12, or 0 for a space. Only register 0
  is written, so channel A's coarse period stays at the reset table's 0. The end of a
  message (`$0523DC`) sets A's level to 0. It is heard in every run that shows a message.
- **The descent drone** belongs to New Game `$051052`. That routine starts the player in
  space (`$7AAE` = 2) with the descent state `$790E` = 1. `$051274` sets tone B `$400`
  and tone C `$480` (122.1 and 108.5 Hz), the mixer to `$F8` (all three tones, no
  noise) and levels B and C to 9, writing the PSG directly. `$051340` adds 4 to both
  periods on each step: once per pass of New Game's loop (`$05120E`, while `$7AE8`
  counts from `$199` to `$259`), then once per frame of the descent (`$0587D0`). The descent scales `$79A2` by `$F100`/`$10000` each frame, and when
  its high word reaches `$20` or less, `$05142E` zeroes B and C, sets `$7A78` ← 3 and arms
  the restore. Every write is skipped while `$033F68` is set.
- **Cuts and resets.** `$054848` zeroes C's level when it arms the shared effect (#508),
  and the arrival `$055C1E`–`$055C72` zeroes B and C and restores mixer and noise.
  `$0508BC` idles both vectors and writes registers 0–12 from `$0508F8` (tone periods 1,
  noise `$1F`, mixer `$DA`, B level `$10`, the rest 0). `$05091A` calls it once at start-up (the `boot` trace saw it once, before New Game), and
  so does the end of a load (`$05530E` → `$058E34`).

## The music player

`$0594A4`, once per main-loop pass, starts the music when `$7A62` is non-zero and the
**GHETTOBLASTER** (slot 121) is carried (`$718E` bit 7): it writes `$033F68` ← `$0100`
if nothing is playing. Otherwise it writes `$0001` if something is. `$7A62` is the
GHETTOBLASTER's switch: keypad `+` on it sets it (`$04D448`), and keypad `−` clears it
(`$04D4C4`). The switch code `$04D430` is shared by every switchable object in the
object table at `$04D2C4`, one bit of `$7872` each. The GEIGER COUNTER is bit 7.

`$051DFE` then calls `$033F6A` every VBL instead of both vectors. It branches on the high
byte of `$033F68`: positive, start (silence all three, then tone-less noise on A, tone on
B and C, and `$033F68` ← `$FFFF`); negative, play one VBL; zero, stop (mixer all off,
levels 0, `$033F68` ← 0). Each voice keeps a position that survives a stop, so the tune
resumes where it was switched off.

The stop leaves channel A's tone off in the mixer, and only the reset `$0508BC` turns it
back on: the channel B and C programmes edit their own bits only. So once the music has
played, the message tone is silent until the next load. That is read in the listing; no
message was recorded after a switch-off.

Each voice reads a byte stream: `0 n` picks volume table *n* from `$034FB0`, `1 n` picks
pitch table *n* from `$03501A`, `2` then a 24-bit address jumps, and any other byte *d*
starts a note of *d* − 2 VBLs whose base period is the next word (`$8000` or more is a
rest). Each VBL a note walks both tables with the byte walk `$033F96` (as `$04C73A`).
The level is the volume walk's value, and the period is the base plus the pitch walk's
value.

| Table | Entries (count, value) |
| --- | --- |
| Volume 1 `$034FC8` | (10, 15), (8, 14), (6, 13), then (5, 12) down to (5, 0), end |
| Volume 2 `$034FD2` | (5, 10) down to (5, 0), end |
| Volume 3 `$034FF2` | a 16 → 0 fade over 131 VBLs |
| Volume 4 `$034FFE` | a 10 → 0 fade over 126 VBLs |
| Volume 5 `$035016` | (1, 15), end |
| Pitch 1 `$035036` | (1, 0), end: no bend |
| Pitch 2 `$03503A` | −2, +2, −1, +1, 0, two VBLs each, looping: a vibrato |
| Pitch 5 `$035078` | +10, +5, 0, −5, −10 over 7 VBLs, looping |

| Voice | Channel | Start | Notes a loop | Instruments | Periods |
| --- | --- | --- | --- | --- | --- |
| 1 | A, noise | `$03441E` | 156 hits of 4 VBLs and 221 rests | none: both tables stay at address 0 | 1 |
| 2 | B, tone | `$03489C` | 418 (106 rests) | volume 1; no pitch table until note 417 | 19, A1 to A3 |
| 3 | C, tone | `$034D90` | 166 (26 rests) | volume 1 or 5, pitch 1, 2 or 5 | 27, E3 to A6 |

All three voices loop after exactly **3328 VBLs**, 66.5 s at 50.05 Hz. Voice 2 is a
bass line and voice 3 a melody. Their written periods all land within 12 cents of equal
temperament at A = 440 Hz.

**Two voices read the ROM.** A voice that has not picked a table walks from address 0,
and on an ST the first bytes there are the TOS ROM's header (`60 2E 02 06` in this
EmuTOS). The walk's first pair is then (`$60`, `$2E`): 96 VBLs of `$2E`.

- **Voice 1 never picks either table.** Its level is `$2E`, which the 5-bit amplitude
  register holds as `$0E` (bit 4 clear, so not the envelope), a fixed level 14. Its
  period is not written anywhere: `$03432E` writes the noise period from the byte at
  `$000001`, which is the same `$2E`, so noise period 14 (8.9 kHz). So voice 1 is a
  hi-hat: level-14 noise on channel A, 4 VBLs every 32, at a pitch set by the ROM.
- **Voice 2 picks volume 1 at once but no pitch table until its 417th note**, 8 VBLs
  before its loop ends. Until then every period is the written one plus `$2E`, so the
  first pass of the bass line is flat, by 42 cents at D2 and 115 at G3. The table then
  stays set, so every later pass, and every restart, is in tune.

Both depend on the ROM's second byte, which is a branch offset, and that is not the same
in every TOS. With a different byte the hi-hat's level and pitch and the first pass's
detuning would differ; a byte with bit 4 set would put channel A under an envelope
nothing starts. Only this EmuTOS was heard.

## Heard in the Working Authority

`sound-programme-probe.py record` boots a memstate with sound on at 48 kHz (`--ym-mixing
model`), pokes `$FFFF820A` ← `$02` (160256 cycles a field, 50.05 Hz, confirmed at the
start and end of every run), and arms a non-stopping `:trace` breakpoint on the entry
of every programme above except the per-VBL steps. So each run names which
programmes ran, and on which step. The probe reads a VBL counter at every step, which
places each step on the recording's own clock. The analysis frames the mono WAV on
that 50.05 Hz grid.

| Case | Memstate | What was done | Traced | Heard |
| --- | --- | --- | --- | --- |
| `boot` | none (cold boot) | nothing until New Game; Space at 75 s | reset, restore, drone start at 63.5 s; drone end, restore; 20 message ends | silence (≤ −95.5 dB, 1 LSB) to 63.497 s; the drone from 122 Hz falling to 58.6 Hz by 80 s at −25 to −29 dB; then the idle engine at 7828 Hz, −13.6 dB (level 15), stepping down to −43 dB over 85 s; message tones near 900 Hz |
| `limo` | `boarded-limo` | speed key 4; fire; Help; Space | shared effect, bump, shot, shared effect, message ends | the click at 1305 Hz; the idle engine at 7828 Hz, −45.8 dB, for 6.4 s while the limo drives; the bump at 31.4 Hz from −15.1 dB falling 31 dB/s, 1.6 s, when it hits the building, and the engine stops; the shot, 24 VBLs of noise at −104 dB/s; Help's click and 0.4 s of message tones at 760–900 Hz |
| `transporter` | `rehosted/eris-transporter-11-8` | stick forward into the cube | transporter, then thud | 13 VBLs of 460–490 Hz alternating with 5–8 kHz, −13.4 dB falling 48 dB/s; then the thud as the player walks into the arrival cube, which cuts it |
| `lift-wall` | `rehosted/eris-lift` | stick forward, then back | door tone, thud, burst, restore; again; thud | the car door's sounds, then a thud alone: 12 VBLs of noise at −196 dB/s |
| `hazard` | `eris-spaceport-onfoot` | *intervention:* `$7A7C` ← 4, `$7A64` ← 2 | alarm, message end, channel C off, message ends | 61.2 Hz for 504 VBLs (10.07 s), level-15 peaks every 16 VBLs, under the TOO COLD message's tones; then silence, and the death messages' tones |
| `geiger` | `eris-spaceport-onfoot` | *intervention:* GEIGER COUNTER carried and on; NOVABOMB moved to 64, 2048 and 32768 units | 625, 304 and 248 clicks in 8.4, 8.4 and 10.3 s | 2611 Hz clicks at −19.6 dB: 75, 36 and 24 a second, against rates 3, 9 and 17 |
| `explosive-dropped` | `eris-spaceport-onfoot` | *intervention:* slot 75 armed, deadline 3 s | blast | noise at 5.16 s, −10.9 dB, falling 24 dB/s for 2.0 s; the player lives |
| `explosive-carried` | `eris-spaceport-onfoot` | *intervention:* the same, carried | blast, blown up, message ends | noise from −10.9 dB falling 11 dB/s over 4 s; OOPS! - YOU'VE BLOWN YOURSELF UP's tones |
| `arm-b` | `eris-spaceport-onfoot` | *intervention:* nine programmes written into `$04BF54` in turn | each, once | see below |
| `music-after-thud` | `eris-spaceport-onfoot` | *intervention:* the thud armed, then the music | thud, music start | the same hits after a shape-9 envelope has decayed to 0, as a fixed level predicts |
| `music` | `eris-spaceport-onfoot` | *intervention:* GHETTOBLASTER carried, `$7A62` ← `$FFFF`; 72 s later ← 0 | music start; music stop at the switch-off (and once inside the start) | from 2.46 s, bass and melody at −11 dB; level-14 noise hits of 4 VBLs every 32 VBLs, 7 % of the power above 4 kHz against under 1 % between them; the first pass's bass 42 to 115 cents flat, as predicted (D2 71.7 Hz against 71.5; G3 182.2 against 181.7), the second pass within 6 cents (Hatari clocks the YM at 2.0053 MHz, +4.6 cents); the loop repeating 66.49 s (3328 VBLs) later; silence from the switch-off |

The programmes armed directly, each 6 s apart:

| Programme | Heard | Decoded |
| --- | --- | --- |
| Spell | 203 VBLs to the −60 dB floor, peak near 311 Hz, −12.1 dB/s | 410/1302/312/651/252 Hz, 4.20 s |
| Splash | 41 VBLs of noise, −59.8 dB/s | noise, 0.85 s |
| Transporter | 49 VBLs, peak 439 Hz, −48.4 dB/s | 446–488 Hz and higher, 1.05 s |
| Bump | 74 VBLs, 31.3 Hz, −32.0 dB/s | 30.6–32.0 Hz, 1.58 s |
| Blast | 101 VBLs of noise, −24.2 dB/s | 2.10 s |
| Shot | 24 VBLs of noise, −103.4 dB/s | 0.49 s |
| Thud | 12 VBLs of noise, −194.9 dB/s | 0.26 s |
| Zap | 95 VBLs, peak 10444 Hz, −24.2 dB/s | 10417 Hz tone and noise, 2.10 s |
| Blown up | 226 VBLs of noise, −10.8 dB/s | 4.69 s |

Every measured decay is 1.09 times the datasheet's 32 steps of 1.5 dB over the envelope
period. That is the 3.2 dB a level #508 heard from Hatari's `model` volume table, not a
property of the program. The segment lengths are the time each took to fall to the
analysis floor.

**Not attributed.** The `limo` and `hazard` recordings also hold a few one- to four-VBL
sounds at −48 to −57 dB with no traced programme beside them. They come after the return
from the pause menu and around a death. They are recorded here and not explained.

**Limits.** As for #508: this is Hatari 2.6.1's model of an STF, its low-pass runs at
the wrong rate ([limits](damocles-lift-ride.md#heard-in-the-working-authority)), and a
mixed WAV does not say which channel played what. The traces and the decode do.

## What was not reached

The events below were not reached in play. Their programmes were armed directly and
heard (the `arm-b` case), which confirms the decode but not the event or its timing.

- **The BOOK and the MAGIC CRYSTAL** (spell, index 8's bump). No capture carries both.
- **A craft reaching the ground**, over sea (splash) or land (blast). No capture flies
  a craft that can sink; which crafts' routines reach `$057D64` was not settled.
- **The attack ship**: its shot (thud), its hit (zap), and ENEMY SHIP DESTROYED (shot).
  They need the TOLOSA encounter.
- **Too close to a blast** (`$04CBB6`). The explosive at slot 75 was far enough away,
  and the NOVABOMB switch route was not tried.
- **The spell's guards and triggers** (what each BOOK index does to play) are named from
  the listing only.

Reached only by intervention: the hazard alarm and its end (from a pending warning, not a
drop), the Geiger counter (the NOVABOMB moved to the player), the explosives (armed by
poke, not by keypad), and the music (the carried bit and switch written, not taken and
switched). In each, the program's own path ran from the poked state onward.

## Corrections to earlier notes

- [The lift ride's sound](damocles-lift-ride.md#what-the-programmes-play) called
  `$0004C6B2` "the periodic timer tick" and tied it to the timer path. It is the GEIGER
  COUNTER's click, and `$7A78` is what stops a click from cutting channel B's programme.
- The same note left the rest of the bank and `$033F68`'s alternate path unread. They are
  above: the path is the music player.
- [The message reveal](damocles-message-reveal.md) left open what raises `$7B96` and what
  the `$7856` = `$83` / `$7126` test decides. A readable object's page selection raises it
  (`$04D788`), and the test is the BOOK (slot `$83`) with the MAGIC CRYSTAL carried: the
  deferred path is the BOOK's page action.
- The idle engine `$04C250` is not lift-specific and not always silent. It sounds whenever
  a craft moves at speed 1 or more, and the `limo` and `boot` runs heard it.

## Runs

```sh
research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py decode
research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py record --roms roms --case <case>
research/damocles-st/.venv/bin/python research/damocles-st/scripts/sound-programme-probe.py analyse <mono.wav>
```

| Case | Run | Mono WAV SHA-256 |
| --- | --- | --- |
| `boot` | `sound-boot-20260925T105803Z-88ed8445` | `e7566d168e62a0f053ebe7b98c8403f089626be1b7ad9abcd143e3fb1f66f8d7` |
| `limo` | `sound-limo-20260925T111232Z-f0e91c15` | `d9774f2b140863ecb883536e067c40bd332706bdc75b9820189b47c5a09e1906` |
| `transporter` | `sound-transporter-20260925T105804Z-9c0035b4` | `266e7c74588450acdab7238806b9617942a1c25097b6162e2ec8a3d80c11a6c2` |
| `lift-wall` | `sound-lift-wall-20260925T105859Z-76d6f546` | `cb4e3aef917b819d10ad0d9594d75cba70a1ff696ecc02477fbb675e3da3c99f` |
| `hazard` | `sound-hazard-20260925T110119Z-833bf04a` | `878a8d6786ba537ff76f44efba0ad655fdb44c6527a9f8a50b384ed28dc3edc9` |
| `geiger` | `sound-geiger-20260925T110155Z-9810b7a7` | `c17f86408c480a2aed5ce42314f8d39b756d8d21f51a2687c6562c7615901d62` |
| `explosive-dropped` | `sound-explosive-dropped-20260925T110238Z-8b90afd9` | `de18b463c56b8e2aef62e29ca6d15be0cce254d1d1b7c48902857bc76621879b` |
| `explosive-carried` | `sound-explosive-carried-20260925T110318Z-454fc06d` | `157a9d702ff07dc52ed6d74686a6fb5bd2238559ea8047f9161dabd765b091ac` |
| `arm-b` | `sound-arm-b-20260925T110358Z-e4c48acf` | `b56fcb79cf68ab7f349c7e0cc0c4ba593ed67514fd3b14d84d65a63ba0f35ee2` |
| `music` | `sound-music-20260925T110525Z-f00f6c16` | `239abcc3ff91de4e7637dbcbaa6ca7669e8c80a022dc2197b7f5f8cd082862d6` |
| `music-after-thud` | `sound-music-after-thud-20260925T111032Z-bb6bd48e` | `46670719c210a709be32c5274ecaa9d439a4e16cce00f990e63bfa9b7fbc1a78` |

The cases' memstates are the tracked `boarded-limo.sav` and `eris-spaceport-onfoot.sav`
and the rehosted `eris-transporter-11-8.sav` and `eris-lift.sav`. The run directories
and WAVs are ignored Restricted Material.

**Harness notes (Hatari 2.6.1).** A `:trace` breakpoint prints
`N. CPU breakpoint condition(s) matched K times.` and continues, and 22 of them can be
armed at once over the FIFO. Hatari stops reading the command FIFO if it is left stopped
with nothing queued. So a read and a write that depend on each other must be two
round trips (stop, `savebin`, continue; then stop, `w`, continue), not one stop held open.

## Follow-ups

Presentation, in the port, of what its sessions can reach now:

- [#521](https://github.com/odogono/mercenary/issues/521): the wall thud, on the rising
  edge of a clamped on-foot step.
- [#522](https://github.com/odogono/mercenary/issues/522): the message tone, per VBL of a
  message's scroll-in.

The sound board (`/sounds`) plays every programme above through the port's own driver,
and the tune from `payload/damocles/music.json`, which `damocleslab.music` extracts. Rendered
offline, the port's programmes run within 3 VBLs of the `arm-b` recording at the same
pitches. They decay about 5 % more slowly, which is the port's datasheet ladder against
Hatari's volume table.

The rest have no session behaviour to attach to yet: craft motion (engine, bump,
grounding), shots and the attack ship, transporters, hazards, explosives, the Geiger
counter, the BOOK, and the GHETTOBLASTER's music. Each should be presented with the
behaviour that reaches it.
