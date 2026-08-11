# Mac Experience Prototype

> **Throwaway prototype for issue #9.** This code answers interaction questions. It is not the production application, renderer, simulation, save format, or deployment baseline.

The executable contains only independently authored synthetic wireframes and text. It demonstrates the accepted boundary between the Game Surface and Native Shell without using Restricted Material.

## Run

Requires the current repository development environment (macOS 26, Xcode 26.3, Swift 6.2.4):

```sh
cd prototypes/macos-experience
swift run mac-experience-prototype
```

The first launch opens a native welcome window. Use Settings to switch Control Profiles, exercise Accommodations, select a controller, and open or close the synthetic save gate. Resize the main window past the wide-layout threshold to compare Display Compositions.

## Verify

```sh
swift build
swift test
```

The prototype persists namespaced preferences and ten synthetic quick slots in `UserDefaults`. Named save documents are JSON files marked `PROTOTYPE-ONLY`; they are deliberately incompatible with any future game save format. No semantic autosave is created.

Use the reviewer scripts in [`docs/macos-experience.md`](../../docs/macos-experience.md). Only the decisions and findings are durable; issue #10 remains free to choose the production architecture.
