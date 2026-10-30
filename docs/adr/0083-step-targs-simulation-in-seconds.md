# Step Targ's simulation in seconds

Accepted, 2026-10-30. This does for Targ's simulation what [ADR 0082](0082-make-enhanced-the-primary-target-for-new-work.md) did for its presentation: the original's timing stops constraining new work and remains a comparison. It amends [ADR 0080](0080-run-targs-scripts-as-talk-scripts.md) where that ADR counts time in Benson ticks or delivers World Events after the frame. It reopens none of Damocles's or Mercenary III's cadences ([ADR 0049](0049-run-one-damocles-substep-per-tick-without-st-frame-cost.md), [ADR 0051](0051-run-the-damocles-craft-pass-exactly-once-every-four-ticks.md), [ADR 0058](0058-run-mercenary-iii-at-50-hz-with-a-confirmed-fixed-frame-cadence.md)).

The shell already drives the Gameplay Session with a fixed 1/60 s step, but the session turns each step back into the original's clocks: a 20 Hz reference frame for walking, flight, combat and delivery, 50 loops a second for the ending, the payload's lift rate, and Benson ticks of `framesPerTick` × `timeScale` for the Benson Display and Talk Scripts. Each keeps its own remainder, and the order of work within a frame decides outcomes. Moving the Benson oracle's script starts onto World Events (#904) failed on exactly that: a Room's entry script starts before the oracle ticks in the same frame.

## Decision

- **One fixed step, in seconds.** Every system advances once per step by the step's duration. The step rate is a tuning value, 1/60 s for now, not a hardware fact. Rendering interpolates between steps (ADR 0078).
- **Rules are rates and durations.** The Data Payload keeps the recovered per-frame values as evidence (ADR 0029); the payload loader converts them to seconds and per-second rates, and nothing past the loader sees frame units. Per-frame flight coefficients are converted so the craft handle as the original does at its 20 Hz (a damping `k` per frame becomes `k^(20·dt)` per step); trajectories differ, handling does not.
- **World Events are delivered within the step they happen in,** in the order they happen.
- **The Gameplay Session owns the random stream.** Talk Scripts draw from it through the World Port. The Benson channel keeps the Benson Display only.
- **Talk Script and Benson Display timing is in seconds.** Benson ticks and `timeScale` go.
- **Golden Traces and oracle parity are a diff baseline for Targ, not a gate.** Each area's trace gates (flight, game core, navigation, session, Benson) are retired in the change that converts that area, replaced by player-visible outcome tests with tolerances.
- **Saves.** Each change that alters a saved field bumps the Save schema and refuses older Saves (ADR 0073).

## Order

The World Port (#905); the session's random stream; one step with the internal clocks removed; the Benson Display and Talk timing; the lift, ship delivery and ending; combat; flight and movers last.

## Considered Options

- **Keep the original's clocks (status quo).** Frame-exact parity with the Golden Traces, at the cost of every new system fitting a C64 frame and tick order.
- **Variable timestep.** Simplest loop, but Saves, replays and tests stop being reproducible.
- **Fixed step in seconds, rules as rates.** Taken.

## Consequences

- Targ's flight, game-core, navigation, session and Benson Golden Traces stop gating changes and are retired area by area.
- Outcomes that depended on frame order or on the shared random stream's cadence may change; outcome tests state what must hold.
- If a module shared with another Title is converted, that Title keeps a frame-based adapter.
