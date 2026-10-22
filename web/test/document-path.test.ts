import { describe, expect, test } from 'bun:test';

import {
  assertBrowserDocument,
  resolveDocumentPath
} from '../src/shell/documentPath.ts';

describe('the Browser Shell document path', () => {
  test('recognises every canonical document', () => {
    expect(resolveDocumentPath('/')).toEqual({
      document: 'gameplay',
      kind: 'document'
    });
    expect(resolveDocumentPath('/catalogue')).toEqual({
      document: 'catalogue',
      kind: 'document'
    });
    expect(resolveDocumentPath('/targ')).toEqual({
      document: 'gameplay',
      kind: 'document'
    });
    expect(resolveDocumentPath('/damocles')).toEqual({
      document: 'damocles',
      kind: 'document'
    });
    expect(resolveDocumentPath('/dion')).toEqual({
      document: 'dion',
      kind: 'document'
    });
    expect(resolveDocumentPath('/sounds')).toEqual({
      document: 'sounds',
      kind: 'document'
    });
    expect(resolveDocumentPath('/damocles/atlas')).toEqual({
      document: 'atlas',
      kind: 'document'
    });
    expect(resolveDocumentPath('/targ/assets')).toEqual({
      document: 'targ-assets',
      kind: 'document'
    });
    expect(resolveDocumentPath('/targ/debug')).toEqual({
      document: 'flyover',
      kind: 'document',
      systemId: 'targ'
    });
    expect(resolveDocumentPath('/damocles/debug')).toEqual({
      document: 'flyover',
      kind: 'document',
      systemId: 'gamma'
    });
  });

  test('canonicalises known aliases in one hop', () => {
    for (const [path, pathname] of [
      ['/index.html', '/'],
      ['/targ/', '/targ'],
      ['/targ/assets/', '/targ/assets'],
      ['/targ-assets.html', '/targ/assets'],
      ['/damocles/', '/damocles'],
      ['/dion/', '/dion'],
      ['/catalogue.html', '/catalogue'],
      ['/catalogue/', '/catalogue'],
      ['/sounds.html', '/sounds'],
      ['/sounds/', '/sounds'],
      ['/atlas.html', '/damocles/atlas'],
      ['/damocles/atlas/', '/damocles/atlas'],
      ['/debug', '/targ/debug'],
      ['/debug/', '/targ/debug'],
      ['/targ/debug/', '/targ/debug'],
      ['/damocles/debug/', '/damocles/debug']
    ] as const) {
      expect(resolveDocumentPath(path)).toEqual({
        kind: 'redirect',
        pathname,
        status: 308
      });
    }
  });

  test('falls unknown documents back temporarily', () => {
    for (const path of ['/second-city', '/unknown/', '/missing.html']) {
      expect(resolveDocumentPath(path)).toEqual({
        kind: 'redirect',
        pathname: '/',
        status: 302
      });
    }
  });

  test('leaves missing resources to their own handlers', () => {
    for (const path of [
      '/favicon.ico',
      '/src/missing.ts',
      '/payload/missing.json',
      '/flyover/missing.json',
      '/e2e/missing.html',
      '/test/missing.html'
    ]) {
      expect(resolveDocumentPath(path)).toEqual({ kind: 'resource' });
    }
  });

  test('does not recognise case or encoding lookalikes as aliases', () => {
    for (const path of ['/TARG/debug', '/targ/%64ebug']) {
      expect(resolveDocumentPath(path)).toEqual({
        kind: 'redirect',
        pathname: '/',
        status: 302
      });
    }
  });

  test('lets each browser boot assert its own document kind', () => {
    expect(assertBrowserDocument('/', 'gameplay').document).toBe('gameplay');
    expect(assertBrowserDocument('/catalogue', 'catalogue').document).toBe(
      'catalogue'
    );
    expect(assertBrowserDocument('/damocles', 'damocles').document).toBe(
      'damocles'
    );
    expect(assertBrowserDocument('/damocles/atlas', 'atlas').document).toBe(
      'atlas'
    );
    expect(assertBrowserDocument('/damocles/debug', 'flyover')).toMatchObject({
      document: 'flyover',
      systemId: 'gamma'
    });
    expect(() => assertBrowserDocument('/', 'flyover')).toThrow(
      '/ is not the flyover document'
    );
  });
});
