import type { DionContent } from './content.ts';
import { bool, int, ints, list, record, text } from './read.ts';
import type { DionAction, DionResumeRecord } from './session.ts';

const finite = (
  value: unknown,
  path: string,
  min: number,
  max: number
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${path} is out of range`);
  }
  return value;
};
const tuple = (
  value: unknown,
  path: string
): readonly [number, number, number] => {
  const values = ints(value, path, 3, -0x80_00_00_00, 0xff_ff_ff_ff);
  return [values[0]!, values[1]!, values[2]!];
};
const enumeration = <T extends string>(
  value: unknown,
  path: string,
  values: readonly T[]
): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${path} is unknown`);
  }
  return value as T;
};
const nullableInt = (value: unknown, path: string) =>
  value === null ? null : int(value, path, 0, 0xff_ff_ff);

export const readDionResume = (
  value: unknown,
  content?: DionContent,
  driverIndexMax = 4
): DionResumeRecord => {
  const raw = record(value, 'snapshot');
  const s = record(raw['snapshot'], 'snapshot.state');
  const clock = record(s['clock'], 'clock');
  const driver = record(s['driver'], 'driver');
  const gauges = record(s['gauges'], 'gauges');
  const narrative = record(s['narrative'], 'narrative');
  const message = record(narrative['message'], 'message');
  const sound = record(s['sound'], 'sound');
  const taxi = record(s['taxi'], 'taxi');
  const sign = record(s['sign'], 'sign');
  const cash = text(s['cash'], 'cash');
  if (!/^\d{12}$/.test(cash)) {
    throw new Error('cash is not twelve BCD digits');
  }
  const flags = list(narrative['flags'], 'flags').map((v, i) =>
    bool(v, `flags[${i}]`)
  );
  if (flags.length !== 64) {
    throw new Error('flags should hold 64 bits');
  }
  const timed =
    narrative['timed'] === null ? null : record(narrative['timed'], 'timed');
  const candidate =
    s['candidate'] === null ? null : record(s['candidate'], 'candidate');
  const position = ints(s['position'], 'position', 2, 0, 65_535);
  const pending: DionAction | null =
    s['pending'] === null
      ? null
      : enumeration<DionAction>(s['pending'], 'pending', [
          'activate',
          'star',
          'plus',
          'minus',
          'board',
          'leave',
          'take',
          'drop',
          'forward',
          'backward'
        ]);
  const bar = ints(message['bar'], 'message.bar', 288 * 6, 0, 1);
  const snapshot: DionResumeRecord['snapshot'] = {
    admission: int(s['admission'], 'admission', 0, 10),
    candidate:
      candidate === null
        ? null
        : {
            distance: finite(
              candidate['distance'],
              'candidate.distance',
              0,
              0xff_ff_ff_ff
            ),
            exponent: int(candidate['exponent'], 'candidate.exponent', 0, 32),
            slot: int(candidate['slot'], 'candidate.slot', 1, 255)
          },
    card: bool(s['card'], 'card'),
    cardDestination: int(s['cardDestination'], 'cardDestination', 0, 255),
    cash,
    cell: int(s['cell'], 'cell', 0, 255),
    clock: {
      accumulator: int(clock['accumulator'], 'clock.accumulator', 1, 1600),
      day: int(clock['day'], 'clock.day', 0, 65_535),
      seconds: int(clock['seconds'], 'clock.seconds', 0, 86_399)
    },
    day: bool(s['day'], 'day'),
    doors: list(s['doors'], 'doors').map((value, index) => {
      const entry = list(value, `doors[${index}]`);
      if (entry.length !== 2) {
        throw new Error('invalid door entry');
      }
      const door = record(entry[1], 'door');
      return [
        int(entry[0], 'door.slot', 0, 1023),
        {
          latch: enumeration(door['latch'], 'door.latch', [
            'shut',
            'moving',
            'open'
          ]),
          openUnits: int(door['openUnits'], 'door.openUnits', 0, 32_767)
        }
      ] as const;
    }),
    driver: {
      index: int(driver['index'], 'driver.index', 0, driverIndexMax),
      profile: bool(driver['profile'], 'driver.profile'),
      remaining: int(driver['remaining'], 'driver.remaining', 0, 255),
      selector: int(driver['selector'], 'driver.selector', 0, 65_535)
    },
    eye: tuple(s['eye'], 'eye'),
    frame: int(s['frame'], 'frame', 0, Number.MAX_SAFE_INTEGER),
    frameCounter: int(s['frameCounter'], 'frameCounter', 0, 65_535),
    gauges: {
      inventory: int(gauges['inventory'], 'gauges.inventory', 0, 65_535),
      p: int(gauges['p'], 'gauges.p', 0, 65_535),
      t: int(gauges['t'], 'gauges.t', 0, 65_535)
    },
    heading: int(s['heading'], 'heading', 0, 65_535),
    location: int(s['location'], 'location', 0, 65_535),
    narrative: {
      available: ints(
        narrative['available'],
        'narrative.available',
        undefined,
        0,
        255
      ),
      cabin: int(narrative['cabin'], 'narrative.cabin', 0, 65_535),
      flags,
      hold: int(narrative['hold'], 'narrative.hold', 37, 65_535),
      keyA: bool(narrative['keyA'], 'narrative.keyA'),
      message: {
        age: int(message['age'], 'message.age', -1, 65_535),
        bar,
        busy: bool(message['busy'], 'message.busy'),
        hold: int(message['hold'], 'message.hold', 37, 65_535),
        scrollsOut: bool(message['scrollsOut'], 'message.scrollsOut'),
        serial: int(
          message['serial'],
          'message.serial',
          0,
          Number.MAX_SAFE_INTEGER
        ),
        text: text(message['text'], 'message.text')
      },
      pc: nullableInt(narrative['pc'], 'narrative.pc'),
      queued: nullableInt(narrative['queued'], 'narrative.queued'),
      stack: ints(
        narrative['stack'],
        'narrative.stack',
        undefined,
        0,
        0xff_ff_ff
      ),
      timed:
        timed === null
          ? null
          : {
              remaining: int(timed['remaining'], 'timed.remaining', 0, 65_535),
              script: int(timed['script'], 'timed.script', 0, 255)
            },
      wait: int(narrative['wait'], 'narrative.wait', 0, 65_535)
    },
    pending,
    phase: int(s['phase'], 'phase', 0, 0xff_ff_ff_ff),
    pitch: int(s['pitch'], 'pitch', 0, 65_535),
    position: [position[0]!, position[1]!],
    region: int(s['region'], 'region', 0, 64),
    reveal: int(s['reveal'], 'reveal', 0, 64),
    sign: {
      code: int(sign['code'], 'sign.code', 0, 255),
      index: int(sign['index'], 'sign.index', 0, 65_535)
    },
    sound: {
      c:
        sound['c'] === null
          ? null
          : enumeration(sound['c'], 'sound.c', [
              'ambient',
              'door_moving',
              'door_stop',
              'taxi_set_down',
              'lift_off',
              'engine',
              'leave'
            ]),
      clickAge: int(sound['clickAge'], 'sound.clickAge', 0, 255),
      elapsed: int(
        sound['elapsed'],
        'sound.elapsed',
        -1,
        Number.MAX_SAFE_INTEGER
      ),
      keyClick: bool(sound['keyClick'], 'sound.keyClick'),
      mixer: int(sound['mixer'], 'sound.mixer', 0, 255),
      registers: ints(sound['registers'], 'sound.registers', 14, 0, 255),
      slew: int(sound['slew'], 'sound.slew', 0, 65_535)
    },
    taxi: {
      call: bool(taxi['call'], 'taxi.call'),
      cell: int(taxi['cell'], 'taxi.cell', 0, 255),
      counter: int(taxi['counter'], 'taxi.counter', 0, 35),
      destination: int(taxi['destination'], 'taxi.destination', 0, 255),
      heading: int(taxi['heading'], 'taxi.heading', 0, 1023),
      heightIndex: int(taxi['heightIndex'], 'taxi.heightIndex', -1, 20),
      passenger: bool(taxi['passenger'], 'taxi.passenger'),
      position: tuple(taxi['position'], 'taxi.position'),
      progress: int(taxi['progress'], 'taxi.progress', 0, 65_535),
      routeIndex: int(taxi['routeIndex'], 'taxi.routeIndex', 0, 25),
      start: bool(taxi['start'], 'taxi.start')
    },
    tick: int(s['tick'], 'tick', 0, Number.MAX_SAFE_INTEGER)
  };
  if (snapshot.frame !== Math.floor(snapshot.tick / 11)) {
    throw new Error('simulation phase disagrees with frame');
  }
  if (![0, 1, 2, 34, 35].includes(snapshot.taxi.counter)) {
    throw new Error('unsupported taxi counter');
  }
  if (![0, 0x62, 0x60, 2].includes(snapshot.cardDestination)) {
    throw new Error('unknown card destination');
  }
  if (![0, 0x62, 0x60, 2].includes(snapshot.taxi.destination)) {
    throw new Error('unknown taxi destination');
  }
  if (
    new Set(snapshot.doors.map(([slot]) => slot)).size !== snapshot.doors.length
  ) {
    throw new Error('duplicate door');
  }
  if (content !== undefined) {
    const instructions = new Set(
      content.scripts.routines.flatMap(r => r.instructions.map(i => i.address))
    );
    for (const pc of [snapshot.narrative.pc, ...snapshot.narrative.stack]) {
      if (pc !== null && !instructions.has(pc)) {
        throw new Error('unknown script continuation');
      }
    }
    if (
      snapshot.narrative.available.some(id => !content.scripts.entries.has(id))
    ) {
      throw new Error('unknown available script');
    }
    if (snapshot.sign.index >= content.world.lettering.signScript.length) {
      throw new Error('unknown sign cursor');
    }
    const cell = content.world.cells.find(item => item.cell === snapshot.cell);
    const structure =
      cell &&
      content.world.structures.get(cell.structure)?.get(cell.scale.join(','));
    if (
      snapshot.region > 0 &&
      (structure === undefined || snapshot.region > structure.regions.length)
    ) {
      throw new Error('unknown region');
    }
    for (const [slot] of snapshot.doors) {
      if (!structure?.attachments.some(door => door.slot === slot)) {
        throw new Error('unknown bound door');
      }
    }
    for (const id of [
      snapshot.narrative.queued,
      snapshot.narrative.timed?.script
    ]) {
      if (id != null && !content.scripts.entries.has(id)) {
        throw new Error('unknown pending script');
      }
    }
    if (
      snapshot.narrative.cabin !== 0 &&
      !content.service.headTurns.has(snapshot.narrative.cabin)
    ) {
      throw new Error('unknown pending cabin programme');
    }
    if (
      snapshot.driver.selector !== 0 &&
      !content.service.headTurns.has(snapshot.driver.selector)
    ) {
      throw new Error('unknown cabin programme');
    }
  }
  return {
    remainder: finite(raw['remainder'], 'remainder', 0, 1 / 50),
    snapshot
  };
};
