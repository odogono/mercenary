---
type: feat
scope: web
section: added
---

**The Flyover has a Shell Console.** Press the backquote key to open it.
`goto body <id>` stops the Camera at a Body, as `?body=` does, and on Targ,
`goto surface <longitude> <latitude> <altitude> [heading] [pitch]` places it
over any point of the planet. `pose` prints where the Camera is, including the
`goto surface` line that returns to the same view. `time` reads, sets and
resets the Targ clock, and `reset` returns to the System overview. The console
has no gameplay, Save or preference commands, and it never changes the address
(#188).
