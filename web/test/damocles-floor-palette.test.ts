import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue, Primitive } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import {
  erisSurfaceFrom,
  floorPlacement,
  type ErisPlacement
} from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// A Floor above 0 is drawn through the palette its alias record binds in `$7A0E` (#493): the
/// record's palette byte, or its per-level entry where that byte is zero. Metis DOOBERRYS
/// SOLICITORS (slot 155) binds slot 58 on Floors 1 to 9 in its own palette 66; Vesta Parliament
/// (slot 70) leaves the byte zero and names palette 30 on Floors 0, 1, 3 and 10, 71 on Floor 2.

const DOOBERRYS = 'metis-surface-60';
const PARLIAMENT = 'vesta-surface-64';

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

const onFloor = (
  pose: string,
  instance: string,
  floor: number
): ErisPlacement => {
  const session = new DamoclesSession(content);
  expect(session.switchToPose(pose).kind).toBe('switched');
  expect(session.snapshot.structure?.instanceId).toBe(instance);
  expect(session.changeFloor(floor)).toEqual({ kind: 'moved' });
  return session.snapshot.surface.placements.find(
    item => item.id === instance
  )!;
};

const structureModel = (slot: number) =>
  catalogue.models.find(
    model =>
      model.kind === 'structure' &&
      model.recordClass !== 'alias' &&
      model.slots[0] === slot
  )!;

/// Every primitive a bound selector draws, with the one the structure's own record publishes.
const drawnBeside = (
  placement: ErisPlacement,
  slot: number
): (readonly [Primitive, Primitive])[] => {
  const own = structureModel(slot).structureSelection!;
  const drawn = placement.selection!.structure;
  return [
    ...drawn.plan.faces.map(
      (face, index) => [face, own.plan.faces[index]!] as const
    ),
    ...drawn.attachments.flatMap((attachment, index) =>
      attachment.mesh.faces.map(
        (face, at) => [face, own.attachments[index]!.mesh.faces[at]!] as const
      )
    )
  ];
};

const paletteEntry = (word: number): number | undefined =>
  (word & 0x80_80) === 0x80_80 ? (word & 0x7e) >> 1 : undefined;

describe('a Floor is coloured through the palette its alias record binds', () => {
  test("Metis Floor 9's region 4 floor face draws #444444, not slot 58's own #882222", () => {
    const placement = onFloor('metis-transporter', DOOBERRYS, 9);
    const region = placement.selection!.structure.regions[4]!;
    const first = region.queue[0]!;
    expect(first.kind).toBe('face');
    const index = (first as { readonly index: number }).index;
    const face = placement.selection!.structure.plan.faces[index]!;
    expect(face.sourceColour).toBe(0xc0_86);
    expect(face.colour).toBe('#444444');
    expect(
      structureModel(58).structureSelection!.plan.faces[index]!.colour
    ).toBe('#882222');
  });

  test('its scene colours come from the same palette', () => {
    const placement = onFloor('metis-transporter', DOOBERRYS, 9);
    expect(structureModel(58).sceneColours!.map(entry => entry.colour)).toEqual(
      ['#eeeeee', '#882222']
    );
    expect(placement.selection!.background).toEqual({
      ceiling: '#eeeeee',
      floor: '#444444'
    });
  });

  test('Vesta draws each Floor in its per-level palette', () => {
    const alias = catalogue.models.find(
      model => model.kind === 'structure' && model.slots[0] === 70
    )!;
    const binding = alias.levelBinding!;
    expect(
      binding.floors.map(entry => [entry.level, entry.paletteIndex])
    ).toEqual([
      [0, 30],
      [1, 30],
      [2, 71],
      [3, 30],
      [10, 30]
    ]);
    const differ = new Set<number>();
    for (const entry of binding.floors.filter(item => item.level !== 0)) {
      const palette = binding.palettes!.find(
        item => item.paletteIndex === entry.paletteIndex
      )!;
      const placement = onFloor(
        'vesta-parliament-4-6',
        PARLIAMENT,
        entry.level
      );
      for (const [drawn, own] of drawnBeside(placement, entry.structureSlot)) {
        const at = paletteEntry(drawn.sourceColour);
        expect(drawn.colour).toBe(
          at === undefined ? own.colour : (palette.colours[at] ?? own.colour)
        );
      }
      if (entry.level === 2) {
        const one = onFloor('vesta-parliament-4-6', PARLIAMENT, 1);
        for (const [
          index,
          face
        ] of placement.selection!.structure.plan.faces.entries()) {
          if (
            face.colour !== one.selection!.structure.plan.faces[index]!.colour
          ) {
            differ.add(index);
          }
        }
      }
    }
    // Floors 1 and 2 bind the same structure, slot 92; only the palette tells them apart.
    expect(binding.floors[1]!.structureSlot).toBe(
      binding.floors[2]!.structureSlot
    );
    expect(differ.size).toBeGreaterThan(0);
  });

  test("a Floor's day half replaces the bound structure's own (#497)", () => {
    // Palette 66 has two halves, 24 bytes apart. The Floor's `dayColours` stand in for slot
    // 58's own `dayColour`, which belongs to slot 58's palette 28.
    const alias = catalogue.models.find(
      model => model.kind === 'structure' && model.slots[0] === 155
    )!;
    const palette = alias.levelBinding!.palettes!.find(
      item => item.paletteIndex === 66
    )!;
    expect(palette.dayColours).toBeDefined();
    const placement = onFloor('metis-transporter', DOOBERRYS, 9);
    for (const [drawn, own] of drawnBeside(placement, 58)) {
      if (paletteEntry(drawn.sourceColour) === undefined) {
        expect(drawn.dayColour).toBe(own.dayColour);
      }
    }
    const detail = placement.selection!.detail;
    let lit = 0;
    for (const drawn of [
      ...drawnBeside(placement, 58).map(([item]) => item),
      ...detail.faces,
      ...detail.lines
    ]) {
      const at = paletteEntry(drawn.sourceColour);
      if (at === undefined) {
        continue;
      }
      expect([drawn.colour, drawn.dayColour ?? drawn.colour]).toEqual([
        palette.colours[at]!,
        palette.dayColours![at]!
      ]);
      lit += drawn.dayColour === undefined ? 0 : 1;
    }
    // Entries 1 and 11 turn from `#eeeeee` to `#000000` by day, and the detail names them.
    expect(lit).toBeGreaterThan(0);
  });

  test("a Floor's selector keeps its identity however often it is bound", () => {
    const session = new DamoclesSession(content);
    session.switchToPose('metis-transporter');
    const ground = session.snapshot.surface.placements.find(
      item => item.id === DOOBERRYS
    )!;
    const once = floorPlacement(ground, content.models, 9)!.selection!;
    const again = floorPlacement(ground, content.models, 9)!.selection!;
    expect(again).toBe(once);
    // Floors that share a structure and a palette share one recolouring.
    expect(floorPlacement(ground, content.models, 5)!.selection).toBe(once);
  });
});
