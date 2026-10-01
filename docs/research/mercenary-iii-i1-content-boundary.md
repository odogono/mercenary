# Mercenary III: the I1 content boundary and what it recovered

Implementation and research for [#647](https://github.com/odogono/mercenary/issues/647) (I1), 2026-10-01, under the [D1 review](mercenary-iii-taxi-milestone-review.md). The authority is the pinned **Mercenary III research baseline** of R1–R4 (STX `4e8b7412…b62c`, EmuTOS `154803e3…d5`, Hatari 2.6.1 `05723606…11a`). Every fact below was read from Mercenary III's own readers in fresh cold boots. Following [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md), RAM, screenshots, logs and disassembly stay ignored Restricted Material under `restricted/mercenary-iii-647/`. The decoders are in [`research/mercenary-iii-st/`](../../research/mercenary-iii-st/README.md), and the app reads only the data they export.

## What I1 admits

- **`/dion`** is a Title path with slug `dion` and a document of its own. The Browser Shell boots it with the System Menu, save chooser and key router. Its Gameplay Session is a sibling of Targ's and Damocles's ([ADR 0043](../adr/0043-admit-damocles-play-alongside-the-second-city.md)). `TitleRuntime` gains one type parameter, the panel view model, and the chrome's catalogue link becomes optional. Nothing else in the shell changed.
- **Content.** Six documents in `payload/dion/` (world, panel, messages, scripts, sound, service), plus one authored document, [`web/dion/metis.json`](../../web/dion/metis.json). Each payload document names Title `dion`, the pinned program image, schema 1 and its capture run. The loader refuses a document of another Title, another program image, another schema or another run. It also refuses a malformed record and names the path where it failed.
- **Coverage.** `metis.json` lists every required item of R2 and its successors. Each is either recovered, with a pointer the loader resolves into the payload, or a gap or waiver with the slice and ticket it gates. A gap that gates I1 refuses the Destination. None remains. The I2 gaps are listed [below](#gaps).
- **Identity and storage, reserved.** Saves and the Session Resume live under `mercenary.browser-shell.dion.*`. A record names Title `dion`, Destination `metis`, the program SHA-256 and the content SHA-256. The MIII decoder refuses Damocles and Targ records as foreign, and those Titles' decoders refuse MIII records. No snapshot schema is admitted until I2 ([#648](https://github.com/odogono/mercenary/issues/648)).
- **Session.** The session starts as a fresh game in the prison cell. Game time runs at fifty ticks a second with one frame every eleven ticks ([ADR 0058](../adr/0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md)), along with the elapsed clock's VBL rule, the frame counter and the animated sign's frame rule. The opening script, the door mover, the TAXICARD and the taxi service are I2's. Nothing in I1 claims the journeys are playable.
- **Walking.** On foot, the player walks by the shared foot step and region clamp that Damocles uses ([below](#on-foot-movement-shared-with-damocles)). The prison door stays shut until the opening script hands over DOOR KEY A, which is I2's work. Until then the eye is held on the room's edge at z −840, where #645 observed the keyless player.
- **Rendering.** An indexed 320×200 screen draws the view by the recovered projection, clip, cull and paint order, and the panel by its writers' plane rules.

## Capture points

| Image | How | State |
|---|---|---|
| `entry.ram` | First hit of PC `$6AC32` after VBL 3990 | The loader has just put DAM6, the panel artwork, at `$6D500`; no readout is drawn yet |
| `start.ram` | First main-loop top `$5A41A` after VBL 4770 | Fresh game: prison cell `$62` bound, region 1, door `$4200` shut, DOOR KEY A not held, script `$19` at `$6FF57`, clock 0, accumulator 672 |
| `v6000.ram` | VBL 6000 | Loaded play; the static records are decoded from here |

The world's residents and the session's opening come from `start.ram`. R3's `B0` (VBL 6004) stays the reference for trajectories. `start.ram` comes earlier, at the point where a New Game begins.

## Facts recovered beyond R2, #643, #644 and #645

| Fact | Reader | Note |
|---|---|---|
| Cell record: key byte, nine-bit slot, dx, dz. Structure origin = (dx, dz) × the word at `$4BD14` (30) + `$8000` | `$5600C..$560DE` | `$4BD14` is the spacing word itself, not a pointer |
| Alias record: scale at +2/+3, palette at +4, detail at +5, target at +6. A direct record keeps scale, palette and detail in the eight bytes before it | `$560F0..$5617E` | |
| Plan walls: forms 3–6 carry four references, and a mirrored scale reads each pair reversed | `$5ADB4..$5AE4E` | Forms: 0/1/2 rise to height/lower/third, 3/4/5/6 lie flat at third/0/lower/height, 7 spans lower to height |
| Attachment words with a low byte of 1..`$0F` are wall texts. The low byte is the advance in glyph units, a flags byte holds the font and plane, and the offset is stored doubled with a scale flag in bit 0 | `$5AE76..$5AF0C` | The prison has one: token `$8D`, font 1, on face 12 |
| Door geometry: a two-leaf door adds eight plan vertices and six walls (front, inner edge and back of each leaf). Its inner edges are the vertices the mover writes | `$5AF8E..$5B212` | Agrees with #645's `$167E..$168A` |
| Queue bytes from `$96` name attachments, (byte − `$6A`) × 4, so `$FF` is slot `$254` | `$5B3FA` | |
| The occupant table prefixes each resident's pairs with (association id, 0). Hooks are matched before the queue's terminator is tested, so wall byte 0 hooks after the whole queue | `$53C5E`, `$5B3E8` | That is how COBWEB 124 and item 10 come after the prison room (#644's observation) |
| Token `$8D` + 2n is attachment n's key letter (key + `$23`), or a space when the door is keyless | `$5AF5E..$5AF88` | The prison door shows `I` |
| Token `$8B` reads `$B300`, the two characters the last `$8008` header wrote | `$5453C` | The KEY model's `E9` |
| Detail selection: **every box starts on a word**, and the default list follows the zero tag | `$54C68` | A once-per-group alignment misreads the second group |
| The detail extent the zone test reads is the five words below the support and wall boxes | `$54B1C..$54B9A`, `$59F08` | Zones run 0..8; `$70D0` is the player's zone × 9 |
| Draw key = log-float distance + priority byte, from `$542BC`'s 9 × 9 zone table, or `$7F` outside the cell. Zone 4 adds `$80` to the exponent unless the resident is above the eye | `$54182..$542BC` | Slot 0, the structure, keeps zone 4 |
| Structure order: if region bit 14 is clear, detail, then the rest of the list, then the plan; if bits 14 and 12 are set, detail then plan; if bit 14 alone, plan then detail | `$54356..$5439E` | Detail is drawn from group 2 when the region flags are negative |
| Ground templates: the word >> 1 is a byte offset into the model table, so the entry is word / 4. The pointer is rounded down to even. Template slots run from 255 down, and each rewrites its slot's model-table entry | `$56340..$563C0` | |
| Ground slots `$F0..$FC` stand at the centres of the four cells named by the cell's run-grid long, turned by the ground transform | `$55C58..$55C96`, `$55DA4` | Checked against the live `$4160..$416C` table at six captures |
| Frame palette: template `$7CA2`. A literal colour claims the first free entry met from 15 down, reuses a match met first, and falls back to 0 when the palette is full. Timer B sets colour 8 to land at row `$7298` (68), loads the panel palette at row 136 from `$6FD02`, and colour 1 at row 152 | `$5A978`, `$5513C`, `$53294` | |
| The model rotation table holds 320 entries, because the reader indexes up to 255 + 64 | `$7E4A` | #644 hashed the first 192 |
| Passenger form: the mode is the record's `$40` with `$20` added, a ×16 yaw by the taxi's yaw + `$80` at (0, −63, 0). The driver head follows with the same rotation | `$54444..$544F8` | Not a view-fixed rotation, as #644's handoff worded it |
| Font 7 adds its points to twice the origin and halves the sum, so its glyphs stand at half scale | `$55208` | |
| Elapsed clock: each VBL takes 32 off the accumulator. At or below 0 it counts a second and refills 1600, and the count rolls at 86,400 into a day word | `$53164..$531D0` | The first second of a fresh game falls on its 21st VBL |

The text and panel decoders also correct three earlier statements. Script `$33` has 16 texts and 8 blanks, 24 requests in all, not 22 texts. Op `20 26 87` sits at `$6FF5F`, not `$6FF5E`. There are six head-turn sequences, not four. The panel artwork survives only at the game entry: readouts are drawn over the copy in the screen, so no clean source remains in loaded play.

## On-foot movement shared with Damocles

By the user's decision, MIII walks on Damocles's on-foot code. The evidence was taken from the pinned images. The disassembly listings are compared with every address and literal masked, and only the counts are recorded here:

| Routine | Damocles | MIII | Instructions aligned | Differences |
|---|---|---|---|---|
| Foot Mover | `$58CFE` | `$59A36` | 100 of 106 | The demo-playback record (`$7A0C`/`$70A2`) is word-wide in Damocles and byte-wide in MIII; one trailing call |
| Region scan, queue build and eye clamp | `$5A30E..$5A65C` | `$5B2D2..$5B620` | 261 of 265 | MIII rebases attachment slots (−`$1A8`) and queue bytes from `$96`; Damocles has one four-instruction block MIII lacks |

The step and turn words are equal: `$7B36` and `$71CE` both hold `$00021800`, the log-float 6.0, and `$7B3A` and `$71D2` both hold 2. MIII therefore steps 6 units and turns 2 heading units a substep, eight substeps a frame (48 units and 16 heading units). That is the `$30` forward and `$10` turn per update Damocles's #205 traces recovered.

The shared code is now `web/src/onFoot/index.ts`: `walk`, and the region scan and clamp core over plain region boxes. Damocles calls it with its authored seconds-based rates and wraps the clamp in its Catalogue types; its selection and walking tests pass unchanged. MIII calls `walk` once a substep at the recovered increments. The original multiplies the step by the heading's half-step sine and cosine through its log tables and rounds each product into the pose. The shared step works in radians, so the half step is carried into the bearing and each axis's move is rounded to whole units. Positions can therefore differ from the original by under a unit at a substep. They are not claimed to be bit-exact.

## Comparisons

**View.** Twelve checkpoints were captured at the main-loop top on the spaceport route; eleven of them were compared. The capture points were the opening, waiting taxi, cabin, departure, travel, solicitor cell, two turns, cells (1,1) and (3,0), and the spaceport arrival. At each, the browser's planner drew the state held in RAM: pose, cell, region, residents, passenger and frame counter. The result was compared with the buffer that frame was drawn into, decoded from RAM with the uploaded palette and the horizon split, in ST-colour space. Agreement was **95.7–98.4% of pixels (mean 96.9%)**. At cell (1,1) the projected vertices of detail 59 were also checked one by one: every vertex the game projected that frame has the same integer coordinates in the browser. The remaining pixels are:

- the sky Body arc, which is #646's;
- one-row differences where far road slivers converge on the horizon;
- edges of the cabin and driver head;
- the prison's horizontal-edge rows, the raster residue #644 named.

Exact ST rasterisation remains waived (D1 item 5) and is not claimed.

**Panel.** At the opening, the panel drawn from the panel document and the capture's live values matches 18,522 of 18,560 pixels outside the message bar. The other 38 are the seconds digit, which ticked between the draw and the capture. At later checkpoints, the card text differs only because the comparison was run with fixed text.

**What these comparisons cannot establish.** A capture compares one frame in isolation. It cannot show the cadence of those frames, the paths between checkpoints, sound, or the night sky. Those belong to I2's checkpoints ([D1 I2 item 7](mercenary-iii-taxi-milestone-review.md#i2-acceptance-journeys-and-persistence)).

## Gaps

| Gap | Gates | Ticket |
|---|---|---|
| Night sky: stars `$50B66`, horizon `$571A8`, sky Bodies' matrix path; the planner draws day only | I2 presentation | [#646](https://github.com/odogono/mercenary/issues/646) |
| Message-tone character skip | I2 sound | [#648](https://github.com/odogono/mercenary/issues/648) |
| Airborne road-line pairs from `$55CAC` | Not on these routes | — |
| Exact ST rasterisation and TOURCRAFT confirmation | Waived by D1 | — |

The glossary has no entry for the **Mercenary III research baseline**, a term every MIII report uses; that is left for `/domain-modeling`.

## Reproduction

The [laboratory README](../../research/mercenary-iii-st/README.md) gives the capture, export and test commands. Every published stable slice (39 ranges) is checked before decoding. The payload records each decoded item's source range and SHA-256, and each document's capture images by hash.
