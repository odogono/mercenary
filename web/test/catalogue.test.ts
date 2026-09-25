import { describe, expect, it } from 'bun:test';

import {
  parseCatalogue as parseStored,
  selectModels
} from '../src/catalogue/data.ts';
import { triangulate } from '../src/catalogue/geometry.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

it('retains recovered Drop metadata and rejects values outside the native word range', () => {
  const value = fixture();
  for (const supportTop of [null, 0, 48, 32_767]) {
    const model = { ...value.models[0]!, supportTop };
    expect(
      parseCatalogue({ ...value, models: [model] }).models[0]?.supportTop
    ).toBe(supportTop);
  }
  for (const field of ['supportTop', 'storeyHeight']) {
    for (const invalid of [-1, 1.5, 32_768, Number.NaN]) {
      expect(() =>
        parseCatalogue({
          ...value,
          models: [{ ...value.models[0], [field]: invalid }]
        })
      ).toThrow();
    }
  }
});

interface FixtureModel {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly recordClass?: string;
  readonly slots: readonly number[];
  readonly status: string;
  readonly storeyHeight?: unknown;
  readonly supportTop?: unknown;
}

/// The synthetic fixture carries its Models inline and states nothing twice, so the model
/// index and each Body's Model list are derived here, the way the generator derives them.
/// Every contract test below then exercises the stored checks against an honest index.
const parseCatalogue = (value: unknown) => {
  const v = value as {
    readonly bodies: readonly Record<string, unknown>[];
    readonly models: readonly FixtureModel[];
  };
  return parseStored({
    ...v,
    bodies: v.bodies.map(body => ({ models: [], ...body })),
    modelIndex: v.models.map(model => ({
      id: model.id,
      kind: model.kind,
      name: model.name,
      recordClass: model.recordClass ?? 'geometry',
      slots: model.slots,
      status: model.status,
      ...('storeyHeight' in model ? { storeyHeight: model.storeyHeight } : {}),
      ...('supportTop' in model ? { supportTop: model.supportTop } : {})
    }))
  });
};

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
      boarding: null as null | Record<string, unknown>,
      handling: null as null | {
        byte: number;
        carried: boolean;
        refusal: string | null;
        requiredSupportRank: number;
        suppliedSupportRank: number;
        takeable: boolean;
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
      variants: [],
      worldConditionedSlots: undefined as number[] | undefined
    }
  ],
  places: [],
  schemaVersion: 17,
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
      extent: {
        bankEnd: 40,
        entryCount: 1,
        firstRecord: 8,
        followedAt: 64,
        followedBy: 'a synthetic follower',
        lastRecord: 8,
        preambleBytes: 4,
        tableEnd: 4,
        tableStart: 0,
        zeroFillBytes: 24
      },
      extentEvidence: 'Synthetic',
      kind: 'object'
    }
  ]
});

/// The fixture with one face on its Model, carrying `face`'s colour fields.
const withFace = (face: Record<string, unknown>) => {
  const data = fixture();
  Object.assign(data.models[0]!, {
    status: 'decoded',
    variants: [
      {
        id: 'record',
        mesh: {
          faces: [{ sourceColour: 0x80_86, vertices: [0, 1, 2], ...face }],
          lines: [],
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0]
          ]
        },
        name: 'Record'
      }
    ]
  });
  return data;
};

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
  it("carries the take handler's interaction byte for a resident slot", () => {
    // $6FAA + 4*slot is the only per-object input to takeability; the catalogue
    // reports it rather than deciding anything with it.
    const taken = fixture();
    taken.instances[0]!.handling = {
      byte: 0x20,
      carried: false,
      refusal: 'message',
      requiredSupportRank: 0,
      suppliedSupportRank: 0,
      takeable: false
    };
    expect(parseCatalogue(taken).instances[0]!.handling).toEqual({
      byte: 0x20,
      carried: false,
      refusal: 'message',
      requiredSupportRank: 0,
      suppliedSupportRank: 0,
      takeable: false
    });
    expect(parseCatalogue(fixture()).instances[0]!.handling).toBeNull();
    const badRefusal = fixture();
    badRefusal.instances[0]!.handling = {
      byte: 4,
      carried: false,
      refusal: 'shrug',
      requiredSupportRank: 1,
      suppliedSupportRank: 0,
      takeable: true
    };
    expect(() => parseCatalogue(badRefusal)).toThrow('message/silent');
  });

  it("carries the board gate's admission facts for a resident slot", () => {
    // The gate's table facts are published per instance, so the session reads them
    // rather than compiling slot constants (#408).
    const boarding = {
      admission: 'paired',
      admissionProvenance: 'derived',
      boardable: true,
      boardableProvenance: 'derived',
      pairedInstance: 'instance-1',
      pairedProvenance: 'derived',
      pairedSlot: 183,
      reason: 'The key test admits it only while slot 183 is carried.',
      refusal: 'system-string-3',
      refusalProvenance: 'recovered'
    };
    const keyed = fixture();
    keyed.instances[0]!.boarding = boarding;
    expect(parseCatalogue(keyed).instances[0]!.boarding).toEqual(
      boarding as never
    );
    expect(parseCatalogue(fixture()).instances[0]!.boarding).toBeNull();
    const predates = fixture();
    delete (predates.instances[0] as { boarding?: unknown }).boarding;
    expect(() => parseCatalogue(predates)).toThrow('no boarding block');
    const missing = fixture();
    missing.instances[0]!.boarding = { ...boarding, pairedInstance: null };
    expect(
      parseCatalogue(missing).instances[0]!.boarding!.pairedInstance
    ).toBeNull();
    for (const [change, message] of [
      [{ pairedInstance: 'instance-9' }, 'paired instance'],
      [{ admission: 'friendly' }, 'unkeyed/seatable/paired'],
      [{ refusal: 'VEHICLE KEY REQUIRED' }, 'system string'],
      [{ pairedSlot: null }, 'paired slot'],
      [{ admission: 'unkeyed' }, 'paired slot'],
      [{ boardableProvenance: 'guessed' }, 'authored/derived/recovered']
    ] as const) {
      const bad = fixture();
      bad.instances[0]!.boarding = { ...boarding, ...change };
      expect(() => parseCatalogue(bad)).toThrow(message);
    }
  });

  it("keeps a face's day half beside its colour, and refuses a malformed one (#497)", () => {
    const lit = parseCatalogue(
      withFace({ colour: '#444444', dayColour: '#000000' })
    );
    expect(lit.models[0]!.variants[0]!.mesh.faces[0]).toMatchObject({
      colour: '#444444',
      dayColour: '#000000'
    });
    const one = parseCatalogue(withFace({ colour: '#444444' }));
    expect(
      one.models[0]!.variants[0]!.mesh.faces[0]!.dayColour
    ).toBeUndefined();
    expect(() =>
      parseCatalogue(withFace({ colour: '#444444', dayColour: 'black' }))
    ).toThrow('invalid day colour');
  });

  it('keeps a measured bank extent and the slots a world binds', () => {
    const data = parseCatalogue(fixture());
    expect(data.tables[0]!.extent!.followedAt).toBe(64);
    const bound = fixture();
    bound.models[0]!.worldConditionedSlots = [0];
    expect(parseCatalogue(bound).models[0]!.worldConditionedSlots).toEqual([0]);
  });

  it('rejects a bank extent that does not bound anything', () => {
    // The extent is only evidence while the table stops short of its first
    // record and the bank stops short of what follows it.
    const overrun = fixture();
    overrun.tables[0]!.extent.firstRecord = 2;
    expect(() => parseCatalogue(overrun)).toThrow('overruns its first record');
    const past = fixture();
    past.tables[0]!.extent.bankEnd = 64;
    expect(() => parseCatalogue(past)).toThrow('overruns what follows');
    const miscounted = fixture();
    miscounted.tables[0]!.extent.entryCount = 2;
    expect(() => parseCatalogue(miscounted)).toThrow('entry count');
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
    const data = await loadCatalogue();
    expect(data.models.some(model => model.status === 'decoded')).toBe(true);
  });
  it('publishes the recovered board gate for every placed craft', async () => {
    const data = await loadCatalogue();
    const boarding = (slot: number) =>
      data.instances.find(item => item.id === `object-slot-${slot}`)!.boarding!;
    expect(
      data.instances
        .filter(item => item.boarding?.boardable)
        .map(item => item.id)
    ).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 10, 12, 13, 14].map(slot => `object-slot-${slot}`)
    );
    expect(boarding(5)).toMatchObject({
      admission: 'paired',
      pairedInstance: 'object-slot-183',
      refusal: 'system-string-3'
    });
    expect(boarding(7)).toMatchObject({
      pairedInstance: 'object-slot-185',
      refusal: 'system-string-22'
    });
    expect(boarding(1).admission).toBe('unkeyed');
    expect(boarding(14).admission).toBe('seatable');
    expect(boarding(11)).toMatchObject({
      boardable: false,
      pairedInstance: null,
      pairedSlot: 189
    });
    expect(
      data.instances.filter(
        item => item.id.startsWith('object-slot-') !== (item.boarding !== null)
      )
    ).toEqual([]);
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
    256
  );
  expect(data.models.filter(model => model.detailSelection).length).toBe(59);
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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

it('offers a ground template one form per evidenced scene palette', async () => {
  const data = await loadCatalogue();
  // Object 337's faces name scene colour word 1, which palettes 2, 43 and 94
  // fill with $777 and palettes 1, 51 and 62 fill with $771. Showing a single
  // palette 0 form hid that difference behind an unbound default. Palettes 43
  // and 94 are the image-derived road cells of BARE ISLAND and KEY WEST (#460).
  const template = data.models.find(model => model.id === 'object-041b1e')!;
  expect(template.variants.map(variant => variant.id)).toEqual([
    'palette-1',
    'palette-2',
    'palette-43',
    'palette-51',
    'palette-62',
    'palette-94'
  ]);
  expect(template.omissions).not.toContain('paletteBinding');
  const sceneColour = (index: number) =>
    template.variants[index]!.mesh.faces.find(
      face => face.sourceColour === 0x80_82
    )!.colour;
  expect([0, 3, 4].map(sceneColour)).toEqual(['#eeee22', '#eeee22', '#eeee22']);
  expect([1, 2, 5].map(sceneColour)).toEqual(['#eeeeee', '#eeeeee', '#eeeeee']);

  // The one template no captured cell table placed is now placed. Eighteen further
  // live workspaces (#172) bind it through six evidenced palettes, which is the
  // follow-up the catalogue note named: the gap closed by capturing more bodies,
  // not by authoring a default.
  const wasUnplaced = data.models.find(model => model.id === 'object-041b8a')!;
  expect(wasUnplaced.omissions).not.toContain('paletteBinding');
  expect(wasUnplaced.variants.map(variant => variant.id)).toEqual([
    'palette-76',
    'palette-107',
    'palette-113',
    'palette-130',
    'palette-131',
    'palette-132'
  ]);
});

it('recovers the spaceport wall below the window without closing the opening', async () => {
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
  const model = data.models.find(item => item.id === 'structure-01a618')!;
  // An authored empty is decoded: the record parses cleanly to its terminator
  // and holds no geometry by construction, like an empty ground record.
  expect(model.status).toBe('decoded');
  expect(model.recordClass).toBe('empty');
  expect(model.variants).toEqual([]);
  expect(model.reason).toContain('Empty surface record');
  expect(model.reason).toContain('intentionally empty record');
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
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
    heading: 0,
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
  const data = await loadCatalogue();
  const limo = data.models.find(model => model.id === 'object-036176')!;
  const limoInstance = data.instances.find(
    instance => instance.id === 'object-slot-5'
  )!;
  expect(limoInstance.location).toEqual({
    body: 'body-11',
    coordinateSystem: 'Body Coordinates',
    heading: 0x7f,
    island: null,
    place: 'place-025042',
    position: [71.513_793_945_312_5, 0, 136.474_349_975_585_94]
  });
  expect(limoInstance.placement).toBeNull();
  // $77BC, the byte the draw path turns the mesh by, not $79D2 (#361).
  expect(limo.instanceOrientation).toEqual({
    angleBiasByte: 0,
    modeByte: 0x40,
    rotation: 'yaw'
  });
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
  const data = await loadCatalogue();
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
    // Every key is a structure resident, placed in the workspace a capture binds for its group.
    expect(keyInstance.placement).not.toBeNull();
  }
});

it('places DOOBERRYS SOLICITORS Floor 9 residents on the structure Floor 9 binds', async () => {
  // Metis group $03 is bound by the metis-transporter capture. Floor 9 of cell $60 binds slot
  // 58, and the chair and desk take their regions from slot 58's association list, not the
  // ground structure's.
  const data = await loadCatalogue();
  const placed = (slot: number) =>
    data.instances.find(instance => instance.id === `object-slot-${slot}`)!;
  expect(
    data.instances.find(instance => instance.id === 'metis-surface-60')!.name
  ).toBe('DOOBERRYS SOLICITORS');
  for (const [slot, position] of [
    [226, [-324, 1350, 660]],
    [231, [-319, 1350, 740]],
    [133, [253, 1350, 722]],
    [67, [234, 1350, 1016]]
  ] as const) {
    expect(placed(slot).placement).toMatchObject({
      parent: 'metis-surface-60',
      position
    });
    expect(placed(slot).association!.levelSelector).toBe(9);
  }
  expect(
    placed(226).association!.insertions.map(pair => pair.regionSelector)
  ).toEqual([1, 2, 4, 5]);
});

it('places slot 180 through its decoded structure association', async () => {
  const data = await loadCatalogue();
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
    heading: 0,
    parent: 'eris-structure-0251d7',
    position: [-394, 200, 1846]
  });
  const parent = data.instances.find(
    instance => instance.id === key.placement!.parent
  )!;
  expect(parent.model).toBe('structure-01d188');
  expect(parent.location).toEqual({
    body: 'body-11',
    coordinateSystem: 'Body Coordinates',
    heading: null,
    island: null,
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
  const spaceport = data.instances.find(
    instance => instance.id === 'eris-surface-87'
  )!;
  expect(spaceport.associationGroups).toEqual([
    {
      group: 1,
      pairs: [
        { insertionKey: 16, regionSelector: 2 },
        { insertionKey: 16, regionSelector: 3 },
        { insertionKey: 16, regionSelector: 4 },
        { insertionKey: 16, regionSelector: 5 },
        { insertionKey: 2, regionSelector: 9 },
        { insertionKey: 5, regionSelector: 10 },
        { insertionKey: 5, regionSelector: 11 },
        { insertionKey: 8, regionSelector: 12 }
      ]
    },
    {
      group: 12,
      pairs: [
        { insertionKey: 24, regionSelector: 1 },
        { insertionKey: 16, regionSelector: 2 },
        { insertionKey: 16, regionSelector: 3 },
        { insertionKey: 16, regionSelector: 4 },
        { insertionKey: 16, regionSelector: 5 },
        { insertionKey: 2, regionSelector: 9 },
        { insertionKey: 5, regionSelector: 10 },
        { insertionKey: 5, regionSelector: 11 }
      ]
    }
  ]);
  expect(
    data.instances
      .filter(instance => instance.id !== 'eris-surface-87')
      .every(instance => instance.associationGroups === null)
  ).toBeTrue();
});

it('places only residents selected by the native surface-body association', async () => {
  const data = await loadCatalogue();
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
    coordinateSystem: 'Body Coordinates',
    heading: 0,
    island: null,
    place: null,
    position: [519.487_258_911_132_8, 0, 1793.487_030_029_296_9]
  });
  expect(chevy.reason).toContain('native surface-resident selector');
  expect(chevy.location!.place).toBeNull();
  const gaeaAssemblies = data.instances.filter(instance =>
    instance.id.startsWith('gaea-surface-')
  );
  expect(gaeaAssemblies).toHaveLength(82);
  // Gaea carries two recovered windows: UR CITY at origin 512,1792 and CHALDEA
  // METROPOLIS at 256,768 (#172). Both place into one Body surface at their own
  // world coordinates, which is why this count covers more than one map.
  expect(
    data.instances.filter(instance => instance.location?.body === 'body-8')
  ).toHaveLength(372);
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
  // The last five are CHALDEA METROPOLIS, Gaea's second recovered window (#172).
  // They are recovered place records from that window's own area list, not names
  // extended from Birmingham Island or UR CITY.
  const gaeaPlaces = data.places.filter(place => place.body === 'body-8');
  expect(gaeaPlaces.map(place => place.name).sort()).toEqual([
    'AUTHORS HOUSE',
    'BANK OF GAEA HQ',
    'ELMDON SPACEPORT',
    'ERIS PO TEMP HQ',
    'ESTATE AGENTS',
    'GAEA BANK',
    'GUM STORE',
    'HANTZENS NEW HOUSE',
    'INDUSTRIAL CO-OP HSE1',
    'INDUSTRIAL CO-OP HSE2',
    'LAWSON BANK',
    'MARILLION APARTMENTS',
    'MEGA TRADING',
    'NOVAGEN OFFICE',
    'TRADE COMMISSION',
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
  const data = await loadCatalogue();
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
  const data = await loadCatalogue();
  const runway = data.models.find(model => model.id === 'ground-0205d2-00')!;
  expect(runway.status).toBe('decoded');
  expect(runway.reason).toBe('');
  const mesh = runway.variants[0]!.mesh;
  // One apron polygon, then the stroke glyphs of the painted number.
  expect(mesh.faces).toHaveLength(1);
  expect(mesh.lines.length).toBeGreaterThan(30);
  // Every Eris ground record decodes. Five records on three of the bodies added
  // by #172 do not, and all five name one recovered reason: ground $6000 vector
  // text is copied into the frame stream untransformed, and these cells carry a
  // nonzero orientation. Eris never placed painted text at a nonzero orientation,
  // so the gap only appears once other bodies are captured.
  expect(
    data.models
      .filter(model => model.kind === 'ground' && model.status !== 'decoded')
      .map(model => model.id)
  ).toEqual([
    'cronus-ground-01fe26-06-55',
    'cyclopes-ground-01ead2-03-14',
    'cyclopes-ground-01ead2-03-24',
    'cyclopes-ground-01ead2-03-34',
    'metis-ground-01edf2-03-65'
  ]);
});

it('gives each door key and transporter slot its own label form', async () => {
  const data = await loadCatalogue();
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

  // Only live mission state stays named now, with its workspace address.
  const live = data.models.filter(model =>
    model.omissions.includes('liveText')
  );
  expect(live.map(model => model.name)).toEqual(['EXPLOSIVE-ARMED!']);
  expect(live[0]!.reason).toContain('$CD14');

  // The two frame animations became sampled forms instead of a named gap.
  const animated = data.models.filter(model =>
    model.conditions.some(condition =>
      condition.startsWith('vector-text frame script')
    )
  );
  expect(animated.map(model => model.name).sort()).toEqual([
    'AUTHORS COMPUTER',
    'TELEVISION'
  ]);
  for (const model of animated) {
    expect(model.status).toBe('decoded');
    expect(model.omissions).toEqual([]);
    expect(
      model.variants.filter(form => form.id.startsWith('text-frame-'))
    ).toHaveLength(7);
  }
  // Every sampled frame draws a glyph, and the script really varies.
  const computer = animated.find(model => model.name === 'AUTHORS COMPUTER')!;
  expect(computer.conditions).toContain(
    'vector-text frame script $CDCE (12 frames)'
  );
  const drawn = new Set(
    computer.variants.map(form => JSON.stringify(form.mesh.vertices))
  );
  expect(drawn.size).toBeGreaterThan(1);
});

it('samples the free-running articulation angle for the six turning objects', async () => {
  const data = await loadCatalogue();
  const turning = data.models.filter(
    model =>
      model.kind === 'object' &&
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
});

it('turns each articulated building detail in every structure frame that places it', async () => {
  const data = await loadCatalogue();
  // Nothing is left holding the articulated omission.
  expect(data.models.filter(m => m.omissions.includes('articulated'))).toEqual(
    []
  );

  const details = data.models.filter(
    model =>
      model.kind === 'interior' &&
      model.conditions.some(condition =>
        condition.startsWith('structure scale')
      )
  );
  expect(details.map(model => model.id)).toEqual([
    'interior-02630e',
    'interior-026556',
    'interior-0268ee',
    'interior-02dfb4',
    'interior-02e44e'
  ]);
  for (const model of details) {
    // Every turned form names the frame it was turned in, and there are eight
    // sampled angles for each one.
    const frames = new Set(
      model.variants
        .map(
          variant =>
            /^(.+-scale--?\d+x-?\d+)-angle-[\da-f]{2}$/.exec(variant.id)?.[1]
        )
        .filter((frame): frame is string => frame !== undefined)
    );
    expect(frames.size).toBeGreaterThan(0);
    for (const frame of frames) {
      const forms = model.variants.filter(variant =>
        variant.id.startsWith(`${frame}-angle-`)
      );
      expect(forms).toHaveLength(8);
    }
    expect(model.reason).toContain('$539CE/$539D2');
  }

  // Detail 7 is placed by five structures, two of them at a nonuniform scale.
  // Scaling before the turn is what makes those frames different shapes, so
  // one reusable detail identity has to carry them all.
  const reused = data.models.find(model => model.id === 'interior-026556')!;
  const wide = reused.variants.find(
    v => v.id === 'palette-129-scale-4x2-angle-40'
  )!.mesh.vertices;
  const mirrored = reused.variants.find(
    v => v.id === 'palette-129-scale--4x-2-angle-40'
  )!.mesh.vertices;
  const square = reused.variants.find(
    v => v.id === 'palette-114-scale-3x3-angle-40'
  )!.mesh.vertices;
  expect(wide).not.toEqual(mirrored);
  expect(wide).not.toEqual(square);
  // A uniform frame keeps the turned arm's length; a 4x2 one does not.
  const neutral = reused.variants.find(
    v => v.id === 'palette-129-scale-4x2-angle-00'
  )!.mesh.vertices;
  expect(wide).not.toEqual(neutral);
  expect(wide.filter((p, i) => p.join() !== neutral[i]!.join())).toHaveLength(
    40
  );

  // Detail 69's unreachable records stay excluded in every turned form.
  const excluded = data.models.find(model => model.id === 'interior-02e44e')!;
  expect(
    excluded.variants.every(
      variant =>
        (variant.mesh.unreferencedRecords ?? []).join() === '17,18,19,20'
    )
  ).toBe(true);

  // Each placing structure offers its own assembly at the same eight angles.
  const placing = data.models.filter(model =>
    model.variants.some(variant => variant.id.startsWith('assembly-angle-'))
  );
  expect(placing).toHaveLength(11);
  expect(placing.every(model => model.variants.length === 8)).toBe(true);
});

it('an $F0 entrance names a key index the cell resolves to a letter', async () => {
  const data = await loadCatalogue();
  const live = data.models.filter(
    model => model.structureSelection?.liveSelector
  );
  expect(live).toHaveLength(13);
  const keyed = live.flatMap(model =>
    model.structureSelection!.attachments.filter(
      item => item.keyIndex !== undefined
    )
  );
  // Every $F0 control in the bank carries key index 0, so the letter is the
  // cell's base letter; the nybble is still what the source adds.
  expect(keyed).toHaveLength(14);
  expect(keyed.every(item => item.keyIndex === 0)).toBe(true);
  expect(keyed.every(item => (item.controlWord & 0xff) === 0xf0)).toBe(true);
  // A zero-latch entrance has no key index at all.
  const plain = data.models
    .flatMap(model => model.structureSelection?.attachments ?? [])
    .filter(item => (item.controlWord & 0xff) === 0);
  expect(plain.length).toBeGreaterThan(0);
  expect(plain.every(item => item.keyIndex === undefined)).toBe(true);

  // The live selector no longer leaves an omission behind.
  expect(
    data.models.filter(model => model.omissions.includes('attachments'))
  ).toHaveLength(0);
  const vesta = live.find(model => model.name === 'Structure 70')!;
  expect(
    vesta.evidence.find(item => item.claim.includes('key letter E'))?.confidence
  ).toBe('verified');
});

it('an unreachable record stays an ordinal and draws nothing', async () => {
  const data = await loadCatalogue();
  const carrying = data.models.filter(model =>
    model.variants.some(form => form.mesh.unreferencedRecords?.length)
  );
  expect(carrying.map(model => model.id)).toEqual(['interior-02e44e']);
  const mesh = carrying[0]!.variants[0]!.mesh;
  expect(mesh.unreferencedRecords).toEqual([17, 18, 19, 20]);
  // They hold ordinals so the later selector bytes line up, but contribute
  // nothing, and no visibility list names them.
  expect(mesh.recordCount).toBe(46);
  const drawn = new Set(
    [...mesh.faces, ...mesh.lines].map(item => item.sourceIndex)
  );
  for (const record of mesh.unreferencedRecords!) {
    expect(drawn.has(record)).toBe(false);
  }
  const named = new Set(
    carrying[0]!.detailSelection!.flatMap(group => [
      ...group.default,
      ...group.boxes.flatMap(box => box.records)
    ])
  );
  for (const record of mesh.unreferencedRecords!) {
    expect(named.has(record)).toBe(false);
  }
});

it('every record now carries a verdict and none is unresolved', async () => {
  const data = await loadCatalogue();
  expect(data.coverage.census.unresolved).toBe(0);
  expect(data.models.filter(model => model.status === 'unresolved')).toEqual(
    []
  );
  // A full bank is not a full account: the ledger stays incomplete.
  expect(data.coverage.complete).toBe(false);
  // A decoded model may show nothing only when its class says so.
  for (const model of data.models) {
    if (model.status === 'decoded' && model.variants.length === 0) {
      expect(['empty', 'null', 'procedural']).toContain(model.recordClass);
    }
  }
});

it('binds a level to the structure its floor table names', async () => {
  const data = await loadCatalogue();
  const bySlot = new Map(
    data.models
      .filter(model => model.kind === 'structure')
      .flatMap(model => model.slots.map(slot => [slot, model] as const))
  );
  // Vesta Parliament's cell instance. Its table skips levels 4..9 and then
  // names slot 91 at level 10, which is the capture standing at the
  // transporter (docs/research/damocles-level-structure-binding.md).
  const parliament = bySlot.get(70)!;
  expect(parliament.recordClass).toBe('alias');
  expect(parliament.storeyHeight).toBe(317);
  expect(
    parliament.levelBinding!.floors.map(floor => [
      floor.level,
      floor.structureSlot
    ])
  ).toEqual([
    [0, 90],
    [1, 92],
    [2, 92],
    [3, 93],
    [10, 91]
  ]);
  // Level 0 is the base structure the alias record already names, so the table
  // is not a second, disagreeing account of the ground bind.
  for (const model of data.models) {
    const floors = model.levelBinding?.floors ?? [];
    for (const floor of floors) {
      expect(floor.level).toBeLessThan(model.levelBinding!.levelsAuthored);
      expect(bySlot.get(floor.structureSlot)!.id).toBe(floor.structureId);
    }
  }
  // Both fields come from the same header bit, so a record has a floor table
  // exactly when it has a pitch; a plain structure offers level 0 alone.
  for (const model of data.models) {
    expect(model.levelBinding === undefined).toBe(
      model.storeyHeight === undefined
    );
  }
});

const islandFixture = () => ({
  areaName: 'TEST AREA' as string | null,
  body: 'body-1',
  boxes: [
    { kind: 'extent', sourceAddress: 16, x: [-12, 12], z: [-16, 16] },
    { kind: 'core', sourceAddress: 8, x: [-5, 5], z: [-5, 5] }
  ],
  coastline: {
    edges: [0x01_08, 0x02_04, 0xc3_0c],
    sourceAddress: 32,
    vertices: [
      [-12, 0],
      [0, 16],
      [12, -16]
    ]
  },
  extent: {
    coversSurface: false,
    wrapsX: true,
    wrapsZ: false,
    x: [4088, 56],
    z: [1040, 1076]
  },
  id: 'island-test-063272',
  landColour: '#006600',
  origin: [32, 1056],
  reason: 'Synthetic island',
  sourceAddress: 0x06_32_72,
  sourceLandColour: 0x00_30,
  sourceOrigin: [32, 1056],
  structureGroup: 0x12,
  workspace: 0x01_e4_a2
});

describe('Damocles island records', () => {
  it('keeps a record whose group binds nothing distinct from one that does', () => {
    const value = { ...fixture(), islands: [islandFixture()] };
    expect(parseCatalogue(value).islands[0]!.workspace).toBe(0x01_e4_a2);
    const empty = {
      ...fixture(),
      islands: [{ ...islandFixture(), structureGroup: 0, workspace: null }]
    };
    const parsed = parseCatalogue(empty).islands[0]!;
    expect(parsed.workspace).toBeNull();
    expect(parsed.structureGroup).toBe(0);
    for (const broken of [
      { ...islandFixture(), structureGroup: 0 },
      { ...islandFixture(), workspace: null }
    ]) {
      expect(() => parseCatalogue({ ...fixture(), islands: [broken] })).toThrow(
        'workspace disagrees'
      );
    }
  });
  it('refuses a coastline whose edge cycle does not close', () => {
    const island = islandFixture();
    island.coastline.edges = island.coastline.edges.slice(0, 2);
    expect(() => parseCatalogue({ ...fixture(), islands: [island] })).toThrow(
      'closed cycle'
    );
  });
  it('refuses boxes that are not extent, core and exclusions in order', () => {
    const swapped = islandFixture();
    swapped.boxes = [swapped.boxes[1]!, swapped.boxes[0]!];
    expect(() => parseCatalogue({ ...fixture(), islands: [swapped] })).toThrow(
      'extent, core and exclusions'
    );
    const trailing = islandFixture();
    trailing.boxes = [
      ...trailing.boxes,
      { ...trailing.boxes[1]!, kind: 'core' }
    ];
    expect(() => parseCatalogue({ ...fixture(), islands: [trailing] })).toThrow(
      'extent, core and exclusions'
    );
  });
  it('refuses an instance that names an island on another body', () => {
    const value = fixture() as Record<string, unknown>;
    value['bodies'] = [
      { bodySurface: null, id: 'body-1', name: 'One' },
      { bodySurface: null, id: 'body-2', name: 'Two' }
    ];
    value['islands'] = [islandFixture()];
    const instance = {
      ...(value['instances'] as Record<string, unknown>[])[0],
      location: {
        body: 'body-2',
        coordinateSystem: 'Body Coordinates',
        heading: null,
        island: 'island-test-063272',
        place: null,
        position: [0, 0, 0]
      }
    };
    expect(() => parseCatalogue({ ...value, instances: [instance] })).toThrow(
      'another body'
    );
    expect(() =>
      parseCatalogue({
        ...value,
        instances: [
          {
            ...instance,
            location: { ...instance.location, island: 'island-missing' }
          }
        ]
      })
    ).toThrow('missing island');
  });
});

it('admits every island record of every body surface into the catalogue', async () => {
  const data = await loadCatalogue();
  expect(data.islands).toHaveLength(62);
  expect(new Set(data.islands.map(island => island.body)).size).toBe(30);
  // A record is not a settlement and a settlement is not a record: 21 carry no
  // coastline at all, and 33 bind no named area.
  expect(
    data.islands.filter(island => island.coastline.vertices.length === 0)
  ).toHaveLength(21);
  expect(data.islands.filter(island => island.areaName !== null)).toHaveLength(
    29
  );
  const surfaces = data.bodies.filter(body => body.bodySurface !== null);
  expect(surfaces).toHaveLength(30);
  // VOID is the space-as-place sentinel rather than a body surface.
  expect(data.bodies.at(-1)!.bodySurface).toBeNull();
  const eris = surfaces.find(body => body.name === 'ERIS')!;
  expect(eris.bodySurface).toEqual({
    baseColour: '#000066',
    extentCells: [4096, 4096],
    // One turn in 209,062 VBLs (docs/research/damocles-gamma-system.md).
    rotationRate: 0x01_41,
    // `$85DC + 4 * 11`: the pinned first-world night is `$001` (#494).
    sky: {
      day: { colour: '#66aaee', sourceColour: 0x03_57 },
      night: { colour: '#000022', sourceColour: 0x00_01 }
    },
    sourceColour: 0x00_03,
    wrapsX: true,
    wrapsZ: true
  });
  // Metis's pair is the one `damocles.metis.transporter` holds in `$7946`/`$7948`.
  const metis = surfaces.find(body => body.name === 'METIS')!;
  expect(metis.bodySurface?.sky).toEqual({
    day: { colour: '#66aaaa', sourceColour: 0x03_55 },
    night: { colour: '#002222', sourceColour: 0x00_11 }
  });
});

it('keeps a seam-crossing extent whole rather than reading it as empty', async () => {
  const data = await loadCatalogue();
  const island = (id: string) => data.islands.find(item => item.id === id)!;
  // Snow Island's west coast reaches body x = -8, which is 4088 on the torus.
  const snow = island('island-eris-06327c').extent;
  expect([snow.x, snow.wrapsX]).toEqual([[4088, 56], true]);
  expect([snow.z, snow.wrapsZ]).toEqual([[1040, 1076], false]);
  // Lucan's ring is authored in signed coordinates and straddles the seam too.
  const lucan = island('island-lucan-0632ea');
  expect(lucan.sourceOrigin).toEqual([200, 0]);
  expect([lucan.extent.z, lucan.extent.wrapsZ]).toEqual([[4082, 26], true]);
  expect(
    data.islands
      .filter(
        item =>
          !item.extent.coversSurface &&
          (item.extent.wrapsX || item.extent.wrapsZ)
      )
      .map(item => item.id)
  ).toEqual([
    'island-eris-06327c',
    'island-lucan-0632ea',
    'island-lucan-063308',
    'island-lucan-063326',
    'island-lucan-063344'
  ]);
});

it('shares one coastline definition between two bodies', async () => {
  const data = await loadCatalogue();
  const capital = data.islands.find(
    island => island.id === 'island-eris-063272'
  )!;
  const birmingham = data.islands.find(
    island => island.id === 'island-dion-063174'
  )!;
  expect(capital.coastline.sourceAddress).toBe(0x06_34_4a);
  expect(birmingham.coastline).toEqual(capital.coastline);
  expect(birmingham.boxes).toEqual(capital.boxes);
  expect(birmingham.body).not.toBe(capital.body);
  expect([capital.areaName, birmingham.areaName]).toEqual([
    'CAPITAL CITY',
    'BIRMINGHAM ISLAND'
  ]);
});

it('separates two cells with the same label by their island record', async () => {
  const data = await loadCatalogue();
  const cell: readonly [number, number] = [9, 8];
  const bodyCell = (id: string) => {
    const island = data.islands.find(item => item.id === id)!;
    return [island.origin[0] + cell[0], island.origin[1] + cell[1]];
  };
  expect(bodyCell('island-eris-063272')).toEqual([73, 136]);
  expect(bodyCell('island-eris-06329a')).toEqual([2569, 3592]);
  // Same body, same local cell, different locations: the label alone never
  // identified one (docs/research/damocles-eris-islands.md).
  const stateOffice = data.instances.find(
    instance => instance.id === 'eris-surface-89'
  )!;
  expect(stateOffice.location!.island).toBe('island-eris-063272');
  expect(stateOffice.location!.coordinateSystem).toBe('Body Coordinates');
  expect(stateOffice.location!.position.map(Math.floor)).toEqual([73, 0, 136]);
});
