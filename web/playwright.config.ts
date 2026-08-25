import { defineConfig } from '@playwright/test';

const port = Number(process.env['PORT'] ?? 5173);

export default defineConfig({
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
  }
});
