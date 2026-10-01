import { describe, expect, test } from 'bun:test';

import { titleStorageKeys } from '../src/shell/title.ts';
import {
  SHARED_TYPEFACE_STORAGE_KEY,
  applyTypeface,
  loadTypography,
  readTypefacePreference,
  validateTypography
} from '../src/shell/typography.ts';

const digest = async (content: Uint8Array): Promise<string> => {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    content.buffer as ArrayBuffer
  );
  return [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const fixture = async () => {
  const mercenary = new TextEncoder().encode('mercenary font');
  const damocles = new TextEncoder().encode('damocles font');
  return {
    bytes: { damocles, mercenary },
    document: {
      defaultFace: 'mercenary',
      faces: {
        damocles: {
          family: 'Damocles Interface',
          id: 'damocles',
          path: 'fonts/damocles.woff2',
          sha256: await digest(damocles),
          sourceGlyphCount: 24,
          synthesizedGlyphCount: 75
        },
        mercenary: {
          family: 'Mercenary Pixel',
          id: 'mercenary',
          path: 'fonts/mercenary.woff2',
          sha256: await digest(mercenary),
          sourceGlyphCount: 75,
          synthesizedGlyphCount: 24
        }
      },
      schemaVersion: 1
    }
  } as const;
};

describe('the Browser Shell typography contract', () => {
  test('accepts only schema version 1 and the two fixed face paths', async () => {
    const { document } = await fixture();
    expect(validateTypography(document)).toEqual(document);
    expect(() => validateTypography({ ...document, schemaVersion: 2 })).toThrow(
      'schemaVersion'
    );
    expect(() =>
      validateTypography({
        ...document,
        faces: {
          ...document.faces,
          damocles: {
            ...document.faces.damocles,
            path: '../damocles.woff2'
          }
        }
      })
    ).toThrow('fonts/damocles.woff2');
    expect(() =>
      validateTypography({
        ...document,
        faces: {
          ...document.faces,
          damocles: {
            ...document.faces.damocles,
            synthesizedGlyphCount: 74
          }
        }
      })
    ).toThrow('glyph counts');
  });

  test('hashes, loads, and registers both required faces', async () => {
    const { bytes, document } = await fixture();
    const requested: string[] = [];
    const registered: string[] = [];
    const loaded = await loadTypography({
      addFont: face => registered.push(face.family),
      createFont: (family, source) => ({
        family,
        load: async () => ({ family, source })
      }),
      fetch: async input => {
        const pathname = new URL(String(input)).pathname;
        requested.push(pathname);
        if (pathname === '/payload/typography.json') {
          return new Response(JSON.stringify(document));
        }
        const id = pathname.includes('mercenary') ? 'mercenary' : 'damocles';
        return new Response(bytes[id]);
      },
      rootUrl: new URL('http://localhost/')
    });

    expect(loaded.defaultFace).toBe('mercenary');
    expect(requested).toEqual([
      '/payload/typography.json',
      '/payload/fonts/mercenary.woff2',
      '/payload/fonts/damocles.woff2'
    ]);
    expect(registered).toEqual(['Mercenary Pixel', 'Damocles Interface']);
  });

  test('rejects a corrupt required font before registration', async () => {
    const { document } = await fixture();
    let registrations = 0;
    await expect(
      loadTypography({
        addFont: () => (registrations += 1),
        createFont: family => ({
          family,
          load: async () => ({ family })
        }),
        fetch: async input =>
          String(input).endsWith('typography.json')
            ? new Response(JSON.stringify(document))
            : new Response('corrupt'),
        rootUrl: new URL('http://localhost/')
      })
    ).rejects.toThrow('sha256');
    expect(registrations).toBe(0);
  });
});

const KEY = titleStorageKeys('damocles').typeface;

describe('the persisted typeface choice', () => {
  test('defaults for missing, invalid, or inaccessible storage', () => {
    expect(readTypefacePreference(undefined, KEY)).toBe('mercenary');
    expect(readTypefacePreference({ getItem: () => 'invalid' }, KEY)).toBe(
      'mercenary'
    );
    expect(
      readTypefacePreference(
        {
          getItem: () => {
            throw new Error('blocked');
          }
        },
        KEY
      )
    ).toBe('mercenary');
  });

  test('reads the shared choice until the Title writes its own', () => {
    const entries = new Map([[SHARED_TYPEFACE_STORAGE_KEY, 'damocles']]);
    const storage = { getItem: (key: string) => entries.get(key) ?? null };
    expect(readTypefacePreference(storage, KEY)).toBe('damocles');
    entries.set(KEY, 'mercenary');
    expect(readTypefacePreference(storage, KEY)).toBe('mercenary');
  });

  test("applies and persists the selected face under the Title's key", () => {
    const writes: [string, string][] = [];
    const root = { dataset: {} } as unknown as HTMLElement;
    applyTypeface(root, 'damocles', {
      key: KEY,
      storage: { setItem: (key, value) => writes.push([key, value]) }
    });
    expect(root.dataset['fontFace']).toBe('damocles');
    expect(writes).toEqual([[KEY, 'damocles']]);

    expect(() =>
      applyTypeface(root, 'mercenary', {
        key: KEY,
        storage: {
          setItem: () => {
            throw new Error('blocked');
          }
        }
      })
    ).not.toThrow();
    expect(root.dataset['fontFace']).toBe('mercenary');
  });
});
