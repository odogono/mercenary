import { expect, test } from '@playwright/test';

import { documentPaths } from '../src/shell/documentPath.ts';

/// Every document of the Published Site loads under its base path without a failed request
/// or an uncaught error: the paths the export rebases are the ones that break first.
for (const path of documentPaths()) {
  test(`${path} loads under /mercenary/`, async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('requestfailed', request =>
      failures.push(`${request.failure()?.errorText} ${request.url()}`)
    );
    await page.goto(`/mercenary${path === '/' ? '/' : path}`);
    await page.waitForLoadState('networkidle');
    expect(failures).toEqual([]);
  });
}
