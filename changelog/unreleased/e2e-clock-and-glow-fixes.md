---
type: fix
scope: web
section: fixed
---

**Glow settings and Mercenary III console clocks survive reload.** Structure and
road glow settings offer OFF, SOFT and BRIGHT, the levels they store. Mercenary III keeps console
Body Time changes in its phase table and accepts edited clocks during the opening
reveal, so Save and Session Resume preserve them (#852).
