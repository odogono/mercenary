# Weather as a daily pick over a Body's Haze

Accepted, 2026-11-05, for [#959](https://github.com/odogono/mercenary/issues/959). Follows [ADR 0088](0088-haze-from-a-bodys-atmosphere.md), which left Weather out.

Haze has one fixed thickness per Body. Weather varies it over time, from clear days to mist. It must stay presentation only: deterministic from the game's clock, and outside Session State, Saves and Golden Traces.

## Decision

- **Weather only scales the Haze half distance** of the Body's Atmosphere. The Haze colour stays the horizon colour, and the sky dome and Sunlight are untouched. Weather exists only where Haze does, so it is absent in space, indoors, in Enclosed Regions and on a Body with no Atmosphere. Authentic presentation is unchanged.
- **Weather is a discrete state picked once per Body Day.** The states are named, each with a multiplier: Clear ×2, Hazy ×1 and Mist ×0.25. The pick is a hash of the Body id and the observer's local Body Day number, weighted by the Body's **Weather profile**. Every Body with an Atmosphere starts on one default profile, marked as authored.
- **The day number is local.** It is the whole-day count at the observer's longitude, read from each Title's clock: Mercenary III's `phase` turns, Targ's clock over elapsed time, and Damocles's Body Time. The pick therefore always changes at local midnight. Crossing the date line can change the Weather.
- **Body Time shapes the day.** Every day starts misty and eases toward its picked state by noon, and a short blend around local midnight hides the change of pick.
- **Weather is never stored.** It is recomputed from the clock each frame. A presentation-only `weather` console command can override it for testing, and the override is not saved.

## Considered Options

- **A fixed daily pattern from Body Time alone.** Rejected: every day would look the same.
- **Continuous noise over time and position.** Rejected: harder to name, test or override, and it adds a spatial axis nobody asked for.
- **A day count at a fixed reference longitude, shared by the whole Body.** Rejected: the pick would change at arbitrary local hours, in plain view.

## Consequences

- Hazy reproduces today's Haze tuning (ADR 0088) exactly.
- Golden Traces and Saves are unaffected. Visual tests must pin the Weather through the override.
