import { describe, expect, test } from 'bun:test';

import {
  readFlyoverPresentation,
  readGammaSystem
} from '../src/flyover/documents.ts';

const targ = () => ({
  backdropColour: '#000008',
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
  schemaVersion: 1,
  surfaceColours: {
    coastline: '#d0b878',
    ground: '#008000',
    ocean: '#183858'
  },
  systemId: 'targ'
});

describe('Flyover presentation documents', () => {
  test('reads a complete Targ document against its Body authority', () => {
    const document = readFlyoverPresentation(targ(), 'targ', ['targ', 'sun']);
    expect(document.systemId).toBe('targ');
    expect(document.islands[0]?.id).toBe('city-island');
  });

  test('reads a complete Gamma document', () => {
    const document = readFlyoverPresentation(
      {
        backdropColour: '#000008',
        bodies: [
          {
            colour: '#a0a8c0',
            id: 'dialis',
            radius: { fraction: 0.2, kind: 'nearest-neighbour' },
            ranges: ['orbital']
          }
        ],
        cameraSpeed: {
          maximumUnitsPerSecond: 250_000,
          minimumUnitsPerSecond: 16
        },
        schemaVersion: 1,
        systemId: 'gamma'
      },
      'gamma',
      ['dialis']
    );
    expect(document.systemId).toBe('gamma');
  });

  test('rejects unknown fields at every level', () => {
    const document = targ();
    Object.assign(document.cameraSpeed, { fastest: 9 });
    expect(() =>
      readFlyoverPresentation(document, 'targ', ['targ', 'sun'])
    ).toThrow('cameraSpeed has unexpected field fastest');
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
