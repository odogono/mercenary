import { describe, expect, test } from 'bun:test';

import { BensonMessageTranscript } from '../src/shell/messageTranscript.ts';

describe('Benson Messages in the Shell Console transcript', () => {
  test('prints one completed occurrence once', () => {
    const transcript = new BensonMessageTranscript();
    const occurrence = {};

    expect(
      transcript.observe({ occurrence, text: 'PLEASE IDENTIFY YOURSELF' })
    ).toEqual(['BENSON · PLEASE IDENTIFY YOURSELF']);
    expect(
      transcript.observe({ occurrence, text: 'PLEASE IDENTIFY YOURSELF' })
    ).toEqual([]);
  });

  test('prints equal text again when it belongs to another occurrence', () => {
    const transcript = new BensonMessageTranscript();

    expect(transcript.observe({ occurrence: {}, text: 'AFFIRMATIVE' })).toEqual(
      ['BENSON · AFFIRMATIVE']
    );
    expect(transcript.observe({ occurrence: {}, text: 'AFFIRMATIVE' })).toEqual(
      ['BENSON · AFFIRMATIVE']
    );
  });

  test('has nothing to print before a Benson Message is complete', () => {
    const transcript = new BensonMessageTranscript();

    expect(transcript.observe(undefined)).toEqual([]);
  });

  test('formats whole-session replacement separators', () => {
    expect(BensonMessageTranscript.newGame()).toEqual(['— NEW GAME —']);
    expect(BensonMessageTranscript.loaded(2)).toEqual(['— LOADED SLOT 2 —']);
  });
});
