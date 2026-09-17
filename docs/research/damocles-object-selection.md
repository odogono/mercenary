# Damocles object selection and the take range gate

Working-Authority Evidence for [#303](https://github.com/odogono/mercenary/issues/303), recovered 2026-09-17. The two words the take handler tests before it does anything are both written by the **scene pass that draws objects**, once per object, as a running minimum: `$7B46` is the slot of the **nearest object the pass has drawn so far**, and `$7B42` is the **binary exponent of that object's distance from the eye**. The handler's `≤ 8` is therefore a distance test, and the distance it admits is **under 512 source coordinate units** — 1/128 of the surface-grid unit the Catalogue's positions are already expressed in.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not translation of the Working Authority into application code. Original captures, RAM, native listings and game text remain ignored Restricted Material under `research/damocles-st/work/`, consistent with the [research boundary](damocles-gap.md); only decoded facts and hashes are recorded here.

## What was already established

[The pickup note](damocles-limo-key-pickup.md) closed the take handler's writes and the script it launches, and left exactly this open: it recorded `$7B42 ≤ 8` as "the live selection's range/priority measure" with no units, `$7B46` as the resident slot number × 4, and the per-object association bit at `$6FAA` + slot × 4 as untested. [The resident-object note](damocles-resident-objects.md) established the four-byte-per-slot arrays: X at `$63A8`, Y at `$67A8`, Z at `$6BA8`, Association A at `$6FA8` and Association B at `$73A8`. This note adds how the selection is computed, in what units, from which candidates, and what the association byte carries.

## Evidence and method

Static recovery reads bounded windows of the pinned first-world capture `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` (SHA-256 `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967`) with Capstone's M68K 68000 big-endian decoder.

Runtime evidence comes from the tracked [object selection probe](../../research/damocles-st/scripts/object-selection-probe.py), which replays the tracked [pickup route](../../research/damocles-st/scenarios/limo-key-pickup-route.json) from `snapshots/eris-spaceport-onfoot.sav` and, for the aboard case, `snapshots/boarded-limo.sav`. Samples are `savebin` windows taken while the emulator is stopped; **nothing is written into the guest**, so these are ordinary gameplay observations. Every sample also carries a `derived` block — the straight-line distance from the sampled eye position to every resident slot, ranked — which is arithmetic over that same sample's numbers, not a second observation.

```sh
research/damocles-st/lab doctor --roms /path/to/roms
python3 research/damocles-st/scripts/object-selection-probe.py --roms /path/to/roms --case approach
python3 research/damocles-st/scripts/object-selection-probe.py --roms /path/to/roms \
  --case boundary --take-at 28.2 --take-at 29.5
python3 research/damocles-st/scripts/object-selection-probe.py --roms /path/to/roms --case aboard
```

## The writers

Neither word is written by the take handler or by anything the input path calls. Both are written by the scene pass, and both are reset at the top of it.

| Address | Operation |
|---|---|
| `$0531FC` | `move.w #$7FFF,$7B42` — the surface scene's reset, before the candidate list is assembled. Only the high word is written; the mantissa below it is left stale. |
| `$05A73E` | The interior scene's identical reset. |
| `$0535D8` | `move.l d1,$7B42` — the candidate's distance, admitted only when it is not greater than what `$7B42` already holds. |
| `$0535DC` | `move.l a0,$7B46` — the same candidate's slot × 4, written in the same branch. |
| `$0535C2` | `move.l a0,$7B3E` — the slot × 4 of the object about to be drawn, written unconditionally. This is the per-object scratch, not the selection. |

`$0535A2` is the per-object draw preamble. It is entered once per queued object from the two draw walks — `$053088` for the surface queue and `$0533CA` for the queue the interior and surface scene passes share — with `d0` holding the slot in its low word and `d1` the object's queue key. It masks the key with `$7FFFFF`, compares it with `$7B42` as a long, and on `≤` stores both words. Slot × 4 of `$128` — **slot 74** — is excluded by an explicit comparison at `$0535D2` and can never be selected.

The reset value `$7FFF` is not a distance. It is a high word larger than any real candidate's, so the first object drawn always wins and a scene with no objects leaves `$7B42` at 32767 with a stale `$7B46`. A sample taken at that instant reads 32767; two of the runs below caught one.

## The measure is a distance, in a native float

The queue key is built at `$053236..$05333B`, once per candidate, from the resident arrays and the eye position at `$7A92`/`$7A30`/`$7A9A`:

1. Each of `Δx`, `Δy`, `Δz` is converted by `$04BDD4`/`$04BDD8` into the program's own floating representation: **high word the binary exponent, low word the mantissa scaled so that `4096 ≤ mantissa < 8192`**, a sign carried by negating the mantissa, and zero represented as `$FFF01000`. A value `v` is therefore `mantissa × 2^(exponent − 12)`, which makes the exponent exactly `floor(log2 |v|)`.
2. Each is squared by doubling the log-domain word through the log table at `$064000` and the antilog table at `$060000`.
3. The three squares are summed by the float add at `$04BD34`, which aligns exponents, adds mantissas and renormalises.
4. The sum's log is halved and taken back through the antilog, giving the square root.

So the key is `sqrt(Δx² + Δy² + Δz² )` in the same units as the resident arrays, and **`$7B42` is that distance's exponent while `$7B44` is its mantissa**. The take handler's `cmpi.w #$8,$7B42` at `$0541F0` reads the exponent alone, so it admits every distance whose exponent is 8 or less: **distance < 2⁹ = 512 units**. The Catalogue divides the same arrays by 65536 to report positions, so the gate is **1/128 of one surface-grid unit**.

The draw-order priority the pass adds at `$053328` — a byte from the table at `$05333C` shifted into the key's top byte — is removed again by the `$7FFFFF` mask, so it orders drawing without affecting selection. The one bump that survives the mask, `+$400000` at `$053316`, is reached only for slot 0, which the take handler refuses anyway.

## What the candidates are

Two lists feed the pass, and the selection is the minimum over their union:

- **Surface residents of the current body.** `$052C9C` scans resident slots 255 down to 0 and keeps every slot whose Association B high word equals the current body selector `$7AA8` shifted left eight — that is, surface-associated residents of the body the player is on. The list is bytes at `$7D19`, counted in `$7B4E`, with slot `$1D` prepended when `$7A06` is nonzero.
- **The objects the interior renderer collected for the room**, bytes at `$B21C`, assembled at `$0531C2` from the room's own draw list. In the Capital Spaceport room this list is exactly `[183]`.

A resident in neither list is never a candidate, however close it is. In the observed room the resident list was `[178, 92, 7, 5, 4, 3, 1]` and the room list `[183]`, and no other slot was ever selected even when the arrays placed one nearer.

The queue is sorted by key **descending** before it is walked, so objects are drawn far to near and `$7B42` falls monotonically through one pass. Ties keep the later entry, because the store is on `≤` rather than `<`.

## Observed at runtime

Every sample agrees with the model on the object its words actually name: the measure is the exponent of that object's distance from the eye, and `$7B44` its mantissa. Distances are computed from the sample's own eye position and resident arrays; the mantissa column is `distance / 2^exponent × 4096` against the sampled `$7B44`.

| Route time | Selected | Distance | Exponent / `$7B42` | Mantissa / `$7B44` |
|---:|---:|---:|---:|---:|
| 24.0 s | 183 | 1745.3 | 10 / 10 | 6981 / 6980 |
| 27.6 s | 183 | 1099.6 | 10 / 10 | 4398 / 4398 |
| 28.2 s | 183 | 912.6 | 9 / 9 | 7301 / 7300 |
| 29.2 s | 183 | 515.3 | 9 / 9 | 4122 / 4122 |
| 6.0 s | 183 | 7237.5 | 12 / 12 | 7238 / 7238 |
| 30.0 s (second run) | 7 | 8047.6 | 12 / 12 | 8048 / 8046 |

The residual of one or two mantissa units is the log tables' own granularity: their index is masked to `$1FFE`, so the mantissa is always even. Larger residuals appear only in samples taken while the player was walking, where the eye has moved on by a frame or two between the pass that wrote the words and the stop that read them; one such sample implies a 59-unit move, about 1.2 frames at the [48 units per walking frame](damocles-walk-board-flight.md) the walk probe measured.

Samples taken mid-pass read a partial minimum rather than the frame's answer, and they confirm the order the pass works in. At 6.0 s the words held slot 183 at exponent 12 while slots 5 and 7 were nearer; the descending sort puts 183 ahead of both. At 20.0 s they held slot 3 at exponent 17, the third-farthest of six candidates. One sample read `$7B42` = 32767, between the reset and the first candidate.

### The gate, at the press

Nine `boundary` runs walked the same route and pressed take once. The distance column is the nearest listed candidate at the press; the outcome is whether the carried count moved.

| Take at | Nearest candidate | Distance | Exponent | Outcome |
|---:|---:|---:|---:|---|
| 28.70 s | 183 | 123.1 | 6 | taken |
| 28.90 s | 183 | 203.4 | 7 | taken |
| 32.74 s | 183 | 245.8 | 7 | taken |
| 28.40 s | 183 | 263.3 | 8 | taken |
| 28.20 s | 183 | 281.4 | 8 | taken |
| 27.40 s | 183 | 521.4 | 9 | refused, silently |
| 32.74 s | 183 | 1002.5 | 9 | refused, silently |
| 28.55 s | 183 | 1062.2 | 10 | refused, silently |
| 29.50 s | 183 | 1134.1 | 10 | refused, silently |

Every take succeeded at exponent 8 or less and every refusal was at 9 or more, and the two runs either side of the boundary bracket it at 281.4 and 521.4 units — an interval containing only 512. The refusals changed nothing at all: no message, no sound, no counter, the trigger byte still armed.

### Aboard

The `aboard` case boots the boarded-limo snapshot and samples the same words while the player occupies a craft. They are written the same way, from the same eye position, and matched the same model: slot 7 at 6236.8 units, exponent 12, mantissa 6237 against a sampled 6234. Nothing in the selection distinguishes the two cases, and the take handler itself tests the on-foot flag `$7A8E` only *after* a successful take, to decide whether to rebuild the room's render queue. No in-range takeable object was reachable in that snapshot, so whether a take aboard completes is recorded here as untested rather than as a difference.

## The association byte

`$6FAA` + slot × 4 — Association A byte 2 — is the only per-object input to takeability. The take handler reads it once into `d1` at `$05421A` and tests two bits; the drop handler reads the same byte for two objects and compares their low nibbles.

| Bits | Role | Evidence |
|---|---|---|
| 0–1 | One object's own rank | `$0545C2` masks one of the two bytes with `$03` |
| 2–3 | The rank the other object demands | `$0545B6` masks the other byte with `$0C`; `$0545CE` refuses the drop when the first, scaled by four, is below it. Which byte belongs to the dropped object is not established here |
| 4 | Not takeable. The handler returns with no message and no sound | `$05421E` |
| 5 | Takeable only through a refusal: diverts to the system-string helper with index `$02` | `$054238`, `$0542DA` |
| 6 | Not set on any slot in the pinned capture | — |
| 7 | Carried. Set by the take path and cleared by the drop path | `$0542A8`, `$054680` |

Across the 241 resident slots that have a model, the byte takes twelve values, and they sort the census cleanly:

| Value | Count | What carries it |
|---:|---:|---|
| `$04`, `$05` | 76, 85 | The ordinary takeable objects — keys, lamps, kegs, the DAMOCLES FILE, `KEY- V.I.P. LIMO` |
| `$00`, `$08`–`$0F` | 4, 45 | Furniture: benches, chairs, settees, beds, tables, desks. All takeable; bits 2–3 rise with how substantial the piece is |
| `$10` | 10 | Not takeable, silently: slots 74, 156 and 248–255, none of which has a source label. Slots 0, 9 and 29 carry it too and have no model |
| `$20` | 21 | Every craft, including the V.I.P. LIMO in slot 5, and the three TRANSPORTERs. These refuse with a message |

Four tests at `$054214`–`$054236` bypass the bit 4 and bit 5 refusals entirely when slot 157, slot 158 or slot 0 has bit 7 set — that is, **while an ANTIGRAV is carried**. Slots 157 and 158 are the two ANTIGRAV residents. This is read from the handler and was not reproduced at runtime.

## The carried coordinates

The pickup note left the values written into a held object's X, Z and Association B unresolved. They are written by `$052D42`, which the scene rebuild at `$052CDC` calls first, every time: for each entry of the carried list at `$61CE` it stores X `$81D5`, Z `$1831C`, a Y that starts at zero and steps by `$12C` per carried item, Association B `$78010010` stepping by `$100`, and `$31` into Association A byte 1. Carried objects are therefore parked on a fixed column of their own, which is why the sampled values after a pickup did not come from the take handler. The `$10` in Association B's cell byte is what keeps a carried object out of every cell's candidate list.

## Confirmed, derived and unresolved

**Confirmed** (static recovery plus reproduced runtime observation): the writers and their reset; that the measure is the distance from the eye to the selected object and the selected object is the nearest one drawn; the float representation and that `$7B42` is its exponent and `$7B44` its mantissa, matched to within the log tables' granularity in every settled sample across two independent approach runs; the `≤ 8` gate as distance under 512 units, bracketed at runtime between 281.4 and 521.4; that a refusal is silent and changes nothing; the two candidate lists and their contents in the observed room; the far-to-near draw order, from mid-pass samples; that the aboard case computes the selection identically; the association byte's census.

**Derived from instructions, not reproduced at runtime**: the exclusion of slot 74; the ANTIGRAV bypass; the drop handler's rank comparison; the bit-5 refusal message index; that a resident outside both candidate lists can never be selected, which no observed geometry put to the test.

**Unresolved**: what slot 74 is, and why it alone is excluded; the meaning of the draw-order priority table at `$05333C` and of the `$7A3A` index into it; the bump at `$053310` and the `$6FAB` class value 4 that reaches it; the constant triple at `$799A`/`$799E`/`$79A2` that the surface queue pass at `$052EF6` subtracts instead of the eye, which held `(−630000, 64, 390000)` in every sample and produces keys around exponent 23 that can never win; whether a take completes while aboard; and bit 6 of the association byte, which nothing in the census sets.

## Recommendation for the Gameplay Session

The rule is small enough to state in the session's own terms, and [the interaction contract](../design/damocles-limo-key-interaction.md)'s `Selection` seam is the right shape for it. Per frame, over the instances the session is drawing in the player's current Location:

1. Compute the straight-line distance from the eye to each drawn instance's position, in payload surface-grid units.
2. Select the nearest. With no drawn instance, select none. On a tie, prefer the later one in draw order, which is what the original's `≤` does.
3. Report `inRange` when that distance is **below 1/128 of a surface-grid unit** (512 source units, 0.0078125). Nothing else about the measure is needed: the exponent is an artefact of the original's arithmetic, and a session comparing real distances reproduces every observed outcome, including the boundary.
4. Take only when the selected instance's payload `handling.takeable` is true; `handling.refusal` distinguishes the silent refusal from the message one. Refusing out of range must stay silent — no message, no sound, no state change — because that is what the original does and it is observable.

The ANTIGRAV bypass is real but out of this slice: the limo key needs no bypass, and no ANTIGRAV is reachable in it.

The payload carries the per-instance half of this. `payload/damocles/catalogue.json` schema 12 gives every resident-slot instance a `handling` record — the raw `byte`, `takeable`, `refusal`, the two ranks and the capture-time `carried` flag — and null for every instance that is not a resident slot. Which instances carry it: all 241 resident slots with a model, and no others.

## Evidence identities

All hashes are SHA-256. Laboratory machine: ST, 1 MiB; program and TOS images are checked against [`working-authority.json`](../../research/damocles-st/config/working-authority.json).

| Input | Hash |
|---|---|
| Working Authority STX | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| `eris-spaceport-onfoot.sav` | `6cee57c4d4a168792fc3974e786d706fe9f42cf577d6e8b7c63814c93d6398c6` |
| `boarded-limo.sav` | `bbcc82de0d5da96ad6db4b8b67b9165122b65b8d7a54c7e7fb78fba02bfbbab4` |
| Tracked route | `b03c447a85b59ec9ce0bec73f0a035e032c8a46b1e7aa62ff22a5148c8951b0d` |
| Tracked probe | `d8844ce70012e6be83b23afe3a58d9675ee5f108c0cb703c350a7bf7b8e60164` |

Source ranges read for this note, hashed in the pinned first-world capture and re-checked byte-identical in the runtime captures of all eleven runs below:

| Range | Hash |
|---|---|
| Candidate list builder `$052C9C`–`$052CDB` | `1668c22282110f270f27986e8deba9d90aa85783b905bd9d584f23c034e006ec` |
| Carried-object placement `$052D42`–`$052DAF` | `493ad19f5af9048687d40fb12599d584f626707dec37d90c4c7e44a3ac413a59` |
| Surface queue pass `$052EF6`–`$052FBB` | `4759b73489e71d25db74cff539e587b6502bf3c6bd7f1a576bc3d703ec4b1d8c` |
| Surface sort and draw walk `$052FF0`–`$053097` | `cc07ed9630cf5969574e2c8de5c955fe93e43c3dc7ffb1af23a366ca82f4b4af` |
| Scene reset `$0531F8`–`$053235` | `417cbb84a2926e9a91f86ff569582b90ba0db9a97275adea2c4fa77f431be72b` |
| Distance and queue pass `$053236`–`$05333B` | `067d6fef87e9b04df3ee0d880dd6bc423782a56c1b0fb60d911157f3d43a8fce` |
| Draw-order priority table `$05333C`–`$05338D` | `e896184784d51f4a66127903cacbc2569d53692584468a59343a0ff904e4303e` |
| Sort and draw walk `$05338E`–`$0533D3` | `a3ffc1de1a13f6308f6a9921d0620f93c8d688fd984caef6fc1e6beafd25802e` |
| Per-object selection update `$0535A2`–`$0535DF` | `38683f937a8c83b6351b8ebdd7fa1af5337a9c2d320c48820b467daa55b92ff4` |
| Take handler gates `$0541F0`–`$054243` | `e37b52d3b371d3552c49e2be846757f66022c84c6f90c0ad4f167f2337005220` |
| Drop rank comparison `$0545AC`–`$0545D3` | `99290c827743735b67d38f0e3ddbcc08f0c9d4993eb821c777fd64a15a4a4e70` |
| Float add `$04BD34`–`$04BDC5` | `ba20c23552833799f307c4e57a152e529a9c648bac9d4c78213b41056d49be34` |
| Float normaliser `$04BDC6`–`$04BEE1` | `a4245d1db165093ead8891d0a3f7dcee14c42d63f6bbc2b281cb3ff449512d58` |
| Interior scene reset `$05A730`–`$05A745` | `0d80f2a914b0c09bbb2963bbc8ddda388b334e8ef1cad5141e51f866ba0d0332` |

Runs under `research/damocles-st/work/`. Hatari 2.6.1 (binary `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a`), Python 3.13.15. Each run's `result.json` records the case, the take time, every sample's decoded state and derived ranking, the window hashes and the toolchain.

| Run | `result.json` hash |
|---|---|
| `object-selection-approach-20260917T064547Z-6571c9c4` | `7a65bdd021db61e533e699c4f61a15b88ba70c554b7ca7a0c8522ba6b31187b1` |
| `object-selection-approach-20260917T065751Z-0f3964a5` | `240f9108deb5c74a6a0062bf2265e8ee7f91dda0bfeed29746686a763d9b11db` |
| `object-selection-boundary-20260917T064714Z-6a6731d5` | `93001ec4c289457bb72c645d8fe3fb98a87217df8e7bf19c71517ca748e7aa48` |
| `object-selection-boundary-20260917T064812Z-7d157572` | `1ff327f3edfa8ed80a76b05e0bce4abeb75eab04752ef88dbe6a7b02822dd960` |
| `object-selection-boundary-20260917T065047Z-76c69757` | `1d88452fb7c14228f7025ca320b25cf0a0bee0bdfed61911c53f3b6a6d7f1350` |
| `object-selection-boundary-20260917T065203Z-20861990` | `2e246df39e8764264d8e38dc82bb21223d6bdeb9aff98414ff73b46c8785ba21` |
| `object-selection-boundary-20260917T065302Z-8bf586c5` | `46b3aa749dbf04d35f9f5f20547b9a98136cf995dda88717cfd18e19f70284e0` |
| `object-selection-boundary-20260917T065401Z-30cf4bb4` | `2cd6b97e5f9bc73936e2780abd0410a37b7b7ad0b01a107f7a0fb339ddb06d87` |
| `object-selection-boundary-20260917T065513Z-fea04c8c` | `73673d39bed423ca37d254c4f6f9d20072a5b07aa792f590b7a966af314089bb` |
| `object-selection-boundary-20260917T065612Z-aeb51427` | `13758d46db1cc64da5d0c3a110c1c4a70a7c5bf76225850907805806bbbd731e` |
| `object-selection-boundary-20260917T065834Z-1c64af4c` | `a7573f262ea8e923eebb62909a4549802f812dad2dfe515033334b0bf9832706` |
| `object-selection-aboard-20260917T065711Z-422607f2` | `0c3cd64223025ffa2b76c5494482d25668e7a9e2e82dc61c3c78e543d5d413a0` |

One further run, `object-selection-boundary-20260917T064911Z-949f015d`, is kept and not used: its emulator did not produce the sample windows, so it has no decoded state. An earlier revision of the probe produced `object-selection-approach-20260917T064239Z-44a1b1b9`, whose decode block differs from the tracked one; its samples agree with the two approach runs above and it is not quoted here.

### Claim boundary

These are ordinary gameplay observations of the original program running in Hatari, sampled while the emulator is stopped. They do not establish frame-exact input timing: the walk route ends at a slightly different position on every run, which is what spreads the boundary runs across the range rather than a controlled distance being dialled in. The distances in the derived blocks are computed from the sampled arrays, not read from the machine; the machine's own answer is the exponent and mantissa pair, and that is what they are checked against. Nothing here is a whole-game equivalence claim.
