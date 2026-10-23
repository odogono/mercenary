---
type: feat
scope: dion
section: added
---
**Mercenary III's Shell Console logs Benson's messages and reads the shared commands.**
Each message the bar starts to show is logged as `BENSON · …`, as in Damocles.
`where`, `inventory`, `get`, `drop`, `set`, `save` and `load` join `time`, `clock`
and `pads`, and `goto` (a cell, a region, or an object), a remote `get`, `fetch`,
`floor` and `switch` between METIS and TOLOSA act through the session as
Damocles's do (#831, #832).
