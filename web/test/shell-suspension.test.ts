import { describe, expect, test } from 'bun:test';

import { installSuspensionHandlers } from '../src/shell/suspension.ts';

class VisibilityTarget extends EventTarget {
  hidden = false;
}

describe('Browser Shell suspension', () => {
  test('blur and only a hidden visibility transition release the shell', () => {
    const windowTarget = new EventTarget();
    const documentTarget = new VisibilityTarget();
    let releases = 0;
    const uninstall = installSuspensionHandlers(
      windowTarget,
      documentTarget,
      () => {
        releases += 1;
      }
    );

    windowTarget.dispatchEvent(new Event('blur'));
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    documentTarget.hidden = true;
    documentTarget.dispatchEvent(new Event('visibilitychange'));

    expect(releases).toBe(2);

    uninstall();
    windowTarget.dispatchEvent(new Event('blur'));
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(releases).toBe(2);
  });
});
