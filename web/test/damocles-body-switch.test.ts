import { beforeAll, describe, expect, test } from 'bun:test';

import { parseCatalogue, type Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  admittedPoses,
  resolvePose,
  type ArrivalPoses
} from '../src/damocles/poses.ts';
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
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { arrivalPoses } from './damocles-pose.ts';

let catalogue: Catalogue;
let content: DamoclesContent;
let poses: ArrivalPoses;

beforeAll(async () => {
  catalogue = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  poses = await arrivalPoses();
  content = {
    catalogue,
    doc,
    poses,
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, doc)
  };
});

/// Stand where a drawn resident is, which is what walking up to it achieves.
///
/// The position comes from the session's own Session Snapshot, so it is the recovered placement
/// rather than a number this suite chose. Rebuilding through `captureResume` is the same idiom
/// the take/drop suite uses; nothing here moves the object.
const standingAt = (
  session: DamoclesSession,
  instance: string
): DamoclesSession => {
  const resident = session.snapshot.residents.find(
    item => item.id === instance
  );
  if (resident === undefined) {
    throw new Error(`${instance} is not drawn`);
  }
  const saved = session.captureResume();
  return new DamoclesSession(content, {
    ...saved,
    pose: {
      ...saved.pose,
      position: {
        x: resident.position.x,
        y: resident.position.y + content.doc.eye.heightUnits,
        z: resident.position.z
      }
    }
  });
};

describe('admitted Poses', () => {
  test('are the seven anchored Poses on four Bodies', () => {
    const admitted = admittedPoses(poses);
    expect(admitted.map(pose => pose.id).sort()).toEqual([
      'dion-2-3',
      'dion-transporter',
      'eris-spaceport-onfoot',
      'eris-transporter-11-8',
      'gaea-ur-city-4-2',
      'vesta-parliament-4-6',
      'vesta-transporter'
    ]);
    expect([...new Set(admitted.map(pose => pose.body))].sort()).toEqual([
      'body-11',
      'body-14',
      'body-4',
      'body-8'
    ]);
    // Twelve unanchored Poses carry an implied origin. It is a navigation lead, not an anchor,
    // and admitting it would place objects against a guess.
    expect(poses.poses.length - admitted.length).toBe(12);
  });
});

describe('addressing a Pose', () => {
  test('a Pose id resolves', () => {
    expect(resolvePose(poses, catalogue, 'vesta-transporter')).toMatchObject({
      kind: 'resolved',
      pose: { body: 'body-14', id: 'vesta-transporter' }
    });
  });

  test('a Body name resolves only where it has exactly one admitted Pose', () => {
    // GAEA is the case that settles the rule: one admitted Pose, so the shorthand is unambiguous.
    expect(resolvePose(poses, catalogue, 'gaea')).toMatchObject({
      kind: 'resolved',
      pose: { id: 'gaea-ur-city-4-2' }
    });
    expect(resolvePose(poses, catalogue, 'vesta')).toEqual({
      kind: 'ambiguous',
      poses: ['vesta-parliament-4-6', 'vesta-transporter']
    });
    expect(resolvePose(poses, catalogue, 'eris').kind).toBe('ambiguous');
    expect(resolvePose(poses, catalogue, 'dion').kind).toBe('ambiguous');
  });

  test('an unanchored Pose is declined by name, which is why Poses are addressable', () => {
    expect(resolvePose(poses, catalogue, 'gaea-transporter')).toMatchObject({
      kind: 'unanchored',
      pose: { id: 'gaea-transporter' }
    });
  });

  test('an unknown name is unknown', () => {
    expect(resolvePose(poses, catalogue, 'tharsis').kind).toBe('unknown');
    expect(resolvePose(poses, catalogue, '').kind).toBe('unknown');
  });
});

describe('the authored body switch', () => {
  test('moves Body, Pose and workspace binding together', () => {
    const session = new DamoclesSession(content);
    expect(session.snapshot.pose.body).toBe('body-11');
    expect(session.switchToPose('vesta-parliament-4-6')).toEqual({
      kind: 'switched',
      pose: 'vesta-parliament-4-6'
    });
    const after = session.snapshot.pose;
    expect(after.body).toBe('body-14');
    // The recovered standing position, to the unit.
    expect(after.position).toEqual({ x: 71_270_097, y: 63, z: 20_544_365 });
    // Cell 100 is local 4,6 against Vesta's workspace origin.
    expect(session.snapshot.cell).toEqual({ x: 4, z: 6 });
  });

  test('a declined switch leaves the session untouched', () => {
    for (const name of [
      'tharsis',
      'vesta',
      'gaea-transporter',
      'object-slot-183'
    ]) {
      const session = new DamoclesSession(content);
      const before = JSON.stringify(session.captureResume());
      const outcome = session.switchToPose(name);
      expect(outcome.kind).toBe('declined');
      expect(JSON.stringify(session.captureResume())).toBe(before);
    }
  });

  test('declines name the reason', () => {
    const session = new DamoclesSession(content);
    expect(session.switchToPose('tharsis')).toEqual({
      kind: 'declined',
      reason: "no Body or Pose named 'tharsis'"
    });
    expect(session.switchToPose('gaea-transporter')).toEqual({
      kind: 'declined',
      reason: 'gaea-transporter has no recovered workspace origin'
    });
    const ambiguous = session.switchToPose('eris');
    expect(ambiguous.kind).toBe('declined');
    expect(ambiguous.kind === 'declined' && ambiguous.reason).toContain(
      'eris-spaceport-onfoot, eris-transporter-11-8'
    );
  });

  test('does not touch the Carried Stack, residence or the Damocles Script', () => {
    const opened = new DamoclesSession(content);
    opened.teleportToCell(7, 8);
    const session = standingAt(opened, 'object-slot-183');
    expect(session.take().kind).toBe('took');
    const carried = [...session.snapshot.carried];
    expect(carried).toEqual(['object-slot-183']);
    const script = JSON.stringify(session.captureResume().script);

    expect(session.switchToPose('vesta-parliament-4-6').kind).toBe('switched');
    expect(session.snapshot.carried).toEqual(carried);
    // A carried object holds body byte $78 (VOID), so it is body-independent by the original's
    // own rule rather than by our convention.
    expect(
      session
        .captureResume()
        .residence.find(item => item.instance === 'object-slot-183')?.residence
        .kind
    ).toBe('carried');
    expect(JSON.stringify(session.captureResume().script)).toBe(script);
  });

  test('a Body never visited has no session state', () => {
    const session = new DamoclesSession(content);
    expect(session.captureResume().residence).toEqual([]);
    session.switchToPose('dion-2-3');
    // Residence materialises lazily: the Catalogue is the authority for everything unmoved, so
    // arriving somewhere records nothing.
    expect(session.captureResume().residence).toEqual([]);
  });
});

describe('the cross-body trace', () => {
  test('a Vesta drop survives a switch to Eris, a take, a Save and a restore', () => {
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const session = new DamoclesSession(content);

    // Stand on Vesta and drop something there.
    expect(session.switchToPose('vesta-parliament-4-6').kind).toBe('switched');
    const vestaKey = 'object-slot-92';
    const dropped = new DamoclesSession(content, {
      ...session.captureResume(),
      carried: [vestaKey],
      residence: [
        {
          instance: vestaKey,
          residence: {
            kind: 'carried',
            placementClass: catalogue.instances.find(
              item => item.id === vestaKey
            )!.placementClass!
          }
        }
      ]
    });
    expect(dropped.drop().kind).toBe('dropped');
    // A drop sets the inventory-label scroll counter to +16, and both handlers refuse while it
    // is non-zero. Let it settle, as the live session does.
    dropped.advance(16 / 50);
    const vestaResidence = dropped
      .captureResume()
      .residence.find(item => item.instance === vestaKey)!.residence;
    expect(vestaResidence.kind).toBe('surface');

    // Switch to Eris and take the limo key there.
    expect(dropped.switchToPose('eris-spaceport-onfoot').kind).toBe('switched');
    dropped.teleportToCell(7, 8);
    const onEris = standingAt(dropped, 'object-slot-183');
    expect(onEris.take().kind).toBe('took');
    expect(onEris.snapshot.carried).toEqual(['object-slot-183']);

    // Save, restore.
    const record = {
      identity,
      savedAt: '2026-09-19T12:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: onEris.captureResume(),
      where: 'ERIS'
    };
    const decoded = decodeDamoclesSave(
      encodeDamoclesSave(record),
      identity,
      catalogue,
      poses
    );
    const restored = new DamoclesSession(content, decoded.snapshot);

    // The Eris object is still carried; stack order and head unchanged.
    expect(restored.snapshot.carried).toEqual(['object-slot-183']);
    // The Vesta object is where it was left, with its full residence and placement class.
    expect(
      restored
        .captureResume()
        .residence.find(item => item.instance === vestaKey)!.residence
    ).toEqual(vestaResidence);

    // Switch back: the Vesta object has not moved and nothing was restarted.
    const script = JSON.stringify(restored.captureResume().script);
    expect(restored.switchToPose('vesta-parliament-4-6').kind).toBe('switched');
    expect(
      restored
        .captureResume()
        .residence.find(item => item.instance === vestaKey)!.residence
    ).toEqual(vestaResidence);
    expect(JSON.stringify(restored.captureResume().script)).toBe(script);
  });
});

describe('a Save names a Body with an admitted Pose', () => {
  test('a Body the Catalogue knows but no Pose anchors is refused', () => {
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const session = new DamoclesSession(content);
    const snapshot = session.captureResume();
    const record = {
      identity,
      savedAt: '2026-09-19T12:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      // ICARUS is a Catalogue Body with no arrival Pose at all.
      snapshot: { ...snapshot, pose: { ...snapshot.pose, body: 'body-1' } },
      where: 'ICARUS'
    };
    expect(() =>
      decodeDamoclesSave(encodeDamoclesSave(record), identity, catalogue, poses)
    ).toThrow(/admitted arrival Pose/);
    // Without the poses the older rule still applies, so the Catalogue check is not weakened.
    expect(() =>
      decodeDamoclesSave(
        encodeDamoclesSave({
          ...record,
          snapshot: { ...snapshot, pose: { ...snapshot.pose, body: 'nowhere' } }
        }),
        identity,
        catalogue
      )
    ).toThrow(/unknown Body/);
  });
});
