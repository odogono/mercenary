import { describe, expect, test } from 'bun:test';

import { createSessionResumeNotices } from '../src/shell/resumeNotices.ts';

describe('Session Resume notices on the Benson message line', () => {
  test('shows a resumed notice for at most two seconds', () => {
    let clock = 0;
    const notices = createSessionResumeNotices({ time: () => clock });

    notices.resumed();
    expect(notices.message('')).toEqual({
      source: 'shell',
      text: 'SESSION RESUMED'
    });
    clock = 2000;
    expect(notices.message('')).toEqual({ source: 'game', text: '' });
  });

  test('lets a Benson Message preempt a recovery notice immediately', () => {
    const notices = createSessionResumeNotices();
    notices.failed('quota full');

    expect(notices.message('BENSON SPEAKS')).toEqual({
      source: 'game',
      text: 'BENSON SPEAKS'
    });
    expect(notices.message('')).toEqual({ source: 'game', text: '' });
  });

  test('does not mistake the same Benson Message for a new occurrence', () => {
    const notices = createSessionResumeNotices();
    const current = {};
    notices.message('CURRENT MESSAGE', current);
    notices.failed('quota full');

    expect(notices.message('CURRENT MESSAGE', current).source).toBe('shell');
    expect(notices.message('NEXT MESSAGE', {}).source).toBe('game');
  });

  test('repeats a failed condition when the System Menu opens', () => {
    let clock = 0;
    const notices = createSessionResumeNotices({ time: () => clock });
    notices.failed('quota full');
    clock = 5000;
    expect(notices.message('')).toEqual({ source: 'game', text: '' });

    notices.menuOpened();
    expect(notices.message('')).toEqual({
      source: 'shell',
      text: 'SESSION RESUME UNAVAILABLE — QUOTA FULL'
    });
  });

  test('keeps an ownership notice while its page is paused', () => {
    let clock = 0;
    const notices = createSessionResumeNotices({ time: () => clock });
    notices.ownership('SESSION OPENED ELSEWHERE');
    clock = 60_000;

    expect(notices.message('OLD BENSON TEXT')).toEqual({
      source: 'shell',
      text: 'SESSION OPENED ELSEWHERE'
    });
    notices.dismiss();
    expect(notices.message('OLD BENSON TEXT').source).toBe('game');
  });

  test('uses the exact unsupported-ownership wording', () => {
    const notices = createSessionResumeNotices();
    notices.ownershipUnavailable();

    expect(notices.message('')).toEqual({
      source: 'shell',
      text: 'SESSION RESUME OWNERSHIP UNAVAILABLE'
    });
  });
});
