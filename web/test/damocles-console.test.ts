import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { executeDamoclesConsoleCommand } from '../src/damocles/console.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { DamoclesSession } from '../src/damocles/session.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { parseConsoleCommand } from '../src/shell/console.ts';
import type { PreferencesStore } from '../src/shell/preferences.ts';
import type { SavePersistence } from '../src/shell/saves.ts';

const sessionOf = async (): Promise<DamoclesSession> => {
  const [raw, presentation] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  const catalogue = parseCatalogue(raw);
  const doc = readErisPresentation(presentation);
  return new DamoclesSession({
    catalogue,
    doc,
    presentationSha256: 'test-presentation',
    surface: erisSurfaceFrom(catalogue, doc)
  });
};

const host = (session: DamoclesSession) => ({
  persistence: {
    armed: () => undefined,
    delete: () => ({ kind: 'done' }),
    describe: () => ({ slot: 1, state: 'empty' }),
    disarm: () => undefined,
    dismiss: () => undefined,
    load: () => ({ kind: 'done' }),
    message: () => ({ source: 'game' as const, text: '' }),
    onChange: () => undefined,
    save: () => ({ kind: 'done' })
  } as unknown as SavePersistence,
  preferences: {
    current: () => ({
      audioMuted: false,
      audioVolume: 100,
      composition: 'panel' as const,
      panelRendition: 'targ' as const
    }),
    update: () => ({
      audioMuted: false,
      audioVolume: 100,
      composition: 'panel' as const,
      panelRendition: 'targ' as const
    })
  } as PreferencesStore,
  session: () => session,
  typeface: () => undefined
});

describe('the Damocles Shell Console', () => {
  test('where and goto speak Eris cells', async () => {
    const session = await sessionOf();
    const cells = session.snapshot.cell;
    expect(cells).toEqual({ x: 7, z: 8 });
    const parsed = parseConsoleCommand('goto 3 4', 16);
    expect(parsed?.kind).toBe('gotoCell');
    const lines = executeDamoclesConsoleCommand(parsed!, host(session));
    expect(lines[0]).toContain('3-4');
    expect(session.snapshot.cell).toEqual({ x: 3, z: 4 });
    const where = executeDamoclesConsoleCommand(
      parseConsoleCommand('where', 16)!,
      host(session)
    );
    expect(where[0]).toContain('ERIS 03-04');
  });

  test('refuses Targ-only commands', async () => {
    const session = await sessionOf();
    const run = (line: string) =>
      executeDamoclesConsoleCommand(
        parseConsoleCommand(line, 16)!,
        host(session)
      )[0];
    expect(run('goto room 3')).toBe('Damocles has no Rooms');
    expect(run('get 1')).toBe('Damocles has no Carried Stack in this slice');
    expect(run('time')).toBe("time belongs to Targ's orrery");
    expect(run('goto 7 8 10')).toBe('goto takes two cells on Eris');
    expect(
      executeDamoclesConsoleCommand(
        parseConsoleCommand('goto 99 0', 256)!,
        host(session)
      )[0]
    ).toMatch(/not on Eris/);
  });
});
