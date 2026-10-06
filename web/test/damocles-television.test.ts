import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { TRANSITION_VBLS } from '../src/damocles/headCommands.ts';
import { centreBoxView } from '../src/damocles/panel.ts';
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
import { erisSurfaceFrom, placementForms } from '../src/damocles/world.ts';
import { formMesh } from '../src/enhanced/forms.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The TV CONTROL (#816): its switch is bit 0 of `$7872`, which `$053440` reads as `$7875` bit 0
/// to step the TELEVISION's colour entry `$5343E` toward full while it is on and back toward
/// dark while it is off (docs/research/damocles-catalogue.md).

let content: DamoclesContent;
let catalogue: AssembledCatalogue;

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

const TV_CONTROL = 'object-slot-93';

/// A player at the spaceport carrying the TV CONTROL, its panel open and at rest.
const holding = (): DamoclesSession => {
  const saved = new DamoclesSession(content).captureResume();
  const snapshot: DamoclesSaveSnapshot = {
    ...saved,
    carried: [TV_CONTROL],
    residence: [
      ...saved.residence,
      {
        instance: TV_CONTROL,
        residence: { kind: 'carried', placementClass: 4 }
      }
    ]
  };
  const session = new DamoclesSession(content, snapshot);
  expect(session.headCommand('open').kind).toBe('opened');
  for (let vbl = 0; vbl < TRANSITION_VBLS; vbl += 1) {
    session.advance(1 / 50);
  }
  return session;
};

/// Enough time for `count` main-loop passes on foot.
const passes = (session: DamoclesSession, count: number) =>
  session.advance(
    (count * content.doc.time.ticksPerPassOnFoot) / content.doc.time.vblHertz
  );

describe('the TV CONTROL', () => {
  test('opens its switch panel, and + and - set and clear bit 0', () => {
    const session = holding();
    expect(centreBoxView(session.snapshot.centreBox).panel).toMatchObject({
      item: 'OFF',
      kind: 'switch',
      title: 'TV CONTROL'
    });
    expect(session.headCommand('next').kind).toBe('switched');
    expect(session.snapshot.switches).toBe(1);
    expect(centreBoxView(session.snapshot.centreBox).panel?.item).toBe('ON');
    expect(session.headCommand('previous').kind).toBe('switched');
    expect(session.snapshot.switches).toBe(0);
  });

  test('fades the television in a step a pass while it is on, and out while it is off', () => {
    const session = holding();
    session.headCommand('next');
    const entries: number[] = [];
    for (let pass = 0; pass < 6; pass += 1) {
      passes(session, 1);
      entries.push(session.snapshot.formClock.television);
    }
    expect(entries).toEqual([1, 2, 3, 4, 5, 5]);
    session.headCommand('previous');
    passes(session, 2);
    expect(session.snapshot.formClock.television).toBe(3);
  });

  test('draws the television in the colour-cycle form its entry names', () => {
    const tv = catalogue.models.find(model => model.name === 'TELEVISION')!;
    const forms = placementForms(tv, 'record', 117)!;
    const draw = (television: number) =>
      formMesh(
        forms,
        { x: 1000, y: 0, z: 0 },
        { angle: 0, frame: 0, television, textStep: 0 },
        () => false,
        { glyphs: content.catalogue.textFrameGlyphs }
      )!;
    const screen = (television: number) =>
      new Set(draw(television).faces.map(face => face.colour));
    expect(screen(5)).not.toEqual(screen(0));
    expect(screen(5)).toEqual(
      new Set(
        tv.variants
          .find(variant => variant.id === 'frame-5')!
          .mesh.faces.map(face => face.colour)
      )
    );
  });

  test('a Save keeps the switch on', () => {
    const session = holding();
    session.headCommand('next');
    const identity = damoclesSaveIdentity(content.catalogue, 'test');
    const decoded = decodeDamoclesSave(
      encodeDamoclesSave({
        identity,
        savedAt: '2026-10-06T17:00:00Z',
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot: session.captureResume(),
        where: 'ERIS'
      }),
      identity,
      {
        catalogue: content.catalogue,
        documents: content.documents,
        poses: content.poses,
        strings: content.strings
      }
    );
    expect(decoded.snapshot.switches).toBe(1);
  });
});
