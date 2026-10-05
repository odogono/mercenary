# Mercenary III R3: ordinary TOLOSA HQ access and key31 barrier

The #756 research ledgers, scripts and tests this report cites were removed when the programme was rescoped ([#756](https://github.com/odogono/mercenary/issues/756)). They remain in git history at `ab0d6ddf`.

Research continuation for [#772](https://github.com/odogono/mercenary/issues/772), 2026-10-05, following the [R3 scope review](mercenary-iii-object-interaction-r3-scope-review.md). **Ordinary input reaches TOLOSA HQ's keyless entrance, lift and B/Floor10, launching reception5 and meeting6. The retained corridor approach reaches the original absent-key31 branch and cannot cross its shut door. PCB218 remains unacquired.** A separate east-hall Take targets fixed table224, not PCB. These finite observations add building and script dependencies; they do not authorize content promotion, runtime implementation or closure of #772/#771.

The companion [source report](mercenary-iii-tolosa-hq-source.md) pins the host, floor geometry, resolved keys and dialogue/pickup graphs. The [numeric ledger](../../research/mercenary-iii-st/tolosa-hq-evidence.json) and [read-only observer](../../research/mercenary-iii-st/scripts/tolosa-hq-evidence.py) own the new execution and restore claims. Raw RAM, whole-machine checkpoints, logs, generated debugger files, recipes and screenshots remain ignored under `restricted/mercenary-iii-772/tolosa-hq/` in the main checkout.

## Ordinary prefix and instrumentation

The source is R3's complete outward TOURCRAFT→TOLOSA foot checkpoint `restricted/mercenary-iii-772/transport-34000`. Its RAM SHA-256 is `b5dbaaf62840925bfa6b94393334157e50baa80dc932f6419d7eb482f8388db6`; whole-machine SHA-256 is `12cafeb7241948085195cc4a61f8f683ba48de38ceafed83f2f6717782d4a78f`. The [parent route ledger](../../research/mercenary-iii-st/object-interaction-r3-routes.json) retains the complete flight/arrival prefix and this exact checkpoint. It starts at original frame1201/ticks30045, foot selector1, TOLOSA Body100/group23/cell1, Floor0, eye `[179475394,63,102992879]`, raw yaw64889. The Carried Stack is `[104,103,135]`; KEY38 is independently script-held outside it; distant keys31/32 are not held. TAXICARD's open descriptor remains `[104,5,4,0]` throughout the new selected cuts.

Inputs write only original keyboard `$56726` and stick `$7056` mailbox bytes. Movement and turning use the game's low ten yaw bits; 64889 initially means377. The ordinary actions supply no pose, selector, Floor, region, resident, held bit, script target, selected object or model state. R1's unchanged pinned harness, original media/EmuTOS/Hatari pins and accepted CPU32 eleven-tick wait adaptation remain in force. Generated command audits allow its exact private wait/patch/frame instrumentation and masked-frame SR, while rejecting foreign state or semantic register writes. Read-only breakpoints add source observations; they do not execute a supplied routine.

A selected capture occurs at the original main-loop TOP before that frame's input is consumed. Thus entry-lift/f130 contains the delivered B byte, f131 its requested target, and f150 the later bound Floor. Restoring a TOP checkpoint also finishes its current frame before the next TOP callback; centre families retain sixteen source-frame door-predicate traces in that phase. A Floor binding callback may precede the matching TOP during entry re-evaluation. Both phases retain full-width ticks, independently checked against the original source/observed tops.

The accepted ten families retain3,314 tops,3,304 consecutive eleven-tick gaps and130 RAM cuts, including each run's terminal cut. The long exploratory `approach-a` turn used an incorrect yaw-period assumption and is excluded; it supplies no route or exclusion claim. Historical generated scripts/logs/manifests own execution: current `probe.py` and `plans.json` digests identify the present recipe, not an assertion that every historical instrumentation revision was identical. Early location tracing used a different breakpoint, and the historical model-swap-B marker was inside the wrong helper (corrected in the current recipe); absence of that marker is not used as a model-writer exclusion. Source graph pins and independently retained model words own the narrower claims here. Sound was disabled. No physical IKBD, PAL/raster/audio equivalence or displayed-message claim follows from mailbox execution.

## Entrance, lift and hall

All offsets below are relative to the named family's source TOP. The ledger retains every input byte, selected cut and action-register observation, so the table does not substitute an abbreviated schedule for provenance. HQ local X/Z is the actual signed draw-frame owner at `$7038/$7040`; active region is `$7194` with flags `$71CC`.

| Family / boundary | Ordinary observation |
| --- | --- |
| `approach-b` then `approach-c` | From the retained foot checkpoint, turning and walking reaches HQ's south axis. `approach-c/f350` has local `[122,2079]`, yaw1017. Each family's source RAM/whole-machine checkpoint is the prior retained cut. |
| `entry-lift/f70` | Local `[122,-801]`, still outside the keyless entrance. Forward movement subsequently opens/crosses the native doorway. Reception5 is requested at offset73. |
| `entry-lift/f90`, `f111` | Local `[122,-1632]` in hall region3, then `[122,-2089]` in lift region1, Floor0. The original reception availability consumes `$A0→$20`. No key was supplied. |
| B at offset130 | Original floor-key reader executes; f130 is still bound0, f131 has target10. Original Floor-bound callback executes at144. By f150, bound/displayed Floor is10, eyeY1563, target−1 and lift-region flags`$2001`. B labels Floor10; its geometry uses baseY1500/pitch150. |
| `basement-hall/f25`, `f79` | Backward movement returns to local `[122,-1417]` hall3. Turn/walk reaches `[506,-1417]` region4 and naturally selects note99. The original meeting6 request occurs at74; availability consumes `$A0→$20`. Selection alone does not establish note acquisition. |
| `basement-hall/f130`, `f136` | Further north reaches `[506,-1897]`, then clamps at `[506,-1909]` in region12. Selected target is table224 under key`$061618`. |
| Take at offset150 | The original Take reader executes once; no acceptance or pickup-response callback follows. f151 retains224's state`$1E`, including fixed bit4, while PCB218 stays state4 and Residence `[100,15,10,18]`. This is a fixed-table non-acquisition, not a heavy or selected-PCB refusal. |

The pinned source gives region12's north boundary−1920 and PCB room15's south boundary−1935. Their fifteen-unit gap does not meet the native rectangle-adjacency reader's shared-boundary rule. The actual hall clamp agrees with that static geometry. Drawing hooks expose table/note models without granting movement across a wall or selecting PCB for Take.

## Original keyed corridor boundary

`key31-door` starts from the retained hall/f200 checkpoint. Ordinary movement backs south, crosses west to X−118, turns north and advances through region8 into corridor9. f125 is `[-118,-1717]`; f130 and later cuts remain `[-118,-1909]`, region9. Take160 executes against stale slot64 with sentinel key`$7FFF1566`; it supplies no eligible PCB selection/refusal.

This route re-enters the meeting region and requests script6 again at14. That callback is a request, not proof of a second availability consumption or completed second dialogue. The busy message/scheduler state stays observable rather than being suppressed for onward walking.

At the north corridor, original `$5BA7E` reads key31 with `D6=124` (`4×31`) and attachment offset `A0=592` (`$250`). All620 retained predicate samples in this family take the absent-key branch at `$5BA86`. Door bytes `$4068..$406B` remain `[64,0,0,31]`, key31 state is5/non-held, and its open latch is0. Movement requests refusal message0 at129. This is the original locked-message request; a busy-gated display and audible output are not certified.

The follow-up `key31-centre` removes an edge/inset ambiguity. From the retained corridor/f200 checkpoint, a small ordinary turn/walk moves X to−94 and Z to−1920, centrally inside throat10's X interval `[-125,-67]`. After facing north again, forward30–50 leaves the player at `[-94,-1920]` in region9 through f80, with the same held31-clear/closed-latch state. It records648 predicate/absent-branch pairs, including the sixteen restored-source-phase traces. Further Take60 does not accept an item or launch response115. The barrier is therefore not inferred solely from a corner approach.

The first door resolves authored placeholder`$F0` to actual key31, while the later region13 door resolves`$F1` to32. They are not slots240/241. Key31 initially resides at CLOTHO24/BIL INDUSTRIES/G/association4; key32 at DION16/BIL'S MOTHERS/G/association7. Both Catalogue names are DOOR KEY A. The second throat was not executed. These are additional route candidates, not a claim that both keys are necessary for every possible PCB selection/Take path.

## Effects, restoration and disposition

The observer verifies14 HQ reader/data spans plus26 existing R2 owner spans against every retained cut:5,200 source comparisons. It separately pins both complete Floor geometry records, the imported graph metadata files and their34/46/28-site extents, and verifies108 original instruction-source spans for reception5 (34), meeting6 (46) and PCB115 (28). The three finite graphs contain no direct object-bit/model-swap operation. The ordinary reception and meeting requests expand the exposed script/presentation/scheduler domain; their complete ordinary futures and references still require R2 review.

PCB218 remains in its original residence, unheld, with response115 availability`$A0` in every selected cut. No retained Take acceptance or pickup-response launch occurs. The source-only PCB graph retains its held-dependent repeating timers; independent model-swap-A/B callers remain outside this probe's closed domain. The initial standing/chair bindings cannot be inferred from merely entering the building. No synthetic key/PCB acquisition was added.

| Restored original whole-machine checkpoint | Compared later cuts | Result |
| --- | --- | --- |
| `entry-lift/f129` → `lift-replay` |10 | B request, target, Floor arrival and later lift state match all1MiB RAM. |
| `basement-hall/f107` → `hall-replay` |8 | Northward clamp, selected table, Take and later state match all1MiB RAM. |
| `key31-door/f107` → `door-replay` |11 | Corridor transition, key predicate, locked request, sentinel Take and later state match all1MiB RAM. |
| `key31-centre/f23` → `centre-replay` |7 | Centred forward barrier, Take and later state match all1MiB RAM. |

These36 exact restored futures verify original whole-machine continuations at the retained boundaries. They do not certify the browser Save codec or justify dropping independently live Floor/door/VM/message/card/object owners. The ordered stack, independent script-held38, key31/32 states, PCB residence, TAXICARD descriptor, model words, flags, timers, continuations and availability are numeric observations in the ledger.

The next focused route is **ordinary acquisition of CLOTHO key31 and return to this HQ corridor**, retaining the native Board/flight/arrival/building/selection/Take prefix and acquired-key restore future. After opening this first gate, determine what the original key32 throat and PCB selection actually require. Keep this as consequential #772 research, with response115's ordinary launch and complete effect/owner future returned to #771. The wider world/item/service frontier, exact promotion inventory and #756 scope decision remain unclosed; this handoff permits no I1/runtime work.

## Reproduction and validation

From the repository root, verify accepted artifacts without replacing them:

```sh
PYTHONPATH=research/mercenary-iii-st python3 research/mercenary-iii-st/scripts/tolosa-hq-evidence.py
PYTHONPATH=research/mercenary-iii-st python3 -m unittest discover -s research/mercenary-iii-st/tests -p test_tolosa_hq_evidence.py
```

The observer refuses a changed committed parsed ledger. `--out /tmp/tolosa-hq-evidence.json` writes a fresh comparison file. Six synthetic observer tests cover independent region/inventory/proximity owners, bound/travel/target Floor owners, resolved key/held/stack independence, foreign debugger-write/register refusal, full-width capture identity/phase and restored-source/pre-TOP trace phases. They certify the observer, not an ordinary acquisition.

Fresh original execution requires the pinned media/emulator and retained parent checkpoints. Run one explicitly named family at a time in source dependency order (`approach-b`, `approach-c`, `entry-lift`, `basement-hall`, `key31-door`, `key31-centre`, then the four replay families):

```sh
PYTHONPATH=research/mercenary-iii-st python3 restricted/mercenary-iii-772/tolosa-hq/probe.py entry-lift
```

That command replaces the named ignored outputs. Preserve historical artifacts first; new manifests/generated scripts/logs require fresh pin and result review before changing the ledger. It does not automatically reproduce historical hashes or authorize a new reachability claim. Repository checks apply before a PR; their passing result does not broaden this probe's ordinary domain.

Final validation: the committed ledger verifies exactly (ten families/130 cuts/938 assertions/36 full-RAM restored futures); all six observer tests and independent source/spec/code review pass. The complete parent route regenerates15 families/110 assertions and matches its committed parsed ledger. `cd web && bun run check` passes type/research-type, lint, formatting, documentation checks, **2,690 application tests / 2,603,871 assertions** and **14 tooling tests / 52 assertions**, with zero failures. Documentation checks were rerun after final edits; local links, staged whitespace and the research-only Conventional Commit/changelog check pass. These results retain the ordinary/static and original-machine/browser boundaries above.
