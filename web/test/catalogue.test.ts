import { describe, expect, it } from 'bun:test';

import { parseCatalogue, selectModels } from '../src/catalogue/data.ts';
import { triangulate } from '../src/catalogue/geometry.ts';

const fixture = () => ({
  bodies: [{ id: 'body-1', name: 'Test body' }],
  coverage: { complete: false, notes: ['Synthetic fixture'] },
  instances: [
    {
      association: null as null | {
        body: string;
        cell: number;
        insertionGroupSelector: number;
        insertions: { insertionKey: number; regionSelector: number }[];
        levelSelector: number;
        structureGroupSelector: number;
      },
      id: 'instance-1',
      location: null,
      model: 'object-1',
      name: 'Test instance',
      placement: null as null | {
        coordinateSystem: string;
        heading: number | null;
        parent: string;
        position: [number, number, number];
      },
      reason: 'Unknown location',
      sourceAddress: 2
    }
  ],
  models: [
    {
      evidence: [],
      id: 'object-1',
      kind: 'object',
      linkedInstances: [] as string[],
      name: 'Test shape',
      nameStatus: 'unknown',
      reason: 'Not decoded',
      relatedModels: [],
      slots: [0],
      sourceAddress: 1,
      status: 'unresolved',
      variants: []
    }
  ],
  places: [],
  schemaVersion: 8,
  source: {
    authority: 'Synthetic test',
    evidence: 'test',
    programSha256: 'b'.repeat(64),
    ramSha256: 'a'.repeat(64),
    run: 'test'
  },
  tables: [
    {
      address: 0,
      entries: ['object-1'],
      entryCount: 1,
      extentEvidence: 'Synthetic',
      kind: 'object'
    }
  ]
});

describe('Damocles catalogue contract', () => {
  it('preserves unidentified models and unknown locations', () => {
    const data = parseCatalogue(fixture());
    expect(data.instances[0]!.location).toBeNull();
    expect(selectModels(data, 'shape', 'object', 'unresolved')).toHaveLength(1);
    expect(selectModels(data, 'missing', '', '')).toHaveLength(0);
  });
  it('accepts a decoded intentional empty but still rejects empty geometry', () => {
    const intentional = fixture();
    const intentionalModel = intentional.models[0] as Record<string, unknown>;
    intentionalModel['recordClass'] = 'empty';
    intentionalModel['status'] = 'decoded';
    intentionalModel['reason'] = 'Source record intentionally has no geometry.';
    expect(parseCatalogue(intentional).models[0]!.recordClass).toBe('empty');

    const broken = fixture();
    broken.models[0]!.status = 'decoded';
    expect(() => parseCatalogue(broken)).toThrow(
      'decoded model has no geometry'
    );

    const procedural = fixture();
    const proceduralModel = procedural.models[0] as Record<string, unknown>;
    proceduralModel['recordClass'] = 'procedural';
    proceduralModel['status'] = 'decoded';
    proceduralModel['reason'] = 'procedural: native point field.';
    proceduralModel['conditions'] = ['state $7A60'];
    const parsed = parseCatalogue(procedural).models[0]!;
    expect(parsed.recordClass).toBe('procedural');
    expect(parsed.conditions).toEqual(['state $7A60']);
  });
  it('preserves unresolved authored selectors without turning them into room names', () => {
    const selected = fixture();
    selected.instances[0]!.association = {
      body: 'body-1',
      cell: 0x26,
      insertionGroupSelector: 3,
      insertions: [],
      levelSelector: 1,
      structureGroupSelector: 20
    };
    const data = parseCatalogue(selected);
    expect(data.instances[0]!.association).toEqual(
      selected.instances[0]!.association
    );
    expect(data.instances[0]!.placement).toBeNull();
  });
  it('rejects broken association references and selector bytes', () => {
    const missingBody = fixture();
    missingBody.instances[0]!.association = {
      body: 'missing',
      cell: 0x26,
      insertionGroupSelector: 3,
      insertions: [],
      levelSelector: 1,
      structureGroupSelector: 20
    };
    expect(() => parseCatalogue(missingBody)).toThrow('association body');

    const badByte = fixture();
    badByte.instances[0]!.association = {
      body: 'body-1',
      cell: 256,
      insertionGroupSelector: 3,
      insertions: [],
      levelSelector: 1,
      structureGroupSelector: 20
    };
    expect(() => parseCatalogue(badByte)).toThrow('byte');
  });
  it('rejects unsupported versions and broken references', () => {
    expect(() => parseCatalogue({ ...fixture(), schemaVersion: 99 })).toThrow(
      'version'
    );
    const bad = fixture();
    bad.instances[0]!.model = 'missing';
    expect(() => parseCatalogue(bad)).toThrow('model');
    const badLink = fixture();
    badLink.models[0]!.linkedInstances = ['missing'];
    expect(() => parseCatalogue(badLink)).toThrow('linked instance');
    const badParent = fixture();
    badParent.instances[0]!.placement = {
      coordinateSystem: 'Test local coordinates',
      heading: null,
      parent: 'missing',
      position: [0, 0, 0]
    };
    expect(() => parseCatalogue(badParent)).toThrow('parent instance');
  });
  it('rejects duplicate identities and dishonest census counts', () => {
    const bad = fixture();
    bad.models.push(bad.models[0]!);
    expect(() => parseCatalogue(bad)).toThrow('duplicate');
    const counts = fixture();
    counts.tables[0]!.entryCount = 2;
    expect(() => parseCatalogue(counts)).toThrow('count');
  });
  it('checks the generated dataset rather than only a synthetic fixture', async () => {
    const data = parseCatalogue(
      await Bun.file('../payload/damocles/catalogue.json').json()
    );
    expect(data.models.some(model => model.status === 'decoded')).toBe(true);
  });
  it('rejects a coverage census that does not match the models', () => {
    const bad = fixture();
    (bad.coverage as { census?: object }).census = {
      decoded: 1,
      partial: 0,
      unique: 99,
      unresolved: 0
    };
    expect(() => parseCatalogue(bad)).toThrow('census');
  });
});

it('triangulates a concave polygon without filling its notch', () => {
  const vertices: [number, number, number][] = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 2, 0],
    [1, 1, 0],
    [0, 2, 0]
  ];
  const triangles = triangulate(vertices, [0, 1, 2, 3, 4]);
  expect(triangles).toHaveLength(9);
  let area = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = triangles.slice(i, i + 3).map(index => vertices[index]!);
    area +=
      Math.abs(
        (b![0] - a![0]) * (c![1] - a![1]) - (b![1] - a![1]) * (c![0] - a![0])
      ) / 2;
  }
  expect(area).toBe(3);
});

it('handles triangular roof records with a repeated fourth corner', () => {
  expect(
    triangulate(
      [
        [0, 0, 0],
        [2, 0, 0],
        [1, 0, 2],
        [1, 0, 2]
      ],
      [0, 1, 2, 3]
    )
  ).toHaveLength(3);
});

it('can triangulate every exposed recovered face', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  for (const model of data.models) {
    for (const form of model.variants) {
      for (const face of form.mesh.faces) {
        expect(() =>
          triangulate(form.mesh.vertices, face.vertices)
        ).not.toThrow();
      }
    }
  }
});

it('keeps a generated census ledger that cannot drift from the models', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  expect(data.coverage.census.unique).toBe(data.models.length);
  expect(data.coverage.complete).toBe(false);
  expect(data.models.some(model => model.recordClass === 'null')).toBe(true);
  expect(data.models.some(model => model.recordClass === 'empty')).toBe(true);
  expect(data.models.some(model => model.recordClass === 'alias')).toBe(true);
  expect(data.models.some(model => model.recordClass === 'procedural')).toBe(
    true
  );
  expect(
    data.models.filter(model => model.conditions.includes('viewerPosition'))
      .length
  ).toBe(19);
  expect(data.models.filter(model => model.structureSelection).length).toBe(
    254
  );
  expect(data.models.filter(model => model.detailSelection).length).toBe(58);
  expect(
    data.models.some(model =>
      model.structureSelection?.regions.some(region =>
        region.queue.some(entry => entry.kind === 'attachmentFace')
      )
    )
  ).toBe(true);
  expect(
    data.models.filter(model => model.structureSelection?.liveSelector).length
  ).toBe(13);
  expect(
    data.coverage.diskLoad.some(item => item.path.includes('title-screen'))
  ).toBe(true);
  expect(
    data.coverage.diskLoad.some(item => item.path.includes('Pasti STX'))
  ).toBe(true);
  expect(data.coverage.diskLoad.some(item => item.path.includes('Vesta'))).toBe(
    true
  );
  expect(data.coverage.diskLoad.some(item => item.path.includes('Gaea'))).toBe(
    true
  );
  expect(data.coverage.diskLoad.some(item => item.path.includes('Dion'))).toBe(
    true
  );
  expect(
    data.instances.some(instance => instance.id === 'dion-surface-32')
  ).toBe(true);
  expect(
    data.instances.some(instance => instance.id === 'vesta-surface-64')
  ).toBe(true);
  expect(data.coverage.tables).toHaveLength(4);
  expect(data.coverage.tables.some(table => table.kind === 'interior')).toBe(
    true
  );
});

it('rejects contradictory slot and place relationships', () => {
  const badSlots = fixture();
  badSlots.models[0]!.slots = [1];
  expect(() => parseCatalogue(badSlots)).toThrow('slot');
  const badPlace = {
    ...fixture(),
    places: [
      {
        body: 'body-1',
        id: 'place-1',
        instances: ['instance-1'],
        name: 'Test place'
      }
    ]
  };
  expect(() => parseCatalogue(badPlace)).toThrow('place');
});

it('keeps the live Vesta Parliament exterior and filled E marker', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const parliament = data.instances.find(
    instance => instance.id === 'vesta-surface-64'
  )!;
  const assembly = data.models
    .find(model => model.id === parliament.model)!
    .variants.find(variant => variant.id === 'assembly')!;
  const detail = data.models.find(model => model.id === 'interior-02e910')!;
  const liveDetail = detail.variants.find(
    variant => variant.id === 'palette-30-live-vesta'
  )!;

  expect(assembly.mesh.faces).toHaveLength(117);
  expect(liveDetail.mesh.faces).toHaveLength(54);
});

it('keeps the spaceport exterior and room layout separate at their shared scale', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const spaceport = data.models.find(model => model.id === 'structure-01484e')!;
  expect(spaceport.variants.map(form => form.id)).toEqual([
    'exterior',
    'interior-layout',
    'combined',
    'exterior-closed',
    'combined-closed'
  ]);
  const exterior = spaceport.variants[0]!.mesh;
  const room = spaceport.variants[1]!.mesh;
  const combined = spaceport.variants[2]!.mesh;
  expect(combined.vertices).toEqual([...room.vertices, ...exterior.vertices]);
  expect(combined.faces).toEqual([
    ...room.faces,
    ...exterior.faces.map(face => ({
      ...face,
      vertices: face.vertices.map(index => index + room.vertices.length)
    }))
  ]);
  const detail = data.models
    .find(model => model.id === 'interior-0303d6')!
    .variants.find(form => form.id === 'palette-21')!.mesh;
  expect(exterior.vertices).toEqual(
    detail.vertices.map(([x, y, z]) => [x * 2, y, z * 2])
  );
  expect(exterior.faces).toEqual(
    detail.faces.filter((_, index) => ![1, 2, 31, 32].includes(index))
  );
  expect(Math.max(...room.vertices.map(vertex => vertex[1]))).toBe(250);
  expect(Math.max(...exterior.vertices.map(vertex => vertex[1]))).toBe(850);
  expect(spaceport.status).toBe('partial');
  expect(
    data.instances.find(instance => instance.id === 'eris-surface-87')!.model
  ).toBe(spaceport.id);
});

it('places the scene joins of the cell the capture stands in', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const runway = data.models.find(model => model.id === 'ground-020f8e-00-87')!;
  expect(runway.status).toBe('decoded');
  expect(runway.reason).toBe('');
  const mesh = runway.variants[0]!.mesh;
  // $F0 is the centre of the cell four grid steps ahead, so the runway strip
  // and its centre line both reach 4 x 65,536 raw units.
  expect(Math.max(...mesh.vertices.map(vertex => vertex[0]))).toBe(4 * 65_536);
  const joined = mesh.faces.filter(face => face.sceneSlots?.length);
  expect(joined).toHaveLength(2);
  expect(joined.every(face => face.vertices.length === 5)).toBe(true);
  expect(mesh.lines.some(line => line.sceneSlots?.includes(0xf0))).toBe(true);
});

it('recovers the spaceport pad strip as a per-cell ground record', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const pad = data.models.find(model => model.id === 'ground-021afe-00-88')!;
  expect(pad.kind).toBe('ground');
  expect(pad.status).toBe('decoded');
  expect(pad.omissions).toEqual([]);
  expect(pad.reason).not.toContain('neighbor');
  // The cell suffix is there because the joins are cell-relative, so cells
  // sharing this source record cannot share one identity.
  expect(pad.sourceAddress).toBe(0x2_1a_fe);
  expect(
    pad.variants[0]!.mesh.faces.some(face => face.sceneSlots?.includes(0xf0))
  ).toBe(true);
  const colours = new Set(
    pad.variants[0]!.mesh.faces.map(face => face.sourceColour)
  );
  expect(colours.has(0x7_77)).toBe(true);
  expect(colours.has(0x80_0e)).toBe(true);
  expect(
    data.instances.find(instance => instance.id === 'eris-ground-88')!.model
  ).toBe(pad.id);
  expect(pad.relatedModels).toEqual([
    'object-041edc',
    'object-041e7c',
    'object-041f9c'
  ]);
  // Eight vertices more than before the scene joins resolved, and the two
  // edges that used to be dropped whole are back.
  expect(pad.variants[0]!.mesh.vertices).toHaveLength(96);
  expect(pad.variants[0]!.mesh.faces).toHaveLength(75);
  expect(pad.variants[0]!.mesh.lines).toHaveLength(2);
});

it('uses surface slot zero palette for structureless ground objects', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  for (const id of ['ground-021f7c-04-34', 'ground-021f7c-07-94']) {
    const ground = data.models.find(model => model.id === id)!;
    expect(ground.relatedModels).toContain('object-041b1e');
    expect(ground.omissions).not.toContain('paletteBinding');
    expect(ground.reason).not.toContain(
      'Ground $7000 placement references unresolved object-041b1e'
    );
    expect(
      ground.variants[0]!.mesh.faces.filter(
        face => face.sourceColour === 0x80_82 && face.colour === '#eeee22'
      )
    ).toHaveLength(15);
  }
});

it('recovers the spaceport wall below the window without closing the opening', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const room = data.models
    .find(m => m.id === 'structure-01484e')!
    .variants.find(v => v.id === 'interior-layout')!.mesh;
  const lowerWall = room.faces.find(face => {
    const points = face.vertices.map(index => room.vertices[index]!);
    return (
      points.every(([x]) => x === 840) &&
      Math.min(...points.map(p => p[2])) === -600 &&
      Math.max(...points.map(p => p[2])) === 600 &&
      Math.min(...points.map(p => p[1])) === 0 &&
      Math.max(...points.map(p => p[1])) === 48
    );
  });
  expect(lowerWall).toBeDefined();
  expect(lowerWall!.colour).toBe('#00cccc');
});

it('leaves the combined spaceport window and doorway open instead of overlaying closed facades', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const model = data.models.find(m => m.id === 'structure-01484e')!;
  for (const id of ['exterior', 'combined']) {
    const mesh = model.variants.find(v => v.id === id)!.mesh;
    for (const [axis, plane, along, center] of [
      [0, 800, 2, 0],
      [2, -800, 0, 1400]
    ] as const) {
      expect(
        mesh.faces.some(face => {
          const p = face.vertices.map(i => mesh.vertices[i]!);
          return (
            p.every(v => v[axis] === plane) &&
            Math.min(...p.map(v => v[1])) < 100 &&
            Math.max(...p.map(v => v[1])) > 100 &&
            Math.min(...p.map(v => v[along])) < center &&
            Math.max(...p.map(v => v[along])) > center
          );
        })
      ).toBe(false);
    }
  }
});

it('closes only the spaceport door while keeping the window and shared geometry intact', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const model = data.models.find(m => m.id === 'structure-01484e')!;
  for (const view of ['exterior', 'combined'] as const) {
    const open = model.variants.find(v => v.id === view)!;
    const closed = model.variants.find(v => v.id === `${view}-closed`)!;
    expect(open.doorState).toBe('open');
    expect(closed.doorState).toBe('closed');
    expect(closed.view).toBe(view);
    expect(closed.mesh.vertices).toEqual(open.mesh.vertices);
    expect(closed.mesh.faces.slice(0, -1)).toEqual([...open.mesh.faces]);
    const panel = closed.mesh.faces.at(-1)!;
    expect(panel.colour).toBe('#666666');
    expect(panel.vertices.map(i => closed.mesh.vertices[i])).toEqual([
      [1500, 0, -800],
      [1300, 0, -800],
      [1300, 150, -800],
      [1500, 150, -800]
    ]);
  }
});

it('identifies the reviewed spaceport and preserves its region-one visibility evidence', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const spaceport = data.models.find(model => model.id === 'structure-01484e')!;
  expect(spaceport.name).toBe('Capital Spaceport');
  expect(spaceport.nameStatus).toBe('candidate');
  expect(spaceport.evidence).toContainEqual({
    claim: 'Captured interior is one room in region 1 of Structure 74.',
    confidence: 'observed',
    source: 'docs/research/damocles-spaceport-interior.md'
  });
  expect(spaceport.evidence).toContainEqual({
    claim:
      'Region 1 places resident slot 183, KEY- V.I.P. LIMO, at local (1038, 0, 789).',
    confidence: 'verified',
    source: 'docs/research/damocles-spaceport-interior.md'
  });
  expect(spaceport.linkedInstances).toEqual([
    'object-slot-183',
    'object-slot-5'
  ]);
  const room = spaceport.variants.find(form => form.id === 'interior-layout')!;
  expect(room.mesh.faces.slice(0, 28).map(face => face.sourceIndex)).toEqual([
    25, 21, 22, 8, 26, 27, 24, 7, 10, 9, 23, 6, 11, 12, 1, 4, 16, 2, 3, 17, 0,
    5, 15, 14, 19, 20, 13, 18
  ]);
});

it('draws every source silhouette vertex of the V.I.P. limo key body', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const key = data.models.find(model => model.id === 'object-03e494')!;
  const { mesh } = key.variants.find(variant => variant.id === key.id)!;
  // The source body contains nine paired front/back vertices. A plate and
  // detached tooth alone leave the shaft, outline and thickness undrawn.
  const drawableVertices = new Set(
    mesh.faces.flatMap(face => triangulate(mesh.vertices, face.vertices))
  );
  expect(
    Array.from({ length: 18 }, (_, index) => index).filter(
      index => !drawableVertices.has(index)
    )
  ).toEqual([]);
});

it('accounts for Structure 100 as an empty placeholder, not missing walls', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const model = data.models.find(item => item.id === 'structure-01a618')!;
  expect(model.status).toBe('unresolved');
  expect(model.variants).toEqual([]);
  expect(model.reason).toContain('Empty surface record');
  expect(model.reason).toContain('empty vertex list');
  expect(model.relatedModels).toEqual(['interior-02620e']);
  expect(model.evidence).toContainEqual({
    claim:
      'Empty plan and wall list at $01A618; linked building detail 1 at $02620E is an immediate $8000 vertex terminator. Nineteen Eris cells share this placeholder; they have no recovered building mesh.',
    confidence: 'verified',
    source: 'docs/research/damocles-eris-structure-01a618.md'
  });
  const detail = data.models.find(item => item.id === 'interior-02620e')!;
  expect(detail.reason).toContain('Empty building-detail record');
  expect(
    data.instances.filter(
      instance =>
        instance.model === 'structure-01a618' &&
        instance.id.startsWith('eris-surface-')
    )
  ).toHaveLength(19);
});

it('keeps V.I.P. limo key lettering in model space on its plate', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const key = data.models.find(model => model.id === 'object-03e494')!;
  const { mesh } = key.variants.find(variant => variant.id === key.id)!;
  const lettering = mesh.lines.filter(line => line.colour === '#000000');
  expect(lettering.length).toBeGreaterThan(0);
  const points = lettering.flatMap(line =>
    line.vertices.map(index => mesh.vertices[index]!)
  );
  for (const [x, y, z] of points) {
    expect(x).toBeGreaterThanOrEqual(-10);
    expect(x).toBeLessThanOrEqual(10);
    expect(y).toBeGreaterThanOrEqual(20);
    expect(y).toBeLessThanOrEqual(40);
    expect(Math.abs(z)).toBeLessThan(0.1);
  }
  expect(new Set(points.map(([x]) => x)).size).toBeGreaterThan(1);
  expect(new Set(points.map(([, y]) => y)).size).toBeGreaterThan(1);
});

it('decodes the V.I.P. limo key and preserves its source display code', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const key = data.models.find(model => model.id === 'object-03e494')!;
  const form = key.variants.find(variant => variant.id === key.id)!;
  expect(key.status).toBe('decoded');
  expect(form.mesh.displayCode).toBe('VL');
  expect(form.mesh.labelAnchor).toEqual([-8, 24, 0]);
  expect(key.evidence).toContainEqual({
    claim:
      'Source $8008 header selects shared key geometry and display code VL at local anchor [-8, 24, 0].',
    confidence: 'verified',
    source: 'docs/research/damocles-spaceport-interior.md'
  });
  const instance = data.instances.find(
    value => value.id === 'object-slot-183'
  )!;
  expect(instance.placement).toEqual({
    coordinateSystem: 'Capital Spaceport local model units',
    heading: null,
    parent: 'eris-surface-87',
    position: [1038, 0, 789]
  });
  const spaceport = data.models.find(model => model.id === 'structure-01484e')!;
  const room = spaceport.variants.find(
    variant => variant.id === 'interior-layout'
  )!;
  expect(room.mesh.vertices.slice(-form.mesh.vertices.length)).toEqual(
    form.mesh.vertices.map(([x, y, z]) => [x + 1038, y, z + 789])
  );
  expect(
    room.mesh.faces.slice(-form.mesh.faces.length).map(face => face.colour)
  ).toEqual(form.mesh.faces.map(face => face.colour));
});

it('places the V.I.P. limo at the Capital Spaceport and links its verified key', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const limo = data.models.find(model => model.id === 'object-036176')!;
  const limoInstance = data.instances.find(
    instance => instance.id === 'object-slot-5'
  )!;
  expect(limoInstance.location).toEqual({
    body: 'body-11',
    coordinateSystem: 'ST surface grid units (body-local origin unresolved)',
    heading: 0,
    place: 'place-025042',
    position: [71.513_793_945_312_5, 0, 136.474_349_975_585_94]
  });
  expect(limoInstance.placement).toBeNull();
  expect(limo.linkedInstances).toContain('object-slot-183');
  expect(limo.evidence).toContainEqual({
    claim:
      'Resident slot 5 places the V.I.P. LIMO at CAPITAL SPACEPORT. It boards with KEY- V.I.P. LIMO held and refuses an empty inventory with VEHICLE KEY REQUIRED.',
    confidence: 'verified',
    source: 'docs/research/damocles-vip-limo.md'
  });
  const key = data.models.find(model => model.id === 'object-03e494')!;
  expect(key.linkedInstances).toContain('object-slot-5');
  const place = data.places.find(value => value.id === 'place-025042')!;
  expect(place.instances).toContain('object-slot-5');
  const spaceport = data.models.find(model => model.id === 'structure-01484e')!;
  expect(spaceport.linkedInstances).toEqual([
    'object-slot-183',
    'object-slot-5'
  ]);
});

it('links each recovered vehicle to its matching key', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  for (const [vehicleSlot, keySlot] of [
    [2, 180],
    [3, 181],
    [4, 182],
    [5, 183],
    [6, 184],
    [10, 188],
    [12, 190],
    [13, 191]
  ] as const) {
    const vehicleInstance = data.instances.find(
      instance => instance.id === `object-slot-${vehicleSlot}`
    )!;
    const keyInstance = data.instances.find(
      instance => instance.id === `object-slot-${keySlot}`
    )!;
    const vehicle = data.models.find(
      model => model.id === vehicleInstance.model
    )!;
    const key = data.models.find(model => model.id === keyInstance.model)!;
    const claim = `Resident vehicle slot ${vehicleSlot} pairs with key slot ${keySlot} by the recovered +178 table relation and matching source names.`;
    expect(vehicle.linkedInstances).toContain(keyInstance.id);
    expect(key.linkedInstances).toContain(vehicleInstance.id);
    expect(vehicle.evidence).toContainEqual({
      claim,
      confidence: 'verified',
      source: 'docs/research/damocles-vip-limo.md'
    });
    expect(key.evidence).toContainEqual({
      claim,
      confidence: 'verified',
      source: 'docs/research/damocles-vip-limo.md'
    });
    expect(keyInstance.location).toBeNull();
    if (keySlot !== 180 && keySlot !== 183) {
      expect(keyInstance.placement).toBeNull();
    }
  }
});

it('places slot 180 through its decoded structure association', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const key = data.instances.find(
    instance => instance.id === 'object-slot-180'
  )!;
  expect(key.association).toEqual({
    body: 'body-11',
    cell: 0x26,
    insertionGroupSelector: 3,
    insertions: [
      { insertionKey: 0, regionSelector: 4 },
      { insertionKey: 7, regionSelector: 5 },
      { insertionKey: 7, regionSelector: 6 },
      { insertionKey: 7, regionSelector: 7 },
      { insertionKey: 23, regionSelector: 8 }
    ],
    levelSelector: 1,
    structureGroupSelector: 20
  });
  expect(key.placement).toEqual({
    coordinateSystem: 'Eris structure group $14 cell $26 local model units',
    heading: null,
    parent: 'eris-structure-0251d7',
    position: [-394, 200, 1846]
  });
  const parent = data.instances.find(
    instance => instance.id === key.placement!.parent
  )!;
  expect(parent.model).toBe('structure-01d188');
  expect(parent.location).toEqual({
    body: 'body-11',
    coordinateSystem: 'ST surface grid units (body-local origin unresolved)',
    heading: null,
    place: null,
    position: [3078.484_893_798_828, 0, 514.442_779_541_015_6]
  });
  expect(
    data.models.find(model => model.id === parent.model)!.relatedModels
  ).toContain('structure-012f84');

  const spaceportKey = data.instances.find(
    instance => instance.id === 'object-slot-183'
  )!;
  expect(spaceportKey.association).toEqual({
    body: 'body-11',
    cell: 0x87,
    insertionGroupSelector: 12,
    insertions: [
      { insertionKey: 24, regionSelector: 1 },
      { insertionKey: 16, regionSelector: 2 },
      { insertionKey: 16, regionSelector: 3 },
      { insertionKey: 16, regionSelector: 4 },
      { insertionKey: 16, regionSelector: 5 },
      { insertionKey: 2, regionSelector: 9 },
      { insertionKey: 5, regionSelector: 10 },
      { insertionKey: 5, regionSelector: 11 }
    ],
    levelSelector: 0,
    structureGroupSelector: 18
  });
  expect(spaceportKey.placement?.parent).toBe('eris-surface-87');
});

it('places only residents selected by the native surface-body association', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const expected = new Map<number, number>([
    [164, 1],
    [165, 3],
    [6, 4],
    [166, 5],
    [2, 8],
    [13, 8],
    [83, 8],
    [156, 8],
    [175, 8],
    [112, 9],
    [168, 9],
    [1, 11],
    [3, 11],
    [4, 11],
    [5, 11],
    [7, 11],
    [92, 11],
    [178, 11],
    [173, 12],
    [174, 13],
    [54, 14],
    [171, 15],
    [49, 16],
    [179, 16],
    [167, 17],
    [177, 20],
    [12, 21],
    [176, 21],
    [10, 23],
    [72, 23],
    [169, 23],
    [172, 25],
    [73, 27],
    [170, 27]
  ]);
  const locatedObjects = data.instances.filter(
    instance => instance.id.startsWith('object-slot-') && instance.location
  );
  expect(locatedObjects).toHaveLength(expected.size);
  for (const instance of locatedObjects) {
    const slot = Number(instance.id.slice('object-slot-'.length));
    expect(instance.location!.body).toBe(`body-${expected.get(slot)}`);
    if (slot !== 5) {
      expect(instance.location!.place).toBeNull();
    }
  }

  const chevy = data.instances.find(
    instance => instance.id === 'object-slot-2'
  )!;
  expect(chevy.location).toEqual({
    body: 'body-8',
    coordinateSystem: 'ST surface grid units (body-local origin unresolved)',
    heading: 0,
    place: null,
    position: [519.487_258_911_132_8, 0, 1793.487_030_029_296_9]
  });
  expect(chevy.reason).toContain('native surface-resident selector');
  expect(chevy.location!.place).toBeNull();
  const gaeaAssemblies = data.instances.filter(instance =>
    instance.id.startsWith('gaea-surface-')
  );
  expect(gaeaAssemblies).toHaveLength(82);
  expect(
    data.instances.filter(instance => instance.location?.body === 'body-8')
  ).toHaveLength(147);
  expect(
    data.instances.some(instance => instance.id === 'gaea-ur-city-surface-24')
  ).toBe(true);
  expect(
    data.instances.find(instance => instance.id === 'gaea-ur-city-surface-17')!
      .name
  ).toBe('HANTZENS NEW HOUSE');
  for (const id of [
    'gaea-surface-26',
    'gaea-surface-27',
    'gaea-surface-28',
    'gaea-surface-40'
  ]) {
    expect(gaeaAssemblies.some(instance => instance.id === id)).toBe(true);
  }
  expect(
    gaeaAssemblies.some(instance => instance.id === 'gaea-surface-17')
  ).toBe(false);
  const gaeaPlaces = data.places.filter(place => place.body === 'body-8');
  expect(gaeaPlaces.map(place => place.name).sort()).toEqual([
    'AUTHORS HOUSE',
    'ELMDON SPACEPORT',
    'ERIS PO TEMP HQ',
    'GAEA BANK',
    'GUM STORE',
    'HANTZENS NEW HOUSE',
    'INDUSTRIAL CO-OP HSE1',
    'INDUSTRIAL CO-OP HSE2',
    'LAWSON BANK',
    'NOVAGEN OFFICE',
    'VERDANT PARTY HQ'
  ]);
  expect(
    data.instances.find(instance => instance.id === 'gaea-surface-40')!.location
      ?.place
  ).toBe('place-023e6b');
  expect(
    data.coverage.notes.some(note => note.includes('Gaea Birmingham Island'))
  ).toBe(true);
  expect(
    data.instances.find(instance => instance.id === 'object-slot-8')!.location
  ).toBeNull();
});

it('records the cell background colours a surface record carries', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const withColours = data.models.filter(model => model.sceneColours?.length);
  expect(withColours).toHaveLength(265);
  expect(withColours.every(model => model.kind === 'structure')).toBe(true);
  // Capital Spaceport resolves both through its own scene palette; the frame
  // loop installs them for a raster fill, so they are not wall colours.
  const port = data.models.find(model => model.id === 'structure-01484e')!;
  // Both are scene palette references; the second is the sky blue the frame
  // loop installs behind the Capital Spaceport.
  expect(port.sceneColours).toEqual([
    { colour: '#aaaaaa', sourceColour: 0x80_9a },
    { colour: '#4488cc', sourceColour: 0x80_8e }
  ]);
});

it('paints the runway designations a ground record carries as vector text', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const runway = data.models.find(model => model.id === 'ground-0205d2-00')!;
  expect(runway.status).toBe('decoded');
  expect(runway.reason).toBe('');
  const mesh = runway.variants[0]!.mesh;
  // One apron polygon, then the stroke glyphs of the painted number.
  expect(mesh.faces).toHaveLength(1);
  expect(mesh.lines.length).toBeGreaterThan(30);
  // Every ground record now decodes, so none of them names this gap.
  expect(
    data.models.filter(
      model => model.kind === 'ground' && model.status !== 'decoded'
    )
  ).toHaveLength(0);
});

it('gives each door key and transporter slot its own label form', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const key = data.models.find(model => model.id === 'object-036d64')!;
  expect(key.status).toBe('decoded');
  expect(key.conditions).toContain('resident slot (letter label)');
  expect(key.variants.map(form => form.id)).toEqual(
    Array.from({ length: 10 }, (_, index) => `slot-${30 + index}-record`)
  );
  expect(key.variants[0]!.name).toContain('label A');
  expect(key.variants[9]!.name).toContain('label J');
  // The label is filled glyph geometry, so a later slot is not the same mesh.
  expect(key.variants[0]!.mesh.faces.length).toBeGreaterThan(14);

  // Three tokens no header writes stay named, with their workspace address.
  const live = data.models.filter(model =>
    model.omissions.includes('liveText')
  );
  expect(live).toHaveLength(3);
  expect(live.map(model => model.name).sort()).toEqual([
    'AUTHORS COMPUTER',
    'EXPLOSIVE-ARMED!',
    'TELEVISION'
  ]);
  expect(live.every(model => /\$C[DE][\dA-F]{2}/.test(model.reason))).toBe(
    true
  );
});

it('samples the free-running articulation angle for the six turning objects', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const turning = data.models.filter(model =>
    model.conditions.some(condition =>
      condition.startsWith('articulation angle')
    )
  );
  expect(turning).toHaveLength(6);
  expect(turning.every(model => model.status === 'decoded')).toBe(true);
  expect(turning.every(model => model.variants.length === 8)).toBe(true);

  const bomb = data.models.find(model => model.id === 'object-036b46')!;
  const rest = bomb.variants[0]!.mesh.vertices;
  const quarter = bomb.variants.find(form => form.id === 'angle-40')!.mesh
    .vertices;
  // Only the tagged vertices move, and they do move.
  const moved = rest.filter(
    (point, index) => point.join() !== quarter[index]!.join()
  );
  expect(moved.length).toBeGreaterThan(0);
  expect(moved.length).toBeLessThan(rest.length);

  // The four articulated building details keep a gap that says why.
  const details = data.models.filter(model =>
    model.omissions.includes('articulated')
  );
  expect(details).toHaveLength(4);
  expect(details.every(model => model.kind === 'interior')).toBe(true);
  expect(details[0]!.reason).toContain('structure X and Z scales');
});
