# Share Head Commands through Title Open tables

Accepted, 2026-10-05, for [#756](https://github.com/odogono/mercenary/issues/756). Mercenary III's Open handler (`$4D63C`) reads the same kind of Open table as Damocles's (`$04D2C4`): eight-byte rows of object slot, mode, index and two colour words. The keypad dispatcher `$4D830` then acts on the open panel by mode, as Damocles's `$04D3D2` does. The Head Commands therefore live once, in `web/src/interaction/headCommands.ts`: Open from the table, the centre box's 64-VBL transition, document paging, Read, and switches.

## Decision

- Each Title supplies its Open table as a `HeadTable` (each slot's panel kind, a document's item count and the Title's own Open gates) and two rules where the games differ. Damocles closes a panel opened again (#595) and leaves index 8 after a backward wrap (`$04D7D8`). Mercenary III ignores a repeat Open and wraps to the last item.
- Panels whose keys a Title has not ported (computer, TIMED DETONATOR, cards other than TAXICARD, the CANDIDATE'S LOG) return their keys to the Title. Mercenary III notes them in the Shell Console, as [ADR 0075](0075-port-dion-object-interaction-by-rule-not-by-admitted-object.md) has it for other unported effects.
- Mercenary III's table, its 27 documents, each mode's centre art and the rows' title strips are exported from the gameplay-opening RAM by `m3lab.head` into `payload/dion/tourcraft/presentation/head.json`.

## Consequences

Damocles keeps its `headCommand` API and outcomes; its Head Command, document, computer, detonator and NOVABOMB tests pass unchanged. Mercenary III's TAXICARD remains the taxi code's card while its panel is the open one. The TOURCRAFT Save carries the open panel, the centre box, a Read still presenting and the switch bits.
