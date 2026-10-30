import { describe, expect, test } from 'bun:test';

import type { Part, Point3 } from '../src/geometry/contract.ts';
import { composeSurface } from '../src/geometry/targ.ts';
import { Camera, visible } from '../src/projection/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import { FACE_STRIDE, faceBatch } from '../src/shell/faces.ts';
import { planFrame } from '../src/shell/frame.ts';
import {
  World,
  facePolygon,
  movedTo,
  placedAtResidence
} from '../src/world/index.ts';
import {
  resolveRotation,
  surfaceRotation
} from '../src/world/surfaceGeometry.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const size = { height: 800, width: 1280 };
const triangle: readonly Point3[] = [
  [-100, 0, -100],
  [100, 0, -100],
  [0, 200, -100]
];
const part = (points = triangle, role: Part['role'] = 'display'): Part => ({
  colourModel: 'palette',
  externals: [],
  faces: [
    {
      colour: { colour: '#c04080', kind: 'palette', source: 0 },
      doubleSided: true,
      id: 7,
      loop: points.map((_, i) => 100 + i * 3).reverse()
    }
  ],
  id: role,
  lines: [],
  role,
  vertices: points.map((co, i) => ({ co, id: 100 + i * 3 }))
});
const model = bundle.objects.models[0]!;
const surface = bundle.surface.cells.find(({ asset }) =>
  asset.parts[0]!.vertices.some(v => v.runtime !== undefined)
)!;
const world = new World({
  ...bundle,
  objects: {
    ...bundle.objects,
    models: bundle.objects.models.map(value =>
      value === model
        ? {
            ...value,
            asset: {
              ...value.asset,
              parts: [...value.asset.parts, part(), part(triangle, 'walk')]
            }
          }
        : value
    )
  },
  surface: {
    ...bundle.surface,
    cells: bundle.surface.cells.map(value =>
      value === surface
        ? {
            ...value,
            asset: {
              ...value.asset,
              parts: value.asset.parts.map(p => ({
                ...p,
                faces: [
                  {
                    colour: { ink: 0, kind: 'ink' },
                    doubleSided: true,
                    id: 10,
                    loop: p.vertices.slice(0, 3).map(v => v.id)
                  }
                ]
              }))
            }
          }
        : value
    )
  }
});
const object = world.objects.find(
  o => `targ:${o.model}` === model.asset.asset
)!;
const cell = world.cells.find(
  c => `targ:surface-cell:${c.index}` === surface.asset.asset
)!;

describe('Targ Geometry Asset faces', () => {
  test('stable vertex identities resolve per part; walking faces stay out of presentation', () => {
    expect(object.faces).toHaveLength(1);
    expect(object.faces[0]!.vertices).toHaveLength(3);
    expect(object.faces[0]!.colour).toEqual({ blue: 128, green: 64, red: 192 });
    const moved = movedTo(object, {
      x: object.origin.x + 2000,
      y: object.origin.y + 300,
      z: object.origin.z - 1000
    });
    expect(moved.faces[0]!.vertices).toEqual(
      object.faces[0]!.vertices.map(v => ({
        x: v.x + 2000,
        y: v.y + 300,
        z: v.z - 1000
      }))
    );
  });

  test('display faces can use more than sixty vertices independently of the Road Workspace', () => {
    const points: Point3[] = [
      ...Array.from({ length: 67 }, (): Point3 => [0, 0, 0]),
      ...triangle
    ];
    const display = part(points);
    const edited = new World({
      ...bundle,
      surface: {
        ...bundle.surface,
        cells: bundle.surface.cells.map(value =>
          value === surface
            ? {
                ...value,
                asset: {
                  ...value.asset,
                  parts: [
                    ...value.asset.parts,
                    {
                      ...display,
                      faces: [
                        {
                          ...display.faces[0]!,
                          loop: display.vertices
                            .slice(-3)
                            .map(vertex => vertex.id)
                        }
                      ]
                    }
                  ]
                }
              }
            : value
        )
      }
    });
    expect(
      edited.cells.find(value => value.index === cell.index)!.faces(0)[0]!
        .vertices
    ).toEqual(triangle.map(([x, y, z]) => ({ x, y, z })));
  });

  test('parked craft faces turn and move with their wireframe', () => {
    const reference = new World(bundle).objects.find(
      o => o.slot === object.slot
    )!;
    // Add a face using the wireframe's own placed corners to compare exactly after residence.
    const withFace = {
      ...object,
      faces: [facePolygon({}, object.vertices.slice(0, 3))]
    };
    const where = {
      at: { x: 100_000, y: 2048, z: 200_000 },
      heading: Math.PI / 2,
      kind: 'surface' as const
    };
    const placed = placedAtResidence(world, withFace, where, {
      kind: 'surface'
    });
    const expected = placedAtResidence(world, reference, where, {
      kind: 'surface'
    });
    expect(placed.faces[0]!.vertices).toEqual(expected.vertices.slice(0, 3));
  });

  test('object faces obey detail, carried, gone and room visibility', () => {
    const position = { x: 100_000, y: 2000, z: 200_000 };
    const roomOptions = (kind: 'carried' | 'gone' | 'room', id = 3) => ({
      residence: new Map([
        [object.slot, kind === 'room' ? { at: position, id, kind } : { kind }]
      ]),
      room: 3
    });
    expect(visible(world, position, roomOptions('room')).faces).toHaveLength(1);
    for (const options of [
      roomOptions('carried'),
      roomOptions('gone'),
      roomOptions('room', 4)
    ]) {
      expect(visible(world, position, options).faces).toHaveLength(0);
    }
    expect(
      visible(
        world,
        { ...position, x: position.x + object.detailCube * 2 },
        roomOptions('room')
      ).faces
    ).toHaveLength(0);
  });

  test('surface faces resolve runtime rotation and stay within the city grid', () => {
    const source = surface.asset.parts[0]!;
    const document = composeSurface(bundle.surface).cells.find(
      c => c.cell === cell.index
    )!;
    const rotation = surfaceRotation(document, world.cellsPerAxis)!;
    for (const elapsed of [0, 0.5, 2]) {
      expect(cell.faces(elapsed)[0]!.vertices).toEqual(
        source.vertices
          .slice(0, 3)
          .map(vertex =>
            vertex.runtime === undefined
              ? { x: vertex.co[0], y: vertex.co[1], z: vertex.co[2] }
              : resolveRotation(rotation, vertex.runtime.input, elapsed)
          )
      );
    }
    const position = { ...cell.centre, y: 1000 };
    const normal = visible(world, position).faces[0]!;
    expect(normal.vertices.length).toBeGreaterThan(0);
    const beyond = visible(world, {
      ...position,
      x: position.x + world.groundExtent
    });
    expect(beyond.faces).toEqual([]);
  });

  test('both Presentation Presets plan identical coloured face batches indoors', () => {
    const session = new GameplaySession(
      sessionContent(world, bundle, undefined),
      openingPlayer()
    );
    session.teleport({ id: 3, kind: 'room' });
    const snapshot = {
      ...session.snapshot,
      residence: new Map([
        [
          object.slot,
          { at: session.snapshot.player.position, id: 3, kind: 'room' as const }
        ]
      ])
    };
    const plans = (['authentic', 'enhanced'] as const).map(
      preset =>
        planFrame(world, snapshot, size, undefined, {
          preset,
          structureReach: 'cell'
        }).faces
    );
    expect(plans[0]).toBeDefined();
    expect(plans[0]!.batch).toEqual(plans[1]!.batch);
    expect(Array.from(plans[0]!.batch.vertices.subarray(4, 7))).toEqual(
      [192, 64, 128].map(channel => Math.fround(channel / 255))
    );
  });

  test('concave faces triangulate without filling the notch and respect winding and mirrors', () => {
    const vertices = [
      [-100, -100, -1000],
      [100, -100, -1000],
      [100, 0, -1000],
      [0, 0, -1000],
      [0, 100, -1000],
      [-100, 100, -1000]
    ].map(([x, y, z]) => ({ x: x!, y: y!, z: z! }));
    const camera = new Camera({
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 }
    });
    const draw = (
      polygon: Parameters<typeof facePolygon>[0],
      points: typeof vertices,
      view = camera
    ) => faceBatch([facePolygon(polygon, points)], view, size);
    expect(draw({}, vertices)!.vertices).toHaveLength(4 * 3 * FACE_STRIDE);
    expect(draw({}, [...vertices].reverse())).toBeUndefined();
    expect(draw({ doubleSided: true }, [...vertices].reverse())).toBeDefined();
    expect(
      draw(
        {},
        vertices,
        new Camera({
          heading: 0,
          mirrored: true,
          pitch: 0,
          position: camera.position
        })
      )
    ).toBeDefined();
  });
});
