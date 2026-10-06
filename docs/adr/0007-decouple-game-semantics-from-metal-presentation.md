# Decouple Game Semantics from Metal presentation

Superseded by [ADR 0024](0024-run-the-browser-session-on-the-main-thread.md). The original runtime decision follows.

The Initial Release will run Game Semantics in a deterministic, non-main serial runtime that consumes Semantic Actions and publishes immutable Game Surface snapshots plus ordered events. A hybrid renderer will keep scene membership, primitive ordering, and level-of-detail selection on the CPU while Metal performs evidence-derived integer projection, clipping, and native-resolution presentation against a CPU oracle; the runtime will receive one eagerly validated immutable resource graph.

This boundary was chosen over a main-thread or variable-step simulation, a GPU-driven game model, and a general-purpose engine because display cadence, window state, rendering load, and Mac Adaptations must not change simulation history. It costs an additional reference-rendering path, strict resource admission, and explicit snapshot and event handoff, but makes determinism and fidelity independently testable.
