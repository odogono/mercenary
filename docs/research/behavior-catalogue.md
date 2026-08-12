# Player-observable Behavior Catalogue

Research and catalogue contract for [issue #8](https://github.com/odogono/mercenary/issues/8).

## Result and qualification

The tracked catalogue is a public-safe index, not a publication clearance. It
contains neutral Catalogue Entries, evidence-linked Behavior Cases, a closed
domain coverage matrix, and a first-class uncertainty register. Exact messages,
audio, displays, memory, save media, decoded payloads, and comparison material
remain in ignored content-addressed storage.

The current evidence subject is the exact supplied ABC/1001 crack. The catalogue
can establish facts about that artifact, but plausible loader, save, startup, or
other crack-sensitive behavior remains `provisional` until retail C64 evidence
corroborates it. A provisional entry is never an implicit fidelity waiver: it
must cite an uncertainty that states the impact and next experiment.

## Catalogue model

- `CAT-####` identifies a Catalogue Entry. Domain tags and interpretations may
  change without changing the ID.
- `BC-####` identifies an atomic obligation or a materially distinct complete
  journey, using the normative Fidelity Contract template.
- `UNC-####` identifies one bounded uncertainty and the evidence needed to
  resolve it.
- `TR-####` identifies a versioned executable research trace.
- `EV-<digest>` identifies an immutable evidence record binding the Reference
  Build, VICE configuration, trace, decoders, and restricted artifact hashes.

The JSON indexes own cross-record relationships so the Fidelity Contract's
normative Markdown template remains unchanged. The catalogue validator rejects
broken references, domain-shaped identities, draft statuses, verified records
that depend on probe evidence, conflicting trace-version hashes, and tracked
expression-bearing fields. Restricted builds rehash every cited artifact and
digest only that cited set, so unrelated retained evidence does not perturb a
catalogue build.

## Research method

Static decoding enumerates candidate content, state, and transitions. Scripted
runtime traces establish player-observable effects and timing. Manual exploration
looks for unusual solutions, presentation effects, and evidence gaps. Manuals,
walkthroughs, and other editions are hypothesis checklists only; they cannot
verify an entry.

Trace branches start from a reproduced interactive checkpoint, a same-version
snapshot reached by legal actions, or authentic save media paired with the
legally reached snapshot it produced. Memory injection is
permitted only in `probe` traces. A probe can discover a branch but cannot verify
it until a legal action, checkpoint, or save/load trace reproduces the result.

Timing uses client-counted instructions and PAL raster line/cycle boundaries,
never host wall time. Deterministic claims require two cold-start matches.
Stochastic claims require at least 100 fixed-seed, timing-phase-varied trials;
counts and 95% Wilson intervals are retained, and any decoded but unobserved
outcome remains an uncertainty. No guessed Acceptance Envelope is accepted.

## Coverage and review

The required domains are controls, movement, timing, mechanics, objects,
vehicles, world, visuals, inventory, economy, missions, progression, messages,
audio, saves, endings, quirks, and nondeterminism. Every domain maps to entries,
Behavior Cases, and any affected uncertainties. Materially distinct escape
routes receive end-to-end journey cases; harmless input permutations do not.

Automated validation establishes structural completeness and reproducibility.
It does not replace review. Before issue #8 closes, one maintainer must approve
every domain plus material journeys, audiovisual evidence, save behavior, and
the final uncertainty register. The tracked baseline records those approvals
against one exact catalogue digest; later catalogue changes require fresh
review records and a regenerated baseline.

## Commands

```sh
research/c64-reference-build/lab catalogue run \
  --prg roms/c64.ABC/MERCENARY.PRG \
  --trace research/c64-reference-build/catalogue/traces/TR-0001-input-baseline.json

research/c64-reference-build/lab catalogue verify \
  --catalogue research/c64-reference-build/catalogue

research/c64-reference-build/lab catalogue build \
  --entries research/c64-reference-build/catalogue \
  --evidence-store restricted/behavior-catalogue/evidence \
  --geometry research/c64-reference-build/evidence/world-geometry-baseline.json \
  --output research/c64-reference-build/work/behavior-catalogue

research/c64-reference-build/lab catalogue review \
  --catalogue research/c64-reference-build/catalogue \
  --domain controls --reviewer <maintainer> --decision approved

research/c64-reference-build/lab catalogue summarize \
  --catalogue research/c64-reference-build/catalogue \
  --reviews research/c64-reference-build/catalogue/reviews \
  --output research/c64-reference-build/evidence/behavior-catalogue-baseline.json
```

See the primary-source [VICE capability note](vice-behavior-catalogue-capabilities.md)
for binary-monitor, WAV/SID, D64, timing, and snapshot constraints.
