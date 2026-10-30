---
type: fix
scope: targ
section: fixed
---

**A crashing craft tumbles at the same pace at any frame rate.** The tumble
counted each simulation step as one of the original's frames, so in the browser
it spun and fell faster than the rest of the game moved.
