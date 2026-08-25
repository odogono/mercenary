import type * as Doc from './documents.ts';
import {
  asArray,
  asBool,
  asInt,
  asNumber,
  asObject,
  asOneOf,
  asString,
  intArray,
  intArrayArray,
  intArrayOfLength,
  intMap,
  intPair,
  numberArray,
  optional,
  stringArray,
  type Reader
} from './validate.ts';

/// Turning parsed JSON into the document types, field by field.
///
/// Each reader is a description of its document. They are dull on purpose: the interesting
/// question about a payload document is whether the port and the exporter agree about its
/// shape, and the way to keep that answerable is for the answer to be readable.

const point = (r: Reader, value: unknown, at: string): Doc.Point => {
  const o = asObject(r, value, at);
  return { x: asInt(r, o['x'], `${at}.x`), z: asInt(r, o['z'], `${at}.z`) };
};

const bounds = (r: Reader, value: unknown, at: string): Doc.Bounds => {
  const o = asObject(r, value, at);
  return {
    max: intArray(r, o['max'], `${at}.max`),
    min: intArray(r, o['min'], `${at}.min`)
  };
};

/// Where a Doorway leads. The payload writes either a room id or a `colonyCraft` flag, and
/// exactly one of them must be there — an opening that led nowhere would be a silent dead end.
const destination = (
  r: Reader,
  value: unknown,
  at: string
): Doc.Destination => {
  const o = asObject(r, value, at);
  const room = optional(o['room'], v => asInt(r, v, `${at}.room`));
  const colony = optional(o['colonyCraft'], v =>
    asBool(r, v, `${at}.colonyCraft`)
  );
  if (colony === true) {
    return { colonyCraft: true };
  }
  if (room !== undefined) {
    return { room };
  }
  return asOneOf(r, undefined, at, [
    'a room id or colonyCraft'
  ] as const) as never;
};

const manifest = (r: Reader, value: unknown): Doc.Manifest => {
  const o = asObject(r, value, '$');
  return {
    counts: intMap(r, o['counts'], 'counts'),
    decoderVersion: asInt(r, o['decoderVersion'], 'decoderVersion'),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion'),
    sourceCoreDigest: asString(r, o['sourceCoreDigest'], 'sourceCoreDigest'),
    sourceDatasetId: asString(r, o['sourceDatasetId'], 'sourceDatasetId')
  };
};

const roadSegment = (
  r: Reader,
  value: unknown,
  at: string
): Doc.RoadSegment => {
  const o = asObject(r, value, at);
  return {
    from: intArray(r, o['from'], `${at}.from`),
    slot: asInt(r, o['slot'], `${at}.slot`),
    to: intArray(r, o['to'], `${at}.to`)
  };
};

const world = (r: Reader, value: unknown): Doc.WorldDocument => {
  const o = asObject(r, value, '$');
  const grid = asObject(r, o['grid'], 'grid');
  return {
    bounds: bounds(r, o['bounds'], 'bounds'),
    grid: {
      cellSize: asInt(r, grid['cellSize'], 'grid.cellSize'),
      cellsPerAxis: asInt(r, grid['cellsPerAxis'], 'grid.cellsPerAxis')
    },
    highAltitudeMap: asArray(r, o['highAltitudeMap'], 'highAltitudeMap').map(
      (s, i) => roadSegment(r, s, `highAltitudeMap[${i}]`)
    ),
    roadAltitudeLookup: intArray(
      r,
      o['roadAltitudeLookup'],
      'roadAltitudeLookup'
    ),
    roadCells: asArray(r, o['roadCells'], 'roadCells').map((cell, i) => {
      const c = asObject(r, cell, `roadCells[${i}]`);
      return {
        cell: asInt(r, c['cell'], `roadCells[${i}].cell`),
        segments: asArray(r, c['segments'], `roadCells[${i}].segments`).map(
          (s, j) => roadSegment(r, s, `roadCells[${i}].segments[${j}]`)
        )
      };
    }),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion')
  };
};

const surface = (r: Reader, value: unknown): Doc.SurfaceDocument => {
  const o = asObject(r, value, '$');
  return {
    cells: asArray(r, o['cells'], 'cells').map((cell, i) => {
      const at = `cells[${i}]`;
      const c = asObject(r, cell, at);
      const rotation = optional(c['rotation'], v => {
        const rot = asObject(r, v, `${at}.rotation`);
        return {
          center: intArray(r, rot['center'], `${at}.rotation.center`),
          descriptor: asInt(r, rot['descriptor'], `${at}.rotation.descriptor`)
        };
      });
      return {
        cell: asInt(r, c['cell'], `${at}.cell`),
        grid: intArray(r, c['grid'], `${at}.grid`),
        ...(optional(c['structure'], v => asString(r, v, `${at}.structure`)) !==
        undefined
          ? { structure: asString(r, c['structure'], `${at}.structure`) }
          : {}),
        edges: intArrayArray(r, c['edges'], `${at}.edges`),
        vertices: asArray(r, c['vertices'], `${at}.vertices`).map(
          (vertex, j) => {
            const vat = `${at}.vertices[${j}]`;
            const v = asObject(r, vertex, vat);
            const kind = asOneOf(r, v['kind'], `${vat}.kind`, [
              'world-point',
              'rotated-input'
            ] as const);
            const position = optional(v['position'], p =>
              intArray(r, p, `${vat}.position`)
            );
            const rotationInput = optional(v['rotationInput'], p =>
              intArray(r, p, `${vat}.rotationInput`)
            );
            return {
              kind,
              ...(position !== undefined ? { position } : {}),
              ...(rotationInput !== undefined ? { rotationInput } : {})
            };
          }
        ),
        ...(rotation !== undefined ? { rotation } : {})
      };
    }),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion')
  };
};

const objects = (r: Reader, value: unknown): Doc.ObjectsDocument => {
  const o = asObject(r, value, '$');
  return {
    instances: asArray(r, o['instances'], 'instances').map((instance, i) => {
      const at = `instances[${i}]`;
      const n = asObject(r, instance, at);
      const visibility = asObject(r, n['visibility'], `${at}.visibility`);
      const orientation = optional(n['orientation'], v =>
        intArray(r, v, `${at}.orientation`)
      );
      return {
        id: asString(r, n['id'], `${at}.id`),
        model: asString(r, n['model'], `${at}.model`),
        position: intArray(r, n['position'], `${at}.position`),
        slot: asInt(r, n['slot'], `${at}.slot`),
        ...(orientation !== undefined ? { orientation } : {}),
        placement: asString(r, n['placement'], `${at}.placement`),
        room: asInt(r, n['room'], `${at}.room`),
        rotatable: asBool(r, n['rotatable'], `${at}.rotatable`),
        stateFlags: asInt(r, n['stateFlags'], `${at}.stateFlags`),
        visibility: {
          detailCubePerAxis: asInt(
            r,
            visibility['detailCubePerAxis'],
            `${at}.visibility.detailCubePerAxis`
          ),
          farRepresentation: asString(
            r,
            visibility['farRepresentation'],
            `${at}.visibility.farRepresentation`
          )
        }
      };
    }),
    models: asArray(r, o['models'], 'models').map((model, i) => {
      const at = `models[${i}]`;
      const m = asObject(r, model, at);
      return {
        edges: intArrayArray(r, m['edges'], `${at}.edges`),
        id: asString(r, m['id'], `${at}.id`),
        vertices: intArrayArray(r, m['vertices'], `${at}.vertices`)
      };
    }),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion')
  };
};

const doorway = (r: Reader, value: unknown, at: string): Doc.Doorway => {
  const d = asObject(r, value, at);
  const arrival = optional(d['arrival'], v => point(r, v, `${at}.arrival`));
  const lock = optional(d['lock'], v => {
    const l = asObject(r, v, `${at}.lock`);
    return {
      class: asInt(r, l['class'], `${at}.lock.class`),
      requiresObject: asInt(r, l['requiresObject'], `${at}.lock.requiresObject`)
    };
  });
  return {
    arrivalCommandIndex: asInt(
      r,
      d['arrivalCommandIndex'],
      `${at}.arrivalCommandIndex`
    ),
    destination: destination(r, d['destination'], `${at}.destination`),
    index: asInt(r, d['index'], `${at}.index`),
    plane: asString(r, d['plane'], `${at}.plane`),
    position: point(r, d['position'], `${at}.position`),
    shape: asInt(r, d['shape'], `${at}.shape`),
    ...(arrival !== undefined ? { arrival } : {}),
    arrivalWithinDestination: asBool(
      r,
      d['arrivalWithinDestination'],
      `${at}.arrivalWithinDestination`
    ),
    ...(lock !== undefined ? { lock } : {})
  };
};

/// Arriving in a Room starts a script or shows a message, and never both.
const entry = (r: Reader, value: unknown, at: string): Doc.Entry => {
  const e = asObject(r, value, at);
  const script = optional(e['script'], v => asInt(r, v, `${at}.script`));
  if (script !== undefined) {
    return { script };
  }
  return { message: asInt(r, e['message'], `${at}.message`) };
};

const rooms = (r: Reader, value: unknown): Doc.RoomsDocument => {
  const o = asObject(r, value, '$');
  const rules = asObject(r, o['doorwayRules'], 'doorwayRules');
  const arrival = asObject(
    r,
    rules['colonyCraftArrival'],
    'doorwayRules.colonyCraftArrival'
  );
  const int = (
    holder: Record<string, unknown>,
    key: string,
    at: string
  ): number => asInt(r, holder[key], `${at}.${key}`);
  return {
    doorwayRules: {
      alongWallBias: int(rules, 'alongWallBias', 'doorwayRules'),
      colonyCraftArrival: {
        x: int(arrival, 'x', 'doorwayRules.colonyCraftArrival'),
        y: int(arrival, 'y', 'doorwayRules.colonyCraftArrival'),
        z: int(arrival, 'z', 'doorwayRules.colonyCraftArrival')
      },
      colonyCraftSlot: int(rules, 'colonyCraftSlot', 'doorwayRules'),
      cooldownFrames: int(rules, 'cooldownFrames', 'doorwayRules'),
      darkMessage: int(rules, 'darkMessage', 'doorwayRules'),
      depthHalfWindow: int(rules, 'depthHalfWindow', 'doorwayRules'),
      farMargin: int(rules, 'farMargin', 'doorwayRules'),
      headingRounding: int(rules, 'headingRounding', 'doorwayRules'),
      keySlotBias: int(rules, 'keySlotBias', 'doorwayRules'),
      lineColour: int(rules, 'lineColour', 'doorwayRules'),
      lockBoundary: int(rules, 'lockBoundary', 'doorwayRules'),
      lockedMessage: int(rules, 'lockedMessage', 'doorwayRules'),
      nearMargin: int(rules, 'nearMargin', 'doorwayRules'),
      photonEmitterSlot: int(rules, 'photonEmitterSlot', 'doorwayRules'),
      randomRoom: int(rules, 'randomRoom', 'doorwayRules'),
      skeletonKeySlot: int(rules, 'skeletonKeySlot', 'doorwayRules'),
      stepInterlock: int(rules, 'stepInterlock', 'doorwayRules'),
      transitionColours: intArray(
        r,
        rules['transitionColours'],
        'doorwayRules.transitionColours'
      ),
      wallThudSound: int(rules, 'wallThudSound', 'doorwayRules'),
      worldFlipCooldownFrames: int(
        rules,
        'worldFlipCooldownFrames',
        'doorwayRules'
      ),
      worldFlipInputRemap: intArray(
        r,
        rules['worldFlipInputRemap'],
        'doorwayRules.worldFlipInputRemap'
      ),
      worldFlipRoom: int(rules, 'worldFlipRoom', 'doorwayRules')
    },
    rooms: asArray(r, o['rooms'], 'rooms').map((room, i) => {
      const at = `rooms[${i}]`;
      const m = asObject(r, room, at);
      const palette = asObject(r, m['palette'], `${at}.palette`);
      const entryValue = optional(m['entry'], v => entry(r, v, `${at}.entry`));
      const setup = optional(m['specialSetup'], v => {
        const s = asObject(r, v, `${at}.specialSetup`);
        return {
          alternates: asArray(
            r,
            s['alternates'],
            `${at}.specialSetup.alternates`
          ).map((alternate, j) => {
            const aat = `${at}.specialSetup.alternates[${j}]`;
            const a = asObject(r, alternate, aat);
            const alternateArrival = optional(a['arrival'], v2 =>
              point(r, v2, `${aat}.arrival`)
            );
            return {
              arrivalCommandIndex: asInt(
                r,
                a['arrivalCommandIndex'],
                `${aat}.arrivalCommandIndex`
              ),
              destination: destination(
                r,
                a['destination'],
                `${aat}.destination`
              ),
              room: asInt(r, a['room'], `${aat}.room`),
              ...(alternateArrival !== undefined
                ? { arrival: alternateArrival }
                : {}),
              arrivalWithinDestination: asBool(
                r,
                a['arrivalWithinDestination'],
                `${aat}.arrivalWithinDestination`
              )
            };
          }),
          selector: asOneOf(r, s['selector'], `${at}.specialSetup.selector`, [
            'random',
            'previousRoom'
          ] as const)
        };
      });
      return {
        bounds: bounds(r, m['bounds'], `${at}.bounds`),
        dark: asBool(r, m['dark'], `${at}.dark`),
        edges: intArrayArray(r, m['edges'], `${at}.edges`),
        palette: {
          background: asInt(
            r,
            palette['background'],
            `${at}.palette.background`
          ),
          foreground: asInt(
            r,
            palette['foreground'],
            `${at}.palette.foreground`
          )
        },
        room: asInt(r, m['room'], `${at}.room`),
        vertices: intArrayArray(r, m['vertices'], `${at}.vertices`),
        ...(entryValue !== undefined ? { entry: entryValue } : {}),
        ...(setup !== undefined ? { specialSetup: setup } : {}),
        doorways: asArray(r, m['doorways'], `${at}.doorways`).map((d, j) =>
          doorway(r, d, `${at}.doorways[${j}]`)
        )
      };
    }),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion')
  };
};

const token = (r: Reader, value: unknown, at: string): Doc.Token => {
  const t = asObject(r, value, at);
  const word = optional(t['word'], v => asInt(r, v, `${at}.word`));
  const literal = optional(t['text'], v => asString(r, v, `${at}.text`));
  const slot = optional(t['slot'], v => asInt(r, v, `${at}.slot`));
  return {
    kind: asString(r, t['kind'], `${at}.kind`),
    ...(word !== undefined ? { word } : {}),
    ...(literal !== undefined ? { text: literal } : {}),
    ...(slot !== undefined ? { slot } : {})
  };
};

const branch = (r: Reader, value: unknown, at: string): Doc.BensonBranch => {
  const o = asObject(r, value, at);
  return {
    kind: asString(r, o['kind'], `${at}.kind`),
    target: asInt(r, o['target'], `${at}.target`)
  };
};

const bensonInstruction = (
  r: Reader,
  value: unknown,
  at: string
): Doc.BensonInstruction => {
  const o = asObject(r, value, at);
  const field = <K extends keyof Doc.BensonInstruction>(
    name: K,
    read: (value: unknown) => NonNullable<Doc.BensonInstruction[K]>
  ): Partial<Doc.BensonInstruction> => {
    const parsed = optional(o[name as string], read);
    return parsed === undefined ? {} : { [name]: parsed };
  };
  return {
    op: asString(r, o['op'], `${at}.op`),
    ...field('a', v => asInt(r, v, `${at}.a`)),
    ...field('b', v => asInt(r, v, `${at}.b`)),
    ...field('base', v => asInt(r, v, `${at}.base`)),
    ...field('branchOn', v => asBool(r, v, `${at}.branchOn`)),
    ...field('byte', v => asInt(r, v, `${at}.byte`)),
    ...field('craft', v => asInt(r, v, `${at}.craft`)),
    ...field('decimal', v => asInt(r, v, `${at}.decimal`)),
    ...field('from', v => asInt(r, v, `${at}.from`)),
    ...field('index', v => asInt(r, v, `${at}.index`)),
    ...field('into', v => asInt(r, v, `${at}.into`)),
    ...field('key', v => asString(r, v, `${at}.key`)),
    ...field('mask', v => asInt(r, v, `${at}.mask`)),
    ...field('mode', v => asString(r, v, `${at}.mode`)),
    ...field('onTaken', v => branch(r, v, `${at}.onTaken`)),
    ...field('register', v => asInt(r, v, `${at}.register`)),
    ...field('slot', v => asInt(r, v, `${at}.slot`)),
    ...field('source', v => asString(r, v, `${at}.source`)),
    ...field('symbol', v => asString(r, v, `${at}.symbol`)),
    ...field('target', v => asInt(r, v, `${at}.target`)),
    ...field('ticks', v => asInt(r, v, `${at}.ticks`)),
    ...field('to', v => asInt(r, v, `${at}.to`)),
    ...field('tokens', v =>
      asArray(r, v, `${at}.tokens`).map((item, i) =>
        token(r, item, `${at}.tokens[${i}]`)
      )
    ),
    ...field('value', v => asInt(r, v, `${at}.value`))
  };
};

const benson = (r: Reader, value: unknown): Doc.BensonDocument => {
  const o = asObject(r, value, '$');
  return {
    counts: intMap(r, o['counts'], 'counts'),
    decimalSeeds: intMap(r, o['decimalSeeds'], 'decimalSeeds'),
    framesPerTick: asInt(r, o['framesPerTick'], 'framesPerTick'),
    instructions: asArray(r, o['instructions'], 'instructions').map((item, i) =>
      bensonInstruction(r, item, `instructions[${i}]`)
    ),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion'),
    scripts: asArray(r, o['scripts'], 'scripts').map((item, i) => {
      const at = `scripts[${i}]`;
      const s = asObject(r, item, at);
      return {
        entry: asInt(r, s['entry'], `${at}.entry`),
        id: asInt(r, s['id'], `${at}.id`)
      };
    })
  };
};

const text = (r: Reader, value: unknown): Doc.TextDocument => {
  const o = asObject(r, value, '$');
  return {
    counts: intMap(r, o['counts'], 'counts'),
    messages: asArray(r, o['messages'], 'messages').map((message, i) => {
      const at = `messages[${i}]`;
      const m = asObject(r, message, at);
      return {
        index: asInt(r, m['index'], `${at}.index`),
        text: asString(r, m['text'], `${at}.text`),
        tokens: asArray(r, m['tokens'], `${at}.tokens`).map((item, j) =>
          token(r, item, `${at}.tokens[${j}]`)
        )
      };
    }),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion'),
    unresolvedCodes: stringArray(r, o['unresolvedCodes'], 'unresolvedCodes'),
    words: asArray(r, o['words'], 'words').map((word, i) => {
      const at = `words[${i}]`;
      const w = asObject(r, word, at);
      return {
        index: asInt(r, w['index'], `${at}.index`),
        suffix: asBool(r, w['suffix'], `${at}.suffix`),
        text: asString(r, w['text'], `${at}.text`),
        unused: asBool(r, w['unused'], `${at}.unused`)
      };
    })
  };
};

const flight = (r: Reader, value: unknown): Doc.FlightDocument => {
  const o = asObject(r, value, '$');
  const rules = asObject(r, o['rules'], 'rules');
  const poweramp = asObject(r, rules['poweramp'], 'rules.poweramp');
  const walk = asObject(r, o['walk'], 'walk');
  return {
    blocks: asArray(r, o['blocks'], 'blocks').map((block, i) => {
      const at = `blocks[${i}]`;
      const b = asObject(r, block, at);
      const mode = optional(b['mode'], v => asString(r, v, `${at}.mode`));
      const tumble = optional(b['tumble'], v => {
        const t = asObject(r, v, `${at}.tumble`);
        return {
          altitudeDrop: asInt(
            r,
            t['altitudeDrop'],
            `${at}.tumble.altitudeDrop`
          ),
          pitchStep: asInt(r, t['pitchStep'], `${at}.tumble.pitchStep`),
          rollStep: asInt(r, t['rollStep'], `${at}.tumble.rollStep`),
          yawStep: asInt(r, t['yawStep'], `${at}.tumble.yawStep`)
        };
      });
      return {
        handler: asOneOf(r, b['handler'], `${at}.handler`, [
          'standard',
          'sinking',
          'slot7',
          'tumble',
          'descent'
        ] as const),
        index: asInt(r, b['index'], `${at}.index`),
        ...(mode !== undefined ? { mode } : {}),
        ceiling: asInt(r, b['ceiling'], `${at}.ceiling`),
        liftFactor: asNumber(r, b['liftFactor'], `${at}.liftFactor`),
        pitchStep: asInt(r, b['pitchStep'], `${at}.pitchStep`),
        rollCoupling: asNumber(r, b['rollCoupling'], `${at}.rollCoupling`),
        speedDamping: asNumber(r, b['speedDamping'], `${at}.speedDamping`),
        throttleGain: asNumber(r, b['throttleGain'], `${at}.throttleGain`),
        yawAuthority: asNumber(r, b['yawAuthority'], `${at}.yawAuthority`),
        yawDamping: asNumber(r, b['yawDamping'], `${at}.yawDamping`),
        ...(tumble !== undefined ? { tumble } : {})
      };
    }),
    counts: intMap(r, o['counts'], 'counts'),
    rules: {
      angleUnitsPerTurn: asInt(
        r,
        rules['angleUnitsPerTurn'],
        'rules.angleUnitsPerTurn'
      ),
      ceilingClimbScale: asNumber(
        r,
        rules['ceilingClimbScale'],
        'rules.ceilingClimbScale'
      ),
      ceilingUnit: asInt(r, rules['ceilingUnit'], 'rules.ceilingUnit'),
      crashDescentRate: asNumber(
        r,
        rules['crashDescentRate'],
        'rules.crashDescentRate'
      ),
      crashPitch: asInt(r, rules['crashPitch'], 'rules.crashPitch'),
      groundAltitude: asInt(r, rules['groundAltitude'], 'rules.groundAltitude'),
      groundBand: asInt(r, rules['groundBand'], 'rules.groundBand'),
      levelPitch: asInt(r, rules['levelPitch'], 'rules.levelPitch'),
      poweramp: {
        ceiling: asInt(r, poweramp['ceiling'], 'rules.poweramp.ceiling'),
        craft: asInt(r, poweramp['craft'], 'rules.poweramp.craft'),
        throttleScale: asNumber(
          r,
          poweramp['throttleScale'],
          'rules.poweramp.throttleScale'
        )
      },
      takeoffSpeed: asNumber(r, rules['takeoffSpeed'], 'rules.takeoffSpeed'),
      throttleLimit: asNumber(r, rules['throttleLimit'], 'rules.throttleLimit'),
      throttleNotches: numberArray(
        r,
        rules['throttleNotches'],
        'rules.throttleNotches'
      ),
      walkingBlock: asInt(r, rules['walkingBlock'], 'rules.walkingBlock')
    },
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion'),
    walk: {
      step: asNumber(r, walk['step'], 'walk.step'),
      turnStep: asInt(r, walk['turnStep'], 'walk.turnStep')
    }
  };
};

const interaction = (r: Reader, value: unknown): Doc.InteractionDocument => {
  const o = asObject(r, value, '$');
  return {
    boardKey: asInt(r, o['boardKey'], 'boardKey'),
    boardRange: asInt(r, o['boardRange'], 'boardRange'),
    carriedMask: asInt(r, o['carriedMask'], 'carriedMask'),
    counts: intMap(r, o['counts'], 'counts'),
    craftSlotBound: asInt(r, o['craftSlotBound'], 'craftSlotBound'),
    descriptionMask: asInt(r, o['descriptionMask'], 'descriptionMask'),
    fixedMask: asInt(r, o['fixedMask'], 'fixedMask'),
    heavyMask: asInt(r, o['heavyMask'], 'heavyMask'),
    inventoryLimit: asInt(r, o['inventoryLimit'], 'inventoryLimit'),
    rangeUnit: asInt(r, o['rangeUnit'], 'rangeUnit'),
    removedFromWorld: asInt(r, o['removedFromWorld'], 'removedFromWorld'),
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion'),
    takeKey: asInt(r, o['takeKey'], 'takeKey'),
    takeRange: asInt(r, o['takeRange'], 'takeRange'),
    tooHeavyMessage: asInt(r, o['tooHeavyMessage'], 'tooHeavyMessage')
  };
};

const jsonValue = (r: Reader, value: unknown, path: string): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    return asNumber(r, value, path);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => jsonValue(r, item, `${path}[${index}]`));
  }
  const source = asObject(r, value, path);
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      jsonValue(r, item, `${path}.${key}`)
    ])
  );
};

const jsonObject = (
  r: Reader,
  value: unknown,
  path: string
): Readonly<Record<string, unknown>> =>
  jsonValue(r, asObject(r, value, path), path) as Readonly<
    Record<string, unknown>
  >;

const validateInterstellarShipField = (
  r: Reader,
  field: Record<string, unknown>
): void => {
  const root = 'endingPresentation.interstellarShipField';
  const at = (suffix: string): string => `${root}.${suffix}`;
  const integerTree = (value: unknown, path: string): void => {
    const branch = asObject(r, value, path);
    for (const [key, child] of Object.entries(branch)) {
      const childPath = `${path}.${key}`;
      if (
        typeof child === 'object' &&
        child !== null &&
        !Array.isArray(child)
      ) {
        integerTree(child, childPath);
      } else {
        asInt(r, child, childPath);
      }
    }
  };
  const storage = asObject(r, field['storage'], at('storage'));
  const components = asObject(
    r,
    storage['components'],
    at('storage.components')
  );
  for (const axis of ['x', 'y', 'z']) {
    const component = asObject(
      r,
      components[axis],
      at(`storage.components.${axis}`)
    );
    asInt(
      r,
      component['mantissaBase'],
      at(`storage.components.${axis}.mantissaBase`)
    );
    asInt(
      r,
      component['exponentBase'],
      at(`storage.components.${axis}.exponentBase`)
    );
  }
  const screens = asObject(
    r,
    storage['screenPositions'],
    at('storage.screenPositions')
  );
  for (const generation of ['current', 'prior']) {
    const position = asObject(
      r,
      screens[generation],
      at(`storage.screenPositions.${generation}`)
    );
    asInt(
      r,
      position['xBase'],
      at(`storage.screenPositions.${generation}.xBase`)
    );
    asInt(
      r,
      position['yBase'],
      at(`storage.screenPositions.${generation}.yBase`)
    );
  }
  asInt(r, storage['slotsPerArray'], at('storage.slotsPerArray'));

  const initialization = asObject(
    r,
    field['initialization'],
    at('initialization')
  );
  for (const [index, rawStage] of asArray(
    r,
    initialization['stages'],
    at('initialization.stages')
  ).entries()) {
    const path = at(`initialization.stages[${index}]`);
    const stage = asObject(r, rawStage, path);
    asString(r, stage['name'], `${path}.name`);
    for (const key of [
      'priorXYComponents',
      'reason',
      'result',
      'screenClear'
    ]) {
      if (stage[key] !== undefined) {
        asString(r, stage[key], `${path}.${key}`);
      }
    }
    if (stage['writes'] !== undefined) {
      stringArray(r, stage['writes'], `${path}.writes`);
    }
  }

  const motion = asObject(r, field['motion'], at('motion'));
  asString(r, motion['phaseBranch'], at('motion.phaseBranch'));
  intArray(r, motion['provenPhaseValues'], at('motion.provenPhaseValues'));
  for (const key of [
    'scriptedPhaseDepthDelta',
    'maturePhaseFirstMultiplier',
    'maturePhaseLaterMultiplier'
  ]) {
    asNumber(r, motion[key], at(`motion.${key}`));
  }
  for (const key of [
    'maturePhaseStopsAtExponent',
    'accelerationSideStateAddress'
  ]) {
    asInt(r, motion[key], at(`motion.${key}`));
  }
  asString(
    r,
    motion['accelerationSideByteEffect'],
    at('motion.accelerationSideByteEffect')
  );

  const projection = asObject(r, field['projection'], at('projection'));
  for (const axis of ['horizontal', 'vertical']) {
    const projected = asObject(r, projection[axis], at(`projection.${axis}`));
    asInt(r, projected['centre'], at(`projection.${axis}.centre`));
    intArray(r, projected['range'], at(`projection.${axis}.range`));
  }
  stringArray(r, projection['invalidity'], at('projection.invalidity'));

  const respawn = asObject(r, field['respawn'], at('respawn'));
  for (const key of ['lifetime', 'trigger', 'carryIn']) {
    asString(r, respawn[key], at(`respawn.${key}`));
  }
  asInt(r, respawn['randomDraws'], at('respawn.randomDraws'));
  stringArray(
    r,
    respawn['replacesComponents'],
    at('respawn.replacesComponents')
  );
  for (const axis of ['x', 'y']) {
    const generated = asObject(r, respawn[axis], at(`respawn.${axis}`));
    intArray(r, generated['draws'], at(`respawn.${axis}.draws`));
    asInt(r, generated['highMask'], at(`respawn.${axis}.highMask`));
    asInt(r, generated['highOffset'], at(`respawn.${axis}.highOffset`));
    intArray(r, generated['range'], at(`respawn.${axis}.range`));
  }
  const y = asObject(r, respawn['y'], at('respawn.y'));
  asInt(r, y['discardedLowDraw'], at('respawn.y.discardedLowDraw'));
  asString(r, y['conversionLowSource'], at('respawn.y.conversionLowSource'));
  const z = asObject(r, respawn['z'], at('respawn.z'));
  for (const key of ['draw', 'exponent', 'step']) {
    asInt(r, z[key], at(`respawn.z.${key}`));
  }
  intArray(r, z['range'], at('respawn.z.range'));
  const generator = asObject(r, respawn['generator'], at('respawn.generator'));
  asInt(r, generator['routineAddress'], at('respawn.generator.routineAddress'));
  for (const key of ['carryIn', 'output', 'recurrence']) {
    asString(r, generator[key], at(`respawn.generator.${key}`));
  }
  const generatorState = asObject(
    r,
    generator['state'],
    at('respawn.generator.state')
  );
  for (const key of ['valueAddress', 'stateAddress', 'bytes']) {
    asInt(r, generatorState[key], at(`respawn.generator.state.${key}`));
  }

  const colours = asObject(r, field['colours'], at('colours'));
  for (const key of [
    'entryDelayLoops',
    'repeatedDelayLoops',
    'completedPhaseLoop',
    'repeatFinalEveryLoops'
  ]) {
    asInt(r, colours[key], at(`colours.${key}`));
  }
  asString(r, colours['storageQuirk'], at('colours.storageQuirk'));
  for (const [index, rawEvent] of asArray(
    r,
    colours['events'],
    at('colours.events')
  ).entries()) {
    const path = at(`colours.events[${index}]`);
    const event = asObject(r, rawEvent, path);
    for (const key of ['loop', 'lineColour', 'screenColour']) {
      asInt(r, event[key], `${path}.${key}`);
    }
    if (event['phaseWrite'] !== null) {
      asInt(r, event['phaseWrite'], `${path}.phaseWrite`);
    }
  }

  for (const [index, rawState] of asArray(
    r,
    field['continuationState'],
    at('continuationState')
  ).entries()) {
    const path = at(`continuationState[${index}]`);
    const state = asObject(r, rawState, path);
    asString(r, state['name'], `${path}.name`);
    if (state['addresses'] !== undefined) {
      intArray(r, state['addresses'], `${path}.addresses`);
    }
    if (state['slots'] !== undefined) {
      asInt(r, state['slots'], `${path}.slots`);
    }
    if (state['semanticContinuation'] !== undefined) {
      asBool(r, state['semanticContinuation'], `${path}.semanticContinuation`);
    }
    if (state['storage'] !== undefined) {
      integerTree(state['storage'], `${path}.storage`);
    }
  }
};

/// The city table has one entry per surface cell.
const SITE_TABLE_LENGTH = 256;

const endgame = (r: Reader, value: unknown): Doc.EndgameDocument => {
  const o = asObject(r, value, '$');
  const controls = asObject(r, o['controls'], 'controls');
  const drop = asObject(r, controls['drop'], 'controls.drop');
  const takeOverrides = asObject(
    r,
    controls['takeOverrides'],
    'controls.takeOverrides'
  );
  const combat = asObject(r, o['combat'], 'combat');
  const fire = asObject(r, combat['fire'], 'combat.fire');
  const hostile = asObject(r, combat['hostileCraft'], 'combat.hostileCraft');
  const hits = asObject(r, combat['objectHits'], 'combat.objectHits');
  const destruction = asObject(
    r,
    combat['siteDestruction'],
    'combat.siteDestruction'
  );
  const objective = asObject(
    r,
    destruction['factionObjective'],
    'combat.siteDestruction.factionObjective'
  );
  const counts = asObject(
    r,
    destruction['initialCounts'],
    'combat.siteDestruction.initialCounts'
  );
  /// One byte per surface cell: a short table would leave cells unreachable
  /// rather than fail, so the width is checked here and not inferred later.
  const siteTable = intArrayOfLength(
    r,
    destruction['initialTable'],
    'combat.siteDestruction.initialTable',
    SITE_TABLE_LENGTH
  );
  const orbital = asObject(r, o['orbitalTransition'], 'orbitalTransition');
  const orbitalEntry = asObject(r, orbital['entry'], 'orbitalTransition.entry');
  const ending = asObject(r, o['endingPresentation'], 'endingPresentation');
  const delivery = asObject(r, o['shipDelivery'], 'shipDelivery');
  const descent = asObject(r, delivery['descent'], 'shipDelivery.descent');
  const initialisation = asObject(
    r,
    delivery['initialisation'],
    'shipDelivery.initialisation'
  );
  const landing = asObject(r, delivery['landing'], 'shipDelivery.landing');
  const field = asObject(
    r,
    ending['interstellarShipField'],
    'endingPresentation.interstellarShipField'
  );
  const pointSlots = asObject(
    r,
    field['pointSlots'],
    'endingPresentation.interstellarShipField.pointSlots'
  );
  validateInterstellarShipField(r, field);
  return {
    combat: {
      fire: {
        directionOffset: asInt(
          r,
          fire['directionOffset'],
          'combat.fire.directionOffset'
        ),
        effectSlot: asInt(r, fire['effectSlot'], 'combat.fire.effectSlot'),
        exponentUnitsPerOctave: asInt(
          r,
          fire['exponentUnitsPerOctave'],
          'combat.fire.exponentUnitsPerOctave'
        ),
        inputActiveValue: asInt(
          r,
          fire['inputActiveValue'],
          'combat.fire.inputActiveValue'
        ),
        lifecycleFrames: asInt(
          r,
          fire['lifecycleFrames'],
          'combat.fire.lifecycleFrames'
        ),
        oneActiveShot: asBool(
          r,
          fire['oneActiveShot'],
          'combat.fire.oneActiveShot'
        ),
        sound: asInt(r, fire['sound'], 'combat.fire.sound'),
        speedPerFrame: asInt(
          r,
          fire['speedPerFrame'],
          'combat.fire.speedPerFrame'
        ),
        walkingMoverProhibited: asBool(
          r,
          fire['walkingMoverProhibited'],
          'combat.fire.walkingMoverProhibited'
        )
      },
      hostileCraft: {
        approachAimShift: asInt(
          r,
          hostile['approachAimShift'],
          'combat.hostileCraft.approachAimShift'
        ),
        approachDelayLifecycle: asInt(
          r,
          hostile['approachDelayLifecycle'],
          'combat.hostileCraft.approachDelayLifecycle'
        ),
        attackingSlot: asInt(
          r,
          hostile['attackingSlot'],
          'combat.hostileCraft.attackingSlot'
        ),
        captureClearsAttackingShip: asBool(
          r,
          hostile['captureClearsAttackingShip'],
          'combat.hostileCraft.captureClearsAttackingShip'
        ),
        captureMover: asInt(
          r,
          hostile['captureMover'],
          'combat.hostileCraft.captureMover'
        ),
        captureRemovesSlots: intArray(
          r,
          hostile['captureRemovesSlots'],
          'combat.hostileCraft.captureRemovesSlots'
        ),
        enabledByAttackingShip: asBool(
          r,
          hostile['enabledByAttackingShip'],
          'combat.hostileCraft.enabledByAttackingShip'
        ),
        firingRange: asInt(
          r,
          hostile['firingRange'],
          'combat.hostileCraft.firingRange'
        ),
        hitCubeSize: asInt(
          r,
          hostile['hitCubeSize'],
          'combat.hostileCraft.hitCubeSize'
        ),
        hitSound: asInt(r, hostile['hitSound'], 'combat.hostileCraft.hitSound'),
        inboundAimShift: asInt(
          r,
          hostile['inboundAimShift'],
          'combat.hostileCraft.inboundAimShift'
        ),
        inboundLifecycleFrames: asInt(
          r,
          hostile['inboundLifecycleFrames'],
          'combat.hostileCraft.inboundLifecycleFrames'
        ),
        inboundSlot: asInt(
          r,
          hostile['inboundSlot'],
          'combat.hostileCraft.inboundSlot'
        ),
        inboundSound: asInt(
          r,
          hostile['inboundSound'],
          'combat.hostileCraft.inboundSound'
        ),
        parkedLifecycle: asInt(
          r,
          hostile['parkedLifecycle'],
          'combat.hostileCraft.parkedLifecycle'
        ),
        rangeUnit: asInt(
          r,
          hostile['rangeUnit'],
          'combat.hostileCraft.rangeUnit'
        ),
        shipDestroyedMessage: asInt(
          r,
          hostile['shipDestroyedMessage'],
          'combat.hostileCraft.shipDestroyedMessage'
        ),
        surfaceOnly: asBool(
          r,
          hostile['surfaceOnly'],
          'combat.hostileCraft.surfaceOnly'
        )
      },
      objectHits: {
        clearsAttackState: asBool(
          r,
          hits['clearsAttackState'],
          'combat.objectHits.clearsAttackState'
        ),
        cubeSize: asInt(r, hits['cubeSize'], 'combat.objectHits.cubeSize'),
        cubeUnit: asInt(r, hits['cubeUnit'], 'combat.objectHits.cubeUnit'),
        firstTargetMessage: asInt(
          r,
          hits['firstTargetMessage'],
          'combat.objectHits.firstTargetMessage'
        ),
        removesTarget: asBool(
          r,
          hits['removesTarget'],
          'combat.objectHits.removesTarget'
        ),
        secondTargetScript: asInt(
          r,
          hits['secondTargetScript'],
          'combat.objectHits.secondTargetScript'
        ),
        sound: asInt(r, hits['sound'], 'combat.objectHits.sound'),
        surfaceTargetsOnly: asBool(
          r,
          hits['surfaceTargetsOnly'],
          'combat.objectHits.surfaceTargetsOnly'
        ),
        targetSlots: intArray(
          r,
          hits['targetSlots'],
          'combat.objectHits.targetSlots'
        )
      },
      siteDestruction: {
        alreadyDestroyedIsInert: asBool(
          r,
          destruction['alreadyDestroyedIsInert'],
          'combat.siteDestruction.alreadyDestroyedIsInert'
        ),
        altitudeMidByteLimit: asInt(
          r,
          destruction['altitudeMidByteLimit'],
          'combat.siteDestruction.altitudeMidByteLimit'
        ),
        axisWindow: intArray(
          r,
          destruction['axisWindow'],
          'combat.siteDestruction.axisWindow'
        ),
        cellDepthAxisIsHighNibble: asBool(
          r,
          destruction['cellDepthAxisIsHighNibble'],
          'combat.siteDestruction.cellDepthAxisIsHighNibble'
        ),
        destroyedMask: asInt(
          r,
          destruction['destroyedMask'],
          'combat.siteDestruction.destroyedMask'
        ),
        factionObjective: {
          comparison: asString(
            r,
            objective['comparison'],
            'combat.siteDestruction.factionObjective.comparison'
          ),
          mechanoidScript: asInt(
            r,
            objective['mechanoidScript'],
            'combat.siteDestruction.factionObjective.mechanoidScript'
          ),
          negativeOnesComplement: asBool(
            r,
            objective['negativeOnesComplement'],
            'combat.siteDestruction.factionObjective.negativeOnesComplement'
          ),
          palyarScript: asInt(
            r,
            objective['palyarScript'],
            'combat.siteDestruction.factionObjective.palyarScript'
          ),
          threshold: asInt(
            r,
            objective['threshold'],
            'combat.siteDestruction.factionObjective.threshold'
          )
        },
        impactFrames: asInt(
          r,
          destruction['impactFrames'],
          'combat.siteDestruction.impactFrames'
        ),
        impactSound: asInt(
          r,
          destruction['impactSound'],
          'combat.siteDestruction.impactSound'
        ),
        initialCounts: {
          mechanoid: asInt(
            r,
            counts['mechanoid'],
            'combat.siteDestruction.initialCounts.mechanoid'
          ),
          neutral: asInt(
            r,
            counts['neutral'],
            'combat.siteDestruction.initialCounts.neutral'
          ),
          palyar: asInt(
            r,
            counts['palyar'],
            'combat.siteDestruction.initialCounts.palyar'
          )
        },
        initialTable: siteTable,
        lowIdMask: asInt(
          r,
          destruction['lowIdMask'],
          'combat.siteDestruction.lowIdMask'
        ),
        mechanoidMask: asInt(
          r,
          destruction['mechanoidMask'],
          'combat.siteDestruction.mechanoidMask'
        ),
        neutralMask: asInt(
          r,
          destruction['neutralMask'],
          'combat.siteDestruction.neutralMask'
        ),
        projectileSlot: asInt(
          r,
          destruction['projectileSlot'],
          'combat.siteDestruction.projectileSlot'
        ),
        reactionDispatchBase: asInt(
          r,
          destruction['reactionDispatchBase'],
          'combat.siteDestruction.reactionDispatchBase'
        ),
        reactions: asArray(
          r,
          destruction['reactions'],
          'combat.siteDestruction.reactions'
        ).map((entry, i) => {
          const at = `combat.siteDestruction.reactions[${i}]`;
          const row = asObject(r, entry, at);
          return {
            cells: intArray(r, row['cells'], `${at}.cells`),
            lowId: asInt(r, row['lowId'], `${at}.lowId`),
            script: asInt(r, row['script'], `${at}.script`)
          };
        }),
        reactionWipeMask: asInt(
          r,
          destruction['reactionWipeMask'],
          'combat.siteDestruction.reactionWipeMask'
        ),
        requiresPlayerCell: asBool(
          r,
          destruction['requiresPlayerCell'],
          'combat.siteDestruction.requiresPlayerCell'
        ),
        restorationKeepMask: asInt(
          r,
          destruction['restorationKeepMask'],
          'combat.siteDestruction.restorationKeepMask'
        ),
        restorationSlot: asInt(
          r,
          destruction['restorationSlot'],
          'combat.siteDestruction.restorationSlot'
        )
      }
    },
    controls: {
      drop: {
        carriedExemptionSlot: asInt(
          r,
          drop['carriedExemptionSlot'],
          'controls.drop.carriedExemptionSlot'
        ),
        carriedMask: asInt(r, drop['carriedMask'], 'controls.drop.carriedMask'),
        copiesCurrentRoomAndPosition: asBool(
          r,
          drop['copiesCurrentRoomAndPosition'],
          'controls.drop.copiesCurrentRoomAndPosition'
        ),
        emptyInventory: asString(
          r,
          drop['emptyInventory'],
          'controls.drop.emptyInventory'
        ),
        inventorySelection: asString(
          r,
          drop['inventorySelection'],
          'controls.drop.inventorySelection'
        ),
        keyCode: asInt(r, drop['keyCode'], 'controls.drop.keyCode'),
        requiresCarriedExemptionOrFlightState: asBool(
          r,
          drop['requiresCarriedExemptionOrFlightState'],
          'controls.drop.requiresCarriedExemptionOrFlightState'
        )
      },
      powerampSlot: asInt(r, controls['powerampSlot'], 'controls.powerampSlot'),
      takeOverrides: {
        antigravSlot: asInt(
          r,
          takeOverrides['antigravSlot'],
          'controls.takeOverrides.antigravSlot'
        ),
        sinkSlot: asInt(
          r,
          takeOverrides['sinkSlot'],
          'controls.takeOverrides.sinkSlot'
        )
      }
    },
    counts: intMap(r, o['counts'], 'counts'),
    endingPresentation: {
      activeValue: asInt(
        r,
        ending['activeValue'],
        'endingPresentation.activeValue'
      ),
      completedValue: asInt(
        r,
        ending['completedValue'],
        'endingPresentation.completedValue'
      ),
      dispatch: asString(r, ending['dispatch'], 'endingPresentation.dispatch'),
      interstellarShipField: {
        colours: jsonObject(
          r,
          field['colours'],
          'endingPresentation.interstellarShipField.colours'
        ),
        continuationState: asArray(
          r,
          field['continuationState'],
          'endingPresentation.interstellarShipField.continuationState'
        ).map((item, index) =>
          jsonValue(
            r,
            item,
            `endingPresentation.interstellarShipField.continuationState[${index}]`
          )
        ),
        initialization: jsonObject(
          r,
          field['initialization'],
          'endingPresentation.interstellarShipField.initialization'
        ),
        loopOrder: stringArray(
          r,
          field['loopOrder'],
          'endingPresentation.interstellarShipField.loopOrder'
        ),
        motion: jsonObject(
          r,
          field['motion'],
          'endingPresentation.interstellarShipField.motion'
        ),
        pointSlots: {
          count: asInt(
            r,
            pointSlots['count'],
            'endingPresentation.interstellarShipField.pointSlots.count'
          ),
          first: asInt(
            r,
            pointSlots['first'],
            'endingPresentation.interstellarShipField.pointSlots.first'
          ),
          identity: asString(
            r,
            pointSlots['identity'],
            'endingPresentation.interstellarShipField.pointSlots.identity'
          ),
          last: asInt(
            r,
            pointSlots['last'],
            'endingPresentation.interstellarShipField.pointSlots.last'
          )
        },
        projection: jsonObject(
          r,
          field['projection'],
          'endingPresentation.interstellarShipField.projection'
        ),
        respawn: jsonObject(
          r,
          field['respawn'],
          'endingPresentation.interstellarShipField.respawn'
        ),
        storage: jsonObject(
          r,
          field['storage'],
          'endingPresentation.interstellarShipField.storage'
        )
      },
      scriptedValue: asInt(
        r,
        ending['scriptedValue'],
        'endingPresentation.scriptedValue'
      ),
      slot7PitchHighByte: asInt(
        r,
        ending['slot7PitchHighByte'],
        'endingPresentation.slot7PitchHighByte'
      )
    },
    orbitalTransition: {
      axisMiddleByteWindow: intPair(
        r,
        orbital['axisMiddleByteWindow'],
        'orbitalTransition.axisMiddleByteWindow'
      ),
      callSites: intArray(
        r,
        orbital['callSites'],
        'orbitalTransition.callSites'
      ),
      cell: intPair(r, orbital['cell'], 'orbitalTransition.cell'),
      entry: {
        altitudeHighByte: asInt(
          r,
          orbitalEntry['altitudeHighByte'],
          'orbitalTransition.entry.altitudeHighByte'
        ),
        flagValue: asInt(
          r,
          orbitalEntry['flagValue'],
          'orbitalTransition.entry.flagValue'
        ),
        restAltitudeLowByte: asInt(
          r,
          orbitalEntry['restAltitudeLowByte'],
          'orbitalTransition.entry.restAltitudeLowByte'
        ),
        wrappedAltitudeMiddleByte: asInt(
          r,
          orbitalEntry['wrappedAltitudeMiddleByte'],
          'orbitalTransition.entry.wrappedAltitudeMiddleByte'
        )
      },
      exitMover: asInt(r, orbital['exitMover'], 'orbitalTransition.exitMover'),
      minimumAltitudeByte: asInt(
        r,
        orbital['minimumAltitudeByte'],
        'orbitalTransition.minimumAltitudeByte'
      ),
      successCarry: asString(
        r,
        orbital['successCarry'],
        'orbitalTransition.successCarry'
      )
    },
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion'),
    shipDelivery: {
      acceptedMask: asInt(
        r,
        delivery['acceptedMask'],
        'shipDelivery.acceptedMask'
      ),
      cadence: asString(r, delivery['cadence'], 'shipDelivery.cadence'),
      callSite: asInt(r, delivery['callSite'], 'shipDelivery.callSite'),
      descendingValue: asInt(
        r,
        delivery['descendingValue'],
        'shipDelivery.descendingValue'
      ),
      descent: {
        axis: asString(r, descent['axis'], 'shipDelivery.descent.axis'),
        extraSubtraction: asInt(
          r,
          descent['extraSubtraction'],
          'shipDelivery.descent.extraSubtraction'
        ),
        lowByteHeldAt: asInt(
          r,
          descent['lowByteHeldAt'],
          'shipDelivery.descent.lowByteHeldAt'
        ),
        shift: asInt(r, descent['shift'], 'shipDelivery.descent.shift'),
        widthBits: asInt(
          r,
          descent['widthBits'],
          'shipDelivery.descent.widthBits'
        )
      },
      inactiveValue: asInt(
        r,
        delivery['inactiveValue'],
        'shipDelivery.inactiveValue'
      ),
      initialisation: {
        room: asInt(
          r,
          initialisation['room'],
          'shipDelivery.initialisation.room'
        ),
        x: asInt(r, initialisation['x'], 'shipDelivery.initialisation.x'),
        y: asInt(r, initialisation['y'], 'shipDelivery.initialisation.y'),
        z: asInt(r, initialisation['z'], 'shipDelivery.initialisation.z')
      },
      landing: {
        cell: intArray(r, landing['cell'], 'shipDelivery.landing.cell'),
        clearsState: asBool(
          r,
          landing['clearsState'],
          'shipDelivery.landing.clearsState'
        ),
        framesToLand: asInt(
          r,
          landing['framesToLand'],
          'shipDelivery.landing.framesToLand'
        ),
        predicate: asString(
          r,
          landing['predicate'],
          'shipDelivery.landing.predicate'
        )
      },
      slot: asInt(r, delivery['slot'], 'shipDelivery.slot')
    }
  };
};

const underground = (r: Reader, value: unknown): Doc.UndergroundDocument => {
  const o = asObject(r, value, '$');
  const pad = asObject(r, o['pad'], 'pad');
  const lift = asObject(r, o['lift'], 'lift');
  return {
    counts: intMap(r, o['counts'], 'counts'),
    entrances: asArray(r, o['entrances'], 'entrances').map((raw, i) => {
      const at = `entrances[${i}]`;
      const e = asObject(r, raw, at);
      return {
        cell: intArray(r, e['cell'], `${at}.cell`),
        room: asInt(r, e['room'], `${at}.room`),
        site: asInt(r, e['site'], `${at}.site`)
      };
    }),
    lift: {
      altitudeWrap: asInt(r, lift['altitudeWrap'], 'lift.altitudeWrap'),
      altitudeWrapSubtract: asInt(
        r,
        lift['altitudeWrapSubtract'],
        'lift.altitudeWrapSubtract'
      ),
      ascendRate: asInt(r, lift['ascendRate'], 'lift.ascendRate'),
      descendRate: asInt(r, lift['descendRate'], 'lift.descendRate'),
      floor: asInt(r, lift['floor'], 'lift.floor'),
      submergeAt: asInt(r, lift['submergeAt'], 'lift.submergeAt'),
      submergeMiddle: asInt(r, lift['submergeMiddle'], 'lift.submergeMiddle'),
      surfaceAt: asInt(r, lift['surfaceAt'], 'lift.surfaceAt'),
      surfaceMiddle: asInt(r, lift['surfaceMiddle'], 'lift.surfaceMiddle')
    },
    pad: {
      shift: asInt(r, pad['shift'], 'pad.shift'),
      x: asInt(r, pad['x'], 'pad.x'),
      z: asInt(r, pad['z'], 'pad.z')
    },
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion')
  };
};

export const readers = {
  benson,
  endgame,
  flight,
  interaction,
  manifest,
  objects,
  rooms,
  surface,
  text,
  underground,
  world
};
