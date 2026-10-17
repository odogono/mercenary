# NorthTalk spike: Targ Talk Scripts

Throwaway. Rewrites Benson Scripts 0, 7, 13, 34 and 35 as Talk Scripts and runs them in a real Gameplay Session on NorthTalk (`@northtalk/ts`, pinned exactly in `web/package.json`), with every Benson Script refused. Findings and the recommendation are in [the report](../../../docs/research/targ-talk-scripts.md).

NorthTalk is a devDependency: only this spike imports it, and nothing under `web/src` does until an ADR accepts Talk Scripts.

## Run

From `web/`:

```sh
bun test ./spike/northtalk/talk.test.ts      # outcome tests, on the TS Core
NORTHTALK_WASM=/path/to/talk.wasm bun test ./spike/northtalk/talk.test.ts   # the same tests on the WASM Core
bun spike/northtalk/trace-diff.ts            # message diff against the script-0 Golden Traces
```

`talk.wasm` comes from an odgn-talk `reactor-v*` release (`gh release download -R odogono/odgn-talk`); `@northtalk/ts` doesn't ship it.

## Files

- `scripts/*.talk`: the Talk Scripts, and `benson.talk`, the Library they share for showing messages.
- `session.ts`: a `GameplaySession` whose Benson refuses every Benson Script, and which derives World Events by comparing each frame with the last.
- `host.ts`: the Host Callout as the `world`, `display` and `sound` Capabilities, World Events as Broadcasts, the display queue on the session's Benson Display, and the save.
- `names.ts`: the names Talk Scripts use for Rooms, objects and Sites.
- `sources.ts`: loads the Talk Scripts and the Library.
- `talk.test.ts`: outcome tests.
- `trace-diff.ts`: aligns the opening's messages with a Benson trace.
