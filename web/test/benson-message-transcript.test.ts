import { describe, expect, test } from 'bun:test';

import type { BensonMessagePresentation } from '../src/benson/index.ts';
import { BensonMessageTranscript } from '../src/shell/messageTranscript.ts';

const message = (
  text: string,
  occurrence: object = {},
  complete = true
): BensonMessagePresentation => ({
  ...(complete ? { completedText: text } : {}),
  displayText: complete ? text : text.slice(0, 1),
  occurrence,
  reveal: { complete, progress: complete ? text.length : 1 }
});

describe('Benson Messages in the Shell Console transcript', () => {
  test('prints one completed occurrence once', () => {
    const transcript = new BensonMessageTranscript();
    const occurrence = message('PLEASE IDENTIFY YOURSELF');

    expect(transcript.observe(occurrence)).toEqual([
      'BENSON · PLEASE IDENTIFY YOURSELF'
    ]);
    expect(transcript.observe(occurrence)).toEqual([]);
  });

  test('prints equal text again when it belongs to another occurrence', () => {
    const transcript = new BensonMessageTranscript();

    expect(transcript.observe(message('AFFIRMATIVE'))).toEqual([
      'BENSON · AFFIRMATIVE'
    ]);
    expect(transcript.observe(message('AFFIRMATIVE'))).toEqual([
      'BENSON · AFFIRMATIVE'
    ]);
  });

  test('has nothing to print before a Benson Message is complete', () => {
    const transcript = new BensonMessageTranscript();

    expect(transcript.observe(undefined)).toEqual([]);
  });

  test('does not backfill an occurrence completed before reload', () => {
    const restored = message('ALREADY SAID');
    const transcript = new BensonMessageTranscript(restored);

    expect(transcript.observe(restored)).toEqual([]);
    expect(transcript.observe(message('SAID AFTER RELOAD'))).toEqual([
      'BENSON · SAID AFTER RELOAD'
    ]);
  });

  test('logs a restored partial occurrence when it later completes', () => {
    const occurrence = {};
    const transcript = new BensonMessageTranscript(
      message('FINISHED HERE', occurrence, false)
    );

    expect(
      transcript.observe(message('FINISHED HERE', occurrence, false))
    ).toEqual([]);
    expect(transcript.observe(message('FINISHED HERE', occurrence))).toEqual([
      'BENSON · FINISHED HERE'
    ]);
  });

  test('formats whole-session replacement separators', () => {
    expect(BensonMessageTranscript.newGame()).toEqual(['— NEW GAME —']);
    expect(BensonMessageTranscript.loaded(2)).toEqual(['— LOADED SLOT 2 —']);
  });
});
