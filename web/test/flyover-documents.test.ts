import { describe, expect, test } from 'bun:test';

import {
  readFlyoverPresentation,
  readGammaSystem
} from '../src/flyover/documents.ts';

const targ = () => ({
  backdrop: {
    colour: '#000008',
    pointSizeCssPixels: 1,
    starColour: '#d8e8ff',
    starCount: 2048,
    starSeed: 1_179_408_719
  },
  bodies: [
    {
      colour: '#008000',
      id: 'targ',
      radius: { kind: 'absolute', radiusUnits: 2_670_176.857_720_436 },
      ranges: ['orbital', 'coastal', 'surface']
    },
    {
      colour: '#ffd070',
      id: 'sun',
      radius: {
        kind: 'angular-diameter',
        orbitalDistanceUnits: 683_565_275.576_431_6
      },
      ranges: ['orbital']
    }
  ],
  bodyMesh: { latitudeSegments: 32, longitudeSegments: 64 },
  camera: {
    framingCoverage: 0.9,
    overviewAxis: 'positive-z',
    verticalFieldOfViewDegrees: 60
  },
  cameraSpeed: {
    maximumUnitsPerSecond: 21_361_414.861_763_49,
    minimumUnitsPerSecond: 64
  },
  islands: [
    {
      bodyId: 'targ',
      centreDegrees: { latitude: 0, longitude: 0 },
      id: 'city-island',
      polygonDegrees: [
        [-16, -16],
        [16, -16],
        [16, 16],
        [-16, 16]
      ],
      surfacePatch: {
        eastAxis: 'x',
        northAxis: 'z',
        sourceCentre: { x: 524_288, z: 524_288 },
        unitsPerRadian: 2_670_176.857_720_436
      }
    }
  ],
  lighting: { kind: 'body', sourceBodyId: 'sun' },
  schemaVersion: 1,
  surfaceColours: {
    coastline: '#d0b878',
    ground: '#008000',
    ocean: '#183858'
  },
  systemId: 'targ'
});

const gamma = () => ({
  backdrop: {
    colour: '#000008',
    pointSizeCssPixels: 1,
    starColour: '#d8e8ff',
    starCount: 2048,
    starSeed: 1_179_408_719
  },
  bodies: [
    {
      id: 'dialis',
      radius: { kind: 'recovered-extent' },
      ranges: ['orbital']
    }
  ],
  bodyMesh: { latitudeSegments: 32, longitudeSegments: 64 },
  camera: {
    framingCoverage: 0.9,
    overviewAxis: 'positive-z',
    verticalFieldOfViewDegrees: 60
  },
  cameraSpeed: {
    maximumUnitsPerSecond: 250_000,
    minimumUnitsPerSecond: 16
  },
  lighting: { kind: 'camera-headlight' },
  schemaVersion: 1,
  systemId: 'gamma'
});

describe('Flyover presentation documents', () => {
  test('reads a complete Targ document against its Body authority', () => {
    const document = readFlyoverPresentation(targ(), 'targ', ['targ', 'sun']);
    expect(document.systemId).toBe('targ');
    expect(document.islands[0]?.id).toBe('city-island');
  });

  test('reads a complete Gamma document', () => {
    const document = readFlyoverPresentation(gamma(), 'gamma', ['dialis']);
    expect(document.systemId).toBe('gamma');
    expect('colour' in document.bodies[0]!).toBeFalse();
  });

  test('rejects an authored colour on a Gamma Body', () => {
    const document = gamma();
    Object.assign(document.bodies[0]!, { colour: '#a0a8c0' });
    expect(() =>
      readFlyoverPresentation(document, 'gamma', ['dialis'])
    ).toThrow('bodies[0] has unexpected field colour');
  });

  test('rejects unknown fields at every level', () => {
    const document = targ();
    Object.assign(document.cameraSpeed, { fastest: 9 });
    expect(() =>
      readFlyoverPresentation(document, 'targ', ['targ', 'sun'])
    ).toThrow('cameraSpeed has unexpected field fastest');
  });

  test('strictly reads the authored Orbital rendering contract', () => {
    const document = readFlyoverPresentation(targ(), 'targ', ['targ', 'sun']);
    expect(document.camera).toEqual({
      framingCoverage: 0.9,
      overviewAxis: 'positive-z',
      verticalFieldOfViewDegrees: 60
    });
    expect(document.bodyMesh).toEqual({
      latitudeSegments: 32,
      longitudeSegments: 64
    });
    expect(document.backdrop).toEqual({
      colour: '#000008',
      pointSizeCssPixels: 1,
      starColour: '#d8e8ff',
      starCount: 2048,
      starSeed: 1_179_408_719
    });
    expect(document.lighting).toEqual({ kind: 'body', sourceBodyId: 'sun' });
  });

  test('rejects incomplete render data and invalid lighting', () => {
    const incomplete = targ();
    delete (incomplete.backdrop as Partial<typeof incomplete.backdrop>)
      .starSeed;
    expect(() =>
      readFlyoverPresentation(incomplete, 'targ', ['targ', 'sun'])
    ).toThrow('backdrop is missing field starSeed');

    const badLight = targ();
    badLight.lighting.sourceBodyId = 'missing';
    expect(() =>
      readFlyoverPresentation(badLight, 'targ', ['targ', 'sun'])
    ).toThrow('lighting.sourceBodyId');

    const wrongTargLight = targ();
    wrongTargLight.lighting.sourceBodyId = 'targ';
    expect(() =>
      readFlyoverPresentation(wrongTargLight, 'targ', ['targ', 'sun'])
    ).toThrow('lighting.sourceBodyId should be sun');

    const excessive = targ();
    excessive.backdrop.starCount = 10_001;
    expect(() =>
      readFlyoverPresentation(excessive, 'targ', ['targ', 'sun'])
    ).toThrow('backdrop.starCount');
  });

  test('rejects a partial or foreign Body census', () => {
    expect(() =>
      readFlyoverPresentation(targ(), 'targ', ['targ', 'sun', 'outer-moon'])
    ).toThrow('missing Body outer-moon');
    expect(() => readFlyoverPresentation(targ(), 'targ', ['targ'])).toThrow(
      'unknown Body sun'
    );
  });

  test('rejects unsupported Ranges and non-finite values', () => {
    const ranges = targ();
    ranges.bodies[0]!.ranges = ['surface'];
    expect(() =>
      readFlyoverPresentation(ranges, 'targ', ['targ', 'sun'])
    ).toThrow('bodies[0].ranges');

    const speed = targ();
    speed.cameraSpeed.maximumUnitsPerSecond = Number.POSITIVE_INFINITY;
    expect(() =>
      readFlyoverPresentation(speed, 'targ', ['targ', 'sun'])
    ).toThrow('cameraSpeed.maximumUnitsPerSecond');
  });

  test('rejects version, colour, speed and radius-rule faults', () => {
    const version = targ();
    version.schemaVersion = 2;
    expect(() =>
      readFlyoverPresentation(version, 'targ', ['targ', 'sun'])
    ).toThrow('schemaVersion');

    const badColour = targ();
    badColour.bodies[0]!.colour = '#00800G';
    expect(() =>
      readFlyoverPresentation(badColour, 'targ', ['targ', 'sun'])
    ).toThrow('bodies[0].colour');

    const reversedSpeed = targ();
    reversedSpeed.cameraSpeed.maximumUnitsPerSecond = 32;
    expect(() =>
      readFlyoverPresentation(reversedSpeed, 'targ', ['targ', 'sun'])
    ).toThrow('maximum should exceed minimum');

    const wrongRadius = targ();
    wrongRadius.bodies[1]!.radius = {
      kind: 'absolute',
      radiusUnits: 1
    };
    expect(() =>
      readFlyoverPresentation(wrongRadius, 'targ', ['targ', 'sun'])
    ).toThrow('invalid radius rule');
  });

  test('rejects duplicate identities and invalid Island references', () => {
    const duplicate = targ();
    duplicate.bodies.push(structuredClone(duplicate.bodies[1]!));
    expect(() =>
      readFlyoverPresentation(duplicate, 'targ', ['targ', 'sun'])
    ).toThrow('duplicate ID sun');

    const reference = targ();
    reference.islands[0]!.bodyId = 'sun';
    expect(() =>
      readFlyoverPresentation(reference, 'targ', ['targ', 'sun'])
    ).toThrow('Surface-capable Body');
  });

  test('rejects invalid polygons', () => {
    for (const polygon of [
      [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0]
      ],
      [
        [0, 0],
        [1, 0],
        [0, 0]
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0]
      ]
    ]) {
      const document = targ();
      document.islands[0]!.polygonDegrees = polygon;
      expect(() =>
        readFlyoverPresentation(document, 'targ', ['targ', 'sun'])
      ).toThrow('islands[0].polygonDegrees');
    }
  });

  test('accepts a simple concave polygon', () => {
    const document = targ();
    document.islands[0]!.polygonDegrees = [
      [-2, -2],
      [2, -2],
      [0, 0],
      [2, 2],
      [-2, 2]
    ];
    expect(
      readFlyoverPresentation(document, 'targ', ['targ', 'sun']).islands[0]
        ?.polygonDegrees
    ).toHaveLength(5);
  });

  test('does not mistake disjoint collinear edges for an intersection', () => {
    const document = targ();
    document.islands[0]!.polygonDegrees = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 0],
      [3, 0],
      [3, 2],
      [0, 2]
    ];
    expect(
      readFlyoverPresentation(document, 'targ', ['targ', 'sun']).islands[0]
        ?.polygonDegrees
    ).toHaveLength(8);
  });
});

describe('the Flyover radius rules', () => {
  test('accepts the recovered extent for Gamma and refuses it for Targ', () => {
    const document = readFlyoverPresentation(gamma(), 'gamma', ['dialis']);
    expect(document.bodies[0]!.radius).toEqual({ kind: 'recovered-extent' });
    // Targ has no recovered authority behind it, so it cannot size a Body from one.
    const onTarg = targ();
    onTarg.bodies[0]!.radius = { kind: 'recovered-extent' } as never;
    expect(() => readFlyoverPresentation(onTarg, 'targ', ['targ'])).toThrow(
      'radius'
    );
  });

  test('still accepts the neighbour-distance rule it replaced', () => {
    // Kept in the union rather than migrated away: the rule set describes what a presentation
    // may say, and nothing is gained by making an old document unreadable.
    const document = gamma();
    document.bodies[0]!.radius = {
      fraction: 0.2,
      kind: 'nearest-neighbour'
    } as never;
    expect(
      readFlyoverPresentation(document, 'gamma', ['dialis']).bodies[0]!.radius
    ).toEqual({ fraction: 0.2, kind: 'nearest-neighbour' });
  });

  test('refuses a rule the System cannot use', () => {
    const document = gamma();
    document.bodies[0]!.radius = { kind: 'nonsense' } as never;
    expect(() =>
      readFlyoverPresentation(document, 'gamma', ['dialis'])
    ).toThrow('radius');
  });
});

describe('the recovered Gamma System document', () => {
  test('strictly reads the tracked authority and identifies stable Bodies', async () => {
    const document = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    expect(document.bodies).toHaveLength(30);
    expect(
      document.bodies.filter(body => body.positionKind === undefined)
    ).toHaveLength(29);
    expect(document.bodies.at(-1)).toMatchObject({
      id: 'damocles',
      positionKind: 'capture-time-sample',
      sourceIndex: 29
    });
  });

  test('publishes the decode of the packed binary float in radiusExtent', async () => {
    const document = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    const of = (id: string) =>
      document.bodies.find(body => body.id === id)!.size;
    // The decode's own test: a packed float's mantissa is normalised, an integer's is not.
    // Eleven distinct mantissas across thirty Bodies, every one of them in range (#424).
    for (const body of document.bodies) {
      expect(body.radiusExtent & 0xff_ff).toBeGreaterThanOrEqual(0x10_00);
      expect(body.radiusExtent & 0xff_ff).toBeLessThan(0x20_00);
    }
    expect(
      new Set(document.bodies.map(body => body.radiusExtent & 0xff_ff)).size
    ).toBe(11);
    // DIALIS is the star and becomes the largest object in the System. Read as an integer it
    // is unremarkable, which is the structural corroboration of the decode.
    expect(of('dialis')).toBe(5_120_000);
    expect(Math.max(...document.bodies.map(body => body.size))).toBe(
      of('dialis')
    );
    // In every satellite cluster the structurally inferred Primary outranks its satellites.
    for (const [primary, satellites] of [
      ['eris', ['solon', 'theon', 'vesta', 'metis', 'lucan']],
      ['triton', ['pan', 'thalia']],
      ['juno', ['bacchus', 'jason', 'tolosa', 'perseus']],
      ['gaea', ['cronus', 'cyclopes']],
      ['dion', ['atropos', 'clotho', 'lachesis']],
      ['midas', ['acheron']],
      ['logos', ['aurora']],
      ['mentor', ['sapphire']]
    ] as const) {
      for (const satellite of satellites) {
        expect(of(primary)).toBeGreaterThan(of(satellite));
      }
    }
    // Decoded the System spans 500x; read as an integer it spans 1.69x, which is what made
    // TRITON draw barely larger than PAN.
    const sizes = document.bodies.map(body => body.size);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBe(500);
    expect(of('triton') / of('pan')).toBeCloseTo(13.64, 2);
    // Checked against a captured game frame, where ERIS drew 3.24x VESTA at near-equal range.
    expect(of('eris') / of('vesta')).toBeCloseTo(3.33, 2);
  });

  test('publishes each radius as a 256th of its size (#528)', async () => {
    const document = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    const of = (id: string) =>
      document.bodies.find(body => body.id === id)!.radius;
    expect(document.sky.projectionScale).toBe(256);
    expect(of('eris')).toBe(1200);
    expect(of('vesta')).toBe(360);
    expect(of('dialis')).toBe(20_000);
    expect(of('theon')).toBe(40);

    const size = await Bun.file('../payload/damocles/system.json').json();
    size.bodies[11].size += 1;
    expect(() => readGammaSystem(size)).toThrow('bodies[11].size');
    const radius = await Bun.file('../payload/damocles/system.json').json();
    radius.bodies[11].radius = 1500;
    expect(() => readGammaSystem(radius)).toThrow('bodies[11].radius');
  });

  test('publishes every draw list in the engine order', async () => {
    const document = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    const of = (id: string) =>
      document.bodies.find(body => body.id === id)!.drawList;
    // `$00` is DIALIS: the walker at `$0530EE` stops only at a negative byte, so it leads
    // every list and DIALIS's own list is DIALIS alone.
    expect(of('eris')).toEqual([
      'dialis',
      'solon',
      'theon',
      'vesta',
      'metis',
      'lucan',
      'damocles'
    ]);
    expect(of('metis')).toEqual([
      'dialis',
      'damocles',
      'eris',
      'solon',
      'theon',
      'vesta',
      'lucan'
    ]);
    expect(of('dialis')).toEqual(['dialis']);
    expect(of('damocles')).toEqual([
      'eris',
      'solon',
      'theon',
      'vesta',
      'metis',
      'lucan',
      'dialis',
      'icarus'
    ]);
    expect(document.sky.drawListPointers).toEqual({
      address: '0x00809c',
      end: '0x008118',
      sha256: '5e80c8d7c46cc1a8fef6215f708d4614be403866a4dd58415a9468debf5c0909'
    });

    const unknown = await Bun.file('../payload/damocles/system.json').json();
    unknown.bodies[11].drawList.push('void');
    expect(() => readGammaSystem(unknown)).toThrow('unknown Body void');
  });

  test('pins the recovered Body colour table', async () => {
    const document = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    // Recovered, not chosen: sourceColour is the low word of each `index * 4` longword at
    // `$0060C0` masked to twelve bits the way `$0592AC` masks it, and baseColour expands each
    // nibble by `n * 34` (#379/#382, docs/research/damocles-gamma-system.md). Colours repeat in
    // the original, so the duplicates below are faithful rather than placeholders; DAMOCLES's
    // slot holds `$0030E000`, whose high word the engine never reads.
    expect(
      Object.fromEntries(
        document.bodies.map(body => [
          body.id,
          [body.baseColour, body.sourceColour]
        ])
      )
    ).toEqual({
      acheron: ['#888888', 0x4_44],
      atropos: ['#888888', 0x4_44],
      aurora: ['#882222', 0x4_11],
      bacchus: ['#666666', 0x3_33],
      clotho: ['#664444', 0x3_22],
      cronus: ['#664444', 0x3_22],
      cyclopes: ['#666666', 0x3_33],
      damocles: ['#000000', 0x0_00],
      dialis: ['#eeeeee', 0x7_77],
      dion: ['#00aaaa', 0x0_55],
      eris: ['#000066', 0x0_03],
      gaea: ['#006600', 0x0_30],
      icarus: ['#444444', 0x2_22],
      jason: ['#888888', 0x4_44],
      juno: ['#4488cc', 0x2_46],
      lachesis: ['#882222', 0x4_11],
      logos: ['#888888', 0x4_44],
      lucan: ['#664444', 0x3_22],
      mentor: ['#888888', 0x4_44],
      metis: ['#882222', 0x4_11],
      midas: ['#aa8800', 0x5_40],
      pan: ['#444444', 0x2_22],
      perseus: ['#664444', 0x3_22],
      sapphire: ['#4488cc', 0x2_46],
      solon: ['#666666', 0x3_33],
      thalia: ['#4488cc', 0x2_46],
      theon: ['#888888', 0x4_44],
      tolosa: ['#882222', 0x4_11],
      triton: ['#ee8800', 0x7_40],
      vesta: ['#4488cc', 0x2_46]
    });
  });

  test('rejects a colour that does not expand its own source word', async () => {
    const mismatched = await Bun.file('../payload/damocles/system.json').json();
    mismatched.bodies[0].baseColour = '#ff0000';
    expect(() => readGammaSystem(mismatched)).toThrow('bodies[0].baseColour');

    const outOfRange = await Bun.file('../payload/damocles/system.json').json();
    outOfRange.bodies[0].sourceColour = 0x88_88;
    expect(() => readGammaSystem(outOfRange)).toThrow('bodies[0].sourceColour');
  });

  test('agrees with the Catalogue about every recovered Body colour', async () => {
    const document = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    const catalogue = (await Bun.file(
      '../payload/damocles/catalogue.json'
    ).json()) as {
      bodies: {
        bodySurface: { baseColour: string; sourceColour: number } | null;
        name: string;
      }[];
    };
    // Both documents publish the same table at `$0060C0`, so a divergence here is a Payload
    // fault rather than a presentation choice.
    for (const body of document.bodies) {
      const surface = catalogue.bodies.find(
        entry => entry.name === body.name
      )?.bodySurface;
      expect([surface?.baseColour, surface?.sourceColour]).toEqual([
        body.baseColour,
        body.sourceColour
      ]);
    }
  });

  test('rejects an unknown field and non-finite centre', async () => {
    const unknown = await Bun.file('../payload/damocles/system.json').json();
    unknown.bodies[0].orbit = 'invented';
    expect(() => readGammaSystem(unknown)).toThrow(
      'bodies[0] has unexpected field orbit'
    );

    const nonFinite = await Bun.file('../payload/damocles/system.json').json();
    nonFinite.bodies[0].position.x = Number.NaN;
    expect(() => readGammaSystem(nonFinite)).toThrow('bodies[0].position.x');
  });

  test('rejects corrupt provenance, duplicate indices and unstable identities', async () => {
    const badHash = await Bun.file('../payload/damocles/system.json').json();
    badHash.source.ramSha256 = 'not-a-hash';
    expect(() => readGammaSystem(badHash)).toThrow('source.ramSha256');

    const duplicateIndex = await Bun.file(
      '../payload/damocles/system.json'
    ).json();
    duplicateIndex.bodies[1].sourceIndex = 0;
    expect(() => readGammaSystem(duplicateIndex)).toThrow(
      'duplicate source indices'
    );

    const unstable = await Bun.file('../payload/damocles/system.json').json();
    unstable.bodies[0].positionKind = 'capture-time-sample';
    expect(() => readGammaSystem(unstable)).toThrow('must mark only damocles');
  });
});

describe('the canonical Flyover presentation documents', () => {
  test('read cleanly against their complete authorities', async () => {
    const gamma = readGammaSystem(
      await Bun.file('../payload/damocles/system.json').json()
    );
    const stableGammaIds = gamma.bodies
      .filter(body => body.positionKind === undefined)
      .map(body => body.id);
    const targDocument = readFlyoverPresentation(
      await Bun.file('flyover/targ.json').json(),
      'targ',
      ['targ', 'sun', 'inner-moon', 'outer-moon']
    );
    const gammaDocument = readFlyoverPresentation(
      await Bun.file('flyover/gamma.json').json(),
      'gamma',
      stableGammaIds
    );
    expect(targDocument.bodies).toHaveLength(4);
    expect(gammaDocument.bodies).toHaveLength(29);
  });
});
