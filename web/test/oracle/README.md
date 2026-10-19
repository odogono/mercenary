# Historical Benson oracle

The interpreter, instruction document and Arrival classifier retired by ADR 0080 live here.
They are comparison evidence, not live game logic. The live browser uses `BensonChannel`
for its display and Host Callout, and maintained Talk Scripts for game logic.

`replay/artifacts.ts` attaches `benson.json` only to test bundles. The opening-loop browser
Replay Gate uses `walkabout.ts` explicitly; the dev server serves `test/` only in e2e mode.
The program document is unchanged from the final canonical extraction. `document.ts`
removes extraction-only token fields just as the former payload reader did, keeping the
Golden Traces comparable without re-recording them. Research decoding remains in the C64
lab; `lab payload export` no longer emits the retired instruction document.

The live schema-14 Save layout retains empty legacy continuation fields for compatibility.
The comparison adapter can populate those fields and restore its own interpreter state;
ordinary play discards old program counters and restores Talk continuations separately.
