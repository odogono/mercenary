# Browser Experience Mockups

> **Throwaway prototype for issue #120.** This code answers visual and interaction questions. It is not the production Browser Shell, renderer, simulation, save format, or deployment baseline.

One self-contained HTML page mocking the four new browser-shell surfaces in a shared graphical style: the **Benson Panel** (Targ and Damocles Panel Renditions), the Esc **System Menu** with its **settings page** and three-slot **save chooser**, and the backtick **Shell Console**. Everything on the page is independently authored synthetic content — the wireframe view, all readout values, save descriptors, and console responses are invented and marked `PROTOTYPE-ONLY`. No Restricted Material is used or committed; the panels are recreated by eye, and reference screenshots stay outside the repository.

## Run

```sh
bun run prototypes/browser-experience/serve.ts
```

Then open the printed `http://localhost:4180/`. The server exists only because browsers block `@font-face` fetches from `file://` pages; it serves this page plus the two extracted typefaces from `payload/fonts/` (nothing is copied into this directory). Without a populated Data Payload the page still works and shows a fallback-typeface banner.

Interactions to review:

- **Grey strip at the top is mockup chrome, not design** — view jumps, rendition toggle, save-slot state cycler.
- **Esc** opens/closes the System Menu over the paused frame; menu buttons reach Settings and Saves.
- **Backtick (`)** slides the Shell Console down; try `help`, `goto 05 12`, `goto room 3`, `panel damocles`, `set typeface damocles`, `save 2` (then `save 2 confirm`), `load 1`. ArrowUp/ArrowDown recall history.
- The compass, clock, and message line tick from a synthetic snapshot so the moving parts read as live.
- Resize the window — the whole frame scales uniformly; check 320 / 768 / 1024 / 1440 CSS px.

## Verify

There is no build or test suite: review is by eye (ADR 0011) against the maintainer's untracked reference screenshots, at the widths above and in both renditions. Findings and tuning happen by editing `index.html` directly; sign-off is recorded on issue #120.

The durable output is the decisions, captured in [`docs/browser-experience.md`](../../docs/browser-experience.md). Only those decisions and findings survive this prototype.
