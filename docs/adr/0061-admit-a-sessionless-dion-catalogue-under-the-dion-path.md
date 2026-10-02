# Admit a sessionless Dion Catalogue under the Dion path

Accepted, 2026-10-01, for [#680](https://github.com/odogono/mercenary/issues/680) under [#679](https://github.com/odogono/mercenary/issues/679). Mercenary III gets a read-only **Dion Catalogue** of the whole original world. It sits at `/dion/catalogue` and is exported to `payload/dion/catalogue/`. It is separate from the playable Metis Data Payload and from the Damocles Catalogue at `/catalogue`. The [data contract](../dion-catalogue-contract.md) holds the identities, schemas and completion rule. The coverage ledger it governs is `research/mercenary-iii-st/catalogue-ledger.json`.

_(Status note, 2026-10-02: [ADR 0065](0065-promote-bounded-dion-catalogue-content-through-an-explicit-export.md) admits bounded export-time promotion for D2. The sessionless Catalogue and playable runtime loaders remain independent; selected records enter play only through a provenance-preserving, separately validated export.)_

The #678 census recovered every object slot, group and cell binding, but the browser holds only the opening Metis journeys. Inspecting the rest should not wait on gameplay, and it should not grow the playable payload either. ADR 0039 settled the same question for Damocles. This ADR follows that precedent and ADR 0041's path rule: a Title's sessionless pages hang off its own path, as `/damocles/atlas` does.

## Decision

- **Sessionless.** The page starts no Gameplay Session, and it neither reads nor writes Mercenary III Saves or Session Resume. The System Menu links to it. Leaving play to visit it keeps the Session Resume.
- **Title-local and separately versioned.** Catalogue documents carry their own `kind` and `schemaVersion`. They pin the same program image as the playable payload but may come from a different capture run. The playable loader never reads them, and they never read the playable documents.
- **Identities kept apart.** Original slot, group and cell references stay as fields. App IDs are opaque, and shared geometry is named by record family and source address (Geometry Identity), apart from its placements.
- **MIDAS as a rule, LOGOS as states.** MIDAS's 256-cell workspace is exported as its 16-cell repeating rule with no physical count. LOGOS's construction is exported as its evidenced initial and constructed states, with no campaign progression.
- **Coverage gates completion.** A generated, validated ledger lists every required Geometry Identity with its owner ticket and decoder path. #679 cannot close while any required identity is unrecovered or unpreviewed, or while any blocking gap remains.

## Considered Options

- Extend `payload/dion/world.json` to the whole world. This couples inspection to play's capture and Session Resume identity, and it loads the whole world for a Metis journey.
- Add Mercenary III to the Damocles Catalogue at `/catalogue`. That mixes two Titles' evidence and schemas, which ADR 0043 keeps apart.
- A separate sessionless Dion Catalogue under `/dion`, with its own documents. Taken.

## Consequences

- `/catalogue` is unchanged. Its eventual `/damocles/catalogue` home (ADR 0041) is still deferred.
- #681–#683 recover geometry against the ledger in parallel, #684 exports, #685 builds the page, and #686 validates against original scenes.
- Previews use ADR 0060's Authentic path. Recovery does not wait for #672.
