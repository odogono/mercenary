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
  intMap,
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
      colonyCraftArrival: {
        x: int(arrival, 'x', 'doorwayRules.colonyCraftArrival'),
        y: int(arrival, 'y', 'doorwayRules.colonyCraftArrival'),
        z: int(arrival, 'z', 'doorwayRules.colonyCraftArrival')
      },
      colonyCraftSlot: int(rules, 'colonyCraftSlot', 'doorwayRules'),
      cooldownFrames: int(rules, 'cooldownFrames', 'doorwayRules'),
      darkMessage: int(rules, 'darkMessage', 'doorwayRules'),
      farMargin: int(rules, 'farMargin', 'doorwayRules'),
      lineColour: int(rules, 'lineColour', 'doorwayRules'),
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
        tokens: asArray(r, m['tokens'], `${at}.tokens`).map((token, j) => {
          const tat = `${at}.tokens[${j}]`;
          const t = asObject(r, token, tat);
          const word = optional(t['word'], v => asInt(r, v, `${tat}.word`));
          const literal = optional(t['text'], v =>
            asString(r, v, `${tat}.text`)
          );
          const slot = optional(t['slot'], v => asInt(r, v, `${tat}.slot`));
          return {
            kind: asString(r, t['kind'], `${tat}.kind`),
            ...(word !== undefined ? { word } : {}),
            ...(literal !== undefined ? { text: literal } : {}),
            ...(slot !== undefined ? { slot } : {})
          };
        })
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

/// A document whose version is checked and whose body is kept unread (see `UnreadDocument`).
const unread = (r: Reader, value: unknown): Doc.UnreadDocument => {
  const o = asObject(r, value, '$');
  return {
    body: o,
    schemaVersion: asInt(r, o['schemaVersion'], 'schemaVersion')
  };
};

export const readers = {
  flight,
  manifest,
  objects,
  rooms,
  surface,
  text,
  unread,
  world
};
