# Author scripts as named TypeScript steps

Accepted for the isolated Damocles first-offer prototype in [#286](https://github.com/odogono/mercenary/issues/286). Maintain scripts directly as ordinary TypeScript functions with named execution steps and explicit serializable state. Preserve recovered behaviour through evidence-linked transitions and deterministic tests, while making the maintained source readable and editable without regenerating an instruction-shaped program. The [first-offer design](../design/damocles-first-offer-script.md) specifies the bounded contract established by [#288](https://github.com/odogono/mercenary/issues/288).

The named **Host Callout** remains the boundary for state and effects. Execution and host values follow [ADR 0023](0023-make-the-host-callout-a-persistent-value.md): each change returns a new value, with no shared mutable state or hidden closure locals. Damocles gets its own bounded interface; this is not a common scripting framework for Damocles and Targ. The original programs remain research evidence and comparison baselines, and their glossary names remain unchanged.

## Tradeoffs

Generated instruction-shaped programs preserve correspondence with recovered control flow and are easy to compare mechanically. They make the maintained source an extraction product, however, rather than human-authored logic. Named TypeScript functions allow ordinary code review and direct maintenance; their cost is explicit continuation bookkeeping and a greater obligation to preserve behaviour through provenance and tests. Separate input checks in this prototype reflect observed scheduling, not a requirement to translate every original opcode into a function in future scripts.

Linear async functions or generators would express sequential dialogue more compactly, but their suspended JavaScript stack and closure state are not a serializable continuation. Persisting them would require replay, transformation or another execution representation. Explicit named steps make the save boundary inspectable at the cost of less linear authoring. The prototype advances only through supplied actions, never browser clocks.

## Migration boundary

This establishes the intended eventual replacement of [ADR 0015](0015-re-encode-benson-scripts-at-export.md)'s program representation, not its current supersession in Targ. Targ continues to execute its existing instruction data and persist its existing execution state. No Gameplay Session integration, Data Payload conversion, live Save or Session Resume change is authorized by this prototype.

Prototype format and script revision identifiers only reject incompatible prototype records. They are not a production save policy. A later Targ migration may intentionally break compatibility, but must first decide production script revision identity, compatibility validation and migration or rejection policy. Existing policies in [ADR 0026](0026-store-explicit-save-snapshots-as-bounded-json.md), [ADR 0030](0030-keep-one-browser-session-resumable.md) and [ADR 0044](0044-admit-damocles-saves-as-a-title-scoped-snapshot.md) remain in force.
