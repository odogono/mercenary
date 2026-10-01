import { expect, test } from 'bun:test';

import {
  DION_PRESENTATION_KEY,
  readDionPresentation,
  writeDionPresentation
} from '../src/dion/presentationPreference.ts';

test('Dion defaults to Authentic independently of the global preset, invalid or unreadable storage', () => {
  expect(readDionPresentation(undefined)).toBe('authentic');
  expect(
    readDionPresentation({
      getItem: key =>
        key === 'mercenary.browser-shell.preferences.v1'
          ? '{"presentationPreset":"enhanced"}'
          : null
    })
  ).toBe('authentic');
  for (const value of ['bad json', 'null', '"other"', '{}']) {
    expect(readDionPresentation({ getItem: () => value })).toBe('authentic');
  }
  expect(
    readDionPresentation({
      getItem: () => {
        throw new Error('blocked');
      }
    })
  ).toBe('authentic');
});
test('Dion writes only its own preset and tolerates a storage failure', () => {
  const values = new Map<string, string>([
    ['mercenary.browser-shell.preferences.v1', 'sentinel']
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
  writeDionPresentation(storage, 'enhanced');
  expect(readDionPresentation(storage)).toBe('enhanced');
  expect(values.get('mercenary.browser-shell.preferences.v1')).toBe('sentinel');
  expect(values.get(DION_PRESENTATION_KEY)).toBe('"enhanced"');
  expect(() =>
    writeDionPresentation(
      {
        setItem: () => {
          throw new Error('quota');
        }
      },
      'authentic'
    )
  ).not.toThrow();
});
