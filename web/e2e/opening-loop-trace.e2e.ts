import { expect, test, type Page } from '@playwright/test';

const RESUME_KEY = 'mercenary.browser-shell.session-resume.v1';
const saveKey = (slot: number): string =>
  `mercenary.browser-shell.save.v1.slot-${slot}`;

interface StoredSave {
  readonly snapshot: {
    readonly benson: null | {
      readonly host: { endingPhase: number; readonly engineFlags: number };
      readonly script: number | null;
      readonly state: object;
    };
    readonly talk: object | null;
  };
}

const SCRIPT_RUNNING = 0x40;

/// What the game restores from a Save the opening loop made with Benson Script 0, which is a
/// Talk Script now (ADR 0080): that script stops, and the Talk Scripts load beside Benson.
const asRestored = (snapshot: StoredSave['snapshot']): unknown => {
  const benson = snapshot.benson;
  return {
    ...snapshot,
    benson:
      benson?.script === 0
        ? {
            ...benson,
            host: {
              ...benson.host,
              engineFlags: benson.host.engineFlags & ~SCRIPT_RUNNING
            },
            script: null,
            state: {
              ...benson.state,
              callStack: [],
              pc: null,
              resumeAfterTick: null
            }
          }
        : benson,
    talk: null
  };
};

/// A Save the game made, without its Talk Scripts' part, whose bytes number each save.
const withoutTalk = (save: StoredSave): unknown => {
  expect(save.snapshot.talk).not.toBeNull();
  return { ...save.snapshot, talk: null };
};

const installResumeFromSlot = async (
  page: Page,
  slot: number,
  ending = false
): Promise<StoredSave> =>
  await page.evaluate(
    ({ ending, resumeKey, saveKey }) => {
      const encoded = localStorage.getItem(saveKey);
      if (encoded === null) {
        throw new Error(`${saveKey} is empty`);
      }
      const save = JSON.parse(encoded) as StoredSave;
      if (ending) {
        if (save.snapshot.benson === null) {
          throw new Error('the Ending scenario has no Benson state');
        }
        save.snapshot.benson.host.endingPhase = 1;
      }
      localStorage.setItem(resumeKey, JSON.stringify(save));
      localStorage.removeItem('mercenary.browser-shell.save.v1.slot-1');
      return save;
    },
    { ending, resumeKey: RESUME_KEY, saveKey: saveKey(slot) }
  );

const saveCurrentSnapshot = async (
  page: Page,
  confirm = false
): Promise<StoredSave> => {
  await page.keyboard.press('Backquote');
  const input = page.locator('#console-input');
  await input.fill(`save 1${confirm ? ' confirm' : ''}`);
  await page.keyboard.press('Enter');
  await expect(page.locator('#console-log')).toContainText('saved slot 1');
  await input.evaluate(element => element.blur());
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-console',
    'closed'
  );
  return await page.evaluate(key => {
    const encoded = localStorage.getItem(key);
    if (encoded === null) {
      throw new Error(`${key} is empty`);
    }
    return JSON.parse(encoded) as StoredSave;
  }, saveKey(1));
};

test('Chromium replays the recorded opening loop bit-for-bit and renders its milestones', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/__e2e__/opening-loop');
  const surface = page.locator('#trace-surface');
  await expect(surface).toHaveAttribute('data-state', 'complete', {
    timeout: 30_000
  });
  await expect(surface).toHaveAttribute(
    'data-milestones',
    'initial,airborne,touchdown,room-1'
  );
  await expect(surface).toHaveAttribute(
    'data-save-restores',
    'airborne,room-1'
  );
  await expect(surface).toHaveAttribute('data-credits', '4000');
  await expect(surface).toHaveAttribute('data-grid', '09:06');
  await expect(surface).toHaveAttribute('data-location', 'room-1');
  await expect(surface).toHaveAttribute('data-occupancy', 'on-foot');
  await expect(page.locator('#status')).toHaveText(
    '6,296 records replayed bit-for-bit'
  );

  const colours = await page.locator('#frame').evaluate(canvas => {
    const frame = canvas as HTMLCanvasElement;
    frame.dispatchEvent(new Event('trace-redraw'));
    const gl = frame.getContext('webgl2')!;
    const pixels = new Uint8Array(frame.width * frame.height * 4);
    gl.readPixels(
      0,
      0,
      frame.width,
      frame.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    const found = new Set<string>();
    for (let index = 0; index < pixels.length; index += 4) {
      found.add(
        `${String(pixels[index])},${String(pixels[index + 1])},${String(pixels[index + 2])}`
      );
    }
    return [...found];
  });
  expect(colours).toContain('171,60,101');
  expect(colours).toContain('234,121,163');
  expect(colours).toContain('255,255,255');

  // Freeze the first Browser Shell frame on subsequent navigations. Startup still publishes its
  // restored Session Snapshot, but no simulation step can make an exact comparison stale before
  // the test captures it through the real Save path.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mercenary.browser-shell.targ.preferences.v1',
      JSON.stringify({ composition: 'strip', panelRendition: 'targ' })
    );
    window.requestAnimationFrame = () => 1;
  });

  const airborne = await installResumeFromSlot(page, 2);
  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await expect(page.locator('#status')).toContainText('FLYING');
  expect(withoutTalk(await saveCurrentSnapshot(page))).toEqual(
    asRestored(airborne.snapshot)
  );
  await page.reload();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await expect(page.locator('#status')).toContainText('FLYING');
  expect(withoutTalk(await saveCurrentSnapshot(page, true))).toEqual(
    asRestored(airborne.snapshot)
  );

  const underground = await installResumeFromSlot(page, 3);
  await page.reload();
  await expect(page.locator('#status')).toContainText('ROOM 01');
  expect(withoutTalk(await saveCurrentSnapshot(page))).toEqual(
    asRestored(underground.snapshot)
  );
  await page.reload();
  await expect(page.locator('#status')).toContainText('ROOM 01');
  expect(withoutTalk(await saveCurrentSnapshot(page, true))).toEqual(
    asRestored(underground.snapshot)
  );

  const ending = await installResumeFromSlot(page, 2, true);
  await page.reload();
  expect(withoutTalk(await saveCurrentSnapshot(page))).toEqual(
    asRestored(ending.snapshot)
  );
  await page.reload();
  expect(withoutTalk(await saveCurrentSnapshot(page, true))).toEqual(
    asRestored(ending.snapshot)
  );

  // An Ending is resumable, but NEW GAME remains available and replaces it immediately.
  const newGame = page.locator('#new-game');
  await expect(newGame).toBeEnabled();
  await newGame.dispatchEvent('click');
  await expect(newGame).toHaveText('CONFIRM NEW GAME');
  await newGame.dispatchEvent('click');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  const replacementEndingPhase = await page.evaluate(resumeKey => {
    const encoded = localStorage.getItem(resumeKey);
    if (encoded === null) {
      throw new Error('New Game did not replace the Session Resume');
    }
    return (JSON.parse(encoded) as StoredSave).snapshot.benson?.host
      .endingPhase;
  }, RESUME_KEY);
  expect(replacementEndingPhase).toBe(0);
  expect(errors).toEqual([]);
});
