import { beforeAll, describe, expect, test } from 'bun:test';

import { type Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { planErisFrame } from '../src/damocles/frame.ts';
import {
  admittedPoses,
  resolvePose,
  type ArrivalPoses
} from '../src/damocles/poses.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  damoclesWhere,
  decodeDamoclesSave,
  encodeDamoclesSave
} from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

let catalogue: Catalogue;
let content: DamoclesContent;
let poses: ArrivalPoses;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  poses = await arrivalPoses();
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses,
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
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
  test('are the twenty-five anchored Poses on twenty-one Bodies', () => {
    // #172 extracted eighteen further live workspaces, so the origins these Poses were waiting
    // on now exist and the Poses are admitted. The gate itself is unchanged: a Pose is admitted
    // exactly when a recovered workspace origin anchors its cell.
    const admitted = admittedPoses(poses);
    expect(admitted.map(pose => pose.id).sort()).toEqual([
      'acheron',
      'atropos',
      'bacchus-transporter',
      'clotho',
      'cronus',
      'cyclopes',
      'dion-2-3',
      'dion-transporter',
      'eris-spaceport-onfoot',
      'eris-transporter-11-8',
      'gaea-transporter',
      'gaea-ur-city-4-2',
      'icarus',
      'logos-transporter',
      'lucan',
      'mentor-transporter',
      'metis-transporter',
      'pan',
      'perseus',
      'solon',
      'thalia',
      'theon',
      'tolosa',
      'vesta-parliament-4-6',
      'vesta-transporter'
    ]);
    expect(new Set(admitted.map(pose => pose.body)).size).toBe(21);
    // MIDAS and DAMOCLES are the two that stay out, and for a stated reason: neither capture
    // stands in a built workspace, so the extractor refuses to place either (#172).
    const unanchored = poses.poses.filter(
      pose => pose.workspaceOrigin === null
    );
    expect(unanchored.map(pose => pose.id).sort()).toEqual([
      'damocles',
      'midas'
    ]);
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
    // CLOTHO is the case that settles the rule: one admitted Pose, so the shorthand is
    // unambiguous. GAEA used to be that case and no longer is — its second window, CHALDEA
    // METROPOLIS, was recovered by #172, so the Body name now names two admitted Poses.
    expect(resolvePose(poses, catalogue, 'clotho')).toMatchObject({
      kind: 'resolved',
      pose: { id: 'clotho' }
    });
    expect(resolvePose(poses, catalogue, 'vesta')).toEqual({
      kind: 'ambiguous',
      poses: ['vesta-parliament-4-6', 'vesta-transporter']
    });
    expect(resolvePose(poses, catalogue, 'gaea').kind).toBe('ambiguous');
    expect(resolvePose(poses, catalogue, 'eris').kind).toBe('ambiguous');
    expect(resolvePose(poses, catalogue, 'dion').kind).toBe('ambiguous');
  });

  test('an unanchored Pose is declined by name, which is why Poses are addressable', () => {
    expect(resolvePose(poses, catalogue, 'midas')).toMatchObject({
      kind: 'unanchored',
      pose: { id: 'midas' }
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
    for (const name of ['tharsis', 'vesta', 'midas', 'object-slot-183']) {
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
    expect(session.switchToPose('midas')).toEqual({
      kind: 'declined',
      reason: 'midas has no recovered workspace origin'
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

  test('names the Body it reached, everywhere a location is put into words', () => {
    // The console `where`, the Session Resume and the Save slot line all go through
    // `damoclesWhere`, which used to spell ERIS whatever Body the player stood on.
    const session = new DamoclesSession(content);
    expect(session.snapshot.bodyName).toBe('ERIS');
    expect(damoclesWhere(session.snapshot)).toBe('ERIS 07-08');
    expect(session.switchToPose('vesta-parliament-4-6').kind).toBe('switched');
    expect(session.snapshot.bodyName).toBe('VESTA');
    expect(damoclesWhere(session.snapshot)).toBe('VESTA 04-06');
    // GAEA now names two admitted Poses, so the Body shorthand no longer resolves; the Pose id
    // does, and that is the point of addressing Poses rather than Bodies (#172).
    expect(session.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
    expect(damoclesWhere(session.snapshot)).toBe('GAEA 04-02');
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

describe('an arrival Pose lands on its captured Floor', () => {
  test('the Vesta and Eris transporter captures land on Floor 10 at their own height', () => {
    // `$7AA4` is 10 in both captures: storey 317 at Vesta, 110 at Eris (#505).
    for (const [name, structure, y] of [
      ['vesta-transporter', 'vesta-surface-64', 3233],
      ['eris-transporter-11-8', 'eris-surface-8b', 1163]
    ] as const) {
      const session = new DamoclesSession(content);
      expect(session.switchToPose(name).kind).toBe('switched');
      expect(session.snapshot.structure).toMatchObject({
        floor: 10,
        instanceId: structure
      });
      expect(session.labelFloor).toBe(10);
      expect(session.snapshot.pose.position.y).toBe(y);
    }
  });

  test('an upper-Floor Pose stands in the region its capture held', () => {
    // `$7AFC`, the region the queue assembler reads, in each capture above Floor 0. The port
    // draws an upper Floor in the frame of the instance that binds it (#531): at Eris 11,8
    // Floor 10 the instance is 3x3 and the Floor's own slot 1x1, and read at its own scale the
    // Floor is a third the size and the Pose stands in no region at all.
    for (const [name, floor, region] of [
      ['eris-transporter-11-8', 10, 5],
      ['vesta-transporter', 10, 8],
      ['metis-transporter', 9, 5],
      ['dion-transporter', 1, 4],
      ['gaea-transporter', 1, 4],
      ['logos-transporter', 4, 10],
      ['pan', 1, 3]
    ] as const) {
      const session = new DamoclesSession(content);
      expect(session.switchToPose(name).kind).toBe('switched');
      const structure = session.snapshot.structure!;
      expect(structure.floor).toBe(floor);
      expect(structure.regionIndex! + 1).toBe(region);
    }
  });

  test('every admitted Pose lands on the Floor its capture stood on', () => {
    for (const pose of admittedPoses(poses)) {
      const session = new DamoclesSession(content);
      expect(session.switchToPose(pose.id).kind).toBe('switched');
      expect(session.snapshot.structure?.floor ?? 0).toBe(pose.floor);
      expect(session.snapshot.pose.position.y).toBe(pose.position.y);
    }
  });

  test('a Floor the structure in its cell does not bind is declined', () => {
    const session = new DamoclesSession({
      ...content,
      poses: {
        ...poses,
        poses: poses.poses.map(pose =>
          pose.id === 'vesta-transporter' ? { ...pose, floor: 5 } : pose
        )
      }
    });
    const before = JSON.stringify(session.captureResume());
    const outcome = session.switchToPose('vesta-transporter');
    expect(outcome.kind).toBe('declined');
    expect(outcome.kind === 'declined' && outcome.reason).toEndWith(
      ' binds no Floor 5'
    );
    expect(JSON.stringify(session.captureResume())).toBe(before);
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
    const decoded = decodeDamoclesSave(encodeDamoclesSave(record), identity, {
      catalogue,
      poses
    });
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

describe('a Save names a Body an admitted Pose or a landing reaches', () => {
  test('a Body neither anchors is refused, and one only a landing reaches is not (#567)', () => {
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const session = new DamoclesSession(content);
    const snapshot = session.captureResume();
    const on = (body: string, where: string) => ({
      identity,
      savedAt: '2026-09-19T12:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: { ...snapshot, pose: { ...snapshot.pose, body } },
      where
    });
    // DIALIS, the star, is never arrived at, and VOID is not in the range scan's table.
    for (const [body, where] of [
      ['body-0', 'DIALIS'],
      ['body-30', 'VOID']
    ] as const) {
      expect(() =>
        decodeDamoclesSave(encodeDamoclesSave(on(body, where)), identity, {
          catalogue,
          poses
        })
      ).toThrow(/no admitted Pose or landing reaches/);
    }
    // MIDAS has an arrival Pose and no recovered workspace origin, but a landing reaches it.
    expect(
      decodeDamoclesSave(encodeDamoclesSave(on('body-2', 'MIDAS')), identity, {
        catalogue,
        poses
      }).snapshot.pose.body
    ).toBe('body-2');
    // Without the poses the older rule still applies, so the Catalogue check is not weakened.
    expect(() =>
      decodeDamoclesSave(encodeDamoclesSave(on('nowhere', 'MIDAS')), identity, {
        catalogue
      })
    ).toThrow(/unknown Body/);
  });
});

describe('the Session Snapshot publishes the workspace it stands on', () => {
  /// What each admitted arrival Pose draws from its own Body's workspace (#379).
  ///
  /// Absolute counts, not comparisons: the browser drew empty sky on every Body but Eris while
  /// every relative assertion in this suite still passed, because it planned the presentation
  /// document's Eris surface whatever Body the Pose named. Only the geometry of the Body stood
  /// on can catch that, so these are pinned. A transporter capture above Floor 0 draws the
  /// structure its Floor binds, since the Pose lands on the Floor it was captured on (#505).
  const arrivals = [
    {
      body: 'body-11',
      cell: { x: 7, z: 8 },
      islandTriangles: 0,
      placements: 439,
      pose: 'eris-spaceport-onfoot',
      triangles: 721
    },
    {
      body: 'body-11',
      cell: { x: 11, z: 8 },
      islandTriangles: 0,
      placements: 439,
      pose: 'eris-transporter-11-8',
      // Floor 10 drawn in the instance's 3x3 frame, standing in region 5 as the capture does:
      // an enclosed region, so no ground record is drawn (#491, #531).
      enclosed: true,
      triangles: 330
    },
    {
      body: 'body-4',
      cell: { x: 2, z: 3 },
      islandTriangles: 0,
      placements: 952,
      pose: 'dion-2-3',
      triangles: 406
    },
    {
      body: 'body-4',
      cell: { x: 3, z: 14 },
      islandTriangles: 0,
      placements: 952,
      pose: 'dion-transporter',
      // Includes TRANSPORTER a (slot 66), placed on Floor 1 against the structure it binds.
      triangles: 526
    },
    {
      body: 'body-8',
      cell: { x: 4, z: 2 },
      // Gaea's two recovered windows, UR CITY and CHALDEA METROPOLIS, both place
      // into one Body surface; the frame draws only the occupied cell's (#172).
      islandTriangles: 0,
      placements: 373,
      pose: 'gaea-ur-city-4-2',
      triangles: 495
    },
    {
      body: 'body-14',
      cell: { x: 4, z: 6 },
      islandTriangles: 0,
      placements: 44,
      pose: 'vesta-parliament-4-6',
      triangles: 392
    },
    {
      body: 'body-14',
      cell: { x: 4, z: 6 },
      // A corridor on Floor 10, an enclosed region, where no ground record is drawn (#491).
      enclosed: true,
      islandTriangles: 0,
      placements: 44,
      pose: 'vesta-transporter',
      triangles: 302
    }
  ] as const;

  for (const arrival of arrivals) {
    test(`${arrival.pose} draws its own Body's workspace`, () => {
      const session = new DamoclesSession(content);
      if (arrival.pose !== 'eris-spaceport-onfoot') {
        expect(session.switchToPose(arrival.pose).kind).toBe('switched');
      }
      const snapshot = session.snapshot;
      expect(snapshot.surface.body.id).toBe(arrival.body);
      expect(snapshot.surface.placements.length).toBe(arrival.placements);
      expect(snapshot.cell).toEqual(arrival.cell);

      const plan = planErisFrame(
        snapshot.surface,
        snapshot.pose,
        content.doc,
        snapshot.structure,
        snapshot.residents
      );
      expect(plan.triangleCount).toBe(arrival.triangles);
      // The base plane is the Body's own colour, and the island fills over it are that Body's
      // own records: a surface left on Eris would paint the wrong sea and the wrong coasts.
      expect(plan.fillTriangleCount).toBeGreaterThan(0);
      if ('enclosed' in arrival) {
        expect(plan.groundTriangleCount).toBe(0);
      } else {
        expect(plan.groundTriangleCount).toBeGreaterThan(0);
      }
      // Every arrival stands on an island's core or on a Body with no coast, where `$0560F2`
      // draws no island (#578). One unit above Y's high word every island of the Body is
      // filled, and only that Body's.
      expect(plan.islandTriangleCount).toBe(arrival.islandTriangles);
      const aloft = planErisFrame(
        snapshot.surface,
        {
          ...snapshot.pose,
          position: { ...snapshot.pose.position, y: 0x1_00_00 }
        },
        content.doc
      );
      const coasts = snapshot.surface.islands.filter(
        island => island.coastline.vertices.length >= 3
      );
      expect(aloft.islandTriangleCount > 0).toBe(coasts.length > 0);
      const name = catalogue.bodies
        .find(body => body.id === arrival.body)!
        .name.toLowerCase();
      for (const island of coasts) {
        expect(island.id.startsWith(`island-${name}-`)).toBe(true);
      }
    });
  }

  test('a Save restored onto another Body publishes that Body’s workspace', () => {
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const away = new DamoclesSession(content);
    expect(away.switchToPose('dion-2-3').kind).toBe('switched');
    const decoded = decodeDamoclesSave(
      encodeDamoclesSave({
        identity,
        savedAt: '2026-09-19T12:00:00.000Z',
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot: away.captureResume(),
        where: damoclesWhere(away.snapshot)
      }),
      identity,
      { catalogue, poses }
    );
    // The restore path builds its surface in the constructor rather than through a switch, so
    // it is asserted separately: this is the boot the browser performs on a resumed session.
    const restored = new DamoclesSession(content, decoded.snapshot).snapshot;
    expect(restored.surface.body.id).toBe('body-4');
    expect(restored.surface.grid.origin).toEqual(
      away.snapshot.surface.grid.origin
    );
    expect(
      planErisFrame(
        restored.surface,
        restored.pose,
        content.doc,
        restored.structure,
        restored.residents
      ).triangleCount
    ).toBe(406);
  });
});

describe('Atlas Travel', () => {
  test('travels to exact fractional Body Coordinates and preserves session continuity', async () => {
    const opened = new DamoclesSession(content);
    opened.teleportToCell(7, 8);
    const session = standingAt(opened, 'object-slot-183');
    expect(session.take().kind).toBe('took');
    session.advance(1 / 50);
    const before = session.captureResume();
    const target = { bodyId: 'body-14', x: 1087.1, z: 313.1 };
    await DamoclesSession.prepareAtlasTravel(content, target);
    expect(session.travelToAtlas(target)).toEqual({ kind: 'travelled' });
    const after = session.captureResume();
    expect(after.pose.body).toBe(target.bodyId);
    expect(after.pose.position).toEqual({
      x: target.x * content.doc.grid.cellUnits,
      y: content.doc.eye.heightUnits,
      z: target.z * content.doc.grid.cellUnits
    });
    expect(after.pose.heading).toBe(before.pose.heading);
    expect(after.pose.pitch).toBe(0);
    expect(after.script).toEqual(before.script);
    expect(after.carried).toEqual(before.carried);
    expect(after.residence).toEqual(before.residence);
    expect(after.elapsed).toBe(before.elapsed);
  });

  test('refuses unplayable Bodies and non-finite coordinates atomically', () => {
    const session = new DamoclesSession(content);
    const before = session.captureResume();
    for (const target of [
      { bodyId: 'body-unknown', x: 0, z: 0 },
      { bodyId: 'body-11', x: Number.NaN, z: 0 },
      { bodyId: 'body-11', x: 0, z: Infinity },
      { bodyId: 'body-11', x: 0, z: 0 }
    ]) {
      expect(session.travelToAtlas(target).kind).toBe('declined');
      expect(session.captureResume()).toEqual(before);
    }
  });

  test('carries an occupied object across Bodies and leaves it there after reload', () => {
    const initial = new DamoclesSession(content).captureResume();
    const instance = catalogue.instances.find(
      item => item.boarding?.boardable && item.boarding.admission !== null
    )!;
    const session = new DamoclesSession(content, {
      ...initial,
      occupancy: { instance: instance.id, kind: 'aboard' },
      residence: [
        {
          instance: instance.id,
          residence: {
            kind: 'occupied',
            placementClass: instance.placementClass ?? 0
          }
        }
      ]
    });
    expect(
      session.travelToAtlas({ bodyId: 'body-14', x: 1087.1, z: 313.1 }).kind
    ).toBe('travelled');
    const restored = new DamoclesSession(content, session.captureResume());
    expect(restored.leave().kind).toBe('left');
    expect(
      restored
        .captureResume()
        .residence.find(item => item.instance === instance.id)?.residence
    ).toMatchObject({ body: 'body-14', kind: 'surface' });
  });
});
