import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  documentResponse,
  unsupportedMethodResponse
} from '../src/server/document.ts';

describe('the localhost document route', () => {
  test('serves canonical documents and bodyless HEAD responses', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercenary-documents-'));
    try {
      await writeFile(join(root, 'flyover.html'), 'flyover');
      const get = await documentResponse(
        new Request('http://localhost/targ/debug'),
        root
      );
      const head = await documentResponse(
        new Request('http://localhost/damocles/debug', { method: 'HEAD' }),
        root
      );
      expect(await get?.text()).toBe('flyover');
      expect(get?.headers.get('content-type')).toContain('text/html');
      expect(await head?.text()).toBe('');
      expect(head?.status).toBe(200);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('preserves alias queries and drops unknown-document queries', async () => {
    const alias = await documentResponse(
      new Request('http://localhost/debug/?body=targ'),
      '/unused'
    );
    const unknown = await documentResponse(
      new Request('http://localhost/future?body=targ'),
      '/unused'
    );
    expect(alias?.status).toBe(308);
    expect(alias?.headers.get('location')).toBe(
      'http://localhost/targ/debug?body=targ'
    );
    expect(unknown?.status).toBe(302);
    expect(unknown?.headers.get('location')).toBe('http://localhost/');
  });

  test('leaves resources unresolved and rejects unsupported methods globally', async () => {
    expect(
      await documentResponse(
        new Request('http://localhost/src/missing.ts'),
        '/unused'
      )
    ).toBeUndefined();
    const rejected = unsupportedMethodResponse('POST');
    expect(rejected?.status).toBe(405);
    expect(rejected?.headers.get('allow')).toBe('GET, HEAD');
    expect(unsupportedMethodResponse('GET')).toBeUndefined();
  });
});
