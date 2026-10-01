# Damocles object locations

This is the complete census of Damocles's 241 catalogued object slots. Object
slots are stable identities used by the Catalogue, Saves, the Carried Stack, craft
occupancy, and the Shell Console commands `get <object-slot>` and
`drop <object-slot>`. Structures are catalogued separately in
[Damocles structure locations](damocles-structure-locations.md); Targ's objects are
in [Object locations](object-locations.md).

The table records each object's **initial** residence. Objects can subsequently
be carried, boarded, dropped, or moved by scripts.

<!-- Generated from payload/damocles/catalogue.json and payload/damocles/arrival-poses.json. -->

## Reading the table

- **Body** is the name `switch <body>` takes. Where a Body has more than one
  admitted Pose, `switch` needs the Pose instead; the
  [Body table](#bodies-and-switch-targets) gives one.
- **Area** is the island the object lies on. **Host** is the structure it is a
  resident of: its decoded place name where there is one, otherwise its
  Catalogue instance identity (see
  [Structure identities](damocles-structure-locations.md#structure-identities)).
  A dash means it stands on open ground.
- **Cell** is where to stand. `goto x z` is shown where the cell is inside the
  Body's 16 by 16 `goto` window. Otherwise it is the cell `where` reports once
  you arrive (`where` prints it as `x-z`), which lies outside that window (another island on the same Body),
  so walk or fly there.
- **Floor** is the `floor <n>` number for a structure resident. Floor 0 is the
  ground floor.
- **Exact X, Z** is the object's position in the units `where` prints.
- **Take** says whether `get` can take it. Craft and fixed objects refuse.

| Slot | Name | Body | Area | Host | Cell | Floor | Exact X, Z | Take |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
|   1 | DART II | Eris | Key West | — | `2496, 3463` | — | `167804016, 235373159` | no |
|   2 | 99 CHEVY | Gaea | Ur City | — | `goto 7 1` | — | `34045117, 117537966` | no |
|   3 | EAGLE NINE S E | Eris | Capital City | — | `goto 9 9` | — | `4817957, 9012078` | no |
|   4 | BESTCUPAND CRAFT | Eris | Capital City | — | `goto 8 14` | — | `4752327, 9339395` | no |
|   5 | V.I.P. LIMO | Eris | Capital City | CAPITAL SPACEPORT | `goto 7 8` | — | `4686728, 8943983` | no |
|   6 | TARG TOURER | Dion | Birmingham Island | — | `goto 3 14` | — | `213350159, 87063366` | no |
|   7 | INTERSTELLARSHIP | Eris | Capital City | — | `goto 7 8` | — | `4681905, 8940589` | no |
|   8 | NEUTRON FUEL | — | Out of world | — | — | — | — | yes |
|  10 | CONCORD III | Bacchus | Bacchus Waystation | — | `goto 2 8` | — | `109019852, 104498659` | no |
|  11 | ATTACK SHIP | — | Out of world | — | — | — | — | no |
|  12 | BULLET | Thalia | Thalia Base Camp | — | `goto 6 3` | — | `131432890, 213614273` | no |
|  13 | 22 CV | Gaea | Chaldea Metropolis | — | `-248, -1016` | — | `17336390, 50889719` | no |
|  14 | AUTHOR'S CHAIR | Dion | Birmingham Island | `dion-surface-de` | `goto 14 13` | 0 | `214073125, 86998619` | yes |
|  15 | NEUTRON FUEL | — | Out of world | — | — | — | — | yes |
|  26 | COOKER | Gaea | Ur City | `gaea-ur-city-surface-39` | `goto 9 3` | 0 | `34176787, 117670408` | yes |
|  27 | SETTEE | Gaea | Chaldea Metropolis | BANK OF GAEA HQ | `-250, -1018` | 1 | `17201121, 50756597` | yes |
|  28 | KITCHEN SINK | Gaea | Chaldea Metropolis | MARILLION APARTMENTS | `-252, -1023` | 0 | `17071734, 50433728` | yes |
|  30 | DOOR KEY A | Gaea | Chaldea Metropolis | `gaea-chaldea-metropolis-surface-d4` | `-252, -1011` | 2 | `17071714, 51220044` | yes |
|  31 | DOOR KEY A | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 10 | `201755016, 33914960` | yes |
|  32 | DOOR KEY A | Metis | Metis Moonbase | `metis-surface-31` | `goto 1 3` | 0 | `165706854, 70088900` | yes |
|  33 | DOOR KEY A | Dion | Dion East | ANNIES BAR | `70, -16` | 0 | `217744630, 85099933` | yes |
|  34 | DOOR KEY A | Dion | Birmingham Island | `dion-surface-e3` | `goto 3 14` | 9 | `213351799, 87064891` | yes |
|  35 | DOOR KEY A | Eris | Capital City | LAWSON BANK HQ | `goto 15 12` | 2 | `5212253, 9208260` | yes |
|  36 | DOOR KEY A | Midas | The Midas Project | `midas-the-midas-project-surface-899-396` | `546, -3086` | 0 | `58949702, 25985016` | yes |
|  37 | DOOR KEY A | Midas | The Midas Project | `midas-the-midas-project-surface-904-393` | `551, -3089` | 0 | `59277340, 25788498` | yes |
|  38 | DOOR KEY A | Dion | Birmingham Island | `dion-surface-33` | `goto 3 3` | 0 | `213351265, 86344771` | yes |
|  39 | DOOR KEY A | Midas | The Midas Project | `midas-the-midas-project-surface-916-396` | `563, -3086` | 0 | `60063791, 25985064` | yes |
|  40 | STANDARD LAMP | Eris | Velos City | EKMPV & S AD AGENCY | `1476, 645` | 1 | `100960472, 50693598` | yes |
|  41 | WINE KEG | Eris | Snow Island | HATHAWAYS WINE BAR | `-26, 932` | 10 | `2523722, 69499239` | yes |
|  42 | PROCESSORS DESK | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 4 | `201755464, 33915493` | yes |
|  43 | PROCESSORS CHAIR | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 4 | `201755488, 33915385` | yes |
|  44 | ANTIQUE CLOCK | Eris | Key West | `eris-key-west-surface-89` | `2505, 3464` | 1 | `168394435, 235437408` | yes |
|  45 | BOTTLE | Eris | Snow Island | HATHAWAYS WINE BAR | `-26, 932` | 0 | `2523793, 69499357` | yes |
|  46 | AMPLIFIER | Cyclopes | Idi Centre | IDI PALACE OF FUN | `goto 2 2` | 0 | `228687838, 94863944` | yes |
|  47 | 25,000,000 ECU | Eris | Capital City | LAWSON BANK HQ | `goto 15 12` | 10 | `5211991, 9207662` | yes |
|  48 | VIDEO PLAYER | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 2 | `100959752, 50431657` | yes |
|  49 | READING GLASSES | Lucan | Unnamed Island (100, 3923) | — | `-3796, 3930` | — | `6610330, 257567824` | yes |
|  50 | BATH | Dion | Birmingham Island | `dion-surface-09` | `goto 9 0` | 0 | `213746603, 86143933` | yes |
|  51 | TOWEL RAIL | Dion | Birmingham Island | `dion-surface-09` | `goto 9 0` | 0 | `213746587, 86143735` | yes |
|  52 | SHOWER | Gaea | Ur City | GUM STORE | `goto 1 3` | 0 | `33652110, 117670314` | yes |
|  53 | BLUE BEACON LOCR | Mentor | Mentor Waystation | `mentor-surface-12` | `goto 2 1` | 0 | `184780467, 17663034` | yes |
|  54 | RED BEACON LOCTR | Vesta | Politburo City | — | `goto 4 4` | — | `71270404, 20414452` | yes |
|  55 | GOLD | Solon | Solon Base | PENN COLLEGE | `goto 1 1` | 10 | `260536304, 91586786` | yes |
|  56 | A TO Z COMPUTER | Eris | Capital City | ERIS POST OFFICE HQ | `goto 12 14` | 1 | `5014674, 9337758` | yes |
|  57 | SIGHTS | Eris | Capital City | PLAYTESTER STORES | `goto 1 14` | 10 | `4293333, 9337592` | yes |
|  58 | LIFE SUPPORT | Perseus | Alkane Base | EMERGENCY FACILITY | `goto 4 1` | 10 | `251559546, 53903671` | yes |
|  59 | STOOL | Solon | Solon Base | PENN COLLEGE | `goto 1 1` | 10 | `260537669, 91587051` | yes |
|  60 | CHAIR | Eris | Snow Island | HATHAWAYS WINE BAR | `-26, 932` | 0 | `2523804, 69499239` | yes |
|  61 | TABLE | Eris | Snow Island | HATHAWAYS WINE BAR | `-26, 932` | 0 | `2523793, 69499357` | yes |
|  63 | RUG | Dion | Birmingham Island | `dion-surface-c2` | `goto 2 12` | 1 | `213286657, 86936074` | yes |
|  64 | TRANSPORTER a | Gaea | Ur City | HANTZENS NEW HOUSE | `goto 7 1` | 0 | `34047111, 117536160` | no |
|  65 | TRANSPORTER a | Eris | Bare Island | HANTZEN SALES | `3014, 386` | 0 | `201751214, 33716015` | no |
|  66 | TRANSPORTER a | Dion | Birmingham Island | `dion-surface-e3` | `goto 3 14` | 1 | `213351261, 87065200` | no |
|  67 | TRANSPORTER a | Metis | Metis Moonbase | DOOBERRYS SOLICITORS | `goto 0 6` | 9 | `165642624, 70289156` | no |
|  68 | TRANSPORTER a | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 10 | `71269024, 20547355` | no |
|  69 | TRANSPORTER a | Eris | Capital City | `eris-surface-8b` | `goto 11 8` | 10 | `4945724, 8944934` | no |
|  70 | TRANSPORTER a | Gaea | Chaldea Metropolis | TRADE COMMISSION | `-248, -1016` | 1 | `17334469, 50890420` | no |
|  71 | TRANSPORTER a | Logos | Logos City | D.H.S.S. HOUSE | `goto 4 2` | 4 | `85098916, 173702288` | no |
|  72 | TRANSPORTER a | Bacchus | Bacchus Waystation | — | `goto 2 8` | — | `109020372, 104496864` | no |
|  73 | TRANSPORTER a | Mentor | Mentor Waystation | — | `goto 9 7` | — | `185238238, 18055502` | no |
|  74 | Unnamed | — | Out of world | — | — | — | — | no |
|  75 | EXPLOSIVE | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 3 | `201754708, 33915790` | yes |
|  76 | EXPLOSIVE | Eris | Snow Island | HATHAWAYS WINE BAR | `-26, 932` | 10 | `2523811, 69499978` | yes |
|  77 | EXPLOSIVE | Dion | Dion North | `dion-dion-north-surface-50` | `64, 69` | 0 | `217350143, 90669269` | yes |
|  78 | EXPLOSIVE | Gaea | Ur City | INDUSTRIAL CO-OP HSE1 | `goto 1 2` | 10 | `33649940, 117605893` | yes |
|  79 | EXPLOSIVE | Gaea | Ur City | INDUSTRIAL CO-OP HSE2 | `goto 5 2` | 10 | `33912120, 117605922` | yes |
|  80 | EXPLOSIVE | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 3 | `201754708, 33915790` | yes |
|  81 | EXPLOSIVE | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 3 | `201754666, 33915298` | yes |
|  82 | EXPLOSIVE | Theon | Theon Base | BURDOCK MEDIA LINK | `goto 2 3` | 0 | `167019582, 218726695` | yes |
|  83 | EXPLOSIVE | Gaea | Unnamed Island (3072, 256) | — | `2568, -1528` | — | `201851823, 17344298` | yes |
|  84 | SIDEBOARD | Gaea | Ur City | HANTZENS NEW HOUSE | `goto 7 1` | 0 | `34048207, 117536619` | yes |
|  85 | CUPBOARD | Eris | Snow Island | POSTOFFICE SORTING | `-29, 928` | 0 | `2325110, 69240125` | yes |
|  86 | HI-FI | Gaea | Chaldea Metropolis | MEGA TRADING | `-251, -1018` | 0 | `17138205, 50755913` | yes |
|  87 | WASHBASIN | Metis | Metis Moonbase | NIXON INTR COURT | `goto 5 6` | 0 | `165967895, 70291630` | yes |
|  88 | BOOKCASE | Solon | Solon Base | PENN COLLEGE | `goto 1 1` | 10 | `260537507, 91587051` | yes |
|  89 | WELSH DRESSER | Mentor | Mentor Waystation | `mentor-surface-45` | `goto 5 4` | 0 | `184973610, 17857400` | yes |
|  90 | WARDROBE | Gaea | Chaldea Metropolis | MARILLION APARTMENTS | `-252, -1023` | 0 | `17072177, 50432033` | yes |
|  91 | RED HERRING | Icarus | Takoushi Base | `icarus-surface-12` | `goto 2 1` | 0 | `41057374, 45188735` | yes |
|  92 | SUNSHADE | Eris | Capital City | — | `goto 12 4` | — | `5015313, 8681582` | yes |
|  93 | TV CONTROL | Eris | Velos City | `eris-velos-city-surface-73` | `1475, 647` | 0 | `100893176, 50824757` | yes |
|  94 | CASH REGISTER | Vesta | Politburo City | GUM STORE | `goto 3 7` | 1 | `71205317, 20613008` | yes |
|  95 | MAGIC CRYSTAL | Midas | The Midas Project | `midas-the-midas-project-surface-2364-376` | `2011, -3106` | 0 | `154959864, 24674201` | yes |
|  96 | FIREPLACE | Clotho | Clotho New Town | `clotho-surface-11` | `goto 1 1` | 0 | `158762471, 19757249` | yes |
|  97 | LIFE SUPPORT | Perseus | Alkane Base | EMERGENCY FACILITY | `goto 4 6` | 10 | `251559092, 54228951` | yes |
|  98 | COOKER | Gaea | Chaldea Metropolis | MARILLION APARTMENTS | `-252, -1023` | 1 | `17071901, 50433726` | yes |
|  99 | COMMUCAT CONSOLE | Acheron | Acheron Retreat | THE TOMB OF SETH | `goto 1 1` | 0 | `224166179, 19628370` | yes |
| 100 | COMMUCAT CONSOLE | Theon | Theon Base | ERIS TV MEDIA LINK | `goto 3 1` | 0 | `167084985, 218595656` | yes |
| 101 | AUTHORS COMPUTER | Dion | Birmingham Island | `dion-surface-de` | `goto 14 13` | 0 | `214073154, 86998749` | yes |
| 102 | NOVAGEN SAFE | Dion | Birmingham Island | `dion-surface-b2` | `goto 2 11` | 1 | `213286008, 86867329` | yes |
| 103 | WALLCLOCK | Gaea | Chaldea Metropolis | MARILLION APARTMENTS | `-252, -1023` | 0 | `17072307, 50432023` | yes |
| 104 | G'HOUSE EFFECT | Dion | Dion East | `dion-dion-east-surface-30` | `64, -13` | 0 | `217349784, 85295018` | yes |
| 105 | KINGSIZE SPANNER | Eris | Capital City | GUM STORE | `goto 4 11` | 0 | `4488378, 9143988` | yes |
| 106 | WALL PHONE | Metis | Metis Moonbase | NIXON INTR COURT | `goto 5 6` | 0 | `165968096, 70288561` | yes |
| 107 | BATTERY | Perseus | Alkane Base | RESEARCH LABORATORY | `goto 5 2` | 0 | `251625249, 53966174` | yes |
| 108 | BRIEFCASE | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 3 | `71270737, 20547426` | yes |
| 109 | RUBBISH BIN | Dion | Birmingham Island | `dion-surface-b2` | `goto 2 11` | 0 | `213284516, 86866337` | yes |
| 110 | AIR CONDITIONER | Eris | Capital City | STATE OFFICE | `goto 9 8` | 1 | `4817132, 8944301` | yes |
| 111 | NOVAGEN CABINET | Dion | Birmingham Island | `dion-surface-b2` | `goto 2 11` | 1 | `213284229, 86866148` | yes |
| 112 | MUSEUM GUIDE | Cronus | Cronus Museum | — | `goto 5 5` | — | `168393637, 57572360` | yes |
| 113 | FRIDGE | Eris | Snow Island | TRADING POST | `-29, 932` | 0 | `2327020, 69502500` | yes |
| 114 | TABLE | Metis | Metis Moonbase | NIXON INTR COURT | `goto 5 6` | 0 | `165967374, 70291493` | yes |
| 115 | BENCH | Eris | Capital City | STATE OFFICE | `goto 9 8` | 2 | `4816960, 8944009` | yes |
| 116 | CHAIR | Clotho | Clotho New Town | `clotho-surface-11` | `goto 1 1` | 0 | `158762537, 19757453` | yes |
| 117 | TELEVISION | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 9 | `100960433, 50431784` | yes |
| 118 | COFFEE TABLE | Eris | Capital City | STATE OFFICE | `goto 9 8` | 0 | `4817622, 8943877` | yes |
| 119 | C.B. RIG | Mentor | Mentor Waystation | `mentor-surface-34` | `goto 4 3` | 0 | `184911512, 17794143` | yes |
| 120 | HAMMER | Dion | Dion North | `dion-dion-north-surface-41` | `65, 68` | 0 | `217417806, 90604707` | yes |
| 121 | GHETTOBLASTER | Logos | Logos City | CHARLENES DISCO | `goto 6 3` | 0 | `85229071, 173771693` | yes |
| 122 | TABLE LAMP | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 4 | `158826428, 19759981` | yes |
| 123 | STORAGE BOXES | Eris | Snow Island | POSTOFFICE SORTING | `-29, 928` | 0 | `2324786, 69239662` | yes |
| 124 | ELECTRIC FIRE | Eris | Capital City | MOORBY SCH OF FLYING | `goto 9 9` | 0 | `4819317, 9012203` | yes |
| 125 | RECEIPT | Gaea | Chaldea Metropolis | BANK OF GAEA HQ | `-250, -1018` | 1 | `17201791, 50756105` | yes |
| 126 | DAVYJONES LOCKER | Perseus | Alkane Base | RESEARCH LABORATORY | `goto 5 2` | 0 | `251625985, 53966954` | yes |
| 127 | SUNGLASSES | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 4 | `158826934, 19758000` | yes |
| 128 | WASHING MACHINE | Dion | Birmingham Island | `dion-surface-22` | `goto 2 2` | 0 | `213287268, 86275339` | yes |
| 129 | BATHROOM SCALES | Clotho | Clotho New Town | `clotho-surface-04` | `goto 4 0` | 10 | `158957369, 19693789` | yes |
| 130 | FISHTANK | Bacchus | Bacchus Waystation | `bacchus-surface-21` | `goto 1 2` | 0 | `108954227, 104102780` | yes |
| 131 | BOOK | Eris | Capital City | `eris-surface-fd` | `goto 13 15` | 0 | `5076955, 9401464` | yes |
| 132 | ANTIQUE SEXTANT | Mentor | Mentor Waystation | `mentor-surface-56` | `goto 6 5` | 0 | `185042654, 17925175` | yes |
| 133 | FILOFAX | Metis | Metis Moonbase | DOOBERRYS SOLICITORS | `goto 0 6` | 9 | `165642643, 70288862` | yes |
| 134 | PRESSURE SUIT | Eris | Capital City | `eris-surface-3f` | `goto 15 3` | 0 | `5208932, 8619045` | yes |
| 135 | ACME UNIVERSAL | Dion | Birmingham Island | `dion-surface-e9` | `goto 9 14` | 0 | `213746178, 87065323` | yes |
| 136 | HEAT RESIST SUIT | Eris | Capital City | ERIS POWER GENERATION | `goto 14 5` | 0 | `5142990, 8749778` | yes |
| 137 | THERMAL UNDIES | Eris | Bare Island | `eris-bare-island-surface-66` | `3014, 390` | 1 | `201752364, 33981677` | yes |
| 138 | SHOPPING BAG | Atropos | Atropos Waystation | `atropos-surface-11` | `goto 1 1` | 1 | `2851087, 14840932` | yes |
| 139 | CORN FLAKES | Clotho | Clotho New Town | `clotho-surface-56` | `goto 6 5` | 0 | `159088314, 20021925` | yes |
| 140 | BED | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 3 | `158826422, 19758164` | yes |
| 141 | FAX | Gaea | Ur City | HANTZENS NEW HOUSE | `goto 7 1` | 0 | `34048181, 117535195` | yes |
| 142 | PHOTOCOPIER | Logos | Logos City | D.H.S.S. HOUSE | `goto 4 2` | 3 | `85098765, 173703604` | yes |
| 143 | CLIPBOARD | Eris | Snow Island | POSTOFFICE SORTING | `-29, 928` | 0 | `2324935, 69238922` | yes |
| 144 | PRESSURE SUIT | Mentor | Mentor Waystation | `mentor-surface-44` | `goto 4 4` | 0 | `184910542, 17857673` | yes |
| 145 | TIMED DETONATOR | Eris | Bare Island | HANTZEN SALES | `3014, 386` | 10 | `201752720, 33716684` | yes |
| 146 | MEMO PAD | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 4 | `201755464, 33915493` | yes |
| 147 | PHONE MESSAGE | Bacchus | Bacchus Waystation | UNCLES CASINO | `goto 1 3` | 0 | `108955111, 104170035` | yes |
| 148 | ANSAFONE | Dion | Birmingham Island | `dion-surface-b2` | `goto 2 11` | 1 | `213284322, 86865623` | yes |
| 149 | GEIGER COUNTER | Eris | Bare Island | HANTZEN ADMIN | `3015, 388` | 9 | `201816988, 33850843` | yes |
| 150 | TOP SECRET FILE | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 4 | `201754622, 33915830` | yes |
| 151 | DAMOCLES FILE | Eris | Capital City | STATE OFFICE | `goto 9 8` | 0 | `4817622, 8943877` | yes |
| 152 | PIANO | Gaea | Ur City | `gaea-ur-city-surface-29` | `goto 9 2` | 10 | `34176817, 117604602` | yes |
| 153 | SCROLL | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 2 | `71271032, 20548514` | yes |
| 154 | NOTE PAD | Dion | Birmingham Island | `dion-surface-a0` | `goto 0 10` | 0 | `213153858, 86803263` | yes |
| 155 | GOLD | Gaea | Chaldea Metropolis | BANK OF GAEA HQ | `-250, -1018` | 10 | `17201567, 50757307` | yes |
| 156 | Unnamed | Gaea | Unnamed Island (3072, 256) | — | `2568, -1528` | — | `201883648, 17334272` | no |
| 157 | ANTIGRAV | Eris | Key West | NEWTON LTD RESEARCH | `2503, 3463` | 10 | `168264284, 235372543` | yes |
| 158 | ANTIGRAV | Eris | Capital City | PLAYTESTER STORES | `goto 9 2` | 10 | `4815793, 8553654` | yes |
| 159 | GOLD | Tolosa | Eris Bank Repository | `tolosa-surface-12` | `goto 2 1` | 0 | `179539670, 103057781` | yes |
| 160 | GOLD | Tolosa | Eris Bank Repository | `tolosa-surface-12` | `goto 2 1` | 0 | `179539712, 103058443` | yes |
| 161 | GOLD | Tolosa | Eris Bank Repository | `tolosa-surface-12` | `goto 2 1` | 0 | `179539298, 103058119` | yes |
| 162 | GOLD | Tolosa | Eris Bank Repository | `tolosa-surface-12` | `goto 2 1` | 0 | `179539298, 103058745` | yes |
| 163 | NOVABOMB | Gaea | Ur City | `gaea-ur-city-surface-29` | `goto 9 2` | 10 | `34177012, 117603952` | yes |
| 164 | BLACK BEACON | Icarus | Takoushi Base | — | `goto 1 1` | — | `40991725, 45186419` | yes |
| 165 | BLACK BEACON | Acheron | Acheron Retreat | — | `goto 3 3` | — | `224296976, 19759167` | yes |
| 166 | BLACK BEACON | Atropos | Atropos Waystation | — | `goto 0 1` | — | `2782331, 14850147` | yes |
| 167 | BLACK BEACON | Logos | Logos City | — | `goto 6 0` | — | `85226491, 173578131` | yes |
| 168 | BLACK BEACON | Cronus | Cronus Museum | — | `goto 5 5` | — | `168395926, 57573420` | yes |
| 169 | BLACK BEACON | Bacchus | Bacchus Waystation | — | `goto 1 8` | — | `108959159, 104500278` | yes |
| 170 | BLACK BEACON | Mentor | Mentor Waystation | — | `goto 1 1` | — | `184711522, 17658311` | yes |
| 171 | BLACK BEACON | Metis | Metis Moonbase | — | `goto 2 0` | — | `165771540, 69891009` | yes |
| 172 | BLUE BEACON | Tolosa | Eris Bank Repository | — | `goto 1 0` | — | `179472329, 102991196` | yes |
| 173 | BLUE BEACON | Solon | Solon Base | — | `goto 1 1` | — | `260535206, 91591622` | yes |
| 174 | BLUE BEACON | Theon | Theon Base | — | `goto 1 2` | — | `166951932, 218659516` | yes |
| 175 | BLUE BEACON | Gaea | Unnamed Island (3072, 256) | — | `2568, -1528` | — | `201851585, 17344267` | yes |
| 176 | RED BEACON | Thalia | Thalia Base Camp | — | `goto 6 3` | — | `131434182, 213618142` | yes |
| 177 | RED BEACON | Pan | Pan Hades Labourcamp | — | `goto 4 0` | — | `27887099, 117928358` | yes |
| 178 | RED BEACON | Eris | Capital City | — | `goto 9 2` | — | `4814586, 8552731` | yes |
| 179 | RED BEACON | Lucan | Unnamed Island (100, 3923) | — | `-3796, 3930` | — | `6610880, 257567828` | yes |
| 180 | KEY - 99 CHEVY | Eris | Bare Island | HANTZEN SALES | `3014, 386` | 1 | `201751192, 33716368` | yes |
| 181 | KEY - EAGLE 9SE | Eris | Capital City | STATE OFFICE | `goto 9 8` | 10 | `4817359, 8944256` | yes |
| 182 | KEY - BESTCUPAND | Eris | Capital City | TRADING POST | `goto 8 14` | 0 | `4751781, 9340690` | yes |
| 183 | KEY- V.I.P. LIMO | Eris | Capital City | CAPITAL SPACEPORT | `goto 7 8` | 0 | `4686052, 8948013` | yes |
| 184 | KEY- TARG TOURER | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 1 | `71271577, 20548711` | yes |
| 185 | SETTEE | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 1 | `100959631, 50431706` | yes |
| 186 | SETTEE | Eris | Velos City | EKMPV & S AD AGENCY | `1476, 645` | 1 | `100959960, 50693634` | yes |
| 187 | SETTEE | Eris | Capital City | STATE OFFICE | `goto 9 8` | 2 | `4817279, 8944220` | yes |
| 188 | KEY- CONCORD III | Mentor | Mentor Waystation | `mentor-surface-79` | `goto 9 7` | 0 | `185237443, 18054985` | yes |
| 190 | KEY - BULLET | Pan | Pan Hades Labourcamp | PAN HADES ADMIN DEPT | `goto 4 1` | 1 | `27885784, 117998665` | yes |
| 191 | KEY - 22 CV | Gaea | Chaldea Metropolis | TRADE COMMISSION | `-248, -1016` | 1 | `17335162, 50890577` | yes |
| 192 | COFFEE TABLE | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 4 | `158826934, 19758000` | yes |
| 193 | FRIDGE | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 2 | `158826804, 19758665` | yes |
| 194 | BED | Perseus | Alkane Base | EMERGENCY FACILITY | `goto 4 1` | 10 | `251559401, 53903671` | yes |
| 195 | BED | Dion | Birmingham Island | `dion-surface-a0` | `goto 0 10` | 0 | `213153524, 86802343` | yes |
| 196 | BED | Dion | Dion East | ANNIES BAR | `70, -16` | 10 | `217744492, 85099247` | yes |
| 197 | BED | Gaea | Ur City | HANTZENS NEW HOUSE | `goto 7 1` | 0 | `34047373, 117534836` | yes |
| 198 | BED | Dion | Dion North | ANNIES BAR | `70, 64` | 10 | `217744444, 90342087` | yes |
| 199 | BED | Perseus | Alkane Base | EMERGENCY FACILITY | `goto 4 6` | 10 | `251559205, 54228951` | yes |
| 200 | TABLE | Eris | Bare Island | HANTZEN LABORATORY | `3014, 389` | 4 | `201754622, 33915830` | yes |
| 201 | TABLE | Eris | Snow Island | POSTOFFICE SORTING | `-29, 928` | 0 | `2324935, 69238922` | yes |
| 202 | TABLE | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 2 | `71271032, 20548514` | yes |
| 203 | TABLE | Vesta | Politburo City | GUM STORE | `goto 3 7` | 1 | `71205317, 20613008` | yes |
| 204 | TABLE | Dion | Birmingham Island | `dion-surface-a0` | `goto 0 10` | 0 | `213153858, 86803263` | yes |
| 205 | TABLE | Gaea | Ur City | HANTZENS NEW HOUSE | `goto 7 1` | 0 | `34048181, 117535195` | yes |
| 206 | TABLE | Eris | Bare Island | HANTZEN ADMIN | `3015, 388` | 9 | `201816988, 33850843` | yes |
| 207 | TABLE | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 2 | `100959752, 50431657` | yes |
| 208 | TABLE | Clotho | Clotho New Town | LLOYDS GP4 INVESTMENT | `goto 1 0` | 2 | `158760740, 19690164` | yes |
| 209 | TABLE | Eris | Capital City | `eris-surface-12` | `goto 2 1` | 0 | `4358071, 8484430` | yes |
| 210 | CHAIR | Gaea | Ur City | INDUSTRIAL CO-OP HSE1 | `goto 1 2` | 0 | `33650164, 117605113` | yes |
| 211 | CHAIR | Gaea | Ur City | INDUSTRIAL CO-OP HSE2 | `goto 5 2` | 0 | `33912179, 117605263` | yes |
| 212 | CHAIR | Eris | Bare Island | HANTZEN ADMIN | `3015, 388` | 9 | `201816980, 33850690` | yes |
| 213 | CHAIR | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 9 | `100960433, 50431441` | yes |
| 214 | CHAIR | Clotho | Clotho New Town | LLOYDS GP4 INVESTMENT | `goto 1 0` | 2 | `158760738, 19690012` | yes |
| 215 | BENCH | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 0 | `71270258, 20548171` | yes |
| 216 | BENCH | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 0 | `158826714, 19759588` | yes |
| 217 | SETTEE | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 4 | `158826392, 19759781` | yes |
| 218 | LOTTERY TICKET | Clotho | Clotho New Town | LLOYDS GP4 INVESTMENT | `goto 1 0` | 2 | `158760740, 19690164` | yes |
| 219 | CHEESE SANDWICH | Midas | The Midas Project | `midas-the-midas-project-surface-430-3706` | `77, 224` | 0 | `28213385, 242909236` | yes |
| 220 | COFFEE TABLE | Dion | Birmingham Island | `dion-surface-b2` | `goto 2 11` | 1 | `213284322, 86865623` | yes |
| 221 | COFFEE TABLE | Bacchus | Bacchus Waystation | UNCLES CASINO | `goto 1 3` | 0 | `108955111, 104170035` | yes |
| 222 | COFFEE TABLE | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 9 | `100960556, 50431492` | yes |
| 223 | COFFEE TABLE | Eris | Velos City | EKMPV & S AD AGENCY | `1476, 645` | 1 | `100960176, 50693566` | yes |
| 224 | COFFEE TABLE | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 4 | `158826428, 19759981` | yes |
| 225 | PROCESSORS CHAIR | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 1 | `71272084, 20548135` | yes |
| 226 | PROCESSORS CHAIR | Metis | Metis Moonbase | DOOBERRYS SOLICITORS | `goto 0 6` | 9 | `165642066, 70288800` | yes |
| 227 | PROCESSORS CHAIR | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 1 | `100960077, 50431393` | yes |
| 228 | MANAGERS CHAIR | Eris | Capital City | LAWSON BANK HQ | `goto 15 12` | 1 | `5211725, 9208113` | yes |
| 229 | MANAGERS CHAIR | Gaea | Chaldea Metropolis | BANK OF GAEA HQ | `-250, -1018` | 1 | `17201775, 50755974` | yes |
| 230 | PROCESSORS DESK | Vesta | Politburo City | VESTA PARLIAMENT | `goto 4 6` | 1 | `71272066, 20548237` | yes |
| 231 | PROCESSORS DESK | Metis | Metis Moonbase | DOOBERRYS SOLICITORS | `goto 0 6` | 9 | `165642071, 70288880` | yes |
| 232 | PROCESSORS DESK | Gaea | Ur City | INDUSTRIAL CO-OP HSE2 | `goto 5 2` | 0 | `33912179, 117605353` | yes |
| 233 | PROCESSORS DESK | Gaea | Ur City | INDUSTRIAL CO-OP HSE1 | `goto 1 2` | 0 | `33650162, 117605183` | yes |
| 234 | AUTHORS DESK | Dion | Birmingham Island | `dion-surface-de` | `goto 14 13` | 0 | `214073154, 86998749` | yes |
| 235 | PROCESSORS DESK | Eris | Velos City | ERIS TV STUDIOS | `1476, 641` | 1 | `100960077, 50431519` | yes |
| 236 | MANAGERS DESK | Eris | Capital City | LAWSON BANK HQ | `goto 15 12` | 1 | `5211719, 9208233` | yes |
| 237 | MANAGERS CHAIR | Eris | Key West | `eris-key-west-surface-89` | `2505, 3464` | 1 | `168394511, 235436898` | yes |
| 238 | MANAGERS DESK | Eris | Key West | `eris-key-west-surface-89` | `2505, 3464` | 1 | `168394511, 235437036` | yes |
| 239 | MANAGERS DESK | Gaea | Chaldea Metropolis | BANK OF GAEA HQ | `-250, -1018` | 1 | `17201791, 50756105` | yes |
| 240 | CHAIR | Dion | Dion North | ANNIES BAR | `70, 64` | 0 | `217744493, 90342086` | yes |
| 241 | CHAIR | Dion | Dion East | ANNIES BAR | `70, -16` | 0 | `217744486, 85099206` | yes |
| 242 | CHAIR | Theon | Theon Base | ERIS TV MEDIA LINK | `goto 3 1` | 0 | `167085009, 218595489` | yes |
| 243 | TABLE | Dion | Dion North | ANNIES BAR | `70, 64` | 0 | `217744493, 90342188` | yes |
| 244 | TABLE | Dion | Dion East | ANNIES BAR | `70, -16` | 0 | `217744522, 85099284` | yes |
| 245 | TABLE | Clotho | Clotho New Town | `clotho-surface-11` | `goto 1 1` | 0 | `158762540, 19757572` | yes |
| 246 | TABLE | Solon | Solon Base | PENN COLLEGE | `goto 1 1` | 10 | `260537318, 91587405` | yes |
| 247 | TABLE | Clotho | Clotho New Town | ACTIVE MARKETING | `goto 2 1` | 0 | `158826908, 19759646` | yes |
| 248 | Unnamed | — | Out of world | — | — | — | — | no |
| 249 | Unnamed (model of slot 248) | — | Out of world | — | — | — | — | no |
| 250 | Unnamed (model of slot 248) | — | Out of world | — | — | — | — | no |
| 251 | Unnamed | — | Out of world | — | — | — | — | no |
| 252 | Unnamed (model of slot 251) | — | Out of world | — | — | — | — | no |
| 253 | Unnamed (model of slot 251) | — | Out of world | — | — | — | — | no |
| 254 | Unnamed | — | Out of world | — | — | — | — | no |
| 255 | Unnamed (model of slot 254) | — | Out of world | — | — | — | — | no |

## Bodies and switch targets

`goto` and `where` count cells from the workspace origin of the Body's first
admitted Pose. `switch` accepts a Body name when the Body has exactly one
admitted Pose; otherwise it needs a Pose.

| Body | `switch` target | Workspace origin |
| --- | --- | --- |
| Icarus | `switch icarus` | `624, 688` |
| Midas | `switch midas` | `353, 3482` |
| Acheron | `switch acheron` | `3419, 298` |
| Dion | `switch dion-2-3` | `3252, 1314` |
| Atropos | `switch atropos` | `42, 225` |
| Clotho | `switch clotho` | `2421, 300` |
| Gaea | `switch gaea-ur-city-4-2` | `512, 1792` |
| Cronus | `switch cronus` | `2564, 873` |
| Cyclopes | `switch cyclopes` | `3487, 1445` |
| Eris | `switch eris-spaceport-onfoot` | `64, 128` |
| Solon | `switch solon` | `3974, 1396` |
| Theon | `switch theon` | `2546, 3334` |
| Vesta | `switch vesta-parliament-4-6` | `1083, 307` |
| Metis | `switch metis` | `2527, 1066` |
| Lucan | `switch lucan` | `3896, 0` |
| Logos | `switch logos` | `1294, 2648` |
| Pan | `switch pan` | `421, 1799` |
| Thalia | `switch thalia` | `1999, 3256` |
| Bacchus | `switch bacchus` | `1661, 1586` |
| Tolosa | `switch tolosa` | `2737, 1571` |
| Perseus | `switch perseus` | `3834, 821` |
| Mentor | `switch mentor` | `2817, 268` |

Bodies without an admitted Pose (Dialis, Lachesis, Aurora, Triton, Juno, Jason,
Sapphire, Damocles, and the Void) cannot be switched to; reach them by flying.

## Using `get`

`get <object-slot>` puts the object in the Carried Stack without moving the
player, provided the ordinary take rules allow it, as Targ's `get` does. Fixed
objects and objects too heavy to lift, craft among them, are still refused, as is a
new object when the Carried Stack is full. Objects that are already carried or
out of the world are reported without changing state. A take also fires the
object's pickup trigger, so a scripted pickup behaves as it does in play.

```text
get 35
get 183
```

The Carried Stack scrolls for a moment after every take, and a `get` made
before it settles is refused. Bare `get` takes whatever is selected and in
reach, as the Take key does.

`drop` drops only the head of the Carried Stack, where the player stands; its
argument confirms the head by slot or by part of its name.

## Finding an object

To see an object where it lies, `switch` to its Body and `goto` its cell, then
`floor <n>` for a structure resident. A resident is only present in the rooms
of its structure that expose it, so the cell centre is not always the right
room, and some rooms lie behind doors that need a key. Use `where` and the
exact X, Z to close in.

## Naming confidence

Names are the Catalogue's decoded object names. Several slots share one name
(DOOR KEY A, NEUTRON FUEL, and so on); they are separate objects. Slots whose
name has not been decoded are labelled “Unnamed” rather than guessed. Place
names come from the decoded place records; a structure without one is
identified by its instance.

## Sources

- Object slots, residences, placements, and take handling:
  [`payload/damocles/catalogue.json`](../payload/damocles/catalogue.json).
- Pose workspace origins:
  [`payload/damocles/arrival-poses.json`](../payload/damocles/arrival-poses.json).
- Residence rules: [`web/src/damocles/residence.ts`](../web/src/damocles/residence.ts).
- Console behaviour: [`web/src/damocles/console.ts`](../web/src/damocles/console.ts).
- Resident interpretation:
  [`docs/research/damocles-resident-objects.md`](research/damocles-resident-objects.md).
