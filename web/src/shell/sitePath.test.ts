import { describe, expect, test } from 'bun:test';

import { SITE_BASE, appPathname, sitePath } from './sitePath.ts';

describe('sitePath off HTTP', () => {
  test('the base is the root, so app paths are unchanged', () => {
    expect(SITE_BASE).toBe('/');
    expect(sitePath('/payload/sound.json')).toBe('/payload/sound.json');
    expect(sitePath('/src/sound/worklet.ts')).toBe('/src/sound/worklet.ts');
  });

  test('refuses a relative path', () => {
    expect(() => sitePath('payload/sound.json')).toThrow('root-relative');
  });
});

describe('appPathname', () => {
  test("drops a static host's trailing slash and index.html", () => {
    expect(appPathname('/targ/')).toBe('/targ');
    expect(appPathname('/damocles/atlas/index.html')).toBe('/damocles/atlas');
    expect(appPathname('/')).toBe('/');
    expect(appPathname('/index.html')).toBe('/');
  });
});
