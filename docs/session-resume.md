# Spec: Session Resume and Benson Message transcript

**Status: accepted for implementation.**

## Objective

Make browser reload survivable without turning automatic recovery into a fourth Save. The Browser Shell resumes the one current Gameplay Session automatically until the player explicitly starts New Game, while preserving the existing three player-controlled Saves and their strict compatibility contract.

The related transcript extension records complete Benson Messages in the Shell Console so a player or developer can review what Benson said during the current page lifetime.

## Session Resume contract

- The Browser Shell keeps one Session Resume, separate from all Save slots and presentation preferences. It survives reload, tab closure, and browser restart in the same browser storage until New Game replaces it.
- Startup restores it automatically without a choice screen. An Ending remains resumable. Restored play begins with idle input and the System Menu and Shell Console closed; no Browser Shell focus, overlay, command history, or transcript state is restored.
- Session Resume reuses the bounded JSON Save Snapshot representation and exact Data Payload and gameplay-setting identity used by Saves. Version 1 has no migration, partial restore, or best-effort compatibility.
- An invalid or incompatible Session Resume is removed, a fresh opening session starts, and `COULD NOT RESUME — <reason>` is reported. Player Saves and preferences are untouched.
- If storage is unavailable or a write fails, play and manual Saves remain independent. Session Resume is disabled for that page after the failure and `SESSION RESUME UNAVAILABLE — <reason>` is reported rather than repeatedly retrying every second.

## Checkpoint contract

- Dirty continuously changing state is checkpointed no more than once per second.
- A checkpoint is also attempted after every successful one-shot Semantic Action; immediately after New Game, Save restore, and an Ending; when the System Menu opens; when the page becomes hidden; and on `pagehide`.
- A normal reload flushes and restores the latest state. If abnormal termination prevents lifecycle handling, at most one second of progress may be lost.
- New Game and Save restore replace the live session even if their immediate Session Resume write fails. The old Session Resume is removed where storage permits before recovery is disabled, so stale progress is not deliberately left eligible to return.

## Ownership and takeover

- At most one browser page advances or writes the current Session Resume. An exclusive Web Lock is the authority; localStorage is durable state, not an election protocol. Every step, action, and checkpoint is fenced by current ownership.
- A second page does not advance play. It shows `SESSION ACTIVE IN ANOTHER TAB` and offers `TAKE OVER`.
- A responsive owner flushes, relinquishes ownership, stops stepping and writing, and reports `SESSION OPENED ELSEWHERE` before the new owner restores. An unresponsive owner may be displaced; the new owner then restores the latest periodic checkpoint.
- Cross-page notifications make demotion prompt but never establish authority. Lock loss itself gates the old page even if notification is delayed.
- If secure Web Locks are unavailable, Session Resume is disabled and `SESSION RESUME OWNERSHIP UNAVAILABLE` is reported. Play and manual Saves continue; the shell never falls back to last-writer-wins recovery.

## New Game

- `NEW GAME` is a top-level System Menu action available during ordinary play and every Ending.
- The first press arms the action as `CONFIRM NEW GAME`; the second press replaces the Gameplay Session with the opening state. Moving focus away disarms it.
- New Game replaces the Session Resume but preserves all three Saves and every presentation preference.

## Message-line notices

- Session Resume notices use the existing Benson message line rather than a separate banner, but remain shell notices rather than Benson Messages.
- `SESSION RESUMED` lasts for at most two seconds. A failure notice lasts for at most five seconds and is repeated whenever the System Menu opens.
- A new gameplay Benson Message immediately preempts a Session Resume notice. Ownership notices may remain while their page is paused.

## Benson Message transcript

- The Shell Console appends `BENSON · <complete text>` once a Benson Message is fully revealed or skipped. Character-by-character prefixes are never logged, and opening the console cannot reveal the completed text early.
- Equal text spoken on separate occasions produces separate entries; frames belonging to one occurrence do not.
- Shell notices, including Save and Session Resume notices, do not enter the transcript.
- A Benson Message restored partway through its reveal enters the new transcript once it later completes or is skipped. Messages completed before reload are not backfilled.
- The existing in-memory 400-line limit remains. Reload clears the transcript. New Game and Save restore keep the current page's transcript and append `— NEW GAME —` or `— LOADED SLOT <n> —` respectively.

## Verification

- Unit tests cover strict restore and refusal, checkpoint throttling and immediate boundaries, storage failures, ownership fencing, unsupported-lock fallback, notice priority, complete-message occurrence logging, and transcript separators and bounds.
- Chromium end-to-end tests prove exact normal reload recovery from representative airborne and underground states, New Game preservation of Saves and preferences, invalid recovery, and restored Endings.
- A real two-page Chromium test proves blocked secondary startup, responsive flush and takeover, old-owner demotion, and absence of stale writes.
- Abnormal termination is tested against the one-second checkpoint bound. Firefox and WebKit are not added to the support promise or gate by this feature.
