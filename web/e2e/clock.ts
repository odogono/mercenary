import type { Page } from '@playwright/test';

/// Leave room between installing a running clock and pausing it: browser commands can take
/// seconds on CI. Pausing at the installation time races the clock's real-time advance.
/// Install before navigation when the test needs to control every Gameplay Session frame.
export const pauseClock = async (page: Page): Promise<void> => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-02T00:00:00Z'));
};
