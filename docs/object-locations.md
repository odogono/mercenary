# Object locations

This is the complete 64-slot object census for Targ. Object slots are stable
identities used by the payload, Benson Scripts, inventory, craft occupancy, and
the Shell Console commands `goto object <slot>` and `get <object-slot>`.

The table records each object's **initial** residence. Objects can subsequently
be carried, boarded, dropped, delivered, destroyed, or moved by scripts. The
console command follows the current residence, so it remains useful after those
changes.

Surface coordinates are normalised into the unsigned 24-bit world. Room
coordinates are local to that Room. “Out of world” is the initial parked state
used by runtime effects and encounters.

| Slot | Name or role                              | Initial residence | Exact X, Y, Z             | Model               |
| ---: | ----------------------------------------- | ----------------- | ------------------------- | ------------------- |
|   00 | Palyar commander's brother-in-law's craft | Surface `00-09`   | `28481, 32769, 597412`    | `object-model:3b25` |
|   01 | Dominion Dart                             | Surface `08-08`   | `562916, 0, 559991`       | `object-model:3b25` |
|   02 | Unnamed craft                             | Surface `12-13`   | `818990, 0, 884804`       | `object-model:3b43` |
|   03 | Unnamed craft                             | Room 07           | `1111, 0, 2080`           | `object-model:3b8d` |
|   04 | Unnamed craft                             | Room 03           | `2574, 0, 1099`           | `object-model:3bcc` |
|   05 | Unnamed craft                             | Room 02           | `888, 0, 2192`            | `object-model:1752` |
|   06 | Cheese                                    | Room 54           | `424, 0, 1079`            | `object-model:3bf8` |
|   07 | Interstellar Ship                         | Room 05           | `2048, 0, 2048`           | `object-model:3c15` |
|   08 | Player projectile                         | Out of world      | `226173, -92, 1019436`    | `object-model:3c5c` |
|   09 | Unnamed effect/object                     | Out of world      | `156, 0, 882`             | `object-model:3b25` |
|   10 | Unnamed surface object                    | Surface `08-08`   | `559104, 0, 559104`       | `object-model:2028` |
|   11 | Unnamed effect/object                     | Out of world      | `156, 0, 882`             | `object-model:3b25` |
|   12 | Captured Mechanoid                        | Room 102          | `353, 0, 985`             | `object-model:1bca` |
|   13 | Unnamed effect/object                     | Out of world      | `316, 0, 254`             | `object-model:3b25` |
|   14 | Hostile projectile                        | Out of world      | `0, 0, 0`                 | `object-model:3c5c` |
|   15 | Hostile attacking craft                   | Out of world      | `559415, -19738, 559370`  | `object-model:3bcc` |
|   16 | Photon Emitter                            | Room 74           | `1253, 0, 357`            | `object-model:3c82` |
|   17 | Unnamed object                            | Room 62           | `439, 0, 370`             | `object-model:3cb1` |
|   18 | Unnamed object                            | Room 58           | `497, 0, 186`             | `object-model:3cce` |
|   19 | Unnamed object                            | Room 164          | `758, 0, 661`             | `object-model:3cf4` |
|   20 | Unnamed object                            | Room 66           | `1198, 0, 533`            | `object-model:3d23` |
|   21 | Unnamed object                            | Room 109          | `935, 0, 688`             | `object-model:3d52` |
|   22 | Unnamed object                            | Room 82           | `278, 0, 394`             | `object-model:3d78` |
|   23 | Unnamed object                            | Room 57           | `1479, 0, 372`            | `object-model:3db0` |
|   24 | Anti Time Bomb                            | Room 166          | `541, 0, 186`             | `object-model:3de8` |
|   25 | Novadrive                                 | Room 137          | `1064, 0, 546`            | `object-model:1e06` |
|   26 | Metal Detector                            | Room 47           | `851, 0, 551`             | `object-model:1ba6` |
|   27 | Antigrav                                  | Room 17           | `851, 0, 551`             | `object-model:1c4c` |
|   28 | Poweramp                                  | Room 67           | `1064, 0, 546`            | `object-model:1dc4` |
|   29 | Neutron Fuel                              | Room 69           | `851, 0, 551`             | `object-model:1c84` |
|   30 | Antenna                                   | Room 98           | `770, 0, 254`             | `object-model:1e54` |
|   31 | Energy Crystal                            | Room 72           | `1438, 0, 394`            | `object-model:1e8e` |
|   32 | Coffin                                    | Room 52           | `1553, 0, 624`            | `object-model:1791` |
|   33 | Large Box                                 | Room 155          | `2752, 0, 296`            | `object-model:185d` |
|   34 | Large Box                                 | Room 68           | `593, 0, 378`             | `object-model:1a5a` |
|   35 | Useful Armament                           | Room 71           | `691, 0, 635`             | `object-model:3e17` |
|   36 | Unnamed object                            | Room 163          | `1205, 0, 945`            | `object-model:1a12` |
|   37 | Gold                                      | Room 162          | `720, 0, 1024`            | `object-model:17c9` |
|   38 | Gold                                      | Room 51           | `1415, 0, 675`            | `object-model:1f6a` |
|   39 | Sights                                    | Room 168          | `32, 0, 359`              | `object-model:1f90` |
|   40 | Sights                                    | Room 09           | `1103, 0, 555`            | `object-model:1a80` |
|   41 | Medical Supplies                          | Room 12           | `1669, 0, 1118`           | `object-model:1906` |
|   42 | Essential 12939 Supply                    | Room 50           | `1326, 0, 910`            | `object-model:1974` |
|   43 | Winchester                                | Room 142          | `1547, 0, 861`            | `object-model:1d76` |
|   44 | Catering Provisions                       | Room 15           | `784, 0, 574`             | `object-model:1ae5` |
|   45 | Databank                                  | Room 108          | `1368, 0, 531`            | `object-model:1b28` |
|   46 | Pass                                      | Room 80           | `608, 0, 1152`            | `object-model:1ab8` |
|   47 | Kitchen Sink                              | Room 163          | `1420, 0, 953`            | `object-model:1887` |
|   48 | Unnamed object                            | Room 88           | `110, 0, 1195`            | `object-model:17fa` |
|   49 | Unnamed object                            | Room 168          | `975, 0, 185`             | `object-model:1ecf` |
|   50 | Unnamed surface object                    | Surface `222-11`  | `14582533, 0, 757080`     | `object-model:1b5e` |
|   51 | Unnamed object                            | Room 168          | `422, 0, 32`              | `object-model:1f0c` |
|   52 | Unnamed object                            | Room 16           | `991, 0, 1732`            | `object-model:1cbe` |
|   53 | Unnamed object                            | Room 41           | `652, 0, 674`             | `object-model:3e61` |
|   54 | Unnamed object                            | Room 41           | `858, 0, 749`             | `object-model:3e8f` |
|   55 | Unnamed object                            | Room 165          | `856, 0, 172`             | `object-model:3ebf` |
|   56 | Pyramid                                   | Surface `181-217` | `11863002, 0, 14243689`   | `object-model:1b45` |
|   57 | Unnamed object                            | Room 144          | `0, 0, 384`               | `object-model:3ef8` |
|   58 | Unnamed object                            | Room 111          | `1152, 0, 0`              | `object-model:1700` |
|   59 | Unnamed object                            | Room 98           | `384, 0, 0`               | `object-model:1700` |
|   60 | Unnamed object                            | Room 171          | `0, 0, 1664`              | `object-model:3ef8` |
|   61 | Lift                                      | Surface `81-35`   | `5337600, 0, 2322944`     | `object-model:3f4a` |
|   62 | Lift                                      | Surface `136-136` | `8942080, 0, 8942080`     | `object-model:3f4a` |
|   63 | Colony Craft (orbital platform)           | Surface `08-08`   | `552960, 4259008, 552960` | `object-model:3f8d` |

## Using `goto object`

```text
goto object 63
goto object 28
goto object 7
```

- A surface object places the player at its exact X, Y, and Z position. Signed
  remote placements are converted to the equivalent unsigned surface position.
- An underground object teleports the player into its current Room and then
  places them at its room-local coordinates.
- A moved or dropped object is followed to its current residence.
- A carried object reports that it is being carried; an object removed from the
  world reports that it is unavailable.
- Normal altitude rules still apply. Going to the Colony Craft on foot causes a
  fall, while an appropriate boarded craft remains airborne.

## Using `get`

`get <object-slot>` puts the object in the Carried Stack without moving the
player, provided the ordinary take rules allow it. Fixed and heavy objects are
still refused, as is a new object when the Carried Stack is full. Objects that
are already carried or out of the world are reported without changing state.

## Naming confidence

Names shown by object descriptions, established gameplay roles, and duplicate
inventory identities are used where known. Slots without a decoded name are
deliberately labelled “Unnamed” rather than guessed. “Lift” describes the shared
model used by remote slots 61 and 62. “Orbital platform” is included as a search
term for the decoded Colony Craft identity.

## Sources

- Object instances, models, initial rooms, and coordinates:
  [`payload/objects.json`](../payload/objects.json).
- Player-facing message names: [`payload/text.json`](../payload/text.json).
- Endgame roles and Colony Craft identity:
  [`notes/decode/endgame.md`](../notes/decode/endgame.md).
- Current residence behavior: [`web/src/session/index.ts`](../web/src/session/index.ts).
