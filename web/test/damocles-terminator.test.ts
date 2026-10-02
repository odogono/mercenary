import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue, Mesh } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { FLOATS_PER_VERTEX, planErisFrame } from '../src/damocles/frame.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import {
  advanceTurn,
  inDaylight,
  turnOnClock
} from '../src/damocles/terminator.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The day/night terminator `$050562` (#494, #497): it chooses the Body's sky word and the half
/// of the scene palette every `$80xx` colour is read through.

let catalogue: AssembledCatalogue;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

/// The captures whose engine day flag `$7A4E` was set (`location-ledger.py poses`).
const CAPTURED_BY_DAY = [
  'acheron',
  'atropos',
  'bacchus-transporter',
  'damocles',
  'dion-2-3',
  'gaea-transporter',
  'icarus',
  'logos-transporter',
  'lucan',
  'metis-transporter',
  'midas',
  'pan',
  'solon',
  'vesta-parliament-4-6'
];

const hex = (channels: readonly number[]): string =>
  `#${channels
    .map(value =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

const vertexColours = (vertices: Float32Array): Set<string> => {
  const colours = new Set<string>();
  for (let i = 0; i < vertices.length; i += FLOATS_PER_VERTEX) {
    colours.add(hex([vertices[i + 3]!, vertices[i + 4]!, vertices[i + 5]!]));
  }
  return colours;
};

const primitives = (mesh: Mesh | undefined) => [
  ...(mesh?.faces ?? []),
  ...(mesh?.lines ?? [])
];

describe('the terminator', () => {
  test('gives each arrival capture the answer its engine day flag held', () => {
    const lit = content.poses.poses
      .filter(pose =>
        inDaylight(pose.subStellarLongitude, pose.bodyTurn, pose.position)
      )
      .map(pose => pose.id)
      .sort();
    expect(lit).toEqual(CAPTURED_BY_DAY);
  });

  test('a quarter turn of the Body carries the Eris start into daylight', () => {
    // #439's `jump` added a quarter of a turn once to the on-foot capture, which stands at
    // night, and the ST went from night to day.
    const start = content.poses.poses.find(
      pose => pose.id === 'eris-spaceport-onfoot'
    )!;
    expect(inDaylight(0x1_5b, start.bodyTurn, start.position)).toBe(false);
    expect(
      inDaylight(
        0x1_5b,
        advanceTurn(start.bodyTurn, 0x01_00_00_00, 1),
        start.position
      )
    ).toBe(true);
    // A whole turn, `$04000000`, is the same place again.
    expect(
      inDaylight(
        0x1_5b,
        advanceTurn(start.bodyTurn, 0x04_00_00_00, 1),
        start.position
      )
    ).toBe(false);
  });

  test('the accumulator wraps at a whole turn', () => {
    expect(advanceTurn(0xff_ff_ff_00, 0x1_00, 1)).toBe(0);
    expect(advanceTurn(0, 0x1_41, 3)).toBe(0x3_c3);
    // VOID's rate turns it once in 1,000 VBLs, short of `$04000000` by the truncated rate.
    expect(0x04_00_00_00 - advanceTurn(0, 0x1_06_24, 1000)).toBe(864);
  });
});

describe('the session keeps the Body turning', () => {
  test('starts by day on Eris, under its day sky, at the turn a fresh game hands over', () => {
    const session = new DamoclesSession(content);
    // `start-turn-probe.py`: the reset's zero still stands when `$7A8E` turns on.
    expect(session.snapshot.bodyTurn).toBe(0);
    expect(session.snapshot.daylight).toBe(true);
    const { pose, structure, surface } = session.snapshot;
    const plan = planErisFrame(
      surface,
      pose,
      content.doc,
      structure,
      [],
      [],
      () => false,
      true
    );
    expect(hex(plan.clear)).toBe('#66aaee');
    // Night falls on the start about five minutes in, as the probe's run saw.
    session.advance(300);
    expect(session.snapshot.daylight).toBe(true);
    session.advance(10);
    expect(session.snapshot.daylight).toBe(false);
  });

  test('advances the turn by the Body rate every VBL and crosses into daylight', () => {
    const start = new DamoclesSession(content);
    start.advance(1);
    // One second is 50 VBLs at ERIS's `$141` a VBL.
    expect(start.snapshot.bodyTurn).toBe(50 * 0x1_41);
    // Just short of the terminator, which the Eris start pose meets at longitude step `$25C`.
    const edge = 0x2_5c - 17;
    const before = new DamoclesSession(content, {
      ...start.captureResume(),
      bodyTurn: edge * 0x1_00_00 - 20 * 0x1_41
    });
    expect(before.snapshot.daylight).toBe(false);
    before.advance(1);
    expect(before.snapshot.daylight).toBe(true);
  });

  test('a switch carries the shared Body clock and binds Metis daylight from that turn', () => {
    const session = new DamoclesSession(content);
    expect(session.switchToPose('metis-transporter').kind).toBe('switched');
    const metis = content.poses.poses.find(
      pose => pose.id === 'metis-transporter'
    )!;
    const bodies = catalogue.craft!.bodies;
    const rate = (index: number) =>
      catalogue.bodies.find(body => body.id === `body-${index}`)!.bodySurface!
        .rotationRate;
    const turn = turnOnClock(
      { rate: rate(11), start: bodies[11]!.turn, turn: 0 },
      { rate: rate(15), start: bodies[15]!.turn }
    );
    expect(session.snapshot.bodyTurn).toBe(turn!);
    expect(session.snapshot.daylight).toBe(
      inDaylight(
        metis.subStellarLongitude,
        turn!,
        session.snapshot.pose.position
      )
    );
    const { pose, structure, surface } = session.snapshot;
    const plan = (daylight: boolean) =>
      planErisFrame(
        surface,
        pose,
        content.doc,
        structure,
        [],
        [],
        () => false,
        daylight
      );
    expect(hex(plan(true).clear)).toBe('#66aaaa');
    expect(hex(plan(false).clear)).toBe('#002222');
  });

  test('a Save carries the turn, and refuses one that is not a longword', () => {
    const session = new DamoclesSession(content);
    expect(session.switchToPose('metis-transporter').kind).toBe('switched');
    session.setBodyTime(43_200);
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const encode = (snapshot: DamoclesSaveSnapshot) =>
      encodeDamoclesSave({
        identity,
        savedAt: '2026-09-24T00:00:00.000Z',
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot,
        where: 'METIS 15-06'
      });
    const decode = (encoded: string) =>
      decodeDamoclesSave(encoded, identity, {
        catalogue,
        poses: content.poses,
        strings: content.strings
      }).snapshot;
    const resume = session.captureResume();
    const restored = new DamoclesSession(content, decode(encode(resume)));
    expect(restored.snapshot.bodyTurn).toBe(resume.bodyTurn);
    expect(restored.snapshot.daylight).toBe(true);
    for (const bodyTurn of [-1, 2 ** 32, 0.5]) {
      expect(() => decode(encode({ ...resume, bodyTurn }))).toThrow(
        'bodyTurn is not an unsigned longword'
      );
    }
  });
});

describe('the frame reads the half the terminator binds', () => {
  test('a face whose palette has a day half draws it by day and only by day', () => {
    // PERSEUS's capture stands at night in the RESEARCH LABORATORY, whose palette's two halves
    // differ on most of the entries it names.
    const session = new DamoclesSession(content);
    expect(session.switchToPose('perseus').kind).toBe('switched');
    expect(session.snapshot.daylight).toBe(false);
    const { pose, structure, surface } = session.snapshot;
    const faces = surface.placements
      .flatMap(placement => [
        ...primitives(placement.mesh),
        ...primitives(placement.selection?.detail),
        ...primitives(placement.selection?.structure.plan),
        ...(placement.selection?.structure.attachments ?? []).flatMap(
          attachment => primitives(attachment.mesh)
        )
      ])
      .filter(face => face.dayColour !== undefined);
    expect(faces.length).toBeGreaterThan(0);
    const plan = (daylight: boolean) =>
      vertexColours(
        planErisFrame(
          surface,
          pose,
          content.doc,
          structure,
          [],
          [],
          () => false,
          daylight
        ).vertices
      );
    const day = plan(true);
    const night = plan(false);
    expect(day).not.toEqual(night);
    // What differs is exactly day colours in, night colours out.
    const dayOnly = [...day].filter(colour => !night.has(colour));
    expect(dayOnly.length).toBeGreaterThan(0);
    for (const colour of dayOnly) {
      expect(faces.some(face => face.dayColour === colour)).toBe(true);
    }
  });
});
