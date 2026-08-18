# Damocles gap

Research spike: size the gap between this Faithful Remake of *Mercenary: Escape from Targ* and Novagen's sequel *Damocles* (*Mercenary II*). This is not a decode, not Authoritative Evidence from a running Damocles build, and not a product commitment (ADR 0020).

## Spike decisions

Round 1 settled the product stance:

- **Research only.** Size the gap. Do not start a second Independent Implementation, do not stretch Gameplay Session to load both titles, and do not treat finishing Targ as the start of a Damocles session.
- **Same provenance bar.** If a Damocles remake ever happens, ADR 0002 still binds: own extractors, Independent Implementation, no mechanical translation of original machine code or of MDDClone.
- **Remake after The Second City.** This remake uses its C64 expansion seam before any 16-bit sequel *implementation*. Hatari recon may proceed now as Restricted Material research; it is not an Independent Implementation.

Round 2, given that stance, is not a remake design. It only names how this spike reads Damocles and what it must not do to the live Targ engine.

### Working authority

The spike's working authority is the Atari ST image `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` (1.0M, SHA-256 `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`). The Amiga ADF `roms/amiga/Damocles Mercenary 2 (Novagen).adf` (bootable `DAMOCLES` disk, SHA-256 `5cb9da93d740cb849a9a39ece69323187ee3712a790488661856527e7c78c484`) is corroborative only. Contemporary accounts treat the two 1990 releases as the same game; MDDClone's PC clone of the series was built from ST assembly; Paul Woakes' 16-bit work sat on the ST. This does **not** change the glossary term **Reference Build**, which remains the C64 edition of *Escape from Targ*.

C64 and ZX Damocles versions were cancelled. This project's VICE lab and C64 extractors are the wrong instrument.

### Repo and context

Notes for this spike live here, in the same single context as the Targ remake. There is no `CONTEXT-MAP.md`, no Damocles payload schema, and no change to `MercenaryKit`. Damocles images stay gitignored Restricted Material under `roms/`, like the other non-C64 editions. MDDClone is a prior art warning, not a source: it rewrote the ST program from debugger disassembly, which is the Independent Implementation boundary this project refuses.

### Renderer

Damocles is filled polygons (with day/night and windows that look out of interiors). This remake's Game Surface is a wireframe line list — SwiftUI Canvas today, a project-owned WebGL2 line list under ADR 0019. That difference is the largest presentation gap. The spike does not add a filled renderer, and it does not file a Departure Record against a Damocles Fidelity Contract that does not exist.

### Colony Craft hinge

In this remake, the Colony Craft is the one Doorway out of the underground, and leaving Targ aboard it is beyond Initial Release scope: the player is placed at the craft's ground position. In the fiction, Damocles is what happens after that escape — stranded on Eris in the Gamma System, which was the original destination before the interlude on Targ. They remain two titles. A Gameplay Session of this remake does not continue into Damocles; Colony Craft escape is not a Damocles loader.

## How similar

Damocles is an evolved Novagen engine, not a second data pack for this one.

**Shared language** (player-facing, and visible in a 1987 ST Damocles demo that still carried unused Mercenary Benson programs): Benson, first-person view, takeable objects, interiors, occupancy as walking or aboard a craft, non-linear solutions. Object census and motion routines grew out of Mercenary rather than starting over.

**Broken compatibility** (why this runtime cannot load it):

| This remake (Targ / C64) | Damocles (ST / Amiga) |
|---|---|
| Wireframe line lists, 160×136 C64 projection | Filled polygons, 16-bit rasteriser, palette management |
| One planet: 16×16 surface, 192 Rooms | Gamma System: nine planets, nineteen moons, seamless spaceflight |
| Location = surface or one Room | Bodies, space, interiors with outward windows |
| Craft Parameter Blocks | Those, plus orbital mechanics, a comet deadline, and simplified time dilation |
| 64 object slots, 8 craft, 51 Benson Scripts in the current payload | Larger object/city set, 28-bit world coordinates in the finished ST engine |
| C64 Reference Build and VICE lab | ST/Amiga only; 8-bit versions cancelled |

Secondary sources for the Damocles column: the [Damocles Wikipedia article](https://en.wikipedia.org/wiki/Damocles_(video_game)), the [Lemon Amiga manual transcription](https://www.lemonamiga.com/doc/damocles-mercenary-2/416), and the [Mercenary Site notes on the 1987 ST demo](http://mercenarysite.free.fr/damodemo.htm). None of these is Authoritative Evidence. The Targ column is this repo's decoded payload and glossary.

## What would transfer if a remake were ever started

The **method**, not the live Targ types:

- Independent Implementation, own extractors, gitignored Data Payload
- Host Callout, Gameplay Session as authority, Trace Oracle discipline
- Device-independent Semantic Actions
- Benson interpreter **only after** a census of Damocles' script VM against this Host Callout — suggested by the 1987 demo, unproven on the final ST binary

What would not transfer: the C64 lab and extractors; `Location` as surface-or-Room; Colony Craft as the one way out; the wireframe Game Surface and C64 projection; Craft Parameter Blocks as the whole physics story; *The Second City* Content Overlay seam as a way to ship Damocles.

## Inventory (Restricted Material, not in Git)

| Path | Role in this spike |
|---|---|
| `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` | Working authority |
| `roms/amiga/Damocles Mercenary 2 (Novagen).adf` | Corroborative 16-bit edition |
| `roms/atarist/Mercenary III.STX` | Out of scope (later title) |
| `roms/atarist/Mercenary - Escape From Targ (1986)(Novasoft).stx` | ST Mercenary 1; not the C64 Reference Build |

There is no Damocles disassembly snapshot, lab, extractor, or payload in the tracked tree.

## After this spike

[#76](https://github.com/odogono/mercenary/issues/76) sized the gap from secondary sources and the repo inventory. The next research programme is independent of Targ milestones and of *The Second City* remake sequencing, and it is not work in `MercenaryKit`:

- [#77](https://github.com/odogono/mercenary/issues/77) — map (research, not a remake)
- [#78](https://github.com/odogono/mercenary/issues/78) — Hatari laboratory for the ST working authority
- [#79](https://github.com/odogono/mercenary/issues/79) — filled-polygon presentation (blocked by #78)
- [#80](https://github.com/odogono/mercenary/issues/80) — Gamma System world (blocked by #78)
- [#81](https://github.com/odogono/mercenary/issues/81) — script VM and occupancy/flight/space/time (blocked by #78)
- [#82](https://github.com/odogono/mercenary/issues/82) — is a second Independent Implementation the right shape? (blocked by #79, #80, #81)

Mapping notes go under `docs/research/` with gitignored captures, same publication hedge as other ROM research.
