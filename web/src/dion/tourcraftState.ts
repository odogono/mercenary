import type { HeadCommandState } from '../interaction/headCommands.ts';
import { carriedLabel, type CarryWorld, type DionCarry } from './carry.ts';
import { int, ints, list, record, text } from './read.ts';
import type { TourcraftContent } from './tourcraftContent.ts';
import type { TourcraftEncounter } from './tourcraftEncounter.ts';
import type { TourcraftEvents } from './tourcraftEvents.ts';
import type { TourcraftFlightState } from './tourcraftFlight.ts';
import { tourcraftFrameWorld } from './tourcraftFrame.ts';
import type { DionResident } from './world.ts';

export interface TourcraftState {
  readonly armed: boolean;
  readonly carry: DionCarry;
  readonly collision: {
    readonly nextPeriod: number | null;
    readonly routine: 'idle' | 'start' | 'running';
  };
  readonly encounter: TourcraftEncounter;
  readonly events: TourcraftEvents;
  readonly faceInvocations: number;
  readonly faces: Readonly<
    Record<'$A1' | '$A5', { readonly alternate: number; readonly base: number }>
  >;
  readonly faceSelection: 'initial' | 'base' | 'alternate';
  readonly flight: TourcraftFlightState | null;
  /// The open panel and the centre box (`$6F0E`, `$6F04`, `$53950`), shared with Damocles.
  readonly head: HeadCommandState;
  readonly liveIntent: import('../gameCore/index.ts').Intent;
  readonly owners: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly phases: readonly number[];
  readonly playerZone: number;
  /// A Read still presenting its rows (`$722C`, `$7230`): the next row to show.
  readonly reading: {
    readonly item: number;
    readonly row: number;
    readonly slot: number;
  } | null;
  readonly residents: readonly (DionResident & {
    readonly bodyOffset: number;
  })[];
  /// `$6F22`: the switches' bits, by row index halved.
  readonly switches: number;
}

// Keep independently sampled owners. All other captured fields have a sole
// semantic owner or a closed-reader omission (see the I4 implementation ledger).
const NUMERIC_CARRIES: Readonly<Record<string, readonly string[]>> = {
  animation: ['tickAngle', 'sampledAngle'],
  candidate: ['regionFlags'],
  craft: [
    'altitudeMultiplier',
    'contact',
    'cosPitch',
    'cosRoll',
    'cosYaw',
    'eyeHeight',
    'landBits',
    'landingLatch',
    'occupancyWord',
    'panelSpeed',
    'parameterSlot',
    'pitch',
    'pitchRate',
    'priorX',
    'priorY',
    'priorZ',
    'roll',
    'selector',
    'sinPitch',
    'sinRoll',
    'sinYaw',
    'speed',
    'support',
    'swing',
    'throttle',
    'turnRate',
    'x',
    'y',
    'yaw',
    'z'
  ],
  location: [
    'bodyOffset',
    'cell',
    'floor',
    'group',
    'latitudeSample',
    'longitudeSample',
    'region',
    'regionIndex',
    'surfaceBody'
  ],
  message: ['mode', 'selectedGlyph'],
  sky: [
    'atmosphereDay',
    'bodyAtmosphere',
    'clipRows',
    'dayBits',
    'landColour',
    'skyColour',
    'skyDayColour',
    'skyHeight',
    'skyNightColour',
    'substellarLongitude'
  ],
  view: [
    'cabinOffset',
    'drawingHeight',
    'eyeX',
    'eyeY',
    'eyeZ',
    'latitude',
    'longitude',
    'packedHeight',
    'pitch',
    'pitchTangent',
    'relativeX',
    'relativeY',
    'relativeZ',
    'roll',
    'rollCotangent',
    'rollTangent',
    'yaw'
  ]
};
export const numericCarries = (
  owners: TourcraftState['owners']
): TourcraftState['owners'] =>
  Object.fromEntries(
    Object.entries(NUMERIC_CARRIES).map(([group, names]) => [
      group,
      Object.fromEntries(names.map(name => [name, owners[group]![name]!]))
    ])
  );

/// Executable pointers and aliased words are represented by admitted semantic
/// VM/playback/programme cursors. No original RAM addresses enter a Save.
export const initialTourcraftOwners = (
  content: TourcraftContent
): TourcraftState['owners'] => {
  const raw = record(content.gameplay.initial['owners'], 'initial.owners');
  return numericCarries(
    Object.fromEntries(
      Object.entries(raw)
        .filter(
          ([, v]) => v !== null && typeof v === 'object' && !Array.isArray(v)
        )
        .map(([group, v]) => [
          group,
          Object.fromEntries(
            Object.entries(record(v, group))
              .filter(
                ([key, v]) =>
                  typeof v === 'number' &&
                  !/Pointer|Vector|^pc$|timedTargetOffset/.test(key)
              )
              .map(([key, v]) => [key, v as number])
          )
        ])
    )
  );
};

export const initialTourcraftPhases = (
  content: TourcraftContent
): readonly number[] =>
  ints(
    content.gameplay.initial['bodyPhases'],
    'initial.bodyPhases',
    32,
    0,
    0xff_ff_ff_ff
  );

export const faceOutputs = (
  content: TourcraftContent,
  state: TourcraftState
): ReadonlyMap<number, readonly number[]> => {
  const sequences = record(
    content.programmes['faceSequences'],
    'faceSequences'
  );
  return new Map(
    (['$A1', '$A5'] as const).map(token => [
      Number.parseInt(token.slice(1), 16),
      state.faceSelection === 'initial'
        ? [32]
        : [
            Number(
              (
                record(sequences[token], token)[state.faceSelection] as number[]
              )[state.faces[token][state.faceSelection]]
            )
          ]
    ])
  );
};
export const advanceFaces = (
  content: TourcraftContent,
  state: TourcraftState,
  alternate: boolean
): TourcraftState => {
  const selected = alternate ? 'alternate' : 'base';
  const sequences = record(
    content.programmes['faceSequences'],
    'faceSequences'
  );
  const next = (token: '$A1' | '$A5') => ({
    ...state.faces[token],
    [selected]:
      (state.faces[token][selected] + 1) %
      ((record(sequences[token], token)[selected] as number[]).length - 1)
  });
  return {
    ...state,
    faceInvocations: state.faceInvocations + 1,
    faces: { $A1: next('$A1'), $A5: next('$A5') },
    faceSelection: selected
  };
};

export const initialTourcraftResidents = (
  content: TourcraftContent
): TourcraftState['residents'] =>
  tourcraftFrameWorld(content, 3)
    .residents.filter(r => r.slot < 50 || r.slot > 63)
    .map(r => ({
      ...r,
      bodyOffset: Number(
        record(
          list(content.gameplay.initial['residents'], 'residents').find(
            v => record(v, 'resident')['slot'] === r.slot
          ),
          'resident'
        )['bodyOffset']
      )
    }));

/// The labels, and the support heights `$55848` reads, of every object the payload binds.
export const tourcraftCarryWorld = (content: TourcraftContent): CarryWorld => {
  const labels = new Map(
    Object.entries(
      record(content.gameplay.initial['labels'], 'initial.labels')
    ).map(([k, v]) => [Number(k), text(v, `initial.labels.${k}`)] as const)
  );
  const tops = new Map<number, number | undefined>();
  for (const [slot, id] of content.gameplay.modelBindings) {
    const g = content.geometry.get(id)!;
    const op = (g as unknown as { header?: { op?: number } | null }).header?.op;
    // A plain model, or headers `$8006`, `$8009` and `$800A`; any other header refuses.
    if (op !== undefined && ![6, 9, 10].includes(op)) {
      tops.set(slot, undefined);
      continue;
    }
    const form = Object.keys(g.variants).find(
      key => key === 'base' || key.endsWith('form=default')
    );
    const vertices =
      form === undefined
        ? []
        : list(g.variants[form]!['vertices'], `${id}.vertices`);
    tops.set(
      slot,
      vertices.length === 0
        ? undefined
        : Math.max(...vertices.map(v => ints(v, `${id}.vertex`, 3)[1]!))
    );
  }
  return { labels, supportTop: slot => tops.get(slot) };
};

export const initialTourcraftCarry = (
  content: TourcraftContent,
  world: CarryWorld
): DionCarry => {
  const carry = record(content.gameplay.initial['carry'], 'initial.carry');
  const stack = ints(content.gameplay.initial['carriedStack'], 'carriedStack');
  const label =
    stack[0] === undefined ? ' '.repeat(16) : carriedLabel(world, stack[0]);
  return {
    capacity: int(carry['capacity'], 'carry.capacity', 10, 20),
    incoming: label,
    label,
    scroll: 0,
    stack,
    stored: []
  };
};
