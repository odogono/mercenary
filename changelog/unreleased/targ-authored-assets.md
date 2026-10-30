---
type: feat
scope: targ
section: added
---

**Targ loads edited and Authored models from `assets/targ/`.**
An edit replaces the recovered model with the same identity, and an
`authored:` model is placed where its Sidecar says. A structure can keep
itself out of the Distant Structures and draw a separate distant form.
`bun run check` fails when a re-extraction changes the model beneath an edit,
until its Change Ledger is reviewed again (#864).
