import { describe, expect, test } from 'bun:test';

import { TextTable } from '../src/text/index.ts';
import { BensonDisplay, BensonProgram } from './oracle/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const shifted = (text: string): string => text.padStart(BensonDisplay.width);

/// The silent wait the original's message interval gave, in seconds, at a
/// pace `scale` times its own.
const waitFor = (interval: number, scale = 1): number =>
  (Math.max(26, interval) - 25) / (50 * scale);

describe('the authentic Benson Display', () => {
  test('has exactly 23 persistent cells and shifts in from the right', () => {
    const display = new BensonDisplay(3);
    expect(display.displayText).toBe(' '.repeat(23));
    display.start('ABCDEFGHIJKLMNOPQRSTUVW', waitFor(125));
    expect(display.soundCharacter).toBeUndefined();
    display.advance(1 / 50);
    expect(display.soundCharacter).toBe('A');
    expect(display.displayText).toBe(shifted('A'));
    display.advance(22 / 50);
    expect(display.displayText).toBe('ABCDEFGHIJKLMNOPQRSTUVW');
    display.advance(2 / 50);
    expect(display.soundCharacter).toBeUndefined();
  });

  test('preserves cells when a later message starts', () => {
    const display = new BensonDisplay(0);
    display.start('FIRST', waitFor(26));
    display.advance(1 / 50);
    display.start('X', waitFor(26));
    expect(display.displayText).toBe(shifted('F'));
    display.advance(1 / 50);
    expect(display.displayText).toBe(shifted('FX'));
  });

  test.each([125, 150])(
    'shifts 25 times then waits through interval %i',
    interval => {
      const display = new BensonDisplay(0);
      display.start('ABCDEFGHIJKLMNOPQRSTUVWXYZ', waitFor(interval));
      display.advance(25 / 50);
      expect(display.displayText).toBe('CDEFGHIJKLMNOPQRSTUVWXY');
      display.advance((interval - 26) / 50);
      expect(display.displayText).toBe('CDEFGHIJKLMNOPQRSTUVWXY');
      display.advance(1 / 50);
      expect(display.displayText).toBe('DEFGHIJKLMNOPQRSTUVWXYZ');
    }
  );

  test('waits one shift for zero and short intervals', () => {
    for (const interval of [0, 10, 25]) {
      const display = new BensonDisplay(0);
      display.start('ABCDEFGHIJKLMNOPQRSTUVWXYZ', waitFor(interval));
      display.advance(25 / 50);
      expect(display.displayText.endsWith('Y')).toBeTrue();
      display.advance(1 / 50);
      expect(display.displayText.endsWith('Z')).toBeTrue();
    }
  });

  test('feeds trailing blanks to the end of the active burst', () => {
    const display = new BensonDisplay(0);
    display.start('ABC', waitFor(26));
    display.advance(25 / 50);
    expect(display.displayText).toBe('C' + ' '.repeat(22));
    expect(display.isFinished).toBeFalse();
    expect(display.isComplete).toBeTrue();
    display.advance(1 / 50);
    expect(display.readingText('ABC')).toBe('ABC' + ' '.repeat(20));
    expect(display.isFinished).toBeFalse();
  });

  test('scrolls a finished message off the left edge after its reading hold', () => {
    const display = new BensonDisplay(3);
    display.start('  HANGER', waitFor(125, 6));
    display.advance(25 / 50 + 100 / 300);
    expect(display.readingText('HANGER')).toBe('HANGER' + ' '.repeat(17));
    display.advance(3);
    expect(display.isFinished).toBeFalse();
    expect(display.readingText('HANGER')).toBe('HANGER' + ' '.repeat(17));
    display.advance(1 / 50);
    expect(display.readingText('HANGER')).toBe('ANGER' + ' '.repeat(18));
    display.advance(4 / 50);
    expect(display.readingText('HANGER')).toBe('R' + ' '.repeat(22));
    expect(display.isFinished).toBeFalse();
    display.advance(1 / 50);
    expect(display.readingText('HANGER')).toBe(' '.repeat(23));
    expect(display.isFinished).toBeTrue();
  });

  test('keeps the row still when told not to clear after the hold', () => {
    const display = new BensonDisplay(0, { clearsAfterHold: false });
    display.start('ABC', waitFor(26));
    display.advance(26 / 50);
    expect(display.isFinished).toBeTrue();
    expect(display.readingText('ABC')).toBe('ABC' + ' '.repeat(20));
    display.advance(10);
    expect(display.readingText('ABC')).toBe('ABC' + ' '.repeat(20));
  });

  test('keeps recovered padding in the cells', () => {
    const display = new BensonDisplay(0);
    display.start('      STATUS REPORT', waitFor(26));
    display.advance(25 / 50);
    expect(display.displayText).toBe('    STATUS REPORT      ');
    expect(display.isComplete).toBeTrue();
  });

  test('keeps every fitting payload message intact through its reading hold', async () => {
    const bundle = await loadPayload();
    const program = BensonProgram.fromDocument(bundle.benson!);
    const text = new TextTable(bundle.text!);

    for (const instruction of program.instructions) {
      if (instruction.op !== 'msg') {
        continue;
      }
      const spoken = text.compose(instruction.tokens);
      if ([...spoken].length > BensonDisplay.width) {
        continue;
      }
      const display = new BensonDisplay(0);
      display.start(text.composeForDisplay(instruction.tokens), waitFor(26));
      display.advance(BensonDisplay.burstShifts / 50);

      expect(display.readingText(spoken).trim(), spoken).toBe(spoken);
    }
  });

  test('shifts at its own rate whatever the wait', () => {
    const display = new BensonDisplay(0);
    display.start('ABCDEFGHIJKLMNOPQRSTUVWXYZ', waitFor(125, 6));
    display.advance(1 / 50);
    expect(display.displayText).toBe(shifted('A'));
    display.advance(24 / 50);
    expect(display.displayText.endsWith('Y')).toBeTrue();
    display.advance(99 / 300);
    expect(display.displayText.endsWith('Y')).toBeTrue();
    display.advance(1 / 300);
    expect(display.displayText.endsWith('Z')).toBeTrue();
  });

  test('holds a message for its reading hold', () => {
    const display = new BensonDisplay(3);
    display.start('A', waitFor(26, 5));
    display.advance(0.51);
    expect(display.isComplete).toBeTrue();
    expect(display.isFinished).toBeFalse();
    display.advance(2.98);
    expect(display.isFinished).toBeFalse();
    expect(display.captureSaveSnapshot().completionPhase).toBe('readingHold');
    display.advance(0.02);
    expect(display.captureSaveSnapshot().completionPhase).toBe('clearing');
    display.advance(1 / 50);
    expect(display.isFinished).toBeTrue();
  });

  test('skip reaches precisely the natural terminal cells and state', () => {
    const natural = new BensonDisplay(3);
    const skipped = new BensonDisplay(3);
    natural.start('A MESSAGE LONGER THAN ONE BURST', waitFor(125, 6));
    skipped.start('A MESSAGE LONGER THAN ONE BURST', waitFor(125, 6));
    natural.advance(100);
    skipped.finish();
    expect(natural.displayText).toBe(' '.repeat(23));
    expect(skipped.displayText).toBe(natural.displayText);
    expect(skipped.captureSaveSnapshot()).toEqual(
      natural.captureSaveSnapshot()
    );
    expect(skipped.isFinished).toBeTrue();
  });

  test('an empty message follows one blank-feed cycle', () => {
    const display = new BensonDisplay(0);
    display.start('', waitFor(26));
    display.advance(25 / 50);
    expect(display.displayText).toBe(' '.repeat(23));
    expect(display.isComplete).toBeTrue();
    expect(display.isFinished).toBeFalse();
    display.advance(1 / 50);
    expect(display.isFinished).toBeTrue();
  });

  test('a message longer than the row leaves without a jump', () => {
    const display = new BensonDisplay(0);
    display.start('A MESSAGE LONGER THAN ONE BURST', waitFor(26));
    display.advance(50 / 50);
    expect(display.displayText).toBe('URST' + ' '.repeat(19));
    expect(display.captureSaveSnapshot().completionPhase).toBe('blankFeed');
    display.advance(1 / 50);
    expect(display.displayText).toBe('URST' + ' '.repeat(19));
    expect(display.captureSaveSnapshot().completionPhase).toBe('clearing');
    expect(display.readingText('A MESSAGE LONGER THAN ONE BURST')).toBe(
      display.displayText
    );
    display.advance(1 / 50);
    expect(display.displayText).toBe('RST' + ' '.repeat(20));
    display.advance(3 / 50);
    expect(display.displayText).toBe(' '.repeat(23));
    expect(display.isFinished).toBeTrue();
  });

  test.each([
    ['mid-burst', 3.5 / 50],
    ['$E1 wait', 30 / 50],
    ['blank feed', 5 / 50],
    ['reading hold', 26 / 50 + 1],
    ['clearing', 26 / 50 + 3 + 1.5 / 50]
  ])('restores %s and continues exactly', (_phase, elapsed) => {
    const original = new BensonDisplay(3);
    original.start('ABC', waitFor(26));
    original.advance(elapsed);
    const restored = BensonDisplay.restore(original.captureSaveSnapshot(), 3);
    original.advance(10);
    restored.advance(10);
    expect(restored.captureSaveSnapshot()).toEqual(
      original.captureSaveSnapshot()
    );
  });

  test('restores idle persistent cells', () => {
    const original = new BensonDisplay(0);
    original.start('ABC', waitFor(26));
    original.finish();
    const restored = BensonDisplay.restore(original.captureSaveSnapshot(), 0);
    expect(restored.displayText).toBe(original.displayText);
    expect(restored.isFinished).toBeTrue();
  });

  test('refuses reading-hold progress that the configured hold cannot emit', () => {
    const active = new BensonDisplay(3);
    active.start('A', waitFor(26));
    active.advance(26 / 50 + 1);
    const snapshot = active.captureSaveSnapshot();

    expect(() =>
      BensonDisplay.restore({ ...snapshot, readingHoldProgress: 4 }, 3)
    ).toThrow('exceeds its configured hold');
    expect(() =>
      BensonDisplay.restore(
        {
          ...snapshot,
          completionPhase: 'idle',
          readingHoldProgress: 2
        },
        3
      )
    ).toThrow('incomplete reading-hold progress');
  });
});
