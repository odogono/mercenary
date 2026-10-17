# NorthTalk spike: Targ Talk Scripts

Throwaway. Rewrites Benson Scripts 0 and 7 as Talk Scripts and runs them on NorthTalk's TS Core. Findings and the recommendation are in [the report](../../../docs/research/targ-talk-scripts.md).

It sits outside the app's `tsconfig.json`, lint and `bun test`, because `@odgn/northtalk` is private and resolved from a local checkout.

## Setup

```sh
(cd /path/to/odgn-talk/impl/ts && bun link)
cd web/spike/northtalk && bun install
```

## Run

```sh
bun test ./talk.spike.ts   # outcome, concurrency and save tests
bun trace-diff.ts          # message diff against the script-0 Golden Traces
```

## Files

- `scripts/*.talk`: the Talk Scripts.
- `host.ts`: the Host Callout as the `world`, `display`, `keys` and `sound` Capabilities, plus the display queue, clock and save.
- `sources.ts`: loads the Talk Scripts and seeds host state from the Data Payload.
- `talk.spike.ts`: outcome tests.
- `trace-diff.ts`: aligns Talk Script messages with a Benson trace.
