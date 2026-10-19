# Re-encode Benson Scripts into our own instruction format at export

Superseded for Targ by [ADR 0080](0080-run-targs-scripts-as-talk-scripts.md). The historical program and interpreter remain only as test oracles under `web/test/oracle/`; the live browser loads maintained Talk Scripts. The original decision follows.

ADR 0014 said game logic would ship as the original Benson Scripts under a small
native interpreter. It ships as the original *programs*, structurally preserved,
but not as the original bytes: the export verb fully decodes each script and
writes our own instruction format into the Data Payload — mnemonic operations,
branch targets as indices into one flat instruction list, inline message text
decoded into the same tokens the message table uses, packed BCD literals as plain
integers, and every machine address and key code resolved to a named symbol. The
program's structure, control flow, and semantics are the Reference Build's; its
encoding is ours. The interpreter never sees a C64 address, and a script cannot
reach engine state except through a named field of the Host Callout.

The reason is that the seam ADR 0014 wants is only as strict as its narrowest
point. The original interpreter had no host interface at all: scripts read and
wrote engine memory directly, with a general compare that could read any address
and a general store that could write any. Carried across verbatim, that would make
the app's seam a memory map — the interpreter would need somewhere to put a
`$BEF8`, and every later reader would have to know what lived there. Resolving
addresses during extraction turns that into a closed, named census, which is now
the seam's specification: the scripts touch one decimal-register byte, five engine
values, two sound registers, one key, and the object tables, and nothing else can
appear at runtime that did not appear in the export. Anything unnamed stops the
export rather than reaching the app, so a gap in the seam is a build failure and
not a silent misreading. The same pass is where the awkward parts of the original
encoding are paid for once instead of forever: opcode modifier bits, the message
text inlined into the instruction stream, and the pre-increment pointer
conventions all resolve at extraction, and the interpreter is left with an
instruction list. It is also the shape a Lua layer can consume, which is what the
seam is eventually for.

The alternative was verbatim bytecode with the interpreter implementing the
original opcodes directly. It keeps the payload byte-faithful, makes re-extraction
a dumb copy, and keeps the disassembly's addresses lining up with ours — real
advantages, and it was the recommendation. It was rejected because it puts the
C64's memory map inside the app and pushes the same decoding work into the
interpreter, where it would be re-litigated by every future reader instead of
settled once by a tool with tests.

The accepted costs are real. The payload is no longer a byte-faithful copy of
anything, so "did we extract this correctly?" is answered by the decoder's tests
and its structural guards rather than by comparing bytes. The decoder is now a
component that can be wrong in ways a copy cannot: a mistaken operand width would
shift every instruction after it, which is why each opcode's width is asserted
individually and the interpreter's own handlers are fingerprinted in memory before
any script is read. Cross-reading against the community disassembly costs an
extra step, since our instruction indices are not its addresses. And the format is
ours to version: the document carries its own schema version, and the app rejects
one it does not know.
