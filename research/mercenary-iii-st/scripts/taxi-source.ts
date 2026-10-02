import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Historical research source, never a runtime migration loader. Archive both
// code and served text: current implementations may retain schema 1 while
// changing code or content. Do not weaken this boundary to make an audit pass.
export const TAXI_SOURCE_REVISION = 'e4cba434069ca1fbec6e72b3a99cbf775f1663c4';
export const TAXI_SOURCE_PINS = {
  'web/src/dion/content.ts':
    '0f512cfd6dc0c270f2a30b374c28eb0696e055867a9f69c754d26994feb0298a',
  'web/src/dion/read.ts':
    '9bb47e2fb7b57cee1d4262bc5298f79cedc2db2b515a5da88798c22d1fbfe3fa',
  'web/src/dion/restore.ts':
    '0048baa6fade40f2fbd1de734a5f76a3562821907aea2dbc2bdee9c9ef146d28',
  'web/src/dion/resume.ts':
    'f8e1bbf84559c8b701d3b0e09119c6cac140f114719c38109053fbc8c7ad2854',
  'web/src/dion/save.ts':
    'd18489f0e36653a6a8b68d2fa7f0d8ecd32620c3d3a718ed5ee14df38a546832',
  'web/src/dion/script.ts':
    '2122c152ee372fb40db58f171e71b02f8f3452e9fc762ac470097fe5a0dc4f6b',
  'web/src/dion/session.ts':
    '311c69efcb87da7d10d66555e4dc922364d355402c755c94af30ede378206832',
  'web/test/dion-controls.ts':
    '6cfebc17d75094ce638fcc98dd5b61deab27ee8b5500d7aba8e19dce19ec9e92'
};

const loadSource = async (root: string) => {
  const { DionSession: SourceSession } = (await import(
    join(root, 'web/src/dion/session.ts')
  )) as typeof import('../../../web/src/dion/session.ts');
  const { dionContent } = (await import(
    join(root, 'web/test/dion-documents.ts')
  )) as typeof import('../../../web/test/dion-documents.ts');
  const { dionControlCaptures } = (await import(
    join(root, 'web/test/dion-controls.ts')
  )) as typeof import('../../../web/test/dion-controls.ts');
  const codec = (await import(
    join(root, 'web/src/dion/save.ts')
  )) as typeof import('../../../web/src/dion/save.ts');
  const resume = (await import(
    join(root, 'web/src/dion/resume.ts')
  )) as typeof import('../../../web/src/dion/resume.ts');
  const content = await dionContent();
  if (
    codec.dionRecordIdentity(content).contentSha256 !==
    'c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed'
  ) {
    throw new Error('Changed historical I2 content');
  }
  return { root, SourceSession, content, codec, resume, dionControlCaptures };
};

export const withTaxiSource = async <T>(
  run: (source: Awaited<ReturnType<typeof loadSource>>) => Promise<T>
): Promise<T> => {
  const root = mkdtempSync(join(tmpdir(), 'mercenary-taxi-source-'));
  try {
    const archive = spawnSync(
      'git',
      [
        'archive',
        TAXI_SOURCE_REVISION,
        'web/src',
        'web/test',
        'payload/dion',
        'web/dion'
      ],
      { cwd: join(import.meta.dir, '../../..'), maxBuffer: 64 * 1024 * 1024 }
    );
    if (archive.status !== 0) {
      throw new Error(`Historical I2 revision unavailable: ${archive.stderr}`);
    }
    const unpack = spawnSync('tar', ['-xf', '-', '-C', root], {
      input: archive.stdout
    });
    if (unpack.status !== 0) {
      throw new Error(`Cannot unpack historical I2: ${unpack.stderr}`);
    }
    for (const [path, expected] of Object.entries(TAXI_SOURCE_PINS)) {
      const actual = createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex');
      if (actual !== expected) {
        throw new Error(`Changed historical I2 source: ${path}`);
      }
    }
    return await run(await loadSource(root));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};
