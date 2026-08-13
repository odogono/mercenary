# Pivot to a private-first playable artifact

The project's product is a playable Faithful Remake judged by its maintainer
playing it beside the Reference Build, not a provable public fidelity claim. The
evidence apparatus built for the claim — Behavior Cases, Acceptance Envelopes,
content-addressed Evidence records, reproduced proof runs, Conformance Reports,
and the uncertainty ledger — is frozen: kept as history, extended by nothing.
The publication discipline is relaxed to a single hedge: extracted game data
lives in one gitignored Data Payload, and engine code is written from
understanding rather than mechanically translated, keeping a future publication
door ajar; addresses, decoded structure, and disassembly references are
otherwise ordinary working material.

Three findings forced the decision. First, the cost of the claim lived in its
commitments, not its implementation: one eight-row decoded table cost roughly
two thousand lines of tracked ceremony. Second, runtime reachability — the
process's gold standard — was its slowest instrument: after the entire effort,
legal play had reached two of eight enterable objects. Third, the static
analysis the process treated as merely corroborative was decisive in practice,
and the community has independently completed it: an actively maintained,
symbolically annotated disassembly of exactly this C64 edition exists
(the Reference Disassembly), including the decompiled game-logic VM. It is
unlicensed, so it is consumed as reference documentation only; every byte
entering the Data Payload is re-extracted from our own Reference Build by our
own tooling.

Game logic ships as the original Benson Scripts running under a small native
interpreter behind an explicit host-callout seam, with an eventual rewrite of
the scripting layer in Lua anticipated at that seam. Fidelity is modernised
feel: world, mechanics, and progression preserved; speeds, smoothness, and
controls tuned for a modern player. The alternatives — continuing the evidence
programme, or embedding an emulator — were rejected as, respectively, too slow
to ever yield a game and not a remake at all. The accepted costs: conclusions
now rest on maintainer judgement rather than audited evidence, re-extraction
costs an afternoon per table over copying community dumps, and any future
public release would require re-establishing provenance for everything the
hedge does not already cover.
