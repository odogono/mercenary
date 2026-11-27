import { defineConfig } from '@playwright/test';

/// The Damocles Solution Playthrough: published solutions played through the browser by player
/// inputs, to find where the session cannot follow them. It is a gap-finding run, not a gate, so
/// it stays out of `test:e2e` and `bun run check`. Run it with `bun run test:playthrough`.
const port = Number(process.env['PORT'] ?? 5173);

export default defineConfig({
  expect: { timeout: 10_000 },
  // A failed step stops its own Playthrough Chapter, never the run.
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playthrough-report' }]
  ],
  testDir: './playthrough',
  testMatch: '**/*.playthrough.ts',
  // Chapters play at the game's own speed, so they take minutes.
  timeout: 30 * 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'off',
    trace: 'retain-on-failure',
    viewport: { height: 900, width: 1280 }
  },
  webServer: {
    command: 'bun run dev',
    env: { MERCENARY_E2E: '1' },
    reuseExistingServer: false,
    stderr: 'pipe',
    stdout: 'pipe',
    url: `http://127.0.0.1:${port}`
  },
  // One renderer: a chapter steers by frames, and a second page competing for it stretches them.
  workers: 1
});
