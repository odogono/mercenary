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
    expect(document.walk.runMultiplier).toBeCloseTo(5 / 3, 15);
    expect(document.walk.runTurnMultiplier).toBe(3 / 2);
    expect(document.walk.runProvenance).toBe('recovered');
    expect(document.walk.runTurnProvenance).toBe('derived');
    // The base plane's colour is the Body's, from the Damocles Catalogue: the document says
    // only how far below the recovered faces the plane sits (#394).
    expect(document.ground).toEqual({
      fillDropUnits: 1,
      geometryProvenance: 'authored',
      note: expect.stringContaining('$7C88') as unknown as string
    });
    expect(document.orientation.pitchLevel).toBe(0x2_00);
    expect(document.start.pitch).toBe(0x2_00);
    expect(document.lighting).toMatchObject({
      ambientGround: '#263322',
      ambientSky: '#66809c',
      provenance: 'authored',
      shadows: true,
      sunColour: '#fff2d0'
    });
    expect(document.rendering.unresolvedModels).toBe('nothing');
    expect(document.camera.nearPlane).toBeLessThan(11);
    expect(document.schemaVersion).toBe(8);
    expect(document.time).toEqual({
      // The impact deadline a fresh game starts from, and the VBLs it spends on one of its
      // own seconds (#368, #208).
      impactDeadlineProvenance: 'recovered',
      impactDeadlineSeconds: 15_560,
      impactProvenance: 'recovered',
      impactVblsPerSecond: 20,
      messageFrames: 200,
      provenance: 'recovered',
      // One craft pass every four ticks aboard, derived from the traced frames (ADR 0051).
      ticksPerPass: 4,
      ticksPerPassEvidence: expect.stringContaining('ADR 0051'),
      ticksPerPassProvenance: 'derived',
      vblHertz: 50,
      vblProvenance: 'derived',
      waitFrames: 200
    });
    expect(document.structureFallback.view).toBe('combined');
    expect(document.structureFallback.doorState).toBe('closed');
    expect(document.structureFallback.provenance).toBe('authored');
  });

  test('holds the structure variant to the recovered views and door states', async () => {
    const base = await tracked();
    const structureFallback = base['structureFallback'] as Record<
      string,
      unknown
    >;
    expect(() =>
      readErisPresentation({
        ...base,
        structureFallback: { ...structureFallback, view: 'interior' }
      })
    ).toThrow('structureFallback.view should be one of combined, exterior');
    expect(() =>
      readErisPresentation({
        ...base,
        structureFallback: { ...structureFallback, doorState: 'ajar' }
      })
    ).toThrow('structureFallback.doorState should be one of closed, open');
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
    expect(() => readErisPresentation({ ...base, schemaVersion: 2 })).toThrow(
      'schemaVersion should be 8'
    );
    expect(() =>
      readErisPresentation({
        ...base,
        time: {
          ...(base['time'] as Record<string, unknown>),
          vblHertz: 60
        }
      })
    ).toThrow('time.vblHertz should be 50');
    const lighting = base['lighting'] as Record<string, unknown>;
    const { ambientSky: _ambientSky, ...withoutAmbientSky } = lighting;
    expect(() =>
      readErisPresentation({ ...base, lighting: withoutAmbientSky })
    ).toThrow('lighting is missing field ambientSky');
    expect(() =>
      readErisPresentation({
        ...base,
        lighting: { ...lighting, ambientGround: '#fff' }
      })
    ).toThrow('lighting.ambientGround should be a lowercase six-digit colour');
  });

  test('refuses a start turn or a camera outside its range', async () => {
    const base = await tracked();
    const start = base['start'] as Record<string, unknown>;
    // The sky is the Body's own now (#494): the document carries no sky block to claim one.
    expect(() => readErisPresentation({ ...base, sky: {} })).toThrow();
    expect(() =>
      readErisPresentation({ ...base, start: { ...start, bodyTurn: 2 ** 32 } })
    ).toThrow('start.bodyTurn should be an unsigned longword');
    const camera = base['camera'] as Record<string, unknown>;
    expect(() =>
      readErisPresentation({
        ...base,
        camera: { ...camera, farPlane: 1 }
      })
    ).toThrow('camera.farPlane should exceed the near plane');
  });
});
