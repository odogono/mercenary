import { BensonDisplay } from '../benson/display.ts';
import { BensonHostState } from '../benson/host.ts';
import type { DamoclesCue } from '../damocles/psg.ts';
import type {
  DamoclesSoundCommand,
  DamoclesSoundDocument
} from '../damocles/sound.ts';
import type { SoundDocument } from '../payload/documents.ts';
import { readers } from '../payload/read.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { bensonFrequencyHigh, type SoundCommand } from '../sound/presenter.ts';
import { AudioWorkletTransport } from '../sound/transport.ts';

/// The sound board: every sound the port plays, on demand, for listening (#508).
///
/// It drives the two titles' AudioWorklets directly, with the command vocabularies their
/// presenters use, so what is heard here is what a Gameplay Session would play. It owns no
/// session and reads no preference; its volume and mute are its own.

const status = document.getElementById('status')!;
const errorLine = document.getElementById('error')!;
const volume = document.getElementById('volume') as HTMLInputElement;
const mute = document.getElementById('mute') as HTMLInputElement;

/// Damocles programmes run on the ST's VBL; the board's timelines count in them.
const VBL_HERTZ = 50;
const VBL = 1 / VBL_HERTZ;

const now = (): number => performance.now() / 1000;

const card = (
  parent: HTMLElement,
  title: string,
  description: string
): HTMLElement => {
  const element = document.createElement('article');
  element.className = 'sound';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  element.append(heading, text, buttons);
  parent.append(element);
  return buttons;
};

const button = (
  parent: HTMLElement,
  label: string,
  action: () => void
): HTMLButtonElement => {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', action);
  parent.append(element);
  return element;
};

const slider = (
  parent: HTMLElement,
  label: string,
  initial: number,
  change: (value: number) => void
): void => {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '255';
  input.value = String(initial);
  input.addEventListener('input', () => change(Number(input.value)));
  wrapper.append(input);
  parent.after(wrapper);
};

const hex = (value: number): string =>
  `$${value.toString(16).toUpperCase().padStart(2, '0')}`;

try {
  assertBrowserDocument(location.pathname, 'sounds');
  const response = await fetch('/payload/sound.json');
  if (!response.ok) {
    throw new Error(`/payload/sound.json answered HTTP ${response.status}`);
  }
  const targDocument: SoundDocument = readers.sound(
    { name: 'sound.json' },
    await response.json()
  );

  const failed = (reason: string): void => {
    errorLine.textContent = `Audio unavailable: ${reason}`;
  };
  const targ = new AudioWorkletTransport<SoundCommand>(targDocument, {
    onFailure: failed
  });
  const damocles = new AudioWorkletTransport<
    DamoclesSoundCommand,
    DamoclesSoundDocument
  >(
    { vblHertz: VBL_HERTZ },
    {
      onFailure: failed,
      processor: 'damocles-ym',
      workletUrl: '/src/damocles/soundWorklet.ts'
    }
  );

  const controls = (): void => {
    for (const transport of [targ, damocles]) {
      transport.send({
        at: now(),
        commands: [
          { kind: 'mute', value: mute.checked },
          { kind: 'volume', value: Number(volume.value) }
        ]
      });
    }
  };
  let unlocked: Promise<void> | undefined;
  const unlock = (): Promise<void> => {
    unlocked ??= Promise.all([targ.unlock(), damocles.unlock()]).then(() => {
      controls();
      status.textContent = 'Audio running.';
    });
    return unlocked;
  };
  // Browsers allow audio only from a trusted gesture, so the first one starts it.
  window.addEventListener(
    'pointerdown',
    event => {
      if (event.isTrusted) {
        void unlock();
      }
    },
    { capture: true }
  );
  window.addEventListener(
    'keydown',
    event => {
      if (event.isTrusted) {
        void unlock();
      }
    },
    { capture: true }
  );
  volume.addEventListener('input', controls);
  mute.addEventListener('change', controls);

  const playTarg = (
    commands: readonly SoundCommand[],
    delay = 0
  ): Promise<void> =>
    unlock().then(() => targ.send({ at: now() + delay, commands }));
  const playDamocles = (
    timeline: readonly (readonly [vbl: number, cue: DamoclesCue])[]
  ): Promise<void> =>
    unlock().then(() => {
      const start = now();
      for (const [vbl, cue] of timeline) {
        damocles.send({
          at: start + vbl * VBL,
          commands: [{ cue, kind: 'cue' }]
        });
      }
    });

  const stopTarg = (): void => {
    targ.send({
      at: now(),
      commands: [{ kind: 'reset', registers: targDocument.initialRegisters }]
    });
  };
  const stopDamocles = (): void => {
    damocles.send({ at: now(), commands: [{ kind: 'reset' }] });
  };
  document.getElementById('stop-all')!.addEventListener('click', () => {
    void unlock().then(() => {
      stopTarg();
      stopDamocles();
    });
  });

  // --- Targ ------------------------------------------------------------------

  const targBoard = document.getElementById('targ')!;
  const { bensonDisplay, craft, liftJourney } = targDocument;
  /// What asks for each one-shot selector, from the presenter and the payload documents.
  const oneShotNames = new Map<number, [string, string]>([
    [0, ['Tone', 'Key acknowledged, the craft tone and the lift ding.']],
    [4, ['Site impact', 'A destroyed site (siteDestruction.impactSound).']],
    [8, ['Fire', 'A shot fired, and a hostile craft inbound.']],
    [12, ['Hostile hit', 'A hostile craft hit (hostileCraft.hitSound).']],
    [16, ['Object hit', 'An object shot (objectHits.sound).']],
    [20, ['Wall thud', 'Walking into a wall (rooms.wallThudSound).']],
    [24, ['Crash', 'A crash touchdown.']]
  ]);
  const presented = new Set([
    ...oneShotNames.keys(),
    28,
    32,
    craft.programSelector,
    liftJourney.programSelector
  ]);
  for (const program of targDocument.oneShots) {
    const known = oneShotNames.get(program.selector);
    if (known === undefined && presented.has(program.selector)) {
      continue;
    }
    const [title, description] = known ?? [
      'Unused one-shot',
      'Recovered, but the port asks for it nowhere.'
    ];
    const buttons = card(
      targBoard,
      `${title} · ${hex(program.selector)}`,
      description
    );
    button(
      buttons,
      'Play',
      () =>
        void playTarg([{ kind: 'play', selector: program.selector, voice: 1 }])
    );
  }
  button(
    card(
      targBoard,
      'Arrival · $1C + $20',
      'Arriving through a transition: two programmes on voices 1 and 2.'
    ),
    'Play',
    () =>
      void playTarg([
        { kind: 'play', selector: 28, voice: 1 },
        { kind: 'play', selector: 32, voice: 2 }
      ])
  );

  let liftPitch = 0x40;
  const lift = card(
    targBoard,
    `Lift journey · ${hex(liftJourney.programSelector)}`,
    'The ding, then the journey voice; the slider is its pitch high byte.'
  );
  button(
    lift,
    'Start',
    () =>
      void playTarg([
        { kind: 'play', selector: liftJourney.dingSelector, voice: 1 },
        { kind: 'play', selector: liftJourney.programSelector, voice: 2 },
        {
          kind: 'write',
          register: liftJourney.pitchHighRegister,
          value: liftPitch
        }
      ])
  );
  button(
    lift,
    'Stop',
    () =>
      void playTarg([
        {
          kind: 'write',
          register: liftJourney.controlRegister,
          value: liftJourney.stoppedValue
        }
      ])
  );
  slider(lift, 'Pitch', liftPitch, value => {
    liftPitch = value;
    void playTarg([
      { kind: 'write', register: liftJourney.pitchHighRegister, value }
    ]);
  });

  let craftFrequency = 0x28;
  const engine = card(
    targBoard,
    `Craft engine · ${hex(craft.programSelector)}`,
    'The aboard voice; the slider is the frequency high byte speed sets.'
  );
  button(
    engine,
    'Start',
    () =>
      void playTarg([
        { kind: 'play', selector: craft.programSelector, voice: 2 },
        {
          kind: 'write',
          register: craft.frequencyHighRegister,
          value: craftFrequency
        },
        {
          kind: 'write',
          register: craft.sustainReleaseRegister,
          value: 0xf0 | craft.sustainReleaseOr
        }
      ])
  );
  button(
    engine,
    'Stop',
    () =>
      void playTarg([
        {
          kind: 'write',
          register: targDocument.stopRules.secondVoiceControlRegister,
          value: targDocument.stopRules.stoppedValue
        }
      ])
  );
  slider(engine, 'Frequency', craftFrequency, value => {
    craftFrequency = value;
    void playTarg([
      { kind: 'write', register: craft.frequencyHighRegister, value }
    ]);
  });

  const benson = card(
    targBoard,
    'Benson typing',
    'Voice 3 follows each character Benson shows: 25 shifts at 50 Hz, then the silent wait.'
  );
  const text = document.createElement('input');
  text.value = 'WELCOME TO TARG';
  text.setAttribute('aria-label', 'Benson text');
  benson.before(text);
  button(benson, 'Type', () => {
    // The Session's own display, stepped a frame at a time, so the bursts, the pause and the
    // trailing spaces match the game rather than an even typing rate.
    const display = new BensonDisplay(VBL_HERTZ);
    display.start(text.value, BensonHostState.defaultMessageInterval);
    void unlock().then(() => {
      const start = now();
      let last: number | undefined;
      for (let frame = 0; ; frame += 1) {
        const value = bensonFrequencyHigh(
          bensonDisplay,
          display.soundCharacter
        );
        if (value !== last) {
          targ.send({
            at: start + frame * VBL,
            commands: [
              {
                kind: 'write',
                register: bensonDisplay.frequencyHighRegister,
                value
              }
            ]
          });
          last = value;
        }
        if (display.isFinished) {
          break;
        }
        display.advance(VBL);
      }
    });
  });
  button(targBoard, 'Stop Targ', stopTarg);

  // --- Damocles --------------------------------------------------------------

  const damoclesBoard = document.getElementById('damocles')!;
  const cues: readonly [string, string, (readonly [number, DamoclesCue])[]][] =
    [
      [
        'Door tone · $04C37A',
        'A door starts moving. It loops until a door stops, so stop it with the burst.',
        [[0, 'door-start']]
      ],
      [
        'Door burst · $04C2B8',
        'Every door has stopped: noise at levels 12, 8, 4, 0.',
        [[0, 'door-stop']]
      ],
      [
        'A door moving · 33 VBLs',
        'The State Office lift door shutting: its tone, then its burst.',
        [
          [0, 'door-start'],
          [33, 'door-stop']
        ]
      ],
      [
        'Shared effect · $04C556',
        'A take, a drop or a lift arrival: 1302 Hz under a one-second decay.',
        [[0, 'take']]
      ],
      [
        'Lift ride G → 1',
        'The door shuts, the label steps in silence, the arrival over the new door opening.',
        [
          [0, 'door-start'],
          [33, 'door-stop'],
          [83, 'take'],
          [83, 'door-start'],
          [116, 'door-stop']
        ]
      ],
      [
        'A take while a door moves',
        'The request cuts channel C until the next VBL, and both play on.',
        [
          [0, 'door-start'],
          [15, 'take'],
          [40, 'door-stop']
        ]
      ]
    ];
  for (const [title, description, timeline] of cues) {
    button(
      card(damoclesBoard, title, description),
      'Play',
      () => void playDamocles(timeline)
    );
  }
  button(damoclesBoard, 'Stop Damocles', stopDamocles);
} catch (error) {
  errorLine.textContent =
    error instanceof Error ? error.message : String(error);
}
