# Structure locations

This is a navigation reference for Targ's surface structures. Coordinates are
written as `X-Z`, matching the Benson panel and the `goto` console command.
Standalone object slots are catalogued separately in
[Object locations](object-locations.md). Damocles's structures are in
[Damocles structure locations](damocles-structure-locations.md). Dion’s are in
[Dion structure locations](dion-structure-locations.md).

The original surface map is 16 by 16 cells. Its structure geometry repeats every
16 cells on each axis when travelling outside the city, so `02-11`, `18-11`, and
`34-11` show the same surface structure. The tables below give the canonical
`00`–`15` placement. Standalone world objects, including the remote lifts and the
Colony Craft, do not follow that repeating surface map.

## Named landmarks

These names come from the decoded reaction attached to the individual cell. A
shared geometry record does not give the same name to its other placements.

| Name | Location |
| --- | --- |
| Author's Advert | `02-03` |
| Bosher Stadium | `08-07` |
| Coach and Horses | `15-02` |
| Commander's related house | `07-09` |
| Jordan Airport | `12-13` |
| Mechanoid Fort | `01-04` |
| Moorby Arch | `10-01` |
| Novabill | `03-08` |
| Sabins Cube | `12-03` |
| St Stallards | `06-03` |
| Tyler Point | `07-00` |
| Vector Henge | `02-04` |
| Walton Monument | `06-00` |

## Lifts, airstrip, and orbital platform

| Name | Location | Height | Notes |
| --- | --- | ---: | --- |
| Lift | `03-00` | ground | Operational surface entrance to Room 3. |
| Lift | `03-15` | ground | Operational surface entrance to Room 5. |
| Lift | `09-05` | ground | Operational surface entrance to Room 2. |
| Lift | `09-06` | ground | Operational surface entrance to Room 1. |
| Lift | `11-13` | ground | Operational surface entrance to Room 4. |
| Lift | `81-35` | ground | Standalone remote lift object, slot 61. |
| Lift | `136-136` | ground | Standalone remote lift object, slot 62. |
| Hangar | `03-04` | ground | Probable identification: documented with the lifts, but entered by a separate box test. |
| Airstrip | `08-08` | ground | Surface structure `surface-structure:cef6`. |
| Orbital platform (Colony Craft) | `08-08` | `4259008` | Standalone high-altitude object, slot 63. Use `goto 8 8 4259008` while aboard a high-ceiling craft; the Dominion Dart needs the Poweramp to climb at this altitude. |

The decoded game terminology calls the orbital platform the **Colony Craft**.
The more familiar “orbital platform” wording is retained here to make the entry
easy to find.

## Complete surface-structure catalogue

Targ's 256 canonical cells use 98 distinct geometry records. Most have no decoded
player-facing name, so this catalogue uses their stable payload identity. Multiple
locations on one row share the same geometry; they are still separate structures
in play.

| Structure | Canonical location(s) |
| --- | --- |
| `surface-structure:c000` | `04-01`, `11-03` |
| `surface-structure:c07f` | `05-03` |
| `surface-structure:c0fc` | `09-03` |
| `surface-structure:c151` | `05-04` |
| `surface-structure:c1d8` | `09-04` |
| `surface-structure:c245` | `14-04` |
| `surface-structure:c2ea` | `10-00`, `06-07` |
| `surface-structure:c376` | `13-07`, `05-11` |
| `surface-structure:c3d1` | `08-07` |
| `surface-structure:c474` | `04-02`, `03-06` |
| `surface-structure:c4ee` | `06-13`, `01-15`, `05-15` |
| `surface-structure:c5a1` | `10-15` |
| `surface-structure:c62b` | `04-04`, `08-06`, `06-09` |
| `surface-structure:c6e4` | `02-15` |
| `surface-structure:c74e` | `15-07` |
| `surface-structure:c7b2` | `14-05`, `14-08`, `12-11`, `06-15`, `11-15` |
| `surface-structure:c82e` | `13-04`, `03-13`, `09-13`, `04-15`, `09-15` |
| `surface-structure:c89a` | `04-13`, `07-15`, `08-15` |
| `surface-structure:c947` | `06-08`, `05-14`, `10-14` |
| `surface-structure:c9b8` | `09-01`, `06-02`, `15-04`, `15-05` |
| `surface-structure:ca57` | `07-13` |
| `surface-structure:cb20` | `08-13` |
| `surface-structure:cbd7` | `11-02`, `11-06`, `10-13` |
| `surface-structure:cc5a` | `10-08`, `06-10` |
| `surface-structure:cd21` | `00-15` |
| `surface-structure:cdc0` | `11-12`, `03-14`, `04-14` |
| `surface-structure:ce24` | `02-03` |
| `surface-structure:cef6` | `08-08` |
| `surface-structure:cf25` | `12-03` |
| `surface-structure:e01d` | `10-10`, `02-11`, `06-11`, `02-12`, `10-12` |
| `surface-structure:e03a` | `10-03`, `11-07`, `10-11`, `02-13`, `05-13` |
| `surface-structure:e06f` | `09-00` |
| `surface-structure:e0c1` | `07-06`, `15-08`, `09-09` |
| `surface-structure:e130` | `15-00`, `13-06` |
| `surface-structure:e16a` | `09-02`, `03-07`, `11-08`, `09-11` |
| `surface-structure:e19a` | `00-01`, `00-05`, `00-13` |
| `surface-structure:e1d3` | `12-13` |
| `surface-structure:e23f` | `12-12` |
| `surface-structure:e2b8` | `07-02`, `13-03`, `00-07`, `08-10`, `12-10`, `03-11`, `07-11`, `00-12`, `09-12` |
| `surface-structure:e339` | `14-01`, `14-02`, `14-03`, `00-04`, `00-06`, `11-09`, `04-12` |
| `surface-structure:e35d` | `00-03`, `14-06`, `14-07`, `00-08`, `00-10`, `11-10`, `03-12`, `07-12`, `00-14` |
| `surface-structure:e3cd` | `01-00`, `03-03` |
| `surface-structure:e424` | `00-00`, `12-01`, `08-02`, `12-09`, `03-10`, `04-10`, `07-10`, `00-11` |
| `surface-structure:e477` | `01-01`, `04-03`, `01-05`, `02-05`, `03-05`, `04-05`, `06-05`, `07-05`, `08-05`, `10-05`, `11-05`, `12-05`, `01-13` |
| `surface-structure:e4ee` | `02-00`, `11-00`, `08-03`, `06-04`, `09-07` |
| `surface-structure:e534` | `04-00`, `06-01`, `07-03`, `05-07` |
| `surface-structure:e582` | `05-06` |
| `surface-structure:e5cd` | `09-08` |
| `surface-structure:e626` | `12-07`, `13-11`, `15-15` |
| `surface-structure:e655` | `05-01`, `08-01`, `12-02`, `13-05`, `07-09`, `13-15` |
| `surface-structure:e6ba` | `08-04`, `10-04`, `12-04`, `10-06`, `12-06`, `13-08` |
| `surface-structure:e77f` | `04-09` |
| `surface-structure:e7ff` | `03-09`, `04-11`, `08-12` |
| `surface-structure:e849` | `03-02`, `00-09`, `08-11` |
| `surface-structure:e88d` | `03-08` |
| `surface-structure:e8f6` | `04-08` |
| `surface-structure:e926` | `05-05` |
| `surface-structure:e9a7` | `03-00`, `09-05`, `09-06`, `11-13`, `03-15` |
| `surface-structure:ea21` | `06-06`, `07-07` |
| `surface-structure:eaa4` | `15-03` |
| `surface-structure:eb3e` | `04-06` |
| `surface-structure:ebe9` | `01-04`, `01-11` |
| `surface-structure:ec4a` | `02-04` |
| `surface-structure:ecef` | `03-04` |
| `surface-structure:eda0` | `01-06`, `01-08`, `01-09`, `02-09`, `05-09`, `13-09`, `13-10`, `15-11`, `01-12`, `06-12`, `15-12`, `15-13`, `01-14`, `02-14` |
| `surface-structure:ee2f` | `02-06`, `15-09` |
| `surface-structure:eeb0` | `13-02` |
| `surface-structure:ef57` | `06-00` |
| `surface-structure:f003` | `07-00` |
| `surface-structure:f05a` | `13-01`, `00-02`, `14-10`, `14-11`, `13-12`, `14-12`, `13-13`, `14-13`, `06-14`, `07-14`, `08-14`, `09-14`, `11-14`, `12-14`, `13-14`, `14-14` |
| `surface-structure:f10a` | `01-02` |
| `surface-structure:f190` | `05-00`, `05-02`, `12-15`, `14-15` |
| `surface-structure:f201` | `02-02` |
| `surface-structure:f25d` | `15-01` |
| `surface-structure:f2d4` | `10-01` |
| `surface-structure:f34d` | `11-01` |
| `surface-structure:f3d3` | `06-03` |
| `surface-structure:f448` | `15-02` |
| `surface-structure:f4e7` | `01-03` |
| `surface-structure:f55b` | `02-01`, `07-04`, `11-04` |
| `surface-structure:f5e0` | `11-11` |
| `surface-structure:f66a` | `04-07` |
| `surface-structure:f700` | `07-08` |
| `surface-structure:f782` | `05-08`, `10-09`, `05-10` |
| `surface-structure:f7f4` | `02-08` |
| `surface-structure:f86b` | `12-08` |
| `surface-structure:f8ff` | `10-02`, `10-07` |
| `surface-structure:f9a6` | `08-09` |
| `surface-structure:fa1b` | `14-09` |
| `surface-structure:fa8b` | `08-00` |
| `surface-structure:fb4b` | `15-06`, `02-10` |
| `surface-structure:fbf0` | `01-07`, `01-10`, `15-14` |
| `surface-structure:fc81` | `12-00` |
| `surface-structure:fd03` | `02-07`, `09-10`, `15-10`, `05-12` |
| `surface-structure:fd9a` | `13-00` |
| `surface-structure:fe2f` | `14-00` |
| `surface-structure:fe98` | `03-01` |
| `surface-structure:ff34` | `07-01` |

## Sources and confidence

- Surface geometry identities and placements: [`payload/surface.json`](../payload/surface.json).
- Standalone object placements: [`payload/objects.json`](../payload/objects.json).
- Operational lift sites: [`payload/underground.json`](../payload/underground.json).
- Named landmark reactions and the Colony Craft identity: [`notes/decode/endgame.md`](../notes/decode/endgame.md).
- Lift/hangar distinction: [`notes/decode/underground.md`](../notes/decode/underground.md).

The named landmark coordinates, five operational lifts, two remote lift objects,
airstrip, and Colony Craft placement are decoded facts. `03-04` being a hangar is
the only probable rather than confirmed identification in this document.
