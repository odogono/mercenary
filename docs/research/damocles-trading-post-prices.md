# Damocles Trading Post prices, rates and the Offered Object

Working-Authority Evidence for [#1026](https://github.com/odogono/mercenary/issues/1026), recovered 2026-11-28. A **Price** is an object's **Base Price** multiplied by one of two rates that belong to the **Trading Post**, not to the object. Each post offers the one object standing in its trading room, whether it began there as stock or the player sold it there, and taking that object is a **Purchase**. The HI-FI at MEGA TRADING is therefore bought, for 40,000.00, not found.

[ADR 0002](../adr/0002-separate-rom-research-from-implementation.md) permits factual recovery, not translation of the Working Authority into application code. Original captures, RAM, native listings and game text remain ignored Restricted Material under `research/damocles-st/work/`, consistent with the [research boundary](damocles-gap.md); only decoded facts and hashes are recorded here.

## What was already established, and what this corrects

[The drop research](damocles-object-drops.md#trading-post-credit-and-buy-back) recovered the Sale's credit on the drop side and the debit on the take side. [The capacity research](damocles-carry-capacity.md) placed the debit as test 10 of the take handler and ran it at three checkpoints with a written price. [The structure-group research](damocles-dion-vesta-structure-groups.md) recovered the scene selector that installs two bytes for the price block. [The wall-text research](damocles-structure-wall-text.md) recovered the readout that prints the quote.

Four statements in those notes were wrong or incomplete:

| Earlier statement                                                   | What the code does                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The price is computed "from the head carried object's model header" | The header gives only the Base Price. The quote multiplies it by a rate the cell installed                                           |
| The rates table is at `$0339C0`                                     | It is at `$0239C0`. `adda.w -2(a2), a2` sign-extends the word `$FFC8`, so the table sits 56 bytes **below** the structure-group root |
| The sold slot is recorded in `$795D`, and tested in `$795C`         | One word. The drop writes its low byte; the take, the quote and the bind read the word                                               |
| Only an object the player sold is in the sold state                 | The cell bind marks whatever resident stands in the trading room, so a post's own stock is for sale from the first visit             |

## Evidence and method

Static recovery reads bounded windows of the pinned first-world capture `observe-first-world-20260818T101013Z-c5a32b7d/observed.ram` with Capstone's M68K 68000 big-endian decoder. The rates table, and the price and name headers of resident slots 1–247, are byte-identical in that capture and in all 63 tracked memstates (36 captures and their 27 rehosted copies), so they are authored data, not live state.

Runtime evidence comes from the tracked [Trading Post probe](../../research/damocles-st/scripts/trading-post-probe.py). It is a **checkpoint** probe, not an ordinary-route observation. Each case boots a pose in its own emulator, holds interrupts at IPL 7, and runs a chain of the original routines from their own entries to their own exits:

| Routine                  | Entry     | What the probe writes first                                       |
| ------------------------ | --------- | ----------------------------------------------------------------- |
| Cell bind                | `$054B2E` | The cell words `$7A2C` and `$7A34`                                |
| Quote                    | `$04E05A` | The region word `$7AFC` = 9                                       |
| Leaving the trading room | `$054F52` | Nothing                                                           |
| Take                     | `$0541F0` | The selection, and for a take in the trading room the region word |
| Drop                     | `$054520` | The region word, and the region list pointer `$7B0E`              |

A later step inherits everything the earlier ones left, so a Sale is quoted by the bind and the quote that really ran before it. The Carried Stack is filled by the take handler, never written.

```sh
research/damocles-st/lab doctor --roms /path/to/roms
python3 research/damocles-st/scripts/trading-post-probe.py --roms /path/to/roms
python3 research/damocles-st/scripts/trading-post-probe.py --roms /path/to/roms \
  --case sale-refused-placement
```

Two things stand in for the walk into the trading room, and bound what the cases claim:

- **The region word is written.** No tracked capture stands inside a Trading Post, and a structure's region boxes are built by the scene pass, which no checkpoint runs. The take and the drop both end by calling the region scanner `$05A30E`; with the departed structure's boxes it would report the player leaving the trading room. The probe holds it at its own gate, `$7AF6` negative, for steps taken in the room.
- **The drop's region list is one byte.** The drop looks its region up in the list `$7B0E` names and stops at the first byte that equals it. The probe points `$7B0E` at the operand of the handler's own `cmpi.w #$9, d0`.

The bind is the real one. It reads the cell's entry from the live `$ABDC` table of the pose's own workspace, so the rates, the ground-floor structure and the scan are all the original's.

## A Price is a Base Price times a rate

`$04E05A` runs only in structure `$52`, region 9, while the post has no Offered Object (`$795C` clear). It reads the four packed-decimal bytes at **model record − 20**, immediately ahead of the record's 16-byte name, and adds that value to a six-byte packed-decimal accumulator at `$7956` once per unit of the rate. The rate is a plain binary count, so a Price is exact: Base Price × rate, in hundredths of a credit, the same unit as the balance at `$7C42`.

The rate is one of two words:

| Word    | Glossary term | Applies to                                                                                                |
| ------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| `$7960` | **Buy Rate**  | The Offered Object; and the carried head when it is the slot in `$795E`, the object the post last offered |
| `$7962` | **Sell Rate** | Any other carried head                                                                                    |

`$04E13C` adds the quote at `$7956` to the balance and `$04E158` subtracts it, restoring the balance and returning negative when the result would be. Neither computes anything: **a Sale credits, and a Purchase debits, whatever the last quote left in `$7956`.**

## Base Prices

The 241 resident slots with a model use 142 object records. Their price headers:

| Class                 | Records | Slots                                                                      |
| --------------------- | ------- | -------------------------------------------------------------------------- |
| A non-zero Base Price | 125     | 210                                                                        |
| A Base Price of zero  | 12      | 21: the eleven craft in slots 1–7 and 10–13, and DOOR KEY A in slots 30–39 |
| No price header       | 5       | 10: slots 74, 156 and 248–255                                              |

The five records with no price header have no name header either: the sixteen bytes before them are not printable, and the four before those are not all packed decimal. What the quote would read there is not a price, and the payload publishes none.

| Object                            | Base Price     |
| --------------------------------- | -------------- |
| NOVABOMB                          | 320,000.00     |
| MAGIC CRYSTAL                     | 150,000.00     |
| AUTHORS COMPUTER                  | 50,000.00      |
| SIDEBOARD, CUPBOARD and WASHBASIN | 25,000.00 each |
| BRIEFCASE                         | 9,750.01       |
| GOLD                              | 5,000.00       |
| HI-FI                             | 2,500.00       |
| FRIDGE                            | 34.25          |
| RECEIPT                           | 0.01           |

A zero Base Price is a price. A craft or DOOR KEY A sells for nothing at any post and still becomes the Offered Object.

## The rates belong to the cell

The cell bind takes the first byte of the cell's `$ABDC` entry, masked with `$FE`, as a scene selector ([structure groups](damocles-dion-vesta-structure-groups.md)). For a selector from `$20` to `$9E`, `$054CDE`–`$054D04` indexes a table of byte pairs by `selector − $20` and writes the first byte to `$7963` and the second to `$7961`: the low bytes of the Sell Rate and the Buy Rate. Every other selector leaves both words alone.

The table is 26 pairs at `$0239C0`, ending where the two words that precede the structure-group root begin:

| Selector | Buy | Sell | Selector | Buy | Sell | Selector | Buy | Sell |
| -------- | --- | ---- | -------- | --- | ---- | -------- | --- | ---- |
| `$20`    | 6   | 3    | `$32`    | 20  | 7    | `$44`    | 21  | 12   |
| `$22`    | 9   | 3    | `$34`    | 12  | 9    | `$46`    | 20  | 15   |
| `$24`    | 12  | 3    | `$36`    | 15  | 9    | `$48`    | 25  | 15   |
| `$26`    | 15  | 3    | `$38`    | 18  | 9    | `$4A`    | 30  | 15   |
| `$28`    | 10  | 5    | `$3A`    | 12  | 10   | `$4C`    | 25  | 18   |
| `$2A`    | 15  | 5    | `$3C`    | 14  | 10   | `$4E`    | 30  | 18   |
| `$2C`    | 20  | 5    | `$3E`    | 16  | 10   | `$50`    | 30  | 20   |
| `$2E`    | 10  | 7    | `$40`    | 15  | 12   | `$52`    | 40  | 20   |
| `$30`    | 14  | 7    | `$42`    | 18  | 12   |          |     |      |

**79 placements are Trading Posts**: their ground floor is structure slot 82, either directly or through one of nine alias records. In every authored cell the two facts coincide: a selector in the rates range stands on a trading ground floor, and nowhere else. The exporter refuses a Catalogue where they would not.

| Area                     | Posts  | Buy and Sell Rates                                              |
| ------------------------ | ------ | --------------------------------------------------------------- |
| GAEA, Chaldea Metropolis | 32     | (12, 9), (15, 9), (18, 9); MEGA TRADING (16, 10)                |
| MENTOR                   | 19     | Eight pairs from (6, 3) to (20, 7), and one cell past the table |
| ERIS                     | 9      | (14, 10), (12, 10), (16, 10)                                    |
| LOGOS                    | 5      | (25, 18), (30, 15), (30, 18), (30, 20), (40, 20)                |
| ERIS, Key West           | 3      | (16, 10)                                                        |
| VESTA                    | 2      | (20, 15)                                                        |
| ERIS, Velos City         | 2      | (15, 12)                                                        |
| DION North and DION East | 2 each | (12, 3), (15, 3)                                                |
| GAEA, Ur City            | 1      | (21, 12)                                                        |
| DION                     | 1      | (25, 15)                                                        |
| ERIS, Snow Island        | 1      | (18, 12)                                                        |

Every post pays less for an object than it asks for it. An object bought at one post can still sell for more at another: Buy Rates run from 6 to 40 and Sell Rates from 3 to 20.

### One cell reads past the table

MENTOR cell `$35` carries selector `$54`, one pair past the last. The code reads the two bytes that follow the table, which are the first of the two words before the group root: **Buy Rate 142, Sell Rate 124**. The checkpoint `bind-mentor-past-table` confirms the bind installs exactly that. The post starts empty, so anything sold there fetches 124 times its Base Price. The payload publishes the rates the code reads.

### The opening rates

Every fresh-start capture holds Buy Rate 15 and Sell Rate 5 before any post has bound. That pair is also selector `$2A`'s, but no cell installed it: it is part of the opening game state the loader unpacks from the disk.

A write watch on `$7960` from the title screen ([scenario](../../research/damocles-st/scenarios/opening-trade-rates-writer.json), run `observe-opening-trade-rates-writer-20261128T114158Z-6daf7611`) breaks inside the title-to-world unpacker, in the back-reference copy at `$0685FA`–`$068600`, with its descending output pointer at `$7961`. A hundred frames after the keypress the words still hold title-screen bytes; three thousand frames after it they hold `$000F0005` and the balance holds 9,000.00. No instruction in `$040000`–`$05FFFE` addresses `$7960`–`$7963` outside the cell bind and the quote.

The opening pair cannot be met in play. Both rates are read only in the trading room, and the bind that takes the player there installs the post's own.

## What a post offers

The cell bind ends, when the ground floor is structure `$52`, with the scan `$054F18`–`$054F76`. It walks the resident slots from 255 down and takes the first whose structure group, cell and insertion group are this group, this cell and 9. That slot, or zero when none matches, goes to **both** `$795C` (the Offered Object) and `$795E` (the object the post last offered), and is quoted at the Buy Rate.

Three consequences:

- **The marker belongs to the post.** Each bind in a Trading Post rewrites it from what stands in that post's trading room. A bind in any other cell leaves it and the rates untouched, which is why `damocles.key-west` still names the FRIDGE after leaving Snow Island.
- **Stock and a sold object are the same thing.** A dropped object takes the player's structure group, cell and region as its residence, so an object sold in the trading room is found by the next bind exactly as authored stock is.
- **A stocked post cannot be sold to** until its Offered Object has been bought.

Fourteen posts start with stock. Each has exactly one resident in its trading room, so the scan's choice of the highest slot never decides anything at the start of a game.

| Post                                 | Rates    | Offered Object             | Price      |
| ------------------------------------ | -------- | -------------------------- | ---------- |
| GAEA Chaldea `$65`, MEGA TRADING     | (16, 10) | HI-FI, slot 86             | 40,000.00  |
| GAEA Ur City `$39`                   | (21, 12) | COOKER, slot 26            | 942.90     |
| ERIS Snow Island `$43`, TRADING POST | (18, 12) | FRIDGE, slot 113           | 616.50     |
| ERIS `$E8`, TRADING POST             | (16, 10) | KEY - BESTCUPAND, slot 182 | 9,600.00   |
| ERIS `$FD`                           | (16, 10) | BOOK, slot 131             | 16,000.00  |
| ERIS `$3F`                           | (14, 10) | PRESSURE SUIT, slot 134    | 4,200.00   |
| ERIS Velos City `$73`                | (15, 12) | TV CONTROL, slot 93        | 29.85      |
| DION `$E9`                           | (25, 15) | ACME UNIVERSAL, slot 135   | 25,000.00  |
| DION North `$41`                     | (15, 3)  | HAMMER, slot 120           | 5.85       |
| MENTOR `$12`                         | (20, 5)  | BLUE BEACON LOCR, slot 53  | 100,000.00 |
| MENTOR `$34`                         | (10, 5)  | C.B. RIG, slot 119         | 292.50     |
| MENTOR `$44`                         | (9, 3)   | PRESSURE SUIT, slot 144    | 2,700.00   |
| MENTOR `$45`                         | (6, 3)   | WELSH DRESSER, slot 89     | 645.60     |
| MENTOR `$56`                         | (10, 5)  | ANTIQUE SEXTANT, slot 132  | 1,750.00   |

Three residents with insertion group 9 stand in structures that are not Trading Posts (slots 71, 163 and 193). The scan never runs there.

## Sale, Purchase and the trading-room door

The quote runs when the Carried Stack rotates, when an object is taken, and when the region scanner sees the player enter region 9 (`$05A3B0`). When the scanner sees the player **leave** region 9 it calls `$054F52` instead, which copies `$795C` into `$795E` and quotes that slot at the Buy Rate.

- **Sale.** A Drop in the trading room with no Offered Object credits the current quote and writes the head's slot to `$795D`, before the support and placement checks. With an Offered Object the Drop is refused with message index `$0B` and nothing is credited.
- **Purchase.** A Take of the Offered Object in the trading room debits the current quote and clears `$795C`. When the balance cannot cover it the Take is refused with message index `$0C`. `$795E` is not cleared, so the object just bought is still "the object the post last offered".
- **Taking a Sale back at once costs what it paid.** The quote does not run while there is an Offered Object, so `$7956` still holds the sale amount.
- **Leaving the room re-prices it.** `$054F52` quotes the Offered Object at the Buy Rate. GOLD sold for 45,000.00 at Chaldea `$64` costs 75,000.00 once the player has stepped out.
- **A Purchase is refundable until the player leaves.** With `$795E` still naming it, the object quotes at the Buy Rate and a Sale returns the full Price. Leaving the room copies the now-clear `$795C` into `$795E`, and the object then quotes at the Sell Rate like any other.
- **A refused placement pays, and can pay again.** The credit and the marker are written before the placement is refused with message index 9, so the player keeps the object, the credit and an Offered Object that is in their hands. A second Drop is refused with index `$0B`. The next bind finds nothing standing in the room and clears the marker, and the same object can then be sold again.

## Observed at the checkpoints

All sixteen cases reached the exit recorded here, in the run `trading-post-20261128T112632Z-d1987e32`. Amounts are credits; the opening balance is 9,000.00.

| Case                        | Steps                                                                                       | Outcome                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bind-mega-trading`         | Bind Chaldea `$65`                                                                          | Structure `$52`; rates (16, 10); Offered Object 86, quoted 40,000.00                                                                                       |
| `bind-empty-post`           | Bind Chaldea `$64`                                                                          | Rates (15, 9); nothing offered                                                                                                                             |
| `bind-third-post`           | Bind Chaldea `$26`                                                                          | Rates (18, 9); nothing offered                                                                                                                             |
| `bind-ordinary-cell`        | Marker written as 113, then bind Chaldea `$88`                                              | Structure `$39`; marker 113 and rates (15, 5) unchanged                                                                                                    |
| `bind-mentor-stocked`       | Bind MENTOR `$45`                                                                           | Rates (6, 3); Offered Object 89, quoted 645.60                                                                                                             |
| `bind-mentor-past-table`    | Bind MENTOR `$35`                                                                           | Rates (142, 124); nothing offered                                                                                                                          |
| `quote-sell-rate`           | Take GOLD; bind `$64`; quote                                                                | 45,000.00 = 5,000.00 × 9                                                                                                                                   |
| `quote-held-while-offering` | Take GOLD; bind `$65`; quote                                                                | Not quoted: the 40,000.00 for the HI-FI stands                                                                                                             |
| `quote-sell-rate-mega`      | Bind `$65`; buy the HI-FI; take GOLD; quote                                                 | 50,000.00 = 5,000.00 × 10                                                                                                                                  |
| `purchase-unaffordable`     | Bind `$65`; take the HI-FI with 9,000.00                                                    | Refused, index `$0C`; balance and marker unchanged                                                                                                         |
| `purchase-refund`           | Bind `$65` with 54,000.00; take the HI-FI; quote; drop                                      | Balance 14,000.00, marker clear; quote 40,000.00; balance 54,000.00, HI-FI offered again                                                                   |
| `purchase-leave-no-refund`  | Bind `$65`; take the HI-FI; leave; quote                                                    | Last-offered cleared; quote 25,000.00 = 2,500.00 × 10                                                                                                      |
| `sale-then-purchase`        | Take GOLD; bind `$64`; quote; drop; take                                                    | Balance 54,000.00, GOLD offered, residence group `$0F` cell `$64` region 9; balance 9,000.00                                                               |
| `sale-leave-requote`        | As above to the drop; leave; take; bind                                                     | Quote 75,000.00; take refused, index `$0C`; the bind offers GOLD at 75,000.00 again                                                                        |
| `sale-occupied`             | Take GOLD; bind `$65`; drop                                                                 | Refused, index `$0B`; balance unchanged                                                                                                                    |
| `sale-refused-placement`    | Take GOLD; bind `$64`; quote; drop onto a support of rank 0; drop; leave; bind; quote; drop | Index 9 with balance 54,000.00 and GOLD still carried and marked; index `$0B`; quote 75,000.00; marker clear; quote 45,000.00; accepted, balance 99,000.00 |

## The one capture taken after a trade

`damocles.key-west` was saved over Key West with `$795C` and `$795E` naming slot 113, rates (18, 12) and a quote of 616.50. Snow Island's TRADING POST stands in cell `$43` of group `$10` with selector `$42`, whose pair is Buy 18, Sell 12, and the FRIDGE that starts in its trading room has a Base Price of 34.25. 34.25 × 18 = 616.50. The capture is an ordinary-route observation of the bind, the scan and the quote, and the lab's tests pin it.

The earlier reading of the table at `$0339C0` gave that cell (19, 14), which is why the capture looked like a contradiction.

## ST Format 20 step 6

The step sells the gold at Chaldea 04.06 and buys at 05.06.

| Step          | Where                                                       | Amount      | Balance   |
| ------------- | ----------------------------------------------------------- | ----------- | --------- |
| Start         |                                                             |             | 9,000.00  |
| Sell GOLD     | Cell `$64`, an unnamed post with rates (15, 9) and no stock | + 45,000.00 | 54,000.00 |
| Buy the HI-FI | Cell `$65`, MEGA TRADING, rates (16, 10)                    | − 40,000.00 | 14,000.00 |

The HI-FI cannot be bought with the opening balance, which is why the step sells first. Selling the gold at MEGA TRADING itself is refused while the HI-FI is on offer. `quote-sell-rate`, `purchase-unaffordable` and `purchase-refund` are these amounts.

## What the payload publishes

The Catalogue publishes the two recovered inputs and leaves the product to the session.

- **`basePrice`** on every object Model and on its `modelIndex` entry, in hundredths of a credit. It is `null` for a record with no price header and absent for every other kind.
- **`tradingPost`** on every surface placement: `{ "buyRate", "sellRate" }` where the ground floor is the trading structure, and `null` elsewhere.

A post's opening Offered Object is not published. It follows from the residents the Catalogue already carries, by the scan above, and the rule has to run at every bind because the player changes what stands in the room.

## Confirmed, derived and unresolved

**Confirmed at checkpoints on the original routines:** the Price formula at both rates; the rates three Chaldea cells and two MENTOR cells install; the scan's choice of stock and of nothing; the Purchase's debit, refusal and marker; the Sale's credit, refusal and residence; the re-quote on leaving the room; the refund and its loss; the credit kept after a refused placement and paid again after the next bind.

**Confirmed by an ordinary-route capture:** the bind, scan and quote at Snow Island, from `damocles.key-west`.

**Confirmed by a write watch from a cold boot:** the opening rates arrive in the unpacked opening state.

**Derived from the authored data:** the rates of the other 74 posts, by the same table and the same code path; every Base Price; the thirteen other stocked posts.

**Not observed in play:** that the region scanner finds region 9 where the player stands in a trading room. The probe writes the region word. That the take and drop tails leave the trading state alone in real play follows from the scanner's code (`$05A38E`–`$05A396` acts only on a change of region), not from a run.

**Unresolved:** nothing this issue asked for. The (142, 124) pair is what the code reads; whether its authors meant it is not recoverable from the program.

## Smallest faithful implementation boundary

[#1024](https://github.com/odogono/mercenary/issues/1024) needs four words of state and four events. The state is the Offered Object, the object the post last offered, the two rates, and the cached quote; all five survive leaving the post, so all five belong in a Save. The events are the bind in a Trading Post cell (rates, scan, quote at the Buy Rate), the quote (on rotation, on a Take, on entering the trading room), leaving the trading room, and the credit or debit of the cached quote inside the Drop and the Take. Nothing else in the game reads or writes them.

## Evidence identities

All hashes are SHA-256. Laboratory machine: ST, 1 MiB; program and TOS images are checked against [`working-authority.json`](../../research/damocles-st/config/working-authority.json). The checkpoint run is retained at `restricted/damocles-1026/trading-post-20261128T112632Z-d1987e32`.

| Input                              | Hash                                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| Working Authority STX              | `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef` |
| TOS                                | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| First-world capture `observed.ram` | `b019301ec5ac355301613db8e2bf6cd6d4a0df41311b6efedacfea87f2a9c967` |
| `rehosted/gaea-transporter.sav`    | `4892d7c2f28326a7a5e459a7ae631fe5de4f8ce1468a69c604b2c3949dfe9ac7` |
| `rehosted/mentor-transporter.sav`  | `628a89561a8415501e8872ce3ab9e974bf311dc3304e6b2c6bc15b297b90daee` |
| `damocles.key-west.sav`            | `37fdcff2c66fdc401d693e875768ecdb7344183625d59e23017f67ec53b30f29` |
| Tracked probe                      | `d51f3ac56635ab7c5c5442daf56bc91ac2bf811f7415e7b98bfbfdc5731b5cb4` |

Source ranges read for this note, hashed in the pinned first-world capture. The probe fingerprints the quote block, the take handler, the drop handler and the cell bind in every capture of every case and fails if any differs, which is how it establishes that it edited state and not code:

| Range                                                                  | Hash                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Rate pairs and the two words before the group root `$0239C0`–`$0239F8` | `fadc8dad2170adb6fb82c481a30d06cd4db7a03174022e8dc6eea0164236da70` |
| Quote, credit and debit `$04E05A`–`$04E17E`                            | `eb977e835d0a228a83fde200d0c9744c9dcc695b7aefee5d1873c176fb36726e` |
| Take handler `$0541F0`–`$0542E0`                                       | `e6139be6700a08ff7676ca198aae6808fb2dc9138b29f7b9fe73b3ee63762298` |
| Drop handler `$054520`–`$054744`                                       | `32ff685b20f7b7a98476499f89b540abbef26150df2adfb297e2016e631d8f5e` |
| Cell bind `$054B2E`–`$054F7C`                                          | `a016fbbae10bf3744023f19e70025dbf265a0118bd0c84fcb03ee543f69df919` |
| Selector dispatch `$054CB0`–`$054D2A`                                  | `de081b1284e0744c1dff272ba1c844e9ef0338b7937045d6cbe5af709f907d0e` |
| Offer scan `$054F18`–`$054F7C`                                         | `8c1ccafe958651e491f6789a975ffc3bb2ce1008a6c87ae44bbc36cb452d1055` |
| Region change `$05A386`–`$05A3BA`                                      | `7cfd47d5a7a4455450607047a8e7155db0414702e0b8973a06b8b4b9d8eb2985` |

The unpacker is not resident in the first-world capture. Its range `$068582`–`$068612` hashes to `a00a58d80541d3007c9f81b4e3040dba6763a2ec6a37b599c3b6368873132604` in the watch run's own capture, taken a hundred frames after the keypress. The run's register dump is retained at `restricted/damocles-1026/observe-opening-trade-rates-writer-20261128T114158Z-6daf7611`.
