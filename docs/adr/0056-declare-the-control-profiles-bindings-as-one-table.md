# Declare the Control Profile's Bindings as one table

Accepted, 2026-09-29, for [#600](https://github.com/odogono/mercenary/issues/600).

The browser Control Profile was a `switch` over `KeyboardEvent.code`. Its branches depended on
Occupancy and on being in a Damocles Lift, and each Title changed it only through the callbacks
it passed in, several of them no-ops. Nothing described the keys to a player. The one text form
of any key was the hand-written Head Command notice, and a controls list written the same way
would drift from the `switch` whenever a key moved.

## Decision

1. **One table dispatches the keys and names them.** `BINDINGS` in `web/src/shell/input.ts` is
   an ordered list of Bindings. Each has a group (`always`, `onFoot`, `lift` or `aboard`), the
   keys and action as the Controls Page names them, an optional hold or toggle mode, a `press`
   that takes the code if it is the Binding's, and `provided`, which says whether the Title has
   the action. `keyDown` tries the Bindings of the player's group in order, and the first that
   takes the key wins. A key none takes falls through to answering a script, as before.
2. **Order is precedence.** Aboard, the throttle rows come first. On foot, the lift comes before
   every other Binding, as `$0555DC` runs before the rest of the dispatch.
3. **An action a Title lacks is absent, not a no-op.** `fire`, `liftKey`, `page`, `press`,
   `rideLift` and `skipMessage` are optional. The Controls Page lists only Bindings the Title
   provides. Where the `switch` swallowed a key through a no-op (Space on foot, the brackets,
   `E`), the Binding still takes the key and does nothing, so no key changes meaning.
4. **The Controls Page and the Head Command notice read the table.** `describeBindings` groups
   the provided Bindings and marks the player's Occupancy. `headCommandKeysText` builds the
   DAMOCLES FILE notice from the Head Command rows.

## Considered

- **Keep the `switch` and add a description list with a parity test.** The test would catch a
  described key that stopped working, but not a new key added to the `switch` with no
  description.
- **Write the Controls Page by hand.** This has the same drift as the notice, only larger.

## Consequences

- A new key is one row. It cannot reach the profile without a label.
- The Benson fall-through (`Y` and any other ordinary key) is not a row and is not listed.
- The named Control Profiles planned for native builds (MAS-0004) can differ in their tables.
- Key names are US names of physical codes. Naming the printed key of the player's layout is
  left to [#606](https://github.com/odogono/mercenary/issues/606).
  - Resolved in #606: a label names its layout-dependent keys (letters, `,` `.` `[` `]` `-` `=`)
    by code, and `web/src/shell/keyNames.ts` prints them from the Keyboard Map API where the
    browser has it. Digits stay digits, which every layout prints on the key, and a printed key
    outside the panel typefaces' ASCII keeps its US name.
