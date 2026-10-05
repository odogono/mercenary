# EAGLE flight in Dion

Issue [#793](https://github.com/odogono/mercenary/issues/793) extends the
rule-based port in ADR 0075 to manual EAGLE flight. `TourcraftFlight` runs the
shared craft and space passes for both pilots, while `TourcraftSession` owns
boarding, placement, service order, Body binding and unported-effect notes.
TOURCRAFT still takes its controls from playback; EAGLE takes the live stick.

The [R4 source contract](research/mercenary-iii-eagle-flight.md) establishes
slot 3's parameter tail as byte-identical to slot 1. The adapter binds that tail
as slot 3, retaining a distinct pilot identity without duplicating arithmetic
or borrowing a Damocles resident. The shared `craftMotionPass` exposes launch
swing and hard touchdown before Dion's interposed service and collision retry.

Board reads KEY181's held bit, keeps the key and stages resident 3 in VOID.
Leave requires surface contact. It places that same resident at the current
craft XYZ with eye height subtracted, and writes the current yaw. A hard
touchdown stops and disembarks. Surface yaw and pitch are manual rather than
TOURCRAFT cabin look: `$59CF0..$59DD0` copies the physical pose and skips the
playback-only cabin transformation. Manual Body arrival subtracts the
current destination Body Rotation; automated arrival retains its zero rotation.

METIS and TOLOSA use their existing promoted worlds. An arrival request for
any other Body is consumed, leaves the player in space and reports the missing
content. Firing takes input without allocating shots. Native hostile encounters
stay inert while piloting EAGLE and are noted when boarding; this port makes no
claim about damage, kills or encounter outcomes.

Dion Save schema 4 carries the pilot, raw craft/space words, pending arrival,
frame counters and the authoritative resident placement. It validates manual
state structurally and against copied pose/owner aliases; TOURCRAFT retains
its stricter playback-path validation. Earlier prototype Saves are refused
under ADR 0073. Tests use synthetic candidates as ADR 0075 permits, and compare
restored futures in surface flight and space, plus ground/landing placements.
