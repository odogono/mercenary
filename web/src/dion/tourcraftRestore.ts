import { bool, int, list, record } from './read.ts';
import { readDionResume } from './restore.ts';
import { createTaxi } from './service.ts';
import type { DionResumeRecord, DionSnapshot } from './session.ts';
import type { TourcraftContent } from './tourcraftContent.ts';
import {
  TourcraftFlight,
  type TourcraftFlightState
} from './tourcraftFlight.ts';
import { tourcraftFrameWorld } from './tourcraftFrame.ts';
import {
  tourcraftNarrativeContent,
  type TourcraftScriptState
} from './tourcraftNarrative.ts';
import { updateTourcraftOwners } from './tourcraftOwners.ts';
import {
  initialTourcraftOwners,
  initialTourcraftPhases,
  initialTourcraftResidents
} from './tourcraftState.ts';
import { tourcraftView } from './tourcraftView.ts';
import { readDionOpening } from './world.ts';

// The admitted playback exclusively owns physical flight. Live cabin yaw and
// campaign waiting cannot change its numeric path, including zero-rotation
// placement. Cache the finite path per admitted content for safe Save binding.
const flightPaths = new WeakMap<
  TourcraftContent,
  ReadonlyMap<number, TourcraftFlightState>
>();
const flightPath = (content: TourcraftContent) => {
  let path = flightPaths.get(content);
  if (!path) {
    const flight = new TourcraftFlight(content),
      states = new Map<number, TourcraftFlightState>();
    for (let pass = 0; pass < 927; pass++) {
      flight.frame(0);
      states.set(flight.state.frameWord, flight.state);
    }
    path = states;
    flightPaths.set(content, path);
  }
  return path;
};

const keys = (value: unknown, expected: readonly string[], path: string) => {
  const r = record(value, path);
  if (
    Object.keys(r).length !== expected.length ||
    Object.keys(r).some(k => !expected.includes(k))
  ) {
    throw new Error(`${path}: missing or unknown field`);
  }
  return r;
};
const unsigned = (value: unknown, path: string, max = 0xff_ff_ff_ff) => {
  if (Object.is(value, -0)) {
    throw new Error(`${path}: negative zero`);
  }
  return int(value, path, 0, max);
};
const psg = (value: unknown, register: number) =>
  unsigned(
    value,
    `PSG R${register}`,
    [255, 15, 255, 15, 255, 15, 31, 255, 31, 31, 31, 255, 255, 15][register]!
  );
const shape = (value: unknown, template: unknown, path: string): void => {
  if (Array.isArray(template)) {
    const values = list(value, path);
    if (values.length !== template.length) {
      throw new Error(`${path}: wrong length`);
    }
    values.forEach((v, i) => shape(v, template[i], `${path}[${i}]`));
  } else if (template !== null && typeof template === 'object') {
    const r = keys(value, Object.keys(template), path);
    Object.entries(template).forEach(([k, v]) =>
      shape(r[k], v, `${path}.${k}`)
    );
  } else if (template === null) {
    if (value !== null) {
      throw new Error(`${path}: expected null`);
    }
  } else if (typeof template === 'number') {
    unsigned(value, path);
  } else if (typeof template === 'boolean') {
    bool(value, path);
  } else if (typeof template === 'string' && typeof value !== 'string') {
    throw new Error(`${path}: expected text`);
  }
};
const instructions = (content: TourcraftContent) =>
  [
    ...new Set(
      tourcraftNarrativeContent(content).scripts.routines.flatMap(r =>
        r.instructions.map(i => i.address)
      )
    )
  ].sort((a, b) => a - b);
export const scriptReference = (
  content: TourcraftContent,
  address: number | null
): unknown => {
  if (address === null) {
    return null;
  }
  const next = instructions(content).indexOf(address);
  if (next < 0) {
    throw new Error('Excluded script continuation');
  }
  return { content: 'dion-scripts', next };
};
export const scriptAddress = (
  content: TourcraftContent,
  value: unknown
): number | null => {
  if (value === null) {
    return null;
  }
  const ref = keys(value, ['content', 'next'], 'script ref');
  if (ref['content'] !== 'dion-scripts') {
    throw new Error('Wrong script reference kind');
  }
  const boundary =
    instructions(content)[unsigned(ref['next'], 'script ref.next')];
  if (boundary === undefined) {
    throw new Error('Unknown script boundary');
  }
  return boundary;
};

/// No scan, VM launch, tick or presentation work is performed during admission.
export const readTourcraftResume = (
  value: unknown,
  content: TourcraftContent
): DionResumeRecord => {
  const envelope = keys(value, ['remainder', 'snapshot'], 'snapshot');
  const raw = record(envelope['snapshot'], 'state');
  const n = keys(
    raw['narrative'],
    [
      'available',
      'cabin',
      'flags',
      'hold',
      'keyA',
      'message',
      'pc',
      'queued',
      'stack',
      'timed',
      'wait',
      'availabilityBytes',
      'timerBits',
      'timedTarget'
    ],
    'narrative'
  );
  const sound = keys(
    raw['sound'],
    [
      'c',
      'clickAge',
      'elapsed',
      'keyClick',
      'mixer',
      'registers',
      'slew',
      'cLevelLatch',
      'streams'
    ],
    'sound'
  );
  const base = readDionResume(value, undefined, 5);
  // The inherited decoder supplies exact base shapes/ranges. Reject fields it
  // would otherwise ignore, before assigning the expanded owners.
  keys(raw, [...Object.keys(base.snapshot), 'tourcraft'], 'state');
  for (const name of ['clock', 'driver', 'gauges', 'sign', 'taxi'] as const) {
    keys(raw[name], Object.keys(base.snapshot[name]), name);
  }
  keys(n['message'], Object.keys(base.snapshot.narrative.message), 'message');
  if (base.remainder >= 0.02 || Object.is(base.remainder, -0)) {
    throw new Error('remainder must be below one tick');
  }
  for (const [i, v] of base.snapshot.eye.entries()) {
    unsigned(v, `eye[${i}]`);
  }
  for (const [i, v] of base.snapshot.taxi.position.entries()) {
    unsigned(v, `taxi.position[${i}]`);
  }
  if (base.snapshot.narrative.stack.length > 8) {
    throw new Error('Return stack exceeds eight');
  }
  const admitted = tourcraftNarrativeContent(content);
  const boundaries = new Set(instructions(content));
  for (const pc of [
    base.snapshot.narrative.pc,
    ...base.snapshot.narrative.stack
  ]) {
    if (pc !== null && !boundaries.has(pc)) {
      throw new Error('Unknown script boundary');
    }
  }
  const availability = list(n['availabilityBytes'], 'availability');
  const ids = [5, 6, 19, 25, 41, 51, 52, 119];
  if (availability.length !== ids.length) {
    throw new Error('Incomplete availability table');
  }
  const seen = new Set<number>();
  const bytes = availability.map((v, i) => {
    const pair = list(v, `availability[${i}]`);
    if (pair.length !== 2) {
      throw new Error('Invalid availability pair');
    }
    const id = unsigned(pair[0], 'availability.id', 255);
    const bits = unsigned(pair[1], 'availability.bits', 255);
    if (!ids.includes(id) || seen.has(id)) {
      throw new Error('Unknown/duplicate availability owner');
    }
    seen.add(id);
    return [id, bits] as const;
  });
  if (
    JSON.stringify(
      [...base.snapshot.narrative.available].sort((a, b) => a - b)
    ) !==
    JSON.stringify(
      bytes
        .filter(([, v]) => v & 128)
        .map(([id]) => id)
        .sort((a, b) => a - b)
    )
  ) {
    throw new Error('Availability views disagree');
  }
  if (base.snapshot.narrative.flags[10] || base.snapshot.narrative.flags[22]) {
    throw new Error('Excluded campaign flags');
  }
  for (const id of [base.snapshot.narrative.queued]) {
    if (id !== null && !admitted.scripts.entries.has(id)) {
      throw new Error('Unknown queued script');
    }
  }
  for (const selector of [
    base.snapshot.narrative.cabin,
    base.snapshot.driver.selector
  ]) {
    if (selector !== 0 && !admitted.service.headTurns.has(selector)) {
      throw new Error('Unknown pilot sequence');
    }
  }
  const driver = base.snapshot.driver;
  const durations = admitted.service.headTurns.get(driver.selector);
  if (
    driver.selector === 0
      ? driver.index !== 0 || driver.remaining !== 0 || driver.profile
      : !durations ||
        driver.index < 1 ||
        driver.index > durations.length ||
        driver.remaining > durations[driver.index - 1]!
  ) {
    throw new Error('Invalid installed pilot duration');
  }
  const timedTarget =
    n['timedTarget'] === null
      ? null
      : unsigned(n['timedTarget'], 'timedTarget');
  if (
    timedTarget !== null &&
    ![0x7_5a_16, 0x7_5b_24, 0x7_5b_5c].includes(timedTarget)
  ) {
    throw new Error('Unknown timed continuation');
  }
  if (n['timed'] !== null) {
    throw new Error('Prototype timer is excluded');
  }
  const narrative: TourcraftScriptState = {
    ...base.snapshot.narrative,
    availabilityBytes: bytes,
    timedTarget,
    timerBits: unsigned(n['timerBits'], 'timerBits', 65_535)
  };
  const e = keys(
    raw['tourcraft'],
    [
      'armed',
      'carry',
      'collision',
      'encounter',
      'events',
      'faceInvocations',
      'faceSelection',
      'faces',
      'flight',
      'liveIntent',
      'owners',
      'phases',
      'playerZone',
      'residents'
    ],
    'tourcraft'
  );
  bool(e['armed'], 'armed');
  unsigned(e['playerZone'], 'playerZone', 8);
  const collision = keys(
    e['collision'],
    ['routine', 'nextPeriod'],
    'collision'
  );
  if (
    typeof collision['routine'] !== 'string' ||
    !['idle', 'start', 'running'].includes(collision['routine'])
  ) {
    throw new Error('Unknown B routine');
  }
  if (collision['nextPeriod'] !== null) {
    unsigned(collision['nextPeriod'], 'collision.nextPeriod', 8);
  }
  if (collision['routine'] === 'running' && collision['nextPeriod'] === null) {
    throw new Error('Missing collision cursor');
  }

  const owners = initialTourcraftOwners(content);
  shape(e['owners'], owners, 'owners');
  const widths = record(content.gameplay.initial['ownerWidths'], 'ownerWidths');
  for (const [group, values] of Object.entries(record(e['owners'], 'owners'))) {
    for (const [name, v] of Object.entries(record(values, group))) {
      const width = Number(record(widths[group], 'widths')[name]);
      unsigned(
        v,
        `${group}.${name}`,
        width === 1 ? 255 : width === 2 ? 65_535 : 0xff_ff_ff_ff
      );
    }
  }
  const phases = list(e['phases'], 'phases');
  if (phases.length !== 32) {
    throw new Error('Need all 32 phases');
  }
  phases.forEach((v, i) => unsigned(v, `phases[${i}]`));
  const faces = keys(e['faces'], ['$A1', '$A5'], 'faces');
  const sequences = record(content.programmes['faceSequences'], 'sequences');
  for (const token of ['$A1', '$A5']) {
    const pair = keys(faces[token], ['base', 'alternate'], token);
    for (const kind of ['base', 'alternate']) {
      unsigned(
        pair[kind],
        `${token}.${kind}`,
        list(record(sequences[token], token)[kind], kind).length - 2
      );
    }
  }
  const invocations = unsigned(
    e['faceInvocations'],
    'faceInvocations',
    Number.MAX_SAFE_INTEGER
  );
  if (
    typeof e['faceSelection'] !== 'string' ||
    !['initial', 'base', 'alternate'].includes(e['faceSelection'])
  ) {
    throw new Error('Unknown face selection');
  }
  if (
    invocations < base.snapshot.frame ||
    invocations > base.snapshot.frame + 1
  ) {
    throw new Error('Face writer phase disagrees');
  }
  if (e['faceSelection'] === 'initial') {
    if (
      invocations !== 0 ||
      base.snapshot.frame !== 0 ||
      base.snapshot.tick > 10 ||
      e['armed'] ||
      e['flight'] !== null
    ) {
      throw new Error('Invalid opening face phase');
    }
    for (const pair of Object.values(faces)) {
      if (Object.values(record(pair, 'face')).some(v => v !== 0)) {
        throw new Error('Invalid opening cursors');
      }
    }
    if (
      narrative.pc !== 0x6_ff_57 ||
      JSON.stringify(narrative.stack) !== '[485077]' ||
      narrative.wait !== 29 + base.snapshot.tick ||
      narrative.timerBits !== ((65_507 - base.snapshot.tick) & 65_535)
    ) {
      throw new Error('Invalid opening VM');
    }
    const opening = readDionOpening(content.gameplay.initial['opening']);
    const state = base.snapshot;
    const initialFlags = list(
      content.gameplay.initial['flags'],
      'initial.flags'
    ) as number[];
    if (
      state.location !== opening.location ||
      e['playerZone'] !== content.gameplay.initial['playerZone'] ||
      state.cell !== opening.cell ||
      state.region !== opening.region ||
      state.heading !== opening.heading ||
      state.pitch !== opening.pitch ||
      JSON.stringify(state.eye) !== JSON.stringify(opening.eye) ||
      state.cash !== opening.cash ||
      state.card ||
      state.cardDestination !== 0 ||
      state.admission !== 0 ||
      state.doors.length !== 0 ||
      JSON.stringify(state.driver) !==
        JSON.stringify({
          index: 0,
          profile: false,
          remaining: 0,
          selector: 0
        }) ||
      JSON.stringify(state.taxi) !== JSON.stringify(createTaxi(admitted)) ||
      state.sign.code !== 32 ||
      state.sign.index !== 0 ||
      state.reveal !== 49 - state.tick ||
      state.frameCounter !== opening.frameCounter ||
      state.clock.day !== opening.clock.day ||
      state.clock.seconds !== 0 ||
      state.clock.accumulator !== opening.clock.accumulator - 32 * state.tick ||
      narrative.timedTarget !== null ||
      narrative.queued !== null ||
      narrative.cabin !== 0 ||
      narrative.message.busy ||
      narrative.message.serial !== 0 ||
      narrative.flags.some(
        (v, i) => v !== Boolean(initialFlags[i >>> 5]! & (1 << (i & 31)))
      )
    ) {
      throw new Error('Initial face phase requires coherent opening owners');
    }
    const o = record(e['owners'], 'owners');
    for (const name of [
      'eyeX',
      'eyeY',
      'eyeZ',
      'pitch',
      'roll',
      'yaw',
      'longitude',
      'latitude',
      'cabinOffset'
    ]) {
      if (record(o['view'], 'view')[name] !== owners['view']![name]) {
        throw new Error('Invalid initial copied view');
      }
    }
    const seeds = initialTourcraftPhases(content);
    phases.forEach((v, i) => {
      if (
        v !==
        (seeds[i]! +
          base.snapshot.tick * (content.system.bodies[i]?.rate ?? 0)) >>>
          0
      ) {
        throw new Error('Invalid opening Body phase');
      }
    });
  } else if (invocations === 0) {
    throw new Error('Unwritten face selection');
  }
  const intent = keys(
    e['liveIntent'],
    ['walk', 'strafe', 'turn', 'pitch', 'running', 'look'],
    'intent'
  );
  for (const name of ['walk', 'strafe', 'turn', 'pitch', 'look']) {
    int(intent[name], name, -1, 1);
  }
  for (const name of ['running']) {
    bool(intent[name], name);
  }
  const encounter = keys(
    e['encounter'],
    [
      'request',
      'programme',
      'pairBytes',
      'spawnBudget',
      'timer',
      'actors',
      'trajectories',
      'priorEye'
    ],
    'encounter'
  );
  if (
    ![0, 1, 65_535, 65_499].includes(
      unsigned(encounter['request'], 'encounter.request', 65_535)
    )
  ) {
    throw new Error('Excluded encounter request');
  }
  if (
    ![0, 36].includes(
      unsigned(encounter['programme'], 'encounter.programme', 36)
    )
  ) {
    throw new Error('Unknown encounter pair');
  }
  unsigned(encounter['spawnBudget'], 'spawnBudget', 65_535);
  unsigned(encounter['timer'], 'timer', 1000);
  const initial = record(content.gameplay.initial['owners'], 'initial');
  shape(encounter['actors'], initial['actors'], 'actors');
  shape(
    encounter['pairBytes'],
    record(initial['encounter'], 'initial encounter')['pairBytes'],
    'pairs'
  );
  const actors = list(encounter['actors'], 'actors');
  list(encounter['pairBytes'], 'pairBytes').forEach(v =>
    unsigned(v, 'pair byte', 255)
  );
  actors.forEach((value, i) => {
    const a = record(value, 'actor');
    if (a['slot'] !== 50 + i) {
      throw new Error('Wrong actor slot');
    }
    const state = unsigned(a['state'], 'actor.state', 65_535);
    for (const [name, v] of Object.entries(a)) {
      unsigned(
        v,
        `actor.${name}`,
        [
          'flags',
          'floor',
          'group',
          'cell',
          'zone',
          'association',
          'objectState',
          'slot'
        ].includes(name)
          ? 255
          : ['state', 'yaw', 'bodyOffset'].includes(name)
            ? 65_535
            : 0xff_ff_ff_ff
      );
    }
    if ((i < 6 || i > 8) && state !== 0) {
      throw new Error('Excluded active actor');
    }
    if (state > 200 && state !== 32_767 && (state < 32_768 || state > 33_023)) {
      throw new Error('Invalid actor state');
    }
  });
  const trajectories = list(encounter['trajectories'], 'trajectories');
  if (trajectories.length !== 3) {
    throw new Error('Incomplete trajectories');
  }
  trajectories.forEach(v => unsigned(v, 'nextRecord', 4));
  const prior = list(encounter['priorEye'], 'priorEye');
  if (prior.length !== 3) {
    throw new Error('Wrong priorEye');
  }
  prior.forEach(v => unsigned(v, 'priorEye'));
  const residents = list(e['residents'], 'residents');
  const seedResidents = initialTourcraftResidents(content);
  if (base.snapshot.location === 100) {
    const taxi = base.snapshot.taxi;
    const route = list(
      record(content.programmes['ambientTaxi'], 'ambientTaxi')['route'],
      'route'
    );
    if (
      taxi.routeIndex >= route.length ||
      taxi.passenger ||
      taxi.call ||
      taxi.start ||
      taxi.destination !== 0
    ) {
      throw new Error('Excluded TOLOSA passenger service');
    }
  }
  if (residents.length !== seedResidents.length) {
    throw new Error('Incomplete residents');
  }
  const carry = keys(
    e['carry'],
    ['capacity', 'incoming', 'label', 'scroll', 'stack', 'stored'],
    'carry'
  );
  for (const name of ['incoming', 'label']) {
    if (typeof carry[name] !== 'string' || !/^[ -~]{16}$/.test(carry[name])) {
      throw new Error(`carry.${name}: not sixteen characters`);
    }
  }
  int(carry['scroll'], 'carry.scroll', -16, 16);
  const stack = list(carry['stack'], 'carry.stack').map(v =>
    int(v, 'carry.stack', 1, 246)
  );
  const stored = list(carry['stored'], 'carry.stored').map(v =>
    int(v, 'carry.stored', 1, 246)
  );
  const carried = new Set([...stack, ...stored]);
  if (carried.size !== stack.length + stored.length) {
    throw new Error('An object carried twice');
  }
  // `$7098` is 20 exactly while the BRIEFCASE is carried, and its store is empty then.
  if (
    carry['capacity'] !== (stack.includes(108) ? 20 : 10) ||
    (stack.includes(108) && stored.length > 0)
  ) {
    throw new Error('Wrong Carried Stack capacity');
  }
  if (
    base.snapshot.gauges.inventory !==
    (stack.includes(108) ? stack.length : stack.length * 2)
  ) {
    throw new Error('Wrong inventory gauge');
  }
  residents.forEach((r, i) => {
    shape(r, seedResidents[i], 'resident');
    const a = record(r, 'resident');
    for (const name of [
      'association',
      'body',
      'bodyOffset',
      'cell',
      'group',
      'slot',
      'state',
      'yaw',
      'zone'
    ]) {
      unsigned(a[name], `resident.${name}`, 255);
    }
    if (
      a['slot'] !== seedResidents[i]!.slot ||
      a['model'] !== seedResidents[i]!.model
    ) {
      throw new Error('Wrong resident binding');
    }
    const seedResident = seedResidents[i]!;
    // Take and Drop move any other object (#756). Only its held bit changes its state, and
    // an object is held exactly while it is carried or in the BRIEFCASE.
    const state = Number(a['state']);
    if ((state & 0x7f) !== (seedResident.state & 0x7f)) {
      throw new Error('Wrong resident.state binding');
    }
    if (state >= 0x80 !== carried.has(seedResident.slot)) {
      throw new Error('Held bit disagrees with the Carried Stack');
    }
    if (stack.includes(seedResident.slot) && a['bodyOffset'] !== 0x78) {
      throw new Error('Carried object outside VOID');
    }
    list(a['position'], 'resident.position').forEach(v =>
      unsigned(v, 'resident.position')
    );
    if (a['slot'] === 13 || a['slot'] === 16) {
      for (const name of ['association', 'body', 'group'] as const) {
        if (a[name] !== seedResident[name]) {
          throw new Error(`Wrong resident.${name} binding`);
        }
      }
    }
    if (a['slot'] === 13) {
      if (a['bodyOffset'] !== (base.snapshot.location & 255)) {
        throw new Error('Wrong TOURCRAFT Body');
      }
    } else if (a['slot'] === 16) {
      const taxi = base.snapshot.taxi;
      if (
        a['bodyOffset'] !== (base.snapshot.location === 100 ? 100 : 60) ||
        a['cell'] !== taxi.cell ||
        a['yaw'] !== ((taxi.heading >>> 2) & 255) ||
        JSON.stringify(a['position']) !== JSON.stringify(taxi.position)
      ) {
        throw new Error('Wrong ambient taxi residence');
      }
    }
  });
  if (e['flight'] !== null) {
    const f = record(e['flight'], 'flight');
    const seed = new TourcraftFlight(content).state;
    keys(f, Object.keys(seed), 'flight');
    shape(f['priorPose'], seed.priorPose, 'flight.priorPose');
    keys(f['craft'], Object.keys(seed.craft), 'craft');
    keys(f['space'], Object.keys(seed.space), 'space');
    list(f['priorPose'], 'priorPose').forEach(v => unsigned(v, 'priorPose'));
    for (const name of [
      'frameWord',
      'cabinOffset',
      'heldControl',
      'nextAction',
      'rate'
    ]) {
      unsigned(
        f[name],
        `flight.${name}`,
        name === 'nextAction' ? 134 : name === 'heldControl' ? 127 : 65_535
      );
    }
    if (f['arrival'] !== null && f['arrival'] !== 100) {
      throw new Error('Unknown Body arrival');
    }
    const craft = record(f['craft'], 'craft');
    for (const [name, v] of Object.entries(seed.craft)) {
      if (typeof v === 'number') {
        unsigned(
          craft[name],
          `craft.${name}`,
          ['pitch', 'yaw', 'roll'].includes(name) ? 65_535 : 0xff_ff_ff_ff
        );
      }
    }
    bool(craft['swing'], 'craft.swing');
    shape(craft['trig'], seed.craft.trig, 'trig');
    for (const v of Object.values(record(craft['trig'], 'trig'))) {
      unsigned(v, 'trig angle', 65_535);
    }
    for (const name of Object.keys(seed.space)) {
      unsigned(record(f['space'], 'space')[name], `space.${name}`);
    }
    if (
      typeof f['mode'] !== 'string' ||
      !['surface', 'space', 'foot'].includes(f['mode']) ||
      ![60, 100, -1].includes(int(f['body'], 'flight.body', -1, 100))
    ) {
      throw new Error('Unknown flight Location');
    }
    if (
      (f['mode'] === 'space') !== (base.snapshot.location === 65_535) ||
      (f['mode'] !== 'space' && f['body'] !== base.snapshot.location)
    ) {
      throw new Error('Flight Location disagrees');
    }
    if (f['mode'] === 'foot' && f['nextAction'] !== 134) {
      throw new Error('Premature playback exit');
    }
    if (base.snapshot.taxi.passenger) {
      throw new Error('Conflicting passenger custody');
    }
    if (f['mode'] !== 'foot') {
      const expected = flightPath(content).get(Number(f['frameWord']));
      if (!expected || base.snapshot.frameCounter !== f['frameWord']) {
        throw new Error('Flight counter disagrees');
      }
      for (const name of Object.keys(expected).filter(
        k => k !== 'cabinOffset'
      )) {
        if (
          JSON.stringify(f[name]) !==
          JSON.stringify(expected[name as keyof TourcraftFlightState])
        ) {
          throw new Error(`Unsupported physical playback ${name}`);
        }
      }
    } else if (
      f['frameWord'] !== 927 ||
      f['body'] !== 100 ||
      f['arrival'] !== null
    ) {
      throw new Error('Invalid completed playback counter');
    }
    if (Number(f['cabinOffset']) % 16 !== 0) {
      throw new Error('Invalid cabin step');
    }
  } else if (base.snapshot.location !== 60) {
    throw new Error('Missing flight for Location');
  }
  if (e['armed'] && (e['flight'] !== null || base.snapshot.taxi.passenger)) {
    throw new Error('Invalid armed playback');
  }
  const world = tourcraftFrameWorld(
    content,
    base.snapshot.location === 100 ? 23 : 3
  );
  const cell = world.cells.find(c => c.cell === base.snapshot.cell);
  const structure =
    cell && world.structures.get(cell.structure)?.get(cell.scale.join(','));
  if (
    base.snapshot.region > 0 &&
    (!structure || base.snapshot.region > structure.regions.length)
  ) {
    throw new Error('Unknown region');
  }
  for (const [slot, door] of base.snapshot.doors) {
    keys(
      list(
        list(raw['doors'], 'doors').find(v => list(v, 'door')[0] === slot),
        'door'
      )[1],
      ['latch', 'openUnits'],
      'door'
    );
    if (
      !structure?.attachments.some(d => d.slot === slot) ||
      (door.latch === 'shut' && door.openUnits !== 0) ||
      (door.latch === 'open' && door.openUnits !== 142)
    ) {
      throw new Error('Invalid bound door');
    }
  }
  if (base.snapshot.candidate) {
    keys(raw['candidate'], ['distance', 'exponent', 'slot'], 'candidate');
  }
  if (
    base.snapshot.sign.index >= content.legacy.world.lettering.signScript.length
  ) {
    throw new Error('Unknown sign cursor');
  }
  const events = keys(
    e['events'],
    [
      'nextOrdinal',
      'consumedThrough',
      'deliveredRegisters',
      'deliveredEnvelope',
      'pending'
    ],
    'events'
  );
  const nextOrdinal = unsigned(
    events['nextOrdinal'],
    'nextOrdinal',
    Number.MAX_SAFE_INTEGER
  );
  const consumed =
    events['consumedThrough'] === null
      ? null
      : unsigned(
          events['consumedThrough'],
          'consumedThrough',
          Number.MAX_SAFE_INTEGER
        );
  const registers = list(events['deliveredRegisters'], 'deliveredRegisters');
  if (registers.length !== 14) {
    throw new Error('Wrong delivered register image');
  }
  registers.forEach((v, r) => psg(v, r));
  base.snapshot.sound.registers.forEach((v, r) => psg(v, r));
  const pending = list(events['pending'], 'pending');
  if (pending.length > 512) {
    throw new Error('Too many pending event batches');
  }
  let ordinal = consumed === null ? 0 : consumed + 1;
  let tick = 0;
  const replay = [...registers];
  for (const value of pending) {
    const b = keys(
      value,
      ['ordinal', 'tick', 'writes', 'messageOccurrence'],
      'batch'
    );
    if (b['ordinal'] !== ordinal++) {
      throw new Error('Nonconsecutive sound suffix');
    }
    const at = unsigned(b['tick'], 'batch.tick', base.snapshot.tick);
    if (at < tick) {
      throw new Error('Unordered sound ticks');
    }
    tick = at;
    if (b['messageOccurrence'] !== null) {
      unsigned(
        b['messageOccurrence'],
        'messageOccurrence',
        narrative.message.serial
      );
    }
    const writes = list(b['writes'], 'writes');
    if (writes.length > 64) {
      throw new Error('Too many register writes');
    }
    for (const value of writes) {
      const w = keys(value, ['register', 'value'], 'write');
      const r = unsigned(w['register'], 'register', 13);
      replay[r] = psg(w['value'], r);
    }
  }
  if (
    ordinal !== nextOrdinal ||
    JSON.stringify(replay) !== JSON.stringify(base.snapshot.sound.registers)
  ) {
    throw new Error('Sound delivery image disagrees');
  }
  if (events['deliveredEnvelope'] !== null) {
    const d = keys(
      events['deliveredEnvelope'],
      ['ordinal', 'writeIndex'],
      'envelope'
    );
    unsigned(d['ordinal'], 'envelope.ordinal', consumed ?? -1);
    unsigned(d['writeIndex'], 'envelope.writeIndex', 63);
  }
  const streams = keys(
    sound['streams'],
    ['doorTone', 'doorLevel', 'cLevel'],
    'streams'
  );
  for (const [name, value] of Object.entries(streams)) {
    const stream = keys(value, ['count', 'cursor'], name);
    unsigned(
      stream['count'],
      `${name}.count`,
      name === 'doorTone' ? 65_535 : 255
    );
    if (stream['cursor'] !== null) {
      const ref = keys(
        stream['cursor'],
        ['programme', 'stream', 'nextPair'],
        'sound ref'
      );
      const programme = content.legacy.sound.find(
        p => p.name === ref['programme']
      );
      const index = unsigned(ref['stream'], 'stream', 1);
      const table = programme?.streams[index];
      if (
        !table ||
        (name === 'doorTone') !== (table.registers.length === 2) ||
        (name === 'doorLevel' && !programme!.name.startsWith('door')) ||
        (name === 'cLevel' && programme!.name.startsWith('door'))
      ) {
        throw new Error('Wrong sound stream kind');
      }
      unsigned(ref['nextPair'], 'nextPair', table.pairs.length);
    } else if (stream['count'] !== 0) {
      throw new Error('Unbound live sound stream');
    }
  }
  if (base.snapshot.sound.elapsed >= 0 && base.snapshot.sound.c !== null) {
    const active = content.legacy.sound.find(
      p => p.name === base.snapshot.sound.c
    )!;
    for (const [index] of active.streams.entries()) {
      const key = active.name.startsWith('door')
        ? index === 0
          ? 'doorTone'
          : 'doorLevel'
        : 'cLevel';
      const cursor = record(streams[key], key)['cursor'];
      if (cursor === null) {
        throw new Error('Missing active sound stream');
      }
      const ref = record(cursor, 'active sound ref');
      if (ref['programme'] !== active.name || ref['stream'] !== index) {
        throw new Error('Active sound stream disagrees');
      }
    }
  }
  const latch = unsigned(sound['cLevelLatch'], 'cLevelLatch', 65_535);
  if (latch !== 0 && latch !== 65_535) {
    throw new Error('Invalid ambient latch');
  }
  if (narrative.message.text.length > 48) {
    throw new Error('Message exceeds 48 cells');
  }
  const candidateState: DionSnapshot = {
    ...base.snapshot,
    doors: new Map(base.snapshot.doors),
    narrative,
    sound: {
      ...base.snapshot.sound,
      cLevelLatch: latch,
      streams: structuredClone(streams) as unknown as NonNullable<
        import('./sound.ts').DionSoundState['streams']
      >
    },
    tourcraft: structuredClone(e) as unknown as NonNullable<
      DionSnapshot['tourcraft']
    >
  };
  const carries = candidateState.tourcraft!.owners;
  const physical = candidateState.tourcraft!.flight?.craft;
  const matches = (group: string, name: string, expected: number) => {
    if (carries[group]![name] !== expected) {
      throw new Error(`Contradictory ${group}.${name}`);
    }
  };
  if (candidateState.frame > 0) {
    for (const [name, value] of Object.entries({
      pitch: physical?.pitch ?? candidateState.pitch,
      roll: physical?.roll ?? 0,
      x: physical?.x ?? candidateState.eye[0],
      y: physical?.y ?? candidateState.eye[1],
      yaw: physical?.yaw ?? candidateState.heading,
      z: physical?.z ?? candidateState.eye[2]
    })) {
      matches('craft', name, value);
    }
    for (const [name, value] of Object.entries({
      eyeX: candidateState.eye[0],
      eyeY: candidateState.eye[1],
      eyeZ: candidateState.eye[2],
      pitch: candidateState.pitch,
      yaw: candidateState.heading
    })) {
      matches('view', name, value);
    }
    const flight = candidateState.tourcraft!.flight;
    const resident = candidateState.tourcraft!.residents.find(
      r => r.slot === 13
    )!;
    if (flight) {
      const terminal = flightPath(content).get(927)!;
      const craft = flight.mode === 'foot' ? terminal.craft : flight.craft;
      const position = [
        craft.x,
        (craft.y + (flight.mode === 'foot' ? -63 : 56)) >>> 0,
        craft.z
      ];
      const yaw =
        flight.mode === 'foot'
          ? (terminal.craft.yaw >>> 2) & 255
          : flight.body === 100
            ? (Number(
                record(
                  content.programmes['arrivalResidence'],
                  'arrivalResidence'
                )['heading']
              ) >>>
                2) &
              255
            : seedResidents.find(r => r.slot === 13)!.yaw;
      if (
        resident.position.some((v, i) => v !== position[i]) ||
        resident.yaw !== yaw ||
        (flight.mode !== 'foot' &&
          (resident.cell !== candidateState.cell ||
            resident.zone !== candidateState.tourcraft!.playerZone))
      ) {
        throw new Error('Contradictory TOURCRAFT residence');
      }
    }
    const copied =
      flight && flight.mode !== 'foot'
        ? tourcraftView(
            tourcraftFrameWorld(
              content,
              candidateState.location === 100 ? 23 : 3
            ).rotationTable,
            flight.craft,
            flight.cabinOffset,
            flight.mode === 'space'
          )
        : { pitch: candidateState.pitch, roll: 0, yaw: candidateState.heading };
    matches('view', 'roll', copied.roll);
    if (flight && flight.mode !== 'foot') {
      const expectedEye = [
        flight.craft.x,
        (flight.craft.y + (flight.mode === 'surface' ? 64 : 0)) >>> 0,
        flight.craft.z
      ];
      if (
        candidateState.eye.some((v, i) => v !== expectedEye[i]) ||
        candidateState.pitch !== copied.pitch ||
        candidateState.heading !== copied.yaw
      ) {
        throw new Error('Copied flight pose disagrees with physical playback');
      }
      matches('view', 'cabinOffset', flight.cabinOffset);
    }
    if (physical) {
      for (const name of [
        'contact',
        'panelSpeed',
        'pitch',
        'roll',
        'speed',
        'supportLevel',
        'throttle',
        'turnRate',
        'x',
        'y',
        'yaw',
        'z'
      ] as const) {
        matches(
          'craft',
          name === 'supportLevel' ? 'support' : name,
          physical[name]
        );
      }
    }
    if (candidateState.day !== (carries['sky']!['dayBits'] !== 0)) {
      throw new Error('Contradictory sky day');
    }
    if (
      candidateState.location !== 65_535 &&
      candidateState.phase !==
        candidateState.tourcraft!.phases[candidateState.location / 4]
    ) {
      throw new Error('Contradictory Body phase');
    }
  }
  const aliases = updateTourcraftOwners(
    content,
    candidateState,
    candidateState
  ).owners;
  if (
    JSON.stringify(aliases) !== JSON.stringify(candidateState.tourcraft!.owners)
  ) {
    throw new Error(
      'Numeric owners disagree: ' +
        Object.entries(aliases)
          .flatMap(([g, fields]) =>
            Object.entries(fields)
              .filter(([k, v]) => v !== candidateState.tourcraft!.owners[g]![k])
              .map(
                ([k, v]) =>
                  `${g}.${k}:${candidateState.tourcraft!.owners[g]![k]}!=${v}`
              )
          )
          .join(', ')
    );
  }
  return {
    remainder: base.remainder,
    snapshot: {
      ...base.snapshot,
      narrative,
      sound: {
        ...base.snapshot.sound,
        cLevelLatch: latch,
        streams: structuredClone(streams) as unknown as NonNullable<
          import('./sound.ts').DionSoundState['streams']
        >
      },
      tourcraft: structuredClone(e) as unknown as NonNullable<
        DionResumeRecord['snapshot']['tourcraft']
      >
    }
  };
};
