import { BensonDisplay } from '../benson/display.ts';
import { BensonHostState } from '../benson/host.ts';
import { DAMOCLES_MUSIC_PATH, parseDamoclesMusic } from '../damocles/music.ts';
import type { DamoclesRequest } from '../damocles/psg.ts';
import type {
  DamoclesSoundCommand,
  DamoclesSoundDocument
} from '../damocles/sound.ts';
import { dionDocumentPath, readDionHeader } from '../dion/documents.ts';
import { readDionSound, type DionSoundProgramme } from '../dion/narrative.ts';
import type { SoundDocument } from '../payload/documents.ts';
import { readers } from '../payload/read.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { bensonFrequencyHigh, type SoundCommand } from '../sound/presenter.ts';
import { AudioWorkletTransport } from '../sound/transport.ts';
import { button, card } from './cards.ts';
import { installDionBoard } from './dionBoard.ts';
import type { DionBoardCommand } from './dionProgram.ts';
import type {
  GhettoblasterCommand,
  GhettoblasterDocument
} from './ghettoblasterProgram.ts';

/// The sound board: every sound the port plays, on demand, for listening (#508).
///
/// It drives the titles' AudioWorklets directly, with the command vocabularies their
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
  const musicResponse = await fetch(DAMOCLES_MUSIC_PATH);
  if (!musicResponse.ok) {
    throw new Error(
      `${DAMOCLES_MUSIC_PATH} answered HTTP ${musicResponse.status}`
    );
  }
  const music = parseDamoclesMusic(await musicResponse.json());

  const dionPath = dionDocumentPath('sound');
  const dionResponse = await fetch(dionPath);
  if (!dionResponse.ok) {
    throw new Error(`${dionPath} answered HTTP ${dionResponse.status}`);
  }
  const dionHeader = readDionHeader(await dionResponse.json(), 'sound');
  const dionProgrammes = readDionSound(dionHeader.body, 'sound');

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
    {
      music: { ...music, addressZero: music.addressZero.bytes },
      vblHertz: VBL_HERTZ
    },
    {
      onFailure: failed,
      processor: 'damocles-ym',
      workletUrl: '/src/damocles/soundWorklet.ts'
    }
  );

  const dion = new AudioWorkletTransport<
    DionBoardCommand,
    readonly DionSoundProgramme[]
  >(dionProgrammes, {
    onFailure: failed,
    processor: 'dion-board-ym',
    workletUrl: '/src/soundboard/dionWorklet.ts'
  });

  /// The board's own whole SID, for arrangements beyond what Targ's synth plays.
  const sidBoard = new AudioWorkletTransport<
    GhettoblasterCommand,
    GhettoblasterDocument
  >(
    {
      clockHz: targDocument.sid.clockHz,
      music: { ...music, addressZero: music.addressZero.bytes }
    },
    {
      onFailure: failed,
      processor: 'board-sid',
      workletUrl: '/src/soundboard/ghettoblasterWorklet.ts'
    }
  );

  const controls = (): void => {
    for (const transport of [targ, sidBoard, damocles, dion]) {
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
    unlocked ??= Promise.all([
      targ.unlock(),
      sidBoard.unlock(),
      damocles.unlock(),
      dion.unlock()
    ]).then(() => {
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
    timeline: readonly (readonly [
      vbl: number,
      command: DamoclesRequest | DamoclesSoundCommand
    ])[]
  ): Promise<void> =>
    unlock().then(() => {
      const start = now();
      for (const [vbl, command] of timeline) {
        damocles.send({
          at: start + vbl * VBL,
          commands: [
            typeof command === 'string'
              ? { cue: command, kind: 'cue' }
              : command
          ]
        });
      }
    });

  const stopSidBoard = (): void => {
    sidBoard.send({ at: now(), commands: [{ kind: 'reset' }] });
  };
  const stopTarg = (): void => {
    stopSidBoard();
    targ.send({
      at: now(),
      commands: [{ kind: 'reset', registers: targDocument.initialRegisters }]
    });
  };
  const stopDamocles = (): void => {
    damocles.send({ at: now(), commands: [{ kind: 'reset' }] });
  };
  const stopDion = (): void => {
    dion.send({ at: now(), commands: [{ kind: 'reset' }] });
  };
  document.getElementById('stop-all')!.addEventListener('click', () => {
    void unlock().then(() => {
      stopTarg();
      stopDamocles();
      stopDion();
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
  const sidTune = card(
    targBoard,
    'GHETTOBLASTER on the SID',
    `Damocles's tune arranged for the SID: its pitches, bends and rests from the ST player, every note retriggering its voice's gate. A noise hi-hat, a sweeping pulse bass through the resonant low-pass and a sawtooth lead, each envelope fitted to the YM volume table it replaces. The board's own SID plays it, with the waveforms and filter Targ never uses. It loops every ${music.loopVbls} VBLs; the C64 never played it.`
  );
  button(
    sidTune,
    'Play',
    () =>
      void unlock().then(() =>
        sidBoard.send({ at: now(), commands: [{ kind: 'play' }] })
      )
  );
  button(sidTune, 'Stop', stopSidBoard);
  button(targBoard, 'Stop Targ', stopTarg);

  // --- Damocles --------------------------------------------------------------

  const damoclesBoard = document.getElementById('damocles')!;
  const cues: readonly [
    string,
    string,
    (readonly [number, DamoclesRequest])[]
  ][] = [
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

  // The rest of the driver (#514, docs/research/damocles-sound-programmes.md). No Gameplay
  // Session asks for these yet; each card names what does in the ST.
  const programmes: readonly [
    string,
    string,
    (readonly [number, DamoclesRequest])[]
  ][] = [
    [
      'Spell · $04BF5C',
      'A BOOK page’s action with the MAGIC CRYSTAL carried: a five-VBL warble under a 4.2 s decay. Not reached in play.',
      [[0, 'spell']]
    ],
    [
      'Splash · $04C016',
      'A craft reaching the ground over sea: noise stepping its period under a 0.85 s decay. Not reached in play.',
      [[0, 'splash']]
    ],
    [
      'Transporter · $04C0B4',
      'A transporter hop: tone and noise alternating low and high under a 1.05 s decay.',
      [[0, 'transporter']]
    ],
    [
      'Transporter hop, as recorded',
      'The Eris hop: the thud as the player steps against the arrival cube cuts the transporter 13 VBLs in.',
      [
        [0, 'transporter'],
        [13, 'thud']
      ]
    ],
    [
      'Bump · $04C470',
      'A boarded move refused, as the limo hitting a building: a 31 Hz tone under a 1.58 s decay.',
      [[0, 'bump']]
    ],
    [
      'Blast · $04C5A8',
      'An explosive’s deadline, and a craft reaching the ground on land: noise, 2.1 s.',
      [[0, 'blast']]
    ],
    [
      'Shot · $04C610',
      'The player fires, and ENEMY SHIP DESTROYED: noise, 0.49 s.',
      [[0, 'shot']]
    ],
    [
      'Thud · $04C630',
      'On foot against a wall, and the attack ship firing: noise, 0.26 s.',
      [[0, 'thud']]
    ],
    [
      'Zap · $04C652',
      'The attack ship’s shot reaching the player: 10.4 kHz tone and noise, 2.1 s. Not reached in play.',
      [[0, 'zap']]
    ],
    [
      'Blown up · $04C700',
      'A carried explosive or NOVABOMB, or too close to a blast: noise, 4.7 s.',
      [[0, 'blown-up']]
    ],
    [
      'A carried explosive',
      'The deadline’s blast, replaced by blown up when the burst’s first frame finds it carried (4 VBLs here).',
      [
        [0, 'blast'],
        [4, 'blown-up']
      ]
    ],
    [
      'Hazard alarm · $04C16E',
      'TOO COLD, TOO HOT or NO AIR: 61 Hz on channel C for the ten seconds (500 VBLs), then silence at death.',
      [
        [0, 'hazard-alarm'],
        [500, 'channel-c-off']
      ]
    ]
  ];
  for (const [title, description, timeline] of programmes) {
    button(
      card(damoclesBoard, title, description),
      'Play',
      () => void playDamocles(timeline)
    );
  }

  let exponent = 4;
  const craftEngine = card(
    damoclesBoard,
    'Craft engine · $04C250',
    'Channel C’s idle voice: 7.8 kHz tone and noise at the speed’s exponent (log₂), at most 15, and silent below speed 1.'
  );
  button(
    craftEngine,
    'Start',
    () =>
      void playDamocles([
        [0, 'restore'],
        [0, { exponent, kind: 'speed' }]
      ])
  );
  button(
    craftEngine,
    'Stop',
    () => void playDamocles([[0, { exponent: -1, kind: 'speed' }]])
  );
  const exponentSlider = document.createElement('label');
  exponentSlider.textContent = 'Speed exponent';
  const exponentInput = document.createElement('input');
  exponentInput.type = 'range';
  exponentInput.min = '0';
  exponentInput.max = '16';
  exponentInput.value = String(exponent);
  exponentInput.addEventListener('input', () => {
    exponent = Number(exponentInput.value);
    void playDamocles([[0, { exponent, kind: 'speed' }]]);
  });
  exponentSlider.append(exponentInput);
  craftEngine.after(exponentSlider);

  // `$051D26` ticks from the VBL and Timer B handlers, about twice a VBL. Each tick counts
  // up and clicks once a draw scaled by the rate falls at or under the count. The ST draws
  // from a table at $77000; the board draws uniformly instead.
  const geigerTimeline = (
    rate: number,
    seconds: number
  ): (readonly [number, DamoclesRequest])[] => {
    const clicks: (readonly [number, DamoclesRequest])[] = [];
    let count = 0;
    for (let tick = 0; tick < seconds * VBL_HERTZ * 2; tick += 1) {
      count += 1;
      if (Math.floor(Math.random() * rate) <= count) {
        count = 0;
        clicks.push([tick / 2, 'geiger-click']);
      }
    }
    return clicks;
  };
  const geiger = card(
    damoclesBoard,
    'Geiger counter · $04C6B2',
    'The GEIGER COUNTER, carried and on, near the NOVABOMB: a 2604 Hz click at rate 3 within about 362 units, 2 more a doubling of distance. Draws are uniform here.'
  );
  button(geiger, 'Click', () => void playDamocles([[0, 'geiger-click']]));
  for (const [label, rate] of [
    ['Beside it', 3],
    ['2048 units', 9],
    ['32768 units', 17]
  ] as const) {
    button(geiger, label, () => void playDamocles(geigerTimeline(rate, 5)));
  }

  const message = card(
    damoclesBoard,
    'Message tone · $052402',
    'Channel A while a message scrolls in: for 36 VBLs, the first character each fetches times two at level 12, a space silent. The pointer runs 2, 1, 1, so characters 1, 5, 9… are never heard.'
  );
  const messageText = document.createElement('input');
  messageText.value = '               TOO HEAVY                     ';
  messageText.setAttribute('aria-label', 'Damocles message text');
  message.before(messageText);
  button(
    message,
    'Type',
    () =>
      void playDamocles([
        [0, { kind: 'message', text: messageText.value.toUpperCase() }]
      ])
  );

  const descentSteps = 277;
  button(
    card(
      damoclesBoard,
      'New Game descent · $051274',
      'Channels B and C from 122 and 109 Hz, 4 longer a step until touchdown. One step every 3 VBLs here, the boot recording’s pace; the game steps once a pass of its loop.'
    ),
    'Play',
    () =>
      void playDamocles([
        [0, 'descent-start'],
        ...Array.from(
          { length: descentSteps },
          (_, step) => [3 * (step + 1), 'descent-step'] as const
        ),
        [3 * (descentSteps + 1), 'descent-end']
      ])
  );

  const tune = card(
    damoclesBoard,
    `GHETTOBLASTER · $033F6A`,
    `The music player, from the Data Payload: three voices looping every ${music.loopVbls} VBLs. Its hi-hat and first bass pass read address 0, the TOS ROM’s header.`
  );
  button(
    tune,
    'Play',
    () => void playDamocles([[0, { kind: 'music', playing: true }]])
  );
  button(
    tune,
    'Stop',
    () => void playDamocles([[0, { kind: 'music', playing: false }]])
  );
  button(damoclesBoard, 'Stop Damocles', stopDamocles);

  installDionBoard(
    document.getElementById('dion')!,
    commands => unlock().then(() => dion.send({ at: now(), commands })),
    stopDion
  );
} catch (error) {
  errorLine.textContent =
    error instanceof Error ? error.message : String(error);
}
