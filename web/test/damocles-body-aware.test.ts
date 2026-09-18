import { beforeAll, describe, expect, test } from 'bun:test';

import { parseCatalogue, type Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  catalogueResidence,
  generateAcceptanceMatrix,
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

let catalogue: Catalogue;
let arrivalPoses: unknown;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  arrivalPoses = await Bun.file(
    '../payload/damocles/arrival-poses.json'
  ).json();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, doc)
  };
});

describe('body-aware Object Residence', () => {
  test('derives every recovered placement without denormalising its parent', () => {
    const residence = catalogueResidence(catalogue, 'object-slot-202');
    expect(residence).toEqual({
      body: 'body-14',
      drawClass: 15,
      insertionGroup: 12,
      kind: 'structure',
      level: 2,
      parent: 'vesta-surface-64',
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
      residentCount: 28
    });
    expect(matrix.rows).toHaveLength(expectedPairs);
    expect(new Set(matrix.rows.map(row => row.body))).toEqual(
      new Set(['body-4', 'body-8', 'body-11', 'body-14'])
    );
    expect(new Set(matrix.rows.map(row => row.instance))).toHaveLength(28);
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
      body: 'body-1',
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
        briefcaseStore: [],
        elapsed: 0,
        frameAccumulator: 0,
        pendingBriefcaseDrop: null,
        pose: { body: row.body, heading: 0, position: { x: 0, y: 63, z: 0 } },
        script: initialDamoclesSaveScript(),
        scrollCounter: 0,
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
              drawClass: row.residence.drawClass,
              kind: 'surface',
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
              residence: { drawClass: row.residence.drawClass, kind: 'carried' }
            },
            ...(drop.support === null
              ? []
              : [
                  {
                    instance: drop.support,
                    residence: {
                      body: row.body,
                      drawClass: drop.supportClass!,
                      kind: 'surface' as const,
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
  }, 15_000);
});
