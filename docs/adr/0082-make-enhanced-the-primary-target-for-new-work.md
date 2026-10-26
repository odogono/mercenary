# Make Enhanced the primary target for new work

Accepted, 2026-10-26, for [#874](https://github.com/odogono/mercenary/issues/874). This supersedes in part [ADR 0060](0060-share-one-renderer-across-the-titles-with-an-authentic-indexed-mode.md) and [ADR 0077](0077-share-one-enhanced-planner-across-damocles-and-mercenary-iii.md), where they treat Authentic as an equal design constraint.

The ports have followed how the originals drew very closely: Targ's Ink passes, wireframes without a depth test, and painter's order. New content was then designed around those limits. Object colour (#874) is the first feature the originals never had, so it has to be designed for one presentation first.

## Decision

- **Enhanced is the primary target for new work in all three Titles.** New features, content and renderer work are designed for the shared Enhanced planner and renderer (ADR 0077) first, including depth, lighting and modern presentation.
- **Authentic remains a fidelity and comparison mode.** It keeps the original's order and palette, so that Golden Traces and pixel comparisons can check the planners' recovered rules. It does not constrain how new features are designed. A new feature draws in Authentic as closely as that mode allows, unless an ADR says otherwise (ADR 0081 makes geometry asset faces and colour identical in both presets).
- **All three Titles converge on the shared renderer.** Targ is the remaining Title outside the shared Enhanced planner ([#883](https://github.com/odogono/mercenary/issues/883)).
- Original-data concepts such as Ink and colour words stay in the payload and Geometry Assets. Each Title's planner resolves them to colours and draw order at the renderer boundary.

## Considered Options

- **Keep Authentic and Enhanced as equal constraints (ADR 0060 as written).** Every feature would have to be designed for both, which ties new work to the originals' limits.
- **Drop Authentic.** Simpler, but it loses the Golden Traces and the Mercenary III pixel comparisons that check recovered rules.
- **Enhanced first, with Authentic as a check.** Taken.

## Consequences

- Issues for new features state their Enhanced behaviour first, and state their Authentic behaviour only where it differs.
- Targ's Enhanced path moves behind the shared planner (#883). Until then, Targ features such as #874 draw through `web/src/shell/frame.ts` in both presets.
