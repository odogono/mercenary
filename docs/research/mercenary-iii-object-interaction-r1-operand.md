# Mercenary III: R1 original Save/Load and Take operand

Executed supplementary research for [R1/#770](https://github.com/odogono/mercenary/issues/770), 2026-10-04. Two retained executions from the same route seed write and restore original Save files through the original Load routine, reach its imported executable prefix, and leave Take's six-byte instruction at `$553A4..$553A9` unchanged at all nine retained cuts in each execution. A subsequent synthetic heavy-object action reaches that original reader and refuses with string index 2. **This resolves the finite route's outcome, not the general restore-time writer policy; R1 remains open.** No bounded exclusion or implementation admission follows.

This extends the operand gate in the [execution handoff](mercenary-iii-object-interaction-r1.md#remaining-r1-gates), [acceptance audit](mercenary-iii-object-interaction-r1-audit.md) and [selection follow-up](mercenary-iii-object-interaction-r1-followup.md). Under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md), original programme bytes, RAM, disk images and disassembly stay ignored under the main checkout's `restricted/mercenary-iii-770/operand-audit/`. The [numeric ledger](../../research/mercenary-iii-st/object-interaction-r1-operand.json) contains pins and independently interpreted observations, not original instructions or Save bytes.

## Static original paths and their limits

Inspection uses accepted route32 `f140.ram`, Capstone 5.0.7's M68K/68000 big-endian decoder and the existing ignored `mercenary-iii-681/m68.py`. The read-only slices are retained as `save-load.txt`, `save-state-prefix.txt`, `menu.txt` and `io.txt`; the broader linear sweeps `engine.txt`, `low.txt` and `tail.txt` include data and are not a control-flow proof.

| Original reader/path | Inspected behavior |
| --- | --- |
| Undo menu `$56B72..$56BA2` | Original latch command `$62` opens the menu; `$3B` selects Save and `$3C` selects Load. Original slot/confirmation readers accept slot1 command `$02` and Return `$1C`. |
| Save `$56556..$565DE` | Copies four script-owner longs into low-state staging, then passes `$5550`, length `$2056` and the slot filename to original disk writer `$67800`. |
| Load `$56454..$564C0` | Original disk reader `$67802` loads into a screen-buffer workspace. The caller checks its leading signature, copies `$2056` bytes into `$5550..$75A5`, reinstalls the four staged script-owner longs, and **calls `$5554` inside the loaded block** before panel rebuilding. |
| Imported prefix `$5554` | This inspected source has an immediate return, followed by unused zero-filled space before the stack fields. That describes this image, not every possible original Save file. |
| Take `$55388..$553B0` | The long-form reader at `$553A4` names `$641E`, the slot0 state byte. Following the earlier slot0/handling/tool checks, its negative-byte result bypasses the bit5 refusal. |

The ordinary bulk-copy destination excludes `$553A4`. That is a specific static range fact, not proof that Load cannot modify the instruction: the loaded prefix is executable, and its instructions could perform indirect writes if its contents differ. This identifies a concrete restore boundary missing from the earlier literal-address search. It does not show that the original game produces such a prefix, identify a title-specific replacement item, or prove that any other writer is absent. A synthetic prefix patch would demonstrate an injected predicate or writer, not original writer policy, and is not supplied here.

Sources: original RAM, the retained disassembly slices and the hashed original Save/Load/FDC ranges below. No Damocles identifier establishes a Dion identity.

## Executed original disk witness

`probe-verified.py` launches the pinned emulator/media and restores the complete accepted route32 `f140.sav`. It attaches a newly generated, ignored 720 KiB FAT12 scratch disk as driveA after restoration; the pinned STX remains unchanged. The original programme writes and reads `M3_1.MGS` through its own FDC/file routines. Host code creates the empty formatted disk and independently reads the resulting FAT chain; it does not replace original Save/Load file operations.

The seed inherits the prior masked-frame/eleven-original-tick wait instrumentation at 32 MHz. Original menu entry explicitly unmasks interrupts with SR `$2300` so its message/I/O waits can execute. This paused menu is not claimed to preserve eleven-tick gameplay gaps. Inputs write original key latch `$56726`; they are not physical keyboard/IKBD inputs. The first retained pre-Save top is frame142, following the source cut's frame 141.

| Retained cut | Original frame/tick | Observation |
| --- | --- | --- |
| `before-save` | 142/1576 | Carried order `[104,103,135]`; instruction operand names `$641E`. |
| `save-return` | 142/1577 | Original writer returns D0 `$2056`; actual file length is 8,278 bytes and file bytes equal the retained Save source block. |
| `after-save` | 143/1587 | Probe next replaces carried-head byte104 with103, explicitly a synthetic restore-marker perturbation. |
| `load-before-copy` | 143/1589 | Perturbed order `[103,103,135]` is observed; the original reader has fetched the file into its workspace. |
| `load-before-prefix` | 142/1589 | Original copy restores `[104,103,135]` and saved frame142; execution is immediately before its call of imported `$5554`. |
| `load-after-prefix` | 142/1589 | The imported prefix executed its immediate return. Its retained range and Take instruction remain unchanged. |
| `after-load` | 143/1598 | Original frame resumes with restored order. |
| `before-take` | 143/1598 | Explicit synthetic heavy-target fixture is installed after Load, as described below. |
| `after-take` | 144/1609 | Original heavy refusal preserves carried count 3/order; the action crossed a completed frame. |

All nine cuts retain the same six instruction bytes, naming `$641E`. These are cut comparisons, not a watch for transient writes. In the selected reproduced run, the pre-prefix low-state image is byte-identical to the fetched file. In the archived first run it differs at byte `$729B` only. That byte belongs to raster-timing word `$729A`, written at `$530E8` and cleared by interrupt code `$532D8`; intervening interrupt activity is a plausible explanation, not a traced writer attribution in this probe. The Load copy is not presented as an atomic whole-machine restore or complete future-equivalence proof.

After genuine Load, the separate synthetic fixture selects slot67 at exponent8, clears scroll/special-target owners, sets its bit5 handling byte and clears held bypasses for slot0/POWERGLOVE/ANTIGRAV. It writes Take into the original key latch. The log reaches `$55364`, then `$553A4` with D3=67/D1=`$20`, reading `$641E` as zero, then original refusal helper `$55B00` with D1=2. This proves the restored instruction's reached effect in that declared fixture. It supplies no ordinary transporter access, tool acquisition or alternate-operand identity.

`verify.py` independently validates **36 assertions**, accepting exact fetched-file equality or a difference confined to byte `$729B`, including environment/source/tool pins, all nine instruction comparisons, the observed restore-marker replacement, actual FAT12 file extraction, reached prefix/Take/refusal logs and the completed heavy-action frame. Source, capture and log identities are also retained in `verification.json` and the numeric ledger.

The first nine-cut witness is preserved under `verified-retained/`, with `verification-before-reproduction.json`; the exact same `probe-verified.py` was re-executed into the current `verified-restored/` witness. Frame/tick observations in the table agree across both runs, while eight of nine whole-RAM hashes and the original-produced file hashes differ. Original instruction, prefix and routine-range hashes agree. `reproduction-check.py` validates **29 additional assertions** across the two retained witnesses and a negative control: a copied pre-prefix capture with stack-count byte `$563D` corrupted is rejected by the copy-difference assertion. The original captures are untouched. This variation supplies no whole-machine or file-hash equality claim.

Two preceding exploratory runs remain under `operand-audit/runs/` and `operand-audit/heavy-restored/runs/`. The first, selected by `operand-audit/exploratory-manifest.json`, completed original Save/Load but its nominal post-Take breakpoint fired at the same top as the input, so it supplies **no executed Take witness**. The second corrected that boundary and reached the heavy reader, but lacked the explicit pre-copy restore-marker cut. The nine-cut `verified-restored` run is the selected witness; these earlier artifacts are not silently substituted for it.

## Pins and reproduction

SHA-256 pins below are full identities. Range ends are exclusive. Complete cut hashes are in the numeric ledger; the selected original process log is `verified-restored/runs/original-save-load-a74qpj82/hatari.log`.

| Artifact | SHA-256 |
| --- | --- |
| Source route32 `f140.ram` | `332934dbcd0f667d66d8959d3496859e9171757dc6228e4bf5b23b44bc6d64a5` |
| Source route32 `f140.sav` | `97e1360769a96ef15aa3fbc4ee8774252acc04141569b3a9c45ecade5a4d5d76` |
| Pinned STX | `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c` |
| Pinned TOS | `154803e3ff4851f3dc358b91b16d6b6110d187a81d8132ecb665af49878939d5` |
| Hatari 2.6.1 | `05723606c75a1f0642395974abdce2cbbe48b0a09a747f65cdfca7ef9201e11a` |
| Take `$55354..$55458` | `fd9e62379d54931ed6bc5b4078031fa497b128fc177c781dc69d35a3464db061` |
| Six-byte instruction `$553A4..$553AA` | `4d9e887973e653c79dd36b89db69576ff0ff7037c362a3f3a3cc465504aef392` |
| Save/Load `$56454..$565E2` | `f236dcfeb038d3767c0fe44160506c2c17a40c5166ff2069ba80fa0b007aa727` |
| FDC/file code `$67800..$67FC0` | `dbf6c3af0c33b1bbae4aa072dc36be61f9b274a5a1a61a69a74046e6c12e911f` |
| Imported-prefix range `$5554..$563A` | `b3e33231122e276612f34f2530f718c09a7b21b8381371a6e878e511dc088a63` |
| `probe-verified.py` | `a9de288e7fd063a22854c8cad7a1f0f5316c75cdff67d0aab805a62d3394c0a2` |
| `verify.py` | `0f7c55a09dfc6625e459f78175fe5f86640f0e3d89abfd2576b5f1f83c6c51b8` |
| `reproduction-check.py` | `92fe48f663cf24a5bddc4080fc9afe7f9d39cf55c441ccd33c8b3167f349ed36` |
| Selected original log | `e4dcfa1760eac76e6518ff6f11e1303cbddd51f5b43c267b3630a3fafd8b2d54` |
| Empty scratch disk | `6a2ae3fe69ca1de760ddf30067e6d89259e37f41651ff920718d35309195efbd` |
| Written scratch disk | `c4707d66d21df91cc11b49cef14f6ff3d8108d72a0953106d0ef97996adbb1bd` |
| Original-produced `M3_1.MGS` | `1e22c8ae83eee871e69f6853abd79510c00eb1e56cddd73b7d2e2e4b4968cf9e` |

From the repository root, with Restricted Material/media linked by worktree setup:

```sh
# Read-only assertion replay for the selected retained witness.
python3 restricted/mercenary-iii-770/operand-audit/verify.py
# Compare archived and selected witnesses and run isolated capture corruption.
python3 restricted/mercenary-iii-770/operand-audit/reproduction-check.py

# Reinspect the original paths; output is Restricted Material.
uv run --with capstone==5.0.7 python3 restricted/mercenary-iii-681/m68.py \
  restricted/mercenary-iii-770/route-32/f140.ram 56454 565e2
uv run --with capstone==5.0.7 python3 restricted/mercenary-iii-681/m68.py \
  restricted/mercenary-iii-770/route-32/f140.ram 5550 563e
uv run --with capstone==5.0.7 python3 restricted/mercenary-iii-681/m68.py \
  restricted/mercenary-iii-770/route-32/f140.ram 67800 67fc0

# Re-execute the selected isolated disk witness; this replaces its selected
# scratch disk/capture manifest and creates a new ignored process run directory.
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-770/operand-audit/probe-verified.py
python3 restricted/mercenary-iii-770/operand-audit/verify.py
```

The first run’s original log/file identities and all nine capture hashes remain pinned in the ledger’s `reproduction` record. `reproduction-check.py` is a comparison of these two specific retained executions: another reproduction must first preserve its selected artifacts and update the comparison pins; it must not be relabelled as either existing witness. Fresh run paths and timing-sensitive whole-RAM/file hashes can differ; new identities must be recorded rather than asserted to equal this retained run. The earlier exploratory recipes are `probe.py` and `probe-heavy.py`, invoked with the same `PYTHONPATH`; their limitations above remain part of their evidence.

The remaining operand gate requires original provenance for a changed prefix/instruction, if any, or an explicitly reviewed finite exclusion. This report proves neither absence nor universal writer coverage and does not close #770, alter runtime/Save schema, or commission an implementation child.
