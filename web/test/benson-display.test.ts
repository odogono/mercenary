import { describe, expect, test } from 'bun:test';

import { BensonDisplay } from '../src/benson/index.ts';

const shifted = (text: string): string => text.padStart(BensonDisplay.width);

describe('the authentic Benson Display', () => {
  test('has exactly 23 persistent cells and shifts in from the right', () => {
    const display = new BensonDisplay(50, 1, 3);
    expect(display.displayText).toBe(' '.repeat(23));
    display.start('ABCDEFGHIJKLMNOPQRSTUVW', 125);
    display.advance(1 / 50);
    expect(display.displayText).toBe(shifted('A'));
    display.advance(22 / 50);
    expect(display.displayText).toBe('ABCDEFGHIJKLMNOPQRSTUVW');
  });

  test('preserves cells when a later message starts', () => {
    const display = new BensonDisplay(50, 1, 0);
    display.start('FIRST', 26);
    display.advance(1 / 50);
    display.start('X', 26);
    expect(display.displayText).toBe(shifted('F'));
    display.advance(1 / 50);
    expect(display.displayText).toBe(shifted('FX'));
  });

  test.each([125, 150])(
    'shifts 25 frames then waits through interval %i',
    interval => {
      const display = new BensonDisplay(50, 1, 0);
      display.start('ABCDEFGHIJKLMNOPQRSTUVWXYZ', interval);
      display.advance(25 / 50);
      expect(display.displayText).toBe('CDEFGHIJKLMNOPQRSTUVWXY');
      display.advance((interval - 26) / 50);
      expect(display.displayText).toBe('CDEFGHIJKLMNOPQRSTUVWXY');
      display.advance(1 / 50);
      expect(display.displayText).toBe('DEFGHIJKLMNOPQRSTUVWXYZ');
    }
  );

  test('uses a 26-frame cycle for zero and short intervals', () => {
    for (const interval of [0, 10, 25]) {
      const display = new BensonDisplay(50, 1, 0);
      display.start('ABCDEFGHIJKLMNOPQRSTUVWXYZ', interval);
      display.advance(25 / 50);
      expect(display.displayText.endsWith('Y')).toBeTrue();
      display.advance(1 / 50);
      expect(display.displayText.endsWith('Z')).toBeTrue();
    }
  });

  test('feeds trailing blanks to the end of the active burst', () => {
    const display = new BensonDisplay(50, 1, 0);
    display.start('ABC', 26);
    display.advance(25 / 50);
    expect(display.displayText).toBe('C' + ' '.repeat(22));
    expect(display.isFinished).toBeFalse();
    display.advance(1 / 50);
    expect(display.isFinished).toBeTrue();
    expect(display.completedText).toBe('ABC');
  });

  test('scales recovered frames but never the reading hold', () => {
    const display = new BensonDisplay(50, 5, 3);
    display.start('A', 26);
    display.advance(26 / 250);
    expect(display.completedText).toBe('A');
    expect(display.isFinished).toBeFalse();
    display.advance(2.99);
    expect(display.isFinished).toBeFalse();
    display.advance(0.01);
    expect(display.isFinished).toBeTrue();
  });

  test('skip reaches precisely the natural terminal cells and state', () => {
    const natural = new BensonDisplay(50, 6, 3);
    const skipped = new BensonDisplay(50, 6, 3);
    natural.start('A MESSAGE LONGER THAN ONE BURST', 125);
    skipped.start('A MESSAGE LONGER THAN ONE BURST', 125);
    natural.advance(100);
    skipped.finish();
    expect(skipped.displayText).toBe(natural.displayText);
    expect(skipped.completedText).toBe(natural.completedText);
    expect(skipped.isFinished).toBeTrue();
  });

  test('an empty message follows one blank-feed cycle', () => {
    const display = new BensonDisplay(50, 1, 0);
    display.start('', 26);
    display.advance(25 / 50);
    expect(display.displayText).toBe(' '.repeat(23));
    expect(display.completedText).toBe('');
    expect(display.isFinished).toBeFalse();
    display.advance(1 / 50);
    expect(display.isFinished).toBeTrue();
  });

  test.each([
    ['mid-burst', 3.5 / 50],
    ['$E1 wait', 30 / 50],
    ['blank feed', 5 / 50],
    ['reading hold', 26 / 50 + 1]
  ])('restores %s and continues exactly', (_phase, elapsed) => {
    const original = new BensonDisplay(50, 1, 3);
    original.start('ABC', 26);
    original.advance(elapsed);
    const restored = BensonDisplay.restore(
      original.captureSaveSnapshot(),
      50,
      1,
      3
    );
    original.advance(10);
    restored.advance(10);
    expect(restored.captureSaveSnapshot()).toEqual(
      original.captureSaveSnapshot()
    );
  });

  test('restores idle persistent cells', () => {
    const original = new BensonDisplay(50, 1, 0);
    original.start('ABC', 26);
    original.finish();
    const restored = BensonDisplay.restore(
      original.captureSaveSnapshot(),
      50,
      1,
      0
    );
    expect(restored.displayText).toBe(original.displayText);
    expect(restored.isFinished).toBeTrue();
  });
});
