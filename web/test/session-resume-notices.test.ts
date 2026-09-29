import { describe, expect, test } from 'bun:test';

import type { BensonMessagePresentation } from '../src/benson/index.ts';
import {
  HEAD_COMMAND_KEYS_TEXT,
  createSessionResumeNotices
} from '../src/shell/resumeNotices.ts';

const message = (
  displayText: string,
  occurrence: object = {},
  complete = false,
  progress = 1
): BensonMessagePresentation => ({
  ...(complete ? { completedText: displayText } : {}),
  displayText,
  occurrence,
  reveal: { complete, progress }
});

describe('Session Resume notices on the Benson message line', () => {
  test('shows a resumed notice for at most two seconds', () => {
    let clock = 0;
    const notices = createSessionResumeNotices({ time: () => clock });

    notices.resumed();
    expect(notices.message()).toEqual({
      source: 'shell',
      text: 'SESSION RESUMED'
    });
    clock = 2000;
    expect(notices.message()).toEqual({ source: 'game', text: '' });
  });

  test('names the Head Command keys through the message that begins with them', () => {
    let clock = 0;
    const notices = createSessionResumeNotices({ time: () => clock });

    notices.headCommandKeys();
    expect(
      notices.message(message('PLEASE USE THE FOLLOWING KEYPAD KEYS'))
    ).toEqual({
      source: 'shell',
      text: HEAD_COMMAND_KEYS_TEXT
    });
    clock = 7999;
    expect(notices.message(message('NEXT MESSAGE')).source).toBe('shell');
    clock = 8000;
    expect(notices.message().source).toBe('game');
  });

  test('lets a Benson Message preempt a recovery notice immediately', () => {
    const notices = createSessionResumeNotices();
    notices.failed('quota full');

    expect(notices.message(message('BENSON SPEAKS'))).toEqual({
      source: 'game',
      text: 'BENSON SPEAKS'
    });
    expect(notices.message()).toEqual({ source: 'game', text: '' });
  });

  test('does not mistake the same Benson Message for a new occurrence', () => {
    const notices = createSessionResumeNotices();
    const current = {};
    notices.message(message('CURRENT MESSAGE', current, false, 4));
    notices.failed('quota full');

    expect(
      notices.message(message('CURRENT MESSAGE', current, false, 5)).source
    ).toBe('shell');
    expect(notices.message(message('NEXT MESSAGE')).source).toBe('game');
  });

  test('does not treat a completed restored occurrence as new', () => {
    const notices = createSessionResumeNotices();
    const restored = message('ALREADY SAID', {}, true, 12);
    notices.synchronize(restored);
    notices.resumed();

    expect(notices.message(restored).source).toBe('shell');
  });

  test('repeats a failed condition when the System Menu opens', () => {
    let clock = 0;
    const notices = createSessionResumeNotices({ time: () => clock });
    notices.failed('quota full');
    clock = 5000;
    expect(notices.message()).toEqual({ source: 'game', text: '' });

    notices.menuOpened();
    expect(notices.message()).toEqual({
      source: 'shell',
      text: 'SESSION RESUME UNAVAILABLE — QUOTA FULL'
    });
  });

  test('keeps an ownership notice while its page is paused', () => {
    let clock = 0;
    const notices = createSessionResumeNotices({ time: () => clock });
    notices.ownership('SESSION OPENED ELSEWHERE');
    clock = 60_000;

    const oldMessage = message('OLD BENSON TEXT');
    expect(notices.message(oldMessage)).toEqual({
      source: 'shell',
      text: 'SESSION OPENED ELSEWHERE'
    });
    notices.dismiss();
    expect(notices.message(oldMessage).source).toBe('game');
  });

  test('uses the exact unsupported-ownership wording', () => {
    const notices = createSessionResumeNotices();
    notices.ownershipUnavailable();

    expect(notices.message()).toEqual({
      source: 'shell',
      text: 'SESSION RESUME OWNERSHIP UNAVAILABLE'
    });
  });
});
