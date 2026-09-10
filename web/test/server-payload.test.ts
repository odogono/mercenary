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

  test('serves one safe nested JSON segment and no deeper', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mercenary-payload-route-'));
    try {
      await mkdir(join(root, 'damocles'));
      await writeFile(join(root, 'damocles/system.json'), '{}');
      expect(
        (await payloadResponse('/payload/damocles/system.json', root))?.status
      ).toBe(200);
      for (const path of [
        '/payload/damocles/nested/system.json',
        '/payload/damocles/%2e%2e/system.json',
        '/payload/Damocles/system.json'
      ]) {
        expect((await payloadResponse(path, root))?.status).toBe(404);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
