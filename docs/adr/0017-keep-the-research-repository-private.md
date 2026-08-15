# Keep the research repository private

This Git repository and its history are a permanently private research artifact, so the unlicensed Reference Disassembly may be retained here as a reviewed, provenance-bound snapshot instead of a volatile external checkout. This amends ADR 0014's future-source-publication hedge but not its Independent Implementation boundary: the snapshot is reference documentation only, ROM-derived data still reaches the app solely through our own extraction into the gitignored Data Payload, and any application distribution remains subject to the existing qualified-review gate.

The repository must not be made public or included in a source release. Each Reference Disassembly update names one upstream commit, preserves the selected files byte for byte, refreshes their checksums, and is reviewed as an intentional change; ROMs, captures, generated evidence, Data Payloads, and other Restricted Material remain outside Git.
