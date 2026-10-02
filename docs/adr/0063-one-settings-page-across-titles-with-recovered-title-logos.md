# One settings page across Titles, with recovered Title Logos

Accepted, 2026-10-01.

Mercenary III's `/dion` mounted the same System Menu markup as Targ and Damocles but looked like none of them. It defined none of the chrome's tokens, deleted the settings rows it could not honour after mounting them, relabelled the sky row as its presentation choice, and wired audio by hand without keeping it. Each Title now declares the settings rows it offers, and one settings view builds those and no others. The presentation row is labelled PRESENTATION in every Title, and offers AS TUNED only to a Title with a tuning document. Each Title's document supplies its own chrome tokens; Mercenary III's start from Damocles's values.

**Preferences are kept per Title.** ADR 0041 kept preferences and typeface global, on the grounds that they describe the player rather than the game. Once the Titles offer different rows, one shared record means a choice made in one Title silently changes another, and the row a Title lacks still steers it. Each Title now keeps its own preferences and typeface under `mercenary.browser-shell.<slug>.*` keys, as its Saves and Session Resume already are. Nothing a player chose is lost: until a Title has written its own record, Targ and Damocles each read the shared record they used before, and Mercenary III reads its earlier presentation key. This amends ADR 0041's last sentence on partitioning; the rest of it stands.

**Every System Menu page carries a small Title Logo, and a Title Logo is only ever recovered from that Title's own release.** It is extracted by our own tooling from the Title's own disk, with provenance, as ADR 0029 requires of everything in the payload. It is never authored, and never taken from a screenshot or packaging scan, which are Restricted Material. Until a Title's logo is recovered, its name in its own typeface stands in for it. Mercenary III's comes first: the 64×32 centre-box logo of its recovered panel (`payload/dion/panel.json`, `$3BA10`). Damocles's is the DAMOCLES lettering of its title picture `ETITLE.NEO`, read off the pinned disk through the game's own directory, track format, keystreams and packing ([#695](https://github.com/odogono/mercenary/issues/695), [the research note](../research/damocles-title-logo.md)). Targ's comes from its ST release, since the C64 Reference Build has no title screen: the ST loader shows the NEOchrome picture `E0`, read straight off the pinned disk with no RAM capture ([#696](https://github.com/odogono/mercenary/issues/696), [the research note](../research/targ-st-title-logo.md)).

## Considered Options

- An authored SVG mark per Title, as ADR 0027 authored the Benson Panel: quick, but it puts our drawing where the original's own mark belongs, and it would last.
- The downloaded title-screen captures in `restricted/marks/`: not our own extraction, so not admissible to the payload.
- Text alone in every Title: consistent, but it gives up the recovered mark Mercenary III already has.
- Keeping one global preferences record and hiding the rows a Title lacks: hidden rows would still carry choices made elsewhere.

## Consequences

- A Title shows its name until its own release yields a mark; that is deliberate, not an oversight to fix with artwork. (Amended 2026-10-02, #696: Targ's no longer waits for an ST-Targ capture.)
- A Title with no Shell Console still reaches its preferences through the same store, so a later console needs no second path.
