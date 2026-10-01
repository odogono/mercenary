import { expect, type Page } from '@playwright/test';

/// Driving a real Damocles session from a browser test.
///
/// Shared by the body-aware pass (#320) and the limo-key pass (#301). Everything here works
/// through what a player has — keys, the development console and what the page publishes —
/// rather than by reaching into the session.

export const DAMOCLES_RESUME_KEY =
  'mercenary.browser-shell.damocles.session-resume.v1';

export const damoclesSaveSlot = (slot: 1 | 2 | 3): string =>
  `mercenary.browser-shell.damocles.save.v1.slot-${slot}`;

/// `KEY- V.I.P. LIMO`'s own recovered placement, local to the Capital Spaceport structure.
export const KEY_LOCAL = { x: 1038, z: 789 };

/// Where the session must stand for the key to be takeable: 250 units short of it, inside the
/// spaceport. The distance matters (the take radius is 512) and so does the structure region --
/// the key is exposed only in the regions its insertion group names, and 250 units west is one.
export const APPROACH_LOCAL = { x: KEY_LOCAL.x - 250, z: KEY_LOCAL.z };

/// Further back along the same line, so the last stretch can be walked. Facing east (yaw 768 on
/// the recovered 1024-unit clockwise-from-north scale) points straight at the key; the default
/// north start faces a wall, and the interior clamp holds the player still.
export const WALK_FROM_LOCAL = { x: KEY_LOCAL.x - 700, z: KEY_LOCAL.z };
export const FACING_EAST = 768;

/// In reach of the key and square on to the spaceport doorway, which is the only walkable route
/// out of the key's region. Walking forward from here reaches native region 2; walking backward
/// returns. Nothing on this line needs a turn, so a test never has to time one.
export const DOORWAY_LINE_LOCAL = { x: 1400, z: 700 };
export const FACING_DOORWAY = 0;

interface Catalogue {
  readonly instances: readonly {
    readonly id: string;
    readonly location: { readonly position: readonly number[] } | null;
  }[];
}

/// A structure instance's own world origin, which turns a published `data-x` / `data-z` back
/// into a structure-local offset.
export const structureWorld = async (
  page: Page,
  instance: string
): Promise<{ readonly x: number; readonly z: number }> => {
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as Catalogue;
  const position = catalogue.instances.find(item => item.id === instance)!
    .location!.position;
  return { x: position[0]! * 65_536, z: position[2]! * 65_536 };
};

/// The Capital Spaceport's own world origin, which every local offset in this file is measured
/// from.
export const spaceportWorld = (
  page: Page
): Promise<{ readonly x: number; readonly z: number }> =>
  structureWorld(page, 'eris-surface-87');

/// Boot /damocles with the on-foot start moved to a local offset inside the spaceport, or inside
/// `structure`, which is the idiom the existing Damocles suite uses to reach a place without
/// walking there.
///
/// `keepResume` leaves any Session Resume record alone, so a test can reload the page and
/// continue the session it was playing; without it the record is cleared before every load.
export const bootAt = async (
  page: Page,
  local: { readonly x: number; readonly z: number },
  yaw = 512,
  options: { readonly keepResume?: boolean; readonly structure?: string } = {}
): Promise<void> => {
  const origin = await structureWorld(
    page,
    options.structure ?? 'eris-surface-87'
  );
  if (options.keepResume !== true) {
    await page.addInitScript(
      key => localStorage.removeItem(key),
      DAMOCLES_RESUME_KEY
    );
  }
  await page.route('**/damocles/eris.json', async route => {
    const document_ = await (await route.fetch()).json();
    document_.start.yaw = yaw;
    document_.start.position = {
      x: origin.x + local.x,
      y: 63,
      z: origin.z + local.z
    };
    await route.fulfill({ json: document_ });
  });
  await page.goto('/damocles');
  await ready(page);
};

export const ready = async (page: Page): Promise<void> => {
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
};

/// Run one console line and return everything the console printed for it.
export const run = async (page: Page, line: string): Promise<string> => {
  const log = page.locator('#console-log');
  const before = await log.locator('> *').count();
  const input = page.locator('#console-input');
  if (!(await input.evaluate(node => node === document.activeElement))) {
    await page.keyboard.press('`');
    await expect(input).toBeFocused();
  }
  await input.fill(line);
  await input.press('Enter');
  await expect(log.locator('> *')).not.toHaveCount(before);
  const lines = await log.locator('> *').allTextContents();
  return lines.slice(before).join(' | ');
};

export const closeConsole = async (page: Page): Promise<void> => {
  if (
    (await page.locator('#game-surface').getAttribute('data-console')) !==
    'closed'
  ) {
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-console',
    'closed'
  );
};

export const inventory = (page: Page) =>
  page.locator('#panel-damocles [data-field=inventory]');

/// The Damocles Display's 48-cell row, published by the boot because the row is painted on a
/// canvas and has no readable text of its own.
export const displayRow = async (page: Page): Promise<string> =>
  (await page.locator('#frame').getAttribute('data-damocles-row')) ?? '';

/// How far a scrolling record has travelled into the row, in pixels; zero once it is held.
export const scrollPixels = async (page: Page): Promise<number> =>
  Number(await page.locator('#frame').getAttribute('data-damocles-scroll'));

/// Every Sound Cue the session has asked for so far, as `cue:count` pairs. Damocles has no
/// sound presenter yet, so this tally is the only trace a request leaves.
export const soundCues = async (page: Page): Promise<string> =>
  (await page.locator('#frame').getAttribute('data-damocles-cues')) ?? '';

/// Poll the row until one of the expected phrases has passed through it. Messages present for a
/// fixed number of frames and scroll in, so a single read would miss them.
export const rowReaches = async (page: Page, text: string): Promise<void> => {
  await expect
    .poll(async () => (await displayRow(page)).includes(text), {
      timeout: 20_000
    })
    .toBe(true);
};

/// Page errors are a verification result in their own right, so every test collects them.
export const watchErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
};

/// One message record, read from the Data Payload rather than copied into the test, so the
/// assertions compare against what the game was served. A record's leading spaces are the
/// original's own hand-centring and belong to the row; the published row is trimmed, so `held`
/// is what a test sees once the record has arrived.
export const messageText = async (page: Page, id: string): Promise<string> => {
  const strings = (await (
    await page.request.get('/payload/damocles/strings.json')
  ).json()) as {
    readonly inlineMessages: readonly {
      readonly id: string;
      readonly text: string;
    }[];
  };
  return strings.inlineMessages.find(message => message.id === id)!.text;
};

export const held = (text: string): string => text.trim();

/// Hold one walking key until the session reaches the state the caller is waiting for.
export const walkUntil = async (
  page: Page,
  key: 'ArrowDown' | 'ArrowUp',
  reached: () => Promise<boolean>,
  timeout = 30_000
): Promise<void> => {
  await page.keyboard.down(key);
  try {
    await expect.poll(reached, { intervals: [50], timeout }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
};

/// Stop on a published frame in the page itself. A browser round trip after a Node-side poll
/// can carry a held control past a narrow doorway or the desired flight pitch before release.
export const holdUntilFrame = async (
  page: Page,
  key: 'ArrowDown' | 'ArrowUp',
  target: {
    readonly attribute: 'x' | 'y' | 'z' | 'region' | 'pitch';
    readonly comparison: 'above' | 'below' | 'equal';
    readonly value: number;
  },
  timeout = 30_000
): Promise<void> => {
  try {
    await page.evaluate(
      ({ key, target, timeout }) =>
        new Promise<void>((resolve, reject) => {
          const frame = document.querySelector('#frame')!;
          const deadline = performance.now() + timeout;
          const release = () =>
            window.dispatchEvent(
              new KeyboardEvent('keyup', { code: key, key })
            );
          const tick = () => {
            const value = Number(
              frame.getAttribute(`data-${target.attribute}`)
            );
            const reached =
              target.comparison === 'above'
                ? value > target.value
                : target.comparison === 'below'
                  ? value < target.value
                  : value === target.value;
            if (reached) {
              release();
              resolve();
            } else if (performance.now() >= deadline) {
              release();
              reject(
                new Error(`control did not reach ${JSON.stringify(target)}`)
              );
            } else {
              requestAnimationFrame(tick);
            }
          };
          window.dispatchEvent(
            new KeyboardEvent('keydown', { code: key, key })
          );
          tick();
        }),
      { key, target, timeout }
    );
  } finally {
    await page.keyboard.up(key);
  }
};

/// Both take and drop are refused while the inventory label is still scrolling, so the ordinary
/// way to use them is to press again until the session accepts.
export const pressUntilInventory = async (
  page: Page,
  key: 'd' | 't',
  label: string
): Promise<void> => {
  await expect
    .poll(
      async () => {
        await page.keyboard.press(key);
        return inventory(page).textContent();
      },
      { timeout: 10_000 }
    )
    .toBe(label);
};

/// Wait for the response to reach its recorded end: the third record held, and then the blank
/// row its clearing line leaves. Anchoring on the third record matters, because a row part way
/// through a handover can be all spaces without the response having ended.
export const responseParks = async (
  page: Page,
  third: string
): Promise<void> => {
  await expect
    .poll(async () => displayRow(page), { timeout: 30_000 })
    .toBe(held(third));
  await expect.poll(async () => displayRow(page), { timeout: 30_000 }).toBe('');
};

/// Step from the spaceport's region 0 into the doorway, native region 1, with short taps. The
/// doorway is forty units deep, which a walk at full speed crosses in six frames, so a tap that
/// lands in region 2 beyond it steps back rather than failing the route.
export const stepIntoDoorway = async (page: Page): Promise<void> => {
  const region = async () =>
    (await page.locator('#frame').getAttribute('data-region')) ?? '';
  for (let step = 0; step < 80 && (await region()) !== '1'; step += 1) {
    const key = (await region()) === '2' ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.down(key);
    await page.waitForTimeout(25);
    await page.keyboard.up(key);
  }
  expect(await region()).toBe('1');
};
