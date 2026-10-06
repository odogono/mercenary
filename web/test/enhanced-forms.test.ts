import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue, Mesh, Model } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { DamoclesSession } from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom, placementForms } from '../src/damocles/world.ts';
import {
  articulated,
  beaconLit,
  formMesh,
  viewGroupOf,
  withTextFrame,
  type FormClock,
  type FormTables
} from '../src/enhanced/forms.ts';
import { planEnhancedFrame } from '../src/enhanced/frame.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The per-frame form chooser (#805) against the forms the extractor decodes. A sampled
/// articulation angle or text frame is the original's own form at that state, so the chooser
/// composing the same state from the rest pose must reproduce it exactly.

let catalogue: AssembledCatalogue;
let tables: FormTables;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  tables = {
    articulation: catalogue.articulationTable!,
    glyphs: catalogue.textFrameGlyphs
  };
});

const model = (name: string): Model =>
  catalogue.models.find(item => item.name === name)!;
const variant = (of: Model, id: string): Mesh =>
  of.variants.find(item => item.id === id)!.mesh;

/// Faces and lines as the coordinates they draw, so two meshes indexing their vertices
/// differently compare by what they put on screen.
const drawn = (mesh: Mesh) => ({
  faces: mesh.faces.map(face => ({
    colour: face.colour,
    corners: face.vertices.map(index => mesh.vertices[index])
  })),
  lines: mesh.lines.map(line => ({
    colour: line.colour,
    corners: line.vertices.map(index => mesh.vertices[index])
  }))
});

const clock = (overrides: Partial<FormClock> = {}): FormClock => ({
  angle: 0,
  frame: 0,
  television: 0,
  textStep: 0,
  ...overrides
});

describe('beacons', () => {
  test('flash with bit 2 of the frame counter plus the slot phase', () => {
    const flash = { gateSlot: null, phase: 0 };
    const lit = Array.from({ length: 12 }, (_, frame) =>
      beaconLit(flash, frame, () => false)
    );
    expect(lit).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true
    ]);
    expect(beaconLit({ gateSlot: null, phase: 2 }, 2, () => false)).toBe(false);
  });

  test('a gated beacon stays dark until its locator is carried', () => {
    const blue = model('BLUE BEACON');
    expect(blue.flash?.gateSlot).toBe(53);
    const forms = placementForms(blue, blue.id, 172)!;
    const dark = variant(blue, 'flash-dark');
    const at = (frame: number, carried: boolean) =>
      formMesh(
        forms,
        { x: 1000, y: 0, z: 0 },
        clock({ frame }),
        slot => carried && slot === 53,
        tables
      );
    for (let frame = 0; frame < 8; frame += 1) {
      expect(at(frame, false)).toBe(dark);
    }
    const shown = Array.from({ length: 8 }, (_, frame) => at(frame, true));
    expect(shown.some(mesh => mesh === dark)).toBe(true);
    expect(shown.some(mesh => mesh !== dark)).toBe(true);
  });
});

describe('viewer boxes', () => {
  test('HI-FI draws its view group from where the box holds it', () => {
    const hifi = model('HI-FI');
    const own = variant(hifi, 'record');
    // The box is the object less the eye at X ≥ 0, so the eye stands to its west.
    expect(viewGroupOf(own, { x: 100, y: 0, z: 0 })).toBe(0);
    expect(viewGroupOf(own, { x: -100, y: 0, z: 0 })).toBeNull();
    const forms = placementForms(hifi, 'record', null)!;
    expect(
      formMesh(forms, { x: 100, y: 0, z: 0 }, clock(), () => false, tables)
    ).toBe(variant(hifi, 'view-0'));
    expect(
      formMesh(forms, { x: -100, y: 0, z: 0 }, clock(), () => false, tables)
    ).toBe(own);
  });

  test('a slot-labelled form keeps its slot in its view group', () => {
    const transporter = model('TRANSPORTER a');
    const forms = placementForms(transporter, 'slot-65-record', null)!;
    const own = variant(transporter, 'slot-65-record');
    const offset = (() => {
      const [x, y, z] = own.viewGroups![0]!.bounds.map(([low]) =>
        low <= -0x7f_ff_ff ? 0 : low
      );
      return { x: x!, y: y!, z: z! };
    })();
    expect(formMesh(forms, offset, clock(), () => false, tables)).toBe(
      variant(transporter, 'slot-65-view-0')
    );
  });
});

describe('articulation', () => {
  test('NOVABOMB turns to each sampled angle exactly', () => {
    const bomb = model('NOVABOMB');
    const rest = variant(bomb, 'record');
    for (const angle of [0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0]) {
      const sampled = variant(bomb, `angle-${angle.toString(16)}`);
      expect(articulated(rest, angle, tables.articulation!).vertices).toEqual(
        sampled.vertices
      );
    }
  });
});

describe('frame-animated text', () => {
  test('each sampled frame is the record with its stepped glyph swapped', () => {
    for (const name of ['TELEVISION', 'AUTHORS COMPUTER']) {
      const of = model(name);
      const rest = variant(of, 'record');
      const script = rest.textAnimations![0]!.script;
      for (let ordinal = 1; ordinal < 8; ordinal += 1) {
        const step = Math.floor((ordinal * script.length) / 8);
        expect(drawn(withTextFrame(rest, step, tables.glyphs))).toEqual(
          drawn(variant(of, `text-frame-${ordinal}`))
        );
      }
    }
  });

  test('the television fades in while its switch is on', () => {
    const tv = model('TELEVISION');
    const forms = placementForms(tv, 'record', null)!;
    const shown = formMesh(
      forms,
      { x: 1000, y: 0, z: 0 },
      clock({ television: 3 }),
      () => false,
      tables
    )!;
    expect(drawn(shown)).toEqual(
      drawn(withTextFrame(variant(tv, 'frame-3'), 0, tables.glyphs))
    );
  });
});

describe('the frame clock', () => {
  test('a Damocles Session counts passes, VBLs and the television switch', async () => {
    const doc = readErisPresentation(
      await Bun.file('damocles/eris.json').json()
    );
    const session = new DamoclesSession({
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
    });
    expect(session.snapshot.formClock).toEqual(clock());
    // On foot a pass is `ticksPerPassOnFoot` VBLs.
    const vbls = doc.time.ticksPerPassOnFoot * 3;
    const after = session.advance(vbls / doc.time.vblHertz).formClock;
    expect(after.frame).toBe(3);
    expect(after.textStep).toBe(3);
    expect(after.angle).toBe(
      (vbls - (vbls % doc.time.ticksPerPassOnFoot)) & 0xff
    );
    expect(after.television).toBe(0);
  });
});

describe('the Enhanced planner', () => {
  test('draws a beacon lit and dark as the frame counter runs', async () => {
    const doc = readErisPresentation(
      await Bun.file('damocles/eris.json').json()
    );
    const black = model('BLACK BEACON');
    const forms = placementForms(black, black.id, 164)!;
    const own = variant(black, black.id);
    const surface = {
      baseColour: null,
      floorLabelGlyphs: {},
      formTables: tables,
      grid: { cellsPerAxis: 16, cellUnits: 0x1_00_00, origin: { x: 0, z: 0 } },
      islands: [],
      placements: [],
      sky: null
    };
    const beacon = {
      faceCount: own.faces.length,
      forms,
      heading: 0,
      id: 'object-slot-164',
      keyBase: null,
      kind: 'object' as const,
      mesh: own,
      modelId: black.id,
      name: black.name,
      position: { x: 0x80_00, y: 0, z: 0x80_00 + 600 },
      status: black.status
    };
    const pose = {
      body: 'body-11',
      heading: 0,
      pitch: 0,
      position: { x: 0x80_00, y: 60, z: 0x80_00 }
    };
    const colours = (frame: number) => {
      const plan = planEnhancedFrame(
        surface,
        pose,
        doc,
        null,
        [beacon],
        [],
        () => false,
        false,
        null,
        false,
        false,
        'aboard',
        136,
        clock({ frame })
      );
      const found = new Set<string>();
      for (let i = 0; i < plan.vertices.length; i += 10) {
        found.add(
          [3, 4, 5].map(c => plan.vertices[i + c]!.toFixed(3)).join(',')
        );
      }
      return [...found].sort().join(' ');
    };
    const phase = black.flash!.phases['164']!;
    const lit = [0, 1, 2, 3, 4, 5, 6, 7].filter(
      frame => ((frame + phase) & 0xff_ff & 4) === 0
    );
    const dark = [0, 1, 2, 3, 4, 5, 6, 7].filter(frame => !lit.includes(frame));
    expect(colours(lit[0]!)).not.toBe(colours(dark[0]!));
    expect(colours(lit[0]!)).toBe(colours(lit[1]!));
  });
});
