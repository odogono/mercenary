import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import {
  cometCentre,
  impactTime,
  type ImpactTime
} from '../src/damocles/comet.ts';
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
import {
  skyPass,
  type SkyBody,
  type SkyComet,
  type SkyItem
} from '../src/damocles/sky.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { continuousSkyAngles, skyAngles } from '../src/damocles/terminator.ts';
import { bearingFromYaw, erisSurfaceFrom } from '../src/damocles/world.ts';
import {
  readGammaSystem,
  type GammaSystemDocument
} from '../src/flyover/documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The other Bodies in a Body's sky (#530) and the comet (#538), against the closed form #528
/// validated on 24 pinned Hatari frames (docs/research/damocles-sky-bodies.md).

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

/// A fresh game's clock, the one a new Session starts on.
const FRESH: ImpactTime = { fraction: 0, seconds: -15_560 };

const passAt = (
  id: string,
  turn: number,
  daylight = false,
  impact: ImpactTime = FRESH
) => {
  const pose = arrival(id);
  return skyPass(system, {
    body: pose.body,
    daylight,
    impact,
    position: pose.position,
    sky:
      catalogue.bodies.find(body => body.id === pose.body)?.bodySurface?.sky ??
      null,
    turn
  });
};

const disc = (items: readonly SkyItem[], id: string): SkyBody => {
  const item = items.find(entry => entry.id === id);
  if (item?.kind !== 'disc') {
    throw new Error(`${id} is not a disc in this sky`);
  }
  return item;
};

const cometOf = (items: readonly SkyItem[]): SkyComet => {
  const item = items.find(entry => entry.kind === 'comet');
  if (item?.kind !== 'comet') {
    throw new Error('no comet in this sky');
  }
  return item;
};

/// The table sine at `$064000`, as the reference view matrix reads it.
const sine = (angle: number): number =>
  Math.sin(((angle & 0x3_ff) + 0.5) * ((2 * Math.PI) / 0x4_00));

/// `$045710`'s view matrix at the pinned frames' eye: roll 0, pitch 511 and the Pose's yaw word.
/// Rows are depth, screen x and screen y. Roll 0 is not quite level either: the table's half
/// step reaches every angle.
const referenceScreen = (
  body: { readonly offset: SkyBody['offset']; readonly size: number },
  yaw: number
) => {
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
        const body = disc(pass.bodies, pinned.body);
        const screen = referenceScreen(body, arrival(frame.pose).yaw);
        // The probe's values are printed to three places.
        expect(screen.x).toBeCloseTo(pinned.x, 2);
        expect(screen.y).toBeCloseTo(pinned.y, 2);
        expect(screen.r).toBeCloseTo(pinned.r, 2);
      }
    }
  });

  test('walks the draw list in order, DAMOCLES through its comet path', () => {
    const pass = passAt('metis-transporter', turnFor('metis-transporter', 768));
    expect(pass.bodies.map(body => `${body.id}:${body.kind}`)).toEqual([
      'dialis:disc',
      'damocles:comet',
      'eris:disc',
      'solon:disc',
      'theon:disc',
      'vesta:disc',
      'lucan:disc'
    ]);
    expect(pass.bodies.map(body => body.id)).toEqual([
      'dialis',
      'damocles',
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
    const eris = disc(metis, 'eris');
    expect(eris.first).toBe('shadow');
    expect(eris.split).toBeCloseTo(0.85, 2);
    const theon = passAt('theon', turnFor('theon', 448)).bodies;
    const fromTheon = disc(theon, 'eris');
    expect(fromTheon.first).toBe('lit');
    expect(fromTheon.split).toBeCloseTo(0.912, 2);
    // DIALIS is a full disc in its own colour.
    const dialis = disc(metis, 'dialis');
    expect(dialis.first).toBe('lit');
    expect(dialis.split).toBeCloseTo(1, 4);
    expect(dialis.colour).toBe('#eeeeee');
  });

  test('paints the unlit part in the sky by day where there is air, and black otherwise', () => {
    const tolosa = passAt('tolosa', turnFor('tolosa', 624), true).bodies;
    // TOLOSA's day sky is `$345` (#528's frame shows the same slot 8).
    expect(disc(tolosa, 'juno').shadow).toBe('#6688aa');
    const night = passAt('tolosa', turnFor('tolosa', 624), false).bodies;
    expect(disc(night, 'juno').shadow).toBe('#000000');
    // MIDAS has no atmosphere, so its day sky shows the black part too.
    const midas = passAt('midas', turnFor('midas', 656), true).bodies;
    expect(
      midas.every(body => body.kind === 'comet' || body.shadow === '#000000')
    ).toBe(true);
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
      impact: impactTime(snapshot.elapsed, content.doc.time),
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

/// #528's MIDAS comet frames: the impact clock `$793C`/`$7942` in their RAM, the comet's centre
/// `$5FB4`/`$6034` there, the head and tail tip `sky-body-probe.py predict` projected, and the
/// streak's white pixels in the screenshot, as runs `row: first-last` of ST columns.
const COMET_CLOCK: ImpactTime = { fraction: 13, seconds: -6639 };
const COMET_CENTRE = { x: 50_716, z: 63_754 };
const COMET_FRAMES: readonly {
  readonly head: { readonly x: number; readonly y: number };
  readonly longitude: number;
  readonly streak: string;
  readonly tip: { readonly x: number; readonly y: number };
}[] = [
  {
    head: { x: 210.277, y: 15.874 },
    longitude: 688,
    streak:
      '7:222-223 8:221-222 9:219-221 10:218-220 11:216-218 12:215-217 13:214-216 14:212-214 15:211-213 16:211-212',
    tip: { x: 222.535, y: 6.573 }
  },
  {
    head: { x: 199.611, y: 23.963 },
    longitude: 696,
    streak:
      '15:211-212 16:210-211 17:208-210 18:207-209 19:205-207 20:204-206 21:203-205 22:201-203 23:200-202 24:199-199 24:201-201',
    tip: { x: 211.533, y: 14.917 }
  },
  {
    head: { x: 189.18, y: 31.874 },
    longitude: 704,
    streak:
      '23:200-201 24:199-200 25:198-199 26:196-198 27:195-196 28:194-195 29:192-194 30:191-192 31:190-191 32:190-190',
    tip: { x: 200.836, y: 23.029 }
  }
];

/// The white pixels of a frame's streak.
const streakPixels = (runs: string): readonly (readonly [number, number])[] =>
  runs.split(' ').flatMap(run => {
    const [row, span] = run.split(':') as [string, string];
    const [first, last] = span.split('-').map(Number) as [number, number];
    return Array.from(
      { length: last - first + 1 },
      (_, index) => [first + index, Number(row)] as const
    );
  });

/// How far a point is from the nearest of a frame's pixels, in whole pixels either way: the
/// pixel a point lands in is its coordinates rounded half-up, as `$05668A` rounds them.
const pixelsFrom = (
  point: { readonly x: number; readonly y: number },
  lit: readonly (readonly [number, number])[]
): number =>
  Math.min(
    ...lit.map(([x, y]) =>
      Math.max(
        Math.abs(Math.floor(point.x + 0.5) - x),
        Math.abs(Math.floor(point.y + 0.5) - y)
      )
    )
  );

/// A Session elapsed time that reads `time` on the impact clock, mid-tick.
const elapsedAt = (time: ImpactTime): number => {
  const clock = content.doc.time;
  const spent =
    clock.impactDeadlineSeconds + time.seconds + (time.fraction + 0.5) / 32;
  return (spent * clock.impactVblsPerSecond) / clock.vblHertz;
};

describe('the comet DAMOCLES (#538)', () => {
  test('the impact clock puts its centre where the MIDAS frames RAM does', () => {
    expect(cometCentre(system.comet, COMET_CLOCK)).toEqual(COMET_CENTRE);
    expect(impactTime(elapsedAt(COMET_CLOCK), content.doc.time)).toEqual(
      COMET_CLOCK
    );
  });

  test('sits on each waypoint at its time, holds the guard, and is gone at zero', () => {
    const records = system.comet.waypoints.records;
    for (const record of records.slice(0, 28)) {
      expect(
        cometCentre(system.comet, { fraction: 0, seconds: record.seconds })
      ).toEqual({ x: record.x, z: record.z });
    }
    // A fresh game's clock is before the first record, where the three first records coincide.
    expect(cometCentre(system.comet, FRESH)).toEqual({
      x: records[0]!.x,
      z: records[0]!.z
    });
    // Record 28 is ERIS's centre at zero on the clock, where `$051F42` destroys both.
    expect(records[28]).toEqual({ seconds: 0, x: -630_000, z: 390_000 });
    expect(cometCentre(system.comet, { fraction: 0, seconds: 0 })).toBeNull();
    const last = { fraction: 31, seconds: -1 };
    expect(cometCentre(system.comet, last)).not.toBeNull();
    const pass = passAt('midas', turnFor('midas', 696), true, {
      fraction: 0,
      seconds: 0
    });
    expect(pass.bodies.some(body => body.id === 'damocles')).toBe(false);
  });

  test('projects its head and tail tip where the pinned frames predict them', () => {
    for (const frame of COMET_FRAMES) {
      const comet = cometOf(
        passAt('midas', turnFor('midas', frame.longitude), true, COMET_CLOCK)
          .bodies
      );
      const yaw = arrival('midas').yaw;
      const head = referenceScreen({ offset: comet.offset, size: 0 }, yaw);
      const tip = referenceScreen({ offset: comet.points[0]!, size: 0 }, yaw);
      expect(head.x).toBeCloseTo(frame.head.x, 2);
      expect(head.y).toBeCloseTo(frame.head.y, 2);
      expect(tip.x).toBeCloseTo(frame.tip.x, 2);
      expect(tip.y).toBeCloseTo(frame.tip.y, 2);
      expect(comet.points).toHaveLength(5);
      expect(comet.faces.map(face => face.points)).toEqual([
        [0, 1, 2],
        [2, 1, 0],
        [4, 3, 0],
        [0, 3, 4]
      ]);
      expect(comet.head).toEqual({ colour: '#000000', size: 64_000 });
    }
  });
});

/// MIDAS has no recovered workspace, so no Session stands on it. Its arrival Pose still gives the
/// pinned frames' eye, and the frame plan draws the sky over whichever surface it is handed.
const midasPlan = (
  longitude: number,
  time: ImpactTime,
  only?: string
): ErisFramePlan => {
  const pass = passAt('midas', turnFor('midas', longitude), true, time);
  return planErisFrame(
    content.surface,
    // `poseOfArrival`'s standing Pose, which it builds only for an admitted Pose.
    {
      body: arrival('midas').body,
      heading: bearingFromYaw(arrival('midas').yaw, content.doc.orientation),
      pitch: 0,
      position: arrival('midas').position
    },
    content.doc,
    null,
    [],
    [],
    () => false,
    true,
    only === undefined
      ? pass
      : { ...pass, bodies: pass.bodies.filter(body => body.id === only) }
  );
};

/// A METIS Session at a sky longitude and an impact clock. At longitude 96 the comet is in
/// METIS's sky through the middle of the countdown.
const onMetisAt = (longitude: number, time: ImpactTime): DamoclesSession =>
  new DamoclesSession(content, {
    ...onMetis(longitude).captureResume(),
    elapsed: elapsedAt(time)
  });

/// The comet's emitted vertices in the #528 frame's pixels.
const cometPixels = (plan: ErisFramePlan) => {
  const found: { x: number; y: number }[] = [];
  for (let i = 0; i < plan.skyVertices.length; i += FLOATS_PER_VERTEX) {
    const colour = hex([
      plan.skyVertices[i + 3]!,
      plan.skyVertices[i + 4]!,
      plan.skyVertices[i + 5]!
    ]);
    if (colour === '#eeeeee') {
      const z = plan.skyVertices[i + 2]!;
      found.push({
        x: 160 + (plan.skyVertices[i]! / z) * 256,
        y: 68 - (plan.skyVertices[i + 1]! / z) * 256
      });
    }
  }
  return found;
};

describe('the frame from the MIDAS pose at the pinned clock', () => {
  test('draws the streak over the frames white pixels, head and tip within a pixel', () => {
    for (const frame of COMET_FRAMES) {
      const lit = streakPixels(frame.streak);
      // DIALIS is `$777` too, so the streak is measured alone.
      const plan = midasPlan(frame.longitude, COMET_CLOCK, 'damocles');
      const head = pixels(plan, 'damocles');
      expect(head.drawn).toBe(true);
      // The port's Camera reads the eye's angles exactly, where the ST's sine table is half a
      // step on in yaw and pitch alike. That moves everything the Camera draws, the ground and
      // structures as much as the sky, by about a pixel right and three quarters of one down
      // against #528's closed form, which the sky pass alone matches exactly (above). So the
      // head lands on the frame's own streak, and the tip, which that offset carries across a
      // row boundary at 688, within two pixels of it.
      expect(pixelsFrom(head, lit)).toBe(0);
      expect(Math.abs(head.x - frame.head.x)).toBeLessThan(1.5);
      expect(Math.abs(head.y - frame.head.y)).toBeLessThan(1.5);
      const streak = cometPixels(plan);
      expect(streak.length).toBeGreaterThan(0);
      // The streak's far end is the tail tip, the vertex furthest from the head.
      const tip = streak.reduce((best, point) =>
        Math.hypot(point.x - head.x, point.y - head.y) >
        Math.hypot(best.x - head.x, best.y - head.y)
          ? point
          : best
      );
      expect(pixelsFrom(tip, lit)).toBeLessThanOrEqual(2);
      expect(Math.abs(tip.x - frame.tip.x)).toBeLessThan(1.5);
      expect(Math.abs(tip.y - frame.tip.y)).toBeLessThan(1.5);
      // Every vertex lies over the frame's streak, within the same two pixels.
      for (const point of streak) {
        expect(pixelsFrom(point, lit)).toBeLessThanOrEqual(2);
      }
      // The head disc is a quarter of a pixel, which `$045916` draws as no row at all.
      expect(colours(plan.skyVertices)).toEqual(new Set(['#eeeeee']));
    }
  });

  test('cuts the comet at the horizon row', () => {
    for (const seconds of [-12_000, -6639, -3000, -500]) {
      for (const longitude of [0, 256, 512, 696, 768]) {
        const plan = midasPlan(longitude, { fraction: 0, seconds });
        for (let i = 0; i < plan.skyVertices.length; i += FLOATS_PER_VERTEX) {
          expect(plan.skyVertices[i + 1]!).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });
});

describe('the comet in a Session', () => {
  test('moves as the impact clock advances', () => {
    const session = onMetisAt(96, COMET_CLOCK);
    const before = pixels(planOf(session), 'damocles');
    expect(before.drawn).toBe(true);
    const from = cometCentre(
      system.comet,
      impactTime(session.snapshot.elapsed, content.doc.time)
    )!;
    session.advance(20);
    const to = cometCentre(
      system.comet,
      impactTime(session.snapshot.elapsed, content.doc.time)
    )!;
    // Fifty displayed seconds along segment 14, at 74.9 units a second.
    expect(Math.hypot(to.x - from.x, to.z - from.z) / 50).toBeCloseTo(74.9, 0);
    // Put the sky back where it was, so only the clock has moved the comet.
    const after = pixels(
      planOf(
        new DamoclesSession(content, {
          ...session.captureResume(),
          bodyTurn: turnFor('metis-transporter', 96)
        })
      ),
      'damocles'
    );
    expect(after.drawn).toBe(true);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(
      0.1
    );
  });

  test('a Save and resume restores the comet', () => {
    const session = onMetisAt(96, COMET_CLOCK);
    session.advance(7);
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
    expect(pixels(actual, 'damocles').drawn).toBe(true);
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
    impact: FRESH,
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
