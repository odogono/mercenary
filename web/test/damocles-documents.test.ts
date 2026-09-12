import { describe, expect, test } from 'bun:test';

import { readErisPresentation, stColour } from '../src/damocles/documents.ts';

const tracked = async (): Promise<Record<string, unknown>> =>
  (await Bun.file(
    new URL('../damocles/eris.json', import.meta.url)
  ).json()) as Record<string, unknown>;

describe('the authored Eris presentation document', () => {
  test('reads the tracked document with its recovered start pose', async () => {
    const document = readErisPresentation(await tracked());
    expect(document.body).toEqual({
      id: 'body-11',
      name: 'ERIS',
      provenance: 'recovered'
    });
    expect(document.grid.origin).toEqual({ x: 64, z: 128 });
    expect(document.grid.cellUnits).toBe(65_536);
    expect(document.start.position).toEqual({
      x: 0x00_47_70_b1,
      y: 63,
      z: 0x00_88_6c_2d
    });
    expect(document.start.positionProvenance).toBe('recovered');
    expect(document.start.yaw).toBe(0x6_00);
    expect(document.start.yawProvenance).toBe('recovered');
    expect(document.orientation.yawUnitsPerTurn).toBe(1024);
    expect(document.orientation.yawNorth).toBe(0x2_00);
    expect(document.walk.speedProvenance).toBe('derived');
    expect(document.walk.runMultiplier).toBe(3);
    expect(document.walk.runProvenance).toBe('authored');
    expect(document.ground.colour).toBe('#006d00');
    expect(document.lighting.shadows).toBe(false);
    expect(document.rendering.unresolvedModels).toBe('nothing');
    expect(document.structures.view).toBe('combined');
    expect(document.structures.doorState).toBe('closed');
    expect(document.structures.provenance).toBe('authored');
  });

  test('holds the structure variant to the recovered views and door states', async () => {
    const base = await tracked();
    const structures = base['structures'] as Record<string, unknown>;
    expect(() =>
      readErisPresentation({
        ...base,
        structures: { ...structures, view: 'interior' }
      })
    ).toThrow('structures.view should be one of combined, exterior');
    expect(() =>
      readErisPresentation({
        ...base,
        structures: { ...structures, doorState: 'ajar' }
      })
    ).toThrow('structures.doorState should be one of closed, open');
  });

  test('converts three-bit ST palette words over the full channel range', () => {
    expect(stColour('000')).toBe('#000000');
    expect(stColour('777')).toBe('#ffffff');
    expect(stColour('030')).toBe('#006d00');
    expect(stColour('246')).toBe('#4992db');
    expect(() => stColour('80')).toThrow('not a three-digit ST palette word');
  });

  test('refuses unknown fields, missing fields and foreign provenance', async () => {
    const base = await tracked();
    expect(() => readErisPresentation({ ...base, extra: true })).toThrow(
      '$ has unexpected field extra'
    );
    const { walk: _walk, ...withoutWalk } = base;
    expect(() => readErisPresentation(withoutWalk)).toThrow(
      '$ is missing field walk'
    );
    const walk = base['walk'] as Record<string, unknown>;
    const { runMultiplier: _run, ...withoutRun } = walk;
    expect(() => readErisPresentation({ ...base, walk: withoutRun })).toThrow(
      'walk is missing field runMultiplier'
    );
    expect(() =>
      readErisPresentation({
        ...base,
        eye: { heightUnits: 63, provenance: 'guessed' }
      })
    ).toThrow('eye.provenance should be one of authored, derived, recovered');
    expect(() => readErisPresentation({ ...base, titleSlug: 'targ' })).toThrow(
      'titleSlug should be damocles'
    );
  });

  test('holds a colour to the palette entry it claims', async () => {
    const base = await tracked();
    const ground = base['ground'] as Record<string, unknown>;
    expect(() =>
      readErisPresentation({
        ...base,
        ground: { ...ground, colour: '#00ff00' }
      })
    ).toThrow('ground.colour should match its palette entry');
    expect(() =>
      readErisPresentation({
        ...base,
        ground: { ...ground, paletteIndex: 16 }
      })
    ).toThrow('ground.paletteIndex should index the sixteen-entry palette');
    const camera = base['camera'] as Record<string, unknown>;
    expect(() =>
      readErisPresentation({
        ...base,
        camera: { ...camera, farPlane: 1 }
      })
    ).toThrow('camera.farPlane should exceed the near plane');
  });
});
