# macOS Experience Contract v1

> **Superseded and frozen.** This is a historical implementation-contract record retained after the browser became canonical in issue #69. Its contents below are intentionally unchanged; ADR 0019 and `trace-oracle-last-good` govern the cutover.

Status: accepted for implementation; comparative evidence pending

Decision ticket: [#9 — Prototype the authentic macOS experience](https://github.com/odogono/mercenary/issues/9)

Prototype: [`prototypes/macos-experience`](../prototypes/macos-experience/)

## Purpose

This contract defines the observable boundary between the fidelity-governed Game Surface and the minimal Native Shell. Its product decisions are accepted for implementation. It does not establish production architecture, resolve Reference Build uncertainties, or claim Fidelity Contract conformance.

The executable prototype uses synthetic content to exercise this contract safely. Exact bindings, timing, save availability, cue content, and characteristic-feel thresholds remain evidence-pending where identified below.

## Governing boundary

- The Game Surface owns the world view, status, prompts, and gameplay feedback.
- The Native Shell owns windows, menus, Settings, Help, file panels, and host-state feedback.
- Native UI must not duplicate or introduce gameplay information inside the Game Surface.
- A Mac Adaptation must preserve Semantic Action availability and outcomes, camera projection, visible scene membership, simulation timing, and meaningful future state within applicable Acceptance Envelopes.
- A difference outside those bounds requires a Departure Record. No Departure Record is created by this contract.

## Presentation and windows

- Draw the Game Surface at the display's native backing resolution from stable logical coordinates. Do not upscale a low-resolution bitmap.
- The logical camera projection and visible world remain invariant across window sizes, displays, backing scales, Display Compositions, and Accommodations.
- Use a stacked Display Composition in ordinary windows. Use the wide composition only when the fixed projection and intrinsic status column both fit without clipping or illegible text.
- The wide composition may place status beside the world view. Prompts remain visually attached to the world view. Both compositions expose identical information with identical event ordering.
- Fill unused area with a quiet solid matte derived from the active Game Surface palette. Do not add decoration or information.
- Use a standard resizable macOS title-bar window without a toolbar and native Spaces full screen. Do not switch display resolution or provide an exclusive borderless mode.
- The validated prototype minimum content size is 800 × 600 points. The prototype switches to the wide composition at 1,200 points when its intrinsic constraints also pass.
- Center the first main window. Restore a valid prior size, position, display, and full-screen state thereafter, falling back to the centered default if the saved display or frame is unavailable.
- Focus loss, minimization, and live resize do not pause simulation. System sleep suspends work; waking resumes without treating wall-clock sleep as simulation time.

The 800-point and 1,200-point prototype thresholds are implementation evidence for review, not a production deployment promise. Issue #10 may realize the same intrinsic constraints differently without reopening the product decision.

## Controls

- Native keyboard and controller input map to Semantic Actions rather than C64 scan codes.
- One explicitly selected controller and the keyboard may contribute simultaneously. If the selected controller is unavailable, choose the first available controller; keyboard input remains active.
- Track physical press, hold, and release state. Ignore macOS key-repeat events and let evidence-derived simulation rules determine Semantic Action cadence.
- Reserve standard Command-key shortcuts for macOS. They never become gameplay input.
- Provide persistent, device-aware modern, Reference-style, and custom Control Profiles. Modern profiles are the default; haptics are off by default.
- Every Semantic Action can be remapped on keyboard and controller. Reusing an occupied physical control requires confirmation and moves that control to the new action.
- A controller disconnect does not pause or alter simulation. Show a passive Native Shell notice and retain keyboard fallback.
- Profile names and provisional bindings may change when `UNC-0001` or `UNC-0002` resolves; the device-independent mapping policy may not.

## Feedback and Accommodations

- Gameplay cues appear only in the Game Surface. File failures, controller changes, and other host events appear only in the Native Shell.
- Provide master, music, and effects levels. Exact audio identity and cue association remain governed by `BC-0014` and `UNC-0005`.
- Accommodations may offer higher contrast, thicker wireframes, larger status text, reduced flashing, and visual descriptions of meaningful audio cues.
- An Accommodation must preserve geometry, scene membership, information, event ordering, Semantic Actions, simulation timing, progression, and difficulty.
- Controller haptics are opt-in and may only echo an existing cue. They never carry unique gameplay information.
- Timing changes, automation, extra warnings, and difficulty assistance are not Accommodations under this contract. Each requires later evidence and, where divergent, a Departure Record.

## Native discovery and saves

- First launch may open a concise, dismissible native welcome window. Later launches open the restored main window directly.
- Standard menus, Settings, and Help expose controls, display behavior, Accommodations, audio, documents, and review instructions. Do not place onboarding overlays over play.
- Offer standard named save documents plus ten app-wide quick slots numbered 0–9. A slot stores one complete save envelope and may identify any exact installed official or modded Content Set; slots are not multiplied per Content Set.
- Documents and quick slots obey the same evidence-derived save/load availability and state gates. Native convenience never expands when saving or loading is legal.
- A load, close, or quit that would replace unsaved meaningful state offers Save, Discard, and Cancel. No operation silently saves or discards progress.
- Restore Native Shell preferences and window state automatically. Do not create hidden, crash-recovery, or launch-resume game state.
- The prototype file and slot payloads are synthetic and marked `PROTOTYPE-ONLY`. Production serialization belongs to later content/state and verification work.

## Content Sets and Mods

- The Native Shell imports user-selected `.mercenarycontent` packages, displays safe identity, signature, exact digest, and requested Game Semantics capabilities, and asks for consent before enabling a sideloaded Mod.
- Consent is bound to the exact package digest. Changed bytes, signature status, or capabilities require fresh consent.
- Installed package versions remain immutable and may coexist so exact-bound saves can continue to resolve. Updates never overwrite an installed digest in place.
- A player selects one resolved Content Set leaf before starting a session. The shell does not expose arbitrary sibling-Mod ordering or change content while a session is active.
- A modded session is visibly identified in the Native Shell and never presented as an official Fidelity Contract-conformant session. Mods cannot add Native Shell UI or unique host feedback.
- Loading a document or quick slot activates its exact installed environment or reports the missing/blocked environment. The shell never downloads, substitutes, or best-effort updates content.
- A Lua failure produces a passive Native Shell diagnostic and leaves the live session suspended at its last committed state. A simulation XPC crash ends the session and may offer only explicit documents or slots; unsaved progress is not recovered.

## Mac Adaptation scenarios

These stable scenarios are the issue #9 acceptance surface. Issue #12 must preserve their intent when it introduces an executable host-evidence model; they do not alter the Reference-derived catalogue.

### MAS-0001 — Display composition invariance

- Start the synthetic scene in a 960 × 720-point window.
- Resize through the 800 × 600 minimum, the 1,200-point wide transition, a larger arbitrary aspect ratio, and native full screen.
- Confirm native-resolution redraw, unchanged projection signature and scene identities, intact prompts/status, quiet matte space, and stacked/wide transitions without clipping.
- Traceability: `BC-0008`; `UNC-0002`, `UNC-0009`.

### MAS-0002 — Window and host lifecycle

- Move and resize the window, enter full screen, relaunch, minimize, change focus, live-resize, and exercise the documented sleep/wake path.
- Confirm valid restoration, no focus/minimize/live-resize pause, suspension during sleep, and no wall-clock catch-up after wake.
- Traceability: `BC-0003`, `BC-0004`; `UNC-0001`.

### MAS-0003 — Semantic input equivalence

- Hold, release, and conflict representative movement/actions using keyboard and the selected controller separately and together.
- Trigger an OS key repeat and standard Command shortcuts, then disconnect the selected controller.
- Confirm identical Semantic Actions, evidence-governed cadence, reserved shortcuts, continued simulation, passive host notice, and keyboard fallback.
- Traceability: `BC-0001`, `BC-0002`, `BC-0004`, `BC-0006`; `UNC-0001`, `UNC-0002`.

### MAS-0004 — Control Profile management

- Switch between modern and Reference-style profiles, remap each representative action, provoke a duplicate binding, confirm reassignment, and relaunch.
- Confirm every action is bindable, duplicate controls require consent, keyboard/controller profiles remain separate, and custom profiles persist.
- Traceability: `BC-0001`, `BC-0006`; `UNC-0001`, `UNC-0002`.

### MAS-0005 — Feedback and Accommodation neutrality

- Exercise every visual Accommodation individually and together, enable visual audio-cue descriptions, and enable opt-in haptics with a supported controller.
- Provoke a gameplay cue and a host event.
- Confirm gameplay feedback stays in the Game Surface, host feedback stays outside it, all information remains available, and projection, scene identities, Semantic Actions, and simulation time remain unchanged.
- Traceability: `BC-0008`, `BC-0013`, `BC-0014`; `UNC-0002`, `UNC-0004`, `UNC-0005`, `UNC-0009`.

### MAS-0006 — Native saves without semantic expansion

- With the synthetic save gate open, save/open a named document, overwrite/load all quick-slot identities, and attempt dirty load, close, and quit.
- Close the gate and repeat document and slot commands.
- Confirm slots are exactly 0–9, destructive operations offer Save/Discard/Cancel, closed gates disable both front ends, restored synthetic state matches, and no hidden semantic autosave exists.
- Traceability: `BC-0015`; `UNC-0006`, `UNC-0008`.

### MAS-0007 — Discovery without in-play overlays

- As a first-time user, launch with no persisted preferences and locate controls, remapping, display/access options, audio, save commands, and Help without coaching.
- Relaunch and confirm the welcome window does not interrupt play again.
- Confirm all guidance is in the Native Shell and the Game Surface contains no onboarding overlay.
- Traceability: `BC-0001`, `BC-0008`; `UNC-0001`, `UNC-0009`.

### MAS-0008 — Local Mod admission and identity

- Import signed, unsigned, changed, invalid-signature, and over-capability synthetic `.mercenarycontent` packages.
- Confirm safe metadata and capabilities appear before exact-digest consent, changed packages require fresh consent, invalid packages never enable, and installed versions remain side by side.
- Start an approved Mod, confirm the Native Shell identifies the session as modded without adding information to the Game Surface, then load a save whose exact package is missing and confirm safe failure without substitution or download.
- Terminate the sandboxed simulation service and confirm unsaved progress is lost, explicit saves remain intact, and no hidden recovery appears.
- Traceability: Content and State Model `CSM-0003`, `CSM-0006`, and `CSM-0007`.

## Verification status

Automated verification covers input merging and release behavior, repeat/shortcut exclusion, binding reassignment and coverage, layout invariants, minimum sizing, lifecycle timing, controller loss, preference round trips, quick-slot identities, save gates, destructive decisions, first-launch persistence, and native rendering of the main, Settings, and Help views. Production implementation must extend it with MAS-0008; the current synthetic issue #9 prototype does not implement Mod admission.

Human acceptance requires one maintainer to complete MAS-0001 through MAS-0007,
including both the Reference-familiar characteristic-feel perspective and the
modern-Mac discovery perspective. The decision is stored as a digest-bound
Approval Record against the promoted Behavior Case result. Any blocking finding
must be resolved and rerun. Reference comparison captures remain ignored
Restricted Material; only public-safe findings may be committed.

Issue #9 established the interaction contract. Its pending human execution is
now represented by BC-0022 through BC-0028 and remains a release-candidate gate
under the [Verification System](verification-system.md), rather than a reason to
reopen the design ticket.

## Downstream handoff

- Issue #10 chooses production application-shell, Metal, simulation-loop, and deployment architecture while preserving this observable contract.
- Issue #11 defines production content/state, untrusted Mod, and save representation in the [Content and State Model](content-state-model.md).
- Issue #12's [Verification System](verification-system.md) promotes MAS-0001 through MAS-0008 to BC-0022 through BC-0029 and prevents conformance claims while linked uncertainties remain open.
- Issue #13's [Product and Technical Implementation Specification](implementation-specification.md) fixes the package, signature, consent, XPC, Lua, save, migration, diagnostic, and release-evidence interfaces needed to implement this contract.
