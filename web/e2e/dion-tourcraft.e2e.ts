import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TOURCRAFT_SAVE_SCHEMA_VERSION } from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import type { DionControlOperation } from '../test/dion-controls.ts';
import { boardOpeningTaxi } from '../test/dion-journey.ts';
import { continueTourcraft } from '../test/tourcraft-journey.ts';

// The witness contains controls and durations only. The production browser
// receives real keys; no session, pose, time-of-day or admission is injected.
const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
const control = new TourcraftSession(content);
const operations: DionControlOperation[] = [];
const prefix = new Proxy(control, {
  get(target, key) {
    if (key === 'advance') {
      return (seconds: number) => {
        operations.push({ kind: 'advance', seconds });
        const result = target.advance(seconds);
        target.drainSound();
        return result;
      };
    }
    if (key === 'press') {
      return (action: Parameters<TourcraftSession['press']>[0]) => {
        operations.push({ action, kind: 'press' });
        target.press(action);
      };
    }
    return Reflect.get(target, key, target);
  },
  set(target, key, value) {
    if (key === 'intent') {
      operations.push({ intent: value, kind: 'intent' });
    }
    return Reflect.set(target, key, value, target);
  }
});
boardOpeningTaxi(prefix);
const boundaries = new Map<
  number,
  {
    body: number;
    cell: number;
    heading: number;
    mode: string;
    region: number;
    word: number;
    x: number;
    z: number;
  }
>();
continueTourcraft(control, op => {
  operations.push(op);
  const s = control.snapshot,
    f = s.tourcraft!.flight;
  if (
    f &&
    [139, 256, 462, 883, 927].includes(f.frameWord) &&
    ![...boundaries.values()].some(b => b.word === f.frameWord)
  ) {
    boundaries.set(s.tick, {
      body: s.location,
      cell: s.cell,
      heading: s.heading,
      mode: f.mode,
      region: s.region,
      word: f.frameWord,
      x: s.eye[0],
      z: s.eye[2]
    });
  }
});

declare global {
  interface Window {
    dionClock: { step: (milliseconds: number) => void };
  }
}
const tick = (page: Page) =>
  page.locator('#screen').getAttribute('data-tick').then(Number);
const advanceTo = async (page: Page, target: number) => {
  await page.evaluate(target => {
    const screen = document.getElementById('screen')!;
    let current = Number(screen.dataset['tick']);
    for (let budget = 0; current < target && budget < 10_000; budget++) {
      window.dionClock.step(target - current >= 12 ? 220 : 10);
      current = Number(screen.dataset['tick']);
    }
    if (current !== target) {
      throw new Error(`Browser tick ${current}, expected ${target}`);
    }
  }, target);
};
const keyFor = {
  activate: 'NumpadEnter',
  backward: 'BracketRight',
  board: 'KeyB',
  drop: 'KeyD',
  forward: 'BracketLeft',
  leave: 'KeyL',
  minus: 'NumpadSubtract',
  plus: 'NumpadAdd',
  star: 'NumpadMultiply',
  take: 'KeyT'
};

test('production keyboard journey, flight Save/Load and reload Resume through automatic exit', async ({
  page
}, info) => {
  test.setTimeout(180_000);
  test.fixme(Boolean(process.env['CI']), 'too slow on a CI runner: #852');
  await page.addInitScript(() => {
    let time = 0,
      next = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = callback => {
      callbacks.set(++next, callback);
      return next;
    };
    window.cancelAnimationFrame = id => {
      callbacks.delete(id);
    };
    window.dionClock = {
      step: milliseconds => {
        time += milliseconds;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) {
          callback(time);
        }
      }
    };
    localStorage.setItem(
      'mercenary.browser-shell.damocles.session-resume.v1',
      'damocles sentinel'
    );
    localStorage.setItem(
      'mercenary.browser-shell.session-resume.v1',
      'targ sentinel'
    );
  });
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await page.evaluate(() => window.dionClock.step(0));
  await expect(screen).toHaveAttribute('data-reveal', '49');
  await page.keyboard.press('Enter');
  let target = await tick(page),
    restored = false,
    loaded = false;
  const held = new Set<string>();
  const browserOperations: DionControlOperation[] = [];
  let witnessTick = 0;
  for (const op of operations) {
    const last = browserOperations.at(-1);
    if (op.kind === 'advance') {
      const before = witnessTick;
      witnessTick += Math.round(op.seconds * 50);
      if (last?.kind === 'advance' && !boundaries.has(before)) {
        browserOperations[browserOperations.length - 1] = {
          kind: 'advance',
          seconds: last.seconds + op.seconds
        };
      } else {
        browserOperations.push(op);
      }
    } else {
      browserOperations.push(op);
    }
  }
  for (const op of browserOperations) {
    if (op.kind === 'press') {
      if (op.action === 'activate') {
        await expect(screen).toHaveAttribute('data-reveal', '0');
      }
      await page.keyboard.press(keyFor[op.action]);
    } else if (op.kind === 'intent') {
      const wanted = new Set<string>();
      if (op.intent.walk) {
        wanted.add(op.intent.walk > 0 ? 'ArrowUp' : 'ArrowDown');
      }
      if (op.intent.turn) {
        wanted.add(op.intent.turn > 0 ? 'ArrowRight' : 'ArrowLeft');
      }
      for (const key of held) {
        if (!wanted.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
      }
      for (const key of wanted) {
        if (!held.has(key)) {
          await page.keyboard.down(key);
          held.add(key);
        }
      }
    } else {
      target += Math.round(op.seconds * 50);
      await advanceTo(page, target);
      const boundary = boundaries.get(target);
      if (boundary) {
        for (const [key, value] of Object.entries({
          cell: boundary.cell,
          heading: boundary.heading,
          location: boundary.body,
          playback: boundary.mode,
          playbackFrame: boundary.word,
          region: boundary.region,
          x: boundary.x,
          z: boundary.z
        })) {
          await expect(screen).toHaveAttribute(
            `data-${key.replace('F', '-f')}`,
            String(value)
          );
        }
        await page.screenshot({
          path: info.outputPath(`flight-${boundary.word}.png`)
        });
      }
      if (boundary?.word === 256 && !loaded) {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'SAVE / LOAD' }).click();
        await page.locator('[data-slot="1"] [data-action="save"]').click();
        const saved = await page.evaluate(() =>
          JSON.parse(
            localStorage.getItem('mercenary.browser-shell.dion.save.v1.slot-1')!
          )
        );
        expect(saved.schemaVersion).toBe(TOURCRAFT_SAVE_SCHEMA_VERSION);
        expect(saved.snapshot.snapshot.tourcraft.flight.frameWord).toBe(256);
        await page.locator('[data-slot="1"] [data-action="load"]').click();
        await expect(screen).toHaveAttribute('data-tick', String(target));
        await page.evaluate(() => window.dionClock.step(0));
        loaded = true;
      }
      if (boundary?.word === 462 && !restored) {
        // Opening the menu flushes the actual Resume writer before reloading.
        await page.keyboard.press('Escape');
        await page.reload();
        await expect(screen).toHaveAttribute('data-state', 'ready');
        await expect(screen).toHaveAttribute('data-tick', String(target));
        await expect(screen).toHaveAttribute('data-playback-frame', '462');
        await page.evaluate(() => window.dionClock.step(0));
        restored = true;
      }
    }
  }
  await expect(screen).toHaveAttribute('data-location', '100');
  await expect(screen).toHaveAttribute('data-playback', 'foot');
  await page.keyboard.press('NumpadMultiply');
  await advanceTo(page, (target += 11));
  await page.keyboard.press('KeyB');
  await advanceTo(page, (target += 11));
  await page.keyboard.press('Escape');
  const ambient = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('mercenary.browser-shell.dion.session-resume.v1')!
    )
  );
  expect(ambient.snapshot.snapshot.taxi.call).toBe(false);
  expect(ambient.snapshot.snapshot.taxi.passenger).toBe(false);
  expect(loaded && restored).toBe(true);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
    )
  ).toBe('damocles sentinel');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.session-resume.v1')
    )
  ).toBe('targ sentinel');
  await expect(page.locator('#failure')).toBeHidden();
});

test('prototype Resume refusal preserves its record until explicit New Game', async ({
  page
}) => {
  const prototype = JSON.stringify({
    identity: { title: 'dion' },
    schemaVersion: 1
  });
  await page.addInitScript(
    value =>
      localStorage.setItem(
        'mercenary.browser-shell.dion.session-resume.v1',
        value
      ),
    prototype
  );
  await page.goto('/dion');
  await expect(page.locator('#screen')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#status')).toContainText('New Game');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.dion.session-resume.v1')
    )
  ).toBe(prototype);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { exact: true, name: 'NEW GAME' }).click();
  await page
    .getByRole('button', { exact: true, name: 'CONFIRM NEW GAME' })
    .click();
  await expect(page.locator('#status')).toBeHidden();
  await page.keyboard.press('Escape');
  expect(
    JSON.parse(
      (await page.evaluate(() =>
        localStorage.getItem('mercenary.browser-shell.dion.session-resume.v1')
      ))!
    ).schemaVersion
  ).toBe(TOURCRAFT_SAVE_SCHEMA_VERSION);
});
