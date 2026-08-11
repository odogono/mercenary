# Mercenary Remake

This context defines the shared language for recreating Novagen's *Mercenary: Escape from Targ* as a native macOS game.

## Language

**Reference Build**:
The Commodore 64 edition of *Mercenary: Escape from Targ*, used as the authority for the original world's data and game behaviour.
_Avoid_: Canonical ROM, original version

**Faithful Remake**:
A recreation that preserves the Reference Build's world, geometry, mechanics, progression, economy, encounters, and wireframe visual language while fitting naturally into macOS.
_Avoid_: Port, remaster, emulator

**Mac Adaptation**:
A host-platform accommodation—such as input, display scaling, windowing, audio plumbing, or save handling—that does not alter the preserved game.
_Avoid_: Gameplay improvement, modernization

**Initial Release**:
The complete *Mercenary: Escape from Targ* experience delivered by this effort, with extension seams for *The Second City* but without that expansion's content.
_Avoid_: Mercenary 1, base game

**Independent Implementation**:
New native application code written without incorporating or mechanically translating the Reference Build's program code, intended to support public distribution.
_Avoid_: Source port, ROM wrapper

**World Geometry Dataset**:
A lossless, provenance-backed representation of the Reference Build's object models, vertices, edges, instances, transforms, coordinate systems, layouts, bounds, identities, and visibility rules.
_Avoid_: Mesh dump, model pack

**Preserved Quirk**:
Reference Build behaviour retained because it affects progression, established solutions, world behaviour, or the characteristic feel of play.
_Avoid_: Bug compatibility

**Authoritative Evidence**:
Behaviour observed in the running Reference Build or data decoded directly from it; when sources disagree, this evidence outranks manuals and other platform editions.
_Avoid_: Port behaviour, manual intent

**Research Provenance**:
The trace from a recovered fact or datum to ROM offsets, runtime addresses, source hashes, observations, and the interpretation used to reconstruct it.
_Avoid_: Extraction notes, reverse-engineering log
