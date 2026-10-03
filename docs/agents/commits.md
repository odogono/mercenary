# Commits and the changelog

PRs are squash-merged, so a PR's title becomes the commit on `main`. CI checks every PR title, and requires a changelog fragment for the changes a reader of the changelog would want to hear about. A `commit-msg` hook checks local commits' format; `scripts/worktree-setup.sh` turns it on.

## Subject format

```text
type(scope)!: Sentence-case imperative description (#issue)
```

- **type**, one of:
  - `feat`: a new or changed behavior a player or user would notice, including a Title's newly recovered content shipping in the app.
  - `fix`: a behavior that was wrong.
  - `perf`: the same behavior, faster or smaller.
  - `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`: no change a user would notice. Research findings are `docs(research)`.
- **scope**, optional, one of `damocles`, `targ`, `dion`, `web`, `research`, `payload`, `traces`, `docs`, `repo`. Prefer the Title when a change belongs to one.
- **!**, before the colon, marks a breaking change. A `BREAKING CHANGE: ...` line in the PR body does too.
- The description starts with a capital letter and doesn't end with a full stop. It may end with the issue it closes, as `(#695)`, or the ADR it records, as `(ADR 0069)`.

Examples:

```text
feat(damocles): Show the title-screen logo on System Menu pages (#695)
fix(dion): Keep the prison door shut until DOOR KEY A (#645)
docs(research): Record recovered Damocles and Atari ST Targ panels (#742)
ci(repo): Enforce Conventional Commit titles and changelog fragments
```

The hook lets through `fixup!`, `squash!` and `amend!` commits, and the merge and revert commits git writes itself.

## When a changelog fragment is needed

A PR whose title is `feat`, `fix` or `perf`, or marks a breaking change, adds a fragment under `changelog/unreleased/` whose type and scope match the title. [The fragment format](../../changelog/README.md) describes the file. There is no way to skip this: a change with nothing worth recording has the wrong type, so retitle it.

To see the unreleased changelog, run `bun run changelog` in `web/`.

To check a PR the way CI does, run from the repository root:

```sh
PR_TITLE="feat(damocles): Add x" BASE_REF=main bun tools/commits/check.ts pr
```
