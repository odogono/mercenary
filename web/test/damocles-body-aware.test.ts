import { beforeAll, describe, expect, test } from 'bun:test';

import { type Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { initialHeadCommands } from '../src/damocles/headCommands.ts';
import { parseDamoclesArrivalPoses } from '../src/damocles/poses.ts';
import {
  catalogueResidence,
  generateAcceptanceMatrix,
  insertionsInRegion,
  structureInsertionGroups,
  structureStoreyHeight,
  validStructureResidence
} from '../src/damocles/residence.ts';
import { initialDamoclesSaveScript } from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { isTransporterSlot } from '../src/damocles/transporter.ts';
import { erisSurfaceFrom, residentSlot } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import {
  admittedStructures,
  reachedNodes,
  residentReachability,
  transporterStand,
  walkToResident,
  type Reachability,
  type Structure
} from './damocles-reachability.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

let catalogue: Catalogue;
/// The raw payload, for the acceptance-matrix generator, which reads it as published.
let arrivalPoses: unknown;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  arrivalPoses = await Bun.file(
    '../payload/damocles/arrival-poses.json'
  ).json();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: parseDamoclesArrivalPoses(arrivalPoses),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

describe('body-aware Object Residence', () => {
  test('takes the placement class from Association A byte 3, not the handling byte', () => {
    // $6FAB is mutable placement state the Drop rewrites; $6FAA is the interaction byte the
    // Take handler tests. They are different bytes of the same longword and they disagree for
    // most residents, so a Residence derived from the handling nibble is a fabrication
    // (docs/research/damocles-placement-class.md).
    const residents = catalogue.instances.filter(
      instance => instance.handling !== null
    );
    expect(residents.length).toBe(241);
    expect(residents.every(instance => instance.placementClass !== null)).toBe(
      true
    );
    const disagreeing = residents.filter(
      instance => instance.placementClass !== (instance.handling!.byte & 0x0f)
    );
    expect(disagreeing.length).toBe(176);
    // TABLE slot 202 supplies rank 3 and requires rank 3, so its handling nibble is $F while
    // its recovered class is 4; KEY - 22 CV slot 178 has handling 4 and class 6.
    expect(
      catalogueResidence(catalogue, 'object-slot-202')?.placementClass
    ).toBe(4);
    expect(
      catalogue.instances.find(item => item.id === 'object-slot-178')
        ?.placementClass
    ).toBe(6);
  });

  test('derives every recovered placement without denormalising its parent', () => {
    const residence = catalogueResidence(catalogue, 'object-slot-202');
    expect(residence).toEqual({
      body: 'body-14',
      insertionGroup: 12,
      kind: 'structure',
      level: 2,
      parent: 'vesta-surface-64',
      placementClass: 4,
      position: { x: 632, y: 634, z: 878 }
    });
    expect(structureStoreyHeight(catalogue, 'vesta-surface-64')).toBe(317);
    expect(structureStoreyHeight(catalogue, 'dion-surface-33')).toBe(240);
    expect(
      catalogue.instances
        .filter(instance => instance.placement !== null)
        .every(instance => {
          const placed = catalogueResidence(catalogue, instance.id);
          return (
            placed?.kind !== 'structure' ||
            validStructureResidence(catalogue, placed)
          );
        })
    ).toBe(true);
  });

  test('generates deterministic placement-by-admitted-Body coverage', () => {
    const matrix = generateAcceptanceMatrix(catalogue, arrivalPoses);
    const admitted = (
      arrivalPoses as {
        poses: readonly {
          body: string;
          id: string;
          onFoot: boolean;
          workspaceOrigin: unknown;
        }[];
      }
    ).poses.filter(p => p.onFoot && p.workspaceOrigin !== null);
    const admittedBodies = new Set(admitted.map(pose => pose.body));
    const placed = catalogue.instances.filter(
      instance => instance.placement !== null && instance.association !== null
    );
    const expectedPairs = placed.length * admittedBodies.size;

    expect(matrix).toMatchObject({
      residentCount: 195
    });
    expect(matrix.rows).toHaveLength(expectedPairs);
    // Twenty-two Bodies carry an admitted Pose since #172 recovered their workspace origins
    // and anchored MIDAS to its field, so the matrix sweeps every placed resident against all
    // of them rather than four.
    expect(new Set(matrix.rows.map(row => row.body)).size).toBe(22);
    for (const body of ['body-4', 'body-8', 'body-11', 'body-14']) {
      expect(matrix.rows.some(row => row.body === body)).toBe(true);
    }
    expect(new Set(matrix.rows.map(row => row.instance))).toHaveLength(195);
    expect(matrix.rows.every(row => row.take.tag === 'observed')).toBe(true);
    expect(matrix.rows.every(row => row.drops.length > 0)).toBe(true);
    expect(
      matrix.rows.find(
        row => row.body === 'body-11' && row.instance === 'object-slot-183'
      )
    ).toMatchObject({
      take: { outcome: 'took' },
      triggerResponse: 'damocles.script.slot-2'
    });
    expect(
      matrix.rows.find(
        row => row.body === 'body-14' && row.instance === 'object-slot-183'
      )
    ).toMatchObject({
      take: { outcome: 'refused' },
      triggerResponse: null
    });
    expect(matrix.rows).toEqual(
      [...matrix.rows].sort(
        (a, b) =>
          a.body.localeCompare(b.body) ||
          a.instance.localeCompare(b.instance) ||
          a.pose.localeCompare(b.pose)
      )
    );

    const changed = structuredClone(arrivalPoses) as {
      poses: { body: string; workspaceOrigin: unknown }[];
    };
    changed.poses = changed.poses.map(pose =>
      pose.body === 'body-11' ? { ...pose, workspaceOrigin: null } : pose
    );
    expect(generateAcceptanceMatrix(catalogue, changed).rows).toHaveLength(
      expectedPairs - placed.length
    );
    const example = placed[0]!;
    const extended: Catalogue = {
      ...catalogue,
      instances: [
        ...catalogue.instances,
        { ...example, id: 'newly-recovered-resident' }
      ]
    };
    expect(generateAcceptanceMatrix(extended, arrivalPoses).rows).toHaveLength(
      expectedPairs + admittedBodies.size
    );
    const newBodyPose = structuredClone(arrivalPoses) as {
      poses: {
        body: string;
        id: string;
        onFoot: boolean;
        workspaceOrigin: unknown;
      }[];
    };
    newBodyPose.poses.push({
      ...newBodyPose.poses.find(pose => pose.workspaceOrigin !== null)!,
      // DAMOCLES: a Body with an arrival Pose and no recovered workspace origin, so anchoring
      // it is what would widen the matrix. ICARUS, then MIDAS, stood here until #172 anchored
      // each.
      body: 'body-29',
      id: 'newly-anchored',
      onFoot: false
    });
    expect(generateAcceptanceMatrix(catalogue, newBodyPose).rows).toHaveLength(
      expectedPairs + placed.length
    );
  });

  test('generated observed/derived fixtures execute Take and every support class on every admitted Body', () => {
    const matrix = generateAcceptanceMatrix(catalogue, arrivalPoses);
    const arrived = new DamoclesSession(content);
    expect(arrived.switchToPose('midas').kind).toBe('switched');
    const midasBound = arrived.captureResume().structure;
    for (const row of matrix.rows) {
      const body = catalogue.bodies.find(body => body.id === row.body)!;
      const isolated = {
        ...content,
        surface: { ...content.surface, body, placements: [] }
      };
      const base = {
        angleBytes: [],
        bodyTurn: 0,
        briefcaseStore: [],
        craft: null,
        doorsMoving: false,
        elapsed: 0,
        encounter: null,
        footTicks: 0,
        frameAccumulator: 0,
        headCommands: initialHeadCommands(),
        occupancy: { kind: 'onFoot' as const },
        pendingBriefcaseDrop: null,
        pose: {
          body: row.body,
          heading: 0,
          pitch: 0,
          position: { x: 0, y: 63, z: 0 }
        },
        running: false,
        script: initialDamoclesSaveScript(),
        scrollCounter: 0,
        spaceMemory: null,
        // A uniform field holds a structure in every cell, so a Save standing on one names the
        // copy it stands in; everywhere else the origin cell binds nothing.
        structure:
          row.body === 'body-2'
            ? {
                ...midasBound!,
                instanceId: 'midas-the-midas-project-surface-0-0',
                regionIndex: null
              }
            : null
      };
      const session = new DamoclesSession(isolated, {
        ...base,
        carried: [],
        residence: [
          {
            instance: row.instance,
            residence: {
              body: row.residentBody,
              kind: 'surface',
              placementClass: row.residence.placementClass,
              position: { x: 0, y: 0, z: 0 }
            }
          }
        ]
      });
      expect({
        body: row.body,
        instance: row.instance,
        outcome: session.take().kind
      }).toEqual({
        body: row.body,
        instance: row.instance,
        outcome: row.take.outcome
      });
      if (row.take.outcome === 'took') {
        expect(session.snapshot.carried[0]).toBe(row.instance);
      }
      for (const drop of row.drops) {
        const dropping = new DamoclesSession(isolated, {
          ...base,
          carried: [row.instance],
          residence: [
            {
              instance: row.instance,
              residence: {
                kind: 'carried',
                placementClass: row.residence.placementClass
              }
            },
            ...(drop.support === null
              ? []
              : [
                  {
                    instance: drop.support,
                    residence: {
                      body: row.body,
                      kind: 'surface' as const,
                      placementClass: drop.supportClass!,
                      position: { x: 20, y: 0, z: 0 }
                    }
                  }
                ])
          ],
          script: {
            ...base.script,
            triggers: base.script.triggers.map(trigger =>
              trigger.index === 2 && row.instance === 'object-slot-183'
                ? { ...trigger, armed: false }
                : trigger
            )
          }
        });
        expect({
          body: row.body,
          instance: row.instance,
          outcome: dropping.drop().kind,
          support: drop.support
        }).toEqual({
          body: row.body,
          instance: row.instance,
          outcome: drop.outcome,
          support: drop.support
        });
      }
    }
    // 195 placed residents on 22 Bodies: about 12 s alone on a laptop, and
    // minutes on a two-core CI runner.
  }, 400_000);
});

describe('a resident is exposed by its own insertion pairs', () => {
  /// Before this rule, the port asked the **parent** for its Insertion Groups, which were then
  /// published for Capital Spaceport alone, so every other structure fell back to the implicit
  /// `(group, group)` pair and its residents were placed and never drawn. The pairs were in the
  /// payload the whole time, on each resident.
  test('the payload publishes the pairs per resident', () => {
    // Every placed structure resident carries its own group's pairs. Seven once kept the
    // implicit pair alone: they stand on upper Floors, and their pairs are in the association
    // list of the structure their Floor binds, not the ground structure's.
    const placed = catalogue.instances.filter(
      item => item.placement !== null && item.association !== null
    );
    expect(placed.length).toBe(195);
    expect(
      placed.filter(item => item.association!.insertions.length > 0).length
    ).toBe(195);
  });

  test('counts the implicit own-region pair and the explicit ones', () => {
    const computer = catalogueResidence(catalogue, 'object-slot-101')!;
    // Group 32 exposes AUTHORS COMPUTER in seven regions, none of them region 32 itself.
    expect(insertionsInRegion(catalogue, 'object-slot-101', computer, 11)).toBe(
      1
    );
    expect(insertionsInRegion(catalogue, 'object-slot-101', computer, 28)).toBe(
      1
    );
    expect(insertionsInRegion(catalogue, 'object-slot-101', computer, 18)).toBe(
      0
    );
    // The implicit pair still fires where the group numbers the region.
    expect(insertionsInRegion(catalogue, 'object-slot-101', computer, 32)).toBe(
      1
    );
  });

  test('the Capital Spaceport answer is unchanged by the switch of source', () => {
    const key = catalogueResidence(catalogue, 'object-slot-183')!;
    const table = structureInsertionGroups(
      catalogue,
      'eris-surface-87',
      0
    )!.find(group => group.group === 12)!;
    // The resident's own pairs and the parent's Insertion Group agree, so either answers.
    expect(
      catalogue.instances
        .find(item => item.id === 'object-slot-183')!
        .association!.insertions.map(pair => pair.regionSelector)
    ).toEqual(table.pairs.map(pair => pair.regionSelector));
    expect(insertionsInRegion(catalogue, 'object-slot-183', key, 11)).toBe(1);
    expect(insertionsInRegion(catalogue, 'object-slot-183', key, 18)).toBe(0);
  });

  test('four Dion residents are drawn from the cell centre alone', async () => {
    /// A `goto` to every Dion cell, collecting whatever the Session Snapshot draws there. Before
    /// the rule changed this found nothing at all on Dion.
    ///
    /// The cell centre is one position, so this understates reachability: a resident exposed in a
    /// region the player must walk to is invisible here. The walked test below is the wider claim.
    const drawn = new Map<string, string>();
    for (let x = 0; x < 16; x += 1) {
      for (let z = 0; z < 16; z += 1) {
        const session = new DamoclesSession(content);
        expect(session.switchToPose('dion-2-3').kind).toBe('switched');
        session.teleportToCell(x, z);
        for (const item of session.snapshot.residents) {
          if (!drawn.has(item.id)) {
            drawn.set(item.id, `${x}-${z}`);
          }
        }
      }
    }
    expect(Object.fromEntries(drawn)).toEqual({
      'object-slot-128': '2-2',
      'object-slot-135': '9-14',
      'object-slot-50': '9-0',
      'object-slot-51': '9-0'
    });
  }, 30_000);

  test('walking into the next room reaches one the cell centre does not', async () => {
    /// Dion cell `0-10` binds region 11 at its centre, and `NOTE PAD` (slot 154) is
    /// exposed in regions 1, 3, 4, 5, 7 and 8. Walking south-west crosses into region 6's box and
    /// the resident appears — which is the difference between "placed" and "reachable", and the
    /// reason the sweep above is a floor rather than a count.
    const session = new DamoclesSession(content);
    expect(session.switchToPose('dion-2-3').kind).toBe('switched');
    session.teleportToCell(0, 10);
    expect(
      session.snapshot.residents.some(item => item.id === 'object-slot-154')
    ).toBe(false);

    session.intent = { ...session.intent, turn: 1, walk: 0 };
    while (session.snapshot.pose.heading < 3.9) {
      session.advance(0.02);
    }
    session.intent = { ...session.intent, turn: 0, walk: 1 };
    let drawn = false;
    for (let step = 0; step < 400 && !drawn; step += 1) {
      session.advance(0.02);
      drawn = session.snapshot.residents.some(
        item => item.id === 'object-slot-154'
      );
    }
    expect(drawn).toBe(true);
    expect(session.snapshot.structure?.instanceId).toBe('dion-surface-a0');
  }, 30_000);
});

/// Whether object `id` is drawn within selection range of the eye. Where another resident is
/// nearer, the selection takes that one first, so being in range is the claim.
const inRange = (session: DamoclesSession, id: string): boolean => {
  const drawn = session.snapshot.residents.find(item => item.id === id);
  const eye = session.snapshot.pose.position;
  return (
    drawn !== undefined &&
    Math.hypot(
      drawn.position.x - eye.x,
      drawn.position.y - eye.y,
      drawn.position.z - eye.z
    ) < 512
  );
};
/// The pickup-trigger residents, special items and door keys, which no nearer resident hides.
const SELECTED = new Set([
  183, 181, 151, 95, 101, 94, 108, 157, 158, 30, 33, 34
]);
const groundStarts = (structure: Structure) =>
  structure.starts.filter(node => node.floor === 0);
const everyLanding = (structure: Structure) => [...structure.landings.keys()];

/// #1002: which placed residents a player can select in the port, now that upper Floors are drawn
/// and every interior-associated resident is placed. The graph walks the session's own rules
/// (test/damocles-reachability.ts); the walked cases below corroborate it in a live session.
///
/// The count stands the player on the surface only, at the Floor 0 arrival Poses and by Atlas
/// Travel, and follows the Transporters from there (#1015). Every route was walked once while
/// this was written; the suite walks the cases the ledger names, since walking them all takes
/// minutes.
describe('placed resident reachability', () => {
  let surface: Reachability;
  /// The count without Transporters, as #1002 recorded it.
  let unhopped: Reachability;
  let admitted: Awaited<ReturnType<typeof admittedStructures>>;
  beforeAll(async () => {
    admitted = await admittedStructures(content);
    surface = residentReachability(catalogue, admitted, { groundOnly: true });
    unhopped = residentReachability(catalogue, admitted, {
      digits: false,
      groundOnly: true,
      ring: false
    });
  });

  const outcome = (reachability: Reachability, slot: number): string => {
    const reach = reachability.reach.get(`object-slot-${slot}`)!;
    return reach.kind === 'keyed'
      ? `keyed ${reach.keys.join(',')}`
      : reach.kind;
  };
  const rows = (reachability: Reachability): Record<string, number[]> => {
    const result: Record<string, number[]> = {};
    for (const id of reachability.reach.keys()) {
      const slot = Number(id.slice('object-slot-'.length));
      (result[outcome(reachability, slot)] ??= []).push(slot);
    }
    for (const slots of Object.values(result)) {
      slots.sort((a, b) => a - b);
    }
    return result;
  };

  test('from the surface every placed resident is selectable, 11 of them only with one door key', () => {
    expect(surface.reach.size).toBe(195);
    const { noKey, ...keyed } = rows(surface);
    expect(noKey).toHaveLength(184);
    expect(keyed).toEqual({
      'keyed 32': [47],
      'keyed 33': [102, 109, 111, 148, 220],
      'keyed 37': [159, 160, 161, 162],
      'keyed 38': [181]
    });
    // Every door key a reached structure's doors want is itself selectable with no key carried.
    expect(surface.wanted).toEqual([30, 31, 32, 33, 34, 37, 38]);
    for (const slot of surface.wanted) {
      expect(outcome(surface, slot)).toBe('noKey');
    }
    expect(admitted.declined.size).toBe(0);
  });

  test('Transporters take the player past the doors of keys 31 and 34', () => {
    // Without them the count is #1002's: 173 with no key. A hop to slot 64 lands inside Gaea Ur
    // City past key 31's door, and one to slot 68 on Vesta Parliament's Floor 10, whose lift
    // reaches the Floors below past key 34's.
    const { noKey, ...keyed } = rows(unhopped);
    expect(noKey).toHaveLength(173);
    expect(keyed['keyed 31']).toEqual([64, 84, 197]);
    expect(keyed['keyed 34']).toEqual([68, 108, 153, 184, 202, 215, 225, 230]);
    expect(rows(surface).noKey!.filter(slot => !noKey!.includes(slot))).toEqual(
      [...keyed['keyed 31']!, ...keyed['keyed 34']!].sort((a, b) => a - b)
    );
  });

  test('every hop lands standing in its Transporter, and the graph agrees it stands there', () => {
    expect(admitted.transporters).toEqual({
      placed: [64, 65, 66, 67, 68, 69, 70, 71, 72, 73],
      surface: [72, 73]
    });
    const landed = admitted.structures.flatMap(structure =>
      [...structure.landings].map(([slot, node]) => {
        const transporter = structure.transporters.find(
          item => item.slot === slot
        )!;
        expect(transporterStand(structure, node, transporter)).toEqual({
          stand: true,
          walkIn: true
        });
        return slot;
      })
    );
    expect(landed.sort((a, b) => a - b)).toEqual([
      64, 65, 66, 67, 68, 69, 70, 71
    ]);
  });

  test('ring steps alone reach every Transporter, so they count what digit hops do', () => {
    const ring = { digits: false, groundOnly: true };
    expect(
      [...reachedNodes(admitted, new Set(), ring).hopped].sort((a, b) => a - b)
    ).toEqual([...admitted.transporters.placed]);
    expect(rows(residentReachability(catalogue, admitted, ring))).toEqual(
      rows(surface)
    );
    expect(
      rows(
        residentReachability(catalogue, admitted, {
          groundOnly: true,
          ring: false
        })
      )
    ).toEqual(rows(surface));
  });

  test('the upper-Floor arrival Poses add nothing the Transporters do not', () => {
    // Six of the seven stand at Transporters 66 to 71, where a hop lands.
    expect(rows(residentReachability(catalogue, admitted))).toEqual(
      rows(surface)
    );
  });

  test('Authors House needs no key: an unkeyed side door opens on approach', () => {
    // #362 found these behind key A, with every attachment-gated region shut. An attachment with
    // no key byte opens on proximity alone.
    for (const slot of [14, 101, 234]) {
      expect(outcome(surface, slot)).toBe('noKey');
    }
  });

  /// The six pickup-trigger residents, the three special items, the three door keys #362 named,
  /// and one resident behind each key, which for keys 31 and 34 a hop reaches instead.
  const WALKED = [
    183, 181, 151, 95, 101, 94, 108, 157, 158, 30, 33, 34, 47, 64, 109, 159, 215
  ];
  test.each(WALKED)(
    'a walked session from the surface stands in selection range of object slot %i',
    slot => {
      const id = `object-slot-${slot}`;
      const reach = surface.reach.get(id)!;
      const session = walkToResident(
        content,
        admitted.structures,
        id,
        reach.kind === 'keyed' ? reach.keys : [],
        groundStarts,
        everyLanding
      );
      expect(inRange(session, id)).toBe(true);
      if (SELECTED.has(slot)) {
        expect(session.snapshot.selection).toEqual({
          inRange: true,
          instance: id,
          kind: 'object'
        });
      }
    },
    60_000
  );

  test('a walked hop from BACCHUS by digit 4 lands in Vesta Parliament, and its lift reaches object slot 215 without key 34', () => {
    expect(admitted.transporters.surface[0]).toBe(72);
    const id = 'object-slot-215';
    const session = walkToResident(
      content,
      admitted.structures,
      id,
      [],
      () => [],
      structure => (structure.landings.has(68) ? [68] : [])
    );
    expect(inRange(session, id)).toBe(true);
    expect(session.snapshot.structure?.instanceId).toBe('vesta-surface-64');
    expect(session.snapshot.structure?.floor).toBe(0);
  }, 60_000);

  test('every structure an upper-Floor Pose stands in is reached by a walked lift ride', () => {
    // Without Transporters the surface count reaches upper Floors only by lift; walk one
    // upper-Floor resident of each structure an arrival Pose stands above the ground in, from
    // the ground, since a hop may land on its Floor without a ride.
    const walked: string[] = [];
    for (const structure of admitted.structures) {
      if (structure.starts.every(node => node.floor === 0)) {
        continue;
      }
      // Not a Transporter: walking into one carries the player round the ring (#998).
      const resident = catalogue.instances.find(item => {
        const residence = catalogueResidence(catalogue, item.id);
        return (
          !isTransporterSlot(residentSlot(item.id) ?? -1) &&
          residence?.kind === 'structure' &&
          residence.parent === structure.ground.id &&
          residence.level !== 0 &&
          unhopped.reach.get(item.id)?.kind === 'noKey'
        );
      });
      if (resident === undefined) {
        continue;
      }
      const session = walkToResident(
        content,
        admitted.structures,
        resident.id,
        [],
        groundStarts
      );
      expect(inRange(session, resident.id)).toBe(true);
      expect(session.snapshot.structure?.floor).not.toBe(0);
      walked.push(structure.ground.id);
    }
    expect(walked.length).toBeGreaterThan(0);
  }, 300_000);
});
