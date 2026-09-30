import { beforeAll, describe, expect, test } from 'bun:test';

import {
  fieldCopy,
  instanceById,
  type Catalogue
} from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { parseDamoclesArrivalPoses } from '../src/damocles/poses.ts';
import {
  catalogueResidence,
  validStructureResidence
} from '../src/damocles/residence.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import {
  erisSurfaceFrom,
  fieldCellNumber,
  fieldCopiesAt
} from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// MIDAS is one structure repeated over every Surface Cell (#172,
/// docs/research/damocles-midas-field.md). The Catalogue stores a copy only where a resident
/// stands; the port builds every other cell's copy from the island's field.

const PREFIX = 'midas-the-midas-project';
const CELL = 65_536;

let catalogue: Catalogue;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: parseDamoclesArrivalPoses(
      await Bun.file('../payload/damocles/arrival-poses.json').json()
    ),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

/// A session restored standing at the centre of Midas cell x, z.
const standingIn = (x: number, z: number): DamoclesSession => {
  const arrived = new DamoclesSession(content);
  expect(arrived.switchToPose('midas').kind).toBe('switched');
  const resume = arrived.captureResume();
  return new DamoclesSession(content, {
    ...resume,
    pose: {
      ...resume.pose,
      position: { x: (x + 0.5) * CELL, y: 63, z: (z + 0.5) * CELL }
    },
    structure:
      resume.structure === null
        ? null
        : {
            ...resume.structure,
            instanceId: `${PREFIX}-surface-${x}-${z}`,
            regionIndex: 0
          }
  });
};

describe('the Midas uniform field', () => {
  test('the island publishes its field, and a copy is named by its Body Coordinate', () => {
    const island = catalogue.islands.find(item => item.body === 'body-2')!;
    expect(island.field).toEqual({
      ground: `${PREFIX}-ground-020540-00`,
      instancePrefix: PREFIX,
      keyBase: null,
      structure: 'structure-01430c'
    });
    expect(catalogue.islands.filter(item => item.field !== null)).toHaveLength(
      1
    );
    // Stored where a resident stands, built everywhere else, and never past the surface.
    expect(
      instanceById(catalogue, `${PREFIX}-surface-2364-376`)?.reason
    ).toContain('a resident stands in it');
    expect(instanceById(catalogue, `${PREFIX}-surface-358-3493`)).toMatchObject(
      {
        location: { body: 'body-2', position: [358.5, 0, 3493.5] },
        model: 'structure-01430c'
      }
    );
    expect(fieldCopy(catalogue, `${PREFIX}-surface-4096-0`)).toBeUndefined();
    expect(fieldCopy(catalogue, `${PREFIX}-surface-01-2`)).toBeUndefined();
    expect(fieldCopy(catalogue, 'eris-surface-87')).toBeUndefined();
  });

  test('the cell number is x shifted twelve bits, ORed with z, in eight digits', () => {
    // The midas capture's $CD06 reads 01 46 98 61 at Body Coordinate 358,3493.
    expect(fieldCellNumber(358, 3493)).toBe('01469861');
    expect(fieldCellNumber(2364, 376)).toBe('09683320');
    expect(fieldCellNumber(0, 0)).toBe('00000000');
  });

  test('the arrival Pose binds its own cell of the field', () => {
    const session = new DamoclesSession(content);
    expect(session.switchToPose('midas')).toEqual({
      kind: 'switched',
      pose: 'midas'
    });
    expect(session.snapshot.cell).toEqual({ x: 5, z: 11 });
    const drawn = session.snapshot.surface.placements.filter(placement =>
      placement.id.endsWith('-358-3493')
    );
    expect(drawn.map(placement => placement.kind).sort()).toEqual([
      'ground',
      'structure'
    ]);
    // The ground carries its eight pyramids a cell out and its cell's painted number.
    const ground = drawn.find(placement => placement.kind === 'ground')!;
    const bare = content.models.peek(`${PREFIX}-ground-020540-00`)!;
    expect(ground.mesh!.faces).toHaveLength(
      bare.variants[0]!.mesh.faces.length
    );
    expect(ground.mesh!.lines.length).toBeGreaterThan(
      bare.variants[0]!.mesh.lines.length
    );
    expect(session.captureResume().structure?.instanceId).toBe(
      `${PREFIX}-surface-358-3493`
    );
  });

  test('copies are built for the cell stood in and no other, and a stored copy is not doubled', () => {
    const session = standingIn(2364, 376);
    const surface = session.snapshot.surface;
    const here = surface.placements.filter(placement =>
      placement.id.endsWith('-2364-376')
    );
    expect(here).toHaveLength(2);
    expect(
      fieldCopiesAt(surface, { x: 2364.5 * CELL, y: 63, z: 376.5 * CELL })
    ).toEqual([]);
    const next = fieldCopiesAt(surface, {
      x: 2365.5 * CELL,
      y: 63,
      z: 376.5 * CELL
    });
    expect(next.map(placement => placement.id)).toEqual([
      `${PREFIX}-surface-2365-376`,
      `${PREFIX}-ground-2365-376`
    ]);
  });

  test('MAGIC CRYSTAL is drawn in the copy it stands in', () => {
    const session = standingIn(2364, 376);
    expect(session.captureResume().structure?.instanceId).toBe(
      `${PREFIX}-surface-2364-376`
    );
    expect(session.snapshot.residents.map(item => item.id)).toContain(
      'object-slot-95'
    );
    // One cell over is another copy of the same structure, and the crystal is not in it.
    expect(
      standingIn(2365, 376).snapshot.residents.map(item => item.id)
    ).not.toContain('object-slot-95');
  });

  test('the residents stand in stored copies, and an unstored copy is still a parent', () => {
    const crystal = catalogueResidence(catalogue, 'object-slot-95');
    expect(crystal).toMatchObject({
      body: 'body-2',
      level: 0,
      parent: `${PREFIX}-surface-2364-376`,
      position: { x: -8, y: 0, z: -103 }
    });
    expect(
      validStructureResidence(
        catalogue,
        crystal as Parameters<typeof validStructureResidence>[1]
      )
    ).toBe(true);
    // A copy the Catalogue does not store resolves like any other structure Instance. It
    // admits no Drop by itself, for the reason every structure without a published
    // association table does: none is recovered, and structure 68 publishes no storey pitch.
    const parent = instanceById(catalogue, `${PREFIX}-surface-358-3493`);
    expect(parent?.location?.body).toBe('body-2');
    expect(
      validStructureResidence(catalogue, {
        ...(crystal as Parameters<typeof validStructureResidence>[1]),
        parent: `${PREFIX}-surface-358-3493`
      })
    ).toBe(false);
  });
});
