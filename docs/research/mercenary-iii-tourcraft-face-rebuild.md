# Mercenary III TOURCRAFT: face-output rebuild boundary

> **Status** (2026-10-03): D2 accepted one shared `faceSelection: 'initial' | 'base' | 'alternate'` alongside both cursors per face for R8c/[#736](https://github.com/odogono/mercenary/issues/736). Face output words are derived and must rebuild before their first reader.
> **Holds:** The original single-glyph writer determines each noninitial output from its selected cursor **and its last animation selection**. The accepted tag supplies that selection and distinguishes the opening blank. The ordinary #733 full-record collision disproves the earlier proposal using cursors plus current message fields alone. The shared lettering reader and browser planner can read a saved moment without advancing animation.
> **Open:** Total source-class migration/expanded constructor work under #735/#737, and full expanded browser first-frame/panel/future acceptance under #711. No original visible first-frame difference for the hidden #733 face is claimed.

Research for [#709](https://github.com/odogono/mercenary/issues/709), following the [milestone scope](mercenary-iii-tourcraft-milestone-review.md), the [original face recovery](mercenary-iii-tourcraft-presentation.md#cabin-pilot-lettering-and-panel), and the [#733 collision](mercenary-iii-tourcraft-early-initialization.md#the-early-collision). The initial proposal of 2026-10-03 serialized both cursors per face and rebuilt the output before the first draw using current message selecting fields. The historical counterexample below identified the missing previous selection. D2 subsequently approved serializing that information explicitly in a shared three-valued tag, with the field and ordering contract below. This preserves each saved moment's original output rather than normalizing it to the current selector.

## Original provenance and dependencies

The independently reread original capture is `restricted/mercenary-iii-708/presentation/exact2/start.ram`, SHA-256 `71b957b3b7124959b01bd40b896c921d37902c18cfca042bef1906b155ef0170`. Capstone 5.0.7, M68K/68000/big-endian, decodes the ranges below. The new ignored `restricted/mercenary-iii-736/original-face-reader-audit.json` records those instructions and whole-image four-byte pointer occurrences; its SHA-256 is `08a97472ef0ef89c4944cc03d0db19ec73dc314799e9f328592f5d514f43f385`. The whole-image literal scan corroborates the recovered indirections; it does not alone prove the absence of every computed alias. Raw instructions/RAM remain restricted under [ADR 0002](../adr/0002-separate-rom-research-from-implementation.md).

Reproduce that local audit from the repository root with `uv run --with capstone==5.0.7 python restricted/mercenary-iii-736/original-face-reader-audit.py`. The ignored script has SHA-256 `61ac4f46a4841c61f320b29926c6241bd996d6755e88c8d9088f41915ab06e6b`; it checks the whole-image digest before decoding and reproduces the pinned JSON digest.

| Range (end exclusive) | Role | SHA-256 |
| --- | --- | --- |
| `$54F20..$54F96` | Shared animation writer | `e9283e4da249ee8ccf4cdbdac424cda73d8d1cef4f2ed17184a4842df14dbaea` |
| `$5A47A..$5A480` | Main-loop animation call | `c7e8b470f7731c2416925887747fdd03e49c5def0a14fb2c8acded92b7cf3c98` |
| `$55188..$55204` | Token and first glyph lookup | `d4a9c6ce4d0fc2aed23ece28d92b2b8ca5dbd01a64d58f08a55279116d5328cc` |
| `$5600C..$560B0` | Cell-conditioned sign binding | `359a58c25cd48834139149fedb7be930af316c245040ef0cf67c5a348b143936` |
| `$B34A..$B37E` | Animation pointer list | `02324616f073b04b2d6a42463ab65e880035ea57e8644e0b133e36ae39f111cf` |
| `$A1` base: `$B4FE..$B51E` | 31 glyphs plus NUL | `2873a78042fb504452b371fe4075fc9caba1488b3d14de1d03aa66f4a5aef71e` |
| `$A1` alternate: `$B520..$B54E` | 45 glyphs plus NUL | `065a7629d074674ee4aa2dacfc9b90629e86b87057b09574434cfad1a9e52b02` |
| `$A5` base: `$B606..$B61C` | 21 glyphs plus NUL | `d4d76ef89718aeb8429c831a81f9ab3c97cb54f3c0d7be26da465df576e800f5` |
| `$A5` alternate: `$B61E..$B63E` | 31 glyphs plus NUL | `f3aa55570ecfeefed036cfd1f6731476d94071f4ab1c3185c0503945d12ad1c8` |
| Sign: `$B3F6..$B40A` | 19 glyphs plus NUL | `e4abfe42f87608f222a19d0a2ba5b53a5e71b45fde55dae5342c1b693ae124ae` |

The served [face sequences](../../payload/dion/tourcraft/presentation/programmes.json) preserve these values, and the [coherent initial state](../../payload/dion/tourcraft/presentation/gameplay.json) owns the opening blanks/cursors. Original `$A1` token-table slot `$B2B4` points to `$B4FA`; `$A5` slot `$B2C4` points to `$B602`. The corresponding base cursors are `$B4FC/$B604`, and alternate cursors `$B51E/$B61C`. The [presentation report](mercenary-iii-tourcraft-presentation.md#cabin-pilot-lettering-and-panel) owns the model/font aliases and original-engine branch probes; this reread is static original-source verification, not a new emulator run.

At entry the writer evaluates:

```text
alternate = word($723A) != 0
         && word($723E) == 0
         && (byte($7272) & $20) != 0
```

`$723A` is busy; `$723E` is message mode; the last term is flag 13. At `$54F2C..$54F32`, `SEQ.B` preserves the condition codes from the mode test. The two original discriminatory probes in the presentation report rule out OR selection. The same D1 selection is used for both faces during this call; it is not separately recomputed between them.

The first byte at base-cursor minus four chooses the writer path. `$A1/$A5` have selector words `$0022/$0018`, so their first byte is zero and their low word supplies the alternate-cursor offset. The sign's descriptor is `$0000`: zero mode and no alternate sequence. For these three entries, `$54F56` increments the selected word, `$54F58` reads that new word and `$54F5A` writes the selected sequence byte into the output at original base-cursor minus two. NUL causes `$54F62` to clear the selected word and `$54F64` to write sequence position zero. The other cursor survives. No previous output byte is read on this path.

A nonzero first mode byte instead enters `$54F6A`: it decrements a countdown and, when due, shifts the existing buffer using the output-byte read at `$54F7A`, then appends a sequence byte. That scrolling path has an additional retained-buffer dependency. It does not describe either admitted face or the inherited sign, so a proof for these three must not be generalized to every entry of the shared animation list. [Original animation and mode ownership](mercenary-iii-tourcraft-presentation.md#cabin-pilot-lettering-and-panel)

## Exact reconstruction needs the last selection

For each face, let `B` and `A` be its saved base and alternate cursors, and `L` the selector used by its **last completed animation invocation**. After at least one invocation:

```text
output = (L ? alternateSequence[A] : baseSequence[B]) << 8
```

The low byte remains NUL. A restore-time read of the current selector does not increment either cursor. Calling the original writer to "rebuild" would increment one cursor and consume an animation invocation, changing the saved moment. Initial output is instead space+NUL (`8192`), although all cursors are zero. Zero cursors recur after wraps and therefore do not alone identify initial state. A trustworthy invocation count or equivalent initial-state discriminator supplies that distinction. [Fresh original state and writer probes](mercenary-iii-tourcraft-presentation.md#cabin-pilot-lettering-and-panel), [independent executable writer](../../research/mercenary-iii-st/scripts/taxi-face-model.ts)

At loop top the original order is threshold, input, VM (`$5A474`), animation (`$5A47A`), then mode-specific service/movement/admission. VM-created text can affect that invocation; later admission-created text affects the next one. Message scrolling/idle transitions can also run between atomic frames. Consequently the saved current busy/mode/flags are inputs to the **next** selection; they are not a retained account of the previous one. Finishing the atomic invocation before capture does not imply equality of those two selectors. [Owner audit](mercenary-iii-tourcraft-early-owner-audit.md#pilot-and-face-animation), [accepted timing contract](mercenary-iii-tourcraft-followup.md#accepted-timing-clarification-and-confirmation-probe)

The ordinary #733 pair reaches tick 6312/frame 573 with identical complete source/Save records, identical four cursors, busy false and mode zero. Both references have `$A1` base/alternate `13/25` and `$A5` `8/2`. History A last selected base, giving `$A5=P` (`20480`); history B last selected alternate, giving `$A5=Q` (`20736`). Both `$A1` selected positions happen to contain C, so this pair does not distinguish its output. A current-selector rebuild gives P in both histories and fails exact retained-output reconstruction for B. The full ordinary prefix and source/Save digests are retained in the [early experiment](mercenary-iii-tourcraft-early-initialization.md#the-early-collision) and [evidence summary](../../research/mercenary-iii-st/taxi-early-evidence.json).

The same data dependency applies to `$A1`: its base and alternate sequences differ, including base position zero C versus alternate position zero F. A cursor-only output rule must know which sequence supplied the retained byte for each admitted state. Since both faces always share the same last selector, one shared `initial/base/alternate` tag expresses both the previous selection and the opening distinction. D2 accepted that representation after reviewing the counterexample. The output words therefore become derived state under this augmented contract; the old proposal without the tag remains disproved.

## Accepted serialized field and writer contract

The face portion of the expanded Save Snapshot has this shape; these names do not replace the separate pilot, sign, articulation or sound owners in the surrounding animation group:

```ts
animation: {
  faceSelection: 'initial' | 'base' | 'alternate',
  faces: {
    $A1: { base: number, alternate: number },
    $A5: { base: number, alternate: number }
  }
}
```

Both cursor pairs are serialized. `$B4FA/$B602` output words are omitted from this face representation and rebuilt from the tag plus admitted immutable sequences. Each cursor is an integer indexing a non-NUL glyph position:

| Face | Base cursor | Alternate cursor |
| --- | --- | --- |
| `$A1` | `0..30` (31 positions) | `0..44` (45 positions) |
| `$A5` | `0..20` (21 positions) | `0..30` (31 positions) |

`initial` is valid only before the first face-writer invocation, with all four cursors zero; it rebuilds both outputs to space+NUL (`8192`). Cursor zero is necessary for this tag, but not sufficient evidence of the initial phase. Whole-session validation must establish that no invocation has occurred; a wrapped noninitial state cannot be relabelled `initial`. After the first invocation the tag is permanently `base` or `alternate` until a genuine New Game resets the whole session.

On **each face-writer invocation**, compute the original busy/mode/flag conjunction once, advance the selected cursor of both faces with the original NUL-wrap rule, and atomically commit both cursor pairs together with the corresponding `base` or `alternate` tag and their new derived outputs. Unselected cursors survive. Public capture, draw and inspection cannot observe a tag committed for one face but not the other. This ownership follows writer invocations, including hidden models and any accepted zero-tick reentry that invokes the writer. It does not follow browser draw calls, elapsed-time ticks alone or visibility. Later message/flag changes leave the tag untouched until the next writer invocation. [Original shared writer](mercenary-iii-tourcraft-presentation.md#cabin-pilot-lettering-and-panel), [accepted atomic/reentry schedule](mercenary-iii-tourcraft-followup.md#accepted-timing-clarification-and-confirmation-probe)

For a restored noninitial state, read the sequence named by the tag at the saved cursor for each token, then construct `glyph << 8`. Do not increment either cursor. This rule is sufficient for every admitted public capture boundary under the writer contract: the opening state reconstructs its coherent blanks; each invocation commits the exact sequence/cursor that supplied both original bytes; intervening selectors, drawing and capture do not alter that tag or either face output. The reconstruction depends on neither current message busy/mode/flags nor earlier output bytes. The admitted zero-mode writer is essential to that argument; it does not extend to the scrolling entries described above.

The [research face snapshot helper](../../research/mercenary-iii-st/scripts/taxi-face-snapshot.ts) supplies strict field decoding, nonadvancing reconstruction and an independent candidate continuation for comparisons. It validates the three tag values, required token/cursor records, integer bounds and zero cursors for `initial`, and refuses extra face-output fields. Admitted content supplies the immutable terminated sequences. Its field decoder does not claim whole-session initial-phase/reachability validation, a schema-2 runtime codec or a source-only migration constructor; those remain #737/#711 responsibilities.

For schema-1 migration, reconstruct the tag from the **independently selected exact or canonical expanded history** together with both cursor pairs. [ADR 0070](../adr/0070-use-canonical-expanded-history-for-ambiguous-early-taxi-records.md) owns the accepted canonical treatment of ambiguous early source classes. It does not make current message fields a last-writer latch, and the #733 collision remains proof that they are insufficient. In this pair, the two actual reference histories serialize `base` and `alternate` respectively and retain their own P/Q outputs; a canonical migration must use the selected canonical reference's tag. Selection and construction for all admitted schema-1 classes remain open under [#735](https://github.com/odogono/mercenary/issues/735) and [#737](https://github.com/odogono/mercenary/issues/737). No universal source-only constructor is established here.

## Executable witness and scope

Run `bun research/mercenary-iii-st/scripts/taxi-face-rebuild-audit.ts` from the repository root; its [audit](../../research/mercenary-iii-st/scripts/taxi-face-rebuild-audit.ts), [summary](../../research/mercenary-iii-st/taxi-face-rebuild-evidence.json) and [regression test](../../web/test/dion-face-rebuild.test.ts) retain the reproduction. The ordinary replay uses archived revision `e4cba434069ca1fbec6e72b3a99cbf775f1663c4`, program `4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c`, source content `c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed`, and expanded content `d31490d7ba44a08949f71267884f1e290074acc5885fdfae747f7aeefcfdf611`. The served programme-file digest is `1881d582f28aa5cd7fb5aad2348d357a8c976b822c3430010a43dcd41b1d1954`. The independent face writer supplies research owners beside actual source sessions; it is not an expanded Gameplay Session.

| Witness | Equal retained reconstruction inputs | Different outputs | Evidence class |
| --- | --- | --- | --- |
| #733 at tick 6312/frame 573 | Full old record, all four cursors, current message/flags | `$A5` P/Q (`20480/20736`); current-selector rebuild P/P | Ordinary pinned-I2 histories; no different visible first frame proved |
| `$A1` order control: 45 alternate updates then one base, versus one base then 45 alternate | Base 1, alternate 0; same total invocations | C/F (`17152/17920`) | Synthetic independent writer-order control, not an ordinary-history source collision |
| Opening versus 651 base updates (`lcm(31,21)`) | All four cursors zero | Opening blank/blank (`8192/8192`) versus C/P (`17152/20480`) | Synthetic independent wrap control against coherent initial state |

For the ordinary collision, a nonadvancing rebuild using each reference's actual last selector matches both retained outputs; using the common current selector matches only A. The uninterrupted references agree after their next animation writer and for 600 later frames. The added controls isolate `$A1`'s last-selection dependency and the opening discriminator. They do not provide a source-only constructor or prove an original raster mismatch. [Executed research ledger](../../research/mercenary-iii-st/taxi-face-rebuild-evidence.json)

The #733 pair is in the prison taxi view; `$A5`'s solicitor MAN is hidden. Its first visible frame need not differ, and the next writer makes both complete face states converge. Neither fact proves first-reader omission across every admitted view. The original cursors/current-selector proposal fails on this ordinary public capture boundary. The accepted tag repairs that missing information without relying on next-frame convergence. Canonical migration still requires the selected-history comparisons required by ADR 0070.

## Accepted-tag restore comparison

The updated [audit](../../research/mercenary-iii-st/scripts/taxi-face-rebuild-audit.ts) was executed successfully after the D2 approval. For each ordinary collision history, it JSON-serializes only the four cursors and that history's actual tag, decodes those bytes with [readFaceSnapshot](../../research/mercenary-iii-st/scripts/taxi-face-snapshot.ts), and reconstructs the outputs before the first planner call. No output word is serialized. A separate candidate continuation advances its own saved cursors and tag on each later invocation using the uninterrupted reference's selection. Each reconstruction is compared with the independent original-writer model, followed by comparison of the complete `planDionFrame()` result supplied with the reconstructed live face tokens.

| Comparison | History A | History B |
| --- | --- | --- |
| Captured tag | `base` | `alternate` |
| First saved-moment output, before any advance | C/P, exact reference match | C/Q, exact reference match |
| First planner call, before any advance | Exact match to A's uninterrupted saved moment | Exact match to B's uninterrupted saved moment |
| Next writer and 600 further frames | Face state and complete planner result match A's reference at each observation | Face state and complete planner result match B's reference at each observation |

The saved moment, next writer and 600 later frames give **602 observations per history**, **1,204 face-state matches** and **1,204 complete planner-result matches**. The ledger records `serializedOutputs: false` and the initial tags `['base', 'alternate']`. This comparison preserves each reference's P/Q output at capture; it does not force both different expanded histories to share a tag. [Executed tagged-restore summary](../../research/mercenary-iii-st/taxi-face-rebuild-evidence.json)

These are research comparisons of the accepted face representation with the promoted METIS frame planner. All nonface frame inputs and future selector values come from the uninterrupted source observations. The experiment does not restore the whole expanded VM/world, independently choose an exact/canonical reference from an arbitrary source record, implement a schema-2 Save/Resume codec or prove an original/browser first-raster or panel comparison. The faces' hidden status in this ordinary collision remains unchanged; exact reconstructed owner equality and complete planner-result equality are reported separately from a claim that the collision is visibly distinguishable.

## Inherited sign output and index

The inherited sign already serializes `sign.code` and `sign.index` in [DionSnapshot](../../web/src/dion/session.ts). Preserve both. Its zero-selector writer has one cursor `$B3F4` and writes byte `$B3F2`; no message-selection latch is needed. After an update, code equals `signScript[index]`. Before the first update it is space (32) at index zero, whereas script position zero is 64. At a wrap the index returns to zero with code 64. Index alone consequently does not prove the initial blank or the number of previous updates.

Cell binding `$5607A` installs the selected sign-string pointer into token slot `$B254`; `$56080..$56082` installs pointer plus two into animation-list slot `$B376`. The blank binding substitutes `$B380/$B382`. Leaving the active binding retains the sign output/index, and later binding can expose them again. The original glyph reader sees the buffer without advancing it. The browser mirrors the binding with `signBound()`, retains the pair while unbound and advances only while bound. A global frame count alone is not a count of bound sign updates. [Original sign reader/writer and natural-cycle log](mercenary-iii-taxi-lettering.md#cell-ownership-and-animation), [browser sign writer](../../web/src/dion/session.ts)

## Output readers and required restore order

| Reader or consumer | Dependency and order consequence |
| --- | --- |
| Original model inline text (`$55050`) and detail text (`$54FA0`) | Both enter the shared lettering grammar. Token lookup `$5519E` resolves the table pointer; glyph loop `$551AC` reads the output byte and then its NUL. `$A1/$A5` are font-specific model tokens; the sign uses cell-bound `$89`. Drawing does not invoke animation. Rebuild must precede this glyph read. |
| Original animation single-glyph path `$54F56..$54F64` | Reads selected cursor and sequence, writes output; it does not read the old output. Future progression needs both cursors/current selector. This supports next-writer convergence, not a first-draw exemption. |
| Browser planner `tokenString()` | [frame.ts](../../web/src/dion/frame.ts) reads `state.tokens` first, including future live `$A1/$A5` overrides; the bound sign branch reads `state.signCode`. It expands glyphs synchronously when planning a saved moment. Rebuild must precede creation/consumption of these inputs. Without a live override, current Catalogue token data can remain a captured static face; that is the separately documented I4 implementation gap. |
| Browser candidate selection | [session.ts](../../web/src/dion/session.ts) calls `planDionFrame()` from `selectCandidate()`. Any restored-state candidate verification/planning is a consumer even if its result is not displayed. Preserve the saved prior candidate under the persistence contract; do not substitute a draw-time recomputation for it. |
| Save Load, startup Session Resume and takeover draw | [boot.ts](../../web/src/dion/boot.ts) constructs/restores a session and calls `draw()` without a required preceding advance: Save restore at lines 255–269, takeover at 443–453, startup draw at 473. `draw()` calls the planner at 302. A constructor/restore transaction must establish correct outputs before publication or any such call. |
| Capture/owner comparison and inspection | [captureResume()](../../web/src/dion/session.ts) returns a saved moment without advancing. A schema-2 state inspection/owner comparator can observe reconstructed semantic output before a draw. Under the accepted contract, reconstruct it before exposing the candidate; future visual convergence cannot supply exact owner equality. |

This enumerates the recovered admitted animation/drawing routes and concrete current browser consumers. The literal-pointer scan finds face output pointers only in their token-table slots and base-cursor pointers only in their animation-list slots. It does not claim an exhaustive proof over arbitrary foreign code or excluded content. The [model reader](dion-object-geometry.md#the-model-reader), [detail/token reader](mercenary-iii-taxi-lettering.md#primary-evidence-and-provenance), and [admitted content closure](mercenary-iii-tourcraft-promotion.md) define the bounded interpretation.

The accepted #711 ordering requirement is: validate source and semantic owners, including the tag/cursor/initial-phase contract; construct the isolated candidate; perform a **nonadvancing** output reconstruction; then permit restored-state constructor frame/candidate planning, capture/inspection, candidate publication and the first draw. The same sequence applies to Save Load, Session Resume and takeover. No constructor may run a frame planner over unreconstructed face outputs. Preserve the saved prior candidate rather than refreshing it as an incidental effect of reconstruction. Rebuild uses saved cursor positions and consumes no pending actions, ticks, input, message or sound events. Failed reconstruction remains inside the isolated candidate transaction, before publication or mutation of the active session. [Persistence replacement contract](mercenary-iii-tourcraft-persistence.md#source-admission-storage-and-replacement-transaction)

The accepted tag and four cursors determine the two face outputs under the proved admitted writer rule. The historical #733 failure remains the basis for serializing that additional owner. Preserve inherited sign code/index and pilot/articulation owners. Full restored first-frame/panel/future acceptance belongs to the runtime implementation; the research contract does not waive that first draw or implement the schema-2 codec.

Validation of the accepted-tag change: `bun run check` passed TypeScript (application and research), ESLint, formatting, documentation checks, **2,608 application/research tests** (**489,765 assertions**) and **14 tooling tests**. The original early-initialization ledger still matches exactly; the observation hook preserves its historical source/codec/evidence results. The tagged-restore audit matches 1,204 face states and complete planner results, and the added tests cover initial/base/alternate tracking, P/Q recovery, pure reconstruction, wraps, invalid tags, contradictory initial state, out-of-range unselected cursors and refusal of serialized output fields. Relative report-file links and `git diff --check` pass. The independent five-axis review found no required changes. No schema-2 runtime, original-machine rerun or restored original/browser first-raster comparison is claimed.
