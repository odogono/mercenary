import type { CoastSurface } from '../coast/islands.ts';
import type { CatalogueGeometry } from './catalogue.ts';
import { type DionCoastIsland, type DionFrameWorld } from './frame.ts';
import { playableModel } from './modelForms.ts';
import {
  address,
  int,
  ints,
  list,
  pair,
  provenance,
  record,
  triple
} from './read.ts';
import type { TourcraftContent } from './tourcraftContent.ts';
import {
  readDetail,
  readDionOpening,
  readGlyph,
  readGround,
  readStructure,
  type DionCell,
  type DionDetail,
  type DionResident,
  type DionStructure
} from './world.ts';

const box = (v: unknown) => {
  const r = record(v, 'island.box');
  return { x: pair(r['x'], 'island.box.x'), z: pair(r['z'], 'island.box.z') };
};

/// Only admitted export records enter the planner. No inspection selection, fetch,
/// campaign mutation or Save policy lives at this presentation boundary.
export const tourcraftFrameWorld = (
  content: TourcraftContent,
  group: 3 | 23
): DionFrameWorld => {
  const support = content.support;
  const base = content.legacy.world;
  const body = content.promotion.bodyPlacements.find(b =>
    b.islands.some(i => i.group === group)
  )!;
  const home = body.islands.find(i => i.group === group)!;
  const environment = record(
    record(support['groups'], 'support.groups')[String(group)],
    `support.groups.${group}`
  );
  const workspace = list(
    content.promotion.raw['workspaceSourcePins'],
    'workspaceSourcePins'
  )
    .map(v => record(v, 'workspaceSourcePin'))
    .find(p => p['group'] === group)!;
  const absent = provenance(workspace, 'workspaceSourcePin');
  // An empty workspace cell has no structure or detail. These containers encode
  // that recovered absence for the existing planner; they add no drawable records.
  const emptyStructure: DionStructure = {
    associations: [],
    attachments: [],
    heights: [0, 0],
    plan: [],
    provenance: absent,
    regions: [
      {
        bounds: { x: [-32_768, 32_767], z: [-32_768, 32_767] },
        flags: 0x80_00,
        queue: []
      }
    ],
    sceneColours: [0x80_08, 0x80_08],
    walls: [],
    wallTexts: []
  };
  const emptyDetail: DionDetail = {
    extent: null,
    groups: [],
    index: 0,
    primitives: [],
    provenance: absent,
    tagged: [],
    vertices: []
  };
  const structures = new Map<number, ReadonlyMap<string, DionStructure>>([
    [0, new Map([['1,1', emptyStructure]])]
  ]);
  const details = new Map<number, DionDetail>([[0, emptyDetail]]);
  const grounds = new Map<number, ReturnType<typeof readGround>>();
  const cells: DionCell[] = [];
  const slots = list(
    content.promotion.raw['structures'],
    'promotion.structures'
  ).map(v => record(v, 'structure'));
  for (const c of content.promotion.surfaceCells.filter(
    c => c.group === group
  )) {
    const placement = content.promotion.placements.find(
      p => p.group === group && p.cell === c.cell
    );
    const scale = placement
      ? pair(
          slots.find(s => s['slot'] === placement.slot)!['scale'],
          'structure.scale'
        )
      : ([1, 1] as const);
    const detailId = placement?.slot ?? 0;
    if (placement) {
      const g = content.geometry.get(placement.geometry)!;
      structures.set(
        placement.slot,
        new Map([
          [scale.join(','), readStructure(g.variants[placement.variant], g.id)]
        ])
      );
      const d = content.geometry.get(placement.detail)!;
      details.set(detailId, readDetail(d.variants['base'], d.id));
    }
    const ground = content.geometry.get(c.ground)!;
    const groundAddress = address(ground.record, `${ground.id}.record`);
    grounds.set(
      groundAddress,
      readGround(ground.variants[`transform=${c.transform}`], ground.id)
    );
    const key = placement?.key ?? 0;
    cells.push({
      alias: null,
      cell: c.cell,
      detail: detailId,
      ground: {
        address: groundAddress,
        index: c.orientation,
        transform: [0, 6, 3, 5, 1, 4, 2, 7][c.transform]!
      },
      key,
      keyBase: key > 0 && key <= 30 ? key / 2 + 29 : 0,
      origin: placement?.origin ?? [32_768, 32_768],
      palette: placement?.palette ?? 1,
      provenance: absent,
      roadPoints: new Map(
        Object.entries(c.roadPoints).map(([k, v]) => [Number(k), v])
      ),
      scale,
      slot: placement?.slot ?? 0,
      structure: placement?.slot ?? 0,
      tokenSet: key >= 160 ? (key - 160) / 2 : null,
      x: c.cell & 15,
      z: c.cell >> 4
    });
  }
  const coast: CoastSurface<DionCoastIsland> = {
    grid: { cellUnits: 65_536 },
    islands: body.islands.map(i => {
      const v = content.geometry.get(i.geometry)!.variants['base']!;

      return {
        boxes: [
          box(v['outer']),
          box(v['core']),
          ...list(v['sea'], 'island.sea').map(box)
        ],
        coastline: {
          edges: list(v['edges'], 'island.edges').map(v => {
            const e = record(v, 'island.edge');
            return (
              (int(e['to'], 'edge.to') << 8) | (int(e['from'], 'edge.from') * 4)
            );
          }),
          vertices: list(v['vertices'], 'island.vertices').map(v =>
            pair(v, 'island.vertex')
          )
        },
        id: i.id,
        landColour: i.landColour,
        origin: {
          x: i.origin[0] - home.origin[0],
          z: i.origin[1] - home.origin[1]
        }
      };
    })
  };
  const glyphs = new Map(
    Object.entries(record(support['glyphs'], 'support.glyphs')).map(
      ([k, v]) => [k, readGlyph(v, `glyphs.${k}`)]
    )
  );
  const palettes = new Map(
    Object.entries(record(support['palettes'], 'support.palettes')).map(
      ([k, v]) => {
        const p = record(v, `palettes.${k}`);
        return [
          Number(k),
          {
            day: ints(p['day'], 'palette.day', 64),
            night: ints(p['night'], 'palette.night', 64),
            provenance: provenance(p['provenance'], 'palette.provenance')
          }
        ] as const;
      }
    )
  );
  const residents: DionResident[] = list(
    content.gameplay.initial['residents'],
    'initial.residents'
  ).map(v => {
    const r = record(v, 'resident');
    const slot = int(r['slot'], 'resident.slot', 0, 255);
    return {
      association: int(r['association'], 'resident.association'),
      body: int(r['floor'], 'resident.floor'),
      cell: int(r['cell'], 'resident.cell'),
      group: int(r['group'], 'resident.group'),
      model: r['hasModel'] ? slot : null,
      position: triple(r['position'], 'resident.position'),
      slot,
      state: int(r['state'], 'resident.state'),
      yaw: int(r['yaw'], 'resident.yaw'),
      zone: int(r['zone'], 'resident.zone')
    };
  });
  const tokens = new Map<number, readonly number[]>();
  for (const [k, v] of Object.entries(
    record(support['tokens'], 'support.tokens')
  )) {
    const t = record(v, `tokens.${k}`);
    if (t['default'] !== undefined) {
      tokens.set(address(k, 'token'), ints(t['default'], 'token.default'));
    }
  }
  for (const [k, v] of Object.entries(
    record(content.gameplay.initial['liveTokens'], 'initial.liveTokens')
  )) {
    tokens.set(address(k, 'liveToken'), ints(v, `liveTokens.${k}`));
  }
  for (const [k, v] of Object.entries(
    record(content.gameplay.initial['faceTokens'], 'initial.faceTokens')
  )) {
    const output = int(
      record(v, 'faceToken')['output'],
      'faceToken.output',
      0,
      65_535
    );
    tokens.set(
      address(k, 'faceToken'),
      [output >>> 8, output & 255].filter(code => code !== 0)
    );
  }
  const palette = record(support['framePalette'], 'support.framePalette');
  const tail = content.geometry.get('sky-tail-0502c0')!.variants['base']!;
  const beacons = new Map<
    number,
    {
      dark: import('./world.ts').DionModel;
      gate: number | undefined;
      lit: import('./world.ts').DionModel;
    }
  >();
  for (const [entry, id] of content.gameplay.modelBindings) {
    const g = content.geometry.get(id)!;
    if (g.variants['state=lamp-lit;form=default']) {
      const header = record(
        (g as unknown as Record<string, unknown>)['header'],
        `${g.id}.header`
      );
      const value = int(header['value'], `${g.id}.header.value`);
      beacons.set(entry, {
        dark: playableModel(
          g as CatalogueGeometry,
          entry,
          [],
          'state=lamp-dark;'
        ),
        gate: value === 4 || value === 5 ? value : undefined,
        lit: playableModel(g as CatalogueGeometry, entry, [], 'state=lamp-lit;')
      });
    }
  }
  const opening = readDionOpening(content.gameplay.initial['opening']);
  return {
    ...base,
    blinkPhase: new Map(
      Object.entries(
        record(content.gameplay.raw['blinkPhase'], 'blinkPhase')
      ).map(([k, v]) => [Number(k), int(v, 'blinkPhase.value', 0, 65_535)])
    ),
    cells,
    coast,
    details,
    drawList: {
      fixed:
        group === 3
          ? [0, 220, 219, 181, 165, 16, 13, 3]
          : [0, 174, 58, 57, 56, 16, 13, 3],
      templateTop: 255
    },
    drawPriority: ints(
      record(support['drawPriority'], 'drawPriority')['bytes'],
      'drawPriority.bytes',
      82
    ),
    framePalette: {
      ...base.framePalette,
      fixed: new Map(
        Object.entries(record(palette['fixed'], 'palette.fixed')).map(
          ([k, v]) => [Number(k), int(v, 'palette.fixed.value')]
        )
      ),
      land: int(environment['land'], 'group.land'),
      road: int(environment['road'], 'group.road'),
      skyDay: int(environment['skyDay'], 'group.skyDay'),
      skyNight: int(environment['skyNight'], 'group.skyNight'),
      template: ints(palette['template'], 'palette.template', 17)
    },
    glyphs,
    grounds,
    lettering: { ...base.lettering, tokens },
    metisGroup: group,
    modelColours: ints(
      record(support['modelColours'], 'modelColours')['words'],
      'modelColours.words',
      60
    ),
    models: content.gameplay.models,
    opening: { ...opening, groupOrigin: home.origin },
    palettes,
    residents,
    rotationTable: ints(
      record(support['rotationTable'], 'rotationTable')['words'],
      'rotationTable.words',
      320
    ),
    structures,
    tourcraft: {
      arithmetic: content.arithmetic,
      beaconGates: new Map(
        Object.entries(
          record(content.gameplay.initial['beaconGates'], 'initial.beaconGates')
        ).map(([k, v]) => [Number(k), v === true])
      ),
      beacons,
      system: content.system,
      tail: {
        colour: int(tail['colour'], 'sky-tail.colour', 0, 0x7_77),
        faces: list(tail['faces'], 'sky-tail.faces').map(v =>
          ints(v, 'sky-tail.face', 3, 0, 4)
        ),
        vertices: list(tail['vertices'], 'sky-tail.vertices').map(v =>
          triple(v, 'sky-tail.vertex')
        )
      }
    }
  };
};

/// Default mutable presentation comes exclusively from the fresh gameplay capture.
/// I4 supplies later clock, Body, craft and programme state through the same inputs.
export const tourcraftOpeningFrameState = (
  content: TourcraftContent
): import('./frame.ts').DionFrameState => {
  const o = readDionOpening(content.gameplay.initial['opening']);
  const v = record(content.gameplay.initial['view'], 'initial.view');
  const yaw = int(v['yaw'], 'initial.view.yaw', 0, 65_535);
  const pitch = int(v['pitch'], 'initial.view.pitch', 0, 65_535);
  const roll = int(v['roll'], 'initial.view.roll', 0, 65_535);
  const tokens = new Map<number, readonly number[]>();
  for (const [k, value] of Object.entries(
    record(content.gameplay.initial['faceTokens'], 'initial.faceTokens')
  )) {
    const output = int(
      record(value, 'faceToken')['output'],
      'faceToken.output',
      0,
      65_535
    );
    tokens.set(
      address(k, 'faceToken'),
      [output >>> 8, output & 255].filter(code => code !== 0)
    );
  }
  return {
    cameraAngles: { pitch, roll, yaw },
    cell: o.cell,
    day: true,
    doors: new Map(),
    driverProfile: false,
    eye: triple(v['eye'], 'initial.view.eye'),
    frameCounter: (o.frameCounter - 1) & 65_535,
    heading: yaw,
    passenger: null,
    pilotHead: 279,
    pitch: o.pitch,
    region: o.region,
    residents: new Map(),
    roll: o.roll,
    signCode: 32,
    skyView: {
      body: o.location,
      clipRow: 68,
      day: true,
      latitude: int(v['latitude'], 'initial.view.latitude', 0, 1023),
      longitude: int(v['longitude'], 'initial.view.longitude', 0, 1023),
      pitch,
      roll,
      routine: 'onFoot',
      systemEye: [0, 0, 0],
      yaw
    },
    tokens
  };
};
