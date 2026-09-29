import { beforeAll, describe, expect, test } from 'bun:test';

import { type Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { initialHeadCommands } from '../src/damocles/headCommands.ts';
import { parseDamoclesArrivalPoses } from '../src/damocles/poses.ts';
import {
  catalogueResidence,
  generateAcceptanceMatrix,
  insertionsInRegion,
  structureStoreyHeight,
  validStructureResidence
} from '../src/damocles/residence.ts';
import { initialDamoclesSaveScript } from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
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
      residentCount: 190
    });
    expect(matrix.rows).toHaveLength(expectedPairs);
    // Twenty-one Bodies carry an admitted Pose since #172 recovered their workspace origins,
    // so the matrix now sweeps every placed resident against all of them rather than four.
    expect(new Set(matrix.rows.map(row => row.body)).size).toBe(21);
    for (const body of ['body-4', 'body-8', 'body-11', 'body-14']) {
      expect(matrix.rows.some(row => row.body === body)).toBe(true);
    }
    expect(new Set(matrix.rows.map(row => row.instance))).toHaveLength(190);
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
      // MIDAS: a Body with an arrival Pose and no recovered workspace origin, so anchoring it
      // is what would widen the matrix. ICARUS stood here until #172 anchored it.
      body: 'body-2',
      id: 'newly-anchored',
      onFoot: false
    });
    expect(generateAcceptanceMatrix(catalogue, newBodyPose).rows).toHaveLength(
      expectedPairs + placed.length
    );
  });

  test('generated observed/derived fixtures execute Take and every support class on every admitted Body', () => {
    const matrix = generateAcceptanceMatrix(catalogue, arrivalPoses);
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
        script: initialDamoclesSaveScript(),
        scrollCounter: 0,
        spaceMemory: null,
        structure: null
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
    // 190 placed residents on 21 Bodies: about 5 s alone, three times that in a full run.
  }, 60_000);
});

describe('a resident is exposed by its own insertion pairs', () => {
  /// Before this rule, the port asked the **parent** for its association-group table. The
  /// extractor publishes that table for Capital Spaceport alone, so every other structure fell
  /// back to the implicit `(group, group)` pair and its residents were placed and never drawn.
  /// The pairs were in the payload the whole time, on each resident.
  test('the payload publishes the pairs per resident, not per parent', () => {
    const withTable = catalogue.instances.filter(
      item => item.associationGroups !== null
    );
    expect(withTable.map(item => item.id)).toEqual(['eris-surface-87']);
    // Every placed structure resident carries its own group's pairs. Seven once kept the
    // implicit pair alone: they stand on upper Floors, and their pairs are in the association
    // list of the structure their Floor binds, not the ground structure's.
    const placed = catalogue.instances.filter(
      item => item.placement !== null && item.association !== null
    );
    expect(placed.length).toBe(190);
    expect(
      placed.filter(item => item.association!.insertions.length > 0).length
    ).toBe(190);
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
    const parent = catalogue.instances.find(
      item => item.id === 'eris-surface-87'
    )!;
    const table = parent.associationGroups!.find(group => group.group === 12)!;
    // The resident's own pairs and the parent's table agree, which is what lets one replace
    // the other without changing the one structure that publishes both.
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
