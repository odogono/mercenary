import { readSources, type DionDocumentKind } from './documents.ts';
import { address, fail, int, ints, list, record, text } from './read.ts';

/// Strict readers for Mercenary III's decoded messages, scripts, sound and service.
/// The title-local machines consume these facts independently of the source program.

export interface DionMessage {
  readonly header: number;
  readonly id: number;
  readonly scrollsOut: boolean;
  readonly text: string;
}

export interface DionInstruction {
  readonly address: number;
  readonly branch?: { readonly call: boolean; readonly invert: boolean };
  readonly name: string;
  readonly next: number;
  readonly op: number;
  readonly operands: readonly number[];
  readonly target?: number;
  readonly text: string | undefined;
}

export interface DionScripts {
  /// Script number (`$19`, `$33`, `$34`) to its entry address.
  readonly entries: ReadonlyMap<number, number>;
  readonly routines: readonly {
    readonly instructions: readonly DionInstruction[];
    readonly name: string;
  }[];
  readonly texts: ReadonlyMap<number, readonly string[]>;
}

export interface DionSoundProgramme {
  readonly channel: string;
  readonly entry: number;
  readonly name: string;
  readonly registers: readonly (readonly [number, number])[];
  readonly streams: readonly {
    readonly loop: number | null;
    readonly pairs: readonly (readonly [number, number])[];
    readonly registers: readonly number[];
  }[];
}

export interface DionService {
  readonly descent: readonly number[];
  readonly destinations: readonly {
    readonly cell: readonly [number, number];
    readonly code: number;
  }[];
  readonly headTurns: ReadonlyMap<number, readonly number[]>;
  readonly liftOff: readonly number[];
  readonly opening: {
    readonly carried: readonly number[];
    readonly cash: string;
    readonly elapsedSeconds: number;
    readonly taxiProgress: number;
    readonly taxiRouteIndex: number;
  };
  readonly route: readonly {
    readonly control: number;
    readonly x: number;
    readonly z: number;
  }[];
  readonly taxiRate: number;
}

/// R2's ten PSG programmes for the two journeys (`$4BF54`/`$4BF58` vectors and the tone).
export const DION_REQUIRED_PROGRAMMES = [
  'key_click',
  'door_moving',
  'door_stop',
  'taxi_set_down',
  'lift_off',
  'engine',
  'leave',
  'message_tone',
  'cut',
  'reset'
] as const;

const hexByte = (value: unknown, path: string): number => {
  const raw = text(value, path);
  return /^\$[\dA-F]{2}$/.test(raw)
    ? Number.parseInt(raw.slice(1), 16)
    : fail(`${path} is not a $-byte`);
};

export const readDionMessages = (
  body: Record<string, unknown>,
  kind: DionDocumentKind
): readonly DionMessage[] => {
  readSources(body, kind);
  const messages = list(body['messages'], `${kind}.messages`).map(
    (item, index) => {
      const at = `${kind}.messages[${index}]`;
      const raw = record(item, at);
      return {
        header: int(raw['header'], `${at}.header`, 0, 255),
        id: int(raw['id'], `${at}.id`, 0, 63),
        scrollsOut: raw['scrollsOut'] === true,
        text: text(raw['text'], `${at}.text`)
      };
    }
  );
  if (
    messages.length !== 64 ||
    messages.some((message, index) => message.id !== index)
  ) {
    fail(`${kind}.messages should be the 64 ID messages in order`);
  }
  return messages;
};

export const readDionScripts = (
  body: Record<string, unknown>,
  kind: DionDocumentKind
): DionScripts => {
  readSources(body, kind);
  if (list(body['unknownOpcodes'], `${kind}.unknownOpcodes`).length > 0) {
    fail(`${kind}.json decodes an opcode its handlers do not explain`);
  }
  if (list(body['unresolvedTargets'], `${kind}.unresolvedTargets`).length > 0) {
    fail(`${kind}.json names a branch target it does not decode`);
  }
  const entries = new Map<number, number>();
  for (const [index, item] of list(
    body['entries'],
    `${kind}.entries`
  ).entries()) {
    const at = `${kind}.entries[${index}]`;
    const raw = record(item, at);
    entries.set(
      hexByte(raw['script'], `${at}.script`),
      address(raw['address'], `${at}.address`)
    );
  }
  for (const script of [0x19, 0x33, 0x34]) {
    if (!entries.has(script)) {
      fail(`${kind}.json lacks script $${script.toString(16).toUpperCase()}`);
    }
  }
  const summary = record(body['summary'], `${kind}.summary`);
  const texts = new Map<number, readonly string[]>();
  for (const [key, value] of Object.entries(summary)) {
    texts.set(
      hexByte(key, `${kind}.summary key`),
      list(
        record(value, `${kind}.summary.${key}`)['texts'],
        `${kind}.summary.${key}.texts`
      ).map((item, index) =>
        text(item, `${kind}.summary.${key}.texts[${index}]`)
      )
    );
  }
  return {
    entries,
    routines: list(body['routines'], `${kind}.routines`).map((item, index) => {
      const at = `${kind}.routines[${index}]`;
      const raw = record(item, at);
      return {
        instructions: list(raw['instructions'], `${at}.instructions`).map(
          (entry, i) => {
            const it = `${at}.instructions[${i}]`;
            const instruction = record(entry, it);
            return {
              address: address(instruction['address'], `${it}.address`),
              name: text(instruction['name'], `${it}.name`),
              next: address(
                list(
                  record(instruction['source'], `${it}.source`)['range'],
                  `${it}.source.range`
                )[1],
                `${it}.next`
              ),
              op: hexByte(instruction['op'], `${it}.op`),
              operands:
                instruction['operands'] === undefined
                  ? []
                  : list(instruction['operands'], `${it}.operands`).map(
                      (value, index) => {
                        const at = `${it}.operands[${index}]`;
                        return typeof value === 'string'
                          ? address(value, at)
                          : address(record(value, at)['address'], at);
                      }
                    ),
              text:
                instruction['text'] === undefined
                  ? undefined
                  : text(
                      record(instruction['text'], `${it}.text`)['text'],
                      `${it}.text.text`
                    )
            };
          }
        ),
        name: text(raw['name'], `${at}.name`)
      };
    }),
    texts
  };
};

export const readDionSound = (
  body: Record<string, unknown>,
  kind: DionDocumentKind
): readonly DionSoundProgramme[] => {
  readSources(body, kind);
  const programmes = list(body['programmes'], `${kind}.programmes`).map(
    (item, index) => {
      const at = `${kind}.programmes[${index}]`;
      const raw = record(item, at);
      const setup =
        raw['setup'] == null ? {} : record(raw['setup'], `${at}.setup`);
      const registers =
        setup['registers'] === undefined
          ? {}
          : record(setup['registers'], `${at}.setup.registers`);
      return {
        channel: text(raw['channel'], `${at}.channel`),
        entry: address(raw['entry'], `${at}.entry`),
        name: text(raw['name'], `${at}.name`),
        registers: Object.entries(registers).map(
          ([key, value]) =>
            [Number(key.slice(1)), int(value, `${at}.${key}`, 0, 255)] as const
        ),
        streams: list(raw['streams'], `${at}.streams`).map((value, index) => {
          const atStream = `${at}.streams[${index}]`;
          const stream = record(value, atStream);
          const names =
            text(stream['registers'], `${atStream}.registers`).match(
              /R(\d+)/g
            ) ?? [];
          return {
            loop:
              stream['loopsToPair'] === undefined
                ? null
                : int(stream['loopsToPair'], `${atStream}.loopsToPair`, 0),
            pairs: list(stream['pairs'], `${atStream}.pairs`).map(
              (value, index) => {
                const pair = ints(
                  value,
                  `${atStream}.pairs[${index}]`,
                  2,
                  0,
                  65_535
                );
                return [pair[0]!, pair[1]!] as const;
              }
            ),
            registers: names.map(name => Number(name.slice(1)))
          };
        })
      };
    }
  );
  for (const name of DION_REQUIRED_PROGRAMMES) {
    if (!programmes.some(programme => programme.name === name)) {
      fail(`${kind}.json lacks the ${name} programme`);
    }
  }
  return programmes;
};

export const readDionService = (
  body: Record<string, unknown>,
  kind: DionDocumentKind
): DionService => {
  readSources(body, kind);
  const taxi = record(body['taxi'], `${kind}.taxi`);
  const route = list(taxi['points'], `${kind}.taxi.points`).map(
    (item, index) => {
      const at = `${kind}.taxi.points[${index}]`;
      const raw = record(item, at);
      const cell = ints(raw['cell'], `${at}.cell`, 2, 0, 15);
      return {
        control: int(raw['control'], `${at}.control`, 0, 15),
        x: cell[0]!,
        z: cell[1]!
      };
    }
  );
  if (route.length === 0) {
    fail(`${kind}.taxi.points is empty`);
  }
  const heights = record(body['heights'], `${kind}.heights`);
  const opening = record(body['openingState'], `${kind}.openingState`);
  const carried = record(opening['carried'], `${kind}.openingState.carried`);
  const cash = text(
    record(opening['cashBcd'], `${kind}.openingState.cashBcd`)['digits'],
    `${kind}.openingState.cashBcd.digits`
  );
  if (!/^\d{12}$/.test(cash)) {
    fail(`${kind}.openingState.cashBcd.digits is not twelve BCD digits`);
  }
  return {
    descent: ints(
      record(heights['descent'], `${kind}.heights.descent`)['heights'],
      `${kind}.heights.descent.heights`,
      undefined,
      0,
      255
    ),
    destinations: list(body['destinations'], `${kind}.destinations`).map(
      (item, index) => {
        const at = `${kind}.destinations[${index}]`;
        const raw = record(item, at);
        const cell = ints(raw['cell'], `${at}.cell`, 2, 0, 15);
        return {
          cell: [cell[0]!, cell[1]!] as const,
          code: hexByte(raw['code'], `${at}.code`)
        };
      }
    ),
    headTurns: new Map(
      list(
        record(body['headTurns'], `${kind}.headTurns`)['sequences'],
        `${kind}.headTurns.sequences`
      ).map((value, index) => {
        const at = `${kind}.headTurns.sequences[${index}]`;
        const raw = record(value, at);
        return [
          address(raw['value'], `${at}.value`),
          ints(raw['counts'], `${at}.counts`, undefined, 1, 255)
        ];
      })
    ),
    liftOff: ints(
      record(heights['liftOff'], `${kind}.heights.liftOff`)['heights'],
      `${kind}.heights.liftOff.heights`,
      undefined,
      0,
      255
    ),
    opening: {
      carried: list(carried['items'], `${kind}.openingState.carried.items`).map(
        (item, index) =>
          hexByte(
            record(item, `${kind}.openingState.carried.items[${index}]`)[
              'object'
            ],
            `${kind}.openingState.carried.items[${index}].object`
          )
      ),
      cash,
      elapsedSeconds: int(
        record(
          opening['elapsedSeconds'],
          `${kind}.openingState.elapsedSeconds`
        )['value'],
        `${kind}.openingState.elapsedSeconds.value`,
        0
      ),
      taxiProgress: int(
        record(opening['taxi'], `${kind}.openingState.taxi`)['progress'],
        `${kind}.openingState.taxi.progress`,
        0,
        65_535
      ),
      taxiRouteIndex: int(
        record(opening['taxi'], `${kind}.openingState.taxi`)['routeIndex'],
        `${kind}.openingState.taxi.routeIndex`,
        0,
        25
      )
    },
    route,
    taxiRate: int(taxi['rate'], `${kind}.taxi.rate`, -0x80_00, 0x7f_ff)
  };
};
