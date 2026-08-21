# Damocles gap

Research spike: size the gap between this Faithful Remake of *Mercenary: Escape from Targ* and Novagen's sequel *Damocles* (*Mercenary II*). The spike itself was not a decode and not a product commitment; Working-Authority Evidence later came from the Hatari laboratory under [#77](https://github.com/odogono/mercenary/issues/77). Authoritative Evidence remains bound to the C64 Reference Build.

## Stance (post-#82)

[#82](https://github.com/odogono/mercenary/issues/82) / [ADR 0021](../adr/0021-unify-mercenary-titles-in-one-independent-implementation.md) replace the spike's “keep Damocles outside the engine forever” architecture:

- **One multi-title Independent Implementation** after *The Second City* — not a second Independent Implementation, not a Content Overlay, not MDDClone / mechanical translation (ADR 0002).
- **Non-loaded sketches only for now** — see `damocles-multi-title-session-sketch.md`. No live Damocles payload, no Filled Presentation on the shipping Game Surface, no `MercenaryKit` stretch, no `CONTEXT-MAP.md`.
- **Research continues** against the Working Authority; residual Fog sizes effort and does not reopen “maybe a second II.”

ADR 0020 remains the historical research-phase decision; it is superseded for long-term architecture by ADR 0021.

## Spike decisions (historical, #76)

Round 1 settled the *then* product stance (superseded for architecture by ADR 0021):

- **Research only.** Size the gap. Do not start a second Independent Implementation, do not stretch the *live* Targ session/payload yet, and do not treat finishing Targ as the start of a Damocles session.
- **Same provenance bar.** ADR 0002 still binds: own extractors, Independent Implementation, no mechanical translation of original machine code or of MDDClone.
- **Remake after The Second City.** Hatari recon may proceed now as Restricted Material research.

Round 2 named how this spike reads Damocles and what it must not do to the live Targ engine — still true for *implementation before The Second City*.

### Working authority

The spike's working authority is the Atari ST image `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` (1.0M, SHA-256 `8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef`). The Amiga ADF `roms/amiga/Damocles Mercenary 2 (Novagen).adf` (bootable `DAMOCLES` disk, SHA-256 `5cb9da93d740cb849a9a39ece69323187ee3712a790488661856527e7c78c484`) is corroborative only. Contemporary accounts treat the two 1990 releases as the same game; MDDClone's PC clone of the series was built from ST assembly; Paul Woakes' 16-bit work sat on the ST. This does **not** change the glossary term **Reference Build**, which remains the C64 edition of *Escape from Targ*.

C64 and ZX Damocles versions were cancelled. This project's VICE lab and C64 extractors are the wrong instrument.

### Repo and context

Notes for this spike live here, in the same single context as the Targ remake. There is no `CONTEXT-MAP.md`, no Damocles payload schema loaded by the app, and no change to `MercenaryKit` for Damocles content. Damocles images stay gitignored Restricted Material under `roms/`, like the other non-C64 editions. MDDClone is a prior art warning, not a source: it rewrote the ST program from debugger disassembly, which is the Independent Implementation boundary this project refuses (ADR 0002).

### Renderer

Damocles uses Filled Presentation (with day/night claims and windows that look out of interiors). This remake's Game Surface is a wireframe line list — SwiftUI Canvas today, a project-owned WebGL2 line list under ADR 0019. That difference is the largest presentation gap. The spike does not add a filled renderer, and it does not file a Departure Record against a Damocles Fidelity Contract that does not exist.

### Colony Craft hinge

In this remake, the Colony Craft is the one Doorway out of the underground, and leaving Targ aboard it is beyond Initial Release scope: the player is placed at the craft's ground position. In the fiction, Damocles is what happens after that escape — stranded on Eris in the Gamma System, which was the original destination before the interlude on Targ. They remain two titles. Colony Craft escape is not a Damocles loader until an explicit multi-title design says otherwise (ADR 0021).

## How similar

Damocles is an evolved Novagen engine, not a second data pack for this one. ADR 0021 still expects one Independent Implementation to grow seams for both — method and session authority shared; live Targ types not reused as-is.

**Shared language** (player-facing, and visible in a 1987 ST Damocles demo that still carried unused Mercenary Benson programs): Benson, first-person view, takeable objects, interiors, occupancy as walking or aboard a craft, non-linear solutions. Object census and motion routines grew out of Mercenary rather than starting over.

**Broken compatibility** (why today's live Targ types cannot load it):

| This remake (Targ / C64) | Damocles (ST / Amiga) |
|---|---|
| Wireframe line lists, 160×136 C64 projection | Filled Presentation, 16-bit rasteriser, palette management |
| One planet: 16×16 surface, 192 Rooms | Gamma System: nine planets, nineteen moons, seamless spaceflight |
| Location = surface or one Room | Bodies, space, interiors with outward windows |
| Craft Parameter Blocks | Those, plus orbital mechanics, a comet deadline, and simplified time dilation |
| 64 object slots, 8 craft, 51 Benson Scripts in the current payload | Larger object/city set, 28-bit world coordinates in the finished ST engine |
| C64 Reference Build and VICE lab | ST/Amiga only; 8-bit versions cancelled |

Secondary sources for the Damocles column: the [Damocles Wikipedia article](https://en.wikipedia.org/wiki/Damocles_(video_game)), the [Lemon Amiga manual transcription](https://www.lemonamiga.com/doc/damocles-mercenary-2/416), and the [Mercenary Site notes on the 1987 ST demo](http://mercenarysite.free.fr/damodemo.htm). None of these is Working-Authority Evidence. The Targ column is this repo's decoded payload and glossary. Confirmed Working-Authority Evidence lives in the mapping notes listed below.

## What would transfer when Damocles implementation starts

The **method**, not today's live Targ types:

- One multi-title Independent Implementation, own extractors, gitignored Data Payload (ADR 0021, ADR 0002)
- Host Callout pattern, Gameplay Session as authority, Trace Oracle discipline
- Device-independent Semantic Actions
- Damocles Script interpreter **only after** a fuller ISA / Host Callout census — existence Confirmed in `#85`; full semantics still Fog

What would not transfer as-is: the C64 lab and extractors; `Location` as surface-or-Room; Colony Craft as the one way out; the wireframe-only Game Surface and C64 projection; Craft Parameter Blocks as the whole physics story; *The Second City* Content Overlay seam as a way to ship Damocles.

## Inventory (Restricted Material, not in Git)

| Path | Role in this spike |
|---|---|
| `roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` | Working authority |
| `roms/amiga/Damocles Mercenary 2 (Novagen).adf` | Corroborative 16-bit edition |
| `roms/atarist/Mercenary III.STX` | Out of scope for #82 (later title; series aspiration only) |
| `roms/atarist/Mercenary - Escape From Targ (1986)(Novasoft).stx` | ST Mercenary 1; not the C64 Reference Build |

The Hatari laboratory for the ST Working Authority lives at `research/damocles-st/`. There is no Damocles disassembly snapshot, extractor, or payload in the tracked tree, and the **Working Disassembly** rules keep it that way:

- A Working Disassembly is targeted and question-driven: it disassembles only the routines one named research question needs, never the whole program. The first named target is the Damocles Script dispatch loop ([#81](https://github.com/odogono/mercenary/issues/81), [#85](https://github.com/odogono/mercenary/issues/85)), where runtime observation has plateaued on the Unresolved opcode rows in `docs/research/damocles-script-isa.md`.
- Its subject is the unpacked RAM image at a laboratory checkpoint (e.g. `first-world`), never the packed on-disk STX, so disassembly addresses and runtime evidence share one address space. Contemporary cracking accounts confirm the retail image is heavily protected and packed; the checkpoint sidesteps that.
- The disassembly text and any analysis project (e.g. Ghidra) are untracked Restricted Material under gitignored paths. Only decoded facts — addresses, structures, semantics — enter tracked research notes, with Research Provenance, exactly as the existing mapping notes already do.
- Read for structure, never copied or mechanically translated. MDDClone remains the prior-art warning: it rewrote the ST program from debugger disassembly, which is the Independent Implementation boundary this project refuses (ADR 0002).

**Prior art (checked 2026-08-21):** no consumable public annotated disassembly of ST Damocles exists — nothing analogous to Ian McGregor's C64 Mercenary disassembly — so any Working Disassembly is produced here. Two read-only semantic bootstraps exist: [mercenary-reloaded](https://github.com/Eversberg/mercenary-reloaded)'s annotated hook table (`src/mercenary/mercenary2.c`, `render.c`; ~100 commented code addresses in the **Amiga** Damocles binary), and the [Mercenary Site's 1989 ST demo analysis](http://mercenarysite.free.fr/damodemo.htm). Both are unlicensed reference documentation only — never copied, and Amiga addresses do not transfer to the ST image, though the shared 68000 code base means routine semantics largely do.

## After this spike

[#76](https://github.com/odogono/mercenary/issues/76) sized the gap from secondary sources and the repo inventory. The research map [#77](https://github.com/odogono/mercenary/issues/77) is Wayfinding Complete when [#82](https://github.com/odogono/mercenary/issues/82) closes:

- [#78](https://github.com/odogono/mercenary/issues/78) — Hatari laboratory for the ST working authority
- [#79](https://github.com/odogono/mercenary/issues/79) — filled-polygon presentation; inventory note: `docs/research/damocles-filled-polygons.md`
- [#80](https://github.com/odogono/mercenary/issues/80) — Gamma System world; inventory note: `docs/research/damocles-gamma-system.md`
- [#81](https://github.com/odogono/mercenary/issues/81) — script VM and occupancy/flight/space/time; inventory note: `docs/research/damocles-script-motion-time.md`
- [#85](https://github.com/odogono/mercenary/issues/85) — bytecode script ISA; inventory note: `docs/research/damocles-script-isa.md`
- [#86](https://github.com/odogono/mercenary/issues/86) — walk/board and flight/space dynamics; inventory note: `docs/research/damocles-walk-board-flight.md`
- [#82](https://github.com/odogono/mercenary/issues/82) — shape / product call; ADR 0021 + `docs/research/damocles-multi-title-session-sketch.md`

Mapping notes go under `docs/research/` with gitignored captures, same publication hedge as other ROM research.
