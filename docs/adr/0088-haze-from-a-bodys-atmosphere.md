# Haze from a Body's Atmosphere

Accepted, 2026-11-04, for [#883](https://github.com/odogono/mercenary/issues/883).

Enhanced Targ subdued a Distant Structure with an Ink rule of its own. Distant white Ink faded toward `distantInk` grey between `cellSize·√½` and half the ground extent, and the wireframe glow faded over its own range. Damocles and Mercenary III had no distance rule at all. All three Titles' Enhanced views now share one rule, Haze, and it belongs to the Body the player stands on, not to the Title.

## Decision

- **Haze is shared and is applied per fragment by view distance.** It fades toward the current horizon colour of the Body's sky, by day or by night, and covers every world layer: ground, roads, faces, strokes and Far Points. The sky and view-fixed models are exempt.
- **A Body's Atmosphere sets the Haze.** A Body with no Atmosphere has no Haze.
  - Damocles and Mercenary III keep their recovered facts about whether a Body has an Atmosphere (Damocles's `$794D`). How thick it is goes in authored Enhanced presentation data, marked as authored.
  - TARG's Atmosphere is authored in the Targ System (ADR 0086).
- **Haze is absent** in space, in Targ's Rooms and in Damocles's Enclosed Regions. This mirrors Sunlight (ADR 0066).
- **Haze replaces Targ's Distant Structure fade and its glow falloff.** Authentic Targ never drew Distant Structures, so Authentic is unchanged.
- **Weather is not part of this decision.** It would vary Haze over time, but it is designed separately, and it must stay presentation only, outside Session State, Saves and Golden Traces.

## Considered Options

- **Keep Targ's fade as a Targ Ink rule in its adapter.** Rejected: it would leave a one-Title distance rule in a shared presentation.
- **Give each Title one Haze setting.** Rejected: an airless moon and a planet with air would haze alike.

## Consequences

- Distant Structures change from grey to the horizon colour: bluish by day and dark by night.
- Damocles and Mercenary III shipped with no thickness authored. #958 authored one thickness, four Region cells, for each of their Bodies with an Atmosphere.
- The term "fog" is kept free for weather. It is also already a wayfinding term in this repo.
