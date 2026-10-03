# Damocles recovered panel in the browser

Implementation and verification for [#741](https://github.com/odogono/mercenary/issues/741), following [the recovered artwork investigation](damocles-recovered-panel.md), [#740's writer data](damocles-panel-writer-data.md) and ADR 0070. These remain Working-Authority Evidence under ADR 0043; the code implements the understood drawing rules independently under ADR 0002.

`web/src/damocles/panelDocument.ts` validates the tracked payload. `panelWriter.ts` owns the title's raw-word readouts, centre selection/title stamps, reveal, fields, clock, lamps, gauges and mutable palette. `shell/panelPixels.ts` shares only plane, glyph, pitch, compass and colour expansion primitives. Mercenary III's recorded opening and partially revealed-card pixel hashes guard its prior output. The 64 native Damocles compass frames are exhaustively compared with the shared sliding-strip output, retaining the Damocles table's provenance hash and the phase relation recorded by #740.

`web/test/damocles-recovered-panel.test.ts` compares the independently implemented browser writer with both ST screen buffers of the three captured memstates named in the recovered artwork investigation. Source identities are pinned by full-RAM SHA-256. Each comparison covers the compass, pitch, speed, altitude, clock and lamp planes; it does not treat unimplemented grid/centre/space combinations as full-panel parity. Restricted captures are read in place through the laboratory's memstate decoder and are explicitly skipped when unavailable, while all payload, boundary, palette and composition tests remain portable. The related panel and attitude tests preserve #715's bearing/nose-up contract and test the new adapter's word conversion at turns, loops and independent heading/pitch changes.

The actual Gameplay Session's single 320×64 canvas has transparent hit regions over the carried head and centre, with focusable stack, document and computer controls and semantic readouts beside it. Live end-to-end checks exercise pointer and keyboard open, rotation, paging, Read, close, palette-mask changes, ground/airborne/space readouts, lamps and Save/Resume. The authored Targ and Flyover panel paths are retained.

For deterministic ADR 0011 review images, run from `web/` on a free port:

```sh
PORT=52742 bun run test:e2e e2e/damocles-recovered-panel.e2e.ts --workers=1
```

The test renders on-foot, aboard, airborne, open-document, mid-reveal, masked-computer and space states, asserts identical canvas pixels after reload, and saves PNG attachments in Playwright's output directory. On-foot, aboard and airborne attitude/readout values are the captured #716/#740 words; other values are fixed fixtures for bounded composition review. Live-session screenshots accompany the existing Head Commands and AUTHORS COMPUTER suites. Maintainer side-by-side review remains required by ADR 0011; automated checks do not supply that judgement.

The payload's gaps remain explicit. T/P levels are authored placeholders; the specialised grid font and dynamic computer, switch and detonator content positions are authored within recovered art. The space-navigation composite remains unsupported, retaining the previous body-coordinate placeholder, while speed and range use their native words. Inventory fullness uses the recovered capacity/count scaling from the carry-capacity investigation, but the browser presents its target rather than reproducing per-VBL gauge-cache movement. These limits are named in the accessible panel description, provenance metadata, code and ADR; recovered artwork adds no missing gameplay.
