# Domain Docs

How the engineering skills should consume this repo’s domain documentation when exploring the codebase.

## Before exploring, look these up

- **Glossary terms**: `CONTEXT.md` at the repo root is too large to read whole (about 200 terms). Look up each term you use: `rg -n -A3 '^\*\*Term' CONTEXT.md`, or `rg -n '^\*\*' CONTEXT.md` to list them all.
- **ADRs**: find relevant ones in the `docs/adr/README.md` index, then read those in full.

## File structure

This repo uses the single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
└── web/src/
```

## Use the glossary’s vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in `CONTEXT.md`. Don’t drift to synonyms the glossary explicitly avoids.

If a needed concept isn’t in the glossary, reconsider whether it reflects project language or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it.
