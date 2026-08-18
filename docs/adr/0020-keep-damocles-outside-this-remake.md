# Keep Damocles outside this remake's engine and product

This remake's product is *Escape from Targ* (the Initial Release) and then *The Second City*. Damocles is a later 16-bit sequel that shares Novagen's first-person, Benson, objects, and walk-or-fly language but not this Targ-shaped runtime, so it is not a Content Overlay, not a reason to generalise Gameplay Session into a multi-title engine, and not a candidate for mechanical translation of ST/Amiga or MDDClone code (ADR 0002). Offline ST and Amiga images may be read as Restricted Material, including a Hatari laboratory and mapping notes, without starting a second Independent Implementation. Any such remake waits until after *The Second City*.

## Considered Options

- Stretch this Gameplay Session and Data Payload so one engine loads both titles.
- Start a second Independent Implementation of Damocles now, in this repo or a split context.
- Shortcut via MDDClone or ST/Amiga assembly.
- Treat Colony Craft escape as the start of one continuous Targ-to-Damocles Gameplay Session.
- Research the gap, then continue Damocles recon as an independent research programme that does not touch this remake's engine; keep ADR 0002 as the bar if a remake ever happens, and sequence that remake after *The Second City*.

The last option is the one taken. The rejected options either pretend Damocles is the C64 expansion it is not, or spend the Targ engine on a filled-polygon solar-system game before this remake has used its only named seam.

## Consequences

- **Reference Build** remains the Commodore 64 edition of *Escape from Targ*. The working authority for Damocles research is the Atari ST image already in `roms/`; that does not rename the glossary term.
- The repo stays a single context. No `CONTEXT-MAP.md`, and no Damocles-shaped seams in the live session, payload schema, or Game Surface. Hatari recon and mapping notes must not touch `MercenaryKit`, the Targ Data Payload, or the browser-pivot critical path.
- Damocles research is not blocked by *The Second City* or by the Targ milestones. A second Independent Implementation, if the later grilling chooses one, still waits until after *The Second City*.
- Colony Craft escape stays beyond Initial Release scope. A Gameplay Session of this remake does not continue into Damocles.
- The Game Surface stays a wireframe line list (ADR 0019). Filled-polygon rendering is a Damocles fact, not a current renderer task, and not a Departure from a Fidelity Contract that does not exist yet.
