import { expect, test, type Page } from '@playwright/test';

import {
  bootAt,
  displayRow,
  held,
  messageText,
  watchErrors
} from './damocles-play.ts';

/// The browser listening check for Damocles sound (#508), kept apart from the cue tally.
///
/// `data-damocles-cues` proves the session asked for a sound. This file listens instead, at the
/// destination tap, so it hears exactly what the speakers are given, after mute and volume.
/// Audio-thread RMS blocks and scheduled commands share the audio clock, independently of rendering.

const STATE_OFFICE = 'eris-surface-89';
/// Beside the V.I.P. LIMO in the Capital Spaceport, without its key (see damocles-boarding.e2e.ts).
const BESIDE_LIMO = { x: 1714 + 150, z: -3241 };
/// In the hall, facing west into the lift car through its doorway (see damocles-lift.e2e.ts).
const BEFORE_THE_DOOR = { x: -440, z: 0 };
const FACING_WEST = 256;

/// Heard above this level, silent below the other. The door tone's quietest step is near 0.003.
const AUDIBLE = 1e-3;
const SILENT = 1e-4;

interface Heard {
  readonly cues: string;
  readonly elapsed: number;
  readonly level: number;
  readonly messageTones: number;
}

const frame = (page: Page) => page.locator('#frame');

const listen = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const heard: Heard[] = [];
    (window as unknown as { damoclesHeard: Heard[] }).damoclesHeard = heard;
    const close = AudioContext.prototype.close;
    AudioContext.prototype.close = function (this: AudioContext) {
      sessionStorage.setItem('damoclesAudioClosed', 'true');
      return close.call(this);
    };
    // Audio keeps running when the main thread misses a frame. Record RMS on the audio thread,
    // after mute and volume, and label each block by the commands scheduled on that same clock.
    const changes: { at: number; cues: string; messageTones: number }[] = [];
    const cues = new Map<string, number>();
    let messageTones = 0;
    const send = MessagePort.prototype.postMessage as (
      this: MessagePort,
      ...args: unknown[]
    ) => void;
    MessagePort.prototype.postMessage = function (
      this: MessagePort,
      ...args: unknown[]
    ) {
      const batch = args[0] as {
        at?: number;
        commands?: { cue?: string; kind?: string }[];
      } | null;
      if (
        batch &&
        typeof batch.at === 'number' &&
        Array.isArray(batch.commands)
      ) {
        for (const command of batch.commands) {
          if (command.kind === 'cue' && command.cue) {
            cues.set(command.cue, (cues.get(command.cue) ?? 0) + 1);
          } else if (command.kind === 'message') {
            messageTones += 1;
          }
        }
        changes.push({
          at: batch.at,
          cues: [...cues]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cue, count]) => `${cue}:${count}`)
            .join(' '),
          messageTones
        });
      }
      send.apply(this, args);
    } as typeof MessagePort.prototype.postMessage;
    const processor = `
      class SoundCapture extends AudioWorkletProcessor {
        frames = 0;
        sum = 0;
        process(inputs) {
          for (const sample of inputs[0]?.[0] ?? []) {
            this.sum += sample * sample;
            this.frames += 1;
          }
          if (this.frames >= sampleRate / 100) {
            this.port.postMessage({ elapsed: currentTime, level: Math.sqrt(this.sum / this.frames) });
            this.frames = 0;
            this.sum = 0;
          }
          return true;
        }
      }
      registerProcessor('damocles-test-capture', SoundCapture);
    `;
    const connected = new WeakSet<BaseAudioContext>();
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      ...args: unknown[]
    ) => unknown;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: unknown[]
    ) {
      const context = this.context as AudioContext;
      if (args[0] === context.destination && !connected.has(context)) {
        connected.add(context);
        const source = this;
        const url = URL.createObjectURL(
          new Blob([processor], { type: 'text/javascript' })
        );
        void context.audioWorklet.addModule(url).then(() => {
          URL.revokeObjectURL(url);
          const capture = new AudioWorkletNode(
            context,
            'damocles-test-capture'
          );
          capture.port.onmessage = (
            event: MessageEvent<{ elapsed: number; level: number }>
          ) => {
            const sample = event.data;
            const change = changes
              .filter(item => item.at <= sample.elapsed)
              .at(-1);
            heard.push({
              cues: change?.cues ?? '',
              elapsed: sample.elapsed,
              level: sample.level,
              messageTones: change?.messageTones ?? 0
            });
          };
          connect.call(source, capture);
          // The capture's output stays silent; the original speaker connection is unchanged.
          connect.call(capture, context.destination);
        });
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
};

const heard = (page: Page): Promise<Heard[]> =>
  page.evaluate(
    () => (window as unknown as { damoclesHeard: Heard[] }).damoclesHeard
  );

/// Session time of the first poll whose tally includes `cue`.
const when = (samples: readonly Heard[], cue: string): number => {
  const found = samples.find(sample => sample.cues.split(' ').includes(cue));
  expect(found, `a poll with ${cue}`).toBeDefined();
  return found!.elapsed;
};

const levelsBetween = (
  samples: readonly Heard[],
  from: number,
  to: number
): number[] =>
  samples
    .filter(sample => sample.elapsed >= from && sample.elapsed < to)
    .map(sample => sample.level);

const walkIntoTheLift = async (page: Page): Promise<void> => {
  await bootAt(page, BEFORE_THE_DOOR, FACING_WEST, { structure: STATE_OFFICE });
  await expect(frame(page)).toHaveAttribute('data-region', '0');
  // Unlock and start recording before walking: otherwise module loading can drop the first
  // door request while audio is still unlocking, shifting the heard cue counts by one.
  await page.keyboard.press('Shift');
  await expect(frame(page)).toHaveAttribute('data-damocles-audio', 'running');
  await expect.poll(async () => (await heard(page)).length).toBeGreaterThan(2);
  await page.keyboard.down('ArrowUp');
  await expect(frame(page)).toHaveAttribute('data-region', '4', {
    timeout: 20_000
  });
  await page.keyboard.up('ArrowUp');
  await expect(frame(page)).toHaveAttribute('data-damocles-audio', 'running');
  // The hall holds the eye at the door until its latch opens, so the walk in thuds once (#521).
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-cues',
    'door-start:1 door-stop:1 thud:1'
  );
  // Crossing the door strip launched the State President's welcome (#611), whose lines sound as
  // they scroll in. The ride waits until the last has arrived, so only the lift is heard.
  const last = held(await messageText(page, 'script3-inline-6'));
  await expect
    .poll(async () => displayRow(page), { timeout: 40_000 })
    .toBe(last);
  await page.waitForTimeout(500);
};

const rideToFloor1 = async (page: Page): Promise<void> => {
  await page.keyboard.press('1');
  await expect(frame(page)).toHaveAttribute('data-floor', '1', {
    timeout: 10_000
  });
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-cues',
    'door-start:3 door-stop:3 take:1 thud:1',
    { timeout: 10_000 }
  );
  // Long enough for the arrival effect's second of decay to end.
  await page.waitForTimeout(2000);
};

test('a lift ride is heard: door tone and burst, silence while the label steps, the arrival effect and the new door', async ({
  page
}) => {
  test.fixme(true, 'fails on main: #852');
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await listen(page);
  await walkIntoTheLift(page);
  await rideToFloor1(page);
  const samples = await heard(page);

  const closing = when(samples, 'door-start:2');
  const shut = when(samples, 'door-stop:2');
  const arrival = when(samples, 'take:1');
  const opened = when(samples, 'door-stop:3');
  const end = samples.at(-1)!.elapsed;
  // Blocks and cue boundaries use the audio clock. Margins exclude the driver's VBL and
  // the short RMS window at each edge.
  const doorTone = levelsBetween(samples, closing + 0.1, shut - 0.1);
  expect(doorTone.length).toBeGreaterThan(2);
  expect(Math.min(...doorTone)).toBeGreaterThan(AUDIBLE);
  const labelSteps = levelsBetween(samples, shut + 0.2, arrival - 0.05);
  expect(labelSteps.length).toBeGreaterThan(4);
  expect(Math.max(...labelSteps)).toBeLessThan(SILENT);
  const arriving = levelsBetween(samples, arrival + 0.1, opened);
  expect(arriving.length).toBeGreaterThan(2);
  expect(Math.min(...arriving)).toBeGreaterThan(AUDIBLE);
  // The effect has decayed and the new door stands open: nothing sounds on.
  const after = levelsBetween(samples, arrival + 1.3, end);
  expect(after.length).toBeGreaterThan(4);
  expect(Math.max(...after)).toBeLessThan(SILENT);
  expect(errors).toEqual([]);
});

test('a refusal message is heard while it scrolls in, and silent once the text is still', async ({
  page
}) => {
  test.fixme(true, 'fails on main: #852');
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await listen(page);
  await bootAt(page, BESIDE_LIMO);
  // A key the Control Profile ignores is the trusted gesture that starts audio.
  await page.keyboard.press('Shift');
  await expect(frame(page)).toHaveAttribute('data-damocles-audio', 'running');
  // Establish the silent baseline before starting the message being measured.
  await expect.poll(async () => (await heard(page)).length).toBeGreaterThan(2);
  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-damocles-message-tones', '1');
  // No Sound Cue: the refusal's only sound is its message's.
  await expect(frame(page)).toHaveAttribute('data-damocles-cues', '');
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-row',
    'VEHICLE KEY REQUIRED',
    { timeout: 5000 }
  );
  await page.waitForTimeout(1500);
  const samples = await heard(page);
  const found = samples.find(sample => sample.messageTones === 1);
  expect(found, 'a poll after the message began').toBeDefined();
  const shown = found!.elapsed;
  const before = levelsBetween(samples, 0, shown);
  expect(before.length).toBeGreaterThan(2);
  expect(Math.max(...before)).toBeLessThan(SILENT);
  // The record's 14 leading spaces are silent. Its `V`, character 14, sounds on VBL 11 of the
  // scroll-in and its last heard letter, the `E` of character 32, on VBL 25: 0.22 to 0.52 s in.
  // The margins keep the frame clock and the analyser's window out of the judgement.
  const tones = levelsBetween(samples, shown + 0.28, shown + 0.46);
  expect(tones.length).toBeGreaterThan(2);
  expect(Math.max(...tones)).toBeGreaterThan(AUDIBLE);
  const still = levelsBetween(samples, shown + 0.9, samples.at(-1)!.elapsed);
  expect(still.length).toBeGreaterThan(4);
  expect(Math.max(...still)).toBeLessThan(SILENT);
  expect(errors).toEqual([]);
});

test('muted, the same ride asks for every cue and nothing is heard', async ({
  page
}) => {
  test.fixme(true, 'fails on main: #852');
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await listen(page);
  await walkIntoTheLift(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'menu'
  );
  await expect(frame(page)).toHaveAttribute('data-damocles-audio', 'suspended');
  await page.locator('button[data-goto="settings"]').click();
  await page.locator('#audio-mute').click();
  await expect(page.locator('#audio-mute')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  const from = (await heard(page)).at(-1)!.elapsed;
  await rideToFloor1(page);
  const levels = levelsBetween(await heard(page), from, Infinity);
  expect(levels.length).toBeGreaterThan(20);
  expect(Math.max(...levels)).toBeLessThan(SILENT);
  expect(errors).toEqual([]);
});

test('a new game stops a door tone mid-way, and leaving the title closes audio', async ({
  page
}) => {
  test.fixme(true, 'fails on main: #852');
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await listen(page);
  await walkIntoTheLift(page);
  // The door starts shutting, and its tone runs until the door stops.
  await page.keyboard.press('1');
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-cues',
    'door-start:2 door-stop:1 thud:1'
  );
  await page.keyboard.press('Escape');
  await page.locator('#new-game').click();
  await page.locator('#new-game').click();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  // The new session's time starts again at 0, so the polls are cut by count, not by time.
  const before = (await heard(page)).length;
  await page.waitForTimeout(1500);
  const levels = (await heard(page)).slice(before + 5).map(item => item.level);
  expect(levels.length).toBeGreaterThan(4);
  expect(Math.max(...levels)).toBeLessThan(SILENT);

  await page.goto('/atlas.html');
  expect(
    await page.evaluate(() => sessionStorage.getItem('damoclesAudioClosed'))
  ).toBe('true');
  expect(errors).toEqual([]);
});

test('without browser audio the session walks and rides on in silence', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioContext', { value: undefined })
  );
  await bootAt(page, BEFORE_THE_DOOR, FACING_WEST, { structure: STATE_OFFICE });
  await page.keyboard.down('ArrowUp');
  await expect(frame(page)).toHaveAttribute('data-region', '4', {
    timeout: 20_000
  });
  await page.keyboard.up('ArrowUp');
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-audio',
    'unavailable'
  );
  await rideToFloor1(page);
  expect(errors).toEqual([]);
});
