---
type: fix
scope: damocles
section: fixed
---

**Damocles's location text names the cell the panel shows.** The console's `where`, the
Session Resume line and the Save slot line counted the cell from the island the Body's
workspace is anchored at. On another island they printed something like `GAEA -248--1016`
where the panel read `08-08`. They now count from the island the player is on, as the
panel's Cell Readout does (#1014).
