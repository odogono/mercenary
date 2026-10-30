---
type: fix
scope: targ
section: fixed
---

**Blender opens a Targ asset at a workable size, framed, in an empty scene.**
Models were shown in raw game units, so a Surface Cell sat hundreds of
thousands of units from the origin beside the startup cube. They are now shown
at 1/256 scale, centred, while their geometry stays in game units.
