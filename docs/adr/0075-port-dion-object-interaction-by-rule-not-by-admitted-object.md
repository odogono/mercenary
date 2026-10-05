# Port Dion object interaction by rule, not by admitted object

Accepted by the user, 2026-10-05, for [#756](https://github.com/odogono/mercenary/issues/756). Take, Drop and the Carried Stack in `/dion` follow the original handlers for every object, not for a reviewed list of objects. With pickup and native EAGLE flight in play, almost the whole game becomes reachable. Proving per-object reachability before admitting each object (R2/#771, R3/#772) did not converge, and those tickets are closed as reference.

## Decision

- Port the original rules once: Take `$55364`, Drop `$55794`, the stack moves at `$4E1FC..$4E2B8`, the label scroll `$4E3A6` and staging `$53CC4`. Apply them to every resident record. Whatever the original allows becomes reachable. No per-object admission or route proof is required.
- The TOURCRAFT export writes every resident record of the gameplay-opening capture, and binds the opening model of every object resident on an admitted Body or carried. This amends [ADR 0065](0065-promote-bounded-dion-catalogue-content-through-an-explicit-export.md) for resident records only. The Catalogue record's own digest and its source ranges in the pinned RAM replace a hand-reviewed manifest row. Placements, services, scripts and other geometry stay bounded and reviewed.
- Rules that Damocles and Mercenary III share live in `web/src/interaction/carriedStack.ts`: the handling-bit and capacity refusals, rotation and the BRIEFCASE split. Both Titles use them. This extends [ADR 0074](0074-share-evidenced-craft-passes-with-title-owned-orchestration.md)'s shared-core boundary to the Carried Stack. Identities, Residence, messages, sounds and effects stay Title-owned.
- An effect the port has not reached yet takes its input and does nothing, as [ADR 0064](0064-present-damocles-control-profile-in-mercenary-iii.md) has it for keys, and names itself in the Shell Console. Each becomes its own follow-up ticket. This covers the pickup responses, the pawn at structure `$52`, the slot-213 flag and Open of objects other than TAXICARD.
- R1's original-engine runs are regression evidence for the mechanism. Synthetic or save-edited setups are acceptable tests of behaviour.

## Consequences

Content identity changes, so earlier Dion Saves are refused, as [ADR 0073](0073-drop-pre-release-prototype-save-migration.md) allows. The TOURCRAFT Save schema becomes 3. It carries the ordered stack, the BRIEFCASE store, capacity, label scroll and every resident's Residence. Validation checks that held bits agree with the stack, rather than freezing residents at their seed. The drawn list `$53C2A` is rebuilt from live residents every frame, as the original does, so a dropped object draws where it lies. An interior resident joins its region's queue only on the current Floor.
