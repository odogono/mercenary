# Define handler-equivalence classes by UNC-0001-relevant parameter projection

A Handler-Equivalence Class is keyed by the projection of an enterable object's
locomotion parameter block onto the offsets that provably affect UNC-0001's
mode-neutral responsibilities — the Semantic Action surface, input conflicts, rate
limits, and PAL timing. An offset consumed by no dispatched handler is excluded
from the key as inert and recorded as such in a per-field ledger; an offset whose
inertness cannot be shown keeps its member in its own class.

Two alternatives were rejected. Keying on the whole parameter block byte-for-byte
needs no inertness argument and is trivially sound, but every enterable member
would form its own class by construction, so UNC-0001 would gain nothing from the
partition it asked for. Keying on observed behavioural equivalence — running
UNC-0001's full matrix per member and merging identical results — is empirically
the strongest, but it is per-identity proof wearing a class costume and costs
exactly what the partition exists to avoid.

The projection is hard to reverse because UNC-0001's entire proof structure rests
on it: promoting or demoting one offset changes how many times the action,
conflict, and timing matrix must be proven, and invalidates the coverage already
recorded against the old partition. It is also surprising without this context,
because the first observation anyone makes is that the parameter blocks are not
byte-identical, which invites the conclusion that no two members can share a
class.

The consequence is deliberate and currently visible: under this key the decoded
partition is singleton — every enumerated enterable member projects to a distinct
key — so UNC-0001 must prove its matrix once per member until specific rate
magnitudes are shown inert. The manifest therefore also records the dispatch
handler count, which is the coarsest partition the dispatch structure alone would
support, as the candidate coarsening a future inertness argument would unlock. The
alternative to accepting that cost is a class key that quietly asserts inertness
it has not established.
