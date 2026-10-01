import { describe, expect, test } from 'bun:test';

import { readDionContent } from '../src/dion/content.ts';
import { DION_PROGRAM_SHA256 } from '../src/dion/documents.ts';
import {
  dionContent,
  dionPayload,
  dionPresentationDocument,
  edited
} from './dion-documents.ts';

/// The METIS Destination's content boundary (#647): only Mercenary III documents of the
/// pinned baseline, from one capture, with every required item of the slice accounted.

const DAMOCLES_PROGRAM =
  '8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef';

describe('the Mercenary III content boundary', () => {
  test('admits the tracked payload against the pinned STX', async () => {
    const content = await dionContent();
    expect(content.source.programSha256).toBe(DION_PROGRAM_SHA256);
    expect(content.contentSha256).toMatch(/^[\da-f]{64}$/);
    expect(content.world.cells).toHaveLength(15);
    expect(content.messages).toHaveLength(64);
  });

  test('accounts the corrected fifteen cells over five geometry records and four details', async () => {
    const { world } = await dionContent();
    const geometry = new Set(world.cells.map(cell => cell.structure));
    expect([...geometry].sort((a, b) => a - b)).toEqual([
      57, 65, 132, 146, 150
    ]);
    const details = new Set(world.cells.map(cell => cell.detail));
    expect([...details].sort((a, b) => a - b)).toEqual([1, 36, 49, 56, 59]);
    expect(world.details.get(1)!.vertices).toHaveLength(0);
    const route = world.cells.map(cell => `${cell.x},${cell.z}`);
    expect(route).toEqual([
      '2,6',
      '1,6',
      '0,6',
      '0,5',
      '0,4',
      '0,3',
      '0,2',
      '0,1',
      '1,1',
      '2,1',
      '3,1',
      '4,1',
      '4,0',
      '3,0',
      '2,0'
    ]);
    // `(3,0)` alone binds the animated sign (#643).
    expect(
      world.cells
        .filter(cell => cell.tokenSet !== null)
        .map(cell => `${cell.x},${cell.z}`)
    ).toEqual(['3,0']);
  });

  test('binds the street furniture R2 lists per cell', async () => {
    const { world } = await dionContent();
    const templates = (x: number, z: number) => {
      const cell = world.cells.find(item => item.x === x && item.z === z)!;
      return world.grounds
        .get(cell.ground.address)!
        .primitives.flatMap(item =>
          item.kind === 'template' ? [item.model] : []
        )
        .sort((a, b) => a - b);
    };
    expect(templates(1, 6)).toEqual([
      337, 337, 337, 337, 337, 337, 370, 372, 373
    ]);
    expect(templates(0, 6)).toEqual([331, 331]);
    expect(templates(0, 5)).toEqual([333, 333, 334, 334]);
    expect(templates(1, 1)).toEqual([329, 330]);
  });

  test('carries the taxi, its passenger form and the driver heads', async () => {
    const { world } = await dionContent();
    const taxi = world.models.get(318)!;
    expect(taxi.name).toBe('TAXI');
    expect(taxi.vertices).toHaveLength(32);
    expect(taxi.faces).toHaveLength(30);
    expect(taxi.header?.op).toBe(0xd);
    expect(taxi.passenger!.vertices).toHaveLength(18);
    expect(world.models.get(263)).toBeDefined();
    expect(world.models.get(264)).toBeDefined();
  });

  test('refuses a document of another Title', async () => {
    const payload = dionPayload();
    payload.set(
      'world',
      edited(payload.get('world')!, { 'source.title': 'damocles' })
    );
    await expect(
      readDionContent(payload, dionPresentationDocument())
    ).rejects.toThrow('belongs to Title "damocles", not dion');
  });

  test('refuses a document exported from another program image', async () => {
    const payload = dionPayload();
    payload.set(
      'sound',
      edited(payload.get('sound')!, {
        'source.programSha256': DAMOCLES_PROGRAM
      })
    );
    await expect(
      readDionContent(payload, dionPresentationDocument())
    ).rejects.toThrow('not the pinned Mercenary III baseline');
  });

  test('refuses documents from different capture runs', async () => {
    const payload = dionPayload();
    payload.set(
      'messages',
      edited(payload.get('messages')!, {
        'source.capture.opening.ramSha256': '0'.repeat(64)
      })
    );
    await expect(
      readDionContent(payload, dionPresentationDocument())
    ).rejects.toThrow('different capture runs');
  });

  test('refuses another schema and a renamed kind', async () => {
    const payload = dionPayload();
    payload.set('panel', edited(payload.get('panel')!, { schemaVersion: 2 }));
    await expect(
      readDionContent(payload, dionPresentationDocument())
    ).rejects.toThrow('schemaVersion is 2');
    const renamed = dionPayload();
    renamed.set('scripts', edited(renamed.get('scripts')!, { kind: 'world' }));
    await expect(
      readDionContent(renamed, dionPresentationDocument())
    ).rejects.toThrow('declares kind "world"');
  });

  test('refuses a malformed record with its path', async () => {
    const payload = dionPayload();
    payload.set(
      'world',
      edited(payload.get('world')!, {
        'structures.132.scaled.-3,-3.walls.0.refs': [1, 99]
      })
    );
    await expect(
      readDionContent(payload, dionPresentationDocument())
    ).rejects.toThrow('names a missing plan vertex');
    const truncated = dionPayload();
    truncated.set(
      'messages',
      edited(truncated.get('messages')!, {
        messages: (
          truncated.get('messages')!.value as { messages: unknown[] }
        ).messages.slice(0, 63)
      })
    );
    await expect(
      readDionContent(truncated, dionPresentationDocument())
    ).rejects.toThrow('the 64 ID messages');
  });

  test('refuses a Damocles catalogue standing in for the world', async () => {
    const payload = dionPayload();
    payload.set('world', {
      text: '',
      value: {
        kind: 'catalogue',
        schemaVersion: 17,
        source: { programSha256: DAMOCLES_PROGRAM }
      }
    });
    await expect(
      readDionContent(payload, dionPresentationDocument())
    ).rejects.toThrow('/payload/dion/world.json');
  });

  test('a required I1 gap refuses the Destination', async () => {
    const presentation = edited(dionPresentationDocument(), {
      'coverage.0.status': 'gap'
    });
    await expect(readDionContent(dionPayload(), presentation)).rejects.toThrow(
      'is a required I1 gap'
    );
  });

  test('every recovered coverage item names a record the payload holds', async () => {
    const presentation = edited(dionPresentationDocument(), {
      'coverage.0.in': 'world.structures.999'
    });
    await expect(readDionContent(dionPayload(), presentation)).rejects.toThrow(
      'which the payload does not hold'
    );
  });

  test('the remaining gaps gate I2 and name their tickets', async () => {
    const { presentation } = await dionContent();
    const gaps = presentation.coverage.filter(item => item.status === 'gap');
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(gap.gates).toBe('I2');
      expect(gap.ticket).toMatch(/^#\d+$/);
    }
  });

  test('tags the eleven-tick cadence as ADR 0058 authored it', async () => {
    const { presentation } = await dionContent();
    expect(presentation.ticksPerSecond).toMatchObject({
      provenance: 'authored',
      value: 50
    });
    expect(presentation.ticksPerFrame).toMatchObject({
      provenance: 'authored',
      value: 11
    });
    expect(presentation.walkingSubsteps).toMatchObject({
      provenance: 'derived',
      value: 8
    });
  });
});
