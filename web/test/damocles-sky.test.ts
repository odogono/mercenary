import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  FLOATS_PER_VERTEX,
  planErisFrame,
  type ErisFramePlan
} from '../src/damocles/frame.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave
} from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { skyPass, type SkyBody } from '../src/damocles/sky.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { continuousSkyAngles, skyAngles } from '../src/damocles/terminator.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import {
  readGammaSystem,
  type GammaSystemDocument
} from '../src/flyover/documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The other Bodies in a Body's sky (#530), against the closed form #528 validated on 24 pinned
/// Hatari frames (docs/research/damocles-sky-bodies.md).

let catalogue: AssembledCatalogue;
let content: DamoclesContent;
let system: GammaSystemDocument;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
  system = readGammaSystem(
    await Bun.file('../payload/damocles/system.json').json()
  );
});

/// The screen position `$05668A` gives a Body and the radius pass 2 gives it, `(sx, sy, r)`, as
/// `sky-body-probe.py predict` read them from each pinned frame's RAM.
interface Pinned {
  readonly body: string;
  readonly r: number;
  readonly x: number;
  readonly y: number;
}

/// Pinned frames: the arrival Pose each was captured from, the sky longitude `$042C6C` the probe
/// poked, and the Bodies it predicted.
const PINNED: readonly {
  readonly bodies: readonly Pinned[];
  readonly longitude: number;
  readonly pose: string;
}[] = [
  {
    bodies: [
      { body: 'dialis', r: 9.699, x: -95.131, y: 93.26 },
      { body: 'eris', r: 43.962, x: 99.25, y: 86.845 },
      { body: 'solon', r: 4.661, x: 30.818, y: 88.501 },
      { body: 'vesta', r: 12.219, x: 182.972, y: 85.255 }
    ],
    longitude: 768,
    pose: 'metis-transporter'
  },
  {
    bodies: [
      { body: 'eris', r: 43.311, x: 201.457, y: 84.728 },
      { body: 'vesta', r: 13.725, x: 294.1, y: 82.646 }
    ],
    longitude: 832,
    pose: 'metis-transporter'
  },
  {
    bodies: [
      { body: 'eris', r: 50.204, x: 318.162, y: 81.901 },
      { body: 'vesta', r: 18.943, x: 466.347, y: 78.088 }
    ],
    longitude: 896,
    pose: 'metis-transporter'
  },
  {
    bodies: [
      { body: 'eris', r: 54.997, x: 254.022, y: 17.07 },
      { body: 'solon', r: 7.249, x: 160.026, y: 57.389 },
      { body: 'metis', r: 1.838, x: 234.042, y: 23.784 }
    ],
    longitude: 448,
    pose: 'theon'
  },
  {
    bodies: [
      { body: 'gaea', r: 58.693, x: 209.724, y: 37.824 },
      { body: 'cyclopes', r: 9.176, x: 230.797, y: 36.054 }
    ],
    longitude: 512,
    pose: 'cronus'
  },
  {
    bodies: [{ body: 'juno', r: 89.349, x: 94.662, y: 40.287 }],
    longitude: 624,
    pose: 'tolosa'
  },
  {
    bodies: [{ body: 'dialis', r: 24.578, x: 191.001, y: 30.511 }],
    longitude: 656,
    pose: 'midas'
  },
  {
    bodies: [{ body: 'eris', r: 146.684, x: 98.958, y: -41.919 }],
    longitude: 800,
    pose: 'solon'
  }
];

const arrival = (id: string) =>
  content.poses.poses.find(pose => pose.id === id)!;

/// A turn whose high word puts the sky longitude at `longitude` for the Pose.
const turnFor = (id: string, longitude: number): number => {
  const step = Math.floor(arrival(id).position.x / 0x4_00_00) & 0x3_ff;
  return ((longitude - step) & 0x3_ff) * 0x1_00_00;
};

const passAt = (id: string, turn: number, daylight = false) => {
  const pose = arrival(id);
  return skyPass(system, {
    body: pose.body,
    daylight,
    position: pose.position,
    sky:
      catalogue.bodies.find(body => body.id === pose.body)?.bodySurface?.sky ??
      null,
    turn
  });
};

/// The table sine at `$064000`, as the reference view matrix reads it.
const sine = (angle: number): number =>
  Math.sin(((angle & 0x3_ff) + 0.5) * ((2 * Math.PI) / 0x4_00));

/// `$045710`'s view matrix at the pinned frames' eye: roll 0, pitch 511 and the Pose's yaw word.
/// Rows are depth, screen x and screen y. Roll 0 is not quite level either: the table's half
/// step reaches every angle.
const referenceScreen = (body: SkyBody, yaw: number) => {
  const [sr, cr] = [sine(0), sine(0x1_00)];
  const [sp, cp] = [sine(511), sine(511 + 0x1_00)];
  const [sy, cy] = [sine(yaw), sine(yaw + 0x1_00)];
  const view = [
    [cp * sy, sp, cp * cy],
    [sr * sp * sy + cr * cy, -sr * cp, sr * sp * cy - cr * sy],
    [sr * cy - cr * sp * sy, cr * cp, -(cr * sp * cy + sr * sy)]
  ];
  const { x, y, z } = body.offset;
  const [depth, u, v] = view.map(
    row => row[0]! * x + row[1]! * y + row[2]! * z
  ) as [number, number, number];
  return {
    r: body.size / depth,
    x: 160 - (256 * u) / depth,
    y: 68 + (256 * v) / depth
  };
};

describe('the closed form at the pinned $042C6C values', () => {
  test('puts every listed Body where the pinned frame RAM does, with its radius', () => {
    for (const frame of PINNED) {
      const pass = passAt(frame.pose, turnFor(frame.pose, frame.longitude));
      for (const pinned of frame.bodies) {
        const body = pass.bodies.find(item => item.id === pinned.body)!;
        const screen = referenceScreen(body, arrival(frame.pose).yaw);
        // The probe's values are printed to three places.
        expect(screen.x).toBeCloseTo(pinned.x, 2);
        expect(screen.y).toBeCloseTo(pinned.y, 2);
        expect(screen.r).toBeCloseTo(pinned.r, 2);
      }
    }
  });

  test('walks the draw list in order and leaves DAMOCLES to its comet path', () => {
    const pass = passAt('metis-transporter', turnFor('metis-transporter', 768));
    expect(pass.bodies.map(body => body.id)).toEqual([
      'dialis',
      'eris',
      'solon',
      'theon',
      'vesta',
      'lucan'
    ]);
    expect(pass.projectionScale).toBe(256);
    expect(pass.halfWidthDivisor).toBe(0.843_75);
  });

  test('splits a disc at cos φ, swapping the colours on the cross product', () => {
    const metis = passAt(
      'metis-transporter',
      turnFor('metis-transporter', 768)
    ).bodies;
    // From METIS, ERIS's cos φ is −0.85 with the cross product positive: shadow first, and the
    // word complemented.
    const eris = metis.find(body => body.id === 'eris')!;
    expect(eris.first).toBe('shadow');
    expect(eris.split).toBeCloseTo(0.85, 2);
    const theon = passAt('theon', turnFor('theon', 448)).bodies;
    const fromTheon = theon.find(body => body.id === 'eris')!;
    expect(fromTheon.first).toBe('lit');
    expect(fromTheon.split).toBeCloseTo(0.912, 2);
    // DIALIS is a full disc in its own colour.
    const dialis = metis.find(body => body.id === 'dialis')!;
    expect(dialis.first).toBe('lit');
    expect(dialis.split).toBeCloseTo(1, 4);
    expect(dialis.colour).toBe('#eeeeee');
  });

  test('paints the unlit part in the sky by day where there is air, and black otherwise', () => {
    const tolosa = passAt('tolosa', turnFor('tolosa', 624), true).bodies;
    // TOLOSA's day sky is `$345` (#528's frame shows the same slot 8).
    expect(tolosa.find(body => body.id === 'juno')!.shadow).toBe('#6688aa');
    const night = passAt('tolosa', turnFor('tolosa', 624), false).bodies;
    expect(night.find(body => body.id === 'juno')!.shadow).toBe('#000000');
    // MIDAS has no atmosphere, so its day sky shows the black part too.
    const midas = passAt('midas', turnFor('midas', 656), true).bodies;
    expect(midas.every(body => body.shadow === '#000000')).toBe(true);
  });
});

const hex = (channels: readonly number[]): string =>
  `#${channels
    .map(value =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

const colours = (vertices: Float32Array): Set<string> => {
  const found = new Set<string>();
  for (let i = 0; i < vertices.length; i += FLOATS_PER_VERTEX) {
    found.add(hex([vertices[i + 3]!, vertices[i + 4]!, vertices[i + 5]!]));
  }
  return found;
};

const planOf = (session: DamoclesSession): ErisFramePlan => {
  const snapshot = session.snapshot;
  return planErisFrame(
    snapshot.surface,
    snapshot.pose,
    content.doc,
    snapshot.structure,
    [],
    [],
    () => false,
    snapshot.daylight,
    skyPass(system, {
      body: snapshot.pose.body,
      daylight: snapshot.daylight,
      position: snapshot.pose.position,
      sky: snapshot.surface.sky,
      turn: snapshot.bodyTurn
    })
  );
};

const onMetis = (longitude: number): DamoclesSession => {
  const session = new DamoclesSession(content);
  expect(session.switchToPose('metis-transporter').kind).toBe('switched');
  return new DamoclesSession(content, {
    ...session.captureResume(),
    bodyTurn: turnFor('metis-transporter', longitude)
  });
};

/// A placement in the #528 frame's pixels: 256 pixels a unit tangent about (160, 68).
const pixels = (plan: ErisFramePlan, id: string) => {
  const placement = plan.skyBodies.find(body => body.id === id)!;
  return {
    drawn: placement.drawn,
    r: placement.radius * 256,
    x: 160 + placement.x * 256,
    y: 68 - placement.y * 256
  };
};

describe('the frame from a METIS pose', () => {
  test('shows ERIS where the pinned frame has it, and VESTA under the horizon', () => {
    const plan = planOf(onMetis(768));
    const eris = pixels(plan, 'eris');
    // #528's model matches its frames to within a pixel. The port's camera reads the yaw word
    // exactly, where the ST's table is half a step on, which is under a pixel at 256.
    expect(Math.abs(eris.x - 99.25)).toBeLessThan(1);
    expect(Math.abs(eris.y - 86.845)).toBeLessThan(1);
    expect(eris.r).toBeCloseTo(43.962, 1);
    expect(eris.drawn).toBe(true);
    // VESTA's disc lies wholly under row 68 in all three pinned METIS frames, as it does here.
    const vesta = pixels(plan, 'vesta');
    expect(Math.abs(vesta.x - 182.972)).toBeLessThan(1);
    expect(Math.abs(vesta.y - 85.255)).toBeLessThan(1);
    expect(vesta.drawn).toBe(false);
    // THEON is under a pixel across, which `$045916` draws as no row at all.
    expect(pixels(plan, 'theon').drawn).toBe(false);
    // At night ERIS is `$003` against its `$000` shadow; nothing of VESTA is emitted.
    expect(colours(plan.skyVertices)).toEqual(new Set(['#000066', '#000000']));
  });

  test('every emitted sky vertex lies at or above the horizon row', () => {
    for (const longitude of [768, 832, 896]) {
      const plan = planOf(onMetis(longitude));
      expect(plan.skyVertices.length).toBeGreaterThan(0);
      for (let i = 0; i < plan.skyVertices.length; i += FLOATS_PER_VERTEX) {
        expect(plan.skyVertices[i + 1]!).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('advancing the Body turn moves the Bodies across the sky', () => {
    const session = onMetis(768);
    const before = pixels(planOf(session), 'eris');
    // A sixteenth of a turn of longitude, `$40` steps, as the pinned frames step.
    const rate = catalogue.bodies.find(body => body.id === 'body-15')!
      .bodySurface!.rotationRate;
    const seconds = Math.ceil((0x40 * 0x1_00_00) / rate / 50);
    session.advance(seconds);
    const after = pixels(planOf(session), 'eris');
    expect(after.x - before.x).toBeGreaterThan(90);
    // The pinned frame at 832 has ERIS at (201.5, 84.7); the turn has gone a little past it.
    expect(Math.abs(after.y - 84.7)).toBeLessThan(3);
  });

  test('a Save and resume restores the same sky', () => {
    const session = onMetis(832);
    session.advance(3);
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const encoded = encodeDamoclesSave({
      identity,
      savedAt: '2026-09-25T00:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: session.captureResume(),
      where: 'METIS 15-06'
    });
    const restored = new DamoclesSession(
      content,
      decodeDamoclesSave(encoded, identity, {
        catalogue,
        poses: content.poses,
        strings: content.strings
      }).snapshot
    );
    const expected = planOf(session);
    const actual = planOf(restored);
    expect(actual.skyBodies).toEqual(expected.skyBodies);
    expect(actual.skyVertices).toEqual(expected.skyVertices);
  });
});

/// ERIS's offset from METIS at `turn`, stepped as the engine does or smooth.
const erisFromMetis = (turn: number, smooth: boolean) => {
  const pose = arrival('metis-transporter');
  return skyPass(system, {
    body: pose.body,
    daylight: false,
    position: pose.position,
    sky: null,
    smooth,
    turn
  }).bodies.find(body => body.id === 'eris')!.offset;
};

describe('the Enhanced sky moves between the engine steps', () => {
  test('the smooth angles run ahead of the stepped ones by less than the two fractions', () => {
    for (const id of ['metis-transporter', 'theon', 'eris-spaceport-onfoot']) {
      const { position } = arrival(id);
      for (const turn of [0, 0x1_23_45, 0x0f_ff_ff_ff, 0xff_ff_ff_ff]) {
        const stepped = skyAngles(turn, position);
        const smooth = continuousSkyAngles(turn, position);
        const ahead = (smooth.longitude - stepped.longitude + 0x4_00) % 0x4_00;
        expect(ahead).toBeGreaterThanOrEqual(0);
        expect(ahead).toBeLessThan(2);
        const up = smooth.latitude - stepped.latitude;
        expect(up).toBeGreaterThanOrEqual(0);
        expect(up).toBeLessThan(1);
      }
    }
    // Where both fractions are zero they are the engine's angles exactly.
    const whole = { x: 631 * 0x4_00_00, y: 63, z: 268 * 0x4_00_00 };
    expect(continuousSkyAngles(0x89_00_00, whole)).toEqual(
      skyAngles(0x89_00_00, whole)
    );
  });

  test('a few VBLs move ERIS smoothly, where the stepped sky holds it still', () => {
    const turn = turnFor('metis-transporter', 768);
    // METIS turns 944 a VBL, so ten VBLs are a seventh of a step.
    const later = turn + 10 * 944;
    expect(erisFromMetis(later, false)).toEqual(erisFromMetis(turn, false));
    const before = erisFromMetis(turn, true);
    const after = erisFromMetis(later, true);
    const moved = Math.hypot(
      after.x - before.x,
      after.y - before.y,
      after.z - before.z
    );
    // A whole step turns a 7,200-unit offset by 2π/1024, about 44 units; a seventh is about 6.
    expect(moved).toBeGreaterThan(4);
    expect(moved).toBeLessThan(8);
  });
});
