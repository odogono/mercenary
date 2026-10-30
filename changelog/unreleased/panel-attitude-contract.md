---
type: fix
scope: web
section: fixed
---

**A nose-down pitch gauge reads below level in the Flyover and in a Targ tumble.**
Both kept their pitch as a whole turn, so tilting the nose slightly down showed
about 350° rather than −10°. Every panel now reads its compass and pitch through
one shared helper, and one test checks every Title's panel against it (#715).
