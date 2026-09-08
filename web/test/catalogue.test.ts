import { describe, expect, it } from 'bun:test';

import { parseCatalogue, selectModels } from '../src/catalogue/data.ts';
import { triangulate } from '../src/catalogue/geometry.ts';

const fixture = () => ({
  bodies: [{ id: 'body-1', name: 'Test body' }],
  coverage: { complete: false, notes: ['Synthetic fixture'] },
  instances: [
    {
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
  schemaVersion: 3,
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

it('places the V.I.P. limo at the Capital Spaceport and links its observed key', async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const limo = data.models.find(model => model.id === 'object-036176')!;
  const limoInstance = data.instances.find(
    instance => instance.id === 'object-slot-5'
  )!;
  expect(limoInstance.location).toEqual({
    body: 'body-11',
    coordinateSystem: 'ST surface grid units (first-world Eris workspace)',
    heading: 0,
    place: 'place-025042',
    position: [71.513_793_945_312_5, 0, 136.474_349_975_585_94]
  });
  expect(limoInstance.placement).toBeNull();
  expect(limo.linkedInstances).toContain('object-slot-183');
  expect(limo.evidence).toContainEqual({
    claim:
      'Resident slot 5 places the V.I.P. LIMO at CAPITAL SPACEPORT; boarding was observed while KEY- V.I.P. LIMO was held.',
    confidence: 'observed',
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
