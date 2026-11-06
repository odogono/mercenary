import { defineConfig } from '@playwright/test';

/// The Published Site's smoke test: the exported `dist/`, served as GitHub Pages serves it
/// under `/mercenary/`. Run `bun run export:site` first.
const port = Number(process.env['PORT'] ?? 4173);

export default defineConfig({
  reporter: [['list']],
  testDir: './e2e-site',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: 'bun tools/serve-site.ts --base /mercenary/',
    reuseExistingServer: false,
    url: `http://127.0.0.1:${port}/mercenary/`
  },
  workers: 1
});
