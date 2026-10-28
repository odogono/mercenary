---
type: fix
scope: targ
section: fixed
---

**Targ keeps older Saves loadable after upgrading to NorthTalk 0.3.0.** The
runtime no longer reads the previous Talk Script snapshot format. Older Saves
retain their game state, but Talk Scripts load fresh without replaying the
opening: their variables, pending dialogue and input claims are discarded.
New Saves continue to restore Talk Scripts mid-wait.
