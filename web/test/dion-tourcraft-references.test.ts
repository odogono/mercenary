import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  scriptAddress,
  scriptReference
} from '../src/dion/tourcraftRestore.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

test('binds opening, shared return and timed continuations to admitted instruction boundaries', () => {
  for (const address of [
    0x6_ff_57, 0x7_66_d5, 0x7_5a_16, 0x7_5b_24, 0x7_5b_5c
  ]) {
    const reference = scriptReference(content, address);
    expect(reference).toMatchObject({ content: 'dion-scripts' });
    expect(scriptAddress(content, reference)).toBe(address);
    expect(() => scriptReference(content, address + 1)).toThrow();
  }
  expect(() =>
    scriptAddress(content, { content: 'damocles-scripts', next: 0 })
  ).toThrow();
  expect(() =>
    scriptAddress(content, { content: 'dion-scripts', next: 99_999 })
  ).toThrow();
  expect(() =>
    scriptAddress(content, {
      address: 0x6_ff_57,
      content: 'dion-scripts',
      next: 0
    })
  ).toThrow();
});
