# Make the Host Callout a persistent value

The Host Callout is already a value in Swift: `BensonHostState` is a struct, and
`acrossTheCallout` mutates a local copy through `inout`. The browser port goes
one step further and makes both `BensonHostState` and `BensonState` *persistent*:
every write returns a new value, threaded through every instruction, rather than
cloning once at `BensonMachine.run` and mutating the draft.

That is so `acrossTheCallout` cannot alias, a Replay Gate observer can hold
before and after without cloning, and a future JavaScript rules layer at the
seam receives values rather than a shared object. The cheaper alternative —
clone-and-mutate a draft for one `run`, which is the shape M4.4 shipped — was
rejected because a draft still aliases if anything keeps the object; readonly
fields that still mutate were rejected as a type-system lie. Swift keeps `inout`
structs: the Trace Oracle is not modified to suit the port (ADR 0019).
