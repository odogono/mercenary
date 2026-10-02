## Repository

- `web/`: the browser app, its tests and tools; run `bun` commands here. `web/src/README.md` maps the source; `web/README.md` and `web/package.json` hold the commands. Run `bun run check` before a PR, and `bun run test:quiet` for test output that shows only failures.
- `research/<lab>/`: ROM research labs. Each lab's `README.md` lists its modules and probe recipes.
- `payload/`, `traces/`: the tracked Data Payload and Golden Traces (ADR 0029).
- `docs/research/`: findings, named `<title>-<topic>.md`; `rg -l` across it before reading. Mercenary III TOURCRAFT work starts at `docs/research/mercenary-iii-tourcraft-milestone-review.md`.
- `docs/adr/README.md`: the decision index.
- `restricted/`, `roms/`: gitignored Restricted Material. Evidence a doc cites goes under `restricted/<title>-<issue>/` in the main checkout.

### Worktrees

In a new worktree, run `scripts/worktree-setup.sh` first: it links Restricted Material and lab artifacts to the main checkout and installs dependencies.

### End-to-end tests

Port 5173 is usually taken by a running dev server: run `PORT=<free port> bun run test:e2e`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The default canonical triage labels are used unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses the single-context domain-doc layout. See `docs/agents/domain.md`.
