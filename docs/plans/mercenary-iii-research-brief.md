# Mercenary III research brief

Planning decisions for [issue #609](https://github.com/odogono/mercenary/issues/609), agreed during the grill-with-docs interview. Shared understanding confirmed on 2026-09-29; the interview is complete. This brief is not the research report, evidence of Mercenary III behaviour, or an accepted integration architecture.

## Agreed decisions

1. **Deferral is a valid recommendation.** If the evidence does not justify integration, the report may recommend deferral, explaining why and identifying a concrete condition for reconsideration. A playable milestone proposal does not itself commit implementation.
2. **The first milestone must demonstrate distinctive play.** Prefer the smallest sequence that exercises Damocles reuse and a distinctive Mercenary III player decision with an observable consequence. Familiar movement with only a cosmetic or incidental difference is insufficient. Select the actual sequence from the evidence.
3. **A conditional recommendation can complete the research issue.** An unresolved probe that could invalidate the proposed sequence must be stated as a blocking hypothesis and placed first in the follow-up dependencies. Implementation relying on that hypothesis waits for its resolution. Uncertainty affecting only implementation detail may remain non-blocking.
4. **Demonstrated reuse is a bounded claim.** Classify data and behavioural reuse separately. Data reuse requires matching decoded meaning and values; behavioural reuse requires structural evidence and controlled runtime observations, including relevant edge cases. Anything less remains plausible, with the missing evidence named. Identical tables alone do not establish equivalent behaviour.
5. **Stop at a decision-ready survey.** Every capability area listed in #609 must have evidence or an explicit gap, candidate milestones must be comparable, and every uncertainty capable of changing the recommendation must be resolved or assigned a blocking probe. Deep recovery beyond these needs becomes follow-up work.

## Comparison baseline

Check Damocles against the current implementation and record the compared revision in the research report. Issue #419's description predates recovered craft parameters and additional boarding checks: `web/src/damocles/craft.ts` consumes `CraftParameters`, and `web/src/damocles/session.ts` documents eight boarding tests plus a death-state refusal. Treat #419 as a question the findings inform, not as a current inventory of Damocles capabilities.

Cadence comparisons must distinguish VBL ticks, original main-loop frames and browser-render frames. ADR 0051 establishes one Damocles craft pass per four ticks; similarity of tables does not establish Mercenary III's cadence.

## Documentation scope

Existing constraints in #609 continue to apply, including research-only scope, separate title boundaries, no boarding convergence, and review of findings before implementation follow-up tickets are created. No new domain term or architecture decision has been accepted in this interview.

The subsequent investigation is recorded in the [Mercenary III integration report](../research/mercenary-iii-integration.md); its recommendations remain subject to findings review.
