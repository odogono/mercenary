# NorthTalk spike: Targ Talk Scripts

Throwaway. Rewrites Benson Scripts 0 and 7 as Talk Scripts and runs them on NorthTalk (`@northtalk/ts`, pinned exactly in `web/package.json`). Findings and the recommendation are in [the report](../../../docs/research/targ-talk-scripts.md).

NorthTalk is a devDependency: only this spike imports it, and nothing under `web/src` does until an ADR accepts Talk Scripts.

## Run

From `web/`:

```sh
bun test ./spike/northtalk/talk.test.ts      # outcome, concurrency and save tests, on the TS Core
NORTHTALK_WASM=/path/to/talk.wasm bun test ./spike/northtalk/talk.test.ts   # the same tests on the WASM Core
bun spike/northtalk/trace-diff.ts            # message diff against the script-0 Golden Traces
```

`talk.wasm` comes from an odgn-talk `reactor-v*` release (`gh release download -R odogono/odgn-talk`); `@northtalk/ts` doesn't ship it.

## Files

- `scripts/*.talk`: the Talk Scripts.
- `host.ts`: the Host Callout as the `world`, `display`, `keys` and `sound` Capabilities, plus the display queue, clock and save.
- `sources.ts`: loads the Talk Scripts and seeds host state from the Data Payload.
- `talk.test.ts`: outcome tests.
- `trace-diff.ts`: aligns Talk Script messages with a Benson trace.
