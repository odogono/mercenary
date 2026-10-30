import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/channel.ts';
import {
  GameplaySession,
  sessionContent,
  type PresentationEvent
} from '../src/session/index.ts';
import {
  SAVE_SCHEMA_VERSION,
  SAVE_TALK_CODE_UNIT_LIMIT,
  decodeSave,
  encodeSave,
  type SaveEnvelope
} from '../src/session/save.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { BrowserControlProfile } from '../src/shell/input.ts';
import type { TalkHostOptions, TalkScript } from '../src/talk/host.ts';
import { TextTable } from '../src/text/index.ts';
import { World, room } from '../src/world/index.ts';
import { environment } from './fixtures/save.ts';
import { BensonProgram } from './oracle/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
if (
  bundle.flight === undefined ||
  bundle.benson === undefined ||
  bundle.text === undefined
) {
  throw new Error('the Data Payload is incomplete');
}
const content = sessionContent(
  world,
  bundle,
  flightModel(settings.flight, bundle.flight, world.groundExtent)
);
const program = BensonProgram.fromDocument(bundle.benson);

const FRAME = 1 / 50;
const DART = 1;
const BRIEFING = 102;
const TOO_HEAVY = 2;

const none = (): void => undefined;

const script = (
  name: string,
  source: string,
  replaces: readonly number[] = []
): TalkScript => ({ name, replaces, source });

const benson = (): BensonChannel =>
  new BensonChannel(new TextTable(bundle.text!));

/// A session on foot, with no Talk Scripts yet.
const onFoot = (): GameplaySession =>
  new GameplaySession(
    content,
    {
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 },
      roll: 0,
      speed: 0,
      yawVelocity: 0
    },
    benson()
  );

/// A session on foot with the given Talk Scripts.
const withScripts = (
  scripts: readonly TalkScript[],
  options: TalkHostOptions = {}
): GameplaySession => {
  const session = onFoot();
  session.useTalkScripts(scripts, options);
  return session;
};

const envelope = (session: GameplaySession): SaveEnvelope => ({
  environment,
  location: { kind: 'surface' },
  savedAt: '2026-10-18T12:00:00.000Z',
  schemaVersion: SAVE_SCHEMA_VERSION,
  snapshot: session.captureSaveSnapshot()
});

/// The session saved, written out, read back and restored with the given
/// Talk Scripts.
const saveAndRestore = (
  session: GameplaySession,
  scripts: readonly TalkScript[]
): GameplaySession =>
  GameplaySession.restore(
    content,
    benson(),
    decodeSave(encodeSave(envelope(session)), environment).snapshot,
    { scripts }
  );

const shown = (session: GameplaySession): readonly string[] =>
  session.talk!.shown;

const advanceUntil = (
  session: GameplaySession,
  done: () => boolean,
  limit = 120
): PresentationEvent[] => {
  const events: PresentationEvent[] = [];
  for (let left = limit; !done(); left -= FRAME) {
    if (left <= 0) {
      throw new Error(
        `not reached in ${limit} s: ${shown(session).join(' / ')}`
      );
    }
    events.push(...session.advance(FRAME).events);
  }
  return events;
};

const advance = (session: GameplaySession, seconds: number): void => {
  for (let left = seconds; left > 1e-9; left -= FRAME) {
    session.advance(FRAME);
  }
};

/// Until the line has begun to play.
const untilShown = (session: GameplaySession, line: string): void => {
  advanceUntil(session, () => shown(session).includes(line));
};

/// Until the line has played and the display is free again.
const afterLine = (session: GameplaySession, line: string): void => {
  advanceUntil(
    session,
    () => shown(session).includes(line) && !session.scripts!.messagePlaying
  );
};

const failures = (session: GameplaySession) =>
  session.talk!.reports.filter(
    report => report.kind !== 'run end' || report.outcome !== 'completed'
  );

describe('Talk Scripts in a Gameplay Session', () => {
  test('hear World Events by name', () => {
    const session = withScripts([
      script(
        'briefing',
        `use show from benson
on entered place where place = "mechanoid briefing"
  show "WELCOME" and wait
end entered
on boarded craft
  show "ABOARD THE " & craft and wait
end boarded
`
      )
    ]);
    session.teleport(room(BRIEFING));
    afterLine(session, 'WELCOME');
    session.teleport({ kind: 'surface' });
    session.board(DART);
    afterLine(session, 'ABOARD THE dart');
    expect(failures(session)).toEqual([]);
  });

  test('a report holds the display until its last line', () => {
    const session = withScripts([
      script(
        'first',
        `use report from benson
on begin
  report ["A1", "A2", "A3"] and wait
end begin
`
      ),
      script(
        'second',
        `use report from benson
on begin
  report ["B1", "B2"] and wait
end begin
`
      )
    ]);
    session.begin();
    afterLine(session, 'B2');
    expect(shown(session)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2']);
  });

  test('the engine’s own message cuts into a report, which carries on', () => {
    const session = withScripts([
      script(
        'report',
        `use report from benson
on begin
  report ["L1", "L2", "L3"] and wait
end begin
`
      )
    ]);
    session.begin();
    untilShown(session, 'L1');
    session.show(TOO_HEAVY);
    let heavyPlayed = false;
    advanceUntil(session, () => {
      const text = session.snapshot.bensonMessage?.displayText.trim();
      if (text === 'TOO HEAVY') {
        heavyPlayed = true;
      }
      return shown(session).includes('L2');
    });
    expect(heavyPlayed).toBe(true);
    afterLine(session, 'L3');
    expect(shown(session)).toEqual(['L1', 'L2', 'L3']);
  });

  test('the world Capability reaches the engine', () => {
    const session = withScripts(
      [
        script(
          'reaction',
          `on begin
  ask world to roll 256
  if it = 3 then ask world to sendAttacker
  tell sound to silence "voice1"
end begin
`
        )
      ],
      { random: () => 2 }
    );
    session.begin();
    const { events } = session.advance(FRAME);
    expect(session.observations().observations['attackingShip']).toBe(true);
    expect(events).toContainEqual({
      script: { sound: { symbol: 'voice1.control', value: 0 } }
    });
  });
});

test('the session refuses a Room or object the world does not have', () => {
  const session = withScripts([
    script(
      'astray',
      `on begin
  ask world to move "pass", "room 999"
end begin
`
    ),
    script(
      'nothing',
      `on begin
  ask world to fix "object 250"
end begin
`
    )
  ]);
  session.begin();
  session.advance(FRAME);
  const said = JSON.stringify(failures(session));
  expect(said).toContain('the world has no Room 999');
  expect(said).toContain('the world has no object 250');
});

/// A Talk Script that says each key it hears, with its own name.
const listener = (name: string): TalkScript =>
  script(
    name,
    `use show from benson
on pressed key
  show "${name} " & key and wait
end pressed
`
  );

/// Two Talk Scripts that each prompt for a Y: one at the start, one on boarding.
const promptScripts: readonly TalkScript[] = [
  script(
    'first',
    `use show, prompt from benson
on begin
prompt "FIRST?" and wait
wait for
  when pressed key where key = "Y" then
end wait
show "FIRST HEARD" and wait
end begin
`
  ),
  script(
    'second',
    `use show, prompt from benson
on boarded craft
prompt "SECOND?" and wait
wait for
  when pressed key where key = "Y" then
end wait
show "SECOND HEARD" and wait
end boarded
`
  )
];

const prompts = (): GameplaySession => withScripts(promptScripts);

describe('Player Input', () => {
  test('goes to the latest prompt, then back to the one before', () => {
    const session = prompts();
    session.begin();
    afterLine(session, 'FIRST?');
    session.board(DART);
    afterLine(session, 'SECOND?');
    expect(session.talk!.claims.map(claim => claim.script)).toEqual([
      'first',
      'second'
    ]);
    session.input('KeyY');
    afterLine(session, 'SECOND HEARD');
    expect(shown(session)).not.toContain('FIRST HEARD');
    // The second prompt's Run has ended, so the first has the input back.
    expect(session.talk!.claims.map(claim => claim.script)).toEqual(['first']);
    session.input('KeyY');
    afterLine(session, 'FIRST HEARD');
    expect(session.talk!.claims).toEqual([]);
    expect(failures(session)).toEqual([]);
  });

  test('a key pressed while the prompt plays is latched for it', () => {
    const session = prompts();
    session.begin();
    untilShown(session, 'FIRST?');
    expect(session.scripts!.messagePlaying).toBe(true);
    session.input('KeyY');
    afterLine(session, 'FIRST HEARD');
  });

  test('with no prompt, every Talk Script hears it', () => {
    const session = withScripts([listener('one'), listener('two')]);
    session.input('KeyQ');
    afterLine(session, 'two Q');
    expect(shown(session)).toEqual(['one Q', 'two Q']);
  });

  test('is only the keys no Binding takes, by name', () => {
    const session = withScripts([
      script(
        'keys',
        `use show from benson
on pressed key
  show key and wait
end pressed
`
      )
    ]);
    const controls = new BrowserControlProfile({
      drop: () => session.drop(),
      leaveCraft: () => session.leaveCraft(),
      occupancy: () => session.occupancy,
      playerInput: code => session.input(code),
      reach: action => session.reach(action),
      rideLift: () => session.rideLift(),
      shutThrottle: none,
      throttleNotchStep: none,
      throttleNotchValue: none,
      throttleStep: none
    });
    for (const code of ['KeyE', 'KeyD', 'KeyQ', 'Digit7', 'KeyY']) {
      const key = {
        altKey: false,
        code,
        ctrlKey: false,
        metaKey: false,
        repeat: false
      };
      controls.keyDown(key);
      controls.keyUp(key);
      advance(session, 5);
    }
    // On foot, E rides the lift and D drops: Bindings take them.
    expect(shown(session)).toEqual(['Q', '7', 'Y']);
  });
});

describe('a Save', () => {
  test('restored mid-report plays the report again from its start', () => {
    const scripts = [
      script(
        'report',
        `use show, report from benson
on begin
  report ["L1", "L2", "L3"] and wait
  show "AFTER" and wait
end begin
`
      )
    ];
    const session = withScripts(scripts);
    session.begin();
    untilShown(session, 'L2');
    const restored = saveAndRestore(session, scripts);
    afterLine(restored, 'AFTER');
    expect(shown(restored)).toEqual(['L1', 'L2', 'L3', 'AFTER']);
    expect(failures(restored)).toEqual([]);
  });

  test('keeps a prompt’s hold on Player Input', () => {
    const session = prompts();
    session.begin();
    afterLine(session, 'FIRST?');
    const restored = saveAndRestore(session, promptScripts);
    expect(restored.talk!.claims.map(claim => claim.script)).toEqual(['first']);
    restored.input('KeyY');
    afterLine(restored, 'FIRST HEARD');
    expect(restored.talk!.claims).toEqual([]);
  });

  test('restores a Save that carries its Talk Scripts’ sources', () => {
    const waiter = script(
      'waiter',
      `use show from benson
on begin
  wait 10 s
  show "WAITED" and wait
end begin
`
    );
    const session = withScripts([waiter]);
    session.begin();
    const snapshot = session.captureSaveSnapshot();
    // Saves written before the sources were left out embed them.
    const embedded = Buffer.from(session.talk!['group'].save()).toString(
      'base64'
    );
    const restored = GameplaySession.restore(
      content,
      benson(),
      { ...snapshot, talk: { ...snapshot.talk!, group: embedded } },
      { scripts: [waiter] }
    );
    afterLine(restored, 'WAITED');
    expect(shown(restored)).toEqual(['WAITED']);
  });

  test('reloads an edited Talk Script with its Script Variables, ending its Runs', () => {
    const counter = (says: string): TalkScript =>
      script(
        'counter',
        `use show from benson
script variable count = 0
on begin
  wait 10 s
  show "${says} WAITED" and wait
end begin
on pressed key
  put count + 1 into count
  show "${says} " & count and wait
end pressed
`
      );
    const waiter = script(
      'waiter',
      `use show from benson
on begin
  wait 10 s
  show "WAITED" and wait
end begin
`
    );
    const session = withScripts([counter('COUNT'), waiter]);
    session.begin();
    session.input('KeyQ');
    afterLine(session, 'COUNT 1');

    const restored = saveAndRestore(session, [counter('NOW'), waiter]);
    afterLine(restored, 'WAITED');
    restored.input('KeyQ');
    afterLine(restored, 'NOW 2');
    expect(shown(restored)).toEqual(['WAITED', 'NOW 2']);
    expect(
      restored
        .talk!.reports.filter(report => report.kind === 'run discarded')
        .map(report => report.script)
    ).toEqual(['counter']);
  });

  test('drops a Talk Script no longer built, and loads a new one with no begin', () => {
    const session = withScripts([listener('one')]);
    const restored = saveAndRestore(session, [
      listener('two'),
      script(
        'new',
        `use show from benson
on begin
  show "BEGUN" and wait
end begin
`
      )
    ]);
    restored.input('KeyQ');
    afterLine(restored, 'two Q');
    advance(restored, 5);
    expect(shown(restored)).toEqual(['two Q']);
  });

  test('bounds the Talk Script save on its own, and refuses one not in base64', () => {
    const save = envelope(withScripts([listener('one')]));
    const withGroup = (group: string): SaveEnvelope => ({
      ...save,
      snapshot: { ...save.snapshot, talk: { ...save.snapshot.talk!, group } }
    });
    expect(() =>
      encodeSave(withGroup('A'.repeat(SAVE_TALK_CODE_UNIT_LIMIT + 4)))
    ).toThrow('Talk Script save limit');
    expect(() => encodeSave(withGroup('not base64!'))).toThrow('base64');
    expect(decodeSave(encodeSave(save), environment)).toEqual(save);
  });
});
