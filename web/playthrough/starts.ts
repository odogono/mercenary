import { expect, type Page } from '@playwright/test';

import type { Setup } from './ledger.ts';

/// A Playthrough Chapter's built start: a fresh session's own snapshot, edited to the state the
/// earlier chapters would have left, and restored through the browser's ordinary Session Resume.
/// Each edit is one of the chapter's stated assumptions, so the ledger can say what was given
/// rather than earned.

export const DAMOCLES_RESUME_KEY =
  'mercenary.browser-shell.damocles.session-resume.v1';

export interface BuiltStart {
  /// One line per assumption, for the ledger.
  readonly assumes: readonly string[];
  /// Where in that cell the player stands, on foot, in world units on ERIS.
  readonly at: { readonly x: number; readonly z: number };
  /// Objects carried, head first.
  readonly carried: readonly string[];
  /// The workspace cell the player stands in, as `#frame[data-cell]` reads it.
  readonly cell: { readonly x: number; readonly z: number };
  /// Script flags set, as `$7BD8` bits (bit 0: the first offer accepted).
  readonly flags: number;
  /// Facing, as the published heading.
  readonly heading?: number;
  /// Location and pickup triggers already spent.
  readonly spentTriggers: readonly number[];
}

export const startFrom = async (
  page: Page,
  start: BuiltStart
): Promise<Setup> => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 60_000
  });
  const encoded = await page.evaluate(async start => {
    const { damoclesTitle } = await import('../src/damocles/title.ts');
    const { DamoclesSession } = await import('../src/damocles/session.ts');
    const {
      DAMOCLES_SAVE_SCHEMA_VERSION,
      damoclesSaveIdentity,
      decodeDamoclesSave,
      encodeDamoclesSave
    } = await import('../src/damocles/save.ts');
    const content = await damoclesTitle.load(async pathname => {
      const text = await (await fetch(pathname)).text();
      return { text, value: JSON.parse(text) };
    });
    // Moved by the session's own teleport first, so its bound structure is the one the cell
    // selects; the pose is then set within that cell.
    const fresh = new DamoclesSession(content);
    fresh.teleportToCell(start.cell.x, start.cell.z);
    const saved = fresh.captureResume();
    const carried = new Set(start.carried);
    const snapshot = {
      ...saved,
      carried: [...start.carried],
      pose: {
        ...saved.pose,
        heading: start.heading ?? saved.pose.heading,
        position: { ...saved.pose.position, x: start.at.x, z: start.at.z }
      },
      residence: [
        ...saved.residence.filter(item => !carried.has(item.instance)),
        ...start.carried.map(instance => ({
          instance,
          residence: { kind: 'carried' as const, placementClass: 4 }
        }))
      ],
      script: {
        ...saved.script,
        flags: saved.script.flags | start.flags,
        triggers: saved.script.triggers.map(trigger =>
          start.spentTriggers.includes(trigger.index)
            ? { ...trigger, armed: false }
            : trigger
        )
      }
    };
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const encoded = encodeDamoclesSave({
      identity,
      savedAt: new Date().toISOString(),
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot,
      where: 'ERIS'
    });
    // Refused here, with the session's own reason, rather than silently on the reload, where a
    // refused record starts a New Game.
    const decoded = decodeDamoclesSave(encoded, identity, content).snapshot;
    await DamoclesSession.prepare(content, decoded);
    new DamoclesSession(content, decoded);
    return encoded;
  }, start);
  await page.addInitScript(
    ({ encoded, key }) => {
      if (sessionStorage.getItem('playthrough-start') === null) {
        sessionStorage.setItem('playthrough-start', '1');
        localStorage.setItem(key, encoded);
      }
    },
    { encoded, key: DAMOCLES_RESUME_KEY }
  );
  await page.reload();
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 60_000
  });
  return {
    assumes: start.assumes,
    how: 'a built Session Resume record: a fresh session’s snapshot with the assumptions applied'
  };
};

/// The end of Chapter 1, built: on foot beside EAGLE NINE S E at the Moorby School of Flying
/// with its key. The caller adds where, beside the Eagle, to stand.
export const MOORBY_START = {
  assumes: [
    'on foot beside EAGLE NINE S E at the Moorby School of Flying (end of Chapter 1)',
    'KEY - EAGLE 9SE carried, its pickup trigger spent',
    'the first offer accepted (script flag bit 0) and the State Office triggers spent'
  ],
  carried: ['object-slot-181'],
  cell: { x: 9, z: 9 },
  flags: 1,
  spentTriggers: [3, 4, 5]
} as const satisfies Omit<BuiltStart, 'at'>;
