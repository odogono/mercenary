import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { payloadResponse } from '../src/server/payload.ts';

describe('the localhost Data Payload route', () => {
  test('serves independently named hyphenated JSON documents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercenary-payload-route-'));
    try {
      await writeFile(join(root, 'object-effects.json'), '{}');
      const response = await payloadResponse(
        '/payload/object-effects.json',
        root
      );
      expect(response?.status).toBe(200);
      expect(response?.headers.get('content-type')).toBe('application/json');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('serves exactly the two font paths as WOFF2', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercenary-font-route-'));
    try {
      await mkdir(join(root, 'fonts'));
      await writeFile(join(root, 'fonts/mercenary.woff2'), 'font');
      await writeFile(join(root, 'fonts/damocles.woff2'), 'font');

      for (const path of [
        '/payload/fonts/mercenary.woff2',
        '/payload/fonts/damocles.woff2'
      ]) {
        const response = await payloadResponse(path, root);
        expect(response?.status).toBe(200);
        expect(response?.headers.get('content-type')).toBe('font/woff2');
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('rejects unknown font names and traversal-shaped paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercenary-font-route-'));
    try {
      for (const path of [
        '/payload/fonts/other.woff2',
        '/payload/fonts/%2e%2e/manifest.json',
        '/payload/fonts/damocles.woff2/extra'
      ]) {
        expect((await payloadResponse(path, root))?.status).toBe(404);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('serves two safe nested JSON segments and no deeper', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercenary-payload-route-'));
    try {
      await mkdir(join(root, 'damocles/models'), { recursive: true });
      await writeFile(join(root, 'damocles/system.json'), '{}');
      await writeFile(join(root, 'damocles/models/object-041b1e.json'), '{}');
      for (const path of [
        '/payload/damocles/system.json',
        '/payload/damocles/models/object-041b1e.json'
      ]) {
        expect((await payloadResponse(path, root))?.status).toBe(200);
      }
      for (const path of [
        '/payload/damocles/models/nested/object-041b1e.json',
        '/payload/damocles/models/object_041b1e.json',
        '/payload/damocles/models/Object-041b1e.json',
        '/payload/damocles/models/-041b1e.json',
        '/payload/damocles/models/..json',
        '/payload/damocles/%2e%2e/system.json',
        '/payload/Damocles/system.json'
      ]) {
        expect((await payloadResponse(path, root))?.status).toBe(404);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('gzips JSON for a client that accepts it, byte-for-byte', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercenary-payload-route-'));
    try {
      const body = JSON.stringify({ indented: [1, 2, 3] }, null, 2) + '\n';
      await writeFile(join(root, 'object-effects.json'), body);

      const zipped = await payloadResponse(
        '/payload/object-effects.json',
        root,
        'gzip, deflate, br'
      );
      expect(zipped?.status).toBe(200);
      expect(zipped?.headers.get('content-encoding')).toBe('gzip');
      expect(zipped?.headers.get('content-type')).toBe('application/json');
      expect(zipped?.headers.get('vary')).toBe('accept-encoding');
      const bytes = new Uint8Array(await zipped!.arrayBuffer());
      expect(new TextDecoder().decode(Bun.gunzipSync(bytes))).toBe(body);

      for (const refusal of [null, '', 'br', 'identity', 'gzip;q=0']) {
        const plain = await payloadResponse(
          '/payload/object-effects.json',
          root,
          refusal
        );
        expect(plain?.headers.get('content-encoding')).toBeNull();
        expect(await plain?.text()).toBe(body);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
