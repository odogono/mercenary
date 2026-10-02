import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { record } from '../src/dion/read.ts';
import {
  TOURCRAFT_MANIFEST,
  loadTourcraftContent,
  tourcraftContentIdentity
} from '../src/dion/tourcraftContent.ts';
import { payloadResponse } from '../src/server/payload.ts';
import type { PayloadDocument } from '../src/shell/title.ts';

const root = resolve(import.meta.dir, '../..');
const documents = (): Map<string, PayloadDocument> => {
  const read = (path: string): PayloadDocument => {
    const text = readFileSync(resolve(root, `.${path}`), 'utf8');
    return { text, value: JSON.parse(text) };
  };
  const manifest = read(TOURCRAFT_MANIFEST);
  const paths = (
    manifest.value as { playableDocuments: { path: string }[] }
  ).playableDocuments.map(d => d.path);
  return new Map([TOURCRAFT_MANIFEST, ...paths].map(p => [p, read(p)]));
};
const load = (docs: Map<string, PayloadDocument>) =>
  loadTourcraftContent(async path => {
    if (path.includes('/catalogue/')) {
      throw new Error('runtime Catalogue read');
    }
    const doc = docs.get(path);
    if (!doc) {
      throw new Error(`${path}: not served`);
    }
    return doc;
  });
interface TestDocument {
  geometry: { record: string };
  kind: string;
  playableDocuments: { path: string; sha256: string }[];
  programSha256: string;
  schemaVersion: number;
  sources: Record<string, { ramSha256: string }>;
  title: string;
}
const replace = (
  docs: Map<string, PayloadDocument>,
  path: string,
  mutate: (v: TestDocument) => void
) => {
  const value = structuredClone(docs.get(path)!.value) as TestDocument;
  mutate(value);
  docs.set(path, { text: JSON.stringify(value), value });
};

describe('bounded TOURCRAFT content admission', () => {
  test('admits all dependencies without any Catalogue reads', async () => {
    const content = await load(documents());
    expect(content.geometry.size).toBe(80);
    expect(content.promotion.placements).toHaveLength(39);
    expect(content.promotion.surfaceCells).toHaveLength(512);
    expect(content.gameplay.initial.source).toBe('gameplay-opening');
    expect(content.system.bodies).toHaveLength(31);
    expect(content.contentSha256).toMatch(/^[\da-f]{64}$/);
    expect(content.legacy.world.cells).toHaveLength(15);
    expect(content.legacy.world.roads).toBeUndefined();
  });

  test('uses the documented path/length golden encoding', async () => {
    expect(
      await tourcraftContentIdentity([
        { path: 'a', text: 'bc' },
        { path: 'd', text: 'e' }
      ])
    ).toBe('adfbc36f7a52dbc748b6832a1c449671d1513fe055dbd799cd15a265f91b9565');
  });

  test('rejects changed served bytes before admitting geometry', async () => {
    const docs = documents();
    replace(docs, '/payload/dion/tourcraft/geometry/model-03005c.json', v => {
      v.geometry.record = '$3005E';
    });
    await expect(load(docs)).rejects.toThrow('model-03005c.json.sha256');
  });

  test('requires every dependency even if a later view never draws it', async () => {
    const docs = documents();
    docs.delete('/payload/dion/tourcraft/geometry/model-038282.json');
    await expect(load(docs)).rejects.toThrow('model-038282.json');
  });

  test.each([
    [
      'foreign Title',
      (v: TestDocument) => {
        v.title = 'damocles';
      },
      'title'
    ],
    [
      'foreign program',
      (v: TestDocument) => {
        v.programSha256 = '0'.repeat(64);
      },
      'programSha256'
    ],
    [
      'foreign kind',
      (v: TestDocument) => {
        v.kind = 'dion-catalogue';
      },
      'kind'
    ],
    [
      'unknown schema',
      (v: TestDocument) => {
        v.schemaVersion = 2;
      },
      'schemaVersion'
    ],
    [
      'foreign capture',
      (v: TestDocument) => {
        v.sources['gameplay-opening']!.ramSha256 = '0'.repeat(64);
      },
      'ramSha256'
    ],
    [
      'path traversal',
      (v: TestDocument) => {
        v.playableDocuments[0]!.path =
          '/payload/dion/tourcraft/../catalogue/catalogue.json';
      },
      'path'
    ],
    [
      'duplicate document',
      (v: TestDocument) => {
        v.playableDocuments.push(v.playableDocuments[0]!);
      },
      'duplicate'
    ],
    [
      'missing dependency listing',
      (v: TestDocument) => {
        v.playableDocuments.splice(8, 1);
      },
      'playableDocuments'
    ],
    [
      'wrong order',
      (v: TestDocument) => {
        [v.playableDocuments[0], v.playableDocuments[1]] = [
          v.playableDocuments[1]!,
          v.playableDocuments[0]!
        ];
      },
      'order'
    ]
  ])(
    'rejects %s with document/field diagnostics',
    async (_name, mutate, field) => {
      const docs = documents();
      replace(docs, TOURCRAFT_MANIFEST, mutate);
      await expect(load(docs)).rejects.toThrow(field);
    }
  );
});

test('exported control header and OBSERVER records retain R6 original field order', async () => {
  const content = await load(documents());
  const playback = content.programmes['playback'] as { header: unknown };
  expect(playback.header).toEqual({
    eyeY: 63,
    systemEye: [0x3_a9_80, 64, 0xb_18_a0],
    x: 0x09_e1_79_64,
    yaw: 0x1_fc,
    z: 0x04_2a_78_b2
  });
  const encounter = content.programmes['encounter'] as {
    trajectories: { records: unknown[] }[];
  };
  expect(encounter.trajectories[0]!.records[0]).toEqual({
    count: 14,
    shift: 4,
    x: 500,
    y: 4500,
    z: 500
  });
});

const repin = (
  docs: Map<string, PayloadDocument>,
  path: string,
  mutate: (v: Record<string, unknown>) => void
) => {
  const value = structuredClone(record(docs.get(path)!.value, 'test document'));
  mutate(value);
  const text = JSON.stringify(value);
  docs.set(path, { text, value });
  replace(docs, TOURCRAFT_MANIFEST, manifest => {
    manifest.playableDocuments.find(d => d.path === path)!.sha256 = createHash(
      'sha256'
    )
      .update(text)
      .digest('hex');
  });
};
test('selected served text changes the admitted identity, independent of transport parsed values', async () => {
  const docs = documents();
  const before = await load(docs);
  const path = '/payload/dion/tourcraft/presentation/system.json';
  const text = docs.get(path)!.text + '\n';
  docs.set(path, { text, value: { title: 'foreign transport cache' } });
  replace(docs, TOURCRAFT_MANIFEST, m => {
    m.playableDocuments.find(d => d.path === path)!.sha256 = createHash(
      'sha256'
    )
      .update(text)
      .digest('hex');
  });
  expect((await load(docs)).contentSha256).not.toBe(before.contentSha256);
});

test.each([
  [
    'wrong template binding',
    'gameplay',
    (v: Record<string, unknown>) => {
      record(v['modelBindings'], 'bindings')['309'] = 'model-03005c';
    },
    'modelBindings.309'
  ],
  [
    'invalid beacon gate',
    'gameplay',
    (v: Record<string, unknown>) => {
      record(record(v['initial'], 'initial')['beaconGates'], 'gates')['4'] =
        'false';
    },
    'beaconGates.4'
  ],
  [
    'missing required beacon binding',
    'gameplay',
    (v: Record<string, unknown>) => {
      delete record(v['modelBindings'], 'bindings')['165'];
    },
    'modelBindings.165'
  ],
  [
    'wrong required beacon binding',
    'gameplay',
    (v: Record<string, unknown>) => {
      record(v['modelBindings'], 'bindings')['165'] = 'model-03005c';
    },
    'modelBindings.165'
  ],
  [
    'missing tone register programme',
    'programmes',
    (v: Record<string, unknown>) => {
      delete record(v['collisionTone'], 'tone')['registers'];
    },
    'collisionTone.registers'
  ],
  [
    'missing encounter pairs',
    'programmes',
    (v: Record<string, unknown>) => {
      delete record(v['encounter'], 'encounter')['pairs'];
    },
    'encounter.pairs'
  ],
  [
    'bad opening',
    'gameplay',
    (v: Record<string, unknown>) => {
      record(record(v['initial'], 'initial')['opening'], 'opening')['cash'] =
        'oops';
    },
    'opening.cash'
  ],
  [
    'foreign nested source',
    'support',
    (v: Record<string, unknown>) => {
      v['source'] = 'other-capture';
    },
    'support.source'
  ],
  [
    'missing model binding',
    'gameplay',
    (v: Record<string, unknown>) => {
      delete record(v['modelBindings'], 'bindings')['320'];
    },
    'modelBindings.320'
  ],
  [
    'invalid body membership',
    'system',
    (v: Record<string, unknown>) => {
      record(record(v['drawLists'], 'lists')['tolosa'], 'tolosa')[
        'bodyIndices'
      ] = [99];
    },
    'bodyIndices'
  ],
  [
    'invalid face animation',
    'gameplay',
    (v: Record<string, unknown>) => {
      record(
        record(record(v['initial'], 'initial')['faceTokens'], 'tokens')['$A1'],
        'token'
      )['baseCursor'] = -1;
    },
    'faceTokens.$A1.baseCursor'
  ]
])(
  'rejects repinned %s before returning playable content',
  async (_name, kind, mutate, field) => {
    const docs = documents();
    repin(docs, `/payload/dion/tourcraft/presentation/${kind}.json`, mutate);
    await expect(load(docs)).rejects.toThrow(field);
  }
);

test('matching foreign geometry and selection sources cannot bypass capture admission', async () => {
  const docs = documents();
  repin(docs, '/payload/dion/tourcraft/promotion.json', v => {
    const selected = (v['geometry'] as Record<string, unknown>[]).find(
      g => g['id'] === 'model-03005c'
    )!;
    selected['source'] = 'foreign-capture';
  });
  repin(docs, '/payload/dion/tourcraft/geometry/model-03005c.json', v => {
    v['source'] = 'foreign-capture';
  });
  await expect(load(docs)).rejects.toThrow('source');
});

test.each([
  [
    'missing entries',
    (v: Record<string, unknown>) => {
      v['entries'] = {};
    },
    'entries'
  ],
  [
    'unknown instruction',
    (v: Record<string, unknown>) => {
      const routine = (v['scripts'] as Record<string, unknown>[])[0]!;
      (routine['instructions'] as Record<string, unknown>[])[0]!['name'] =
        'invalid-command';
    },
    'name'
  ],
  [
    'missing face sequences',
    (v: Record<string, unknown>) => {
      delete v['faceSequences'];
    },
    'faceSequences'
  ]
])('rejects repinned programme %s', async (_name, mutate, field) => {
  const docs = documents();
  repin(docs, '/payload/dion/tourcraft/presentation/programmes.json', mutate);
  await expect(load(docs)).rejects.toThrow(field);
});

test('the local payload server serves every admitted path and refuses escaping paths', async () => {
  for (const path of documents().keys()) {
    const response = await payloadResponse(path, resolve(root, 'payload'));
    expect(response!.status).toBe(200);
  }
  for (const path of [
    '/payload/dion/tourcraft/geometry/../world.json',
    '/payload/dion/tourcraft/presentation/unknown.json',
    '/payload/dion/tourcraft/geometry/model-03005c.json/extra'
  ]) {
    expect(
      (await payloadResponse(path, resolve(root, 'payload')))!.status
    ).toBe(404);
  }
});
