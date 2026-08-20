import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    viewport: { height: 900, width: 1280 }
  },
  webServer: {
    command: 'bun run dev',
    reuseExistingServer: process.env['CI'] === undefined,
    stderr: 'pipe',
    stdout: 'pipe',
    url: 'http://127.0.0.1:5173'
  }
});
