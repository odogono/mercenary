# Damocles structure locations

This is a navigation reference for Damocles's surface structures, Body by Body
and island by island. Object slots are catalogued separately in
[Damocles object locations](damocles-object-locations.md); Targ's structures are
in [Structure locations](structure-locations.md).

<!-- Generated from payload/damocles/catalogue.json, its model files, and payload/damocles/arrival-poses.json. -->

## Reading the tables

- **Cell** is shown as `goto x z` where the structure is inside the Body's
  16 by 16 `goto` window, and otherwise as the cell `where` reports there
  (printed as `x-z`). Cells outside the window belong to another island on the
  same Body: walk or fly to them. The complete catalogue writes every cell as
  `x z` and says under each island whether its cells take `goto`. Bodies and their `switch` targets are listed in
  [Damocles object locations](damocles-object-locations.md#bodies-and-switch-targets).
- **Floors** are the Floor numbers the structure's Floor Table binds, the
  numbers `floor <n>` takes while standing in it. A dash means the structure
  publishes no Floor Table.

## Structure identities

A structure's Catalogue instance is named `<body>[-<island>]-surface-<cell>`,
where `<cell>` is its island-local cell byte in hex, X plus 16 × Z. So
`eris-surface-89` is cell 9,8 of Capital City, and `dion-dion-north-surface-06`
is cell 6,0 of Dion North. MIDAS's field copies are named by Body Coordinate
instead.

## Named places

| Name | Body | Area | Cell | Floors | Instance |
| --- | --- | --- | --- | --- | --- |
| KING BURDOCK | Acheron | Acheron Retreat | `goto 0 3` | 0–6 | `acheron-surface-30` |
| KING BURDOCK | Acheron | Acheron Retreat | `goto 6 3` | 0–6 | `acheron-surface-36` |
| OSIRIS SHYNX | Acheron | Acheron Retreat | `goto 3 0` | 0–4 | `acheron-surface-03` |
| TANIS SPHYNX | Acheron | Acheron Retreat | `goto 3 6` | 0–4 | `acheron-surface-63` |
| THE TOMB OF HORUS | Acheron | Acheron Retreat | `goto 1 5` | 0 | `acheron-surface-51` |
| THE TOMB OF MAAT | Acheron | Acheron Retreat | `goto 5 5` | 0 | `acheron-surface-55` |
| THE TOMB OF NEITH | Acheron | Acheron Retreat | `goto 5 1` | 0 | `acheron-surface-15` |
| THE TOMB OF SETH | Acheron | Acheron Retreat | `goto 1 1` | 0 | `acheron-surface-11` |
| ANNIES BAR | Dion | Dion North | `70, 64` | 0, 10 | `dion-dion-north-surface-06` |
| ANNIES BAR | Dion | Dion East | `70, -16` | 0, 10 | `dion-dion-east-surface-06` |
| ACTIVE MARKETING | Clotho | Clotho New Town | `goto 2 1` | 0–4 | `clotho-surface-12` |
| LLOYDS GP4 INVESTMENT | Clotho | Clotho New Town | `goto 1 0` | 0–8 | `clotho-surface-01` |
| AUTHORS HOUSE | Gaea | Ur City | `goto 14 13` | 0 | `gaea-surface-de` |
| BANK OF GAEA HQ | Gaea | Chaldea Metropolis | `-250, -1018` | 0, 1, 2, 10 | `gaea-chaldea-metropolis-surface-66` |
| ELMDON SPACEPORT | Gaea | Ur City | `goto 0 4` | — | `gaea-surface-40` |
| ERIS PO TEMP HQ | Gaea | Ur City | `goto 0 10` | 0, 1, 2, 3, 4, 5, 10 | `gaea-surface-a0` |
| ESTATE AGENTS | Gaea | Chaldea Metropolis | `-250, -1016` | 0–9 | `gaea-chaldea-metropolis-surface-86` |
| GAEA BANK | Gaea | Ur City | `goto 1 11` | 0–2 | `gaea-surface-b1` |
| GUM STORE | Gaea | Ur City | `goto 1 3` | 0, 1 | `gaea-ur-city-surface-31` |
| HANTZENS NEW HOUSE | Gaea | Ur City | `goto 7 1` | 0 | `gaea-ur-city-surface-17` |
| INDUSTRIAL CO-OP HSE1 | Gaea | Ur City | `goto 1 2` | 0, 1, 2, 3, 4, 5, 10 | `gaea-ur-city-surface-21` |
| INDUSTRIAL CO-OP HSE2 | Gaea | Ur City | `goto 5 2` | 0, 1, 2, 3, 4, 5, 10 | `gaea-ur-city-surface-25` |
| LAWSON BANK | Gaea | Ur City | `goto 0 7` | 0, 1 | `gaea-surface-70` |
| MARILLION APARTMENTS | Gaea | Chaldea Metropolis | `-252, -1023` | 0–2 | `gaea-chaldea-metropolis-surface-14` |
| MEGA TRADING | Gaea | Chaldea Metropolis | `-251, -1018` | 0 | `gaea-chaldea-metropolis-surface-65` |
| NOVAGEN OFFICE | Gaea | Ur City | `goto 2 11` | 0, 1 | `gaea-surface-b2` |
| TRADE COMMISSION | Gaea | Chaldea Metropolis | `-248, -1016` | 0–9 | `gaea-chaldea-metropolis-surface-88` |
| VERDANT PARTY HQ | Gaea | Ur City | `goto 3 14` | 0–9 | `gaea-surface-e3` |
| IDI PALACE OF FUN | Cyclopes | Idi Centre | `goto 2 2` | 0 | `cyclopes-surface-22` |
| CAPITAL SPACEPORT | Eris | Capital City | `goto 7 8` | — | `eris-surface-87` |
| EKMPV & S AD AGENCY | Eris | Velos City | `1476, 645` | 0–9 | `eris-velos-city-surface-54` |
| ERIS POST OFFICE HQ | Eris | Capital City | `goto 12 14` | 0–10 | `eris-surface-ec` |
| ERIS POWER GENERATION | Eris | Capital City | `goto 14 5` | — | `eris-surface-5e` |
| ERIS TV STUDIOS | Eris | Velos City | `1476, 641` | 0–9 | `eris-velos-city-surface-14` |
| EXCHEQUER DISTRICT A | Eris | Capital City | `goto 1 1` | 0, 1, 2, 3, 4, 10 | `eris-surface-11` |
| GUM STORE | Eris | Capital City | `goto 4 11` | 0, 1 | `eris-surface-b4` |
| GUM STORE DRAPERY | Eris | — | — | — | not placed |
| HANTZEN ADMIN | Eris | Bare Island | `3015, 388` | 0–9 | `eris-bare-island-surface-47` |
| HANTZEN AIRPORT | Eris | Bare Island | `3010, 388` | 0 | `eris-bare-island-surface-42` |
| HANTZEN HELIPORT | Eris | Bare Island | `3013, 386` | 0 | `eris-bare-island-surface-25` |
| HANTZEN LABORATORY | Eris | Bare Island | `3014, 389` | 0, 1, 2, 3, 4, 10 | `eris-bare-island-surface-56` |
| HANTZEN SALES | Eris | Bare Island | `3014, 386` | 0, 1, 2, 3, 4, 5, 10 | `eris-structure-0251d7` |
| HATHAWAYS WINE BAR | Eris | Snow Island | `-26, 932` | 0, 10 | `eris-snow-island-surface-46` |
| LAWSON BANK HQ | Eris | Capital City | `goto 15 12` | 0, 1, 2, 10 | `eris-surface-cf` |
| MOORBY SCH OF FLYING | Eris | Capital City | `goto 9 9` | — | `eris-surface-99` |
| NEWTON LTD RESEARCH | Eris | Key West | `2503, 3463` | 0–10 | `eris-key-west-surface-77` |
| PLAYTESTER STORES | Eris | Capital City | `goto 9 2` | 0, 10 | `eris-surface-29` |
| PLAYTESTER STORES | Eris | Capital City | `goto 1 14` | 0, 10 | `eris-surface-e1` |
| POSTOFFICE SORTING | Eris | Snow Island | `-29, 928` | 0 | `eris-snow-island-surface-03` |
| SCOTT AIRPORT | Eris | Snow Island | `-25, 932` | — | `eris-snow-island-ground-47` (ground only) |
| STATE OFFICE | Eris | Capital City | `goto 9 8` | 0, 1, 2, 10 | `eris-surface-89` |
| TRADING POST | Eris | Capital City | `goto 8 14` | — | `eris-surface-e8` |
| TRADING POST | Eris | Snow Island | `-29, 932` | 0 | `eris-snow-island-surface-43` |
| PENN COLLEGE | Solon | Solon Base | `goto 1 1` | 0, 10 | `solon-surface-11` |
| BURDOCK MEDIA LINK | Theon | Theon Base | `goto 2 3` | — | `theon-surface-32` |
| ERIS TV MEDIA LINK | Theon | Theon Base | `goto 3 1` | — | `theon-surface-13` |
| SKY-DISNEY MEDIA LINK | Theon | Theon Base | `goto 3 2` | — | `theon-surface-23` |
| GAEA BANK | Vesta | Politburo City | `goto 3 1` | 0–2 | `vesta-surface-13` |
| GLENN SPACEPORT | Vesta | Politburo City | `goto 0 4` | — | `vesta-surface-40` |
| GUM STORE | Vesta | Politburo City | `goto 3 7` | 0, 1 | `vesta-surface-73` |
| LAWSON BANK | Vesta | Politburo City | `goto 6 4` | 0–2 | `vesta-surface-46` |
| LLOYDS GROUP 4 | Vesta | Politburo City | `goto 5 4` | 0–8 | `vesta-surface-45` |
| VESTA PARLIAMENT | Vesta | Politburo City | `goto 4 6` | 0, 1, 2, 3, 10 | `vesta-surface-64` |
| DOOBERRYS SOLICITORS | Metis | Metis Moonbase | `goto 0 6` | 0–9 | `metis-surface-60` |
| NIXON INTR COURT | Metis | Metis Moonbase | `goto 5 6` | — | `metis-surface-65` |
| TIMEWARP PRISON | Metis | Metis Moonbase | `goto 2 6` | 0 | `metis-surface-62` |
| CHARLENES DISCO | Logos | Logos City | `goto 6 3` | 0 | `logos-surface-36` |
| D.H.S.S. HOUSE | Logos | Logos City | `goto 4 2` | 0–4 | `logos-surface-24` |
| FRANKS BARGAIN TP | Logos | Logos City | `goto 7 0` | 0 | `logos-surface-07` |
| FRANKS BARGAIN TP | Logos | Logos City | `goto 8 0` | 0 | `logos-surface-08` |
| FRANKS BARGAIN TP | Logos | Logos City | `goto 8 3` | 0 | `logos-surface-38` |
| FRANKS BARGAIN TP | Logos | Logos City | `goto 7 3` | 0 | `logos-surface-37` |
| PAN HADES ADMIN DEPT | Pan | Pan Hades Labourcamp | `goto 4 1` | 0, 1, 2, 3, 4, 10 | `pan-surface-14` |
| BOSHERS BAR | Bacchus | Bacchus Waystation | `goto 0 3` | 0 | `bacchus-surface-30` |
| GABRIELS PLACE | Bacchus | Bacchus Waystation | `goto 0 1` | 0 | `bacchus-surface-10` |
| MOTHER MERCURYS | Bacchus | Bacchus Waystation | `goto 2 1` | 0 | `bacchus-surface-12` |
| UNCLES CASINO | Bacchus | Bacchus Waystation | `goto 1 3` | 0 | `bacchus-surface-31` |
| EMERGENCY FACILITY | Perseus | Alkane Base | `goto 4 1` | 0, 10 | `perseus-surface-14` |
| EMERGENCY FACILITY | Perseus | Alkane Base | `goto 4 6` | 0, 10 | `perseus-surface-64` |
| RESEARCH LABORATORY | Perseus | Alkane Base | `goto 5 2` | 0 | `perseus-surface-25` |

Cronus and Lucan are catalogued as ground only, so they have no structures here.

A name belongs to the decoded place record of that one cell; another placement
of the same geometry does not share it.

## Complete structure catalogue

Damocles's 821 placed structures, grouped by Body and island. Rows are one
geometry record each; multiple cells on one row are separate structures that share
it. The island-local cell is the one in the instance identity.

### Icarus

#### Takoushi Base

Inside the `goto` window: `switch icarus`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00efa6` | — | `2 1` |
| `structure-01d370` | 0, 10 | `3 0` |
| `structure-01d382` | 0, 10 | `3 2` |
| `structure-01d3b2` | 0 | `1 2` |
| `structure-01d3c4` | 0 | `1 0` |

### Midas

#### The Midas Project

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01430c` | — | `2011 -3106`, `551 -3089`, `546 -3086`, `563 -3086`, `77 224` |

### Acheron

#### Acheron Retreat

Inside the `goto` window: `switch acheron`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01430c` | — | `4 4` |
| `structure-014440` | — | `1 2`, `5 2`, `2 4` |
| `structure-014574` | — | `2 1`, `4 1` |
| `structure-016684` | 0–6 | `6 3` |
| `structure-016c6c` | 0–4 | `3 0` |
| `structure-01d3fa` | 0–6 | `0 3` |
| `structure-01d40c` | 0–4 | `3 6` |
| `structure-01d41e` | 0 | `2 2`, `4 2`, `1 4`, `5 4` |
| `structure-01d430` | 0 | `2 5`, `4 5` |
| `structure-01d442` | 0 | `1 1`, `5 1` |
| `structure-01d466` | 0 | `1 5`, `5 5` |
| `structure-01d48a` | 0 | `3 1`, `3 2`, `1 3`, `4 3` |
| `structure-01d49c` | 0 | `2 3`, `5 3`, `3 4`, `3 5` |

### Dion

#### Birmingham Island

Inside the `goto` window: `switch dion-2-3`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-010ea8` | 0, 1 | `2 11` |
| `structure-011ada` | 0, 10 | `1 5` |
| `structure-012136` | — | `5 3`, `13 3`, `6 5`, `7 5`, `11 5`, `12 5`, `6 12`, `12 12` |
| `structure-012b60` | 0–9 | `3 14`, `15 14` |
| `structure-0159d0` | — | `4 1`, `9 1`, `14 1`, `7 2`, `8 2`, `10 2`, `11 2`, `9 3`, `5 4`, `13 4`, `8 6`, `9 6`, `10 6`, `8 8`, `9 8`, `10 8`, `5 10`, `13 10`, `9 11`, `7 12`, `8 12`, `10 12`, `11 12`, `4 13`, `9 13` |
| `structure-01a618` | — | `4 0`, `5 0`, `6 0`, `7 0`, `8 0`, `10 0`, `11 0`, `12 0`, `13 0`, `14 0`, `3 1`, `15 1`, `15 2`, `15 3`, `15 4`, `3 5`, `15 5`, `15 6`, `4 7`, `5 7`, `6 7`, `7 7`, `8 7`, `10 7`, `11 7`, `12 7`, `13 7`, `14 7`, `15 8`, `3 9`, `15 9`, `15 10`, `15 11`, `15 12`, `3 13`, `15 13`, `4 14`, `5 14`, `6 14`, `7 14`, `8 14`, `10 14`, `11 14`, `12 14`, `13 14`, `14 14` |
| `structure-01a690` | 0 | `3 2`, `1 3`, `3 3`, `1 4`, `3 4`, `3 6`, `3 8`, `3 11`, `3 12` |
| `structure-01a73e` | 0, 1, 2, 3, 4, 10 | `2 9` |
| `structure-01d1c0` | 0 | `1 2` |
| `structure-01d1fe` | — | `0 4` |
| `structure-01d550` | 0 | `9 14` |
| `structure-01d716` | 0 | `0 5` |
| `structure-01d728` | 0 | `0 9` |
| `structure-01d73a` | 0, 1 | `0 7` |
| `structure-01d758` | 0, 1, 2, 3, 4, 5, 10 | `0 10` |
| `structure-01d76a` | 0 | `1 12` |
| `structure-01d77c` | 0, 1 | `2 12` |
| `structure-01d78e` | 0, 1 | `2 2` |
| `structure-01d7a0` | 0 | `2 3`, `2 4`, `1 6`, `2 6`, `1 8`, `2 8` |
| `structure-01d7b2` | 0–2 | `1 11` |
| `structure-01d7d0` | 0 | `2 5` |
| `structure-01d7e2` | 0 | `1 9` |
| `structure-01d7f4` | 0–9 | `3 0`, `15 0` |
| `structure-01d806` | 0, 1 | `9 0` |
| `structure-01da22` | 0 | `6 2`, `12 2`, `6 9`, `7 9`, `11 9`, `12 9`, `5 11`, `13 11` |
| `structure-01da34` | 0 | `9 5`, `9 10` |
| `structure-01da46` | 0 | `9 4`, `9 9` |
| `structure-01da58` | 0 | `5 2`, `5 9`, `7 10`, `11 10` |
| `structure-01da6a` | 0 | `7 4`, `11 4`, `13 5`, `13 12` |
| `structure-01da7c` | 0 | `13 2`, `13 9` |
| `structure-01da8e` | 0 | `5 5`, `5 12` |
| `structure-01daa0` | 0 | `14 13` |

#### Dion East

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-015b9e` | — | `69 -15`, `68 -14`, `69 -13`, `66 -12`, `67 -11` |
| `structure-01d550` | 0 | `68 -15`, `65 -12` |
| `structure-01d9e0` | — | `69 -16`, `67 -15`, `67 -14`, `69 -14`, `65 -13`, `66 -13`, `68 -13`, `67 -12`, `66 -11` |
| `structure-01da6a` | 0 | `66 -15`, `65 -14` |
| `structure-01ddac` | 0 | `68 -16`, `66 -14`, `67 -13`, `64 -12`, `65 -11` |
| `structure-01ddbe` | 0, 10 | `70 -16` |
| `structure-01dde2` | 0 | `64 -13` |

#### Dion North

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-015b9e` | — | `69 65`, `68 66`, `69 67`, `66 68`, `67 69` |
| `structure-01d550` | 0 | `68 65`, `65 68` |
| `structure-01d9e0` | — | `69 64`, `67 65`, `67 66`, `69 66`, `65 67`, `66 67`, `68 67`, `67 68`, `66 69` |
| `structure-01da6a` | 0 | `66 65`, `65 66` |
| `structure-01ddac` | 0 | `68 64`, `66 66`, `67 67`, `64 68`, `65 69` |
| `structure-01ddbe` | 0, 10 | `70 64` |
| `structure-01ddd0` | 0 | `64 69` |

### Atropos

#### Atropos Waystation

Inside the `goto` window: `switch atropos`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01d3b2` | 0 | `0 2` |
| `structure-01d3c4` | 0 | `1 0`, `2 0` |
| `structure-01d56a` | — | `2 1` |
| `structure-01d67a` | 0 | `0 1` |
| `structure-01d68c` | 0 | `2 2` |
| `structure-01d69e` | 0–2 | `1 2` |
| `structure-01d6bc` | 0, 1 | `1 1` |

### Clotho

#### Clotho New Town

Inside the `goto` window: `switch clotho`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-0135bc` | 0–4 | `2 1` |
| `structure-01d370` | 0, 10 | `4 0` |
| `structure-01d4ae` | 0 | `3 3`, `6 4`, `7 6` |
| `structure-01d4c0` | 0 | `3 1`, `6 3`, `7 4`, `3 6` |
| `structure-01d77c` | 0, 1 | `6 5` |
| `structure-01dc56` | 0 | `3 7` |
| `structure-01dc68` | 0 | `3 2`, `3 5`, `7 5` |
| `structure-01dc7a` | 0 | `3 4` |
| `structure-01dc8c` | 0 | `1 1` |
| `structure-01dc9e` | 0 | `4 3`, `5 3`, `4 6`, `5 6`, `6 6` |
| `structure-01dcb0` | 0–8 | `1 0` |

### Lachesis

#### Pulvin Mines

No admitted Pose, so no `switch` or `goto`: these are Body Coordinate cells.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01d820` | — | `2645 154`, `2646 154`, `2647 154`, `2648 154`, `2649 154` |

### Gaea

#### Chaldea Metropolis

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-010b7c` | 0, 1, 2, 10 | `-250 -1018` |
| `structure-01c508` | 0, 1 | `-253 -1019`, `-245 -1019`, `-253 -1013`, `-245 -1013` |
| `structure-01d34c` | 0–9 | `-248 -1018` |
| `structure-01d35e` | 0–9 | `-250 -1016`, `-248 -1016` |
| `structure-01d4ae` | 0 | `-245 -1020`, `-245 -1014` |
| `structure-01d4c0` | 0 | `-253 -1020`, `-253 -1014` |
| `structure-01d51a` | 0 | `-249 -1024` |
| `structure-01d806` | 0, 1 | `-253 -1021`, `-245 -1021`, `-253 -1015`, `-245 -1015` |
| `structure-01dc44` | 0 | `-242 -1017` |
| `structure-01dcf2` | 0–2 | `-255 -1023`, `-254 -1023`, `-253 -1023`, `-251 -1023`, `-250 -1023`, `-248 -1023`, `-247 -1023`, `-246 -1023`, `-245 -1023`, `-244 -1023`, `-255 -1020`, `-255 -1014`, `-255 -1011`, `-254 -1011`, `-253 -1011`, `-252 -1011`, `-251 -1011`, `-250 -1011`, `-248 -1011`, `-247 -1011`, `-246 -1011`, `-245 -1011`, `-244 -1011` |
| `structure-01dd16` | 0–2 | `-243 -1023`, `-255 -1022`, `-243 -1022`, `-255 -1021`, `-243 -1021`, `-243 -1020`, `-243 -1014`, `-255 -1013`, `-243 -1013`, `-255 -1012`, `-243 -1012`, `-243 -1011` |
| `structure-01ddf4` | 0–2 | `-252 -1023` |
| `structure-01de72` | 0 | `-249 -1010` |
| `structure-01de84` | 0 | `-256 -1017` |
| `structure-01de96` | 0 | `-255 -1016`, `-254 -1016`, `-253 -1016`, `-252 -1016`, `-251 -1016`, `-250 -1015`, `-250 -1013`, `-250 -1012` |
| `structure-01dea8` | 0 | `-250 -1022`, `-250 -1021`, `-250 -1019`, `-255 -1018`, `-254 -1018`, `-253 -1018`, `-252 -1018`, `-251 -1018` |
| `structure-01deba` | 0 | `-247 -1016`, `-246 -1016`, `-245 -1016`, `-244 -1016`, `-243 -1016`, `-248 -1015`, `-248 -1013`, `-248 -1012` |
| `structure-01decc` | 0 | `-248 -1022`, `-248 -1021`, `-248 -1019`, `-247 -1018`, `-246 -1018`, `-245 -1018`, `-244 -1018`, `-243 -1018` |
| `structure-01dede` | 0–4 | `-252 -1020`, `-251 -1020`, `-250 -1020`, `-252 -1014`, `-251 -1014`, `-250 -1014` |
| `structure-01def0` | 0–4 | `-248 -1020`, `-247 -1020`, `-246 -1020`, `-248 -1014`, `-247 -1014`, `-246 -1014` |

#### Ur City

Ur City holds two overlapping structure sets at the same cells: the
`gaea-surface-*` set and the `gaea-ur-city-surface-*` set captured from the
live workspace. Where both occupy a cell, the port binds whichever it meets
first, so some cells below are listed twice.

Inside the `goto` window: `switch gaea-ur-city-4-2`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-010ea8` | 0, 1 | `2 11` |
| `structure-011ada` | 0, 10 | `1 5` |
| `structure-012136` | — | `5 3`, `13 3`, `6 5`, `7 5`, `11 5`, `12 5`, `6 12`, `12 12` |
| `structure-012b60` | 0–9 | `3 14` |
| `structure-0159d0` | — | `4 1`, `9 1`, `14 1`, `7 2`, `8 2`, `10 2`, `11 2`, `9 3`, `5 4`, `13 4`, `8 6`, `9 6`, `10 6`, `8 8`, `9 8`, `10 8`, `5 10`, `13 10`, `9 11`, `7 12`, `8 12`, `10 12`, `11 12`, `4 13`, `9 13` |
| `structure-015eea` | — | `9 3` |
| `structure-0172f4` | 0–2 | `0 2`, `0 3` |
| `structure-01a690` | 0 | `1 3`, `1 4` |
| `structure-01a73e` | 0, 1, 2, 3, 4, 10 | `2 9` |
| `structure-01c508` | 0, 1 | `1 3` |
| `structure-01d1c0` | 0 | `1 2` |
| `structure-01d1fe` | — | `0 4` |
| `structure-01d394` | 0, 10 | `3 0`, `9 2` |
| `structure-01d4ae` | 0 | `5 1`, `8 2` |
| `structure-01d4c0` | 0 | `4 1`, `6 1`, `4 2`, `6 2`, `7 2` |
| `structure-01d4d2` | 0, 1, 2, 3, 4, 5, 10 | `1 2`, `5 2` |
| `structure-01d4e4` | 0–2 | `2 2`, `2 3` |
| `structure-01d4f6` | 0–2 | `4 0` |
| `structure-01d508` | 0–2 | `2 0`, `5 0` |
| `structure-01d51a` | 0 | `0 1` |
| `structure-01d52c` | 0 | `7 1` |
| `structure-01d716` | 0 | `0 5` |
| `structure-01d728` | 0 | `0 9` |
| `structure-01d73a` | 0, 1 | `0 7` |
| `structure-01d758` | 0, 1, 2, 3, 4, 5, 10 | `0 10` |
| `structure-01d76a` | 0 | `1 12` |
| `structure-01d77c` | 0, 1 | `2 12` |
| `structure-01d78e` | 0, 1 | `2 2` |
| `structure-01d7a0` | 0 | `2 3`, `2 4`, `1 6`, `2 6`, `1 8`, `2 8` |
| `structure-01d7b2` | 0–2 | `1 11` |
| `structure-01d7d0` | 0 | `2 5` |
| `structure-01d7e2` | 0 | `1 9` |
| `structure-01da22` | 0 | `6 2`, `12 2`, `6 9`, `7 9`, `11 9`, `12 9`, `5 11`, `13 11` |
| `structure-01da34` | 0 | `9 5`, `9 10` |
| `structure-01da46` | 0 | `9 4`, `9 9` |
| `structure-01da58` | 0 | `5 2`, `5 9`, `7 10`, `11 10` |
| `structure-01da6a` | 0 | `7 4`, `11 4`, `13 5`, `13 12` |
| `structure-01da7c` | 0 | `13 2`, `13 9` |
| `structure-01da8e` | 0 | `5 5`, `5 12` |
| `structure-01daa0` | 0 | `14 13` |

#### Unnamed Island (3072, 256)

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-0122fa` | 0 | `2568 -1528` |

### Cyclopes

#### Idi Centre

Inside the `goto` window: `switch cyclopes`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00f5ae` | — | `1 0`, `2 0`, `3 0`, `1 4`, `2 4`, `3 4` |
| `structure-01d6ce` | 0 | `1 3`, `3 3` |
| `structure-01d6e0` | 0 | `1 1`, `3 1` |
| `structure-01d6f2` | 0 | `2 1`, `1 2`, `3 2`, `2 3` |
| `structure-01d704` | 0 | `2 2` |

### Eris

#### Bare Island

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00f850` | 0 | `3009 385`, `3010 386` |
| `structure-010176` | 0 | `3015 387` |
| `structure-011ada` | 0, 10 | `3013 389` |
| `structure-01a708` | 0 | `3009 386`, `3010 387`, `3011 387`, `3012 388`, `3013 388` |
| `structure-01a71a` | 0 | `3010 385`, `3011 386`, `3011 388` |
| `structure-01a72c` | 0 | `3010 388` |
| `structure-01a73e` | 0, 1, 2, 3, 4, 10 | `3014 389` |
| `structure-01a750` | 0–9 | `3015 388` |
| `structure-01a762` | 0, 10 | `3015 385`, `3014 387` |
| `structure-01d164` | 0, 1 | `3014 390` |
| `structure-01d176` | 0 | `3013 386` |
| `structure-01d188` | 0, 1, 2, 3, 4, 5, 10 | `3014 386` |
| `structure-01d1a2` | — | `3015 386`, `3014 388` |
| `structure-01d1c0` | 0 | `3010 390` |
| `structure-01d1d2` | 0 | `3012 389`, `3012 390`, `3010 391`, `3011 391`, `3012 391` |

#### Capital City

Inside the `goto` window: `switch eris-spaceport-onfoot`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00ed8e` | — | `13 6`, `9 9` |
| `structure-00ef8c` | 0 | `11 7`, `14 11` |
| `structure-00f862` | 0 | `0 2`, `11 6` |
| `structure-00f874` | 0 | `0 3` |
| `structure-00f88e` | — | `3 5` |
| `structure-00fc52` | 0–10 | `15 13`, `15 14` |
| `structure-00feb4` | 0, 10 | `11 8` |
| `structure-010140` | 0 | `11 4`, `13 4` |
| `structure-010152` | 0 | `2 5` |
| `structure-010176` | 0 | `10 9`, `8 13` |
| `structure-010188` | 0, 1, 2, 10 | `15 12` |
| `structure-011ada` | 0, 10 | `1 14` |
| `structure-0127f0` | 0, 1, 2, 3, 4, 10 | `1 1` |
| `structure-01484e` | — | `7 8` |
| `structure-014ad2` | 0, 1, 2, 10 | `9 8` |
| `structure-01560c` | — | `14 5` |
| `structure-015eea` | — | `12 3`, `13 3`, `14 3`, `15 3`, `8 14` |
| `structure-01832e` | — | `2 1` |
| `structure-0188d2` | — | `6 3` |
| `structure-01a5d8` | 0 | `4 2`, `6 4`, `12 5` |
| `structure-01a618` | — | `3 3`, `4 5`, `4 6`, `4 7`, `4 8`, `5 9`, `6 9`, `7 9`, `8 9`, `9 10`, `9 11`, `9 12`, `14 12`, `9 13`, `10 13`, `11 13`, `12 13`, `13 13`, `14 13` |
| `structure-01a648` | 0, 10 | `9 2` |
| `structure-01a65a` | 0 | `5 4` |
| `structure-01a66c` | 0, 1, 2, 3, 4, 10 | `1 3` |
| `structure-01a67e` | 0 | `2 4` |
| `structure-01a690` | 0 | `2 2` |
| `structure-01a6a2` | 0, 10 | `1 4` |
| `structure-01a6c0` | 0–10 | `12 14`, `13 14`, `14 14` |
| `structure-01a6d2` | 0 | `3 11` |
| `structure-01a6e4` | 0 | `5 11` |
| `structure-01a6f6` | 0 | `0 4`, `1 5` |
| `structure-01a774` | 0 | `4 1`, `3 2`, `5 3`, `3 4` |
| `structure-01a786` | 0 | `7 3`, `3 6` |
| `structure-01baa6` | — | `4 4` |
| `structure-01c508` | 0, 1 | `4 11` |
| `structure-01dea8` | 0 | `4 10` |
| `structure-01decc` | 0 | `13 15`, `14 15`, `15 15` |

#### Key West

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00f850` | 0 | `2496 3461` |
| `structure-00f874` | 0 | `2499 3459` |
| `structure-00f88e` | — | `2501 3460` |
| `structure-010152` | 0 | `2500 3460` |
| `structure-01484e` | — | `2496 3463` |
| `structure-015eea` | — | `2503 3466`, `2502 3467` |
| `structure-0172f4` | 0–2 | `2499 3458` |
| `structure-01a6c0` | 0–10 | `2503 3463` |
| `structure-01a6f6` | 0 | `2499 3460` |
| `structure-01a708` | 0 | `2496 3462`, `2497 3462`, `2498 3463` |
| `structure-01a71a` | 0 | `2497 3461`, `2497 3463` |
| `structure-01a774` | 0 | `2501 3459` |
| `structure-01a786` | 0 | `2501 3461` |
| `structure-01d176` | 0 | `2499 3464` |
| `structure-01d1a2` | — | `2502 3463` |
| `structure-01d1c0` | 0 | `2496 3465` |
| `structure-01d1d2` | 0 | `2498 3464`, `2498 3465`, `2496 3466`, `2497 3466`, `2498 3466` |
| `structure-01d1e4` | 0–4 | `2500 3464`, `2501 3464` |
| `structure-01d4ae` | 0 | `2502 3457`, `2502 3458` |
| `structure-01d4c0` | 0 | `2501 3457`, `2500 3458`, `2501 3458` |
| `structure-01d4f6` | 0–2 | `2501 3456` |
| `structure-01d508` | 0–2 | `2502 3456` |
| `structure-01dd16` | 0–2 | `2502 3465`, `2503 3465`, `2502 3466` |
| `structure-01dd3a` | 0–2 | `2505 3464` |
| `structure-01decc` | 0 | `2504 3464` |

#### Snow Island

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00f1fe` | — | `-28 931`, `-27 931`, `-25 933`, `-25 936`, `-24 936` |
| `structure-011c38` | 0, 10 | `-26 932` |
| `structure-01bc9a` | — | `-31 929`, `-30 929`, `-29 929`, `-28 929`, `-29 930`, `-24 932`, `-27 934`, `-26 934`, `-25 934` |
| `structure-01d1c0` | 0 | `-26 930` |
| `structure-01d53e` | 0 | `-29 931`, `-25 931`, `-25 935` |
| `structure-01d550` | 0 | `-29 932` |
| `structure-01dab2` | 0 | `-29 928` |

#### Velos City

Outside the `goto` window: these are the cells `where` reports there.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00f850` | 0 | `1473 641`, `1474 642` |
| `structure-00f874` | 0 | `1475 645`, `1475 646` |
| `structure-010176` | 0 | `1474 643` |
| `structure-0188d2` | — | `1478 643` |
| `structure-01a5d8` | 0 | `1478 644` |
| `structure-01a65a` | 0 | `1477 644` |
| `structure-01a708` | 0 | `1473 642` |
| `structure-01a71a` | 0 | `1474 641` |
| `structure-01a774` | 0 | `1477 643` |
| `structure-01a786` | 0 | `1479 643` |
| `structure-01d35e` | 0–9 | `1476 641`, `1476 645` |
| `structure-01d550` | 0 | `1476 646`, `1475 647` |
| `structure-01dcf2` | 0–2 | `1475 642`, `1474 644`, `1475 644` |
| `structure-01dd16` | 0–2 | `1476 643` |

### Solon

#### Solon Base

Inside the `goto` window: `switch solon`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01ba8c` | 0, 10 | `1 1` |

### Theon

#### Theon Base

Inside the `goto` window: `switch theon`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01d56a` | — | `3 1`, `3 2`, `2 3` |
| `structure-01dbc6` | 0 | `1 1` |
| `structure-01dbd8` | 0 | `1 3` |

### Vesta

#### Politburo City

Inside the `goto` window: `switch vesta-parliament-4-6`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01454e` | 0, 1, 2, 3, 10 | `4 6` |
| `structure-01484e` | — | `0 4` |
| `structure-01d1e4` | 0–4 | `2 3`, `1 4`, `2 4` |
| `structure-01d1fe` | — | `4 0` |
| `structure-01d51a` | 0 | `7 3` |
| `structure-01dd16` | 0–2 | `4 1`, `3 2`, `4 2`, `3 5`, `3 6` |
| `structure-01dd3a` | 0–2 | `6 4` |
| `structure-01dd58` | 0, 1 | `3 7` |
| `structure-01dd6a` | 0 | `1 3` |
| `structure-01dd7c` | 0–8 | `5 4` |
| `structure-01dd8e` | 0–2 | `3 1` |
| `structure-01decc` | 0 | `5 3`, `6 3` |

### Metis

#### Metis Moonbase

Inside the `goto` window: `switch metis`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00f342` | — | `5 6` |
| `structure-01d1e4` | 0–4 | `3 0`, `1 1`, `2 1`, `3 1` |
| `structure-01d1fe` | — | `2 0` |
| `structure-01d34c` | 0–9 | `4 0`, `0 1` |
| `structure-01d35e` | 0–9 | `0 2`, `0 3`, `0 4`, `0 5`, `0 6` |
| `structure-01dac4` | 0 | `2 6` |
| `structure-01dcd4` | 0–2 | `1 3` |
| `structure-01dcf2` | 0–2 | `2 2`, `3 2`, `2 4` |
| `structure-01dd04` | 0–2 | `3 4` |
| `structure-01dd16` | 0–2 | `4 3`, `4 4` |

### Logos

#### Logos City

Inside the `goto` window: `switch logos`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-012f5e` | 0, 1, 2, 3, 4, 5, 10 | `3 3`, `4 3`, `5 3` |
| `structure-01d716` | 0 | `8 1`, `8 2` |
| `structure-01d7b2` | 0–2 | `2 5` |
| `structure-01db48` | 0 | `6 0` |
| `structure-01db7e` | 0 | `7 0`, `8 0`, `6 2`, `7 3` |
| `structure-01dbb4` | 0 | `8 3` |
| `structure-01ddf4` | 0–2 | `3 5`, `2 6` |
| `structure-01de06` | 0–2 | `3 6` |
| `structure-01de18` | 0–2 | `4 5`, `4 6` |
| `structure-01de2a` | 0–9 | `2 4` |
| `structure-01de3c` | 0–9 | `2 2` |
| `structure-01de4e` | 0–4 | `3 2`, `4 2`, `5 2` |
| `structure-01de60` | 0 | `6 3` |

### Pan

#### Pan Hades Labourcamp

Inside the `goto` window: `switch pan`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-0127f0` | 0, 1, 2, 3, 4, 10 | `4 1` |
| `structure-01bb46` | — | `1 1`, `0 2`, `2 2` |
| `structure-01d820` | — | `1 4`, `2 4`, `3 4` |
| `structure-01dac4` | 0 | `0 1`, `2 1`, `1 2` |

### Thalia

#### Thalia Base Camp

Inside the `goto` window: `switch thalia`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01832e` | — | `3 1`, `3 2`, `4 2`, `4 4` |
| `structure-01dae8` | 0, 10 | `1 1`, `5 1`, `5 4` |
| `structure-01db06` | 0, 10 | `5 2` |
| `structure-01db24` | 0 | `2 4` |
| `structure-01db36` | 0 | `2 2` |

### Bacchus

#### Bacchus Waystation

Inside the `goto` window: `switch bacchus`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01d78e` | 0, 1 | `1 2` |
| `structure-01d86a` | — | `1 1`, `0 2`, `2 2`, `1 7`, `2 7` |
| `structure-01dbfc` | 0 | `0 1`, `2 1` |
| `structure-01dc0e` | 0 | `0 3` |
| `structure-01dc20` | 0 | `1 3` |
| `structure-01dc32` | 0 | `2 3`, `1 4`, `2 4`, `1 5`, `2 5`, `1 6`, `2 6` |
| `structure-01dc44` | 0 | `1 8`, `2 8` |

### Tolosa

#### Eris Bank Repository

Inside the `goto` window: `switch tolosa`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00ed8e` | — | `4 0`, `1 4` |
| `structure-010b9a` | 0 | `1 1`, `1 3`, `2 3` |
| `structure-01bb46` | — | `2 0` |
| `structure-01be44` | — | `2 1` |
| `structure-01c3dc` | — | `3 1` |
| `structure-01d316` | 0 | `1 0` |
| `structure-01dbd8` | 0 | `4 1`, `2 4` |
| `structure-01dbea` | 0 | `3 0`, `1 2`, `2 2` |

### Perseus

#### Alkane Base

Inside the `goto` window: `switch perseus`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-00f0b8` | — | `4 5`, `5 5`, `5 6`, `6 6`, `4 7`, `6 7` |
| `structure-01dae8` | 0, 10 | `4 6` |
| `structure-01db06` | 0, 10 | `4 1` |
| `structure-01dcc2` | 0 | `5 2` |

### Mentor

#### Mentor Waystation

Inside the `goto` window: `switch mentor`, then `goto` the cell.

| Model | Floors | Cells |
| --- | --- | --- |
| `structure-01d8b4` | — | `2 0` |
| `structure-01db48` | 0 | `1 1` |
| `structure-01db5a` | 0 | `9 7` |
| `structure-01db6c` | 0 | `8 8` |
| `structure-01db7e` | 0 | `2 1`, `4 3`, `6 5`, `8 7` |
| `structure-01db90` | 0 | `3 1`, `4 2`, `5 3`, `6 4`, `7 5`, `8 6` |
| `structure-01dba2` | 0 | `2 2`, `3 3`, `4 4`, `5 5`, `6 6`, `7 7` |
| `structure-01dbb4` | 0 | `3 2`, `5 4`, `7 6` |

## Sources

- Structure instances, islands, and place names:
  [`payload/damocles/catalogue.json`](../payload/damocles/catalogue.json).
- Floor Tables: each model's `levelBinding` in
  [`payload/damocles/models/`](../payload/damocles/models/).
- Pose workspace origins:
  [`payload/damocles/arrival-poses.json`](../payload/damocles/arrival-poses.json).
