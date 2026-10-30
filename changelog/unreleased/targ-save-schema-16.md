---
type: feat
scope: targ
section: removed
breaking: true
---

**Targ no longer loads Saves from before schema 16.** The Talk Scripts now
keep all of Targ's story state themselves, so a Save that could still hold it
in the engine's or objects' flags is refused rather than handed over (#897).
